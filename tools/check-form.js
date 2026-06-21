const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts", "37-form-coach.js"), "utf8");

function assert(ok, msg) {
  if (!ok) throw new Error(msg);
}

assert(source.includes("window.ArcherForm"), "ArcherForm export missing");
assert(source.includes("computeFormMetrics"), "computeFormMetrics missing");
assert(source.includes("ELITE_FORM_REFERENCE"), "ELITE_FORM_REFERENCE missing");
assert(source.includes("forceLineScore"), "draw-force-line metric missing");
assert(source.includes("formContextForSession"), "formContextForSession missing");
assert(source.includes("measurePreReleaseWindow"), "§42 pre-release window missing");
assert(source.includes("buildStructuredFormComment"), "§42 structured comment missing");
assert(source.includes("anchorVariationStats"), "§42 anchor variation missing");
assert(source.includes("structuredCommentHtml"), "§42 structured HTML missing");
assert(source.includes("formPrecisionRuns") || source.includes("appendFormPrecisionRun"), "§43 FP1 storage missing");
assert(source.includes("assessCaptureQuality"), "§43 FP1 quality gate missing");
assert(source.includes("buildFormPrecisionRun"), "§43 FP1 run builder missing");
assert(source.includes("buildFormCalibration"), "§43 FP1 calibration missing");
assert(source.includes("movementNormToCm"), "§43 FP1 cm conversion missing");
assert(source.includes("attachBowTracksToFrames") && source.includes("aggregateBowTrackConfidence"), "§43 FP2 bow track missing");
assert(source.includes("formPrecisionModeFromRoot") && source.includes("data-form-mode"), "§43 FP2 precision mode UI missing");
assert(source.includes("computeFp2Metrics") && source.includes("bow_track"), "§43 FP2 metrics/confidence missing");
assert(source.includes("formPrecisionCorrelationHtml"), "§43 FP2 correlation HTML missing");
assert(source.includes("computeFp3Metrics") && source.includes("anchor_variation_mm"), "§43 FP3 L3 metrics missing");
assert(source.includes("formPrecisionBaseline") && source.includes("weakest_l3_metric"), "§43 FP3 baseline/context missing");
assert(source.includes("precision_fp3") && source.includes("isPrecisionFpRun"), "§43 FP3 mode/back-compat missing");
assert(source.includes("renderFormPrecisionErrorReport") && source.includes("formErrorReport"), "§43 FP4 error report missing");
assert(source.includes("FORM_BENCHMARK_PUBLIC") && source.includes("formBenchAccuracyBlockHtml"), "§43 FP4 benchmark UI missing");
assert(source.includes("FORM_EXPECTATIONS_437") && source.includes("formExpectationsBlockHtml"), "§43 FP4 expectations UI missing");
assert(source.includes("attachBenchmarkToRun"), "§43 FP4 benchmark attach missing");
const benchJson = JSON.parse(fs.readFileSync(path.join(root, "tools", "form-benchmark.json"), "utf8"));
assert(benchJson.version && benchJson.cases && benchJson.cases.length >= 5, "§43 FP4 benchmark JSON missing");
assert(source.includes(benchJson.version), "§43 FP4 benchmark version sync");

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
  console,
  Math,
  Object,
  Array,
  document: { createElement: () => ({ getContext: () => ({ clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {} }) }) },
  uid: () => "fpr-test",
  esc: (s) => String(s),
  db: {
    active: {
      id: "sess1", setupId: "setup1", formPrecisionRuns: [],
      ends: [
        [{ x: 0, y: 0, s: 10, X: true }, { x: 1, y: 0, s: 9 }, { x: 0.5, y: 1, s: 9 }],
        [{ x: 0, y: 0, s: 10, X: true }, { x: 2, y: 0, s: 8 }, { x: 1, y: 1, s: 9 }],
      ],
    },
    sessions: [],
    settings: {},
  },
  save: () => {},
  toast: () => {},
  nativePulse: () => {},
};
sandbox.__exports = {};
vm.createContext(sandbox);
vm.runInContext(`${scoringFns.join("\n")}\n${stripped}
__exports.computeFormMetrics = computeFormMetrics;
__exports.detectFormPhase = detectFormPhase;
__exports.generateFormAdvice = generateFormAdvice;
__exports.formContextForSession = formContextForSession;
__exports.measurePreReleaseWindow = measurePreReleaseWindow;
__exports.anchorVariationStats = anchorVariationStats;
__exports.buildStructuredFormComment = buildStructuredFormComment;
__exports.assessCaptureQuality = assessCaptureQuality;
__exports.estimateCameraAngle = estimateCameraAngle;
__exports.buildFormCalibration = buildFormCalibration;
__exports.movementNormToCm = movementNormToCm;
__exports.buildFormPrecisionRun = buildFormPrecisionRun;
__exports.appendFormPrecisionRun = appendFormPrecisionRun;
__exports.detectPhasesFromFrameSeries = detectPhasesFromFrameSeries;
__exports.formPrecisionPhasesSec = formPrecisionPhasesSec;
__exports.parseMarkerConfig = parseMarkerConfig;
__exports.attachBowTracksToFrames = attachBowTracksToFrames;
__exports.aggregateBowTrackConfidence = aggregateBowTrackConfidence;
__exports.computeFp2Metrics = computeFp2Metrics;
__exports.computeFp3Metrics = computeFp3Metrics;
__exports.formContextForSession = formContextForSession;
__exports.formPrecisionBaselineDelta = formPrecisionBaselineDelta;
__exports.weakestL3Metric = weakestL3Metric;
__exports.renderFormPrecisionErrorReport = renderFormPrecisionErrorReport;
__exports.attachBenchmarkToRun = attachBenchmarkToRun;
__exports.FORM_BENCHMARK_PUBLIC = FORM_BENCHMARK_PUBLIC;
`, sandbox);

