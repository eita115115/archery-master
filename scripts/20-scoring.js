"use strict";
/* Archery Note: scoring and grouping math */
/* ============ scoring ============ */
function isFieldFace(faceType){ return faceType==="field"; }
function ringW(faceD,faceType){ return isFieldFace(faceType) ? faceD/12 : faceD/20; }
const SPOT_Y=[22,0,-22]; /* 三つ目的のスポット中心(上・中・下, cm, y上向き) */
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
function scoreAt(relX,relY,faceD,faceType,touchRadiusCm){
  const w=ringW(faceD,faceType);
  const touchCm=touchRadiusCm==null ? lineCutRadius(faceD,faceType) : touchRadiusCm;
  const r=Math.max(0, Math.hypot(relX,relY)-touchCm);
  if(isFieldFace(faceType)){
    if(r>w*6) return {s:0,X:false};
    if(r<=w) return {s:6,X:false};
    return {s:Math.max(0,7-Math.ceil(r/w)),X:false};
  }
  if(r<=w/2) return {s:10,X:true};
  let s=11-Math.ceil(r/w);
  if(faceType==="triple" && s<6) s=0;
  if(s<1) s=0;
  return {s:Math.min(10,Math.max(0,s)),X:false};
}
function scoreRank(hit){ return hit.s*2+(hit.X?1:0); }
function isLineCutting(relX,relY,faceD,faceType){
  const center=scoreAt(relX,relY,faceD,faceType,0);
  const cut=scoreAt(relX,relY,faceD,faceType,lineCutRadius(faceD,faceType));
  return scoreRank(cut)>scoreRank(center);
}
function isLineCuttingFromGlobal(gx,gy,faceD,faceType){
  if(faceType!=="triple") return isLineCutting(gx,gy,faceD,faceType);
  let spot=0,best=Infinity;
  SPOT_Y.forEach((c,i)=>{ const d=Math.hypot(gx,gy-c); if(d<best){best=d;spot=i;} });
  return isLineCutting(gx,gy-SPOT_Y[spot],faceD,"triple");
}
function hitFromGlobal(gx,gy,faceD,faceType,touchRadiusCm){
  if(faceType!=="triple"){ return Object.assign({x:gx,y:gy}, scoreAt(gx,gy,faceD,faceType,touchRadiusCm)); }
  let spot=0,best=Infinity;
  SPOT_Y.forEach((c,i)=>{ const d=Math.hypot(gx,gy-c); if(d<best){best=d;spot=i;} });
  const rx=gx, ry=gy-SPOT_Y[spot];
  return Object.assign({x:rx,y:ry,spot}, scoreAt(rx,ry,faceD,"triple",touchRadiusCm));
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
