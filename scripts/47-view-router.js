"use strict";
/* 的ノート: tab routing and main render shell */

let view = "home";
let ui = {
  selArrow: -1,
  sightSel: { setupId: null, dist: 70 },
  histOpen: null,
  histFilter: { setupId: "", dist: "", round: "" },
  statsFilter: null,
  zoom: 1,
  recordMode: "practice",
  freshArrow: -1,
  freshTimer: 0,
  inputMode: "grid",
  scanBound: false,
  scanResult: null,
  gridCell: -1,
  ocrBound: false,
  formBound: false,
  pairCell: -1,
  hudSnap: null,
  pendingBestCelebrate: null,
  analysisSub: "sight",
};

function safeRender(){
  try{ render(); }
  catch(e){
    console.error(e);
    if(db&&db.active){
      db.active=null;
      if(typeof save==="function") save("render-recover-active");
      view="home";
      try{ render(); return; }catch(e2){ console.error(e2); }
    }
    if(typeof showRenderFallback==="function") showRenderFallback();
  }
}
function showView(v) {
  if (db.active && v === "home") v = "record";
  const prev = view;
  if (prev === "analysis" && v !== "analysis" && typeof stopFormCoach === "function") stopFormCoach();
  view = v;
  ui.selArrow = -1;
  if (prev !== v) nativePulse("light");
  safeRender();
}
document.querySelectorAll("#tabs button").forEach((b) => (b.onclick = () => showView(b.dataset.v)));

function render() {
  updateAppChrome();
  if (typeof syncKeepAwake === "function") syncKeepAwake();
  if (typeof syncUpdateBarVisibility === "function") syncUpdateBarVisibility();
  const tabs = Array.prototype.slice.call(document.querySelectorAll("#tabs button"));
  const effectiveView = db.active ? "record" : view;
  const activeIndex = Math.max(0, tabs.findIndex((b) => b.dataset.v === effectiveView));
  const tabBar = $("#tabs");
  if (tabBar) {
    tabBar.style.setProperty("--active-tab", activeIndex);
    tabBar.style.setProperty("--tab-count", tabs.length);
  }
  tabs.forEach((b) => {
    const on=b.dataset.v === effectiveView;
    b.classList.toggle("on", on);
    b.setAttribute("aria-current", on ? "page" : "false");
    if(db.active&&b.dataset.v==="home") b.setAttribute("aria-disabled","true");
    else b.removeAttribute("aria-disabled");
  });
  if (db.active) tabs.forEach((b) => b.classList.toggle("live", b.dataset.v === "record"));
  const m = $("#main");
  if (effectiveView === "record") {
    if (db.active) renderActive(m);
    else renderRecordIdle(m);
  } else if (effectiveView === "analysis") {
    if (typeof renderAnalysis === "function") renderAnalysis(m);
    else m.innerHTML=`<section class="an-emptyState card"><p class="an-emptyTitle">分析画面を読み込めませんでした</p><p class="an-emptyHint">再読み込みしてください。</p><button class="btn an-emptyCta" type="button" id="analysisReload">再読み込み</button></section>`;
    const reloadBtn=$("#analysisReload");
    if(reloadBtn) reloadBtn.onclick=()=>location.reload();
  }
  else if (effectiveView === "history") renderHistory(m);
  else if (effectiveView === "stats") renderStats(m);
  else renderHome(m);
  if(typeof enterViewMotion==="function") enterViewMotion(m);
  if(typeof pulseTabSpring==="function") pulseTabSpring();
}