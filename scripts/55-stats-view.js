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

function statsPracticeDays(sessions) {
  return new Set((sessions || []).map((s) => s.date).filter(Boolean)).size;
}

function statsPeriodPillsHtml(sf) {
  return `<div class="an-pillRow" id="statsPeriodPills" role="tablist" aria-label="期間">
    ${STATS_PERIODS.map((p) => `<button type="button" class="an-pill${sf.period === p.id ? " on" : ""}" data-stats-period="${p.id}" role="tab" aria-selected="${sf.period === p.id}">${p.label}</button>`).join("")}
    <button type="button" class="an-pill${sf.period === "custom" ? " on" : ""}" data-stats-period="custom" role="tab" aria-selected="${sf.period === "custom"}">カスタム</button>
  </div>`;
}

function statsSummaryHeroHtml(overview, filtered) {
  const avg = overview.arrows ? overview.avg : null;
  const accumulating = filtered.length < 2;
  return `<section class="an-heroCard" aria-label="平均スコア">
    <p class="an-heroLabel">平均 / 1射</p>
    <p class="an-heroValue">${avg != null ? avg.toFixed(2) : "—"}${avg != null ? `<span class="an-heroSub">/ 10.00</span>` : ""}</p>
    ${accumulating ? `<span class="an-dataBadge">データ蓄積中</span>` : ""}
  </section>
  <div class="an-metricGrid" aria-label="概要">
    <div class="an-metricTile"><span class="k">総ラウンド</span><p class="v">${overview.sessions || 0}</p></div>
    <div class="an-metricTile"><span class="k">総射数</span><p class="v">${overview.arrows || 0}</p></div>
    <div class="an-metricTile"><span class="k">練習日数</span><p class="v">${statsPracticeDays(filtered)}</p></div>
    <div class="an-metricTile an-metricTile--accent"><span class="k">最高スコア</span><p class="v">${overview.best || "—"}</p></div>
  </div>`;
}

function statsTrendCardHtml(filtered, lineData) {
  const ready = filtered.length >= 2;
  return `<section class="an-chartCard">
    <h3>ラウンドごとの推移</h3>
    ${ready ? `<p class="sub">合計点と移動平均</p>` : ""}
    ${ready
      ? `<div class="chartWrap">${dualLineChartSvg(lineData, { title: "スコア推移", color: "var(--green)" })}</div>`
      : `<div class="an-chartEmpty">${filtered.length ? "もう1ラウンドで表示されます" : "2ラウンド以上で表示されます"}</div>`}
  </section>`;
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
  <div class="an-screenHead">
    <h2 class="an-screenTitle">サマリー</h2>
    <button class="an-screenAction" id="statsReset" type="button" aria-label="フィルタをリセット"><svg class="ic-svg" viewBox="0 0 24 24"><use href="ui/icons.svg#ic-history"/></svg></button>
  </div>
  ${statsPeriodPillsHtml(sf)}
  <div class="an-pillRow an-pillRow--wrap" id="statsDistPills" role="tablist" aria-label="距離">
    <button type="button" class="an-pill${!sf.dist ? " on" : ""}" data-stats-dist="">すべて</button>
    ${dists.map((d) => `<button type="button" class="an-pill${String(sf.dist) === String(d) ? " on" : ""}" data-stats-dist="${d}">${d}m</button>`).join("")}
  </div>
  <div class="row" id="statsCustomRange" style="display:${sf.period === "custom" ? "flex" : "none"};margin-bottom:var(--ui-space-3)">
    <div><label class="f">開始</label><input class="inp" type="date" id="statsFrom" value="${esc(sf.dateFrom || "")}"></div>
    <div><label class="f">終了</label><input class="inp" type="date" id="statsTo" value="${esc(sf.dateTo || "")}"></div>
  </div>
  <select class="inp" id="statsPeriod" hidden>${periodOpts}<option value="custom" ${sf.period === "custom" ? "selected" : ""}>カスタム</option></select>
  <select class="inp" id="statsDist" hidden><option value="">すべて</option>${dists.map((d) => `<option value="${d}" ${String(sf.dist) === String(d) ? "selected" : ""}>${d}m</option>`).join("")}</select>
  <select class="inp" id="statsBow" hidden><option value="">すべて</option>${BOW_TYPES.map((b) => `<option value="${b.id}" ${sf.bowType === b.id ? "selected" : ""}>${b.label}</option>`).join("")}</select>
  ${badgeSample && typeof badgeProgressBannerHtml === "function" ? badgeProgressBannerHtml(badgeSample, all) : ""}
  ${statsSummaryHeroHtml(overview, filtered)}
  ${statsTrendCardHtml(filtered, lineData)}
  <details class="an-advancedStats">
    <summary>グラフと内訳を見る</summary>
  <section class="card statsCompare">
    <h2>今月 vs 先月</h2>
    <div class="heroMetrics ds-metricsBoard">
      ${heroMetricHtml("今月", periodCmp.cur.sessions ? periodCmp.cur.avg.toFixed(1) : "—", `${periodCmp.cur.sessions}回`)}
      ${heroMetricHtml("先月", periodCmp.prev.sessions ? periodCmp.prev.avg.toFixed(1) : "—", `${periodCmp.prev.sessions}回`)}
      ${heroMetricHtml("差分", periodCmp.cur.sessions && periodCmp.prev.sessions ? `${periodCmp.delta >= 0 ? "+" : ""}${periodCmp.delta.toFixed(1)}` : "—", "セッション平均")}
    </div>
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
  </section>
  </details>`;

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

  document.querySelectorAll("[data-stats-period]").forEach((btn) => {
    btn.onclick = () => {
      sf.period = btn.dataset.statsPeriod;
      if ($("#statsPeriod")) $("#statsPeriod").value = sf.period;
      const custom = $("#statsCustomRange");
      if (custom) custom.style.display = sf.period === "custom" ? "flex" : "none";
      applyFilter();
    };
  });
  document.querySelectorAll("[data-stats-dist]").forEach((btn) => {
    btn.onclick = () => {
      sf.dist = btn.dataset.statsDist || "";
      if ($("#statsDist")) $("#statsDist").value = sf.dist;
      applyFilter();
    };
  });
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
