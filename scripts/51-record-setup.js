"use strict";
/* 的ノート: record setup and launch */

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
