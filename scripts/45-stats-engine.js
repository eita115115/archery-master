"use strict";
/* 的ノート: stats aggregation and chart primitives */

const STATS_PERIODS = Object.freeze([
  { id: "today", label: "今日" },
  { id: "week", label: "今週" },
  { id: "month", label: "今月" },
  { id: "year", label: "今年" },
  { id: "all", label: "全期間" },
]);

function statsDefaultFilter() {
  const s = db.settings || {};
  return {
    period: "all",
    dist: s.lastSelectedDistance ? String(s.lastSelectedDistance) : "",
    bowType: s.defaultBowType || "",
    dateFrom: "",
    dateTo: "",
  };
}

function periodDateRange(period) {
  const end = today();
  if (period === "all") return { start: null, end: null };
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  if (period === "today") return { start: end, end };
  if (period === "week") {
    const w = new Date(d);
    w.setDate(d.getDate() - 6);
    return { start: iso(w), end };
  }
  if (period === "month") {
    const m = new Date(d.getFullYear(), d.getMonth(), 1);
    return { start: iso(m), end };
  }
  if (period === "year") {
    const y = new Date(d.getFullYear(), 0, 1);
    return { start: iso(y), end };
  }
  return { start: null, end: null };
}

function filterSessionsByStatsFilter(sessions, filter) {
  const f = filter || statsDefaultFilter();
  const range = f.period === "custom"
    ? { start: f.dateFrom || null, end: f.dateTo || null }
    : periodDateRange(f.period || "all");
  return (sessions || []).filter((s) => {
    const date = s.date || "";
    if (range.start && date < range.start) return false;
    if (range.end && date > range.end) return false;
    if (f.dist && String(s.dist) !== String(f.dist)) return false;
    if (f.bowType && (s.bowType || "") !== f.bowType) return false;
    return (s.ends || []).some((end) => end && end.length);
  }).sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.id < a.id ? -1 : 1));
}

function sessionSummaryRow(s) {
  const arrows = (s.ends || []).flat();
  const stats = aggregateSessionStats(arrows);
  return {
    id: s.id,
    date: s.date || "",
    dist: s.dist,
    bowType: s.bowType || "",
    environment: s.environment || "",
    total: stats.total,
    avg: stats.avg,
    xCount: stats.xCount,
    tenCount: stats.tenCount,
    hitCount: stats.hitCount,
    count: stats.count,
    ends: (s.ends || []).length,
  };
}

function buildTimeSeries(sessions) {
  return filterSessionsByStatsFilter(sessions, null).map(sessionSummaryRow).reverse();
}

function buildDistanceBarData(sessions, filter) {
  const rows = filterSessionsByStatsFilter(sessions, filter).map(sessionSummaryRow);
  const by = {};
  rows.forEach((r) => {
    const key = String(r.dist || "?");
    if (!by[key]) by[key] = { dist: r.dist, totals: [], avgs: [], count: 0 };
    by[key].totals.push(r.total);
    by[key].avgs.push(r.avg);
    by[key].count += 1;
  });
  return Object.values(by)
    .map((g) => ({
      dist: g.dist,
      label: `${g.dist}m`,
      avgTotal: g.totals.reduce((a, x) => a + x, 0) / g.totals.length,
      avgArrow: g.avgs.reduce((a, x) => a + x, 0) / g.avgs.length,
      sessions: g.count,
      best: Math.max(...g.totals),
    }))
    .sort((a, b) => (b.dist || 0) - (a.dist || 0));
}

function buildScoreHistogram(sessions, filter) {
  const keys = ["X", "10", "9", "8", "7", "6", "5", "4", "3", "2", "1", "M"];
  const cnt = {};
  keys.forEach((k) => { cnt[k] = 0; });
  filterSessionsByStatsFilter(sessions, filter).forEach((s) => {
    (s.ends || []).flat().forEach((a) => {
      const k = a.s === 0 ? "M" : (a.X ? "X" : String(a.s));
      if (cnt[k] != null) cnt[k] += 1;
    });
  });
  const total = keys.reduce((sum, k) => sum + cnt[k], 0);
  return { keys, cnt, total };
}

