"use strict";
/* Archery Note: history and sight-adjustment views */
function renderHistory(m){
  const allSs=[...db.sessions].sort((a,b)=>(b.date||"").localeCompare(a.date||"")||(b.id<a.id?-1:1));
  const hf=ui.histFilter||{setupId:"",dist:"",round:""};
  const dists=[...new Set(allSs.map(s=>s.dist).filter(Boolean))].sort((a,b)=>b-a);
  const rounds=[...new Set(allSs.map(s=>s.round||"free"))];
  const ss=allSs.filter(s=>
    (!hf.setupId || (hf.setupId==="__none"?!s.setupId:s.setupId===hf.setupId)) &&
    (!hf.dist || String(s.dist)===String(hf.dist)) &&
    (!hf.round || (s.round||"free")===hf.round)
  );
  m.innerHTML=`${pageHeroHtml("history",{ss})}${historyOverviewHtml(allSs,ss)}
  <div class="card"><h2>練習履歴 <span class="mini">${ss.length}/${allSs.length}回</span></h2>
    <div class="row">
      <div><label class="f">用具</label><select class="inp" id="histSetup"><option value="">すべて</option><option value="__none" ${hf.setupId==="__none"?"selected":""}>未指定</option>${db.setups.map(s=>`<option value="${s.id}" ${hf.setupId===s.id?"selected":""}>${esc(s.name)}</option>`).join("")}</select></div>
      <div><label class="f">距離</label><select class="inp" id="histDist"><option value="">すべて</option>${dists.map(d=>`<option value="${d}" ${String(hf.dist)===String(d)?"selected":""}>${d}m</option>`).join("")}</select></div>
    </div>
    <div class="row">
      <div><label class="f">ラウンド</label><select class="inp" id="histRound"><option value="">すべて</option>${rounds.map(r=>`<option value="${r}" ${hf.round===r?"selected":""}>${roundLabel(r)}</option>`).join("")}</select></div>
      <div style="display:flex;align-items:flex-end"><button class="btn ghost" id="histClear">絞り込み解除</button></div>
    </div>
    <div id="histList">
    ${ss.length? ss.map(s=>{
      const all=s.ends.flat(); const total=all.reduce((a,x)=>a+x.s,0);
      const setup=db.setups.find(x=>x.id===s.setupId);
      const q=sessionQuality(s,setup);
      return `<div class="listItem" data-id="${s.id}">
        <div><div class="t">${fmtD(s.date)} ・ ${s.dist}m</div>
        <div class="d"><span class="badge">${faceLabel(s)}</span>${setup?`<span class="badge">${esc(setup.name)}</span>`:""}<span class="badge">信頼 ${q.label}</span>${s.round&&s.round!=="free"?`<span class="badge">${roundLabel(s.round)}</span>`:""}${s.wx?`<span class="badge">${esc(s.wx)}</span>`:""}${all.length}本</div></div>
        <div class="big">${total}<small> / 平均${(total/all.length).toFixed(2)}</small></div></div>`;
    }).join(""):`<div class="empty">まだ記録がありません。「記録」タブから始めましょう。</div>`}
  </div></div>
  ${groupingTrendCard(ss)}${distTrendCard(ss)}${scoreDistCard(ss)}${monthlyCard(ss)}`;
  $("#histSetup").onchange=e=>{ ui.histFilter.setupId=e.target.value; render(); };
  $("#histDist").onchange=e=>{ ui.histFilter.dist=e.target.value; render(); };
  $("#histRound").onchange=e=>{ ui.histFilter.round=e.target.value; render(); };
  $("#histClear").onclick=()=>{ ui.histFilter={setupId:"",dist:"",round:""}; render(); };
  document.querySelectorAll("#histList .listItem").forEach(li=>li.onclick=()=>openHistDetail(li.dataset.id));
}
function sessionGroupPoint(s){
  const all=s.ends.flat();
  if(all.length<3) return null;
  const st=robustStats(all);
  if(!st || st.n<3) return null;
  const total=all.reduce((a,x)=>a+x.s,0);
  const setup=db.setups.find(x=>x.id===s.setupId);
  return {id:s.id,date:s.date||"",setupId:s.setupId||"none",setupName:setup?setup.name:"未指定",dist:s.dist,faceD:s.faceD,faceType:s.faceType||"single",
    mx:st.mx,my:st.my,rr:st.rr,sx:st.sx,sy:st.sy,major:st.major,minor:st.minor,n:st.n,total,avg:total/all.length};
}
function driftText(dx,dy){
  const parts=[];
  if(Math.abs(dx)>=.2) parts.push(dx>0?`右${Math.abs(dx).toFixed(1)}cm`:`左${Math.abs(dx).toFixed(1)}cm`);
  if(Math.abs(dy)>=.2) parts.push(dy>0?`上${Math.abs(dy).toFixed(1)}cm`:`下${Math.abs(dy).toFixed(1)}cm`);
  return parts.length?parts.join(" / "):"ほぼ変化なし";
}
function groupingTrendCard(ss){
  const by={};
  [...ss].reverse().forEach(s=>{
    const p=sessionGroupPoint(s);
    if(!p) return;
    const key=[p.setupId,p.dist,p.faceD,p.faceType].join("|");
    (by[key]=by[key]||[]).push(p);
  });
  const groups=Object.values(by).filter(g=>g.length>=2)
    .sort((a,b)=>(b[b.length-1].date||"").localeCompare(a[a.length-1].date||""))
    .slice(0,4);
  if(!groups.length) return "";
  return `<div class="card"><h2>グルーピング推移 <span class="mini">過去中心の分布と偏移</span></h2>`+
    groups.map(g=>groupingTrendItem(g)).join("")+
    `<div class="hint">丸は各練習のグルーピング中心、線は時系列、緑の楕円は過去中心の分布です。的の中心からどちらへ偏り続けているか、直近でどちらへ流れているかを見るための俯瞰です。</div></div>`;
}
function groupingTrendItem(g){
  const latest=g[g.length-1], first=g[0], prev=g[g.length-2];
  const centers=g.map(p=>({x:p.mx,y:p.my}));
  const cst=groupStats(centers);
  const w=ringW(latest.faceD,latest.faceType);
  const maxAbs=Math.max(w*2.6, ...g.map(p=>Math.max(Math.abs(p.mx)+p.rr*.25,Math.abs(p.my)+p.rr*.25)), Math.abs(cst.mx)+(cst.major||0)*1.6, Math.abs(cst.my)+(cst.major||0)*1.6, 4);
  const M=Math.min(latest.faceD/2*.9, maxAbs*1.25);
  const path=g.map((p,i)=>`${i?"L":"M"}${p.mx},${-p.my}`).join("");
  const avgRr=g.reduce((a,p)=>a+p.rr,0)/g.length;
  const recentDx=latest.mx-prev.mx, recentDy=latest.my-prev.my;
  const allDx=latest.mx-first.mx, allDy=latest.my-first.my;
  const bias=Math.hypot(latest.mx,latest.my);
  const biasState=bias<=w*.25?"センター付近":bias<=w*.75?"軽い偏り":"偏り強め";
  const setup=esc(latest.setupName);
  return `<div style="border-top:1px solid var(--line);padding:10px 0">
    <div style="display:flex;align-items:flex-start;gap:10px">
      <svg viewBox="${-M} ${-M} ${2*M} ${2*M}" style="width:128px;max-width:38%;aspect-ratio:1;border:1px solid var(--line);border-radius:8px;background:var(--inpBg);flex:0 0 auto">
        <circle cx="0" cy="0" r="${w/2}" fill="none" stroke="var(--sub)" stroke-width="${M/140}"/>
        <circle cx="0" cy="0" r="${w}" fill="none" stroke="var(--line)" stroke-width="${M/160}"/>
        <line x1="${-M}" y1="0" x2="${M}" y2="0" stroke="var(--line)" stroke-width="${M/150}"/>
        <line x1="0" y1="${-M}" x2="0" y2="${M}" stroke="var(--line)" stroke-width="${M/150}"/>
        ${cst&&cst.major!=null?`<ellipse cx="${cst.mx}" cy="${-cst.my}" rx="${Math.max(cst.major,.18)}" ry="${Math.max(cst.minor,.18)}" transform="rotate(${-cst.angleDeg} ${cst.mx} ${-cst.my})" fill="rgba(15,157,88,.10)" stroke="#0f9d58" stroke-width="${M/95}"/>`:""}
        <path d="${path}" fill="none" stroke="#1e6fd9" stroke-width="${M/75}" stroke-linecap="round" stroke-linejoin="round"/>
        ${g.map((p,i)=>{
          const r=i===g.length-1?M/18:M/25;
          const fill=i===g.length-1?"#0f9d58":"#1e6fd9";
          return `<circle cx="${p.mx}" cy="${-p.my}" r="${r}" fill="${fill}" opacity="${0.35+i/g.length*.55}" stroke="#fff" stroke-width="${M/120}"/>`;
        }).join("")}
      </svg>
      <div style="flex:1;min-width:0">
        <div class="t" style="font-weight:800">${setup} ・ ${latest.dist}m ・ ${faceLabel(latest)}</div>
        <div class="d">${g.length}回 / ${fmtD(first.date)}〜${fmtD(latest.date)} / 平均グルーピング半径 ${avgRr.toFixed(1)}cm</div>
        <div class="kv"><span>最新の中心</span><span>${cmOffsetText(latest.mx,"x")} / ${cmOffsetText(latest.my,"y")}（${biasState}）</span></div>
        <div class="kv"><span>前回から</span><span>${driftText(recentDx,recentDy)}</span></div>
        <div class="kv"><span>初回から</span><span>${driftText(allDx,allDy)}</span></div>
        <div class="kv"><span>過去中心の広がり</span><span>${cst.rr.toFixed(1)}cm${cst.major!=null?` / 長軸${cst.major.toFixed(1)}cm`:""}</span></div>
      </div>
    </div>
  </div>`;
}
function scoreDistCard(ss){
  const records=(ss||db.sessions).flatMap(s=>s.ends.flat().map(a=>({a,faceType:s.faceType||"single"})));
  const all=records.map(x=>x.a);
  if(all.length<12) return "";
  const fieldOnly=records.length && records.every(x=>(x.faceType||"single")==="field");
  const keys=fieldOnly?["6","5","4","3","2","1","M"]:["X","10","9","8","7","6","5","4","3","2","1","M"];
  const cnt={}; keys.forEach(k=>cnt[k]=0);
  records.forEach(({a})=>{ cnt[a.s===0?"M":(a.X?"X":String(a.s))]++; });
  const max=Math.max(...keys.map(k=>cnt[k]))||1;
  return `<div class="card"><h2>得点分布 <span class="mini">全${all.length}本</span></h2>`+
    keys.filter(k=>cnt[k]>0 || (!fieldOnly && ["X","10","9","8","7"].includes(k))).map(k=>{
      const sNum=k==="X"?10:(k==="M"?0:+k);
      const rec=records.find(x=>(x.a.s===0?"M":(x.a.X?"X":String(x.a.s)))===k);
      const z=zoneStyle(sNum,k==="X",rec&&rec.faceType);
      return `<div style="display:flex;align-items:center;gap:8px;padding:2px 0">
        <div style="width:28px;text-align:center;font-weight:700;font-size:12px;background:${z.bg};color:${z.fg};border-radius:6px;padding:2px 0">${k}</div>
        <div style="flex:1;background:var(--line);border-radius:5px;height:14px;overflow:hidden"><div style="width:${(cnt[k]/max*100).toFixed(1)}%;height:100%;background:var(--green-l)"></div></div>
        <div style="width:70px;font-size:11px;color:var(--sub);text-align:right">${cnt[k]}本 (${(cnt[k]/all.length*100).toFixed(0)}%)</div>
      </div>`;
    }).join("")+`</div>`;
}
function monthlyCard(ss){
  const src=ss||db.sessions;
  if(!src.length) return "";
  const m={};
  src.forEach(s=>{
    const k=(s.date||"").slice(0,7); if(!k) return;
    const all=s.ends.flat();
    m[k]=m[k]||{c:0,n:0,sum:0};
    m[k].c++; m[k].n+=all.length; m[k].sum+=all.reduce((a,x)=>a+x.s,0);
  });
  const keys=Object.keys(m).sort().reverse().slice(0,6);
  if(!keys.length) return "";
  return `<div class="card"><h2>月間サマリー</h2><table class="tbl"><tr><th>月</th><th class="right">練習</th><th class="right">本数</th><th class="right">平均/本</th></tr>`+
    keys.map(k=>`<tr><td>${k.replace("-","/")}</td><td class="right">${m[k].c}回</td><td class="right">${m[k].n}本</td><td class="right"><b>${m[k].n?(m[k].sum/m[k].n).toFixed(2):"-"}</b></td></tr>`).join("")+
    `</table></div>`;
}
function distTrendCard(ss){
  // 距離別 平均点推移（簡易スパークライン）
  const byDist={};
  [...ss].reverse().forEach(s=>{
    const all=s.ends.flat(); if(!all.length)return;
    (byDist[s.dist]=byDist[s.dist]||[]).push(all.reduce((a,x)=>a+x.s,0)/all.length);
  });
  const dists=Object.keys(byDist).filter(d=>byDist[d].length>=2).sort((a,b)=>b-a);
  if(!dists.length) return "";
  return `<div class="card"><h2>距離別 平均点の推移</h2>`+dists.map(d=>{
    const pts=byDist[d]; const W=300,H=46;
    const min=Math.min(...pts), max=Math.max(...pts), span=(max-min)||1;
    const path=pts.map((v,i)=>`${i?"L":"M"}${(i/(pts.length-1))*W},${H-4-((v-min)/span)*(H-10)}`).join("");
    return `<div style="display:flex;align-items:center;gap:10px;padding:6px 0">
      <div style="width:52px;font-weight:700">${d}m</div>
      <svg width="100%" viewBox="0 0 ${W} ${H}" style="flex:1;max-height:${H}px"><path d="${path}" fill="none" stroke="var(--green)" stroke-width="2.5"/>
      ${pts.map((v,i)=>`<circle cx="${(i/(pts.length-1))*W}" cy="${H-4-((v-min)/span)*(H-10)}" r="3" fill="var(--green)"/>`).join("")}</svg>
      <div style="width:54px;text-align:right;font-size:12px">${pts[pts.length-1].toFixed(2)}<br><span style="color:var(--sub);font-size:10px">最新平均</span></div>
    </div>`;
  }).join("")+`</div>`;
}
function openHistDetail(id){
  const sess=db.sessions.find(s=>s.id===id); if(!sess)return;
  const ovl=document.createElement("div"); ovl.className="ovl";
  const all=sess.ends.flat(); const total=all.reduce((a,x)=>a+x.s,0);
  const setup=db.setups.find(x=>x.id===sess.setupId);
  const st=robustStats(all);
  const adv=adviceFor(sess,setup);
  ovl.innerHTML=`<div class="sheet">
    <h3>${fmtD(sess.date)} ・ ${sess.dist}m ・ ${faceLabel(sess)}</h3>
    <div style="font-size:12px;color:var(--sub)">${setup?esc(setup.name):"セッティング未指定"}${sess.round&&sess.round!=="free"?" ・ "+roundLabel(sess.round):""}${windText(sess)?" ・ "+esc(windText(sess)):""}${sess.note?" ・ "+esc(sess.note):""}</div>
    <div class="statbar">
      <div class="stat"><b>${total}</b><span>合計 (${all.length}本)</span></div>
      <div class="stat"><b>${(total/all.length).toFixed(2)}</b><span>平均/本</span></div>
      <div class="stat"><b>${perfectScoreCount(all,sess)}</b><span>${perfectScoreLabel(sess)}</span></div>
      <div class="stat"><b>${secondaryScoreCount(all,sess)}</b><span>${secondaryScoreLabel(sess)}</span></div>
    </div>
    <div id="hPlot" style="margin-top:10px"></div>
    ${groupSummaryHtml(st)}
    ${trustHtml(sess,setup,st)}
    ${roundProgressHtml(sess)}
    ${(sess.sightV||sess.sightH)?`<div class="kv"><span>使用サイト</span><span>上下 ${esc(sess.sightV||"—")} / 左右 ${esc(sess.sightH||"—")}</span></div>`:""}
    ${arrowMetaSummaryHtml(sess)}
    <table class="tbl" style="margin-top:8px"><tr><th>エンド</th><th>得点</th><th class="right">計</th></tr>
    ${sess.ends.map((end,i)=>{
      const sorted=[...end].sort((a,b)=>b.s-a.s);
      return `<tr><td><span class="histChip" style="background:${ENDCOLORS[i%ENDCOLORS.length]}"></span>${i+1}</td><td>${sorted.map(scoreLabel).join("・")}</td><td class="right"><b>${end.reduce((a,x)=>a+x.s,0)}</b></td></tr>`;
    }).join("")}</table>
    ${adv?`<div class="advice"><div style="font-size:12px;color:var(--sub)">🔧 この回からのサイト調整提案</div>${adv.lines.map(l=>`<div class="dir">${l.html}</div>`).join("")}${judgementHtml(adv,sess)}${shapeNote(adv.st)}${adv.notes.slice(0,3).map(n=>`<div class="note">・${n}</div>`).join("")}</div>`:""}
    ${personalModelHtml(adv,sess,setup)}
    ${conditionHtml(sess,st,setup)}
    ${nextActionHtml(sess,adv,setup)}
    <div class="btnrow">
      <button class="btn danger" id="hDel">削除</button>
      <button class="btn sec" id="hEdit">✏ 編集</button>
    </div>
    <div class="btnrow">
      <button class="btn sec" id="hCard">画像保存</button>
      <button class="btn ghost" id="hClose">閉じる</button>
    </div>
  </div>`;
  document.body.appendChild(ovl);
  plotSession(sess, ovl.querySelector("#hPlot"));
  ovl.querySelector("#hClose").onclick=()=>ovl.remove();
  ovl.querySelector("#hEdit").onclick=()=>{
    if(db.active){ toast("記録中のセッションがあります。先に終了してください"); return; }
    const cp=JSON.parse(JSON.stringify(sess));
    cp.cur=[]; cp._edit=true;
    db.active=cp; save(); ovl.remove(); showView("record");
    toast("過去の記録を編集中。「セッション終了」で上書き保存されます");
  };
  ovl.querySelector("#hCard").onclick=()=>exportScorecardImage(sess);
  ovl.querySelector("#hDel").onclick=()=>{
    if(confirm("この練習記録を削除しますか？")){
      trashItem("session",`${fmtD(sess.date)} ${sess.dist}m`,sess);
      db.sessions=db.sessions.filter(s=>s.id!==id); save({reason:"delete-session",forceSnapshot:true}); ovl.remove(); render(); toast("削除しました。設定から復元できます");
    }
  };
}

