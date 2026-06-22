"use strict";
/* 的ノート: record input modes (grid / vision / video / OCR) */

let scanSession = null;

function scoreGridReadOnlyHtml(s) {
  const per = s.perEnd || 6;
  return (s.ends || []).map((end, i) => {
    const cells = Array.from({ length: per }, (_, ci) => {
      const a = end[ci];
      if (!a) return `<div class="gridCell empty">·</div>`;
      const label = scoreLabel(a);
      const z = gridZoneStyle(label);
      return `<div class="gridCell" style="background:${z.bg};color:${z.fg}">${label}</div>`;
    }).join("");
    const sum = end.reduce((a, x) => a + (x.s || 0), 0);
    return `<div class="gridRow"><div class="gridRowHead">E${i + 1}</div><div class="gridCells">${cells}</div><div class="gridRowSum">${sum}</div></div>`;
  }).join("") || `<div class="empty">エンドがありません</div>`;
}

function scoreGridHtml(s) {
  const per = s.perEnd || 6;
  const rows = [...s.ends.map((end, i) => ({ end, i, cur: false })), { end: s.cur || [], i: s.ends.length, cur: true }];
  return rows.map((row) => {
    const cells = Array.from({ length: per }, (_, ci) => {
      const a = row.end[ci];
      const sel = row.cur && ui.gridCell === ci;
      if (!a) return `<div class="gridCell empty ${sel ? "sel" : ""}" data-end="${row.i}" data-i="${ci}">·</div>`;
      const label = scoreLabel(a);
      const z = gridZoneStyle(label);
      return `<div class="gridCell ${sel ? "sel" : ""}" data-end="${row.i}" data-i="${ci}" style="background:${z.bg};color:${z.fg}">${label}</div>`;
    }).join("");
    const sum = row.end.reduce((a, x) => a + (x.s || 0), 0);
    return `<div class="gridRow"><div class="gridRowHead">E${row.i + 1}</div><div class="gridCells">${cells}</div><div class="gridRowSum">${sum || "—"}</div></div>`;
  }).join("");
}

function bindGridInput(s) {
  const keys = $("#gridKeys");
  if (keys) keys.querySelectorAll("button").forEach((btn) => btn.onclick = () => {
    if (typeof flashScoreKey === "function") flashScoreKey(btn);
    const value = btn.dataset.v;
    if (ui.gridCell >= 0 && s.cur[ui.gridCell]) {
      const edited=arrowFromGridValue(value);
      Object.assign(s.cur[ui.gridCell], edited);
      if(typeof onArrowScored==="function") onArrowScored(s.cur[ui.gridCell],ui.gridCell);
      else nativePulse("light");
      ui.gridCell = -1;
      save(); refreshActive();
      return;
    }
    if (!guardEndCapacity(s)) return;
    const arrow = arrowFromGridValue(value);
    if (typeof isJapanIndoorRound === "function" && isJapanIndoorRound(s)) arrow.spotId = s.curSpotId || s.laneSpot || "A";
    if (s.faceType === "quad") arrow.spotId = s.curSpotId || s.laneSpot || "A";
    if (typeof isTeamSetRound === "function" && isTeamSetRound(s) && typeof tagTeamArrow === "function") tagTeamArrow(arrow, s.cur.length);
    s.cur.push(arrow);
    ui.freshArrow = s.cur.length - 1;
    ui.gridCell = -1;
    if(typeof onArrowScored==="function") onArrowScored(arrow,ui.freshArrow);
    else nativePulse("light");
    save(); refreshActive();
  });
  const grid = $("#scoreGrid");
  if (grid) grid.querySelectorAll(".gridCell").forEach((cell) => cell.onclick = () => {
    const endIdx = +cell.dataset.end;
    const idx = +cell.dataset.i;
    if (endIdx !== s.ends.length) return;
    if (!s.cur[idx] && cell.classList.contains("empty")) return;
    ui.gridCell = idx; ui.selArrow = -1; refreshActive();
  });
  const memo = $("#gridMemo");
  if (memo) memo.oninput = (e) => { s.note = e.target.value.trim(); save("grid-memo"); };
}

