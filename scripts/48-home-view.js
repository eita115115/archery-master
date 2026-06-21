"use strict";
/* 的ノート: home tab */

const HOME_WEEKDAYS=["日","月","火","水","木","金","土"];

function fmtDShort(iso){
  if(!iso) return "";
  const [y,m,d]=iso.split("-");
  const dt=new Date(+y,+m-1,+d);
  const wk=HOME_WEEKDAYS[dt.getDay()]||"";
  return `${+m}/${+d} (${wk})`;
}
function homeScoreBarPct(sess){
  if(!sess||sess.purpose==="volume") return 0;
  const st=sessionStats(sess);
  if(!st.count||!st.avg) return 0;
  return Math.min(1,Math.max(0,st.avg/10));
}
function homeLocalNoticeHtml(){
  return `<div class="homeLocalNotice" role="status">
    <span class="homeLocalNoticeIcon" aria-hidden="true"><svg class="ic-svg" viewBox="0 0 24 24"><use href="ui/icons.svg#ic-cloud"/></svg></span>
    <p class="homeLocalNoticeText">記録は端末内に保存されます。バックアップは設定から行えます。</p>
  </div>`;
}
function homeSessionCardHtml(sess,opts){
  opts=opts||{};
  const hero=!!opts.hero;
  const st=sessionStats(sess);
  const arrows=sessionArrowCount(sess);
  const isVolume=sess.purpose==="volume";
  const badgeMain=isVolume?String(arrows):String(st.total);
  const badgeSub=isVolume?"本":"点";
  const barPct=homeScoreBarPct(sess);
  const avgLabel=isVolume?"":`${st.avg.toFixed(2)} / 射`;
  const scoreLabel=isVolume?`${arrows}本`:`${st.total}点`;
  return `<button class="homeSessionCard${hero?" homeSessionCard--hero":""}" type="button" data-open-sess="${esc(sess.id)}" aria-label="${esc(fmtD(sess.date))} ${sess.dist}m ${scoreLabel}">
    <span class="homeScoreBadge" aria-hidden="true">
      <span class="homeScoreBadgeNum">${badgeMain}</span>
      <span class="homeScoreBadgeUnit">${badgeSub}</span>
    </span>
    <span class="homeSessionBody">
      <span class="homeSessionTop">
        <span class="homeSessionDate">${fmtDShort(sess.date)}</span>
        <span class="homeSessionPills">
          <span class="homePill">${sess.dist}m</span>
          <span class="homePill">${arrows}射</span>
        </span>
        <span class="homeSessionChevron" aria-hidden="true"><svg class="ic-svg" viewBox="0 0 24 24"><use href="ui/icons.svg#ic-chevron-right"/></svg></span>
      </span>
      ${isVolume?"":`<span class="homeScoreTrack" aria-hidden="true"><span class="homeScoreTrackFill" style="width:${Math.round(barPct*100)}%"></span></span>`}
      ${avgLabel?`<span class="homeSessionAvg">${avgLabel}</span>`:""}
    </span>
  </button>`;
}
function homeEmptyCardHtml(){
  return `<section class="homeRecentStatus" aria-label="記録なし">
    <span class="homeRecentIcon" aria-hidden="true"><svg class="ic-svg" viewBox="0 0 24 24"><use href="ui/icons.svg#ic-history"/></svg></span>
    <p class="homeEmptyLead">まだ記録はありません</p>
  </section>`;
}
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
  return `<section class="dashBoard dashCompact homeWeekStrip" aria-label="練習の概況">
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
function homeFeedHtml(){
  const sorted=[...db.sessions].sort((a,b)=>(b.date||"").localeCompare(a.date||"")||(b.id<a.id?-1:1));
  const hero=sorted[0];
  const rest=sorted.slice(1,4);
  if(!hero) return homeEmptyCardHtml();
  const cards=[homeSessionCardHtml(hero,{hero:true}),...rest.map(s=>homeSessionCardHtml(s))];
  return `<section class="homeFeed" aria-label="最近の記録">${cards.join("")}</section>`;
}
function renderHome(m){
  const last=db.sessions[db.sessions.length-1];
  const defSetup=last?last.setupId:(db.setups[0]?db.setups[0].id:"");
  const defDist=last?last.dist:(db.settings.lastSelectedDistance||db.settings.defaultDistance||70);
  const mode=ui.recordMode||"practice";
  const defFace=suggestedFaceValue(defDist,last);
  const setup=db.setups.find(s=>s.id===defSetup);
  const condPreview=`${defDist}m · ${actionFaceLabel(defFace)}${setup?` · ${setup.name}`:` · 用具未指定`}`;
  const ctx={last,defSetup,defDist,defFace,mode,onStart:()=>showView("record")};
  m.innerHTML=`
  <section class="homeSightPanel" aria-labelledby="homeSightTitle">
    <p class="homeSightEyebrow">TODAY / SESSION</p>
    <h2 id="homeSightTitle">今日の練習</h2>
    <button class="homeSightConditions" id="openConditions" type="button" aria-label="条件を変える ${esc(condPreview)}">
      <span class="homeSightConditionIcon" aria-hidden="true"><svg class="ic-svg" viewBox="0 0 24 24"><use href="ui/icons.svg#ic-record"/></svg></span>
      <span class="homeSightConditionText ds-truncate" id="quickStartMeta">${esc(condPreview)}</span>
      <span class="homeSightConditionArrow" aria-hidden="true"><svg class="ic-svg" viewBox="0 0 24 24"><use href="ui/icons.svg#ic-chevron-right"/></svg></span>
    </button>
    <button class="homeSightStart" id="quickStart" type="button" aria-label="記録を始める">
      <span class="homeReticle" aria-hidden="true"><svg class="ic-svg" viewBox="0 0 24 24"><use href="ui/icons.svg#ic-record"/></svg></span>
      <span class="homeSightStartLabel">記録を始める</span>
    </button>
  </section>
  ${homeFeedHtml()}
  ${last?recordFastActionsHtml(last,defDist,defFace,setup):""}
  ${last?`<details class="an-advancedStats">
    <summary>週間サマリー</summary>
    ${dashCompactHtml()}
  </details>`:""}
  ${homeLocalNoticeHtml()}`;
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
  m.innerHTML=`<section class="an-emptyState card idlePrompt">
    <span class="an-emptyIcon" aria-hidden="true"><svg class="ic-svg" viewBox="0 0 24 24"><use href="ui/icons.svg#ic-record"/></svg></span>
    <p class="an-emptyTitle">記録を始める</p>
    <p class="an-emptyHint">ホームで距離と的を確認して開始します。</p>
    <button class="btn an-emptyCta" id="goHome" type="button">ホームへ</button>
  </section>`;
  $("#goHome").onclick=()=>{ view="home"; render(); };
}
