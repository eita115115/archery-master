"use strict";
/* 的ノート: Stats tab (Phase 2) */

function ensureStatsFilter() {
  if (!ui.statsFilter) ui.statsFilter = statsDefaultFilter();
  return ui.statsFilter;
}

function renderStats(m) {
  const sf = ensureStatsFilter();
  const all = db.sessions || [];
  const filtered = filterSessionsByStatsFilter(all, sf);
  const overview = statsOverview(all, sf);
  const dists = [...new Set(all.map((s) => s.dist).filter(Boolean))].sort((a, b) => b - a);
  const timeSeries = filterSessionsByStatsFilter(all, sf).map(sessionSummaryRow).reverse();
  const lineData = timeSeries.map((r) => ({ label: r.date, value: r.total }));
  const barData = buildDistanceBarData(all, sf).map((b) => ({
    label: b.label,
    value: b.avgTotal,
    color: "var(--teal)",
  }));
  const hist = buildScoreHistogram(all, sf);
  const periodOpts = STATS_PERIODS.map((p) => `<option value="${p.id}" ${sf.period === p.id ? "selected" : ""}>${p.label}</option>`).join("");

  m.innerHTML = `
  <section class="pageHero statsHero">
    <div class="kicker">統計</div>
    <h2>距離・弓種・期間で上達を読む</h2>
    <p>前回選んだ距離を記憶し、平均点・Xs・最高スコアを期間で比較できます。</p>
  </section>
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
  <section class="card statsOverview">
    <div class="heroMetrics">
      ${heroMetricHtml("練習", `${overview.sessions}回`, `${overview.arrows}本`)}
      ${heroMetricHtml("平均/本", overview.arrows ? overview.avg.toFixed(2) : "—", "フィルター後")}
      ${heroMetricHtml("最高", overview.best || "—", "セッション合計")}
      ${heroMetricHtml("X率", overview.arrows ? `${Math.round(overview.xRate * 100)}%` : "—", `Hits ${overview.arrows ? Math.round(overview.hitRate * 100) : 0}%`)}
    </div>
  </section>
  <section class="card chartCard">
    <h2>スコア推移 <span class="mini">${filtered.length}回</span></h2>
    <div class="chartWrap">${lineChartSvg(lineData, { title: "スコア推移", color: "var(--green)" })}</div>
  </section>
  <section class="card chartCard">
    <h2>距離別平均 <span class="mini">セッション合計点</span></h2>
    <div class="chartWrap">${barChartSvg(barData, { title: "距離別平均" })}</div>
  </section>
  <section class="card chartCard">
    <h2>得点分布 <span class="mini">全${hist.total}本</span></h2>
    <div class="histBars">${scoreHistogramHtml(hist)}</div>
  </section>
  <section class="card">
    <h2>セッション一覧 <span class="mini">${filtered.length}件</span></h2>
    ${filtered.length ? filtered.slice(0, 12).map((s) => {
    const r = sessionSummaryRow(s);
    return `<button class="listItem" type="button" data-stats-open="${esc(s.id)}">
      <span><b>${fmtD(r.date)}</b> ${r.dist}m / ${bowTypeLabel(r.bowType)}</span>
      <span class="mini">${r.total}点 · X${r.xCount}</span>
    </button>`;
  }).join("") : `<div class="empty">該当する記録がありません</div>`}
  </section>`;

  function applyFilter() {
    sf.period = $("#statsPeriod").value;
    sf.dist = $("#statsDist").value;
    sf.bowType = $("#statsBow").value;
    sf.dateFrom = $("#statsFrom") ? $("#statsFrom").value : "";
    sf.dateTo = $("#statsTo") ? $("#statsTo").value : "";
    if (sf.dist) db.settings.lastSelectedDistance = +sf.dist;
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
  $("#statsReset").onclick = () => { ui.statsFilter = statsDefaultFilter(); render(); };
  document.querySelectorAll("[data-stats-open]").forEach((b) => b.onclick = () => openHistDetail(b.dataset.statsOpen));
}