"use strict";
/* 的ノート: record and active-session views */
/* ============ views ============ */
let view="home";
let ui={ selArrow:-1, sightSel:{setupId:null, dist:70}, histOpen:null, histFilter:{setupId:"",dist:"",round:""}, zoom:1, recordMode:"practice", freshArrow:-1, freshTimer:0, inputMode:"grid", scanBound:false, scanResult:null, gridCell:-1 };
let scanSession=null;
function showView(v){
  if(db.active && v==="home") v="record";
  if(view===v) return;
  view=v; ui.selArrow=-1; nativePulse("light"); render();
}
document.querySelectorAll("#tabs button").forEach(b=>b.onclick=()=>showView(b.dataset.v));

function render(){
  updateAppChrome();
  if(typeof syncUpdateBarVisibility==="function") syncUpdateBarVisibility();
  const tabs=Array.prototype.slice.call(document.querySelectorAll("#tabs button"));
  const effectiveView=db.active?"record":view;
  const activeIndex=Math.max(0,tabs.findIndex(b=>b.dataset.v===effectiveView));
  const tabBar=$("#tabs");
  if(tabBar) tabBar.style.setProperty("--active-tab", activeIndex);
  tabs.forEach(b=>b.classList.toggle("on",b.dataset.v===effectiveView));
  if(db.active) tabs.forEach(b=>b.classList.toggle("live",b.dataset.v==="record"));
  const m=$("#main");
  if(effectiveView==="record"){ if(db.active) renderActive(m); else renderRecordIdle(m); }
  else if(effectiveView==="history") renderHistory(m);
  else renderHome(m);
}

function homeDashboardHtml(){
  const today=today();
  const todaySessions=db.sessions.filter(s=>s.date===today);
  const todayBest=todaySessions.length?Math.max(...todaySessions.map(s=>aggregateSessionStats(sessionArrows(s)).total)):null;
  const recent5=[...db.sessions].sort((a,b)=>(b.date||"").localeCompare(a.date||"")||(b.id<a.id?-1:1)).slice(0,5);
  const recentTotals=recent5.map(s=>aggregateSessionStats(sessionArrows(s)).total);
  const avg5=recentTotals.length?recentTotals.reduce((a,x)=>a+x,0)/recentTotals.length:null;
  const prev5=[...db.sessions].sort((a,b)=>(b.date||"").localeCompare(a.date||"")||(b.id<a.id?-1:1)).slice(5,10);
  const prevAvg=prev5.length?prev5.map(s=>aggregateSessionStats(sessionArrows(s)).total).reduce((a,x)=>a+x,0)/prev5.length:null;
  let deltaHtml="—";
  if(avg5!=null && prevAvg!=null){
    const d=avg5-prevAvg;
    const sign=d>=0?"▲":"▼";
    deltaHtml=`${sign} ${Math.abs(d).toFixed(1)}`;
  }else if(avg5!=null){
    deltaHtml="初回記録";
  }
  return `<section class="dashHero card">
    <div class="dashBest"><div class="k">本日のベスト</div><b>${todayBest!=null?todayBest:"—"}</b><span>点</span></div>
    <div class="dashAvg"><div class="k">直近5R平均</div><b>${avg5!=null?avg5.toFixed(1):"—"}</b><span class="dashDelta">${deltaHtml}</span></div>
  </section>`;
}
function renderHome(m){
  const last=db.sessions[db.sessions.length-1];
  const defSetup=last?last.setupId:(db.setups[0]?db.setups[0].id:"");
  const defDist=last?last.dist:(db.settings.lastSelectedDistance||db.settings.defaultDistance||70);
  const mode=ui.recordMode||"practice";
  const defFace=suggestedFaceValue(defDist,last);
  const sys=setupSystemSummary(defSetup);
  const recent=db.sessions.slice(-3).reverse();
  const recentHtml=recent.length?`<section class="card homeRecent"><h2>最近の記録</h2>${recent.map(s=>`
    <button class="listItem" type="button" data-open-sess="${esc(s.id)}">
      <span><b>${fmtD(s.date)}</b> ${s.dist}m / ${bowTypeLabel(s.bowType)}</span>
      <span class="mini">${aggregateSessionStats(sessionArrows(s)).total}点</span>
    </button>`).join("")}</section>`:"";
  m.innerHTML=`
  ${homeDashboardHtml()}
  ${recordFastActionsHtml(last,defDist,defFace)}
  ${recentHtml}
  <details class="adv homeMore">
    <summary>詳しく使う</summary>
    ${recordIntroHtml(sys,mode)}
  </details>
  <div id="homeLaunchMount"></div>`;
  const mount=$("#homeLaunchMount");
  if(mount) renderRecordSetup(mount,{last,defSetup,defDist,defFace,mode,onStart:()=>showView("record")});
  document.querySelectorAll("#flowMode .flowBtn").forEach(b=>b.onclick=()=>{
    if(b.dataset.mode==="diagnosis"){ openToolSheet("sight"); return; }
    ui.recordMode=b.dataset.mode; render();
  });
  $("#quickStart").onclick=()=>{ const btn=$("#fStart"); if(btn) btn.click(); };
  const quickHistory=$("#quickHistory");
  if(quickHistory) quickHistory.onclick=()=>showView("history");
  if(last){
    $("#quickRepeat").onclick=()=>{
      const rep=$("#quickRepeatGo");
      if(rep) rep.click();
    };
  }
  document.querySelectorAll("[data-open-sess]").forEach(b=>b.onclick=()=>{
    ui.histOpen=b.dataset.openSess; showView("history");
  });
}

function renderRecordIdle(m){
  m.innerHTML=`<section class="card idlePrompt">
    <div class="idleIcon">◎</div>
    <h2>まだ記録は始まっていません</h2>
    <p>ホームで距離を選び、「今日の記録を始める」をタップしてください。</p>
    <button class="btn startPrimary" id="goHome" type="button">ホームへ</button>
  </section>`;
  $("#goHome").onclick=()=>{ view="home"; render(); };
}

