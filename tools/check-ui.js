const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const net = require("net");

const root = path.resolve(__dirname, "..");
const htmlPath = path.join(root, "index.html");
const html = fs.readFileSync(htmlPath, "utf8");
const css = fs.readFileSync(path.join(root, "style.css"), "utf8");
const uiCss = ["ui/ui-tokens.css", "ui/ds-components.css", "ui/ds-screens.css", "ui/ui-motion.css", "ui/ui-overrides.css"]
  .map((f) => fs.readFileSync(path.join(root, f), "utf8")).join("\n");
const appManifest = JSON.parse(fs.readFileSync(path.join(root, "app-scripts.json"), "utf8"));
const appScripts = appManifest.scripts;
const appJs = appScripts.map((file) => fs.readFileSync(path.join(root, file.replace(/\//g, path.sep)), "utf8")).join("\n");
const surface = `${html}\n${css}\n${uiCss}\n${appJs}`;
const appUrl = `file:///${htmlPath.replace(/\\/g, "/")}`;
const outDir = path.join(root, "artifacts", "ui-smoke");

function assert(ok, msg) {
  if (!ok) throw new Error(msg);
}

function browserCandidates() {
  return [
    process.env.CHROME_PATH,
    process.env.EDGE_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);
}

function findBrowser() {
  const found = browserCandidates().find(p => fs.existsSync(p));
  assert(found, "Chrome/Edge was not found. Set CHROME_PATH or EDGE_PATH.");
  return found;
}

function ensureInsideRoot(p) {
  const full = path.resolve(p);
  assert(full === root || full.startsWith(root + path.sep), `Refusing path outside workspace: ${full}`);
  return full;
}

function cleanDir(dir) {
  const full = ensureInsideRoot(dir);
  if (fs.existsSync(full)) {
    try { fs.rmSync(full, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); }
    catch (err) {
      if (err.code !== "EPERM" && err.code !== "EBUSY") throw err;
      for (const entry of fs.readdirSync(full)) {
        if (!entry.startsWith(".profile-")) {
          const p = path.join(full, entry);
          try { fs.rmSync(p, { recursive: true, force: true }); } catch (_) { /* locked */ }
        }
      }
    }
  }
  fs.mkdirSync(full, { recursive: true });
}

function pngSize(file) {
  const b = fs.readFileSync(file);
  assert(b.length > 24 && b.toString("ascii", 1, 4) === "PNG", `Not a PNG: ${file}`);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), bytes: b.length };
}

function stripFunction(src, name) {
  let s = src;
  const needle = `function ${name}(`;
  for (let start = s.indexOf(needle); start >= 0; start = s.indexOf(needle)) {
    const next = s.indexOf("\nfunction ", start + needle.length);
    s = next < 0 ? s.slice(0, start) : s.slice(0, start) + s.slice(next + 1);
  }
  return s;
}
function assertForbiddenUiCopy(src) {
  let s = stripFunction(stripFunction(src.replace(/\/\*[\s\S]*?\*\//g, ""), "pageHeroHtml"), "recordIntroHtml");
  const rules = [
    ["AIオフライン", /AIオフライン/],
    ["PWA + Capacitor-ready", /PWA \+ Capacitor-ready/],
    ["§番号（ユーザー向け）", /§\d/],
    ["判断信頼度", /判断信頼度/],
    ["個人データ準備度", /個人データ準備度/],
    ["射形コーチ", /射形コーチ/],
    ["nativeStack", /nativeStack/],
  ];
  for (const [label, re] of rules) {
    assert(!re.test(s), `Forbidden UI copy remains: ${label}`);
  }
}
function staticUiChecks() {
  assertForbiddenUiCopy(appJs);
  assert(appJs.includes("onboardSheetHtml") && appJs.includes("射形の確認"), "UI-P4 onboard/form copy missing");
  assert(/<meta name="viewport"[^>]*width=device-width/.test(html), "Viewport meta missing");
  assert(/maximum-scale=5/.test(html) && !/user-scalable=no/.test(html), "Viewport must allow zoom for accessibility");
  assert(html.includes('<link rel="stylesheet" href="style.css">'), "style.css link missing");
  assert(html.includes("ui/ui-tokens.css") && html.includes("ui/ds-components.css") && html.includes("ui/ds-screens.css") && html.includes("ui/ui-motion.css") && html.includes("ui/ui-overrides.css"), "UI layer CSS links missing");
  assert(appScripts.includes("scripts/ui/ds-primitives.js"), "ds-primitives.js not wired");
  assert(surface.includes("mountOverlay") && surface.includes("mountSheetA11y"), "Design system primitives missing");
  assert(appScripts.every((file) => html.includes(`<script src="${file}"></script>`)) && !/<script>([\s\S]*?)<\/script>/.test(html), "index.html scripts must match app-scripts.json");
  assert(!fs.existsSync(path.join(root, "app.js")), "Legacy app.js should not remain after script split");
  assert(/<nav class="tabs" id="tabs"[^>]*>/.test(html), "Tab bar missing");
  const tabMatches = [...html.matchAll(/<button data-v="([^"]+)"[^>]*>[\s\S]*?<\/button>/g)].map((m) => m[1]);
  assert(tabMatches.join(",") === "home,record,analysis,history,stats", `Unexpected tabs: ${tabMatches.join(",")}`);
  assert(surface.includes("記録") && surface.includes("分析") && surface.includes("履歴") && surface.includes("統計") && surface.includes("ホーム"), "Tab labels missing");
  assert(surface.includes("renderAnalysis") && surface.includes("openAnalysisTab") && surface.includes("ic-analysis"), "Analysis tab missing");
  assert(css.includes("touch-action:manipulation") && css.includes("min-height:48px"), "Touch/chrome styling missing");
  assert(uiCss.includes("html.ui-refresh"), "ui layer CSS must scope to html.ui-refresh");
  assert(surface.includes("@keyframes appRise") && surface.includes("scorePop") && surface.includes("prefers-reduced-motion") && surface.includes("ic-home"), "Motion primitives missing");
  assert(surface.includes("dashCompact") && surface.includes("今日の記録を始める") && surface.includes("条件を変える") && surface.includes("quickStartSession"), "UI-P2 home missing");
  assert(surface.includes("compactHud") && surface.includes("inputModeBarHtml") && surface.includes("openInputMoreSheet"), "UI-P2 record missing");
  assert(surface.includes("syncLiveHudMetrics") && surface.includes("celebrateBest") && surface.includes("pulseTabSpring"), "UI-P5 motion missing");
  assert(appScripts.includes("scripts/54-motion.js") && appScripts.includes("scripts/56-onboard.js") && appScripts.includes("scripts/57-ui-depth.js"), "UI layer scripts not wired");
  assert(html.includes("練習ノート"), "Header subtitle missing");
  assert(appJs.includes("<summary>アプリ情報</summary>") && !appJs.includes("nativeStack"), "UI-P4 settings copy missing");
  assert(surface.includes("自動バックアップ") && surface.includes("今すぐバックアップ"), "Backup settings copy missing");
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function stopProcess(proc) {
  if (proc.exitCode !== null) return;
  const closed = new Promise(resolve => proc.once("close", resolve));
  proc.kill();
  await Promise.race([closed, sleep(1500)]);
}

async function rmDirWithRetry(dir) {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 2, retryDelay: 120 });
      return;
    } catch (err) {
      if (attempt === 7 && (err.code === "EPERM" || err.code === "EBUSY")) return;
      if (attempt === 7) throw err;
      await sleep(200);
    }
  }
}

async function fetchJson(url, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    assert(res.ok, `HTTP ${res.status} from ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function waitForPageTarget(port) {
  const deadline = Date.now() + 10000;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`, 1000);
      const page = targets.find(t => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch (err) {
      lastError = err.message;
    }
    await sleep(120);
  }
  throw new Error(`Timed out waiting for Chrome DevTools page target${lastError ? `: ${lastError}` : ""}`);
}

function createCdpClient(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let nextId = 1;
    const pending = new Map();
    const eventWaiters = [];
    const openTimer = setTimeout(() => reject(new Error("Timed out opening DevTools websocket")), 8000);

    ws.addEventListener("open", () => {
      clearTimeout(openTimer);
      resolve({
        send(method, params = {}) {
          const id = nextId++;
          ws.send(JSON.stringify({ id, method, params }));
          return new Promise((res, rej) => pending.set(id, { res, rej, method }));
        },
        waitEvent(method, timeoutMs = 5000) {
          return new Promise((res, rej) => {
            const timer = setTimeout(() => {
              const idx = eventWaiters.findIndex(w => w.res === res);
              if (idx >= 0) eventWaiters.splice(idx, 1);
              rej(new Error(`Timed out waiting for ${method}`));
            }, timeoutMs);
            eventWaiters.push({ method, res, rej, timer });
          });
        },
        close() {
          ws.close();
        },
      });
    });

    ws.addEventListener("message", ev => {
      const raw = typeof ev.data === "string" ? ev.data : Buffer.from(ev.data).toString("utf8");
      const msg = JSON.parse(raw);
      if (msg.id && pending.has(msg.id)) {
        const task = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) task.rej(new Error(`${task.method}: ${msg.error.message}`));
        else task.res(msg.result || {});
        return;
      }
      if (msg.method) {
        for (let i = eventWaiters.length - 1; i >= 0; i--) {
          const waiter = eventWaiters[i];
          if (waiter.method === msg.method) {
            eventWaiters.splice(i, 1);
            clearTimeout(waiter.timer);
            waiter.res(msg.params || {});
          }
        }
      }
    });

    ws.addEventListener("error", err => reject(new Error(`DevTools websocket error: ${err.message || err.type || err}`)));
  });
}

