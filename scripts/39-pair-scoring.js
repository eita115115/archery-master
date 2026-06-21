"use strict";
/* 的ノート: practice pair scoring (RESEARCH §28.2 — not official marker replacement) */

const PAIR_DISCLAIMER = "練習用の相互確認モードです。公式大会のマーカー・審判の代替にはなりません。";

function ensurePairState(sess) {
  if (!sess) return null;
  if (!sess.pairEnd) sess.pairEnd = { shooter: [], marker: [] };
  if (!sess.pairNames) sess.pairNames = { shooter: "射手", marker: "マーカー" };
  if (!sess.pairActiveCol) sess.pairActiveCol = "marker";
  return sess;
}

function pairArrowLabel(a) {
  if (!a) return "·";
  return typeof scoreLabel === "function" ? scoreLabel(a) : String(a.s != null ? a.s : "·");
}

function comparePairArrows(shooter, marker) {
  const n = Math.max((shooter || []).length, (marker || []).length);
  const rows = [];
  let matches = 0;
  for (let i = 0; i < n; i += 1) {
    const sa = shooter && shooter[i];
    const ma = marker && marker[i];
    const ss = sa ? sa.s : null;
    const ms = ma ? ma.s : null;
    const sx = !!(sa && sa.X);
    const mx = !!(ma && ma.X);
    const ok = ss != null && ms != null && ss === ms && sx === mx;
    if (ok) matches += 1;
    rows.push({ i: i + 1, shooter: pairArrowLabel(sa), marker: pairArrowLabel(ma), ok, ss, ms });
  }
  return { rows, matches, total: n, aligned: matches === n && n > 0 };
}

function pairCompareHtml(shooter, marker) {
  const cmp = comparePairArrows(shooter, marker);
  if (!cmp.total) {
    return `<div class="pairCompare empty">両方の入力がそろうと照合できます。</div>`;
  }
  const rows = cmp.rows.map((r) => `<tr class="${r.ok ? "ok" : "diff"}">
    <td>${r.i}</td><td>${esc(r.shooter)}</td><td>${esc(r.marker)}</td>
    <td>${r.ok ? "一致" : "差分"}</td></tr>`).join("");
  return `<div class="pairCompare ${cmp.aligned ? "aligned" : "pending"}">
    <div class="pairCompareHead"><b>エンド照合</b><span>${cmp.matches}/${cmp.total} 一致${cmp.aligned ? " · 確認OK" : ""}</span></div>
    <table class="pairTbl"><tr><th>#</th><th>射手</th><th>マーカー</th><th></th></tr>${rows}</table>
    ${!cmp.aligned ? `<div class="pairHint">差分がある場合は審判確認が必要です（本モードは練習用）。</div>` : ""}
  </div>`;
}

function pairScoreGridHtml(s, col) {
  const st = ensurePairState(s);
  const per = s.perEnd || 6;
  const arrows = col === "shooter" ? st.pairEnd.shooter : st.pairEnd.marker;
  const active = st.pairActiveCol === col;
  const cells = Array.from({ length: per }, (_, ci) => {
    const a = arrows[ci];
    const sel = active && ui.pairCell === ci;
    if (!a) return `<div class="gridCell empty ${sel ? "sel" : ""}" data-pair-col="${col}" data-i="${ci}">·</div>`;
    const label = pairArrowLabel(a);
    const z = typeof gridZoneStyle === "function" ? gridZoneStyle(label) : { bg: "var(--soft)", fg: "var(--ink)" };
    return `<div class="gridCell ${sel ? "sel" : ""}" data-pair-col="${col}" data-i="${ci}" style="background:${z.bg};color:${z.fg}">${label}</div>`;
  }).join("");
  const sum = arrows.reduce((a, x) => a + (x && x.s ? x.s : 0), 0);
  const title = col === "shooter" ? esc(st.pairNames.shooter || "射手") : esc(st.pairNames.marker || "マーカー");
  return `<div class="pairCol ${active ? "on" : ""}" data-pair-col-wrap="${col}">
    <div class="pairColHead"><b>${title}</b><span>${sum || "—"}点</span></div>
    <div class="gridCells pairCells">${cells}</div>
  </div>`;
}

