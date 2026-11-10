"""Each source converts to the common columns correctly."""

from conftest import finnhub_payload, yahoo_payload, yahoo_reply

from tracker.build import COLUMNS
from tracker.sources import finnhub, yahoo

VALUE_COLUMNS = set(COLUMNS[5:])


def test_yahoo_uses_last_two_closes():
    row = yahoo.parse(yahoo_payload({"NKE": (60.0, 63.0)}))["NKE"]
    assert set(row) == VALUE_COLUMNS
    assert row["close"] == 63.0
    assert row["prev_close"] == 60.0
    assert row["change"] == 3.0
    assert abs(row["change_pct"] - 5.0) < 1e-9
    assert row["high"] == 65.0 and row["low"] == 61.0 and row["open"] == 62.0
    assert row["volume"] == 2000
    assert row["market_date"] == "2026-11-10"
    assert row["currency"] == "USD"


def test_yahoo_skips_missing_closes():
    reply = yahoo_reply("PTON", [7.0, 8.0])
    reply["chart"]["result"][0]["indicators"]["quote"][0]["close"] = [7.0, None]
    row = yahoo.parse_one(reply)
    # The last candle has no close, so the day before is the latest day.
    assert row["close"] == 7.0
    assert row["prev_close"] == 50.0  # falls back to chartPreviousClose


def test_yahoo_error_reply_is_dropped():
    payload = {"responses": {"BAD": {"chart": {"result": None, "error": {"code": "Not Found"}}}}}
    assert yahoo.parse(payload) == {}


def test_finnhub_maps_fields_and_leaves_volume_empty():
    row = finnhub.parse(finnhub_payload({"LULU": 300.0}))["LULU"]
    assert set(row) == VALUE_COLUMNS
    assert row["close"] == 300.0
    assert row["change"] == 1.0 and row["change_pct"] == 2.0
    assert row["high"] == 301.0 and row["low"] == 299.0
    assert row["prev_close"] == 299.0
    assert row["volume"] is None
    assert row["market_date"] == "2026-11-10"


def test_finnhub_unknown_ticker_is_dropped():
    payload = {"responses": {"ZZZZ": {"c": 0, "d": None, "dp": None, "h": 0, "l": 0, "o": 0, "pc": 0, "t": 0}}}
    assert finnhub.parse(payload) == {}


def test_finnhub_without_key_raises(monkeypatch):
    monkeypatch.delenv("FINNHUB_API_KEY", raising=False)
    try:
        finnhub.fetch(["NKE"], session=None)
    except RuntimeError as exc:
        assert "FINNHUB_API_KEY" in str(exc)
    else:
        raise AssertionError("expected an error")
