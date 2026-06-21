"use strict";
/* 的ノート: Stats tab (Phase 2) */

function scoredLatestForBadge(sessions, filter) {
  const rows = filterSessionsByStatsFilter(sessions, filter).filter((s) => s.purpose !== "volume");
  return rows.length ? rows[rows.length - 1] : null;
}

function ensureStatsFilter() {
  if (!ui.statsFilter) {
    ui.statsFilter = (db.settings && db.settings.statsFilter) ? Object.assign(statsDefaultFilter(), db.settings.statsFilter) : statsDefaultFilter();
  }
  return ui.statsFilter;
}

function renderStats(m) {
  const sf = ensureStatsFilter();
  const all = db.sessions || [];
  const filtered = filterSessionsByStatsFilter(all, sf);
  const overview = statsOverview(all, sf);
  const dists = [...new Set(all.map((s) => s.dist).filter(Boolean))].sort((a, b) => b - a);
  const timeSeries = filterSessionsByStatsFilter(all, sf).map(sessionSummaryRow).reverse();
  const maSeries = buildMovingAverageSeries(all, sf, 3);
  const lineData = maSeries.map((r) => ({ label: r.date, value: r.total, ma: r.ma }));
  const bowBars = buildBowTypeBarData(all, sf);
  const periodCmp = buildPeriodComparison(all);
  const barData = buildDistanceBarData(all, sf).map((b) => ({
    label: b.label,
    value: b.avgTotal,
    color: "var(--teal)",
  }));
  const hist = buildScoreHistogram(all, sf);
  const spotStats = groupBySpotStats(all, sf);
  const spotIdStats = typeof groupBySpotIdStats === "function" ? groupBySpotIdStats(all, sf) : [];
  const hasSpot = spotStats.some((s) => s.count > 0);
  const hasSpotId = spotIdStats.some((s) => s.count > 0);
  const badgeSample = scoredLatestForBadge(all, sf);
  const periodOpts = STATS_PERIODS.map((p) => `<option value="${p.id}" ${sf.period === p.id ? "selected" : ""}>${p.label}</option>`).join("");

  m.innerHTML = `
  <section class="card statsFilters">
    <div class="row">
      <div><label class="f">期間</label><select class="inp" id="statsPeriod">${periodOpts}<option value="custom" ${sf.period === "custom" ? "selected" : ""}>カスタム</option></select></div>
      <div><label class="f">距離</label><select class="inp" id="statsDist"><option value="">すべて</option>${dists.map((d) => `<option value="${d}" ${String(sf.dist) === String(d) ? "selected" : ""}>${d}m</option>`).join("")}</select></div>
    </div>
    <div class="row" id="statsCustomRange" style="display:${sf.period === "custom" ? "flex" : "none"}">
      <div><label class="f">開始</label><input class="inp" type="date" id="statsFrom" value="${esc(sf.dateFrom || "")}"></div>
      <div><label class="f">終了</label><input class="inp" type="date" id="statsTo" value="${esc(sf.dateTo || "")}"></div>
    </div>
    <div class="row">
      <div><label class="f">弓種</label><select class="inp" id="statsBow"><option value="">すべて</option>${BOW_TYPES.map((b) => `<option value="${b.id}" ${sf.bowType === b.id ? "selected" : ""}>${b.label}</option>`).join("")}</select></div>
      <div style="display:flex;align-items:flex-end"><button class="btn ghost" id="statsReset" type="button">リセット</button></div>
    </div>
  </section>
  ${badgeSample && typeof badgeProgressBannerHtml === "function" ? badgeProgressBannerHtml(badgeSample, all) : ""}
  <section class="card statsOverview">
    <div class="heroMetrics ds-metricsBoard">
      ${heroMetricHtml("練習", `${overview.sessions}回`, `${overview.arrows}本`)}
      ${heroMetricHtml("平均/本", overview.arrows ? overview.avg.toFixed(2) : "—", "フィルター後")}
      ${heroMetricHtml("最高", overview.best || "—", "セッション合計")}
      ${heroMetricHtml("X率", overview.arrows ? `${Math.round(overview.xRate * 100)}%` : "—", `的中 ${overview.arrows ? Math.round(overview.hitRate * 100) : 0}%`)}
    </div>
  </section>
  <section class="card statsCompare">
    <h2>今月 vs 先月</h2>
    <div class="heroMetrics ds-metricsBoard">
      ${heroMetricHtml("今月", periodCmp.cur.sessions ? periodCmp.cur.avg.toFixed(1) : "—", `${periodCmp.cur.sessions}回`)}
      ${heroMetricHtml("先月", periodCmp.prev.sessions ? periodCmp.prev.avg.toFixed(1) : "—", `${periodCmp.prev.sessions}回`)}
      ${heroMetricHtml("差分", periodCmp.cur.sessions && periodCmp.prev.sessions ? `${periodCmp.delta >= 0 ? "+" : ""}${periodCmp.delta.toFixed(1)}` : "—", "セッション平均")}
    </div>
  </section>
  <section class="card chartCard">
    <h2>スコア推移 <span class="mini">${filtered.length}回 · 3回移動平均</span></h2>
    <div class="chartWrap">${dualLineChartSvg(lineData, { title: "スコア推移", color: "var(--green)" })}</div>
  </section>
  ${bowBars.length ? `<section class="card chartCard"><h2>弓種別平均</h2><div class="chartWrap">${barChartSvg(bowBars, { title: "弓種別" })}</div></section>` : ""}
  <section class="card chartCard">
    <h2>距離別平均 <span class="mini">セッション合計点</span></h2>
    <div class="chartWrap">${barChartSvg(barData, { title: "距離別平均" })}</div>
  </section>
  <section class="card chartCard">
    <h2>得点分布 <span class="mini">全${hist.total}本</span></h2>
    <div class="histBars">${scoreHistogramHtml(hist)}</div>
  </section>
  ${hasSpot ? `<section class="card chartCard">
    <h2>三つ目スポット別 <span class="mini">上・中・下</span></h2>
    <div class="chartWrap">${barChartSvg(spotStats.filter((s) => s.count > 0).map((s) => ({ label: s.label, value: s.avg, color: "var(--gold)" })), { title: "スポット別平均" })}</div>
    <div class="heroMetrics">${spotStats.map((s) => heroMetricHtml(s.label, s.count ? s.avg.toFixed(2) : "—", `${s.count}本`)).join("")}</div>
  </section>` : ""}
  ${hasSpotId ? `<section class="card chartCard">
    <h2>インドア列別 <span class="mini">A/B/C/D</span></h2>
    <div class="chartWrap">${barChartSvg(spotIdStats.filter((s) => s.count > 0).map((s) => ({ label: s.label, value: s.avg, color: "var(--teal)" })), { title: "列別平均" })}</div>
    <div class="heroMetrics">${spotIdStats.map((s) => heroMetricHtml(s.label, s.count ? s.avg.toFixed(2) : "—", `${s.count}本`)).join("")}</div>
  </section>` : ""}
  <section class="card">
    <h2>セッション一覧 <span class="mini">${filtered.length}件</span></h2>
    ${filtered.length ? filtered.slice(0, 12).map((s) => {
    const r = sessionSummaryRow(s);
    return `<button class="listItem" type="button" data-stats-open="${esc(s.id)}">
      <span><b>${fmtD(r.date)}</b> ${r.dist}m / ${bowTypeLabel(r.bowType)}</span>
      <span class="mini">${r.total}点 · X${r.xCount}</span>
    </button>`;
  }).join("") : `<div class="empty ds-emptyBlock">該当する記録がありません<button class="btn sec sm" type="button" id="statsEmptyReset">フィルタをリセット</button></div>`}
  </section>`;

  function applyFilter() {
    sf.period = $("#statsPeriod").value;
    sf.dist = $("#statsDist").value;
    sf.bowType = $("#statsBow").value;
    sf.dateFrom = $("#statsFrom") ? $("#statsFrom").value : "";
    sf.dateTo = $("#statsTo") ? $("#statsTo").value : "";
    if (sf.dist) db.settings.lastSelectedDistance = +sf.dist;
    db.settings.statsFilter = { period: sf.period, dist: sf.dist, bowType: sf.bowType, dateFrom: sf.dateFrom || "", dateTo: sf.dateTo || "" };
    save("stats-filter");
    render();
  }

  $("#statsPeriod").onchange = () => {
    const custom = $("#statsCustomRange");
    if (custom) custom.style.display = $("#statsPeriod").value === "custom" ? "flex" : "none";
    applyFilter();
  };
  $("#statsDist").onchange = applyFilter;
  $("#statsBow").onchange = applyFilter;
  if ($("#statsFrom")) $("#statsFrom").onchange = applyFilter;
  if ($("#statsTo")) $("#statsTo").onchange = applyFilter;
  const resetStatsFilter=()=>{
    ui.statsFilter = statsDefaultFilter();
    db.settings.statsFilter = { period: ui.statsFilter.period, dist: ui.statsFilter.dist, bowType: ui.statsFilter.bowType, dateFrom: "", dateTo: "" };
    save("stats-filter-reset");
    render();
  };
  $("#statsReset").onclick = resetStatsFilter;
  const statsEmptyReset=$("#statsEmptyReset");
  if(statsEmptyReset) statsEmptyReset.onclick=resetStatsFilter;
  document.querySelectorAll("[data-stats-open]").forEach((b) => b.onclick = () => openHistDetail(b.dataset.statsOpen));
  if (typeof mountBadgeRings === "function") mountBadgeRings(m);
}