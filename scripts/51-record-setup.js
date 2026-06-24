"use strict";
/* 的ノート: record setup and launch */

/* ---------- 記録 ---------- */
function setupOptions(sel){
  return `<option value="">（セッティング未指定）</option>`+db.setups.map(s=>`<option value="${s.id}" ${s.id===sel?"selected":""}>${esc(s.name)}</option>`).join("");
}
const RECORD_FLOW_MODES=[
  {id:"practice",icon:"◎",title:"練習記録",desc:"点取りから調整提案へ"},
  {id:"pair",icon:"⇄",title:"ペア採点",desc:"練習用の相互確認（公式マーカー代替ではありません）"},
  {id:"volume",icon:"#",title:"本数練",desc:"得点は取らず本数だけ記録"},
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
    <img src="icon-512.png" alt="">
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
      <img class="startLogoMark" src="icon-512.png" alt="">
      <div>
        <div class="eyebrow">記録</div>
        <h2>${mode==="calibration"?"サイト値を記録":"記録方法を選ぶ"}</h2>
        <p>条件と入力方法を選んで記録を始めます。</p>
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
        <span class="${nf.keepAwake?"on":""}">スリープ防止${nf.keepAwake?"ON":"待ち"}</span>
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
  if(sess.faceType==="quad") return "Q40";
  if(sess.faceType==="field") return `F${sess.faceD||80}`;
  return String(sess.faceD||122);
}
function suggestedFaceValue(dist,last,bowType){
  if(last && last.faceD) return faceChoiceValue(last);
  const d=dist||70;
  const bow=bowType||(last&&last.bowType)||db.settings.defaultBowType||"recurve";
  const env=(last&&last.environment)||db.settings.defaultEnvironment||"outdoor";
  if(bow==="barebow"&&env==="indoor"&&d<=18) return "Q40";
  if(bow==="compound"&&d===50) return "48";
  return String(d>=60?122:(d<=18?40:80));
}
function actionFaceLabel(value){
  const f=parseFaceChoice(value);
  if(f.faceType==="triple") return "40cm三つ目";
  if(f.faceType==="quad") return "40cm四枚";
  if(f.faceType==="field") return `${f.faceD}cmフィールド`;
  return `${f.faceD}cm`;
}
function collectFocusPointsFromInputs(){
  const pts=[];
  ["#fFocusPoints","#ciFocus1","#ciFocus2","#ciFocus3"].forEach(sel=>{
    const el=$(sel);
    if(!el) return;
    if(sel==="#fFocusPoints"){
      el.value.split(",").map(s=>s.trim()).filter(Boolean).forEach(p=>{ if(pts.length<3) pts.push(p); });
    }else if(el.value.trim()&&pts.length<3) pts.push(el.value.trim());
  });
  return pts.slice(0,3);
}
function checkInSheetHtml(meta){
  const existing=meta.focusPoints||[];
  return `<div class="sheet checkInSheet">
    <h3>練習前チェックイン</h3>
    <p class="checkInLead">今日の意識ポイント（最大3つ）を決めてから始めましょう。</p>
    <label class="f">意識ポイント 1</label>
    <input class="inp" id="ciFocus1" placeholder="例: アンカー固定" value="${esc(existing[0]||"")}">
    <label class="f">意識ポイント 2</label>
    <input class="inp" id="ciFocus2" placeholder="例: 押し手" value="${esc(existing[1]||"")}">
    <label class="f">意識ポイント 3</label>
    <input class="inp" id="ciFocus3" placeholder="例: リリース" value="${esc(existing[2]||"")}">
    <div class="checkInMeta ds-truncate">${esc(meta.dist)}m / ${esc(meta.faceLabel)}${meta.roundLabel?` · ${esc(meta.roundLabel)}`:""}</div>
    <div class="btnrow">
      <button class="btn ghost" id="ciSkip" type="button">スキップ</button>
      <button class="btn startPrimary" id="ciGo" type="button">記録開始</button>
    </div>
  </div>`;
}
function openCheckInModal(meta,onConfirm){
  const finish=pts=>{ if(typeof onConfirm==="function") onConfirm((pts||[]).slice(0,3)); };
  const go=()=>finish(collectFocusPointsFromInputs());
  if(typeof mountOverlay==="function"){
    const mounted=mountOverlay(checkInSheetHtml(meta),{dismissOnBackdrop:false});
    const {ovl,dismiss}=mounted;
    ovl.classList.add("checkInOvl");
    const close=pts=>{ dismiss(); finish(pts); };
    ovl.querySelector("#ciGo").onclick=()=>close(collectFocusPointsFromInputs());
    ovl.querySelector("#ciSkip").onclick=()=>close([]);
    ovl.addEventListener("click",e=>{ if(e.target===ovl) close(collectFocusPointsFromInputs()); });
    return;
  }
  const ovl=document.createElement("div");
  ovl.className="ovl checkInOvl";
  ovl.innerHTML=checkInSheetHtml(meta);
  document.body.appendChild(ovl);
  if(typeof mountOverlayMotion==="function") mountOverlayMotion(ovl);
  const legacy=pts=>{ removeOverlay(ovl); finish(pts); };
  ovl.querySelector("#ciGo").onclick=()=>legacy(collectFocusPointsFromInputs());
  ovl.querySelector("#ciSkip").onclick=()=>legacy([]);
  ovl.onclick=e=>{ if(e.target===ovl) legacy(collectFocusPointsFromInputs()); };
}
function launchActiveSession(opts){
  const d=opts.dist;
  if(!d){ toast("距離を入力してください"); return; }
  const face=opts.face;
  const bowType=opts.bowType||db.settings.defaultBowType||"recurve";
  const environment=opts.environment||db.settings.defaultEnvironment||"outdoor";
  db.settings.defaultBowType=bowType;
  db.settings.defaultDistance=d;
  db.settings.defaultEnvironment=environment;
  db.settings.lastSelectedDistance=d;
  const roundId=opts.roundId||"free";
  const laneChip=opts.laneChip;
  db.active={
    id:uid(), date:opts.date||today(), setupId:opts.setupId||null,
    bowType, environment,
    dist:d, faceD: face.faceD, faceType: face.faceType, perEnd:opts.perEnd||6,
    inputStyle:"grid",
    shaft:+lineCutRadius(face.faceD, face.faceType).toFixed(3),
    sightV:opts.sightV||"", sightH:opts.sightH||"",
    wx:opts.wx||"", note:opts.note||"", windDir:opts.windDir||"", windSpeed:opts.windSpeed||"",
    round:roundId,
    purpose:opts.purpose||"practice",
    pairMode:opts.purpose==="pair"||opts.pairMode===true,
    ...(opts.purpose==="pair"||opts.pairMode?{
      pairEnd:{shooter:[],marker:[]},
      pairNames:opts.pairNames||{shooter:"射手",marker:"マーカー"},
    }:{}),
    focusPoints:(opts.focusPoints||[]).slice(0,3),
    laneSpot:laneChip?laneChip.dataset.lane:"A",
    curSpotId:laneChip?laneChip.dataset.lane:"A",
    indoorHalf:roundId==="18m60_jp"||roundId==="18m60_jp_x2"?1:undefined,
    ends:[], cur:[]
  };
  applyRoundToSession(db.active, roundId);
  if(opts.fieldCourseId&&db.active.faceType==="field") applyFieldCourseToSession(db.active,opts.fieldCourseId);
  if(db.active.faceType==="quad"&&typeof ensureQuadHalf==="function") ensureQuadHalf(db.active);
  if(opts.purpose==="volume"||roundId==="volume"){
    db.active.purpose="volume";
    db.active.round="volume";
    if(!db.active.perEnd||db.active.perEnd===6) db.active.perEnd=8;
  }
  resetEndTimer(db.active);
  ui.inputMode="grid";
  ui.gridCell=-1;
  ui.indoorHalfBanner=false;
  nativePulse("success");
  save();
  if(typeof opts.onStart==="function") opts.onStart();
  else showView("record");
  render();
}
function launchQuadJpPreset(ctx){
  ctx=ctx||{};
  const setupId=ctx.defSetup!=null?ctx.defSetup:(db.setups[0]?db.setups[0].id:"");
  const start=pts=>launchActiveSession({
    dist:18, face:parseFaceChoice("Q40"), perEnd:3, roundId:"quad60_jp",
    bowType:"barebow", environment:"indoor", setupId, date:today(),
    focusPoints:pts||[], onStart:ctx.onStart
  });
  if(ctx.skipCheckIn) start([]);
  else openCheckInModal({dist:18,faceLabel:"40cm四枚",roundLabel:roundLabel("quad60_jp"),focusPoints:[]},start);
}
function roundPresetMeta(roundId){
  const r=roundMeta(roundId);
  const indoor=!!(r.indoor||String(roundId).includes("18m")||roundId==="quad60_jp");
  const arrows=r.arrows?`${r.arrows}射`:"自由";
  const dist=r.dist?`${r.dist}m`:"";
  const detail=[dist,arrows].filter(Boolean).join(" · ");
  return {indoor,arrows,detail,label:r.label};
}
function wireLaunchEnvPills(root){
  if(!root) return;
  const pills=root.querySelectorAll("[data-launch-env]");
  const items=root.querySelectorAll("[data-round-preset]");
  if(!pills.length||!items.length) return;
  const apply=env=>{
    items.forEach(item=>{
      const id=item.dataset.roundPreset;
      const m=roundPresetMeta(id);
      const show=env==="all"||id==="volume"||(env==="indoor"&&m.indoor)||(env==="outdoor"&&!m.indoor&&id!=="volume");
      item.hidden=!show;
    });
  };
  pills.forEach(pill=>{
    pill.onclick=()=>{
      pills.forEach(x=>x.classList.remove("on"));
      pill.classList.add("on");
      apply(pill.dataset.launchEnv);
    };
  });
  const active=root.querySelector("[data-launch-env].on");
  apply(active?active.dataset.launchEnv:"all");
}
function launchSheetUiPrefs(){
  const s=db.settings;
  if(!s.sheetUi) s.sheetUi={kind:"standard",cell:"ring",color:"pastel",sharePublic:false};
  return s.sheetUi;
}
function launchChipStripHtml(id,items,defVal,dataKey){
  return `<div class="launchChipStrip" id="${id}">${items.map(it=>{
    const v=it.value!=null?it.value:it.id;
    const on=String(v)===String(defVal)?" on":"";
    return `<button type="button" class="launchChip${on}" data-${dataKey}="${esc(String(v))}">${esc(it.label)}</button>`;
  }).join("")}</div>`;
}
function launchMiniGridHtml(kind,color){
  const palette={
    pastel:["#f2dc7a","#f4a4b8","#8ecae6","#e07a7a","#c9e4ca"],
    wa:["#ffd60a","#d62828","#003049","#f1faee","#a8dadc"],
    vivid:["#ffea00","#ff006e","#3a86ff","#fb5607","#8338ec"]
  };
  const cols=palette[color]||palette.pastel;
  return `<div class="launchMiniGrid launchMiniGrid--${kind}" aria-hidden="true">${Array.from({length:25},(_,i)=>{
    const bg=kind==="simple"?cols[i%3]:cols[i%cols.length];
    const mark=kind==="standard"&&i%11===4?"X":"";
    return `<span class="launchMiniCell" style="background:${bg}">${mark}</span>`;
  }).join("")}</div>`;
}
function launchSheetDetailHtml(prefs){
  const kinds=[
    {id:"standard",label:"標準"},
    {id:"simple",label:"シンプル"},
    {id:"detail",label:"詳細"}
  ];
  const cells=[
    {id:"fill",label:"マス全体を塗る",icon:"▣"},
    {id:"ring",label:"数字を丸で囲む",icon:"◎"},
    {id:"plain",label:"色なし",icon:"Tt"}
  ];
  const colors=[
    {id:"pastel",label:"パステル",dots:["#f2dc7a","#f4a4b8","#8ecae6"]},
    {id:"wa",label:"WA 公式",dots:["#ffd60a","#d62828","#003049"]},
    {id:"vivid",label:"ビビッド",dots:["#ffea00","#ff006e","#3a86ff"]}
  ];
  return `<details class="adv launchSheetDetailAdv" open>
    <summary class="launchSheetDetailSummary">
      <span class="launchSettingIcon" aria-hidden="true"><svg class="ic-svg" viewBox="0 0 24 24"><use href="ui/icons.svg#ic-gear"/></svg></span>
      <span class="launchSheetDetailHead">
        <span class="launchSettingLabel">詳細設定</span>
        <span class="launchSettingSub">シート形式・見た目・カラーセット</span>
      </span>
    </summary>
    <div class="launchSheetDetailBody">
      <p class="launchDetailK">シート種類</p>
      <div class="launchKindRow" id="fSheetKind">${kinds.map(k=>`<button type="button" class="launchKindCard${prefs.kind===k.id?" on":""}" data-sheet-kind="${k.id}">
        ${launchMiniGridHtml(k.id,prefs.color)}
        <span>${esc(k.label)}</span>
      </button>`).join("")}</div>
      <p class="launchDetailK">セル表示</p>
      <div class="launchSegRow" id="fCellDisplay">${cells.map(c=>`<button type="button" class="launchSegBtn${prefs.cell===c.id?" on":""}" data-cell-display="${c.id}"><span aria-hidden="true">${c.icon}</span><span>${esc(c.label)}</span></button>`).join("")}</div>
      <p class="launchDetailK">カラーセット</p>
      <div class="launchColorList" id="fColorSet">${colors.map(c=>`<button type="button" class="launchColorRow${prefs.color===c.id?" on":""}" data-color-set="${c.id}">
        <span class="launchColorDots">${c.dots.map(d=>`<span style="background:${d}"></span>`).join("")}</span>
        <span>${esc(c.label)}</span>
        <span class="launchColorCheck" aria-hidden="true">✓</span>
      </button>`).join("")}</div>
      <button type="button" class="launchPreviewRow" id="launchSheetPreview">
        <span class="launchSettingIcon" aria-hidden="true"><svg class="ic-svg" viewBox="0 0 24 24"><use href="ui/icons.svg#ic-analysis"/></svg></span>
        <span>プレビュー</span>
      </button>
    </div>
  </details>`;
}
function wireLaunchChipStrip(root,chipSel,hiddenSel,onPick){
  const chips=root.querySelectorAll(chipSel);
  const hidden=hiddenSel?root.querySelector(hiddenSel):null;
  chips.forEach(chip=>{
    chip.onclick=()=>{
      chips.forEach(c=>c.classList.remove("on"));
      chip.classList.add("on");
      const val=chip.dataset.bow||chip.dataset.env||chip.dataset.face||chip.dataset.arrows||chip.dataset.d;
      if(hidden&&val!=null){
        hidden.value=val;
        hidden.dispatchEvent(new Event("change"));
      }
      if(onPick) onPick(chip,val);
    };
  });
}
function wireLaunchSheetDetail(root,prefs){
  root.querySelectorAll("[data-sheet-kind]").forEach(btn=>btn.onclick=()=>{
    prefs.kind=btn.dataset.sheetKind;
    root.querySelectorAll("[data-sheet-kind]").forEach(b=>b.classList.toggle("on",b===btn));
    save("sheet-ui");
  });
  root.querySelectorAll("[data-cell-display]").forEach(btn=>btn.onclick=()=>{
    prefs.cell=btn.dataset.cellDisplay;
    root.querySelectorAll("[data-cell-display]").forEach(b=>b.classList.toggle("on",b===btn));
    save("sheet-ui");
  });
  root.querySelectorAll("[data-color-set]").forEach(btn=>btn.onclick=()=>{
    prefs.color=btn.dataset.colorSet;
    root.querySelectorAll("[data-color-set]").forEach(b=>b.classList.toggle("on",b===btn));
    root.querySelectorAll(".launchKindCard").forEach(card=>{
      const kind=card.dataset.sheetKind;
      const grid=card.querySelector(".launchMiniGrid");
      if(grid&&kind) grid.outerHTML=launchMiniGridHtml(kind,prefs.color);
    });
    save("sheet-ui");
  });
  const preview=root.querySelector("#launchSheetPreview");
  if(preview) preview.onclick=()=>toast(`プレビュー: ${prefs.kind} / ${prefs.cell} / ${prefs.color}`);
}
function launchSheetShellHtml(title){
  return `<div class="sheet launchSheet ds-sheet">
    <div class="ds-sheetGrab" aria-hidden="true"></div>
    <div class="launchSheetChrome">
      <h2 class="launchSheetTitle an-screenTitle" id="launchSheetTitle">${esc(title||"ラウンド")}</h2>
      <button type="button" class="ds-sheetClose" id="launchSheetClose" aria-label="閉じる">閉じる</button>
    </div>
    <div class="launchSheetScroll" id="launchSheetMount"></div>
  </div>`;
}
function roundPresetListHtml(limit){
  const ids=["18m60","18m60_jp","quad60_jp","70m72","50m72","30m36","field24","volume"];
  return `<section class="an-roundList" aria-label="ラウンドプリセット">
    ${ids.slice(0,limit||6).map(id=>{
      const m=roundPresetMeta(id);
      return `<button type="button" class="an-roundItem" data-round-preset="${id}">
        <span class="an-roundIcon ${m.indoor?"an-roundIcon--indoor":"an-roundIcon--outdoor"}" aria-hidden="true"><svg class="ic-svg" viewBox="0 0 24 24"><use href="ui/icons.svg#ic-record"/></svg></span>
        <span class="an-roundBody">
          <p class="an-roundTitle">${esc(m.label)}</p>
          <p class="an-roundMeta">${esc(m.detail||"プリセット")}</p>
        </span>
        <span class="an-roundTag">プリセット</span>
      </button>`;
    }).join("")}
  </section>`;
}
function recordFastActionsHtml(last,dist,faceValue,setup){
  return `<section class="homeActions homeActions--compact" aria-label="すぐ使う">
    <p class="homeActionsLead">ショートカット</p>
    <div class="homeActionRow">
      <button class="homeAction sec" id="quickRepeat" type="button" ${last?"":"disabled"}>
        <span class="ds-ctaLead">前回と同じ</span>
        ${last?"":`<span class="ds-ctaHint">まだ記録がありません</span>`}
      </button>
      <button class="homeAction sec" id="quickHistory" type="button"><span class="ds-ctaLead">履歴</span></button>
    </div>
  </section>`;
}
function quickStartSession(ctx){
  ctx=ctx||{};
  const last=ctx.last;
  const d=ctx.defDist;
  if(!d){ toast("距離を入力してください"); return; }
  const face=parseFaceChoice(ctx.defFace);
  const bowType=last&&last.bowType?last.bowType:(db.settings.defaultBowType||"recurve");
  const environment=last&&last.environment?last.environment:(db.settings.defaultEnvironment||"outdoor");
  const mode=ctx.mode||ui.recordMode||"practice";
  const purpose=mode==="volume"?"volume":(mode==="pair"?"pair":mode);
  const launchOpts={
    dist:d, face, bowType, environment,
    setupId:ctx.defSetup||null,
    perEnd:last&&last.perEnd?last.perEnd:6,
    roundId:last&&last.round?last.round:"free",
    purpose,
    onStart:ctx.onStart
  };
  if(mode==="pair") launchOpts.pairMode=true;
  launchOpts.focusPoints=(last&&last.focusPoints)?last.focusPoints.slice(0,3):[];
  launchActiveSession(launchOpts);
}
function repeatLastSession(last,ctx){
  if(!last) return;
  const face=parseFaceChoice(faceChoiceValue(last));
  const launchOpts={
    dist:last.dist, face,
    bowType:last.bowType||db.settings.defaultBowType||"recurve",
    environment:last.environment||db.settings.defaultEnvironment||"outdoor",
    setupId:last.setupId||null,
    perEnd:last.perEnd||6,
    roundId:last.round||"free",
    purpose:last.purpose||"practice",
    pairMode:!!last.pairMode,
    onStart:ctx&&ctx.onStart
  };
  if(last.purpose==="pair") launchOpts.pairMode=true;
  launchActiveSession(launchOpts);
}
function openLaunchSheet(ctx){
  ctx=ctx||{};
  const mode=ctx.mode||ui.recordMode||"practice";
  const title=mode==="calibration"?"サイト値を残す練習":"スコアシート設定";
  const finish=()=>{ if(ctx.onStart) ctx.onStart(); };
  if(typeof mountOverlay==="function"){
    const {ovl,dismiss}=mountOverlay(launchSheetShellHtml(title),{dismissOnBackdrop:true});
    ovl.classList.add("launchSheetOvl");
    ovl.querySelector("#launchSheetClose").onclick=dismiss;
    renderRecordSetup(ovl.querySelector("#launchSheetMount"),Object.assign({},ctx,{
      sheetMode:true,
      onStart:()=>{ dismiss(); finish(); }
    }));
    return;
  }
  const ovl=document.createElement("div");
  ovl.className="ovl launchSheetOvl ds-overlay";
  ovl.innerHTML=launchSheetShellHtml(title);
  document.body.appendChild(ovl);
  if(typeof mountOverlayMotion==="function") mountOverlayMotion(ovl);
  const sheet=ovl.querySelector(".sheet");
  const close=()=>removeOverlay(ovl);
  if(typeof mountSheetA11y==="function") mountSheetA11y(ovl,{titleEl:ovl.querySelector("#launchSheetTitle"),onClose:close});
  if(typeof mountSheetSwipeDismiss==="function") ovl._dsSwipeTeardown=mountSheetSwipeDismiss(sheet,close);
  ovl.querySelector("#launchSheetClose").onclick=close;
  renderRecordSetup(ovl.querySelector("#launchSheetMount"),Object.assign({},ctx,{
    sheetMode:true,
    onStart:()=>{ close(); finish(); }
  }));
  ovl.addEventListener("click",e=>{ if(e.target===ovl) close(); });
}
function renderLaunchSheetSettings(m,ctx){
  m=m||$("#main");
  if(!m) return;
  ctx=ctx||{};
  const last=ctx.last||db.sessions[db.sessions.length-1];
  const defSetup=ctx.defSetup!=null?ctx.defSetup:(last?last.setupId:(db.setups[0]?db.setups[0].id:""));
  const defDist=ctx.defDist!=null?ctx.defDist:(last?last.dist:70);
  const mode=ctx.mode||ui.recordMode||"practice";
  const defBow=last&&last.bowType?last.bowType:(db.settings.defaultBowType||"recurve");
  const defFace=ctx.defFace!=null?ctx.defFace:suggestedFaceValue(defDist,last,defBow);
  const defPerEnd=last&&last.perEnd?last.perEnd:6;
  const defEnv=last&&last.environment?last.environment:(db.settings.defaultEnvironment||"outdoor");
  const prefs=launchSheetUiPrefs();
  const faceItems=[
    ...[122,80,60,48,40].map(f=>({value:String(f),label:`${f}cm`})),
    {value:"T40",label:"三つ目"},
    {value:"Q40",label:"四枚"}
  ];
  m.innerHTML=`
  <section class="launchPanel launchPanel--sheet launchPanel--settings">
    <div class="launchBody">
      <p class="launchSettingKicker">設定</p>
      <div class="launchSettingRow">
        <span class="launchSettingIcon" aria-hidden="true"><svg class="ic-svg" viewBox="0 0 24 24"><use href="ui/icons.svg#ic-record"/></svg></span>
        <div class="launchSettingBody">
          <p class="launchSettingLabel">弓の種類</p>
          ${launchChipStripHtml("fBowChips",BOW_TYPES.map(b=>({value:b.id,label:b.label})),defBow,"bow")}
          <select id="fBow" hidden>${BOW_TYPES.map(b=>`<option value="${b.id}" ${b.id===defBow?"selected":""}>${b.label}</option>`).join("")}</select>
        </div>
      </div>
      <div class="launchSettingRow">
        <span class="launchSettingIcon" aria-hidden="true"><svg class="ic-svg" viewBox="0 0 24 24"><use href="ui/icons.svg#ic-record"/></svg></span>
        <div class="launchSettingBody">
          <p class="launchSettingLabel">距離</p>
          <div class="chips quickDists launchDistChips" id="fDistChips">
            ${[70,50,30,18].map(d=>`<div class="chip ${d===defDist?"on":""}" data-d="${d}">${d}m</div>`).join("")}
            <div class="chip" data-d="custom">カスタム</div>
          </div>
          <div id="fDistCustomWrap" style="display:none"><label class="f">距離 (m)</label><input class="inp" type="number" id="fDistCustom" min="5" max="90" step="1" placeholder="例: 60"></div>
        </div>
      </div>
      ${launchSheetDetailHtml(prefs)}
      <p class="launchSettingKicker">プライバシー設定</p>
      <div class="launchSettingRow launchPrivacyRow">
        <div class="launchSettingBody">
          <p class="launchSettingLabel">スコアの公開設定</p>
          <p class="launchSettingSub">スコアを他のユーザーと共有する</p>
        </div>
        <label class="launchToggle"><input type="checkbox" id="fSharePublic" ${prefs.sharePublic?"checked":""}><span class="launchToggleTrack" aria-hidden="true"></span></label>
      </div>
      <button type="button" class="launchPhotoCard" id="launchPhotoImport">
        <span class="launchSettingIcon" aria-hidden="true"><svg class="ic-svg" viewBox="0 0 24 24"><use href="ui/icons.svg#ic-cloud"/></svg></span>
        <span class="launchPhotoCopy">
          <span class="launchSettingLabel">写真から取り込み</span>
          <span class="launchSettingSub">カメラで撮影、またはアルバムから選択して自動入力できます。</span>
        </span>
        <span class="homeSightConditionArrow" aria-hidden="true"><svg class="ic-svg" viewBox="0 0 24 24"><use href="ui/icons.svg#ic-chevron-right"/></svg></span>
      </button>
      <details class="adv launchSheetMore">
        <summary>弓種・環境・的の詳細</summary>
        <p class="launchSettingLabel">環境</p>
        ${launchChipStripHtml("fEnvChips",ENV_TYPES.map(e=>({value:e.id,label:e.label})),defEnv,"env")}
        <select id="fEnv" hidden>${ENV_TYPES.map(e=>`<option value="${e.id}" ${e.id===defEnv?"selected":""}>${e.label}</option>`).join("")}</select>
        <p class="launchSettingLabel">的</p>
        ${launchChipStripHtml("fFaceChips",faceItems,defFace,"face")}
        <select id="fFace" hidden>${faceItems.map(f=>`<option value="${f.value}" ${String(defFace)===String(f.value)?"selected":""}>${f.label}</option>`).join("")}</select>
        <p class="launchSettingLabel">1エンドの本数</p>
        ${launchChipStripHtml("fArrowsChips",[1,2,3,4,5,6,7,8,9,10,11,12].map(n=>({value:String(n),label:`${n}本`})),defPerEnd,"arrows")}
        <select id="fArrows" hidden>${[1,2,3,4,5,6,7,8,9,10,11,12].map(n=>`<option value="${n}" ${n===defPerEnd?"selected":""}>${n}本</option>`).join("")}</select>
        <div class="fieldBand">
          <p class="launchSettingLabel">用具セッティング</p>
          <select class="inp" id="fSetup">${setupOptions(defSetup)}</select>
          ${recordSetupSnapshot(defSetup,defDist)}
        </div>
        <input type="date" id="fDate" hidden value="${today()}">
        <select id="fRound" hidden>${ROUND_TYPES.map(r=>`<option value="${r.id}">${r.label}</option>`).join("")}</select>
        <input id="fSightV" hidden><input id="fSightH" hidden>
        <select id="fWx" hidden><option value=""></option></select>
        <input id="fNote" hidden><select id="fWindDir" hidden><option value=""></option></select>
        <input id="fWindSpeed" hidden>
      </details>
      <div class="launchSheetStickyCta"><button class="btn startPrimary" id="fStart">→ 次へ</button></div>
    </div>
  </section>`;
  bindLaunchSheetSettingsForm(m,ctx,prefs);
}
function bindLaunchSheetSettingsForm(m,ctx,prefs){
  const distState={d:ctx.defDist!=null?ctx.defDist:(db.sessions[db.sessions.length-1]?db.sessions[db.sessions.length-1].dist:70)};
  const faceSel=m.querySelector("#fFace");
  const suggestFace=d=>{
    if(!faceSel||String(faceSel.value).startsWith("F")) return;
    const bow=m.querySelector("#fBow").value||"recurve";
    faceSel.value=bow==="compound"&&d===50?"48":(d>=60?122:(d<=18?40:80));
    const chip=m.querySelector(`#fFaceChips [data-face="${faceSel.value}"]`);
    if(chip){
      m.querySelectorAll("#fFaceChips .launchChip").forEach(c=>c.classList.remove("on"));
      chip.classList.add("on");
    }
  };
  function updateQuickStartMeta(){
    const meta=document.querySelector("#quickStartMeta");
    if(meta&&distState.d&&faceSel) meta.textContent=`${distState.d}m · ${actionFaceLabel(faceSel.value)}`;
  }
  wireLaunchChipStrip(m,"#fBowChips .launchChip","#fBow",()=>{ if(distState.d) suggestFace(distState.d); updateQuickStartMeta(); });
  wireLaunchChipStrip(m,"#fEnvChips .launchChip","#fEnv");
  wireLaunchChipStrip(m,"#fFaceChips .launchChip","#fFace",()=>updateQuickStartMeta());
  wireLaunchChipStrip(m,"#fArrowsChips .launchChip","#fArrows");
  wireLaunchSheetDetail(m,prefs);
  const share=m.querySelector("#fSharePublic");
  if(share) share.onchange=()=>{ prefs.sharePublic=share.checked; save("sheet-ui"); };
  const photo=m.querySelector("#launchPhotoImport");
  if(photo) photo.onclick=()=>{ ctx.photoImport=true; toast("記録開始後に「紙を読み取り」モードを選べます"); };
  document.querySelectorAll("#fDistChips .chip").forEach(c=>c.onclick=()=>{
    document.querySelectorAll("#fDistChips .chip").forEach(x=>x.classList.remove("on"));
    c.classList.add("on");
    const wrap=m.querySelector("#fDistCustomWrap");
    if(c.dataset.d==="custom"){ if(wrap) wrap.style.display="block"; distState.d=null; }
    else{ if(wrap) wrap.style.display="none"; distState.d=+c.dataset.d; suggestFace(distState.d); }
    updateQuickStartMeta();
  });
  const distCustom=m.querySelector("#fDistCustom");
  if(distCustom) distCustom.oninput=e=>{ distState.d=+e.target.value||null; if(distState.d) suggestFace(distState.d); updateQuickStartMeta(); };
  m.querySelector("#fStart").onclick=()=>{
    const d=distState.d;
    if(!d){ toast("距離を入力してください"); return; }
    const fv=faceSel.value;
    const face=parseFaceChoice(fv);
    const launchOpts={
      dist:d, face,
      bowType:m.querySelector("#fBow").value||"recurve",
      environment:m.querySelector("#fEnv").value||"outdoor",
      roundId:"free",
      date:today(),
      setupId:m.querySelector("#fSetup")?.value||null,
      perEnd:+m.querySelector("#fArrows").value,
      purpose:ui.recordMode==="volume"?"volume":"practice",
      onStart:ctx.onStart
    };
    if(ctx.photoImport) launchOpts.inputMode="ocr";
    openCheckInModal({
      dist:d,
      faceLabel:actionFaceLabel(fv),
      roundLabel:"練習",
      focusPoints:[]
    },pts=>{
      launchOpts.focusPoints=pts;
      launchActiveSession(launchOpts);
      if(ctx.photoImport) ui.inputMode="ocr";
    });
  };
  updateQuickStartMeta();
}
function renderRecordSetup(m,ctx){
  m=m||$("#main");
  if(!m) return;
  ctx=ctx||{};
  if(ctx.sheetMode) return renderLaunchSheetSettings(m,ctx);
  const last=ctx.last||db.sessions[db.sessions.length-1];
  const defSetup=ctx.defSetup!=null?ctx.defSetup:(last?last.setupId:(db.setups[0]?db.setups[0].id:""));
  const defDist=ctx.defDist!=null?ctx.defDist:(last?last.dist:70);
  const mode=ctx.mode||ui.recordMode||"practice";
  const defBow=last&&last.bowType?last.bowType:(db.settings.defaultBowType||"recurve");
  const defFace=ctx.defFace!=null?ctx.defFace:suggestedFaceValue(defDist,last,defBow);
  const defPerEnd=last&&last.perEnd?last.perEnd:6;
  const defEnv=last&&last.environment?last.environment:(db.settings.defaultEnvironment||"outdoor");
  const sheet=!!ctx.sheetMode;
  const bowEnvHtml=`<div class="quickSelects${sheet?" launchSheetBowEnv":""}">
      <div><label class="f">弓種</label><select class="inp" id="fBow">${BOW_TYPES.map(b=>`<option value="${b.id}" ${b.id===defBow?"selected":""}>${b.label}</option>`).join("")}</select></div>
      <div><label class="f">環境</label><select class="inp" id="fEnv">${ENV_TYPES.map(e=>`<option value="${e.id}" ${e.id===defEnv?"selected":""}>${e.label}</option>`).join("")}</select></div>
    </div>`;
  m.innerHTML=`
  <section class="launchPanel convergeLaunch startFirst${sheet?" launchPanel--sheet":""}">
    ${sheet?"":`<div class="launchHead">
      <div class="launchTitle"><h2 class="an-screenTitle" style="font-size:22px">${mode==="calibration"?"サイト値を残す練習":"ラウンド"}</h2></div>
      <button class="tinyAction" id="jumpGear" type="button">用具</button>
    </div>`}
    <div class="launchBody">
    <div class="an-pillRow an-pillRow--wrap" id="launchEnvPills">
      <button type="button" class="an-pill on" data-launch-env="all">すべて</button>
      <button type="button" class="an-pill" data-launch-env="indoor">インドア</button>
      <button type="button" class="an-pill" data-launch-env="outdoor">アウトドア</button>
    </div>
    ${roundPresetListHtml(sheet?8:6)}
    ${sheet?"":bowEnvHtml}
    <label class="f">距離</label>
    <div class="chips quickDists" id="fDistChips">
      ${[70,50,30,18].map(d=>`<div class="chip ${d===defDist?"on":""}" data-d="${d}">${d}m</div>`).join("")}
      <div class="chip" data-d="custom">カスタム</div>
    </div>
    <div id="fDistCustomWrap" style="display:none"><label class="f">距離 (m)</label><input class="inp" type="number" id="fDistCustom" min="5" max="90" step="1" placeholder="例: 60"></div>
    <div class="quickSelects">
      <div><label class="f">的</label><select class="inp" id="fFace">
        <optgroup label="ターゲット">
          ${[122,80,60,48,40].map(f=>`<option value="${f}" ${String(defFace)===String(f)?"selected":""}>${f}cm</option>`).join("")}
          <option value="T40" ${defFace==="T40"?"selected":""}>40cm 三つ目（縦）</option>
          <option value="Q40" ${defFace==="Q40"?"selected":""}>40cm 四枚（ABCD）</option>
        </optgroup>
        <optgroup label="フィールド">
          ${FIELD_FACE_SIZES.map(f=>`<option value="F${f}" ${defFace===`F${f}`?"selected":""}>${f}cm フィールド</option>`).join("")}
        </optgroup>
      </select></div>
      <div><label class="f">1エンドの本数</label><select class="inp" id="fArrows">${[1,2,3,4,5,6,7,8,9,10,11,12].map(n=>`<option value="${n}" ${n===defPerEnd?"selected":""}>${n}本</option>`).join("")}</select></div>
    </div>
    ${sheet?"":`<button class="btn sec" id="fQuadJpStart" type="button">四枚40cm（小中学生）で始める</button>
    <details class="adv quadRulesAdv">
      <summary>四枚40cmのルール（練習用メモ）</summary>
      <div class="note">畳1枚に A・B・C・D の4枚の的。前半30射のあと<strong>上下が入れ替わり</strong>ます（上A/B → 下へ、C/D → 上へ）。</div>
      <div class="note">射る的はチップで選びます。競技では間違った的は0点 — アプリは練習記録用です。</div>
    </details>`}
    <div id="fFieldCourseWrap" style="display:none">
      <label class="f">フィールドコース（練習用）</label>
      <select class="inp" id="fFieldCourse">
        <option value="flat24_marked">フラット24（マーク）</option>
        <option value="wa_sample12">WA簡易12標的</option>
        <option value="">手動（距離固定）</option>
      </select>
      <div class="note fieldDisclaimer">${esc(FIELD_COURSE_DISCLAIMER)}</div>
    </div>
    <div class="${sheet?"launchSheetStickyCta":"btnrow"}"><button class="btn startPrimary" id="fStart">${mode==="calibration"?"サイト値つきで開始":"この条件で開始"}</button></div>
    <details class="adv recordDetails${sheet?" launchSheetMore":""}" ${mode==="calibration"?"open":""}>
      <summary>${sheet?"弓種・環境・詳細":"詳しく残す"}</summary>
      ${sheet?`${bowEnvHtml}
      <button class="btn sec" id="fQuadJpStart" type="button">四枚40cm（小中学生）で始める</button>
      <details class="adv quadRulesAdv">
        <summary>四枚40cmのルール（練習用メモ）</summary>
        <div class="note">畳1枚に A・B・C・D の4枚の的。前半30射のあと<strong>上下が入れ替わり</strong>ます（上A/B → 下へ、C/D → 上へ）。</div>
        <div class="note">射る的はチップで選びます。競技では間違った的は0点 — アプリは練習記録用です。</div>
      </details>
      <button class="tinyAction launchSheetGear" id="jumpGear" type="button">用具を開く</button>`:""}
      <div class="fieldBand">
        <div><label class="f">用具セッティング</label><select class="inp" id="fSetup">${setupOptions(defSetup)}</select></div>
        ${recordSetupSnapshot(defSetup,defDist)}
      </div>
      <label class="f">日付</label><input class="inp" type="date" id="fDate" value="${today()}">
      <label class="f">ラウンド</label><select class="inp" id="fRound">
        ${ROUND_TYPES.map(r=>`<option value="${r.id}" ${(mode==="volume"&&r.id==="volume")?"selected":""}>${r.label}</option>`).join("")}
      </select>
      <div id="fFocusWrap" style="display:${mode==="practice"?"block":"none"}">
        <label class="f">意識ポイント（最大3つ・任意）</label>
        <input class="inp" id="fFocusPoints" placeholder="例: アンカー, 押し手, リリース" value="">
      </div>
      <div id="fIndoorJpWrap" style="display:none">
        <label class="f">自分の列（日本インドア）</label>
        <div class="chips" id="fLaneSpot">${["A","B","C","D"].map(id=>`<div class="chip ${id==="A"?"on":""}" data-lane="${id}">${id}</div>`).join("")}</div>
      </div>
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
  const suggestFace=d=>{
    if(String(faceSel.value).startsWith("F")) return;
    const bow=$("#fBow").value||"recurve";
    faceSel.value=bow==="compound"&&d===50?"48":(d>=60?122:(d<=18?40:80));
  };
  $("#fBow").onchange=()=>{ if(distState.d) suggestFace(distState.d); updateQuickStartMeta(); };
  function updateQuickStartMeta(){
    const meta=$("#quickStartMeta");
    if(meta && distState.d) meta.textContent=`${distState.d}m / ${actionFaceLabel(faceSel.value)}`;
  }
  faceSel.onchange=()=>{
    if(String(faceSel.value).startsWith("F") && $("#fArrows").value==="6") $("#fArrows").value="3";
    updateFieldCourseWrap();
    updateQuickStartMeta();
  };
  function updateFieldCourseWrap(){
    const wrap=$("#fFieldCourseWrap"), round=$("#fRound").value, isField=String(faceSel.value).startsWith("F")||isFieldRoundId(round);
    if(wrap) wrap.style.display=isField?"block":"none";
    const sel=$("#fFieldCourse");
    if(sel&&isField){
      if(round==="field12") sel.value="wa_sample12";
      else if(isFieldRoundId(round)) sel.value="flat24_marked";
    }
  }
  function applyRoundPreset(roundId){
    const r=roundMeta(roundId);
    const jpWrap=$("#fIndoorJpWrap");
    if(jpWrap) jpWrap.style.display=(roundId==="18m60_jp"||roundId==="18m60_jp_x2")?"block":"none";
    if(!r||roundId==="free") return;
    if(r.dist!=null){
      distState.d=r.dist;
      const known=[70,50,30,18].includes(+r.dist);
      document.querySelectorAll("#fDistChips .chip").forEach(x=>x.classList.toggle("on", String(x.dataset.d)===(known?String(r.dist):"custom")));
      $("#fDistCustomWrap").style.display=known?"none":"block";
      if(!known) $("#fDistCustom").value=r.dist;
    }
    if(r.perEnd!=null) $("#fArrows").value=String(r.perEnd);
    if(r.faceD!=null&&r.faceType){
      faceSel.value=r.faceType==="triple"?"T40":r.faceType==="quad"?"Q40":String(r.faceD);
    }
    if(roundId==="quad60_jp"){
      $("#fEnv").value="indoor";
      if($("#fBow").value!=="barebow") $("#fBow").value="barebow";
    }
    if(r.indoor) $("#fEnv").value="indoor";
    if(roundId==="50m72"&&$("#fBow").value!=="compound") $("#fBow").value="compound";
    if((roundId==="field12"||roundId==="field24"||roundId==="field72")&&faceSel){
      faceSel.value=roundId==="field12"?"F80":"F80";
      if($("#fArrows").value!=="3") $("#fArrows").value="3";
    }
    updateFieldCourseWrap();
    fillSight();
    refreshLens();
    updateQuickStartMeta();
  }
  $("#fRound").onchange=e=>applyRoundPreset(e.target.value);
  document.querySelectorAll("[data-round-preset]").forEach(btn=>{
    btn.onclick=()=>{
      const roundId=btn.dataset.roundPreset;
      if($("#fRound")){ $("#fRound").value=roundId; applyRoundPreset(roundId); }
    };
  });
  wireLaunchEnvPills(m);
  updateFieldCourseWrap();
  if(mode==="volume") applyRoundPreset("volume");
  document.querySelectorAll("#fLaneSpot .chip").forEach(c=>c.onclick=()=>{
    document.querySelectorAll("#fLaneSpot .chip").forEach(x=>x.classList.remove("on"));
    c.classList.add("on");
  });
  $("#jumpGear").onclick=()=>openToolSheet("gear");

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
  const quadStart=$("#fQuadJpStart");
  if(quadStart) quadStart.onclick=()=>launchQuadJpPreset({defSetup,onStart:ctx.onStart});
  $("#fStart").onclick=()=>{
    const d=distState.d;
    if(!d){ toast("距離を入力してください"); return; }
    const fv=faceSel.value;
    const face=parseFaceChoice(fv);
    const bowType=$("#fBow").value||db.settings.defaultBowType||"recurve";
    const environment=$("#fEnv").value||db.settings.defaultEnvironment||"outdoor";
    const roundId=$("#fRound").value||"free";
    const laneChip=document.querySelector("#fLaneSpot .chip.on");
    const mode=ui.recordMode||"practice";
    const purpose=mode==="volume"?"volume":(mode==="pair"?"pair":mode);
    const courseSel=$("#fFieldCourse");
    const fieldCourseId=courseSel&&courseSel.value&&face.faceType==="field"?courseSel.value:null;
    const launchOpts={
      dist:d, face, bowType, environment, roundId, laneChip, fieldCourseId,
      date:$("#fDate").value||today(),
      setupId:$("#fSetup").value||null,
      perEnd:+$("#fArrows").value,
      sightV:$("#fSightV").value.trim(), sightH:$("#fSightH").value.trim(),
      wx:$("#fWx").value, note:$("#fNote").value.trim(),
      windDir:$("#fWindDir").value, windSpeed:$("#fWindSpeed").value.trim(),
      purpose,
      onStart:ctx.onStart
    };
    if(mode==="pair") launchOpts.pairMode=true;
    const needsCheckIn=mode==="practice"||mode==="volume"||mode==="pair";
    if(needsCheckIn){
      openCheckInModal({
        dist:d,
        faceLabel:actionFaceLabel(fv),
        roundLabel:roundLabel(roundId),
        focusPoints:collectFocusPointsFromInputs()
      }, pts=>{
        launchOpts.focusPoints=pts;
        launchActiveSession(launchOpts);
      });
    }else{
      launchOpts.focusPoints=collectFocusPointsFromInputs();
      launchActiveSession(launchOpts);
    }
  };
}
