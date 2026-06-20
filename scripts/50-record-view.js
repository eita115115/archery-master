"use strict";
/* 的ノート: active session, summary, shot meta */
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
  stopAllInputModes();
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
        <button class="modeBtn ${ui.inputMode==="ocr"?"on":""}" data-mode="ocr" type="button">OCR</button>
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
    <div class="ocrPanel ${ui.inputMode==="ocr"?"on":""}" id="ocrPanel">
      <input type="file" id="ocrCapture" accept="image/*" capture="environment" hidden>
      <div class="scanStatus" id="ocrStatus">紙のスコア表を撮影すると OCR で読み取ります</div>
      <div class="scanActions" id="ocrActions"></div>
      <img class="ocrPreview" id="ocrPreview" hidden alt="">
    </div>
    <div class="targetHint" id="targetHint">${ui.inputMode==="grid"?"ボタンで次のセルに入力。セルタップで修正。":ui.inputMode==="ocr"?"紙シートを撮影して一括取り込み。取り込み後はグリッドで修正。":ui.inputMode==="live"?"カメラで的を映すと自動検出。取り込み後はタップで微調整。":ui.inputMode==="video"?"動画のフレームを解析して一括取り込み。タップは微調整用。":"タップで記録。矢チップで修正。"}</div>
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
  bindActiveInputMode(s);
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
    ${typeof nextShotBriefHtml==="function"?nextShotBriefHtml(sess,adv,setup):""}
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
