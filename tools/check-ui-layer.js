"use strict";
/* Verify UI refresh scaffolding (no browser). Safe while optimization runs on core files. */

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const manifestPath = path.join(root, "ui", "ui-manifest.json");

function assert(ok, msg) {
  if (!ok) throw new Error(msg);
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function scriptOrderAfter(scripts, anchor, expected) {
  const i = scripts.indexOf(anchor);
  assert(i >= 0, `Missing anchor script: ${anchor}`);
  const slice = scripts.slice(i + 1, i + 1 + expected.length);
  assert(slice.join(",") === expected.join(","), `Expected ${expected.join(" → ")} after ${anchor}, got: ${slice.join(" → ") || "(none)"}`);
}

function main() {
  assert(fs.existsSync(manifestPath), "ui/ui-manifest.json missing");
  const manifest = readJson(manifestPath);
  const neonPath = path.join(root, "ui", "neon-sight.css");
  assert(fs.existsSync(neonPath), "ui/neon-sight.css missing");
  const neon = fs.readFileSync(neonPath, "utf8");
  assert(neon.includes("--neon-teal") && neon.includes(".homeSightPanel") && neon.includes("prefers-reduced-motion"), "Neon Sight stylesheet incomplete");

  for (const rel of manifest.staticAssets) {
    const full = path.join(root, rel.replace(/\//g, path.sep));
    assert(fs.existsSync(full), `UI static asset missing: ${rel}`);
    const css = fs.readFileSync(full, "utf8");
    if (rel.endsWith(".css")) {
      assert(css.includes("html.ui-refresh"), `${rel} must scope to html.ui-refresh`);
    }
  }

  for (const rel of manifest.scripts) {
    const full = path.join(root, rel.replace(/\//g, path.sep));
    assert(fs.existsSync(full), `UI script missing: ${rel}`);
  }

  const motion = fs.readFileSync(path.join(root, "scripts", "54-motion.js"), "utf8");
  assert(motion.includes("animateMetric") && motion.includes("uiRefreshActive"), "54-motion.js incomplete");

  const onboard = fs.readFileSync(path.join(root, "scripts", "56-onboard.js"), "utf8");
  assert(onboard.includes("syncUiRefreshClass") && onboard.includes("maybeRunOnboard"), "56-onboard.js incomplete");

  const depth = fs.readFileSync(path.join(root, "scripts", "57-ui-depth.js"), "utf8");
  assert(depth.includes("uiDepthAllows") && depth.includes("L0"), "57-ui-depth.js incomplete");

  const overrides = fs.readFileSync(path.join(root, "ui", "ui-overrides.css"), "utf8");
  assert(overrides.includes("nav.tabs") && overrides.includes(".listGroup") && overrides.includes("settingsLink::after") && overrides.includes(".settingsGroup"), "ui-overrides.css native patterns incomplete");

  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const stylePos = html.indexOf('<link rel="stylesheet" href="style.css">');
  assert(stylePos >= 0, "index.html missing style.css");
  for (const rel of manifest.staticAssets.filter((f) => f.endsWith(".css"))) {
    const tag = `<link rel="stylesheet" href="${rel}">`;
    assert(html.includes(tag), `index.html missing ${tag} (UI_PARALLEL.md §3 A)`);
    assert(html.indexOf(tag) > stylePos, `${rel} must load after style.css`);
  }

  const appScriptsPath = path.join(root, "app-scripts.json");
  assert(fs.existsSync(appScriptsPath), "app-scripts.json missing");
  const app = readJson(appScriptsPath);
  assert(manifest.staticAssets.includes("ui/neon-sight.css"), "ui manifest missing Neon Sight stylesheet");
  assert(app.staticAssets.includes("icon-512.png") && app.staticAssets.includes("apple-touch-icon.png"), "PWA icon assets missing");

  for (const rel of manifest.scripts) {
    assert(app.scripts && app.scripts.includes(rel), `app-scripts.json missing ${rel} (UI_PARALLEL.md §3 B)`);
  }
  scriptOrderAfter(app.scripts, manifest.scriptInsertAfter || "scripts/53-page-heroes.js", manifest.scripts);

  for (const rel of manifest.staticAssets) {
    assert(app.staticAssets && app.staticAssets.includes(rel), `app-scripts.json staticAssets missing ${rel} (UI_PARALLEL.md §3 E)`);
  }

  const htmlScripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  assert(htmlScripts.join(",") === app.scripts.join(","), "index.html script order must match app-scripts.json (UI_PARALLEL.md §3 C)");

  const init = fs.readFileSync(path.join(root, "scripts", "90-init.js"), "utf8");
  assert(init.includes("syncUiRefreshClass") && init.includes("maybeRunOnboard"), "90-init.js missing UI init hooks (UI_PARALLEL.md §3 D)");

  const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  assert(sw.includes("manifest.staticAssets"), "sw.js must cache app-scripts.json staticAssets (UI_PARALLEL.md §3 F)");

  const dsPrim = path.join(root, "scripts", "ui", "ds-primitives.js");
  assert(fs.existsSync(dsPrim), "scripts/ui/ds-primitives.js missing");
  assert(manifest.staticAssets.includes("ui/ds-components.css"), "ui-manifest must list ui/ds-components.css");
  assert(manifest.staticAssets.includes("ui/ds-screens.css"), "ui-manifest must list ui/ds-screens.css");
  const ds = fs.readFileSync(dsPrim, "utf8");
  assert(ds.includes("mountOverlay") && ds.includes("mountSheetA11y"), "ds-primitives.js incomplete");

  console.log("check-ui-layer: OK — UI scaffolding wired (" + manifest.staticAssets.length + " css, " + manifest.scripts.length + " js, §3 A–F)");
}

try {
  main();
} catch (e) {
  console.error("check-ui-layer FAIL:", e.message);
  process.exit(1);
}