function visionHitsToArrows(result, s) {
  if (!result || !result.arrows || !result.target) return [];
  const tcx = result.target.x / 100;
  const tcy = result.target.y / 100;
  const tr = Math.max(0.08, result.target.radius / 100);
  const faceRadiusCm = s.faceD / 2;
  const shaft = lineCutRadius(s.faceD, s.faceType);
  const room = roomInCurrentEnd(s);
  return result.arrows.slice(0, room).map((ar) => {
    const nx = (ar.x / 100 - tcx) / tr;
    const ny = (tcy - ar.y / 100) / tr;
    const x = nx * faceRadiusCm;
    const y = ny * faceRadiusCm;
    const hit = scoreAt(x, y, s.faceD, s.faceType, shaft, scoreOptsFromSession(s));
    const arrow = Object.assign({ x, y }, hit);
    if (typeof isJapanIndoorRound === "function" && isJapanIndoorRound(s)) arrow.spotId = s.curSpotId || s.laneSpot || "A";
    return arrow;
  });
}

function stopScanSession() {
  if (scanSession) {
    if (scanSession.scanner) scanSession.scanner.stop();
    if (scanSession.stream) scanSession.stream.getTracks().forEach((track) => track.stop());
    scanSession = null;
  }
  ui.scanBound = false;
  ui.ocrBound = false;
}

function stopAllInputModes() {
  stopScanSession();
  if (typeof stopFormCoach === "function") stopFormCoach();
  runCleanups();
}

function importVisionHits(result, s) {
  const hits = visionHitsToArrows(result, s);
  return importHitsToSession(s, hits, { confidence: result.confidence });
}

async function bindLiveScanMode(s) {
  if (!window.ArcherVision || ui.scanBound) return;
  ui.scanBound = true;
  const video = $("#scanVideo");
  const panel = $("#scanPanel");
  if (!video || !panel) return;
  panel.classList.remove("off");
  video.hidden = false;
  setPanelStatus("#scanStatus", "カメラを起動中…");
  renderActionBar("#scanActions", [{ id: "scanStopBtn", kind: "ghost", label: "カメラ停止", onclick: () => { stopAllInputModes(); ui.inputMode = "tap"; renderActive(); } }]);
  registerCleanup(stopScanSession);
  try {
    const cam = cameraCapabilityProfile();
    if (!cam.available) throw new Error(cam.label);
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    const scanner = window.ArcherVision.createLiveScanner({
      video,
      faceCm: s.faceD,
      intervalMs: 900,
      onResult(result) {
        ui.scanResult = result;
        const count = result.arrows.length;
        setPanelStatus("#scanStatus", count ? `${count}本を検出（信頼度 ${result.confidence}%）` : "的を映してください…");
        renderActionBar("#scanActions", [
          { id: "scanImportBtn", kind: "sec", label: `${count}本を取り込む`, onclick: () => {
            if (!guardEndCapacity(s)) return;
            if (!ui.scanResult) { toast("まだ検出結果がありません"); return; }
            importVisionHits(ui.scanResult, s);
          }},
          { id: "scanStopBtn", kind: "ghost", label: "カメラ停止", onclick: () => { stopAllInputModes(); ui.inputMode = "tap"; renderActive(); } },
        ]);
      },
      onError(err) {
        if (err && (err.code === "no-frame" || err.code === "stabilizing")) {
          if (err.code === "stabilizing") setPanelStatus("#scanStatus", "検出を安定化中… 的を固定してください");
          return;
        }
        setPanelStatus("#scanStatus", err && err.message ? err.message : "検出を続けています…");
      },
    });
    scanSession = { stream, scanner, video };
    scanner.start();
    setPanelStatus("#scanStatus", "的をカメラに映してください…");
  } catch (err) {
    stopScanSession();
    setPanelStatus("#scanStatus", err && err.message ? err.message : "カメラを起動できませんでした");
    toast(err && err.message ? err.message : "カメラを起動できませんでした");
  }
}

