import pathlib
import urllib.parse
from typing import Union
import pandas as pd
from pandas import DataFrame
from sqlalchemy import create_engine, text
from BACKEND.config import settings

# Global engine cache for a shared connection pool
_engine_cache = None


def get_data():
    global _engine_cache

    if _engine_cache is not None:
        try:
            with _engine_cache.connect() as conn:
                conn.execute(text("SELECT 1"))
            return _engine_cache
        except Exception:
            print("[DB] Connection lost, reconnecting...")
            _engine_cache = None

    database = settings.DB_NAME
    user = settings.DB_USER
    password = settings.DB_PASSWORD
    host = settings.DB_HOST
    port = settings.DB_PORT

    encoded_user = urllib.parse.quote_plus(user)
    encoded_password = urllib.parse.quote_plus(password)
    conn_str = f"postgresql+psycopg2://{encoded_user}:{encoded_password}@{host}:{port}/{database}"

    try:
        engine = create_engine(
            conn_str,
            pool_pre_ping=True,
            pool_recycle=300,
            pool_size=5,
            max_overflow=10
        )
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
            _engine_cache = engine
            return engine
    except Exception as e:
        print(f"PostgreSQL connection failed: {e}")
        raise e


def _reset_engine_cache():
    """Reset the connection pool cache on connection failure."""
    global _engine_cache
    _engine_cache = None


def init_db() -> bool:
    """Initialize all PostgreSQL tables automatically from scripts/schema_postgres.sql."""
    try:
        engine = get_data()
        schema_path = pathlib.Path(__file__).resolve().parent.parent / "scripts" / "schema_postgres.sql"
        if schema_path.exists():
            sql_script = schema_path.read_text(encoding="utf-8")
            with engine.connect() as connection:
                connection.execute(text(sql_script))
                connection.commit()
        ensure_symbol_logos_table()
        ensure_company_profiles_table()
        ensure_chart_drawings_table()
        print("[DB] PostgreSQL database schema initialized successfully.")
        return True
    except Exception as e:
        print(f"[DB ERROR] init_db failed: {e}")
        return False


def execute_sql_query(query: str, retry=True) -> Union[None, DataFrame]:
    global _engine_cache
    try:
        engine = get_data()
        return pd.read_sql_query(query, engine)
    except Exception as e:
        if retry and ("connection" in str(e).lower() or "ssl" in str(e).lower() or "eof" in str(e).lower()):
            print("[SQL] Connection error, retrying...")
            _engine_cache = None
            try:
                engine = get_data()
                return pd.read_sql_query(query, engine)
            except Exception as e2:
                print(f"[SQL ERROR] Query failed after retry: {query}\nError: {e2}")
                return None
        print(f"[SQL ERROR] Query failed: {query}\nError: {e}")
        return None


def execute_sql_query_scalar(query, retry=True):
    global _engine_cache
    try:
        engine = get_data()
        with engine.connect() as connection:
            result = connection.execute(text(query))
            row = result.fetchone()
            return row[0] if row else None
    except Exception as e:
        if retry and ("connection" in str(e).lower() or "ssl" in str(e).lower() or "eof" in str(e).lower()):
            _engine_cache = None
            try:
                engine = get_data()
                with engine.connect() as connection:
                    result = connection.execute(text(query))
                    row = result.fetchone()
                    return row[0] if row else None
            except Exception:
                return None
        return None


def execute_sql_modification(query, params=None, retry=True):
    global _engine_cache
    try:
        engine = get_data()
        with engine.connect() as connection:
            sq = query if not isinstance(query, str) else text(query)
            connection.execute(sq, params or {})
            connection.commit()
        return True
    except Exception as e:
        if retry and ("connection" in str(e).lower() or "ssl" in str(e).lower() or "eof" in str(e).lower()):
            print("[SQL] Connection error, retrying modification...")
            _engine_cache = None
            try:
                engine = get_data()
                with engine.connect() as connection:
                    sq = query if not isinstance(query, str) else text(query)
                    connection.execute(sq, params or {})
                    connection.commit()
                return True
            except Exception as e2:
                print(f"[SQL ERROR] Modification failed after retry: {query}\nError: {e2}")
                return False
        print(f"[SQL ERROR] Modification failed: {query}\nError: {e}")
        return False


