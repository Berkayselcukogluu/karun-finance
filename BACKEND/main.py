import os
import json
import redis
import finnhub
import requests
from typing import Dict, Any, List
from datetime import datetime, time, timezone, timedelta
import pytz
from BACKEND.config import settings

try:
    from database import (
        get_financial_metrics_from_db, save_financial_metrics_to_db, check_financial_metrics_exists,
        get_financial_health_from_db, save_financial_health_to_db, check_financial_health_exists,
        get_company_profile_from_db, save_company_profile_to_db
    )
except ImportError:
    from BACKEND.database import (
        get_financial_metrics_from_db, save_financial_metrics_to_db, check_financial_metrics_exists,
        get_financial_health_from_db, save_financial_health_to_db, check_financial_health_exists,
        get_company_profile_from_db, save_company_profile_to_db
    )

redis_client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
finnhub_client = finnhub.Client(api_key=settings.FINNHUB_API_KEY)


def is_us_market_open() -> dict:
    et_tz = pytz.timezone('US/Eastern')
    now_et = datetime.now(et_tz)
    current_time = now_et.time()

    if now_et.weekday() >= 5:
        return {
            'is_open': False,
            'session': 'closed',
            'reason': 'weekend',
            'current_time_et': now_et.strftime('%Y-%m-%d %H:%M:%S %Z')
        }

    # Market hours (US Eastern Time)
    pre_market_start = time(4, 0)    # 04:00 AM
    market_open = time(9, 30)        # 09:30 AM
    market_close = time(16, 0)       # 04:00 PM
    post_market_end = time(20, 0)    # 08:00 PM

    if market_open <= current_time < market_close:
        return {
            'is_open': True,
            'session': 'market',
            'current_time_et': now_et.strftime('%Y-%m-%d %H:%M:%S %Z')
        }
    elif pre_market_start <= current_time < market_open:
        return {
            'is_open': False,
            'session': 'pre-market',
            'current_time_et': now_et.strftime('%Y-%m-%d %H:%M:%S %Z')
        }
    elif market_close <= current_time < post_market_end:
        return {
            'is_open': False,
            'session': 'post-market',
            'current_time_et': now_et.strftime('%Y-%m-%d %H:%M:%S %Z')
        }
    else:
        return {
            'is_open': False,
            'session': 'closed',
            'current_time_et': now_et.strftime('%Y-%m-%d %H:%M:%S %Z')
        }


def get_current_trading_day() -> str:
    """Return the current or most recent trading day in YYYY-MM-DD format."""
    et_tz = pytz.timezone('US/Eastern')
    now_et = datetime.now(et_tz)

    weekday = now_et.weekday()
    if weekday == 5:  # Saturday -> Friday
        return (now_et.replace(hour=0, minute=0, second=0, microsecond=0) -
                timedelta(days=1)).strftime('%Y-%m-%d')
    elif weekday == 6:  # Sunday -> Friday
        return (now_et.replace(hour=0, minute=0, second=0, microsecond=0) -
                timedelta(days=2)).strftime('%Y-%m-%d')

    return now_et.strftime('%Y-%m-%d')


def should_use_cached_financial_data(symbol: str) -> dict:
    """
    Determine whether to use cached DB data or fetch from FMP/yfinance API.
    If DB has complete financial metrics, use them to save API calls.
    """
    db_check = check_financial_metrics_exists(symbol)

    if db_check['exists']:
        db_data = get_financial_metrics_from_db(symbol)
        if db_data:
            key_metrics = ['trailingPE', 'priceToBook', 'marketCap', 'revenue', 'netIncome']
            has_complete_data = any(db_data.get(m) is not None for m in key_metrics)

            if has_complete_data:
                print(f"[DB] Using cached financial data for {symbol} (has complete metrics)")
                return {
                    'use_cache': True,
                    'reason': f"db_has_complete_data (last_updated: {db_check['last_updated']})",
                    'db_data': db_data
                }

    market_status = is_us_market_open()
    reason = 'market_open' if market_status['is_open'] else 'no_db_data'
    print(f"[FMP] Will fetch data for {symbol}. Reason: {reason}")

    return {
        'use_cache': False,
        'reason': reason,
        'db_data': None
    }


def get_market_status() -> Dict[str, Any]:
    key = "market_status:US"
    try:
        cached_value = redis_client.get(key)
        if cached_value:
            return json.loads(cached_value)
    except Exception:
        pass

    try:
        r = requests.get(f"https://finnhub.io/api/v1/stock/market-status?exchange=US&token={settings.FINNHUB_API_KEY}")
        data = r.json()

        try:
            redis_client.setex(key, 300, json.dumps(data))
        except Exception:
            pass

        return data
    except Exception as e:
        print(f"Error fetching market status: {e}")
        return {"market": "US", "isOpen": False, "session": "CLOSED", "holiday": None}


def get_company_profile(symbol: str) -> Dict[str, Any]:
    symbol = symbol.upper()
    key = f"profile:{symbol}"

    try:
        cached_value = redis_client.get(key)
        if cached_value:
            return json.loads(str(cached_value))
    except Exception:
        pass

    try:
        profile = finnhub_client.company_profile2(symbol=symbol)

        try:
            redis_client.setex(key, 86400, json.dumps(profile))
        except Exception:
            pass

        return profile
    except Exception as e:
        print(f"Error fetching company profile: {e}")
        return {}