const {
  computeFormMetrics, detectFormPhase, generateFormAdvice,
  measurePreReleaseWindow, anchorVariationStats, buildStructuredFormComment,
  assessCaptureQuality, estimateCameraAngle, buildFormCalibration,
  movementNormToCm, buildFormPrecisionRun, appendFormPrecisionRun,
  detectPhasesFromFrameSeries, formPrecisionPhasesSec,
  parseMarkerConfig, attachBowTracksToFrames, aggregateBowTrackConfidence,
  computeFp3Metrics, formContextForSession, formPrecisionBaselineDelta, weakestL3Metric,
  renderFormPrecisionErrorReport, attachBenchmarkToRun, FORM_BENCHMARK_PUBLIC,
} = sandbox.__exports;
const pt = (x, y) => ({ x, y, visibility: 0.9 });
const pose = Array.from({ length: 33 }, () => pt(0.5, 0.5));
pose[0] = pt(0.5, 0.3);
pose[11] = pt(0.35, 0.35);
pose[12] = pt(0.65, 0.35);
pose[13] = pt(0.3, 0.42);
pose[14] = pt(0.7, 0.4);
pose[15] = pt(0.28, 0.5);
pose[16] = pt(0.72, 0.38);
pose[23] = pt(0.42, 0.55);
pose[24] = pt(0.58, 0.55);
const fakeLm = [pose];
const m = computeFormMetrics(fakeLm, "right", { raw: true });
assert(m && m.score >= 0 && m.score <= 100, "form metrics score range");
assert(m.forceLineScore >= 0 && m.forceLineScore <= 100, "force line score range");
const phase = detectFormPhase(m, []);
assert(phase && phase.phase, "detectFormPhase returns phase");
const advice = generateFormAdvice(m, "FULL_DRAW");
assert(Array.isArray(advice) && advice.length, "generateFormAdvice returns tips");
assert(advice.every((a) => a.type === "obs"), "generateFormAdvice should be observation-first");

const now = Date.now();
const hist = [
  { metrics: { ...m, bowWrist: { x: 0.3, y: 0.5 }, drawWrist: { x: 0.7, y: 0.4 }, anchorDist: "0.12" }, ts: now - 400 },
  { metrics: { ...m, bowWrist: { x: 0.32, y: 0.51 }, drawWrist: { x: 0.68, y: 0.39 }, anchorDist: "0.11" }, ts: now - 100 },
];
const pre = measurePreReleaseWindow(hist, now, 0.5);
assert(pre && pre.windowSec === 0.5 && pre.frameCount >= 2, "measurePreReleaseWindow failed");