def sql_table_data(table_name):
    query = f'SELECT * FROM "{table_name}"'
    return execute_sql_query(query)


class FintechRSSDatabase:
    def __init__(self, server=None, database=None):
        self.server = server or settings.DB_HOST
        self.database = database or settings.DB_NAME
        self.engine = None

    def connect(self):
        try:
            self.engine = get_data()
            return True
        except Exception:
            return False


# =====================================================
# Financial Metrics Database Functions
# =====================================================

def get_financial_metrics_from_db(symbol: str) -> dict:
    """Fetch cached financial metrics for a symbol from PostgreSQL."""
    symbol = symbol.upper()
    query = f"""
    SELECT 
        symbol, lastupdated, tradingday,
        trailingpe, forwardpe, pricetobook, pricetosales, beta, trailingeps,
        dividendyield, dividendrate,
        fiftytwoweekhi, fiftytwoweeklow, fiftydayaverage, twohundreddayaverage, marketcap,
        profitmargins, operatingmargins, returnonassets, returnonequity,
        revenuegrowth, earningsgrowth,
        currentratio, debttoequity,
        heldpercentinstitutions,
        revenue, netincome, ebitda, grossprofit, operatingincome, grossmargin,
        totalassets, totalliabilities, totalequity, cashandcashequivalents,
        operatingcashflow, freecashflow
    FROM financialmetrics 
    WHERE symbol = '{symbol}'
    """

    try:
        df = execute_sql_query(query)
        if df is not None and not df.empty:
            row = df.iloc[0]
            return {
                'symbol': row['symbol'],
                'last_updated': row['lastupdated'],
                'trading_day': row['tradingday'],
                'trailingPE': float(row['trailingpe']) if pd.notna(row['trailingpe']) else None,
                'forwardPE': float(row['forwardpe']) if pd.notna(row['forwardpe']) else None,
                'priceToBook': float(row['pricetobook']) if pd.notna(row['pricetobook']) else None,
                'priceToSalesTrailing12Months': float(row['pricetosales']) if pd.notna(row['pricetosales']) else None,
                'beta': float(row['beta']) if pd.notna(row['beta']) else None,
                'trailingEps': float(row['trailingeps']) if pd.notna(row['trailingeps']) else None,
                'dividendYield': float(row['dividendyield']) if pd.notna(row['dividendyield']) else None,
                'dividendRate': float(row['dividendrate']) if pd.notna(row['dividendrate']) else None,
                'fiftyTwoWeekHigh': float(row['fiftytwoweekhi']) if pd.notna(row['fiftytwoweekhi']) else None,
                'fiftyTwoWeekLow': float(row['fiftytwoweeklow']) if pd.notna(row['fiftytwoweeklow']) else None,
                'fiftyDayAverage': float(row['fiftydayaverage']) if pd.notna(row['fiftydayaverage']) else None,
                'twoHundredDayAverage': float(row['twohundreddayaverage']) if pd.notna(row['twohundreddayaverage']) else None,
                'marketCap': float(row['marketcap']) if pd.notna(row['marketcap']) else None,
                'profitMargins': float(row['profitmargins']) if pd.notna(row['profitmargins']) else None,
                'operatingMargins': float(row['operatingmargins']) if pd.notna(row['operatingmargins']) else None,
                'returnOnAssets': float(row['returnonassets']) if pd.notna(row['returnonassets']) else None,
                'returnOnEquity': float(row['returnonequity']) if pd.notna(row['returnonequity']) else None,
                'revenueGrowth': float(row['revenuegrowth']) if pd.notna(row['revenuegrowth']) else None,
                'earningsGrowth': float(row['earningsgrowth']) if pd.notna(row['earningsgrowth']) else None,
                'currentRatio': float(row['currentratio']) if pd.notna(row['currentratio']) else None,
                'debtToEquity': float(row['debttoequity']) if pd.notna(row['debttoequity']) else None,
                'heldPercentInstitutions': float(row['heldpercentinstitutions']) if pd.notna(row['heldpercentinstitutions']) else None,
                'revenue': float(row['revenue']) if pd.notna(row['revenue']) else None,
                'netIncome': float(row['netincome']) if pd.notna(row['netincome']) else None,
                'ebitda': float(row['ebitda']) if pd.notna(row['ebitda']) else None,
                'grossProfit': float(row['grossprofit']) if pd.notna(row['grossprofit']) else None,
                'operatingIncome': float(row['operatingincome']) if pd.notna(row['operatingincome']) else None,
                'grossMargin': float(row['grossmargin']) if pd.notna(row['grossmargin']) else None,
                'totalAssets': float(row['totalassets']) if pd.notna(row['totalassets']) else None,
                'totalLiabilities': float(row['totalliabilities']) if pd.notna(row['totalliabilities']) else None,
                'totalEquity': float(row['totalequity']) if pd.notna(row['totalequity']) else None,
                'cashAndCashEquivalents': float(row['cashandcashequivalents']) if pd.notna(row['cashandcashequivalents']) else None,
                'operatingCashFlow': float(row['operatingcashflow']) if pd.notna(row['operatingcashflow']) else None,
                'freeCashFlow': float(row['freecashflow']) if pd.notna(row['freecashflow']) else None,
            }
        return None
    except Exception as e:
        print(f"[DB ERROR] get_financial_metrics_from_db({symbol}): {e}")
        return None


