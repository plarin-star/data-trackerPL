"""Source 3: Nasdaq quote endpoint (JSON, no login, no key).

For each ticker:
    https://api.nasdaq.com/api/quote/NKE/info?assetclass=stocks

Nasdaq sends every number as text, for example "$38.675", "-1.205", "-3.02%"
or "16,156,360". The reply has two price blocks:

  primaryData    the latest trade. After 4 pm New York time this is the
                 after-hours price, not the official close.
  secondaryData  filled in after hours, with a timestamp that starts with
                 "Closed at": this block holds the regular-session close.

So we use secondaryData when it holds the close, and primaryData otherwise.
The day's high and low come from keyStats.dayrange ("38.44 - 39.50").
"""

import re
import time
from datetime import datetime

from .http import get_json

NAME = "nasdaq"
FORMAT = "json"
URL = "https://api.nasdaq.com/api/quote/{symbol}/info"


def fetch(symbols, session):
    responses, errors = {}, {}
    for symbol in symbols:
        try:
            responses[symbol] = get_json(
                session, URL.format(symbol=symbol), params={"assetclass": "stocks"}
            )
        except Exception as exc:  # record and move on to the next ticker
            errors[symbol] = str(exc)
        time.sleep(0.3)
    return {"source": NAME, "responses": responses, "errors": errors}


def number(text):
    """'$1,234.50' -> 1234.5, '-3.02%' -> -3.02, '' or 'N/A' -> None."""
    if text is None:
        return None
    cleaned = re.sub(r"[$,%+\s]", "", str(text))
    try:
        return float(cleaned)
    except ValueError:
        return None


def trade_date(stamp):
    """'Closed at Nov 10, 2026 4:00 PM ET' -> '2026-11-10', or None."""
    match = re.search(r"([A-Z][a-z]{2}) (\d{1,2}), (\d{4})", stamp or "")
    if not match:
        return None
    return datetime.strptime(" ".join(match.groups()), "%b %d %Y").date().isoformat()


def parse_one(reply):
    """Turn Nasdaq's reply for one ticker into our columns, or None."""
    data = (reply or {}).get("data") if isinstance(reply, dict) else None
    if not data:
        return None
    primary = data.get("primaryData") or {}
    secondary = data.get("secondaryData") or {}
    holds_close = str(secondary.get("lastTradeTimestamp") or "").startswith("Closed at")
    block = secondary if holds_close and number(secondary.get("lastSalePrice")) else primary

    close = number(block.get("lastSalePrice"))
    if close is None:
        return None
    change = number(block.get("netChange"))
    prev_close = close - change if change is not None else None

    high = low = None
    day_range = ((data.get("keyStats") or {}).get("dayrange") or {}).get("value") or ""
    parts = [number(p) for p in day_range.split("-")] if "-" in day_range else []
    if len(parts) == 2 and None not in parts:
        high, low = max(parts), min(parts)

    volume = number(primary.get("volume"))
    return {
        "close": close,
        "change": change,
        "change_pct": number(block.get("percentageChange")),
        "open": None,  # Nasdaq's quote reply has no opening price
        "high": high,
        "low": low,
        "prev_close": prev_close,
        "volume": int(volume) if volume is not None else None,
        "market_date": trade_date(block.get("lastTradeTimestamp")),
        "currency": "USD",
    }


def parse(payload):
    rows = {}
    for symbol, reply in (payload.get("responses") or {}).items():
        values = parse_one(reply)
        if values is not None:
            rows[symbol] = values
    return rows
