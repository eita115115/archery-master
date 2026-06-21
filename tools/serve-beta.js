"use strict";
/* LAN static server for beta device testing (PWA + SW on localhost/LAN). */

const fs = require("fs");
const http = require("http");
const path = require("path");
const os = require("os");

const root = path.resolve(__dirname, "..");
const port = +(process.env.BETA_PORT || 4173);
const host = "0.0.0.0";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
  ".task": "application/octet-stream",
};

function lanAddresses() {
  const out = [];
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets || []) {
      if (net.family === "IPv4" && !net.internal) out.push(net.address);
    }
  }
  return out;
}

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const rel = decoded === "/" ? "/index.html" : decoded;
  const full = path.resolve(root, "." + rel);
  if (!(full === root || full.startsWith(root + path.sep))) return null;
  return full;
}

const server = http.createServer((req, res) => {
  const file = safePath(req.url || "/");
  if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  fs.createReadStream(file).pipe(res);
});

server.listen(port, host, () => {
  const ips = lanAddresses();
  console.log("Archery-master ベータ実機サーバー");
  console.log(`  ルート: ${root}`);
  console.log(`  ローカル: http://127.0.0.1:${port}/`);
  ips.forEach((ip) => console.log(`  実機(LAN): http://${ip}:${port}/`));
  console.log("\nベータ（全機能）: beta.json により自動有効化。明示する場合は ?beta=1");
  console.log("終了: Ctrl+C");
});