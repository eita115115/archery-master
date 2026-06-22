const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const net = require("net");

const root = path.resolve(__dirname, "..");
const htmlPath = path.join(root, "index.html");
const appUrl = `file:///${htmlPath.replace(/\\/g, "/")}`;
const appManifest = JSON.parse(fs.readFileSync(path.join(root, "app-scripts.json"), "utf8"));
const appJs = appManifest.scripts
  .map((file) => fs.readFileSync(path.join(root, file.replace(/\//g, path.sep)), "utf8"))
  .join("\n");

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
  const found = browserCandidates().find((p) => fs.existsSync(p));
  assert(found, "Chrome/Edge was not found. Set CHROME_PATH or EDGE_PATH.");
  return found;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function waitForPageTarget(port) {
  const deadline = Date.now() + 12000;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1000) });
      const targets = await res.json();
      const page = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch (err) {
      lastError = err.message;
    }
    await sleep(120);
  }
  throw new Error(`Timed out waiting for DevTools${lastError ? `: ${lastError}` : ""}`);
}

function createCdpClient(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let nextId = 1;
    const pending = new Map();
    const openTimer = setTimeout(() => reject(new Error("DevTools websocket open timeout")), 8000);

    ws.addEventListener("open", () => {
      clearTimeout(openTimer);
      resolve({
        send(method, params = {}) {
          const id = nextId++;
          ws.send(JSON.stringify({ id, method, params }));
          return new Promise((res, rej) => pending.set(id, { res, rej, method }));
        },
        close() {
          ws.close();
        },
      });
    });

    ws.addEventListener("message", (ev) => {
      const raw = typeof ev.data === "string" ? ev.data : Buffer.from(ev.data).toString("utf8");
      const msg = JSON.parse(raw);
      if (msg.id && pending.has(msg.id)) {
        const task = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) task.rej(new Error(`${task.method}: ${msg.error.message}`));
        else task.res(msg.result || {});
      }
    });

    ws.addEventListener("error", (err) => reject(new Error(`DevTools websocket error: ${err.message || err.type || err}`)));
  });
}

function staticAudit() {
  const renderFns = [...appJs.matchAll(/function (render\w+)\(m\)/g)].map((m) => m[1]);
  const missingDefault = renderFns.filter((name) => {
    const body = appJs.slice(appJs.indexOf(`function ${name}(m)`));
    const head = body.slice(0, Math.min(body.length, 500));
    return !/m\s*=\s*m\s*\|\|\s*\$\("#main"\)/.test(head);
  });
  assert(missingDefault.length === 0, `render*(m) missing #main default: ${missingDefault.join(", ")}`);

  const bareOverlayRemoves = [...appJs.matchAll(/ovl\.remove\(\)/g)].filter((m) => {
    const lineStart = appJs.lastIndexOf("\n", m.index) + 1;
    const line = appJs.slice(lineStart, appJs.indexOf("\n", m.index));
    return !/parentNode\)\s*ovl\.remove/.test(line);
  }).length;
  assert(bareOverlayRemoves === 0, `Found ${bareOverlayRemoves} bare ovl.remove() — use removeOverlay(ovl)`);

  assert(appJs.includes("function removeOverlay(") && appJs.includes("function clearMainInert("), "Overlay helpers missing");
  assert(appJs.includes("initOverlayInertGuard"), "Overlay inert guard missing");
  console.log("  static interaction audit OK");
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    const text = result.exceptionDetails.exception?.description || "runtime exception";
    throw new Error(text);
  }
  return result.result.value;
}

