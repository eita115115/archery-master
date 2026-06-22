# Native Viewport Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock the iPhone viewport so Archery Master cannot zoom or drift as a document, while preserving a vertically scrolling app content area and matching the iPhone status-bar surface to the dark app chrome.

**Architecture:** `html` and `body` become a fixed-height app shell; the existing header is the first row and `main` is the only vertical scroller. Viewport metadata, CSS touch policy, and an iOS multi-touch gesture guard jointly prevent scale changes. Existing target gestures remain isolated by `.tgWrap { touch-action:none; }`.

**Tech Stack:** Static HTML, CSS, browser JavaScript, Node-based static checks, Chrome DevTools UI smoke checks, GitHub Pages/PWA service worker.

## Global Constraints

- Keep the existing `ARCHERY MASTER` header and settings button.
- Disable pinch zoom, double-tap zoom, input focus zoom, horizontal drift, and document rubber-banding.
- Keep score entry, target tapping/dragging, overlays, sheets, and the on-screen keyboard usable.
- Preserve `viewport-fit=cover` and safe-area padding.
- Publish as v81 and verify GitHub Pages plus the service-worker cache version.
- Do not stage or alter unrelated untracked files.

---

### Task 1: Add the viewport stability regression contract

**Files:**
- Modify: `tools/check-app.js`
- Modify: `tools/check-ui.js`

**Interfaces:**
- Consumes: existing `index.html`, `style.css`, `scripts/00-compat.js`, and the UI smoke CDP client.
- Produces: a failing contract that requires locked viewport metadata, iPhone status-bar metadata, a document-locked app shell, and `main` as the only vertical scroller.

- [ ] **Step 1: Replace the accessibility-zoom assertion with the approved complete-lock contract**

In `tools/check-app.js`, replace the current `maximum-scale=5` assertion with:

```js
assert(/maximum-scale\s*=\s*1/.test(html) && /user-scalable\s*=\s*no/.test(html), "Viewport must be fully locked");
assert(html.includes('name="apple-mobile-web-app-capable" content="yes"') && html.includes('name="apple-mobile-web-app-status-bar-style" content="black-translucent"'), "iPhone standalone status bar metadata missing");
assert(css.includes("overscroll-behavior:none") && css.includes("grid-template-rows:auto minmax(0,1fr)") && css.includes("touch-action:pan-y"), "Locked app-shell CSS missing");
assert(scripts.includes('document.addEventListener("gesturestart"') && scripts.includes("touches.length>1"), "iOS viewport gesture guard missing");
```

In `tools/check-ui.js::staticUiChecks()`, replace its current `maximum-scale=5` assertion with:

```js
assert(/maximum-scale=1/.test(html) && /user-scalable=no/.test(html), "Viewport must be fully locked");
assert(html.includes('name="apple-mobile-web-app-capable" content="yes"') && html.includes('name="apple-mobile-web-app-status-bar-style" content="black-translucent"'), "iPhone standalone status bar metadata missing");
assert(css.includes("overscroll-behavior:none") && css.includes("grid-template-rows:auto minmax(0,1fr)") && css.includes("touch-action:pan-y"), "Locked app-shell CSS missing");
assert(appJs.includes('document.addEventListener("gesturestart"') && appJs.includes("touches.length>1"), "iOS viewport gesture guard missing");
```

- [ ] **Step 2: Add browser assertions for the locked shell**

Extend the `metrics` expression in `tools/check-ui.js` to return:

```js
const htmlStyle = getComputedStyle(document.documentElement);
const bodyStyle = getComputedStyle(document.body);
const main = document.querySelector("#main");
const mainStyle = main && getComputedStyle(main);
window.scrollTo(40, 40);
const shell = {
  scrollX: window.scrollX,
  scrollY: window.scrollY,
  innerHeight: window.innerHeight,
  htmlOverflowX: htmlStyle.overflowX,
  htmlOverflowY: htmlStyle.overflowY,
  bodyOverflowX: bodyStyle.overflowX,
  bodyOverflowY: bodyStyle.overflowY,
  bodyHeight: document.body.getBoundingClientRect().height,
  mainOverflowX: mainStyle && mainStyle.overflowX,
  mainOverflowY: mainStyle && mainStyle.overflowY,
  mainScrollWidth: main && main.scrollWidth,
  mainClientWidth: main && main.clientWidth,
};
```

Return `shell` beside the existing metrics. After the existing assertions, add:

```js
if (view.width <= 520) {
  assert(value.shell.scrollX === 0 && value.shell.scrollY === 0, `${view.name} document must not scroll: ${JSON.stringify(value.shell)}`);
  assert(value.shell.htmlOverflowX === "hidden" && value.shell.htmlOverflowY === "hidden", `${view.name} html must be locked: ${JSON.stringify(value.shell)}`);
  assert(value.shell.bodyOverflowX === "hidden" && value.shell.bodyOverflowY === "hidden", `${view.name} body must be locked: ${JSON.stringify(value.shell)}`);
  assert(Math.abs(value.shell.bodyHeight - value.shell.innerHeight) <= 1, `${view.name} body must match viewport height: ${JSON.stringify(value.shell)}`);
  assert(value.shell.mainOverflowY === "auto", `${view.name} main must own vertical scrolling: ${JSON.stringify(value.shell)}`);
  assert(value.shell.mainScrollWidth <= value.shell.mainClientWidth + 1, `${view.name} main has horizontal overflow: ${JSON.stringify(value.shell)}`);
}
```

