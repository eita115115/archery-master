"use strict";
/* 的ノート: team set match practice UI (RESEARCH §40 — not official tournament flow) */

const TEAM_DISCLAIMER = "練習用の団体セット模擬です。公式大会の進行・審判の代替にはなりません。";

function ensureTeamState(sess) {
  if (!sess) return null;
  if (typeof ensureMatchMeta === "function") {
    const meta = ensureMatchMeta(sess);
    meta.team = true;
  } else if (sess.matchMeta) {
    sess.matchMeta.team = true;
  }
  if (!sess.teamArchers) {
    sess.teamArchers = { names: ["1番手", "2番手", "3番手"] };
  }
  return sess;
}

function teamArcherIndexForArrow(arrowIndex) {
  return [0, 1, 2, 0, 1, 2][arrowIndex % 6];
}

function teamArcherSlotLabel(index) {
  return index === 0 ? "1・4本目" : index === 1 ? "2・5本目" : "3・6本目";
}

function teamEndBreakdownHtml(end, names) {
  const by = [0, 0, 0];
  const counts = [0, 0, 0];
  (end || []).forEach((a, i) => {
    const idx = a.archer != null ? a.archer : teamArcherIndexForArrow(i);
    by[idx] += a.s || 0;
    counts[idx] += 1;
  });
  return by.map((pts, i) => `<div class="teamArcherSum">
    <span>${esc(names[i] || `${i + 1}番手`)}</span><b>${pts}点</b><small>${counts[i]}本</small>
  </div>`).join("");
}

function teamSetHistoryHtml(sess) {
  const meta = (sess && sess.matchMeta) || { sets: [], selfSetPts: 0, oppSetPts: 0 };
  if (!meta.sets.length) {
    return `<div class="teamHistory empty">セット確定後に履歴が表示されます。</div>`;
  }
  const rows = meta.sets.map((set, i) => `<tr>
    <td>S${i + 1}</td><td>${set.self}</td><td>${set.opp}</td><td>${set.selfPt}-${set.oppPt}pt</td>
  </tr>`).join("");
  return `<table class="teamTbl"><tr><th>セット</th><th>自チーム</th><th>相手</th><th>勝点</th></tr>${rows}</table>
    <div class="teamTotalPts">累計 ${meta.selfSetPts}-${meta.oppSetPts} pt</div>`;
}

function teamSetPanelHtml(s) {
  ensureTeamState(s);
  const names = s.teamArchers.names;
  const curIdx = (s.cur || []).length;
  const activeArcher = teamArcherIndexForArrow(curIdx);
  const setNum = (s.matchMeta && s.matchMeta.sets ? s.matchMeta.sets.length : 0) + 1;
  const totalSets = typeof roundTotalEnds === "function" ? roundTotalEnds(s) || 4 : 4;
  return `<section class="teamPanel card" id="teamPanel">
    <div class="teamDisclaimer"><b>団体セット（練習）</b><span>${TEAM_DISCLAIMER}</span></div>
    <div class="row teamNames">
      ${names.map((n, i) => `<div><label class="f">${i + 1}番手</label>
        <input class="inp teamNameInp" data-archer="${i}" value="${esc(n)}" placeholder="例: 山田"></div>`).join("")}
    </div>
    <div class="teamRotation">
      ${names.map((n, i) => `<div class="teamChip ${activeArcher === i ? "on" : ""}">
        <b>${esc(n || `${i + 1}番手`)}</b><span>${teamArcherSlotLabel(i)}</span>
      </div>`).join("")}
    </div>
    <div class="teamSetHead">セット ${setNum}/${totalSets} · 入力 ${curIdx}/${s.perEnd || 6}本 · 次は <b>${esc(names[activeArcher] || `${activeArcher + 1}番手`)}</b></div>
    <div class="teamEndBreak">${teamEndBreakdownHtml(s.cur, names)}</div>
    <div class="teamHistoryMount" id="teamHistoryMount">${teamSetHistoryHtml(s)}</div>
  </section>`;
}

function bindTeamSet(s, root) {
  ensureTeamState(s);
  if (!root) root = document;
  const panel = root.querySelector("#teamPanel");
  if (!panel) return;
  panel.querySelectorAll(".teamNameInp").forEach((inp) => {
    inp.oninput = (e) => {
      const i = +inp.dataset.archer;
      s.teamArchers.names[i] = e.target.value.trim() || `${i + 1}番手`;
      save("team-names");
      refreshActive();
    };
  });
}

function tagTeamArrow(arrow, arrowIndex) {
  if (!arrow) return arrow;
  arrow.archer = teamArcherIndexForArrow(arrowIndex);
  return arrow;
}

if (typeof window !== "undefined") {
  window.ArcherTeam = {
    TEAM_DISCLAIMER,
    ensureTeamState,
    teamArcherIndexForArrow,
    teamSetPanelHtml,
    bindTeamSet,
    tagTeamArrow,
    teamSetHistoryHtml,
  };
}