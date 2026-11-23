import os
import re
import json
import uuid
import shutil
import asyncio
from datetime import datetime, timedelta
from contextlib import asynccontextmanager
from typing import List, Dict, Set, Optional as Opt

import uvicorn
import requests
import pandas as pd
from fastapi import FastAPI, HTTPException, Request, UploadFile, File, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, FileResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel
from passlib.context import CryptContext

from BACKEND.config import settings
from BACKEND.main import (
    get_quote, get_quotes_bulk, redis_client, get_market_status,
    get_company_profile, get_company_peers, get_stock_candles,
    get_us_financial_data, get_us_valuation_comparison,
    get_fmp_market_data, get_fmp_financial_statements, get_fmp_insider_trading,
    get_financial_health, get_market_indices,
    is_us_market_open, get_current_trading_day, should_use_cached_financial_data
)
from BACKEND.database import (
    FintechRSSDatabase, init_db, execute_sql_query, execute_sql_modification, execute_sql_query_scalar,
    save_financial_metrics_to_db,
    ensure_symbol_logos_table, get_symbol_logo, save_symbol_logo
)
from BACKEND.mag7_segments import run_mag7_fetch
from BACKEND.analytics import calculate_industry_averages
from BACKEND.alerts import (
    alert_service, AlertType, AlertPriority, AlertStatus,
    sync_redis_from_db, PRIORITY_COLORS
)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global REDIS_AVAILABLE
    print("Application is starting")

    if db.connect():
        print("Database connection successful.")
        init_db()
    else:
        print("Database connection failed!")

    try:
        redis_client.ping()
        REDIS_AVAILABLE = True
        print("Redis connection successful.")

        sync_redis_from_db()
        print("Alert system initialized.")
    except Exception as e:
        REDIS_AVAILABLE = False
        print(f"WARNING: Redis is down or unreachable! ({e})")

    yield

    print("Application is shutting down")


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(GZipMiddleware, minimum_size=1000)

os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
db = FintechRSSDatabase(database=settings.DB_NAME)
REDIS_AVAILABLE = False


class HoldingCreate(BaseModel):
    symbol: str
    quantity: float
    average_price: float


class HoldingUpdate(BaseModel):
    quantity: float
    average_price: float


class CashUpdate(BaseModel):
    amount: float


class UserProfileUpdate(BaseModel):
    username: str
    email: str
    current_password: str


class UserPasswordUpdate(BaseModel):
    old_password: str
    new_password: str


class NoteCreate(BaseModel):
    content: str


class UserLogin(BaseModel):
    email: str
    password: str


class UserSignup(BaseModel):
    username: str
    email: str
    password: str


@app.middleware("http")
async def check_redis_middleware(request: Request, call_next):
    if not REDIS_AVAILABLE and request.url.path == "/":
        try:
            with open("FRONTEND/404.html", "r", encoding="utf-8") as f:
                return HTMLResponse(content=f.read(), status_code=404)
        except FileNotFoundError:
            return HTMLResponse(content="<h1>404 - Service Unavailable (Redis Down)</h1>", status_code=404)

    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