def save_financial_metrics_to_db(symbol: str, yfinance_data: dict, fmp_data: dict, trading_day: str) -> bool:
    """Save or update financial metrics for a symbol in PostgreSQL."""
    symbol = symbol.upper()

    def safe_val(data, key, default=None):
        if data is None:
            return default
        val = data.get(key)
        if val is None or (isinstance(val, float) and (val != val)):
            return default
        return val

    check_result = check_financial_metrics_exists(symbol)

    try:
        engine = get_data()

        params = {
            'trailingPE': safe_val(yfinance_data, 'trailingPE'),
            'forwardPE': safe_val(yfinance_data, 'forwardPE'),
            'priceToBook': safe_val(yfinance_data, 'priceToBook'),
            'priceToSales': safe_val(yfinance_data, 'priceToSalesTrailing12Months'),
            'beta': safe_val(yfinance_data, 'beta'),
            'trailingEps': safe_val(yfinance_data, 'trailingEps'),
            'dividendYield': safe_val(yfinance_data, 'dividendYield'),
            'dividendRate': safe_val(yfinance_data, 'dividendRate'),
            'fiftyTwoWeekHigh': safe_val(yfinance_data, 'fiftyTwoWeekHigh'),
            'fiftyTwoWeekLow': safe_val(yfinance_data, 'fiftyTwoWeekLow'),
            'fiftyDayAverage': safe_val(yfinance_data, 'fiftyDayAverage'),
            'twoHundredDayAverage': safe_val(yfinance_data, 'twoHundredDayAverage'),
            'marketCap': safe_val(yfinance_data, 'marketCap'),
            'profitMargins': safe_val(yfinance_data, 'profitMargins'),
            'operatingMargins': safe_val(yfinance_data, 'operatingMargins'),
            'returnOnAssets': safe_val(yfinance_data, 'returnOnAssets'),
            'returnOnEquity': safe_val(yfinance_data, 'returnOnEquity'),
            'revenueGrowth': safe_val(yfinance_data, 'revenueGrowth'),
            'earningsGrowth': safe_val(yfinance_data, 'earningsGrowth'),
            'currentRatio': safe_val(yfinance_data, 'currentRatio'),
            'debtToEquity': safe_val(yfinance_data, 'debtToEquity'),
            'heldPercentInstitutions': safe_val(yfinance_data, 'heldPercentInstitutions'),
            'revenue': safe_val(fmp_data, 'revenue'),
            'netIncome': safe_val(fmp_data, 'netIncome'),
            'ebitda': safe_val(fmp_data, 'ebitda'),
            'grossProfit': safe_val(fmp_data, 'grossProfit'),
            'operatingIncome': safe_val(fmp_data, 'operatingIncome'),
            'grossMargin': safe_val(fmp_data, 'grossMargin'),
            'totalAssets': safe_val(fmp_data, 'totalAssets'),
            'totalLiabilities': safe_val(fmp_data, 'totalLiabilities'),
            'totalEquity': safe_val(fmp_data, 'totalEquity'),
            'cashAndCashEquivalents': safe_val(fmp_data, 'cashAndCashEquivalents'),
            'operatingCashFlow': safe_val(fmp_data, 'operatingCashFlow'),
            'freeCashFlow': safe_val(fmp_data, 'freeCashFlow'),
        }

        with engine.connect() as connection:
            if check_result['exists']:
                query = text("""
                    UPDATE financialmetrics SET
                        lastupdated = NOW(),
                        tradingday = :trading_day,
                        trailingpe = :trailingPE,
                        forwardpe = :forwardPE,
                        pricetobook = :priceToBook,
                        pricetosales = :priceToSales,
                        beta = :beta,
                        trailingeps = :trailingEps,
                        dividendyield = :dividendYield,
                        dividendrate = :dividendRate,
                        fiftytwoweekhi = :fiftyTwoWeekHigh,
                        fiftytwoweeklow = :fiftyTwoWeekLow,
                        fiftydayaverage = :fiftyDayAverage,
                        twohundreddayaverage = :twoHundredDayAverage,
                        marketcap = :marketCap,
                        profitmargins = :profitMargins,
                        operatingmargins = :operatingMargins,
                        returnonassets = :returnOnAssets,
                        returnonequity = :returnOnEquity,
                        revenuegrowth = :revenueGrowth,
                        earningsgrowth = :earningsGrowth,
                        currentratio = :currentRatio,
                        debttoequity = :debtToEquity,
                        heldpercentinstitutions = :heldPercentInstitutions,
                        revenue = :revenue,
                        netincome = :netIncome,
                        ebitda = :ebitda,
                        grossprofit = :grossProfit,
                        operatingincome = :operatingIncome,
                        grossmargin = :grossMargin,
                        totalassets = :totalAssets,
                        totalliabilities = :totalLiabilities,
                        totalequity = :totalEquity,
                        cashandcashequivalents = :cashAndCashEquivalents,
                        operatingcashflow = :operatingCashFlow,
                        freecashflow = :freeCashFlow
                    WHERE symbol = :symbol
                """)
                params['symbol'] = symbol
                params['trading_day'] = trading_day
            else:
                query = text("""
                    INSERT INTO financialmetrics (
                        symbol, tradingday,
                        trailingpe, forwardpe, pricetobook, pricetosales, beta, trailingeps,
                        dividendyield, dividendrate,
                        fiftytwoweekhi, fiftytwoweeklow, fiftydayaverage, twohundreddayaverage, marketcap,
                        profitmargins, operatingmargins, returnonassets, returnonequity,
                        revenuegrowth, earningsgrowth,
                        currentratio, debttoequity,
                        heldpercentinstitutions,
                        revenue, netincome, ebitda, grossprofit, operatingincome, grossmargin,
                        totalassets, totalliabilities, totalequity, cashandcashequivalents,
                        operatingcashflow, freecashflow
                    )
                    VALUES (
                        :symbol, :trading_day,
                        :trailingPE, :forwardPE, :priceToBook, :priceToSales, :beta, :trailingEps,
                        :dividendYield, :dividendRate,
                        :fiftyTwoWeekHigh, :fiftyTwoWeekLow, :fiftyDayAverage, :twoHundredDayAverage, :marketCap,
                        :profitMargins, :operatingMargins, :returnOnAssets, :returnOnEquity,
                        :revenueGrowth, :earningsGrowth,
                        :currentRatio, :debtToEquity,
                        :heldPercentInstitutions,
                        :revenue, :netIncome, :ebitda, :grossProfit, :operatingIncome, :grossMargin,
                        :totalAssets, :totalLiabilities, :totalEquity, :cashAndCashEquivalents,
                        :operatingCashFlow, :freeCashFlow
                    )
                """)
                params['symbol'] = symbol
                params['trading_day'] = trading_day

            connection.execute(query, params)
            connection.commit()

        print(f"[DB] Financial metrics saved for {symbol}")
        return True
    except Exception as e:
        print(f"[DB ERROR] save_financial_metrics_to_db({symbol}): {e}")
        import traceback
        traceback.print_exc()
        return False


