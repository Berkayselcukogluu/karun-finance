import requests
from datetime import datetime, timedelta
from BACKEND.config import settings


def get_company_news(symbol: str, days: int = 7):
    """Fetch recent company news from Finnhub for the given symbol."""
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days)

    from_date = start_date.strftime('%Y-%m-%d')
    to_date = end_date.strftime('%Y-%m-%d')

    url = "https://finnhub.io/api/v1/company-news"
    params = {
        'symbol': symbol,
        'from': from_date,
        'to': to_date,
        'token': settings.FINNHUB_API_KEY
    }

    response = requests.get(url, params=params, timeout=10)

    if response.status_code == 200:
        return response.json()
    else:
        print(f"Error fetching news: HTTP {response.status_code}")
        return None
