"use strict";
/* 的ノート: home tab */

function homeDashboardHtml(){
  const today=today();
  const todaySessions=db.sessions.filter(s=>s.date===today);
  const todayBest=todaySessions.length?Math.max(...todaySessions.map(s=>aggregateSessionStats(sessionArrows(s)).total)):null;
  const recent5=[...db.sessions].sort((a,b)=>(b.date||"").localeCompare(a.date||"")||(b.id<a.id?-1:1)).slice(0,5);
  const recentTotals=recent5.map(s=>aggregateSessionStats(sessionArrows(s)).total);
  const avg5=recentTotals.length?recentTotals.reduce((a,x)=>a+x,0)/recentTotals.length:null;
  const prev5=[...db.sessions].sort((a,b)=>(b.date||"").localeCompare(a.date||"")||(b.id<a.id?-1:1)).slice(5,10);
  const prevAvg=prev5.length?prev5.map(s=>aggregateSessionStats(sessionArrows(s)).total).reduce((a,x)=>a+x,0)/prev5.length:null;
  let deltaHtml="—";
  if(avg5!=null && prevAvg!=null){
    const d=avg5-prevAvg;
    const sign=d>=0?"▲":"▼";
    deltaHtml=`${sign} ${Math.abs(d).toFixed(1)}`;
  }else if(avg5!=null){
    deltaHtml="初回記録";
  }
  return `<section class="dashHero card">
    <div class="dashBest"><div class="k">本日のベスト</div><b>${todayBest!=null?todayBest:"—"}</b><span>点</span></div>
    <div class="dashAvg"><div class="k">直近5R平均</div><b>${avg5!=null?avg5.toFixed(1):"—"}</b><span class="dashDelta">${deltaHtml}</span></div>
  </section>`;
}
function renderHome(m){
  const last=db.sessions[db.sessions.length-1];
  const defSetup=last?last.setupId:(db.setups[0]?db.setups[0].id:"");
  const defDist=last?last.dist:(db.settings.lastSelectedDistance||db.settings.defaultDistance||70);
  const mode=ui.recordMode||"practice";
  const defFace=suggestedFaceValue(defDist,last);
  const sys=setupSystemSummary(defSetup);
  const recent=db.sessions.slice(-3).reverse();
  const recentHtml=recent.length?`<section class="card homeRecent"><h2>最近の記録</h2>${recent.map(s=>`
    <button class="listItem" type="button" data-open-sess="${esc(s.id)}">
      <span><b>${fmtD(s.date)}</b> ${s.dist}m / ${bowTypeLabel(s.bowType)}</span>
      <span class="mini">${aggregateSessionStats(sessionArrows(s)).total}点</span>
    </button>`).join("")}</section>`:"";
  m.innerHTML=`
  ${homeDashboardHtml()}
  ${recordFastActionsHtml(last,defDist,defFace)}
  ${recentHtml}
  <details class="adv homeMore">
    <summary>詳しく使う</summary>
    ${recordIntroHtml(sys,mode)}
  </details>
  <div id="homeLaunchMount"></div>`;
  const mount=$("#homeLaunchMount");
  if(mount) renderRecordSetup(mount,{last,defSetup,defDist,defFace,mode,onStart:()=>showView("record")});
  document.querySelectorAll("#flowMode .flowBtn").forEach(b=>b.onclick=()=>{
    if(b.dataset.mode==="diagnosis"){ openToolSheet("sight"); return; }
    ui.recordMode=b.dataset.mode; render();
  });
  $("#quickStart").onclick=()=>{ const btn=$("#fStart"); if(btn) btn.click(); };
  const quickHistory=$("#quickHistory");
  if(quickHistory) quickHistory.onclick=()=>showView("history");
  if(last){
    $("#quickRepeat").onclick=()=>{
      const rep=$("#quickRepeatGo");
      if(rep) rep.click();
    };
  }
  document.querySelectorAll("[data-open-sess]").forEach(b=>b.onclick=()=>{
    ui.histOpen=b.dataset.openSess; showView("history");
  });
}

function renderRecordIdle(m){
  m.innerHTML=`<section class="card idlePrompt">
    <div class="idleIcon">◎</div>
    <h2>まだ記録は始まっていません</h2>
    <p>ホームで距離を選び、「今日の記録を始める」をタップしてください。</p>
    <button class="btn startPrimary" id="goHome" type="button">ホームへ</button>
  </section>`;
  $("#goHome").onclick=()=>{ view="home"; render(); };
}
