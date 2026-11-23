-- ============================================================
-- MarketBoard PostgreSQL Database Schema
-- Compatible with PostgreSQL 13+
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    userid SERIAL PRIMARY KEY,
    username VARCHAR(100),
    email VARCHAR(255) UNIQUE NOT NULL,
    passwordhash TEXT NOT NULL,
    profileimagepath VARCHAR(500),
    createdat TIMESTAMP DEFAULT NOW()
);

-- Ensure a default user (userid = 1) exists for local single-user sessions
INSERT INTO users (userid, username, email, passwordhash)
VALUES (1, 'Default User', 'user@marketboard.local', 'local_default')
ON CONFLICT (userid) DO NOTHING;

SELECT setval(pg_get_serial_sequence('users', 'userid'), GREATEST((SELECT MAX(userid) FROM users), 1));

CREATE TABLE IF NOT EXISTS sectors (
    sectorid SERIAL PRIMARY KEY,
    sectorcode VARCHAR(50) UNIQUE,
    sectorname VARCHAR(150) UNIQUE NOT NULL,
    description TEXT,
    createddate TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS regions (
    regionid SERIAL PRIMARY KEY,
    regioncode VARCHAR(50) UNIQUE,
    regionname VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS countries (
    countryid SERIAL PRIMARY KEY,
    countrycode VARCHAR(10) UNIQUE NOT NULL,
    countryname VARCHAR(150) NOT NULL,
    regionid INTEGER REFERENCES regions(regionid) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS companies (
    companyid SERIAL PRIMARY KEY,
    symbol VARCHAR(20) UNIQUE NOT NULL,
    companyname VARCHAR(255),
    sectorid INTEGER REFERENCES sectors(sectorid) ON DELETE SET NULL,
    industry VARCHAR(150),
    countryid INTEGER REFERENCES countries(countryid) ON DELETE SET NULL,
    exchange VARCHAR(50),
    currency VARCHAR(10),
    ipodate DATE,
    website VARCHAR(500),
    logo VARCHAR(500),
    marketcap NUMERIC(20, 2),
    sharesoutstanding NUMERIC(20, 2),
    description TEXT,
    isactive BOOLEAN DEFAULT TRUE,
    createddate TIMESTAMP DEFAULT NOW(),
    updateddate TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS company_profiles (
    symbol VARCHAR(20) PRIMARY KEY,
    image TEXT,
    ceo TEXT,
    description TEXT,
    lastupdated TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS symbollogos (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL UNIQUE,
    logo BYTEA,
    mimetype VARCHAR(50) DEFAULT 'image/png',
    lastupdated TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS watchlists (
    id SERIAL PRIMARY KEY,
    userid INTEGER NOT NULL DEFAULT 1,
    symbol VARCHAR(20) NOT NULL,
    addedat TIMESTAMP DEFAULT NOW(),
    UNIQUE (userid, symbol)
);

CREATE TABLE IF NOT EXISTS holdings (
    holdingid SERIAL PRIMARY KEY,
    userid INTEGER NOT NULL DEFAULT 1,
    symbol VARCHAR(20) NOT NULL,
    quantity DOUBLE PRECISION NOT NULL DEFAULT 0,
    averageprice DOUBLE PRECISION NOT NULL DEFAULT 0,
    addedat TIMESTAMP DEFAULT NOW(),
    updatedat TIMESTAMP DEFAULT NOW(),
    UNIQUE (userid, symbol)
);

CREATE TABLE IF NOT EXISTS cashbalance (
    cashid SERIAL PRIMARY KEY,
    userid INTEGER UNIQUE NOT NULL DEFAULT 1,
    amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    updatedat TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notes (
    noteid SERIAL PRIMARY KEY,
    userid INTEGER NOT NULL DEFAULT 1,
    content TEXT NOT NULL,
    createdat TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS news (
    newsid SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    finnhubid BIGINT,
    headline TEXT NOT NULL,
    summary TEXT,
    source VARCHAR(150),
    url TEXT NOT NULL,
    imageurl TEXT,
    publishedat TIMESTAMP,
    category VARCHAR(50) DEFAULT 'company',
    related VARCHAR(500),
    createdat TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS financialmetrics (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) UNIQUE NOT NULL,
    lastupdated TIMESTAMP DEFAULT NOW(),
    tradingday DATE,
    trailingpe DOUBLE PRECISION,
    forwardpe DOUBLE PRECISION,
    pricetobook DOUBLE PRECISION,
    pricetosales DOUBLE PRECISION,
    beta DOUBLE PRECISION,
    trailingeps DOUBLE PRECISION,
    dividendyield DOUBLE PRECISION,
    dividendrate DOUBLE PRECISION,
    fiftytwoweekhi DOUBLE PRECISION,
    fiftytwoweeklow DOUBLE PRECISION,
    fiftydayaverage DOUBLE PRECISION,
    twohundreddayaverage DOUBLE PRECISION,
    marketcap DOUBLE PRECISION,
    profitmargins DOUBLE PRECISION,
    operatingmargins DOUBLE PRECISION,
    returnonassets DOUBLE PRECISION,
    returnonequity DOUBLE PRECISION,
    revenuegrowth DOUBLE PRECISION,
    earningsgrowth DOUBLE PRECISION,
    currentratio DOUBLE PRECISION,
    debttoequity DOUBLE PRECISION,
    heldpercentinstitutions DOUBLE PRECISION,
    revenue DOUBLE PRECISION,
    netincome DOUBLE PRECISION,
    ebitda DOUBLE PRECISION,
    grossprofit DOUBLE PRECISION,
    operatingincome DOUBLE PRECISION,
    grossmargin DOUBLE PRECISION,
    totalassets DOUBLE PRECISION,
    totalliabilities DOUBLE PRECISION,
    totalequity DOUBLE PRECISION,
    cashandcashequivalents DOUBLE PRECISION,
    operatingcashflow DOUBLE PRECISION,
    freecashflow DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS financialhealth (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) UNIQUE NOT NULL,
    lastupdated TIMESTAMP DEFAULT NOW(),
    tradingday DATE,
    assetturnover DOUBLE PRECISION,
    currentratio DOUBLE PRECISION,
    debtequityratio DOUBLE PRECISION,
    netprofitmargin DOUBLE PRECISION,
    revenuegrowth DOUBLE PRECISION,
    efficiencyscore DOUBLE PRECISION,
    liquidityscore DOUBLE PRECISION,
    leveragescore DOUBLE PRECISION,
    profitabilityscore DOUBLE PRECISION,
    growthscore DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS industryaverages (
    id SERIAL PRIMARY KEY,
    aggregationlevel VARCHAR(50),
    countrycode VARCHAR(20),
    regioncode VARCHAR(50),
    sectorcode VARCHAR(50),
    marketcapgroup VARCHAR(50),
    totalcompanycount INTEGER,
    profitablecompanycount INTEGER,
    dividendpayingcount INTEGER,
    pe_median DOUBLE PRECISION,
    pb_median DOUBLE PRECISION,
    ps_median DOUBLE PRECISION,
    beta_weightedavg DOUBLE PRECISION,
    marketcap_weightedavg DOUBLE PRECISION,
    roe_median DOUBLE PRECISION,
    roa_median DOUBLE PRECISION,
    dividendyield_weightedavg DOUBLE PRECISION,
    dividendyield_median DOUBLE PRECISION,
    revenuegrowth_weightedavg DOUBLE PRECISION,
    earningsgrowth_weightedavg DOUBLE PRECISION,
    debttoequity_median DOUBLE PRECISION,
    currentratio_median DOUBLE PRECISION,
    profitmargin_median DOUBLE PRECISION,
    operatingmargin_median DOUBLE PRECISION,
    pe_p25 DOUBLE PRECISION,
    pe_p75 DOUBLE PRECISION,
    calculatedat TIMESTAMP DEFAULT NOW(),
    isactive BOOLEAN DEFAULT TRUE,
    rediskey VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS chartdrawings (
    id SERIAL PRIMARY KEY,
    userid INTEGER NOT NULL DEFAULT 1,
    symbol VARCHAR(20) NOT NULL,
    drawing_type VARCHAR(20) DEFAULT 'horizontal_line',
    price DECIMAL(18, 6) NOT NULL,
    color VARCHAR(20) DEFAULT '#ff0033',
    line_style VARCHAR(20) DEFAULT 'solid',
    line_width INTEGER DEFAULT 2,
    label VARCHAR(100),
    createdat TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS companyrevenuesegments (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    perioddate DATE NOT NULL,
    segmenttype VARCHAR(50) NOT NULL,
    segmentname VARCHAR(255) NOT NULL,
    revenueamount NUMERIC(20, 2) NOT NULL DEFAULT 0,
    currency VARCHAR(10) DEFAULT 'USD',
    createdat TIMESTAMP DEFAULT NOW(),
    UNIQUE (symbol, perioddate, segmenttype, segmentname)
);

CREATE TABLE IF NOT EXISTS alerts (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    market_type VARCHAR(10) DEFAULT 'nasdaq',
    alert_type VARCHAR(30) NOT NULL,
    target_value DECIMAL(18, 6) NOT NULL,
    current_value_at_creation DECIMAL(18, 6),
    priority VARCHAR(20) DEFAULT 'medium',
    status VARCHAR(20) DEFAULT 'active',
    note TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    triggered_at TIMESTAMP,
    triggered_value DECIMAL(18, 6),
    expires_at TIMESTAMP,
    snooze_until TIMESTAMP,
    is_recurring BOOLEAN DEFAULT FALSE,
    trigger_count INTEGER DEFAULT 0,
    CONSTRAINT alerts_alert_type_check CHECK (alert_type IN ('price_above', 'price_below', 'volume_spike', 'percent_up', 'percent_down')),
    CONSTRAINT alerts_priority_check CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    CONSTRAINT alerts_status_check CHECK (status IN ('active', 'triggered', 'snoozed', 'expired', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS alert_notifications (
    id SERIAL PRIMARY KEY,
    alert_id INTEGER REFERENCES alerts(id) ON DELETE CASCADE,
    user_id VARCHAR(100) NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    alert_type VARCHAR(30) NOT NULL,
    target_value DECIMAL(18, 6),
    triggered_value DECIMAL(18, 6),
    triggered_at TIMESTAMP DEFAULT NOW(),
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP,
    priority VARCHAR(20),
    message TEXT,
    price_data_snapshot JSONB
);

-- Indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_symbollogos_symbol ON symbollogos(symbol);
CREATE INDEX IF NOT EXISTS idx_watchlists_userid ON watchlists(userid);
CREATE INDEX IF NOT EXISTS idx_holdings_userid ON holdings(userid);
CREATE INDEX IF NOT EXISTS idx_notes_userid ON notes(userid);
CREATE INDEX IF NOT EXISTS idx_news_symbol_publishedat ON news(symbol, publishedat DESC);
CREATE INDEX IF NOT EXISTS idx_news_finnhubid ON news(finnhubid);
CREATE INDEX IF NOT EXISTS idx_financialmetrics_symbol ON financialmetrics(symbol);
CREATE INDEX IF NOT EXISTS idx_financialhealth_symbol ON financialhealth(symbol);
CREATE INDEX IF NOT EXISTS idx_chartdrawings_user_symbol ON chartdrawings(userid, symbol);
CREATE INDEX IF NOT EXISTS idx_companyrevenuesegments_symbol ON companyrevenuesegments(symbol, perioddate DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_user_id ON alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_symbol ON alerts(symbol);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alert_notifications_user_id ON alert_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_alert_notifications_is_read ON alert_notifications(is_read);