function bindOcrScanMode(s) {
  if (!window.ArcherOCR || ui.ocrBound) return;
  ui.ocrBound = true;
  const panel = $("#ocrPanel");
  const input = $("#ocrCapture");
  if (!panel || !input) return;
  panel.classList.add("on");
  const openPicker = () => {
    if (!guardEndCapacity(s)) return;
    input.value = ""; input.click();
  };
  renderActionBar("#ocrActions", [
    { id: "ocrPickBtn", kind: "sec", label: "スコア表を撮影", onclick: openPicker },
    { id: "ocrImportBtn", kind: "ghost", label: "結果を取り込む", onclick: () => {
      if (!ui.ocrResult) { toast("先に OCR を実行してください"); return; }
      const hits = ocrEndsToArrows(ui.ocrResult.ends, s);
      importHitsToSession(s, hits, { confidence: ui.ocrResult.confidence });
    }},
  ]);
  input.onchange = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const preview = $("#ocrPreview");
    const status = $("#ocrStatus");
    if (preview) { preview.hidden = false; preview.src = URL.createObjectURL(file); }
    setPanelStatus("#ocrStatus", "OCR 解析中… 0%");
    toast("スコア表を読み取り中…");
    try {
      const result = await window.ArcherOCR.recognizeScoreSheetFile(file, {
        onProgress(pct) { setPanelStatus("#ocrStatus", `OCR 解析中… ${pct}%`); },
      });
      ui.ocrResult = result;
      const count = result.ends.flat().length;
      const method = result.method ? ` / ${result.method}` : "";
      setPanelStatus("#ocrStatus", `${count}本を検出（信頼度 ${result.confidence}%${method}）`);
      renderActionBar("#ocrActions", [
        { id: "ocrPickBtn", kind: "sec", label: "別の写真", onclick: openPicker },
        { id: "ocrImportBtn", kind: "sec", label: `${count}本を取り込む`, onclick: () => {
          importHitsToSession(s, ocrEndsToArrows(result.ends, s), { confidence: result.confidence });
        }},
      ]);
    } catch (err) {
      setPanelStatus("#ocrStatus", err && err.message ? err.message : "OCR に失敗しました");
      toast(err && err.message ? err.message : "OCR に失敗しました");
    }
  };
}

function bindVideoScanMode(s) {
  if (!window.ArcherVision || ui.scanBound) return;
  ui.scanBound = true;
  const panel = $("#scanPanel");
  const input = $("#videoCapture");
  if (!panel || !input) return;
  panel.classList.remove("off");
  setPanelStatus("#scanStatus", "練習動画を選ぶとフレームを自動解析します");
  const openPicker = () => {
    if (!guardEndCapacity(s)) return;
    input.value = ""; input.click();
  };
  renderActionBar("#scanActions", [
    { id: "videoPickBtn", kind: "sec", label: "動画を選択", onclick: openPicker },
    { id: "videoImportBtn", kind: "ghost", label: "結果を取り込む", onclick: () => {
      if (!ui.scanResult) { toast("先に動画を解析してください"); return; }
      importVisionHits(ui.scanResult, s);
    }},
  ]);
  input.onchange = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    ui.scanResult = null;
    setPanelStatus("#scanStatus", "動画を解析中… 0%");
    toast("動画フレームを解析中…");
    try {
      const result = await window.ArcherVision.scanVideoFile(file, s.faceD, {
        onProgress(pct) { setPanelStatus("#scanStatus", `動画を解析中… ${pct}%`); },
      });
      ui.scanResult = result;
      setPanelStatus("#scanStatus", `${result.arrows.length}本を検出（信頼度 ${result.confidence}%）`);
      renderActionBar("#scanActions", [
        { id: "videoPickBtn", kind: "sec", label: "別の動画", onclick: openPicker },
        { id: "videoImportBtn", kind: "sec", label: `${result.arrows.length}本を取り込む`, onclick: () => importVisionHits(ui.scanResult, s) },
      ]);
    } catch (err) {
      setPanelStatus("#scanStatus", err && err.message ? err.message : "動画の解析に失敗しました");
      toast(err && err.message ? err.message : "動画の解析に失敗しました");
    }
  };
}

function bindActiveInputMode(s) {
  if (ui.inputMode === "live") bindLiveScanMode(s);
  else if (ui.inputMode === "video") bindVideoScanMode(s);
  else if (ui.inputMode === "ocr") bindOcrScanMode(s);
  if (ui.inputMode === "grid" && !(s && s.pairMode)) bindGridInput(s);
}
