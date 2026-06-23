const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const cssPath = path.join(root, "style.css");
const css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, "utf8") : "";
const uiLayerCss = ["ui/ui-tokens.css", "ui/ui-motion.css", "ui/ui-overrides.css"]
  .map((f) => fs.readFileSync(path.join(root, f), "utf8")).join("\n");
const appManifest = JSON.parse(fs.readFileSync(path.join(root, "app-scripts.json"), "utf8"));
const appScripts = appManifest.scripts;
const appJs = appScripts.map(file => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
const surface = `${html}\n${css}\n${appJs}`;
const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
const scripts = appJs;

function assert(ok, msg) {
  if (!ok) throw new Error(msg);
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
function section(start, end) {
  const a = scripts.indexOf(start);
  const b = scripts.indexOf(end);
  assert(a >= 0, `Missing start marker: ${start}`);
  assert(b > a, `Missing end marker: ${end}`);
  return scripts.slice(a, b);
}

new Function(scripts);

assert(appScripts.every(file => html.includes(`<script src="${file}"></script>`)) && inlineScripts.length === 0 && scripts.includes("const APP_VER="), "External app scripts missing");
assert(!fs.existsSync(path.join(root, "app.js")), "Legacy app.js should not remain after script split");
const appVer = /const APP_VER=(\d+)/.exec(scripts)?.[1];
const version = JSON.parse(fs.readFileSync(path.join(root, "version.json"), "utf8")).v;
const swVer = /matonote-v(\d+)/.exec(fs.readFileSync(path.join(root, "sw.js"), "utf8"))?.[1];
assert(+appVer === version && +swVer === version, `Version mismatch app=${appVer} json=${version} sw=${swVer}`);
assert(html.includes('<link rel="stylesheet" href="style.css">') && css.includes(".missionPanel"), "External stylesheet missing");
assert(html.includes('name="description"') && html.includes('property="og:description"'), "Share/SEO metadata missing");
assert(/maximum-scale\s*=\s*1/.test(html) && /user-scalable\s*=\s*no/.test(html), "Viewport must be fully locked");
assert(html.includes('name="apple-mobile-web-app-capable" content="yes"') && html.includes('name="apple-mobile-web-app-status-bar-style" content="black-translucent"'), "iPhone standalone status bar metadata missing");
assert(css.includes("overscroll-behavior:none") && css.includes("grid-template-rows:auto minmax(0,1fr)") && css.includes("touch-action:pan-y"), "Locked app-shell CSS missing");
assert(scripts.includes('document.addEventListener("gesturestart"') && scripts.includes("touches.length>1"), "iOS viewport gesture guard missing");
assert(css.includes("touch-action:manipulation") && css.includes("--chrome-bg") && css.includes("min-height:48px"), "Native-feel touch/chrome styling missing");
assert(surface.includes("@keyframes appRise") && !surface.includes("primaryPulse") && surface.includes("scorePop") && surface.includes("markPop") && surface.includes("impactFlash") && surface.includes("shotNew") && surface.includes("freshArrow") && surface.includes("prefers-reduced-motion") && surface.includes("ic-record") && surface.includes("ic-home") && html.includes('data-v="home"'), "Minimal recording feedback, tab icons, and reduced-motion guard missing");
assert(surface.includes("renderHome") && surface.includes("homeDashboardHtml") && surface.includes("bindActiveInputMode") && surface.includes("stopAllInputModes") && surface.includes("scoreGridHtml") && surface.includes("aggregateSessionStats") && surface.includes("renderStats") && surface.includes("renderAnalysis") && surface.includes("openAnalysisTab") && surface.includes("openToolSheet") && surface.includes("visionHitsToArrows") && surface.includes("window.ArcherVision") && surface.includes("window.ArcherOCR") && surface.includes("window.ArcherForm") && surface.includes("window.ArcherStats") && surface.includes("window.ArcherCore") && surface.includes("window.ArcherDecision"), "Unified modular app layers missing");
assert(surface.includes("BOW_TYPES") && surface.includes("lastSelectedDistance") && surface.includes("scoreGridReadOnlyHtml") && surface.includes("renderFormCoachPanel") && surface.includes("formContextForSession") && surface.includes("nextShotBriefHtml") && surface.includes("dualLineChartSvg") && surface.includes("prepareOfflineAI"), "Metadata, stats advanced, decision, and offline prep missing");
assert(fs.existsSync(path.join(root, "app-scripts.json")), "app-scripts.json manifest missing");
assert(fs.existsSync(path.join(root, "beta.json")), "beta.json missing for device beta channel");
assert(appScripts.includes("scripts/58-beta-boot.js"), "58-beta-boot.js must be wired before 90-init.js");
assert(scripts.includes("betaFullFeaturesActive") && scripts.includes("applyBetaFullFeatures") && scripts.includes("allInputFeaturesUnlocked"), "beta full-features unlock missing");
assert(appManifest.staticAssets.includes("beta.json"), "beta.json must be in staticAssets");
assert(appManifest.staticAssets.every((f) => fs.existsSync(path.join(root, f.split("/").pop() === f ? f : f)) || fs.existsSync(path.join(root, f))), "static asset missing from manifest");
assert(/data-v=["']stats["']/.test(html), "index.html missing stats tab");
assert(fs.existsSync(path.join(root, "pose_landmarker_lite.task")), "pose_landmarker_lite.task missing");
assert(html.includes("Archery-master") && !html.includes("的ノート") && !html.includes("Archery Note"), "Archery-master branding missing");
assert(surface.includes("--active-tab") && surface.includes("nav.tabs::before") && surface.includes('setProperty("--active-tab"'), "Smooth state-following tab motion missing");
assert(!surface.includes("targetImpact") && !surface.includes("screenIn") && !surface.includes("triggerReleaseMotion") && !surface.includes("arrowFlight"), "Overdone transition/target animation should not return");
assert(surface.includes("記録方法を選ぶ") && surface.includes("点取りから調整提案へ") && surface.includes("足りないデータを見る"), "onboarding UI missing");
assert(surface.includes("読み込みに時間がかかっています") && surface.includes("bootFallback") && surface.includes("bootFallbackDelay") && html.includes('id="updBar" hidden'), "startup/update fallback should be calm and initially hidden");
assert(surface.includes("dashCompact") && surface.includes("dashBoard") && surface.includes("記録を始める") && surface.includes("前回と同じ") && surface.includes("homeActions") && surface.includes("quickStartMeta") && surface.includes("quickStartSession") && surface.includes("openLaunchSheet") && surface.includes("条件を変える") && surface.includes("homeSightConditions") && surface.includes("actionFaceLabel") && !surface.includes("今の条件で開始") && surface.includes("quickSelects") && surface.includes("recordSetupSnapshot") && surface.includes("inputModeBarHtml") && surface.includes("openInputMoreSheet") && surface.includes("写真で読み取り") && surface.includes("ホームで距離と的を確認して開始します。"), "UI-P2 home/record launch missing");
assert(surface.includes("recordIntroHtml") && surface.includes("missionPanel") && surface.includes("convergeMission"), "record intro helpers retained for depth/tools");
assert(html.includes("練習ノート") && !html.includes("アーチェリー練習ノート"), "Header subtitle should be shortened");
assert(surface.includes("compactHud") && !surface.includes("まず今日の記録を始める。詳しい材料") && !surface.includes("距離・的サイズはこの画面で変更できます") && !surface.includes("タップ＆ドラッグで確定"), "Record screen should stay compact and low-noise");
assert(surface.includes("levelFromScore") && surface.includes("RECORD_FLOW_MODES") && surface.includes("recordIntroHtml") && surface.includes("recordPhaseArcHtml") && surface.includes("summarySightDialHtml") && surface.includes("summaryDecisionHtml"), "record UI helpers missing");
assert(surface.includes("activeGuideHtml") && surface.includes("初回の操作ガイド") && surface.includes("activeGuideSeen"), "First-run active recording guide missing");
assert(surface.includes("SHOT_REASON_TAGS") && surface.includes("外れ理由") && surface.includes("矢番号") && surface.includes("arrowMetaSummaryHtml"), "Shot reason and arrow-number note UI missing");
assert(surface.includes("window.PointerEvent") && surface.includes("touchstart") && surface.includes("mousedown"), "Input fallback handlers missing");
assert(surface.includes("createSVGPoint()"), "SVG coordinate fallback missing");
assert(surface.includes("Array.prototype.flat") && surface.includes("Object.values") && surface.includes("Math.hypot"), "Compatibility polyfills missing");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
new Function(sw);
assert(sw.includes("app-scripts.json") && sw.includes("buildAssetList") && sw.includes('e.request.mode === "navigate"') && sw.includes('caches.match("./index.html")') && sw.includes("./style.css"), "Service worker manifest-driven cache missing");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const packageLock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
const cap = JSON.parse(fs.readFileSync(path.join(root, "capacitor.config.json"), "utf8"));
const webManifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
assert(webManifest.description && webManifest.description.includes("端末に記録"), "Manifest description missing");
assert(pkg.version === `0.${version}.0` && packageLock.version === pkg.version && packageLock.packages[""].version === pkg.version, "Package version mismatch");
assert(pkg.scripts["build:native-web"] && pkg.scripts["native:sync"], "Native build scripts missing");
assert(pkg.scripts["version:bump"], "Version bump script missing");
assert(pkg.dependencies && pkg.dependencies["@capacitor/haptics"] && pkg.dependencies["@capacitor/share"] && pkg.dependencies["@capacitor/filesystem"], "Native haptics/share/filesystem plugins missing");
assert(cap.appId === "com.eita.archerynote" && cap.webDir === "dist/native", "Capacitor config mismatch");
assert(fs.existsSync(path.join(root, "tools", "build-native-web.js")) && fs.existsSync(path.join(root, "docs", "native-transition.md")), "Native transition files missing");
assertForbiddenUiCopy(scripts);
assert(scripts.includes("nativeReadinessHtml") && scripts.includes("summary>アプリ情報</summary>") && scripts.includes("オフライン用データ:") && !scripts.includes("nativeStack"), "UI-P4 native readiness simplified");
assert(scripts.includes("onboardSheetHtml") && scripts.includes("maybeRunOnboard") && scripts.includes("matonote_onboarded_v1"), "UI-P4 onboard sheet missing");
assert(appScripts.includes("scripts/54-motion.js") && scripts.includes("syncLiveHudMetrics") && scripts.includes("onArrowScored") && scripts.includes("celebrateX") && scripts.includes('data-hud="total"') && scripts.includes("pulseEndHud") && scripts.includes("celebrateBest") && scripts.includes("isNewPersonalBest") && scripts.includes('data-hud="personalBest"') && scripts.includes("maybeAnimateHomeBest"), "UI-P5 motion M1–M6 wiring missing");
assert(scripts.includes("recordActionBarHtml") && scripts.includes('id="recordActionBar"') && scripts.includes("recordToolbar") && uiLayerCss.includes(".recordActionBar"), "Record compact action bar missing");
assert(scripts.includes("scoreInputZone") && scripts.includes("scoreProgressHint") && scripts.includes("scoreProgressHtml") && scripts.includes("scoreProgressDots") && uiLayerCss.includes(".scoreInputZone") && uiLayerCss.includes(".scoreProgress"), "Score input zone/progress missing");
assert(scripts.includes("scoreEndProgress") && scripts.includes('data-hud="curEnd"') && scripts.includes("あと${remain}本で確定") && scripts.includes("liveContextMeta") && uiLayerCss.includes(".scoreEndProgress"), "Score end progress HUD missing");
assert(scripts.includes("nextEmptyCellIndex") && scripts.includes("gridCellAfterInput") && scripts.includes("highlightNextGridCell") && scripts.includes('class="gridCell empty') && scripts.includes('"next"') && uiLayerCss.includes(".gridCell.next"), "Next grid cell focus missing");
assert(scripts.includes("gridKeysPad") && scripts.includes("gridKeysRow") && scripts.includes("gridKey--prime") && scripts.includes('id="gridKeys"') && uiLayerCss.includes(".gridKeysPad"), "Grid keys pad layout missing");
assert(scripts.includes("mountScoreDockMotion") && scripts.includes("flashScoreKey") && scripts.includes("pulseScoreGridCell") && scripts.includes('typeof flashScoreKey === "function"') && uiLayerCss.includes("ui-neon-dock-in") && uiLayerCss.includes("ui-neon-key-flash"), "Fixed score dock motion missing");
assert(uiLayerCss.includes("--ui-score-dock-height") && uiLayerCss.includes(".gridSheet.on .gridKeysPad") && /position:\s*fixed/.test(uiLayerCss), "Fixed gridKeysPad score dock CSS missing");
assert(scripts.includes("inputModeBarCompact") && scripts.includes("inputModeBarExpert") && scripts.includes("gridSheetHtml"), "Grid score input shell missing");
assert(appScripts.includes("scripts/57-ui-depth.js") && scripts.includes("pulseTabSpring") && scripts.includes("enterViewMotion") && scripts.includes("mountOverlayMotion") && scripts.includes("runOnboardStepMotion") && scripts.includes("badgeStarRingSvg") && scripts.includes("mountBadgeRings") && scripts.includes("maybeUiDepthToast"), "UI-P5 motion M7–M12 wiring missing");
assert(html.includes("ui/ui-tokens.css") && html.includes("ui/ui-motion.css") && html.includes("ui/ui-overrides.css"), "UI_PARALLEL §3 A: ui layer CSS not linked in index.html");
assert(appScripts.includes("scripts/54-motion.js") && appScripts.includes("scripts/56-onboard.js") && appScripts.includes("scripts/57-ui-depth.js"), "UI_PARALLEL §3 B: UI scripts missing from app-scripts.json");
assert(appManifest.staticAssets.includes("ui/ui-tokens.css") && appManifest.staticAssets.includes("ui/ui-motion.css") && appManifest.staticAssets.includes("ui/ui-overrides.css"), "UI_PARALLEL §3 E: ui CSS missing from staticAssets");
(function(){
  const anchor="scripts/53-page-heroes.js";
  const i=appScripts.indexOf(anchor);
  assert(i>=0&&appScripts.slice(i+1,i+4).join(",")==="scripts/54-motion.js,scripts/56-onboard.js,scripts/57-ui-depth.js", "UI_PARALLEL §3 B: UI script order after 53-page-heroes");
  const headBoot="scripts/00-viewport-boot.js";
  const htmlScripts=[...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m=>m[1]).filter(s=>s!==headBoot);
  assert(html.includes(`<script src="${headBoot}"></script>`), "Neon viewport boot script missing in index.html head");
  assert(htmlScripts.join(",")===appScripts.join(","), "UI_PARALLEL §3 C: index.html scripts must match app-scripts.json");
})();
assert(scripts.includes("pageHeroHtml") && scripts.includes("liveSessionHeroHtml") && !scripts.includes('pageHeroHtml("history"') && !scripts.includes('pageHeroHtml("sight"') && !scripts.includes('pageHeroHtml("gear"') && !scripts.includes('class="pageHero statsHero"') && scripts.includes("histDetailPlot") && scripts.includes("着弾のばらつき") && scripts.includes("射形を確認"), "UI-P3 history/stats/tool views missing");
assert(surface.includes("nativePulse") && surface.includes("shareOrDownloadText") && surface.includes("capPlugin") && surface.includes("updateAppChrome") && surface.includes("syncViewportChrome") && surface.includes("freshReload"), "Native interaction layer missing");
assert(html.includes('name="theme-color"') && html.includes("#020506") && html.includes("apple-mobile-web-app-status-bar-style"), "Viewport chrome metadata missing");
assert(surface.includes("storageGetItem") && surface.includes("storageSetItem") && surface.includes("storageDriverProfile"), "Storage adapter missing");
assert(surface.includes("scheduleSafetySnapshot") && surface.includes("flushSafetySnapshot") && surface.includes("requestIdleCallback"), "Deferred snapshot saving missing");
assert(surface.includes("自動バックアップ") && surface.includes("今すぐバックアップ") && surface.includes("バックアップデータを復元しました") && !surface.includes("\u81ea\u52d5\u9000\u907f") && !surface.includes("\u9000\u907f\u30c7\u30fc\u30bf"), "Backup settings copy should be user-facing");
assert(surface.includes("ArcheryPhysicsCore") && surface.includes("window.ArcheryPhysicsCore"), "Physics core interface missing");

const storageApi = new Function(section("const KEY=", "function uid") + "\nreturn {normalizeDb,blankDb,dataCounts,hashText,snapshotLabel,storageGetItem,storageSetItem,storageDriverProfile};")();
const normalized = storageApi.normalizeDb({sessions:[{id:"s"}], settings:{eyeSight:900}});
assert(normalized.schema >= 3 && normalized.sessions.length === 1 && normalized.settings.eyeSight === 900 && Array.isArray(normalized.trash), "Storage normalization failed");
assert(storageApi.dataCounts({sessions:[1,2],setups:[1],sightMarks:[1,2,3]}).marks === 3, "Data counts failed");
assert(storageApi.hashText("abc") === storageApi.hashText("abc"), "Hash stability failed");
assert(storageApi.snapshotLabel({ts:Date.now(),counts:{sessions:2,setups:1,marks:3}}).includes("練習2"), "Snapshot label failed");
assert(storageApi.storageGetItem("__missing__") == null && storageApi.storageSetItem("__test__", "1") === false && storageApi.storageDriverProfile().id === "localStorage", "Storage adapter fallback failed");
assert(surface.includes("TRASH_LIMIT") && surface.includes("restoreTrash") && surface.includes("trashSettingsHtml"), "Trash/restore support missing");
assert(surface.includes("openSetupWizard") && surface.includes("openCalibrationWizard"), "Wizard/calibration flows missing");
assert(surface.includes("sessionsCsv") && surface.includes("scorecardSvg"), "Export flows missing");
assert(surface.includes("judgementFor") && surface.includes("conditionInsights"), "Analysis judgement flows missing");
assert(surface.includes("histFilter") && surface.includes("histSetup"), "History filters missing");
assert(surface.includes("ROUND_TYPES") && surface.includes("roundProgressHtml"), "Round scoring support missing");
assert(surface.includes("FIELD_FACE_SIZES") && surface.includes("cm フィールド") && surface.includes("フィールド 24標的/72射"), "Field target setup UI missing");
assert(surface.includes("サイト値を残す") && surface.includes("足りないデータを見る") && !surface.includes("校正用") && !surface.includes("状態確認"), "Record mode labels should be user-facing");
assert(surface.includes("personalModel") && surface.includes("sessionQuality") && surface.includes("nextActionPlan"), "Personal decision model missing");
assert(surface.includes("SESSION_METRIC_CACHE") && surface.includes("sessionMetricSignature"), "Session metric cache missing");
assert(surface.includes("decision_quality") && surface.includes("personal_model"), "CSV decision columns missing");
assert(surface.includes("robustWeightedLine") && surface.includes("modelReadinessProfile") && surface.includes("履歴の蓄積"), "v19 weighted model readiness missing");
assert(surface.includes("spineGuidance") && surface.includes("スパイン初期候補") && surface.includes("stabilizer"), "v20 gear guidance missing");
assert(surface.includes("RK4-3D") && surface.includes("windModel") && surface.includes("横流れ推定"), "v21 physics engine missing");
assert(surface.includes("personalPhysicsCalibration") && surface.includes("物理校正") && surface.includes("履歴推定"), "v22 personal physics calibration missing");
assert(fs.existsSync(path.join(root, "tools", "extract-catalog.py")), "Catalog extraction tool missing");
const trashDb = {sessions:[],setups:[],sightMarks:[],trash:[]};
let trashSaved = 0;
const trashApi = new Function("db","save","uid","today","TRASH_LIMIT", section("function cloneData", "/* ============ scoring") + "\nreturn {trashItem,restoreTrash,roundLabel};")(
  trashDb,
  () => { trashSaved++; },
  () => `id${trashSaved + trashDb.trash.length + 1}`,
  () => "2026-06-14",
  50
);
const deletedSession = {id:"sess1",date:"2026-06-14",dist:70,ends:[[]]};
const trashEntry = trashApi.trashItem("session","test session",deletedSession);
assert(trashDb.trash.length === 1 && trashEntry.label === "test session", "Trash insert failed");
assert(trashApi.restoreTrash(trashEntry.id) && trashDb.sessions[0].id === "sess1" && trashDb.trash.length === 0, "Trash restore failed");
assert(trashApi.roundLabel("70m72") === "70m 72射", "Round label failed");

const faceApi = new Function(section("function uid", "function cloneData") + "\nreturn {FIELD_FACE_SIZES,parseFaceChoice,faceLabel,perfectScoreValue,perfectScoreLabel,perfectScoreCount,secondaryScoreLabel,secondaryScoreCount};")();
const f40 = faceApi.parseFaceChoice("F40");
assert(f40.faceD === 40 && f40.faceType === "field" && faceApi.faceLabel(f40) === "40cmフィールド", "Field face parsing failed");
const q40 = faceApi.parseFaceChoice("Q40");
assert(q40.faceD === 40 && q40.faceType === "quad" && faceApi.faceLabel(q40) === "40cm四枚", "Quad face parsing failed");
assert(faceApi.FIELD_FACE_SIZES.join(",") === "80,60,40,20", "Field face sizes changed unexpectedly");
const fieldHits = [{s:6},{s:5},{s:4},{s:6}];
assert(faceApi.perfectScoreLabel(f40) === "6点" && faceApi.perfectScoreCount(fieldHits,f40) === 2, "Field perfect score helpers failed");
assert(faceApi.secondaryScoreLabel(f40) === "5点以上" && faceApi.secondaryScoreCount(fieldHits,f40) === 3, "Field secondary score helpers failed");

const scoreApi = new Function(section("function isFieldFace", "function momentStats") + "\nreturn {isFieldFace,isQuadFace,usesInnerX,ringW,arrowMarkRadius,targetLineHalfWidth,lineCutRadius,scoreAt,isLineCutting,hitFromGlobal,zoneStyle,normalizeScoreOpts,scoreOptsFromSession,gridKeysForSession,usesXScoring,validateSpotEnd,validateTripleEnd,validateQuadEnd,effectiveTripleEndScore,effectiveQuadEndScore,sessionStats,sessionTotalPoints,defaultTimerSeconds,formatTimerSec,timerRemainingSec,recordTimerEarlyEnd,timerEarlyTargetSec};")();
const fieldD = 80;
const fw = scoreApi.ringW(fieldD, "field");
const fieldTouch = scoreApi.lineCutRadius(fieldD, "field");
assert(scoreApi.isFieldFace("field") && fw === fieldD / 12, "Field ring width failed");
assert(scoreApi.scoreAt(0,0,fieldD,"field",0).s === 6, "Field center score failed");
assert(scoreApi.scoreAt(fw*1.5,0,fieldD,"field",0).s === 5, "Field 5-ring score failed");
assert(scoreApi.scoreAt(fw*3.5,0,fieldD,"field",0).s === 3, "Field black-ring score failed");
assert(scoreApi.scoreAt(fw*5.5,0,fieldD,"field",0).s === 1, "Field outer-ring score failed");
assert(scoreApi.scoreAt(fw*6.05,0,fieldD,"field",0).s === 0, "Field miss score failed");
assert(scoreApi.scoreAt(fw+fieldTouch*.8,0,fieldD,"field",fieldTouch).s === 6, "Field line-cutter inner score failed");
assert(scoreApi.scoreAt(fw+fieldTouch*1.2,0,fieldD,"field",fieldTouch).s === 5, "Field line-cutter outer score failed");
assert(scoreApi.hitFromGlobal(fw*2.4,0,fieldD,"field",fieldTouch).s === 4, "Field global hit score failed");
assert(scoreApi.zoneStyle(5,false,"field").bg === "var(--gold)" && scoreApi.zoneStyle(4,false,"field").bg === "#222", "Field score chip colors failed");

const cp40 = scoreApi.scoreAt(1.5, 0, 40, "triple", 0, { bowType: "compound", environment: "indoor" });
assert(cp40.s <= 9 && !cp40.X, "Compound indoor 40cm outer gold must be <=9");
const cp40inner = scoreApi.scoreAt(0, 0, 40, "triple", 0, { bowType: "compound", environment: "indoor" });
assert(cp40inner.s === 10 && cp40inner.X, "Compound indoor 40cm inner must be 10/X");
const indoorRc = scoreApi.scoreAt(0, 0, 40, "triple", 0, { bowType: "recurve", environment: "indoor" });
assert(indoorRc.s === 10 && !indoorRc.X, "Indoor recurve must not record X");
const indoorBb = scoreApi.scoreAt(0, 0, 40, "single", 0, { bowType: "barebow", environment: "indoor" });
assert(indoorBb.s === 10 && !indoorBb.X, "Indoor barebow must not record X (WA/AJAF)");
const outdoorBb = scoreApi.scoreAt(0, 0, 122, "single", 0, { bowType: "barebow", environment: "outdoor" });
assert(outdoorBb.s === 10 && outdoorBb.X, "Outdoor barebow inner ring must allow X");
const bbIndoorKeys = scoreApi.gridKeysForSession({ bowType: "barebow", environment: "indoor", faceD: 40, faceType: "single" });
assert(!bbIndoorKeys.includes("X"), "Indoor barebow grid must hide X");
const bbOutdoorKeys = scoreApi.gridKeysForSession({ bowType: "barebow", environment: "outdoor", faceD: 122, faceType: "single" });
assert(bbOutdoorKeys.includes("X"), "Outdoor barebow grid must include X");
assert(scoreApi.usesInnerX({ bowType: "barebow", environment: "indoor" }) === false, "barebow indoor usesInnerX");
assert(scoreApi.usesInnerX({ bowType: "barebow", environment: "outdoor" }) === true, "barebow outdoor usesInnerX");
const cp48outer = scoreApi.scoreAt(2.5, 0, 48, "single", 0, { bowType: "compound", environment: "outdoor" });
assert(cp48outer.s === 9, "Compound outdoor 48cm outer gold must be 9");
const cp48low = scoreApi.scoreAt(10, 0, 48, "single", 0, { bowType: "compound", environment: "outdoor" });
assert(cp48low.s === 0 || cp48low.s >= 5, "Compound outdoor 48cm below 5-ring must be 0");
const indoorKeys = scoreApi.gridKeysForSession({ bowType: "recurve", environment: "indoor", faceD: 40, faceType: "triple" });
assert(!indoorKeys.includes("X"), "Indoor recurve grid must hide X");
const cpKeys = scoreApi.gridKeysForSession({ bowType: "compound", environment: "outdoor", faceD: 48, faceType: "single" });
assert(cpKeys.join(",") === "10,9,8,7,6,5", "CP outdoor 48cm grid must be 5-10");
assert(scoreApi.validateTripleEnd([{ spot: 0, s: 8 }, { spot: 0, s: 6 }]).length === 1, "Triple duplicate spot warning failed");
assert(scoreApi.validateSpotEnd([{ spot: 1, s: 9 }, { spot: 1, s: 7 }, { spot: 2, s: 8 }]).length === 1, "Spot duplicate warning failed");
assert(scoreApi.effectiveTripleEndScore([{ spot: 0, s: 9 }, { spot: 0, s: 7 }, { spot: 1, s: 10 }]) === 17, "Triple collision keeps lower spot score");
const earlyDb = { settings: { timerEarlyTarget: 30 } };
const earlyApi = new Function(`const db=${JSON.stringify(earlyDb)};` + section("function timerRemainingSec", "function zoneStyle") + "return {timerRemainingSec,recordTimerEarlyEnd,timerEarlyTargetSec};")();
const earlySess = { purpose: "practice", timerEndAt: Date.now() + 45000 };
earlyApi.recordTimerEarlyEnd(earlySess);
assert(earlySess.timerEarlyCount === 1, "recordTimerEarlyEnd should count when rem>=earlyTarget");
const lateSess = { purpose: "practice", timerEndAt: Date.now() + 15000 };
earlyApi.recordTimerEarlyEnd(lateSess);
assert(!lateSess.timerEarlyCount, "recordTimerEarlyEnd should skip when rem<earlyTarget");
assert(surface.includes("timerEarlyTarget") && surface.includes("recordTimerEarlyEnd") && surface.includes("timerEarlyCount"), "timer early completion wiring missing");
assert(surface.includes('id="editRound"') && surface.includes('id="editDate"') && surface.includes("applyRoundToSession"), "history edit round/date missing");
assert(surface.includes("maybeToastSpotCollision") && surface.includes("同じ的に2本 — 低い方のみ有効"), "triple collision toast missing");
assert(surface.includes("18m60_jp") && surface.includes("gridKeysForSession") && surface.includes("indoorHalfBanner"), "P0 indoor JP round missing");
const tripleDup=[{spot:0,s:8,X:false},{spot:0,s:10,X:true},{spot:1,s:9,X:false}];
assert(scoreApi.effectiveTripleEndScore(tripleDup)===17, "effectiveTripleEndScore should keep lower duplicate spot");
const volSess={purpose:"volume",ends:[[{s:10},{s:9}]],cur:[{s:8}],faceType:"single"};
assert(scoreApi.sessionStats(volSess).count===3 && scoreApi.sessionStats(volSess).volume===true, "volume sessionStats failed");
const badgeJs=fs.readFileSync(path.join(root,"scripts","38-badge-engine.js"),"utf8");
assert(!/function sessionTotalPoints\s*\(/.test(badgeJs), "38-badge-engine must not shadow sessionTotalPoints");
const scoringJs=fs.readFileSync(path.join(root,"scripts","20-scoring.js"),"utf8");
const stackedScoreApi=new Function(scoringJs+"\n"+badgeJs+"\nreturn {sessionStats,sessionTotalPoints,badgeProgressForSession};")();
const activeSess={id:"t",purpose:"practice",dist:70,ends:[],cur:[],faceType:"full",bowType:"recurve",environment:"outdoor",perEnd:6};
let stackErr=null;
try{ stackedScoreApi.sessionStats(activeSess); }catch(e){ stackErr=e; }
assert(!stackErr, `sessionStats must not recurse after badge-engine loads: ${stackErr&&stackErr.message}`);
assert(stackedScoreApi.sessionStats(activeSess).total===0, "empty active session total should be 0");
assert(typeof stackedScoreApi.badgeProgressForSession(activeSess,[])==="object"||stackedScoreApi.badgeProgressForSession(activeSess,[])===null, "badge engine should load after scoring");
assert(scoreApi.defaultTimerSeconds({round:"30m36",perEnd:3})===120, "30m36 timer should be 120s");
assert(scoreApi.formatTimerSec(125)==="2:05", "formatTimerSec failed");
assert(surface.includes('id:"volume"') && surface.includes("本数練"), "volume mode missing");
assert(surface.includes("resetEndTimer") && surface.includes("weekArrowCount"), "P1 timer/week features missing");
assert(surface.includes("statsFilter") && surface.includes("db.settings.statsFilter"), "statsFilter persistence missing");
assert(surface.includes("syncKeepAwake") && surface.includes("keepAwake") && surface.includes("wakeLockSentinel"), "KeepAwake wiring missing");
assert(surface.includes("openCheckInModal") && surface.includes("launchActiveSession") && surface.includes("checkInSheet"), "Check-in modal missing");
const quickStartBody=scripts.match(/function quickStartSession\([^)]*\)\{([\s\S]*?)\n\}/);
assert(quickStartBody&&!quickStartBody[1].includes("openCheckInModal"), "quickStartSession must be 1-tap (no check-in gate)");
assert(scripts.includes("liveContextMain")&&scripts.includes("checkInSheetHtml"), "Text truncation / check-in sheet hooks missing");
assert(surface.includes("groupBySpotIdStats"), "spotId stats missing");
assert(surface.includes("badgeProgressBannerHtml") && surface.includes("STAR_BADGE_PROFILES") && surface.includes("GREEN_BADGE_PROFILES"), "Badge engine missing");
assert(surface.includes("18m60_jp_x2") && surface.includes("jpMatch"), "18m60_jp_x2 round missing");
assert(surface.includes("openScorecardPrint") && surface.includes("scorecardPrintHtml"), "Print scorecard missing");
assert(surface.includes("generateSelfCompareComment") && surface.includes("formCompare") && surface.includes("phaseSeconds"), "Form §42 MVP missing");
assert(surface.includes("measurePreReleaseWindow") && surface.includes("buildStructuredFormComment") && surface.includes("structuredComment"), "Form §42 deep dive missing");
assert(surface.includes("appendFormPrecisionRun") && surface.includes("assessCaptureQuality") && surface.includes("buildFormPrecisionRun") && surface.includes("formPrecisionRuns"), "Form §43 FP1 missing");
assert(surface.includes("formQualityGateHtml") && surface.includes("movementNormToCm"), "Form FP1 quality/cm missing");
assert(surface.includes("attachBowTracksToFrames") && surface.includes("formPrecisionCorrelationHtml") && surface.includes("data-form-mode=\"precision\""), "Form §43 FP2 missing");
assert(surface.includes("computeFp3Metrics") && surface.includes("anchor_variation_mm") && surface.includes("formPrecisionBaseline"), "Form §43 FP3 missing");
assert(surface.includes("has_precision") && surface.includes("confidence_bow_track"), "Form §43 FP3 context/decision missing");
assert(surface.includes("renderFormPrecisionErrorReport") && surface.includes("FORM_BENCHMARK_PUBLIC") && surface.includes("formExpectationsBlockHtml"), "Form §43 FP4 missing");
assert(surface.includes("pairScoringPanelHtml") && surface.includes("comparePairArrows") && surface.includes("PAIR_DISCLAIMER"), "Pair scoring missing");
assert(surface.includes("shareScorecard") && surface.includes("scorecardPngBlob"), "Scorecard share/PNG missing");
assert(surface.includes("setMatch5") && surface.includes("field12") && surface.includes("applySetMatchEnd"), "P3 set/field rounds missing");
assert(surface.includes("barebow") && surface.includes("normalizeScoreOpts") && surface.includes("usesInnerX"), "Barebow score rules missing");
assert(surface.includes("SPOT_QUAD") && surface.includes('faceType==="quad"'), "Quad face support missing");
assert(surface.includes("teamSetPanelHtml") && surface.includes("TEAM_DISCLAIMER") && surface.includes("tagTeamArrow"), "Team set UI missing");
const quadHalfApi = new Function(section("function isQuadFace", "function maybeToastSpotCollision") + "\nreturn {quadSpotsForHalf,quadHalfLabel,quadHalfForEndIndex,quadArrowGlobal,hitFromGlobal,lineCutRadius};")();
const qFirst = quadHalfApi.quadSpotsForHalf("first");
const qSecond = quadHalfApi.quadSpotsForHalf("second");
assert(qFirst.find(s => s.id === "A").y === 22 && qSecond.find(s => s.id === "C").y === 22, "Quad half coordinate swap failed");
assert(quadHalfApi.quadHalfForEndIndex({ faceType: "quad" }, 9) === "first" && quadHalfApi.quadHalfForEndIndex({ faceType: "quad" }, 10) === "second", "Quad half end index switch failed");
const quadHit = scoreApi.hitFromGlobal(-22, 22, 40, "quad", scoreApi.lineCutRadius(40, "quad"), { bowType: "recurve", environment: "outdoor", quadHalf: "first" });
assert(quadHit.s === 10 && quadHit.spotId === "A", "Quad hitFromGlobal A-spot failed");
const quadHit2 = scoreApi.hitFromGlobal(-22, 22, 40, "quad", scoreApi.lineCutRadius(40, "quad"), { quadHalf: "second" });
assert(quadHit2.spotId === "C", "Quad second-half top-left should be C");
assert(surface.includes("quad60_jp") && surface.includes("quadHalf") && surface.includes("quadHalfChips") && surface.includes("launchQuadJpPreset"), "Quad half UI/preset missing");
const quadDup = [{ spot: 0, s: 8, X: false }, { spot: 0, s: 10, X: true }, { spot: 1, s: 9, X: false }];
assert(scoreApi.effectiveQuadEndScore(quadDup) === 17, "effectiveQuadEndScore duplicate spot keeps lower");

const targetApi = new Function(
  "ringW","isFieldFace","targetLineHalfWidth","SPOT_Y",
  section("function targetMarkup", "function markCircle") + "\nreturn {targetMarkup};"
)(
  scoreApi.ringW,
  scoreApi.isFieldFace,
  scoreApi.targetLineHalfWidth,
  [22,0,-22]
);
const fieldSvg = targetApi.targetMarkup(80, "tf", "field");
assert(fieldSvg.includes('class="main field"') && fieldSvg.includes("#ffe14d") && fieldSvg.includes("#1c1e1c"), "Field target SVG failed");
assert(surface.includes("fieldCourseAdv") && surface.includes("applyFieldCourseToSession") && surface.includes("FIELD_COURSE_PRESETS") && surface.includes("groupByFieldTargetStats") && surface.includes("fieldHudLine"), "Field course UI/core missing");
const fcPresetJson = JSON.parse(fs.readFileSync(path.join(root, "tools", "field-course-presets.json"), "utf8"));
const flat24Targets = fcPresetJson.presets.flat24_marked.targets;
assert(flat24Targets.length === 24 && flat24Targets[0].distM === 15 && flat24Targets[3].faceD === 60, "field-course-presets flat24 invalid");
const fcSess = { round: "field24", perEnd: 3, ends: [], faceType: "field", fieldCourse: flat24Targets.slice(0, 24), fieldCourseId: "flat24_marked" };
const fcApplyTarget = (sess, idx) => { const t = sess.fieldCourse[idx]; sess.dist = t.distM; sess.faceD = t.faceD; };
fcApplyTarget(fcSess, 0);
const fcT0 = { dist: fcSess.dist, face: fcSess.faceD };
fcApplyTarget(fcSess, 3);
assert(fcSess.dist !== fcT0.dist || fcSess.faceD !== fcT0.face, "Field course end0→end3 should change dist or faceD");
const fcArrows = [{ s: 5 }, { s: 4 }, { s: 3 }];
const fcMeta = fcSess.fieldCourse[0];
fcArrows.forEach((a) => { a.fieldTarget = fcMeta.target; a.fieldDistM = fcMeta.distM; a.fieldAngleDeg = fcMeta.angleDeg; });
assert(fcArrows[0].fieldTarget === 1 && fcArrows[0].fieldDistM === 15, "field arrow metadata shape failed");

const statsApi = new Function(section("function clamp", "/* ============ target SVG") + "\nreturn {robustStats,groupStats};")();
const arrows = [
  {x:1,y:1},{x:2,y:1.5},{x:0,y:.5},{x:1.2,y:1.7},{x:.8,y:.9},{x:1.5,y:1.1},
  {x:2.1,y:2.0},{x:1.7,y:1.6},{x:28,y:-20}
];
const st = statsApi.robustStats(arrows);
assert(st && st.excluded.length === 1 && st.method === "ellipse-biweight", "Robust grouping failed");
const lineApi = new Function(section("function clamp", "function solve3") + "\nreturn {robustWeightedLine};")();
const wr = lineApi.robustWeightedLine([[5,3,1],[6,1.5,1],[7,0.2,1],[8,-1.1,1],[9,-2.6,1],[12,20,0.05]]);
assert(wr && wr.kind === "weighted-robust" && wr.zero > 6.8 && wr.zero < 7.5 && wr.quality > .4, "Weighted robust sight regression failed");

const analysisDb = {sessions:[]};
const analysisApi = new Function(
  "db","robustStats","ringW","clamp","num","gearPrecisionProfile","pct","cmOffsetText","esc","groupStats",
  section("function windText", "function roundProgressHtml") + "\nreturn {sessionQuality,personalModel,judgementFor,nextActionPlan};"
)(
  analysisDb,
  statsApi.robustStats,
  f=>f/20,
  (v,a,b)=>Math.max(a,Math.min(b,v)),
  v=>{ const n=parseFloat(v); return Number.isFinite(n)?n:null; },
  () => ({score:.85,missing:[]}),
  v=>`${Math.round(v*100)}%`,
  (v,axis)=>`${axis}:${v.toFixed(1)}`,
  s=>String(s == null ? "" : s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])),
  statsApi.groupStats
);
const sessAt = (id,cx,cy) => ({id,date:`2026-06-${id}`,setupId:"main",dist:70,faceD:122,faceType:"single",wx:"晴れ",ends:[[
  {x:cx-0.5,y:cy,s:9},{x:cx+0.3,y:cy+0.2,s:9},{x:cx,y:cy-0.4,s:10},
  {x:cx+0.4,y:cy+0.4,s:9},{x:cx-0.2,y:cy-0.1,s:10},{x:cx+0.1,y:cy+0.3,s:9}
],[
  {x:cx-0.4,y:cy+0.1,s:9},{x:cx+0.2,y:cy-0.2,s:10},{x:cx+0.5,y:cy+0.1,s:9},
  {x:cx-0.1,y:cy+0.4,s:9},{x:cx+0.2,y:cy+0.2,s:10},{x:cx-0.3,y:cy-0.3,s:9}
]]});
analysisDb.sessions.push(sessAt("01",2,1), sessAt("02",2.4,1.2));
const current = sessAt("03",2.8,1.3);
const curSt = statsApi.robustStats(current.ends.flat());
const q = analysisApi.sessionQuality(current,{id:"main"});
const pm = analysisApi.personalModel(current,{id:"main"},curSt);
assert(q.score > .45 && ["中","高"].includes(q.label), "Session quality failed");
assert(pm && pm.sample === 2 && pm.state === "過去と一致", "Personal model failed");
const judgement = analysisApi.judgementFor({st:curSt,confidence:.7,lines:[{axis:"h"}],personal:pm},current);
assert(judgement && judgement.label === "動かす", "Personal judgement failed");
assert(analysisApi.nextActionPlan(current,{st:curSt,confidence:.7,lines:[{axis:"h"}],personal:pm},{id:"main"}).length > 0, "Next action plan failed");

const normGearText = s => String(s || "").normalize("NFKC").toUpperCase().replace(/[・_/]+/g, " ").replace(/\s+/g, " ").trim();
const physicsApi = new Function("normGearText", section("function clamp", "function adviceModel") + "\nreturn {physicsProfile,trajectoryModel,windModel,ArcheryPhysicsCore};")(normGearText);
const phys = physicsApi.physicsProfile({
  poundage:"38", drawLength:"28.5", shaftGpi:"6.8", arrowLength:"29", pointWeight:"110", arrowDia:"5.5",
  vane:"Spin Wing", vaneHeight:"2.0", temperature:"30", altitude:"500", humidity:"70",
  shaftSetWeightSpread:"4", shaftStraightness:"0.003", foc:"13"
});
assert(phys.speedFps > 150 && phys.speedFps < 260, "Physics speed out of range");
assert(phys.rho > .9 && phys.rho < 1.25, "Air density out of range");
assert(phys.cd > 1.1 && phys.cd < 1.3, "Arrow Cd out of range");
assert(phys.variation.confidenceFactor < 1, "Gear variation did not apply");
const calmTraj = physicsApi.trajectoryModel({dist:70}, {
  poundage:"38", drawLength:"28.5", shaftGpi:"6.8", arrowLength:"29", pointWeight:"110", arrowDia:"5.5",
  vane:"Spin Wing", temperature:"30", altitude:"500", humidity:"70"
}, 850);
const windTraj = physicsApi.trajectoryModel({dist:70, windDir:"左から", windSpeed:"4"}, {
  poundage:"38", drawLength:"28.5", shaftGpi:"6.8", arrowLength:"29", pointWeight:"110", arrowDia:"5.5",
  vane:"Spin Wing", temperature:"30", altitude:"500", humidity:"70"
}, 850);
assert(calmTraj.engine === "RK4-3D" && calmTraj.tof > .6 && calmTraj.tof < 1.5, "RK4 trajectory failed");
assert(windTraj.wind.side > 0 && windTraj.windDriftCm > 0 && windTraj.windUncertaintyCm > 0, "Wind drift model failed");
assert(physicsApi.ArcheryPhysicsCore && physicsApi.ArcheryPhysicsCore.trajectory({dist:70}, {poundage:"38"}, 850).engine === "RK4-3D", "Physics core facade failed");
const calibDb = {
  setups:[{id:"main",poundage:"38",drawLength:"28.5",shaftGpi:"6.8",arrowLength:"29",pointWeight:"110",arrowDia:"5.5",arrowWeight:"334",vane:"Spin Wing",temperature:"30",altitude:"500",humidity:"70"}],
  sessions:[],
  sightMarks:[{setupId:"main",dist:30,v:"4.2"},{setupId:"main",dist:50,v:"5.6"},{setupId:"main",dist:70,v:"6.8"}],
  settings:{eyeSight:850}
};
const calibSess = (id, sightV, cx, cy, windDir="", windSpeed="") => ({
  id, date:`2026-05-${id}`, setupId:"main", dist:70, faceD:122, faceType:"single", sightV:String(sightV), windDir, windSpeed,
  ends:[[0,1,2,3,4,5].map(i=>({x:cx+(i%3-1)*.2,y:cy+(Math.floor(i/3)-.5)*.2,s:9}))]
});
calibDb.sessions.push(
  calibSess("01",5,0,2),
  calibSess("02",6,0,0),
  calibSess("03",7,0,-2),
  calibSess("04",6,11,0,"左から","4"),
  calibSess("05",6,10.5,0,"左から","4")
);
const calibApi = new Function(
  "db","normGearText","robustStats","sessionQuality","ringW","isWindy","pct","esc",
  section("function clamp", "function adviceModel") + section("function regress", "function calibrationProfile") + "\nreturn {personalPhysicsCalibration,physicsCalibrationHtml};"
)(
  calibDb,
  normGearText,
  statsApi.robustStats,
  (s,setup,st) => ({score:.82, metrics:{st:st||statsApi.robustStats(s.ends.flat()), all:s.ends.flat(), avg:9}}),
  f=>f/20,
  s=>!!(s.windSpeed && +s.windSpeed>=3.5),
  v=>`${Math.round(v*100)}%`,
  s=>String(s == null ? "" : s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))
);
const pcal = calibApi.personalPhysicsCalibration("main");
assert(pcal && pcal.click.v70 > 1.5 && pcal.click.v70 < 2.5 && pcal.wind.sample >= 2 && pcal.wind.factor > .7 && pcal.score > .25, "Personal physics calibration failed");
assert(calibApi.physicsCalibrationHtml("main").includes("物理校正"), "Physics calibration UI failed");

const gearApi = new Function(
  "clamp","num","esc",
  section("const CATALOG_SHAFTS=", "function renderGear") + "\nreturn {inferCatalogGear,gearSectionHtml,gearPrecisionProfile,gearPrecisionHtml,spineGuidance,GEAR_SECTIONS,GEAR_FIELDS,GEAR_SUGGESTIONS};"
)(
  (v,a,b)=>Math.max(a,Math.min(b,v)),
  v=>{ const n=parseFloat(v); return Number.isFinite(n)?n:null; },
  s=>String(s == null ? "" : s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))
);
const inf = gearApi.inferCatalogGear({arrow:"EASTON X10", notes:"", shaftSpine:"650", arrowLength:"29", pointWeight:"110"});
assert(inf && inf.spine === 650 && Math.round(inf.total) === 334, "Catalog inference failed");
const protour = gearApi.inferCatalogGear({arrow:"EASTON X10 ProTour", notes:"", shaftSpine:"670", arrowLength:"29", pointWeight:"110"});
assert(protour && protour.fam.id === "x10-protour" && protour.gpi === 6.5 && protour.dia < 4.8, "X10 ProTour inference failed");
const unlistedProtour = gearApi.inferCatalogGear({arrow:"EASTON X10 ProTour", notes:"", shaftSpine:"650", arrowLength:"29", pointWeight:"110"});
assert(unlistedProtour && unlistedProtour.notes.some(n => n.includes("未確認")), "Unlisted spine warning missing");
const missingInf = gearApi.inferCatalogGear({arrow:"EASTON X10", notes:"", shaftSpine:"", arrowLength:"29", pointWeight:"110"});
assert(missingInf && missingInf.missing === "spine", "Separated shaft/spine inference failed");
const formHtml = gearApi.GEAR_SECTIONS.map(sec => gearApi.gearSectionHtml(sec, {bow:"HOYT GMX3"})).join("");
assert(formHtml.includes("<details class=\"adv\"><summary>矢の実測・精密データ</summary>"), "Gear section UI missing");
assert(formHtml.includes("シャフト銘柄") && formHtml.includes("HOYT Grand Prix XCEED 2 H25"), "Separated gear model UI missing");
assert(formHtml.includes("SHIBUYA ULTIMA RC IV 520 Carbon") && formHtml.includes("RAMRODS VEKTOR") && formHtml.includes("GAS Bowstrings Ghost XV") && formHtml.includes("ANGEL Tab 2 Plus Cordovan"), "Expanded gear knowledge missing");
assert(formHtml.includes("choicePick") && formHtml.includes("候補にないので手入力"), "Gear dropdown/manual UI missing");
const bowKeys = gearApi.GEAR_SUGGESTIONS.bow.map(normGearText);
const limbKeys = gearApi.GEAR_SUGGESTIONS.limbs.map(normGearText);
assert(!limbKeys.some(v => /FORMULA SR|FORMULA XD/.test(v)), "Handle-only HOYT risers leaked into limbs");
assert(!bowKeys.some(v => /MK KOREA MK XD|MK XD|MK KOREA ZEST/.test(v)), "Limb-only MK entries leaked into bow");
assert(!limbKeys.some(v => v === "HOYT RCRV PODIUM" || v === "HOYT RCRV COMP"), "Ambiguous HOYT limb labels missing limb context");
assert(!limbKeys.some(v => v.includes("SKADI-CX")), "Stabilizer leaked into limbs");
assert(!bowKeys.some(v => limbKeys.includes(v)), "Handle/limb dropdown overlap");
assert(gearApi.GEAR_SUGGESTIONS.stabilizer.some(v => normGearText(v).includes("SKADI-CX")), "Known stabilizer entry missing from stabilizer list");
assert(!gearApi.GEAR_SUGGESTIONS.stabilizer.some(v => /LIMBS|リム/.test(normGearText(v))), "Limb entries leaked into stabilizer dropdown");
assert(!gearApi.GEAR_SUGGESTIONS.sight.some(v => /LIMBS|リム|H25/.test(normGearText(v))), "Bow/limb entries leaked into sight dropdown");
assert(formHtml.includes("ハンドル/弓本体") && formHtml.includes("HOYT Formula RCRV PODIUM Limbs"), "Separated handle/limb labels missing");
assert(gearApi.GEAR_FIELDS.length >= 32, "Gear fields unexpectedly small");
assert(gearApi.GEAR_FIELDS.some(([k]) => k === "stabilizer") && gearApi.GEAR_FIELDS.some(([k]) => k === "tab"), "New gear fields missing");
assert(gearApi.GEAR_FIELDS.some(([k]) => k === "tuningMethod") && gearApi.GEAR_FIELDS.some(([k]) => k === "tuningResult"), "Tuning practice fields missing");
const sp = gearApi.spineGuidance({poundage:"38", drawLength:"28.5", arrowLength:"29", pointWeight:"110", shaftSpine:"660"});
assert(sp && sp.ready && sp.candidates.includes(660) && ["概ね候補域","候補を表示"].includes(sp.state), "Spine guidance failed");
assert(gearApi.gearPrecisionHtml({poundage:"38", drawLength:"28.5", arrowLength:"29", pointWeight:"110", shaftSpine:"660"}).includes("スパイン初期候補"), "Spine guidance UI missing");