/* ---------- 記録 ---------- */
function setupOptions(sel){
  return `<option value="">（セッティング未指定）</option>`+db.setups.map(s=>`<option value="${s.id}" ${s.id===sel?"selected":""}>${esc(s.name)}</option>`).join("");
}
const RECORD_FLOW_MODES=[
  {id:"practice",icon:"◎",title:"練習記録",desc:"点取りから調整提案へ"},
  {id:"calibration",icon:"↕",title:"サイト値を残す",desc:"サイト値・風メモも一緒に"},
  {id:"diagnosis",icon:"?",title:"足りないデータを見る",desc:"提案の材料を確認"}
];
const RECORD_PHASES=["準備","記録","確認","蓄積"];
const SHOT_REASON_TAGS=["良射","押し手","リリース","クリッカー","風","狙いミス","矢が怪しい","不明"];
function scorePct(v){ return Math.round(clamp(v||0,0,1)*100); }
function readinessCellHtml(label,level,score){
  return `<div class="readinessCell"><div class="k">${label}</div><b>${esc(level)}</b><div class="bar"><i style="width:${scorePct(score)}%"></i></div></div>`;
}
function recordPhaseArcHtml(step, subtitle){
  const cur=Math.max(0,Math.min(RECORD_PHASES.length-1,Math.round(step||0)));
  const xs=[32,130,228,326];
  const rails=xs.slice(0,-1).map((x,i)=>`<line class="seg ${i<cur?"on":""} ${i===cur-1?"cur":""}" x1="${x}" y1="18" x2="${xs[i+1]}" y2="18"/>`).join("");
  const nodes=RECORD_PHASES.map((label,i)=>`<g>
      <circle class="node ${i<=cur?"on":""} ${i===cur?"cur":""}" cx="${xs[i]}" cy="18" r="10"/>
      <circle class="nodeCore" cx="${xs[i]}" cy="18" r="3.2"/>
      <text class="${i<=cur?"on":""}" x="${xs[i]}" y="44" text-anchor="middle">${esc(label)}</text>
    </g>`).join("");
  return `<section class="phaseArc" aria-label="記録フロー">
    <svg viewBox="0 0 360 50" role="img" aria-hidden="true">
      <line class="rail" x1="32" y1="18" x2="326" y2="18"/>
      ${rails}
      ${nodes}
    </svg>
    ${subtitle?`<div class="phaseSub">${esc(subtitle)}</div>`:""}
  </section>`;
}
function recordCoachCardHtml(){
  return `<div class="coachCard">
    <img src="icon.svg" alt="">
    <div><b>3ステップで使います</b><span>条件を決める → 的でタップ → 結果で次の調整を見る</span></div>
  </div>`;
}
function recordIntroHtml(sys, mode){
  const flow=RECORD_FLOW_MODES.map(f=>`
      <button class="flowBtn ${mode===f.id?"on":""}" data-mode="${f.id}"><span class="flowIcon">${f.icon}</span><span class="flowText"><b>${f.title}</b><span>${f.desc}</span></span></button>`).join("");
  const p=sys.profiles||{};
  const nf=nativeFeatureProfile();
  return `<section class="missionPanel convergeMission">
    <div class="missionTop">
      <img class="startLogoMark" src="icon.svg" alt="">
      <div>
        <div class="eyebrow">的ノート</div>
        <h2>${mode==="calibration"?"サイト値も残す":"今日のズレを、次の一射へ。"}</h2>
        <p>グリッド・タップ・ライブ・動画で記録。サイトを動かすか・保留するか、データで判断できます。</p>
      </div>
      <div class="readinessDial"><b>${scorePct(sys.score)}</b><span>${esc(sys.level)}</span></div>
    </div>
    <div class="simplePromise">記録する <span>→</span> ズレを見る <span>→</span> 次を決める</div>
    <details class="adv missionMore" ${mode==="calibration"?"open":""}>
      <summary>詳しく使う</summary>
      <div class="readinessRail">
        ${readinessCellHtml("用具",p.gear?p.gear.level:"低",p.gear?p.gear.score:0)}
        ${readinessCellHtml("履歴",p.model?p.model.level:"データ蓄積中",p.model?p.model.score:0)}
        ${readinessCellHtml("物理校正",p.physics?p.physics.level:"未校正",p.physics?p.physics.score:0)}
      </div>
      <div class="nativeSignal">
        <span class="on">${esc(nf.runtime.label)}</span>
        <span class="${nf.haptics?"on":""}">触感${nf.haptics?"ON":"待ち"}</span>
        <span class="${nf.share?"on":""}">共有${nf.share?"ON":"待ち"}</span>
      </div>
      <div class="missionFlow" id="flowMode">${flow}</div>
      <div class="missionNext"><b>次の材料</b><span>${esc(sys.next)} / ${sys.lines.map(esc).join(" / ")}</span></div>
    </details>
  </section>`;
}
function setupSystemSummary(setupId){
  const setup=db.setups.find(s=>s.id===setupId);
  if(!setup) return {score:0,level:"準備中", profiles:{}, lines:["用具セッティングを登録すると、サイト台帳・物理校正・個人モデルの材料が整います。"], next:"用具タブで初回セットアップ"};
  const gp=gearPrecisionProfile(setup), mp=modelReadinessProfile(setupId), pc=personalPhysicsCalibration(setupId), cp=calibrationProfile(setupId);
  const score=clamp(gp.score*.25 + mp.score*.25 + (pc?pc.score*.28:0) + (cp?cp.score*.22:0),0,1);
  const level=levelFromScore(score, LEVELS.system);
  const next=[];
  if(gp.score<.65) next.push((gp.missing||[])[0]||"用具入力");
  if(mp.good<5) next.push("6本以上の練習");
  if(cp.dists<3) next.push("複数距離のサイト値");
  if(pc && pc.wind.sample<2) next.push("横風メモつき練習");
  return {
    score,
    level,
    profiles:{gear:gp,model:mp,physics:pc||{score:0,level:"未校正"},calibration:cp},
    lines:[`用具 ${gp.level} / 履歴 ${mp.level} / 物理校正 ${pc?pc.level:"未校正"}`],
    next:next.slice(0,2).join("・") || "同条件で記録を重ねる"
  };
}
function recordSetupSnapshot(setupId,dist){
  const setup=db.setups.find(s=>s.id===setupId);
  if(!setup) return `<div class="setupLens" id="setupLens">
    <div class="lensCard"><div class="k">セッティング</div><b>未指定</b><span>用具登録で調整提案が強くなります</span></div>
    <div class="lensCard"><div class="k">サイト台帳</div><b>未接続</b><span>距離を選ぶと実測値を呼び出します</span></div>
  </div>`;
  const gp=gearPrecisionProfile(setup);
  const mp=modelReadinessProfile(setupId);
  const mk=dist?latestMark(setupId,dist):null;
  const markText=mk?`上下 ${esc(mk.v||"—")} / 左右 ${esc(mk.h||"—")}`:"記録なし";
  return `<div class="setupLens" id="setupLens">
    <div class="lensCard"><div class="k">セッティング</div><b>${esc(setup.name)}</b><span>${[setup.bow,setup.limbs,setup.poundage?setup.poundage+"lbs":""].filter(Boolean).map(esc).join(" / ")||"詳細入力待ち"}</span></div>
    <div class="lensCard"><div class="k">${dist?dist+"m サイト":"サイト台帳"}</div><b>${markText}</b><span>入力材料 ${gp.level} / 履歴 ${mp.level}</span></div>
  </div>`;
}
function faceChoiceValue(sess){
  if(!sess) return "122";
  if(sess.faceType==="triple") return "T40";
  if(sess.faceType==="field") return `F${sess.faceD||80}`;
  return String(sess.faceD||122);
}
function suggestedFaceValue(dist,last){
  if(last && last.faceD) return faceChoiceValue(last);
  return String((dist||70)>=60?122:((dist||70)<=18?40:80));
}
function actionFaceLabel(value){
  const f=parseFaceChoice(value);
  if(f.faceType==="triple") return "40cm三つ目";
  if(f.faceType==="field") return `${f.faceD}cmフィールド`;
  return `${f.faceD}cm`;
}
function recordFastActionsHtml(last,dist,faceValue){
  const currentLabel=`${dist}m / ${actionFaceLabel(faceValue)}`;
  const lastLabel=last?`${last.dist}m / ${actionFaceLabel(faceChoiceValue(last))}`:"なし";
  return `<section class="homeActions" aria-label="すぐ使う">
    <button class="homeAction primary" id="quickStart" type="button"><b>今日の記録を始める</b><span id="quickStartMeta">${esc(currentLabel)}</span></button>
    ${last?`<button class="homeAction" id="quickRepeat" type="button"><b>前回と同じ</b><span>${esc(lastLabel)}</span></button>
    <button class="homeAction" id="quickHistory" type="button"><b>履歴を見る</b><span>分析</span></button>`:""}
  </section>`;
}
function renderRecordSetup(m,ctx){
  ctx=ctx||{};
  const last=ctx.last||db.sessions[db.sessions.length-1];
  const defSetup=ctx.defSetup!=null?ctx.defSetup:(last?last.setupId:(db.setups[0]?db.setups[0].id:""));
  const defDist=ctx.defDist!=null?ctx.defDist:(last?last.dist:70);
  const mode=ctx.mode||ui.recordMode||"practice";
  const defFace=ctx.defFace!=null?ctx.defFace:suggestedFaceValue(defDist,last);
  const defPerEnd=last&&last.perEnd?last.perEnd:6;
  const defBow=last&&last.bowType?last.bowType:(db.settings.defaultBowType||"recurve");
  const defEnv=last&&last.environment?last.environment:(db.settings.defaultEnvironment||"outdoor");
  m.innerHTML=`
  <section class="launchPanel convergeLaunch startFirst">
    <div class="launchHead">
      <div class="launchTitle"><div class="stepBadge">01</div><h2>${mode==="calibration"?"サイト値を残す練習":"条件を選ぶ"}</h2></div>
      <button class="tinyAction" id="jumpGear" type="button">用具</button>
    </div>
    <div class="launchBody">
    <div class="quickSelects">
      <div><label class="f">弓種</label><select class="inp" id="fBow">${BOW_TYPES.map(b=>`<option value="${b.id}" ${b.id===defBow?"selected":""}>${b.label}</option>`).join("")}</select></div>
      <div><label class="f">環境</label><select class="inp" id="fEnv">${ENV_TYPES.map(e=>`<option value="${e.id}" ${e.id===defEnv?"selected":""}>${e.label}</option>`).join("")}</select></div>
    </div>
    <label class="f">距離</label>
    <div class="chips quickDists" id="fDistChips">
      ${[70,50,30,18].map(d=>`<div class="chip ${d===defDist?"on":""}" data-d="${d}">${d}m</div>`).join("")}
      <div class="chip" data-d="custom">カスタム</div>
    </div>
    <div id="fDistCustomWrap" style="display:none"><label class="f">距離 (m)</label><input class="inp" type="number" id="fDistCustom" min="5" max="90" step="1" placeholder="例: 60"></div>
    <div class="quickSelects">
      <div><label class="f">的</label><select class="inp" id="fFace">
        <optgroup label="ターゲット">
          ${[122,80,60,40].map(f=>`<option value="${f}" ${String(defFace)===String(f)?"selected":""}>${f}cm</option>`).join("")}
          <option value="T40" ${defFace==="T40"?"selected":""}>40cm 三つ目（縦）</option>
        </optgroup>
        <optgroup label="フィールド">
          ${FIELD_FACE_SIZES.map(f=>`<option value="F${f}" ${defFace===`F${f}`?"selected":""}>${f}cm フィールド</option>`).join("")}
        </optgroup>
      </select></div>
      <div><label class="f">1エンドの本数</label><select class="inp" id="fArrows">${[1,2,3,4,5,6,7,8,9,10,11,12].map(n=>`<option value="${n}" ${n===defPerEnd?"selected":""}>${n}本</option>`).join("")}</select></div>
    </div>
    <div class="btnrow"><button class="btn startPrimary" id="fStart">${mode==="calibration"?"サイト値つきで開始":"この条件で開始"}</button></div>
    <details class="adv recordDetails" ${mode==="calibration"?"open":""}>
      <summary>詳しく残す</summary>
      <div class="fieldBand">
        <div><label class="f">用具セッティング</label><select class="inp" id="fSetup">${setupOptions(defSetup)}</select></div>
        ${recordSetupSnapshot(defSetup,defDist)}
      </div>
      <label class="f">日付</label><input class="inp" type="date" id="fDate" value="${today()}">
      <label class="f">ラウンド</label><select class="inp" id="fRound">
        ${ROUND_TYPES.map(r=>`<option value="${r.id}">${r.label}</option>`).join("")}
      </select>
      <div class="row">
        <div><label class="f">サイト 上下（目盛り）</label><input class="inp" id="fSightV" inputmode="decimal" placeholder="例: 5.4"></div>
        <div><label class="f">サイト 左右（目盛り）</label><input class="inp" id="fSightH" inputmode="decimal" placeholder="例: 2 / -1.5"></div>
      </div>
      <div class="hint">サイトの目盛りをそのまま記入（左右は<b>右なら 2、左なら -2</b>）。台帳に記録があれば自動入力されます。</div>
      <label class="f">天候・コンディション</label>
      <div class="row">
        <select class="inp" id="fWx"><option value="">—</option><option>晴れ</option><option>くもり</option><option>雨</option><option>風 弱</option><option>風 強</option><option>室内</option></select>
        <input class="inp" id="fNote" placeholder="${mode==="calibration"?"例: サイト1目盛り確認":"メモ（任意）"}" value="${mode==="calibration"?"サイト値確認":""}">
      </div>
      <div class="row">
        <div><label class="f">風向</label><select class="inp" id="fWindDir"><option value="">—</option><option>向かい風</option><option>追い風</option><option>左から</option><option>右から</option><option>巻き風</option></select></div>
        <div><label class="f">風速 (m/s)</label><input class="inp" id="fWindSpeed" inputmode="decimal" placeholder="例: 2.5"></div>
      </div>
    </details>
    ${mode==="calibration"?`<div class="advice" style="background:var(--card);border-color:var(--line)"><div class="note"><b>サイト値を残すコツ</b> — サイト値を必ず入力し、風があれば風向/風速も残します。同じ距離で2回以上残ると履歴推定が強くなります。</div></div>`:""}
    </div>
  </section>`;
  const distState={d:defDist};
  const faceSel=$("#fFace");
  const suggestFace=d=>{ if(String(faceSel.value).startsWith("F")) return; faceSel.value = d>=60?122:(d<=18?40:80); };
  function updateQuickStartMeta(){
    const meta=$("#quickStartMeta");
    if(meta && distState.d) meta.textContent=`${distState.d}m / ${actionFaceLabel(faceSel.value)}`;
  }
  faceSel.onchange=()=>{
    if(String(faceSel.value).startsWith("F") && $("#fArrows").value==="6") $("#fArrows").value="3";
    updateQuickStartMeta();
  };
  $("#fRound").onchange=e=>{
    if(e.target.value==="field72"){
      if(!String(faceSel.value).startsWith("F")) faceSel.value="F80";
      $("#fArrows").value="3";
    }
    updateQuickStartMeta();
  };
  $("#jumpGear").onclick=()=>openToolSheet("gear");
  if(last){
    const repeatBtn=document.createElement("button");
    repeatBtn.id="quickRepeatGo"; repeatBtn.hidden=true;
    m.appendChild(repeatBtn);
    repeatBtn.onclick=()=>{
      distState.d=last.dist||defDist;
      const known=[70,50,30,18].includes(+distState.d);
      const key=known?String(distState.d):"custom";
      document.querySelectorAll("#fDistChips .chip").forEach(x=>x.classList.toggle("on", String(x.dataset.d)===key));
      $("#fDistCustomWrap").style.display=known?"none":"block";
      if(!known) $("#fDistCustom").value=distState.d||"";
      faceSel.value=faceChoiceValue(last);
      $("#fArrows").value=last.perEnd||6;
      $("#fSetup").value=last.setupId||"";
      $("#fRound").value=last.round||"free";
      fillSight();
      refreshLens();
      $("#fStart").click();
    };
  }
  function refreshLens(){
    const old=$("#setupLens");
    if(old) old.outerHTML=recordSetupSnapshot($("#fSetup").value, distState.d);
  }
  document.querySelectorAll("#fDistChips .chip").forEach(c=>c.onclick=()=>{
    document.querySelectorAll("#fDistChips .chip").forEach(x=>x.classList.remove("on"));
    c.classList.add("on");
    if(c.dataset.d==="custom"){ $("#fDistCustomWrap").style.display="block"; distState.d=null; }
    else{ $("#fDistCustomWrap").style.display="none"; distState.d=+c.dataset.d; suggestFace(distState.d); fillSight(); }
    updateQuickStartMeta();
    refreshLens();
  });
  $("#fDistCustom").oninput=e=>{ distState.d=+e.target.value||null; if(distState.d) {suggestFace(distState.d); fillSight();} updateQuickStartMeta(); refreshLens(); };
  function fillSight(){
    const sid=$("#fSetup").value, d=distState.d;
    if(!sid||!d) return;
    const mk=latestMark(sid,d);
    if(mk){ $("#fSightV").value=mk.v??""; $("#fSightH").value=mk.h??""; }
  }
  $("#fSetup").onchange=()=>{ fillSight(); refreshLens(); };
  fillSight();
  $("#fStart").onclick=()=>{
    const d=distState.d;
    if(!d){ toast("距離を入力してください"); return; }
    const fv=faceSel.value;
    const face=parseFaceChoice(fv);
    const bowType=$("#fBow").value||db.settings.defaultBowType||"recurve";
    const environment=$("#fEnv").value||db.settings.defaultEnvironment||"outdoor";
    db.settings.defaultBowType=bowType;
    db.settings.defaultDistance=d;
    db.settings.defaultEnvironment=environment;
    db.settings.lastSelectedDistance=d;
    db.active={
      id:uid(), date:$("#fDate").value||today(), setupId:$("#fSetup").value||null,
      bowType, environment,
      dist:d, faceD: face.faceD, faceType: face.faceType, perEnd:+$("#fArrows").value,
      inputStyle:"grid",
      shaft:+lineCutRadius(face.faceD, face.faceType).toFixed(3),
      sightV:$("#fSightV").value.trim(), sightH:$("#fSightH").value.trim(),
      wx:$("#fWx").value, note:$("#fNote").value.trim(), windDir:$("#fWindDir").value, windSpeed:$("#fWindSpeed").value.trim(),
      round:$("#fRound").value||"free",
      purpose:ui.recordMode||"practice",
      ends:[], cur:[]
    };
    ui.inputMode="grid";
    ui.gridCell=-1;
    nativePulse("success");
    save();
    if(typeof ctx.onStart==="function") ctx.onStart();
    else showView("record");
    render();
  };
}

