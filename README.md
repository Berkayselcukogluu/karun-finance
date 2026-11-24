# MarketBoard — US Stock Market Analytics & Portfolio Dashboard

MarketBoard is a full-stack financial dashboard for tracking US equities (NYSE & NASDAQ), managing watchlists and portfolio holdings, analyzing company fundamentals and valuation multiples, visualizing revenue segmentation, and receiving real-time price and volume alerts.

---

## Features

- **Real-Time US Market Quotes & Market Status**: Live stock quotes, daily change tracking, pre-market/post-market/holiday status indicators, and a Magnificent 7 (MAG7) overview ticker.
- **Portfolio Holdings & Watchlist Management**: Track equity positions with average cost, quantity, market value, unrealized profit/loss (P&L), portfolio allocation, and cash balance.
- **Interactive Stock Charts**: Heikin-Ashi candlestick, line, and area charts with volume histograms across multiple timeframes (`1M`, `3M`, `6M`, `1Y`, `2Y`, `Max`) powered by TradingView Lightweight Charts.
- **Valuation Multiples Comparison**: Compare a company's P/E, P/B, EV/Sales, EV/EBITDA, PEG, and EPS against sector and industry averages.
- **Financial Health Radar**: 5-axis normalized financial health scoring (Efficiency, Liquidity, Leverage, Profitability, and Growth) built from fundamental ratios.
- **MAG7 Revenue Segmentation (Sankey Diagrams)**: Interactive product and geographic revenue breakdown for Apple, Microsoft, Alphabet, Amazon, NVIDIA, Meta, and Tesla.
- **Real-Time Price & Volume Alerts**: Redis-backed alert engine with WebSocket push notifications for price targets (`PRICE_ABOVE`, `PRICE_BELOW`), percentage moves (`PERCENT_UP`, `PERCENT_DOWN`), and volume spikes (`VOLUME_SPIKE`).
- **AI Financial Assistant**: Context-aware market assistant powered by OpenAI that automatically injects live price, valuation, and portfolio data into the conversation.
- **Company News & Personal Notes**: Aggregated company news feed with sentiment indicators and a quick-access personal notes drawer.

---

## Tech Stack

### Backend
- **Framework**: FastAPI, Uvicorn, WebSockets
- **Database**: PostgreSQL (`psycopg2-binary`, SQLAlchemy)
- **Caching & Pub/Sub**: Redis (`redis-py`)
- **Market Data & Analytics**: Finnhub API, Financial Modeling Prep (FMP) API, Yahoo Finance (`yfinance`), Pandas, NumPy, SciPy, `pandas-ta`
- **AI Assistant**: OpenAI API (`openai`)

### Frontend
- **Framework**: React 18, TypeScript, Vite
- **Styling & UI**: Tailwind CSS, Radix UI / `shadcn/ui`, Framer Motion, Lucide Icons
- **Data Visualization**: TradingView `lightweight-charts`, Recharts (Radar & Sankey charts)

---

## Project Structure

```text
.
├── app.py                      # FastAPI application entrypoint, REST API & WebSocket routes
├── BACKEND/
│   ├── config.py               # Environment variable configuration
│   ├── database.py             # PostgreSQL connection pool, schema auto-init & CRUD helpers
│   ├── main.py                 # Market data services (Finnhub, FMP, yfinance, Redis cache)
│   ├── analytics.py            # Sector/industry valuation multiples & financial health scoring
│   ├── alerts.py               # Redis-first real-time alert engine & background worker
│   ├── mag7_segments.py        # MAG7 product & geographic revenue segmentation service
│   └── news.py                 # News aggregation & sentiment scoring
├── FRONTEND/
│   ├── index.html              # Main HTML entry with SEO/OpenGraph/PWA metadata
│   ├── public/                 # Static assets (robots.txt, sitemap.xml, site.webmanifest)
│   └── src/
│       ├── components/         # Dashboard, charts, tables, modals, and AI assistant UI
│       ├── hooks/              # Custom React hooks (WebSocket real-time alerts)
│       └── lib/                # Shared TypeScript types and utility functions
├── scripts/
│   ├── schema_postgres.sql     # Complete PostgreSQL schema definition
│   ├── migrate_db.py           # CLI script to initialize/migrate PostgreSQL tables
│   └── migrate_db.sql          # Additional migration statements
├── .env.example                # Template for environment variables
├── requirements.txt            # Python dependencies
├── Start_App.bat               # Windows one-click startup script (WSL PostgreSQL/Redis + FastAPI)
└── Stop_App.bat                # Windows one-click shutdown script
```

