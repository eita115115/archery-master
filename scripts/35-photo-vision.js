"use strict";
// 的ノート: target vision (live camera + video frame analysis)

const MAX_ANALYSIS_EDGE_PX = 640;
const SHAFT_RADIUS_MM = 3.1;
const ANGLE_SAMPLES = 360;

// Kept in one place so the simulation harness can compare detector settings
// without giving the UI a different scoring rule.
const DETECTOR_DEFAULTS = Object.freeze({
  // Tuned via tools/simulate-vision.js (synthetic WA faces + grid search).
  colouredOuterRingRatio: 0.578,
  colourRadiusPercentile: 0.93,
  lowLightColourRadiusPercentile: 0.93,
  lowLightColouredOuterRingRatio: 0.578,
  maximumRadiusTailRatio: Infinity,
  strongColoursOnly: false,
  minimumColourValue: 70,
  minimumColourChroma: 0,
  minimumColourSaturation: 0.32,
  minimumRedSamples: 0,
  minimumBlueSamples: 0,
  redOnlyOuterRingRatio: 0.394,
  minimumRingSignature: 0.22,
  darkExcess: 42,
  minimumAngularScore: 600,
  medianScoreMultiplier: 1.65,
  minimumAngleSeparation: 12,
  minimumRunLength: 2,
  minimumLongestRun: 0,
  impactOffsetPx: 0,
  impactRefineRadiusPx: 4,
  impactRefineDarkness: 185,
  maximumCandidates: 14,
});

const ROBUST_RECOVERY_OPTIONS = Object.freeze({
  colouredOuterRingRatio: 0.595,
  colourRadiusPercentile: 0.97,
  lowLightColourRadiusPercentile: 0.93,
  lowLightColouredOuterRingRatio: 0.578,
  maximumRadiusTailRatio: 1.11,
  strongColoursOnly: true,
  minimumColourValue: 20,
  minimumColourChroma: 18,
  minimumColourSaturation: 0.18,
  minimumRedSamples: 24,
  minimumBlueSamples: 48,
  redOnlyOuterRingRatio: 0.394,
  minimumLongestRun: 8,
});

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("写真を読み込めませんでした"));
    image.src = source;
  });
}

function makeCanvas(image) {
  const scale = Math.min(1, MAX_ANALYSIS_EDGE_PX / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, width, height);
  return { context, width, height };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function imageMedianLuminance(data, width, height) {
  const values = [];
  const step = Math.max(4, Math.floor(Math.min(width, height) / 80));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const index = (y * width + x) * 4;
      values.push(data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722);
    }
  }
  return median(values);
}

function pixelDarkness(data, width, height, x, y) {
  const px = Math.max(0, Math.min(width - 1, Math.round(x)));
  const py = Math.max(0, Math.min(height - 1, Math.round(y)));
  const index = (py * width + px) * 4;
  return 255 - Math.round(data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722);
}

function pixelRgb(data, width, height, x, y) {
  const px = Math.max(0, Math.min(width - 1, Math.round(x)));
  const py = Math.max(0, Math.min(height - 1, Math.round(y)));
  const index = (py * width + px) * 4;
  return { r: data[index], g: data[index + 1], b: data[index + 2] };
}

function ringColourEvidence(data, width, height, x, y, colour) {
  const { r, g, b } = pixelRgb(data, width, height, x, y);
  if (colour === "red") return Math.max(0, r - (g + b) / 2) / 255;
  // A target blue remains cyan/blue under a warm lamp: both green and blue
  // stay noticeably above red, unlike timber or a sun-warmed background.
  return Math.max(0, Math.min(g - r, b - r)) / 255;
}