function sessionArrows(sess){
  return [...((sess&&sess.ends)||[]).flat(), ...((sess&&sess.cur)||[])];
}
function arrowMetaSummaryHtml(sess){
  const arrows=((sess&&sess.ends)||[]).flat();
  const tagged=arrows.filter(a=>a&&(a.reason||a.no));
  if(!tagged.length) return "";
  const reasons={};
  const byNo={};
  tagged.forEach(a=>{
    if(a.reason) reasons[a.reason]=(reasons[a.reason]||0)+1;
    if(a.no){
      const k=String(a.no).trim();
      if(k){
        const b=byNo[k]||(byNo[k]={n:0,x:0,y:0,score:0,reasons:{}});
        b.n++; b.x+=a.x||0; b.y+=a.y||0; b.score+=a.s||0;
        if(a.reason) b.reasons[a.reason]=(b.reasons[a.reason]||0)+1;
      }
    }
  });
  const reasonLine=Object.entries(reasons).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${esc(k)} ${v}本`).join(" / ");
  const rows=Object.entries(byNo).sort((a,b)=>b[1].n-a[1].n || String(a[0]).localeCompare(String(b[0]))).slice(0,6).map(([no,b])=>{
    const rx=b.x/b.n, ry=b.y/b.n, avg=b.score/b.n;
    const topReason=Object.entries(b.reasons).sort((a,c)=>c[1]-a[1])[0];
    return `<div class="note">#${esc(no)}: ${b.n}本 / 平均${avg.toFixed(1)} / ${cmOffsetText(rx,"x")}・${cmOffsetText(ry,"y")}${topReason?` / ${esc(topReason[0])} ${topReason[1]}本`:""}</div>`;
  }).join("");
  return `<div class="advice" style="background:var(--card);border-color:var(--line)">
    <div class="note"><b>矢番号・外れ理由メモ</b>${reasonLine?` — ${reasonLine}`:""}</div>
    ${rows}
  </div>`;
}
function heroMetricHtml(k,b,span){
  return `<div class="heroMetric"><div class="k">${esc(k)}</div><b>${esc(b)}</b><span>${esc(span||"")}</span></div>`;
}
function pageHeroHtml(type,ctx){
  ctx=ctx||{};
  if(type==="history"){
    const src=ctx.ss||db.sessions||[];
    const arrows=src.flatMap(s=>s.ends.flat());
    const total=arrows.reduce((a,x)=>a+x.s,0);
    const latest=src[0]||null;
    return `<section class="pageHero">
      <div class="kicker">履歴</div>
      <h2>分布と偏移を読む</h2>
      <p>点数だけでなく、同じ用具・同じ距離の中心移動を追います。過去のグルーピングがあるほど、今回のズレが偶然か傾向か見えやすくなります。</p>
      <div class="heroMetrics">
        ${heroMetricHtml("練習",`${src.length}回`,`${arrows.length}本を集計`)}
        ${heroMetricHtml("平均",arrows.length?(total/arrows.length).toFixed(2):"—","フィルター後の平均点")}
        ${heroMetricHtml("直近",latest?`${fmtD(latest.date)} ${latest.dist}m`:"—",latest?roundLabel(latest.round):"記録待ち")}
      </div>
    </section>`;
  }
  if(type==="sight"){
    const setup=ctx.setup, dist=ctx.dist, marks=ctx.marks||[], adv=ctx.adv;
    const cur=marks[0];
    return `<section class="pageHero">
      <div class="kicker">サイト調整</div>
      <h2>サイト値を整える</h2>
      <p>距離ごとのサイト値と最新グルーピングから、動かす時・保留する時・射形を優先する時を分けて見ます。</p>
      <div class="heroMetrics">
        ${heroMetricHtml("対象",setup?setup.name:"用具未指定",dist?`${dist}m`:"距離未指定")}
        ${heroMetricHtml("最新サイト",cur?`上下 ${cur.v||"—"}`:"未登録",cur?`左右 ${cur.h||"—"}`:"台帳へ記録")}
        ${heroMetricHtml("提案",adv&&adv.lines.length?adv.lines[0].text||"調整あり":"材料待ち",adv?`信頼 ${sessionQuality(ctx.lastSess||{},setup).label}`:"練習記録が必要")}
      </div>
    </section>`;
  }
  if(type==="gear"){
    const setups=db.setups||[];
    const profiles=setups.map(s=>gearPrecisionProfile(s));
    const avg=profiles.length?profiles.reduce((a,p)=>a+p.score,0)/profiles.length:0;
    const best=setups.map(s=>({s,p:gearPrecisionProfile(s),m:modelReadinessProfile(s.id)})).sort((a,b)=>(b.p.score+b.m.score)-(a.p.score+a.m.score))[0];
    return `<section class="pageHero">
      <div class="kicker">用具</div>
      <h2>いつものセッティングを残す</h2>
      <p>ハンドル、リム、矢、サイト値をまとめて保存します。分かる範囲だけで始めて、必要な時だけ細かい実測値を足せます。</p>
      <div class="heroMetrics">
        ${heroMetricHtml("登録",`${setups.length}件`,`${db.sessions.filter(s=>s.setupId).length}回の練習に接続`)}
        ${heroMetricHtml("入力材料",pct(avg),"用具データの平均充実度")}
        ${heroMetricHtml("主戦用具",best?best.s.name:"—",best?`入力 ${best.p.level} / 履歴 ${best.m.level}`:"初回セットアップ待ち")}
      </div>
    </section>`;
  }
  return "";
}
function liveSessionHeroHtml(s,setup){
  const stats=aggregateSessionStats(sessionArrows(s));
  const remain=Math.max(0,(s.perEnd||6)-(s.cur||[]).length);
  const r=ROUND_TYPES.find(x=>x.id===s.round);
  const roundRemain=r&&r.arrows?Math.max(0,r.arrows-stats.count):null;
  return `<section class="liveHud compactHud">
    <div class="liveContext">${s._edit?"過去記録の編集":`${s.dist}m / ${bowTypeLabel(s.bowType)} / ${envLabel(s.environment)}`}<span>${setup?esc(setup.name):"用具未指定"}</span></div>
    <div class="liveGrid">
      <div class="liveCell"><div class="k">合計</div><b>${stats.total}</b></div>
      <div class="liveCell"><div class="k">Xs</div><b>${stats.xCount}</b></div>
      <div class="liveCell"><div class="k">10s</div><b>${stats.tenCount}</b></div>
      <div class="liveCell"><div class="k">Hits</div><b>${stats.hitCount}</b></div>
      <div class="liveCell"><div class="k">現在</div><b>${(s.cur||[]).length}/${s.perEnd||6}</b></div>
      <div class="liveCell"><div class="k">残り</div><b>${roundRemain==null?`${remain}本`:roundRemain+"本"}</b></div>
    </div>
  </section>`;
}
function scoreGridReadOnlyHtml(s){
  const per=s.perEnd||6;
  return (s.ends||[]).map((end,i)=>{
    const cells=Array.from({length:per},(_,ci)=>{
      const a=end[ci];
      if(!a) return `<div class="gridCell empty">·</div>`;
      const label=scoreLabel(a);
      const z=gridZoneStyle(label);
      return `<div class="gridCell" style="background:${z.bg};color:${z.fg}">${label}</div>`;
    }).join("");
    const sum=end.reduce((a,x)=>a+(x.s||0),0);
    return `<div class="gridRow"><div class="gridRowHead">E${i+1}</div><div class="gridCells">${cells}</div><div class="gridRowSum">${sum}</div></div>`;
  }).join("")||`<div class="empty">エンドがありません</div>`;
}
function scoreGridHtml(s){
  const per=s.perEnd||6;
  const rows=[...s.ends.map((end,i)=>({end,i,cur:false})), {end:s.cur||[],i:s.ends.length,cur:true}];
  return rows.map(row=>{
    const cells=Array.from({length:per},(_,ci)=>{
      const a=row.end[ci];
      const sel=row.cur && ui.gridCell===ci;
      if(!a) return `<div class="gridCell empty ${sel?"sel":""}" data-end="${row.i}" data-i="${ci}">·</div>`;
      const label=scoreLabel(a);
      const z=gridZoneStyle(label);
      return `<div class="gridCell ${sel?"sel":""}" data-end="${row.i}" data-i="${ci}" style="background:${z.bg};color:${z.fg}">${label}</div>`;
    }).join("");
    const sum=row.end.reduce((a,x)=>a+(x.s||0),0);
    return `<div class="gridRow"><div class="gridRowHead">E${row.i+1}</div><div class="gridCells">${cells}</div><div class="gridRowSum">${sum||"—"}</div></div>`;
  }).join("");
}
function bindGridInput(s){
  const keys=$("#gridKeys");
  if(keys) keys.querySelectorAll("button").forEach(btn=>btn.onclick=()=>{
    const value=btn.dataset.v;
    if(ui.gridCell>=0 && s.cur[ui.gridCell]){
      Object.assign(s.cur[ui.gridCell], arrowFromGridValue(value));
      nativePulse("light"); save(); refreshActive(); return;
    }
    if(s.cur.length>=(s.perEnd||6)){ toast(`1エンド${s.perEnd}本です。「次のエンド」で確定してください`); return; }
    s.cur.push(arrowFromGridValue(value));
    ui.freshArrow=s.cur.length-1;
    ui.gridCell=s.cur.length-1;
    nativePulse("light"); save(); refreshActive();
  });
  const grid=$("#scoreGrid");
  if(grid) grid.querySelectorAll(".gridCell").forEach(cell=>cell.onclick=()=>{
    const endIdx=+cell.dataset.end, idx=+cell.dataset.i;
    if(endIdx!==s.ends.length) return;
    if(!s.cur[idx] && cell.classList.contains("empty")) return;
    ui.gridCell=idx; ui.selArrow=-1; refreshActive();
  });
  const memo=$("#gridMemo");
  if(memo) memo.oninput=e=>{ s.note=e.target.value.trim(); save("grid-memo"); };
}
function activeGuideHtml(){
  if(db.settings.activeGuideSeen) return "";
  return `<details class="adv activeGuide" open>
    <summary>初回の操作ガイド</summary>
    <div class="guideLine"><b>グリッド</b><span>X/10/9…ボタンで素早く入力。セルをタップすると修正できます。</span></div>
    <div class="guideLine"><b>タップ</b><span>的をタップすると、その場所に1本入ります。少しずれたら矢チップを選びます。</span></div>
    <div class="guideLine"><b>微調整</b><span>選んだ矢だけ下の矢印で動かせます。押したままでも細かく合わせられます。</span></div>
    <div class="guideLine"><b>進行</b><span>${db.active&&db.active.perEnd?db.active.perEnd:6}本入れたらエンド確定。最後はセッション終了で結果を見ます。</span></div>
    <button class="btn sm ghost activeGuideDone" id="activeGuideDone">次から表示しない</button>
  </details>`;
}
function renderActive(m){
  stopScanSession();
  const s=db.active;
  const setup=db.setups.find(x=>x.id===s.setupId);
  m.innerHTML=`
  ${liveSessionHeroHtml(s,setup)}
  <div class="card targetFocusCard">
    <div class="targetTools">
      <h2>記録中${s._edit?"（過去記録の編集）":""} <span class="mini">${fmtD(s.date)} ・ ${s.dist}m ・ ${faceLabel(s)} ・ ${setup?esc(setup.name):"セッティング未指定"}</span></h2>
      <div class="inputModeBar" id="inputModeBar">
        <button class="modeBtn ${ui.inputMode==="grid"?"on":""}" data-mode="grid" type="button">グリッド</button>
        <button class="modeBtn ${ui.inputMode==="tap"?"on":""}" data-mode="tap" type="button">タップ</button>
        <button class="modeBtn ${ui.inputMode==="live"?"on":""}" data-mode="live" type="button">ライブ</button>
        <button class="modeBtn ${ui.inputMode==="video"?"on":""}" data-mode="video" type="button">動画</button>
      </div>
      ${s._edit?`<div class="editMetaBar">
        <label class="f">距離</label><input class="inp sm" id="editDist" type="number" min="5" max="90" value="${s.dist}">
        <label class="f">弓種</label><select class="inp sm" id="editBow">${BOW_TYPES.map(b=>`<option value="${b.id}" ${s.bowType===b.id?"selected":""}>${b.label}</option>`).join("")}</select>
        <label class="f">環境</label><select class="inp sm" id="editEnv">${ENV_TYPES.map(e=>`<option value="${e.id}" ${s.environment===e.id?"selected":""}>${e.label}</option>`).join("")}</select>
      </div>`:""}
      ${s.faceType==="triple"?"":`<div class="chips" id="zoomChips">
        ${[[1,"全体"],[2,"×2"],[3,"×3"]].map(([z,lb])=>`<div class="chip ${(ui.zoom||1)===z?"on":""}" data-z="${z}">${lb}</div>`).join("")}
      </div>`}
    </div>
    <div class="scanPanel ${ui.inputMode==="tap"?"off":""}" id="scanPanel">
      <video class="scanVideo" id="scanVideo" autoplay playsinline muted hidden></video>
      <div class="scanStatus" id="scanStatus">${ui.inputMode==="live"?"カメラを起動中…":ui.inputMode==="video"?"動画を選ぶとフレームを解析します":""}</div>
      <div class="scanActions" id="scanActions"></div>
      <input type="file" id="videoCapture" accept="video/*" hidden>
    </div>
    <div class="gridSheet ${ui.inputMode==="grid"?"on":""}" id="gridSheet">
      <div class="gridHeader">エンド ${s.ends.length+1} <span>合計 ${aggregateSessionStats(sessionArrows(s)).total}点</span></div>
      <div class="scoreGrid" id="scoreGrid">${scoreGridHtml(s)}</div>
      <div class="gridKeys" id="gridKeys">${GRID_SCORE_KEYS.map(v=>{ const z=gridZoneStyle(v); return `<button type="button" data-v="${v}" style="background:${z.bg};color:${z.fg}">${v}</button>`; }).join("")}</div>
      <label class="f">メモ</label><input class="inp" id="gridMemo" placeholder="任意" value="${esc(s.note||"")}">
    </div>
    <div class="tgWrap ${ui.inputMode==="grid"?"off":""}" id="tgWrap">
      ${targetMarkup(s.faceD,"tg",s.faceType)}
      <div class="lens" id="lens"><svg id="lensSvg" width="122" height="122"><use href="#tgmain"/><g id="lensCross"></g></svg></div>
      <div class="lensTag" id="lensTag">微調整モード</div>
    </div>
    <div class="targetHint" id="targetHint">${ui.inputMode==="grid"?"ボタンで次のセルに入力。セルタップで修正。":ui.inputMode==="live"?"カメラで的を映すと自動検出。取り込み後はタップで微調整。":ui.inputMode==="video"?"動画のフレームを解析して一括取り込み。タップは微調整用。":"タップで記録。矢チップで修正。"}</div>
    ${activeGuideHtml()}
    <div class="scoreChips" id="curChips"></div>
    <div class="nudge" id="nudge">
      <div style="font-size:12px;color:var(--sub)">選択中の矢を微調整（1目盛 = ${(s.faceD/200).toFixed(1)}cm）</div>
      <div class="npad">
        <span class="blank"></span><button data-n="u">▲</button><span class="blank"></span>
        <button data-n="l">◀</button><button data-n="del" style="color:var(--danger)">🗑</button><button data-n="r">▶</button>
        <span class="blank"></span><button data-n="d">▼</button><span class="blank"></span>
      </div>
      <div class="shotMeta" id="shotMeta"></div>
      <button class="btn sm ghost" id="nudgeDone">選択解除</button>
    </div>
    <div class="statbar" id="statbar"></div>
    <div class="btnrow">
      <button class="btn ghost" id="bUndo">↩ 1本取消</button>
      <button class="btn sec" id="bEnd">エンド確定</button>
    </div>
    <div class="btnrow"><button class="btn danger" id="bFinish">セッション終了</button></div>
  </div>
  <div class="card"><h2>エンド一覧</h2><div id="endsTbl"></div></div>`;
  if(ui.inputMode!=="grid") attachTargetInput(s);
  document.querySelectorAll("#inputModeBar .modeBtn").forEach(btn=>btn.onclick=()=>{
    if(ui.inputMode===btn.dataset.mode) return;
    ui.inputMode=btn.dataset.mode;
    ui.scanResult=null;
    renderActive();
  });
  if(ui.inputMode==="live") bindLiveScanMode(s);
  else if(ui.inputMode==="video") bindVideoScanMode(s);
  if(ui.inputMode==="grid") bindGridInput(s);
  if(s._edit){
    const editDist=$("#editDist"), editBow=$("#editBow"), editEnv=$("#editEnv");
    if(editDist) editDist.onchange=()=>{ s.dist=+editDist.value||s.dist; db.settings.lastSelectedDistance=s.dist; save("edit-meta"); refreshActive(); };
    if(editBow) editBow.onchange=()=>{ s.bowType=editBow.value; save("edit-meta"); refreshActive(); };
    if(editEnv) editEnv.onchange=()=>{ s.environment=editEnv.value; save("edit-meta"); refreshActive(); };
  }
  function applyZoom(){ if(s.faceType==="triple") return; const M=s.faceD/2*1.18/(ui.zoom||1); $("#tgsvg").setAttribute("viewBox", `${-M} ${-M} ${2*M} ${2*M}`); }
  document.querySelectorAll("#zoomChips .chip").forEach(c=>c.onclick=()=>{
    ui.zoom=+c.dataset.z;
    document.querySelectorAll("#zoomChips .chip").forEach(x=>x.classList.toggle("on",x===c));
    applyZoom();
  });
  applyZoom();
  $("#bUndo").onclick=()=>{ if(s.cur.length){ s.cur.pop(); ui.selArrow=-1; nativePulse("light"); save(); refreshActive(); } else toast("このエンドに矢がありません"); };
  $("#bEnd").onclick=()=>{
    if(!s.cur.length){ toast("矢を記録してください"); return; }
    ui.gridCell=-1;
    if(s.editIndex!=null){
      const at=Math.min(s.editIndex, s.ends.length);
      s.ends.splice(at,0,s.cur); toast(`エンド${at+1}を更新しました`); s.editIndex=null;
    }else{
      s.ends.push(s.cur); toast(`エンド${s.ends.length} 確定`);
    }
    s.cur=[]; ui.selArrow=-1; nativePulse("success"); save(); refreshActive();
  };
  $("#bFinish").onclick=()=>finishSession();
  const guideDone=$("#activeGuideDone");
  if(guideDone) guideDone.onclick=()=>{ db.settings.activeGuideSeen=true; save("active-guide"); render(); };
  document.querySelectorAll("#nudge .npad button").forEach(b=>b.onclick=()=>nudgeArrow(b.dataset.n));
  $("#nudgeDone").onclick=()=>{ ui.selArrow=-1; refreshActive(); };
  refreshActive();
}
function shotMetaHtml(a,index){
  const tags=SHOT_REASON_TAGS.map(tag=>`<button class="reasonTag ${a.reason===tag?"on":""}" data-reason="${esc(tag)}">${esc(tag)}</button>`).join("");
  return `<div class="shotMetaGrid">
    <div>
      <label class="metaLabel" for="shotArrowNo">矢番号</label>
      <input class="inp" id="shotArrowNo" inputmode="numeric" maxlength="8" value="${esc(a.no||"")}" placeholder="${index+1}">
    </div>
    <div>
      <span class="metaLabel">外れ理由</span>
      <div class="reasonTags" id="shotReasonTags">${tags}</div>
    </div>
  </div>`;
}
function bindShotMeta(){
  const s=db.active, a=s&&s.cur&&s.cur[ui.selArrow];
  if(!a) return;
  const no=$("#shotArrowNo");
  if(no) no.oninput=e=>{
    a.no=e.target.value.trim();
    save("shot-meta");
  };
  if(no) no.onchange=()=>refreshActive();
  document.querySelectorAll("#shotReasonTags .reasonTag").forEach(btn=>btn.onclick=()=>{
    const reason=btn.dataset.reason;
    a.reason=a.reason===reason?"":reason;
    nativePulse("light");
    save("shot-meta");
    refreshActive();
  });
}
function refreshActive(){
  const s=db.active; if(!s) return;
  if(ui.inputMode==="grid"){
    const grid=$("#scoreGrid");
    if(grid) grid.innerHTML=scoreGridHtml(s);
    const header=document.querySelector(".gridHeader span");
    if(header) header.textContent=`合計 ${aggregateSessionStats(sessionArrows(s)).total}点`;
    bindGridInput(s);
  }
  // markers
  let html="";
  const gp=a=> s.faceType==="triple" ? {x:a.x, y:a.y+SPOT_Y[a.spot||0]} : a;
  s.ends.forEach((end,ei)=>end.forEach(a=>{ html+=markCircle(gp(a),s.faceD,"rgba(60,60,60,.45)"); }));
  s.cur.forEach((a,i)=>{ html+=markCircle(gp(a),s.faceD, i===ui.selArrow?"#111":"var(--green-l)", scoreLabel(a), i===ui.freshArrow?"shotNew":""); });
  $("#tgmarks").innerHTML=html;
  // chips
  $("#curChips").innerHTML = s.cur.map((a,i)=>{
    const z=zoneStyle(a.s,a.X,s.faceType);
    return `<div class="sc ${i===ui.selArrow?"sel":""} ${i===ui.freshArrow?"fresh":""}" data-i="${i}" style="background:${z.bg};color:${z.fg}"><span>${scoreLabel(a)}</span>${a.no?`<small>#${esc(a.no)}</small>`:""}</div>`;
  }).join("") || `<span style="font-size:12px;color:var(--sub);align-self:center">エンド${s.ends.length+1}：的をタップして記録</span>`;
  if(ui.freshArrow>=0){
    clearTimeout(ui.freshTimer);
    ui.freshTimer=setTimeout(()=>{
      ui.freshArrow=-1;
      document.querySelectorAll(".shotNew,.sc.fresh").forEach(el=>el.classList.remove("shotNew","fresh"));
    },640);
  }
  document.querySelectorAll("#curChips .sc").forEach(c=>c.onclick=()=>{
    ui.selArrow = (ui.selArrow===+c.dataset.i)? -1 : +c.dataset.i; nativePulse("light"); refreshActive();
  });
  $("#nudge").classList.toggle("on", ui.selArrow>=0);
  const meta=$("#shotMeta");
  if(meta){
    const a=s.cur[ui.selArrow];
    meta.innerHTML=a?shotMetaHtml(a,ui.selArrow):"";
    if(a) bindShotMeta();
  }
  // stats
  const all=[...s.ends.flat(), ...s.cur];
  const total=all.reduce((a,x)=>a+x.s,0);
  $("#statbar").innerHTML=`
    <div class="stat"><b>${total}</b><span>合計</span></div>
    <div class="stat"><b>${all.length?(total/all.length).toFixed(2):"-"}</b><span>平均/本</span></div>
    <div class="stat"><b>${perfectScoreCount(all,s)}</b><span>${perfectScoreLabel(s)}</span></div>
    <div class="stat"><b>${secondaryScoreCount(all,s)}</b><span>${secondaryScoreLabel(s)}</span></div>`;
  // ends table
  $("#endsTbl").innerHTML = s.ends.length? `<table class="tbl"><tr><th>#</th><th>得点</th><th class="right">計</th><th></th></tr>`+
    s.ends.map((end,i)=>{
      const sorted=[...end].sort((a,b)=>b.s-a.s || (b.X?1:0)-(a.X?1:0));
      return `<tr><td><span class="histChip" style="background:${ENDCOLORS[i%ENDCOLORS.length]}"></span>${i+1}</td>
        <td>${sorted.map(scoreLabel).join("・")}</td>
        <td class="right"><b>${end.reduce((a,x)=>a+x.s,0)}</b></td>
        <td class="right"><button class="btn sm ghost" data-open="${i}" style="padding:4px 8px">✏</button></td></tr>`;
    }).join("")+`</table>` : `<div class="empty">確定したエンドはまだありません</div>`;
  document.querySelectorAll("#endsTbl [data-open]").forEach(b=>b.onclick=()=>{
    if(s.cur.length){ toast("先に現在のエンドを確定（または取消）してください"); return; }
    s.editIndex=+b.dataset.open;
    s.cur=s.ends.splice(s.editIndex,1)[0];
    ui.selArrow=-1; save(); refreshActive();
    toast(`エンド${s.editIndex+1}を編集中（確定で戻ります）`);
  });
}
function nudgeArrow(dirKey){
  const s=db.active; if(!s || ui.selArrow<0 || !s.cur[ui.selArrow]) return;
  if(dirKey==="del"){ s.cur.splice(ui.selArrow,1); ui.selArrow=-1; nativePulse("heavy"); save(); refreshActive(); return; }
  const a=s.cur[ui.selArrow], step=s.faceD/200;
  if(dirKey==="u")a.y+=step; if(dirKey==="d")a.y-=step; if(dirKey==="l")a.x-=step; if(dirKey==="r")a.x+=step;
  Object.assign(a, scoreAt(a.x,a.y,s.faceD,s.faceType,lineCutRadius(s.faceD,s.faceType)));
  nativePulse("light"); save(); refreshActive();
}