const historyApi = new Function(
  "db","robustStats","ringW","groupStats","faceLabel","fmtD","cmOffsetText","esc","zoneStyle",
  section("function sessionGroupPoint", "function monthlyCard") + "\nreturn {groupingTrendCard,scoreDistCard};"
)(
  {setups:[{id:"main",name:"Main setup"}]},
  statsApi.robustStats,
  scoreApi.ringW,
  statsApi.groupStats,
  faceApi.faceLabel,
  iso=>iso,
  (v,axis)=>`${axis}:${v.toFixed(1)}`,
  s=>String(s == null ? "" : s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])),
  scoreApi.zoneStyle
);
const sampleSessions = [
  {id:"b",date:"2026-02-01",setupId:"main",dist:70,faceD:122,faceType:"single",ends:[[{x:2,y:1,s:9},{x:3,y:2,s:9},{x:1,y:1,s:10},{x:2,y:0,s:10},{x:3,y:1,s:9},{x:2,y:2,s:9}]]},
  {id:"a",date:"2026-01-01",setupId:"main",dist:70,faceD:122,faceType:"single",ends:[[{x:-1,y:0,s:10},{x:0,y:1,s:10},{x:-2,y:0,s:9},{x:-1,y:-1,s:10},{x:0,y:0,s:10},{x:-1,y:1,s:10}]]}
];
const trendHtml = historyApi.groupingTrendCard(sampleSessions);
assert(trendHtml.includes("グルーピング推移") && trendHtml.includes("Main setup"), "Grouping trend card failed");
const fieldDistHtml = historyApi.scoreDistCard([{id:"field",date:"2026-03-01",dist:30,faceD:40,faceType:"field",ends:[[
  {s:6},{s:5},{s:4},{s:3},{s:2},{s:1},{s:6},{s:5},{s:4},{s:3},{s:2},{s:0}
]]}]);
assert(fieldDistHtml.includes("得点分布") && fieldDistHtml.includes(">6</div>") && !fieldDistHtml.includes(">10</div>") && !fieldDistHtml.includes(">X</div>"), "Field score distribution failed");

console.log(`Archery-master checks OK (v${version})`);
console.log(`Robust grouping: used=${st.n}, excluded=${st.excluded.length}, confidence=${Math.round(st.confidence*100)}%`);
console.log(`Physics: ${phys.speedFps.toFixed(0)}fps, rho=${phys.rho.toFixed(2)}, Cd=${phys.cd.toFixed(2)}`);
