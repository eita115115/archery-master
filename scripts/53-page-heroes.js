"use strict";
/* 的ノート: page hero sections (history/sight/gear/live) */

function heroMetricHtml(k,b,span){
  return `<div class="heroMetric"><div class="k">${esc(k)}</div><b>${esc(b)}</b><span>${esc(span||"")}</span></div>`;
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
      <h2>分布と偏移を読む</h2>
      <p>点数だけでなく、同じ用具・同じ距離の中心移動を追います。過去のグルーピングがあるほど、今回のズレが偶然か傾向か見えやすくなります。</p>
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
      <h2>サイト値を整える</h2>
      <p>距離ごとのサイト値と最新グルーピングから、動かす時・保留する時・射形を優先する時を分けて見ます。</p>
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
      <h2>いつものセッティングを残す</h2>
      <p>ハンドル、リム、矢、サイト値をまとめて保存します。分かる範囲だけで始めて、必要な時だけ細かい実測値を足せます。</p>
      <div class="heroMetrics">
        ${heroMetricHtml("登録",`${setups.length}件`,`${db.sessions.filter(s=>s.setupId).length}回の練習に接続`)}
        ${heroMetricHtml("入力材料",pct(avg),"用具データの平均充実度")}
        ${heroMetricHtml("主戦用具",best?best.s.name:"—",best?`入力 ${best.p.level} / 履歴 ${best.m.level}`:"初回セットアップ待ち")}
      </div>
    </section>`;
  }
  return "";
}
function liveSessionHeroHtml(s,setup){
  const stats=aggregateSessionStats(sessionArrows(s));
  const remain=Math.max(0,(s.perEnd||6)-(s.cur||[]).length);
  const r=ROUND_TYPES.find(x=>x.id===s.round);
  const roundRemain=r&&r.arrows?Math.max(0,r.arrows-stats.count):null;
  return `<section class="liveHud compactHud">
    <div class="liveContext">${s._edit?"過去記録の編集":`${s.dist}m / ${bowTypeLabel(s.bowType)} / ${envLabel(s.environment)}`}<span>${setup?esc(setup.name):"用具未指定"}</span></div>
    <div class="liveGrid">
      <div class="liveCell"><div class="k">合計</div><b>${stats.total}</b></div>
      <div class="liveCell"><div class="k">Xs</div><b>${stats.xCount}</b></div>
      <div class="liveCell"><div class="k">10s</div><b>${stats.tenCount}</b></div>
      <div class="liveCell"><div class="k">Hits</div><b>${stats.hitCount}</b></div>
      <div class="liveCell"><div class="k">現在</div><b>${(s.cur||[]).length}/${s.perEnd||6}</b></div>
      <div class="liveCell"><div class="k">残り</div><b>${roundRemain==null?`${remain}本`:roundRemain+"本"}</b></div>
    </div>
  </section>`;
}
