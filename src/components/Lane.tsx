import { CSSProperties, MouseEvent, memo, useRef } from 'react';
import { NoteValue } from '../types';
import { NOTE_INFO } from '../noteInfo';
import { RollSegment } from '../utils/rolls';

/**
 * 1小節分の譜面レーン。
 * - ノーツは「線の上」に中心が乗るように配置する（左端のノーツは左にはみ出す）。
 * - 隣り合うノーツは太鼓の達人風に重なり、先（左）のノーツが上に描画される。
 * - 連打・風船は開始〜終了を帯で接続する。
 */
export interface LaneProps {
  notes: NoteValue[];
  numerator: number;
  denominator: number;
  /** 1拍（4分音符）の幅px。16分間隔 = beatPx/4 */
  beatPx: number;
  height: number;
  /** 小さいノーツの直径px。16分間隔よりやや大きくして重ねる */
  noteSize: number;
  bigSize: number;
  /** 入力単位グリッドの分割数（薄い線）。省略時は拍線のみ */
  inputSlots?: number;
  /** 再生バー位置（小節内割合0〜1）。無ければ非表示 */
  playFraction?: number | null;
  /** カーソル線の位置（入力単位スロット番号）。無ければ非表示 */
  cursorK?: number | null;
  /** ノーツ範囲選択のハイライト（小節内割合 [from, to]） */
  selection?: [number, number] | null;
  rollSegments?: RollSegment[];
  /** 風船の必要打数（BALLOON配列）。指定すると風船帯の先頭に打数を表示する */
  balloonCounts?: number[];
  /** 全体表示用のコンパクト描画（白枠を細く・ノーツ文字なし） */
  compact?: boolean;
  /**
   * ノーツz-indexの基準値。小節を連結して表示する場合、前の小節ほど大きい値を渡すと
   * 小節をまたいでも「先のノーツが上」になる（全体表示用）。
   */
  zBase?: number;
  onLaneMouseDown?: (e: MouseEvent, frac: number) => void;
  onLaneMouseMove?: (e: MouseEvent, frac: number) => void;
  onLaneContextMenu?: (e: MouseEvent, frac: number) => void;
}

const ROLL_TEXT: Record<number, string> = { 5: '連', 6: '連', 7: '風' };

const Lane = memo(function Lane({
  notes,
  numerator,
  denominator,
  beatPx,
  height,
  noteSize,
  bigSize,
  inputSlots,
  playFraction,
  cursorK,
  selection,
  rollSegments,
  balloonCounts,
  compact,
  zBase = 20,
  onLaneMouseDown,
  onLaneMouseMove,
  onLaneContextMenu,
}: LaneProps) {
  const ref = useRef<HTMLDivElement>(null);
  const width = beatPx * 4 * (numerator / denominator);
  const q = notes.length;

  const fracFromEvent = (e: MouseEvent): number => {
    const rect = ref.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  };

  // 入力単位の薄い線＋拍の濃い線を repeating-gradient で描く
  const backgrounds: string[] = [];
  const sizes: string[] = [];
  if (inputSlots && inputSlots > 1) {
    const sub = width / inputSlots;
    backgrounds.push(
      'repeating-linear-gradient(to right, var(--slot-line) 0 1px, transparent 1px 100%)',
    );
    sizes.push(`${sub}px 100%`);
  }
  backgrounds.push(
    'repeating-linear-gradient(to right, var(--slot-beat) 0 1px, transparent 1px 100%)',
  );
  sizes.push(`${beatPx * (4 / denominator)}px 100%`);

  const style: CSSProperties = {
    width,
    height,
    backgroundImage: backgrounds.join(','),
    backgroundSize: sizes.join(','),
  };

  const noteEls = [];
  for (let j = 0; j < q; j++) {
    const v = notes[j];
    if (v === 0) continue;
    const info = NOTE_INFO[v];
    const big = v === 3 || v === 4 || v === 6;
    const size = big ? bigSize : noteSize;
    const x = (width * j) / q;
    noteEls.push(
      <span
        key={j}
        className={`lane-note ${info.className}`}
        style={{
          left: x - size / 2,
          top: (height - size) / 2,
          width: size,
          height: size,
          fontSize: size * 0.42,
          // 先（左）のノーツが上に見えるようにする
          zIndex: zBase + (q - j),
        }}
      >
        {info.short}
      </span>,
    );
  }

  return (
    <div
      ref={ref}
      className={`lane ${compact ? 'compact' : ''}`}
      style={style}
      /* ポインターイベントでマウスとタッチの両方に対応する */
      onPointerDown={onLaneMouseDown ? (e) => onLaneMouseDown(e, fracFromEvent(e)) : undefined}
      onPointerMove={onLaneMouseMove ? (e) => onLaneMouseMove(e, fracFromEvent(e)) : undefined}
      onContextMenu={
        onLaneContextMenu
          ? (e) => {
              e.preventDefault();
              onLaneContextMenu(e, fracFromEvent(e));
            }
          : undefined
      }
    >
      {selection && (
        <div
          className="lane-selection"
          style={{
            left: width * selection[0] - noteSize / 2,
            width: width * (selection[1] - selection[0]) + noteSize,
          }}
        />
      )}
      {rollSegments?.map((s, i) => {
        const barH = (s.type === 6 ? bigSize : noteSize) * 0.72;
        return (
          <div
            key={`r${i}`}
            className={`roll-bar ${s.type === 7 ? 'balloon' : 'roll'}`}
            style={{
              left: width * s.from,
              width: Math.max(2, width * (s.to - s.from)),
              height: barH,
              top: (height - barH) / 2,
              borderTopLeftRadius: s.startCap ? barH / 2 : 0,
              borderBottomLeftRadius: s.startCap ? barH / 2 : 0,
              borderTopRightRadius: s.endCap ? barH / 2 : 0,
              borderBottomRightRadius: s.endCap ? barH / 2 : 0,
            }}
          />
        );
      })}
      {balloonCounts &&
        rollSegments
          ?.filter((s) => s.type === 7 && s.startCap)
          .map((s, i) => (
            <span
              key={`rc${i}`}
              className="roll-count"
              style={{
                left: width * s.from + noteSize * 0.75,
                top: height / 2,
                fontSize: compact ? 10 : 12,
                zIndex: zBase + q + 50,
              }}
            >
              {balloonCounts[s.balloonIndex] ?? 5}
            </span>
          ))}
      {noteEls}
      {cursorK != null && inputSlots && (
        <div className="lane-cursor" style={{ left: (width * cursorK) / inputSlots - 1 }} />
      )}
      {playFraction != null && (
        <div className="playbar" style={{ left: width * playFraction - 1 }} />
      )}
    </div>
  );
});

export default Lane;
export { ROLL_TEXT };
