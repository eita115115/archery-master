"use strict";
/* 的ノート: unified next-shot decision engine */

function nextShotBrief(sess, adv, setup) {
  const st = adv && adv.st;
  const q = sessionQuality(sess, setup, st);
  const form = typeof formContextForSession === "function" ? formContextForSession(sess) : null;
  const judgement = judgementFor(adv, sess);
  const arrows = (sess.ends || []).flat();
  const agg = aggregateSessionStats(arrows);
  const grouping = st && st.rr != null ? Math.max(0, 1 - Math.min(1, st.rr / Math.max(1, ringW(sess.faceD, sess.faceType) * 3))) : 0.5;
  const formFactor = form ? form.score / 100 : 0.55;
  const confidenceFactor = adv ? (adv.confidence || 0.45) : 0.4;
  const qualityFactor = q.score || 0.45;
  const score = Math.round(clamp(
    qualityFactor * 34 + confidenceFactor * 26 + formFactor * 20 + grouping * 12 + (agg.avg / 10) * 8,
    0, 100,
  ));
  const factors = [
    { k: "データ信頼", v: Math.round(qualityFactor * 100) },
    { k: "提案確度", v: Math.round(confidenceFactor * 100) },
    { k: "射形", v: form ? form.score : null },
    { k: "グルーピング", v: Math.round(grouping * 100) },
  ].filter((x) => x.v != null);
  const actions = nextActionPlan(sess, adv, setup);
  return {
    score,
    headline: judgement ? judgement.label : "材料待ち",
    tone: judgement ? judgement.tone : "hold",
    summary: judgement ? judgement.text : "6本以上の記録で次の一射の判断が安定します。",
    actions,
    factors,
    form,
  };
}

function nextShotBriefHtml(sess, adv, setup) {
  const b = nextShotBrief(sess, adv, setup);
  const color = b.tone === "ok" ? "#0f9d58" : b.tone === "warn" ? "#c62828" : "#8a6d1d";
  const factorHtml = b.factors.map((f) => `<div class="nextShotFactor"><span>${esc(f.k)}</span><b>${f.v}</b></div>`).join("");
  const actionHtml = b.actions.slice(0, 3).map((a, i) => `<div class="note">${i + 1}. ${esc(a)}</div>`).join("");
  return `<section class="card nextShotCard">
    <div class="nextShotTop">
      <div><div class="k">次の一射スコア</div><b class="nextShotScore">${b.score}</b></div>
      <div class="nextShotHeadline" style="color:${color}">${esc(b.headline)}</div>
    </div>
    <p class="nextShotSummary">${esc(b.summary)}</p>
    <div class="nextShotFactors">${factorHtml}</div>
    ${actionHtml ? `<div class="nextShotActions">${actionHtml}</div>` : ""}
  </section>`;
}

if (typeof window !== "undefined") {
  window.ArcherDecision = { nextShotBrief, nextShotBriefHtml };
}