async function screenshot(browser, view) {
  const profile = path.join(outDir, `.profile-${view.name}-${Date.now()}`);
  const shot = path.join(outDir, `${view.name}.png`);
  fs.mkdirSync(profile, { recursive: true });
  const port = await freePort();
  const args = [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-gpu-compositing",
    "--disable-software-rasterizer",
    "--disable-accelerated-2d-canvas",
    "--disable-dev-shm-usage",
    "--force-device-scale-factor=1",
    "--hide-scrollbars",
    "--disable-background-networking",
    "--allow-file-access-from-files",
    "--no-first-run",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ];
  const proc = spawn(browser, args, { stdio: ["ignore", "pipe", "pipe"] });
  let text = "";
  proc.stdout.on("data", d => { text += d.toString(); });
  proc.stderr.on("data", d => { text += d.toString(); });
  let client;
  try {
    const wsUrl = await waitForPageTarget(port);
    client = await createCdpClient(wsUrl);
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `try{localStorage.setItem("uiRefreshPreview","1");localStorage.setItem("matonote_onboarded_v1","1");}catch(e){}`,
    });
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: view.width,
      height: view.height,
      deviceScaleFactor: 1,
      mobile: view.width <= 520,
    });
    await client.send("Emulation.setTouchEmulationEnabled", { enabled: view.width <= 520 });
    const load = client.waitEvent("Page.loadEventFired", 10000).catch(() => null);
    await client.send("Page.navigate", { url: `${appUrl}?uiSmoke=${Date.now()}-${view.name}` });
    await load;
    await client.send("Runtime.evaluate", {
      expression: "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
      awaitPromise: true,
    });
    const metrics = await client.send("Runtime.evaluate", {
      expression: `(() => {
        const vw = window.innerWidth;
        const overflow = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - vw;
        const gear = document.querySelector("#btnSettings")?.getBoundingClientRect();
        const tabs = [...document.querySelectorAll("nav.tabs button")].map(b => b.getBoundingClientRect());
        const homeBtn = document.querySelector('nav.tabs button[data-v="home"]');
        const mainText = document.querySelector("#main")?.innerText || "";
        return {
          vw,
          overflow,
          uiRefresh: document.documentElement.classList.contains("ui-refresh"),
          hasHomeCta: /今日の記録を始める/.test(mainText),
          homeOn: !!homeBtn?.classList.contains("on"),
          gear: gear && { left: gear.left, right: gear.right, width: gear.width },
          tabs: tabs.map(t => ({ left: t.left, right: t.right, width: t.width })),
        };
      })()`,
      returnByValue: true,
    });
    const value = metrics.result.value;
    assert(value.uiRefresh, `${view.name} missing html.ui-refresh class`);
    assert(value.hasHomeCta, `${view.name} home CTA not rendered`);
    assert(value.homeOn, `${view.name} home tab should be active on boot`);
    assert(value.overflow <= 1, `${view.name} has horizontal overflow: ${JSON.stringify(value)}`);
    assert(value.gear && value.gear.left >= 0 && value.gear.right <= value.vw + 1, `${view.name} settings button is clipped: ${JSON.stringify(value.gear)}`);
    assert(value.tabs.length === 4 && value.tabs.every(t => t.left >= -1 && t.right <= value.vw + 1 && t.width > 36), `${view.name} tab bar is clipped: ${JSON.stringify(value.tabs)}`);
    const capture = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
    fs.writeFileSync(shot, Buffer.from(capture.data, "base64"));
    assert(fs.existsSync(shot), `Screenshot was not created: ${shot}`);
    const size = pngSize(shot);
    assert(size.width === view.width && size.height === view.height, `Unexpected screenshot size for ${view.name}: ${size.width}x${size.height}`);
    assert(size.bytes > 12000, `Screenshot too small for ${view.name}: ${size.bytes} bytes`);
    return { file: shot, ...size };
  } finally {
    if (client) client.close();
    await stopProcess(proc);
    const full = ensureInsideRoot(profile);
    await rmDirWithRetry(full);
  }
}

async function main() {
  cleanDir(outDir);
  staticUiChecks();
  const browser = findBrowser();
  const views = [
    { name: "iphone-390", width: 390, height: 844 },
    { name: "small-360", width: 360, height: 780 },
    { name: "desktop-1280", width: 1280, height: 800 },
  ];
  const shots = [];
  for (const view of views) {
    shots.push(await screenshot(browser, view));
  }
  console.log(`UI smoke checks OK (${path.basename(browser)})`);
  shots.forEach(s => console.log(`${path.relative(root, s.file)} ${s.width}x${s.height} ${s.bytes} bytes`));
}

main().catch(err => {
  console.error(err.stack || err.message);
  process.exit(1);
});
