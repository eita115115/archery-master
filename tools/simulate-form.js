/**
 * Form coach simulation using elite-recurve pose profiles.
 * References: World Archery / James Park draw-force-line, Folkard-Kuhr bow-arm stability.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts", "37-form-coach.js"), "utf8");
const stripped = source
  .replace(/if\s*\(typeof window[\s\S]*$/, "")
  .replace(/async function loadFormLandmarker[\s\S]*?^}/m, "")
  .replace(/async function startFormCoachLoop[\s\S]*?^}/m, "")
  .replace(/function renderFormCoachPanel[\s\S]*?^}/m, "");

const sandbox = {
  console, Math, Object, Array, document: { createElement: () => ({}) },
  uid: () => "x", esc: (s) => String(s), db: {}, save: () => {}, toast: () => {}, nativePulse: () => {},
};
sandbox.__exports = {};
vm.createContext(sandbox);
vm.runInContext(`${stripped}
__exports.computeFormMetrics = computeFormMetrics;
__exports.detectFormPhase = detectFormPhase;
__exports.generateFormAdvice = generateFormAdvice;
__exports.ELITE_FORM_REFERENCE = ELITE_FORM_REFERENCE;
`, sandbox);

const { computeFormMetrics, detectFormPhase, ELITE_FORM_REFERENCE } = sandbox.__exports;

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
  console.log("Form simulation OK");
}

function assert(ok, msg) {
  if (!ok) throw new Error(msg);
}

main();