/* target pointer input with long-press fine mode + lens */
function attachTargetInput(s){
  const svg=$("#tgsvg"), lens=$("#lens"), lensSvg=$("#lensSvg"), lensTag=$("#lensTag"), cur=$("#tgcur");
  let drag=null, cursorFrame=0, cursorPoint=null;
  const raf=window.requestAnimationFrame||function(cb){ return setTimeout(cb,16); };
  const caf=window.cancelAnimationFrame||clearTimeout;
  function clientPoint(e){
    const t=(e.changedTouches&&e.changedTouches[0])||(e.touches&&e.touches[0])||e;
    if(!t || t.clientX==null) return null;
    return {x:t.clientX,y:t.clientY,id:e.pointerId!=null?e.pointerId:(t.identifier!=null?t.identifier:"mouse")};
  }
  function clientToSvg(x,y){
    const ctm=svg.getScreenCTM();
    if(!ctm) return {x:0,y:0};
    const inv=ctm.inverse();
    if(window.DOMPoint){
      const pt=new DOMPoint(x,y).matrixTransform(inv);
      return {x:pt.x, y:-pt.y};
    }
    const pt=svg.createSVGPoint();
    pt.x=x; pt.y=y;
    const p=pt.matrixTransform(inv);
    return {x:p.x, y:-p.y};
  }
  function drawCursor(p){
    const w=ringW(s.faceD,s.faceType);
    const fine=!!(drag&&drag.fine);
    const cutting=fine && isLineCuttingFromGlobal(p.x,p.y,s.faceD,s.faceType);
    const c=fine ? (cutting?"#0f9d58":"#c62828") : "#111";
    lens.classList.toggle("cut", cutting);
    lens.classList.toggle("miss", fine&&!cutting);
    lensTag.classList.toggle("cut", cutting);
    lensTag.classList.toggle("miss", fine&&!cutting);
    if(fine) lensTag.textContent=cutting?"線かみ":"線なし";
    cur.innerHTML=`<g>
      <line x1="${p.x-w}" y1="${-p.y}" x2="${p.x+w}" y2="${-p.y}" stroke="${c}" stroke-width="${s.faceD/500}"/>
      <line x1="${p.x}" y1="${-p.y-w}" x2="${p.x}" y2="${-p.y+w}" stroke="${c}" stroke-width="${s.faceD/500}"/>
      <circle cx="${p.x}" cy="${-p.y}" r="${arrowMarkRadius(s.faceD)}" fill="none" stroke="${c}" stroke-width="${s.faceD/400}"/>
    </g>`;
    const z=ringW(s.faceD,s.faceType)*2.2;
    lensSvg.setAttribute("viewBox", `${p.x-z} ${-p.y-z} ${2*z} ${2*z}`);
    // lens位置: 指と重ならない側へ
    const half = p.x<0;
    lens.style.left = half? "auto":"8px"; lens.style.right = half? "8px":"auto";
    lensTag.style.left = half? "auto":"12px"; lensTag.style.right = half? "12px":"auto";
  }
  function scheduleCursor(p){
    cursorPoint=p;
    if(cursorFrame) return;
    cursorFrame=raf(()=>{
      cursorFrame=0;
      if(cursorPoint) drawCursor(cursorPoint);
    });
  }
  function resetDrag(){
    if(drag&&drag.tm) clearTimeout(drag.tm);
    if(cursorFrame){ caf(cursorFrame); cursorFrame=0; }
    cursorPoint=null;
    drag=null; cur.innerHTML=""; lens.style.display="none";
    lens.classList.remove("fine","cut","miss");
    lensTag.classList.remove("fine","cut","miss"); lensTag.style.display="none";
  }
  svg.addEventListener("contextmenu", e=>e.preventDefault());
  svg.addEventListener("selectstart", e=>e.preventDefault());
  function down(e){
    if(s.cur.length>=s.perEnd){ toast(`1エンド${s.perEnd}本です。「エンド確定」を押してください`); return; }
    const cp=clientPoint(e); if(!cp) return;
    e.preventDefault();
    if(e.pointerId!=null && svg.setPointerCapture){ try{ svg.setPointerCapture(e.pointerId); }catch(_){} }
    const p=clientToSvg(cp.x,cp.y);
    drag={p, raw:{x:cp.x,y:cp.y}, fine:false, id:cp.id,
      tm:setTimeout(()=>{ if(drag){ drag.fine=true; lens.classList.add("fine"); lensTag.classList.add("fine"); lensTag.style.display="block"; scheduleCursor(drag.p); } },400)};
    lens.style.display="block"; lens.classList.remove("cut","miss"); lensTag.classList.remove("fine","cut","miss"); lensTag.textContent="位置調整中…"; lensTag.style.display="block";
    drawCursor(p);
  }
  function move(e){
    const cp=clientPoint(e); if(!drag || !cp || cp.id!==drag.id) return;
    e.preventDefault();
    const a=clientToSvg(cp.x,cp.y);
    const b=clientToSvg(drag.raw.x,drag.raw.y);
    const k=drag.fine?0.25:1;
    drag.p={x:drag.p.x+(a.x-b.x)*k, y:drag.p.y+(a.y-b.y)*k};
    drag.raw={x:cp.x,y:cp.y};
    scheduleCursor(drag.p);
  }
  function up(e){
    const cp=clientPoint(e); if(!drag || !cp || cp.id!==drag.id) return;
    e.preventDefault();
    clearTimeout(drag.tm);
    let MX=s.faceD/2*1.18, MY=MX;
    if(s.faceType==="triple"){ MX=14; MY=36; }
    const p={x:Math.max(-MX,Math.min(MX,drag.p.x)), y:Math.max(-MY,Math.min(MY,drag.p.y))};
    resetDrag();
    const hit=hitFromGlobal(p.x,p.y,s.faceD,s.faceType,lineCutRadius(s.faceD,s.faceType));
    const rec={x:+hit.x.toFixed(2), y:+hit.y.toFixed(2), s:hit.s, X:hit.X};
    if(hit.spot!=null) rec.spot=hit.spot;
    s.cur.push(rec);
    ui.freshArrow=s.cur.length-1;
    nativePulse(isLineCuttingFromGlobal(p.x,p.y,s.faceD,s.faceType)?"success":"light");
    save(); refreshActive();
    toast(`${scoreLabel(hit)} 点を記録`);
  }
  function cancel(e){
    const cp=clientPoint(e);
    if(!drag || !cp || cp.id===drag.id) resetDrag();
  }
  if(window.PointerEvent){
    svg.addEventListener("pointerdown", down);
    svg.addEventListener("pointermove", move);
    svg.addEventListener("pointerup", up);
    svg.addEventListener("pointercancel", cancel);
  }else{
    svg.addEventListener("touchstart", down, {passive:false});
    svg.addEventListener("touchmove", move, {passive:false});
    svg.addEventListener("touchend", up, {passive:false});
    svg.addEventListener("touchcancel", cancel, {passive:false});
    svg.addEventListener("mousedown", down);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }
}

