/* Today page: last run, source status, counts, latest values, biggest moves. */

(function () {
  "use strict";
  const F = window.FT;
  const { el } = F;
  const TOP_N = 5; // same number the daily issue lists

  function scoreboard(m, rows, status) {
    const box = document.getElementById("scoreboard");
    box.replaceChildren();
    const top = m.moves[0];
    const quiet = top && Math.abs(top.move_pct) < 1e-9; // nothing changed, e.g. a weekend
    if (top && !quiet) {
      box.style.setProperty("--plate", "var(" + F.categoryVar(top.category) + ")");
      box.append(
        el("p", { class: "label", text: "Biggest move since the previous run, " + F.fmtDate(m.previousDate) + " to " + F.fmtDate(m.latestDate) }),
        el("div", {},
          el("div", { class: "big" },
            el("span", { text: top.item_id }),
            el("span", { class: "move " + F.dirClass(top.move_pct), text: F.fmtPct(top.move_pct) })),
          el("p", { class: "who" }, el("span", { class: "company", text: top.item }), F.categoryTag(top.category))),
        el("div", { class: "side" },
          el("div", { class: "from-to", text: F.fmtMoney(top.old_close) + " → " + F.fmtMoney(top.new_close) }),
          el("div", { class: "when", text: "Closing price, change " + F.fmtSignedMoney(top.change) })));
      return;
    }
    // First run, or every price is missing: show the biggest market-day change instead.
    const latest = Object.values(m.latest).filter((r) => r.change_pct != null);
    latest.sort((a, b) => Math.abs(b.change_pct) - Math.abs(a.change_pct));
    const best = latest[0];
    box.append(el("p", { class: "label", text: quiet
      ? "No closing price changed between " + F.fmtDate(m.previousDate) + " and " + F.fmtDate(m.latestDate) + ": the market was closed. Biggest change on the last market day:"
      : m.latestDate
        ? "First run on " + F.fmtDate(m.latestDate) + ". Moves since the previous run start with the second run."
        : "No data yet." }));
    if (best) {
      box.style.setProperty("--plate", "var(" + F.categoryVar(best.category) + ")");
      box.append(
        el("div", {},
          el("div", { class: "big" },
            el("span", { text: best.item_id }),
            el("span", { class: "move " + F.dirClass(best.change_pct), text: F.fmtPct(best.change_pct) })),
          el("p", { class: "who" }, el("span", { class: "company", text: best.item }), F.categoryTag(best.category))),
        el("div", { class: "side" },
          el("div", { class: "from-to", text: F.fmtMoney(best.prev_close) + " → " + F.fmtMoney(best.close) }),
          el("div", { class: "when", text: "Biggest market-day change on " + F.fmtDate(best.market_date) })));
    }
  }

  function counts(status, m) {
    const box = document.getElementById("counts");
    const stat = (v, k, small) => el("div", { class: "stat" }, el("div", { class: "v num" + (small ? " small" : ""), text: v }), el("div", { class: "k", text: k }));
    box.replaceChildren(
      stat(String(status.items), "Stocks in the latest run"),
      stat(String(status.days_with_success), "Days with a successful run"),
      stat(F.fmtDate(status.first_run_date), "First run", true),
      stat(F.fmtDate(m.previousDate), "Previous run compared", true),
      stat(status.new_today.length ? status.new_today.join(", ") : "None", "New today", true),
      stat(status.gone_today.length ? status.gone_today.join(", ") : "None", "Gone today", true),
    );
  }

  function sources(status) {
    const box = document.getElementById("sources");
    box.replaceChildren(...status.sources.map((s) =>
      el("div", { class: "source-row" },
        el("span", { class: "badge " + (s.ok ? "ok" : "fail"), text: s.ok ? "✓ Worked" : "✕ Failed" }),
        el("span", { class: "name", text: s.name }),
        el("span", { class: "detail", text: s.count + " stocks" + (s.error ? " · " + s.error : "") }))));
  }

  function movesTable(m) {
    const box = document.getElementById("moves");
    const lead = document.getElementById("moves-lead");
    lead.textContent = "Rule: percent change in closing price between the two latest dates in the history, (new − old) ÷ old × 100, ranked by size. The top " + TOP_N + " are listed, the same as in the daily GitHub Issue.";
    if (!m.previousDate) {
      box.replaceChildren(el("p", { class: "empty", text: "There is only one day in the history so far, so there is nothing to compare with yet. The first moves appear after the next run." }));
      return;
    }
    const rows = m.moves.slice(0, TOP_N).map((x, i) => el("tr", {},
      el("td", { class: "n", text: String(i + 1) }),
      el("td", {}, el("span", { class: "ticker", text: x.item_id + " " }), el("span", { class: "company", text: x.item })),
      el("td", { class: "n", text: F.fmtMoney(x.old_close) }),
      el("td", { class: "n", text: F.fmtMoney(x.new_close) }),
      el("td", { class: "n " + F.dirClass(x.move_pct), text: F.arrow(x.move_pct) + F.fmtPct(x.move_pct) })));
    const extra = [];
    if (m.newItems.length) extra.push("Appeared: " + m.newItems.join(", "));
    if (m.goneItems.length) extra.push("Disappeared: " + m.goneItems.join(", "));
    box.replaceChildren(el("table", {},
      el("caption", { class: "visually-hidden", text: "Biggest moves" }),
      el("thead", {}, el("tr", {},
        el("th", { class: "n", scope: "col", text: "Rank" }), el("th", { scope: "col", text: "Stock" }),
        el("th", { class: "n", scope: "col", text: "Close " + F.fmtShortDate(m.previousDate) }),
        el("th", { class: "n", scope: "col", text: "Close " + F.fmtShortDate(m.latestDate) }),
        el("th", { class: "n", scope: "col", text: "Move" }))),
      el("tbody", {}, rows)));
    if (m.moves.length && m.moves.every((x) => Math.abs(x.move_pct) < 1e-9)) {
      extra.unshift("No closing price changed, so the market was most likely closed (a weekend or holiday).");
    }
    if (extra.length) box.append(el("p", { class: "empty", text: extra.join(" · ") }));
  }

  function latestTable(m) {
    const box = document.getElementById("latest");
    const list = Object.values(m.latest).sort((a, b) =>
      F.CATEGORIES.findIndex((c) => c.name === a.category) - F.CATEGORIES.findIndex((c) => c.name === b.category) || a.item_id.localeCompare(b.item_id));
    const body = list.map((r) => {
      const mv = m.byId[r.item_id];
      return el("tr", {},
        el("td", {}, el("span", { class: "ticker", text: r.item_id + " " }), el("span", { class: "company", text: r.item })),
        el("td", {}, F.categoryTag(r.category)),
        el("td", { class: "n", text: F.fmtMoney(r.close) }),
        el("td", { class: "n " + F.dirClass(mv && mv.change), text: mv ? F.fmtSignedMoney(mv.change) : "—" }),
        el("td", { class: "n " + F.dirClass(mv && mv.move_pct), text: mv ? F.arrow(mv.move_pct) + F.fmtPct(mv.move_pct) : "—" }),
        el("td", { class: "n " + F.dirClass(r.change_pct), text: F.fmtPct(r.change_pct) }),
        el("td", { class: "n", text: F.fmtCompact(r.volume) }),
        el("td", { text: r.source }));
    });
    box.replaceChildren(el("table", {},
      el("caption", { class: "visually-hidden", text: "Latest values of every stock" }),
      el("thead", {}, el("tr", {},
        el("th", { scope: "col", text: "Stock" }), el("th", { scope: "col", text: "Category" }),
        el("th", { class: "n", scope: "col", text: "Close" }),
        el("th", { class: "n", scope: "col", text: "Since last run ($)" }),
        el("th", { class: "n", scope: "col", text: "Since last run (%)" }),
        el("th", { class: "n", scope: "col", text: "Market day (%)" }),
        el("th", { class: "n", scope: "col", text: "Volume" }),
        el("th", { scope: "col", text: "Source" }))),
      el("tbody", {}, body)));
  }

  F.loadData().then(({ rows, status }) => {
    const m = F.computeMoves(rows);
    document.getElementById("last-run").textContent =
      "Last run " + F.fmtTime(status.run_time) + " · history covers " + F.dates(rows).length + " day" + (F.dates(rows).length === 1 ? "" : "s") + ", " + F.fmtDate(status.first_run_date) + " to " + F.fmtDate(m.latestDate) + ".";
    scoreboard(m, rows, status);
    counts(status, m);
    sources(status);
    movesTable(m);
    latestTable(m);
  }).catch(F.showError);
})();
