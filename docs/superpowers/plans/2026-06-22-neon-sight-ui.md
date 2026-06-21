# Neon Sight UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Archery-master の既存機能と保存データを維持したまま、選択済みの Neon Sight モックに沿うスマホ優先UI、短い事実ベースの文章、統一PWAアイコンを実装して v76 を公開する。

**Architecture:** 既存 `html.ui-refresh` の上に最後に読み込む `ui/neon-sight.css` を追加し、機能ロジックを変更せずに視覚レイヤを差し替える。ホームのみ `renderHome` のテンプレートを照準中心の構造へ整理し、既存 `quickStartSession`、`openLaunchSheet`、履歴遷移を再利用する。画像資産は Image Gen で作る1024pxマスターから派生PNGを生成する。

**Tech Stack:** HTML5、CSS custom properties/animations、vanilla JavaScript、Node.js 検証スクリプト、PWA manifest/service worker、GitHub Pages。

## Global Constraints

- scoring、physics、storage、`db`、localStorage の形式を変更しない。
- 標準表示は `#05090B` のダークテーマ、ティールを主アクセント、琥珀色を照準点だけに使う。
- 常時動く粒子や強い点滅を使わず、`prefers-reduced-motion: reduce` で装飾モーションを停止する。
- ユーザー操作、実データ、安全警告以外の訴求文を削る。
- iOS用アイコンは文字なし、黒紺背景、ティールのサイト、琥珀色の中心点とする。
- v76では `APP_VER`、`version.json`、service worker cache、package metadata を一致させる。
- 既存の未追跡ファイルを編集・ステージ・コミットしない。

---

### Task 1: Neon Sight UI契約をテストで固定する

**Files:**
- Modify: `tools/check-ui-layer.js`
- Modify: `tools/check-ui.js`

**Interfaces:**
- Consumes: `index.html`、`app-scripts.json`、`ui/ui-manifest.json`、`scripts/48-home-view.js`、`manifest.json`
- Produces: Neon Sight のCSS、ホーム構造、短いコピー、PWA資産を検出する静的契約

- [ ] **Step 1: failing assertions を追加する**

`tools/check-ui-layer.js` に次の契約を追加する。

```js
const neon = fs.readFileSync(path.join(root, "ui", "neon-sight.css"), "utf8");
assert(neon.includes("--neon-teal") && neon.includes(".homeSightPanel") && neon.includes("prefers-reduced-motion"), "Neon Sight stylesheet incomplete");
assert(manifest.staticAssets.includes("ui/neon-sight.css"), "ui manifest missing Neon Sight stylesheet");
assert(app.staticAssets.includes("icon-512.png") && app.staticAssets.includes("apple-touch-icon.png"), "PWA icon assets missing");
```

`tools/check-ui.js` の `staticUiChecks()` に次を追加する。

```js
assert(html.includes("ui/neon-sight.css"), "Neon Sight stylesheet link missing");
assert(surface.includes("homeSightPanel") && surface.includes("homeReticle") && surface.includes("記録を始める"), "Neon Sight home missing");
assert(!surface.includes("今日のズレを、次の一射へ。"), "Promotional record copy remains");
assert(!surface.includes("分布と偏移を読む"), "Promotional history hero remains");
```

- [ ] **Step 2: REDを確認する**

Run: `npm run check:ui-layer`  
Expected: FAIL with `ENOENT ... ui/neon-sight.css` または `Neon Sight stylesheet incomplete`。

- [ ] **Step 3: 既存UIチェックが変更前には通ることを記録する**

Run: `npm run check:app`  
Expected: `App checks OK`。

---

### Task 2: Neon Sightテーマとホームを実装する

**Files:**
- Create: `ui/neon-sight.css`
- Modify: `index.html`
- Modify: `ui/ui-manifest.json`
- Modify: `app-scripts.json`
- Modify: `scripts/48-home-view.js`
- Modify: `scripts/51-record-setup.js`
- Modify: `scripts/53-page-heroes.js`
- Modify: `manifest.json`

**Interfaces:**
- Consumes: `quickStartSession(ctx)`, `openLaunchSheet(ctx)`, `showView(name)`, `recordFastActionsHtml(...)`
- Produces: `.homeSightPanel`, `.homeReticle`, `.homeSightStart`, `.homeRecentStatus` と全画面共通Neon Sightトークン

- [ ] **Step 1: CSSロード契約を実装する**

`index.html` で `ui/ds-archery-note.css` の後に以下を追加し、同じパスを `ui/ui-manifest.json` と `app-scripts.json` の static assets に追加する。

```html
<link rel="stylesheet" href="ui/neon-sight.css">
```

- [ ] **Step 2: ホーム構造を置き換える**