const analyses = [
  { metrics: { anchorDist: "0.10" } },
  { metrics: { anchorDist: "0.14" } },
  { metrics: { anchorDist: "0.11" } },
];
const av = anchorVariationStats(analyses);
assert(av && av.n === 3 && av.std != null, "anchorVariationStats failed");

const block = buildStructuredFormComment(m, { phase: "FULL_DRAW", preRelease: pre, anchorVariation: av, hold: 4.2 });
assert(block.facts.length >= 2, "structured comment needs facts");
assert(block.checks.length >= 1, "structured comment needs checks");
assert(block.next.length >= 1, "structured comment needs next practice");

function synthFrames(n, shoulderWidth, confidence) {
  const frames = [];
  for (let i = 0; i < n; i += 1) {
    frames.push({
      videoTime: i / 30,
      confidence,
      shoulderWidth,
      landmarks: [
        { x: 0.5, y: 0.3, v: 0.9 },
        { x: 0.35, y: 0.35, v: 0.9 },
        { x: 0.65, y: 0.35, v: 0.9 },
        null, null,
        { x: 0.28, y: 0.5, v: 0.9 },
        { x: 0.72, y: 0.38, v: 0.9 },
        { x: 0.42, y: 0.55, v: 0.9 },
        { x: 0.58, y: 0.55, v: 0.9 },
      ],
      metrics: {
        score: 80,
        bowArmAngle: 175,
        drawArmAngle: 160,
        anchorDist: "0.11",
        confidence,
        bowWrist: { x: 0.28, y: 0.5 },
        drawWrist: { x: 0.72, y: 0.38 },
      },
    });
  }
  return frames;
}

const sideFrames = synthFrames(300, 0.14, 85);
const vertFrames = synthFrames(300, 0.05, 55);
const sideQ = assessCaptureQuality(sideFrames, { duration: 10, fps: 30 });
const vertQ = assessCaptureQuality(vertFrames, { duration: 10, fps: 30 });
assert(sideQ.camera_angle === "side", "side camera angle");
assert(vertQ.camera_angle === "vertical", "vertical camera angle");
assert(vertQ.warnings.length >= 1, "vertical should warn");
assert(vertQ.quality_score < sideQ.quality_score, "vertical quality lower than side");

const cal = buildFormCalibration(sideFrames, 2.5);
assert(cal.shoulder_width_norm > 0.1 && cal.cm_per_norm > 0, "calibration");
const cm = movementNormToCm(0.02, cal);
assert(cm != null && cm > 0, "movementNormToCm");

const phaseClock = detectPhasesFromFrameSeries(sideFrames, "right");
const phases = formPrecisionPhasesSec(phaseClock, 10);
const run = buildFormPrecisionRun({
  sessionId: "sess1",
  frames: sideFrames,
  videoMeta: { duration: 10, fps: 30 },
  quality: sideQ,
  calibration: cal,
  handedness: "right",
  phaseClock,
});
assert(run.frames.length === 300, "FP1 run frame count");
assert(run.phases_sec && run.phases_sec.setup_start != null, "FP1 phases_sec");
assert(run.metrics_l3 && run.metrics_l3.hold_bow_rms_cm != null, "FP1 metrics_l3 cm");
assert(appendFormPrecisionRun(run), "appendFormPrecisionRun");
assert(sandbox.db.active.formPrecisionRuns.length === 1, "formPrecisionRuns stored");

const markerRun = buildFormPrecisionRun({
  sessionId: "sess1",
  frames: sideFrames,
  videoMeta: { duration: 10, fps: 30 },
  quality: sideQ,
  calibration: cal,
  handedness: "right",
  phaseClock,
  precisionMode: "precision",
  markerConfig: parseMarkerConfig("red", "blue"),
});
assert(markerRun.mode === "precision_fp3" || markerRun.mode === "precision_fp2", "FP2/FP3 mode tag");
assert(markerRun.confidence.bow_track != null && markerRun.confidence.bow_track > 0.5, "FP2 bow_track with markers");
assert(markerRun.metrics_l3.bow_track_source === "markers", "FP2 marker source");
assert(markerRun.metrics_l3.bow_hand_rms_cm != null, "FP2 bow hand RMS");