def fetch_quote_from_finnhub(symbol: str) -> Dict[str, Any]:
    print(f"[DEBUG] Fetching quote from Finnhub: {symbol}")
    q = finnhub_client.quote(symbol)
    return {
        "symbol": symbol,
        "price": q.get("c"),
        "high": q.get("h"),
        "low": q.get("l"),
        "open": q.get("o"),
        "prev_close": q.get("pc"),
        "timestamp": q.get("t"),
    }


def get_quote(symbol: str, ttl_seconds: int = 5) -> Dict[str, Any]:
    symbol = symbol.upper()
    key = f"quote:{symbol}"

    try:
        cached_value = redis_client.get(key)
        if cached_value:
            return json.loads(str(cached_value))
    except redis.ConnectionError:
        print("[REDIS] Connection error, skipping cache.")
    except Exception as e:
        print(f"[REDIS] Unexpected error: {e}")

    try:
        data = fetch_quote_from_finnhub(symbol)
        try:
            redis_client.setex(key, ttl_seconds, json.dumps(data))
        except redis.ConnectionError:
            print("[REDIS] Write error, cache not updated.")
        return data
    except Exception as e:
        print(f"[API] Finnhub error: {e}")
        return {
            "symbol": symbol,
            "price": 0.0,
            "high": 0.0,
            "low": 0.0,
            "open": 0.0,
            "prev_close": 0.0,
            "timestamp": 0,
            "error": str(e)
        }


def get_company_peers(symbol: str) -> List[str]:
    symbol = symbol.upper()
    key = f"peers:{symbol}"

    try:
        cached_value = redis_client.get(key)
        if cached_value:
            return json.loads(str(cached_value))
    except Exception:
        pass

    try:
        peers = finnhub_client.company_peers(symbol)
        peers = [p for p in peers if p != symbol]

        try:
            redis_client.setex(key, 86400, json.dumps(peers))
        except Exception:
            pass

        return peers
    except Exception as e:
        print(f"Error fetching company peers: {e}")
        return []


def get_market_indices() -> List[Dict[str, Any]]:
    """Fetch major market indices (S&P 500, Nasdaq, Russell 2000, Bitcoin) with 60s Redis cache."""
    key = "market_indices"

    try:
        cached_value = redis_client.get(key)
        if cached_value:
            return json.loads(cached_value)
    except Exception as e:
        print(f"[REDIS] Cache read error: {e}")

    import yfinance as yf

    indices_info = [
        ("^GSPC", "S&P 500"),
        ("^IXIC", "Nasdaq"),
        ("^RUT", "Russell 2000"),
        ("BTC-USD", "Bitcoin"),
    ]

    result = []

    try:
        for symbol, name in indices_info:
            try:
                ticker = yf.Ticker(symbol)
                info = ticker.fast_info

                price = float(info.last_price) if hasattr(info, 'last_price') and info.last_price is not None else 0.0
                prev_close = float(info.previous_close) if hasattr(info, 'previous_close') and info.previous_close is not None else price

                change = price - prev_close
                change_percent = (change / prev_close * 100) if prev_close else 0.0

                direction = "up" if change > 0 else ("down" if change < 0 else "flat")

                result.append({
                    "symbol": symbol,
                    "name": name,
                    "price": round(price, 2),
                    "change": round(change, 2),
                    "changePercent": round(change_percent, 2),
                    "direction": direction
                })
            except Exception as e:
                print(f"Error fetching {symbol}: {e}")
                result.append({
                    "symbol": symbol,
                    "name": name,
                    "price": 0,
                    "change": 0,
                    "changePercent": 0,
                    "direction": "flat"
                })

        try:
            redis_client.setex(key, 60, json.dumps(result))
        except Exception:
            pass

        return result
    except Exception as e:
        print(f"[ERROR] Indices fetch error: {e}")
        return []


def get_quotes_bulk(symbols: List[str]) -> Dict[str, Any]:
    """Fetch quotes for multiple symbols using Redis cache first and Finnhub for missing symbols."""
    results = {}
    missing_symbols = []

    for symbol in symbols:
        symbol = symbol.upper()
        key = f"quote:{symbol}"
        try:
            cached_value = redis_client.get(key)
            if cached_value:
                results[symbol] = json.loads(str(cached_value))
            else:
                missing_symbols.append(symbol)
        except Exception:
            missing_symbols.append(symbol)

    if missing_symbols:
        print(f"[BULK] Fetching missing: {missing_symbols}")
        import concurrent.futures

        def fetch_single(sym):
            return sym, get_quote(sym)

        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            future_to_symbol = {executor.submit(fetch_single, sym): sym for sym in missing_symbols}
            for future in concurrent.futures.as_completed(future_to_symbol):
                sym = future_to_symbol[future]
                try:
                    _, data = future.result()
                    results[sym] = data
                except Exception as e:
                    print(f"[ERROR] Bulk fetch failed for {sym}: {e}")
                    results[sym] = {}

    return results