function pairScoringPanelHtml(s) {
  ensurePairState(s);
  return `<section class="pairPanel card" id="pairPanel">
    <div class="pairDisclaimer"><b>ペア採点（練習）</b><span>${PAIR_DISCLAIMER}</span></div>
    <div class="row pairNames">
      <div><label class="f">射手名</label><input class="inp" id="pairShooterName" value="${esc(s.pairNames.shooter || "")}" placeholder="例: 山田"></div>
      <div><label class="f">マーカー名</label><input class="inp" id="pairMarkerName" value="${esc(s.pairNames.marker || "")}" placeholder="例: 佐藤"></div>
    </div>
    <div class="pairColTabs">
      <button type="button" class="chip ${s.pairActiveCol === "shooter" ? "on" : ""}" data-pair-tab="shooter">射手入力</button>
      <button type="button" class="chip ${s.pairActiveCol === "marker" ? "on" : ""}" data-pair-tab="marker">マーカー入力</button>
    </div>
    <div class="pairGrids">${pairScoreGridHtml(s, "shooter")}${pairScoreGridHtml(s, "marker")}</div>
    <div id="pairCompareMount">${pairCompareHtml(s.pairEnd.shooter, s.pairEnd.marker)}</div>
  </section>`;
}

function bindPairScoring(s, root) {
  ensurePairState(s);
  if (!root) root = document;
  const panel = root.querySelector("#pairPanel");
  if (!panel) return;
  const shooterIn = panel.querySelector("#pairShooterName");
  const markerIn = panel.querySelector("#pairMarkerName");
  if (shooterIn) shooterIn.oninput = (e) => { s.pairNames.shooter = e.target.value.trim() || "射手"; save("pair-names"); };
  if (markerIn) markerIn.oninput = (e) => { s.pairNames.marker = e.target.value.trim() || "マーカー"; save("pair-names"); };
  panel.querySelectorAll("[data-pair-tab]").forEach((btn) => btn.onclick = () => {
    s.pairActiveCol = btn.dataset.pairTab;
    ui.pairCell = -1;
    refreshActive();
  });
  panel.querySelectorAll(".gridCell[data-pair-col]").forEach((cell) => cell.onclick = () => {
    s.pairActiveCol = cell.dataset.pairCol;
    ui.pairCell = +cell.dataset.i;
    refreshActive();
  });
  const keys = root.querySelector("#gridKeys");
  if (keys) keys.querySelectorAll("button").forEach((btn) => btn.onclick = () => {
    const col = s.pairActiveCol || "marker";
    const arr = s.pairEnd[col];
    const value = btn.dataset.v;
    if (ui.pairCell >= 0 && arr[ui.pairCell]) {
      Object.assign(arr[ui.pairCell], arrowFromGridValue(value));
      nativePulse("light"); save("pair-edit"); refreshActive();
      return;
    }
    if (arr.length >= (s.perEnd || 6)) { toast("この列はエンド本数に達しています"); return; }
    arr.push(arrowFromGridValue(value));
    ui.pairCell = arr.length - 1;
    nativePulse("light"); save("pair-add"); refreshActive();
  });
}

function commitPairEnd(s) {
  ensurePairState(s);
  const cmp = comparePairArrows(s.pairEnd.shooter, s.pairEnd.marker);
  if (!s.pairEnd.marker.length) { toast("マーカー記入を入力してください"); return false; }
  if (!cmp.aligned) {
    if (!confirm("射手とマーカーの記入が一致しません。マーカー記入を採用してエンド確定しますか？")) return false;
  }
  s.cur = s.pairEnd.marker.map((a) => Object.assign({}, a));
  s.pairEnd = { shooter: [], marker: [] };
  ui.pairCell = -1;
  return true;
}

if (typeof window !== "undefined") {
  window.ArcherPair = {
    PAIR_DISCLAIMER,
    ensurePairState,
    comparePairArrows,
    pairCompareHtml,
    pairScoringPanelHtml,
    bindPairScoring,
    commitPairEnd,
  };
}