"use strict";
/* 的ノート: paper score sheet OCR (Phase 4) */

const OCR_SCORE_TOKENS = new Set(["X", "x", "10", "9", "8", "7", "6", "5", "4", "3", "2", "1", "M", "m"]);
const TESSERACT_CDN = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.dataset.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("OCRライブラリを読み込めませんでした"));
    document.head.appendChild(s);
  });
}

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
  const lines = String(text || "").split(/\r?\n/);
  lines.forEach((line) => {
    const tokens = line.split(/[\s,|/・]+/).map(normalizeOcrToken).filter(Boolean);
    tokens.forEach((tok) => {
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
  const shaft = lineCutRadius(s.faceD, s.faceType);
  const room = Math.max(0, (s.perEnd || 6) - (s.cur || []).length);
  const flat = ends.flat().slice(0, room);
  return flat.map((tok) => arrowFromGridValue(tok));
}

async function loadOcrImage(source) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("画像を読み込めませんでした"));
    img.src = source;
  });
}

async function recognizeScoreSheet(source, options = {}) {
  const onProgress = options.onProgress || (() => {});
  onProgress(5);
  const Tesseract = await ensureTesseract();
  onProgress(15);
  const result = await Tesseract.recognize(source, "eng", {
    logger: (m) => {
      if (m.status === "recognizing text" && m.progress != null) {
        onProgress(15 + Math.round(m.progress * 70));
      }
    },
  });
  onProgress(90);
  const text = result && result.data && result.data.text ? result.data.text : "";
  const ends = parseOcrLines(text);
  const confidence = Math.round(Math.min(92, Math.max(25, (result.data.confidence || 40) * 0.85 + Math.min(ends.length * 8, 24))));
  onProgress(100);
  if (!ends.length) {
    const error = new Error("スコア表から得点を読み取れませんでした");
    error.code = "no-scores";
    error.rawText = text;
    throw error;
  }
  return { ends, confidence, rawText: text };
}

async function recognizeScoreSheetFile(file, options = {}) {
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
  };
}