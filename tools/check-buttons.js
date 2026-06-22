const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const net = require("net");

const root = path.resolve(__dirname, "..");
const htmlPath = path.join(root, "index.html");
const appUrl = `file:///${htmlPath.replace(/\\/g, "/")}`;

function assert(ok, msg) {
  if (!ok) throw new Error(msg);
}

function findBrowser() {
  const found = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean).find((p) => fs.existsSync(p));
  assert(found, "Chrome/Edge not found");
  return found;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
}

async function waitForPageTarget(port) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1000) })).json();
      const page = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch (_) {}
    await sleep(120);
  }
  throw new Error("CDP timeout");
}

function createCdpClient(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let nextId = 1;
    const pending = new Map();
    ws.addEventListener("open", () => resolve({
      send(method, params = {}) {
        const id = nextId++;
        ws.send(JSON.stringify({ id, method, params }));
        return new Promise((res, rej) => pending.set(id, { res, rej }));
      },
      close() { ws.close(); },
    }));
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const t = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) t.rej(new Error(msg.error.message));
        else t.res(msg.result || {});
      }
    });
    ws.addEventListener("error", reject);
  });
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || "runtime error");
  }
  return result.result.value;
}

async function main() {
  const browser = findBrowser();
  const port = await freePort();
  const proc = spawn(browser, [
    "--headless=new", "--no-sandbox", "--disable-gpu",
    `--remote-debugging-port=${port}`, "about:blank",
  ], { stdio: "ignore" });
  let client;
  try {
    client = await createCdpClient(await waitForPageTarget(port));
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `try{
        localStorage.setItem("uiRefreshPreview","1");
        localStorage.setItem("matonote_onboarded_v1","1");
      }catch(e){}`,
    });
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
    });
    await client.send("Page.navigate", { url: `${appUrl}?btnAudit=${Date.now()}` });
    await sleep(2200);

    const report = await evaluate(client, `(async () => {
      const failures = [];
      const overflows = [];
      const errors = [];
      window.addEventListener("error", e => errors.push(String(e.message || e.error)));

      function probe(el, label) {
        if (!el) return { label, missing: true };
        const inOverlay = !!el.closest(".ovl");
        el.scrollIntoView({ block: "nearest", inline: "nearest" });
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return { label, tiny: true };
        const cx = Math.min(Math.max(r.left + r.width / 2, 1), window.innerWidth - 1);
        const cy = Math.min(Math.max(r.top + r.height / 2, 1), window.innerHeight - 1);
        const top = document.elementFromPoint(cx, cy);
        const hit = top === el || (top && el.contains(top));
        const cs = getComputedStyle(el);
        const main = document.querySelector("#main");
        return {
          label,
          hit,
          inOverlay,
          pointerEvents: cs.pointerEvents,
          disabled: !!el.disabled,
          ariaDisabled: el.getAttribute("aria-disabled"),
          hasOnclick: typeof el.onclick === "function",
          mainInert: main?.hasAttribute("inert"),
          topTag: top?.tagName,
          topCls: String(top?.className || "").slice(0, 60),
        };
      }

      function clickAndProbe(sel, label, after) {
        const el = document.querySelector(sel);
        const before = probe(el, label);
        if (!el || before.missing || before.tiny) {
          failures.push({ label, reason: "missing-or-tiny", before });
          return;
        }
        if (!before.hit) failures.push({ label, reason: "blocked", before });
        if (before.mainInert) failures.push({ label, reason: "main-inert", before });
        if (!before.hasOnclick && el.tagName === "BUTTON") failures.push({ label, reason: "no-onclick", before });
        el.click();
        return after?.();
      }

      function scanOverflow(root) {
        (root || document).querySelectorAll("button,.homeSessionCard,.an-settingsRow,.an-roundItem,.modeBtn,.homeSightConditionText,.an-rowBody,.chip,.btn,.listItem").forEach(el => {
          if (el.closest(".homeSightStartWrap,.homeSightStart,.gridKeys")) return;
          if (el.scrollWidth > el.clientWidth + 4) {
            overflows.push({
              tag: el.tagName,
              cls: (el.className || "").slice(0, 50),
              id: el.id,
              text: (el.innerText || "").slice(0, 40),
              over: el.scrollWidth - el.clientWidth,
            });
          }
        });
      }

      // seed one session for history/stats
      if (!db.sessions.length) {
        db.sessions.push({
          id: "audit1", date: "2026-06-22", setupId: null, dist: 70,
          bowType: "recurve", environment: "outdoor", faceD: 122, faceType: "full",
          perEnd: 6, ends: [[{ s: 10, x: 0, y: 0 }]], cur: [], purpose: "practice", round: "free",
        });
        save();
        render();
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      }

      const probes = [];
      const add = (sel, label) => {
        const el = document.querySelector(sel);
        probes.push(probe(el, label));
      };

      add("#quickStart", "home:quickStart");
      add("#openConditions", "home:openConditions");
      add("#btnSettings", "header:settings");
      document.querySelectorAll("nav.tabs button").forEach((b, i) => add("nav.tabs button:nth-child(" + (i + 1) + ")", "tab:" + b.dataset.v));
      document.querySelectorAll("[data-open-sess]").forEach((b, i) => {
        if (i < 2) add('[data-open-sess="' + b.dataset.openSess + '"]', "home:session-card");
      });
      const qr = document.querySelector("#quickRepeat");
      if (qr) add("#quickRepeat", "home:quickRepeat");

      scanOverflow(document.querySelector("#main"));

      // settings flow
      document.querySelector("#btnSettings")?.click();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      add("#setClose", "settings:close");
      add("#dSnapNow", "settings:snap");
      document.querySelectorAll(".an-settingsRow[data-tool]").forEach((b, i) => {
        if (i === 0) probes.push(probe(b, "settings:tool-row"));
      });
      scanOverflow(document.querySelector(".ovl"));
      document.querySelector("#setClose")?.click();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

      // launch sheet
      document.querySelector("#openConditions")?.click();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      add("#launchSheetMount button", "launch:any-button");
      scanOverflow(document.querySelector(".launchSheetOvl"));
      const launchOvl = document.querySelector(".launchSheetOvl");
      if (launchOvl) {
        const r = launchOvl.getBoundingClientRect();
        launchOvl.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: r.left + 4, clientY: r.top + 4 }));
      }
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

      // record session
      document.querySelector("#quickStart")?.click();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      db.settings.expertMode = true;
      render();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      add("#bUndo", "record:undo");
      add("#bEnd", "record:end");
      add("#bFinish", "record:finish");
      document.querySelectorAll("#inputModeBar .modeBtn").forEach((b, i) => {
        if (i < 3) probes.push(probe(b, "record:mode:" + b.dataset.mode));
      });
      document.querySelectorAll("#gridKeys button").forEach((b, i) => {
        if (i < 3) probes.push(probe(b, "record:score:" + b.dataset.v));
      });
      scanOverflow(document.querySelector("#main"));

      // history
      if (db.active) { db.active = null; save(); }
      document.querySelector('nav.tabs button[data-v="history"]')?.click();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const histBtn = document.querySelector("#histList [data-open-sess],#histList .listItem");
      if (histBtn) {
        probes.push(probe(histBtn, "history:list-item"));
        histBtn.click();
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        add("#hClose", "history:detail-close");
        scanOverflow(document.querySelector(".ovl"));
        document.querySelector("#hClose")?.click();
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      }

      // stats + analysis
      document.querySelector('nav.tabs button[data-v="stats"]')?.click();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      scanOverflow(document.querySelector("#main"));
      document.querySelector('nav.tabs button[data-v="analysis"]')?.click();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      document.querySelectorAll("[data-analysis-sub]").forEach(b => probes.push(probe(b, "analysis:" + b.dataset.analysisSub)));

      for (const p of probes) {
        if (!p || p.missing || p.tiny) failures.push({ label: p.label, reason: "missing-or-tiny", p });
        else if (!p.inOverlay && !p.hit) failures.push({ label: p.label, reason: "blocked", p });
        else if (!p.inOverlay && p.mainInert) failures.push({ label: p.label, reason: "main-inert", p });
        else if (!p.inOverlay && (p.label.startsWith("record:") || p.label.startsWith("home:") || p.label.startsWith("header:") || p.label.startsWith("tab:"))) {
          if (!p.hasOnclick && p.disabled !== true && p.ariaDisabled !== "true") failures.push({ label: p.label, reason: "no-onclick", p });
        }
      }

      return {
        failures,
        overflows: overflows.slice(0, 20),
        errors,
        inert: document.querySelector("#main")?.hasAttribute("inert"),
        overlays: document.querySelectorAll(".ovl").length,
        probeCount: probes.length,
      };
    })()`);

    console.log(JSON.stringify(report, null, 2));
    if (report.errors?.length) throw new Error(`JS errors: ${report.errors.join("; ")}`);
    if (report.inert) throw new Error("main still inert after audit");
    if (report.overlays) throw new Error(`stale overlays: ${report.overlays}`);
    if (report.failures?.length) throw new Error(`button failures (${report.failures.length}): ${JSON.stringify(report.failures.slice(0, 8))}`);
    if (report.overflows?.length > 8) throw new Error(`text overflow (${report.overflows.length}): ${JSON.stringify(report.overflows.slice(0, 8))}`);
    console.log(`Button audit OK (${report.probeCount} probes, ${report.overflows?.length || 0} minor overflows)`);
  } finally {
    if (client) client.close();
    proc.kill();
  }
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});