---

## Prerequisites

1. **Python 3.10+**
2. **Node.js 18+ & npm**
3. **PostgreSQL 13+** (running locally on Windows, Docker, or inside WSL Ubuntu)
4. **Redis 6+** (optional but recommended for caching and real-time alert evaluation; the backend gracefully falls back if Redis is unavailable)

---

## Environment Variables & API Keys Guide (`.env`)

Copy `.env.example` to `.env` in the project root (or edit the existing `.env` file) and fill in your credentials:

```bash
cp .env.example .env
```

```ini
# =============================================================================
# 1. Market Data & AI API Keys
# =============================================================================
FINNHUB_API_KEY=your_finnhub_api_key_here
FMP_API_KEY=your_fmp_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4o-mini

# =============================================================================
# 2. PostgreSQL Database Configuration
# =============================================================================
DB_TYPE=postgresql
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_postgres_password_here
DB_NAME=fintechrssdb

# =============================================================================
# 3. Redis Configuration
# =============================================================================
REDIS_URL=redis://localhost:6379/0
```

<img width="1903" height="909" alt="Ekran görüntüsü 2026-08-12 220243" src="https://github.com/user-attachments/assets/4cec3681-5413-4cce-a9aa-6c678da60e1b" />
<img width="1898" height="904" alt="Ekran görüntüsü 2026-08-12 220544" src="https://github.com/user-attachments/assets/63a74752-0be5-4b39-96b0-881db1487c1a" />
<img width="1892" height="904" alt="Ekran görüntüsü 2026-08-12 220619" src="https://github.com/user-attachments/assets/ca0d4617-2981-4516-a984-8686cc105eb2" />
<img width="1895" height="899" alt="Ekran görüntüsü 2026-08-12 220639" src="https://github.com/user-attachments/assets/552dcdd2-15b3-4c5a-9a42-e3c21c3af2ee" />
<img width="1020" height="378" alt="Ekran görüntüsü 2026-08-12 220738" src="https://github.com/user-attachments/assets/810f31a5-f323-460b-8540-115d9f92167e" />
<img width="1024" height="636" alt="Ekran görüntüsü 2026-08-12 220747" src="https://github.com/user-attachments/assets/35e9cc51-f65f-4b60-891f-a72657a53ecc" />
<img width="1895" height="909" alt="Ekran görüntüsü 2026-08-12 220939" src="https://github.com/user-attachments/assets/28fabc75-dc50-442b-b449-2c6767d9fd24" />
<img width="912" height="325" alt="Ekran görüntüsü 2026-08-12 221331" src="https://github.com/user-attachments/assets/a46477df-6e32-4e7d-9f13-e53d0887622b" />

### Where to Obtain the Required API Keys