function statsOverview(sessions, filter) {
  const rows = filterSessionsByStatsFilter(sessions, filter).map(sessionSummaryRow);
  if (!rows.length) {
    return { sessions: 0, arrows: 0, avg: 0, best: 0, xRate: 0, hitRate: 0 };
  }
  const arrows = rows.reduce((a, r) => a + r.count, 0);
  const total = rows.reduce((a, r) => a + r.total, 0);
  const xs = rows.reduce((a, r) => a + r.xCount, 0);
  const hits = rows.reduce((a, r) => a + r.hitCount, 0);
  return {
    sessions: rows.length,
    arrows,
    avg: arrows ? total / arrows : 0,
    best: Math.max(...rows.map((r) => r.total)),
    xRate: arrows ? xs / arrows : 0,
    hitRate: arrows ? hits / arrows : 0,
  };
}

function lineChartSvg(series, opts) {
  opts = opts || {};
  const W = opts.width || 320;
  const H = opts.height || 140;
  const pad = { l: 34, r: 10, t: 12, b: 28 };
  const pts = series || [];
  if (!pts.length) {
    return `<svg viewBox="0 0 ${W} ${H}" class="chartSvg emptyChart"><text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="var(--sub)" font-size="12">データがありません</text></svg>`;
  }
  const values = pts.map((p) => p.value);
  const min = opts.yMin != null ? opts.yMin : Math.min(...values);
  const max = opts.yMax != null ? opts.yMax : Math.max(...values);
  const span = (max - min) || 1;
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const path = pts.map((p, i) => {
    const x = pad.l + (pts.length === 1 ? innerW / 2 : (i / (pts.length - 1)) * innerW);
    const y = pad.t + innerH - ((p.value - min) / span) * innerH;
    return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join("");
  const dots = pts.map((p, i) => {
    const x = pad.l + (pts.length === 1 ? innerW / 2 : (i / (pts.length - 1)) * innerW);
    const y = pad.t + innerH - ((p.value - min) / span) * innerH;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="${opts.color || "var(--green)"}"/>`;
  }).join("");
  const yTicks = [min, min + span / 2, max].map((v, i) => {
    const y = pad.t + innerH - ((v - min) / span) * innerH;
    return `<text x="${pad.l - 6}" y="${y + 4}" text-anchor="end" font-size="10" fill="var(--sub)">${v.toFixed(i === 1 ? 1 : 0)}</text>`;
  }).join("");
  const xLabels = pts.length <= 8
    ? pts.map((p, i) => {
      const x = pad.l + (pts.length === 1 ? innerW / 2 : (i / (pts.length - 1)) * innerW);
      const label = (p.label || "").slice(5).replace("-", "/");
      return `<text x="${x}" y="${H - 8}" text-anchor="middle" font-size="9" fill="var(--sub)">${esc(label)}</text>`;
    }).join("")
    : "";
  return `<svg viewBox="0 0 ${W} ${H}" class="chartSvg" role="img" aria-label="${esc(opts.title || "推移")}">
    <line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${H - pad.b}" stroke="var(--line)" stroke-width="1"/>
    <line x1="${pad.l}" y1="${H - pad.b}" x2="${W - pad.r}" y2="${H - pad.b}" stroke="var(--line)" stroke-width="1"/>
    ${yTicks}
    <path d="${path}" fill="none" stroke="${opts.color || "var(--green)"}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${dots}
    ${xLabels}
  </svg>`;
}

function barChartSvg(bars, opts) {
  opts = opts || {};
  const W = opts.width || 320;
  const H = opts.height || 160;
  const pad = { l: 34, r: 10, t: 12, b: 36 };
  const items = bars || [];
  if (!items.length) {
    return `<svg viewBox="0 0 ${W} ${H}" class="chartSvg emptyChart"><text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="var(--sub)" font-size="12">データがありません</text></svg>`;
  }
  const max = Math.max(...items.map((b) => b.value), 1);
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const gap = 8;
  const barW = Math.max(12, (innerW - gap * (items.length - 1)) / items.length);
  const rects = items.map((b, i) => {
    const h = (b.value / max) * innerH;
    const x = pad.l + i * (barW + gap);
    const y = pad.t + innerH - h;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="4" fill="${b.color || "var(--green-l)"}"/>
      <text x="${(x + barW / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="var(--title)">${b.value.toFixed(1)}</text>
      <text x="${(x + barW / 2).toFixed(1)}" y="${H - 10}" text-anchor="middle" font-size="10" fill="var(--sub)">${esc(b.label)}</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" class="chartSvg" role="img" aria-label="${esc(opts.title || "棒グラフ")}">
    <line x1="${pad.l}" y1="${pad.t + innerH}" x2="${W - pad.r}" y2="${pad.t + innerH}" stroke="var(--line)" stroke-width="1"/>
    ${rects}
  </svg>`;
}

function buildMovingAverageSeries(sessions, filter, windowSize) {
  const rows = filterSessionsByStatsFilter(sessions, filter).map(sessionSummaryRow).reverse();
  const totals = rows.map((r) => r.total);
  const ma = movingAverage(totals, windowSize || 3);
  return rows.map((r, i) => ({ label: r.date, value: r.total, ma: ma[i] }));
}

function buildBowTypeBarData(sessions, filter) {
  const rows = filterSessionsByStatsFilter(sessions, filter).map(sessionSummaryRow);
  const by = {};
  rows.forEach((r) => {
    const key = r.bowType || "unknown";
    if (!by[key]) by[key] = { bowType: key, totals: [], count: 0 };
    by[key].totals.push(r.total);
    by[key].count += 1;
  });
  return Object.values(by).map((g) => ({
    label: bowTypeLabel(g.bowType),
    value: g.totals.reduce((a, x) => a + x, 0) / g.totals.length,
    sessions: g.count,
    color: "var(--mint)",
  })).sort((a, b) => b.value - a.value);
}

function buildPeriodComparison(sessions) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  const thisStart = iso(new Date(now.getFullYear(), now.getMonth(), 1));
  const lastStart = iso(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const lastEnd = iso(new Date(now.getFullYear(), now.getMonth(), 0));
  const cur = sessions.filter((s) => (s.date || "") >= thisStart);
  const prev = sessions.filter((s) => (s.date || "") >= lastStart && (s.date || "") <= lastEnd);
  const curAvg = cur.length ? cur.map(sessionSummaryRow).reduce((a, r) => a + r.total, 0) / cur.length : 0;
  const prevAvg = prev.length ? prev.map(sessionSummaryRow).reduce((a, r) => a + r.total, 0) / prev.length : 0;
  const delta = curAvg - prevAvg;
  return { cur: { sessions: cur.length, avg: curAvg }, prev: { sessions: prev.length, avg: prevAvg }, delta };
}

function dualLineChartSvg(series, opts) {
  opts = opts || {};
  const primary = (series || []).map((p) => ({ label: p.label, value: p.value }));
  const secondary = (series || []).filter((p) => p.ma != null).map((p) => ({ label: p.label, value: p.ma }));
  if (!secondary.length) return lineChartSvg(primary, opts);
  const W = opts.width || 320;
  const H = opts.height || 150;
  const base = lineChartSvg(primary, { ...opts, height: H });
  const values = [...primary, ...secondary].map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = { l: 34, r: 10, t: 12, b: 28 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const span = (max - min) || 1;
  const maPath = secondary.map((p, i) => {
    const x = pad.l + (secondary.length === 1 ? innerW / 2 : (i / (secondary.length - 1)) * innerW);
    const y = pad.t + innerH - ((p.value - min) / span) * innerH;
    return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join("");
  return base.replace("</svg>", `<path d="${maPath}" fill="none" stroke="var(--teal)" stroke-width="2" stroke-dasharray="5 4" opacity=".85"/><text x="${W - 8}" y="14" text-anchor="end" font-size="9" fill="var(--teal)">移動平均</text></svg>`);
}

function scoreHistogramHtml(hist) {
  const max = Math.max(...hist.keys.map((k) => hist.cnt[k]), 1);
  return hist.keys.filter((k) => hist.cnt[k] > 0 || ["X", "10", "9", "8", "7", "M"].includes(k)).map((k) => {
    const z = gridZoneStyle(k);
    const pct = hist.total ? (hist.cnt[k] / hist.total * 100).toFixed(0) : 0;
    return `<div class="histBarRow">
      <div class="histBarKey" style="background:${z.bg};color:${z.fg}">${k}</div>
      <div class="histBarTrack"><i style="width:${(hist.cnt[k] / max * 100).toFixed(1)}%"></i></div>
      <div class="histBarVal">${hist.cnt[k]} <span>${pct}%</span></div>
    </div>`;
  }).join("");
}

if (typeof window !== "undefined") {
  window.ArcherStats = {
    STATS_PERIODS,
    statsDefaultFilter,
    filterSessionsByStatsFilter,
    buildTimeSeries,
    buildDistanceBarData,
    buildScoreHistogram,
    statsOverview,
    lineChartSvg,
    barChartSvg,
    scoreHistogramHtml,
    sessionSummaryRow,
    buildMovingAverageSeries,
    buildBowTypeBarData,
    buildPeriodComparison,
    dualLineChartSvg,
  };
}