`renderHome` が以下の構造を作り、既存イベントを同じ関数へ接続する。

```js
m.innerHTML=`
  <section class="homeSightPanel" aria-labelledby="homeSightTitle">
    <p class="homeSightEyebrow">TODAY</p>
    <h2 id="homeSightTitle">今日の練習</h2>
    <button class="homeSightConditions" id="openConditions" type="button">
      <span>${esc(condPreview)}</span><span aria-hidden="true">›</span>
    </button>
    <button class="homeSightStart" id="quickStart" type="button">
      <span class="homeReticle" aria-hidden="true"><i></i><b></b></span>
      <span class="homeSightStartLabel">記録を始める</span>
    </button>
  </section>
  ${homeFeedHtml()}
  <details class="an-advancedStats"><summary>週間サマリー</summary>${dashCompactHtml()}</details>
  ${recordFastActionsHtml(last,defDist,defFace,setup)}`;
```

主要CTAは `quickStartSession(ctx)`、条件行は `openLaunchSheet(ctx)`、履歴は `showView("history")` へ接続する。

- [ ] **Step 3: Neon Sight CSSを実装する**

`ui/neon-sight.css` の先頭トークンと画面骨格を次で固定する。

```css
html.ui-refresh{
  color-scheme:dark;
  --neon-bg:#05090b;
  --neon-panel:#091116;
  --neon-teal:#78f3e2;
  --neon-teal-strong:#38d9c5;
  --neon-amber:#ffb84d;
  --neon-text:#f4fbfa;
  --neon-muted:#829a9b;
  --ui-bg:var(--neon-bg);
  --ui-surface:var(--neon-panel);
  --ui-surface-elevated:#071014;
  --ui-label:var(--neon-text);
  --ui-label-secondary:var(--neon-muted);
  --ui-accent:var(--neon-teal);
  --ui-accent-bright:var(--neon-teal-strong);
  --ui-accent-on:#03100f;
  --ui-separator:rgba(120,243,226,.16);
}
html.ui-refresh body{background:var(--neon-bg);}
html.ui-refresh .homeSightPanel{min-height:520px;display:flex;flex-direction:column;align-items:stretch;}
html.ui-refresh .homeSightStart{position:relative;min-height:330px;border:0;background:transparent;color:var(--neon-teal);}
```

同じファイルで `header.app`、`nav.tabs`、`.card`、`.inp`、`.sheet`、`.an-analysisHero`、`.homeSessionCard`、`.chartCard` を上記トークンへ割り当てる。`@media (min-width:760px)` では `main` を `max-width:760px;margin-inline:auto` とし、`@media (max-width:390px)` ではホーム条件の文字を13px、レティクルを `min(76vw,300px)` に制限する。

- [ ] **Step 4: 操作目的のモーションを追加する**

```css
@keyframes neonSightLock{from{opacity:0;transform:scale(1.12) rotate(4deg)}to{opacity:1;transform:scale(1) rotate(0)}}
@keyframes neonEdgeSweep{0%{transform:translateX(-120%)}100%{transform:translateX(220%)}}
.homeReticle{animation:neonSightLock .55s cubic-bezier(.22,1,.36,1) both;}
@media (prefers-reduced-motion:reduce){.homeReticle,.homeSightStart::after{animation:none!important;}}
```

- [ ] **Step 5: 文章を事実ベースへ短縮する**

`recordIntroHtml` の見出しを `記録方法を選ぶ`、本文を `条件と入力方法を選んで記録を始めます。` にする。`pageHeroHtml` の履歴、サイト、用具の説明用ヒーロー文章を削り、見出しと実データの指標だけにする。meta/OGP/manifest description は `アーチェリーの得点、着弾、用具を端末に記録する練習ノート。` に統一する。

- [ ] **Step 6: GREENを確認する**

Run: `npm run check:ui-layer`  
Expected: `UI layer checks OK`。

Run: `npm run check:app`  
Expected: `App checks OK`。

---

### Task 3: Neon Sight PWAアイコンを作る

**Files:**
- Create: `icon-1024.png`
- Create: `icon-512.png`
- Modify: `apple-touch-icon.png`
- Modify: `make-icon.ps1`
- Modify: `index.html`
- Modify: `manifest.json`
- Modify: `app-scripts.json`

**Interfaces:**
- Consumes: 選択済み Neon Sight UIモック
- Produces: 文字なしの照準アイコンと 512px / 180px 派生画像

- [ ] **Step 1: Image Genで1024pxマスターを生成する**

Prompt:

```text
Use case: logo-brand
Asset type: square iOS/PWA app icon master
Primary request: Archery-master app icon matching the selected Neon Sight UI; a single elegant bow-sight reticle
Style/medium: premium minimal app icon, crisp high-resolution raster
Composition: centered circular teal sight ring, four short cardinal ticks, tiny warm amber center point, generous safe area
Color palette: near-black navy background, luminous teal, tiny amber accent
Constraints: no text, no letters, no arrows, no photo, no device frame, no watermark, no tiny detail, must remain clear at 60px
```

- [ ] **Step 2: マスターを配置し派生画像を作る**

生成物を `icon-1024.png` へコピーし、`make-icon.ps1` を「描画」ではなく高品質リサイズ専用に変更する。

```powershell
Add-Type -AssemblyName System.Drawing
function Resize-Png($Source,$Target,$Size){
  $src=[System.Drawing.Image]::FromFile($Source)
  $bmp=New-Object System.Drawing.Bitmap($Size,$Size)
  $g=[System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($src,0,0,$Size,$Size)
  $bmp.Save($Target,[System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose(); $src.Dispose()
}
Resize-Png "$PSScriptRoot\icon-1024.png" "$PSScriptRoot\icon-512.png" 512
Resize-Png "$PSScriptRoot\icon-1024.png" "$PSScriptRoot\apple-touch-icon.png" 180
```

- [ ] **Step 3: PWA参照を更新する**

favicon、ヘッダー、起動画面は `icon-512.png` を使い、manifest icons は `icon-512.png` (`any maskable`) と `apple-touch-icon.png` (`any`) を宣言する。theme/background color は `#05090B` にする。

- [ ] **Step 4: 画像寸法を確認する**

Run: PowerShellでPNGヘッダーを読み、`icon-1024.png=1024x1024`、`icon-512.png=512x512`、`apple-touch-icon.png=180x180` を確認する。  
Expected: 3ファイルとも正方形で指定寸法。

---

### Task 4: ブラウザで実画面を合わせる

**Files:**
- Modify: `ui/neon-sight.css`
- Create: `design-qa.md`

**Interfaces:**
- Consumes: 選択モック、ローカル `http://127.0.0.1:8741/`
- Produces: 390x844/1280x800 の検証済みUIと `final result: passed` のQA報告

- [ ] **Step 1: ローカルサーバーを起動する**

Run: `powershell -ExecutionPolicy Bypass -File serve.ps1`  
Expected: `http://127.0.0.1:8741/` が表示可能。

- [ ] **Step 2: 390x844の空状態を撮影する**

Browser skillでホームを開き、ヘッダー、条件、レティクルCTA、空状態、5タブがモックと同じ順序で見えることを確認する。

- [ ] **Step 3: 主要操作を確認する**

条件変更シート、記録開始、分析、履歴、統計、設定を順に開き、操作不能、オーバーフロー、文字切れがないことを確認する。

- [ ] **Step 4: 1280x800とreduced motionを確認する**

デスクトップ幅で中央カラムが過度に伸びないこと、reduced motionで装飾アニメーションが停止することを確認する。

- [ ] **Step 5: Design QAを実施する**

選択モックとローカルスクリーンショットを同一比較入力で確認し、fonts、spacing、colors、image quality、copy、icons、states、accessibility を `design-qa.md` に記録する。P0/P1/P2を修正し、最後を次にする。

```text
final result: passed
```

---

### Task 5: v76を検証してGitHub Pagesへ公開する

**Files:**
- Modify: `scripts/10-storage-native.js`
- Modify: `version.json`
- Modify: `sw.js`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `tools/bump-version.js`
- Produces: v76 のキャッシュ・更新バナー・package metadata と公開サイト

- [ ] **Step 1: バージョンを揃える**

Run: `npm run version:bump -- 76`  
Expected: `Archery Note version set to 76`。

- [ ] **Step 2: 全検証を実行する**

Run: `npm run check:app`  
Expected: `App checks OK`。

Run: `npm run check:ui-layer`  
Expected: `UI layer checks OK`。

Run: `npm run check:ui`  
Expected: `UI smoke checks OK` と 390/360/1280 のPNG出力。

- [ ] **Step 3: 対象差分だけを確認してコミットする**

`git diff --check` と `git status --short` を確認し、本計画のファイルだけを明示的に `git add -- <paths>` する。commit message は `ui: apply Neon Sight redesign (v76)` とする。

- [ ] **Step 4: mainをpushする**

Run: `git push origin main`  
Expected: `main -> main`。

- [ ] **Step 5: GitHub Pages反映を確認する**

`https://eita115115.github.io/archery-master/version.json?ts=<timestamp>` が `{ "v": 76 }` を返し、公開ホームでNeon Sightの構造と新アイコン参照が確認できるまでポーリングする。
