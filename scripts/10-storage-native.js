"use strict";
/* Archery Note: storage, native bridge, exports, rounds */
/* ============ storage ============ */
const KEY="archeryNote.v1";
const SNAP_KEY="archeryNote.snapshots.v1";
const SCHEMA_VER=3;
const APP_VER=75;
const TRASH_LIMIT=50;
const STORAGE_ADAPTER_VER="storage-adapter v32";
const ENGINE_VER="RK4-3D JS core v32";
let db = load();
const BOW_TYPES=[
  {id:"recurve",label:"リカーブ"},
  {id:"compound",label:"コンパウンド"},
  {id:"barebow",label:"ベアボウ"},
  {id:"yumi",label:"和弓"}
];
const ENV_TYPES=[
  {id:"outdoor",label:"屋外"},
  {id:"indoor",label:"屋内"}
];
function bowTypeLabel(id){
  const row=BOW_TYPES.find(x=>x.id===id);
  return row?row.label:id||"—";
}
function envLabel(id){
  const row=ENV_TYPES.find(x=>x.id===id);
  return row?row.label:id||"—";
}
function blankDb(){ return {schema:SCHEMA_VER,setups:[],sightMarks:[],sessions:[],trash:[],settings:{eyeSight:850,theme:"auto",lastBackupAt:null,activeGuideSeen:false,targetHintSeen:false,defaultBowType:"recurve",defaultDistance:70,lastSelectedDistance:70,defaultEnvironment:"outdoor",timerEarlyTarget:30,aiOfflinePreparedAt:null,formPrecisionBaseline:null,formPrecisionBaselineBySetup:null,expertMode:false},active:null}; }
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
let wakeLockSentinel=null;
function nativeFeatureProfile(){
  const rt=runtimeKind();
  const nav=typeof navigator!=="undefined"?navigator:{};
  return {
    runtime:rt,
    haptics:!!capPlugin("Haptics") || typeof nav.vibrate==="function",
    share:!!capPlugin("Share") || typeof nav.share==="function",
    filesystem:!!capPlugin("Filesystem"),
    statusBar:!!capPlugin("StatusBar"),
    splash:!!capPlugin("SplashScreen"),
    keepAwake:!!capPlugin("KeepAwake") || !!(nav.wakeLock && typeof nav.wakeLock.request==="function")
  };
}
function syncKeepAwake(){
  const active=!!(db&&db.active);
  const ka=capPlugin("KeepAwake");
  try{
    if(ka){
      if(active && typeof ka.keepAwake==="function") ka.keepAwake().catch(()=>{});
      else if(!active && typeof ka.allowSleep==="function") ka.allowSleep().catch(()=>{});
    }
  }catch(e){}
  const nav=typeof navigator!=="undefined"?navigator:{};
  if(nav.wakeLock && typeof nav.wakeLock.request==="function"){
    if(active){
      if(!wakeLockSentinel){
        nav.wakeLock.request("screen").then(s=>{
          wakeLockSentinel=s;
          s.addEventListener("release",()=>{
            wakeLockSentinel=null;
            if(db&&db.active) syncKeepAwake();
          });
        }).catch(()=>{});
      }
    }else if(wakeLockSentinel){
      wakeLockSentinel.release().catch(()=>{}).finally(()=>{ wakeLockSentinel=null; });
    }
  }
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
    (native.haptics ? .22 : .08) +
    (native.share ? .22 : .08) +
    (native.filesystem ? .18 : .04) +
    (native.keepAwake ? .14 : .04) +
    (native.statusBar ? .10 : .04) +
    (native.splash ? .08 : .04) +
    (runtime.kind==="Native" ? .06 : 0),
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
  const offline=db.settings.aiOfflinePreparedAt?`${fmtD(db.settings.aiOfflinePreparedAt.slice(0,10))} 準備済`:"未準備";
  return `<details class="adv appInfoDetails">
    <summary>アプリ情報</summary>
    <div class="advice appInfoBlock" style="background:var(--card);border-color:var(--line)">
      <div class="note">Archery-master v${APP_VER}</div>
      <div class="note">${esc(p.storage.label)} — 記録はこの端末に保存されます</div>
      <div class="note">オフライン用データ: ${offline}</div>
      ${p.next.length?`<div class="note">次に整えるとよいこと: ${p.next.map(esc).join("・")}</div>`:""}
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
  if(v==="Q40") return {faceD:40,faceType:"quad"};
  if(v[0]==="F") return {faceD:+v.slice(1)||40,faceType:"field"};
  return {faceD:+v||122,faceType:"single"};
}
function faceLabel(s){
  if(s.faceType==="triple") return "40cm三つ目";
  if(s.faceType==="quad") return "40cm四枚";
  if(s.faceType==="field") return `${s.faceD}cmフィールド`;
  return `${s.faceD}cm的`;
}
function perfectScoreValue(sess){ return sess&&sess.faceType==="field" ? 6 : 10; }
function perfectScoreLabel(sess){ return `${perfectScoreValue(sess)}点`; }
function perfectScoreCount(arrows,sess){ const top=perfectScoreValue(sess); return (arrows||[]).filter(a=>a.s===top).length; }
function sessionUsesX(sess){
  if(!sess||sess.faceType==="field") return false;
  if(sess.bowType==="compound") return false;
  if(sess.environment==="indoor") return false;
  return true;
}
function secondaryScoreLabel(sess){
  if(sess&&sess.faceType==="field") return "5点以上";
  if(!sessionUsesX(sess)) return "10";
  return "X";
}
function secondaryScoreCount(arrows,sess){
  if(sess&&sess.faceType==="field") return (arrows||[]).filter(a=>a.s>=5).length;
  if(!sessionUsesX(sess)) return (arrows||[]).filter(a=>a.s===10).length;
  return (arrows||[]).filter(a=>a.X).length;
}
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
  {id:"70m72",label:"70m 72射",arrows:72,dist:70,perEnd:6,timer:240},
  {id:"50m72",label:"50m 72射（CP）",arrows:72,dist:50,perEnd:6,faceD:48,faceType:"single",timer:240},
  {id:"30m36",label:"30m 36射",arrows:36,dist:30,perEnd:3,timer:120},
  {id:"18m60",label:"18m 60射",arrows:60,dist:18,perEnd:3,faceD:40,faceType:"triple",timer:120},
  {id:"18m60_jp",label:"18m 60射（日本記録会）",arrows:60,dist:18,perEnd:3,ends:20,faceD:40,faceType:"triple",indoor:true,timer:120},
  {id:"18m60_jp_x2",label:"18m 120射（記録会2試合）",arrows:120,dist:18,perEnd:3,ends:40,faceD:40,faceType:"triple",indoor:true,timer:120,jpDouble:true},
  {id:"quad60_jp",label:"18m 60射（四枚40cm・小中学生）",arrows:60,dist:18,perEnd:3,ends:20,faceD:40,faceType:"quad",indoor:true,timer:120,quad:true},
  {id:"volume",label:"本数練",arrows:null,purpose:"volume",perEnd:8},
  {id:"field72",label:"フィールド 24標的/72射",arrows:72,perEnd:3,faceD:80,faceType:"field",ends:24},
  {id:"field24",label:"フィールド 24標的/72射（別名）",arrows:72,perEnd:3,faceD:80,faceType:"field",ends:24},
  {id:"field12",label:"フィールド 12標的/36射",arrows:36,perEnd:3,faceD:80,faceType:"field",ends:12,timer:120},
  {id:"setMatch5",label:"セットマッチ練習（5×3射）",arrows:15,perEnd:3,ends:5,timer:120,match:true},
  {id:"teamSet4",label:"団体セット練習（4×6射）",arrows:24,perEnd:6,ends:4,timer:120,match:true,team:true}
];
function roundMeta(id){ return ROUND_TYPES.find(r=>r.id===(id||"free"))||ROUND_TYPES[0]; }
function applyRoundToSession(sess,roundId){
  const r=roundMeta(roundId);
  if(!r||roundId==="free"||!sess) return sess;
  if(r.dist!=null) sess.dist=r.dist;
  if(r.perEnd!=null) sess.perEnd=r.perEnd;
  if(r.faceD!=null) sess.faceD=r.faceD;
  if(r.faceType!=null) sess.faceType=r.faceType;
  if(r.indoor) sess.environment="indoor";
  if(roundId==="18m60_jp"||roundId==="18m60_jp_x2"){
    sess.indoorHalf=1;
    if(!sess.laneSpot) sess.laneSpot="A";
    if(roundId==="18m60_jp_x2") sess.jpMatch=1;
  }
  if(roundId==="quad60_jp"||r.quad||r.faceType==="quad"){
    sess.quadHalf=sess.quadHalf||"first";
    sess.quadHalfSwitchEnd=sess.quadHalfSwitchEnd||10;
    if(!sess.curSpotId) sess.curSpotId="A";
    if(!sess.laneSpot) sess.laneSpot="A";
  }
  if(r.match){
    sess.matchMeta={selfSetPts:0,oppSetPts:0,sets:[],team:!!r.team};
    sess.purpose=sess.purpose||"match_practice";
    if(r.team) sess.teamArchers={names:["1番手","2番手","3番手"]};
  }
  if(isFieldRoundId(roundId)&&r.faceType==="field"){
    const presetId=defaultFieldCourseId(roundId);
    if(presetId) applyFieldCourseToSession(sess,presetId);
  }
  return sess;
}
function roundLabel(id){ return roundMeta(id).label; }
function roundTotalEnds(sess){
  const r=roundMeta(sess&&sess.round);
  if(r.ends) return r.ends;
  if(r.arrows&&sess&&sess.perEnd) return Math.ceil(r.arrows/sess.perEnd);
  return null;
}
const FIELD_COURSE_DISCLAIMER="練習用プリセット。大会公式コースの代替ではありません。";
const FIELD_COURSE_PRESETS={
  flat24_marked:{id:"flat24_marked",label:"フラット24（マーク・練習用）",targets:[
    {target:1,distM:15,angleDeg:0,faceD:80,marked:true},{target:2,distM:15,angleDeg:0,faceD:80,marked:true},{target:3,distM:15,angleDeg:0,faceD:80,marked:true},
    {target:4,distM:18,angleDeg:0,faceD:60,marked:true},{target:5,distM:18,angleDeg:0,faceD:60,marked:true},{target:6,distM:18,angleDeg:0,faceD:60,marked:true},
    {target:7,distM:20,angleDeg:0,faceD:60,marked:true},{target:8,distM:20,angleDeg:0,faceD:60,marked:true},{target:9,distM:20,angleDeg:0,faceD:40,marked:true},
    {target:10,distM:22,angleDeg:0,faceD:40,marked:true},{target:11,distM:22,angleDeg:0,faceD:40,marked:true},{target:12,distM:22,angleDeg:0,faceD:40,marked:true},
    {target:13,distM:25,angleDeg:0,faceD:40,marked:true},{target:14,distM:25,angleDeg:0,faceD:40,marked:true},{target:15,distM:25,angleDeg:0,faceD:40,marked:true},
    {target:16,distM:28,angleDeg:0,faceD:40,marked:true},{target:17,distM:28,angleDeg:0,faceD:40,marked:true},{target:18,distM:28,angleDeg:0,faceD:40,marked:true},
    {target:19,distM:30,angleDeg:0,faceD:40,marked:true},{target:20,distM:30,angleDeg:0,faceD:40,marked:true},{target:21,distM:30,angleDeg:0,faceD:40,marked:true},
    {target:22,distM:32,angleDeg:0,faceD:40,marked:true},{target:23,distM:32,angleDeg:0,faceD:40,marked:true},{target:24,distM:32,angleDeg:0,faceD:40,marked:true}
  ]},
  wa_sample12:{id:"wa_sample12",label:"WA簡易12標的（距離・角度混在）",targets:[
    {target:1,distM:15,angleDeg:0,faceD:80,marked:true},{target:2,distM:18,angleDeg:-10,faceD:60,marked:true},
    {target:3,distM:20,angleDeg:15,faceD:60,marked:true},{target:4,distM:22,angleDeg:0,faceD:40,marked:true},
    {target:5,distM:25,angleDeg:-20,faceD:40,marked:true},{target:6,distM:28,angleDeg:10,faceD:40,marked:true},
    {target:7,distM:30,angleDeg:0,faceD:80,marked:true},{target:8,distM:32,angleDeg:-15,faceD:60,marked:true},
    {target:9,distM:35,angleDeg:20,faceD:40,marked:true},{target:10,distM:38,angleDeg:0,faceD:40,marked:true},
    {target:11,distM:40,angleDeg:-10,faceD:60,marked:true},{target:12,distM:45,angleDeg:0,faceD:80,marked:true}
  ]}
};
function isFieldRoundId(id){ return id==="field12"||id==="field24"||id==="field72"; }
function defaultFieldCourseId(roundId){
  if(roundId==="field12") return "wa_sample12";
  if(isFieldRoundId(roundId)) return "flat24_marked";
  return null;
}
function fieldCourseLabel(presetId){
  const p=FIELD_COURSE_PRESETS[presetId];
  return p?p.label:presetId==="custom"?"手動":presetId||"—";
}
function fieldTargetMeta(sess,endIdx){
  const course=sess&&sess.fieldCourse;
  if(!course||!course.length) return null;
  const i=Math.max(0,Math.min(endIdx,course.length-1));
  return course[i];
}
function fieldRepresentativeDist(course){
  if(!course||!course.length) return null;
  const sum=course.reduce((a,t)=>a+(t.distM||0),0);
  return Math.round(sum/course.length);
}
function applyFieldCourseToSession(sess,presetId){
  const preset=FIELD_COURSE_PRESETS[presetId];
  if(!preset||!sess) return sess;
  const ends=roundTotalEnds(sess)||preset.targets.length;
  sess.fieldCourseId=presetId;
  sess.fieldCourse=preset.targets.slice(0,ends).map(t=>Object.assign({},t));
  sess.faceType="field";
  const first=sess.fieldCourse[0];
  if(first){
    sess.faceD=first.faceD||80;
    sess.dist=fieldRepresentativeDist(sess.fieldCourse)||first.distM||30;
  }
  applyFieldTargetToSession(sess,0);
  return sess;
}
function applyFieldTargetToSession(sess,endIdx){
  const t=fieldTargetMeta(sess,endIdx);
  if(!t||!sess) return sess;
  sess.faceD=t.faceD||80;
  sess.faceType="field";
  sess.dist=t.distM||sess.dist||30;
  sess.fieldTargetIdx=endIdx;
  sess.shaft=+lineCutRadius(sess.faceD,"field").toFixed(3);
  return sess;
}
function tagFieldArrows(arrows,sess,endIdx){
  const t=fieldTargetMeta(sess,endIdx);
  if(!t||!arrows) return;
  arrows.forEach(a=>{
    a.fieldTarget=t.target;
    a.fieldDistM=t.distM;
    a.fieldAngleDeg=t.angleDeg;
  });
}
function fieldAngleLabel(deg){
  const d=deg||0;
  return d>0?`+${d}°`:d<0?`${d}°`:"0°";
}
function fieldHudLine(sess){
  if(!sess||!sess.fieldCourse||!sess.fieldCourse.length) return "";
  const endIdx=(sess.ends||[]).length;
  const t=fieldTargetMeta(sess,endIdx);
  if(!t) return "";
  const total=sess.fieldCourse.length;
  return `標的 ${t.target}/${total} · ${t.distM}m · ${fieldAngleLabel(t.angleDeg)} · ${t.faceD}cm`;
}
function fieldCourseTableHtml(sess){
  if(!sess||!sess.fieldCourse||!sess.fieldCourse.length) return "";
  const cur=(sess.ends||[]).length;
  const rows=sess.fieldCourse.map((t,i)=>`<tr class="${i===cur?"fieldRowCur":""}"><td>${t.target}</td><td>${t.distM}m</td><td>${fieldAngleLabel(t.angleDeg)}</td><td>${t.faceD}cm</td><td>${t.marked?"✓":"—"}</td></tr>`).join("");
  return `<table class="tbl fieldCourseTbl"><tr><th>#</th><th>距離</th><th>角度</th><th>面</th><th>マーク</th></tr>${rows}</table>`;
}
function fieldTargetSummaryHtml(sess){
  if(!sess||!sess.fieldCourse||typeof groupByFieldTargetStats!=="function") return "";
  const stats=groupByFieldTargetStats(sess);
  if(!stats.some(s=>s.count>0)) return "";
  return stats.filter(s=>s.count>0).map(s=>`<div class="note">標的${s.target}: 平均${s.avg.toFixed(1)}（${s.count}本 / ${s.total}点）</div>`).join("");
}
function fieldBadgeTotal(sess){
  if(sess&&sess.fieldCourse&&typeof sessionTotalPointsMarkedField==="function") return sessionTotalPointsMarkedField(sess);
  return typeof sessionTotalPoints==="function"?sessionTotalPoints(sess):0;
}
function sessionTotalPointsMarkedField(sess){
  if(!sess||!sess.fieldCourse) return 0;
  const marked=new Set(sess.fieldCourse.filter(t=>t.marked).map(t=>t.target));
  if(!marked.size) return (sess.ends||[]).flat().reduce((a,x)=>a+(x.s||0),0);
  return (sess.ends||[]).flat().reduce((a,x)=>a+(marked.has(x.fieldTarget)?(x.s||0):0),0);
}