def check_financial_metrics_exists(symbol: str) -> dict:
    """Check whether financial metrics exist for a symbol and when they were last updated."""
    symbol = symbol.upper()
    query = f"""
    SELECT tradingday, lastupdated 
    FROM financialmetrics 
    WHERE symbol = '{symbol}'
    """

    try:
        df = execute_sql_query(query)
        if df is not None and not df.empty:
            row = df.iloc[0]
            return {
                'exists': True,
                'trading_day': row['tradingday'],
                'last_updated': row['lastupdated']
            }
        return {'exists': False, 'trading_day': None, 'last_updated': None}
    except Exception as e:
        print(f"[DB ERROR] check_financial_metrics_exists({symbol}): {e}")
        return {'exists': False, 'trading_day': None, 'last_updated': None}


# =====================================================
# Financial Health Database Functions
# =====================================================

def get_financial_health_from_db(symbol: str) -> dict:
    """Fetch cached Financial Health radar scores for a symbol from PostgreSQL."""
    symbol = symbol.upper()
    query = f"""
    SELECT 
        symbol, lastupdated, tradingday,
        assetturnover, currentratio, debtequityratio, netprofitmargin, revenuegrowth,
        efficiencyscore, liquidityscore, leveragescore, profitabilityscore, growthscore
    FROM financialhealth 
    WHERE symbol = '{symbol}'
    """

    try:
        df = execute_sql_query(query)
        if df is not None and not df.empty:
            row = df.iloc[0]
            return {
                'symbol': row['symbol'],
                'last_updated': row['lastupdated'],
                'trading_day': row['tradingday'],
                'efficiency': {
                    'raw': float(row['assetturnover']) if pd.notna(row['assetturnover']) else None,
                    'score': float(row['efficiencyscore']) if pd.notna(row['efficiencyscore']) else 2.5
                },
                'liquidity': {
                    'raw': float(row['currentratio']) if pd.notna(row['currentratio']) else None,
                    'score': float(row['liquidityscore']) if pd.notna(row['liquidityscore']) else 2.5
                },
                'leverage': {
                    'raw': float(row['debtequityratio']) if pd.notna(row['debtequityratio']) else None,
                    'score': float(row['leveragescore']) if pd.notna(row['leveragescore']) else 2.5
                },
                'profitability': {
                    'raw': float(row['netprofitmargin']) if pd.notna(row['netprofitmargin']) else None,
                    'score': float(row['profitabilityscore']) if pd.notna(row['profitabilityscore']) else 2.5
                },
                'growth': {
                    'raw': float(row['revenuegrowth']) if pd.notna(row['revenuegrowth']) else None,
                    'score': float(row['growthscore']) if pd.notna(row['growthscore']) else 2.5
                },
            }
        return None
    except Exception as e:
        print(f"[DB ERROR] get_financial_health_from_db({symbol}): {e}")
        return None


