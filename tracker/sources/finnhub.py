"""Source 2: Finnhub quote endpoint (JSON, free API key).

For each ticker:
    https://finnhub.io/api/v1/quote?symbol=NKE
The reply looks like {"c": 61.2, "d": -0.5, "dp": -0.81, "h": 62.0, "l": 60.9,
"o": 61.8, "pc": 61.7, "t": 1731013200}. Finnhub does not report volume, so the
volume column is left empty for Finnhub rows.

The key is read from the FINNHUB_API_KEY environment variable, which the
workflow fills from a repository secret. It is sent in a header, so it never
shows up in a URL, an error message, or a raw file.
"""

import os
import time
from datetime import datetime, timezone

from .http import get_json

NAME = "finnhub"
FORMAT = "json"
URL = "https://finnhub.io/api/v1/quote"


def fetch(symbols, session):
    key = os.environ.get("FINNHUB_API_KEY", "").strip()
    if not key:
        raise RuntimeError("FINNHUB_API_KEY is not set")
    responses, errors = {}, {}
    for symbol in symbols:
        try:
            responses[symbol] = get_json(
                session, URL, params={"symbol": symbol}, headers={"X-Finnhub-Token": key}
            )
        except Exception as exc:
            errors[symbol] = str(exc)
        time.sleep(0.2)  # the free plan allows 60 calls a minute
    return {"source": NAME, "responses": responses, "errors": errors}


def parse_one(reply):
    """Turn Finnhub's reply for one ticker into our columns, or None."""
    if not isinstance(reply, dict):
        return None
    close = reply.get("c")
    # Finnhub answers an unknown ticker with zeros instead of an error.
    if not close or not reply.get("t"):
        return None
    market_date = datetime.fromtimestamp(reply["t"], tz=timezone.utc).date().isoformat()
    return {
        "close": close,
        "change": reply.get("d"),
        "change_pct": reply.get("dp"),
        "open": reply.get("o"),
        "high": reply.get("h"),
        "low": reply.get("l"),
        "prev_close": reply.get("pc"),
        "volume": None,
        "market_date": market_date,
        "currency": "USD",
    }


def parse(payload):
    rows = {}
    for symbol, reply in (payload.get("responses") or {}).items():
        values = parse_one(reply)
        if values is not None:
            rows[symbol] = values
    return rows
