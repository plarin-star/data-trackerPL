/* Shared code for all three pages: loading the data files, the move rule,
   number formatting, category colors, and the service worker.
   Every page includes this file first, then its own script. */

(function () {
  "use strict";

  const NUMERIC = ["close", "change", "change_pct", "open", "high", "low", "prev_close", "volume"];

  // Category order and plate color (CSS variable) for each category.
  const CATEGORIES = [
    { name: "Gyms & Studios", cssVar: "--cat-gyms" },
    { name: "Apparel & Footwear", cssVar: "--cat-apparel" },
    { name: "Equipment & Wearables", cssVar: "--cat-equipment" },
    { name: "Sporting Goods Retail", cssVar: "--cat-retail" },
    { name: "Fitness Nutrition", cssVar: "--cat-nutrition" },
  ];

  /* ---------- CSV ---------- */

  // A small CSV reader that understands quoted fields.
  function parseCSV(text) {
    const rows = [];
    let row = [], field = "", inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') inQuotes = false;
        else field += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); rows.push(row); row = []; field = "";
      } else field += c;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    const header = rows.shift() || [];
    return rows
      .filter((r) => r.length === header.length)
      .map((r) => {
        const obj = {};
        header.forEach((h, i) => {
          const v = r[i];
          obj[h] = NUMERIC.includes(h) ? (v === "" ? null : Number(v)) : v;
        });
        return obj;
      });
  }

  /* ---------- loading the data files ---------- */

  // Online: fetch from the network ("no-cache" makes the browser check for a
  // newer copy). Offline: the service worker answers with the last copy it saved.
  async function loadData() {
    const opts = { cache: "no-cache" };
    const [histResp, statusResp] = await Promise.all([
      fetch("data/history.csv", opts),
      fetch("data/status.json", opts),
    ]);
    if (!histResp.ok || !statusResp.ok) {
      throw new Error("The data files could not be loaded (history " + histResp.status + ", status " + statusResp.status + ").");
    }
    const rows = parseCSV(await histResp.text());
    const status = await statusResp.json();
    showOfflineNotice(status);
    return { rows, status };
  }

  function showOfflineNotice(status) {
    const box = document.getElementById("offline-notice");
    if (!box) return;
    if (navigator.onLine === false) {
      box.textContent = "You are offline. Showing the data saved from the run at " + fmtTime(status.run_time) + ".";
      box.hidden = false;
    }
  }

  /* ---------- history helpers ---------- */

  function dates(rows) {
    return [...new Set(rows.map((r) => r.date))].sort();
  }

  function rowsOn(rows, date) {
    const out = {};
    rows.forEach((r) => { if (r.date === date) out[r.item_id] = r; });
    return out;
  }

  // The move rule (same as tracker/moves.py and the README):
  // compare the latest date in history.csv with the date before it.
  // move % = (new close - old close) / old close * 100, ranked by size.
  function computeMoves(rows) {
    const ds = dates(rows);
    const latestDate = ds[ds.length - 1] || null;
    const previousDate = ds.length >= 2 ? ds[ds.length - 2] : null;
    const latest = latestDate ? rowsOn(rows, latestDate) : {};
    const previous = previousDate ? rowsOn(rows, previousDate) : {};
    const moves = [];
    if (previousDate) {
      Object.keys(latest).sort().forEach((id) => {
        const old = previous[id] ? previous[id].close : null;
        const now = latest[id].close;
        if (old == null || old === 0 || now == null) return;
        moves.push({
          item_id: id, item: latest[id].item, category: latest[id].category,
          old_close: old, new_close: now, change: now - old,
          move_pct: ((now - old) / old) * 100,
        });
      });
      moves.sort((a, b) => Math.abs(b.move_pct) - Math.abs(a.move_pct) || a.item_id.localeCompare(b.item_id));
    }
    return {
      latestDate, previousDate, latest, previous, moves,
      byId: Object.fromEntries(moves.map((m) => [m.item_id, m])),
      newItems: previousDate ? Object.keys(latest).filter((id) => !previous[id]).sort() : [],
      goneItems: previousDate ? Object.keys(previous).filter((id) => !latest[id]).sort() : [],
    };
  }

  /* ---------- formatting ---------- */

  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

  function fmtMoney(v) { return v == null ? "—" : money.format(v); }
  function fmtSignedMoney(v) { return v == null ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + money.format(Math.abs(v)); }
  function fmtPct(v, digits = 2) { return v == null ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(digits) + "%"; }
  function fmtInt(v) { return v == null ? "—" : whole.format(v); }
  function fmtCompact(v) {
    if (v == null) return "—";
    const a = Math.abs(v);
    if (a >= 1e9) return (v / 1e9).toFixed(2) + "B";
    if (a >= 1e6) return (v / 1e6).toFixed(1) + "M";
    if (a >= 1e3) return (v / 1e3).toFixed(1) + "K";
    return whole.format(v);
  }
  function fmtDate(d) {
    if (!d) return "—";
    const [y, m, day] = d.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  }
  function fmtShortDate(d) {
    const [y, m, day] = d.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  }
  function fmtTime(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  }
  function dirClass(v) { return v == null || Math.abs(v) < 1e-9 ? "flat" : v > 0 ? "up" : "down"; }
  function arrow(v) { return v == null || Math.abs(v) < 1e-9 ? "" : v > 0 ? "▲ " : "▼ "; }

  /* ---------- colors ---------- */

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function categoryVar(category) {
    const c = CATEGORIES.find((x) => x.name === category);
    return c ? c.cssVar : "--muted";
  }
  function categoryColor(category) { return cssVar(categoryVar(category)); }

  /* ---------- small DOM helpers ---------- */

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k === "style") node.setAttribute("style", v);
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? "" : v);
    });
    children.flat().forEach((c) => {
      if (c == null || c === false) return;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    });
    return node;
  }

  function categoryTag(category) {
    return el("span", { class: "cat-tag" },
      el("span", { class: "plate", style: "--plate: var(" + categoryVar(category) + ")", "aria-hidden": "true" }),
      category);
  }

  function showError(err) {
    const main = document.querySelector("main");
    const box = el("div", { class: "notice", role: "alert" },
      "The data could not be loaded. " + (err && err.message ? err.message : "") +
      " Try reloading the page. If you are offline, open the site once while online so it can save a copy.");
    main.prepend(box);
    console.error(err);
  }

  /* ---------- shortlist (stars) saved in the browser ---------- */

  const STAR_KEY = "fitness-tracker-shortlist";
  function getShortlist() {
    try { return new Set(JSON.parse(localStorage.getItem(STAR_KEY) || "[]")); }
    catch (e) { return new Set(); }
  }
  function saveShortlist(set) {
    try { localStorage.setItem(STAR_KEY, JSON.stringify([...set].sort())); } catch (e) { /* storage blocked */ }
  }

  /* ---------- service worker (installable app + offline) ---------- */

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch((e) => console.warn("Service worker not registered:", e));
    });
  }

  window.FT = {
    CATEGORIES, NUMERIC, parseCSV, loadData, dates, rowsOn, computeMoves,
    fmtMoney, fmtSignedMoney, fmtPct, fmtInt, fmtCompact, fmtDate, fmtShortDate, fmtTime,
    dirClass, arrow, cssVar, categoryVar, categoryColor, el, categoryTag, showError,
    getShortlist, saveShortlist,
  };
})();