function detectRingSignatureTarget(imageData, width, height, config) {
  const { data } = imageData;
  const minDimension = Math.min(width, height);
  const centerOffsets = [-16, -8, 0, 8, 16].map((offset) => offset * (minDimension / 320));
  const radii = [];
  for (let radius = minDimension * 0.24; radius <= minDimension * 0.43; radius += minDimension * 0.01875) radii.push(radius);
  let best = null;

  for (const offsetY of centerOffsets) {
    for (const offsetX of centerOffsets) {
      const center = { x: width / 2 + offsetX, y: height / 2 + offsetY };
      for (const radiusPx of radii) {
        const redEvidence = [];
        const blueEvidence = [];
        for (let sample = 0; sample < 36; sample += 1) {
          const angle = (sample / 36) * Math.PI * 2;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          redEvidence.push(ringColourEvidence(data, width, height, center.x + cos * radiusPx * 0.3, center.y + sin * radiusPx * 0.3, "red"));
          blueEvidence.push(ringColourEvidence(data, width, height, center.x + cos * radiusPx * 0.5, center.y + sin * radiusPx * 0.5, "blue"));
        }
        const score = median(redEvidence) + median(blueEvidence);
        if (!best || score > best.score) best = { ...center, radiusPx, score };
      }
    }
  }
  if (!best || best.score < config.minimumRingSignature) return null;
  return {
    x: best.x,
    y: best.y,
    radiusPx: best.radiusPx,
    confidence: Math.max(0.42, Math.min(0.84, 0.34 + best.score * 0.48)),
    method: "ring-signature",
  };
}

function normalizeImageContrast(imageData, width, height) {
  const { data } = imageData;
  let minL = 255;
  let maxL = 0;
  const step = Math.max(2, Math.floor(Math.min(width, height) / 120));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const l = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
      if (l < minL) minL = l;
      if (l > maxL) maxL = l;
    }
  }
  const span = Math.max(18, maxL - minL);
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const l = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
    const stretch = Math.max(0, Math.min(255, ((l - minL) / span) * 255));
    const gain = stretch / Math.max(1, l);
    out[i] = Math.max(0, Math.min(255, data[i] * gain));
    out[i + 1] = Math.max(0, Math.min(255, data[i + 1] * gain));
    out[i + 2] = Math.max(0, Math.min(255, data[i + 2] * gain));
    out[i + 3] = data[i + 3];
  }
  return { data: out, width, height };
}

function frameSharpnessScore(imageData, width, height) {
  const { data } = imageData;
  let sum = 0;
  let n = 0;
  const step = Math.max(2, Math.floor(Math.min(width, height) / 100));
  for (let y = step; y < height - step; y += step) {
    for (let x = step; x < width - step; x += step) {
      const i = (y * width + x) * 4;
      const c = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
      const iR = ((y) * width + (x + step)) * 4;
      const iD = ((y + step) * width + x) * 4;
      const r = data[iR] * 0.2126 + data[iR + 1] * 0.7152 + data[iR + 2] * 0.0722;
      const d = data[iD] * 0.2126 + data[iD + 1] * 0.7152 + data[iD + 2] * 0.0722;
      sum += Math.abs(2 * c - r - d);
      n += 1;
    }
  }
  return n ? sum / n : 0;
}

function clusterArrowHits(arrows, mergeRadiusPct) {
  if (!arrows || !arrows.length) return [];
  const r = mergeRadiusPct || 2.8;
  const sorted = [...arrows].sort((a, b) => (b.quality || b.score || 0) - (a.quality || a.score || 0));
  const kept = [];
  for (const hit of sorted) {
    const dup = kept.find((k) => Math.hypot(k.x - hit.x, k.y - hit.y) < r);
    if (!dup) kept.push({ ...hit });
    else {
      dup.x = (dup.x + hit.x) / 2;
      dup.y = (dup.y + hit.y) / 2;
      dup.quality = Math.max(dup.quality || 0, hit.quality || 0);
      dup.votes = (dup.votes || 1) + 1;
    }
  }
  return kept;
}