function visionHitsToArrows(result, s){
  if(!result || !result.arrows || !result.target) return [];
  const tcx=result.target.x/100, tcy=result.target.y/100, tr=Math.max(.08,result.target.radius/100);
  const faceRadiusCm=s.faceD/2;
  const shaft=lineCutRadius(s.faceD,s.faceType);
  const room=Math.max(0,(s.perEnd||6)-s.cur.length);
  return result.arrows.slice(0,room).map(ar=>{
    const nx=(ar.x/100-tcx)/tr;
    const ny=(tcy-ar.y/100)/tr;
    const x=nx*faceRadiusCm;
    const y=ny*faceRadiusCm;
    const hit=scoreAt(x,y,s.faceD,s.faceType,shaft);
    return Object.assign({x,y},hit);
  });
}
function stopScanSession(){
  if(scanSession){
    if(scanSession.scanner) scanSession.scanner.stop();
    if(scanSession.stream) scanSession.stream.getTracks().forEach(track=>track.stop());
    scanSession=null;
  }
  ui.scanBound=false;
}
function importVisionHits(result, s){
  const hits=visionHitsToArrows(result,s);
  if(!hits.length){ toast("矢を検出できませんでした"); return 0; }
  hits.forEach(hit=>{ if(s.cur.length<(s.perEnd||6)) s.cur.push(hit); });
  nativePulse("success");
  save();
  refreshActive();
  toast(`${hits.length}本を取り込み（信頼度 ${result.confidence}%）`);
  return hits.length;
}
function updateScanStatus(text){
  const el=$("#scanStatus");
  if(el) el.textContent=text;
}
function renderScanActions(buttons){
  const el=$("#scanActions");
  if(!el) return;
  el.innerHTML=buttons.map(b=>`<button class="btn sm ${b.kind||"sec"}" id="${b.id}" type="button">${b.label}</button>`).join("");
  buttons.forEach(b=>{ const node=$("#"+b.id); if(node) node.onclick=b.onclick; });
}
async function bindLiveScanMode(s){
  if(!window.ArcherVision || ui.scanBound) return;
  ui.scanBound=true;
  const video=$("#scanVideo");
  const panel=$("#scanPanel");
  if(!video || !panel) return;
  panel.classList.remove("off");
  video.hidden=false;
  updateScanStatus("カメラを起動中…");
  renderScanActions([{id:"scanStopBtn",kind:"ghost",label:"カメラ停止",onclick:()=>{ stopScanSession(); ui.inputMode="tap"; renderActive(); }}]);
  try{
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("この端末はカメラに対応していません");
    const stream=await navigator.mediaDevices.getUserMedia({
      video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}},
      audio:false
    });
    video.srcObject=stream;
    await video.play();
    const scanner=window.ArcherVision.createLiveScanner({
      video,
      faceCm:s.faceD,
      intervalMs:900,
      onResult(result){
        ui.scanResult=result;
        const count=result.arrows.length;
        updateScanStatus(count?`${count}本を検出（信頼度 ${result.confidence}%）`:"的を映してください…");
        renderScanActions([
          {id:"scanImportBtn",kind:"sec",label:`${count}本を取り込む`,onclick:()=>{
            if(s.cur.length>=(s.perEnd||6)){ toast("このエンドは満杯です。確定してから次へ"); return; }
            if(!ui.scanResult){ toast("まだ検出結果がありません"); return; }
            importVisionHits(ui.scanResult,s);
          }},
          {id:"scanStopBtn",kind:"ghost",label:"カメラ停止",onclick:()=>{ stopScanSession(); ui.inputMode="tap"; renderActive(); }}
        ]);
      },
      onError(err){
        if(err && err.code==="no-frame") return;
        updateScanStatus(err&&err.message?err.message:"検出を続けています…");
      }
    });
    scanSession={stream,scanner,video};
    scanner.start();
    updateScanStatus("的をカメラに映してください…");
  }catch(err){
    stopScanSession();
    updateScanStatus(err&&err.message?err.message:"カメラを起動できませんでした");
    toast(err&&err.message?err.message:"カメラを起動できませんでした");
  }
}
function bindVideoScanMode(s){
  if(!window.ArcherVision || ui.scanBound) return;
  ui.scanBound=true;
  const panel=$("#scanPanel");
  const input=$("#videoCapture");
  if(!panel || !input) return;
  panel.classList.remove("off");
  updateScanStatus("練習動画を選ぶとフレームを自動解析します");
  const openPicker=()=>{
    if(s.cur.length>=(s.perEnd||6)){ toast("このエンドは満杯です。確定してから次へ"); return; }
    input.value=""; input.click();
  };
  renderScanActions([
    {id:"videoPickBtn",kind:"sec",label:"動画を選択",onclick:openPicker},
    {id:"videoImportBtn",kind:"ghost",label:"結果を取り込む",onclick:()=>{
      if(!ui.scanResult){ toast("先に動画を解析してください"); return; }
      importVisionHits(ui.scanResult,s);
    }}
  ]);
  input.onchange=async e=>{
    const file=e.target.files&&e.target.files[0];
    if(!file) return;
    ui.scanResult=null;
    updateScanStatus("動画を解析中… 0%");
    toast("動画フレームを解析中…");
    try{
      const result=await window.ArcherVision.scanVideoFile(file,s.faceD,{
        onProgress(pct){ updateScanStatus(`動画を解析中… ${pct}%`); }
      });
      ui.scanResult=result;
      updateScanStatus(`${result.arrows.length}本を検出（信頼度 ${result.confidence}%）`);
      renderScanActions([
        {id:"videoPickBtn",kind:"sec",label:"別の動画",onclick:openPicker},
        {id:"videoImportBtn",kind:"sec",label:`${result.arrows.length}本を取り込む`,onclick:()=>importVisionHits(ui.scanResult,s)}
      ]);
    }catch(err){
      updateScanStatus(err&&err.message?err.message:"動画の解析に失敗しました");
      toast(err&&err.message?err.message:"動画の解析に失敗しました");
    }
  };
}

