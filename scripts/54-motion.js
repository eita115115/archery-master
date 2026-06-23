"use strict";
/* 的ノート: UI motion utilities (UI-P5). Safe no-op until html.ui-refresh + wiring. */

function uiRefreshActive(){
  return document.documentElement.classList.contains("ui-refresh");
}
function uiReducedMotion(){
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function animateMetric(el, from, to, durMs){
  if(!el) return;
  durMs=durMs||400;
  if(uiReducedMotion()||!uiRefreshActive()){
    el.textContent=Number.isInteger(to)?String(to):Number(to).toFixed(1);
    return;
  }
  const t0=performance.now();
  const step=(t)=>{
    const p=Math.min(1,(t-t0)/durMs);
    const eased=1-Math.pow(1-p,3);
    const v=from+(to-from)*eased;
    el.textContent=Number.isInteger(to)?String(Math.round(v)):v.toFixed(1);
    el.classList.add("ui-rolling","ui-neon-metric");
    if(p<1) requestAnimationFrame(step);
    else el.classList.remove("ui-rolling","ui-neon-metric");
  };
  requestAnimationFrame(step);
}
function feedbackPulse(kind){
  if(typeof nativePulse!=="function") return;
  const map={score:"light",end:"success",x:"success",best:"success",warn:"warning"};
  setTimeout(()=>nativePulse(map[kind]||"light"),40);
}
function captureHudMetrics(s){
  if(!s) return null;
  const stats=typeof sessionStats==="function"?sessionStats(s):{total:0,xCount:0,tenCount:0,hitCount:0,count:0,volume:false};
  const showX=typeof usesXScoring==="function"&&usesXScoring(s);
  const secCount=typeof secondaryScoreCount==="function"?secondaryScoreCount(sessionArrows(s),s):0;
  const perEnd=s.perEnd||(stats.volume?8:6);
  const curLen=(s.cur||[]).length;
  return {
    volume:!!stats.volume,
    showX:!!showX,
    total:stats.total||0,
    xCount:stats.xCount||0,
    secScore:showX?(stats.tenCount||0):secCount,
    hitCount:stats.hitCount||0,
    count:stats.count||0,
    endNum:(s.ends||[]).length+1,
    curLen,
    perEnd,
    remain:Math.max(0,perEnd-curLen)
  };
}
function syncLiveHudMetrics(s){
  if(!uiRefreshActive()||!s) return;
  const hud=document.querySelector(".liveHud");
  if(!hud) return;
  const cur=captureHudMetrics(s);
  const prev=ui.hudSnap||cur;
  ui.hudSnap=cur;
  const pairs=cur.volume
    ? [["count",cur.count,prev.count],["endNum",cur.endNum,prev.endNum],["curEnd",`${cur.curLen}/${cur.perEnd}`,`${prev.curLen||0}/${prev.perEnd||cur.perEnd}`]]
    : [["total",cur.total,prev.total]]
      .concat(cur.showX?[["xCount",cur.xCount,prev.xCount]]:[])
      .concat([["secScore",cur.secScore,prev.secScore],["hitCount",cur.hitCount,prev.hitCount],["curEnd",`${cur.curLen}/${cur.perEnd}本`,`${prev.curLen||0}/${prev.perEnd||cur.perEnd}本`]]);
  pairs.forEach(([key,to,from])=>{
    const el=hud.querySelector(`[data-hud="${key}"]`);
    if(!el) return;
    if(key==="curEnd"){ el.textContent=String(to); return; }
    if(to!==from) animateMetric(el,from,to,400);
    else el.textContent=String(to);
  });
  const bar=hud.querySelector(".scoreEndProgress span");
  if(bar&&cur.perEnd) bar.style.width=`${Math.round(cur.curLen/cur.perEnd*100)}%`;
}
function celebrateX(index){
  feedbackPulse("x");
  if(!uiRefreshActive()||uiReducedMotion()) return;
  const chip=document.querySelector(`#curChips .sc[data-i="${index}"]`);
  if(chip){
    chip.classList.add("ui-x-ring");
    setTimeout(()=>chip.classList.remove("ui-x-ring"),220);
  }
  const marks=document.querySelectorAll("#tgmarks .shotNew");
  const mark=marks.length?marks[marks.length-1]:null;
  if(mark){
    mark.classList.add("ui-x-ring");
    setTimeout(()=>mark.classList.remove("ui-x-ring"),220);
  }
}
function onArrowScored(arrow,index){
  if(!arrow) return;
  if(arrow.X){ celebrateX(index); return; }
  feedbackPulse("score");
}
function pulseEndHud(){
  if(typeof feedbackPulse==="function") feedbackPulse("end");
  if(!uiRefreshActive()) return;
  const hud=document.querySelector(".liveHud");
  if(!hud) return;
  hud.classList.remove("ui-end-pulse");
  void hud.offsetWidth;
  hud.classList.add("ui-end-pulse");
}
function sessionScoreTotal(sess){
  if(!sess||sess.purpose==="volume") return 0;
  if(sess.faceType==="field"&&typeof fieldBadgeTotal==="function") return fieldBadgeTotal(sess);
  return typeof sessionTotalPoints==="function"?sessionTotalPoints(sess):0;
}
function sessionBestKey(sess){
  if(!sess||sess.purpose==="volume") return "";
  return [sess.setupId||"",sess.dist,sess.round||"free",sess.bowType,sess.environment||"outdoor",sess.faceType||"single"].join("|");
}
function priorPersonalBest(sess,sessions){
  const key=sessionBestKey(sess);
  if(!key) return null;
  const pool=(sessions||[]).filter(s=>s.id!==sess.id&&sessionBestKey(s)===key);
  if(!pool.length) return null;
  return Math.max(...pool.map(sessionScoreTotal));
}
function personalBestForKey(key,sessions){
  if(!key) return null;
  const pool=(sessions||[]).filter(s=>sessionBestKey(s)===key);
  if(!pool.length) return null;
  return Math.max(...pool.map(sessionScoreTotal));
}
function isNewPersonalBest(sess,sessions,total){
  if(!sess||sess.purpose==="volume") return false;
  total=total!=null?total:sessionScoreTotal(sess);
  const prev=priorPersonalBest(sess,sessions);
  return prev!=null&&total>prev;
}
function celebrateBest(opts){
  opts=opts||{};
  const total=+opts.total||0;
  const prev=+opts.prev||0;
  const delta=total-prev;
  if(delta<=0) return;
  feedbackPulse("best");
  if(typeof ui!=="undefined"){
    ui.pendingBestCelebrate={key:opts.key||"",total,prev};
  }
  if(!uiRefreshActive()) return;
  const label=opts.label||"自己ベスト更新";
  let banner=document.querySelector(".ui-best-banner");
  if(banner) banner.remove();
  banner=document.createElement("div");
  banner.className="ui-best-banner";
  banner.setAttribute("role","status");
  banner.innerHTML=`<b>${label}</b><span>${prev} → ${total}（+${delta}）</span>`;
  document.body.appendChild(banner);
  requestAnimationFrame(()=>banner.classList.add("show"));
  const hideMs=uiReducedMotion()?80:500;
  setTimeout(()=>{
    banner.classList.remove("show");
    setTimeout(()=>banner.remove(),280);
  },hideMs);
  const sumEl=document.querySelector(".ovl .statbar .stat b");
  if(sumEl) animateMetric(sumEl,prev,total,520);
}
function pulseTabSpring(){
  if(!uiRefreshActive()||uiReducedMotion()) return;
  const bar=$("#tabs");
  if(!bar) return;
  bar.classList.remove("ui-tab-spring");
  void bar.offsetWidth;
  bar.classList.add("ui-tab-spring");
  clearTimeout(pulseTabSpring._tm);
  pulseTabSpring._tm=setTimeout(()=>bar.classList.remove("ui-tab-spring"),360);
}
function enterViewMotion(root){
  if(!uiRefreshActive()||uiReducedMotion()||!root) return;
  Array.from(root.children).forEach((el,i)=>{
    el.classList.remove("ui-view-rise","ui-neon-reveal");
    el.style.animationDelay="";
    void el.offsetWidth;
    el.classList.add("ui-view-rise","ui-neon-reveal");
    el.style.animationDelay=Math.min(i*55,140)+"ms";
  });
}
function mountOverlayMotion(ovl){
  if(!ovl||!uiRefreshActive()) return;
  ovl.classList.add("ui-neon-sheet");
  const sheet=ovl.querySelector(".sheet");
  if(sheet&&sheet.classList.contains("onboardSheet")) runOnboardStepMotion(sheet);
}
function mountScoreDockMotion(){
  if(!uiRefreshActive()||uiReducedMotion()) return;
  const dock=document.querySelector(".gridSheet.on .gridKeys");
  if(!dock) return;
  dock.classList.remove("ui-neon-dock-in");
  void dock.offsetWidth;
  dock.classList.add("ui-neon-dock-in");
}
function flashScoreKey(btn){
  if(!btn||!uiRefreshActive()||uiReducedMotion()) return;
  btn.classList.remove("ui-neon-key-flash");
  void btn.offsetWidth;
  btn.classList.add("ui-neon-key-flash");
  clearTimeout(flashScoreKey._tm);
  flashScoreKey._tm=setTimeout(()=>btn.classList.remove("ui-neon-key-flash"),280);
}
function highlightNextGridCell(){
  if(!uiRefreshActive()||uiReducedMotion()) return;
  const cell=document.querySelector("#scoreGrid .gridCell.next");
  if(!cell) return;
  cell.classList.remove("ui-neon-cell-next");
  void cell.offsetWidth;
  cell.classList.add("ui-neon-cell-next");
  clearTimeout(highlightNextGridCell._tm);
  highlightNextGridCell._tm=setTimeout(()=>cell.classList.remove("ui-neon-cell-next"),300);
}
function pulseScoreGridCell(cellEl){
  if(!cellEl||!uiRefreshActive()||uiReducedMotion()) return;
  cellEl.classList.remove("ui-neon-cell-pop");
  void cellEl.offsetWidth;
  cellEl.classList.add("ui-neon-cell-pop");
  clearTimeout(pulseScoreGridCell._tm);
  pulseScoreGridCell._tm=setTimeout(()=>cellEl.classList.remove("ui-neon-cell-pop"),300);
}
function runOnboardStepMotion(root){
  if(!root||!uiRefreshActive()||uiReducedMotion()) return;
  root.querySelectorAll(".onboardStep").forEach((el,i)=>{
    el.classList.add("ui-onboard-step-enter");
    el.style.animationDelay=(60+i*90)+"ms";
  });
  const lead=root.querySelector(".onboardLead");
  if(lead){
    lead.classList.add("ui-onboard-step-enter");
    lead.style.animationDelay="340ms";
  }
  const go=root.querySelector("#onboardGo");
  if(go){
    go.classList.add("ui-onboard-step-enter");
    go.style.animationDelay="420ms";
  }
}
function mountBadgeRings(root){
  if(!root||!uiRefreshActive()||uiReducedMotion()) return;
  root.querySelectorAll(".badgeRingFill").forEach(el=>{
    const end=el.getAttribute("stroke-dashoffset")||"0";
    el.style.setProperty("--ring-end",end);
    el.classList.add("ui-ring-draw");
  });
}
if(typeof window!=="undefined"){
  window.animateMetric=animateMetric;
  window.feedbackPulse=feedbackPulse;
  window.captureHudMetrics=captureHudMetrics;
  window.syncLiveHudMetrics=syncLiveHudMetrics;
  window.celebrateX=celebrateX;
  window.onArrowScored=onArrowScored;
  window.pulseEndHud=pulseEndHud;
  window.sessionScoreTotal=sessionScoreTotal;
  window.sessionBestKey=sessionBestKey;
  window.priorPersonalBest=priorPersonalBest;
  window.personalBestForKey=personalBestForKey;
  window.isNewPersonalBest=isNewPersonalBest;
  window.celebrateBest=celebrateBest;
  window.pulseTabSpring=pulseTabSpring;
  window.enterViewMotion=enterViewMotion;
  window.mountOverlayMotion=mountOverlayMotion;
  window.mountScoreDockMotion=mountScoreDockMotion;
  window.flashScoreKey=flashScoreKey;
  window.highlightNextGridCell=highlightNextGridCell;
  window.pulseScoreGridCell=pulseScoreGridCell;
  window.runOnboardStepMotion=runOnboardStepMotion;
  window.mountBadgeRings=mountBadgeRings;
  window.uiRefreshActive=uiRefreshActive;
}