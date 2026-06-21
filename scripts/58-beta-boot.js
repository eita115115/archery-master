"use strict";
/* Archery-master: beta channel boot (device testing). */

const BETA_OPT_KEY="matonote_beta_v1";

function betaQueryFlag(){
  try{
    const q=new URLSearchParams(location.search);
    if(q.get("beta")==="1") localStorage.setItem(BETA_OPT_KEY,"1");
    if(q.get("beta")==="0"){
      localStorage.removeItem(BETA_OPT_KEY);
      localStorage.removeItem("uiRefreshPreview");
    }
    return q.get("beta");
  }catch(e){ return null; }
}

function betaOptIn(){
  try{ return localStorage.getItem(BETA_OPT_KEY)==="1"; }catch(e){ return false; }
}

function betaFullFeaturesActive(){
  const p=window.__MATONOTE_BETA__;
  return !!(p&&p.channel==="beta"&&p.fullFeatures);
}

function betaFallbackProfile(){
  return {channel:"beta",uiRefresh:true,fullFeatures:true,unlockUiDepth:"L4",label:"Archery-master · UIベータ"};
}

function applyBetaFullFeatures(profile){
  if(!profile||!profile.fullFeatures) return;
  if(typeof db==="undefined"||!db||!db.settings) return;
  db.settings.uiRefresh=true;
  db.settings.expertMode=true;
  const level=profile.unlockUiDepth||"L4";
  if(!db.settings.uiDepth) db.settings.uiDepth={level,sessionsAtUnlock:0,expertMode:true,discoverySeen:{}};
  else{
    db.settings.uiDepth.level=level;
    db.settings.uiDepth.expertMode=true;
  }
  const seen=db.settings.uiDepth.discoverySeen||{};
  (window.UI_DEPTH_LEVELS||["L0","L1","L2","L3","L4"]).forEach(l=>{ seen[l]=true; });
  db.settings.uiDepth.discoverySeen=seen;
  if(typeof save==="function") save("beta-full-features");
}

function applyBetaProfile(profile){
  if(!profile||profile.channel!=="beta") return false;
  window.__MATONOTE_BETA__=profile;
  document.documentElement.classList.add("beta-channel");
  if(profile.uiRefresh){
    try{ localStorage.setItem("uiRefreshPreview","1"); }catch(e){}
    if(typeof db!=="undefined"&&db&&db.settings) db.settings.uiRefresh=true;
  }
  applyBetaFullFeatures(profile);
  if(typeof syncUiRefreshClass==="function") syncUiRefreshClass();
  const sub=document.querySelector("header.app .appIdentity .sub");
  if(sub&&profile.label) sub.textContent=profile.label;
  mountBetaBadge(profile);
  return true;
}

function mountBetaBadge(profile){
  if(document.getElementById("betaBadge")) return;
  const hdr=document.querySelector("header.app");
  if(!hdr) return;
  const el=document.createElement("span");
  el.id="betaBadge";
  el.className="betaBadge";
  el.setAttribute("aria-label","ベータ版（全機能）");
  el.textContent=profile&&profile.fullFeatures?"BETA·FULL":"BETA";
  if(profile&&profile.feedback) el.title=profile.feedback;
  hdr.appendChild(el);
}

async function fetchBetaProfile(){
  if(location.protocol==="file:"){
    return betaOptIn()?betaFallbackProfile():null;
  }
  try{
    const res=await fetch("beta.json?ts="+Date.now(),{cache:"no-store"});
    if(!res.ok) return betaOptIn()?betaFallbackProfile():null;
    return await res.json();
  }catch(e){
    return betaOptIn()?betaFallbackProfile():null;
  }
}

async function ensureBetaChannel(){
  betaQueryFlag();
  const profile=await fetchBetaProfile();
  if(profile&&profile.channel==="beta") applyBetaProfile(profile);
  else if(betaOptIn()) applyBetaProfile(betaFallbackProfile());
  return !!window.__MATONOTE_BETA__;
}

if(typeof window!=="undefined"){
  window.ensureBetaChannel=ensureBetaChannel;
  window.betaOptIn=betaOptIn;
  window.betaFullFeaturesActive=betaFullFeaturesActive;
  window.applyBetaFullFeatures=applyBetaFullFeatures;
}