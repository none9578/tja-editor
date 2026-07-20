import { useState } from 'react';

/**
 * 「a〜b小節をコピーして c〜d小節へ貼り付け」の入力パネル。
 * トリガーボタンは選択ツール列に並び、パネルは折り返して全幅で開く。
 * 貼り付け先の方が長い場合はコピー元を繰り返して埋める（上書き貼り付け）。
 *
 * 入力は文字列で保持し、途中の空欄・自由な編集を許す（数値強制で消せないと不便なため）。
 * 一度でも編集したら、開き直しても値を保持する（実行するまでリセットしない）。
 */
interface Props {
  measureCount: number;
  selection: { start: number; end: number } | null;
  onApply: (a: number, b: number, c: number, d: number) => void;
}

export default function CopyMenu({ measureCount, selection, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [a, setA] = useState('1');
  const [b, setB] = useState('1');
  const [c, setC] = useState('2');
  const [d, setD] = useState('2');
  // ユーザーが値を編集したか。編集済みなら開き直しても保持し、選択から上書きしない
  const [dirty, setDirty] = useState(false);
  // 貼り付け先の終わりを手で編集したら、以後の自動追従をやめる
  const [dTouched, setDTouched] = useState(false);

  const openMenu = () => {
    // まだ手を付けていないときだけ、選択範囲をコピー元に反映してから開く
    if (!dirty && selection) {
      const s = selection.start + 1;
      const e = selection.end + 1;
      setA(String(s));
      setB(String(e));
      setC(String(e + 1));
      setD(String(e + 1 + (e - s)));
      setDTouched(false);
    }
    setOpen(true);
  };

  const n = (s: string) => parseInt(s, 10);

  /** a/b/cの変更時、dを「同じ長さで1回貼り付け」の位置に自動追従（d未編集かつ全て数値のときだけ） */
  const autoFollowD = (na: string, nb: string, nc: string) => {
    if (dTouched) return;
    const A = n(na);
    const B = n(nb);
    const C = n(nc);
    if (Number.isFinite(A) && Number.isFinite(B) && Number.isFinite(C)) {
      setD(String(C + Math.max(0, B - A)));
    }
  };

  const editA = (v: string) => {
    setA(v);
    setDirty(true);
    autoFollowD(v, b, c);
  };
  const editB = (v: string) => {
    setB(v);
    setDirty(true);
    autoFollowD(a, v, c);
  };
  const editC = (v: string) => {
    setC(v);
    setDirty(true);
    autoFollowD(a, b, v);
  };
  const editD = (v: string) => {
    setD(v);
    setDirty(true);
    setDTouched(true);
  };

  const A = n(a);
  const B = n(b);
  const C = n(c);
  const D = n(d);
  const valid =
    Number.isFinite(A) &&
    Number.isFinite(B) &&
    Number.isFinite(C) &&
    Number.isFinite(D) &&
    A >= 1 &&
    B >= A &&
    B <= measureCount &&
    C >= 1 &&
    D >= C;

  const run = () => {
    onApply(A, B, C, D);
    setDirty(false); // 実行したら次回開いたとき選択範囲プリフィルを再び許可
    setOpen(false);
  };

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
              onChange={(e) => editA(e.target.value)}
            />
            〜
            <input
              type="number"
              min={1}
              max={measureCount}
              value={b}
              onChange={(e) => editB(e.target.value)}
            />
            小節
          </label>
          <span>→</span>
          <label className="inline">
            貼り付け先
            <input type="number" min={1} value={c} onChange={(e) => editC(e.target.value)} />
            〜
            <input type="number" min={1} value={d} onChange={(e) => editD(e.target.value)} />
            小節
          </label>
          <button type="button" className="mini" disabled={!valid} onClick={run}>
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
