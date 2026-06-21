"use strict";
/* 的ノート: form video analysis via MediaPipe (Phase 4) */

const FORM_LM = Object.freeze({
  NOSE: 0, LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13, RIGHT_ELBOW: 14, LEFT_WRIST: 15, RIGHT_WRIST: 16,
  LEFT_HIP: 23, RIGHT_HIP: 24,
});

// Elite recurve reference (Kim Woojin / An San / Brady Ellison class).
// Sources: World Archery technique, James Park draw-force-line, Folkard-Kuhr bow-arm stability.
const ELITE_FORM_REFERENCE = Object.freeze({
  bowArmAngle: { ideal: 172, sigma: 9, min: 155, max: 182 },
  drawArmAngle: { ideal: 152, sigma: 14, min: 125, max: 175 },
  shoulderDrop: { ideal: 0.018, sigma: 0.014, min: 0, max: 0.05 },
  anchorDist: { ideal: 0.10, sigma: 0.028, min: 0.05, max: 0.18 },
  headOffset: { ideal: 0.022, sigma: 0.018, min: 0, max: 0.07 },
  torsoLean: { ideal: 0.21, sigma: 0.045, min: 0.12, max: 0.30 },
  drawForceLine: { ideal: 0.018, sigma: 0.016, min: 0, max: 0.07 },
});

let formMetricsEma = null;
const FORM_EMA_ALPHA = 0.38;
const FORM_TRAIL_LEN = 24;
const FORM_PHASE_ORDER = ["SETUP", "DRAWING", "ANCHORING", "FULL_DRAW", "RELEASE", "FOLLOW"];

function gaussianScore(value, ideal, sigma) {
  const z = (value - ideal) / Math.max(0.0001, sigma);
  return Math.round(Math.max(0, Math.min(100, 100 * Math.exp(-0.5 * z * z))));
}

function lineDistance2d(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.0001) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (len * len)));
  const px = a.x + t * dx;
  const py = a.y + t * dy;
  return Math.hypot(p.x - px, p.y - py);
}

function smoothFormMetrics(metrics) {
  if (!metrics) return null;
  if (!formMetricsEma) {
    formMetricsEma = { ...metrics };
    return metrics;
  }
  const keys = ["bowArmAngle", "drawArmAngle", "bowArmScore", "drawElbowScore", "shoulderScore", "headScore", "anchorScore", "leanScore", "forceLineScore", "score", "confidence"];
  keys.forEach((k) => {
    if (metrics[k] == null || formMetricsEma[k] == null) return;
    if (typeof metrics[k] === "number") {
      formMetricsEma[k] = Math.round(formMetricsEma[k] * (1 - FORM_EMA_ALPHA) + metrics[k] * FORM_EMA_ALPHA);
    }
  });
  formMetricsEma.anchorDist = metrics.anchorDist;
  formMetricsEma.drawWrist = metrics.drawWrist;
  formMetricsEma.bowWrist = metrics.bowWrist;
  return { ...formMetricsEma };
}
const FORM_BUNDLE_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/vision_bundle.mjs";
const FORM_WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm";
const FORM_MODEL_PATH = "./pose_landmarker_lite.task";

let formLandmarker = null;
let formSession = null;

function formAngleDeg(a, b, c) {
  const v1x = a.x - b.x; const v1y = a.y - b.y;
  const v2x = c.x - b.x; const v2y = c.y - b.y;
  const dot = v1x * v2x + v1y * v2y;
  const m1 = Math.hypot(v1x, v1y); const m2 = Math.hypot(v2x, v2y);
  if (m1 < 0.0001 || m2 < 0.0001) return 180;
  return Math.acos(Math.max(-1, Math.min(1, dot / (m1 * m2)))) * 180 / Math.PI;
}
function formDist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function computeFormMetrics(landmarks, handedness, opts) {
  if (!landmarks || !landmarks.length) return null;
  const l = landmarks[0];
  const righty = handedness !== "left";
  const bS = righty ? l[FORM_LM.LEFT_SHOULDER] : l[FORM_LM.RIGHT_SHOULDER];
  const bE = righty ? l[FORM_LM.LEFT_ELBOW] : l[FORM_LM.RIGHT_ELBOW];
  const bW = righty ? l[FORM_LM.LEFT_WRIST] : l[FORM_LM.RIGHT_WRIST];
  const dS = righty ? l[FORM_LM.RIGHT_SHOULDER] : l[FORM_LM.LEFT_SHOULDER];
  const dE = righty ? l[FORM_LM.RIGHT_ELBOW] : l[FORM_LM.LEFT_ELBOW];
  const dW = righty ? l[FORM_LM.RIGHT_WRIST] : l[FORM_LM.LEFT_WRIST];
  const nose = l[FORM_LM.NOSE];
  const lHip = l[FORM_LM.LEFT_HIP]; const rHip = l[FORM_LM.RIGHT_HIP];
  if (!bS || !bE || !bW || !dS || !dE || !dW || !nose) return null;
  const ref = ELITE_FORM_REFERENCE;
  const bowArm = formAngleDeg(bS, bE, bW);
  const drawArm = formAngleDeg(dS, dE, dW);
  const shoulderDrop = Math.max(0, dS.y - bS.y);
  const midShY = (bS.y + dS.y) / 2;
  const headOffset = Math.abs(nose.y - midShY);
  const ancD = formDist(dW, nose);
  const torsoLean = Math.abs(midShY - (lHip.y + rHip.y) / 2);
  const forceLineDist = lineDistance2d(dE, dS, dW);
  const bowScore = gaussianScore(bowArm, ref.bowArmAngle.ideal, ref.bowArmAngle.sigma);
  const drawScore = gaussianScore(drawArm, ref.drawArmAngle.ideal, ref.drawArmAngle.sigma);
  const shScore = gaussianScore(shoulderDrop, ref.shoulderDrop.ideal, ref.shoulderDrop.sigma);
  const headScore = gaussianScore(headOffset, ref.headOffset.ideal, ref.headOffset.sigma);
  const ancScore = gaussianScore(ancD, ref.anchorDist.ideal, ref.anchorDist.sigma);
  const leanScore = gaussianScore(torsoLean, ref.torsoLean.ideal, ref.torsoLean.sigma);
  const forceLineScore = gaussianScore(forceLineDist, ref.drawForceLine.ideal, ref.drawForceLine.sigma);
  const vis = [FORM_LM.LEFT_SHOULDER, FORM_LM.RIGHT_SHOULDER, FORM_LM.LEFT_ELBOW, FORM_LM.RIGHT_ELBOW, FORM_LM.LEFT_WRIST, FORM_LM.RIGHT_WRIST, FORM_LM.NOSE]
    .map((i) => (l[i] && l[i].visibility != null ? l[i].visibility : 0.55));
  const confidence = Math.round((vis.reduce((a, x) => a + x, 0) / vis.length) * 100);
  const score = Math.round(
    bowScore * 0.2 + drawScore * 0.16 + forceLineScore * 0.18 + shScore * 0.14
    + headScore * 0.12 + ancScore * 0.12 + leanScore * 0.08
  );
  const raw = {
    bowArmAngle: Math.round(bowArm), bowArmScore: bowScore,
    drawArmAngle: Math.round(drawArm), drawElbowScore: drawScore,
    shoulderScore: shScore, headScore, anchorScore: ancScore, leanScore,
    forceLineScore, anchorDist: ancD.toFixed(3), confidence, score,
    drawWrist: dW, bowWrist: bW,
  };
  if (opts && opts.raw) return raw;
  return smoothFormMetrics(raw);
}

function detectFormPhase(metrics, history, releaseSensitivity) {
  if (!metrics) return { phase: "IDLE", released: false };
  const now = Date.now();
  const anc = parseFloat(metrics.anchorDist);
  const close = anc < 0.19;
  const anchored = close && metrics.drawArmAngle > 132 && metrics.forceLineScore > 45;
  const speed = history.length > 1 ? (history[history.length - 1].vel || 0) : 0;
  let phase = anchored && metrics.bowArmScore > 50 ? "FULL_DRAW" : speed > 10 && !close ? "DRAWING" : close ? "ANCHORING" : "SETUP";
  let released = false;
  const prev = history.length > 1 ? history[history.length - 2].metrics : null;
  if (history.length > 3 && prev) {
    const speeds = history.slice(-5).map((p) => p.vel || 0);
    const maxS = Math.max(...speeds);
    const prevClose = parseFloat(prev.anchorDist || 1) < 0.19;
    const lastRelease = formSession ? formSession.lastReleaseTs : 0;
    if (maxS > 38 * (releaseSensitivity || 1.2) && prevClose && !close && (now - lastRelease) > 850) {
      released = true;
      if (formSession) formSession.lastReleaseTs = now;
      phase = "RELEASE";
    }
  }
  if (formSession && (now - formSession.lastReleaseTs) < 850 && (now - formSession.lastReleaseTs) > 100) phase = "FOLLOW";
  return { phase, released };
}

function measurePreReleaseWindow(history, releaseTs, windowSec) {
  windowSec = windowSec == null ? 0.5 : windowSec;
  if (!history || !history.length || releaseTs == null) return null;
  const winMs = windowSec * 1000;
  const frames = history.filter((h) => h.metrics && h.ts >= releaseTs - winMs && h.ts <= releaseTs);
  if (frames.length < 2) return null;
  const first = frames[0].metrics;
  const last = frames[frames.length - 1].metrics;
  const bowMove = first.bowWrist && last.bowWrist ? formDist(first.bowWrist, last.bowWrist) : 0;
  const drawMove = first.drawWrist && last.drawWrist ? formDist(first.drawWrist, last.drawWrist) : 0;
  const headMove = Math.abs(parseFloat(last.anchorDist || 0) - parseFloat(first.anchorDist || 0));
  return {
    windowSec,
    frameCount: frames.length,
    bowMove: +bowMove.toFixed(4),
    drawMove: +drawMove.toFixed(4),
    headMove: +headMove.toFixed(4),
    bowDrift: bowMove > 0.012,
    drawDrift: drawMove > 0.015,
    headDrift: headMove > 0.01,
  };
}

function anchorVariationStats(analyses) {
  const vals = (analyses || []).map((a) => parseFloat(a.metrics && a.metrics.anchorDist)).filter((v) => Number.isFinite(v));
  if (vals.length < 2) return { n: vals.length, std: null, mean: vals[0] || null, label: "初回" };
  const mean = vals.reduce((a, x) => a + x, 0) / vals.length;
  const variance = vals.reduce((a, x) => a + (x - mean) ** 2, 0) / vals.length;
  const std = Math.sqrt(variance);
  let label = "安定";
  if (std > 0.025) label = "ばらつき大";
  else if (std > 0.014) label = "ややばらつき";
  return { n: vals.length, std: +std.toFixed(4), mean: +mean.toFixed(4), label };
}

