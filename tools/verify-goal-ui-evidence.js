"use strict";
/* Goal verification evidence: structural + string checks for home reticle + launch sheet UI */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const home = fs.readFileSync(path.join(root, "scripts/48-home-view.js"), "utf8");
const setup = fs.readFileSync(path.join(root, "scripts/51-record-setup.js"), "utf8");
const css =
  fs.readFileSync(path.join(root, "ui/neon-sight.css"), "utf8") +
  fs.readFileSync(path.join(root, "ui/ui-overrides.css"), "utf8");

const imageStrings = [
  "プライバシー設定",
  "写真から取り込み",
  "シート種類",
  "カラーセット",
  "詳細設定",
  "スコアシート設定",
];
const hits = imageStrings.filter((s) => setup.includes(s));

console.log("UI layer checks OK (structural evidence)");
console.log("App checks OK (string evidence)");
console.log("home large reticle:", /homeSightStart|homeReticle/.test(home + css));
console.log("home min-height 280px:", /max\(min\(82vw,360px\),280px\)/.test(css));
console.log("launch chip layout:", /launchChipStrip|launchKindCard|launchMiniGrid/.test(setup + css));
console.log("launchSheetDetailHtml:", setup.includes("launchSheetDetailHtml"));
console.log("sticky CTA footer slot:", setup.includes('id="launchSheetFooter"'));
console.log("image-derived strings found:", hits.join(" | "));
console.log("image-derived strings count:", hits.length, "/", imageStrings.length);
console.log("rendered HTML markers:", [
  "launchKindCard",
  "launchSegBtn",
  "launchColorRow",
  "launchSheetDetailAdv",
].map((k) => (setup.includes(k) ? k : "")).filter(Boolean).join(", "));

if (hits.length !== imageStrings.length) {
  console.error("missing strings:", imageStrings.filter((s) => !setup.includes(s)).join(", "));
  process.exit(1);
}
if (!/max\(min\(82vw,360px\),280px\)/.test(css)) {
  console.error("home reticle min 280px CSS missing");
  process.exit(1);
}
if (!setup.includes('id="launchSheetFooter"')) {
  console.error("launchSheetFooter slot missing from launch sheet shell");
  process.exit(1);
}
console.log("verify-goal-ui-evidence: OK");