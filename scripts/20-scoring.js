"use strict";
/* Archery Note: scoring and grouping math */
/* ============ scoring ============ */
function isFieldFace(faceType){ return faceType==="field"; }
function isQuadFace(faceType){ return faceType==="quad"; }
function usesInnerX(opts){
  const o=normalizeScoreOpts(opts);
  if(o.compound) return true;
  if(o.indoor) return false;
  return true;
}
function ringW(faceD,faceType){ return isFieldFace(faceType) ? faceD/12 : faceD/20; }
const SPOT_Y=[22,0,-22]; /* 三つ目的のスポット中心(上・中・下, cm, y上向き) */
const SPOT_QUAD=[
  {id:"A",x:-22,y:22},
  {id:"B",x:22,y:22},
  {id:"C",x:-22,y:-22},
  {id:"D",x:22,y:-22}
]; /* 四枚40cm: 前半は上A/B・下C/D（§3.3） */
function resolveQuadHalf(half){ return half==="second"?"second":"first"; }
function quadSpotsForHalf(half){
  if(resolveQuadHalf(half)==="second"){
    return [
      {id:"C",x:-22,y:22,spot:2},
      {id:"D",x:22,y:22,spot:3},
      {id:"A",x:-22,y:-22,spot:0},
      {id:"B",x:22,y:-22,spot:1}
    ];
  }
  return SPOT_QUAD.map((c,i)=>({id:c.id,x:c.x,y:c.y,spot:i}));
}
function quadSpotCenter(spotIndex,half){
  const spots=quadSpotsForHalf(half);
  return spots.find(s=>s.spot===spotIndex)||spots[spotIndex]||SPOT_QUAD[spotIndex];
}
function quadArrowGlobal(a,half){
  const idx=a.spot!=null?a.spot:SPOT_QUAD.findIndex(s=>s.id===(a.spotId||"A"));
  const c=quadSpotCenter(idx>=0?idx:0,half);
  return {x:(a.x||0)+c.x,y:(a.y||0)+c.y};
}
function quadHalfLabel(half){ return resolveQuadHalf(half)==="second"?"後半":"前半"; }
function isQuadSession(sess){ return !!(sess&&sess.faceType==="quad"); }
function isQuadHalfRound(sess){
  return isQuadSession(sess)&&(sess.round==="quad60_jp"||(roundTotalEnds(sess)||0)>=20);
}
function quadHalfForEndIndex(sess,endIdx){
  if(!isQuadSession(sess)) return "first";
  const switchAt=typeof sess.quadHalfSwitchEnd==="number"?sess.quadHalfSwitchEnd:10;
  return endIdx>=switchAt?"second":"first";
}
function ensureQuadHalf(sess){
  if(!isQuadSession(sess)) return sess;
  if(!sess.quadHalf) sess.quadHalf="first";
  return sess;
}
function arrowMarkRadius(faceD){ return faceD/85; }
function targetLineHalfWidth(faceD,faceType){
  if(isFieldFace(faceType)) return faceD/900;
  return faceType==="single" ? faceD/1200 : faceD/640;
}
function lineCutRadius(faceD,faceType){
  return arrowMarkRadius(faceD)+targetLineHalfWidth(faceD,faceType);
}
/* 線かみ(ラインカッター)判定: アプリ上の矢円が線に少しでも触れていれば内側の点数。
   touchCm = 画面上の矢円半径 + 的線の半分の太さ(cm)。 */
