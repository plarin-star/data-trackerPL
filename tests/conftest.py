"""Shared test helpers: fake source replies shaped like the real ones."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tracker.fetch import save_raw  # noqa: E402

# 2026-11-09 14:30 UTC and 2026-11-10 14:30 UTC (9:30 am New York, market open)
T1, T2 = 1794234600, 1794321000


def yahoo_reply(symbol, closes, volumes=(1000, 2000)):
    """A Yahoo chart reply with one candle per close."""
    n = len(closes)
    return {
        "chart": {
            "result": [{
                "meta": {
                    "symbol": symbol,
                    "currency": "USD",
                    "gmtoffset": -18000,
                    "chartPreviousClose": 50.0,
                    "regularMarketPrice": closes[-1],
                },
                "timestamp": [T1, T2][-n:] if n <= 2 else list(range(n)),
                "indicators": {"quote": [{
                    "open": [c - 1 for c in closes],
                    "high": [c + 2 for c in closes],
                    "low": [c - 2 for c in closes],
                    "close": list(closes),
                    "volume": list(volumes)[:n],
                }]},
            }],
            "error": None,
        }
    }


def yahoo_payload(prices):
    """prices: {symbol: (yesterday_close, today_close)}"""
    return {
        "source": "yahoo",
        "responses": {s: yahoo_reply(s, list(c)) for s, c in prices.items()},
        "errors": {},
    }


def finnhub_payload(prices):
    """prices: {symbol: close}"""
    return {
        "source": "finnhub",
        "responses": {
            s: {"c": c, "d": 1.0, "dp": 2.0, "h": c + 1, "l": c - 1, "o": c, "pc": c - 1, "t": T2}
            for s, c in prices.items()
        },
        "errors": {},
    }


@pytest.fixture
def data_dir(tmp_path):
    d = tmp_path / "data"
    d.mkdir()
    return d


def write_day(data_dir, date, yahoo=None, finnhub=None):
    day = data_dir / "raw" / date
    day.mkdir(parents=True, exist_ok=True)
    if yahoo is not None:
        save_raw(day, "yahoo", "json", yahoo_payload(yahoo))
    if finnhub is not None:
        save_raw(day, "finnhub", "json", finnhub_payload(finnhub))
    return day