function fuseDetectionResults(results) {
  const valid = (results || []).filter((r) => r && r.arrows && r.arrows.length && r.target);
  if (!valid.length) return null;
  const weights = valid.map((r) => (r.sharpness || 1) * (r.confidence || 50) / 100);
  const wSum = weights.reduce((a, x) => a + x, 0) || 1;
  const tcx = valid.reduce((a, r, i) => a + r.target.x * weights[i], 0) / wSum;
  const tcy = valid.reduce((a, r, i) => a + r.target.y * weights[i], 0) / wSum;
  const tr = valid.reduce((a, r, i) => a + r.target.radius * weights[i], 0) / wSum;
  const pooled = [];
  valid.forEach((r, i) => {
    r.arrows.forEach((ar) => pooled.push({ ...ar, quality: (ar.score || 5) * weights[i] }));
  });
  const arrows = clusterArrowHits(pooled, tr * 0.14).map((ar) => ({
    x: ar.x,
    y: ar.y,
    score: ar.score || 0,
  }));
  const confidence = Math.round(Math.min(96, valid.reduce((a, r, i) => a + (r.confidence || 0) * weights[i], 0) / wSum + Math.min(8, arrows.length)));
  return { arrows, target: { x: tcx, y: tcy, radius: tr }, confidence, method: "temporal-fusion" };
}

function refineImpactPoint(data, width, height, point, config) {
  if (!config.impactRefineRadiusPx) return point;
  const searchRadius = config.impactRefineRadiusPx;
  let totalWeight = 0;
  let totalX = 0;
  let totalY = 0;
  for (let y = Math.floor(point.y - searchRadius); y <= Math.ceil(point.y + searchRadius); y += 1) {
    for (let x = Math.floor(point.x - searchRadius); x <= Math.ceil(point.x + searchRadius); x += 1) {
      if (Math.hypot(x - point.x, y - point.y) > searchRadius) continue;
      const excessDarkness = pixelDarkness(data, width, height, x, y) - config.impactRefineDarkness;
      if (excessDarkness <= 0) continue;
      // Squaring prioritises the arrowhead over a lighter shaft shadow.
      const weight = excessDarkness * excessDarkness;
      totalWeight += weight;
      totalX += x * weight;
      totalY += y * weight;
    }
  }
  if (!totalWeight) return point;
  return { x: totalX / totalWeight, y: totalY / totalWeight };
}

function detectColourTarget(imageData, width, height, config) {
  const { data: pixels } = imageData;
  const lowLight = imageMedianLuminance(pixels, width, height) < 88;
  const samples = [];
  const redPoints = [];
  const bluePoints = [];
  let redSamples = 0;
  let blueSamples = 0;
  const step = Math.max(2, Math.floor(Math.min(width, height) / 280));

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      if (Math.hypot(x - width / 2, y - height / 2) > Math.min(width, height) * 0.47) continue;
      const index = (y * width + x) * 4;
      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const chroma = max - min;
      const saturation = max ? (max - min) / max : 0;
      const hue = max === min ? 0 : max === r ? ((g - b) / (max - min)) * 60 : max === g ? 120 + ((b - r) / (max - min)) * 60 : 240 + ((r - g) / (max - min)) * 60;
      const wrappedHue = hue < 0 ? hue + 360 : hue;
      // Relative channel checks keep dark black rings from becoming “blue”
      // through sensor noise, while accepting a warm/cool lamp colour cast.
      const red = (wrappedHue < 32 || wrappedHue > 326) && r > g * 2 && r > b * 2.4;
      const blue = wrappedHue > 155 && wrappedHue < 280 && g > r * 1.25 && b > r * 1.25;
      const legacyTargetHue = wrappedHue < 18 || wrappedHue > 338 || (wrappedHue > 34 && wrappedHue < 68) || (wrappedHue > 188 && wrappedHue < 250);
      const geometryColour = config.strongColoursOnly ? red || blue : legacyTargetHue;
      if (max > config.minimumColourValue && chroma > config.minimumColourChroma && saturation > config.minimumColourSaturation && geometryColour) {
        samples.push({ x, y });
        if (red) {
          redSamples += 1;
          redPoints.push({ x, y });
        }
        if (blue) {
          blueSamples += 1;
          bluePoints.push({ x, y });
        }
      }
    }
  }

  if (samples.length < 100 || redSamples < config.minimumRedSamples) return { failure: "insufficient-colour" };
  // A spotlight can illuminate the red center while leaving blue dim. In that
  // case infer the face diameter from the known outer red-ring position rather
  // than producing a confidently wrong small target.
  const hasBlueCoverage = blueSamples >= config.minimumBlueSamples;
  const geometryPoints = hasBlueCoverage ? samples : redPoints;
  const center = { x: median(geometryPoints.map((point) => point.x)), y: median(geometryPoints.map((point) => point.y)) };
  const radii = geometryPoints.map((point) => distance(point, center)).sort((a, b) => a - b);
  const p90RadiusPx = radii[Math.floor(radii.length * 0.9)];
  const p97RadiusPx = radii[Math.floor(radii.length * config.colourRadiusPercentile)];
  const hasOutlierTail = p97RadiusPx / Math.max(1, p90RadiusPx) > config.maximumRadiusTailRatio;
  const conservativeRadius = lowLight || hasOutlierTail;
  const radiusPercentile = conservativeRadius ? config.lowLightColourRadiusPercentile : config.colourRadiusPercentile;
  const colouredRadiusPx = radii[Math.floor(radii.length * radiusPercentile)];
  const targetRadiusPx = colouredRadiusPx / (hasBlueCoverage ? (conservativeRadius ? config.lowLightColouredOuterRingRatio : config.colouredOuterRingRatio) : config.redOnlyOuterRingRatio);
  const minDimension = Math.min(width, height);
  if (targetRadiusPx < minDimension * 0.16 || targetRadiusPx > minDimension * 0.58) return { failure: "implausible-radius", targetRadiusPx, minimumRadiusPx: minDimension * 0.16 };
  const quadrantCounts = [0, 0, 0, 0];
  for (const point of geometryPoints) quadrantCounts[(point.x >= center.x ? 1 : 0) + (point.y >= center.y ? 2 : 0)] += 1;
  const symmetry = Math.min(...quadrantCounts) / Math.max(...quadrantCounts);
  const colourBalance = Math.min(1, Math.min(redSamples / Math.max(1, blueSamples) * 1.65, blueSamples / Math.max(1, redSamples) / 1.65));
  const coverage = Math.min(1, samples.length / 1200);
  const confidence = Math.max(0.42, Math.min(0.86, 0.48 + symmetry * 0.16 + colourBalance * 0.12 + coverage * 0.1 - (hasBlueCoverage ? 0 : 0.1)));
  return { ...center, radiusPx: targetRadiusPx, confidence };
}