function finishSession(){
  const s=db.active;
  const shot=s.ends.flat().length + s.cur.length;
  if(!shot){ if(confirm("矢が0本です。このセッションを破棄しますか？")){ db.active=null; nativePulse("heavy"); save(); render(); } return; }
  if(s.cur.length){
    if(s.editIndex!=null) s.ends.splice(Math.min(s.editIndex,s.ends.length),0,s.cur);
    else s.ends.push(s.cur);
    s.cur=[];
  }
  delete s.cur; delete s.editIndex;
  const isEdit=!!s._edit; delete s._edit;
  db.active=null;
  if(isEdit){
    const i=db.sessions.findIndex(x=>x.id===s.id);
    if(i>=0) db.sessions[i]=s; else db.sessions.push(s);
  }else{
    db.sessions.push(s);
  }
  nativePulse("success");
  save();
  openSummary(s, !isEdit);
}

/* ---------- summary modal ---------- */
function openSummary(sess, isNew){
  const setup=db.setups.find(x=>x.id===sess.setupId);
  const all=sess.ends.flat();
  const total=all.reduce((a,x)=>a+x.s,0);
  const st=robustStats(all);
  const adv=adviceFor(sess, setup);
  const ovl=document.createElement("div"); ovl.className="ovl";
  ovl.innerHTML=`<div class="sheet">
    <h3>${isNew?"おつかれさまでした！":""} ${fmtD(sess.date)} ・ ${sess.dist}m</h3>
    ${summaryDecisionHtml(adv,sess)}
    <div class="statbar">
      <div class="stat"><b>${total}</b><span>合計 (${all.length}本)</span></div>
      <div class="stat"><b>${(total/all.length).toFixed(2)}</b><span>平均/本</span></div>
      <div class="stat"><b>${perfectScoreCount(all,sess)}</b><span>${perfectScoreLabel(sess)}</span></div>
      <div class="stat"><b>${secondaryScoreCount(all,sess)}</b><span>${secondaryScoreLabel(sess)}</span></div>
    </div>
    <div id="sumPlot" style="margin-top:10px"></div>
    ${groupSummaryHtml(st)}
    ${summarySightDialHtml(sess,adv)}
    ${nextActionHtml(sess,adv,setup)}
    <details class="adv summaryDetails">
      <summary>詳しい根拠を見る</summary>
      ${trustHtml(sess,setup,st)}
      ${roundProgressHtml(sess)}
      ${(sess.sightV||sess.sightH)?`<div class="kv"><span>使用サイト</span><span>上下 ${esc(sess.sightV||"—")} / 左右 ${esc(sess.sightH||"—")}</span></div>`:""}
      ${arrowMetaSummaryHtml(sess)}
      ${adv?`<div class="advice"><div style="font-size:12px;color:var(--sub)">サイト調整の提案</div>${adv.lines.map(l=>`<div class="dir">${l.html}</div>`).join("")}
        ${judgementHtml(adv,sess)}
        ${shapeNote(adv.st)}
        ${adv.notes.map(n=>`<div class="note">・${n}</div>`).join("")}
        <div class="note">※「矢の集まった方向へサイトを動かす」が原則。mm目安はアイ〜サイト距離 ${db.settings.eyeSight||850}mm と弾道モデルから計算した参考値です（サイトタブで変更可）。</div></div>`:""}
      ${personalModelHtml(adv,sess,setup)}
      ${conditionHtml(sess,st,setup)}
    </details>
    ${sess.setupId&&(sess.sightV||sess.sightH)?`<div class="btnrow"><button class="btn sec" id="sumMark">📒 このサイト値を台帳に記録</button></div>`:""}
    <div class="btnrow"><button class="btn sec" id="sumCard">画像保存</button><button class="btn ghost" id="sumClose">閉じる</button></div>
  </div>`;
  document.body.appendChild(ovl);
  plotSession(sess, ovl.querySelector("#sumPlot"));
  const mk=ovl.querySelector("#sumMark");
  if(mk) mk.onclick=()=>{
    db.sightMarks.push({id:uid(), setupId:sess.setupId, dist:sess.dist,
      v:sess.sightV, h:sess.sightH, date:sess.date, ts:Date.now(),
      note:`練習記録より（${all.length}本 / 平均${(total/all.length).toFixed(1)}）`});
    save(); toast("サイト台帳に記録しました"); mk.disabled=true;
  };
  ovl.querySelector("#sumCard").onclick=()=>exportScorecardImage(sess);
  ovl.querySelector("#sumClose").onclick=()=>{ ovl.remove(); render(); };
}

