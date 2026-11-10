"""The history file is built from the raw files alone."""

import csv
import json

from conftest import finnhub_payload, write_day, yahoo_payload

from tracker import build, fetch, run
from tracker.build import COLUMNS


def read_csv(path):
    with open(path, newline="") as fh:
        return list(csv.DictReader(fh))


class FakeSource:
    """A source that returns a fixed payload, or raises."""

    def __init__(self, real, payload=None, error=None):
        self.FORMAT, self.parse = real.FORMAT, real.parse
        self.payload, self.error = payload, error

    def fetch(self, symbols, session):
        if self.error:
            raise RuntimeError(self.error)
        return self.payload


def test_columns_sorting_and_one_row_per_item_per_day(data_dir):
    write_day(data_dir, "2026-11-10", yahoo={"NKE": (60, 61), "DKS": (200, 199)})
    write_day(data_dir, "2026-11-09", yahoo={"NKE": (59, 60), "DKS": (201, 200)})
    build.main(data_dir)
    rows = read_csv(data_dir / "history.csv")
    assert list(rows[0].keys()) == COLUMNS
    assert COLUMNS[:4] == ["date", "item_id", "item", "source"]
    assert [(r["date"], r["item_id"]) for r in rows] == [
        ("2026-11-09", "DKS"), ("2026-11-09", "NKE"),
        ("2026-11-10", "DKS"), ("2026-11-10", "NKE"),
    ]
    assert rows[-1]["item"] == "Nike" and rows[-1]["category"] == "Apparel & Footwear"
    assert rows[-1]["close"] == "61" and rows[-1]["volume"] == "2000"


def test_rebuild_gives_identical_file(data_dir):
    write_day(data_dir, "2026-11-09", yahoo={"NKE": (59.123456, 60.987654)})
    write_day(data_dir, "2026-11-10", finnhub={"NKE": 61.5})
    build.main(data_dir)
    first = (data_dir / "history.csv").read_bytes()
    (data_dir / "history.csv").unlink()
    build.main(data_dir)
    assert (data_dir / "history.csv").read_bytes() == first


def test_yahoo_wins_and_finnhub_fills_gaps(data_dir):
    write_day(data_dir, "2026-11-10", yahoo={"NKE": (60, 61)}, finnhub={"NKE": 99.0, "LULU": 300.0})
    rows = build.build_history(data_dir)
    by_id = {r["item_id"]: r for r in rows}
    assert len(rows) == 2
    assert by_id["NKE"]["source"] == "yahoo" and by_id["NKE"]["close"] == 61
    assert by_id["LULU"]["source"] == "finnhub" and by_id["LULU"]["volume"] is None


def test_missing_source_day_has_no_rows_and_blank_values(data_dir):
    write_day(data_dir, "2026-11-09", yahoo={"NKE": (60, 61)})
    (data_dir / "raw" / "2026-11-10").mkdir(parents=True)  # a day where everything failed
    write_day(data_dir, "2026-11-11", finnhub={"NKE": 62.0})
    build.main(data_dir)
    rows = read_csv(data_dir / "history.csv")
    assert [r["date"] for r in rows] == ["2026-11-09", "2026-11-11"]
    assert rows[1]["volume"] == ""  # Finnhub does not report volume


def test_untracked_symbols_are_dropped(data_dir):
    write_day(data_dir, "2026-11-10", yahoo={"NKE": (1, 2), "AAPL": (1, 2)})
    assert [r["item_id"] for r in build.build_history(data_dir)] == ["NKE"]


def test_one_failed_source_does_not_stop_the_fetch(data_dir):
    from tracker.sources import finnhub, yahoo

    sources = {
        "yahoo": FakeSource(yahoo, error="HTTP 429"),
        "finnhub": FakeSource(finnhub, payload=finnhub_payload({"NKE": 61.0})),
    }
    results = fetch.fetch_all("2026-11-10", data_dir, sources=sources, symbols=["NKE"])
    assert results[0] == {"name": "yahoo", "ok": False, "count": 0, "error": "HTTP 429"}
    assert results[1]["ok"] and results[1]["count"] == 1
    day = data_dir / "raw" / "2026-11-10"
    assert not (day / "yahoo.json.gz").exists()
    assert (day / "finnhub.json.gz").exists()


def test_second_run_same_day_replaces_the_day(data_dir, monkeypatch):
    from datetime import datetime, timezone

    from tracker.sources import finnhub, yahoo

    monkeypatch.delenv("GITHUB_TOKEN", raising=False)
    write_day(data_dir, "2026-11-09", yahoo={"NKE": (59, 60), "DKS": (200, 200)})

    def run_once(yahoo_prices, finnhub_prices, hour):
        srcs = {
            "yahoo": FakeSource(yahoo, payload=yahoo_payload(yahoo_prices)),
            "finnhub": FakeSource(finnhub, payload=finnhub_payload(finnhub_prices)),
        }
        monkeypatch.setattr(fetch, "SOURCES", srcs)
        now = datetime(2026, 11, 10, hour, 0, tzinfo=timezone.utc)
        return run.main(data_dir, now=now)

    run_once({"NKE": (60, 61), "DKS": (200, 210)}, {"LULU": 300.0}, hour=22)
    status = run_once({"NKE": (60, 66)}, {"NKE": 1.0}, hour=23)  # DKS gone, LULU gone

    rows = read_csv(data_dir / "history.csv")
    today = [r for r in rows if r["date"] == "2026-11-10"]
    assert [(r["item_id"], r["close"], r["source"]) for r in today] == [("NKE", "66", "yahoo")]
    assert len(rows) == 3  # 2 rows on the 9th, 1 on the 10th: the day counts once

    saved = json.loads((data_dir / "status.json").read_text())
    assert saved == status
    assert saved["run_time"] == "2026-11-10T23:00:00Z"
    assert saved["first_run_date"] == "2026-11-09"
    assert saved["days_with_success"] == 2
    assert saved["items"] == 1
    assert saved["gone_today"] == ["DKS"] and saved["new_today"] == []
    assert [s["name"] for s in saved["sources"]] == ["yahoo", "finnhub"]
    assert all(set(s) >= {"name", "ok", "count"} for s in saved["sources"])
    # The run log keeps every run.
    assert len(read_csv(data_dir / "run_log.csv")) == 4
