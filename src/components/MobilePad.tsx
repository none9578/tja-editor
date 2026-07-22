import { PointerEvent, useState } from 'react';
import { INPUT_UNIT_OPTIONS, NOTE_VALUES, NoteValue } from '../types';
import { NOTE_INFO } from '../noteInfo';
import { fmtTime } from './Transport';

/**
 * スマホ用の画面下部固定入力パッド。
 * 基本は編集ボタンだけを大きく表示し、「🎵 再生」で再生操作パッドに切り替える
 * （編集・再生の両方を詰め込むとボタンが小さくなりすぎるため）。
 * ノーツボタンを押すとカーソル位置に配置して自動で次の線へ進む（テンポ入力）。
 */
interface Props {
  inputUnit: number;
  canUndo: boolean;
  isPlaying: boolean;
  /** 譜面時刻（秒）。再生位置の表示に使う */
  playhead: number;
  measureCount: number;
  playFromMeasure: number;
  onChangeInputUnit: (unit: number) => void;
  onMove: (dm: number, ds: number) => void;
  onInput: (v: NoteValue) => void;
  onClear: () => void;
  onUndo: () => void;
  onPlayPause: () => void;
  onStop: () => void;
  onChangePlayFrom: (measureNo: number) => void;
  /** 前/次の小節頭へ飛んで再生（小節プレビュー用） */
  onStepMeasure: (d: number) => void;
}

export default function MobilePad({
  inputUnit,
  canUndo,
  isPlaying,
  playhead,
  measureCount,
  playFromMeasure,
  onChangeInputUnit,
  onMove,
  onInput,
  onClear,
  onUndo,
  onPlayPause,
  onStop,
  onChangePlayFrom,
  onStepMeasure,
}: Props) {
  const [padMode, setPadMode] = useState<'edit' | 'play'>('edit');
  // 「その他」で 2〜128 の任意の入力単位を指定できるようにする
  const [customOpen, setCustomOpen] = useState(!INPUT_UNIT_OPTIONS.includes(inputUnit));
  const [customText, setCustomText] = useState(String(inputUnit));
  const applyCustom = (raw: string) => {
    setCustomText(raw);
    const n = Math.floor(Number(raw));
    if (Number.isFinite(n) && n >= 2 && n <= 128) onChangeInputUnit(n);
  };
  const commitCustom = () => {
    const n = Math.min(128, Math.max(2, Math.floor(Number(customText) || inputUnit)));
    setCustomText(String(n));
    onChangeInputUnit(n);
  };

  // pointerdownで即時反応させる（clickの遅延やフォーカス移動を避ける）
  const press = (fn: () => void) => (e: PointerEvent) => {
    e.preventDefault();
    fn();
  };

  if (padMode === 'play') {
    // 小節プレビューが主用途なので⏮⏭は「前/次の小節頭へ移動」（再生は▶で）。
    // 編集⇔再生の切替ボタンは編集モードと同じ右端に置き、指の移動を無くす
    return (
      <div className="mobile-pad">
        <div className="pad-row pad-row-play">
          <button
            type="button"
            className="pad-btn"
            title="停止（開始位置に戻る）"
            onPointerDown={press(onStop)}
          >
            ⏹
          </button>
          <button
            type="button"
            className="pad-btn"
            title="前の小節頭へ移動（小節の途中ならまず頭へ）"
            onPointerDown={press(() => onStepMeasure(-1))}
          >
            ⏮
          </button>
          <button
            type="button"
            className={`pad-btn ${isPlaying ? 'pad-playing' : ''}`}
            title="再生 / 一時停止"
            onPointerDown={press(onPlayPause)}
          >
            {isPlaying ? '⏸' : '▶︎'}
          </button>
          <button
            type="button"
            className="pad-btn"
            title="次の小節頭へ移動"
            onPointerDown={press(() => onStepMeasure(1))}
          >
            ⏭
          </button>
          <select
            className="pad-unit"
            value={Math.min(playFromMeasure, measureCount)}
            title="再生を開始する小節"
            onChange={(e) => {
              onChangePlayFrom(Number(e.target.value));
              e.currentTarget.blur();
            }}
          >
            {Array.from({ length: measureCount }, (_, i) => (
              <option key={i} value={i + 1}>
                #{i + 1}
              </option>
            ))}
          </select>
          <span className="pad-time">{fmtTime(playhead)}</span>
          {/* モード切替はパッドの高さが変わるため、pointerdownではなくclickで処理する。
              pointerdownで即切替すると、指を離した時にブラウザが合成するclickが
              ずれた後のレイアウトの別要素（小節の×ボタン等）に命中してしまう */}
          <button
            type="button"
            className="pad-btn pad-toggle"
            title="編集操作に戻る"
            onClick={() => setPadMode('edit')}
          >
            ✏ 編集
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mobile-pad">
      <div className="pad-row">
        <button type="button" className="pad-btn" title="前の小節へ" onPointerDown={press(() => onMove(-1, 0))}>
          ⏮
        </button>
        <button type="button" className="pad-btn" title="1つ戻る" onPointerDown={press(() => onMove(0, -1))}>
          ◀
        </button>
        <button type="button" className="pad-btn" title="1つ進む" onPointerDown={press(() => onMove(0, 1))}>
          ▶
        </button>
        <button type="button" className="pad-btn" title="次の小節へ" onPointerDown={press(() => onMove(1, 0))}>
          ⏭
        </button>
        <select
          className="pad-unit"
          value={customOpen ? 'other' : inputUnit}
          title="入力単位"
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'other') {
              setCustomOpen(true);
              setCustomText(String(inputUnit));
            } else {
              setCustomOpen(false);
              onChangeInputUnit(Number(v));
            }
            e.currentTarget.blur();
          }}
        >
          {INPUT_UNIT_OPTIONS.map((u) => (
            <option key={u} value={u}>
              {u}分
            </option>
          ))}
          <option value="other">他</option>
        </select>
        {customOpen && (
          <input
            className="pad-unit-custom"
            type="number"
            min={2}
            max={128}
            value={customText}
            title="入力単位（2〜128）"
            onChange={(e) => applyCustom(e.target.value)}
            onBlur={commitCustom}
          />
        )}
        <button type="button" className="pad-btn" disabled={!canUndo} title="元に戻す" onPointerDown={press(onUndo)}>
          ↩
        </button>
        {/* clickで処理する理由は✏編集ボタン側のコメント参照 */}
        <button
          type="button"
          className={`pad-btn pad-toggle ${isPlaying ? 'pad-playing' : ''}`}
          title="再生操作に切り替え"
          onClick={() => setPadMode('play')}
        >
          🎵 再生
        </button>
      </div>
      <div className="pad-row">
        {NOTE_VALUES.filter((v) => v !== 0).map((v) => {
          const info = NOTE_INFO[v];
          return (
            <button
              key={v}
              type="button"
              className="pad-btn pad-note"
              title={`${info.name}を置いて次へ`}
              onPointerDown={press(() => onInput(v))}
            >
              <span className={`note ${info.className}`}>{info.short}</span>
            </button>
          );
        })}
        {/* 消去はカーソル位置を消す🗑に一本化（空白入力は▶で代替できる）。
            ノーツボタンを大きく保つため消去系ボタンはこれ1つだけにする */}
        <button type="button" className="pad-btn" title="カーソル位置を消す" onPointerDown={press(onClear)}>
          🗑
        </button>
      </div>
    </div>
  );
}