- [ ] **Step 3: Run the regression check and verify RED**

Run:

```powershell
npm run check:app
```

Expected: FAIL with `Viewport must be fully locked` because v80 still permits 5x zoom.

Run:

```powershell
npm run check:ui
```

Expected: FAIL in `staticUiChecks()` for the same missing viewport lock.

---

### Task 2: Implement the locked app shell and iPhone status-bar match

**Files:**
- Modify: `index.html`
- Modify: `style.css`
- Modify: `scripts/00-compat.js`

**Interfaces:**
- Consumes: existing safe-area variables, sticky header, fixed bottom tabs, target gesture handlers, and overlay/sheet layout.
- Produces: a fixed document viewport with `main` as the vertical scroller and a `preventViewportScale(event)` iOS guard.

- [ ] **Step 1: Lock scaling and set the standalone status-bar style**

Update the metadata in `index.html` to:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
```

Use `#05090B` for both theme-color declarations so Safari chrome and the installed-PWA status-bar surface match the Neon Sight background.

- [ ] **Step 2: Convert the document into a fixed app shell**

Update the root rules in `style.css` to implement:

```css
html,body{
  margin:0;
  padding:0;
  width:100%;
  height:100%;
  overflow:hidden;
  overscroll-behavior:none;
}
html{background:var(--bg);touch-action:pan-y;}
body{
  height:100dvh;
  min-height:100dvh;
  display:grid;
  grid-template-rows:auto minmax(0,1fr);
  overflow:hidden;
  overscroll-behavior:none;
  padding-bottom:0;
}
main{
  width:100%;
  height:100%;
  min-height:0;
  overflow-x:clip;
  overflow-y:auto;
  overscroll-behavior:none;
  touch-action:pan-y;
  -webkit-overflow-scrolling:touch;
}
```

Keep the existing `main` max-width, margins, visual padding, target-specific `touch-action:none`, fixed tabs, and internally scrolling `.sheet` rules.

- [ ] **Step 3: Add the iOS multi-touch scaling guard**

Append to `scripts/00-compat.js`:

```js
function preventViewportScale(e){ e.preventDefault(); }
document.addEventListener("gesturestart",preventViewportScale,{passive:false});
document.addEventListener("gesturechange",preventViewportScale,{passive:false});
document.addEventListener("touchmove",e=>{
  if(e.touches&&e.touches.length>1) preventViewportScale(e);
},{passive:false});
```

Do not prevent single-touch moves; target interaction and vertical `main` scrolling depend on them.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
npm run check:app
npm run check:ui
npm run check:interactions
npm run check:ui-layer
```

Expected: all commands exit 0; UI screenshots remain 390x844, 360x780, and 1280x800; interaction audit reports no overlay or record-input failures.

- [ ] **Step 5: Inspect the mobile result**

Serve the repo on a fresh localhost origin and inspect 390x844 plus 360x780. Confirm the header stays visible, `main` scrolls, bottom tabs do not overlap controls, settings sheets scroll internally, score entry works, target mode still receives pointer input, and `document.scrollingElement` remains at `(0,0)`.

---

### Task 3: Release and verify v81

**Files:**
- Modify via `npm run version:bump -- 81`: `package.json`, `package-lock.json`, `scripts/10-storage-native.js`, `sw.js`, `version.json`

**Interfaces:**
- Consumes: repository version-bump script and GitHub Pages deployment from `main`.
- Produces: app version 81, cache `matonote-v81`, and public `version.json` value 81.

- [ ] **Step 1: Bump the release version**

Run:

```powershell
npm run version:bump -- 81
```

Expected: `Archery Note version set to 81`.

- [ ] **Step 2: Run final verification**

Run:

```powershell
npm run check:app
npm run check:ui
npm run check:interactions
npm run check:ui-layer
git diff --check
```

Expected: every command exits 0 and `check:app` reports v81.

- [ ] **Step 3: Commit the implementation**

Stage only the tracked viewport, test, and version files, then commit:

```powershell
git add -- index.html style.css scripts/00-compat.js tools/check-app.js tools/check-ui.js package.json package-lock.json scripts/10-storage-native.js sw.js version.json
git commit -m "fix(ui): lock iPhone viewport and match status bar (v81)" -m "Root cause: the document remained the scroll and scale surface, so iOS could zoom and rubber-band the whole page. Lock the document and move scrolling into main."
```

- [ ] **Step 4: Push and verify deployment**

Run `git push origin main`, then poll `https://eita115115.github.io/archery-master/version.json` until it returns `{ "v": 81 }`. Fetch `index.html`, `style.css`, `scripts/00-compat.js`, and `sw.js` with cache-busting query strings and confirm the viewport lock, status-bar metadata, gesture guard, app-shell CSS, and `matonote-v81` are live.
