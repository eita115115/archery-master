"use strict";
/* Archery-master: 分析タブ — サイト調整・射形トラッキング */

function analysisSummaryHtml(){
  const last=[...db.sessions].reverse().find(s=>{
    if(s.purpose==="volume") return false;
    const n=(s.ends||[]).reduce((sum,e)=>sum+(e&&e.length?e.length:0),0)+(s.cur&&s.cur.length?s.cur.length:0);
    return n>=6;
  });
  if(!last) return `<div class="an-limitBanner" role="status"><span aria-hidden="true">◎</span><span>6本以上記録すると、サイト調整の提案がここに表示されます。</span></div>`;
  const setup=db.setups.find(x=>x.id===last.setupId);
  const adv=typeof adviceFor==="function"?adviceFor(last,setup):null;
  const judgement=adv&&typeof judgementFor==="function"?judgementFor(adv,last):null;
  if(!judgement) return "";
  const tone=judgement.tone==="ok"?"an-analysisHero--ok":judgement.tone==="warn"?"an-analysisHero--warn":"";
  return `<section class="an-analysisHero card ${tone}" aria-label="直近の判断">
    <p class="an-analysisHeroK">直近の判断 · ${fmtD(last.date)} ${last.dist}m</p>
    <p class="an-analysisHeroV">${esc(judgement.label)}</p>
    <p class="an-analysisHeroSub">${esc(judgement.text)}</p>
  </section>`;
}

function renderAnalysis(m){
  m=m||$("#main");
  if(!m) return;
  if(!ui.analysisSub) ui.analysisSub="sight";
  const sub=ui.analysisSub;
  if(sub!=="form"&&typeof stopFormCoach==="function") stopFormCoach();
  m.innerHTML=`
  <div class="an-screenHead">
    <h2 class="an-screenTitle">分析</h2>
  </div>
  ${analysisSummaryHtml()}
  <div class="an-pillRow an-analysisSubTabs" id="analysisSubTabs" role="tablist" aria-label="分析の種類">
    <button type="button" class="an-pill an-analysisPill${sub==="sight"?" on":""}" data-analysis-sub="sight" role="tab" aria-selected="${sub==="sight"}">
      <span class="an-analysisPillIcon" aria-hidden="true">◎</span>サイト調整
    </button>
    <button type="button" class="an-pill an-analysisPill${sub==="form"?" on":""}" data-analysis-sub="form" role="tab" aria-selected="${sub==="form"}">
      <span class="an-analysisPillIcon" aria-hidden="true">▶</span>射形トラッキング
    </button>
  </div>
  <div id="analysisMount" class="an-analysisMount"></div>`;
  const mount=$("#analysisMount");
  if(sub==="form"){
    if(typeof renderFormCoachPanel==="function") renderFormCoachPanel(mount);
    else mount.innerHTML=`<section class="an-emptyState card"><p class="an-emptyTitle">射形モジュールを読み込めませんでした</p></section>`;
  }else if(typeof renderSight==="function"){
    renderSight(mount);
  }else{
    mount.innerHTML=`<section class="an-emptyState card"><p class="an-emptyTitle">サイト調整を読み込めませんでした</p></section>`;
  }
  document.querySelectorAll("[data-analysis-sub]").forEach(btn=>{
    btn.onclick=()=>{
      if(btn.dataset.analysisSub===ui.analysisSub) return;
      if(typeof stopFormCoach==="function") stopFormCoach();
      ui.analysisSub=btn.dataset.analysisSub;
      render();
    };
  });
}

function openAnalysisTab(sub){
  ui.analysisSub=sub||"sight";
  showView("analysis");
}