/**
 * Form coach simulation using elite-recurve pose profiles.
 * References: World Archery / James Park draw-force-line, Folkard-Kuhr bow-arm stability.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts", "37-form-coach.js"), "utf8");
const scoring = fs.readFileSync(path.join(root, "scripts", "20-scoring.js"), "utf8");
const scoringFns = scoring.match(/function (clamp|median|momentStats|groupStats|robustStats|robustScale)[\s\S]*?^}/gm) || [];
const stripped = source
  .replace(/if\s*\(typeof window[\s\S]*$/, "")
  .replace(/async function loadFormLandmarker[\s\S]*?^}/m, "")
  .replace(/async function startFormCoachLoop[\s\S]*?^}/m, "")
  .replace(/function renderFormCoachPanel[\s\S]*?^}/m, "")
  .replace(/async function scanVideoAllFrames[\s\S]*?^}/m, "")
  .replace(/async function runFormPrecisionPipeline[\s\S]*?^}/m, "");

const sandbox = {
  console, Math, Object, Array, document: { createElement: () => ({}) },
  uid: () => "x", esc: (s) => String(s),
  db: {
    active: {
      id: "gold-sess", setupId: "setup1",
      ends: [
        [{ x: 0, y: 0, s: 10, X: true }, { x: 1, y: 0, s: 9 }, { x: 0.5, y: 1, s: 9 }],
        [{ x: 0, y: 0, s: 10, X: true }, { x: 2, y: 0, s: 8 }, { x: 1, y: 1, s: 9 }],
      ],
    },
    sessions: [],
    settings: {},
  },
  save: () => {}, toast: () => {}, nativePulse: () => {},
};
sandbox.__exports = {};
vm.createContext(sandbox);
vm.runInContext(`${scoringFns.join("\n")}\n${stripped}
__exports.computeFormMetrics = computeFormMetrics;
__exports.detectFormPhase = detectFormPhase;
__exports.generateFormAdvice = generateFormAdvice;
__exports.ELITE_FORM_REFERENCE = ELITE_FORM_REFERENCE;
__exports.assessCaptureQuality = assessCaptureQuality;
__exports.buildFormCalibration = buildFormCalibration;
__exports.buildFormPrecisionRun = buildFormPrecisionRun;
__exports.detectPhasesFromFrameSeries = detectPhasesFromFrameSeries;
__exports.formPrecisionPhasesSec = formPrecisionPhasesSec;
__exports.parseMarkerConfig = parseMarkerConfig;
`, sandbox);

const {
  computeFormMetrics, detectFormPhase, ELITE_FORM_REFERENCE,
  assessCaptureQuality, buildFormCalibration, buildFormPrecisionRun,
  detectPhasesFromFrameSeries, formPrecisionPhasesSec, parseMarkerConfig,
} = sandbox.__exports;

function pt(x, y, v = 0.95) { return { x, y, visibility: v }; }

function buildPose(profile) {
  const p = Array.from({ length: 33 }, () => pt(0.5, 0.5, 0.3));
  const set = (i, x, y) => { p[i] = pt(x, y); };
  set(0, profile.nose.x, profile.nose.y);
  set(11, profile.bowShoulder.x, profile.bowShoulder.y);
  set(12, profile.drawShoulder.x, profile.drawShoulder.y);
  set(13, profile.bowElbow.x, profile.bowElbow.y);
  set(14, profile.drawElbow.x, profile.drawElbow.y);
  set(15, profile.bowWrist.x, profile.bowWrist.y);
  set(16, profile.drawWrist.x, profile.drawWrist.y);
  set(23, profile.leftHip.x, profile.leftHip.y);
  set(24, profile.rightHip.x, profile.rightHip.y);
  return [p];
}

// Elite recurve full-draw profiles (right-handed, side camera).
// Kim Woojin / Brady Ellison / An San class: straight bow arm, draw elbow on force line.
const PROFILES = {
  elite_kim: {
    label: "Elite full draw (Kim Woojin class)",
    handedness: "right",
    nose: { x: 0.52, y: 0.328 },
    bowShoulder: { x: 0.34, y: 0.34 },
    drawShoulder: { x: 0.66, y: 0.358 },
    bowElbow: { x: 0.26, y: 0.344 },
    drawElbow: { x: 0.645, y: 0.304 },
    bowWrist: { x: 0.18, y: 0.355 },
    drawWrist: { x: 0.62, y: 0.262 },
    leftHip: { x: 0.42, y: 0.56 },
    rightHip: { x: 0.58, y: 0.56 },
    minScore: 75,
    phase: "FULL_DRAW",
  },
  elite_an: {
    label: "Elite full draw (An San class)",
    handedness: "right",
    nose: { x: 0.51, y: 0.327 },
    bowShoulder: { x: 0.35, y: 0.335 },
    drawShoulder: { x: 0.65, y: 0.353 },
    bowElbow: { x: 0.27, y: 0.34 },
    drawElbow: { x: 0.638, y: 0.302 },
    bowWrist: { x: 0.19, y: 0.35 },
    drawWrist: { x: 0.615, y: 0.265 },
    leftHip: { x: 0.43, y: 0.55 },
    rightHip: { x: 0.57, y: 0.55 },
    minScore: 73,
    phase: "FULL_DRAW",
  },
  beginner_collapsed: {
    label: "Beginner collapsed bow arm",
    handedness: "right",
    nose: { x: 0.5, y: 0.32 },
    bowShoulder: { x: 0.38, y: 0.36 },
    drawShoulder: { x: 0.62, y: 0.4 },
    bowElbow: { x: 0.36, y: 0.44 },
    drawElbow: { x: 0.58, y: 0.42 },
    bowWrist: { x: 0.32, y: 0.48 },
    drawWrist: { x: 0.48, y: 0.36 },
    leftHip: { x: 0.42, y: 0.58 },
    rightHip: { x: 0.58, y: 0.58 },
    maxScore: 58,
    phase: "ANCHORING",
  },
  elbow_out: {
    label: "Draw elbow off force line",
    handedness: "right",
    nose: { x: 0.52, y: 0.3 },
    bowShoulder: { x: 0.34, y: 0.34 },
    drawShoulder: { x: 0.66, y: 0.36 },
    bowElbow: { x: 0.26, y: 0.36 },
    drawElbow: { x: 0.78, y: 0.42 },
    bowWrist: { x: 0.18, y: 0.38 },
    drawWrist: { x: 0.54, y: 0.3 },
    leftHip: { x: 0.42, y: 0.56 },
    rightHip: { x: 0.58, y: 0.56 },
    maxScore: 64,
    phase: "FULL_DRAW",
  },
};

function main() {
  assert(ELITE_FORM_REFERENCE && ELITE_FORM_REFERENCE.bowArmAngle, "ELITE_FORM_REFERENCE missing");
  let eliteAvg = 0;
  let eliteN = 0;
  for (const [key, profile] of Object.entries(PROFILES)) {
    const metrics = computeFormMetrics(buildPose(profile), profile.handedness, { raw: true });
    if (!metrics) throw new Error(`Metrics null for ${key}`);
    const history = [{ metrics, vel: 2, ts: Date.now() - 100 }, { metrics, vel: 1, ts: Date.now() }];
    const phase = detectFormPhase(metrics, history, 1.2);
    if (profile.minScore != null) {
      if (metrics.score < profile.minScore) {
        throw new Error(`${profile.label}: score ${metrics.score} < ${profile.minScore}`);
      }
      eliteAvg += metrics.score;
      eliteN += 1;
    }
    if (profile.maxScore != null && metrics.score > profile.maxScore) {
      throw new Error(`${profile.label}: score ${metrics.score} > max ${profile.maxScore}`);
    }
    if (profile.phase && phase.phase !== profile.phase && key.startsWith("elite")) {
      throw new Error(`${profile.label}: expected phase ${profile.phase}, got ${phase.phase}`);
    }
    console.log(`${profile.label}: score=${metrics.score} phase=${phase.phase} bow=${metrics.bowArmAngle}° draw=${metrics.drawArmAngle}°`);
  }
  console.log(`Elite average score=${(eliteAvg / eliteN).toFixed(1)}`);

  function synthFpFrames(n, shoulderWidth, confidence) {
    const frames = [];
    for (let i = 0; i < n; i += 1) {
      frames.push({
        videoTime: +(i / 30).toFixed(3),
        confidence,
        shoulderWidth,
        landmarks: [
          { x: 0.5, y: 0.3, v: 0.9 }, { x: 0.35, y: 0.35, v: 0.9 }, { x: 0.65, y: 0.35, v: 0.9 },
          null, null, { x: 0.28, y: 0.5, v: 0.9 }, { x: 0.72, y: 0.38, v: 0.9 },
          { x: 0.42, y: 0.55, v: 0.9 }, { x: 0.58, y: 0.55, v: 0.9 },
        ],
        metrics: {
          score: 82, bowArmAngle: 175, drawArmAngle: 162, anchorDist: "0.11", confidence,
          bowWrist: { x: 0.28, y: 0.5 }, drawWrist: { x: 0.72, y: 0.38 },
        },
      });
    }
    return frames;
  }

  const sideFrames = synthFpFrames(300, 0.14, 88);
  const vertFrames = synthFpFrames(300, 0.05, 52);
  const sideQ = assessCaptureQuality(sideFrames, { duration: 10, fps: 30 });
  const vertQ = assessCaptureQuality(vertFrames, { duration: 10, fps: 30 });
  if (sideQ.camera_angle !== "side") throw new Error("FP1 gold: side angle expected");
  if (vertQ.camera_angle !== "vertical") throw new Error("FP1 gold: vertical angle expected");
  if (!vertQ.warnings.length) throw new Error("FP1 gold: vertical warnings expected");
  if (vertQ.quality_score >= sideQ.quality_score) throw new Error("FP1 gold: vertical quality should be lower");

  const cal = buildFormCalibration(sideFrames, 2.5);
  const phaseClock = detectPhasesFromFrameSeries(sideFrames, "right");
  const phases = formPrecisionPhasesSec(phaseClock, 10);
  const run = buildFormPrecisionRun({
    sessionId: "gold-sess",
    frames: sideFrames,
    videoMeta: { duration: 10, fps: 30 },
    quality: sideQ,
    calibration: cal,
    handedness: "right",
    phaseClock,
  });
  if (run.frames.length !== 300) throw new Error("FP1 gold: expected 300 frames");
  if (!run.phases_sec || run.phases_sec.setup_start == null) throw new Error("FP1 gold: phases_sec missing");
  if (!run.metrics_l3 || run.metrics_l3.hold_bow_rms_cm == null) throw new Error("FP1 gold: cm metrics missing");
  console.log(`FP1 gold: frames=${run.frames.length} quality=${sideQ.quality_score} angle=${sideQ.camera_angle} release=${phases.release}`);

  const fp2Marker = buildFormPrecisionRun({
    sessionId: "gold-sess",
    frames: sideFrames,
    videoMeta: { duration: 10, fps: 30 },
    quality: sideQ,
    calibration: cal,
    handedness: "right",
    phaseClock,
    precisionMode: "precision",
    markerConfig: parseMarkerConfig("red", "blue"),
  });
  if (fp2Marker.mode !== "precision_fp3" && fp2Marker.mode !== "precision_fp2") throw new Error("FP2 gold: mode tag");
  if (!fp2Marker.confidence.bow_track || fp2Marker.confidence.bow_track < 0.5) {
    throw new Error("FP2 gold: bow_track with markers too low");
  }
  if (fp2Marker.metrics_l3.bow_track_source !== "markers") throw new Error("FP2 gold: expected markers source");

  const fp2Proxy = buildFormPrecisionRun({
    sessionId: "gold-sess",
    frames: sideFrames,
    videoMeta: { duration: 10, fps: 30 },
    quality: sideQ,
    calibration: cal,
    handedness: "right",
    phaseClock,
    precisionMode: "precision",
    markerConfig: parseMarkerConfig("none", "none"),
  });
  if (!fp2Proxy.confidence.bow_track || fp2Proxy.confidence.bow_track >= fp2Marker.confidence.bow_track) {
    throw new Error("FP2 gold: proxy should lower bow_track");
  }
  if (!(fp2Proxy.video_meta.warnings || []).some((w) => w.includes("手首") || w.includes("マーカー"))) {
    throw new Error("FP2 gold: proxy warning expected");
  }
  console.log(`FP2 gold: marker bow=${fp2Marker.confidence.bow_track} proxy bow=${fp2Proxy.confidence.bow_track}`);

  function synthFp3Frames(n, shoulderWidth, confidence) {
    const frames = [];
    for (let i = 0; i < n; i += 1) {
      const t = i / 30;
      let drawX = 0.72;
      let drawY = 0.38;
      let bowY = 0.5;
      let headY = 0.3;
      let sw = shoulderWidth;
      if (t >= 5 && t < 8) {
        drawX = 0.72 + Math.sin(i * 0.2) * 0.008;
        drawY = 0.38 + Math.cos(i * 0.15) * 0.006;
      }
      if (t >= 7.5 && t <= 8) bowY = 0.5 + (t - 7.5) * 0.04;
      if (t > 8 && t <= 8.3) {
        headY = 0.3 + (t - 8) * 0.06;
        sw = shoulderWidth - (t - 8) * 0.02;
        drawX = 0.72 + (t - 8) * 0.03;
      }
      frames.push({
        videoTime: t, confidence, shoulderWidth: sw,
        landmarks: [
          { x: 0.5, y: headY, v: 0.9 }, { x: 0.35, y: 0.35, v: 0.9 }, { x: 0.65, y: 0.35, v: 0.9 },
          null, null, { x: 0.28, y: bowY, v: 0.9 }, { x: drawX, y: drawY, v: 0.9 },
          { x: 0.42, y: 0.55, v: 0.9 }, { x: 0.58, y: 0.55, v: 0.9 },
        ],
        metrics: {
          score: 82, bowArmAngle: 175, drawArmAngle: 162, anchorDist: "0.11", confidence,
          bowWrist: { x: 0.28, y: bowY }, drawWrist: { x: drawX, y: drawY },
        },
      });
    }
    return frames;
  }

  const fp3Frames = synthFp3Frames(300, 0.14, 88);
  const fp3PhaseClock = { ANCHORING: 5, FULL_DRAW: 5.5, RELEASE: 8, FOLLOW: 8.1 };
  const fp3Run = buildFormPrecisionRun({
    sessionId: "gold-sess",
    sess: sandbox.db.active,
    frames: fp3Frames,
    videoMeta: { duration: 10, fps: 30 },
    quality: sideQ,
    calibration: cal,
    handedness: "right",
    phaseClock: fp3PhaseClock,
    precisionMode: "precision",
    markerConfig: parseMarkerConfig("red", "blue"),
  });
  const m3 = fp3Run.metrics_l3 || {};
  if (fp3Run.mode !== "precision_fp3") throw new Error("FP3 gold: mode tag");
  if (m3.anchor_variation_mm == null || m3.pre_release_bow_drop == null) throw new Error("FP3 gold: L3 metrics missing");
  if (!m3.correlation || m3.correlation.grouping_rr == null) throw new Error("FP3 gold: correlation missing");
  console.log(`FP3 gold: anchor=${m3.anchor_variation_mm}mm pre_bow=${m3.pre_release_bow_drop}cm rr=${m3.correlation.grouping_rr}`);

  const bench = JSON.parse(fs.readFileSync(path.join(root, "tools", "form-benchmark.json"), "utf8"));
  const fp3Case = bench.cases.find((c) => c.id === "fp3_l3_metrics");
  if (!fp3Case) throw new Error("FP4: fp3_l3_metrics case missing");
  const anchorSpec = fp3Case.expect["metrics_l3.anchor_variation_mm"];
  const anchorErr = Math.abs(m3.anchor_variation_mm - anchorSpec.value);
  const anchorTol = anchorSpec.value * (anchorSpec.rel_tol || 0.1);
  if (anchorErr > anchorTol) {
    throw new Error(`FP4 benchmark: anchor MAE ${anchorErr} > ${anchorTol}`);
  }
  console.log(`FP4 gold: anchor_err=${anchorErr.toFixed(3)} tol=${anchorTol.toFixed(3)} bench=${bench.version}`);

  console.log("Form simulation OK");
}

function assert(ok, msg) {
  if (!ok) throw new Error(msg);
}

main();