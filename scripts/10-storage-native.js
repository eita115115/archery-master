"use strict";
/* Archery Note: storage, native bridge, exports, rounds */
/* ============ storage ============ */
const KEY="archeryNote.v1";
const SNAP_KEY="archeryNote.snapshots.v1";
const SCHEMA_VER=3;
const APP_VER=56;
const TRASH_LIMIT=50;
const STORAGE_ADAPTER_VER="storage-adapter v32";
const ENGINE_VER="RK4-3D JS core v32";
const NATIVE_CHANNEL="PWA + Capacitor-ready";
let db = load();
function blankDb(){ return {schema:SCHEMA_VER,setups:[],sightMarks:[],sessions:[],trash:[],settings:{eyeSight:850,theme:"auto",lastBackupAt:null,activeGuideSeen:false},active:null}; }
function normalizeDb(d){
  const base=blankDb(), src=(d&&typeof d==="object")?d:{};
  const out=Object.assign(base,src);
  out.settings=Object.assign(base.settings,src.settings||{});
  ["setups","sightMarks","sessions","trash"].forEach(k=>{ if(!Array.isArray(out[k])) out[k]=[]; });
  out.trash=out.trash.filter(x=>x&&x.id&&x.type&&x.data).slice(0,TRASH_LIMIT);
  if(out.active==null) out.active=null;
  out.schema=SCHEMA_VER;
  return out;
}
function load(){
  try{ const d=JSON.parse(storageGetItem(KEY)); if(d && d.sessions) return normalizeDb(d); }catch(e){}
  return blankDb();
}
function dataCounts(d=db){
  return {sessions:(d.sessions||[]).length,setups:(d.setups||[]).length,marks:(d.sightMarks||[]).length};
}
function storageBridge(){
  const w=typeof window!=="undefined"?window:{};
  return w.ArcheryNativeStorage||w.ArcheryStorage||null;
}
function storageGetItem(key){
  const bridge=storageBridge();
  try{
    if(bridge && typeof bridge.getItem==="function"){
      const v=bridge.getItem(key);
      if(typeof v==="string" || v==null) return v;
    }
  }catch(e){}
  try{ return typeof localStorage!=="undefined" ? localStorage.getItem(key) : null; }catch(e){ return null; }
}
function storageSetItem(key,value){
  const bridge=storageBridge();
  try{
    if(bridge && typeof bridge.setItem==="function"){
      const ok=bridge.setItem(key,value);
      if(ok!==false) return true;
    }
  }catch(e){}
  if(typeof localStorage==="undefined") return false;
  localStorage.setItem(key,value);
  return true;
}
function storageDriverProfile(){
  const bridge=storageBridge();
  const native=!!(bridge && typeof bridge.getItem==="function" && typeof bridge.setItem==="function");
  return {id:native?"native-sync-bridge":"localStorage",label:native?"ネイティブ保存ブリッジ":"ブラウザ保存",version:STORAGE_ADAPTER_VER,native};
}
function runtimeKind(){
  const w=typeof window!=="undefined"?window:{};
  const nav=typeof navigator!=="undefined"?navigator:{};
  const isNative=!!(w.Capacitor && typeof w.Capacitor.getPlatform==="function");
  const standalone=!!(nav.standalone || (typeof w.matchMedia==="function" && w.matchMedia("(display-mode: standalone)").matches));
  if(isNative) return {kind:"Native", label:"ネイティブ容器", tone:"ok"};
  if(standalone) return {kind:"PWA", label:"ホーム画面", tone:"mid"};
  return {kind:"Web", label:"ブラウザ", tone:"mid"};
}
function capPlugin(name){
  const w=typeof window!=="undefined"?window:{};
  return w.Capacitor && w.Capacitor.Plugins ? w.Capacitor.Plugins[name] : null;
}
function nativeFeatureProfile(){
  const rt=runtimeKind();
  const nav=typeof navigator!=="undefined"?navigator:{};
  return {
    runtime:rt,
    haptics:!!capPlugin("Haptics") || typeof nav.vibrate==="function",
    share:!!capPlugin("Share") || typeof nav.share==="function",
    filesystem:!!capPlugin("Filesystem"),
    statusBar:!!capPlugin("StatusBar"),
    splash:!!capPlugin("SplashScreen")
  };
}
function nativePulse(kind){
  const h=capPlugin("Haptics");
  try{
    if(h && typeof h.impact==="function"){
      const style=kind==="heavy"?"HEAVY":kind==="light"?"LIGHT":"MEDIUM";
      h.impact({style}).catch(()=>{});
      return true;
    }
    if(h && typeof h.selectionChanged==="function"){
      h.selectionChanged().catch(()=>{});
      return true;
    }
  }catch(e){}
  try{
    if(navigator.vibrate){
      const pat=kind==="success"?[12,24,18]:kind==="heavy"?28:12;
      navigator.vibrate(pat);
      return true;
    }
  }catch(e){}
  return false;
}
function updateAppChrome(){
  const rt=runtimeKind();
  const st=$("#appStatus");
  if(st){
    const dot=rt.kind==="Native"?"native":"";
    st.innerHTML=`<span class="statusDot ${dot}"></span><span>${esc(rt.label)}</span>`;
  }
  const sb=capPlugin("StatusBar");
  try{
    if(sb && typeof sb.setBackgroundColor==="function") sb.setBackgroundColor({color:"#17643d"}).catch(()=>{});
    if(sb && typeof sb.setStyle==="function") sb.setStyle({style:"DARK"}).catch(()=>{});
  }catch(e){}
}
function nativeReadinessProfile(){
  const counts=dataCounts();
  const runtime=runtimeKind();
  const storage=storageDriverProfile();
  const native=nativeFeatureProfile();
  const storageScore=clamp((counts.sessions?0.22:0.12)+(counts.setups?0.22:0.08)+(db.settings.lastBackupAt?0.18:0)+(readSnapshots().length?0.18:0)+0.20,0,1);
  const engineScore=.84;
  const nativeScore=clamp(
    (native.haptics ? .25 : .08) +
    (native.share ? .25 : .08) +
    (native.filesystem ? .20 : .04) +
    (native.statusBar ? .12 : .04) +
    (native.splash ? .10 : .04) +
    (runtime.kind==="Native" ? .08 : 0),
    0,1
  );
  const shellScore=clamp(.54 + nativeScore*.36,0,1);
  const next=[];
  if(!db.settings.lastBackupAt) next.push("バックアップ保存");
  if(!counts.setups) next.push("用具登録");
  if(counts.sessions<3) next.push("練習記録");
  if(!next.length) next.push("同条件の記録を増やす");
  return {runtime,storage,native,nativeScore,storageScore,engineScore,shellScore,next,counts};
}
function nativeReadinessHtml(){
  const p=nativeReadinessProfile();
  const nf=p.native;
  return `<details class="adv appInfoDetails">
    <summary>アプリ情報・保存状態</summary>
    <div class="advice" style="background:var(--card);border-color:var(--line)">
    <div class="note"><b>アプリ基盤: ${p.runtime.label}</b> / ${ENGINE_VER} / ${esc(p.storage.label)}</div>
    <div class="nativeStack">
      <div class="nativePill"><div class="k">保存</div><b>${pct(p.storageScore)}</b><span>バックアップと復元を維持</span></div>
      <div class="nativePill"><div class="k">演算</div><b>${pct(p.engineScore)}</b><span>物理コア分離へ移行中</span></div>
      <div class="nativePill"><div class="k">触感/共有</div><b>${pct(p.nativeScore)}</b><span>${nf.haptics?"触感 ":""}${nf.share?"共有 ":""}${nf.filesystem?"ファイル ":""}${nf.statusBar?"表示 ":""}</span></div>
      <div class="nativePill"><div class="k">配布</div><b>${pct(p.shellScore)}</b><span>${NATIVE_CHANNEL}</span></div>
    </div>
    <div class="note">次に整える材料: ${p.next.map(esc).join("・")}</div>
    </div>
  </details>`;
}
function hashText(s){
  let h=2166136261;
  for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); }
  return (h>>>0).toString(36);
}
function readSnapshots(){
  try{ const a=JSON.parse(storageGetItem(SNAP_KEY)); return Array.isArray(a)?a:[]; }catch(e){ return []; }
}
function snapshotLabel(s){
  const c=s.counts||dataCounts(s.data||{});
  return `${new Date(s.ts||Date.now()).toLocaleString()}（練習${c.sessions||0} / 用具${c.setups||0} / サイト${c.marks||0}）`;
}
let snapshotJob=null, snapshotPending=null;
function runIdleTask(fn, timeout){
  const w=typeof window!=="undefined"?window:{};
  if(typeof w.requestIdleCallback==="function") return {kind:"idle",id:w.requestIdleCallback(fn,{timeout:timeout||1500})};
  return {kind:"timeout",id:setTimeout(fn,0)};
}
function cancelIdleTask(job){
  const w=typeof window!=="undefined"?window:{};
  if(!job) return;
  if(job.kind==="idle" && typeof w.cancelIdleCallback==="function") w.cancelIdleCallback(job.id);
  else clearTimeout(job.id);
}
function writeSafetySnapshot(reason="auto", force=false, rawOverride=null){
  try{
    const raw=rawOverride||JSON.stringify(db), h=hashText(raw), now=Date.now();
    const current=readSnapshots();
    let snaps=current.filter(s=>s&&s.hash!==h);
    const latest=current[0];
    if(!force && latest && latest.hash===h) return;
    if(!force && latest && now-(latest.ts||0)<30*60*1000) return;
    snaps.unshift({ts:now,reason,hash:h,counts:dataCounts(db),data:JSON.parse(raw)});
    snaps=snaps.slice(0,6);
    for(;;){
      try{ storageSetItem(SNAP_KEY,JSON.stringify(snaps)); break; }
      catch(e){ if(snaps.length<=1) throw e; snaps.pop(); }
    }
  }catch(e){ console.warn("snapshot failed",e); }
}
function flushSafetySnapshot(){
  if(!snapshotPending) return;
  const p=snapshotPending;
  snapshotPending=null;
  if(snapshotJob){ cancelIdleTask(snapshotJob); snapshotJob=null; }
  writeSafetySnapshot(p.reason,p.force,p.raw);
}
function scheduleSafetySnapshot(reason, raw, force){
  if(force){
    snapshotPending=null;
    if(snapshotJob){ cancelIdleTask(snapshotJob); snapshotJob=null; }
    writeSafetySnapshot(reason,true,raw);
    return;
  }
  snapshotPending={reason,raw,force:false};
  if(snapshotJob) return;
  snapshotJob=runIdleTask(()=>{
    snapshotJob=null;
    flushSafetySnapshot();
  },1800);
}
function save(opts){
  const o=typeof opts==="string"?{reason:opts}:opts||{};
  db.schema=SCHEMA_VER; db.updatedAt=new Date().toISOString();
  try{
    const raw=JSON.stringify(db);
    storageSetItem(KEY, raw);
    scheduleSafetySnapshot(o.reason||"auto", raw, !!o.forceSnapshot);
  }catch(e){
    console.error(e);
    try{ toast("保存容量が足りません。設定からバックアップ保存してください"); }catch(_){}
  }
}
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function toast(msg){ const t=$("#toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(t._tm); t._tm=setTimeout(()=>t.classList.remove("show"),1700); }
function today(){ return new Date().toISOString().slice(0,10); }
function fmtD(iso){ if(!iso)return""; const [y,m,d]=iso.split("-"); return `${y}/${+m}/${+d}`; }
const ENDCOLORS=["#e5484d","#1e6fd9","#0f9d58","#f59e0b","#8b5cf6","#ec4899","#0ea5b7","#7c5e10","#475569","#b91c1c","#1d4ed8","#047857"];
const FIELD_FACE_SIZES=[80,60,40,20];
function parseFaceChoice(value){
  const v=String(value||"");
  if(v==="T40") return {faceD:40,faceType:"triple"};
  if(v[0]==="F") return {faceD:+v.slice(1)||40,faceType:"field"};
  return {faceD:+v||122,faceType:"single"};
}
function faceLabel(s){
  if(s.faceType==="triple") return "40cm三つ目";
  if(s.faceType==="field") return `${s.faceD}cmフィールド`;
  return `${s.faceD}cm的`;
}
function perfectScoreValue(sess){ return sess&&sess.faceType==="field" ? 6 : 10; }
function perfectScoreLabel(sess){ return `${perfectScoreValue(sess)}点`; }
function perfectScoreCount(arrows,sess){ const top=perfectScoreValue(sess); return (arrows||[]).filter(a=>a.s===top).length; }
function secondaryScoreLabel(sess){ return sess&&sess.faceType==="field" ? "5点以上" : "X"; }
function secondaryScoreCount(arrows,sess){ return sess&&sess.faceType==="field" ? (arrows||[]).filter(a=>a.s>=5).length : (arrows||[]).filter(a=>a.X).length; }
function cloneData(v){ return JSON.parse(JSON.stringify(v)); }
function trashItem(type,label,data){
  db.trash=db.trash||[];
  const item={id:uid(),type,label:label||"削除データ",data:cloneData(data),date:today(),ts:Date.now()};
  db.trash.unshift(item);
  db.trash=db.trash.slice(0,TRASH_LIMIT);
  return item;
}
function restoreTrash(id){
  const i=(db.trash||[]).findIndex(x=>x.id===id);
  if(i<0) return false;
  const item=db.trash[i], data=cloneData(item.data);
  if(item.type==="session"){
    if(!db.sessions.some(s=>s.id===data.id)) db.sessions.push(data);
  }else if(item.type==="sightMark"){
    if(!db.sightMarks.some(m=>m.id===data.id)) db.sightMarks.push(data);
  }else if(item.type==="setupBundle"){
    const setup=data.setup;
    if(setup && !db.setups.some(s=>s.id===setup.id)) db.setups.push(setup);
    (data.sightMarks||[]).forEach(m=>{ if(!db.sightMarks.some(x=>x.id===m.id)) db.sightMarks.push(m); });
  }
  db.trash.splice(i,1);
  save({reason:"restore-trash",forceSnapshot:true});
  return true;
}
function trashTypeLabel(t){ return t==="session"?"練習":t==="sightMark"?"サイト値":t==="setupBundle"?"用具":"削除データ"; }
function downloadText(filename,text,type){
  const blob=new Blob([text],{type:type||"text/plain"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=filename; a.click(); URL.revokeObjectURL(a.href);
}
async function shareOrDownloadText(filename,text,type,title){
  const mime=type||"text/plain";
  try{
    const file=new File([text],filename,{type:mime});
    if(navigator.canShare && navigator.canShare({files:[file]}) && navigator.share){
      await navigator.share({title:title||filename,files:[file]});
      nativePulse("success");
      return true;
    }
  }catch(e){}
  try{
    const fs=capPlugin("Filesystem"), sh=capPlugin("Share");
    if(fs && sh && typeof fs.writeFile==="function" && typeof sh.share==="function"){
      const res=await fs.writeFile({path:filename,data:text,directory:"CACHE",encoding:"utf8",recursive:true});
      await sh.share({title:title||filename,text:title||filename,url:res.uri,dialogTitle:title||"共有"});
      nativePulse("success");
      return true;
    }
  }catch(e){}
  try{
    if(navigator.share && text.length<90000){
      await navigator.share({title:title||filename,text});
      nativePulse("success");
      return true;
    }
  }catch(e){}
  downloadText(filename,text,mime);
  nativePulse("light");
  return false;
}
function csvCell(v){ return `"${String(v==null?"":v).replace(/"/g,'""')}"`; }
const ROUND_TYPES=[
  {id:"free",label:"自由練習",arrows:null},
  {id:"70m72",label:"70m 72射",arrows:72,dist:70},
  {id:"50m72",label:"50m 72射",arrows:72,dist:50},
  {id:"30m36",label:"30m 36射",arrows:36,dist:30},
  {id:"18m60",label:"18m 60射",arrows:60,dist:18},
  {id:"field72",label:"フィールド 24標的/72射",arrows:72}
];
function roundLabel(id){ return (ROUND_TYPES.find(r=>r.id===(id||"free"))||ROUND_TYPES[0]).label; }
