/**
 * Performance profiler for archery-master hot paths.
 * Run: node tools/bench-profile.js [--vision-quick] [--record]
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { performance } = require("perf_hooks");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const args = new Set(process.argv.slice(2));
const visionQuick = args.has("--vision-quick") || !args.has("--vision-full");

function ms(t0) {
  return (performance.now() - t0).toFixed(1);
}

function bench(label, fn, iterations = 1) {
  const t0 = performance.now();
  let last;
  for (let i = 0; i < iterations; i += 1) last = fn();
  const elapsed = performance.now() - t0;
  const per = iterations > 1 ? elapsed / iterations : elapsed;
  console.log(`  ${label}: ${per.toFixed(2)}ms${iterations > 1 ? ` (${iterations}x avg)` : ""}`);
  return { elapsed, per, last };
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

function loadVisionExports() {
  const source = fs.readFileSync(path.join(root, "scripts", "35-photo-vision.js"), "utf8");
  const scoringSource = fs.readFileSync(path.join(root, "scripts", "20-scoring.js"), "utf8");
  const scoringSlice = scoringSource.slice(
    scoringSource.indexOf("function isFieldFace"),
    scoringSource.indexOf("function momentStats")
  );
  const stripped = source.replace(/window\.ArcherVision\s*=\s*\{[\s\S]*?\};?\s*$/m, "");
  const sandbox = {
    console, Math, Object, Array, Float32Array, Int16Array, Uint8ClampedArray, Promise, Error,
    Image: function Image() {},
    document: { createElement() { return {}; } },
    window: {},
  };
  sandbox.__exports = {};
  vm.createContext(sandbox);
  vm.runInContext(`${scoringSlice}
${stripped}
__exports.analyzeImageData = analyzeImageData;
__exports.DETECTOR_DEFAULTS = DETECTOR_DEFAULTS;
`, sandbox);
  return sandbox.__exports;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function ringRgb(normalizedRadius) {
  if (normalizedRadius < 0.1) return [255, 220, 40];
  if (normalizedRadius < 0.2) return [210, 40, 40];
  if (normalizedRadius < 0.4) return [40, 70, 210];
  if (normalizedRadius < 0.6) return [30, 30, 30];
  return [235, 235, 228];
}

function makeSyntheticTarget(size, spec) {
  const {
    cx = size / 2, cy = size / 2, faceRadius = size * 0.38,
    arrows = [], lighting = 1, noise = 0, warmth = 0, seed = 42,
  } = spec;
  const rand = mulberry32(seed);
  const data = new Uint8ClampedArray(size * size * 4);
  const paint = (x, y, rgb) => {
    const i = (y * size + x) * 4;
    data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255;
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const r = Math.hypot(x - cx, y - cy) / faceRadius;
      let rgb = ringRgb(r);
      rgb = rgb.map((c) => Math.max(0, Math.min(255, Math.round(c * lighting + warmth * 18))));
      if (noise) {
        const n = (rand() - 0.5) * noise;
        rgb = rgb.map((c) => Math.max(0, Math.min(255, c + n)));
      }
      paint(x, y, rgb);
    }
  }
  for (const arrow of arrows) {
    const angle = (arrow.angleDeg / 180) * Math.PI;
    const rad = arrow.normR * faceRadius;
    const ax = cx + Math.cos(angle) * rad;
    const ay = cy + Math.sin(angle) * rad;
    const holeR = Math.max(2, faceRadius * 0.018);
    for (let y = Math.floor(ay - holeR * 2); y <= Math.ceil(ay + holeR * 2); y += 1) {
      for (let x = Math.floor(ax - holeR * 2); x <= Math.ceil(ax + holeR * 2); x += 1) {
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const d = Math.hypot(x - ax, y - ay);
        if (d > holeR * 2) continue;
        const darkness = d < holeR ? 8 : 55 - d * 12;
        paint(x, y, [darkness, darkness, darkness]);
      }
    }
  }
  return { data, width: size, height: size, cx, cy, faceRadius, arrows };
}

const SCENARIOS = [
  { name: "clean-6arrows", size: 320, faceCm: 122, spec: { arrows: [
    { angleDeg: 12, normR: 0.08, score: 10 }, { angleDeg: 55, normR: 0.18, score: 9 },
    { angleDeg: 110, normR: 0.28, score: 8 }, { angleDeg: 165, normR: 0.35, score: 7 },
    { angleDeg: 220, normR: 0.22, score: 9 }, { angleDeg: 300, normR: 0.12, score: 10 },
  ], lighting: 1, noise: 6, seed: 101 } },
  { name: "low-light-4", size: 280, faceCm: 122, spec: { lighting: 0.62, noise: 14, warmth: 0.4, seed: 202, arrows: [
    { angleDeg: 30, normR: 0.1, score: 10 }, { angleDeg: 140, normR: 0.2, score: 9 },
    { angleDeg: 210, normR: 0.32, score: 8 }, { angleDeg: 330, normR: 0.15, score: 10 },
  ] } },
  { name: "offset-center-3", size: 300, faceCm: 80, spec: { cx: 158, cy: 142, faceRadius: 112, arrows: [
    { angleDeg: 80, normR: 0.14, score: 10 }, { angleDeg: 190, normR: 0.25, score: 9 }, { angleDeg: 270, normR: 0.4, score: 7 },
  ], lighting: 0.9, noise: 10, seed: 303 } },
  { name: "dense-group-5", size: 340, faceCm: 122, spec: { arrows: [
    { angleDeg: 88, normR: 0.11, score: 10 }, { angleDeg: 92, normR: 0.12, score: 10 },
    { angleDeg: 95, normR: 0.1, score: 10 }, { angleDeg: 86, normR: 0.13, score: 9 }, { angleDeg: 90, normR: 0.09, score: 10 },
  ], lighting: 1.05, noise: 8, seed: 404 } },
];

function profileCheckScripts() {
  section("H1: check:all script wall time");
  const scripts = [
    "check-app.js", "check-vision.js", "check-ocr.js", "check-form.js",
    "check-decision.js", "check-integration.js",
  ];
  let total = 0;
  for (const s of scripts) {
    const t0 = performance.now();
    const r = spawnSync(process.execPath, [path.join(__dirname, s)], { cwd: root, encoding: "utf8" });
    const elapsed = performance.now() - t0;
    total += elapsed;
    const status = r.status === 0 ? "OK" : `FAIL(${r.status})`;
    console.log(`  ${s}: ${elapsed.toFixed(0)}ms ${status}`);
    if (r.status !== 0 && r.stderr) console.log(`    ${r.stderr.trim().slice(0, 200)}`);
  }
  console.log(`  subtotal (excl simulate): ${total.toFixed(0)}ms`);
}

function profileVision() {
  section("H2: simulate-vision hot paths");
  const { analyzeImageData } = loadVisionExports();

  bench("makeSyntheticTarget 320px", () => makeSyntheticTarget(320, SCENARIOS[0].spec), 20);

  const targets = SCENARIOS.map((sc) => makeSyntheticTarget(sc.size, sc.spec));
  bench("analyzeImageData (1 scenario)", () => {
    const sc = SCENARIOS[0];
    const t = targets[0];
    return analyzeImageData({ data: t.data }, t.width, t.height, sc.faceCm, {});
  }, 50);

  bench("analyzeImageData (4 scenarios)", () => {
    for (let i = 0; i < SCENARIOS.length; i += 1) {
      const sc = SCENARIOS[i];
      const t = targets[i];
      try { analyzeImageData({ data: t.data }, t.width, t.height, sc.faceCm, {}); } catch (_) {}
    }
  }, 20);

  const grid = {
    darkExcess: [42, 48, 54],
    minimumAngularScore: [600, 720, 840],
    impactRefineDarkness: [170, 185, 200],
    minimumAngleSeparation: [12, 15, 18],
    impactRefineRadiusPx: [4, 5, 7],
    minimumRunLength: [2, 3],
  };
  const combos = [];
  const keys = Object.keys(grid);
  function walk(i, cur) {
    if (i === keys.length) { combos.push({ ...cur }); return; }
    for (const v of grid[keys[i]]) { cur[keys[i]] = v; walk(i + 1, cur); }
  }
  walk(0, {});
  console.log(`  gridSearch combos: ${combos.length}`);

  const sampleCombos = combos.slice(0, 8);
  const tSynth = performance.now();
  for (const combo of sampleCombos) {
    for (const sc of SCENARIOS) makeSyntheticTarget(sc.size, sc.spec);
  }
  const synthPerCombo = (performance.now() - tSynth) / sampleCombos.length;
  console.log(`  makeSyntheticTarget/sample (${sampleCombos.length}×4): ${ms(tSynth)}ms (~${synthPerCombo.toFixed(0)}ms/combo)`);
  console.log(`  makeSyntheticTarget est. full grid (${combos.length}×4, no cache): ~${(synthPerCombo * combos.length).toFixed(0)}ms`);

  const tAnalyze = performance.now();
  for (const combo of sampleCombos) {
    for (let i = 0; i < SCENARIOS.length; i += 1) {
      const sc = SCENARIOS[i];
      const t = targets[i];
      try { analyzeImageData({ data: t.data }, t.width, t.height, sc.faceCm, combo); } catch (_) {}
    }
  }
  const analyzePerCombo = (performance.now() - tAnalyze) / sampleCombos.length;
  console.log(`  analyzeImageData/sample (${sampleCombos.length}×4, cached): ${ms(tAnalyze)}ms (~${analyzePerCombo.toFixed(0)}ms/combo)`);
  console.log(`  analyzeImageData est. full grid (${combos.length}×4): ~${(analyzePerCombo * combos.length / 1000 / 60).toFixed(1)} min`);
  console.log(`  coordinateDescent est. (51 evals): ~${(analyzePerCombo * 51 / 1000).toFixed(0)}s`);

  if (!visionQuick) {
    const tFull = performance.now();
    const r = spawnSync(process.execPath, [path.join(__dirname, "simulate-vision.js")], { cwd: root, encoding: "utf8" });
    console.log(`  simulate-vision.js full run: ${ms(tFull)}ms status=${r.status}`);
  } else {
    console.log("  (skip full simulate-vision; pass --vision-full to include)");
  }
}

function loadRecordSandbox() {
  const scriptFiles = [
    "00-compat.js", "10-storage-native.js", "20-scoring.js", "30-target-svg.js",
    "40-analysis-physics.js", "41-team-set.js", "39-pair-scoring.js", "45-stats-engine.js",
    "52-input-modes.js", "53-page-heroes.js", "50-record-view.js",
  ];
  const dom = {};
  const byId = {};
  function el(id, html = "") {
    const node = {
      id, innerHTML: html, className: "", style: {}, hidden: false,
      classList: {
        _s: new Set(),
        add(...c) { c.forEach((x) => this._s.add(x)); },
        remove(...c) { c.forEach((x) => this._s.delete(x)); },
        toggle(c, on) { on == null ? this._s.has(c) ? this._s.delete(c) : this._s.add(c) : (on ? this._s.add(c) : this._s.delete(c)); },
        contains(c) { return this._s.has(c); },
      },
      setAttribute() {}, getAttribute() { return null; },
      querySelector(sel) {
        if (sel === ".gridHeader span") return { textContent: "" };
        return null;
      },
      querySelectorAll() { return []; },
      onclick: null, onchange: null, oninput: null,
      appendChild() {}, removeChild() {},
    };
    byId[id] = node;
    return node;
  }
  const main = el("main");
  const ids = [
    "scoreGrid", "tgmarks", "curChips", "nudge", "shotMeta", "statbar", "endsTbl",
    "tgsvg", "lens", "lensSvg", "lensTag", "tgcur", "inputModeBar", "zoomChips",
    "gridSheet", "tgWrap", "scanPanel", "ocrPanel", "targetHint", "bUndo", "bEnd", "bFinish",
  ];
  ids.forEach((id) => el(id));

  const sandbox = {
    console, Math, Object, Array, JSON, Set, Map, Promise, Error, Date, parseInt, parseFloat,
    isNaN, isFinite, Number, String, Boolean, RegExp, setTimeout, clearTimeout, setInterval, clearInterval,
    document: {
      createElement(tag) {
        if (tag === "details") return { open: false, innerHTML: "", appendChild() {}, querySelectorAll() { return []; } };
        return el(`dyn-${Math.random()}`);
      },
      querySelector(sel) {
        if (sel === ".gridHeader span") return { textContent: "" };
        if (sel === "#pairCompareMount" || sel === "#teamHistoryMount") return null;
        const m = /^#([\w-]+)/.exec(sel);
        return m ? byId[m[1]] || null : null;
      },
      querySelectorAll(sel) {
        if (sel.includes("inputModeBar") || sel.includes("zoomChips") || sel.includes("nudge") || sel.includes("curChips") || sel.includes("endsTbl")) return [];
        return [];
      },
    },
    window: { requestAnimationFrame: (cb) => setTimeout(cb, 0), cancelAnimationFrame: clearTimeout },
    localStorage: { getItem: () => null, setItem() {} },
    navigator: { share: null, vibrate: () => {} },
    performance: { now: () => Date.now() },
    uid: () => "bench",
    esc: (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
    toast: () => {}, save: () => {}, nativePulse: () => {}, registerCleanup: () => {},
    stopAllInputModes: () => {}, bindActiveInputMode: () => {}, bindGridInput: () => {},
    renderActionBar: () => {}, render: () => {},
    db: {
      active: null,
      setups: [{ id: "s1", name: "Test Setup" }],
      settings: { activeGuideSeen: true },
      sessions: [],
    },
    ui: { inputMode: "tap", zoom: 1, selArrow: -1, freshArrow: -1, gridCell: -1 },
    $: (sel) => {
      const m = /^#([\w-]+)/.exec(sel);
      return m ? byId[m[1]] || null : document.querySelector(sel);
    },
  };
  sandbox.window = sandbox.window;
  sandbox.globalThis = sandbox;

  const code = scriptFiles.map((f) => fs.readFileSync(path.join(root, "scripts", f), "utf8")).join("\n");
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return { sandbox, main, byId };
}

function makeFieldSession(presetId) {
  const presets = JSON.parse(fs.readFileSync(path.join(__dirname, "field-course-presets.json"), "utf8"));
  const course = presets[presetId];
  const ends = [];
  for (let e = 0; e < 12; e += 1) {
    const cur = [];
    for (let a = 0; a < 3; a += 1) {
      cur.push({ x: (Math.random() - 0.5) * 4, y: (Math.random() - 0.5) * 4, s: 7 + (a % 3), fieldTarget: course[e % course.length].target });
    }
    ends.push(cur);
  }
  return {
    id: "bench-field", setupId: "s1", date: "2026-06-21", dist: 30, faceD: 80, faceType: "field",
    round: "free", purpose: "practice", perEnd: 3, bowType: "recurve", environment: "outdoor",
    fieldCourseId: presetId, fieldCourse: course, ends,
    cur: [{ x: 0, y: 0, s: 10, X: true }],
  };
}

function makeIndoorSession() {
  const ends = [];
  for (let e = 0; e < 10; e += 1) {
    const cur = [];
    for (let a = 0; a < 6; a += 1) cur.push({ x: (Math.random() - 0.5) * 3, y: (Math.random() - 0.5) * 3, s: 9 + (a % 2), X: a % 3 === 0 });
    ends.push(cur);
  }
  return {
    id: "bench-indoor", setupId: "s1", date: "2026-06-21", dist: 18, faceD: 40, faceType: "full",
    round: "18m60_jp", purpose: "practice", perEnd: 6, bowType: "recurve", environment: "indoor",
    ends, cur: [{ x: 0.5, y: 0.5, s: 10 }],
  };
}

function profileRecord() {
  section("H3/H4: renderActive vs refreshActive");
  const { sandbox, main } = loadRecordSandbox();
  const { renderActive, refreshActive } = sandbox;

  sandbox.db.active = makeIndoorSession();
  bench("renderActive (indoor 10 ends)", () => renderActive(main), 5);
  bench("refreshActive (indoor, 1 arrow)", () => refreshActive(), 200);

  sandbox.db.active = makeFieldSession("flat24_marked");
  bench("renderActive (field 24-target)", () => renderActive(main), 5);
  bench("refreshActive (field, 1 arrow)", () => refreshActive(), 200);

  section("H5: refreshActive partial costs");
  const s = sandbox.db.active;
  bench("sessionStats only", () => sandbox.sessionStats(s), 500);
  bench("fieldCourseTableHtml only", () => sandbox.fieldCourseTableHtml(s), 500);
  bench("targetMarkup only", () => sandbox.targetMarkup(s.faceD, "tg", s.faceType), 50);
  bench("endsTbl html build (inline)", () => {
    return s.ends.map((end, i) => {
      const sorted = [...end].sort((a, b) => b.s - a.s || (b.X ? 1 : 0) - (a.X ? 1 : 0));
      return `${i}${sorted.map((a) => a.s).join("")}${end.reduce((a, x) => a + x.s, 0)}`;
    }).join("");
  }, 500);
}

function main() {
  console.log("bench-profile.js — performance hypotheses");
  console.log("Hypotheses:");
  console.log("  H1: check:all dominated by simulate-vision (not unit checks)");
  console.log("  H2: makeSyntheticTarget redundant in gridSearch loop");
  console.log("  H3: refreshActive called per arrow; endsTbl+sessionStats dominate");
  console.log("  H4: field course renderActive adds fieldCourseTableHtml cost");
  console.log("  H5: sessionStats double-iterates arrow arrays");

  profileCheckScripts();
  profileVision();
  if (!args.has("--no-record")) profileRecord();

  console.log("\n=== done ===");
}

main();