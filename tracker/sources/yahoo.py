"""Source 1: Yahoo Finance chart endpoint (JSON, no login, no key).

For each ticker we ask for the last 5 trading days of daily candles:
    https://query1.finance.yahoo.com/v8/finance/chart/NKE?range=5d&interval=1d

We keep only the tickers in config.ITEMS. The raw file stores Yahoo's reply
for each ticker exactly as it came in, inside one JSON object.

Yahoo answers plain scripts from cloud computers (like GitHub's) with
"HTTP 429 Too Many Requests". The curl_cffi library makes the request look like
it comes from the Chrome browser, which Yahoo accepts.
"""

import time
from datetime import datetime, timedelta, timezone

NAME = "yahoo"
FORMAT = "json"
HOSTS = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"]
PARAMS = {"range": "5d", "interval": "1d"}


def browser_session():
    """A session that looks like Chrome to Yahoo."""
    from curl_cffi import requests as cffi_requests

    return cffi_requests.Session(impersonate="chrome")


def get_chart(session, url, tries=3):
    """Download one chart reply as JSON, retrying when Yahoo is busy."""
    last_error = "request failed"
    for attempt in range(tries):
        try:
            resp = session.get(url, params=PARAMS, timeout=20)
            if resp.status_code == 200:
                return resp.json()
            last_error = f"HTTP {resp.status_code}"
            if resp.status_code != 429 and resp.status_code < 500:
                break  # e.g. 404 for an unknown ticker: retrying will not help
        except Exception as exc:
            last_error = type(exc).__name__
        time.sleep(2 * (attempt + 1))
    raise RuntimeError(last_error)


def fetch(symbols, session=None):
    """Download every ticker. Returns {"responses": {...}, "errors": {...}}.

    The shared session from fetch.py is not used: Yahoo needs its own
    browser-like session.
    """
    chrome = browser_session()
    responses, errors = {}, {}
    for symbol in symbols:
        for host in HOSTS:  # if the first host fails, try the second one
            try:
                responses[symbol] = get_chart(chrome, f"{host}/v8/finance/chart/{symbol}")
                errors.pop(symbol, None)
                break
            except Exception as exc:  # record and move on to the next ticker
                errors[symbol] = str(exc)
        time.sleep(0.3)  # be polite to the server
    return {"source": NAME, "params": PARAMS, "responses": responses, "errors": errors}


def _num(values, i):
    """Value i of a list, or None when it is missing."""
    if values is None or i >= len(values):
        return None
    return values[i]


def _exchange_date(stamp, offset):
    """Unix time -> 'YYYY-MM-DD' in the exchange's own time zone."""
    return (datetime.fromtimestamp(stamp, tz=timezone.utc) + timedelta(seconds=offset)).date().isoformat()


def parse_one(reply):
    """Turn Yahoo's reply for one ticker into our columns, or None.

    The latest price comes from the reply's summary ("meta"):
    regularMarketPrice, regularMarketTime and the day's high, low and volume.
    After the market closes, Yahoo sometimes leaves the newest daily candle
    empty, so the candles are only used for the previous close and the open.
    """
    try:
        result = reply["chart"]["result"][0]
    except (KeyError, IndexError, TypeError):
        return None
    meta = result.get("meta") or {}
    stamps = result.get("timestamp") or []
    quote = ((result.get("indicators") or {}).get("quote") or [{}])[0]
    closes = quote.get("close") or []
    offset = meta.get("gmtoffset") or 0

    # One entry per trading day that has a closing price: {date: candle index}.
    candle = {}
    for i, stamp in enumerate(stamps):
        if _num(closes, i) is not None:
            candle[_exchange_date(stamp, offset)] = i

    if meta.get("regularMarketPrice") is not None and meta.get("regularMarketTime"):
        close = meta["regularMarketPrice"]
        market_date = _exchange_date(meta["regularMarketTime"], offset)
        earlier = [d for d in candle if d < market_date]
        prev_close = closes[candle[max(earlier)]] if earlier else meta.get("chartPreviousClose")
        today = candle.get(market_date)
        open_ = _num(quote.get("open"), today) if today is not None else None
        high = meta.get("regularMarketDayHigh")
        low = meta.get("regularMarketDayLow")
        volume = meta.get("regularMarketVolume")
    elif candle:
        # No summary price: fall back to the last two candles.
        dates = sorted(candle)
        market_date = dates[-1]
        last = candle[market_date]
        close = closes[last]
        prev_close = closes[candle[dates[-2]]] if len(dates) >= 2 else meta.get("chartPreviousClose")
        open_ = _num(quote.get("open"), last)
        high = _num(quote.get("high"), last)
        low = _num(quote.get("low"), last)
        volume = _num(quote.get("volume"), last)
    else:
        return None

    change = change_pct = None
    if prev_close not in (None, 0):
        change = close - prev_close
        change_pct = change / prev_close * 100

    return {
        "close": close,
        "change": change,
        "change_pct": change_pct,
        "open": open_,
        "high": high,
        "low": low,
        "prev_close": prev_close,
        "volume": volume,
        "market_date": market_date,
        "currency": meta.get("currency") or "USD",
    }


def parse(payload):
    """Turn a whole raw file into {item_id: {column: value}}."""
    rows = {}
    for symbol, reply in (payload.get("responses") or {}).items():
        values = parse_one(reply)
        if values is not None:
            rows[symbol] = values
    return rows