/* ---------- 履歴 ---------- */
function historyOverviewHtml(allSs,ss){
  const src=ss&&ss.length?ss:allSs;
  if(!allSs.length) return "";
  const arrows=src.flatMap(s=>s.ends.flat());
  const total=arrows.reduce((a,x)=>a+x.s,0);
  const avg=arrows.length?total/arrows.length:0;
  const recent=[...src].sort((a,b)=>(b.date||"").localeCompare(a.date||"")||(b.id<a.id?-1:1)).slice(0,5);
  const recentArrows=recent.flatMap(s=>s.ends.flat());
  const recentAvg=recentArrows.length?recentArrows.reduce((a,x)=>a+x.s,0)/recentArrows.length:0;
  const setupCount=new Set(src.map(s=>s.setupId||"none")).size;
  const distCount=new Set(src.map(s=>s.dist).filter(Boolean)).size;
  const quality=src.map(s=>sessionQuality(s,db.setups.find(x=>x.id===s.setupId))).filter(Boolean);
  const qAvg=quality.length?quality.reduce((a,q)=>a+q.score,0)/quality.length:0;
  return `<div class="insightStrip">
    <div class="insightTile"><div class="k">履歴の地図</div><b>${src.length}回</b><span>${arrows.length}本 / ${distCount}距離 / ${setupCount}用具</span></div>
    <div class="insightTile"><div class="k">平均点</div><b>${avg?avg.toFixed(2):"—"}</b><span>直近${recent.length}回 ${recentAvg?recentAvg.toFixed(2):"—"}</span></div>
    <div class="insightTile"><div class="k">判断材料</div><b>${pct(qAvg)}</b><span>サイト値・本数・用具入力の平均充実度</span></div>
  </div>`;
}
