"""Step 3: write data/status.json, a summary of the latest run."""

import csv
import json

from . import config
from .build import day_dirs


def raw_dates(data_dir):
    """Dates that have at least one raw file."""
    return [d.name for d in day_dirs(data_dir) if any(d.glob("*.gz"))]


def make_status(data_dir, run_time, run_date, results, history_rows, moves):
    dates = raw_dates(data_dir)
    today_items = [r for r in history_rows if r["date"] == run_date]
    return {
        "run_time": run_time,
        "run_date": run_date,
        "first_run_date": dates[0] if dates else None,
        "days_with_success": len(dates),
        "items": len(today_items),
        "new_today": moves["new_items"] if moves["latest_date"] == run_date else [],
        "gone_today": moves["gone_items"] if moves["latest_date"] == run_date else [],
        "previous_date": moves["previous_date"],
        "sources": [
            {"name": r["name"], "ok": r["ok"], "count": r["count"], "error": r["error"]}
            for r in results
        ],
    }


def write_status(status, path):
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(status, fh, indent=2)
        fh.write("\n")


def append_run_log(path, run_time, run_date, results):
    """Keep a record of every source result from every run."""
    new_file = not path.exists()
    with open(path, "a", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        if new_file:
            writer.writerow(["run_time", "date", "source", "ok", "count", "error"])
        for r in results:
            writer.writerow([run_time, run_date, r["name"], r["ok"], r["count"], r["error"]])