function normalizeScoreOpts(opts){
  opts=opts||{};
  const bow=opts.bowType||"recurve";
  const indoor=opts.scoring==="indoor_jp"||opts.scoring==="indoor_wa"||opts.environment==="indoor";
  return {bowType:bow, scoring:opts.scoring||(indoor?"indoor_jp":"outdoor"), indoor, compound:bow==="compound", barebow:bow==="barebow", recurve:bow==="recurve"||bow==="barebow"||bow==="yumi"};
}
function scoreOptsFromSession(sess){
  if(!sess) return {};
  return {bowType:sess.bowType||"recurve", environment:sess.environment||"outdoor", scoring:sess.scoring||(sess.environment==="indoor"?"indoor_jp":"outdoor"), quadHalf:sess.quadHalf||"first"};
}
function scoreAt(relX,relY,faceD,faceType,touchRadiusCm,opts){
  const o=normalizeScoreOpts(opts);
  const w=ringW(faceD,faceType);
  const touchCm=touchRadiusCm==null ? lineCutRadius(faceD,faceType) : touchRadiusCm;
  const r=Math.max(0, Math.hypot(relX,relY)-touchCm);
  if(isFieldFace(faceType)){
    if(r>w*6) return {s:0,X:false};
    if(r<=w) return {s:6,X:false};
    return {s:Math.max(0,7-Math.ceil(r/w)),X:false};
  }
  if(r<=w/2){
    if(o.compound) return {s:10,X:true};
    if(!usesInnerX(o)) return {s:10,X:false};
    return {s:10,X:true};
  }
  let s=11-Math.ceil(r/w);
  if(faceType==="triple" && s<6) s=0;
  if(o.compound && s>=10) s=9;
  if(o.compound && !o.indoor && faceD===48 && faceType==="single" && s>0 && s<5) s=0;
  if(s<1) s=0;
  return {s:Math.min(10,Math.max(0,s)),X:false};
}
function scoreRank(hit){ return hit.s*2+(hit.X?1:0); }
function isLineCutting(relX,relY,faceD,faceType,opts){
  const center=scoreAt(relX,relY,faceD,faceType,0,opts);
  const cut=scoreAt(relX,relY,faceD,faceType,lineCutRadius(faceD,faceType),opts);
  return scoreRank(cut)>scoreRank(center);
}
function isLineCuttingFromGlobal(gx,gy,faceD,faceType,opts){
  if(faceType==="triple"){
    let spot=0,best=Infinity;
    SPOT_Y.forEach((c,i)=>{ const d=Math.hypot(gx,gy-c); if(d<best){best=d;spot=i;} });
    return isLineCutting(gx,gy-SPOT_Y[spot],faceD,"triple",opts);
  }
  if(faceType==="quad"){
    const spots=quadSpotsForHalf(opts.quadHalf);
    let spot=0,best=Infinity;
    spots.forEach((c,i)=>{ const d=Math.hypot(gx-c.x,gy-c.y); if(d<best){best=d;spot=i;} });
    const c=spots[spot];
    return isLineCutting(gx-c.x,gy-c.y,faceD,"single",opts);
  }
  return isLineCutting(gx,gy,faceD,faceType,opts);
}
function hitFromGlobal(gx,gy,faceD,faceType,touchRadiusCm,opts){
  if(faceType==="triple"){
    let spot=0,best=Infinity;
    SPOT_Y.forEach((c,i)=>{ const d=Math.hypot(gx,gy-c); if(d<best){best=d;spot=i;} });
    const rx=gx, ry=gy-SPOT_Y[spot];
    return Object.assign({x:rx,y:ry,spot}, scoreAt(rx,ry,faceD,"triple",touchRadiusCm,opts));
  }
  if(faceType==="quad"){
    const spots=quadSpotsForHalf(opts.quadHalf);
    let spot=0,best=Infinity;
    spots.forEach((c,i)=>{ const d=Math.hypot(gx-c.x,gy-c.y); if(d<best){best=d;spot=i;} });
    const c=spots[spot];
    const rx=gx-c.x, ry=gy-c.y;
    return Object.assign({x:rx,y:ry,spot:c.spot,spotId:c.id}, scoreAt(rx,ry,faceD,"single",touchRadiusCm,opts));
  }
  return Object.assign({x:gx,y:gy}, scoreAt(gx,gy,faceD,faceType,touchRadiusCm,opts));
}
function usesXScoring(sess){
  if(typeof sessionUsesX==="function") return sessionUsesX(sess);
  if(!sess||sess.faceType==="field") return false;
  if(sess.bowType==="compound") return false;
  if(sess.environment==="indoor"||sess.scoring==="indoor_jp") return false;
  return true;
}
function gridKeysForSession(sess){
  const s=sess||{};
  if(s.faceType==="field") return ["6","5","4","3","2","1","M"];
  const indoor=s.environment==="indoor"||s.scoring==="indoor_jp";
  const compound=s.bowType==="compound";
  if(compound && !indoor && s.faceD===48) return ["10","9","8","7","6","5"];
  if(compound||indoor) return ["10","9","8","7","6","M"];
  return GRID_SCORE_KEYS;
}
function gridKeyButtonHtml(v,prime){
  const z=gridZoneStyle(v);
  const cls=prime?"gridKey gridKey--prime":"gridKey";
  return `<button type="button" class="${cls}" data-v="${v}" aria-label="${v}点" style="background:${z.bg};color:${z.fg}">${v}</button>`;
}
function gridKeysLayout(sess,keys){
  const s=sess||{};
  if(s.faceType==="field") return [["6","5","4"],["3","2","1","M"]];
  if(keys.length===7&&keys[0]==="X") return [["X","10"],["9","8","7","6","M"]];
  return [keys];
}
function gridKeysHtml(sess){
  const keys=gridKeysForSession(sess);
  const rows=gridKeysLayout(sess,keys);
  const outdoorX=keys.length===7&&keys[0]==="X";
  const rowHtml=rows.map(row=>`<div class="gridKeysRow">${row.map(v=>gridKeyButtonHtml(v,outdoorX&&(v==="X"||v==="10"))).join("")}</div>`).join("");
  return `<div class="gridKeysPad" id="gridKeys">${rowHtml}</div>`;
}
function isJapanIndoorRound(sess){
  return sess&&(sess.round==="18m60_jp"||sess.round==="18m60_jp_x2"||(sess.environment==="indoor"&&sess.dist===18&&sess.faceType==="triple"));
}
function usesAbCdHud(sess){
  return isJapanIndoorRound(sess)||(sess&&sess.round==="70m72");
}
function indoorShootOrderLabel(endIndex){
  return endIndex%2===0?"AB先":"CD先";
}
function isSetMatchRound(sess){
  return sess&&(sess.round==="setMatch5"||sess.round==="teamSet4"||!!(sess.matchMeta&&sess.matchMeta.sets));
}
function isTeamSetRound(sess){
  return sess&&(sess.round==="teamSet4"||!!(sess.matchMeta&&sess.matchMeta.team));
}
function ensureMatchMeta(sess){
  if(!sess.matchMeta) sess.matchMeta={selfSetPts:0,oppSetPts:0,sets:[],team:false};
  return sess.matchMeta;
}
function applySetMatchEnd(sess,endArrows,oppTotal){
  const meta=ensureMatchMeta(sess);
  const selfTotal=endTotalPoints(endArrows,sess.faceType);
  const opp=Math.max(0,+oppTotal||0);
  let selfPt=0, oppPt=0;
  if(selfTotal>opp){ selfPt=2; oppPt=0; }
  else if(selfTotal===opp){ selfPt=1; oppPt=1; }
  else { selfPt=0; oppPt=2; }
  meta.selfSetPts+=selfPt;
  meta.oppSetPts+=oppPt;
  meta.sets.push({self:selfTotal,opp, selfPt,oppPt});
  return {selfTotal,opp,selfPt,oppPt,meta};
}
function setMatchHudLabel(sess){
  const meta=ensureMatchMeta(sess);
  const setNum=meta.sets.length+1;
  const total=roundTotalEnds(sess)||5;
  return `セット ${setNum}/${total} · ${meta.selfSetPts}-${meta.oppSetPts}pt`;
}
function validateSpotEnd(end){
  const by={};
  const warnings=[];
  (end||[]).forEach((a,i)=>{
    if(a.spot==null) return;
    if(by[a.spot]!=null) warnings.push({spot:a.spot,indices:[by[a.spot],i]});
    else by[a.spot]=i;
  });
  return warnings;
}
function validateTripleEnd(end){ return validateSpotEnd(end); }
function validateQuadEnd(end){ return validateSpotEnd(end); }
function effectiveSpotEndArrows(end){
  const by={};
  const loose=[];
  (end||[]).forEach(a=>{
    if(a.spot==null){ loose.push(a); return; }
    const prev=by[a.spot];
    if(!prev||scoreRank(a)<scoreRank(prev)) by[a.spot]=a;
  });
  return loose.concat(Object.values(by));
}
function effectiveTripleEndArrows(end){ return effectiveSpotEndArrows(end); }
function effectiveQuadEndArrows(end){ return effectiveSpotEndArrows(end); }
function effectiveTripleEndScore(end){
  return effectiveTripleEndArrows(end).reduce((sum,a)=>sum+(a.s||0),0);
}
function effectiveQuadEndScore(end){
  return effectiveQuadEndArrows(end).reduce((sum,a)=>sum+(a.s||0),0);
}
function endTotalPoints(end,faceType){
  if(faceType==="triple") return effectiveTripleEndScore(end);
  if(faceType==="quad") return effectiveQuadEndScore(end);
  return (end||[]).reduce((sum,a)=>sum+(a.s||0),0);
}
function sessionTotalPoints(sess){
  if(!sess) return 0;
  if(sess.purpose==="volume") return 0;
  const ends=(sess.ends||[]).reduce((sum,end)=>sum+endTotalPoints(end,sess.faceType),0);
  const cur=endTotalPoints(sess.cur||[],sess.faceType);
  return ends+cur;
}
function sessionArrowCount(sess){
  return sessionArrows(sess).length;
}
function sessionStats(sess){
  if(!sess) return {total:0,xCount:0,tenCount:0,hitCount:0,avg:0,count:0,volume:false};
  if(sess.purpose==="volume"){
    const count=sessionArrowCount(sess);
    return {total:0,xCount:0,tenCount:0,hitCount:count,avg:0,count,volume:true,arrowCount:count};
  }
  const arrows=[];
  const effEnd=(end)=>sess.faceType==="triple"?effectiveTripleEndArrows(end):sess.faceType==="quad"?effectiveQuadEndArrows(end):end;
  (sess.ends||[]).forEach(end=>arrows.push(...effEnd(end)));
  const curRaw=sess.cur||[];
  const curEff=effEnd(curRaw);
  arrows.push(...curEff);
  const total=sessionTotalPoints(sess);
  const xCount=arrows.filter(a=>a.X).length;
  const tenCount=arrows.filter(a=>a.s===10).length;
  const hitCount=arrows.filter(a=>(a.s||0)>0).length;
  return {total,xCount,tenCount,hitCount,avg:arrows.length?total/arrows.length:0,count:sessionArrowCount(sess),volume:false};
}
function defaultTimerSeconds(sess){
  if(!sess||sess.purpose==="volume") return null;
  const r=typeof roundMeta==="function"?roundMeta(sess.round):null;
  if(r&&r.timer) return r.timer;
  const per=sess.perEnd||6;
  if(per>=6) return sess.dist>=50?240:180;
  if(per>=3) return 120;
  return 90;
}
function formatTimerSec(sec){
  const s=Math.max(0,Math.floor(sec||0));
  const m=Math.floor(s/60);
  return `${m}:${String(s%60).padStart(2,"0")}`;
}
function timerRemainingSec(sess){
  if(!sess||!sess.timerEndAt) return null;
  return Math.max(0,Math.ceil((sess.timerEndAt-Date.now())/1000));
}
function resetEndTimer(sess){
  if(!sess||sess.purpose==="volume") return;
  const sec=defaultTimerSeconds(sess);
  if(!sec) return;
  sess.timerSec=sec;
  sess.timerEndAt=Date.now()+sec*1000;
}
function timerEarlyTargetSec(){
  const t=db&&db.settings&&db.settings.timerEarlyTarget;
  return typeof t==="number"&&t>0?t:30;
}
function recordTimerEarlyEnd(sess){
  if(!sess||sess.purpose==="volume") return;
  const rem=timerRemainingSec(sess);
  if(rem==null) return;
  if(rem>=timerEarlyTargetSec()) sess.timerEarlyCount=(sess.timerEarlyCount||0)+1;
}
function maybeToastSpotCollision(sess,end){
  if(!sess||sess.faceType!=="triple"&&sess.faceType!=="quad") return;
  const fn=sess.faceType==="quad"?validateQuadEnd:validateTripleEnd;
  if(typeof fn==="function"&&fn(end||[]).length) toast("同じ的に2本 — 低い方のみ有効です");
}
function zoneStyle(s,X,faceType){
  if(isFieldFace(faceType)){
    if(s>=5) return {bg:"var(--gold)",fg:"#1c1e1c"};
    if(s>=1) return {bg:"#222",fg:"#fff"};
    return {bg:"#c9cec6",fg:"#555"};
  }
  if(s>=9) return {bg:"var(--gold)",fg:"#1c1e1c"};
  if(s>=7) return {bg:"var(--red)",fg:"#fff"};
  if(s>=5) return {bg:"var(--blue)",fg:"#fff"};
  if(s>=3) return {bg:"#222",fg:"#fff"};
  if(s>=1) return {bg:"#fff",fg:"#1c1e1c"};
  return {bg:"#c9cec6",fg:"#555"};
}
const GRID_SCORE_KEYS=["X","10","9","8","7","6","M"];
function gridZoneStyle(label){
  if(label==="X") return {bg:"#e6b800",fg:"#1c1e1c"};
  if(label==="10") return {bg:"#ffeb3b",fg:"#1c1e1c"};
  if(label==="9") return {bg:"#c8e650",fg:"#1c1e1c"};
  if(label==="8") return {bg:"#4caf50",fg:"#fff"};
  if(label==="7") return {bg:"#26a69a",fg:"#fff"};
  if(label==="6") return {bg:"#9e9e9e",fg:"#fff"};
  if(label==="5") return {bg:"#795548",fg:"#fff"};
  if(label==="M") return {bg:"#e53935",fg:"#fff"};
  return {bg:"#bdbdbd",fg:"#333"};
}
function arrowFromGridValue(value){
  if(value==="X") return {s:10,X:true,x:0,y:0};
  if(value==="M") return {s:0,X:false,x:0,y:0};
  const n=+value;
  return {s:Number.isFinite(n)?Math.max(0,Math.min(10,n)):0,X:false,x:0,y:0};
}
function aggregateSessionStats(arrows){
  const all=arrows||[];
  const total=all.reduce((sum,a)=>sum+(a.s||0),0);
  const xCount=all.filter(a=>a.X).length;
  const tenCount=all.filter(a=>a.s===10).length;
  const hitCount=all.filter(a=>(a.s||0)>0).length;
  return {total,xCount,tenCount,hitCount,avg:all.length?total/all.length:0,count:all.length};
}
function sessionArrows(sess){
  return [...((sess&&sess.ends)||[]).flat(), ...((sess&&sess.cur)||[])];
}
function scoreLabel(a){ return a.s===0?"M":(a.X?"X":String(a.s)); }
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
function median(vals){
  const a=vals.filter(Number.isFinite).sort((x,y)=>x-y);
  if(!a.length) return 0;
  const m=Math.floor(a.length/2);
  return a.length%2?a[m]:(a[m-1]+a[m])/2;
}
function momentStats(arrows, weights){
  const n=arrows.length;
  if(!n) return null;
  weights=weights||arrows.map(()=>1);
  const sw=weights.reduce((a,w)=>a+w,0);
  if(sw<=0) return momentStats(arrows);
  const mx=arrows.reduce((a,p,i)=>a+p.x*weights[i],0)/sw;
  const my=arrows.reduce((a,p,i)=>a+p.y*weights[i],0)/sw;
  let vx=0,vy=0,cov=0;
  arrows.forEach((p,i)=>{ const dx=p.x-mx, dy=p.y-my, w=weights[i]; vx+=w*dx*dx; vy+=w*dy*dy; cov+=w*dx*dy; });
  vx/=sw; vy/=sw; cov/=sw;
  const rr=Math.sqrt(Math.max(0,vx+vy));
  const sx=Math.sqrt(Math.max(0,vx)), sy=Math.sqrt(Math.max(0,vy));
  const disc=Math.sqrt(Math.max(0,(vx-vy)**2+4*cov*cov));
  const l1=Math.max(0,(vx+vy+disc)/2), l2=Math.max(0,(vx+vy-disc)/2);
  const major=Math.sqrt(l1), minor=Math.sqrt(l2);
  const angleDeg=(0.5*Math.atan2(2*cov,vx-vy))*180/Math.PI;
  const corr=(sx>0&&sy>0)?clamp(cov/(sx*sy),-1,1):0;
  const effN=sw*sw/weights.reduce((a,w)=>a+w*w,0);
  return {n,mx,my,rr,sx,sy,cov,corr,major,minor,angleDeg,effN};
}
function groupStats(arrows){ return momentStats(arrows); }
function weightedStats(arrows, weights){ return momentStats(arrows, weights); }
function robustScale(vals, center, fallback){
  const dev=vals.map(v=>Math.abs(v-center));
  return Math.max(1.4826*median(dev), fallback||0, 0.01);
}
/* 中央値/MAD・楕円距離・重み付き中心で、明らかな外れ値を除いたグルーピング統計 */
function robustStats(arrows){
  const total=arrows.length;
  if(!total) return null;
  if(total<5){
    const st=groupStats(arrows);
    return Object.assign(st,{used:arrows.slice(),excluded:[],total,method:"simple",confidence:total>=3?.55:.35});
  }
  const cx=median(arrows.map(a=>a.x)), cy=median(arrows.map(a=>a.y));
  const ds=arrows.map(a=>Math.hypot(a.x-cx,a.y-cy));
  const md=median(ds);
  const mad=median(ds.map(d=>Math.abs(d-md)));
  const base=groupStats(arrows);
  const sigma=Math.max(1.4826*mad, base.rr*.35, 0.01);
  const sx0=robustScale(arrows.map(a=>a.x), cx, base.sx*.45);
  const sy0=robustScale(arrows.map(a=>a.y), cy, base.sy*.45);
  const eds=arrows.map(a=>Math.hypot((a.x-cx)/sx0,(a.y-cy)/sy0));
  const em=median(eds), emad=median(eds.map(d=>Math.abs(d-em)));
  const limit=Math.max(md+3*sigma, md*2.2, base.rr*1.65);
  const eLimit=Math.max(3.15, em+3*Math.max(1.4826*emad,.35));
  let used=[], excluded=[];
  const maxExcluded=Math.floor(total*.25);
  arrows.forEach((a,i)=>{
    const radial=ds[i]>limit && ds[i]>md+2.4*sigma;
    const elliptical=eds[i]>eLimit && eds[i]>3.15;
    const obvious=(radial||elliptical) && excluded.length<maxExcluded;
    (obvious?excluded:used).push(a);
  });
  if(used.length<Math.max(3,total-excluded.length)){
    used=arrows.slice(); excluded=[];
  }
  const ux=median(used.map(a=>a.x)), uy=median(used.map(a=>a.y));
  const uds=used.map(a=>Math.hypot(a.x-ux,a.y-uy));
  const udm=median(uds);
  const xScale=robustScale(used.map(a=>a.x), ux, base.sx*.55);
  const yScale=robustScale(used.map(a=>a.y), uy, base.sy*.55);
  const scale=Math.max(udm+3*median(uds.map(d=>Math.abs(d-udm))), base.rr, 0.01);
  const weights=used.map(a=>{
    const radialU=Math.hypot(a.x-ux,a.y-uy)/scale;
    const ellU=Math.hypot((a.x-ux)/xScale,(a.y-uy)/yScale)/3;
    const u=Math.max(radialU,ellU);
    return u>=1?0.05:(1-u*u)**2;
  });
  const st=weightedStats(used, weights);
  const outRate=excluded.length/total;
  const sample=clamp((st.effN-2)/10,.35,1);
  const outPenalty=clamp(1-outRate*1.6,.55,1);
  const skewPenalty=st.minor>0?clamp(st.minor/st.major+.35,.55,1):.7;
  return Object.assign(st,{used,excluded,total,method:"ellipse-biweight",confidence:sample*outPenalty*skewPenalty});
}
