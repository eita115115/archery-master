const CACHE = "matonote-v82";

function buildAssetList(manifest) {
  const scripts = (manifest.scripts || []).map((f) => `./${f}`);
  const staticAssets = (manifest.staticAssets || []).map((f) => `./${f}`);
  return ["./index.html", "./style.css", "./app-scripts.json", ...scripts, ...staticAssets];
}

self.addEventListener("install", (e) => {
  e.waitUntil(
    fetch("./app-scripts.json")
      .then((r) => r.json())
      .then((manifest) => caches.open(CACHE).then((c) => c.addAll(buildAssetList(manifest))))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && !k.startsWith("matonote-ai")).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  const isAiCdn = /mediapipe|tesseract\.js/.test(url.hostname + url.pathname);
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res && (res.ok || res.type === "opaque")) {
          const copy = res.clone();
          const bucket = isAiCdn ? "matonote-ai-prep" : CACHE;
          caches.open(bucket).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => {
        if (e.request.mode === "navigate") return caches.match("./index.html");
        return caches.match(e.request, { ignoreSearch: true });
      })
  );
});