def save_financial_health_to_db(symbol: str, health_data: dict, trading_day: str) -> bool:
    """Save or update Financial Health radar scores in PostgreSQL."""
    symbol = symbol.upper()

    def safe_get(data, key1, key2, default=None):
        try:
            val = data.get(key1, {}).get(key2)
            if val is None or (isinstance(val, float) and val != val):
                return default
            return val
        except Exception:
            return default

    check_result = check_financial_health_exists(symbol)

    try:
        engine = get_data()

        params = {
            'symbol': symbol,
            'trading_day': trading_day,
            'assetTurnover': safe_get(health_data, 'efficiency', 'raw'),
            'currentRatio': safe_get(health_data, 'liquidity', 'raw'),
            'debtEquityRatio': safe_get(health_data, 'leverage', 'raw'),
            'netProfitMargin': safe_get(health_data, 'profitability', 'raw'),
            'revenueGrowth': safe_get(health_data, 'growth', 'raw'),
            'efficiencyScore': safe_get(health_data, 'efficiency', 'score', 2.5),
            'liquidityScore': safe_get(health_data, 'liquidity', 'score', 2.5),
            'leverageScore': safe_get(health_data, 'leverage', 'score', 2.5),
            'profitabilityScore': safe_get(health_data, 'profitability', 'score', 2.5),
            'growthScore': safe_get(health_data, 'growth', 'score', 2.5),
        }

        with engine.connect() as connection:
            if check_result['exists']:
                query = text("""
                    UPDATE financialhealth SET
                        lastupdated = NOW(),
                        tradingday = :trading_day,
                        assetturnover = :assetTurnover,
                        currentratio = :currentRatio,
                        debtequityratio = :debtEquityRatio,
                        netprofitmargin = :netProfitMargin,
                        revenuegrowth = :revenueGrowth,
                        efficiencyscore = :efficiencyScore,
                        liquidityscore = :liquidityScore,
                        leveragescore = :leverageScore,
                        profitabilityscore = :profitabilityScore,
                        growthscore = :growthScore
                    WHERE symbol = :symbol
                """)
            else:
                query = text("""
                    INSERT INTO financialhealth (
                        symbol, tradingday,
                        assetturnover, currentratio, debtequityratio, netprofitmargin, revenuegrowth,
                        efficiencyscore, liquidityscore, leveragescore, profitabilityscore, growthscore
                    )
                    VALUES (
                        :symbol, :trading_day,
                        :assetTurnover, :currentRatio, :debtEquityRatio, :netProfitMargin, :revenueGrowth,
                        :efficiencyScore, :liquidityScore, :leverageScore, :profitabilityScore, :growthScore
                    )
                """)

            connection.execute(query, params)
            connection.commit()

        print(f"[DB] Financial health saved for {symbol}")
        return True
    except Exception as e:
        print(f"[DB ERROR] save_financial_health_to_db({symbol}): {e}")
        import traceback
        traceback.print_exc()
        return False


