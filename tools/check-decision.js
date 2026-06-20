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

const sandbox = {
  console, Math, Object, Array, db: { settings: { eyeSight: 850 } },
  esc: (s) => String(s), clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  ROUND_TYPES: [], uid: () => "x",
};
vm.createContext(sandbox);
vm.runInContext(`${scoring}\n${physics}\n${decision.replace(/if\s*\(typeof window[\s\S]*$/, "")}`, sandbox);
assert(typeof sandbox.nextShotBrief === "function", "nextShotBrief missing");
const sess = { id: "1", date: "2026-06-20", dist: 70, faceD: 122, faceType: "single", ends: [[{ x: 0, y: 0, s: 10, X: true }, { x: 1, y: 0, s: 9, X: false }]] };
const adv = sandbox.adviceFor(sess, null);
const brief = sandbox.nextShotBrief(sess, adv, null);
assert(brief && brief.score >= 0 && brief.score <= 100, "nextShotBrief score range");
assert(brief.headline, "nextShotBrief headline");
console.log("Decision checks OK");