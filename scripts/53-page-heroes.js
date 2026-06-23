"use strict";
/* 的ノート: page hero sections (history/sight/gear/live) */

function heroMetricHtml(k,b,span){
  return `<div class="heroMetric ds-metric"><p class="ds-metricLabel k">${esc(k)}</p><p class="ds-metricValue">${esc(b)}</p>${span?`<p class="ds-metricMeta">${esc(span)}</p>`:""}</div>`;
}
function pageHeroHtml(type,ctx){
  ctx=ctx||{};
  if(type==="history"){
    const src=ctx.ss||db.sessions||[];
    const arrows=src.flatMap(s=>s.ends.flat());
    const total=arrows.reduce((a,x)=>a+x.s,0);
    const latest=src[0]||null;
    return `<section class="pageHero">
      <div class="kicker">履歴</div>
      <h2>練習履歴</h2>
      <div class="heroMetrics">
        ${heroMetricHtml("練習",`${src.length}回`,`${arrows.length}本を集計`)}
        ${heroMetricHtml("平均",arrows.length?(total/arrows.length).toFixed(2):"—","フィルター後の平均点")}
        ${heroMetricHtml("直近",latest?`${fmtD(latest.date)} ${latest.dist}m`:"—",latest?roundLabel(latest.round):"記録待ち")}
      </div>
    </section>`;
  }
  if(type==="sight"){
    const setup=ctx.setup, dist=ctx.dist, marks=ctx.marks||[], adv=ctx.adv;
    const cur=marks[0];
    return `<section class="pageHero">
      <div class="kicker">サイト調整</div>
      <h2>サイト記録</h2>
      <div class="heroMetrics">
        ${heroMetricHtml("対象",setup?setup.name:"用具未指定",dist?`${dist}m`:"距離未指定")}
        ${heroMetricHtml("最新サイト",cur?`上下 ${cur.v||"—"}`:"未登録",cur?`左右 ${cur.h||"—"}`:"台帳へ記録")}
        ${heroMetricHtml("提案",adv&&adv.lines.length?adv.lines[0].text||"調整あり":"材料待ち",adv?`信頼 ${sessionQuality(ctx.lastSess||{},setup).label}`:"練習記録が必要")}
      </div>
    </section>`;
  }
  if(type==="gear"){
    const setups=db.setups||[];
    const profiles=setups.map(s=>gearPrecisionProfile(s));
    const avg=profiles.length?profiles.reduce((a,p)=>a+p.score,0)/profiles.length:0;
    const best=setups.map(s=>({s,p:gearPrecisionProfile(s),m:modelReadinessProfile(s.id)})).sort((a,b)=>(b.p.score+b.m.score)-(a.p.score+a.m.score))[0];
    return `<section class="pageHero">
      <div class="kicker">用具</div>
      <h2>用具セッティング</h2>
      <div class="heroMetrics">
        ${heroMetricHtml("登録",`${setups.length}件`,`${db.sessions.filter(s=>s.setupId).length}回の練習に接続`)}
        ${heroMetricHtml("入力材料",pct(avg),"用具データの平均充実度")}
        ${heroMetricHtml("主戦用具",best?best.s.name:"—",best?`入力 ${best.p.level} / 履歴 ${best.m.level}`:"初回セットアップ待ち")}
      </div>
    </section>`;
  }
  return "";
}
function indoorHalfBannerHtml(s){
  if(!s||!ui.indoorHalfBanner) return "";
  const ends=(s.ends||[]).length;
  const isQuadBreak=typeof isQuadSession==="function"&&isQuadSession(s)&&s.quadHalf==="second"&&ends===10;
  const isSecondMatch=s.round==="18m60_jp_x2"&&ends===20;
  const isHalfBreak=s.indoorHalf===2||(s.round==="18m60_jp_x2"&&(ends===10||ends===30))||isQuadBreak;
  if(!isHalfBreak&&!isSecondMatch) return "";
  const title=isQuadBreak?"四枚・前半終了":isSecondMatch?"1試合終了":(ends===30?"2試合目・前半終了":"前半終了");
  const body=isQuadBreak?"上下の的が入れ替わりました（上C/D・下A/B）。射る的を確認してください。":isSecondMatch?"2試合目（後半60射）を始めます。列と射る位置を確認してください。":"上下の的が入れ替わります。射る位置を確認してください。";
  return `<div class="indoorHalfBanner" id="indoorHalfBanner">
    <b>${title}</b> ${body}
    <button type="button" class="btn sm ghost" id="indoorHalfDismiss">了解</button>
  </div>`;
}
function liveSessionHeroHtml(s,setup){
  const stats=typeof sessionStats==="function"?sessionStats(s):aggregateSessionStats(sessionArrows(s));
  const isVolume=stats.volume||s.purpose==="volume";
  const timerRem=typeof timerRemainingSec==="function"?timerRemainingSec(s):null;
  const perEnd=s.perEnd||(isVolume?8:6);
  const curLen=(s.cur||[]).length;
  const remain=Math.max(0,perEnd-curLen);
  const totalEnds=roundTotalEnds(s);
  const endNum=(s.ends||[]).length+1;
  const secLabel=secondaryScoreLabel(s);
  const secCount=secondaryScoreCount(sessionArrows(s),s);
  const showX=typeof usesXScoring==="function"&&usesXScoring(s);
  const orderLbl=typeof usesAbCdHud==="function"&&usesAbCdHud(s)?indoorShootOrderLabel((s.ends||[]).length):"";
  const matchLbl=typeof isSetMatchRound==="function"&&isSetMatchRound(s)&&typeof setMatchHudLabel==="function"?setMatchHudLabel(s):"";
  const earlyCnt=s.timerEarlyCount||0;
  const quadLine=typeof isQuadSession==="function"&&isQuadSession(s)?` · 的 ${s.curSpotId||s.laneSpot||"A"} · ${quadHalfLabel(s.quadHalf||"first")}`:"";
  const fieldLine=s.faceType==="field"&&s.fieldCourse&&typeof fieldHudLine==="function"?` · ${fieldHudLine(s)}`:"";
  const focusLine=(s.focusPoints&&s.focusPoints.length)?`<div class="focusLine ds-truncate">${s.focusPoints.map(esc).join(" · ")}</div>`:"";
  const contextMain=s._edit?"過去記録の編集":isVolume?"本数練":`${s.dist}m · ${bowTypeLabel(s.bowType)} · ${setup?esc(setup.name):"用具未指定"}`+(fieldLine||quadLine)+(orderLbl?` · ${orderLbl}`:"")+(matchLbl?` · ${matchLbl}`:"");
  const timerLine=timerRem!=null?` · 残り <span class="timerHud timerCell${timerRem<=30?" warn":""}" id="timerHud"><b>${formatTimerSec(timerRem)}</b></span>`:"";
  const contextMeta=`E${endNum}${totalEnds?`/${totalEnds}`:""} · あと${remain}本で確定${timerLine}${earlyCnt?` · 早期完了 ${earlyCnt}回`:""}`;
  const progressPct=perEnd?Math.round(curLen/perEnd*100):0;
  const progressBar=`<div class="scoreEndProgress" aria-hidden="true"><span style="width:${progressPct}%"></span></div>`;
  const avgLbl=stats.count?stats.avg.toFixed(2):"—";
  const secScoreVal=showX?stats.tenCount:secCount;
  const hudHidden=`<b data-hud="hitCount" hidden>${stats.hitCount}</b>${showX?`<b data-hud="secScore" hidden>${secScoreVal}</b>`:""}`;
  const scoreGrid=`<div class="liveCell"><div class="k">合計</div><b data-hud="total">${stats.total}</b></div>
      ${showX?`<div class="liveCell"><div class="k">Xs</div><b data-hud="xCount">${stats.xCount}</b></div>`:`<div class="liveCell"><div class="k">${secLabel}</div><b data-hud="secScore">${secCount}</b></div>`}
      <div class="liveCell"><div class="k">平均</div><b>${avgLbl}</b></div>
      <div class="liveCell"><div class="k">エンド進捗</div><b data-hud="curEnd">${curLen}/${perEnd}本</b></div>${hudHidden}`;
  const volumeGrid=`<div class="liveCell"><div class="k">本数</div><b data-hud="count">${stats.count}</b></div>
      <div class="liveCell"><div class="k">エンド</div><b data-hud="endNum">${endNum}</b></div>
      <div class="liveCell"><div class="k">現在</div><b data-hud="curEnd">${curLen}/${perEnd}</b></div>`;
  return `${indoorHalfBannerHtml(s)}<section class="liveHud compactHud ds-liveBoard card">
    <div class="liveContext"><span class="liveContextMain ds-truncate">${contextMain}</span><span class="liveContextMeta ds-truncate">${contextMeta}</span></div>
    ${focusLine}
    ${progressBar}
    <div class="liveGrid">
      ${isVolume?volumeGrid:scoreGrid}
    </div>
  </section>`;
}