def check_financial_health_exists(symbol: str) -> dict:
    """Check whether Financial Health data exists for a symbol."""
    symbol = symbol.upper()
    query = f"""
    SELECT tradingday, lastupdated 
    FROM financialhealth 
    WHERE symbol = '{symbol}'
    """

    try:
        df = execute_sql_query(query)
        if df is not None and not df.empty:
            row = df.iloc[0]
            return {
                'exists': True,
                'trading_day': row['tradingday'],
                'last_updated': row['lastupdated']
            }
        return {'exists': False, 'trading_day': None, 'last_updated': None}
    except Exception as e:
        print(f"[DB ERROR] check_financial_health_exists({symbol}): {e}")
        return {'exists': False, 'trading_day': None, 'last_updated': None}


# =====================================================
# Symbol Logo Database Functions
# =====================================================

def ensure_symbol_logos_table():
    """Create symbollogos table if it doesn't exist."""
    try:
        engine = get_data()
        with engine.connect() as connection:
            connection.execute(text("""
                CREATE TABLE IF NOT EXISTS symbollogos (
                    id SERIAL PRIMARY KEY,
                    symbol VARCHAR(20) NOT NULL UNIQUE,
                    logo BYTEA,
                    mimetype VARCHAR(50) DEFAULT 'image/png',
                    lastupdated TIMESTAMP DEFAULT NOW()
                )
            """))
            connection.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_symbollogos_symbol ON symbollogos(symbol)
            """))
            connection.commit()
        return True
    except Exception as e:
        print(f"[DB ERROR] ensure_symbol_logos_table: {e}")
        return False


def get_symbol_logo(symbol: str) -> dict:
    """Fetch binary logo data for a symbol from PostgreSQL."""
    symbol = symbol.upper()

    try:
        engine = get_data()
        with engine.connect() as connection:
            result = connection.execute(text("""
                SELECT logo, mimetype FROM symbollogos WHERE symbol = :symbol
            """), {'symbol': symbol})
            row = result.fetchone()

            if row and row[0]:
                return {
                    'logo': bytes(row[0]),
                    'mimetype': row[1] or 'image/png'
                }
        return None
    except Exception as e:
        print(f"[DB ERROR] get_symbol_logo({symbol}): {e}")
        return None


def save_symbol_logo(symbol: str, logo_data: bytes, mimetype: str = 'image/png') -> bool:
    """Save or update binary logo data in PostgreSQL."""
    symbol = symbol.upper()

    try:
        engine = get_data()
        with engine.connect() as connection:
            result = connection.execute(text("""
                SELECT id FROM symbollogos WHERE symbol = :symbol
            """), {'symbol': symbol})
            existing = result.fetchone()

            if existing:
                connection.execute(text("""
                    UPDATE symbollogos 
                    SET logo = :logo, mimetype = :mimetype, lastupdated = NOW()
                    WHERE symbol = :symbol
                """), {'symbol': symbol, 'logo': logo_data, 'mimetype': mimetype})
            else:
                connection.execute(text("""
                    INSERT INTO symbollogos (symbol, logo, mimetype)
                    VALUES (:symbol, :logo, :mimetype)
                """), {'symbol': symbol, 'logo': logo_data, 'mimetype': mimetype})

            connection.commit()

        print(f"[DB] Symbol logo saved for {symbol}")
        return True
    except Exception as e:
        print(f"[DB ERROR] save_symbol_logo({symbol}): {e}")
        import traceback
        traceback.print_exc()
        return False


# =====================================================
# Company Profile Caching (Image, CEO, Description)
# =====================================================

def ensure_company_profiles_table():
    """Create company_profiles table if it doesn't exist."""
    try:
        engine = get_data()
        with engine.connect() as connection:
            connection.execute(text("""
                CREATE TABLE IF NOT EXISTS company_profiles (
                    symbol VARCHAR(20) PRIMARY KEY,
                    image TEXT,
                    ceo TEXT,
                    description TEXT,
                    lastupdated TIMESTAMP DEFAULT NOW()
                )
            """))
            connection.commit()
        return True
    except Exception as e:
        print(f"[DB ERROR] ensure_company_profiles_table: {e}")
        return False


