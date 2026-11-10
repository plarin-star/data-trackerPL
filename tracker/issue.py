"""Step 4: open today's GitHub Issue and close the previous one.

The issue is titled with the UTC date (for example "2026-11-10") and carries
the label "daily-report". If today's issue already exists (a second run on the
same day), its text is replaced instead of opening a new one.
"""

import requests

API = "https://api.github.com"
LABEL = "daily-report"


def render_body(moves, results, top_n, run_date=None):
    lines = []
    prev, latest = moves["previous_date"], moves["latest_date"]
    if run_date and latest and latest != run_date:
        lines.append(f"Every source failed on {run_date}. Showing the last comparison on file.")
        lines.append("")
    if latest is None:
        lines.append("No data yet: every source failed and there is no history.")
    elif prev is None:
        lines.append(f"First run ({latest}). There is no previous run to compare with yet.")
    else:
        lines.append(f"## Biggest moves: {prev} → {latest}")
        lines.append("")
        lines.append(
            f"Move rule: percent change in closing price between the two runs, "
            f"(new − old) / old × 100. The {top_n} largest moves by size are listed."
        )
        lines.append("")
        if moves["top"]:
            lines.append("| Rank | Ticker | Company | Old close | New close | Move |")
            lines.append("|---:|---|---|---:|---:|---:|")
            for i, m in enumerate(moves["top"], 1):
                lines.append(
                    f"| {i} | {m['item_id']} | {m['item']} | ${m['old_close']:,.2f} "
                    f"| ${m['new_close']:,.2f} | {m['move_pct']:+.2f}% |"
                )
            if all(abs(m["move_pct"]) < 1e-9 for m in moves["top"]):
                lines.append("")
                lines.append("No prices changed. The market was most likely closed.")
        else:
            lines.append("No stock has a price on both dates, so there are no moves.")
    lines.append("")
    lines.append("## Appeared / disappeared")
    lines.append(f"- Appeared: {', '.join(moves['new_items']) or 'none'}")
    lines.append(f"- Disappeared: {', '.join(moves['gone_items']) or 'none'}")
    lines.append("")
    lines.append("## Sources")
    for r in results:
        mark = "✅" if r["ok"] else "❌"
        extra = f" ({r['error']})" if r["error"] else ""
        lines.append(f"- {mark} {r['name']}: {r['count']} items{extra}")
    return "\n".join(lines) + "\n"


def publish(repo, token, title, body):
    """Create or update today's issue, then close every other open report."""
    s = requests.Session()
    s.headers.update({
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    })
    # Make sure the label exists (422 means it already does).
    s.post(f"{API}/repos/{repo}/labels", json={"name": LABEL, "color": "0e8a16"})

    resp = s.get(
        f"{API}/repos/{repo}/issues",
        params={"labels": LABEL, "state": "all", "per_page": 100},
    )
    resp.raise_for_status()
    reports = [i for i in resp.json() if "pull_request" not in i]

    todays = next((i for i in reports if i["title"] == title), None)
    if todays:
        r = s.patch(
            f"{API}/repos/{repo}/issues/{todays['number']}",
            json={"body": body, "state": "open"},
        )
        r.raise_for_status()
        number = todays["number"]
        print(f"[issue] updated #{number} {title}")
    else:
        r = s.post(
            f"{API}/repos/{repo}/issues",
            json={"title": title, "body": body, "labels": [LABEL]},
        )
        r.raise_for_status()
        number = r.json()["number"]
        print(f"[issue] opened #{number} {title}")

    for old in reports:
        if old["number"] != number and old["state"] == "open":
            s.patch(f"{API}/repos/{repo}/issues/{old['number']}", json={"state": "closed"})
            print(f"[issue] closed #{old['number']} {old['title']}")
    return number
