# 的ノート 🏹

App Store版 Archery Note の「シンプルで毎回開きたくなる」体験を参考にしつつ、あなたの技術（RK4物理・サイト判断・用具台帳・写真AI採点・射形コーチ連携）を統合した最強アーチェリー練習ノート。

## 3タブで迷わない

| タブ | 役割 |
|------|------|
| **ホーム** | ワンタップ開始・前回と同じ・最近の練習 |
| **記録** | 的タップ / 写真AI / エンド確定 |
| **履歴** | 練習一覧・分析・得点分布 |

サイト調整・用具・射形コーチは **⚙設定** から（タブを増やさない）。

## 使い方

1. ホームで距離を選び「今日の記録を始める」
2. 記録タブで的をタップ（または 📷写真で一括取り込み）
3. エンド確定 → セッション終了で判断材料を確認

## 検証（提出前に必ず実行）

```powershell
cd C:\Users\eita2\Projects\archery-master
node tools/check-app.js
node tools/check-vision.js
node tools/check-integration.js
```

すべて OK になることを確認してから試してください。

## ローカル確認

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File serve.ps1
# → http://localhost:8741/
```

## あなたの技術が入っている所

- **RK4-3D 弾道** + 個人物理校正 + 風補正
- **判断支援** — 動かす / 保留 / 射形優先
- **用具カタログ** + スパイン候補 + サイト台帳
- **ライブ／動画AI採点** — `scripts/35-photo-vision.js`（カメラリアルタイム＋動画フレーム解析・オンデバイス・無料）
- **射形コーチ** — 設定から `archery-form-pwa` へ

## 関連プロジェクト

- `../archery-converge` — 軽量判断補助（全金演出など）
- `../archery-form` — 射形リアルタイム分析
- `../archery-note` — 旧統合ベース（Capacitor準備済）