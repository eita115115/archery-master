const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.resolve(__dirname, "..");

function assert(ok, msg) {
  if (!ok) throw new Error(msg);
}

execSync("node tools/check-app.js", { cwd: root, stdio: "inherit" });
execSync("node tools/check-vision.js", { cwd: root, stdio: "inherit" });

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const scriptsDir = path.join(root, "scripts");
const scripts = fs.readdirSync(scriptsDir)
  .filter((file) => file.endsWith(".js"))
  .map((file) => fs.readFileSync(path.join(scriptsDir, file), "utf8"))
  .join("\n");

assert(/data-v=["']home["']/.test(html), "index.html missing home tab");
assert(/data-v=["']record["']/.test(html), "index.html missing record tab");
assert(/data-v=["']history["']/.test(html), "index.html missing history tab");
assert(html.includes("35-photo-vision.js"), "index.html missing 35-photo-vision.js script tag");
assert(html.includes("Archery-master"), 'index.html missing branding "Archery-master"');
assert(scripts.includes("bindLiveScanMode") && scripts.includes("bindVideoScanMode") && scripts.includes("bindOcrScanMode") && scripts.includes("visionHitsToArrows") && scripts.includes("bindGridInput") && scripts.includes("homeDashboardHtml") && scripts.includes("renderStats") && scripts.includes("renderFormCoachPanel"), "grid/stats/AI layers missing from scripts");
assert(html.includes("data-v=\"stats\""), "index.html missing stats tab");
assert(scripts.includes("openToolSheet"), "openToolSheet missing from scripts");
assert(scripts.includes("renderHome"), "renderHome missing from scripts");
assert(scripts.includes("stats-filter-reset") && scripts.includes("db.settings.statsFilter"), "statsFilter reset persistence missing");
const presets = JSON.parse(fs.readFileSync(path.join(root, "tools", "field-course-presets.json"), "utf8"));
assert(presets.presets && presets.presets.flat24_marked && presets.presets.wa_sample12, "field-course-presets.json missing presets");
assert(presets.presets.flat24_marked.targets.length === 24 && presets.presets.wa_sample12.targets.length === 12, "field preset target counts wrong");

console.log("Integration checks OK");