async function runBrowserFlow(browser) {
  const port = await freePort();
  const proc = spawn(browser, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--allow-file-access-from-files",
    `--remote-debugging-port=${port}`,
    "about:blank",
  ], { stdio: "ignore" });

  let client;
  try {
    const wsUrl = await waitForPageTarget(port);
    client = await createCdpClient(wsUrl);
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `try{
        localStorage.setItem("uiRefreshPreview","1");
        localStorage.setItem("matonote_onboarded_v1","1");
      }catch(e){}`,
    });
    await client.send("Page.navigate", { url: `${appUrl}?interactionSmoke=${Date.now()}` });
    await sleep(2200);

    const boot = await evaluate(client, `(() => {
      window.__interactionErrors = [];
      window.addEventListener("error", e => { window.__interactionErrors.push(String(e.message || e.error || "error")); });
      return {
        uiRefresh: document.documentElement.classList.contains("ui-refresh"),
        mainInert: document.querySelector("#main")?.hasAttribute("inert"),
        overlayCount: document.querySelectorAll(".ovl").length,
        hasQuickStart: !!document.querySelector("#quickStart"),
        view,
        effective: db?.active ? "record" : view,
      };
    })()`);
    assert(boot.uiRefresh, "html.ui-refresh missing on boot");
    assert(!boot.mainInert, "main should not be inert on boot");
    assert(boot.overlayCount === 0, `stale overlays on boot: ${boot.overlayCount}`);
    assert(boot.hasQuickStart, "home quickStart missing");
    console.log("  boot state OK");

    const tabs = await evaluate(client, `(async () => {
      const names = ["record", "analysis", "history", "stats", "home"];
      const out = {};
      for (const name of names) {
        const btn = document.querySelector('nav.tabs button[data-v="' + name + '"]');
        if (!btn) return { error: "tab missing: " + name };
        btn.click();
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const mainText = document.querySelector("#main")?.innerText || "";
        out[name] = {
          on: btn.classList.contains("on"),
          mainLen: mainText.length,
          inert: document.querySelector("#main")?.hasAttribute("inert"),
          overlays: document.querySelectorAll(".ovl").length,
        };
      }
      out.errors = window.__interactionErrors?.slice() || [];
      return out;
    })()`);
    if (tabs.error) throw new Error(tabs.error);
    assert((tabs.errors || []).length === 0, `tab navigation errors: ${(tabs.errors || []).join("; ")}`);
    for (const name of ["record", "analysis", "history", "stats", "home"]) {
      const t = tabs[name];
      assert(t.on, `tab ${name} not active after click`);
      assert(t.mainLen > 20, `tab ${name} rendered empty main`);
      assert(!t.inert, `main inert after tab ${name}`);
      assert(t.overlays === 0, `overlays left after tab ${name}: ${t.overlays}`);
    }
    console.log("  tab navigation OK");

    const settings = await evaluate(client, `(async () => {
      document.querySelector("#btnSettings")?.click();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const sheet = document.querySelector("#setClose");
      if (!sheet) return { error: "settings sheet missing" };
      document.querySelector("#dSnapNow")?.click();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      document.querySelector("#setClose")?.click();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return {
        inert: document.querySelector("#main")?.hasAttribute("inert"),
        overlays: document.querySelectorAll(".ovl").length,
        errors: window.__interactionErrors?.slice() || [],
      };
    })()`);
    if (settings.error) throw new Error(settings.error);
    assert(!settings.inert, "main inert after settings cycle");
    assert(settings.overlays === 0, `overlays after settings: ${settings.overlays}`);
    assert((settings.errors || []).length === 0, `settings errors: ${(settings.errors || []).join("; ")}`);
    console.log("  settings inert cycle OK");

    const launch = await evaluate(client, `(async () => {
      document.querySelector("#openConditions")?.click();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const mount = document.querySelector("#launchSheetMount");
      if (!mount) return { error: "launch sheet missing" };
      const len = mount.innerText.length;
      const launchOvl = document.querySelector(".launchSheetOvl");
      if (launchOvl) {
        const r = launchOvl.getBoundingClientRect();
        launchOvl.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: r.left + 4, clientY: r.top + 4 }));
      }
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return {
        len,
        overlays: document.querySelectorAll(".ovl").length,
        inert: document.querySelector("#main")?.hasAttribute("inert"),
        errors: window.__interactionErrors?.slice() || [],
      };
    })()`);
    if (launch.error) throw new Error(launch.error);
    assert(launch.len > 30, "launch sheet empty");
    assert(launch.overlays === 0, "launch sheet overlay stuck");
    assert(!launch.inert, "main inert after launch sheet");
    console.log("  launch sheet OK");

    const record = await evaluate(client, `(async () => {
      document.querySelector("#quickStart")?.click();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (!db.active) return { error: "session not started" };
      db.settings.expertMode = true;
      render();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const checks = {};
      for (const mode of ["tap", "live", "ocr", "video", "grid"]) {
        const btn = document.querySelector('#inputModeBar .modeBtn[data-mode="' + mode + '"]');
        if (!btn) { checks[mode] = { error: "button missing" }; continue; }
        btn.click();
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        checks[mode] = {
          inputMode: ui.inputMode,
          gridOn: document.querySelector("#gridSheet")?.classList.contains("on"),
          tgWrapOff: document.querySelector("#tgWrap")?.classList.contains("off"),
          scanOn: !document.querySelector("#scanPanel")?.classList.contains("off"),
          ocrOn: document.querySelector("#ocrPanel")?.classList.contains("on"),
        };
      }
      return {
        checks,
        inert: document.querySelector("#main")?.hasAttribute("inert"),
        errors: window.__interactionErrors?.slice() || [],
      };
    })()`);
    if (record.error) throw new Error(record.error);
    assert((record.errors || []).length === 0, `record flow errors: ${(record.errors || []).join("; ")}`);
    assert(!record.inert, "main inert during record modes");
    for (const [mode, info] of Object.entries(record.checks)) {
      if (info.error) throw new Error(`${mode}: ${info.error}`);
      assert(info.inputMode === mode, `${mode} click did not set inputMode (${info.inputMode})`);
      if (mode === "grid") {
        assert(info.gridOn, "grid mode should show grid sheet");
        assert(info.tgWrapOff, "grid mode should hide target wrap");
      }
      if (mode === "tap") {
        assert(!info.gridOn, "tap mode should hide grid sheet");
        assert(!info.tgWrapOff, "tap mode should show target wrap");
      }
      if (mode === "live" || mode === "video") assert(info.scanOn, `${mode} should show scan panel`);
      if (mode === "ocr") assert(info.ocrOn, "ocr should show ocr panel");
    }
    console.log("  record input modes OK");

    const moreSheet = await evaluate(client, `(async () => {
      db.settings.expertMode = false;
      if (typeof ensureUiDepth === "function") ensureUiDepth(db.settings);
      db.settings.uiDepth = { level: "L2", sessionsAtUnlock: 3, expertMode: false, discoverySeen: { L2: true } };
      render();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const more = document.querySelector('#inputModeBar .modeBtn[data-mode="more"]');
      if (!more) return { error: "compact more button missing at L2" };
      more.click();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const liveBtn = document.querySelector('.ovl [data-mode="live"]');
      if (!liveBtn) return { error: "more sheet live option missing" };
      liveBtn.click();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return {
        inputMode: ui.inputMode,
        scanOn: !document.querySelector("#scanPanel")?.classList.contains("off"),
        inert: document.querySelector("#main")?.hasAttribute("inert"),
        overlays: document.querySelectorAll(".ovl").length,
        errors: window.__interactionErrors?.slice() || [],
      };
    })()`);
    if (moreSheet.error) throw new Error(moreSheet.error);
    assert(moreSheet.inputMode === "live", "more sheet should switch to live");
    assert(moreSheet.scanOn, "more sheet live should show scan panel");
    assert(!moreSheet.inert, "main inert after more sheet");
    assert(moreSheet.overlays === 0, "more sheet overlay stuck");
    console.log("  compact more sheet OK");

    const analysis = await evaluate(client, `(async () => {
      if (db.active) { db.active = null; save("interaction-smoke"); }
      document.querySelector('nav.tabs button[data-v="analysis"]')?.click();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const sight = document.querySelector('[data-analysis-sub="sight"]');
      const form = document.querySelector('[data-analysis-sub="form"]');
      if (!sight || !form) return { error: "analysis sub tabs missing" };
      form.click();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      sight.click();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return {
        sub: ui.analysisSub,
        inert: document.querySelector("#main")?.hasAttribute("inert"),
        errors: window.__interactionErrors?.slice() || [],
      };
    })()`);
    if (analysis.error) throw new Error(analysis.error);
    assert(analysis.sub === "sight", "analysis sub tab switch failed");
    assert(!analysis.inert, "main inert on analysis tab");
    console.log("  analysis sub-tabs OK");
  } finally {
    if (client) client.close();
    proc.kill();
    await sleep(300);
  }
}

async function main() {
  staticAudit();
  const browser = findBrowser();
  await runBrowserFlow(browser);
  console.log(`Interaction checks OK (${path.basename(browser)})`);
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});