# TJA譜面エディタ — 開発ガイド（Claude Code向け）

太鼓さん次郎系の `.tja` 譜面をブラウザ上で作成・編集できるWebアプリ。
**このファイルは、クラウド/別端末でセッションを始めるClaudeに文脈を引き継ぐためのもの。**
詳細な機能仕様・対応TJAコマンドは [README.md](README.md) が正。ここには非自明な方針と設計を書く。

## このプロジェクトの目的と制約

- **誰でもWeb上でtjaを作れるサイトとして公開し、広告収入を得る**のがゴール。
- そのため:
  1. 公式ゲームの画像・音声・商標ロゴは一切使わない（「ドン」「カッ」等の汎用表現のみ）。
  2. 音源はローカル完結。ユーザーの音源をサーバーに送らない（Web Audioで端末内処理）。
  3. iOSの「ホーム画面に追加」でアプリ風に使えるようPWA対応済み（本番HTTPS配信が前提）。
- UIは日本語。ユーザーは太鼓の達人の譜面文化（譜面Wiki画像・太鼓さん次郎の操作感）を基準に、
  細かい見た目・操作感のフィードバックをくれる。

## コマンド

```bash
npm install       # 依存インストール（lockファイルあり）
npm run dev        # 開発サーバー（Vite, http://localhost:5173）
npm run build      # tsc --noEmit + vite build（dist/ に出力）
node scripts/gen-icons.mjs   # PWAアイコン再生成（依存なしのPNGエンコーダ内蔵）
```

変更後は必ず `npm run build`（型チェック込み）が通ることを確認する。
**見た目・操作に関わる変更は、実際にブラウザで動かして検証してから完了報告すること**（ユーザーが最も重視する）。

## アーキテクチャ

```
src/
  types.ts / project.ts    データモデル（Project / Metadata / Measure / NoteValue）・正規化
  noteInfo.ts              ノーツの表示情報
  hooks/
    usePlayer.ts           再生エンジン。★重要: 再生の度に音源+全ノーツ音を同一AudioContext
                           クロックへサンプル精度で一括スケジュール（=理論ミックス）。rAF/タイマー
                           の揺れが音に影響しない設計。表示更新のみrAF。
    useHistory.ts          Undo/Redo
    useIsMobile.ts         端末推定（モード選択の「おすすめ」表示にのみ使用）
  utils/
    timing.ts              時刻計算。OFFSET同期式: audioTime = chartTime - (OFFSET + 環境補正)
    fraction.ts / noteOps.ts  小節内位置を既約分数で扱い、TJA分割を配置から自動で最小化する中核
    rolls.ts               連打/風船の区間計算（帯表示・自動連打音・飛翔演出に共用）
    tja.ts                 TJA生成/パース（複数コース・GOGO・SCROLL対応）
    validation.ts / stats.ts
  components/
    Lane.tsx               1小節の譜面レーン描画（編集・全体表示で共用。線上配置＋重なり）
    EditView / OverviewView / PlayView   3タブ（編集 / 全体 / オート再生）
    MobilePad.tsx          スマホ版の下部入力パッド
    ModeSelect.tsx         起動時のPC版/スマホ版選択画面（.ad-slot に広告を差す）
    Transport.tsx          フローティング再生バー / Palette / MetadataForm / OffsetPanel ほか
```

## 譲れない設計・こだわり（過去のフィードバックの蓄積）

- **入力単位とTJA分割の分離**: ユーザーはN分音符（16/24等）を選んで入力。TJAの分割数は配置済み
  ノーツから既約分数で自動決定（16分と24分混在→48分割、消せば16に戻る）。手動で分割管理させない。
- **ノーツは線の上に中心が乗る**。先頭ノーツは小節枠から左にはみ出す。
- **ノーツの重なり**: 「16分で少し重なり、12分でギリギリ重ならない」太鼓の達人風。1拍 = ノーツ直径×76/23 px。
  この見た目の基準がBPMごとのスクロール速度を理論的に決める（PlayView）。
- **端末依存の補正値**（再生環境補正・プレイ判定・キー設定・UIモード）は**tjaに出力せずlocalStorageに保存**。
- **UIモードは自動判定せず起動時にユーザーが選ぶ**（PC版/スマホ版）。ヘッダでいつでも切替。
- 風船の自動打数は開始〜終了の区間に均等配分し、最後の1打が終了位置に一致する。
- 全体表示は小節を隙間なく連結し、小節をまたいでも「先のノーツが上」になるようz-indexを管理。

## 未対応（今後の拡張余地）

譜面分岐（#BRANCHSTART）、#DELAY、複数コースの同時編集・一括書き出し、ダブルプレイ（#START P1/P2）。
`Measure` 型にフィールドを足していく前提の構造にしてある。
