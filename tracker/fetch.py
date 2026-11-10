"""Step 1: call every source and save what it returns.

Each source that works is saved, gzip-compressed, to
    data/raw/<YYYY-MM-DD>/<source>.json.gz
A source that fails writes no file that day. Either way, its result
(ok, how many items it returned, and the error if any) is returned so the
status file and the run log can record it.

A second run on the same UTC day deletes that day's folder first, so the
day's raw files are replaced rather than added to.
"""

import gzip
import json
import shutil

import requests

from . import config
from .sources import SOURCES


def raw_day_dir(data_dir, date):
    return data_dir / "raw" / date


def save_raw(day_dir, name, fmt, payload):
    """Write the payload as <name>.<fmt>.gz and return the path."""
    day_dir.mkdir(parents=True, exist_ok=True)
    path = day_dir / f"{name}.{fmt}.gz"
    body = json.dumps(payload, sort_keys=True, indent=1).encode("utf-8")
    # mtime=0 keeps the gzip header the same for the same content.
    with gzip.GzipFile(path, "wb", mtime=0) as fh:
        fh.write(body)
    return path


def fetch_all(date, data_dir=config.DATA_DIR, sources=None, symbols=None, session=None):
    """Call every source for one UTC date. Returns a list of result dicts."""
    sources = SOURCES if sources is None else sources
    symbols = config.SYMBOLS if symbols is None else symbols
    session = session or requests.Session()

    day_dir = raw_day_dir(data_dir, date)
    if day_dir.exists():  # second run today: start the day over
        shutil.rmtree(day_dir)

    results = []
    for name, source in sources.items():
        result = {"name": name, "ok": False, "count": 0, "error": ""}
        try:
            payload = source.fetch(symbols, session)
            count = len(source.parse(payload))
            if count == 0:
                errors = payload.get("errors") or {}
                sample = next(iter(errors.values()), "no items in reply")
                raise RuntimeError(f"no usable items ({sample})")
            save_raw(day_dir, name, source.FORMAT, payload)
            result.update(ok=True, count=count)
            missing = sorted(set(symbols) - set(source.parse(payload)))
            if missing:
                result["error"] = "missing: " + ", ".join(missing)
        except Exception as exc:  # one bad source must not stop the run
            result["error"] = str(exc)[:300]
        print(f"[fetch] {name}: ok={result['ok']} count={result['count']} {result['error']}")
        results.append(result)
    return results