@app.get("/api/quote/{symbol}")
async def read_quote(symbol: str):
    try:
        data = get_quote(symbol)
        if not data:
            raise HTTPException(status_code=404, detail="Symbol not found")
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/revenue-segments/{symbol}")
async def get_revenue_segments(symbol: str, type: str = "product", year: int | None = None):
    """
    Return saved revenue segmentation rows for a symbol.
    type: product | geographic | all
    year: optional calendar year filter; if omitted, latest available date is used per type.
    Cached for 3600s per symbol.
    """
    symbol = symbol.upper()
    cache_key = f"segments:{symbol}:{type}:{year or 'latest'}"

    try:
        try:
            cached = redis_client.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception:
            pass

        def _latest_date(seg_type: str) -> str | None:
            q = f"""
                SELECT TO_CHAR(perioddate, 'YYYY-MM-DD') AS perioddate
                FROM companyrevenuesegments
                WHERE symbol = '{symbol}' AND segmenttype = '{seg_type}'
                ORDER BY perioddate DESC
                LIMIT 1
            """
            df = execute_sql_query(q)
            if df is not None and not df.empty:
                return str(df.iloc[0]["perioddate"])
            return None

        def _by_type(seg_type: str, y: int | None):
            if y is None:
                pd_str = _latest_date(seg_type)
                if not pd_str:
                    return {"type": seg_type, "segments": [], "periodDate": None, "currency": "USD"}
                where_date = f"AND perioddate = '{pd_str}'"
                picked_date = pd_str
            else:
                where_date = f"AND EXTRACT(YEAR FROM perioddate) = {int(y)}"
                picked_date = None
            q = f"""
                SELECT segmentname, revenueamount, currency,
                       TO_CHAR(MAX(perioddate), 'YYYY-MM-DD') AS perioddate
                FROM companyrevenuesegments
                WHERE symbol = '{symbol}' AND segmenttype = '{seg_type}' {where_date}
                GROUP BY segmentname, revenueamount, currency
                ORDER BY revenueamount DESC
                LIMIT 100
            """
            df = execute_sql_query(q)
            if df is None or df.empty:
                return {"type": seg_type, "segments": [], "periodDate": picked_date, "currency": "USD"}
            currency = str(df.iloc[0]["currency"]) if "currency" in df.columns else "USD"
            period_date = picked_date or (str(df.iloc[0]["perioddate"]) if "perioddate" in df.columns else None)
            segments = [
                {"name": str(r["segmentname"]), "amount": float(r["revenueamount"])}
                for _, r in df.iterrows()
            ]
            return {"type": seg_type, "segments": segments, "periodDate": period_date, "currency": currency}

        if type not in ("product", "geographic", "all"):
            raise HTTPException(status_code=400, detail="type must be 'product', 'geographic' or 'all'")

        if type == "all":
            product = _by_type("product", year)
            geographic = _by_type("geographic", year)
            result = {"symbol": symbol, "product": product, "geographic": geographic}
        else:
            result = {"symbol": symbol, **_by_type(type, year)}

        try:
            redis_client.setex(cache_key, 3600, json.dumps(result))
        except Exception:
            pass

        return result
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] get_revenue_segments({symbol}): {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/company-profile/{symbol}")
async def read_company_profile(symbol: str):
    try:
        data = get_company_profile(symbol)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/company-peers/{symbol}")
async def read_company_peers(symbol: str):
    try:
        data = get_company_peers(symbol)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/quotes")
async def read_quotes_bulk(symbols: List[str]):
    try:
        return get_quotes_bulk(symbols)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/market-status")
async def get_market_status_api():
    try:
        return get_market_status()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/market-status/us")
async def get_us_market_status_api():
    """Check US market session and trading day status."""
    try:
        market_info = is_us_market_open()
        trading_day = get_current_trading_day()
        return {
            **market_info,
            'trading_day': trading_day
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/history/{symbol}")
async def get_stock_history_api(symbol: str, period: str = "1y"):
    """Fetch historical OHLCV candle data for a US stock."""
    try:
        data = get_stock_candles(symbol, period)
        if not data:
            raise HTTPException(status_code=404, detail=f"No historical data for '{symbol}'")
        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/financial/{symbol}")
async def get_us_financial_api(symbol: str):
    """Fetch financial metrics for a US stock with PostgreSQL cache fallback."""
    try:
        cache_check = should_use_cached_financial_data(symbol)

        if cache_check['use_cache'] and cache_check['db_data']:
            return cache_check['db_data']

        data = get_us_financial_data(symbol)

        if not data:
            raise HTTPException(status_code=404, detail=f"No financial data for '{symbol}'")

        trading_day = get_current_trading_day()
        save_financial_metrics_to_db(symbol, data, {}, trading_day)

        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/valuation/{symbol}")
async def get_us_valuation_api(symbol: str):
    """Compare a US stock's valuation multiples against sector and industry averages."""
    try:
        data = get_us_valuation_comparison(symbol)
        if not data:
            raise HTTPException(status_code=404, detail=f"No valuation data for '{symbol}'")
        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/fmp/market/{symbol}")
async def get_fmp_market_api(symbol: str):
    """Fetch market and profile data from Financial Modeling Prep API."""
    try:
        data = get_fmp_market_data(symbol)
        if not data:
            raise HTTPException(status_code=404, detail=f"No FMP market data for '{symbol}'")
        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/fmp/financials/{symbol}")
async def get_fmp_financials_api(symbol: str):
    """Fetch financial statements from Financial Modeling Prep API with database cache fallback."""
    try:
        cache_check = should_use_cached_financial_data(symbol)

        if cache_check['use_cache'] and cache_check['db_data']:
            db_data = cache_check['db_data']

            critical_fields = [
                'totalAssets', 'totalLiabilities', 'totalEquity',
                'cashAndCashEquivalents', 'operatingCashFlow', 'freeCashFlow',
                'revenue', 'netIncome', 'ebitda'
            ]

            has_critical_data = any(db_data.get(field) is not None for field in critical_fields)

            if has_critical_data:
                return {
                    'symbol': symbol,
                    'revenue': db_data.get('revenue'),
                    'netIncome': db_data.get('netIncome'),
                    'ebitda': db_data.get('ebitda'),
                    'grossProfit': db_data.get('grossProfit'),
                    'operatingIncome': db_data.get('operatingIncome'),
                    'grossMargin': db_data.get('grossMargin'),
                    'totalAssets': db_data.get('totalAssets'),
                    'totalLiabilities': db_data.get('totalLiabilities'),
                    'totalEquity': db_data.get('totalEquity'),
                    'cashAndCashEquivalents': db_data.get('cashAndCashEquivalents'),
                    'operatingCashFlow': db_data.get('operatingCashFlow'),
                    'freeCashFlow': db_data.get('freeCashFlow'),
                    'source': 'database_cache'
                }

        data = get_fmp_financial_statements(symbol)

        if not data:
            raise HTTPException(status_code=404, detail=f"No FMP financial data for '{symbol}'")

        trading_day = get_current_trading_day()
        yfinance_data = get_us_financial_data(symbol)
        save_financial_metrics_to_db(symbol, yfinance_data, data, trading_day)

        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/fmp/insider/{symbol}")
async def get_fmp_insider_api(symbol: str):
    """Fetch insider trading data from Financial Modeling Prep API."""
    try:
        data = get_fmp_insider_trading(symbol)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/financial-health/{symbol}")
async def get_financial_health_api(symbol: str):
    """Fetch normalized scores for the Financial Health Radar."""
    try:
        data = get_financial_health(symbol)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/indices")
async def get_market_indices_api():
    """Fetch S&P 500, Nasdaq, Russell 2000, and Bitcoin index data."""
    try:
        return get_market_indices()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/watchlist/{user_id}")
async def get_watchlist(user_id: int):
    try:
        query = f"SELECT symbol FROM watchlists WHERE userid = {user_id}"
        df = execute_sql_query(query)
        if df is not None and not df.empty:
            return df['symbol'].tolist()
        return []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/watchlist/{user_id}")
async def add_to_watchlist(user_id: int, symbol: str):
    try:
        check_query = f"SELECT symbol FROM watchlists WHERE userid = {user_id} AND symbol = '{symbol}'"
        df = execute_sql_query(check_query)
        if df is not None and not df.empty:
            return {"message": "Symbol already in watchlist"}

        query = f"INSERT INTO watchlists (userid, symbol, addedat) VALUES ({user_id}, '{symbol}', NOW())"
        success = execute_sql_modification(query)
        if success:
            return {"message": "Symbol added successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to add symbol")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/user/{user_id}")
async def get_user_profile(user_id: int):
    try:
        query = f"SELECT username, email, profileimagepath FROM users WHERE userid = {user_id}"
        try:
            df = execute_sql_query(query)
        except Exception:
            query = f"SELECT username, email FROM users WHERE userid = {user_id}"
            df = execute_sql_query(query)

        if df is not None and not df.empty:
            user = df.iloc[0]
            profile_image = None
            if 'profileimagepath' in user and pd.notna(user['profileimagepath']):
                profile_image = user['profileimagepath']
            elif 'ProfileImagePath' in user and pd.notna(user['ProfileImagePath']):
                profile_image = user['ProfileImagePath']

            return {
                "username": user['username'],
                "email": user['email'],
                "profile_image": profile_image
            }
        raise HTTPException(status_code=404, detail="User not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/user/{user_id}/upload-image")
async def upload_profile_image(user_id: int, file: UploadFile = File(...)):
    try:
        os.makedirs("uploads", exist_ok=True)

        file_extension = os.path.splitext(file.filename or "")[1]
        filename = f"{uuid.uuid4()}{file_extension}"
        file_path = f"uploads/{filename}"

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        db_path = f"/uploads/{filename}"
        query = f"UPDATE users SET profileimagepath = '{db_path}' WHERE userid = {user_id}"
        success = execute_sql_modification(query)

        if not success:
            raise HTTPException(status_code=500, detail="Database update failed.")

        return {"message": "Image uploaded successfully", "path": db_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/user/{user_id}/profile")
async def update_user_profile(user_id: int, profile: UserProfileUpdate):
    try:
        query = f"SELECT passwordhash FROM users WHERE userid = {user_id}"
        stored_hash = execute_sql_query_scalar(query)

        if not stored_hash:
            raise HTTPException(status_code=404, detail="User not found")

        if not pwd_context.verify(profile.current_password, stored_hash):
            raise HTTPException(status_code=401, detail="Invalid password")

        update_query = f"UPDATE users SET username = '{profile.username}', email = '{profile.email}' WHERE userid = {user_id}"
        success = execute_sql_modification(update_query)

        if success:
            return {"message": "Profile updated successfully"}
        else:
            raise HTTPException(status_code=500, detail="Update failed")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/user/{user_id}/password")
async def update_user_password(user_id: int, password_data: UserPasswordUpdate):
    try:
        query = f"SELECT passwordhash FROM users WHERE userid = {user_id}"
        stored_hash = execute_sql_query_scalar(query)

        if not stored_hash:
            raise HTTPException(status_code=404, detail="User not found")

        if not pwd_context.verify(password_data.old_password, stored_hash):
            raise HTTPException(status_code=401, detail="Invalid old password")

        new_hash = pwd_context.hash(password_data.new_password)

        update_query = f"UPDATE users SET passwordhash = '{new_hash}' WHERE userid = {user_id}"
        success = execute_sql_modification(update_query)

        if success:
            return {"message": "Password updated successfully"}
        else:
            raise HTTPException(status_code=500, detail="Update failed")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/watchlist/{user_id}/{symbol}")
async def remove_from_watchlist(user_id: int, symbol: str):
    try:
        query = f"DELETE FROM watchlists WHERE userid = {user_id} AND symbol = '{symbol}'"
        success = execute_sql_modification(query)
        if success:
            return {"message": "Symbol removed successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to remove symbol")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== HOLDINGS API ====================

@app.get("/api/holdings/{user_id}")
async def get_holdings(user_id: int):
    """Retrieve all portfolio holdings for a user."""
    try:
        query = f"SELECT holdingid, symbol, quantity, averageprice, addedat FROM holdings WHERE userid = {user_id}"
        df = execute_sql_query(query)
        if df is not None and not df.empty:
            holdings = []
            for _, row in df.iterrows():
                holdings.append({
                    "id": int(row['holdingid']),
                    "symbol": row['symbol'],
                    "quantity": float(row['quantity']),
                    "average_price": float(row['averageprice']),
                    "added_at": str(row['addedat'])
                })
            return holdings
        return []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/holdings/{user_id}")
async def add_holding(user_id: int, holding: HoldingCreate):
    """Add a new holding or update weighted average cost for an existing holding."""
    try:
        symbol = holding.symbol.upper()

        check_query = f"SELECT holdingid, quantity, averageprice FROM holdings WHERE userid = {user_id} AND symbol = '{symbol}'"
        df = execute_sql_query(check_query)

        if df is not None and not df.empty:
            existing_qty = float(df.iloc[0]['quantity'])
            existing_avg = float(df.iloc[0]['averageprice'])
            holding_id = int(df.iloc[0]['holdingid'])

            new_total_qty = existing_qty + holding.quantity
            new_avg_price = ((existing_qty * existing_avg) + (holding.quantity * holding.average_price)) / new_total_qty

            update_query = f"UPDATE holdings SET quantity = {new_total_qty}, averageprice = {new_avg_price}, updatedat = NOW() WHERE holdingid = {holding_id}"
            success = execute_sql_modification(update_query)

            if success:
                return {"message": "Holding updated successfully", "id": holding_id, "quantity": new_total_qty, "average_price": new_avg_price}
            else:
                raise HTTPException(status_code=500, detail="Failed to update holding")
        else:
            insert_query = f"INSERT INTO holdings (userid, symbol, quantity, averageprice) VALUES ({user_id}, '{symbol}', {holding.quantity}, {holding.average_price})"
            success = execute_sql_modification(insert_query)

            if success:
                id_query = f"SELECT holdingid FROM holdings WHERE userid = {user_id} AND symbol = '{symbol}' ORDER BY holdingid DESC"
                new_id = execute_sql_query_scalar(id_query)
                return {"message": "Holding added successfully", "id": new_id}
            else:
                raise HTTPException(status_code=500, detail="Failed to add holding")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/holdings/{user_id}/{symbol}")
async def update_holding(user_id: int, symbol: str, holding: HoldingUpdate):
    """Update an existing holding."""
    try:
        symbol = symbol.upper()
        query = f"UPDATE holdings SET quantity = {holding.quantity}, averageprice = {holding.average_price}, updatedat = NOW() WHERE userid = {user_id} AND symbol = '{symbol}'"
        success = execute_sql_modification(query)
        if success:
            return {"message": "Holding updated successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to update holding")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/holdings/{user_id}/{symbol}")
async def remove_holding(user_id: int, symbol: str):
    """Remove a holding from the user's portfolio."""
    try:
        symbol = symbol.upper()
        query = f"DELETE FROM holdings WHERE userid = {user_id} AND symbol = '{symbol}'"
        success = execute_sql_modification(query)
        if success:
            return {"message": "Holding removed successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to remove holding")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== NOTES API ====================

@app.get("/api/notes/{user_id}")
async def get_notes(user_id: int):
    """Retrieve all notes for a user ordered from newest to oldest."""
    try:
        query = f"SELECT noteid, content, createdat FROM notes WHERE userid = {user_id} ORDER BY createdat DESC"
        df = execute_sql_query(query)
        if df is not None and not df.empty:
            notes = []
            for _, row in df.iterrows():
                notes.append({
                    "id": int(row['noteid']),
                    "content": row['content'],
                    "created_at": str(row['createdat'])
                })
            return notes
        return []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/notes/{user_id}")
async def add_note(user_id: int, note: NoteCreate):
    """Create a new note for a user."""
    try:
        safe_content = note.content.replace("'", "''")
        query = f"INSERT INTO notes (userid, content) VALUES ({user_id}, '{safe_content}')"
        success = execute_sql_modification(query)

        if success:
            id_query = f"SELECT noteid FROM notes WHERE userid = {user_id} ORDER BY noteid DESC"
            new_id = execute_sql_query_scalar(id_query)
            return {"message": "Note added successfully", "id": new_id}
        else:
            raise HTTPException(status_code=500, detail="Failed to add note")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/notes/{user_id}/{note_id}")
async def delete_note(user_id: int, note_id: int):
    """Delete a note."""
    try:
        query = f"DELETE FROM notes WHERE userid = {user_id} AND noteid = {note_id}"
        success = execute_sql_modification(query)
        if success:
            return {"message": "Note deleted successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to delete note")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/notes/{user_id}/{note_id}")
async def update_note(user_id: int, note_id: int, note: NoteCreate):
    """Update an existing note."""
    try:
        safe_content = note.content.replace("'", "''")
        query = f"UPDATE notes SET content = '{safe_content}' WHERE userid = {user_id} AND noteid = {note_id}"
        success = execute_sql_modification(query)
        if success:
            return {"message": "Note updated successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to update note")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== CASH BALANCE API ====================

@app.get("/api/cash/{user_id}")
async def get_cash(user_id: int):
    """Retrieve a user's cash balance."""
    try:
        query = f"SELECT amount FROM cashbalance WHERE userid = {user_id}"
        df = execute_sql_query(query)
        if df is not None and not df.empty:
            return {"amount": float(df.iloc[0]['amount'])}
        else:
            insert_query = f"INSERT INTO cashbalance (userid, amount) VALUES ({user_id}, 0)"
            execute_sql_modification(insert_query)
            return {"amount": 0}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/cash/{user_id}")
async def update_cash(user_id: int, cash: CashUpdate):
    """Update a user's cash balance."""
    try:
        check_query = f"SELECT cashid FROM cashbalance WHERE userid = {user_id}"
        df = execute_sql_query(check_query)

        if df is not None and not df.empty:
            query = f"UPDATE cashbalance SET amount = {cash.amount}, updatedat = NOW() WHERE userid = {user_id}"
        else:
            query = f"INSERT INTO cashbalance (userid, amount) VALUES ({user_id}, {cash.amount})"

        success = execute_sql_modification(query)
        if success:
            return {"message": "Cash balance updated successfully", "amount": cash.amount}
        else:
            raise HTTPException(status_code=500, detail="Failed to update cash balance")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def fetch_finnhub_news(symbol: str, days: int = 7) -> list:
    """Fetch company news for a symbol from Finnhub."""
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days)

    url = "https://finnhub.io/api/v1/company-news"
    params = {
        'symbol': symbol,
        'from': start_date.strftime('%Y-%m-%d'),
        'to': end_date.strftime('%Y-%m-%d'),
        'token': settings.FINNHUB_API_KEY
    }

    try:
        response = requests.get(url, params=params, timeout=10)
        if response.status_code == 200:
            return response.json()
    except Exception as e:
        print(f"Finnhub news error for {symbol}: {e}")
    return []


def save_news_to_db(news_list: list, symbol: str) -> int:
    """Save news articles to PostgreSQL with duplicate detection."""
    saved_count = 0

    for article in news_list:
        finnhub_id = article.get('id') or article.get('datetime')

        check_query = f"SELECT newsid FROM news WHERE finnhubid = {finnhub_id}"
        existing = execute_sql_query(check_query)

        if existing is None or existing.empty:
            headline = article.get('headline', '').replace("'", "''")[:500]
            summary = article.get('summary', '').replace("'", "''")
            source = article.get('source', '').replace("'", "''")[:100]
            url = article.get('url', '').replace("'", "''")[:1000]
            image_url = article.get('image', '').replace("'", "''")[:1000] if article.get('image') else ''
            category = article.get('category', '').replace("'", "''")[:50]
            related = article.get('related', '').replace("'", "''")[:500]
            published_at = datetime.fromtimestamp(article.get('datetime', 0)).strftime('%Y-%m-%d %H:%M:%S')

            insert_query = f"""
                INSERT INTO news (symbol, finnhubid, headline, summary, source, url, imageurl, publishedat, category, related)
                VALUES ('{symbol.upper()}', {finnhub_id}, '{headline}', '{summary}', '{source}', '{url}', '{image_url}', '{published_at}', '{category}', '{related}')
            """

            if execute_sql_modification(insert_query):
                saved_count += 1

    return saved_count


@app.post("/api/news/fetch")
async def fetch_news_for_symbols(symbols: List[str]):
    """Fetch news from Finnhub for the given symbols and persist to PostgreSQL."""
    try:
        total_fetched = 0
        total_saved = 0

        for symbol in symbols[:20]:
            news_list = fetch_finnhub_news(symbol.upper(), days=3)
            total_fetched += len(news_list)

            if news_list:
                saved = save_news_to_db(news_list, symbol.upper())
                total_saved += saved

        return {
            "message": "News fetched successfully",
            "symbols_processed": len(symbols[:20]),
            "total_fetched": total_fetched,
            "new_saved": total_saved
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/news")
async def get_news(symbols: str = "", limit: int = 20):
    """Retrieve stored news articles with a 5-minute Redis cache."""
    try:
        symbols_key = symbols.replace(",", "_").replace(" ", "") if symbols else "all"
        cache_key = f"news_list:{symbols_key}:{limit}"

        try:
            cached_value = redis_client.get(cache_key)
            if cached_value:
                return json.loads(cached_value)
        except Exception:
            pass

        if symbols:
            symbol_list = [s.strip().upper() for s in symbols.split(',')]
            symbol_filter = "', '".join(symbol_list)
            where_clause = f"WHERE symbol IN ('{symbol_filter}')"
        else:
            where_clause = ""

        query = f"""
            SELECT 
                newsid, symbol, finnhubid, headline, summary, source, url, imageurl, publishedat, category, related
            FROM news 
            {where_clause}
            ORDER BY publishedat DESC
            LIMIT {limit}
        """

        df = execute_sql_query(query)

        news = []
        if df is not None and not df.empty:
            for _, row in df.iterrows():
                news.append({
                    "id": int(row['newsid']),
                    "symbol": row['symbol'],
                    "finnhub_id": int(row['finnhubid']) if pd.notna(row['finnhubid']) else 0,
                    "headline": row['headline'],
                    "summary": row['summary'],
                    "source": row['source'],
                    "url": row['url'],
                    "image_url": row['imageurl'],
                    "published_at": str(row['publishedat']),
                    "category": row['category'],
                    "related": row['related']
                })

        try:
            redis_client.setex(cache_key, 300, json.dumps(news))
        except Exception:
            pass

        return news
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/news/old")
async def delete_old_news(days: int = 30):
    """Delete news articles older than the specified number of days."""
    try:
        query = f"DELETE FROM news WHERE publishedat < NOW() - INTERVAL '{days} DAY'"
        success = execute_sql_modification(query)
        if success:
            return {"message": f"News older than {days} days deleted"}
        else:
            raise HTTPException(status_code=500, detail="Failed to delete old news")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== AUTH API ====================

@app.post("/api/signup")
async def signup(user: UserSignup):
    try:
        check_query = f"SELECT userid FROM users WHERE email = '{user.email}'"
        df = execute_sql_query(check_query)
        if df is not None and not df.empty:
            raise HTTPException(status_code=400, detail="Email already registered")

        query = f"INSERT INTO users (username, email, passwordhash, createdat) VALUES ('{user.username}', '{user.email}', '{user.password}', NOW())"
        success = execute_sql_modification(query)

        if success:
            return {"message": "User created successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to create user")

    except Exception as e:
        print(f"Signup error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/login")
async def login(user: UserLogin):
    try:
        query = f"SELECT userid FROM users WHERE email = '{user.email}' AND passwordhash = '{user.password}'"
        df = execute_sql_query(query)

        if df is not None and not df.empty:
            user_id = int(df.iloc[0]['userid'])
            return {"user_id": user_id, "message": "Login successful"}
        else:
            raise HTTPException(status_code=401, detail="Invalid credentials")

    except Exception as e:
        print(f"Login error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if os.path.exists("FRONTEND/dist/assets"):
    app.mount("/assets", StaticFiles(directory="FRONTEND/dist/assets"), name="assets")


@app.post("/api/mag7/fetch-segments")
async def fetch_mag7_segments(background_tasks: BackgroundTasks):
    """Trigger MAG7 revenue segments fetch from FMP API and save to PostgreSQL in the background."""
    try:
        def run_fetch():
            try:
                stats = run_mag7_fetch()
                print(f"[API] MAG7 segments fetch completed: {stats}")
                try:
                    for mag7_sym in ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA"]:
                        for seg_type in ["product", "geographic"]:
                            redis_client.delete(f"segments:{mag7_sym}:{seg_type}:latest")
                except Exception:
                    pass
            except Exception as e:
                print(f"[ERROR] MAG7 segments fetch failed: {e}")

        background_tasks.add_task(run_fetch)
        return {
            "status": "queued",
            "message": "MAG7 segments fetch started in background",
            "symbols": ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/mag7/segments-status/{symbol}")
async def get_mag7_segments_status(symbol: str):
    """Check if a MAG7 symbol has segment data and return its latest period."""
    symbol = symbol.upper()
    try:
        if symbol not in ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA"]:
            return {"symbol": symbol, "isMag7": False, "hasData": False}

        q = f"""
            SELECT DISTINCT segmenttype, MAX(perioddate) AS latestdate
            FROM companyrevenuesegments
            WHERE symbol = '{symbol}'
            GROUP BY segmenttype
        """
        df = execute_sql_query(q)

        has_product = False
        has_geographic = False
        latest_date = None

        if df is not None and not df.empty:
            for _, row in df.iterrows():
                seg_type = str(row["segmenttype"]).lower()
                if seg_type == "product":
                    has_product = True
                elif seg_type == "geographic":
                    has_geographic = True
                if row["latestdate"]:
                    latest_date = str(row["latestdate"])

        return {
            "symbol": symbol,
            "isMag7": True,
            "hasData": has_product or has_geographic,
            "hasProduct": has_product,
            "hasGeographic": has_geographic,
            "latestDate": latest_date
        }
    except Exception as e:
        print(f"[ERROR] get_mag7_segments_status({symbol}): {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/analytics/calculate")
async def trigger_analytics_calculation(background_tasks: BackgroundTasks):
    """Trigger background calculation of industry averages (Sector/Region/Country)."""
    try:
        def run_analytics():
            try:
                calculate_industry_averages()
            except Exception as e:
                print(f"[ERROR] Analytics calculation failed: {e}")

        background_tasks.add_task(run_analytics)
        return {"message": "Analytics calculation started in background"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== SYMBOL LOGO API ====================

@app.get("/api/logo/{symbol}")
async def get_symbol_logo_api(symbol: str):
    """Serve symbol logo from PostgreSQL cache or download from Finnhub and cache it."""
    symbol = symbol.upper()

    try:
        ensure_symbol_logos_table()

        cached_logo = get_symbol_logo(symbol)
        if cached_logo:
            return Response(
                content=cached_logo['logo'],
                media_type=cached_logo['mimetype']
            )

        finnhub_url = f"https://finnhub.io/api/v1/stock/profile2?symbol={symbol}&token={settings.FINNHUB_API_KEY}"

        profile_response = requests.get(finnhub_url, timeout=10)
        if not profile_response.ok:
            raise HTTPException(status_code=404, detail=f"Could not fetch profile for {symbol}")

        profile_data = profile_response.json()
        logo_url = profile_data.get('logo')

        if not logo_url:
            raise HTTPException(status_code=404, detail=f"No logo found for {symbol}")

        image_response = requests.get(logo_url, timeout=10)
        if not image_response.ok:
            raise HTTPException(status_code=404, detail=f"Could not download logo for {symbol}")

        logo_data = image_response.content
        content_type = image_response.headers.get('Content-Type', 'image/png')

        if 'jpeg' in content_type or 'jpg' in content_type:
            mimetype = 'image/jpeg'
        elif 'svg' in content_type:
            mimetype = 'image/svg+xml'
        else:
            mimetype = 'image/png'

        save_symbol_logo(symbol, logo_data, mimetype)

        return Response(
            content=logo_data,
            media_type=mimetype
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] get_symbol_logo_api({symbol}): {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== ALERTS API ====================

class AlertCreate(BaseModel):
    symbol: str
    alert_type: str
    target_value: float
    priority: str = "medium"
    market_type: str = "nasdaq"
    note: Opt[str] = None
    is_recurring: bool = False
    current_value: Opt[float] = None


class AlertSnooze(BaseModel):
    minutes: int = 30


@app.get("/api/alerts/{user_id}")
async def get_user_alerts(user_id: str, status: str = None):
    """Retrieve alerts for a user."""
    try:
        alerts = alert_service.get_user_alerts(user_id, status)
        return {"alerts": alerts, "count": len(alerts)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/alerts/{user_id}")
async def create_alert(user_id: str, alert: AlertCreate):
    """Create a new alert."""
    try:
        valid_types = [t.value for t in AlertType]
        if alert.alert_type not in valid_types:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid alert_type. Must be one of: {valid_types}"
            )

        valid_priorities = [p.value for p in AlertPriority]
        if alert.priority not in valid_priorities:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid priority. Must be one of: {valid_priorities}"
            )

        result = alert_service.create_alert(
            user_id=user_id,
            symbol=alert.symbol,
            alert_type=AlertType(alert.alert_type),
            target_value=alert.target_value,
            priority=AlertPriority(alert.priority),
            market_type=alert.market_type,
            note=alert.note,
            is_recurring=alert.is_recurring,
            current_value=alert.current_value
        )

        if result['success']:
            return result
        else:
            raise HTTPException(status_code=500, detail=result.get('error', 'Unknown error'))

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/alerts/{user_id}/{alert_id}")
async def cancel_alert(user_id: str, alert_id: int):
    """Cancel an alert."""
    try:
        success = alert_service.cancel_alert(alert_id, user_id)
        if success:
            return {"message": "Alert cancelled successfully"}
        else:
            raise HTTPException(status_code=404, detail="Alert not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/alerts/{user_id}/{alert_id}/snooze")
async def snooze_alert(user_id: str, alert_id: int, snooze: AlertSnooze):
    """Snooze an alert for the specified duration."""
    try:
        success = alert_service.snooze_alert(alert_id, user_id, snooze.minutes)
        if success:
            return {"message": f"Alert snoozed for {snooze.minutes} minutes"}
        else:
            raise HTTPException(status_code=404, detail="Alert not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/alerts/{user_id}/{alert_id}/reactivate")
async def reactivate_alert(user_id: str, alert_id: int):
    """Reactivate a triggered or snoozed alert."""
    try:
        success = alert_service.reactivate_alert(alert_id, user_id)
        if success:
            return {"message": "Alert reactivated successfully"}
        else:
            raise HTTPException(status_code=404, detail="Alert not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== NOTIFICATIONS API ====================

@app.get("/api/notifications/{user_id}")
async def get_notifications(user_id: str, unread_only: bool = False, limit: int = 50):
    """Retrieve alert notifications for a user."""
    try:
        notifications = alert_service.get_notifications(user_id, unread_only, limit)
        unread_count = alert_service.get_unread_count(user_id)
        return {
            "notifications": notifications,
            "unread_count": unread_count,
            "total": len(notifications)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/notifications/{user_id}/unread-count")
async def get_unread_notification_count(user_id: str):
    """Return the count of unread notifications for a user."""
    try:
        count = alert_service.get_unread_count(user_id)
        return {"unread_count": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/notifications/{user_id}/{notification_id}/read")
async def mark_notification_read(user_id: str, notification_id: int):
    """Mark a notification as read."""
    try:
        success = alert_service.mark_notification_read(notification_id, user_id)
        if success:
            return {"message": "Notification marked as read"}
        else:
            raise HTTPException(status_code=404, detail="Notification not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/notifications/{user_id}/read-all")
async def mark_all_notifications_read(user_id: str):
    """Mark all notifications for a user as read."""
    try:
        success = alert_service.mark_all_notifications_read(user_id)
        if success:
            return {"message": "All notifications marked as read"}
        else:
            raise HTTPException(status_code=500, detail="Failed to mark notifications as read")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== ALERT WEBSOCKET ====================

class ConnectionManager:
    """Manage active WebSocket connections per user."""

    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = set()
        self.active_connections[user_id].add(websocket)
        print(f"[WS] User {user_id} connected. Total connections: {len(self.active_connections[user_id])}")

    def disconnect(self, websocket: WebSocket, user_id: str):
        if user_id in self.active_connections:
            self.active_connections[user_id].discard(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
        print(f"[WS] User {user_id} disconnected")

    async def send_notification(self, user_id: str, notification: dict):
        """Send a notification payload to a user's active WebSocket connections."""
        if user_id in self.active_connections:
            disconnected = set()
            for websocket in self.active_connections[user_id]:
                try:
                    await websocket.send_json({
                        "type": "notification",
                        "data": notification
                    })
                except Exception:
                    disconnected.add(websocket)

            for ws in disconnected:
                self.active_connections[user_id].discard(ws)

    async def send_unread_count(self, user_id: str, count: int):
        """Send updated unread notification count to a user."""
        if user_id in self.active_connections:
            disconnected = set()
            for websocket in self.active_connections[user_id]:
                try:
                    await websocket.send_json({
                        "type": "unread_count",
                        "data": {"count": count}
                    })
                except Exception:
                    disconnected.add(websocket)

            for ws in disconnected:
                self.active_connections[user_id].discard(ws)

    async def broadcast_alert_triggered(self, notification: dict):
        """Broadcast a triggered alert notification and updated unread count to the user."""
        user_id = notification.get('user_id')
        if user_id:
            await self.send_notification(user_id, notification)
            count = alert_service.get_unread_count(user_id)
            await self.send_unread_count(user_id, count)


ws_manager = ConnectionManager()


@app.websocket("/ws/alerts/{user_id}")
async def websocket_alerts(websocket: WebSocket, user_id: str):
    """WebSocket endpoint for real-time alert notifications."""
    await ws_manager.connect(websocket, user_id)

    try:
        count = alert_service.get_unread_count(user_id)
        await websocket.send_json({
            "type": "connected",
            "data": {"unread_count": count}
        })

        while True:
            try:
                data = await asyncio.wait_for(
                    websocket.receive_json(),
                    timeout=30.0
                )

                if data.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})

                elif data.get("type") == "get_unread_count":
                    count = alert_service.get_unread_count(user_id)
                    await websocket.send_json({
                        "type": "unread_count",
                        "data": {"count": count}
                    })

            except asyncio.TimeoutError:
                try:
                    await websocket.send_json({"type": "ping"})
                except Exception:
                    break

    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, user_id)
    except Exception as e:
        print(f"[WS ERROR] {user_id}: {e}")
        ws_manager.disconnect(websocket, user_id)


# ==================== PRICE ALERT CHECKER ====================

async def check_price_alerts(symbol: str, current_price: float,
                             volume: float = None, prev_close: float = None):
    """Evaluate active price alerts for a symbol and broadcast triggered notifications."""
    try:
        triggered = alert_service.check_and_trigger_alerts(
            symbol=symbol,
            current_price=current_price,
            current_volume=volume,
            prev_close=prev_close
        )

        for notification in triggered:
            await ws_manager.broadcast_alert_triggered(notification)

        return triggered

    except Exception as e:
        print(f"[ALERT CHECK ERROR] {symbol}: {e}")
        return []


@app.get("/api/quote-with-alert-check/{symbol}")
async def quote_with_alert_check(symbol: str):
    """Fetch quote and evaluate price alerts."""
    try:
        data = get_quote(symbol)
        if not data:
            raise HTTPException(status_code=404, detail="Symbol not found")

        if data.get('price'):
            await check_price_alerts(
                symbol=symbol,
                current_price=data['price'],
                prev_close=data.get('prev_close')
            )

        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== AI CHAT API ====================

TICKER_STOPWORDS = {
    "BEN", "SEN", "BIR", "VE", "VEYA", "AMA", "NE", "BU", "SU", "DA", "DE",
    "MI", "MU", "ACABA", "NASIL", "NEDIR", "ILE", "ICIN", "DAHA", "COK",
    "AZ", "VAR", "YOK", "OLAN", "GIBI", "HER", "HANGI", "KADAR", "TAM",
    "EN", "SON", "YIL", "AY", "GUN", "SAAT", "NET", "KAR", "HAM",
    "AL", "SAT", "TUT", "KAC", "ANALIZ", "ET", "HISSE", "FIYAT",
    "ARTIS", "DUSUS", "YUKSELIS", "DUSUYOR", "YUKSELIYOR", "NEDEN",
    "SENCE", "BENCE", "YORUM", "YAP", "VER", "OL", "OLUR",
    "IKI", "UC", "BES", "ON", "YUZ", "BIN", "ETF",
    "THE", "AND", "FOR", "ARE", "BUT", "NOT", "YOU", "ALL", "CAN",
    "HER", "WAS", "ONE", "OUR", "OUT", "HOW", "HAS", "ITS", "LET",
    "MAY", "NEW", "NOW", "OLD", "SEE", "WAY", "WHO", "DID", "GET",
    "HIS", "HIM", "SAY", "SHE", "TOO", "USE", "BUY", "SELL", "HOLD",
    "WHAT", "WHEN", "WHERE", "WHICH", "WHY", "WILL", "WITH",
    "ABOUT", "THINK", "STOCK", "PRICE", "HIGH", "LOW", "GOOD", "BAD",
    "LONG", "SHORT", "MORE", "LESS", "BEST", "THAN", "VERY", "JUST",
    "KNOW", "TAKE", "COME", "MAKE", "LIKE", "LOOK", "FIND", "GIVE",
    "MOST", "SOME", "FROM", "HAVE", "BEEN", "MUCH", "ALSO",
}


def detect_tickers(text: str) -> list:
    """Detect up to 3 candidate stock ticker symbols from user message text."""
    words = re.findall(r'\b([A-Za-z]{1,5})\b', text)

    candidates = []
    for word in words:
        upper_word = word.upper()
        if upper_word in TICKER_STOPWORDS:
            continue
        if len(upper_word) < 2:
            continue
        if upper_word not in candidates:
            candidates.append(upper_word)

    return candidates[:3]


def fetch_stock_data_for_chat(symbol: str) -> dict:
    """Fetch quote, financial metrics, and profile data for a US stock symbol."""
    result = {"symbol": symbol, "market": "us", "found": False}

    try:
        quote = get_quote(symbol)
        if quote and quote.get("price", 0) > 0:
            result["quote"] = quote
            result["found"] = True

        try:
            financial = get_us_financial_data(symbol)
            if financial and financial.get("marketCap"):
                result["financial"] = financial
        except Exception as e:
            print(f"[Chat] US financial error for {symbol}: {e}")

        try:
            fmp_data = get_fmp_market_data(symbol)
            if fmp_data and fmp_data.get("companyName"):
                result["profile"] = fmp_data
                result["found"] = True
        except Exception as e:
            print(f"[Chat] FMP profile error for {symbol}: {e}")

    except Exception as e:
        print(f"[Chat] fetch_stock_data error for {symbol}: {e}")

    return result


def format_number(value, prefix="", suffix="", decimals=2):
    """Format a number with T/B/M abbreviations."""
    if value is None:
        return "N/A"
    try:
        num = float(value)
        if abs(num) >= 1_000_000_000_000:
            return f"{prefix}{num/1_000_000_000_000:.{decimals}f}T{suffix}"
        elif abs(num) >= 1_000_000_000:
            return f"{prefix}{num/1_000_000_000:.{decimals}f}B{suffix}"
        elif abs(num) >= 1_000_000:
            return f"{prefix}{num/1_000_000:.{decimals}f}M{suffix}"
        else:
            return f"{prefix}{num:,.{decimals}f}{suffix}"
    except (ValueError, TypeError):
        return "N/A"


def build_stock_context(data_list: list) -> str:
    """Format fetched stock data into a markdown context block for the AI model."""
    if not data_list:
        return ""

    context_parts = []

    for data in data_list:
        if not data.get("found"):
            context_parts.append(f"⚠️ {data['symbol']}: No market data found for this symbol.")
            continue

        symbol = data["symbol"]
        currency = "$"

        lines = [f"📊 {symbol} Stock Data:"]

        quote = data.get("quote", {})
        if quote:
            price = quote.get("price", 0)
            prev_close = quote.get("prev_close", 0)
            change = price - prev_close if price and prev_close else 0
            change_pct = (change / prev_close * 100) if prev_close and prev_close > 0 else 0

            lines.append(f"• Price: {currency}{price:.2f} | Prev Close: {currency}{prev_close:.2f} | Change: {change_pct:+.2f}%")

            if quote.get("high"):
                lines.append(f"• Intraday: High {currency}{quote['high']:.2f} / Low {currency}{quote.get('low', 0):.2f}")
            if quote.get("volume"):
                lines.append(f"• Volume: {format_number(quote['volume'])}")

        profile = data.get("profile", {})
        if profile:
            name = profile.get("companyName") or profile.get("name") or symbol
            sector = profile.get("sector", "N/A")
            industry = profile.get("industry", "N/A")
            lines[0] = f"📊 {symbol} ({name}) Stock Data:"
            lines.append(f"• Sector: {sector} | Industry: {industry}")

            if profile.get("description"):
                desc = profile["description"][:200] + "..." if len(str(profile.get("description", ""))) > 200 else profile.get("description", "")
                lines.append(f"• Description: {desc}")

            if profile.get("isEtf"):
                lines.append("• Type: ETF")
            if profile.get("exchange"):
                lines.append(f"• Exchange: {profile['exchange']}")

        fin = data.get("financial", {})
        if fin:
            mcap = fin.get("marketCap")
            if mcap:
                lines.append(f"• Market Cap: {format_number(mcap, prefix=currency)}")

            valuation_parts = []
            if fin.get("trailingPE"):
                valuation_parts.append(f"P/E: {fin['trailingPE']:.1f}")
            if fin.get("forwardPE"):
                valuation_parts.append(f"Forward P/E: {fin['forwardPE']:.1f}")
            if fin.get("priceToBook"):
                valuation_parts.append(f"P/B: {fin['priceToBook']:.2f}")
            if fin.get("priceToSalesTrailing12Months"):
                valuation_parts.append(f"P/S: {fin['priceToSalesTrailing12Months']:.2f}")
            if valuation_parts:
                lines.append(f"• Valuation: {' | '.join(valuation_parts)}")

            eps_parts = []
            if fin.get("trailingEps"):
                eps_parts.append(f"EPS: {currency}{fin['trailingEps']:.2f}")
            if fin.get("forwardEps"):
                eps_parts.append(f"Forward EPS: {currency}{fin['forwardEps']:.2f}")
            if eps_parts:
                lines.append(f"• {' | '.join(eps_parts)}")

            w52_parts = []
            if fin.get("fiftyTwoWeekHigh"):
                w52_parts.append(f"52W High: {currency}{fin['fiftyTwoWeekHigh']:.2f}")
            if fin.get("fiftyTwoWeekLow"):
                w52_parts.append(f"52W Low: {currency}{fin['fiftyTwoWeekLow']:.2f}")
            if w52_parts:
                lines.append(f"• {' | '.join(w52_parts)}")

            ma_parts = []
            if fin.get("fiftyDayAverage"):
                ma_parts.append(f"50D Avg: {currency}{fin['fiftyDayAverage']:.2f}")
            if fin.get("twoHundredDayAverage"):
                ma_parts.append(f"200D Avg: {currency}{fin['twoHundredDayAverage']:.2f}")
            if ma_parts:
                lines.append(f"• {' | '.join(ma_parts)}")

            misc_parts = []
            if fin.get("beta"):
                misc_parts.append(f"Beta: {fin['beta']:.2f}")
            div_yield = fin.get("dividendYield")
            if div_yield and div_yield > 0:
                misc_parts.append(f"Dividend Yield: {div_yield*100:.2f}%")
            else:
                misc_parts.append("Dividend: None")
            if misc_parts:
                lines.append(f"• {' | '.join(misc_parts)}")

            growth_parts = []
            if fin.get("revenueGrowth"):
                growth_parts.append(f"Revenue Growth: {fin['revenueGrowth']*100:+.1f}%")
            if fin.get("earningsGrowth"):
                growth_parts.append(f"Earnings Growth: {fin['earningsGrowth']*100:+.1f}%")
            if growth_parts:
                lines.append(f"• {' | '.join(growth_parts)}")

            profit_parts = []
            if fin.get("returnOnEquity"):
                profit_parts.append(f"ROE: {fin['returnOnEquity']*100:.1f}%")
            if fin.get("returnOnAssets"):
                profit_parts.append(f"ROA: {fin['returnOnAssets']*100:.1f}%")
            if fin.get("profitMargins"):
                profit_parts.append(f"Profit Margin: {fin['profitMargins']*100:.1f}%")
            if profit_parts:
                lines.append(f"• {' | '.join(profit_parts)}")

            debt_parts = []
            if fin.get("debtToEquity"):
                debt_parts.append(f"Debt/Equity: {fin['debtToEquity']:.1f}")
            if fin.get("currentRatio"):
                debt_parts.append(f"Current Ratio: {fin['currentRatio']:.2f}")
            if debt_parts:
                lines.append(f"• {' | '.join(debt_parts)}")

            income_parts = []
            if fin.get("totalRevenue"):
                income_parts.append(f"Revenue: {format_number(fin['totalRevenue'], prefix=currency)}")
            if fin.get("ebitda"):
                income_parts.append(f"EBITDA: {format_number(fin['ebitda'], prefix=currency)}")
            if fin.get("netIncomeToCommon"):
                income_parts.append(f"Net Income: {format_number(fin['netIncomeToCommon'], prefix=currency)}")
            if income_parts:
                lines.append(f"• {' | '.join(income_parts)}")

        context_parts.append("\n".join(lines))

    return "\n\n".join(context_parts)


CHAT_SYSTEM_PROMPT = """You are a professional financial market assistant specializing in US equities, ETFs, and financial analysis.

Rules:
1. Respond in the same language as the user's message.
2. Provide concise, well-structured answers.
3. Use the live market data provided in the context when available.
4. If data is missing or unavailable, state it clearly without guessing.
5. You may provide fundamental and technical analysis, but do not give personalized investment advice."""


class ChatRequest(BaseModel):
    messages: list


@app.post("/api/chat")
async def chat_with_ai(request: ChatRequest):
    """AI chat endpoint enriched with live US stock and ETF market data."""
    try:
        api_key = settings.OPENAI_API_KEY
        if not api_key:
            raise HTTPException(status_code=500, detail="OpenAI API key not configured in .env (OPENAI_API_KEY)")

        stock_context = ""
        last_user_msg = ""
        for msg in reversed(request.messages):
            if msg.get("role") == "user":
                last_user_msg = msg.get("content", "")
                break

        if last_user_msg:
            tickers = detect_tickers(last_user_msg)
            if tickers:
                print(f"[Chat] Detected tickers: {tickers}")

                stock_data_list = []
                for ticker in tickers:
                    print(f"[Chat] Fetching data for {ticker}")
                    data = fetch_stock_data_for_chat(ticker)
                    stock_data_list.append(data)

                stock_context = build_stock_context(stock_data_list)

        system_content = CHAT_SYSTEM_PROMPT
        if stock_context:
            system_content += f"\n\n--- LIVE MARKET DATA ---\n{stock_context}\n\nUse the live market data above for your analysis. Do not fabricate missing figures."

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }

        messages = [
            {"role": "system", "content": system_content}
        ] + request.messages

        payload = {
            "model": settings.OPENAI_MODEL,
            "messages": messages,
            "max_completion_tokens": 3000,
            "temperature": 0.7
        }

        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers=headers,
            json=payload,
            timeout=60
        )

        if response.status_code != 200:
            error_detail = response.json().get("error", {}).get("message", "Unknown error")
            print(f"[OpenAI Error] Status: {response.status_code}, Detail: {error_detail}")
            raise HTTPException(status_code=response.status_code, detail=f"OpenAI API Error: {error_detail}")

        data = response.json()
        assistant_message = data["choices"][0]["message"]["content"]

        return {"response": assistant_message}

    except HTTPException:
        raise
    except requests.exceptions.Timeout:
        raise HTTPException(status_code=504, detail="OpenAI API timeout")
    except Exception as e:
        print(f"[Chat Error] {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== SPA CATCH-ALL ROUTE ====================

@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    """
    Catch-all route for Single Page Application.
    Serves index.html for all routes that don't match API endpoints.
    """
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="API endpoint not found")

    file_path = f"FRONTEND/dist/{full_path}"
    if os.path.exists(file_path) and os.path.isfile(file_path):
        return FileResponse(file_path)

    index_path = "FRONTEND/dist/index.html"
    if os.path.exists(index_path):
        return FileResponse(index_path)

    raise HTTPException(status_code=404, detail="Application not found")


if __name__ == "__main__":
    print("Application Opening")
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
