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

function generateFormAdvice(m, phase) {
  if (!m) return [];
  const out = [];
  if (m.bowArmScore < 55) out.push({ type: "bad", text: "弓腕が曲がっています。肘を内旋させ、肩〜肘〜手首を一直線に。" });
  else if (m.bowArmScore < 78) out.push({ type: "warn", text: "弓腕の伸びをもう少し。トップ選手はリリースまで肘を固定します。" });
  else out.push({ type: "good", text: "弓腕の安定性は良好です。" });
  if (m.forceLineScore < 50) out.push({ type: "bad", text: "引き肘が力のラインから外れています。肘を弓弦側へ。" });
  else if (m.forceLineScore < 75) out.push({ type: "warn", text: "引き肘を肩〜手首のライン上に微調整してください。" });
  else out.push({ type: "good", text: "引き肘は力のライン上にあります。" });
  if (m.shoulderScore < 55) out.push({ type: "bad", text: "肩の高さが揃っていません。弓肩を下げ、引き肩をわずかに低く。" });
  if ((phase === "FULL_DRAW" || phase === "ANCHORING") && m.anchorScore < 55) out.push({ type: "bad", text: "アンカー位置を顎の横に固定しましょう。" });
  if (phase === "RELEASE") out.push({ type: "good", text: "リリースを検知しました。" });
  return out.slice(0, 5);
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
  ctx.strokeStyle = "rgba(14,165,233,0.75)"; ctx.lineWidth = 3;
  [[bS, bE], [bE, bW], [dS, dE], [dE, dW], [bS, dS], [bS, nose], [dS, nose]].forEach(([p1, p2]) => {
    if (p1 && p2) { ctx.beginPath(); ctx.moveTo(p1.x * w, p1.y * h); ctx.lineTo(p2.x * w, p2.y * h); ctx.stroke(); }
  });
  if (phase === "RELEASE" || phase === "FOLLOW") {
    ctx.strokeStyle = "#eab308"; ctx.beginPath(); ctx.arc(dW.x * w, dW.y * h, 14, 0, Math.PI * 2); ctx.stroke();
  }
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

function stopFormCoach() {
  if (!formSession) return;
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
  const handedness = root.querySelector("#formHand") ? root.querySelector("#formHand").value : "right";
  const mirror = true;

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
        const { phase, released } = detectFormPhase(metrics, history, 1.2);
        const advice = generateFormAdvice(metrics, phase);
        if (canvas) {
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 480;
          drawFormOverlay(canvas, lms, metrics, phase, { handedness, mirror });
        }
        if (status && metrics) status.textContent = `${phase} · 総合 ${metrics.score} · 信頼 ${metrics.confidence}%`;
        const adviceEl = root.querySelector("#formAdvice");
        if (adviceEl) adviceEl.innerHTML = advice.map((a) => `<div class="formAdviceItem ${a.type}"><span>${a.type === "bad" ? "✕" : a.type === "warn" ? "！" : "✓"}</span><span>${esc(a.text)}</span></div>`).join("");
        const metricsEl = root.querySelector("#formMetrics");
        if (metricsEl && metrics) {
          metricsEl.innerHTML = [
            ["弓腕", metrics.bowArmScore], ["力のライン", metrics.forceLineScore], ["引き肘", metrics.drawElbowScore],
            ["肩", metrics.shoulderScore], ["アンカー", metrics.anchorScore], ["総合", metrics.score],
          ].map(([k, v]) => `<div class="formMetric"><div class="k">${k}</div><b>${v}</b></div>`).join("");
        }
        if (released && metrics) {
          const analysis = { id: uid(), ts: Date.now(), phase, score: metrics.score, metrics, advice };
          appendFormAnalysisToSession(analysis);
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

function renderFormCoachPanel(mount) {
  stopFormCoach();
  mount.innerHTML = `
  <section class="card formCoachPanel">
    <h2>射形コーチ</h2>
    <p>カメラまたは動画でフォームをリアルタイム分析。リリース時にセッションへ自動記録します。</p>
    <div class="formVideoWrap">
      <video id="formVideo" autoplay playsinline muted></video>
      <canvas id="formOverlay"></canvas>
    </div>
    <div class="formStatus" id="formStatus">準備中…</div>
    <div class="row">
      <div><label class="f">利き手</label><select class="inp" id="formHand"><option value="right">右利き</option><option value="left">左利き</option></select></div>
      <div><label class="f">入力</label><input type="file" id="formFile" accept="video/*" class="inp"></div>
    </div>
    <div class="btnrow">
      <button class="btn sec" id="formCamStart" type="button">カメラ開始</button>
      <button class="btn ghost" id="formCamStop" type="button">停止</button>
    </div>
    <div class="formMetrics" id="formMetrics"></div>
    <div class="formAdvice" id="formAdvice"></div>
  </section>`;
  const root = mount;
  root.querySelector("#formCamStart").onclick = async () => {
    stopFormCoach();
    const video = root.querySelector("#formVideo");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      video.srcObject = stream;
      video.src = "";
      await video.play();
      formSession = { stream, running: false, lastReleaseTs: 0, raf: 0 };
      ui.formBound = true;
      await startFormCoachLoop(root);
      root.querySelector("#formStatus").textContent = "解析中…";
    } catch (err) {
      toast(err && err.message ? err.message : "カメラを起動できませんでした");
    }
  };
  root.querySelector("#formCamStop").onclick = () => { stopFormCoach(); root.querySelector("#formStatus").textContent = "停止しました"; };
  root.querySelector("#formFile").onchange = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    stopFormCoach();
    const video = root.querySelector("#formVideo");
    const url = URL.createObjectURL(file);
    video.srcObject = null;
    video.src = url;
    video.controls = true;
    video.muted = true;
    await new Promise((r) => { video.onloadedmetadata = r; });
    await video.play().catch(() => {});
    formSession = { videoUrl: url, running: false, lastReleaseTs: 0, raf: 0 };
    ui.formBound = true;
    await startFormCoachLoop(root);
  };
}

function formContextForSession(session) {
  const list = (session && session.formAnalyses) || [];
  const latest = list[list.length - 1];
  if (!latest) return null;
  return { score: latest.score, phase: latest.phase, confidence: latest.metrics && latest.metrics.confidence };
}

if (typeof window !== "undefined") {
  window.ArcherForm = {
    ELITE_FORM_REFERENCE,
    loadFormLandmarker,
    computeFormMetrics,
    detectFormPhase,
    generateFormAdvice,
    renderFormCoachPanel,
    stopFormCoach,
    formContextForSession,
    appendFormAnalysisToSession,
  };
}