import { PointerEvent } from 'react';
import { INPUT_UNIT_OPTIONS, NOTE_VALUES, NoteValue } from '../types';
import { NOTE_INFO } from '../noteInfo';

/**
 * スマホ用の画面下部固定入力パッド。
 * ノーツボタンを押すとカーソル位置に配置して自動で次の線へ進む（テンポ入力）。
 */
interface Props {
  inputUnit: number;
  eraser: boolean;
  canUndo: boolean;
  isPlaying: boolean;
  onChangeInputUnit: (unit: number) => void;
  onToggleEraser: () => void;
  onMove: (dm: number, ds: number) => void;
  onInput: (v: NoteValue) => void;
  onClear: () => void;
  onUndo: () => void;
  onPlayPause: () => void;
}

export default function MobilePad({
  inputUnit,
  eraser,
  canUndo,
  isPlaying,
  onChangeInputUnit,
  onToggleEraser,
  onMove,
  onInput,
  onClear,
  onUndo,
  onPlayPause,
}: Props) {
  // pointerdownで即時反応させる（clickの遅延やフォーカス移動を避ける）
  const press = (fn: () => void) => (e: PointerEvent) => {
    e.preventDefault();
    fn();
  };

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
          value={inputUnit}
          title="入力単位"
          onChange={(e) => {
            onChangeInputUnit(Number(e.target.value));
            e.currentTarget.blur();
          }}
        >
          {INPUT_UNIT_OPTIONS.map((u) => (
            <option key={u} value={u}>
              {u}分
            </option>
          ))}
        </select>
        <button type="button" className="pad-btn" disabled={!canUndo} title="元に戻す" onPointerDown={press(onUndo)}>
          ↩
        </button>
        <button type="button" className="pad-btn" title="再生 / 一時停止" onPointerDown={press(onPlayPause)}>
          {isPlaying ? '⏸' : '▶︎'}
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
        <button
          type="button"
          className="pad-btn"
          title="空白を置いて次へ（スキップ）"
          onPointerDown={press(() => onInput(0 as NoteValue))}
        >
          空白
        </button>
        <button type="button" className="pad-btn" title="カーソル位置を消す" onPointerDown={press(onClear)}>
          🗑
        </button>
        <button
          type="button"
          className={`pad-btn ${eraser ? 'active' : ''}`}
          title="消しゴムモード（レーンをタップで消す）"
          onPointerDown={press(onToggleEraser)}
        >
          消
        </button>
      </div>
    </div>
  );
}
