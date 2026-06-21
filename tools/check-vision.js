const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const visionPath = path.join(root, "scripts", "35-photo-vision.js");
const scoringPath = path.join(root, "scripts", "20-scoring.js");

function assert(ok, msg) {
  if (!ok) throw new Error(msg);
}

const source = fs.readFileSync(visionPath, "utf8");
assert(source.includes('"use strict"'), "35-photo-vision.js must use strict mode");
assert(source.includes("的ノート: target vision"), "35-photo-vision.js header comment missing");
assert(source.includes("analyzeVideoFrame") && source.includes("scanVideoFile") && source.includes("createLiveScanner"), "video/live vision API missing");
assert(source.includes("fuseDetectionResults") && source.includes("frameSharpnessScore"), "temporal fusion API missing");
assert(source.includes("window.ArcherVision"), "35-photo-vision.js must expose window.ArcherVision");
assert(!/\bexport\b/.test(source), "35-photo-vision.js must not use export keywords");

const stripped = source.replace(/window\.ArcherVision\s*=\s*\{[\s\S]*?\};?\s*$/m, "");

function makeImageData(width, height, paint) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const rgb = paint(x, y);
      data[index] = rgb[0];
      data[index + 1] = rgb[1];
      data[index + 2] = rgb[2];
      data[index + 3] = 255;
    }
  }
  return { data, width, height };
}

function fakeTargetImageData(size = 100) {
  const cx = size / 2;
  const cy = size / 2;
  return makeImageData(size, size, (x, y) => {
    const radius = Math.hypot(x - cx, y - cy);
    if (radius < size * 0.12) return [255, 220, 40];
    if (radius < size * 0.22) return [210, 40, 40];
    if (radius < size * 0.32) return [40, 70, 210];
    if (radius < size * 0.42) return [30, 30, 30];
    return [235, 235, 230];
  });
}

const sandbox = {
  console,
  Math,
  Object,
  Array,
  Float32Array,
  Int16Array,
  Uint8ClampedArray,
  Promise,
  Error,
  Image: function Image() {
    this.naturalWidth = 100;
    this.naturalHeight = 100;
    this.onload = null;
    this.onerror = null;
    this._src = "";
    Object.defineProperty(this, "src", {
      set(value) {
        this._src = value;
        if (typeof this.onload === "function") this.onload();
      },
      get() {
        return this._src;
      },
    });
  },
  document: {
    createElement(tag) {
      assert(tag === "canvas", "unexpected DOM element");
      const width = { value: 0 };
      const height = { value: 0 };
      const pixels = new Uint8ClampedArray(0);
      return {
        get width() {
          return width.value;
        },
        set width(value) {
          width.value = value;
        },
        get height() {
          return height.value;
        },
        set height(value) {
          height.value = value;
        },
        getContext() {
          return {
            drawImage() {},
            getImageData(x, y, w, h) {
              return { data: pixels.slice(0, w * h * 4), width: w, height: h };
            },
          };
        },
      };
    },
  },
  window: {},
};

const scoringSource = fs.readFileSync(scoringPath, "utf8");
const scoringStart = scoringSource.indexOf("function isFieldFace");
const scoringEnd = scoringSource.indexOf("function momentStats");
const scoringSlice = scoringSource.slice(scoringStart, scoringEnd);

sandbox.__exports = {};
vm.createContext(sandbox);
vm.runInContext(`${scoringSlice}
${stripped}
__exports.DETECTOR_DEFAULTS = DETECTOR_DEFAULTS;
__exports.analyzeImageData = analyzeImageData;
__exports.analyzeTargetPhoto = analyzeTargetPhoto;
__exports.analyzeVideoFrame = analyzeVideoFrame;
__exports.scanVideoFile = scanVideoFile;
__exports.createLiveScanner = createLiveScanner;
__exports.scoreImpact = scoreImpact;
`, sandbox);

const { scoreImpact, analyzeImageData, analyzeTargetPhoto, analyzeVideoFrame, scanVideoFile, createLiveScanner, DETECTOR_DEFAULTS } = sandbox.__exports;

assert(typeof scoreImpact === "function", "scoreImpact missing");
assert(typeof analyzeImageData === "function", "analyzeImageData missing");
assert(typeof analyzeTargetPhoto === "function", "analyzeTargetPhoto missing");
assert(typeof analyzeVideoFrame === "function", "analyzeVideoFrame missing");
assert(typeof scanVideoFile === "function", "scanVideoFile missing");
assert(typeof createLiveScanner === "function", "createLiveScanner missing");
assert(DETECTOR_DEFAULTS && typeof DETECTOR_DEFAULTS === "object", "DETECTOR_DEFAULTS missing");

const target = { x: 50, y: 50, radiusPx: 40 };
const centerScore = scoreImpact({ x: 50, y: 50 }, target, 122);
const edgeScore = scoreImpact({ x: 88, y: 50 }, target, 122);
assert(centerScore === 10, `center score expected 10, got ${centerScore}`);
assert(edgeScore < centerScore, `edge score expected lower than center, got ${edgeScore}`);
assert(edgeScore >= 1, `edge score expected at least 1, got ${edgeScore}`);

const imageData = fakeTargetImageData(100);
try {
  const result = analyzeImageData(imageData, 100, 100, 122);
  assert(result && Array.isArray(result.arrows) && result.target, "analyzeImageData result shape invalid");
} catch (error) {
  assert(error && typeof error.code === "string", "analyzeImageData should throw coded detector errors");
}
console.log("Vision checks OK");