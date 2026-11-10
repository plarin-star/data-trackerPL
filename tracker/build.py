"""Step 2: build data/history.csv from the raw files alone.

The history is never edited by hand or appended to. Every build reads every
day folder in data/raw/, converts each source's raw file into rows with the
same columns, and writes the whole file again. Running the build twice gives
the same file, and a change to a rule here applies to every day.

For each day and each stock, the row comes from the first source in
config.SOURCE_PRIORITY that has the stock that day (Yahoo, then Finnhub).
So there is exactly one row per stock per day. A day with no raw file for a
source has no rows from that source.

Run it on its own with:
    python -m tracker.build
"""

import csv
import gzip
import json
import re
import sys

from . import config
from .sources import SOURCES

COLUMNS = [
    "date", "item_id", "item", "source",          # fixed by the assignment
    "category",                                    # our grouping of the stock
    "close", "change", "change_pct",               # the main values
    "open", "high", "low", "prev_close", "volume",
    "market_date", "currency",
]
NUMERIC = ["close", "change", "change_pct", "open", "high", "low", "prev_close", "volume"]
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def fmt(value):
    """Write a number the same way every time: up to 4 decimals, no trailing zeros."""
    if value is None or value == "":
        return ""
    if isinstance(value, bool):
        return str(int(value))
    if isinstance(value, int):
        return str(value)
    value = round(float(value), 4)
    if value == 0:
        value = 0.0  # avoid "-0"
    text = f"{value:.4f}".rstrip("0").rstrip(".")
    return text


def read_raw(path):
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        return json.load(fh)


def day_dirs(data_dir):
    """Day folders in data/raw, oldest first."""
    raw = data_dir / "raw"
    if not raw.exists():
        return []
    return sorted(p for p in raw.iterdir() if p.is_dir() and DATE_RE.match(p.name))


def rows_for_day(day_dir):
    """Convert one day's raw files into one row per stock."""
    date = day_dir.name
    chosen = {}  # item_id -> row
    for name in config.SOURCE_PRIORITY:
        source = SOURCES[name]
        path = day_dir / f"{name}.{source.FORMAT}.gz"
        if not path.exists():
            continue
        for item_id, values in source.parse(read_raw(path)).items():
            if item_id not in config.ITEMS_BY_ID or item_id in chosen:
                continue  # keep only tracked stocks, and the higher-priority source
            info = config.ITEMS_BY_ID[item_id]
            row = {
                "date": date,
                "item_id": item_id,
                "item": info["item"],
                "source": name,
                "category": info["category"],
            }
            for col in COLUMNS[5:]:
                row[col] = values.get(col)
            chosen[item_id] = row
    return [chosen[k] for k in sorted(chosen)]


def build_history(data_dir=config.DATA_DIR):
    """All rows from all days, sorted by date then item_id."""
    rows = []
    for day_dir in day_dirs(data_dir):
        rows.extend(rows_for_day(day_dir))
    rows.sort(key=lambda r: (r["date"], r["item_id"]))
    return rows


def write_history(rows, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(COLUMNS)
        for row in rows:
            writer.writerow(
                [fmt(row[c]) if c in NUMERIC else (row[c] or "") for c in COLUMNS]
            )


def main(data_dir=config.DATA_DIR):
    rows = build_history(data_dir)
    write_history(rows, data_dir / "history.csv")
    days = len({r["date"] for r in rows})
    print(f"[build] wrote {len(rows)} rows for {days} day(s) to {data_dir / 'history.csv'}")
    return rows


if __name__ == "__main__":
    main()
    sys.exit(0)
