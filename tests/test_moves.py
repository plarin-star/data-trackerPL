"""The move rule ranks percent changes in close between the last two dates."""

from tracker.issue import render_body
from tracker.moves import compute_moves


def row(date, item_id, close):
    return {"date": date, "item_id": item_id, "item": item_id.title(), "close": str(close)}


def test_moves_ranked_by_absolute_percent():
    rows = [
        row("2026-11-09", "AAA", 100), row("2026-11-10", "AAA", 103),   # +3%
        row("2026-11-09", "BBB", 50), row("2026-11-10", "BBB", 45),     # -10%
        row("2026-11-09", "CCC", 10), row("2026-11-10", "CCC", 10.5),   # +5%
    ]
    m = compute_moves(rows, top_n=2)
    assert m["previous_date"] == "2026-11-09" and m["latest_date"] == "2026-11-10"
    assert [x["item_id"] for x in m["moves"]] == ["BBB", "CCC", "AAA"]
    assert [x["item_id"] for x in m["top"]] == ["BBB", "CCC"]
    assert abs(m["moves"][0]["move_pct"] + 10) < 1e-9
    assert m["moves"][0]["old_close"] == 50 and m["moves"][0]["new_close"] == 45


def test_ties_broken_by_item_id():
    rows = [row("d1", "ZZZ", 10), row("d2", "ZZZ", 11), row("d1", "AAA", 10), row("d2", "AAA", 9)]
    assert [x["item_id"] for x in compute_moves(rows)["moves"]] == ["AAA", "ZZZ"]


def test_appeared_and_disappeared():
    rows = [row("d1", "OLD", 1), row("d1", "BOTH", 1), row("d2", "BOTH", 1), row("d2", "NEW", 1)]
    m = compute_moves(rows)
    assert m["new_items"] == ["NEW"]
    assert m["gone_items"] == ["OLD"]
    assert [x["item_id"] for x in m["moves"]] == ["BOTH"]


def test_compares_only_the_last_two_dates():
    rows = [row("d1", "AAA", 1), row("d2", "AAA", 2), row("d3", "AAA", 3)]
    m = compute_moves(rows)
    assert m["previous_date"] == "d2"
    assert abs(m["moves"][0]["move_pct"] - 50) < 1e-9


def test_first_run_has_no_moves():
    m = compute_moves([row("d1", "AAA", 1)])
    assert m["previous_date"] is None and m["moves"] == []


def test_blank_or_zero_close_is_skipped():
    rows = [row("d1", "AAA", 0), row("d2", "AAA", 5), row("d1", "BBB", 5), row("d2", "BBB", "")]
    assert compute_moves(rows)["moves"] == []


def test_issue_body_on_a_quiet_day():
    rows = [row("d1", "AAA", 10), row("d2", "AAA", 10)]
    body = render_body(compute_moves(rows), [{"name": "yahoo", "ok": True, "count": 1, "error": ""}], 5)
    assert "| 1 | AAA |" in body
    assert "market was most likely closed" in body
    assert "Appeared: none" in body
