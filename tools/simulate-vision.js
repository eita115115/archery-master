/**
 * Deterministic vision detector simulation.
 * Generates synthetic WA faces with known arrow impacts, sweeps detector
 * settings, and scores accuracy for live/video tuning.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts", "35-photo-vision.js"), "utf8");
const stripped = source.replace(/window\.ArcherVision\s*=\s*\{[\s\S]*?\};?\s*$/m, "");

const sandbox = {
  console, Math, Object, Array, Float32Array, Int16Array, Uint8ClampedArray, Promise, Error,
  Image: function Image() {},
  document: { createElement() { return {}; } },
  window: {},
};
sandbox.__exports = {};
vm.createContext(sandbox);
vm.runInContext(`${stripped}
__exports.analyzeImageData = analyzeImageData;
__exports.DETECTOR_DEFAULTS = DETECTOR_DEFAULTS;
__exports.scoreImpact = scoreImpact;
`, sandbox);

const { analyzeImageData, DETECTOR_DEFAULTS, scoreImpact } = sandbox.__exports;

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
    cx = size / 2,
    cy = size / 2,
    faceRadius = size * 0.38,
    arrows = [],
    lighting = 1,
    noise = 0,
    warmth = 0,
    seed = 42,
  } = spec;
  const rand = mulberry32(seed);
  const data = new Uint8ClampedArray(size * size * 4);
  const paint = (x, y, rgb) => {
    const i = (y * size + x) * 4;
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
    data[i + 3] = 255;
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
  {
    name: "clean-6arrows",
    size: 320,
    faceCm: 122,
    spec: {
      arrows: [
        { angleDeg: 12, normR: 0.08, score: 10 },
        { angleDeg: 55, normR: 0.18, score: 9 },
        { angleDeg: 110, normR: 0.28, score: 8 },
        { angleDeg: 165, normR: 0.35, score: 7 },
        { angleDeg: 220, normR: 0.22, score: 9 },
        { angleDeg: 300, normR: 0.12, score: 10 },
      ],
      lighting: 1,
      noise: 6,
      seed: 101,
    },
  },
  {
    name: "low-light-4",
    size: 280,
    faceCm: 122,
    spec: {
      lighting: 0.62,
      noise: 14,
      warmth: 0.4,
      seed: 202,
      arrows: [
        { angleDeg: 30, normR: 0.1, score: 10 },
        { angleDeg: 140, normR: 0.2, score: 9 },
        { angleDeg: 210, normR: 0.32, score: 8 },
        { angleDeg: 330, normR: 0.15, score: 10 },
      ],
    },
  },
  {
    name: "offset-center-3",
    size: 300,
    faceCm: 80,
    spec: {
      cx: 158,
      cy: 142,
      faceRadius: 112,
      arrows: [
        { angleDeg: 80, normR: 0.14, score: 10 },
        { angleDeg: 190, normR: 0.25, score: 9 },
        { angleDeg: 270, normR: 0.4, score: 7 },
      ],
      lighting: 0.9,
      noise: 10,
      seed: 303,
    },
  },
  {
    name: "dense-group-5",
    size: 340,
    faceCm: 122,
    spec: {
      arrows: [
        { angleDeg: 88, normR: 0.11, score: 10 },
        { angleDeg: 92, normR: 0.12, score: 10 },
        { angleDeg: 95, normR: 0.1, score: 10 },
        { angleDeg: 86, normR: 0.13, score: 9 },
        { angleDeg: 90, normR: 0.09, score: 10 },
      ],
      lighting: 1.05,
      noise: 8,
      seed: 404,
    },
  },
];

function matchArrows(detected, truth, target, width, height) {
  const tcx = (target.cx / width) * 100;
  const tcy = (target.cy / height) * 100;
  const tr = (target.faceRadius / Math.min(width, height)) * 100;
  const truthPx = truth.arrows.map((a) => {
    const angle = (a.angleDeg / 180) * Math.PI;
    return {
      x: tcx + Math.cos(angle) * a.normR * tr,
      y: tcy + Math.sin(angle) * a.normR * tr,
      score: a.score,
    };
  });
  const used = new Set();
  let posErr = 0;
  let scoreErr = 0;
  let matched = 0;
  for (const det of detected) {
    let best = null;
    let bestD = Infinity;
    truthPx.forEach((t, i) => {
      if (used.has(i)) return;
      const d = Math.hypot(det.x - t.x, det.y - t.y);
      if (d < bestD) { bestD = d; best = { i, t }; }
    });
    if (best && bestD < tr * 0.22) {
      used.add(best.i);
      matched += 1;
      posErr += bestD / tr;
      scoreErr += Math.abs((det.score || 0) - best.t.score);
    }
  }
  return {
    matched,
    count: truth.arrows.length,
    posErr: matched ? posErr / matched : 2,
    scoreErr: matched ? scoreErr / matched : 10,
    recall: matched / Math.max(1, truth.arrows.length),
  };
}

function evaluateConfig(configOverrides) {
  let total = 0;
  let fails = 0;
  for (const scenario of SCENARIOS) {
    const target = makeSyntheticTarget(scenario.size, scenario.spec);
    try {
      const result = analyzeImageData(
        { data: target.data },
        target.width,
        target.height,
        scenario.faceCm,
        configOverrides
      );
      const centerErr = Math.hypot(
        result.target.x - (target.cx / target.width) * 100,
        result.target.y - (target.cy / target.height) * 100
      ) / result.target.radius;
      const radiusErr = Math.abs(result.target.radius - (target.faceRadius / Math.min(target.width, target.height)) * 100)
        / Math.max(0.01, (target.faceRadius / Math.min(target.width, target.height)) * 100);
      const arrow = matchArrows(result.arrows, { arrows: scenario.spec.arrows }, target, target.width, target.height);
      const scenarioScore =
        arrow.recall * 0.42
        + (1 - Math.min(1, arrow.posErr)) * 0.28
        + (1 - Math.min(1, centerErr)) * 0.18
        + (1 - Math.min(1, radiusErr)) * 0.07
        + (1 - Math.min(1, arrow.scoreErr / 3)) * 0.05;
      total += scenarioScore;
      if (arrow.recall < 0.5) fails += 1;
    } catch (_) {
      fails += 2;
    }
  }
  return { score: total / SCENARIOS.length, fails };
}

function gridSearch() {
  const base = { ...DETECTOR_DEFAULTS };
  const grid = {
    darkExcess: [42, 48, 54],
    minimumAngularScore: [600, 720, 840],
    impactRefineDarkness: [170, 185, 200],
    minimumAngleSeparation: [12, 15, 18],
    impactRefineRadiusPx: [4, 5, 7],
    minimumRunLength: [2, 3],
  };
  const keys = Object.keys(grid);
  let best = { score: -1, config: base, fails: 99 };
  const combos = [];
  function walk(i, cur) {
    if (i === keys.length) { combos.push({ ...cur }); return; }
    for (const v of grid[keys[i]]) {
      cur[keys[i]] = v;
      walk(i + 1, cur);
    }
  }
  walk(0, {});
  function betterCandidate(next, prev, nextConfig, prevConfig) {
    if (next.score > prev.score + 1e-9) return true;
    if (Math.abs(next.score - prev.score) > 1e-9) return false;
    if (next.fails < prev.fails) return true;
    if (next.fails > prev.fails) return false;
    if ((nextConfig.minimumRunLength || 2) < (prevConfig.minimumRunLength || 2)) return true;
    if ((nextConfig.minimumRunLength || 2) > (prevConfig.minimumRunLength || 2)) return false;
    if ((nextConfig.minimumAngleSeparation || 12) < (prevConfig.minimumAngleSeparation || 12)) return true;
    if ((nextConfig.minimumAngleSeparation || 12) > (prevConfig.minimumAngleSeparation || 12)) return false;
    return JSON.stringify(nextConfig) < JSON.stringify(prevConfig);
  }
  for (const combo of combos) {
    const merged = { ...base, ...combo };
    const result = evaluateConfig(merged);
    if (betterCandidate(result, best, merged, best.config)) {
      best = { ...result, config: merged };
    }
  }
  return best;
}

function main() {
  const baseline = evaluateConfig({});
  const tuned = gridSearch();
  console.log(`Vision simulation baseline=${baseline.score.toFixed(3)} fails=${baseline.fails}`);
  console.log(`Vision simulation tuned=${tuned.score.toFixed(3)} fails=${tuned.fails}`);
  const improved = tuned.score > baseline.score + 0.01;
  if (!improved && tuned.fails > baseline.fails) {
    throw new Error(`Vision tuning did not improve over baseline (${baseline.score.toFixed(3)})`);
  }
  const pick = improved ? tuned : { ...baseline, config: { ...DETECTOR_DEFAULTS } };
  const out = {
    baselineScore: baseline.score,
    tunedScore: tuned.score,
    improved,
    recommended: {
      darkExcess: pick.config.darkExcess,
      minimumAngularScore: pick.config.minimumAngularScore,
      impactRefineDarkness: pick.config.impactRefineDarkness,
      minimumAngleSeparation: pick.config.minimumAngleSeparation,
      impactRefineRadiusPx: pick.config.impactRefineRadiusPx,
      minimumRunLength: pick.config.minimumRunLength,
    },
  };
  fs.writeFileSync(path.join(root, "tools", "vision-tuning.json"), JSON.stringify(out, null, 2) + "\n");
  console.log("Recommended detector overrides:", JSON.stringify(out.recommended));
  if (pick.score < 0.55) throw new Error(`Vision simulation score too low: ${pick.score.toFixed(3)}`);
  console.log("Vision simulation OK");
}

main();