def get_stock_candles(symbol: str, period: str = "1y") -> List[Dict[str, Any]]:
    """
    Fetch historical OHLCV candle data for a symbol from yfinance.
    Supported periods: 1mo (hourly bars), 3mo, 6mo, 1y, 2y, max (daily bars).
    """
    import yfinance as yf

    symbol = symbol.upper()
    key = f"candles:{symbol}:{period}"

    try:
        cached_value = redis_client.get(key)
        if cached_value:
            return json.loads(str(cached_value))
    except Exception as e:
        print(f"[REDIS] Cache read error: {e}")

    try:
        ticker = yf.Ticker(symbol)

        if period == "1mo":
            hist = ticker.history(period=period, interval="1h", prepost=False)
        else:
            hist = ticker.history(period=period, prepost=False)

        if hist.empty:
            print(f"[API] No candle data found: {symbol}")
            return []

        result = []
        for index, row in hist.iterrows():
            if period == "1mo":
                date_val = int(index.timestamp())  # type: ignore
            else:
                date_val = index.strftime('%Y-%m-%d')  # type: ignore

            result.append({
                'date': date_val,
                'open': round(float(row['Open']), 2),
                'high': round(float(row['High']), 2),
                'low': round(float(row['Low']), 2),
                'close': round(float(row['Close']), 2),
                'volume': int(row['Volume'])
            })

        ttl = 300 if period in ['1mo'] else 1800
        try:
            redis_client.setex(key, ttl, json.dumps(result))
        except Exception:
            pass

        return result
    except Exception as e:
        print(f"[API] Candles error ({symbol}): {e}")
        return []


# Popular US stocks used for sector/industry valuation comparison
POPULAR_US_STOCKS = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA", "JPM", "V", "JNJ",
    "WMT", "PG", "MA", "HD", "DIS", "PYPL", "NFLX", "INTC", "VZ", "T",
    "PFE", "MRK", "KO", "PEP", "CSCO", "ABT", "CRM", "ORCL", "ACN", "AVGO"
]


