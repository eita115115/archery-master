"use strict";
/* 的ノート: paper score sheet OCR with grid preprocessing */

const TESSERACT_CDN = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";

async function ensureTesseract() {
  if (window.Tesseract) return window.Tesseract;
  await loadScriptOnce(TESSERACT_CDN);
  if (!window.Tesseract) throw new Error("Tesseract が利用できません");
  return window.Tesseract;
}

function normalizeOcrToken(raw) {
  const t = String(raw || "").trim().replace(/[oO]/g, "0").replace(/[|Il]/g, "1");
  if (!t) return null;
  const up = t.toUpperCase();
  if (up === "X") return "X";
  if (up === "M") return "M";
  if (/^10$/.test(t)) return "10";
  if (/^[1-9]$/.test(t)) return t;
  if (/^0$/.test(t)) return "M";
  return null;
}

function parseOcrLines(text) {
  const ends = [];
  let current = [];
  String(text || "").split(/\r?\n/).forEach((line) => {
    line.split(/[\s,|/・]+/).map(normalizeOcrToken).filter(Boolean).forEach((tok) => {
      current.push(tok);
      if (current.length >= 6) {
        ends.push(current.slice(0, 6));
        current = [];
      }
    });
  });
  if (current.length) ends.push(current);
  return ends;
}

function ocrEndsToArrows(ends, s) {
  const room = roomInCurrentEnd(s);
  return ends.flat().slice(0, room).map((tok) => arrowFromGridValue(tok));
}

function imageToCanvas(img, maxEdge) {
  const scale = Math.min(1, (maxEdge || 1100) / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, width, height);
  return { canvas, ctx, width, height };
}

function estimateGridLayout(width, height, cols) {
  const c = cols || 6;
  const headerH = Math.round(height * 0.1);
  const bodyH = height - headerH;
  const cellW = width / c;
  const cellH = Math.max(18, cellW * 0.82);
  const rows = Math.min(12, Math.max(1, Math.floor(bodyH / cellH)));
  return { cols: c, rows, headerH, cellW, cellH };
}

function cropCell(ctx, width, layout, row, col) {
  const x = Math.round(col * layout.cellW);
  const y = Math.round(layout.headerH + row * layout.cellH);
  const w = Math.round(layout.cellW);
  const h = Math.round(layout.cellH);
  const data = ctx.getImageData(Math.max(0, x), Math.max(0, y), Math.min(w, width - x), Math.min(h, width));
  const cell = document.createElement("canvas");
  cell.width = data.width;
  cell.height = data.height;
  cell.getContext("2d").putImageData(data, 0, 0);
  return cell;
}

async function recognizeGridCells(source, Tesseract, onProgress) {
  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("画像を読み込めませんでした"));
    image.src = source;
  });
  const { canvas, ctx, width, height } = imageToCanvas(img, 1100);
  const layout = estimateGridLayout(width, height, 6);
  const ends = [];
  let current = [];
  const total = layout.rows * layout.cols;
  let idx = 0;
  for (let r = 0; r < layout.rows; r += 1) {
    for (let c = 0; c < layout.cols; c += 1) {
      idx += 1;
      if (onProgress) onProgress(10 + Math.round((idx / total) * 75));
      const cell = cropCell(ctx, width, layout, r, c);
      try {
        const res = await Tesseract.recognize(cell, "eng", { tessedit_char_whitelist: "XxMm0123456789" });
        const tok = normalizeOcrToken((res.data.text || "").replace(/\s/g, ""));
        if (tok) {
          current.push(tok);
          if (current.length >= 6) {
            ends.push(current.slice(0, 6));
            current = [];
          }
        }
      } catch (_) { /* skip cell */ }
    }
  }
  if (current.length) ends.push(current);
  return { ends, layout, canvas };
}

async function recognizeScoreSheet(source, options) {
  options = options || {};
  const onProgress = options.onProgress || (() => {});
  onProgress(3);
  const Tesseract = await ensureTesseract();
  onProgress(8);
  let ends = [];
  let method = "grid";
  let rawText = "";
  try {
    const grid = await recognizeGridCells(source, Tesseract, onProgress);
    ends = grid.ends;
    rawText = `grid:${ends.length}ends`;
  } catch (_) {
    method = "full";
  }
  if (!ends.length) {
    onProgress(88);
    const result = await Tesseract.recognize(source, "eng", {
      logger: (m) => {
        if (m.status === "recognizing text" && m.progress != null) {
          onProgress(15 + Math.round(m.progress * 70));
        }
      },
    });
    rawText = result.data.text || "";
    ends = parseOcrLines(rawText);
    method = "tesseract-full";
  }
  const confidence = Math.round(Math.min(94, Math.max(28, Math.min(ends.length * 10, 40) + (ends.flat().length * 2) + (method === "grid" ? 18 : 8))));
  onProgress(100);
  if (!ends.length) {
    const error = new Error("スコア表から得点を読み取れませんでした");
    error.code = "no-scores";
    error.rawText = rawText;
    throw error;
  }
  return { ends, confidence, rawText, method };
}

async function recognizeScoreSheetFile(file, options) {
  const url = URL.createObjectURL(file);
  try {
    return await recognizeScoreSheet(url, options);
  } finally {
    URL.revokeObjectURL(url);
  }
}

if (typeof window !== "undefined") {
  window.ArcherOCR = {
    recognizeScoreSheet,
    recognizeScoreSheetFile,
    parseOcrLines,
    ocrEndsToArrows,
    normalizeOcrToken,
    estimateGridLayout,
  };
}