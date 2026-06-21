"use strict";
/* 的ノート: first-run onboard (UI-P4). Active when html.ui-refresh. */

const UI_ONBOARD_KEY="matonote_onboarded_v1";

function syncUiRefreshClass(){
  let on=false;
  try{ on=localStorage.getItem("uiRefreshPreview")==="1"; }catch(e){}
  if(!on&&typeof db!=="undefined"&&db.settings&&db.settings.uiRefresh) on=true;
  document.documentElement.classList.toggle("ui-refresh",!!on);
}
function onboardSheetHtml(){
  return `<div class="sheet onboardSheet">
    <h3>Archery-master へようこそ</h3>
    <div class="onboardSteps">
      <div class="onboardStep"><img src="icon-512.png" width="40" height="40" alt=""><div><b>数字で入力</b><span>ボタンで素早く記録</span></div></div>
      <div class="onboardStep"><span class="onboardGlyph" aria-hidden="true">◎</span><div><b>的をタップ</b><span>着弾位置も残せます</span></div></div>
      <div class="onboardStep"><span class="onboardGlyph" aria-hidden="true">↩</span><div><b>あとから直せます</b><span>矢を選んで微調整</span></div></div>
    </div>
    <p class="onboardLead">数字で入力 · 的をタップ · あとから直せます</p>
    <button class="btn startPrimary" id="onboardGo" type="button">始める</button>
  </div>`;
}
function maybeRunOnboard(onDone){
  if(typeof betaFullFeaturesActive==="function"&&betaFullFeaturesActive()) return false;
  if(!document.documentElement.classList.contains("ui-refresh")) return false;
  try{ if(localStorage.getItem(UI_ONBOARD_KEY)==="1") return false; }catch(e){ return false; }
  const finish=()=>{
    completeOnboard();
    if(typeof onDone==="function") onDone();
  };
  if(typeof mountOverlay==="function"){
    const {ovl,dismiss}=mountOverlay(onboardSheetHtml(),{ dismissOnBackdrop:true, onDismiss:finish });
    ovl.classList.add("onboardOvl");
    ovl.querySelector("#onboardGo").onclick=dismiss;
    return true;
  }
  const ovl=document.createElement("div");
  ovl.className="ovl onboardOvl";
  ovl.innerHTML=onboardSheetHtml();
  document.body.appendChild(ovl);
  if(typeof mountOverlayMotion==="function") mountOverlayMotion(ovl);
  ovl.querySelector("#onboardGo").onclick=finish;
  ovl.addEventListener("click",e=>{ if(e.target===ovl) finish(); });
  return true;
}
function completeOnboard(){
  try{ localStorage.setItem(UI_ONBOARD_KEY,"1"); }catch(e){}
}
if(typeof window!=="undefined"){
  window.syncUiRefreshClass=syncUiRefreshClass;
  window.maybeRunOnboard=maybeRunOnboard;
  window.completeOnboard=completeOnboard;
}