function findRadialArrowCandidates(imageData, width, height, target, config) {
  const { data } = imageData;
  const radialSamples = Math.max(72, Math.round(target.radiusPx / 2.2));
  const darkness = Array.from({ length: ANGLE_SAMPLES }, () => new Float32Array(radialSamples));
  const baseline = new Float32Array(radialSamples);

  for (let angleIndex = 0; angleIndex < ANGLE_SAMPLES; angleIndex += 1) {
    const angle = (angleIndex / ANGLE_SAMPLES) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (let radialIndex = 0; radialIndex < radialSamples; radialIndex += 1) {
      const radius = ((radialIndex + 0.5) / radialSamples) * target.radiusPx;
      const lateral = 1.3;
      const value = Math.max(
        pixelDarkness(data, width, height, target.x + cos * radius, target.y + sin * radius),
        pixelDarkness(data, width, height, target.x + cos * radius - sin * lateral, target.y + sin * radius + cos * lateral),
        pixelDarkness(data, width, height, target.x + cos * radius + sin * lateral, target.y + sin * radius - cos * lateral),
      );
      darkness[angleIndex][radialIndex] = value;
    }
  }

  for (let radialIndex = 0; radialIndex < radialSamples; radialIndex += 1) {
    baseline[radialIndex] = median(darkness.map((ray) => ray[radialIndex]));
  }

  const angularScores = new Float32Array(ANGLE_SAMPLES);
  const firstImpact = new Int16Array(ANGLE_SAMPLES).fill(-1);
  const longestRuns = new Int16Array(ANGLE_SAMPLES);
  for (let angleIndex = 0; angleIndex < ANGLE_SAMPLES; angleIndex += 1) {
    let score = 0;
    let run = 0;
    for (let radialIndex = 3; radialIndex < radialSamples - 2; radialIndex += 1) {
      const excess = darkness[angleIndex][radialIndex] - baseline[radialIndex];
      if (excess > config.darkExcess) {
        score += Math.min(120, excess);
        run += 1;
        longestRuns[angleIndex] = Math.max(longestRuns[angleIndex], run);
        if (firstImpact[angleIndex] === -1 && run >= config.minimumRunLength) firstImpact[angleIndex] = radialIndex - (config.minimumRunLength - 1);
      } else {
        run = 0;
      }
    }
    angularScores[angleIndex] = score;
  }

  const candidates = [];
  const minimumScore = Math.max(config.minimumAngularScore, median([...angularScores]) * config.medianScoreMultiplier);
  for (let angleIndex = 0; angleIndex < ANGLE_SAMPLES; angleIndex += 1) {
    const previous = angularScores[(angleIndex - 1 + ANGLE_SAMPLES) % ANGLE_SAMPLES];
    const next = angularScores[(angleIndex + 1) % ANGLE_SAMPLES];
    if (angularScores[angleIndex] < minimumScore || angularScores[angleIndex] < previous || angularScores[angleIndex] < next || firstImpact[angleIndex] < 0 || longestRuns[angleIndex] < config.minimumLongestRun) continue;
    const nearby = candidates.find((candidate) => {
      const diff = Math.abs(candidate.angleIndex - angleIndex);
      return Math.min(diff, ANGLE_SAMPLES - diff) < config.minimumAngleSeparation;
    });
    if (nearby && nearby.quality >= angularScores[angleIndex]) continue;
    if (nearby) candidates.splice(candidates.indexOf(nearby), 1);
    const angle = (angleIndex / ANGLE_SAMPLES) * Math.PI * 2;
    const impactRadiusPx = ((firstImpact[angleIndex] + 0.5) / radialSamples) * target.radiusPx + config.impactOffsetPx;
    const initialPoint = {
      x: target.x + Math.cos(angle) * impactRadiusPx,
      y: target.y + Math.sin(angle) * impactRadiusPx,
    };
    const refinedPoint = refineImpactPoint(data, width, height, initialPoint, config);
    candidates.push({
      x: refinedPoint.x,
      y: refinedPoint.y,
      quality: angularScores[angleIndex],
      angleIndex,
    });
  }

  return candidates.sort((a, b) => b.quality - a.quality).slice(0, config.maximumCandidates);
}