const proxyRun = buildFormPrecisionRun({
  sessionId: "sess1",
  frames: sideFrames,
  videoMeta: { duration: 10, fps: 30 },
  quality: sideQ,
  calibration: cal,
  handedness: "right",
  phaseClock,
  precisionMode: "precision",
  markerConfig: parseMarkerConfig("none", "none"),
});
assert(proxyRun.confidence.bow_track != null && proxyRun.confidence.bow_track < markerRun.confidence.bow_track, "FP2 proxy lowers bow_track");
assert((proxyRun.video_meta.warnings || []).some((w) => w.includes("手首") || w.includes("マーカー")), "FP2 proxy warning");

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
      videoTime: t,
      confidence,
      shoulderWidth: sw,
      landmarks: [
        { x: 0.5, y: headY, v: 0.9 },
        { x: 0.35, y: 0.35, v: 0.9 },
        { x: 0.65, y: 0.35, v: 0.9 },
        null, null,
        { x: 0.28, y: bowY, v: 0.9 },
        { x: drawX, y: drawY, v: 0.9 },
        { x: 0.42, y: 0.55, v: 0.9 },
        { x: 0.58, y: 0.55, v: 0.9 },
      ],
      metrics: {
        score: 80, bowArmAngle: 175, drawArmAngle: 160, anchorDist: "0.11", confidence,
        bowWrist: { x: 0.28, y: bowY },
        drawWrist: { x: drawX, y: drawY },
      },
    });
  }
  return frames;
}

const fp3Frames = synthFp3Frames(300, 0.14, 88);
const fp3PhaseClock = { ANCHORING: 5, FULL_DRAW: 5.5, RELEASE: 8, FOLLOW: 8.1 };
const fp3Phases = formPrecisionPhasesSec(fp3PhaseClock, 10);
const fp3Sess = sandbox.db.active;
const fp3Run = buildFormPrecisionRun({
  sessionId: "sess1",
  sess: fp3Sess,
  frames: fp3Frames,
  videoMeta: { duration: 10, fps: 30 },
  quality: sideQ,
  calibration: cal,
  handedness: "right",
  phaseClock: fp3PhaseClock,
  precisionMode: "precision",
  markerConfig: parseMarkerConfig("red", "blue"),
});
assert(fp3Run.mode === "precision_fp3", "FP3 mode tag");
const m3 = fp3Run.metrics_l3;
assert(m3.anchor_variation_mm != null && m3.anchor_variation_mm > 0, "FP3 anchor_variation_mm");
assert(m3.pre_release_bow_drop != null && m3.pre_release_bow_drop > 0, "FP3 pre_release_bow_drop");
assert(m3.pre_release_draw_motion != null, "FP3 pre_release_draw_motion");
assert(m3.post_release_head_drop != null && m3.post_release_head_drop > 0, "FP3 post_release_head_drop");
assert(m3.correlation && m3.correlation.grouping_rr != null, "FP3 correlation grouping_rr");
assert(m3.correlation.session_avg_rr != null, "FP3 correlation session_avg_rr");
assert(m3.hold_bow_rms_cm != null && m3.release_vector != null, "FP3 retains FP2 metrics");

appendFormPrecisionRun(fp3Run, fp3Sess);
appendFormPrecisionRun(fp3Run, fp3Sess);
assert(sandbox.db.settings.formPrecisionBaseline, "FP3 baseline stored");
const fctx = formContextForSession(fp3Sess);
assert(fctx && fctx.has_precision && fctx.metrics_l3, "formContext L3");
assert(fctx.weakest_l3_metric, "formContext weakest_l3_metric");

const errHtml = renderFormPrecisionErrorReport(fp3Run, fp3Sess);
assert(errHtml && errHtml.includes("formErrorReport"), "FP4 error report HTML");
assert(errHtml.includes("formErrorTbl") || errHtml.includes("ベースライン形成中"), "FP4 error table or pending");
assert(errHtml.includes("練習用計測の期待値"), "FP4 §43.7 in report");
attachBenchmarkToRun(fp3Run, { version: benchJson.version, case_id: "fp3_l3_metrics", errors: [] });
assert(fp3Run.benchmark && fp3Run.benchmark.case_id === "fp3_l3_metrics", "FP4 run.benchmark");
assert(FORM_BENCHMARK_PUBLIC.version === benchJson.version, "FP4 public benchmark version");

console.log("Form checks OK");