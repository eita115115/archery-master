# Native Transition Plan

Archery Note should keep the PWA as the fastest feedback loop while preparing a real native release path.

## Current Decision

- Keep the GitHub Pages PWA for quick testing, coaching feedback, and emergency fallback.
- Treat Capacitor as the first native shell because it can package the existing HTML/CSS/JavaScript into iOS and Android apps.
- Move the app gradually toward a shared core: UI shell, data storage, and physics engine should be separable.

## Why Not Rewrite Everything First

The scoring UI, line-cutter behavior, equipment records, history analysis, and RK4 trajectory model already work. A full Swift/Kotlin rewrite now would slow practical testing and risk regressions. The safer path is to keep behavior stable while moving the foundations one layer at a time.

## Native-Ready Milestones

1. Capacitor web bundle
   - `npm run build:native-web` copies the current app into `dist/native`.
   - `capacitor.config.json` points Capacitor at that bundle.

2. Storage adapter
   - Current storage uses a small synchronous adapter over `localStorage`.
   - A native shell can expose `window.ArcheryNativeStorage` with compatible `getItem` / `setItem` methods as an interim bridge.
   - Native target should move long-term records to SQLite or a native file-backed store.
   - JSON export/import remains the compatibility bridge.

3. Physics core
   - Current engine is JavaScript RK4 with robust statistics.
   - `window.ArcheryPhysicsCore` exposes trajectory, wind, robust statistics, and grouping entry points.
   - If heavier simulation is needed, the same interface can later be backed by Web Worker, WebAssembly, Rust, Swift, or Kotlin.

4. Native capabilities
   - Safer device storage.
   - Share sheet for backup and scorecards.
   - Haptic feedback on arrow placement and line-cutter state.
   - Optional notifications for backup reminders.
   - Later: iCloud/Drive backup, camera-assisted form data, and account sync if needed.

Current Android shell work:

- `@capacitor/haptics` is wired to tab changes, arrow placement, nudge, end confirmation, and session completion.
- `@capacitor/share` + `@capacitor/filesystem` are used for JSON backup, CSV export, and scorecard SVG handoff when running inside a native shell.
- `@capacitor/status-bar` keeps the native chrome aligned with the app header.
- The web/PWA fallback remains file download and browser-native share when available.

5. Store readiness
   - Keep the app useful without network access.
   - Avoid a thin WebView impression by making backup, storage, sharing, and device polish feel app-native.
   - Keep PWA and native versions sharing the same data schema.

## Developer Commands

```powershell
npm install
npm run check:app
npm run check:ui
npm run build:native-web
```

After native platforms are intentionally added:

```powershell
npm run native:sync:android
npm run native:open:android
npm run native:build:android
npm run native:add:ios
```

The Android platform has been added under `android/`. Android Studio first-run setup still needs the Android SDK, Android SDK Platform 36, Android SDK Build-Tools, and Platform-Tools before local debug builds can run.

Android can be developed on Windows with Android Studio. iOS packaging and App Store submission still require a Mac or a cloud build service with Apple signing.
