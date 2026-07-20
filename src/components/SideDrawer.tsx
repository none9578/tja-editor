import { useEffect } from 'react';

/**
 * 画面左からスライドして出るメニュー。全体設定とナビをまとめる場所。
 * ヘッダを常時ボタンで埋めないためのもので、PC版・スマホ版どちらでも使う。
 */
interface Props {
  open: boolean;
  onClose: () => void;
  /** プロジェクト名（空なら曲名を代わりに表示・使用） */
  projectName: string;
  /** プロジェクト名が空のときに表示・ファイル名に使う曲名 */
  titleFallback: string;
  onRename: (name: string) => void;
  onSave: () => void;
  onNew: () => void;
  isMobile: boolean;
  onToggleUiMode: () => void;
  dark: boolean;
  onToggleTheme: () => void;
}

export default function SideDrawer({
  open,
  onClose,
  projectName,
  titleFallback,
  onRename,
  onSave,
  onNew,
  isMobile,
  onToggleUiMode,
  dark,
  onToggleTheme,
}: Props) {
  // 開いている間はEscで閉じられるようにする
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        className={`drawer-backdrop ${open ? 'open' : ''}`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside className={`drawer ${open ? 'open' : ''}`} aria-hidden={!open}>
        <div className="drawer-head">
          <span className="drawer-title">メニュー</span>
          <button type="button" className="drawer-close" title="閉じる" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="drawer-section">
          <label className="drawer-label" htmlFor="drawer-projname">
            プロジェクト名（保存ファイル名になります）
          </label>
          <div className="drawer-row">
            <input
              id="drawer-projname"
              type="text"
              value={projectName}
              placeholder={titleFallback || '曲名'}
              onChange={(e) => onRename(e.target.value)}
            />
            <button type="button" onClick={onSave} title="音源込みプロジェクトJSONを保存">
              💾 保存
            </button>
          </div>
          <p className="drawer-hint">空欄なら曲名「{titleFallback || '(未設定)'}」を使います。</p>
        </div>

        <div className="drawer-section drawer-actions">
          <button type="button" onClick={onNew}>🗋 新規作成</button>
          <button type="button" onClick={onToggleUiMode}>
            {isMobile ? '💻 PC版に切り替え' : '📱 スマホ版に切り替え'}
          </button>
          <button type="button" onClick={onToggleTheme}>
            {dark ? '☀ ライトモード' : '🌙 ダークモード'}
          </button>
        </div>

        <details className="drawer-section drawer-help">
          <summary>使い方・キー操作</summary>
          <p className="drawer-usage">
            方向キー（またはスマホの◀▶）でカーソルを動かし、ノーツボタンを押すと配置して次へ進みます。
            音源を読み込むと曲と同期して再生できます。
          </p>
          <ul className="drawer-keys">
            <li>D＝ドン / K＝カッ</li>
            <li>Shift+D＝大ドン / Shift+K＝大カッ</li>
            <li>R＝連打 / Shift+R＝大連打 / B＝風船 / E＝終了</li>
            <li>矢印＝カーソル移動 / Delete＝削除</li>
            <li>Space＝再生・一時停止</li>
            <li>Ctrl+Z＝元に戻す / Ctrl+Y＝やり直す</li>
            <li>ドラッグ＝ノーツ範囲選択</li>
          </ul>
        </details>

        <div className="drawer-section drawer-about">
          <p>TJA譜面エディタ</p>
          <p>制作: のー</p>
          <p className="drawer-note">
            ブラウザだけで動作し、音源は端末外に送信しません。
          </p>
        </div>
      </aside>
    </>
  );
}
