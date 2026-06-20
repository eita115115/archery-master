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
assert(source.includes("formContextForSession"), "formContextForSession missing");

const stripped = source
  .replace(/if\s*\(typeof window[\s\S]*$/, "")
  .replace(/async function loadFormLandmarker[\s\S]*?^}/m, "")
  .replace(/async function startFormCoachLoop[\s\S]*?^}/m, "")
  .replace(/function renderFormCoachPanel[\s\S]*?^}/m, "");

const sandbox = {
  console,
  Math,
  Object,
  document: { createElement: () => ({ getContext: () => ({ clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {} }) }) },
  uid: () => "t1",
  esc: (s) => String(s),
  db: { active: null, sessions: [] },
  save: () => {},
  toast: () => {},
  nativePulse: () => {},
};
sandbox.__exports = {};
vm.createContext(sandbox);
vm.runInContext(`${stripped}
__exports.computeFormMetrics = computeFormMetrics;
__exports.detectFormPhase = detectFormPhase;
__exports.generateFormAdvice = generateFormAdvice;
__exports.formContextForSession = formContextForSession;
`, sandbox);

const { computeFormMetrics, detectFormPhase, generateFormAdvice } = sandbox.__exports;
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
const m = computeFormMetrics(fakeLm, "right");
assert(m && m.score >= 0 && m.score <= 100, "form metrics score range");
const phase = detectFormPhase(m, []);
assert(phase && phase.phase, "detectFormPhase returns phase");
const advice = generateFormAdvice(m, "FULL_DRAW");
assert(Array.isArray(advice) && advice.length, "generateFormAdvice returns tips");
console.log("Form checks OK");