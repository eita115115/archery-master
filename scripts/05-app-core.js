"use strict";
/* 的ノート: shared core — loaders, cleanup, UI helpers */

const AI_OFFLINE_URLS = Object.freeze([
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/vision_bundle.mjs",
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm",
  "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js",
]);
let appManifestCache = null;

async function loadAppManifest() {
  if (appManifestCache) return appManifestCache;
  const res = await fetch("./app-scripts.json");
  appManifestCache = await res.json();
  return appManifestCache;
}

const cleanupHandlers = [];

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
    s.onerror = () => reject(new Error(`スクリプトを読み込めません: ${src}`));
    document.head.appendChild(s);
  });
}

function registerCleanup(fn) {
  if (typeof fn === "function") cleanupHandlers.push(fn);
}

function runCleanups() {
  while (cleanupHandlers.length) {
    const fn = cleanupHandlers.pop();
    try { fn(); } catch (_) { /* ignore */ }
  }
}

function setPanelStatus(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

function renderActionBar(containerId, buttons) {
  const el = $(containerId);
  if (!el) return;
  el.innerHTML = buttons.map((b) => `<button class="btn sm ${b.kind || "sec"}" id="${b.id}" type="button">${b.label}</button>`).join("");
  buttons.forEach((b) => {
    const node = $("#" + b.id);
    if (node) node.onclick = b.onclick;
  });
}

function movingAverage(values, windowSize) {
  const w = Math.max(1, windowSize || 3);
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - w + 1), i + 1);
    return slice.reduce((a, x) => a + x, 0) / slice.length;
  });
}

function importHitsToSession(s, hits, meta) {
  if (!hits || !hits.length) {
    toast("取り込める得点がありません");
    return 0;
  }
  hits.forEach((hit) => {
    if (s.cur.length < (s.perEnd || 6)) s.cur.push(hit);
  });
  nativePulse("success");
  save();
  refreshActive();
  const conf = meta && meta.confidence != null ? `（信頼度 ${meta.confidence}%）` : "";
  toast(`${hits.length}本を取り込み${conf}`);
  return hits.length;
}

function roomInCurrentEnd(s) {
  return Math.max(0, (s.perEnd || 6) - (s.cur || []).length);
}

function guardEndCapacity(s) {
  if (s.cur.length >= (s.perEnd || 6)) {
    toast("このエンドは満杯です。確定してから次へ");
    return false;
  }
  return true;
}

async function prepareOfflineAI(onProgress) {
  const progress = onProgress || (() => {});
  let urls = [...AI_OFFLINE_URLS];
  try {
    const manifest = await loadAppManifest();
    if (manifest.offlineUrls && manifest.offlineUrls.length) urls = [...manifest.offlineUrls, ...urls.filter((u) => !manifest.offlineUrls.includes(u))];
  } catch (_) { /* fallback to defaults */ }
  if ("caches" in window) {
    const cache = await caches.open(`matonote-ai-v${APP_VER}`);
    for (let i = 0; i < urls.length; i += 1) {
      try {
        await cache.add(urls[i]);
      } catch (_) { /* wasm dir may need fetch */ }
      progress(Math.round(((i + 1) / urls.length) * 70));
    }
  }
  try {
    if (window.ArcherForm && typeof window.ArcherForm.loadFormLandmarker === "function") {
      await window.ArcherForm.loadFormLandmarker();
      progress(90);
    }
  } catch (_) { /* optional */ }
  db.settings.aiOfflinePreparedAt = new Date().toISOString();
  save("ai-offline");
  progress(100);
  return true;
}

function cameraCapabilityProfile() {
  const nav = typeof navigator !== "undefined" ? navigator : {};
  const hasMedia = !!(nav.mediaDevices && nav.mediaDevices.getUserMedia);
  const isSecure = typeof location !== "undefined" && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1");
  return {
    available: hasMedia && isSecure,
    secureContext: isSecure,
    label: !hasMedia ? "カメラ非対応" : !isSecure ? "HTTPS が必要" : "カメラ利用可",
  };
}

if (typeof window !== "undefined") {
  const core = {
    AI_OFFLINE_URLS,
    loadAppManifest,
    loadScriptOnce,
    registerCleanup,
    runCleanups,
    setPanelStatus,
    renderActionBar,
    movingAverage,
    importHitsToSession,
    roomInCurrentEnd,
    guardEndCapacity,
    prepareOfflineAI,
    cameraCapabilityProfile,
  };
  window.ArcherCore = core;
  Object.keys(core).forEach((k) => { window[k] = core[k]; });
}