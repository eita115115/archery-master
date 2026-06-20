const CACHE = "matonote-v58";
const APP_SCRIPTS = [
  "./scripts/00-compat.js",
  "./scripts/10-storage-native.js",
  "./scripts/20-scoring.js",
  "./scripts/30-target-svg.js",
  "./scripts/35-photo-vision.js",
  "./scripts/36-score-ocr.js",
  "./scripts/37-form-coach.js",
  "./scripts/40-analysis-physics.js",
  "./scripts/45-stats-engine.js",
  "./scripts/50-record-view.js",
  "./scripts/55-stats-view.js",
  "./scripts/60-history-sight-view.js",
  "./scripts/70-gear-settings.js",
  "./scripts/90-init.js",
];
const ASSETS = ["./index.html", "./style.css", ...APP_SCRIPTS, "./manifest.json", "./icon.svg", "./apple-touch-icon.png", "./pose_landmarker_lite.task"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
// ネット優先・失敗時キャッシュ（更新を取り込みつつオフラインでも動く）
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res && (res.ok || res.type === "opaque")) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => e.request.mode === "navigate"
        ? caches.match("./index.html")
        : caches.match(e.request, { ignoreSearch: true }))
  );
});
