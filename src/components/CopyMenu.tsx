import { useState } from 'react';

/**
 * 「a〜b小節をコピーして c〜d小節へ貼り付け」の入力パネル。
 * トリガーボタンは選択ツール列に並び、パネルは折り返して全幅で開く。
 * 貼り付け先の方が長い場合はコピー元を繰り返して埋める（上書き貼り付け）。
 */
interface Props {
  measureCount: number;
  selection: { start: number; end: number } | null;
  onApply: (a: number, b: number, c: number, d: number) => void;
}

export default function CopyMenu({ measureCount, selection, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [a, setA] = useState(1);
  const [b, setB] = useState(1);
  const [c, setC] = useState(2);
  const [d, setD] = useState(2);
  // 貼り付け先の終わりを手で編集したら、以後の自動追従をやめる
  const [dTouched, setDTouched] = useState(false);

  const openMenu = () => {
    // 小節選択があればコピー元に反映し、貼り付け先はその直後から
    const s = selection ? selection.start + 1 : 1;
    const e = selection ? selection.end + 1 : 1;
    setA(s);
    setB(e);
    setC(e + 1);
    setD(e + 1 + (e - s));
    setDTouched(false);
    setOpen(true);
  };

  /** a/b/cの変更時は、dを「同じ長さで1回貼り付け」の位置に自動追従させる */
  const update = (na: number, nb: number, nc: number) => {
    setA(na);
    setB(nb);
    setC(nc);
    if (!dTouched) setD(nc + Math.max(0, nb - na));
  };

  const num = (v: string) => Math.max(1, Math.floor(Number(v) || 1));
  const valid = a >= 1 && b >= a && b <= measureCount && c >= 1 && d >= c;

  return (
    <>
      <button
        type="button"
        className="mini"
        onClick={() => (open ? setOpen(false) : openMenu())}
      >
        コピーメニュー
      </button>
      {open && (
        <div className="copy-panel">
          <label className="inline">
            コピー元
            <input
              type="number"
              min={1}
              max={measureCount}
              value={a}
              onChange={(e) => update(num(e.target.value), b, c)}
            />
            〜
            <input
              type="number"
              min={1}
              max={measureCount}
              value={b}
              onChange={(e) => update(a, num(e.target.value), c)}
            />
            小節
          </label>
          <span>→</span>
          <label className="inline">
            貼り付け先
            <input
              type="number"
              min={1}
              value={c}
              onChange={(e) => update(a, b, num(e.target.value))}
            />
            〜
            <input
              type="number"
              min={1}
              value={d}
              onChange={(e) => {
                setDTouched(true);
                setD(num(e.target.value));
              }}
            />
            小節
          </label>
          <button
            type="button"
            className="mini"
            disabled={!valid}
            onClick={() => {
              onApply(a, b, c, d);
              setOpen(false);
            }}
          >
            実行
          </button>
          <button type="button" className="mini" onClick={() => setOpen(false)}>
            閉じる
          </button>
          <span className="copy-hint">
            貼り付け先へ上書きします。貼り付け先の方が長い場合はコピー元を繰り返し、譜面末尾を超える分は小節を追加します。
          </span>
        </div>
      )}
    </>
  );
}
