/* Browse page: filters, search, sort by every numeric column, and stars. */

(function () {
  "use strict";
  const F = window.FT;
  const { el } = F;

  // Numeric columns shown in the table. Every one can be sorted up and down.
  const COLS = [
    { key: "close", label: "Close", fmt: F.fmtMoney, cls: "price" },
    { key: "run_pct", label: "Since last run (%)", fmt: F.fmtPct, colored: true, cls: "perf key" },
    { key: "run_change", label: "Since last run ($)", fmt: F.fmtSignedMoney, colored: true, cls: "perf" },
    { key: "change_pct", label: "Market day (%)", fmt: F.fmtPct, colored: true, cls: "perf" },
    { key: "high", label: "Day high", fmt: F.fmtMoney, cls: "split" },
    { key: "low", label: "Day low", fmt: F.fmtMoney },
    { key: "volume", label: "Volume", fmt: F.fmtInt },
  ];

  const state = { sortKey: "item_id", sortDir: 1, starred: F.getShortlist() };
  let items = [];

  const $ = (id) => document.getElementById(id);

  function build(rows) {
    const m = F.computeMoves(rows);
    items = Object.values(m.latest).map((r) => {
      const mv = m.byId[r.item_id];
      return Object.assign({}, r, { run_change: mv ? mv.change : null, run_pct: mv ? mv.move_pct : null });
    });
    const cats = F.CATEGORIES.map((c) => c.name).filter((c) => items.some((i) => i.category === c));
    cats.forEach((c) => $("f-category").append(el("option", { value: c, text: c })));
    [...new Set(items.map((i) => i.source))].sort().forEach((s) => $("f-source").append(el("option", { value: s, text: s })));
  }

  function filtered() {
    const q = $("q").value.trim().toLowerCase();
    const cat = $("f-category").value;
    const dir = $("f-direction").value;
    const src = $("f-source").value;
    const min = $("f-min").value === "" ? null : Number($("f-min").value);
    const max = $("f-max").value === "" ? null : Number($("f-max").value);
    const starredOnly = $("f-starred").checked;
    return items.filter((i) =>
      (!q || i.item.toLowerCase().includes(q) || i.item_id.toLowerCase().includes(q)) &&
      (!cat || i.category === cat) &&
      (!src || i.source === src) &&
      (!dir || (dir === "up" ? i.run_pct > 0 : i.run_pct < 0)) &&
      (min == null || (i.close != null && i.close >= min)) &&
      (max == null || (i.close != null && i.close <= max)) &&
      (!starredOnly || state.starred.has(i.item_id)));
  }

  function sorted(list) {
    const k = state.sortKey, d = state.sortDir;
    return list.slice().sort((a, b) => {
      const x = a[k], y = b[k];
      if (k === "item_id") return d * x.localeCompare(y);
      if (x == null && y == null) return a.item_id.localeCompare(b.item_id);
      if (x == null) return 1; // empty values always go last
      if (y == null) return -1;
      return d * (x - y) || a.item_id.localeCompare(b.item_id);
    });
  }

  function toggleStar(id) {
    if (state.starred.has(id)) state.starred.delete(id); else state.starred.add(id);
    F.saveShortlist(state.starred);
    render();
  }

  function sortHeader(key, label, numeric, cls) {
    const active = state.sortKey === key;
    const th = el("th", { scope: "col", class: [numeric ? "n" : "", cls || ""].join(" ").trim() || null,
      "aria-sort": active ? (state.sortDir === 1 ? "ascending" : "descending") : null });
    th.append(el("button", { type: "button", class: "sort",
      "aria-label": "Sort by " + label + (active && state.sortDir === 1 ? ", high to low" : ", low to high"),
      onclick: () => {
        if (state.sortKey === key) state.sortDir *= -1;
        else { state.sortKey = key; state.sortDir = numeric ? -1 : 1; }
        render();
      } }, label, el("span", { class: "arrow", "aria-hidden": "true" })));
    return th;
  }

  function renderShortlist() {
    const box = $("shortlist");
    const ids = [...state.starred].filter((id) => items.some((i) => i.item_id === id)).sort();
    box.replaceChildren(el("span", { class: "title", text: "★ Shortlist" }));
    if (!ids.length) {
      box.append(el("span", { class: "company", text: "Empty. Click the star next to a stock to add it." }));
      return;
    }
    ids.forEach((id) => {
      const it = items.find((i) => i.item_id === id);
      box.append(el("span", { class: "chip" },
        el("span", { text: id + " " + F.fmtMoney(it.close) }),
        el("button", { type: "button", "aria-label": "Remove " + it.item + " from shortlist", onclick: () => toggleStar(id), text: "✕" })));
    });
  }

  function render() {
    const list = sorted(filtered());
    $("count").textContent = "Showing " + list.length + " of " + items.length + " stocks.";
    const head = el("tr", {},
      el("th", { scope: "col", class: "col-star" }, el("span", { class: "visually-hidden", text: "Star" })),
      sortHeader("item_id", "Stock", false, "col-stock"),
      COLS.map((c) => sortHeader(c.key, c.label, true, c.cls === "split" ? "split" : "")),
      el("th", { scope: "col", text: "Category" }),
      el("th", { scope: "col", text: "Source" }));
    const body = list.map((i) => {
      const on = state.starred.has(i.item_id);
      return el("tr", {},
        el("td", { class: "col-star" }, el("button", { type: "button", class: "star", "aria-pressed": on ? "true" : "false",
          "aria-label": (on ? "Remove " : "Add ") + i.item + (on ? " from" : " to") + " shortlist",
          onclick: () => toggleStar(i.item_id), text: on ? "★" : "☆" })),
        el("td", { class: "stock" }, el("span", { class: "ticker", text: i.item_id }), el("span", { class: "company", text: i.item })),
        COLS.map((c) => el("td", { class: "n " + c.cls + (c.colored ? " " + F.dirClass(i[c.key]) : ""), text: c.fmt(i[c.key]) })),
        el("td", {}, F.categoryTag(i.category)),
        el("td", { class: "company", text: i.source }));
    });
    const table = el("table", { class: "board" },
      el("caption", { class: "visually-hidden", text: "Latest values, filtered and sorted" }),
      el("thead", {}, head), el("tbody", {}, body));
    if (!list.length) $("table").replaceChildren(el("p", { class: "empty", text: "No stocks match these filters. Clear a filter to see more." }));
    else $("table").replaceChildren(table);
    renderShortlist();
  }

  F.loadData().then(({ rows }) => {
    build(rows);
    ["q", "f-category", "f-direction", "f-source", "f-min", "f-max", "f-starred"].forEach((id) =>
      $(id).addEventListener("input", render));
    $("clear-filters").addEventListener("click", () => { $("filters").reset(); render(); });
    render();
  }).catch(F.showError);
})();
