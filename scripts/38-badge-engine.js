"use strict";
/* 的ノート: star/green badge progress (RESEARCH §14, local only) */

const STAR_BADGE_PROFILES = [
  { id: "outdoor_rc_70", label: "屋外 RC 70m72", match: (s) => s.bowType === "recurve" && s.environment !== "indoor" && s.dist === 70 && (s.round === "70m72" || !s.round || s.round === "free"), thresholds: [500, 550, 600, 650, 675, 700] },
  { id: "outdoor_cp_50", label: "屋外 CP 50m72", match: (s) => s.bowType === "compound" && s.dist === 50, thresholds: [500, 550, 600, 650, 675, 700] },
  { id: "outdoor_bb_50", label: "屋外 BB 50m72", match: (s) => s.bowType === "barebow" && s.dist === 50, thresholds: [480, 500, 550, 600, 625, 640] },
  { id: "indoor_rc_18", label: "インドア RC 18m60", match: (s) => s.bowType === "recurve" && (s.environment === "indoor" || s.round === "18m60_jp" || s.round === "18m60_jp_x2") && s.dist === 18, thresholds: [500, 525, 550, 575, 585, 595] },
  { id: "indoor_cp_18", label: "インドア CP 18m60", match: (s) => s.bowType === "compound" && s.environment === "indoor" && s.dist === 18, thresholds: [500, 525, 550, 575, 585, 595] },
  { id: "indoor_bb_18", label: "インドア BB 18m60", match: (s) => s.bowType === "barebow" && s.environment === "indoor" && s.dist === 18, thresholds: [480, 500, 520, 540, 550, 560] },
];

const GREEN_BADGE_PROFILES = [
  { id: "outdoor_30", label: "屋外グリーン", match: (s) => s.environment !== "indoor" && s.dist === 30 && (s.round === "30m36" || s.perEnd === 3), min: 200 },
  { id: "indoor_18", label: "インドアグリーン", match: (s) => s.environment === "indoor" && s.dist === 18, min: 240 },
  { id: "field_bb_rc", label: "フィールドグリーン", match: (s) => s.faceType === "field", min: 50, bowTypes: ["recurve", "barebow", "yumi"] },
  { id: "field_cp", label: "フィールドグリーン CP", match: (s) => s.faceType === "field" && s.bowType === "compound", min: 60 },
];

function sessionTotalPoints(sess) {
  if (typeof sessionStats === "function") return sessionStats(sess).total;
  return (sess.ends || []).flat().reduce((a, x) => a + (x.s || 0), 0);
}

function starBadgeLevel(total, thresholds) {
  let level = 0;
  thresholds.forEach((t, i) => { if (total >= t) level = i + 1; });
  return level;
}

function starBadgeProfileFor(sess) {
  if (!sess || sess.purpose === "volume") return null;
  return STAR_BADGE_PROFILES.find((p) => p.match(sess)) || null;
}

function greenBadgeProfileFor(sess) {
  if (!sess || sess.purpose === "volume") return null;
  return GREEN_BADGE_PROFILES.find((p) => {
    if (!p.match(sess)) return false;
    if (p.bowTypes && !p.bowTypes.includes(sess.bowType)) return false;
    return true;
  }) || null;
}

function badgeProgressForSession(sess, sessions) {
  if (!sess || sess.purpose === "volume") return null;
  const starProf = starBadgeProfileFor(sess);
  const greenProf = greenBadgeProfileFor(sess);
  const total = typeof fieldBadgeTotal === "function" && greenProf && greenProf.match(sess) ? fieldBadgeTotal(sess) : sessionTotalPoints(sess);
  const pool = (sessions || db.sessions || []).filter((s) => s.purpose !== "volume");
  const out = { total, star: null, green: null };

  if (starProf) {
    const related = pool.filter(starProf.match);
    const best = related.length ? Math.max(...related.map(sessionTotalPoints)) : total;
    const level = starBadgeLevel(best, starProf.thresholds);
    const nextIdx = Math.min(level, starProf.thresholds.length - 1);
    const nextAt = level >= starProf.thresholds.length ? null : starProf.thresholds[nextIdx];
    const toNext = nextAt == null ? 0 : Math.max(0, nextAt - best);
    out.star = {
      label: starProf.label,
      level,
      max: starProf.thresholds.length,
      best,
      nextAt,
      toNext,
      earned: level >= starProf.thresholds.length,
    };
  }

  if (greenProf) {
    const related = pool.filter(greenProf.match);
    const pts = typeof fieldBadgeTotal === "function" ? fieldBadgeTotal : sessionTotalPoints;
    const best = related.length ? Math.max(...related.map(pts)) : total;
    out.green = {
      label: greenProf.label,
      min: greenProf.min,
      best,
      earned: best >= greenProf.min,
      toNext: Math.max(0, greenProf.min - best),
    };
  }

  return out.star || out.green ? out : null;
}

function badgeStarRingSvg(level, max) {
  const lv = Math.max(0, Math.min(level || 0, max || 6));
  const mx = Math.max(1, max || 6);
  const r = 12;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - lv / mx);
  const stars = "★".repeat(lv) + "☆".repeat(Math.max(0, mx - lv));
  return `<div class="badgeRingWrap" title="${stars}">
    <svg class="badgeRing" width="40" height="40" viewBox="0 0 32 32" aria-hidden="true">
      <circle class="badgeRingTrack" cx="16" cy="16" r="${r}" fill="none" stroke-width="2.5"></circle>
      <circle class="badgeRingFill" cx="16" cy="16" r="${r}" fill="none" stroke-width="2.5" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"></circle>
      <text x="16" y="17" text-anchor="middle" class="badgeRingLabel">${lv}</text>
    </svg>
  </div>`;
}
function badgeProgressBannerHtml(sess, sessions) {
  const prog = badgeProgressForSession(sess, sessions);
  if (!prog) return "";
  const parts = [];
  if (prog.star) {
    const ring = badgeStarRingSvg(prog.star.level, prog.star.max);
    if (prog.star.earned) {
      parts.push(`<div class="badgeLine star on">${ring}<span>${esc(prog.star.label)} — 最高 ${prog.star.best}点（★${prog.star.max}到達）</span></div>`);
    } else {
      parts.push(`<div class="badgeLine star">${ring}<span>${esc(prog.star.label)} — 最高 ${prog.star.best}点 / 次の★まであと ${prog.star.toNext}点</span></div>`);
    }
  }
  if (prog.green) {
    if (prog.green.earned) {
      parts.push(`<div class="badgeLine green on"><b>🟢</b><span>${esc(prog.green.label)} — ${prog.green.best}点（達成済）</span></div>`);
    } else {
      parts.push(`<div class="badgeLine green"><b>🟢</b><span>${esc(prog.green.label)} — 最高 ${prog.green.best}点 / あと ${prog.green.toNext}点</span></div>`);
    }
  }
  return `<section class="badgeBanner">${parts.join("")}</section>`;
}

function homeBadgeSummaryHtml() {
  const scored = (db.sessions || []).filter((s) => s.purpose !== "volume");
  if (!scored.length) return "";
  const latest = scored[scored.length - 1];
  return badgeProgressBannerHtml(latest, scored);
}

if (typeof window !== "undefined") {
  window.ArcherBadge = {
    STAR_BADGE_PROFILES,
    GREEN_BADGE_PROFILES,
    starBadgeLevel,
    badgeProgressForSession,
    badgeProgressBannerHtml,
    homeBadgeSummaryHtml,
  };
}