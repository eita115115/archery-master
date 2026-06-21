"use strict";
/* 的ノート: progressive disclosure L0–L4 (UI_RESEARCH §6). */

const UI_DEPTH_LEVELS=["L0","L1","L2","L3","L4"];
const UI_DEPTH_TOASTS={
  L1:"的をタップすると着弾も残せます",
  L2:"その他から写真・紙の読み取りも使えます",
  L3:"サイト調整の記録が使えるようになりました",
};

function defaultUiDepthState(){
  return {level:"L0",sessionsAtUnlock:0,expertMode:false,discoverySeen:{}};
}
function uiDepthFromSessions(count){
  if(count>=10) return "L3";
  if(count>=3) return "L2";
  if(count>=1) return "L1";
  return "L0";
}
function ensureUiDepth(settings){
  settings=settings||{};
  if(!settings.uiDepth) settings.uiDepth=defaultUiDepthState();
  if(!settings.uiDepth.discoverySeen) settings.uiDepth.discoverySeen={};
  if(typeof betaFullFeaturesActive==="function"&&betaFullFeaturesActive()){
    const level=(window.__MATONOTE_BETA__&&window.__MATONOTE_BETA__.unlockUiDepth)||"L4";
    settings.uiDepth.level=level;
    settings.uiDepth.expertMode=true;
    (UI_DEPTH_LEVELS||[]).forEach(l=>{ settings.uiDepth.discoverySeen[l]=true; });
    return settings.uiDepth;
  }
  const n=(typeof db!=="undefined"&&db.sessions)?db.sessions.length:0;
  const auto=uiDepthFromSessions(n);
  const order={L0:0,L1:1,L2:2,L3:3,L4:4};
  if(order[auto]>(order[settings.uiDepth.level]||0)){
    settings.uiDepth.level=auto;
    settings.uiDepth.sessionsAtUnlock=n;
  }
  return settings.uiDepth;
}
function uiDepthAllows(feature){
  if(typeof betaFullFeaturesActive==="function"&&betaFullFeaturesActive()) return true;
  if(typeof db!=="undefined"&&db.settings&&db.settings.expertMode) return true;
  const d=ensureUiDepth(typeof db!=="undefined"?db.settings:{});
  const need={targetTap:"L1",weekRoll:"L2",sightSheet:"L3",expert:"L4"};
  const order={L0:0,L1:1,L2:2,L3:3,L4:4};
  return (order[d.level]||0)>=(order[need[feature]]||0);
}
function maybeUiDepthToast(event){
  if(typeof uiRefreshActive==="function"&&!uiRefreshActive()) return;
  if(event!=="session_end"||typeof db==="undefined"||!db.settings||typeof toast!=="function") return;
  const depth=ensureUiDepth(db.settings);
  const seen=depth.discoverySeen||{};
  const level=depth.level;
  if(!seen[level]&&UI_DEPTH_TOASTS[level]){
    seen[level]=true;
    toast(UI_DEPTH_TOASTS[level]);
    if(typeof feedbackPulse==="function") feedbackPulse("light");
    depth.discoverySeen=seen;
    if(typeof save==="function") save("ui-depth-discovery");
  }
}
if(typeof window!=="undefined"){
  window.ensureUiDepth=ensureUiDepth;
  window.uiDepthAllows=uiDepthAllows;
  window.maybeUiDepthToast=maybeUiDepthToast;
  window.UI_DEPTH_LEVELS=UI_DEPTH_LEVELS;
}