function buildStructuredFormComment(metrics, ctx) {
  ctx = ctx || {};
  const facts = [];
  const causes = [];
  const checks = [];
  const next = [];
  const phase = ctx.phase || "FULL_DRAW";
  const pre = ctx.preRelease;
  const anchorVar = ctx.anchorVariation;
  const prev = ctx.prev;

  if (ctx.hold != null && ctx.hold > 0) facts.push(`フルドロー保持は約 ${ctx.hold.toFixed(1)} 秒でした。`);
  if (pre) {
    facts.push(`リリース前 ${pre.windowSec} 秒で弓手 ${(pre.bowMove * 100).toFixed(1)}cm相当・引き手 ${(pre.drawMove * 100).toFixed(1)}cm相当の動きを観測しました。`);
    if (pre.headDrift) facts.push("同じ区間でアンカー距離にも微小な変化が見られます。");
  }
  if (anchorVar && anchorVar.n >= 2) {
    facts.push(`直近 ${anchorVar.n} 射のアンカー位置ばらつきは ${anchorVar.std}（${anchorVar.label}）です。`);
  }
  if (metrics && metrics.confidence != null) facts.push(`骨格検出の信頼度は ${metrics.confidence}% です。`);

  if (pre && pre.bowDrift && pre.drawDrift) {
    causes.push("保持が長い区間で、弓手と引き手が同時に動いている可能性があります（断定ではありません）。");
  } else if (pre && pre.bowDrift) {
    causes.push("リリース直前に弓手の押しが弱まっている可能性があります。");
  }
  if (anchorVar && anchorVar.std != null && anchorVar.std > 0.018) {
    causes.push("アンカー位置の再現性が前回より不安定になっている可能性があります。");
  }
  if (prev && prev.metrics && metrics) {
    const dHold = ctx.deltaHold;
    if (dHold != null && Math.abs(dHold) >= 0.4) {
      causes.push(dHold > 0 ? "保持時間が前回より長くなっています。" : "保持時間が前回より短くなっています。");
    }
  }

  if (pre && pre.bowDrift) checks.push("リリース前0.5秒のグリップ位置が下がっていないか、横から確認してください。");
  if (pre && pre.drawDrift) checks.push("リリース直前に引き手が緩んでいないか、スローモーションで確認してください。");
  if (anchorVar && anchorVar.std != null && anchorVar.std > 0.014) checks.push("アンカー接触点（顎の位置）が射ごとにずれていないか確認してください。");
  if (phase === "RELEASE") checks.push("リリース後0.3秒で引き手が後方へ抜けているかを見てください。");

  if (pre && pre.bowDrift) next.push("次の練習ではリリース前0.5秒の弓手固定を意識ポイントに入れてください。");
  if (anchorVar && anchorVar.std != null && anchorVar.std > 0.014) next.push("アンカー位置の再現性を優先し、同じ接触点で止まる練習を増やしてください。");
  if (!next.length) next.push("同じ撮影角度で数射を重ね、変化量の比較を続けてください。");

  return { facts, causes, checks, next };
}

function structuredCommentHtml(block) {
  if (!block) return "";
  const section = (k, items) => items && items.length
    ? `<div class="formObsBlock"><div class="k">${k}</div><ul>${items.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>` : "";
  return `${section("観測", block.facts)}${section("原因候補", block.causes)}${section("確認点", block.checks)}${section("次の練習", block.next)}`;
}

function generateFormAdvice(m, phase) {
  const block = buildStructuredFormComment(m, { phase });
  const flat = [...block.facts, ...block.causes.map((t) => `（候補）${t}`), ...block.checks, ...block.next];
  return flat.slice(0, 6).map((text) => ({ type: "obs", text }));
}

function pushFormTrail(trails, key, point) {
  if (!trails || !point) return;
  if (!trails[key]) trails[key] = [];
  trails[key].push({ x: point.x, y: point.y });
  if (trails[key].length > FORM_TRAIL_LEN) trails[key].shift();
}

