"use strict";
/* Archery-master: startup and update check */
/* ============ init ============ */
let updateAvailable=false;

function syncUpdateBarVisibility(){
  const bar=$("#updBar");
  if(!bar) return;
  const show=!!updateAvailable && !(db&&db.active);
  bar.hidden=!show;
  bar.style.display=show?"block":"none";
}
function checkUpdate(){
  if(location.protocol==="file:"){ updateAvailable=false; syncUpdateBarVisibility(); return; }
  fetch("version.json?ts="+Date.now(),{cache:"no-store"})
    .then(r=>r.json())
    .then(j=>{ updateAvailable=!!(j && j.v>APP_VER); syncUpdateBarVisibility(); })
    .catch(()=>{});
}
function freshReload(){
  const bar=$("#updBar");
  if(bar) bar.textContent="更新中...";
  const url=new URL(location.href);
  url.searchParams.set("appv", String(Date.now()));
  const reload=()=>location.replace(url.toString());
  if(navigator.serviceWorker && navigator.serviceWorker.getRegistrations){
    navigator.serviceWorker.getRegistrations()
      .then(regs=>Promise.all(regs.map(r=>r.update().catch(()=>{}))))
      .finally(reload);
  }else{
    reload();
  }
}
function bootApp(){
  const run=()=>render();
  if(typeof maybeRunOnboard==="function"&&maybeRunOnboard(run)) return;
  run();
}
async function matonoteStartup(){
  if("serviceWorker" in navigator && (location.protocol==="https:"||location.hostname==="localhost"||location.hostname==="127.0.0.1")){
    navigator.serviceWorker.register("sw.js").catch(()=>{});
  }
  if(typeof ensureBetaChannel==="function") await ensureBetaChannel();
  if(typeof applyBetaFullFeatures==="function"&&typeof betaFullFeaturesActive==="function"&&betaFullFeaturesActive()&&window.__MATONOTE_BETA__){
    applyBetaFullFeatures(window.__MATONOTE_BETA__);
  }
  applyTheme();
  if(typeof syncUiRefreshClass==="function") syncUiRefreshClass();
  if(typeof ensureUiDepth==="function") ensureUiDepth(db.settings);
  $("#btnSettings").onclick=openSettings;
  $("#updBar").onclick=freshReload;
  document.addEventListener("visibilitychange",()=>{ if(document.hidden) flushSafetySnapshot(); else checkUpdate(); });
  window.addEventListener("pagehide",()=>flushSafetySnapshot());
  checkUpdate();
}
matonoteStartup().then(()=>bootApp()).catch(()=>bootApp());