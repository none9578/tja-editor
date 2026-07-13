export type UiMode = 'pc' | 'mobile';

interface Props {
  /** 端末から推定したおすすめモード */
  recommended: UiMode;
  /** 前回選んだモード（初回はnull） */
  last: UiMode | null;
  onSelect: (mode: UiMode) => void;
}

/**
 * 起動時のモード選択画面。
 */
export default function ModeSelect({ recommended, last, onSelect }: Props) {
  return (
    <div className="mode-select">
      <div className="mode-card">
        <h1>TJA譜面エディタ</h1>
        <p className="mode-desc">
          太鼓さん次郎系のTJA譜面をブラウザで作成・編集できるエディタです。
          <br />
          使用する画面モードを選んでください（ヘッダのボタンでいつでも切り替えられます）。
        </p>
        <div className="mode-buttons">
          <button type="button" className="mode-btn" onClick={() => onSelect('pc')}>
            <span className="mode-icon">💻</span>
            <b>PC版</b>
            <span className="mode-note">キーボード＆マウスでテンポよく入力</span>
            {recommended === 'pc' && <span className="badge">この端末におすすめ</span>}
            {last === 'pc' && recommended !== 'pc' && <span className="badge last">前回</span>}
          </button>
          <button type="button" className="mode-btn" onClick={() => onSelect('mobile')}>
            <span className="mode-icon">📱</span>
            <b>スマホ版</b>
            <span className="mode-note">画面下の入力パッドとタップで操作</span>
            {recommended === 'mobile' && <span className="badge">この端末におすすめ</span>}
            {last === 'mobile' && recommended !== 'mobile' && <span className="badge last">前回</span>}
          </button>
        </div>
        <p className="mode-footnote">
          編集データはこのブラウザに自動保存されています。音源や譜面が外部に送信されることはありません。
        </p>
      </div>
    </div>
  );
}
