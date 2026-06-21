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
function showRenderFallback(){
  const m=$("#main");
  if(!m) return;
  m.innerHTML=`<section class="bootFallback" id="bootFallback" aria-live="polite" style="opacity:1;visibility:visible;pointer-events:auto">
    <img class="bootIcon" src="icon-512.png" width="48" height="48" alt="">
    <h2>読み込みに時間がかかっています</h2>
    <p>通信が不安定な場合は再読み込みしてください。記録は端末内に保存されます。</p>
    <button class="btn bootReload" type="button" id="bootRetry">再読み込み</button>
  </section>`;
  const btn=$("#bootRetry");
  if(btn) btn.onclick=()=>location.reload();
}
function bootApp(){
  window.__booted=true;
  const run=()=>{
    if(typeof safeRender==="function") safeRender();
    else{
      try{ render(); }
      catch(e){
        console.error(e);
        showRenderFallback();
      }
    }
  };
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
  if(typeof openSettings==="function") $("#btnSettings").onclick=openSettings;
  $("#updBar").onclick=freshReload;
  document.addEventListener("visibilitychange",()=>{ if(document.hidden) flushSafetySnapshot(); else checkUpdate(); });
  window.addEventListener("pagehide",()=>flushSafetySnapshot());
  checkUpdate();
}
const bootStartup=matonoteStartup().then(()=>bootApp()).catch(()=>bootApp());
const bootWatchdog=setTimeout(()=>{
  if(!window.__booted){
    if(typeof bootApp==="function") bootApp();
    else if(typeof safeRender==="function"){
      window.__booted=true;
      safeRender();
    }else if(typeof render==="function"){
      window.__booted=true;
      try{ render(); }catch(e){ showRenderFallback(); }
    }else showRenderFallback();
  }
},5000);
bootStartup.finally(()=>clearTimeout(bootWatchdog));
