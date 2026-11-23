import time
import requests
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from BACKEND.database import execute_sql_modification
from BACKEND.config import settings

# MAG7 symbols
MAG7 = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA"]

FMP_API_KEY = settings.FMP_API_KEY


def ensure_table() -> None:
    pass


def _parse_segments_payload(payload: Dict, seg_type: str) -> List[Tuple[str, str, str, str, float, str]]:
    """
    Normalize FMP segmentation payload into rows matching table schema.
    Returns list of tuples: (Symbol, PeriodDate, SegmentType, SegmentName, RevenueAmount, Currency)
    """
    rows: List[Tuple[str, str, str, str, float, str]] = []
    symbol = payload.get("symbol") or payload.get("Symbol") or payload.get("ticker")
    currency = payload.get("currency", "USD")
    data = payload.get("data") or payload.get("historical") or []

    for item in data:
        date_val = item.get("date") or item.get("period") or item.get("calendarYear")
        if isinstance(date_val, (int, float)):
            period_date = f"{int(date_val)}-12-31"
        else:
            try:
                period_date = datetime.fromisoformat(str(date_val)[:10]).strftime("%Y-%m-%d")
            except Exception:
                cy = item.get("calendarYear")
                period_date = f"{cy}-12-31" if cy else datetime.now().strftime("%Y-%m-%d")

        collections = (
            item.get("products") or item.get("product") or item.get("segments") or item.get("geographic") or item.get("geography") or []
        )
        for seg in collections:
            name = (
                seg.get("name")
                or seg.get("title")
                or seg.get("segment")
                or seg.get("product")
                or seg.get("geography")
                or seg.get("region")
                or "Unknown"
            )
            revenue = seg.get("revenue")
            if revenue is None:
                revenue = seg.get("value") or seg.get("amount") or seg.get("sales")
            try:
                amount = float(revenue)
            except Exception:
                try:
                    amount = float(str(revenue).replace(",", ""))
                except Exception:
                    amount = 0.0
            rows.append((symbol, period_date, seg_type, name, round(amount, 2), currency))

    return rows


def fetch_fmp_segments(symbol: str, seg_type: str, api_key: str, retries: int = 2) -> List[Tuple[str, str, str, str, float, str]]:
    assert seg_type in ("product", "geographic")
    base = "https://financialmodelingprep.com/api/v4"
    endpoint = (
        f"{base}/revenue-product-segmentation?symbol={symbol}&period=annual&apikey={api_key}"
        if seg_type == "product"
        else f"{base}/revenue-geographic-segmentation?symbol={symbol}&period=annual&apikey={api_key}"
    )

    for attempt in range(retries):
        try:
            r = requests.get(endpoint, timeout=30)
            if r.status_code == 429:
                wait_time = 2 ** attempt
                print(f"  ! Rate limited for {symbol} ({seg_type}), waiting {wait_time}s...")
                time.sleep(wait_time)
                continue
            r.raise_for_status()
            js = r.json()

            if isinstance(js, dict):
                payloads = [js]
            elif isinstance(js, list):
                payloads = js
            else:
                payloads = []

            rows: List[Tuple[str, str, str, str, float, str]] = []
            for payload in payloads:
                rows.extend(_parse_segments_payload(payload, seg_type))
            return rows
        except requests.RequestException as e:
            if attempt < retries - 1:
                wait_time = 2 ** attempt
                print(f"  ! Retry {attempt + 1}/{retries} for {symbol} ({seg_type}) in {wait_time}s: {e}")
                time.sleep(wait_time)
            else:
                print(f"  ! Failed to fetch {symbol} ({seg_type}) after {retries} retries: {e}")
                return []
    return []


def upsert_segments(rows: List[Tuple[str, str, str, str, float, str]]) -> int:
    """Upsert all rows using PostgreSQL ON CONFLICT."""
    if not rows:
        return 0
    affected = 0

    for row in rows:
        symbol, p_date, s_type, s_name, amount, curr = row

        insert_query = """
            INSERT INTO companyrevenuesegments (symbol, perioddate, segmenttype, segmentname, revenueamount, currency)
            VALUES (:symbol, :p_date, :s_type, :s_name, :amount, :curr)
            ON CONFLICT (symbol, perioddate, segmenttype, segmentname) 
            DO UPDATE SET 
                revenueamount = EXCLUDED.revenueamount,
                currency = EXCLUDED.currency,
                createdat = NOW()
        """

        params = {
            "symbol": symbol,
            "p_date": p_date,
            "s_type": s_type,
            "s_name": s_name,
            "amount": amount,
            "curr": curr
        }

        if execute_sql_modification(insert_query, params):
            affected += 1

    return affected


def run_mag7_fetch(symbols: Optional[List[str]] = None) -> Dict[str, int]:
    """Fetch and upsert MAG7 revenue segments."""
    symbols = symbols or MAG7
    stats = {"total": 0, "succeeded": 0, "failed": 0, "errors": []}

    print(f"\n[FMP] Starting segmentation fetch for {len(symbols)} symbols...")
    for idx, sym in enumerate(symbols, 1):
        print(f"[{idx}/{len(symbols)}] {sym}...")
        try:
            prod_rows = fetch_fmp_segments(sym, "product", FMP_API_KEY)
            geo_rows = fetch_fmp_segments(sym, "geographic", FMP_API_KEY)

            all_rows = prod_rows + geo_rows
            if not all_rows:
                print(f"  -> No data found for {sym}")
                stats["failed"] += 1
                stats["errors"].append(f"{sym}: No segments data")
                continue

            inserted = upsert_segments(all_rows)
            stats["total"] += inserted
            stats["succeeded"] += 1
            print(f"  -> Upserted {len(all_rows)} segments")

            if idx < len(symbols):
                time.sleep(0.5)
        except Exception as e:
            stats["failed"] += 1
            err_msg = f"{sym}: {str(e)}"
            stats["errors"].append(err_msg)
            print(f"  ! Error: {err_msg}")

    print(f"\n[SUMMARY] Total: {stats['total']} | Succeeded: {stats['succeeded']} | Failed: {stats['failed']}")
    if stats["errors"]:
        print("[ERRORS]:")
        for err in stats["errors"]:
            print(f"  - {err}")
    return stats
