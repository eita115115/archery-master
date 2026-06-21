"use strict";
/* Beta device-test readiness gate. */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");

function assert(ok, msg) {
  if (!ok) throw new Error(msg);
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const CHECK_SCRIPTS = {
  "check:ui-layer": "check-ui-layer.js",
  "check:app": "check-app.js",
  "check:ui": "check-ui.js",
};

function runNpm(script) {
  const tool = CHECK_SCRIPTS[script];
  if (!tool) throw new Error(`Unknown check script: ${script}`);
  const r = spawnSync(process.execPath, [path.join(__dirname, tool)], {
    cwd: root,
    stdio: "pipe",
    encoding: "utf8",
  });
  if (r.status !== 0) {
    const out = [r.stdout, r.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${script} failed${out ? `:\n${out}` : ""}`);
  }
  return (r.stdout || "").trim();
}

function main() {
  const prep = process.argv.includes("--prep");
  const betaPath = path.join(root, "beta.json");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const app = readJson(path.join(root, "app-scripts.json"));
  const beta = readJson(betaPath);
  const storage = fs.readFileSync(path.join(root, "scripts", "10-storage-native.js"), "utf8");
  const appVer = +( /const APP_VER=(\d+)/.exec(storage)?.[1] || 0);
  const jsonVer = +readJson(path.join(root, "version.json")).v;

  assert(beta.channel === "beta", "beta.json channel must be beta");
  assert(beta.uiRefresh === true, "beta.json must enable uiRefresh");
  assert(beta.fullFeatures === true, "beta.json must enable fullFeatures for beta testers");
  assert(Array.isArray(beta.features) && beta.features.length >= 10, "beta.json features list missing");
  assert(beta.deployUrl && /^https:\/\//.test(beta.deployUrl), "beta.json deployUrl must be https GitHub Pages URL");
  assert(beta.betaEntry && /^https:\/\//.test(beta.betaEntry), "beta.json betaEntry must be https URL");
  assert(beta.autoEnable === true, "beta.json autoEnable must be true for full-feature beta");
  assert(appVer === jsonVer, `Version mismatch APP_VER=${appVer} version.json=${jsonVer}`);
  assert(beta.minAppVer <= appVer, `beta.minAppVer ${beta.minAppVer} > APP_VER ${appVer}`);
  assert(app.scripts.includes("scripts/58-beta-boot.js"), "58-beta-boot.js not in app-scripts.json");
  assert(html.includes("scripts/58-beta-boot.js"), "index.html missing 58-beta-boot.js");
  assert(app.staticAssets.includes("beta.json"), "beta.json not in staticAssets");
  assert(fs.existsSync(path.join(root, "scripts", "58-beta-boot.js")), "58-beta-boot.js missing");
  const betaBoot = fs.readFileSync(path.join(root, "scripts", "58-beta-boot.js"), "utf8");
  assert(betaBoot.includes("betaFullFeaturesActive") && betaBoot.includes("applyBetaFullFeatures"), "58-beta-boot.js must unlock all beta features");
  assert(fs.existsSync(path.join(root, "tools", "serve-beta.js")), "serve-beta.js missing");

  const cap = readJson(path.join(root, "capacitor.config.json"));
  assert(cap.webDir === "dist/native", "capacitor webDir must be dist/native");

  console.log("Beta config OK");
  console.log(`  channel: ${beta.channel}`);
  console.log(`  label: ${beta.label}`);
  console.log(`  app version: v${appVer}`);

  runNpm("check:ui-layer");
  console.log("  check:ui-layer OK");
  runNpm("check:app");
  console.log("  check:app OK");
  runNpm("check:ui");
  console.log("  check:ui OK");

  if (prep) {
    const build = spawnSync(process.execPath, [path.join(__dirname, "build-native-web.js")], {
      cwd: root,
      stdio: "pipe",
      encoding: "utf8",
    });
    if (build.status !== 0) {
      const out = [build.stdout, build.stderr].filter(Boolean).join("\n").trim();
      throw new Error(`build:native-web failed${out ? `:\n${out}` : ""}`);
    }
    const nativeDir = path.join(root, "dist", "native");
    assert(fs.existsSync(path.join(nativeDir, "beta.json")), "native bundle missing beta.json");
    assert(fs.existsSync(path.join(nativeDir, "ui", "ds-screens.css")), "native bundle missing ds-screens.css");
    console.log("  build:native-web OK");
  }

  console.log("\nGitHub Pages ベータテスト:");
  console.log("  1. main に push → Actions「Deploy beta」が dist/native を公開");
  console.log("  2. リポジトリ Settings → Pages → Source: GitHub Actions");
  console.log(`  3. ベータ入口: ${beta.betaEntry}`);
  console.log(`  4. 本番URL: ${beta.deployUrl}`);
  console.log("\nLAN 実機テスト (オフライン/Wi-Fi):");
  console.log("  1. npm run beta:device");
  console.log("  2. 同一Wi-Fiのスマホで表示URLを開く");
  console.log("  3. BETA バッジと新UIを確認");
  console.log("  4. 設定からバックアップ保存してから本番データで試す");
  console.log("  5. 終了後（任意）: ?beta=0 または localStorage.removeItem('matonote_beta_v1')");
  console.log("  ※ beta.json により全機能は自動有効（?beta=1 不要）");
  if (beta.deviceChecklist && beta.deviceChecklist.length) {
    console.log("\nチェックリスト:");
    beta.deviceChecklist.forEach((item, i) => console.log(`  ${i + 1}. ${item}`));
  }
}

try {
  main();
  console.log("\ncheck-beta: OK");
} catch (e) {
  console.error("check-beta FAIL:", e.message);
  process.exit(1);
}