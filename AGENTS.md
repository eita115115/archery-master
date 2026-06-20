# Archery Note Agent Guide

This repository is the real Archery Note app. The Claude/Codex session folder
under `C:\Users\eita2\.claude\sessions` is only conversation/work history and is
not the application source. Do not move session files into this repo.

## Project Shape

- Repo root: `C:\Users\eita2\Projects\archery-note`
- Main app surface: web/PWA first, in `index.html`
- Native shell: Capacitor/Android exists, but use it only when requested
- Preview helper: `.claude/launch.json` serves the repo on port `8741`
- Deployed app: GitHub Pages

## Operating Rules

- Check `git status --short` before editing.
- Inspect current files before relying on remembered line numbers or old
  version numbers.
- Keep changes scoped to the requested behavior. Avoid unrelated refactors.
- Preserve user practice data. Data-loss warnings belong near backup, import,
  export, and browser-storage reset actions.
- Keep the primary phone flow simple. Move advanced controls into settings,
  collapsible areas, or secondary screens.
- Prefer small pure functions, explicit units, and focused regression checks for
  scoring, physics, and sight-adjustment logic.

## Scoring And Physics

- The visible arrow circle and the score result must agree.
- For line-cutter behavior, if the displayed arrow circle touches the higher
  scoring ring at all, the higher score should apply.
- Before changing scoring, inspect the current implementations of
  `arrowMarkRadius`, `lineCutRadius`, `scoreAt`, `hitFromGlobal`, and
  `markCircle`.
- Re-score paths for drag, nudge, and initial placement must use the same radius
  source as the displayed arrow circle.

## Commands

- `npm run check:app`
- `npm run check:ui`
- `npm run build:native-web`

Run the smallest useful validation for the change. For UI or interaction work,
use the local preview and verify mobile-sized behavior when practical.

## Release And Versioning

- When a deployed change should trigger the in-app update banner, bump both
  `APP_VER` in `index.html` and `v` in `version.json`.
- The usual publish loop is: edit, validate, commit, push, then poll
  `version.json` or the deployed site until the new version is live.

## Local Helper LLM

Codex stays the primary agent. If a local Ollama helper is useful, prefer
`qwen2.5-coder:3b` and ask only for narrow checks such as unit mismatches,
boundary cases, or test ideas. Do not let the helper make final design,
scoring, storage, or release decisions.

## Useful Codex Skills

- Use `$archery-note` for app-specific implementation, scoring, release, and
  Japanese-copy work.
- Use `$frontend-design` for UI polish and responsive mobile layouts.
- Use `$diagnose`, `$tdd`, `$prototype`, `$zoom-out`, or
  `$improve-codebase-architecture` when the task calls for that workflow.
