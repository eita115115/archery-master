"use strict";
/* 的ノート: home tab */

function weekArrowCount(){
  if(typeof periodDateRange!=="function") return 0;
  const range=periodDateRange("week");
  return (db.sessions||[]).filter(s=>(s.date||"")>=range.start&&(s.date||"")<=range.end)
    .reduce((sum,s)=>sum+(typeof sessionArrowCount==="function"?sessionArrowCount(s):sessionArrows(s).length),0);
}
function dashCompactHtml(){
  const weekArrows=weekArrowCount();
  const recent5=[...db.sessions].sort((a,b)=>(b.date||"").localeCompare(a.date||"")||(b.id<a.id?-1:1)).slice(0,5);
  const recentTotals=recent5.filter(s=>s.purpose!=="volume").map(s=>sessionStats(s).total);
  const avg5=recentTotals.length?recentTotals.reduce((a,x)=>a+x,0)/recentTotals.length:null;
  const lastScored=[...db.sessions].reverse().find(s=>s.purpose!=="volume");
  const condKey=lastScored&&typeof sessionBestKey==="function"?sessionBestKey(lastScored):"";
  const condBest=condKey&&typeof personalBestForKey==="function"?personalBestForKey(condKey,db.sessions):null;
  const weekVal=weekArrows||null;
  const avgVal=avg5!=null?avg5.toFixed(1):null;
  const bestVal=condBest!=null?condBest:null;
  return `<section class="dashBoard dashCompact card" aria-label="練習の概況">
    <div class="dashHero">
      <p class="dashHeroLabel">今週</p>
      <p class="dashHeroValue">${weekVal??"—"}${weekVal?`<span class="dashHeroUnit">本</span>`:""}</p>
      ${weekVal?"":`<p class="dashHeroHint">記録後に表示</p>`}
    </div>
    <div class="dashAside">
      <div class="dashMetric">
        <p class="k">直近5R 平均</p>
        <p class="dashMetricVal">${avgVal??"—"}</p>
      </div>
      <div class="dashMetric dashMetric--accent">
        <p class="k">同条件 最高</p>
        <p class="dashMetricVal" data-hud="personalBest">${bestVal??"—"}</p>
      </div>
    </div>
  </section>`;
}
function maybeAnimateHomeBest(){
  const pending=ui.pendingBestCelebrate;
  if(!pending||typeof animateMetric!=="function"||!uiRefreshActive()) return;
  const el=document.querySelector('[data-hud="personalBest"]');
  if(el&&pending.prev!=null&&pending.total>pending.prev) animateMetric(el,pending.prev,pending.total,520);
  ui.pendingBestCelebrate=null;
}
function homeDashboardHtml(){
  return dashCompactHtml();
}
function renderHome(m){
  const last=db.sessions[db.sessions.length-1];
  const defSetup=last?last.setupId:(db.setups[0]?db.setups[0].id:"");
  const defDist=last?last.dist:(db.settings.lastSelectedDistance||db.settings.defaultDistance||70);
  const mode=ui.recordMode||"practice";
  const defFace=suggestedFaceValue(defDist,last);
  const recent=db.sessions.slice(-3).reverse();
  const recentHtml=recent.length?`<section class="card homeRecent"><h2>最近の記録</h2>${recent.map(s=>`
    <button class="listItem" type="button" data-open-sess="${esc(s.id)}">
      <span><b>${fmtD(s.date)}</b> ${s.dist}m / ${bowTypeLabel(s.bowType)}</span>
      <span class="mini">${s.purpose==="volume"?`${sessionArrowCount(s)}本`:sessionStats(s).total+"点"}</span>
    </button>`).join("")}</section>`:"";
  const setup=db.setups.find(s=>s.id===defSetup);
  const condPreview=`${defDist}m · ${actionFaceLabel(defFace)}${setup?` · ${setup.name}`:` · 用具未指定`}`;
  const ctx={last,defSetup,defDist,defFace,mode,onStart:()=>showView("record")};
  m.innerHTML=`
  ${dashCompactHtml()}
  ${recordFastActionsHtml(last,defDist,defFace,setup)}
  ${recentHtml}
  <button class="listItem homeConditions ds-conditions" type="button" id="openConditions">
    <span class="ds-conditionsBody">
      <span class="ds-conditionsLabel">条件を変える</span>
      <span class="ds-conditionsMeta ds-truncate">${esc(condPreview)}</span>
    </span>
  </button>`;
  $("#quickStart").onclick=()=>quickStartSession(ctx);
  $("#openConditions").onclick=()=>openLaunchSheet(ctx);
  const quickHistory=$("#quickHistory");
  if(quickHistory) quickHistory.onclick=()=>showView("history");
  if(last) $("#quickRepeat").onclick=()=>repeatLastSession(last,ctx);
  document.querySelectorAll("[data-open-sess]").forEach(b=>b.onclick=()=>{
    ui.histOpen=b.dataset.openSess; showView("history");
  });
  maybeAnimateHomeBest();
}

function renderRecordIdle(m){
  m.innerHTML=`<section class="card idlePrompt ds-emptyState">
    <span class="ds-emptyBadge">記録は未開始</span>
    <img class="idleIcon" src="icon.svg" width="48" height="48" alt="">
    <p class="idleLead">ホームの「今日の記録を始める」から開始できます</p>
    <button class="btn startPrimary" id="goHome" type="button">ホームへ</button>
  </section>`;
  $("#goHome").onclick=()=>{ view="home"; render(); };
}