def get_company_profile_from_db(symbol: str) -> dict:
    """Get company profile data (image, ceo, description) from database."""
    symbol = symbol.upper()
    try:
        engine = get_data()
        with engine.connect() as connection:
            result = connection.execute(text("""
                SELECT image, ceo, description 
                FROM company_profiles 
                WHERE symbol = :symbol
            """), {'symbol': symbol})
            row = result.fetchone()

            if row:
                return {
                    'image': row[0],
                    'ceo': row[1],
                    'description': row[2]
                }
        return None
    except Exception as e:
        print(f"[DB ERROR] get_company_profile_from_db({symbol}): {e}")
        return None


def save_company_profile_to_db(symbol: str, image: str, ceo: str, description: str) -> bool:
    """Save or update company profile data to database."""
    symbol = symbol.upper()
    try:
        ensure_company_profiles_table()

        engine = get_data()
        with engine.connect() as connection:
            result = connection.execute(text("SELECT symbol FROM company_profiles WHERE symbol = :symbol"), {'symbol': symbol})
            exists = result.fetchone()

            if exists:
                connection.execute(text("""
                    UPDATE company_profiles 
                    SET image = :image, ceo = :ceo, description = :description, lastupdated = NOW()
                    WHERE symbol = :symbol
                """), {'symbol': symbol, 'image': image, 'ceo': ceo, 'description': description})
            else:
                connection.execute(text("""
                    INSERT INTO company_profiles (symbol, image, ceo, description)
                    VALUES (:symbol, :image, :ceo, :description)
                """), {'symbol': symbol, 'image': image, 'ceo': ceo, 'description': description})

            connection.commit()
            print(f"[DB] Company profile saved for {symbol}")
            return True

    except Exception as e:
        print(f"[DB ERROR] save_company_profile_to_db({symbol}): {e}")
        return False


