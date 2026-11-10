/* Trends page. Every number is computed here, in the browser, from
   data/history.csv, so the page changes as the history grows. */

(function () {
  "use strict";
  const F = window.FT;
  const { el } = F;
  const $ = (id) => document.getElementById(id);

  // Line styles that tell stocks in the same category apart (category = color).
  const DASHES = [[], [7, 4], [2, 3], [12, 4, 2, 4], [4, 7]];

  const METRICS = [
    { key: "indexed", label: "Close, first day = 100", fmt: (v) => v.toFixed(1), axis: "Index (first day = 100)" },
    { key: "close", label: "Closing price ($)", fmt: F.fmtMoney, axis: "US dollars" },
    { key: "change_pct", label: "Market-day change (%)", fmt: F.fmtPct, axis: "Percent" },
    { key: "change", label: "Market-day change ($)", fmt: F.fmtSignedMoney, axis: "US dollars" },
    { key: "volume", label: "Volume (shares traded)", fmt: F.fmtCompact, axis: "Shares" },
    { key: "high", label: "Day high ($)", fmt: F.fmtMoney, axis: "US dollars" },
    { key: "low", label: "Day low ($)", fmt: F.fmtMoney, axis: "US dollars" },
    { key: "open", label: "Day open ($)", fmt: F.fmtMoney, axis: "US dollars" },
    { key: "prev_close", label: "Previous close ($)", fmt: F.fmtMoney, axis: "US dollars" },
  ];

  /* ---------- chart theme ---------- */

  function setChartDefaults() {
    const ink2 = F.cssVar("--ink-2");
    Chart.defaults.font.family = '"Barlow", system-ui, sans-serif';
    Chart.defaults.font.size = 13;
    Chart.defaults.color = ink2;
    Chart.defaults.animation = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? false : { duration: 300 };
    Chart.defaults.maintainAspectRatio = false;
    Chart.defaults.plugins.legend.display = false;
    Object.assign(Chart.defaults.plugins.tooltip, {
      backgroundColor: F.cssVar("--surface"), titleColor: F.cssVar("--ink"), bodyColor: F.cssVar("--ink"),
      borderColor: F.cssVar("--line"), borderWidth: 1, padding: 10, boxPadding: 4, usePointStyle: true,
    });
  }
  function scales(yTitle, opts = {}) {
    const grid = { color: F.cssVar("--grid") };
    const border = { color: F.cssVar("--line") };
    return {
      x: Object.assign({ grid: { display: false }, border }, opts.x || {}),
      y: Object.assign({ grid, border, title: { display: !!yTitle, text: yTitle } }, opts.y || {}),
    };
  }

  /* ---------- history helpers ---------- */

  // One row per stock per trading day. On weekends and holidays the sources
  // repeat the last trading day, so rows with the same market_date are
  // counted once (the first one recorded).
  function tradingDays(rows) {
    const seen = new Set();
    return rows.filter((r) => {
      const key = r.item_id + "|" + (r.market_date || r.date);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  function byItem(rows) {
    const out = {};
    rows.forEach((r) => { (out[r.item_id] = out[r.item_id] || []).push(r); });
    return out;
  }
  function mean(xs) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; }

  // Change in close since tracking began, for each stock.
  // Start: the close on the trading day before the first run (prev_close in
  // the stock's first row), or that row's close if prev_close is empty.
  function sinceStart(rows) {
    return Object.entries(byItem(rows)).map(([id, list]) => {
      const first = list[0], last = list[list.length - 1];
      const base = first.prev_close != null ? first.prev_close : first.close;
      const pct = base && last.close != null ? ((last.close - base) / base) * 100 : null;
      return { item_id: id, item: last.item, category: last.category, base, baseDate: first.date, last: last.close, lastDate: last.date, pct };
    }).filter((x) => x.pct != null);
  }

  /* ---------- explorer chart ---------- */

  function itemStyles(rows) {
    const latest = {};
    rows.forEach((r) => { latest[r.item_id] = r; });
    const list = Object.values(latest).sort((a, b) =>
      F.CATEGORIES.findIndex((c) => c.name === a.category) - F.CATEGORIES.findIndex((c) => c.name === b.category) || a.item_id.localeCompare(b.item_id));
    const countInCat = {};
    return list.map((r) => {
      const n = countInCat[r.category] = (countInCat[r.category] || 0) + 1;
      return { item_id: r.item_id, item: r.item, category: r.category, color: F.categoryColor(r.category), dash: DASHES[(n - 1) % DASHES.length] };
    });
  }

  function swatch(color, dash) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", "26"); svg.setAttribute("height", "10"); svg.setAttribute("aria-hidden", "true");
    const line = document.createElementNS(ns, "line");
    Object.entries({ x1: 1, y1: 5, x2: 25, y2: 5, stroke: color, "stroke-width": 3, "stroke-linecap": "round", "stroke-dasharray": dash.join(" ") })
      .forEach(([k, v]) => line.setAttribute(k, v));
    svg.append(line);
    return svg;
  }

  function explorer(rows) {
    const styles = itemStyles(rows);
    const ds = F.dates(rows);
    const lookup = {};
    rows.forEach((r) => { lookup[r.item_id + "|" + r.date] = r; });
    const firstClose = {};
    rows.forEach((r) => { if (firstClose[r.item_id] == null && r.close != null) firstClose[r.item_id] = r.close; });

    METRICS.forEach((m) => $("metric").append(el("option", { value: m.key, text: m.label })));

    const picker = $("picker");
    styles.forEach((s) => {
      picker.append(el("label", { class: "pick", title: s.item + " (" + s.category + ")" },
        el("input", { type: "checkbox", value: s.item_id, checked: true }),
        swatch(s.color, s.dash), s.item_id));
    });

    const chart = new Chart($("explore-chart"), { type: "line", data: { labels: ds.map(F.fmtShortDate), datasets: [] },
      options: { interaction: { mode: "index", intersect: false }, scales: scales(""), plugins: { tooltip: {} } } });

    function update() {
      const metric = METRICS.find((m) => m.key === $("metric").value);
      const chosen = new Set([...picker.querySelectorAll("input:checked")].map((i) => i.value));
      chart.data.datasets = styles.filter((s) => chosen.has(s.item_id)).map((s) => ({
        label: s.item_id + " " + s.item,
        data: ds.map((d) => {
          const r = lookup[s.item_id + "|" + d];
          if (!r) return null;
          if (metric.key === "indexed") return r.close != null && firstClose[s.item_id] ? (r.close / firstClose[s.item_id]) * 100 : null;
          return r[metric.key];
        }),
        borderColor: s.color, backgroundColor: s.color, borderDash: s.dash, borderWidth: 2,
        pointRadius: ds.length > 30 ? 0 : 3.5, pointHoverRadius: 5, pointBorderColor: F.cssVar("--surface"), pointBorderWidth: 1,
        tension: 0, spanGaps: false,
      }));
      chart.options.scales.y.title = { display: true, text: metric.axis };
      chart.options.scales.y.ticks = { callback: (v) => metric.fmt(v) };
      chart.options.plugins.tooltip.itemSort = (a, b) => (b.parsed.y ?? -Infinity) - (a.parsed.y ?? -Infinity);
      chart.options.plugins.tooltip.callbacks = { label: (c) => " " + metric.fmt(c.parsed.y) + "  " + c.dataset.label };
      chart.update();
      $("explore-note").textContent = chosen.size + " of " + styles.length + " stocks shown · " + ds.length + " day(s) of history" +
        (ds.length < 2 ? ". Lines appear once there are two or more days." : ".") +
        (metric.key === "indexed" ? " Index: each stock's close divided by its close on its first day, times 100." : "");
    }

    $("metric").addEventListener("change", update);
    picker.addEventListener("change", update);
    document.querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", () => {
      const starred = F.getShortlist();
      picker.querySelectorAll("input").forEach((i) => {
        i.checked = b.dataset.pick === "all" || (b.dataset.pick === "starred" && starred.has(i.value));
      });
      update();
    }));
    update();
  }

  /* ---------- findings ---------- */

  function finding(id, heading, explain, how, chartHeight) {
    const canvas = el("canvas", { id: id + "-chart", role: "img", "aria-label": heading });
    const details = el("details", { class: "numbers" }, el("summary", { text: "Show the numbers" }));
    const section = el("section", { class: "finding", "aria-labelledby": id + "-h" },
      el("h2", { id: id + "-h", text: heading }),
      el("p", { class: "explain", text: explain }),
      el("div", { class: "panel" },
        el("div", { class: "chart-box", style: "height:" + chartHeight + "px" }, canvas),
        details),
      el("p", { class: "how", text: "How it is computed: " + how }));
    $("findings").append(section);
    return { canvas, details };
  }

  function numbersTable(details, headers, rows) {
    details.append(el("div", { class: "table-wrap" }, el("table", {},
      el("thead", {}, el("tr", {}, headers.map((h, i) => el("th", { scope: "col", class: i ? "n" : null, text: h })))),
      el("tbody", {}, rows.map((r) => el("tr", {}, r.map((v, i) => el("td", { class: i ? "n" : null, text: v }))))))));
  }

  function hBar(canvas, labels, values, colors, fmt, axisTitle) {
    return new Chart(canvas, {
      type: "bar",
      data: { labels, datasets: [{ data: values, backgroundColor: colors, borderRadius: 4, borderSkipped: "start", barPercentage: 0.9, categoryPercentage: 0.85, maxBarThickness: 22 }] },
      options: {
        indexAxis: "y",
        scales: scales("", { x: { grid: { color: F.cssVar("--grid") }, ticks: { callback: (v) => fmt(v) }, title: { display: true, text: axisTitle } }, y: { grid: { display: false } } }),
        plugins: { tooltip: { callbacks: { label: (c) => " " + fmt(c.parsed.x) } } },
      },
    });
  }
  const barHeight = (n) => Math.max(180, n * 28 + 70);
  const signColor = (v) => (v >= 0 ? F.cssVar("--pos-bar") : F.cssVar("--neg-bar"));
  const pctWords = (v) => (v >= 0 ? "up " : "down ") + Math.abs(v).toFixed(2) + "%";

  function findingSinceStart(rows, firstDate, lastDate) {
    const list = sinceStart(rows).sort((a, b) => b.pct - a.pct);
    if (!list.length) return;
    const best = list[0], worst = list[list.length - 1];
    const ups = list.filter((x) => x.pct > 0).length;
    const heading = best.item + " has gained the most since tracking began; " + worst.item + " has lost the most";
    const explain = "From the close before the first run on " + F.fmtDate(firstDate) + " to the latest close on " + F.fmtDate(lastDate) +
      ", " + best.item + " (" + best.item_id + ") went from " + F.fmtMoney(best.base) + " to " + F.fmtMoney(best.last) + ", " + pctWords(best.pct) +
      ". " + worst.item + " (" + worst.item_id + ") went from " + F.fmtMoney(worst.base) + " to " + F.fmtMoney(worst.last) + ", " + pctWords(worst.pct) +
      ". " + ups + " of " + list.length + " stocks are higher than where they started.";
    const how = "for each stock, (latest close − starting close) ÷ starting close × 100. The starting close is the prev_close value in the stock's first row of history.csv (its close on the trading day before the first run); the latest close is the close value in its last row.";
    const f = finding("since-start", heading, explain, how, barHeight(list.length));
    hBar(f.canvas, list.map((x) => x.item_id + " " + x.item), list.map((x) => x.pct), list.map((x) => signColor(x.pct)), F.fmtPct, "Change since tracking began (%)");
    numbersTable(f.details, ["Stock", "Starting close", "Latest close", "Change"],
      list.map((x) => [x.item_id + " " + x.item, F.fmtMoney(x.base), F.fmtMoney(x.last), F.fmtPct(x.pct)]));
    return list;
  }

  function findingBiggestDay(rows) {
    const tdays = tradingDays(rows).filter((r) => r.change_pct != null);
    if (!tdays.length) return;
    const top = tdays.slice().sort((a, b) => Math.abs(b.change_pct) - Math.abs(a.change_pct) || a.item_id.localeCompare(b.item_id))[0];
    // The biggest move on each trading day, for the chart.
    const perDay = {};
    tdays.forEach((r) => {
      const d = r.market_date || r.date;
      if (!perDay[d] || Math.abs(r.change_pct) > Math.abs(perDay[d].change_pct)) perDay[d] = r;
    });
    const days = Object.keys(perDay).sort();
    const heading = top.item + "’s " + F.fmtPct(top.change_pct) + " on " + F.fmtDate(top.market_date) + " is the biggest one-day move so far";
    const explain = "On " + F.fmtDate(top.market_date) + ", " + top.item + " (" + top.item_id + ") closed at " + F.fmtMoney(top.close) +
      " after closing at " + F.fmtMoney(top.prev_close) + " the trading day before, a change of " + F.fmtSignedMoney(top.change) +
      " (" + F.fmtPct(top.change_pct) + "). That is the largest move, up or down, among " + tdays.length + " stock-days across " + days.length + " trading day(s). The chart shows the biggest mover on each trading day.";
    const how = "rows of history.csv with the same item_id and market_date are counted once (weekends repeat Friday's prices). Among those, the row with the largest absolute change_pct wins; change_pct = (close − prev_close) ÷ prev_close × 100 as reported by the source.";
    const f = finding("biggest-day", heading, explain, how, 320);
    new Chart(f.canvas, {
      type: "bar",
      data: { labels: days.map(F.fmtShortDate), datasets: [{ data: days.map((d) => perDay[d].change_pct),
        backgroundColor: days.map((d) => signColor(perDay[d].change_pct)), borderRadius: 4, borderSkipped: "start", maxBarThickness: 44 }] },
      options: {
        scales: scales("Biggest move that day (%)", { y: { ticks: { callback: (v) => F.fmtPct(v, 1) } } }),
        plugins: { tooltip: { callbacks: { label: (c) => " " + F.fmtPct(c.parsed.y) + "  " + perDay[days[c.dataIndex]].item_id + " " + perDay[days[c.dataIndex]].item } } },
      },
    });
    numbersTable(f.details, ["Trading day", "Biggest mover", "Close", "Change"],
      days.map((d) => [F.fmtDate(d), perDay[d].item_id + " " + perDay[d].item, F.fmtMoney(perDay[d].close), F.fmtPct(perDay[d].change_pct)]));
  }

  function findingCategories(list, firstDate) {
    if (!list || !list.length) return;
    const cats = F.CATEGORIES.map((c) => {
      const members = list.filter((x) => x.category === c.name);
      return { name: c.name, n: members.length, avg: mean(members.map((x) => x.pct)), members };
    }).filter((c) => c.n).sort((a, b) => b.avg - a.avg);
    const best = cats[0], worst = cats[cats.length - 1];
    const heading = best.name + " stocks have done best as a group; " + worst.name + " have done worst";
    const explain = "Averaging the change since " + F.fmtDate(firstDate) + " across the stocks in each category, " + best.name + " (" + best.members.map((m) => m.item_id).join(", ") + ") average " +
      F.fmtPct(best.avg) + ", while " + worst.name + " (" + worst.members.map((m) => m.item_id).join(", ") + ") average " + F.fmtPct(worst.avg) +
      ". The gap between the best and worst group is " + Math.abs(best.avg - worst.avg).toFixed(2) + " percentage points.";
    const how = "the plain average of each stock's change since tracking began (from the first finding) over the stocks in the category column of history.csv. Each stock counts equally, whatever its price.";
    const f = finding("categories", heading, explain, how, barHeight(cats.length));
    hBar(f.canvas, cats.map((c) => c.name), cats.map((c) => c.avg), cats.map((c) => F.categoryColor(c.name)), F.fmtPct, "Average change since tracking began (%)");
    numbersTable(f.details, ["Category", "Stocks", "Average change"], cats.map((c) => [c.name, String(c.n), F.fmtPct(c.avg)]));
  }

  function findingVolatility(rows) {
    const tdays = tradingDays(rows).filter((r) => r.change_pct != null);
    const list = Object.entries(byItem(tdays)).map(([id, rs]) => ({
      item_id: id, item: rs[0].item, n: rs.length, avg: mean(rs.map((r) => Math.abs(r.change_pct))),
    })).sort((a, b) => b.avg - a.avg);
    if (!list.length) return;
    const most = list[0], least = list[list.length - 1];
    const ratio = least.avg > 0 ? (most.avg / least.avg).toFixed(1) : null;
    const heading = most.item + " swings the most, about " + most.avg.toFixed(2) + "% a day; " + least.item + " is the steadiest";
    const explain = "On an average trading day, " + most.item + " (" + most.item_id + ") moves " + most.avg.toFixed(2) + "% up or down, while " +
      least.item + " (" + least.item_id + ") moves " + least.avg.toFixed(2) + "%" + (ratio ? ", so the most jumpy stock moves about " + ratio + " times as much as the steadiest." : ".") +
      " Based on " + most.n + " trading day(s) per stock.";
    const how = "for each stock, the average of the absolute change_pct values over its trading days in history.csv (one row per item_id and market_date, so weekends are not counted twice).";
    const f = finding("volatility", heading, explain, how, barHeight(list.length));
    hBar(f.canvas, list.map((x) => x.item_id + " " + x.item), list.map((x) => x.avg), F.cssVar("--seq-bar"), (v) => v.toFixed(2) + "%", "Average daily move, up or down (%)");
    numbersTable(f.details, ["Stock", "Trading days", "Average daily move"], list.map((x) => [x.item_id + " " + x.item, String(x.n), x.avg.toFixed(2) + "%"]));
  }

  function findingDollarVolume(rows) {
    const tdays = tradingDays(rows).filter((r) => r.volume != null && r.close != null);
    const list = Object.entries(byItem(tdays)).map(([id, rs]) => ({
      item_id: id, item: rs[0].item, n: rs.length, avg: mean(rs.map((r) => r.close * r.volume)), shares: mean(rs.map((r) => r.volume)),
    })).sort((a, b) => b.avg - a.avg);
    if (!list.length) return;
    const top = list[0], low = list[list.length - 1];
    const total = list.reduce((a, x) => a + x.avg, 0);
    const heading = top.item + " is the most traded: about $" + F.fmtCompact(top.avg) + " of its stock changes hands each day";
    const explain = top.item + " (" + top.item_id + ") averages " + F.fmtCompact(top.shares) + " shares a day at its closing prices, worth about $" + F.fmtCompact(top.avg) +
      ", or " + ((top.avg / total) * 100).toFixed(0) + "% of the dollar volume across all " + list.length + " stocks. The least traded, " + low.item + " (" + low.item_id + "), averages about $" + F.fmtCompact(low.avg) + " a day.";
    const how = "for each trading day, close × volume from history.csv (dollar volume), then the average over the stock's trading days. Days without a volume value (Finnhub rows) are skipped.";
    const f = finding("dollar-volume", heading, explain, how, barHeight(list.length));
    hBar(f.canvas, list.map((x) => x.item_id + " " + x.item), list.map((x) => x.avg), F.cssVar("--seq-bar"), (v) => "$" + F.fmtCompact(v), "Average dollar volume per day");
    numbersTable(f.details, ["Stock", "Average shares a day", "Average dollar volume"], list.map((x) => [x.item_id + " " + x.item, F.fmtCompact(x.shares), "$" + F.fmtCompact(x.avg)]));
  }

  F.loadData().then(({ rows }) => {
    setChartDefaults();
    const ds = F.dates(rows);
    $("trends-intro").textContent = "Every number on this page is calculated in your browser from data/history.csv, which now covers " +
      ds.length + " day(s), " + F.fmtDate(ds[0]) + " to " + F.fmtDate(ds[ds.length - 1]) + ". The page updates as the history grows.";
    explorer(rows);
    const list = findingSinceStart(rows, ds[0], ds[ds.length - 1]);
    findingBiggestDay(rows);
    findingCategories(list, ds[0]);
    findingVolatility(rows);
    findingDollarVolume(rows);
  }).catch(F.showError);
})();
