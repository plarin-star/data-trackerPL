"""The daily pipeline. GitHub Actions runs this once a day:

    python -m tracker.run

1. fetch   call every source, save raw files to data/raw/<date>/
2. build   rebuild data/history.csv from all raw files
3. status  write data/status.json (and add to data/run_log.csv)
4. issue   open today's GitHub Issue, close yesterday's
(5. the workflow commits the data folder afterwards)
"""

import os
from datetime import datetime, timezone

from . import build, config, fetch, issue, moves, status


def main(data_dir=config.DATA_DIR, now=None):
    now = now or datetime.now(timezone.utc)
    run_date = now.date().isoformat()          # the UTC date of this run
    run_time = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    print(f"[run] {run_time} (date {run_date})")

    results = fetch.fetch_all(run_date, data_dir)
    rows = build.main(data_dir)

    history = moves.load_history(data_dir / "history.csv")
    move_info = moves.compute_moves(history)
    st = status.make_status(data_dir, run_time, run_date, results, history, move_info)
    status.write_status(st, data_dir / "status.json")
    status.append_run_log(data_dir / "run_log.csv", run_time, run_date, results)
    print(f"[status] items={st['items']} days_with_success={st['days_with_success']}")

    token, repo = os.environ.get("GITHUB_TOKEN"), os.environ.get("GITHUB_REPOSITORY")
    if token and repo:
        body = issue.render_body(move_info, results, config.TOP_N_MOVES, run_date)
        try:
            issue.publish(repo, token, run_date, body)
        except Exception as exc:  # a failed issue must not stop the commit
            print(f"[issue] failed: {exc}")
    else:
        print("[issue] skipped (no GITHUB_TOKEN / GITHUB_REPOSITORY)")
    return st


if __name__ == "__main__":
    main()