def get_us_financial_data(symbol: str) -> Dict[str, Any]:
    """Fetch key financial metrics, dividend/split history, and ownership info from yfinance."""
    import yfinance as yf

    symbol = symbol.upper()
    key = f"us_financial:{symbol}"

    try:
        cached_value = redis_client.get(key)
        if cached_value:
            return json.loads(str(cached_value))
    except Exception as e:
        print(f"[REDIS] Cache read error: {e}")

    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info

        financial_data = {
            'symbol': symbol,
            'trailingPE': info.get('trailingPE'),
            'forwardPE': info.get('forwardPE'),
            'priceToBook': info.get('priceToBook'),
            'beta': info.get('beta'),
            'trailingEps': info.get('trailingEps'),
            'forwardEps': info.get('forwardEps'),
            'dividendYield': info.get('dividendYield'),
            'dividendRate': info.get('dividendRate'),
            'fiftyTwoWeekHigh': info.get('fiftyTwoWeekHigh'),
            'fiftyTwoWeekLow': info.get('fiftyTwoWeekLow'),
            'fiftyDayAverage': info.get('fiftyDayAverage'),
            'twoHundredDayAverage': info.get('twoHundredDayAverage'),
            'marketCap': info.get('marketCap'),
            'enterpriseValue': info.get('enterpriseValue'),
            'bookValue': info.get('bookValue'),
            'priceToSalesTrailing12Months': info.get('priceToSalesTrailing12Months'),
            'profitMargins': info.get('profitMargins'),
            'operatingMargins': info.get('operatingMargins'),
            'returnOnAssets': info.get('returnOnAssets'),
            'returnOnEquity': info.get('returnOnEquity'),
            'revenueGrowth': info.get('revenueGrowth'),
            'earningsGrowth': info.get('earningsGrowth'),
            'currentRatio': info.get('currentRatio'),
            'quickRatio': info.get('quickRatio'),
            'debtToEquity': info.get('debtToEquity'),
            'freeCashflow': info.get('freeCashflow'),
            'operatingCashflow': info.get('operatingCashflow'),
            'totalRevenue': info.get('totalRevenue'),
            'grossProfits': info.get('grossProfits'),
            'ebitda': info.get('ebitda'),
            'netIncomeToCommon': info.get('netIncomeToCommon'),
            'sharesOutstanding': info.get('sharesOutstanding'),
            'floatShares': info.get('floatShares'),
            'heldPercentInsiders': info.get('heldPercentInsiders'),
            'heldPercentInstitutions': info.get('heldPercentInstitutions'),
            'currency': 'USD',
            'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        }

        try:
            dividends = ticker.dividends
            if dividends is not None and not dividends.empty:
                dividend_history = []
                for date, amount in dividends.tail(10).items():
                    dividend_history.append({
                        'date': date.strftime('%Y-%m-%d'),  # type: ignore
                        'amount': float(amount)
                    })
                financial_data['dividendHistory'] = dividend_history
            else:
                financial_data['dividendHistory'] = []
        except Exception:
            financial_data['dividendHistory'] = []

        try:
            splits = ticker.splits
            if splits is not None and not splits.empty:
                split_history = []
                for date, ratio in splits.tail(5).items():
                    split_history.append({
                        'date': date.strftime('%Y-%m-%d'),  # type: ignore
                        'ratio': float(ratio)
                    })
                financial_data['splitHistory'] = split_history
            else:
                financial_data['splitHistory'] = []
        except Exception:
            financial_data['splitHistory'] = []

        try:
            major_holders = ticker.major_holders
            if major_holders is not None and not major_holders.empty:
                financial_data['majorHolders'] = major_holders.to_dict()
            else:
                financial_data['majorHolders'] = {}
        except Exception:
            financial_data['majorHolders'] = {}

        try:
            institutional = ticker.institutional_holders
            if institutional is not None and not institutional.empty:
                inst_list = []
                for _, row in institutional.head(5).iterrows():
                    inst_list.append({
                        'holder': str(row.get('Holder', '')),
                        'shares': int(row.get('Shares', 0)) if row.get('Shares') else 0,
                        'value': float(row.get('Value', 0)) if row.get('Value') else 0,
                        'pctOut': float(row.get('% Out', 0)) if row.get('% Out') else 0
                    })
                financial_data['institutionalHolders'] = inst_list
            else:
                financial_data['institutionalHolders'] = []
        except Exception:
            financial_data['institutionalHolders'] = []

        try:
            targets = ticker.analyst_price_targets
            if targets is not None:
                financial_data['analystTargets'] = {
                    'current': targets.get('current'),
                    'low': targets.get('low'),
                    'high': targets.get('high'),
                    'mean': targets.get('mean'),
                    'median': targets.get('median')
                }
            else:
                financial_data['analystTargets'] = {}
        except Exception:
            financial_data['analystTargets'] = {}

        try:
            redis_client.setex(key, 3600, json.dumps(financial_data))
        except Exception:
            pass

        return financial_data
    except Exception as e:
        print(f"[ERROR] US financial data error ({symbol}): {e}")
        return {}


def get_us_valuation_comparison(symbol: str) -> Dict[str, Any]:
    """Compare a US stock's valuation multiples against sector and industry averages."""
    import yfinance as yf

    symbol = symbol.upper()
    key = f"us_valuation:{symbol}"

    try:
        cached_value = redis_client.get(key)
        if cached_value:
            return json.loads(str(cached_value))
    except Exception as e:
        print(f"[REDIS] Cache read error: {e}")

    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info

        company_sector = info.get('sector', 'Unknown')
        company_industry = info.get('industry', 'Unknown')

        company_multiples = {
            'pe': info.get('trailingPE'),
            'pb': info.get('priceToBook'),
            'ps': info.get('priceToSalesTrailing12Months'),
            'evEbitda': info.get('enterpriseToEbitda'),
            'dividendYield': info.get('dividendYield', 0) * 100 if info.get('dividendYield') else 0,
        }

        sector_multiples = {'pe': [], 'pb': [], 'ps': [], 'evEbitda': [], 'dividendYield': []}
        industry_multiples = {'pe': [], 'pb': [], 'ps': [], 'evEbitda': [], 'dividendYield': []}

        for stock in POPULAR_US_STOCKS:
            if stock == symbol:
                continue
            try:
                t = yf.Ticker(stock)
                t_info = t.info
                t_sector = t_info.get('sector', '')
                t_industry = t_info.get('industry', '')

                pe = t_info.get('trailingPE')
                pb = t_info.get('priceToBook')
                ps = t_info.get('priceToSalesTrailing12Months')
                ev_ebitda = t_info.get('enterpriseToEbitda')
                div_yield = t_info.get('dividendYield', 0) * 100 if t_info.get('dividendYield') else 0

                if t_sector and t_sector == company_sector:
                    if pe and 0 < pe < 200:
                        sector_multiples['pe'].append(pe)
                    if pb and 0 < pb < 50:
                        sector_multiples['pb'].append(pb)
                    if ps and 0 < ps < 50:
                        sector_multiples['ps'].append(ps)
                    if ev_ebitda and 0 < ev_ebitda < 100:
                        sector_multiples['evEbitda'].append(ev_ebitda)
                    if div_yield and div_yield > 0:
                        sector_multiples['dividendYield'].append(div_yield)

                if t_industry and t_industry == company_industry:
                    if pe and 0 < pe < 200:
                        industry_multiples['pe'].append(pe)
                    if pb and 0 < pb < 50:
                        industry_multiples['pb'].append(pb)
                    if ps and 0 < ps < 50:
                        industry_multiples['ps'].append(ps)
                    if ev_ebitda and 0 < ev_ebitda < 100:
                        industry_multiples['evEbitda'].append(ev_ebitda)
                    if div_yield and div_yield > 0:
                        industry_multiples['dividendYield'].append(div_yield)

            except Exception as e:
                print(f"[WARN] Could not fetch comparison data for {stock}: {e}")
                continue

        def calc_avg(values):
            return round(sum(values) / len(values), 2) if values else None

        sector_avg = {
            'pe': calc_avg(sector_multiples['pe']),
            'pb': calc_avg(sector_multiples['pb']),
            'ps': calc_avg(sector_multiples['ps']),
            'evEbitda': calc_avg(sector_multiples['evEbitda']),
            'dividendYield': calc_avg(sector_multiples['dividendYield']),
        }

        industry_avg = {
            'pe': calc_avg(industry_multiples['pe']),
            'pb': calc_avg(industry_multiples['pb']),
            'ps': calc_avg(industry_multiples['ps']),
            'evEbitda': calc_avg(industry_multiples['evEbitda']),
            'dividendYield': calc_avg(industry_multiples['dividendYield']),
        }

        for key_name in company_multiples:
            if company_multiples[key_name] is not None:
                company_multiples[key_name] = round(company_multiples[key_name], 2)

        result = {
            'symbol': symbol,
            'sector': company_sector,
            'industry': company_industry,
            'company': company_multiples,
            'sectorAvg': sector_avg,
            'industryAvg': industry_avg,
            'metrics': [
                {
                    'key': 'pe',
                    'label': 'P/E',
                    'description': 'Price / Earnings Ratio',
                    'company': company_multiples['pe'],
                    'sector': sector_avg['pe'],
                    'industry': industry_avg['pe'],
                },
                {
                    'key': 'pb',
                    'label': 'P/B',
                    'description': 'Price / Book Value',
                    'company': company_multiples['pb'],
                    'sector': sector_avg['pb'],
                    'industry': industry_avg['pb'],
                },
                {
                    'key': 'ps',
                    'label': 'P/S',
                    'description': 'Price / Sales Ratio',
                    'company': company_multiples['ps'],
                    'sector': sector_avg['ps'],
                    'industry': industry_avg['ps'],
                },
                {
                    'key': 'evEbitda',
                    'label': 'EV/EBITDA',
                    'description': 'Enterprise Value / EBITDA',
                    'company': company_multiples['evEbitda'],
                    'sector': sector_avg['evEbitda'],
                    'industry': industry_avg['evEbitda'],
                },
                {
                    'key': 'dividendYield',
                    'label': 'Dividend',
                    'description': 'Dividend Yield (%)',
                    'company': company_multiples['dividendYield'],
                    'sector': sector_avg['dividendYield'],
                    'industry': industry_avg['dividendYield'],
                },
            ],
            'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        }

        try:
            redis_client.setex(key, 3600, json.dumps(result))
        except Exception:
            pass

        return result
    except Exception as e:
        print(f"[ERROR] US valuation comparison error ({symbol}): {e}")
        return {}


def get_fmp_market_data(symbol: str) -> Dict[str, Any]:
    """Fetch company profile and market quote data from Financial Modeling Prep Stable API."""
    symbol = symbol.upper()
    key = f"fmp_market:{symbol}"

    try:
        cached_value = redis_client.get(key)
        if cached_value:
            return json.loads(str(cached_value))
    except Exception as e:
        print(f"[REDIS] Cache read error: {e}")

    try:
        result: Dict[str, Any] = {
            'symbol': symbol,
            'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        }

        db_profile = get_company_profile_from_db(symbol)
        if db_profile:
            result['image'] = db_profile.get('image')
            result['ceo'] = db_profile.get('ceo')
            result['description'] = db_profile.get('description')

        profile_url = f"https://financialmodelingprep.com/stable/profile?symbol={symbol}&apikey={settings.FMP_API_KEY}"
        profile_resp = requests.get(profile_url, timeout=10)

        if profile_resp.ok and profile_resp.json():
            data = profile_resp.json()
            if isinstance(data, list) and len(data) > 0:
                profile = data[0]
            else:
                profile = data if isinstance(data, dict) else {}

            if isinstance(profile, dict):
                result['volume'] = profile.get('volume')
                result['avgVolume'] = profile.get('averageVolume')
                result['changesPercentage'] = profile.get('changePercentage')
                result['change'] = profile.get('change')
                result['price'] = profile.get('price')
                result['marketCap'] = profile.get('marketCap')
                result['beta'] = profile.get('beta')
                result['lastDiv'] = profile.get('lastDividend')
                result['range'] = profile.get('range')

                result['ceo'] = profile.get('ceo')
                result['description'] = profile.get('description')
                result['image'] = profile.get('image')

                result['sector'] = profile.get('sector')
                result['industry'] = profile.get('industry')
                result['companyName'] = profile.get('companyName')
                result['exchange'] = profile.get('exchange')
                result['exchangeFullName'] = profile.get('exchangeFullName')
                result['website'] = profile.get('website')
                result['country'] = profile.get('country')
                result['city'] = profile.get('city')
                result['currency'] = profile.get('currency')
                result['isin'] = profile.get('isin')
                result['cusip'] = profile.get('cusip')
                result['cik'] = profile.get('cik')
                result['isEtf'] = profile.get('isEtf')
                result['isActivelyTrading'] = profile.get('isActivelyTrading')
                result['isAdr'] = profile.get('isAdr')
                result['isFund'] = profile.get('isFund')

                if result.get('image') or result.get('ceo') or result.get('description'):
                    save_company_profile_to_db(
                        symbol,
                        result.get('image'),
                        result.get('ceo'),
                        result.get('description')
                    )

        quote_url = f"https://financialmodelingprep.com/stable/quote?symbol={symbol}&apikey={settings.FMP_API_KEY}"
        quote_resp = requests.get(quote_url, timeout=10)

        if quote_resp.ok and quote_resp.json():
            data = quote_resp.json()
            if isinstance(data, list) and len(data) > 0:
                quote = data[0]
            else:
                quote = data if isinstance(data, dict) else {}

            if isinstance(quote, dict):
                result['dayLow'] = quote.get('dayLow')
                result['dayHigh'] = quote.get('dayHigh')
                result['yearLow'] = quote.get('yearLow')
                result['yearHigh'] = quote.get('yearHigh')
                result['priceAvg50'] = quote.get('priceAvg50')
                result['priceAvg200'] = quote.get('priceAvg200')
                result['pe'] = quote.get('pe')
                result['eps'] = quote.get('eps')
                result['open'] = quote.get('open')
                result['previousClose'] = quote.get('previousClose')
                result['sharesOutstanding'] = quote.get('sharesOutstanding')
                if quote.get('volume'):
                    result['volume'] = quote.get('volume')
                if quote.get('avgVolume'):
                    result['avgVolume'] = quote.get('avgVolume')

        day_high = result.get('dayHigh')
        day_low = result.get('dayLow')
        price = result.get('price')
        if day_high and day_low and price and isinstance(day_high, (int, float)) and isinstance(day_low, (int, float)) and isinstance(price, (int, float)):
            result['vwap'] = round((day_high + day_low + price) / 3, 2)

        try:
            redis_client.setex(key, 300, json.dumps(result))
        except Exception:
            pass

        return result
    except Exception as e:
        print(f"[ERROR] FMP market data error ({symbol}): {e}")
        import traceback
        traceback.print_exc()
        return {}


def get_fmp_financial_statements(symbol: str) -> Dict[str, Any]:
    """Fetch Income Statement, Balance Sheet, Cash Flow, and TTM Ratios from FMP Stable API."""
    symbol = symbol.upper()
    key = f"fmp_financials:{symbol}"

    try:
        cached_value = redis_client.get(key)
        if cached_value:
            return json.loads(str(cached_value))
    except Exception as e:
        print(f"[REDIS] Cache read error: {e}")

    try:
        result: Dict[str, Any] = {
            'symbol': symbol,
            'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        }

        income_url = f"https://financialmodelingprep.com/stable/income-statement?symbol={symbol}&limit=1&apikey={settings.FMP_API_KEY}"
        income_resp = requests.get(income_url, timeout=10)

        if income_resp.ok and income_resp.json():
            data = income_resp.json()
            if isinstance(data, list) and len(data) > 0:
                income = data[0]
            else:
                income = data if isinstance(data, dict) else {}

            if isinstance(income, dict):
                result['revenue'] = income.get('revenue')
                result['grossProfit'] = income.get('grossProfit')
                result['grossProfitRatio'] = income.get('grossProfitRatio')
                result['operatingIncome'] = income.get('operatingIncome')
                result['operatingIncomeRatio'] = income.get('operatingIncomeRatio')
                result['netIncome'] = income.get('netIncome')
                result['netIncomeRatio'] = income.get('netIncomeRatio')
                result['ebitda'] = income.get('ebitda')
                result['ebitdaratio'] = income.get('ebitdaratio')
                result['eps'] = income.get('eps')
                result['epsdiluted'] = income.get('epsdiluted')
                result['costOfRevenue'] = income.get('costOfRevenue')
                result['researchAndDevelopmentExpenses'] = income.get('researchAndDevelopmentExpenses')
                result['incomeBeforeTax'] = income.get('incomeBeforeTax')
                result['incomeTaxExpense'] = income.get('incomeTaxExpense')
                result['filingDate'] = income.get('date')
                result['period'] = income.get('period')

        balance_url = f"https://financialmodelingprep.com/stable/balance-sheet-statement?symbol={symbol}&limit=1&apikey={settings.FMP_API_KEY}"
        balance_resp = requests.get(balance_url, timeout=10)

        if balance_resp.ok and balance_resp.json():
            data = balance_resp.json()
            if isinstance(data, list) and len(data) > 0:
                balance = data[0]
            else:
                balance = data if isinstance(data, dict) else {}

            if isinstance(balance, dict):
                result['totalAssets'] = balance.get('totalAssets')
                result['totalLiabilities'] = balance.get('totalLiabilities')
                result['totalEquity'] = balance.get('totalStockholdersEquity')
                result['cashAndCashEquivalents'] = balance.get('cashAndCashEquivalents')
                result['shortTermInvestments'] = balance.get('shortTermInvestments')
                result['netReceivables'] = balance.get('netReceivables')
                result['inventory'] = balance.get('inventory')
                result['totalCurrentAssets'] = balance.get('totalCurrentAssets')
                result['totalCurrentLiabilities'] = balance.get('totalCurrentLiabilities')
                result['longTermDebt'] = balance.get('longTermDebt')
                result['shortTermDebt'] = balance.get('shortTermDebt')
                result['totalDebt'] = balance.get('totalDebt')
                result['retainedEarnings'] = balance.get('retainedEarnings')
                result['commonStock'] = balance.get('commonStock')
                result['goodwill'] = balance.get('goodwill')
                result['intangibleAssets'] = balance.get('intangibleAssets')
                result['propertyPlantEquipmentNet'] = balance.get('propertyPlantEquipmentNet')

        cashflow_url = f"https://financialmodelingprep.com/stable/cash-flow-statement?symbol={symbol}&limit=1&apikey={settings.FMP_API_KEY}"
        cashflow_resp = requests.get(cashflow_url, timeout=10)

        if cashflow_resp.ok and cashflow_resp.json():
            data = cashflow_resp.json()
            if isinstance(data, list) and len(data) > 0:
                cashflow = data[0]
            else:
                cashflow = data if isinstance(data, dict) else {}

            if isinstance(cashflow, dict):
                result['operatingCashFlow'] = cashflow.get('operatingCashFlow')
                result['freeCashFlow'] = cashflow.get('freeCashFlow')
                result['capitalExpenditure'] = cashflow.get('capitalExpenditure')
                result['dividendsPaid'] = cashflow.get('dividendsPaid')
                result['netCashProvidedByOperatingActivities'] = cashflow.get('netCashProvidedByOperatingActivities')
                result['netCashUsedForInvestingActivites'] = cashflow.get('netCashUsedForInvestingActivites')
                result['netCashUsedProvidedByFinancingActivities'] = cashflow.get('netCashUsedProvidedByFinancingActivities')
                result['stockBasedCompensation'] = cashflow.get('stockBasedCompensation')
                result['commonStockRepurchased'] = cashflow.get('commonStockRepurchased')
                result['debtRepayment'] = cashflow.get('debtRepayment')

        ratios_url = f"https://financialmodelingprep.com/stable/ratios-ttm?symbol={symbol}&apikey={settings.FMP_API_KEY}"
        ratios_resp = requests.get(ratios_url, timeout=10)

        if ratios_resp.ok and ratios_resp.json():
            data = ratios_resp.json()
            if isinstance(data, list) and len(data) > 0:
                ratios = data[0]
            else:
                ratios = data if isinstance(data, dict) else {}

            if isinstance(ratios, dict):
                result['grossMargin'] = ratios.get('grossProfitMarginTTM')
                result['operatingMargin'] = ratios.get('operatingProfitMarginTTM')
                result['netProfitMargin'] = ratios.get('netProfitMarginTTM')
                result['quickRatio'] = ratios.get('quickRatioTTM')
                result['currentRatio'] = ratios.get('currentRatioTTM')
                result['debtEquityRatio'] = ratios.get('debtEquityRatioTTM')
                result['returnOnEquity'] = ratios.get('returnOnEquityTTM')
                result['returnOnAssets'] = ratios.get('returnOnAssetsTTM')
                result['returnOnCapitalEmployed'] = ratios.get('returnOnCapitalEmployedTTM')
                result['priceToBookRatio'] = ratios.get('priceToBookRatioTTM')
                result['priceToSalesRatio'] = ratios.get('priceToSalesRatioTTM')
                result['priceEarningsRatio'] = ratios.get('priceEarningsRatioTTM')
                result['priceToFreeCashFlowsRatio'] = ratios.get('priceToFreeCashFlowsRatioTTM')
                result['enterpriseValueMultiple'] = ratios.get('enterpriseValueMultipleTTM')
                result['dividendYield'] = ratios.get('dividendYieldTTM')
                result['payoutRatio'] = ratios.get('payoutRatioTTM')

        try:
            redis_client.setex(key, 3600, json.dumps(result))
        except Exception:
            pass

        return result
    except Exception as e:
        print(f"[ERROR] FMP financial statements error ({symbol}): {e}")
        import traceback
        traceback.print_exc()
        return {}


def get_fmp_insider_trading(symbol: str) -> List[Dict[str, Any]]:
    """Fetch recent insider trading transactions from Financial Modeling Prep Stable API."""
    symbol = symbol.upper()
    key = f"fmp_insider:{symbol}"

    try:
        cached_value = redis_client.get(key)
        if cached_value:
            return json.loads(str(cached_value))
    except Exception as e:
        print(f"[REDIS] Cache read error: {e}")

    try:
        url = f"https://financialmodelingprep.com/stable/insider-trading?symbol={symbol}&limit=10&apikey={settings.FMP_API_KEY}"
        resp = requests.get(url, timeout=10)

        if resp.ok and resp.json():
            insider_data = resp.json()
            result = []
            for trade in insider_data:
                result.append({
                    'reportingName': trade.get('reportingName'),
                    'transactionType': trade.get('transactionType'),
                    'securitiesTransacted': trade.get('securitiesTransacted'),
                    'price': trade.get('price'),
                    'transactionDate': trade.get('transactionDate'),
                    'securityName': trade.get('securityName'),
                    'reportingCik': trade.get('reportingCik'),
                    'typeOfOwner': trade.get('typeOfOwner'),
                    'acquistionOrDisposition': trade.get('acquistionOrDisposition'),
                    'formType': trade.get('formType'),
                    'link': trade.get('link')
                })

            try:
                redis_client.setex(key, 1800, json.dumps(result))
            except Exception:
                pass

            return result
        return []
    except Exception as e:
        print(f"[ERROR] FMP insider trading error ({symbol}): {e}")
        import traceback
        traceback.print_exc()
        return []


def get_financial_health(symbol: str) -> Dict[str, Any]:
    """
    Calculate normalized 0-5 Financial Health Radar scores across 5 axes:
    Efficiency, Liquidity, Leverage, Profitability, and Growth.
    """
    symbol = symbol.upper()
    key = f"financial_health:{symbol}"

    market_status = is_us_market_open()
    is_market_open = market_status.get('is_open', False)

    et_tz = pytz.timezone('US/Eastern')
    today_str = datetime.now(et_tz).strftime('%Y-%m-%d')

    if not is_market_open:
        try:
            db_data = get_financial_health_from_db(symbol)
            if db_data:
                return db_data
        except Exception as e:
            print(f"[DB ERROR] Financial health DB read error: {e}")

    try:
        cached_value = redis_client.get(key)
        if cached_value:
            return json.loads(cached_value)
    except Exception as e:
        print(f"[REDIS] Cache read error: {e}")

    try:
        result = {
            'symbol': symbol,
            'efficiency': {'raw': None, 'score': 2.5},
            'liquidity': {'raw': None, 'score': 2.5},
            'leverage': {'raw': None, 'score': 2.5},
            'profitability': {'raw': None, 'score': 2.5},
            'growth': {'raw': None, 'score': 2.5},
        }

        ratios_url = f"https://financialmodelingprep.com/stable/ratios-ttm?symbol={symbol}&apikey={settings.FMP_API_KEY}"
        ratios_resp = requests.get(ratios_url, timeout=10)

        if ratios_resp.ok and ratios_resp.json():
            data = ratios_resp.json()
            if isinstance(data, list) and len(data) > 0:
                ratios = data[0]
            else:
                ratios = data if isinstance(data, dict) else {}

            # Efficiency: Asset Turnover
            asset_turnover = ratios.get('assetTurnoverTTM')
            if asset_turnover is not None:
                result['efficiency']['raw'] = round(asset_turnover, 2)
                if asset_turnover >= 1.5:
                    result['efficiency']['score'] = 5.0
                elif asset_turnover <= 0.4:
                    result['efficiency']['score'] = 1.0
                else:
                    result['efficiency']['score'] = round(1.0 + (asset_turnover - 0.4) * (4.0 / 1.1), 2)

            # Liquidity: Current Ratio
            current_ratio = ratios.get('currentRatioTTM')
            if current_ratio is not None:
                result['liquidity']['raw'] = round(current_ratio, 2)
                if current_ratio >= 2.0:
                    result['liquidity']['score'] = 5.0
                elif current_ratio <= 0.8:
                    result['liquidity']['score'] = 1.0
                else:
                    result['liquidity']['score'] = round(1.0 + (current_ratio - 0.8) * (4.0 / 1.2), 2)

            # Leverage: Debt to Equity (Lower is better)
            debt_equity = ratios.get('debtToEquityRatioTTM')
            if debt_equity is not None:
                result['leverage']['raw'] = round(debt_equity, 2)
                if debt_equity <= 0.5:
                    result['leverage']['score'] = 5.0
                elif debt_equity >= 2.5:
                    result['leverage']['score'] = 1.0
                else:
                    result['leverage']['score'] = round(5.0 - (debt_equity - 0.5) * (4.0 / 2.0), 2)

            # Profitability: Net Profit Margin
            net_margin = ratios.get('netProfitMarginTTM')
            if net_margin is not None:
                result['profitability']['raw'] = round(net_margin * 100, 2)
                if net_margin >= 0.20:
                    result['profitability']['score'] = 5.0
                elif net_margin <= 0:
                    result['profitability']['score'] = 1.0
                else:
                    result['profitability']['score'] = round(1.0 + (net_margin / 0.20) * 4.0, 2)

        growth_url = f"https://financialmodelingprep.com/stable/financial-growth?symbol={symbol}&limit=1&apikey={settings.FMP_API_KEY}"
        growth_resp = requests.get(growth_url, timeout=10)

        if growth_resp.ok and growth_resp.json():
            data = growth_resp.json()
            if isinstance(data, list) and len(data) > 0:
                growth = data[0]
            else:
                growth = data if isinstance(data, dict) else {}

            revenue_growth = growth.get('revenueGrowth')
            if revenue_growth is not None:
                result['growth']['raw'] = round(revenue_growth * 100, 2)
                if revenue_growth >= 0.15:
                    result['growth']['score'] = 5.0
                elif revenue_growth <= 0:
                    result['growth']['score'] = 1.0
                else:
                    result['growth']['score'] = round(1.0 + (revenue_growth / 0.15) * 4.0, 2)

        try:
            save_financial_health_to_db(symbol, result, today_str)
        except Exception as e:
            print(f"[DB ERROR] Financial health DB save error: {e}")

        try:
            redis_client.setex(key, 7200, json.dumps(result))
        except Exception:
            pass

        return result
    except Exception as e:
        print(f"[ERROR] Financial health error ({symbol}): {e}")
        import traceback
        traceback.print_exc()
        return {
            'symbol': symbol,
            'efficiency': {'raw': None, 'score': 2.5},
            'liquidity': {'raw': None, 'score': 2.5},
            'leverage': {'raw': None, 'score': 2.5},
            'profitability': {'raw': None, 'score': 2.5},
            'growth': {'raw': None, 'score': 2.5},
        }