function drawTrailPath(ctx, trail, w, h, color) {
  if (!trail || trail.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  trail.forEach((p, i) => {
    const x = p.x * w;
    const y = p.y * h;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function drawFormOverlay(canvas, landmarks, metrics, phase, opts) {
  if (!canvas || !landmarks || !landmarks.length) return;
  const ctx = canvas.getContext("2d");
  const l = landmarks[0];
  const w = canvas.width; const h = canvas.height;
  const righty = (opts && opts.handedness) !== "left";
  const mir = !!(opts && opts.mirror);
  const fx = (p) => (p ? { x: mir ? 1 - p.x : p.x, y: p.y } : p);
  ctx.clearRect(0, 0, w, h);
  const bS = fx(righty ? l[FORM_LM.LEFT_SHOULDER] : l[FORM_LM.RIGHT_SHOULDER]);
  const bE = fx(righty ? l[FORM_LM.LEFT_ELBOW] : l[FORM_LM.RIGHT_ELBOW]);
  const bW = fx(righty ? l[FORM_LM.LEFT_WRIST] : l[FORM_LM.RIGHT_WRIST]);
  const dS = fx(righty ? l[FORM_LM.RIGHT_SHOULDER] : l[FORM_LM.LEFT_SHOULDER]);
  const dE = fx(righty ? l[FORM_LM.RIGHT_ELBOW] : l[FORM_LM.LEFT_ELBOW]);
  const dW = fx(righty ? l[FORM_LM.RIGHT_WRIST] : l[FORM_LM.LEFT_WRIST]);
  const nose = fx(l[FORM_LM.NOSE]);
  const trails = (opts && opts.trails) || null;
  if (trails) {
    drawTrailPath(ctx, trails.head, w, h, "rgba(239,68,68,0.82)");
    drawTrailPath(ctx, trails.bow, w, h, "rgba(234,179,8,0.82)");
    drawTrailPath(ctx, trails.draw, w, h, "rgba(59,130,246,0.82)");
  }
  ctx.strokeStyle = "rgba(14,165,233,0.75)"; ctx.lineWidth = 3;
  [[bS, bE], [bE, bW], [dS, dE], [dE, dW], [bS, dS], [bS, nose], [dS, nose]].forEach(([p1, p2]) => {
    if (p1 && p2) { ctx.beginPath(); ctx.moveTo(p1.x * w, p1.y * h); ctx.lineTo(p2.x * w, p2.y * h); ctx.stroke(); }
  });
  if (phase === "RELEASE" || phase === "FOLLOW") {
    ctx.strokeStyle = "#eab308"; ctx.beginPath(); ctx.arc(dW.x * w, dW.y * h, 14, 0, Math.PI * 2); ctx.stroke();
  }
}

function trackFormPhaseClock(session, phase, videoTime) {
  if (!session || !phase) return;
  if (!session.phaseClock) session.phaseClock = {};
  if (session.lastPhase !== phase) {
    session.phaseClock[phase] = typeof videoTime === "number" ? videoTime : null;
    session.lastPhase = phase;
  }
}

function formPhaseDurations(session) {
  const c = (session && session.phaseClock) || {};
  const draw = c.DRAWING != null && c.ANCHORING != null ? c.ANCHORING - c.DRAWING : null;
  const hold = c.FULL_DRAW != null && c.ANCHORING != null ? c.FULL_DRAW - c.ANCHORING : null;
  const release = c.RELEASE != null && c.FULL_DRAW != null ? c.RELEASE - c.FULL_DRAW : null;
  return { draw, hold, release, clock: c };
}

/* ---------- §43 FP1: Form Precision measurement foundation ---------- */
const FP1_MIN_DURATION_SEC = 3;
const FP1_MAX_DURATION_SEC = 60;
const FP1_DEFAULT_SHOULDER_CM = 40;
const FP1_REF_CAMERA_DIST_M = 2.5;

function compactLandmarks(lms) {
  if (!lms || !lms.length || !lms[0]) return null;
  const l = lms[0];
  const keys = [
    FORM_LM.NOSE, FORM_LM.LEFT_SHOULDER, FORM_LM.RIGHT_SHOULDER,
    FORM_LM.LEFT_ELBOW, FORM_LM.RIGHT_ELBOW, FORM_LM.LEFT_WRIST, FORM_LM.RIGHT_WRIST,
    FORM_LM.LEFT_HIP, FORM_LM.RIGHT_HIP,
  ];
  return keys.map((i) => {
    const p = l[i];
    if (!p) return null;
    return { x: +p.x.toFixed(4), y: +p.y.toFixed(4), v: +(p.visibility != null ? p.visibility : 0.55).toFixed(2) };
  });
}

function extractShoulderWidthNorm(lms) {
  if (!lms || !lms.length || !lms[0]) return null;
  const l = lms[0];
  const ls = l[FORM_LM.LEFT_SHOULDER];
  const rs = l[FORM_LM.RIGHT_SHOULDER];
  if (!ls || !rs) return null;
  return formDist(ls, rs);
}

function wristPointsFromCompact(compact, handedness) {
  if (!compact || compact.length < 7) return { bowWrist: null, drawWrist: null };
  const righty = handedness !== "left";
  const bowWrist = righty ? compact[5] : compact[6];
  const drawWrist = righty ? compact[6] : compact[5];
  return {
    bowWrist: bowWrist ? { x: bowWrist.x, y: bowWrist.y } : null,
    drawWrist: drawWrist ? { x: drawWrist.x, y: drawWrist.y } : null,
  };
}

function metricsFromPrecisionFrame(frame, handedness) {
  if (!frame || !frame.metrics) return null;
  const wrists = wristPointsFromCompact(frame.landmarks, handedness);
  return Object.assign({}, frame.metrics, wrists);
}

function buildPrecisionFrame(lms, videoTime, handedness) {
  const metrics = computeFormMetrics(lms, handedness, { raw: true });
  const shoulderWidth = extractShoulderWidthNorm(lms);
  return {
    videoTime: +videoTime.toFixed(3),
    confidence: metrics ? metrics.confidence : 0,
    shoulderWidth: shoulderWidth != null ? +shoulderWidth.toFixed(4) : null,
    landmarks: compactLandmarks(lms),
    metrics: metrics ? {
      score: metrics.score,
      bowArmAngle: metrics.bowArmAngle,
      drawArmAngle: metrics.drawArmAngle,
      anchorDist: metrics.anchorDist,
      confidence: metrics.confidence,
      bowWrist: metrics.bowWrist,
      drawWrist: metrics.drawWrist,
    } : null,
  };
}

function estimateCameraAngle(frames) {
  const samples = (frames || []).filter((f) => f.shoulderWidth != null && f.shoulderWidth > 0.04);
  if (!samples.length) return { angle: "unknown", score: 0 };
  const widths = samples.map((f) => f.shoulderWidth).sort((a, b) => a - b);
  const avgSw = widths[Math.floor(widths.length / 2)];
  if (avgSw >= 0.11) return { angle: "side", score: Math.min(1, +(avgSw / 0.15).toFixed(2)) };
  if (avgSw >= 0.07) return { angle: "oblique", score: 0.45 };
  return { angle: "vertical", score: 0.2 };
}

function assessCaptureQuality(frames, videoMeta) {
  const warnings = [];
  const duration = (videoMeta && videoMeta.duration) || 0;
  const frameCount = (frames || []).length;
  if (duration < FP1_MIN_DURATION_SEC) warnings.push("動画が短すぎます（3秒以上を推奨）");
  if (duration > FP1_MAX_DURATION_SEC) warnings.push("動画が長すぎます（60秒以内を推奨）");
  if (frameCount < 10) warnings.push("解析フレームが少なすぎます");
  const visible = (frames || []).filter((f) => f.confidence >= 40 && f.landmarks).length;
  const bodyRatio = visible / Math.max(1, frameCount);
  if (bodyRatio < 0.55) warnings.push("全身がフレームに入っていない可能性があります");
  const cam = estimateCameraAngle(frames);
  if (cam.angle === "vertical" || cam.angle === "oblique") {
    warnings.push("真横からの撮影を推奨します（斜め・縦撮影を検出）");
  }
  let qualityScore = Math.min(1, bodyRatio * 0.35 + cam.score * 0.45 + (duration >= 5 && duration <= 15 ? 0.2 : 0.08));
  if (warnings.length) qualityScore *= Math.max(0.45, 1 - warnings.length * 0.12);
  return {
    ok: warnings.length === 0,
    quality_score: +qualityScore.toFixed(2),
    camera_angle: cam.angle,
    body_visible_ratio: +bodyRatio.toFixed(2),
    warnings,
  };
}

function buildFormCalibration(frames, distHintM) {
  const sws = (frames || []).map((f) => f.shoulderWidth).filter((v) => v != null && v > 0.05);
  const sorted = sws.slice().sort((a, b) => a - b);
  const shoulder_width_norm = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0.12;
  const dist = distHintM != null && distHintM > 0 ? +distHintM : null;
  let cm_per_norm = FP1_DEFAULT_SHOULDER_CM / shoulder_width_norm;
  if (dist) cm_per_norm *= dist / FP1_REF_CAMERA_DIST_M;
  return {
    shoulder_width_norm: +shoulder_width_norm.toFixed(4),
    cm_per_norm: +cm_per_norm.toFixed(2),
    dist_hint_m: dist,
  };
}

function movementNormToCm(movementNorm, calibration) {
  if (!calibration || !calibration.shoulder_width_norm || movementNorm == null) return null;
  const normalized = movementNorm / calibration.shoulder_width_norm;
  return +(normalized * calibration.cm_per_norm).toFixed(2);
}

function rms(vals) {
  const a = (vals || []).filter((v) => Number.isFinite(v));
  if (!a.length) return 0;
  return Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
}

function computeFp1Metrics(frames, calibration, handedness) {
  const bowDeltas = [];
  const headDeltas = [];
  for (let i = 1; i < (frames || []).length; i += 1) {
    const a = frames[i - 1];
    const b = frames[i];
    const ma = metricsFromPrecisionFrame(a, handedness);
    const mb = metricsFromPrecisionFrame(b, handedness);
    if (ma && mb && ma.bowWrist && mb.bowWrist) {
      bowDeltas.push(formDist(ma.bowWrist, mb.bowWrist));
    }
    if (a.landmarks && b.landmarks && a.landmarks[0] && b.landmarks[0]) {
      headDeltas.push(formDist(a.landmarks[0], b.landmarks[0]));
    }
  }
  const bowRms = rms(bowDeltas);
  const headRms = rms(headDeltas);
  return {
    hold_bow_rms_norm: +(bowRms / (calibration.shoulder_width_norm || 0.12)).toFixed(4),
    hold_head_rms_norm: +(headRms / (calibration.shoulder_width_norm || 0.12)).toFixed(4),
    hold_bow_rms_cm: movementNormToCm(bowRms, calibration),
    hold_head_rms_cm: movementNormToCm(headRms, calibration),
  };
}

function detectPhasesFromFrameSeries(frames, handedness) {
  const phaseClock = {};
  let lastPhase = null;
  const history = [];
  (frames || []).forEach((f) => {
    const m = metricsFromPrecisionFrame(f, handedness);
    if (!m) return;
    let vel = 0;
    if (history.length && history[history.length - 1].metrics && history[history.length - 1].metrics.drawWrist && m.drawWrist) {
      vel = formDist(history[history.length - 1].metrics.drawWrist, m.drawWrist) * 30;
    }
    history.push({ metrics: m, vel, ts: f.videoTime * 1000 });
    const { phase } = detectFormPhase(m, history, 1.2);
    if (phase && phase !== lastPhase) {
      phaseClock[phase] = f.videoTime;
      lastPhase = phase;
    }
  });
  return phaseClock;
}

function formPrecisionPhasesSec(phaseClock, duration) {
  const c = phaseClock || {};
  return {
    setup_start: c.SETUP != null ? c.SETUP : 0,
    draw_start: c.DRAWING != null ? c.DRAWING : null,
    anchor: c.ANCHORING != null ? c.ANCHORING : null,
    full_draw: c.FULL_DRAW != null ? c.FULL_DRAW : null,
    release: c.RELEASE != null ? c.RELEASE : null,
    follow_end: c.FOLLOW != null ? c.FOLLOW : (duration != null ? +duration.toFixed(2) : null),
  };
}

function buildFormPrecisionRun(opts) {
  opts = opts || {};
  let frames = opts.frames || [];
  const videoMeta = opts.videoMeta || {};
  const quality = opts.quality || assessCaptureQuality(frames, videoMeta);
  const calibration = opts.calibration || buildFormCalibration(frames, opts.distHintM);
  const handedness = opts.handedness || "right";
  const precisionMode = opts.precisionMode || "simple";
  const markerConfig = opts.markerConfig || parseMarkerConfig("none", "none");
  const isPrecision = precisionMode === "precision";
  if (isPrecision && frames.length && !frames[0].bowTrack) {
    frames = attachBowTracksToFrames(frames, markerConfig, handedness, null);
  }
  const phaseClock = opts.phaseClock || detectPhasesFromFrameSeries(frames, handedness);
  const phases_sec = formPrecisionPhasesSec(phaseClock, videoMeta.duration);
  const confVals = frames.map((f) => f.confidence).filter((v) => v > 0);
  const poseConf = confVals.length
    ? Math.round(confVals.reduce((a, x) => a + x, 0) / confVals.length)
    : 0;
  const bowWarnings = isPrecision
    ? [...new Set(frames.flatMap((f) => (f.bowTrack && f.bowTrack.warnings) || []))]
    : [];
  const videoWarnings = [...(quality.warnings || [])];
  if (bowWarnings.length) videoWarnings.push(...bowWarnings);
  const bowTrackConf = isPrecision ? aggregateBowTrackConfidence(frames) : null;
  const targetSess = opts.sess
    || (opts.sessionId && db.sessions ? db.sessions.find((s) => s.id === opts.sessionId) : null)
    || db.active
    || (db.sessions.length ? db.sessions[db.sessions.length - 1] : null);
  const metrics_l3 = isPrecision
    ? computeFp3Metrics(frames, calibration, handedness, phases_sec, targetSess)
    : computeFp1Metrics(frames, calibration, handedness);
  const run = {
    id: uid(),
    sessionId: opts.sessionId || null,
    ts: Date.now(),
    video_meta: {
      duration: videoMeta.duration || null,
      fps: videoMeta.fps || null,
      frame_count: frames.length,
      camera_angle: quality.camera_angle,
      quality_score: quality.quality_score,
      warnings: videoWarnings,
    },
    calibration,
    phases_sec,
    frames,
    metrics_l3,
    confidence: {
      overall: quality.quality_score,
      pose: +(poseConf / 100).toFixed(2),
      capture: quality.quality_score,
    },
    precision_mode: precisionMode,
    mode: isPrecision ? "precision_fp3" : "precision_fp1",
  };
  if (isPrecision) {
    run.marker_config = { gripKey: markerConfig.gripKey, nockKey: markerConfig.nockKey };
    run.confidence.bow_track = bowTrackConf;
  }
  return run;
}

function formQualityGateHtml(quality) {
  if (!quality) return "";
  const warns = (quality.warnings || []).length
    ? `<ul>${quality.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : "";
  const cls = quality.ok ? "ok" : "warn";
  return `<div class="formQualityGate ${cls}">
    <div class="k">撮影品質 ${Math.round((quality.quality_score || 0) * 100)}% · ${esc(quality.camera_angle || "—")}</div>
    ${warns}
    <span class="mini">練習用計測 — 真横・全身・3秒以上を推奨</span>
  </div>`;
}

async function scanVideoAllFrames(video, landmarker, handedness, opts) {
  opts = opts || {};
  const fps = opts.fps || 30;
  const duration = video.duration || 0;
  const step = 1 / fps;
  const precisionMode = opts.precisionMode || "simple";
  const markerConfig = opts.markerConfig || parseMarkerConfig("none", "none");
  const useBowTrack = precisionMode === "precision";
  const frames = [];
  const imageFrames = [];
  const scanCanvas = useBowTrack ? document.createElement("canvas") : null;
  const scanCtx = scanCanvas ? scanCanvas.getContext("2d", { willReadFrequently: true }) : null;
  const wasPaused = video.paused;
  const prevTime = video.currentTime;
  video.pause();
  for (let t = 0; t < duration; t += step) {
    video.currentTime = Math.min(t, Math.max(0, duration - 0.001));
    await new Promise((resolve) => {
      const done = () => { video.removeEventListener("seeked", done); resolve(); };
      video.addEventListener("seeked", done);
      setTimeout(done, 120);
    });
    try {
      const res = await landmarker.detectForVideo(video, performance.now());
      frames.push(buildPrecisionFrame(res && res.landmarks, t, handedness));
      if (useBowTrack && scanCtx && video.videoWidth > 0 && video.videoHeight > 0) {
        scanCanvas.width = video.videoWidth;
        scanCanvas.height = video.videoHeight;
        scanCtx.drawImage(video, 0, 0);
        imageFrames.push(scanCtx.getImageData(0, 0, scanCanvas.width, scanCanvas.height));
      }
    } catch (_) { /* skip frame */ }
  }
  video.currentTime = prevTime;
  if (!wasPaused) video.play().catch(() => {});
  if (useBowTrack) return attachBowTracksToFrames(frames, markerConfig, handedness, imageFrames);
  return frames;
}

function appendFormPrecisionRun(run, sess) {
  const target = sess || db.active || (db.sessions.length ? db.sessions[db.sessions.length - 1] : null);
  if (!target || !run) return false;
  if (!target.formPrecisionRuns) target.formPrecisionRuns = [];
  target.formPrecisionRuns.push(run);
  if (target.formPrecisionRuns.length > 20) target.formPrecisionRuns = target.formPrecisionRuns.slice(-20);
  if (run.precision_mode === "precision" && run.metrics_l3) updateFormPrecisionBaseline(run, target);
  save("form-precision-run");
  return true;
}

async function runFormPrecisionPipeline(video, landmarker, handedness, opts) {
  opts = opts || {};
  const frames = opts.frames || await scanVideoAllFrames(video, landmarker, handedness, opts);
  const videoMeta = {
    duration: video ? video.duration : (opts.videoMeta && opts.videoMeta.duration),
    fps: opts.fps || 30,
    width: video ? video.videoWidth : null,
    height: video ? video.videoHeight : null,
  };
  const quality = assessCaptureQuality(frames, videoMeta);
  const calibration = buildFormCalibration(frames, opts.distHintM);
  const target = db.active || (db.sessions.length ? db.sessions[db.sessions.length - 1] : null);
  const run = buildFormPrecisionRun({
    sessionId: target && target.id,
    sess: target,
    frames,
    videoMeta,
    quality,
    calibration,
    handedness,
    distHintM: opts.distHintM,
    precisionMode: opts.precisionMode,
    markerConfig: opts.markerConfig,
  });
  appendFormPrecisionRun(run, target);
  return { run, quality, frames };
}

function finalizeLivePrecisionRun(formSess, handedness, distHintM) {
  if (!formSess || !formSess.fpFrames || formSess.fpFrames.length < 10) return null;
  const duration = formSess.fpFrames[formSess.fpFrames.length - 1].videoTime || 0;
  const videoMeta = { duration, fps: 30 };
  const quality = assessCaptureQuality(formSess.fpFrames, videoMeta);
  const calibration = buildFormCalibration(formSess.fpFrames, distHintM);
  const target = db.active || (db.sessions.length ? db.sessions[db.sessions.length - 1] : null);
  const run = buildFormPrecisionRun({
    sessionId: target && target.id,
    sess: target,
    frames: formSess.fpFrames,
    videoMeta,
    quality,
    calibration,
    handedness,
    phaseClock: formSess.phaseClock,
    distHintM,
    precisionMode: formSess.precisionMode,
    markerConfig: formSess.markerConfig,
  });
  appendFormPrecisionRun(run, target);
  formSess.fpFrames = [];
  return run;
}

/* ---------- §43 FP2: bow tracking + precision mode ---------- */
const FP2_MARKER_PRESETS = Object.freeze({
  none: null,
  red: { id: "red", hMin: 0, hMax: 18, hWrap: 345, sMin: 0.38, vMin: 0.32 },
  blue: { id: "blue", hMin: 95, hMax: 135, sMin: 0.32, vMin: 0.28 },
  green: { id: "green", hMin: 78, hMax: 155, sMin: 0.3, vMin: 0.28 },
  yellow: { id: "yellow", hMin: 16, hMax: 48, sMin: 0.38, vMin: 0.38 },
});

function parseMarkerConfig(gripKey, nockKey) {
  const grip = gripKey && gripKey !== "none" ? FP2_MARKER_PRESETS[gripKey] : null;
  const nock = nockKey && nockKey !== "none" ? FP2_MARKER_PRESETS[nockKey] : null;
  return { gripColor: grip, nockColor: nock, gripKey: gripKey || "none", nockKey: nockKey || "none" };
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0.0001) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

function hsvMatchesPreset(hsv, preset) {
  if (!preset) return false;
  const inHue = preset.hWrap != null
    ? (hsv.h >= preset.hWrap || hsv.h <= preset.hMax)
    : (hsv.h >= preset.hMin && hsv.h <= preset.hMax);
  return inHue && hsv.s >= preset.sMin && hsv.v >= preset.vMin;
}

function findColorBlob(imageData, width, height, preset, seed) {
  if (!imageData || !preset) return null;
  const data = imageData.data;
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  const step = Math.max(2, Math.floor(width / 160));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const hsv = rgbToHsv(data[i], data[i + 1], data[i + 2]);
      if (!hsvMatchesPreset(hsv, preset)) continue;
      if (seed && Math.hypot(x / width - seed.x, y / height - seed.y) > 0.22) continue;
      sumX += x;
      sumY += y;
      count += 1;
    }
  }
  if (count < 6) return null;
  const confidence = Math.min(0.95, 0.45 + count / 180);
  return {
    x: +(sumX / count / width).toFixed(4),
    y: +(sumY / count / height).toFixed(4),
    confidence: +confidence.toFixed(2),
    source: "markers",
  };
}

function bowTrackWristProxy(compact, handedness) {
  const wrists = wristPointsFromCompact(compact, handedness);
  if (!wrists.bowWrist) return { grip: null, nock: null, source: "wrist_proxy", warnings: ["弓手が検出できませんでした"] };
  return {
    grip: { x: wrists.bowWrist.x, y: wrists.bowWrist.y, confidence: 0.38, source: "wrist_proxy" },
    nock: null,
    source: "wrist_proxy",
    warnings: ["色マーカー未設定 — 手首位置で弓手を代理追跡しています"],
  };
}

function analyzeBowTrackFrame(imageData, width, height, markerConfig, prevTrack, compact, handedness) {
  markerConfig = markerConfig || {};
  const hasMarkers = markerConfig.gripColor || markerConfig.nockColor;
  if (!hasMarkers) return bowTrackWristProxy(compact, handedness);
  const gripSeed = prevTrack && prevTrack.grip ? prevTrack.grip : null;
  const nockSeed = prevTrack && prevTrack.nock ? prevTrack.nock : null;
  let grip = markerConfig.gripColor && imageData
    ? findColorBlob(imageData, width, height, markerConfig.gripColor, gripSeed) : null;
  let nock = markerConfig.nockColor && imageData
    ? findColorBlob(imageData, width, height, markerConfig.nockColor, nockSeed) : null;
  const warnings = [];
  if (!grip && markerConfig.gripColor) {
    const proxy = bowTrackWristProxy(compact, handedness);
    grip = proxy.grip;
    warnings.push("グリップ色マーカーを検出できず手首代理を使用");
  }
  if (!nock && markerConfig.nockColor) warnings.push("ノック色マーカーを検出できませんでした");
  const source = (grip && grip.source === "markers") || (nock && nock.source === "markers") ? "markers" : "wrist_proxy";
  if (source === "wrist_proxy" && !warnings.length) warnings.push("マーカー追跡が不安定 — 手首代理を併用");
  return { grip, nock, source, warnings };
}

function synthesizeBowTrackForFrame(frame, markerConfig, handedness) {
  markerConfig = markerConfig || {};
  const hasMarkers = markerConfig.gripColor && markerConfig.nockColor;
  const wrists = wristPointsFromCompact(frame.landmarks, handedness);
  if (!hasMarkers || !wrists.bowWrist) return bowTrackWristProxy(frame.landmarks, handedness);
  return {
    grip: { x: +(wrists.bowWrist.x + 0.02).toFixed(4), y: wrists.bowWrist.y, confidence: 0.84, source: "markers" },
    nock: { x: +(wrists.bowWrist.x - 0.07).toFixed(4), y: +(wrists.bowWrist.y - 0.01).toFixed(4), confidence: 0.8, source: "markers" },
    source: "markers",
    warnings: [],
  };
}

function attachBowTracksToFrames(frames, markerConfig, handedness, imageFrames) {
  let prev = null;
  const allWarnings = [];
  return (frames || []).map((frame, idx) => {
    const imageData = imageFrames && imageFrames[idx];
    const bowTrack = imageData
      ? analyzeBowTrackFrame(imageData.data, imageData.width, imageData.height, markerConfig, prev, frame.landmarks, handedness)
      : synthesizeBowTrackForFrame(frame, markerConfig, handedness);
    if (bowTrack.warnings) allWarnings.push(...bowTrack.warnings);
    prev = bowTrack;
    return Object.assign({}, frame, { bowTrack });
  });
}

function aggregateBowTrackConfidence(frames) {
  const grips = (frames || []).map((f) => f.bowTrack && f.bowTrack.grip).filter(Boolean);
  if (!grips.length) return 0.35;
  const avg = grips.reduce((s, g) => s + (g.confidence || 0), 0) / grips.length;
  const markerRatio = grips.filter((g) => g.source === "markers").length / grips.length;
  return +Math.min(0.98, avg * (0.55 + markerRatio * 0.45)).toFixed(2);
}

function bowHandPointFromFrame(frame) {
  if (!frame) return null;
  if (frame.bowTrack && frame.bowTrack.grip) return frame.bowTrack.grip;
  if (frame.metrics && frame.metrics.bowWrist) return frame.metrics.bowWrist;
  return null;
}

function computeReleaseVector(frames, phases_sec, handedness) {
  const releaseT = phases_sec && phases_sec.release;
  if (releaseT == null) return null;
  const window = (frames || []).filter((f) => f.videoTime >= releaseT - 0.12 && f.videoTime <= releaseT + 0.25);
  if (window.length < 2) return null;
  const pts = window.map((f) => {
    const m = metricsFromPrecisionFrame(f, handedness);
    return m && m.drawWrist ? m.drawWrist : null;
  }).filter(Boolean);
  if (pts.length < 2) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const angle = Math.atan2(-dy, dx) * 180 / Math.PI;
  let dir = "backward";
  if (Math.abs(dy) > Math.abs(dx) * 1.1) dir = dy < 0 ? "upward" : "downward";
  else if (dx > 0.008) dir = "outward";
  return { dir, angle_deg: Math.round(angle), dx: +dx.toFixed(4), dy: +dy.toFixed(4) };
}

function computeFp2Metrics(frames, calibration, handedness, phases_sec) {
  const fp1 = computeFp1Metrics(frames, calibration, handedness);
  const bowDeltas = [];
  for (let i = 1; i < (frames || []).length; i += 1) {
    const a = bowHandPointFromFrame(frames[i - 1]);
    const b = bowHandPointFromFrame(frames[i]);
    if (a && b) bowDeltas.push(formDist(a, b));
  }
  const bowHandRms = rms(bowDeltas);
  const release_vector = computeReleaseVector(frames, phases_sec, handedness);
  const bowTrackSource = (frames || []).some((f) => f.bowTrack && f.bowTrack.source === "markers") ? "markers" : "wrist_proxy";
  return Object.assign(fp1, {
    bow_hand_rms_norm: +(bowHandRms / (calibration.shoulder_width_norm || 0.12)).toFixed(4),
    bow_hand_rms_cm: movementNormToCm(bowHandRms, calibration),
    release_vector,
    bow_track_source: bowTrackSource,
  });
}

/* ---------- §43 FP3: L3 metrics + baseline + correlation ---------- */
const FP3_PRE_RELEASE_SEC = 0.5;
const FP3_POST_RELEASE_SEC = 0.3;
const FP3_BASELINE_N = 5;

function framesInTimeWindow(frames, t0, t1) {
  if (t0 == null || t1 == null) return [];
  return (frames || []).filter((f) => f.videoTime >= t0 && f.videoTime <= t1);
}

function anchorVariationMm(frames, calibration, handedness, phases_sec) {
  const anchorT = phases_sec && phases_sec.anchor;
  const releaseT = phases_sec && phases_sec.release;
  const t0 = anchorT != null ? anchorT : (phases_sec && phases_sec.full_draw);
  if (t0 == null || releaseT == null) return null;
  const window = framesInTimeWindow(frames, t0, releaseT);
  if (window.length < 3) return null;
  const pts = window.map((f) => {
    const m = metricsFromPrecisionFrame(f, handedness);
    return m && m.drawWrist ? m.drawWrist : null;
  }).filter(Boolean);
  if (pts.length < 3) return null;
  const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const spread = Math.sqrt(pts.reduce((s, p) => s + formDist(p, { x: mx, y: my }) ** 2, 0) / pts.length);
  const cm = movementNormToCm(spread, calibration);
  return cm != null ? +(cm * 10).toFixed(2) : null;
}

function preReleaseMetrics(frames, calibration, handedness, phases_sec) {
  const releaseT = phases_sec && phases_sec.release;
  if (releaseT == null) return { pre_release_bow_drop: null, pre_release_draw_motion: null };
  const window = framesInTimeWindow(frames, releaseT - FP3_PRE_RELEASE_SEC, releaseT);
  if (window.length < 2) return { pre_release_bow_drop: null, pre_release_draw_motion: null };
  const first = window[0];
  const last = window[window.length - 1];
  const bowA = bowHandPointFromFrame(first);
  const bowB = bowHandPointFromFrame(last);
  const mA = metricsFromPrecisionFrame(first, handedness);
  const mB = metricsFromPrecisionFrame(last, handedness);
  const bowDropNorm = bowA && bowB ? Math.max(0, bowB.y - bowA.y) : null;
  const drawMotionNorm = mA && mB && mA.drawWrist && mB.drawWrist
    ? formDist(mA.drawWrist, mB.drawWrist) : null;
  return {
    pre_release_bow_drop: bowDropNorm != null ? movementNormToCm(bowDropNorm, calibration) : null,
    pre_release_draw_motion: drawMotionNorm != null ? movementNormToCm(drawMotionNorm, calibration) : null,
  };
}

function postReleaseMetrics(frames, calibration, handedness, phases_sec) {
  const releaseT = phases_sec && phases_sec.release;
  if (releaseT == null) return { post_release_head_drop: null, post_release_shoulder_collapse: null };
  const window = framesInTimeWindow(frames, releaseT, releaseT + FP3_POST_RELEASE_SEC);
  if (window.length < 2) return { post_release_head_drop: null, post_release_shoulder_collapse: null };
  const first = window[0];
  const last = window[window.length - 1];
  const headA = first.landmarks && first.landmarks[0];
  const headB = last.landmarks && last.landmarks[0];
  const headDropNorm = headA && headB ? Math.max(0, headB.y - headA.y) : null;
  const swA = first.shoulderWidth;
  const swB = last.shoulderWidth;
  const shoulderCollapse = swA != null && swB != null ? Math.max(0, swA - swB) : null;
  return {
    post_release_head_drop: headDropNorm != null ? movementNormToCm(headDropNorm, calibration) : null,
    post_release_shoulder_collapse: shoulderCollapse != null ? movementNormToCm(shoulderCollapse, calibration) : null,
  };
}

function sessionAvgGroupingRr(sess) {
  const ends = (sess && sess.ends) || [];
  if (!ends.length) return null;
  const rrs = ends.map((end) => {
    if (!end || end.length < 2) return null;
    const st = robustStats(end);
    return st && st.rr != null ? st.rr : null;
  }).filter((v) => v != null);
  if (!rrs.length) return null;
  return +(rrs.reduce((a, x) => a + x, 0) / rrs.length).toFixed(2);
}

function computePrecisionCorrelation(sess) {
  const ends = (sess && sess.ends) || [];
  if (!ends.length) return null;
  const end_index = ends.length - 1;
  const grouping_rr = sessionLatestEndGroupingRr(sess);
  const session_avg_rr = sessionAvgGroupingRr(sess);
  if (grouping_rr == null && session_avg_rr == null) return null;
  return { end_index, grouping_rr, session_avg_rr };
}

function computeFp3Metrics(frames, calibration, handedness, phases_sec, sess) {
  const fp2 = computeFp2Metrics(frames, calibration, handedness, phases_sec);
  const pre = preReleaseMetrics(frames, calibration, handedness, phases_sec);
  const post = postReleaseMetrics(frames, calibration, handedness, phases_sec);
  return Object.assign(fp2, pre, post, {
    anchor_variation_mm: anchorVariationMm(frames, calibration, handedness, phases_sec),
    correlation: computePrecisionCorrelation(sess),
  });
}

function isPrecisionFpRun(run) {
  if (!run) return false;
  const mode = run.mode || "";
  return mode === "precision_fp3" || mode === "precision_fp2" || run.precision_mode === "precision";
}

function collectRecentPrecisionRuns(n, setupId) {
  const runs = [];
  const sessions = [...(db.sessions || [])].reverse();
  sessions.forEach((sess) => {
    if (setupId && sess.setupId !== setupId) return;
    const pr = (sess.formPrecisionRuns || []).slice().reverse();
    pr.forEach((run) => {
      if (!isPrecisionFpRun(run) || !run.metrics_l3) return;
      runs.push(run);
    });
  });
  return runs.slice(0, n);
}

function averageL3Metric(runs, key) {
  const vals = runs.map((r) => r.metrics_l3 && r.metrics_l3[key]).filter((v) => Number.isFinite(v));
  if (!vals.length) return null;
  return +(vals.reduce((a, x) => a + x, 0) / vals.length).toFixed(3);
}

function updateFormPrecisionBaseline(run, sess) {
  if (!run || !run.metrics_l3 || run.precision_mode !== "precision") return;
  if (!db.settings) db.settings = {};
  const recent = collectRecentPrecisionRuns(FP3_BASELINE_N, null);
  const baseline = {
    sample_count: recent.length,
    updated_at: Date.now(),
    hold_head_rms_cm: averageL3Metric(recent, "hold_head_rms_cm"),
    hold_bow_rms_cm: averageL3Metric(recent, "hold_bow_rms_cm"),
    bow_hand_rms_cm: averageL3Metric(recent, "bow_hand_rms_cm"),
    anchor_variation_mm: averageL3Metric(recent, "anchor_variation_mm"),
    pre_release_bow_drop: averageL3Metric(recent, "pre_release_bow_drop"),
    pre_release_draw_motion: averageL3Metric(recent, "pre_release_draw_motion"),
    post_release_head_drop: averageL3Metric(recent, "post_release_head_drop"),
    post_release_shoulder_collapse: averageL3Metric(recent, "post_release_shoulder_collapse"),
  };
  db.settings.formPrecisionBaseline = baseline;
  const setupId = sess && sess.setupId;
  if (setupId) {
    if (!db.settings.formPrecisionBaselineBySetup) db.settings.formPrecisionBaselineBySetup = {};
    const setupRecent = collectRecentPrecisionRuns(FP3_BASELINE_N, setupId);
    db.settings.formPrecisionBaselineBySetup[setupId] = Object.assign({}, baseline, {
      sample_count: setupRecent.length,
    });
  }
}

function formPrecisionBaselineForSession(sess) {
  const global = db.settings && db.settings.formPrecisionBaseline;
  const setupId = sess && sess.setupId;
  const bySetup = setupId && db.settings && db.settings.formPrecisionBaselineBySetup
    ? db.settings.formPrecisionBaselineBySetup[setupId] : null;
  if (bySetup && bySetup.sample_count >= 2) return bySetup;
  return global || null;
}

function formPrecisionBaselineDelta(metrics_l3, baseline) {
  if (!baseline || baseline.sample_count < 2 || !metrics_l3) return null;
  const keys = [
    "hold_head_rms_cm", "hold_bow_rms_cm", "bow_hand_rms_cm", "anchor_variation_mm",
    "pre_release_bow_drop", "pre_release_draw_motion",
  ];
  const deltas = {};
  keys.forEach((k) => {
    const cur = metrics_l3[k];
    const base = baseline[k];
    if (!Number.isFinite(cur) || !Number.isFinite(base)) return;
    deltas[k] = +(cur - base).toFixed(2);
  });
  return Object.keys(deltas).length ? deltas : null;
}

const FP3_METRIC_LABELS = {
  hold_head_rms_cm: "頭の揺れ",
  hold_bow_rms_cm: "弓保持",
  bow_hand_rms_cm: "弓手",
  anchor_variation_mm: "アンカー",
  pre_release_bow_drop: "リリース前弓",
  pre_release_draw_motion: "リリース前引き",
  post_release_head_drop: "リリース後頭",
  post_release_shoulder_collapse: "リリース後肩",
};

function formatBaselineDeltaHtml(deltas, baseline) {
  if (!baseline || baseline.sample_count < 2) {
    return '<span class="mini formBaselinePending">ベースライン形成中</span>';
  }
  if (!deltas) return "";
  const lines = Object.entries(deltas).slice(0, 3).map(([k, d]) => {
    const sign = d >= 0 ? "+" : "";
    const label = FP3_METRIC_LABELS[k] || k;
    const unit = k.includes("_mm") ? "mm" : "cm";
    return `${label} ${sign}${d}${unit}`;
  });
  return `<span class="mini formBaselineDelta">前回比 ${lines.join(" · ")}</span>`;
}

function weakestL3Metric(metrics_l3, baseline) {
  const candidates = [
    { key: "hold_head_rms_cm", val: metrics_l3 && metrics_l3.hold_head_rms_cm },
    { key: "hold_bow_rms_cm", val: metrics_l3 && metrics_l3.hold_bow_rms_cm },
    { key: "bow_hand_rms_cm", val: metrics_l3 && metrics_l3.bow_hand_rms_cm },
    { key: "anchor_variation_mm", val: metrics_l3 && metrics_l3.anchor_variation_mm },
    { key: "pre_release_bow_drop", val: metrics_l3 && metrics_l3.pre_release_bow_drop },
    { key: "pre_release_draw_motion", val: metrics_l3 && metrics_l3.pre_release_draw_motion },
    { key: "post_release_head_drop", val: metrics_l3 && metrics_l3.post_release_head_drop },
    { key: "post_release_shoulder_collapse", val: metrics_l3 && metrics_l3.post_release_shoulder_collapse },
  ].filter((c) => Number.isFinite(c.val));
  if (!candidates.length) return null;
  if (baseline && baseline.sample_count >= 2) {
    let worst = null;
    let worstRatio = 0;
    candidates.forEach((c) => {
      const base = baseline[c.key];
      if (!Number.isFinite(base) || base <= 0) return;
      const ratio = c.val / base;
      if (ratio > worstRatio) { worstRatio = ratio; worst = c.key; }
    });
    if (worst) return worst;
  }
  return candidates.sort((a, b) => b.val - a.val)[0].key;
}

function formPrecisionCorrelationComment(run) {
  const m = run && run.metrics_l3;
  const corr = m && m.correlation;
  if (!corr || corr.grouping_rr == null) {
    return "着弾データが揃うと、保持・リリース指標との並置ができます。";
  }
  const parts = [];
  if (m.hold_bow_rms_cm != null) {
    parts.push(`直近エンド grouping ${corr.grouping_rr.toFixed(1)}cm・弓保持揺れ ${m.hold_bow_rms_cm}cm 相当を記録しました（因果の断定はしません）`);
  }
  if (corr.session_avg_rr != null && corr.grouping_rr > corr.session_avg_rr * 1.2) {
    parts.push("直近エンドの grouping はセッション平均より広めです");
  }
  if (m.pre_release_bow_drop != null && m.pre_release_bow_drop > 0.12) {
    parts.push(`リリース前 0.5s で弓手が ${m.pre_release_bow_drop}cm 相当動いています`);
  }
  return parts.join("。") + (parts.length ? "。" : "");
}

function formPrecisionModeFromRoot(root) {
  if (!root) return "simple";
  const on = root.querySelector("[data-form-mode='precision']");
  return on && on.classList.contains("on") ? "precision" : "simple";
}

function formMarkerConfigFromRoot(root) {
  if (!root) return parseMarkerConfig("none", "none");
  const grip = root.querySelector("#formGripColor");
  const nock = root.querySelector("#formNockColor");
  return parseMarkerConfig(grip ? grip.value : "none", nock ? nock.value : "none");
}

function formPrecisionSummaryHtml(run, sess) {
  if (!run) return "";
  const p = run.phases_sec || {};
  const m = run.metrics_l3 || {};
  const conf = run.confidence || {};
  const baseline = formPrecisionBaselineForSession(sess);
  const deltas = formPrecisionBaselineDelta(m, baseline);
  const phaseTxt = [
    p.draw_start != null ? `引き ${p.draw_start.toFixed(1)}s` : null,
    p.release != null ? `リリース ${p.release.toFixed(1)}s` : null,
  ].filter(Boolean).join(" · ");
  const l3Lines = [
    m.hold_bow_rms_cm != null ? `弓保持 ${m.hold_bow_rms_cm}cm` : null,
    m.hold_head_rms_cm != null ? `頭 ${m.hold_head_rms_cm}cm` : null,
    m.anchor_variation_mm != null ? `アンカー ±${m.anchor_variation_mm}mm` : null,
    m.pre_release_bow_drop != null ? `リリース前弓 ${m.pre_release_bow_drop}cm` : null,
  ].filter(Boolean).join(" · ");
  return `<div class="formPrecisionSummary">
    <div class="k">精密ログ ${run.video_meta && run.video_meta.frame_count ? run.video_meta.frame_count + "F" : ""}
      ${run.mode === "precision_fp3" || run.mode === "precision_fp2" ? " · L3" : ""}</div>
    <div>${phaseTxt || "フェーズ検出待ち"}</div>
    ${l3Lines ? `<div class="mini">${l3Lines}</div>` : ""}
    <div class="mini">bow追跡 ${conf.bow_track != null ? Math.round(conf.bow_track * 100) + "%" : "—"}
      ${m.bow_track_source ? ` · ${m.bow_track_source}` : ""}
      ${m.release_vector ? ` · リリース ${m.release_vector.dir}` : ""}</div>
    ${formatBaselineDeltaHtml(deltas, baseline)}
  </div>`;
}

function sessionLatestEndGroupingRr(sess) {
  const ends = (sess && sess.ends) || [];
  if (!ends.length) return null;
  const lastEnd = ends[ends.length - 1];
  if (!lastEnd || lastEnd.length < 2) return null;
  const st = robustStats(lastEnd);
  return st && st.rr != null ? st.rr : null;
}

function formPrecisionCorrelationHtml(sess) {
  const runs = (sess && sess.formPrecisionRuns) || [];
  if (!runs.length) return "";
  const run = runs[runs.length - 1];
  if (!isPrecisionFpRun(run)) return "";
  const m = run.metrics_l3 || {};
  const corr = m.correlation || {};
  const bowConf = run.confidence && run.confidence.bow_track;
  const rel = m.release_vector;
  const baseline = formPrecisionBaselineForSession(sess);
  const deltas = formPrecisionBaselineDelta(m, baseline);
  const comment = formPrecisionCorrelationComment(run);
  const metricRows = [
    ["弓保持 RMS", m.hold_bow_rms_cm != null ? `${m.hold_bow_rms_cm} cm` : "—"],
    ["頭 RMS", m.hold_head_rms_cm != null ? `${m.hold_head_rms_cm} cm` : "—"],
    ["アンカーばらつき", m.anchor_variation_mm != null ? `${m.anchor_variation_mm} mm` : "—"],
    ["リリース前弓", m.pre_release_bow_drop != null ? `${m.pre_release_bow_drop} cm` : "—"],
    ["リリース前引き", m.pre_release_draw_motion != null ? `${m.pre_release_draw_motion} cm` : "—"],
    ["リリース後頭", m.post_release_head_drop != null ? `${m.post_release_head_drop} cm` : "—"],
    ["bow追跡", bowConf != null ? `${Math.round(bowConf * 100)}%` : "—"],
    ["リリース方向", rel ? `${rel.dir} (${rel.angle_deg}°)` : "—"],
  ].map(([k, v]) => `<div class="formCorrMetric"><span>${esc(k)}</span><b>${esc(String(v))}</b></div>`).join("");
  return `<details class="adv formPrecisionCorrCard" open>
    <summary>射形×着弾（練習用）</summary>
    <div class="formCorrTop">
      <div class="formCorrStat"><span>直近エンド</span><b>${corr.grouping_rr != null ? corr.grouping_rr.toFixed(1) + " cm" : "—"}</b></div>
      <div class="formCorrStat"><span>セッション平均</span><b>${corr.session_avg_rr != null ? corr.session_avg_rr.toFixed(1) + " cm" : "—"}</b></div>
      <div class="formCorrStat"><span>エンド</span><b>${corr.end_index != null ? corr.end_index + 1 : "—"}</b></div>
    </div>
    <div class="formCorrMetrics">${metricRows}</div>
    ${formatBaselineDeltaHtml(deltas, baseline)}
    <div class="note formCorrComment">${esc(comment)}</div>
  </details>`;
}

/* ---------- §43 FP4: benchmark + error report + expectations UI ---------- */
const FORM_BENCHMARK_PUBLIC = Object.freeze({
  version: "fp4-1",
  label: "練習用・参考値（シミュレーション）",
  release_direction_accuracy_pct: 92,
  bow_track_mae_cm: 2.4,
  anchor_variation_mae_mm: 12,
  updated: "2026-06-21",
});

const FORM_EXPECTATIONS_437 = Object.freeze([
  "伸び合いの直接計測はできません（リリース前0.5秒の代理指標のみ）",
  "色マーカーなしでは弦・弓具の追跡精度を保証しません",
  "コーチ・審判の代替ではありません（練習用計測）",
  "服・照明が変わると本人ベースラインの再キャリブレーションが必要です",
]);

function attachBenchmarkToRun(run, benchResult) {
  if (!run || !benchResult) return run;
  run.benchmark = {
    version: benchResult.version || FORM_BENCHMARK_PUBLIC.version,
    case_id: benchResult.case_id || null,
    errors: benchResult.errors || [],
  };
  return run;
}

function formConfBadge(label, val) {
  if (val == null) return `<span class="formBenchBadge na">${esc(label)} —</span>`;
  const pct = Math.round(val * 100);
  const cls = val >= 0.7 ? "ok" : val >= 0.45 ? "warn" : "low";
  return `<span class="formBenchBadge ${cls}">${esc(label)} ${pct}%</span>`;
}

function formExpectationsBlockHtml(compact) {
  const items = FORM_EXPECTATIONS_437.map((t) => `<li>${esc(t)}</li>`).join("");
  if (compact) {
    return `<p class="formFpDisclaimer formFpDisclaimerCompact">練習用計測 — コーチ・審判の代替ではありません。無マーカー時は弓追跡を保証しません。</p>`;
  }
  return `<details class="adv formExpectations437">
    <summary>練習用計測の期待値</summary>
    <ul class="formExpectList">${items}</ul>
    <p class="mini">公式マーカー・審判システムの代替ではありません（ペア採点と同様のトーン）。</p>
  </details>`;
}

function formBenchAccuracyBlockHtml() {
  const b = FORM_BENCHMARK_PUBLIC;
  return `<div class="formBenchAccuracy">
    <div class="k">計測精度（開発ベンチマーク）</div>
    <p class="mini">${esc(b.label)} · v${esc(b.version)}</p>
    <div class="formBenchStats">
      <span>リリース方向 分類 ~${b.release_direction_accuracy_pct}%</span>
      <span>弓追跡 MAE ~${b.bow_track_mae_cm} cm</span>
      <span>アンカー MAE ~${b.anchor_variation_mae_mm} mm</span>
    </div>
  </div>`;
}

function renderFormPrecisionErrorReport(run, sess) {
  if (!run || !isPrecisionFpRun(run)) return "";
  const m = run.metrics_l3 || {};
  const conf = run.confidence || {};
  const baseline = formPrecisionBaselineForSession(sess);
  const deltas = formPrecisionBaselineDelta(m, baseline);
  const weak = weakestL3Metric(m, baseline);
  const rows = [
    ["hold_head_rms_cm", "頭 RMS", "cm"],
    ["hold_bow_rms_cm", "弓保持 RMS", "cm"],
    ["bow_hand_rms_cm", "弓手 RMS", "cm"],
    ["anchor_variation_mm", "アンカーばらつき", "mm"],
    ["pre_release_bow_drop", "リリース前弓", "cm"],
    ["pre_release_draw_motion", "リリース前引き", "cm"],
    ["post_release_head_drop", "リリース後頭", "cm"],
    ["post_release_shoulder_collapse", "リリース後肩", "cm"],
  ];
  const tableRows = rows.map(([key, label, unit]) => {
    const val = m[key];
    const base = baseline && baseline[key];
    const delta = deltas && deltas[key];
    const weakCls = weak === key ? " formErrorWeak" : "";
    const valTxt = val != null ? `${val} ${unit}` : "—";
    const deltaTxt = delta != null ? `${delta >= 0 ? "+" : ""}${delta}${unit}` : (baseline && baseline.sample_count >= 2 ? "—" : "");
    return `<tr class="${weakCls}">
      <td>${esc(label)}${weak === key ? " ★" : ""}</td>
      <td>${esc(valTxt)}</td>
      <td>${base != null ? `${base} ${unit}` : "—"}</td>
      <td>${esc(deltaTxt)}</td>
    </tr>`;
  }).join("");
  const benchNote = run.benchmark && run.benchmark.case_id
    ? `<div class="mini">ベンチマーク ${esc(run.benchmark.case_id)} · ${(run.benchmark.errors || []).length ? "差分あり" : "OK"}</div>`
    : "";
  return `<div class="formErrorReport">
    <div class="k">誤差レポート（本人ベースライン比較）</div>
    <div class="formErrorBadges">
      ${formConfBadge("総合", conf.overall)}
      ${formConfBadge("bow追跡", conf.bow_track)}
      ${formConfBadge("撮影", conf.capture)}
    </div>
    ${baseline && baseline.sample_count >= 2
    ? `<table class="formErrorTbl"><thead><tr><th>指標</th><th>今回</th><th>基準</th><th>差分</th></tr></thead><tbody>${tableRows}</tbody></table>`
    : `<p class="mini formBaselinePending">ベースライン形成中（精密ログをあと ${Math.max(0, FP3_BASELINE_N - (baseline && baseline.sample_count || 0))} 回）</p>`}
    ${weak ? `<p class="mini">注目指標: ${esc(FP3_METRIC_LABELS[weak] || weak)}</p>` : ""}
    ${benchNote}
    ${formExpectationsBlockHtml(false)}
  </div>`;
}

function generateSelfCompareComment(metrics, prev, extra) {
  extra = extra || {};
  const block = buildStructuredFormComment(metrics, {
    phase: extra.phase,
    preRelease: extra.preRelease,
    anchorVariation: extra.anchorVariation,
    hold: extra.hold,
    deltaHold: extra.deltaHold,
    prev,
  });
  return [...block.facts, ...block.causes, ...block.checks, ...block.next].slice(0, 8);
}

async function loadFormLandmarker() {
  if (formLandmarker) return formLandmarker;
  const mpModule = await import(FORM_BUNDLE_URL);
  const { FilesetResolver, PoseLandmarker } = mpModule;
  const vision = await FilesetResolver.forVisionTasks(FORM_WASM_BASE);
  const modelUrl = new URL(FORM_MODEL_PATH, location.href).href;
  const modelRes = await fetch(modelUrl);
  if (!modelRes.ok) throw new Error("射形モデルを読み込めませんでした");
  const modelBlob = new Blob([await modelRes.arrayBuffer()], { type: "application/octet-stream" });
  formLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: URL.createObjectURL(modelBlob), delegate: "CPU" },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.45,
  });
  return formLandmarker;
}

function stopFormCoach(skipFinalize) {
  if (!formSession) return;
  const handedness = formSession.handedness || "right";
  const distHint = formSession.distHintM;
  if (!skipFinalize && formSession.fpFrames && formSession.fpFrames.length >= 10) {
    finalizeLivePrecisionRun(formSession, handedness, distHint);
  }
  if (formSession.raf) cancelAnimationFrame(formSession.raf);
  if (formSession.stream) formSession.stream.getTracks().forEach((t) => t.stop());
  if (formSession.videoUrl) URL.revokeObjectURL(formSession.videoUrl);
  formSession = null;
  formMetricsEma = null;
  ui.formBound = false;
}

function appendFormAnalysisToSession(analysis) {
  const target = db.active || (db.sessions.length ? db.sessions[db.sessions.length - 1] : null);
  if (!target) return;
  if (!target.formAnalyses) target.formAnalyses = [];
  target.formAnalyses.push(analysis);
  if (target.formAnalyses.length > 30) target.formAnalyses = target.formAnalyses.slice(-30);
  save("form-analysis");
}

async function startFormCoachLoop(root) {
  const video = root.querySelector("#formVideo");
  const canvas = root.querySelector("#formOverlay");
  const status = root.querySelector("#formStatus");
  const landmarker = await loadFormLandmarker();
  let lastVideoTime = -1;
  const history = [];
  const trails = { head: [], bow: [], draw: [] };
  const handedness = root.querySelector("#formHand") ? root.querySelector("#formHand").value : "right";
  const mirror = true;
  if (formSession) {
    formSession.trails = trails;
    formSession.phaseClock = {};
    formSession.lastPhase = null;
  }

  async function tick() {
    if (!formSession || !formSession.running) return;
    if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      try {
        const res = await landmarker.detectForVideo(video, performance.now());
        const lms = res && res.landmarks;
        const metrics = computeFormMetrics(lms, handedness);
        let vel = 0;
        if (metrics && history.length) {
          const prev = history[history.length - 1];
          if (prev.metrics && prev.metrics.drawWrist && metrics.drawWrist) {
            vel = formDist(prev.metrics.drawWrist, metrics.drawWrist) * 1000 / 33;
          }
        }
        history.push({ metrics, vel, ts: Date.now() });
        if (history.length > 26) history.shift();
        if (formSession) {
          if (!formSession.fpFrames) formSession.fpFrames = [];
          formSession.fpFrames.push(buildPrecisionFrame(lms, video.currentTime, handedness));
          if (formSession.fpFrames.length > 900) formSession.fpFrames = formSession.fpFrames.slice(-900);
        }
        const { phase, released } = detectFormPhase(metrics, history, 1.2);
        trackFormPhaseClock(formSession, phase, video.currentTime);
        const durationsLive = formPhaseDurations(formSession);
        const targetSess = db.active || (db.sessions.length ? db.sessions[db.sessions.length - 1] : null);
        const prevListLive = (targetSess && targetSess.formAnalyses) || [];
        const prevLive = prevListLive[prevListLive.length - 1];
        const anchorVarLive = anchorVariationStats(prevListLive);
        const preLive = (phase === "FULL_DRAW" || phase === "ANCHORING") && formSession
          ? measurePreReleaseWindow(history, Date.now(), 0.5) : null;
        const structured = buildStructuredFormComment(metrics, {
          phase, preRelease: preLive, anchorVariation: anchorVarLive,
          hold: durationsLive.hold, deltaHold: durationsLive.hold != null && prevLive && prevLive.phaseSeconds
            ? durationsLive.hold - (prevLive.phaseSeconds.hold || 0) : null, prev: prevLive,
        });
        const advice = generateFormAdvice(metrics, phase);
        const righty = handedness !== "left";
        const lm = lms && lms[0];
        if (lm) {
          const nose = lm[FORM_LM.NOSE];
          const bW = righty ? lm[FORM_LM.LEFT_WRIST] : lm[FORM_LM.RIGHT_WRIST];
          const dW = righty ? lm[FORM_LM.RIGHT_WRIST] : lm[FORM_LM.LEFT_WRIST];
          if (nose) pushFormTrail(trails, "head", { x: mirror ? 1 - nose.x : nose.x, y: nose.y });
          if (bW) pushFormTrail(trails, "bow", { x: mirror ? 1 - bW.x : bW.x, y: bW.y });
          if (dW) pushFormTrail(trails, "draw", { x: mirror ? 1 - dW.x : dW.x, y: dW.y });
        }
        if (canvas) {
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 480;
          drawFormOverlay(canvas, lms, metrics, phase, { handedness, mirror, trails });
        }
        const durations = formPhaseDurations(formSession);
        const holdTxt = durations.hold != null && durations.hold > 0 ? ` · 保持 ${durations.hold.toFixed(1)}s` : "";
        if (status && metrics) status.textContent = `${phase} · 総合 ${metrics.score} · 信頼 ${metrics.confidence}%${holdTxt}`;
        const adviceEl = root.querySelector("#formAdvice");
        if (adviceEl) adviceEl.innerHTML = structuredCommentHtml(structured);
        const metricsEl = root.querySelector("#formMetrics");
        if (metricsEl && metrics) {
          metricsEl.innerHTML = [
            ["弓腕", metrics.bowArmScore], ["力のライン", metrics.forceLineScore], ["引き肘", metrics.drawElbowScore],
            ["肩", metrics.shoulderScore], ["アンカー", metrics.anchorScore], ["総合", metrics.score],
          ].map(([k, v]) => `<div class="formMetric"><div class="k">${k}</div><b>${v}</b></div>`).join("");
        }
        const compareEl = root.querySelector("#formCompare");
        if (compareEl && metrics) {
          const target = db.active || (db.sessions.length ? db.sessions[db.sessions.length - 1] : null);
          const prevList = (target && target.formAnalyses) || [];
          const prev = prevList[prevList.length - 1];
          const anchorVar = anchorVariationStats(prevList);
          const preWin = measurePreReleaseWindow(history, Date.now(), 0.5);
          const comments = generateSelfCompareComment(metrics, prev, {
            phase, preRelease: preWin, anchorVariation: anchorVar, hold: durations.hold,
          });
          compareEl.innerHTML = comments.map((t) => `<div class="formCompareItem">${esc(t)}</div>`).join("");
        }
        if (released && metrics) {
          const target = db.active || (db.sessions.length ? db.sessions[db.sessions.length - 1] : null);
          const prevList = (target && target.formAnalyses) || [];
          const prev = prevList[prevList.length - 1];
          const durations = formPhaseDurations(formSession);
          const releaseTs = Date.now();
          const preRelease = measurePreReleaseWindow(history, releaseTs, 0.5);
          const anchorVariation = anchorVariationStats(prevList);
          const deltaHold = durations.hold != null && prev && prev.phaseSeconds && prev.phaseSeconds.hold != null
            ? durations.hold - prev.phaseSeconds.hold : null;
          const structuredComment = buildStructuredFormComment(metrics, {
            phase, preRelease, anchorVariation, hold: durations.hold, deltaHold, prev,
          });
          const analysis = {
            id: uid(), ts: Date.now(), phase, score: metrics.score, metrics, advice,
            phaseSeconds: durations, preRelease, anchorVariation, structuredComment,
            selfCompare: generateSelfCompareComment(metrics, prev, {
              phase, preRelease, anchorVariation, hold: durations.hold, deltaHold,
            }),
          };
          appendFormAnalysisToSession(analysis);
          if (formSession) {
            formSession.phaseClock = {};
            formSession.lastPhase = null;
          }
          nativePulse("success");
          toast(`射形を記録（スコア ${metrics.score}）`);
        }
      } catch (_) { /* skip frame */ }
    }
    formSession.raf = requestAnimationFrame(tick);
  }
  formSession.running = true;
  tick();
}

function markerColorOptionsHtml() {
  const keys = ["none", "red", "blue", "green", "yellow"];
  const labels = { none: "なし", red: "赤", blue: "青", green: "緑", yellow: "黄" };
  return keys.map((k) => `<option value="${k}">${labels[k]}</option>`).join("");
}

function syncFormModeUi(root) {
  const isPrec = formPrecisionModeFromRoot(root) === "precision";
  const optsEl = root.querySelector("#formPrecisionOpts");
  if (optsEl) optsEl.hidden = !isPrec;
}

function renderFormCoachPanel(mount) {
  stopFormCoach();
  mount.innerHTML = `
  <section class="card formCoachPanel">
    <h2>射形の確認</h2>
    <p>カメラまたは動画でフォームを確認。頭・弓手・引き手の動きとコメントを表示します。</p>
    ${formExpectationsBlockHtml(false)}
    ${formBenchAccuracyBlockHtml()}
    <div class="formModeRow">
      <span class="f">解析モード</span>
      <div class="formModeChips">
        <button type="button" class="chip on" data-form-mode="simple">簡易（骨格のみ）</button>
        <button type="button" class="chip" data-form-mode="precision">精密（弓具追跡）</button>
      </div>
    </div>
    <div id="formPrecisionOpts" class="formPrecisionOpts" hidden>
      <div class="formFpDisclaimer formFpDisclaimerPrec">練習用計測 — 色マーカー未使用時は手首代理で追跡します。コーチ・審判の代替ではありません。</div>
      <div class="row">
        <div><label class="f">グリップ色マーカー</label><select class="inp" id="formGripColor">${markerColorOptionsHtml()}</select></div>
        <div><label class="f">ノック色マーカー</label><select class="inp" id="formNockColor">${markerColorOptionsHtml()}</select></div>
      </div>
    </div>
    <div id="formQualityGate"></div>
    <div id="formPrecisionSummary"></div>
    <div id="formPrecisionErrorReport"></div>
    <div class="formVideoWrap">
      <video id="formVideo" autoplay playsinline muted></video>
      <canvas id="formOverlay"></canvas>
    </div>
    <div class="formStatus" id="formStatus">準備中…</div>
    <div class="row">
      <div><label class="f">利き手</label><select class="inp" id="formHand"><option value="right">右利き</option><option value="left">左利き</option></select></div>
      <div><label class="f">撮影距離 (m・任意)</label><input class="inp" id="formDistHint" type="number" min="1" max="8" step="0.5" placeholder="例: 2.5"></div>
      <div><label class="f">入力</label><input type="file" id="formFile" accept="video/*" class="inp"></div>
    </div>
    <div class="btnrow">
      <button class="btn sec" id="formCamStart" type="button">カメラ開始</button>
      <button class="btn ghost" id="formCamStop" type="button">停止</button>
    </div>
    <div class="formMetrics" id="formMetrics"></div>
    <div class="formCompare" id="formCompare"></div>
    <div class="formAdvice" id="formAdvice"></div>
  </section>`;
  const root = mount;
  root.querySelectorAll("[data-form-mode]").forEach((btn) => {
    btn.onclick = () => {
      root.querySelectorAll("[data-form-mode]").forEach((b) => b.classList.toggle("on", b === btn));
      syncFormModeUi(root);
    };
  });
  syncFormModeUi(root);
  root.querySelector("#formCamStart").onclick = async () => {
    stopFormCoach();
    const video = root.querySelector("#formVideo");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      video.srcObject = stream;
      video.src = "";
      await video.play();
      const distHint = parseFloat(root.querySelector("#formDistHint") && root.querySelector("#formDistHint").value) || null;
      const precisionMode = formPrecisionModeFromRoot(root);
      const markerConfig = formMarkerConfigFromRoot(root);
      formSession = {
        stream, running: false, lastReleaseTs: 0, raf: 0, fpFrames: [],
        handedness: root.querySelector("#formHand").value, distHintM: distHint,
        precisionMode, markerConfig,
      };
      ui.formBound = true;
      await startFormCoachLoop(root);
      root.querySelector("#formStatus").textContent = precisionMode === "precision" ? "精密解析中…" : "解析中…";
    } catch (err) {
      toast(err && err.message ? err.message : "カメラを起動できませんでした");
    }
  };
  root.querySelector("#formCamStop").onclick = () => {
    const precisionMode = formPrecisionModeFromRoot(root);
    const sumEl = root.querySelector("#formPrecisionSummary");
    if (precisionMode === "precision" && formSession && formSession.fpFrames && formSession.fpFrames.length >= 10) {
      const run = finalizeLivePrecisionRun(formSession, formSession.handedness, formSession.distHintM);
      const errEl = root.querySelector("#formPrecisionErrorReport");
      if (sumEl && run) sumEl.innerHTML = formPrecisionSummaryHtml(run, db.active);
      if (errEl && run) errEl.innerHTML = renderFormPrecisionErrorReport(run, db.active);
    }
    stopFormCoach();
    root.querySelector("#formStatus").textContent = "停止しました";
  };
  root.querySelector("#formFile").onchange = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    stopFormCoach();
    const video = root.querySelector("#formVideo");
    const gateEl = root.querySelector("#formQualityGate");
    const sumEl = root.querySelector("#formPrecisionSummary");
    const errEl = root.querySelector("#formPrecisionErrorReport");
    const statusEl = root.querySelector("#formStatus");
    const handedness = root.querySelector("#formHand").value;
    const distHint = parseFloat(root.querySelector("#formDistHint") && root.querySelector("#formDistHint").value) || null;
    const precisionMode = formPrecisionModeFromRoot(root);
    const markerConfig = formMarkerConfigFromRoot(root);
    const url = URL.createObjectURL(file);
    video.srcObject = null;
    video.src = url;
    video.controls = true;
    video.muted = true;
    await new Promise((r) => { video.onloadedmetadata = r; });
    if (statusEl) statusEl.textContent = precisionMode === "precision" ? "精密モードでフレーム解析中…" : "動画をフレーム解析中…";
    try {
      const landmarker = await loadFormLandmarker();
      const { run, quality } = await runFormPrecisionPipeline(video, landmarker, handedness, {
        distHintM: distHint, fps: 30, precisionMode, markerConfig,
      });
      if (gateEl) gateEl.innerHTML = formQualityGateHtml(quality);
      if (sumEl && precisionMode === "precision") sumEl.innerHTML = formPrecisionSummaryHtml(run, db.active);
      if (errEl && precisionMode === "precision") errEl.innerHTML = renderFormPrecisionErrorReport(run, db.active);
      const bowConf = run.confidence && run.confidence.bow_track;
      if (precisionMode === "precision") {
        const proxyWarn = (run.video_meta.warnings || []).some((w) => w.includes("手首") || w.includes("マーカー"));
        if (proxyWarn) toast("色マーカー未使用 — 手首代理で弓具追跡しています");
        else if (bowConf != null && bowConf < 0.5) toast("弓具追跡の信頼度が低いです。色マーカーを試してください");
        else toast(`精密ログ保存（${run.frames.length}F · bow ${Math.round((bowConf || 0) * 100)}%）`);
      } else if (!quality.ok) toast(quality.warnings[0] || "撮影品質を確認してください");
      else toast(`解析ログ保存（${run.frames.length}フレーム）`);
    } catch (err) {
      if (gateEl) gateEl.innerHTML = "";
      if (sumEl) sumEl.innerHTML = "";
      if (errEl) errEl.innerHTML = "";
      toast(err && err.message ? err.message : "動画解析に失敗しました");
    }
    await video.play().catch(() => {});
    formSession = {
      videoUrl: url, running: false, lastReleaseTs: 0, raf: 0, fpFrames: [],
      handedness, distHintM: distHint, precisionMode, markerConfig,
    };
    ui.formBound = true;
    await startFormCoachLoop(root);
    if (statusEl) statusEl.textContent = precisionMode === "precision" ? "精密解析中…" : "解析中…";
  };
}

function formContextForSession(session) {
  const list = (session && session.formAnalyses) || [];
  const latest = list[list.length - 1];
  const prev = list.length > 1 ? list[list.length - 2] : null;
  const prRuns = (session && session.formPrecisionRuns) || [];
  const prLatest = prRuns.length ? prRuns[prRuns.length - 1] : null;
  const hasPrecision = isPrecisionFpRun(prLatest) && prLatest.metrics_l3;
  if (!latest && !hasPrecision) return null;
  const hold = latest && latest.phaseSeconds && latest.phaseSeconds.hold != null ? latest.phaseSeconds.hold : null;
  const deltaHold = hold != null && prev && prev.phaseSeconds && prev.phaseSeconds.hold != null
    ? hold - prev.phaseSeconds.hold : null;
  const weakest = latest && latest.metrics
    ? [["bow", latest.metrics.bowArmScore], ["anchor", latest.metrics.anchorScore], ["head", latest.metrics.headScore], ["force", latest.metrics.forceLineScore]]
        .filter((x) => x[1] != null)
        .sort((a, b) => a[1] - b[1])[0]
    : null;
  const baseline = formPrecisionBaselineForSession(session);
  const ctx = {
    overall: latest ? latest.score : (hasPrecision ? Math.round((prLatest.confidence.overall || 0.5) * 100) : null),
    score: latest ? latest.score : (hasPrecision ? Math.round((prLatest.confidence.overall || 0.5) * 100) : null),
    phase: latest ? latest.phase : null,
    confidence: latest && latest.metrics ? latest.metrics.confidence : null,
    weakest_phase: weakest ? weakest[0] : null,
    delta_vs_last: deltaHold != null ? { hold_duration: `${deltaHold >= 0 ? "+" : ""}${deltaHold.toFixed(1)}s` } : {},
    pre_release: latest ? latest.preRelease || null : null,
    anchor_variation: latest ? latest.anchorVariation || null : null,
    structured_comment: latest ? latest.structuredComment || null : null,
    top_comment: latest
      ? ((latest.structuredComment && latest.structuredComment.checks && latest.structuredComment.checks[0])
        || (latest.selfCompare && latest.selfCompare[0]) || null)
      : null,
  };
  if (hasPrecision) {
    const m3 = prLatest.metrics_l3;
    ctx.has_precision = true;
    ctx.metrics_l3 = m3;
    ctx.confidence_bow_track = prLatest.confidence && prLatest.confidence.bow_track;
    ctx.precision_confidence = prLatest.confidence && prLatest.confidence.overall;
    ctx.correlation = m3.correlation || null;
    ctx.weakest_l3_metric = weakestL3Metric(m3, baseline);
    ctx.baseline_delta = formPrecisionBaselineDelta(m3, baseline);
    ctx.precision_mode = prLatest.mode;
    if (!ctx.top_comment && m3.correlation && m3.correlation.grouping_rr != null) {
      ctx.top_comment = formPrecisionCorrelationComment(prLatest);
    }
  }
  return ctx;
}

if (typeof window !== "undefined") {
  window.ArcherForm = {
    ELITE_FORM_REFERENCE,
    loadFormLandmarker,
    computeFormMetrics,
    detectFormPhase,
    generateFormAdvice,
    generateSelfCompareComment,
    measurePreReleaseWindow,
    anchorVariationStats,
    buildStructuredFormComment,
    structuredCommentHtml,
    formPhaseDurations,
    drawFormOverlay,
    renderFormCoachPanel,
    stopFormCoach,
    formContextForSession,
    appendFormAnalysisToSession,
    buildPrecisionFrame,
    assessCaptureQuality,
    estimateCameraAngle,
    buildFormCalibration,
    movementNormToCm,
    buildFormPrecisionRun,
    appendFormPrecisionRun,
    scanVideoAllFrames,
    runFormPrecisionPipeline,
    formQualityGateHtml,
    detectPhasesFromFrameSeries,
    formPrecisionPhasesSec,
    parseMarkerConfig,
    attachBowTracksToFrames,
    aggregateBowTrackConfidence,
    computeFp2Metrics,
    computeFp3Metrics,
    formPrecisionSummaryHtml,
    formPrecisionCorrelationHtml,
    formPrecisionBaselineDelta,
    weakestL3Metric,
    updateFormPrecisionBaseline,
    renderFormPrecisionErrorReport,
    formExpectationsBlockHtml,
    formBenchAccuracyBlockHtml,
    attachBenchmarkToRun,
    FORM_BENCHMARK_PUBLIC,
  };
}