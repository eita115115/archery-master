const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const scoring = fs.readFileSync(path.join(root, "scripts", "20-scoring.js"), "utf8");
const physics = fs.readFileSync(path.join(root, "scripts", "40-analysis-physics.js"), "utf8");
const decision = fs.readFileSync(path.join(root, "scripts", "46-decision-engine.js"), "utf8");

function assert(ok, msg) {
  if (!ok) throw new Error(msg);
}

const formStub = `
function formContextForSession(session) {
  const runs = (session && session.formPrecisionRuns) || [];
  const pr = runs[runs.length - 1];
  if (!pr || !pr.metrics_l3) return null;
  return {
    score: 82, has_precision: true, confidence_bow_track: pr.confidence && pr.confidence.bow_track,
    metrics_l3: pr.metrics_l3, correlation: pr.metrics_l3.correlation,
  };
}`;
const sandbox = {
  console, Math, Object, Array, db: { settings: { eyeSight: 850 } },
  esc: (s) => String(s), clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  ROUND_TYPES: [], uid: () => "x",
};
vm.createContext(sandbox);
vm.runInContext(`${scoring}\n${physics}\n${formStub}\n${decision.replace(/if\s*\(typeof window[\s\S]*$/, "")}`, sandbox);
assert(typeof sandbox.nextShotBrief === "function", "nextShotBrief missing");
const sess = { id: "1", date: "2026-06-20", dist: 70, faceD: 122, faceType: "single", ends: [[{ x: 0, y: 0, s: 10, X: true }, { x: 1, y: 0, s: 9, X: false }]] };
const adv = sandbox.adviceFor(sess, null);
const brief = sandbox.nextShotBrief(sess, adv, null);
assert(brief && brief.score >= 0 && brief.score <= 100, "nextShotBrief score range");
assert(brief.headline, "nextShotBrief headline");
const sessL3 = {
  id: "2", date: "2026-06-21", dist: 70, faceD: 122, faceType: "single",
  ends: [[{ x: 0, y: 0, s: 10, X: true }, { x: 1, y: 0, s: 9 }]],
  formPrecisionRuns: [{
    mode: "precision_fp3", precision_mode: "precision",
    confidence: { overall: 0.82, bow_track: 0.84 },
    metrics_l3: { hold_bow_rms_cm: 0.12, correlation: { grouping_rr: 2.1 } },
  }],
};
const briefL3 = sandbox.nextShotBrief(sessL3, sandbox.adviceFor(sessL3, null), null);
assert(briefL3 && briefL3.factors.some((f) => f.k === "L3追跡"), "L3 factor in brief");
console.log("Decision checks OK");