function evaluateCandidateRun(imageData, width, height, target, config, method) {
  if (!target || target.failure) return null;
  const candidates = findRadialArrowCandidates(imageData, width, height, target, config);
  if (candidates.length < 2) return null;
  const quality = median(candidates.map((point) => point.quality));
  const methodBias = method === "primary" ? 0.08 : method === "robust-colour" ? 0.04 : 0;
  const rank = Math.min(1, quality / 1050) * 0.56 + Math.min(1, candidates.length / 4) * 0.28 + target.confidence * 0.16 - Math.max(0, candidates.length - 6) * 0.07 + methodBias;
  return { target, candidates, quality, rank, method };
}

function estimateFaceDamage(imageData, width, height, target) {
  if (!target || target.failure) return 0;
  const { data } = imageData;
  let samples = 0;
  let darkMarks = 0;
  for (let y = Math.max(0, Math.floor(target.y - target.radiusPx * 0.62)); y <= Math.min(height - 1, Math.ceil(target.y + target.radiusPx * 0.62)); y += 2) {
    for (let x = Math.max(0, Math.floor(target.x - target.radiusPx * 0.62)); x <= Math.min(width - 1, Math.ceil(target.x + target.radiusPx * 0.62)); x += 2) {
      const normalizedRadius = Math.hypot(x - target.x, y - target.y) / target.radiusPx;
      if (normalizedRadius < 0.06 || normalizedRadius > 0.6) continue;
      const index = (y * width + x) * 4;
      const luminance = data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;
      samples += 1;
      if (luminance < 70) darkMarks += 1;
    }
  }
  return darkMarks / Math.max(1, samples);
}

function scoreImpact(point, target, faceCm) {
  const faceRadiusMm = faceCm * 5;
  const shaftRadiusPx = target.radiusPx * (SHAFT_RADIUS_MM / faceRadiusMm);
  const rawDistancePx = distance(point, target);
  const lineCutterDistancePx = Math.max(0, rawDistancePx - shaftRadiusPx);
  const normalizedRadius = lineCutterDistancePx / target.radiusPx;
  if (normalizedRadius > 1) return 0;
  return Math.max(1, 10 - Math.floor(normalizedRadius * 10));
}

