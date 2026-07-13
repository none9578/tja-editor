# TJA譜面エディタ — 開発ガイド（Claude Code向け）

太鼓さん次郎系の `.tja` 譜面をブラウザ上で作成・編集できるWebアプリ（Vite + React + TypeScript）。
このファイルは新しいセッション（クラウド/別端末）に文脈を引き継ぐためのもの。
機能仕様・対応TJAコマンドの一覧は [README.md](README.md) が正。ここには**非自明な方針・設計・過去にハマった罠**を書く。

## プロジェクトの目的と制約

- **誰でもWeb上でtjaを作れるサイトとして公開し、広告収入を得る**のがゴール。
- そのための制約:
  1. 公式ゲームの画像・音声・商標ロゴは一切使わない（「ドン」「カッ」等の汎用表現のみ）。
  2. 音源はローカル完結。ユーザーの音源をサーバーへ送らない。
  3. PWA対応済み（iOS「ホーム画面に追加」前提。本番はHTTPS配信必須）。
- UIは日本語。ユーザー（開発依頼主）は太鼓の達人の譜面文化（譜面Wiki画像・太鼓さん次郎の操作感）を
  基準に、見た目・操作感へ細かいフィードバックをくれる。**見た目に関わる変更は必ず実際に動かして
  検証してから完了報告すること**（最重要の期待値）。

## コマンド

```bash
npm install                  # 依存インストール（package-lock.json あり）
npm run dev                  # 開発サーバー http://localhost:5173
npm run build                # tsc --noEmit + vite build → dist/
node scripts/gen-icons.mjs   # PWAアイコン再生成（依存ゼロのPNGエンコーダ内蔵）
```

- 変更後は `npm run build` が通ることを必ず確認（型チェック込み。noUnusedLocals有効）。
- リリース時に `public/sw.js` の `CACHE` バージョンを上げると旧キャッシュが破棄される。

## アーキテクチャ

```
src/
  types.ts / project.ts      データモデルと正規化（normalizeProject が旧保存データを現行形に揃える）
  hooks/
    usePlayer.ts             ★再生エンジン。音源+全ノーツ音を同一AudioContextクロックに
                             サンプル精度で一括スケジュール（=理論ミックス）。rAFは表示更新のみ。
    useHistory.ts            Undo/Redo（commit/reset の使い分けに注意: インポートやロードは reset）
    useIsMobile.ts           端末推定。※UIモード決定には使わない（モード選択画面の「おすすめ」表示のみ）
  utils/
    timing.ts                時刻計算。同期式: audioTime = chartTime - (OFFSET + 再生環境補正)
    fraction.ts / noteOps.ts ★中核。小節内位置を既約分数で扱い、TJA分割(quantize)を配置から自動で最小化
    rolls.ts                 連打/風船の区間計算（帯表示・自動連打音・オート再生の飛翔演出で共用）
    tja.ts                   TJA生成/パース（複数コース・#GOGOSTART/#GOGOEND・#SCROLL対応）
    validation.ts / stats.ts
  components/
    Lane.tsx                 1小節のレーン描画（編集・全体表示で共用）
    EditView.tsx             編集タブ（ドラッグ範囲選択・小節ヘッダ/フッタ）
    OverviewView.tsx         全体表示タブ（譜面Wiki画像風・小節連結）
    PlayView.tsx             オート再生タブ（canvas。判定・手動プレイ機能は意図的に廃止済み）
    MobilePad.tsx            スマホ版の下部入力パッド（テンポ入力: 置いたら次の線へ進む）
    ModeSelect.tsx           起動時のPC版/スマホ版選択画面。広告は .ad-slot に差し込む
    Transport.tsx            画面下部固定のフローティング再生バー
```

## 譲れない設計（ユーザーのフィードバックの蓄積。壊さないこと）

- **入力単位とTJA分割の分離**: ユーザーはN分音符（16/24等）を選んで入力するだけ。TJAの分割数
  (quantize = notes.length) は配置済みノーツから既約分数で自動決定（16分+24分混在→48、消せば16へ縮小）。
  **quantizeを手動で設定するUI・コードを復活させない。** ノーツ操作は必ず noteOps.ts 経由で行う。
- **ノーツは線の上に中心が乗る**。小節先頭のノーツは枠から左へはみ出す（ぶった切らない）。
- **重なり基準**: 「16分で少し重なり、12分でギリギリ重ならない」。1拍 = ノーツ直径 × 76/23 px。
  この比率がオート再生のBPM別スクロール速度も理論的に決める（PlayView の ppb）。
- **UIモード（PC版/スマホ版）は自動判定せず起動時にユーザーが選ぶ**。切替はヘッダ。
  モバイルUIのCSSは `.mode-mobile` クラス配下（メディアクエリで自動切替しない）。
- **端末依存の値はtjaに出力しない**: 再生環境補正・UIモード・キー設定などは localStorage のみ。
- 風船の自動打数は開始〜終了に均等配分し、**最後の1打が終了位置に一致**する。
- BALLOON配列は風船ノーツ(7)の増減に自動で長さ同期（値は保持、不足は5で補完）。
- 全体表示は小節を隙間なく連結し、小節をまたいでも「先（左）のノーツが上」（zBaseで制御）。
- タブ切替時は再生を止める。停止(⏹)は「再生開始位置」に戻る（0ではない）。

## 過去にハマった罠（再発させない）

- **CSSの `.mode-mobile` ブロックは styles.css の末尾に置く**。同一詳細度の基本ルールより後に
  ないと上書きされる（実際に一度バグった）。
- `.lane` は `isolation: isolate` + `z-index: 0` でノーツのz-indexを閉じ込めている。外すと
  スクロール時にノーツが固定ヘッダを突き抜ける。全体表示だけは連結重なりのため例外的に解除している。
- `.lane` は `box-sizing: content-box`（枠線と線位置の計算をズラさないため）。
- **AudioContextはStrictModeの二重マウントでcloseされる**。ensureCtx は state==='closed' なら
  作り直す実装になっている。この分岐を消さない。
- iOSは入力フォントが16px未満だとフォーカス時に自動ズームする（対策CSSあり）。
- localStorageキー: `tja-editor:project:v1` / `theme` / `calibration` / `uimode` / `playkeys:v1`。

## 検証のしかた

1. `npm run dev` を起動しブラウザで開く（PC版/スマホ版はモード選択画面か、ヘッダで切替）。
2. 編集: ノーツ配置→入力単位切替→TJA分割の自動増減、ドラッグ範囲削除、Undo。
3. 再生: 再生バーの追従、ノーツ音と曲の同期、連打・風船の自動音。
4. エクスポート→インポートの往復一致（実TJAファイルがあれば警告ゼロで読めること）。
5. `npm run build` 成功。

## 未対応（今後の拡張余地）

譜面分岐（#BRANCHSTART）、#DELAY、複数コースの同時編集・一括書き出し、ダブルプレイ（#START P1/P2）。
`Measure` 型（types.ts）にフィールドを足していく前提の構造。
