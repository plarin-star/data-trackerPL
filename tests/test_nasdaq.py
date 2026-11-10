"""The Nasdaq source converts its text values to the common columns."""

from tracker.build import COLUMNS
from tracker.sources import nasdaq

VALUE_COLUMNS = set(COLUMNS[5:])


def reply(primary, secondary=None, day_range="38.44 - 39.50"):
    return {"data": {
        "symbol": "NKE",
        "primaryData": primary,
        "secondaryData": secondary,
        "keyStats": {"dayrange": {"label": "High/Low:", "value": day_range}},
    }}


# Shapes copied from real replies on 2026-11-10.
AFTER_HOURS = reply(
    {"lastSalePrice": "$38.833", "netChange": "+0.158", "percentageChange": "+0.41%",
     "lastTradeTimestamp": "Nov 10, 2026 4:33 PM ET", "volume": "16,156,360.404097"},
    {"lastSalePrice": "$38.675", "netChange": "-1.205", "percentageChange": "-3.02%",
     "lastTradeTimestamp": "Closed at Nov 10, 2026 4:00 PM ET", "volume": ""},
)
DURING_MARKET = reply(
    {"lastSalePrice": "$39.10", "netChange": "-0.78", "percentageChange": "-1.96%",
     "lastTradeTimestamp": "Nov 10, 2026 11:02 AM ET", "volume": "5,001,234"},
)


def test_after_hours_uses_the_official_close():
    row = nasdaq.parse_one(AFTER_HOURS)
    assert set(row) == VALUE_COLUMNS
    assert row["close"] == 38.675          # secondaryData, not the after-hours trade
    assert row["change"] == -1.205
    assert row["change_pct"] == -3.02
    assert abs(row["prev_close"] - 39.88) < 1e-9
    assert row["high"] == 39.5 and row["low"] == 38.44
    assert row["volume"] == 16156360
    assert row["market_date"] == "2026-11-10"
    assert row["open"] is None


def test_during_market_uses_primary_data():
    row = nasdaq.parse_one(DURING_MARKET)
    assert row["close"] == 39.10 and row["change_pct"] == -1.96
    assert row["volume"] == 5001234


def test_text_to_number():
    assert nasdaq.number("$1,234.50") == 1234.5
    assert nasdaq.number("+0.41%") == 0.41
    assert nasdaq.number("N/A") is None and nasdaq.number("") is None


def test_bad_reply_is_dropped():
    payload = {"responses": {"ZZZZ": {"data": None, "status": {"rCode": 400}}, "NKE": AFTER_HOURS}}
    assert list(nasdaq.parse(payload)) == ["NKE"]


def test_missing_day_range_leaves_high_low_empty():
    row = nasdaq.parse_one(reply(DURING_MARKET["data"]["primaryData"], day_range="N/A"))
    assert row["high"] is None and row["low"] is None