/* ---------- サイト ---------- */
function renderSight(m){
  if(!ui.sightSel.setupId && db.setups[0]) ui.sightSel.setupId=db.setups[0].id;
  const sid=ui.sightSel.setupId;
  const setup=db.setups.find(x=>x.id===sid);
  // 距離候補: 台帳・セッションにある距離 + 定番
  const dset=new Set([70,50,30,18]);
  db.sightMarks.filter(x=>x.setupId===sid).forEach(x=>dset.add(x.dist));
  db.sessions.filter(x=>x.setupId===sid).forEach(x=>dset.add(x.dist));
  const dists=[...dset].sort((a,b)=>b-a);
  if(!dists.includes(ui.sightSel.dist)) ui.sightSel.dist=dists[0];
  const dist=ui.sightSel.dist;
  const marks=db.sightMarks.filter(x=>x.setupId===sid && x.dist===dist).sort((a,b)=>(b.date||"").localeCompare(a.date||"")||(b.ts||0)-(a.ts||0));
  const cur=marks[0];
  // 最新セッション（同setup×距離）
  const lastSess=[...db.sessions].reverse().find(s=>s.setupId===sid && s.dist===dist);
  const adv=lastSess?adviceFor(lastSess, setup):null;
  const reg=sid?regressionAdvice(sid,dist):{};
  const interp=sid?sightInterp(sid):null;
  const cal=sid?calibrationProfile(sid):null;
  let interpHtml="";
  if(interp){
    const preds=[18,30,50,70].filter(d=>!interp.have.includes(d)).map(d=>`<div class="chip">${d}m → <b>${interp.est(d).toFixed(1)}</b></div>`);
    interpHtml=`<h2 style="margin-top:14px">📏 サイトマーク予測（上下）</h2>
      <div style="font-size:12px;color:var(--sub)">実測: ${interp.pts.map(p=>`${p[0]}m = ${p[1]}`).join(" ・ ")} / ${interp.model==="curve"?"カーブ近似":"直線近似"} / 一致度${pct(interp.r2||0)}</div>
      ${preds.length?`<div class="chips" style="margin-top:8px">${preds.join("")}</div>`:`<div class="hint">定番距離（18/30/50/70m）はすべて実測済みです</div>`}
      <div class="hint">2距離以上の実測サイト値から予測します。4距離以上ある場合は、弾道に近いカーブ近似が有効なときだけ自動採用します。左右は距離の影響がほぼないため上下のみ予測します。</div>`;
  }
  m.innerHTML=`${pageHeroHtml("sight",{setup,dist,marks,adv,lastSess})}
  <div class="card">
    <h2>サイト台帳</h2>
    ${db.setups.length?`
    <label class="f">セッティング</label><select class="inp" id="sgSetup">${db.setups.map(s=>`<option value="${s.id}" ${s.id===sid?"selected":""}>${esc(s.name)}</option>`).join("")}</select>
    <label class="f">距離</label>
    <div class="chips">${dists.map(d=>`<div class="chip ${d===dist?"on":""}" data-d="${d}">${d}m</div>`).join("")}</div>
    <div class="advice" style="background:var(--card);border-color:var(--line)">
      <div class="kv"><span>現在のサイト（最新記録）</span>
      <span style="font-size:17px;font-weight:800">${cur?`上下 ${esc(cur.v||"—")} ・ 左右 ${esc(cur.h||"—")}`:"未登録"}</span></div>
      ${cur?`<div class="note">${fmtD(cur.date)} ${esc(cur.note||"")}</div>`:""}
    </div>
    <div class="btnrow"><button class="btn sec sm" id="sgAdd">＋ サイト値を手動で記録</button><button class="btn sec sm" id="sgCalMode">校正モード</button></div>
    ${marks.length?`<table class="tbl" style="margin-top:10px"><tr><th>日付</th><th>上下</th><th>左右</th><th>メモ</th><th></th></tr>
      ${marks.map(mk=>`<tr><td>${fmtD(mk.date)}</td><td><b>${esc(mk.v||"—")}</b></td><td><b>${esc(mk.h||"—")}</b></td>
      <td style="font-size:11px;color:var(--sub)">${esc(mk.note||"")}</td>
      <td class="right"><button class="btn sm ghost" data-del="${mk.id}" style="padding:4px 8px">✕</button></td></tr>`).join("")}</table>`
      :`<div class="empty">この距離の記録はまだありません</div>`}
    <details class="adv">
      <summary>モデル診断・校正状況</summary>
      ${cal?`<div class="advice" style="background:var(--card);border-color:var(--line);margin-top:10px">
        <div class="kv"><span>個人補正データ</span><span><b>${cal.level}</b>（${Math.round(cal.score*100)}%）</span></div>
        <div class="note">実測サイト距離 ${cal.dists}距離 / サイト値つき練習 ${cal.withSight}回 / 用具入力 ${cal.gearLevel}</div>
        ${cal.next.length?`<div class="note">次に精度へ効く項目: ${esc(cal.next.slice(0,3).join("・"))}</div>`:`<div class="note">個人補正に必要な主要データはかなり揃っています。</div>`}
      </div>`:""}
      ${modelReadinessHtml(sid)}
      ${physicsCalibrationHtml(sid)}
    </details>
    `:`<div class="empty">先に「用具」タブでセッティングを登録してください。<br>サイト台帳はセッティングごとに管理されます。</div>`}
  </div>
  ${setup?`
  <div class="card">
    <h2>🔧 調整アドバイス <span class="mini">${dist}m ・ ${esc(setup.name)}</span></h2>
    ${adv?`
      <div style="font-size:12px;color:var(--sub)">最新の練習（${fmtD(lastSess.date)}・${adv.st.n}本${adv.st.excluded.length?`、外れ値${adv.st.excluded.length}本除外`:""}）の着弾傾向：</div>
      <div class="advice">${adv.lines.map(l=>`<div class="dir">${l.html}</div>`).join("")}
      ${judgementHtml(adv,lastSess)}
      ${shapeNote(adv.st)}
      ${adv.notes.map(n=>`<div class="note">・${n}</div>`).join("")}
      <div class="note">原則：<b>矢の集まった方向へサイトを動かす</b>。グルーピング中心 ${cmOffsetText(adv.st.mx,"x")} / ${cmOffsetText(adv.st.my,"y")}（半径 ${adv.st.rr.toFixed(1)}cm）</div></div>`
      :`<div class="empty">この距離の練習記録がまだないため、着弾傾向からの提案はできません。</div>`}
    <details class="adv" ${adv?"":"open"}>
      <summary>判断の根拠</summary>
      ${adv?trustHtml(lastSess,setup,adv.st):""}
      ${adv?personalModelHtml(adv,lastSess,setup):""}
      ${adv?conditionHtml(lastSess,adv.st,setup):""}
      ${adv?nextActionHtml(lastSess,adv,setup):""}
    </details>
    <details class="adv">
      <summary>サイト値分析・予測</summary>
      ${(reg.v||reg.h)?`<div class="advice" style="margin-top:10px">
        <div style="font-size:12px;color:var(--sub)">📐 過去データの相関分析（サイト値 × 着弾ズレ の回帰）</div>
        ${reg.v?`<div class="dir">上下サイトの推定最適値：<b>${reg.v.zero.toFixed(1)}</b> <span style="font-size:11px;color:var(--sub)">(${reg.v.n}回分 / 一致度${pct(reg.v.r2||0)} / 品質${pct(reg.v.quality||0)})</span></div>`:""}
        ${reg.h?`<div class="dir">左右サイトの推定最適値：<b>${reg.h.zero.toFixed(1)}</b> <span style="font-size:11px;color:var(--sub)">(${reg.h.n}回分 / 一致度${pct(reg.h.r2||0)} / 品質${pct(reg.h.quality||0)})</span></div>`:""}
        <div class="note">サイト値を数値で記録した複数回の練習から「ズレが0になる値」を、練習信頼度・風・本数を加味した外れ値に強い推定で求めています。データが増えるほど精度が上がります。</div>
      </div>`:`<div class="hint">💡 練習開始時にサイト値を<b>数値で</b>入力して回数を重ねると、ここに「サイト値と着弾ズレの相関」から推定した最適サイト値が表示されます。</div>`}
      ${interpHtml}
    </details>
    <details class="adv">
      <summary>クリック換算の設定（任意）</summary>
      <div class="row">
        <div><label class="f">上下 1クリック=cm @70m</label><input class="inp" id="sgCalV" inputmode="decimal" value="${setup.calibV70||""}" placeholder="例: 4"></div>
        <div><label class="f">左右 1クリック=cm @70m</label><input class="inp" id="sgCalH" inputmode="decimal" value="${setup.calibH70||""}" placeholder="例: 4"></div>
      </div>
      <div class="hint">「サイトを1クリック動かすと70mで着弾が何cm動くか」。一度測って登録すると提案がクリック数でも出ます（他の距離へは自動換算）。アイ〜サイト距離は右上の⚙設定から。</div>
    </details>
  </div>`:""}`;
  const sgSetup=$("#sgSetup");
  if(sgSetup) sgSetup.onchange=e=>{ ui.sightSel.setupId=e.target.value; render(); };
  document.querySelectorAll(".chips .chip[data-d]").forEach(c=>c.onclick=()=>{ ui.sightSel.dist=+c.dataset.d; render(); });
  const add=$("#sgAdd");
  if(add) add.onclick=()=>openMarkForm(sid,dist);
  const calMode=$("#sgCalMode");
  if(calMode) calMode.onclick=()=>openCalibrationWizard(sid);
  document.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>{
    const mk=db.sightMarks.find(x=>x.id===b.dataset.del);
    if(confirm("この記録を削除しますか？")){ if(mk) trashItem("sightMark",`${mk.dist}m サイト値`,mk); db.sightMarks=db.sightMarks.filter(x=>x.id!==b.dataset.del); save({reason:"delete-sight-mark",forceSnapshot:true}); render(); toast("削除しました。設定から復元できます"); }
  });
  const cv=$("#sgCalV"), ch=$("#sgCalH");
  if(cv) cv.onchange=e=>{ setup.calibV70=parseFloat(e.target.value)||null; save(); render(); };
  if(ch) ch.onchange=e=>{ setup.calibH70=parseFloat(e.target.value)||null; save(); render(); };
}
function openMarkForm(setupId,dist){
  const ovl=document.createElement("div"); ovl.className="ovl";
  ovl.innerHTML=`<div class="sheet"><h3>サイト値を記録（${dist}m）</h3>
    <label class="f">日付</label><input class="inp" type="date" id="mkDate" value="${today()}">
    <div class="row">
      <div><label class="f">上下</label><input class="inp" id="mkV" inputmode="decimal"></div>
      <div><label class="f">左右</label><input class="inp" id="mkH" inputmode="decimal"></div>
    </div>
    <label class="f">メモ</label><input class="inp" id="mkNote" placeholder="例: 無風・ベスト調整">
    <div class="btnrow"><button class="btn ghost" id="mkCancel">キャンセル</button><button class="btn" id="mkSave">保存</button></div>
  </div>`;
  document.body.appendChild(ovl);
  ovl.querySelector("#mkCancel").onclick=()=>ovl.remove();
  ovl.querySelector("#mkSave").onclick=()=>{
    db.sightMarks.push({id:uid(), setupId, dist, v:ovl.querySelector("#mkV").value.trim(), h:ovl.querySelector("#mkH").value.trim(),
      date:ovl.querySelector("#mkDate").value||today(), ts:Date.now(), note:ovl.querySelector("#mkNote").value.trim()});
    save(); ovl.remove(); render(); toast("台帳に記録しました");
  };
}
function openCalibrationWizard(setupId){
  const setup=db.setups.find(s=>s.id===setupId);
  if(!setup){ toast("セッティングを選んでください"); return; }
  const dists=[70,50,30,18];
  const ovl=document.createElement("div"); ovl.className="ovl";
  ovl.innerHTML=`<div class="sheet"><h3>校正モード — ${esc(setup.name)}</h3>
    <div class="hint">実測できている距離だけ入力してください。複数距離が揃うほど、距離別サイト予測と個人補正が強くなります。</div>
    <label class="f">日付</label><input class="inp" type="date" id="calDate" value="${today()}">
    ${dists.map(d=>{
      const mk=latestMark(setupId,d)||{};
      return `<div class="row">
        <div><label class="f">${d}m 上下</label><input class="inp" id="calV_${d}" inputmode="decimal" value="${esc(mk.v||"")}"></div>
        <div><label class="f">${d}m 左右</label><input class="inp" id="calH_${d}" inputmode="decimal" value="${esc(mk.h||"")}"></div>
      </div>`;
    }).join("")}
    <label class="f">メモ</label><input class="inp" id="calNote" placeholder="例: 校正日 / 無風 / ベスト確認">
    <div class="btnrow"><button class="btn ghost" id="calCancel">キャンセル</button><button class="btn" id="calSave">校正値を保存</button></div>
  </div>`;
  document.body.appendChild(ovl);
  ovl.querySelector("#calCancel").onclick=()=>ovl.remove();
  ovl.querySelector("#calSave").onclick=()=>{
    const date=ovl.querySelector("#calDate").value||today();
    const note=ovl.querySelector("#calNote").value.trim()||"校正モード";
    let n=0;
    dists.forEach(d=>{
      const v=ovl.querySelector(`#calV_${d}`).value.trim(), h=ovl.querySelector(`#calH_${d}`).value.trim();
      if(v||h){ db.sightMarks.push({id:uid(),setupId,dist:d,v,h,date,ts:Date.now(),note}); n++; }
    });
    if(!n){ toast("1つ以上入力してください"); return; }
    save({reason:"calibration",forceSnapshot:true}); ovl.remove(); render(); toast(`${n}距離の校正値を保存しました`);
  };
}

/* ---------- 用具 ---------- */