# =====================================================
# Chart Drawings Database Functions
# =====================================================

def ensure_chart_drawings_table():
    """Create chartdrawings table if it doesn't exist."""
    try:
        engine = get_data()
        with engine.connect() as connection:
            connection.execute(text("""
                CREATE TABLE IF NOT EXISTS chartdrawings (
                    id SERIAL PRIMARY KEY,
                    userid INTEGER NOT NULL,
                    symbol VARCHAR(20) NOT NULL,
                    drawing_type VARCHAR(20) DEFAULT 'horizontal_line',
                    price DECIMAL(18, 6) NOT NULL,
                    color VARCHAR(20) DEFAULT '#ff0033',
                    line_style VARCHAR(20) DEFAULT 'solid',
                    line_width INTEGER DEFAULT 2,
                    label VARCHAR(100),
                    createdat TIMESTAMP DEFAULT NOW()
                )
            """))
            connection.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_chartdrawings_user_symbol 
                ON chartdrawings(userid, symbol)
            """))
            connection.commit()
        return True
    except Exception as e:
        print(f"[DB ERROR] ensure_chart_drawings_table: {e}")
        return False


def get_chart_drawings(user_id: int, symbol: str) -> list:
    """Retrieve saved chart drawings for a user and symbol."""
    symbol = symbol.upper()
    try:
        engine = get_data()
        with engine.connect() as connection:
            result = connection.execute(text("""
                SELECT id, drawing_type, price, color, line_style, line_width, label, createdat
                FROM chartdrawings
                WHERE userid = :user_id AND symbol = :symbol
                ORDER BY createdat ASC
            """), {'user_id': user_id, 'symbol': symbol})

            drawings = []
            for row in result.fetchall():
                drawings.append({
                    'id': row[0],
                    'drawing_type': row[1],
                    'price': float(row[2]),
                    'color': row[3],
                    'line_style': row[4],
                    'line_width': row[5],
                    'label': row[6],
                    'created_at': str(row[7]) if row[7] else None
                })
            return drawings
    except Exception as e:
        print(f"[DB ERROR] get_chart_drawings({user_id}, {symbol}): {e}")
        return []


def save_chart_drawing(user_id: int, symbol: str, price: float, color: str = '#ff0033',
                       line_style: str = 'solid', line_width: int = 2, label: str = None) -> dict:
    """Save a new chart drawing."""
    symbol = symbol.upper()
    try:
        engine = get_data()
        with engine.connect() as connection:
            result = connection.execute(text("""
                INSERT INTO chartdrawings (userid, symbol, price, color, line_style, line_width, label)
                VALUES (:user_id, :symbol, :price, :color, :line_style, :line_width, :label)
                RETURNING id
            """), {
                'user_id': user_id,
                'symbol': symbol,
                'price': price,
                'color': color,
                'line_style': line_style,
                'line_width': line_width,
                'label': label
            })
            new_id = result.fetchone()[0]
            connection.commit()
            print(f"[DB] Chart drawing saved for user {user_id}, symbol {symbol}, price {price}")
            return {'id': new_id, 'success': True}
    except Exception as e:
        print(f"[DB ERROR] save_chart_drawing: {e}")
        return {'id': None, 'success': False}


def delete_chart_drawing(drawing_id: int, user_id: int = None) -> bool:
    """Delete a saved chart drawing."""
    try:
        engine = get_data()
        with engine.connect() as connection:
            if user_id:
                connection.execute(text("""
                    DELETE FROM chartdrawings WHERE id = :drawing_id AND userid = :user_id
                """), {'drawing_id': drawing_id, 'user_id': user_id})
            else:
                connection.execute(text("""
                    DELETE FROM chartdrawings WHERE id = :drawing_id
                """), {'drawing_id': drawing_id})
            connection.commit()
            print(f"[DB] Chart drawing {drawing_id} deleted")
            return True
    except Exception as e:
        print(f"[DB ERROR] delete_chart_drawing({drawing_id}): {e}")
        return False