| Variable | Provider | How to Get It | Used For |
| :--- | :--- | :--- | :--- |
| `FINNHUB_API_KEY` | **Finnhub Stock API** | 1. Go to [https://finnhub.io/register](https://finnhub.io/register) and create a free account.<br>2. Copy the API key shown on your Finnhub Dashboard. | Real-time US stock quotes, market open/holiday status, company profiles, peer tickers, and company news. |
| `FMP_API_KEY` | **Financial Modeling Prep (FMP)** | 1. Go to [https://site.financialmodelingprep.com/developer](https://site.financialmodelingprep.com/developer) and sign up.<br>2. Open your Developer Dashboard to copy your API key. | Income statements, balance sheets, financial ratios, Financial Health Radar scores, and MAG7 revenue segmentation. |
| `OPENAI_API_KEY` | **OpenAI Platform** | 1. Go to [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys) and sign in.<br>2. Click **Create new secret key** and paste it into `.env`. | Powers the built-in AI Financial Assistant (`/api/chat`). |

---

## Installation & Setup

### 1. Clone the Repository

```bash
git clone https://github.com/Berkayselcukogluu/karun-finance.git
```

### 2. Set Up the Python Backend

Create a virtual environment and install the required Python packages:

```bash
python -m venv .venv

# Windows (PowerShell)
.\.venv\Scripts\Activate.ps1

# Linux / macOS
source .venv/bin/activate

pip install -r requirements.txt
```

### 3. Configure PostgreSQL Database

Make sure PostgreSQL is running and create the database specified in `.env` (default: `fintechrssdb`):

```sql
CREATE DATABASE fintechrssdb;
```

> **Automatic Schema Initialization**: When you start the FastAPI server (`python app.py`), `init_db()` automatically executes [`scripts/schema_postgres.sql`](scripts/schema_postgres.sql) to create all required tables (`users`, `watchlists`, `holdings`, `cashbalance`, `notes`, `news`, `companies`, `company_profiles`, `symbollogos`, `financialmetrics`, `financialhealth`, `industryaverages`, `companyrevenuesegments`, `alerts`, `alert_notifications`, etc.) if they do not exist yet.

You can also initialize or verify the database schema manually at any time by running:

```bash
python scripts/migrate_db.py
```

### 4. Build the Frontend

Install Node dependencies and build the production bundle (served automatically by FastAPI from `FRONTEND/dist`):

```bash
cd FRONTEND
npm install
npm run build
cd ..
```

---

## Running the Application

### Option A: Production / Unified Mode (FastAPI serves both API and Frontend)

Once `FRONTEND/dist` is built, run the FastAPI server from the project root:

```bash
python app.py
```

Then open **[http://localhost:8000](http://localhost:8000)** in your browser.
- Interactive Swagger API documentation is available at **[http://localhost:8000/docs](http://localhost:8000/docs)**.

### Option B: Windows One-Click Scripts (WSL PostgreSQL + Redis + FastAPI)

If you run PostgreSQL and Redis inside WSL (Ubuntu) on Windows:
- Double-click **`Start_App.bat`** to start PostgreSQL and Redis inside WSL, launch the FastAPI server, and open `http://localhost:8000`.
- Double-click **`Stop_App.bat`** to stop the FastAPI server and WSL services.

### Option C: Frontend Development Mode (Hot Module Replacement)

To run the Vite development server alongside the FastAPI backend:

1. Start the backend in terminal 1:
   ```bash
   python app.py
   ```
2. Start the Vite dev server in terminal 2:
   ```bash
   cd FRONTEND
   npm run dev
   ```

---

## Front-End Checklist Compliance

This project has been configured following the [Front-End Checklist](https://github.com/thedaviddias/front-end-checklist):
- **HTML & Metadata**: Doctype, `lang="en"`, UTF-8 charset, responsive viewport, canonical link, theme-color, Open Graph (`og:*`), and Twitter Card metadata in `FRONTEND/index.html`.
- **SEO & PWA Assets**: `robots.txt`, `sitemap.xml`, `site.webmanifest`, and custom `404.html` pages in `FRONTEND/public/`.
- **Accessibility (a11y)**: Skip-to-main-content link, semantic landmarks (`<header>`, `<main id="main-content">`), ARIA labels on interactive icon buttons, and keyboard navigation support.
- **Performance & Security**: Lazy-loaded images (`loading="lazy" decoding="async"`), `rel="noopener noreferrer"` on external links, and HTTP security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) enforced by FastAPI middleware.

---

## License

This project is open-source and available under the MIT License.