/**
 * Run the detector against raw pixels. This is intentionally DOM-free so the
 * same production path can be exercised by deterministic image simulations.
 */
function analyzeImageData(imageData, width, height, faceCm, options = {}) {
  const config = { ...DETECTOR_DEFAULTS, ...options };
  if (options.normalizeContrast) {
    imageData = normalizeImageContrast(imageData, width, height);
  }
  const robustConfig = { ...config, ...ROBUST_RECOVERY_OPTIONS };
  const primaryTarget = detectColourTarget(imageData, width, height, config);
  const robustTarget = detectColourTarget(imageData, width, height, robustConfig);
  const ringTarget = detectRingSignatureTarget(imageData, width, height, robustConfig);
  const faceDamage = estimateFaceDamage(imageData, width, height, primaryTarget);
  const guardedPrimaryConfig = faceDamage > 0.15
    ? { ...config, minimumLongestRun: 12 }
    : faceDamage > 0.075
      ? { ...config, minimumLongestRun: 8 }
      : config;
  const runs = [
    evaluateCandidateRun(imageData, width, height, primaryTarget, guardedPrimaryConfig, "primary"),
    evaluateCandidateRun(imageData, width, height, robustTarget, robustConfig, "robust-colour"),
    evaluateCandidateRun(imageData, width, height, ringTarget, robustConfig, "ring-signature"),
  ].filter(Boolean).sort((left, right) => right.rank - left.rank);
  const selected = runs[0];
  if (!selected) {
    const target = !primaryTarget?.failure ? primaryTarget : robustTarget || ringTarget || primaryTarget;
    const hasTarget = target && !target.failure;
    const error = new Error(hasTarget ? "矢を十分に見つけられませんでした" : "的面を見つけられませんでした");
    error.code = hasTarget ? "insufficient-arrows" : target?.failure || "no-target";
    error.details = target;
    throw error;
  }

  const { target, candidates, quality: candidateQuality, method } = selected;

  const arrows = candidates.map((point) => ({
    x: (point.x / width) * 100,
    y: (point.y / height) * 100,
    score: scoreImpact(point, target, faceCm),
  }));
  const corroboratingRuns = runs.slice(1).filter((run) => distance(run.target, target) / Math.max(1, target.radiusPx) < 0.18 && Math.abs(run.target.radiusPx - target.radiusPx) / Math.max(1, target.radiusPx) < 0.18).length;
  const corroboration = Math.min(1, corroboratingRuns / 2);
  const targetEvidence = target.confidence * (0.84 + corroboration * 0.16);
  const arrowEvidence = Math.min(1, candidateQuality / 1250);
  const countEvidence = Math.min(1, arrows.length / 4);
  const damagePenalty = Math.min(0.16, Math.max(0, faceDamage - 0.075) * 2);
  // Confidence is deliberately an evidence score, not a celebration meter:
  // strong but mutually inconsistent target estimates stay below “high”.
  const methodPenalty = method === "primary" ? 0 : method === "robust-colour" ? 0.04 : 0.08;
  const confidence = Math.round(Math.min(94, Math.max(32, (targetEvidence * 0.6 + arrowEvidence * 0.24 + countEvidence * 0.1 + corroboration * 0.06 - methodPenalty - damagePenalty) * 100)));

  return {
    arrows,
    target: { x: (target.x / width) * 100, y: (target.y / height) * 100, radius: (target.radiusPx / Math.min(width, height)) * 100 },
    confidence,
    method,
  };
}

async function analyzeTargetPhoto(source, faceCm) {
  const image = await loadImage(source);
  const { context, width, height } = makeCanvas(image);
  const imageData = context.getImageData(0, 0, width, height);
  return analyzeImageData(imageData, width, height, faceCm);
}

