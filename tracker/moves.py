"""The move rule: which stocks moved the most since the previous run.

Rule (also stated in the README and used by the website):
  * Compare the latest date in history.csv with the date just before it.
  * For every stock that has a close on both dates:
        move % = (new close - old close) / old close * 100
  * Rank by the size of the move (absolute value), biggest first.
    Ties are broken by item_id. The daily issue lists the top 5.
  * A stock in the latest date but not the previous one has appeared.
    A stock in the previous date but not the latest one has disappeared.
"""

import csv

from . import config


def load_history(path):
    if not path.exists():
        return []
    with open(path, newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def _float(text):
    try:
        return float(text) if text not in (None, "") else None
    except ValueError:
        return None


def compute_moves(rows, top_n=config.TOP_N_MOVES):
    """Apply the move rule to history rows (dicts of strings)."""
    dates = sorted({r["date"] for r in rows})
    result = {
        "latest_date": dates[-1] if dates else None,
        "previous_date": dates[-2] if len(dates) >= 2 else None,
        "moves": [],
        "top": [],
        "new_items": [],
        "gone_items": [],
    }
    if not dates:
        return result

    latest = {r["item_id"]: r for r in rows if r["date"] == result["latest_date"]}
    if result["previous_date"] is None:
        return result  # first run: nothing to compare against
    previous = {r["item_id"]: r for r in rows if r["date"] == result["previous_date"]}

    result["new_items"] = sorted(set(latest) - set(previous))
    result["gone_items"] = sorted(set(previous) - set(latest))

    moves = []
    for item_id in sorted(set(latest) & set(previous)):
        old, new = _float(previous[item_id]["close"]), _float(latest[item_id]["close"])
        if old in (None, 0) or new is None:
            continue
        moves.append({
            "item_id": item_id,
            "item": latest[item_id]["item"],
            "old_close": old,
            "new_close": new,
            "move_pct": (new - old) / old * 100,
        })
    moves.sort(key=lambda m: (-abs(m["move_pct"]), m["item_id"]))
    result["moves"] = moves
    result["top"] = moves[:top_n]
    return result