function frameFromVideo(video) {
  if (!video || video.readyState < 2) return null;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;
  const scale = Math.min(1, MAX_ANALYSIS_EDGE_PX / Math.max(vw, vh));
  const width = Math.max(1, Math.round(vw * scale));
  const height = Math.max(1, Math.round(vh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(video, 0, 0, width, height);
  return { context, width, height };
}

function analyzeVideoFrame(video, faceCm, options = {}) {
  const frame = frameFromVideo(video);
  if (!frame) {
    const error = new Error("映像フレームを取得できません");
    error.code = "no-frame";
    throw error;
  }
  const imageData = frame.context.getImageData(0, 0, frame.width, frame.height);
  const result = analyzeImageData(imageData, frame.width, frame.height, faceCm, { normalizeContrast: true, ...options });
  result.sharpness = frameSharpnessScore(imageData, frame.width, frame.height);
  return result;
}

function seekVideo(video, timeSec) {
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener("seeked", done);
      resolve();
    };
    video.addEventListener("seeked", done);
    video.currentTime = timeSec;
    setTimeout(done, 500);
  });
}

async function scanVideoFile(file, faceCm, options = {}) {
  const intervalSec = options.intervalSec ?? 0.28;
  const onProgress = options.onProgress ?? (() => {});
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  try {
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error("動画を読み込めませんでした"));
      video.src = url;
    });
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) throw new Error("動画の長さを取得できません");
    const frameResults = [];
    const samples = Math.max(1, Math.ceil(duration / intervalSec));
    for (let i = 0; i < samples; i += 1) {
      const t = Math.min(Math.max(0, duration - 0.05), i * intervalSec);
      await seekVideo(video, t);
      onProgress(Math.round(((i + 1) / samples) * 100));
      try {
        const result = analyzeVideoFrame(video, faceCm, options);
        const frameScore = (result.sharpness || 0) * 0.55 + (result.confidence || 0) * 0.45;
        frameResults.push({ result, frameScore });
      } catch (_) { /* skip unusable frames */ }
    }
    if (!frameResults.length) {
      const error = new Error("動画から矢を検出できませんでした");
      error.code = "no-detection";
      throw error;
    }
    frameResults.sort((a, b) => b.frameScore - a.frameScore);
    const top = frameResults.slice(0, Math.min(5, frameResults.length)).map((f) => f.result);
    const fused = fuseDetectionResults(top);
    if (fused && fused.arrows.length) return fused;
    const best = frameResults[0].result;
    return best;
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute("src");
    video.load();
  }
}

function createLiveScanner({ video, faceCm, intervalMs = 650, onResult, onError, stabilityFrames = 3 }) {
  let timer = null;
  let busy = false;
  let lastSignature = "";
  const recent = [];
  const needStable = Math.max(2, stabilityFrames || 3);
  async function tick() {
    if (busy || !video) return;
    busy = true;
    try {
      const result = analyzeVideoFrame(video, faceCm);
      recent.push(result);
      if (recent.length > needStable + 1) recent.shift();
      const sig = result.arrows.map((arrow) => `${Math.round(arrow.x)}:${Math.round(arrow.y)}`).join("|");
      const stable = recent.length >= needStable && recent.slice(-needStable).every((r) => {
        const s = r.arrows.map((arrow) => `${Math.round(arrow.x)}:${Math.round(arrow.y)}`).join("|");
        return s === sig;
      });
      const emit = stable ? fuseDetectionResults(recent.slice(-needStable)) || result : null;
      if (emit && sig !== lastSignature) {
        lastSignature = sig;
        if (onResult) onResult(emit);
      } else if (!stable && onError) {
        onError({ code: "stabilizing", message: "検出を安定化中…" });
      }
    } catch (error) {
      if (onError) onError(error);
    } finally {
      busy = false;
    }
  }
  return {
    start() {
      if (!timer) timer = setInterval(tick, intervalMs);
      tick();
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      recent.length = 0;
      lastSignature = "";
    },
    analyzeNow: tick,
  };
}

if (typeof window !== "undefined") {
  window.ArcherVision = {
    DETECTOR_DEFAULTS,
    analyzeImageData,
    analyzeTargetPhoto,
    analyzeVideoFrame,
    scanVideoFile,
    createLiveScanner,
    scoreImpact,
    fuseDetectionResults,
    frameSharpnessScore,
  };
}