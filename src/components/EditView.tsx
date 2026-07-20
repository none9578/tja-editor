import { MouseEvent, memo, useCallback, useEffect, useRef } from 'react';
import { Measure } from '../types';
import { MeasureTiming } from '../utils/timing';
import { inputSlotCount } from '../utils/noteOps';
import { RollSpan, rollSegmentsForMeasure } from '../utils/rolls';
import Lane from './Lane';

export interface MeasurePatch {
  numerator?: number;
  denominator?: number;
  bpmOverride?: number | null;
  scrollOverride?: number | null;
  gogo?: boolean;
  barline?: boolean;
  delay?: number | null;
}

/** ノーツ範囲選択（小節番号と小節内割合のペア、正規化済み: a <= b） */
export interface NoteSelection {
  aM: number;
  aF: number;
  bM: number;
  bF: number;
}

const BEAT_PX = 76;
// 12分間隔(25.3px)でギリギリ重ならず、16分間隔(19px)からは重なるサイズ
const NOTE_SIZE = 23;
const BIG_SIZE = 33;
const LANE_H = 48;

interface RowProps {
  measure: Measure;
  index: number;
  timing: MeasureTiming;
  selected: boolean;
  inSelection: boolean;
  inputSlots: number;
  cursorK: number | null;
  laneSelection: [number, number] | null;
  playFraction: number | null;
  isPlaying: boolean;
  rollSpans: RollSpan[];
  balloon: number[];
  onLaneDown: (mi: number, frac: number, e: MouseEvent) => void;
  onLaneMove: (mi: number, frac: number, e: MouseEvent) => void;
  onLaneContext: (mi: number, frac: number) => void;
  onSelectMeasure: (mi: number, shiftKey: boolean) => void;
  onDuplicate: (mi: number) => void;
  onDelete: (mi: number) => void;
  onInsertAfter: (mi: number) => void;
  onOpenDetail: (mi: number) => void;
}

const MeasureRow = memo(function MeasureRow({
  measure,
  index,
  timing,
  selected,
  inSelection,
  inputSlots,
  cursorK,
  laneSelection,
  playFraction,
  isPlaying,
  rollSpans,
  balloon,
  onLaneDown,
  onLaneMove,
  onLaneContext,
  onSelectMeasure,
  onDuplicate,
  onDelete,
  onInsertAfter,
  onOpenDetail,
}: RowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const wasActive = useRef(false);

  useEffect(() => {
    const active = playFraction != null;
    if (active && !wasActive.current && isPlaying) {
      ref.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    wasActive.current = active;
  }, [playFraction, isPlaying]);

  const segments = rollSegmentsForMeasure(rollSpans, index);

  // 非選択時はヘッダに設定を文字表示するだけにして省スペース化
  const infoBits: string[] = [];
  if (measure.numerator !== 4 || measure.denominator !== 4) {
    infoBits.push(`${measure.numerator}/${measure.denominator}`);
  }
  if (measure.bpmOverride != null) infoBits.push(`BPM${measure.bpmOverride}`);
  if (measure.scrollOverride != null) infoBits.push(`HS${measure.scrollOverride}`);
  if (measure.gogo) infoBits.push('GOGO');
  if (!measure.barline) infoBits.push('線OFF');
  if (measure.delay != null && measure.delay !== 0) infoBits.push(`DELAY${measure.delay}`);

  return (
    <div
      ref={ref}
      className={`measure ${selected ? 'selected' : ''} ${inSelection ? 'in-selection' : ''} ${measure.gogo ? 'gogo' : ''}`}
    >
      <div className="measure-header" onClick={(e) => onSelectMeasure(index, e.shiftKey)}>
        <span className="measure-no">#{index + 1}</span>
        <span className="measure-time">{timing.startTime.toFixed(2)}s</span>
        <span className="measure-bpm-label">♩={timing.bpm}</span>
        {infoBits.length > 0 && <span className="measure-info">{infoBits.join(' ')}</span>}
        <span className="spacer" />
        <button
          type="button"
          className="mini"
          title="この小節の詳細設定（拍子・BPM・SCROLL・ゴーゴー・小節線・DELAY）"
          onClick={(e) => {
            e.stopPropagation();
            onOpenDetail(index);
          }}
        >
          ⚙ 詳細
        </button>
        <button
          type="button"
          className="mini"
          title="この小節を複製して直後に挿入"
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate(index);
          }}
        >
          複製
        </button>
        <button
          type="button"
          className="mini"
          title="直後に空の小節を挿入"
          onClick={(e) => {
            e.stopPropagation();
            onInsertAfter(index);
          }}
        >
          ＋
        </button>
        <button
          type="button"
          className="mini danger"
          title="この小節を削除"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(index);
          }}
        >
          ✕
        </button>
      </div>

      <div className="measure-body">
        <Lane
          notes={measure.notes}
          numerator={measure.numerator}
          denominator={measure.denominator}
          beatPx={BEAT_PX}
          height={LANE_H}
          noteSize={NOTE_SIZE}
          bigSize={BIG_SIZE}
          inputSlots={inputSlots}
          playFraction={playFraction}
          cursorK={cursorK}
          selection={laneSelection}
          rollSegments={segments}
          balloonCounts={balloon}
          onLaneMouseDown={(e, frac) => onLaneDown(index, frac, e)}
          onLaneMouseMove={(e, frac) => onLaneMove(index, frac, e)}
          onLaneContextMenu={(_, frac) => onLaneContext(index, frac)}
        />
      </div>

    </div>
  );
});

interface EditViewProps {
  measures: Measure[];
  timings: MeasureTiming[];
  rollSpans: RollSpan[];
  balloon: number[];
  inputUnit: number;
  selection: { start: number; end: number } | null;
  noteSel: NoteSelection | null;
  cursor: { measure: number; slot: number } | null;
  playhead: number;
  showPlayhead: boolean;
  isPlaying: boolean;
  eraser: boolean;
  /** レーンのタップ/クリックでノーツを配置するか（スマホ版はパッド入力に統一するためfalse） */
  tapPlaces: boolean;
  onPlaceAt: (mi: number, k: number) => void;
  onEraseAt: (mi: number, frac: number) => void;
  onNoteSelChange: (sel: NoteSelection | null) => void;
  onCursorChange: (cur: { measure: number; slot: number } | null) => void;
  onSelectMeasure: (mi: number, shiftKey: boolean) => void;
  onDuplicate: (mi: number) => void;
  onDelete: (mi: number) => void;
  onInsertAfter: (mi: number) => void;
  onOpenDetail: (mi: number) => void;
  onAddMeasure: () => void;
}

export default function EditView(props: EditViewProps) {
  const { measures, timings, playhead, showPlayhead, inputUnit, noteSel } = props;

  const dragRef = useRef<{ mi: number; k: number; frac: number; moved: boolean } | null>(null);

  const slotsOf = useCallback(
    (mi: number) => inputSlotCount(measures[mi], inputUnit),
    [measures, inputUnit],
  );

  const handleLaneDown = useCallback(
    (mi: number, frac: number, e: MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const slots = slotsOf(mi);
      const k = Math.min(slots - 1, Math.max(0, Math.round(frac * slots)));
      dragRef.current = { mi, k, frac, moved: false };
      if (e.shiftKey && props.cursor) {
        props.onCursorChange({ measure: mi, slot: k });
        // Shift+クリック: カーソル位置から範囲選択
        const a = { m: props.cursor.measure, f: props.cursor.slot / slotsOf(props.cursor.measure) };
        const b = { m: mi, f: k / slots };
        const [lo, hi] = a.m < b.m || (a.m === b.m && a.f <= b.f) ? [a, b] : [b, a];
        props.onNoteSelChange({ aM: lo.m, aF: lo.f, bM: hi.m, bF: hi.f });
        dragRef.current = null;
        return;
      }
      props.onNoteSelChange(null);
      props.onSelectMeasure(mi, false);
      // 小節選択でカーソルは小節頭へ移るため、クリックした線の位置は最後に上書きする
      props.onCursorChange({ measure: mi, slot: k });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slotsOf, props.onCursorChange, props.onNoteSelChange, props.onSelectMeasure, props.cursor],
  );

  const handleLaneMove = useCallback(
    (mi: number, frac: number, _e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const slots = slotsOf(mi);
      const k = Math.min(slots - 1, Math.max(0, Math.round(frac * slots)));
      if (mi !== drag.mi || k !== drag.k) {
        drag.moved = true;
        const a = { m: drag.mi, f: drag.k / slotsOf(drag.mi) };
        const b = { m: mi, f: k / slots };
        const [lo, hi] = a.m < b.m || (a.m === b.m && a.f <= b.f) ? [a, b] : [b, a];
        props.onNoteSelChange({ aM: lo.m, aF: lo.f, bM: hi.m, bF: hi.f });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slotsOf, props.onNoteSelChange],
  );

  // pointerup で確定: 動いていなければノーツ配置（または消しゴム）
  useEffect(() => {
    const onUp = () => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag || drag.moved) return;
      if (props.eraser) props.onEraseAt(drag.mi, drag.frac);
      else if (props.tapPlaces) props.onPlaceAt(drag.mi, drag.k);
    };
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [props.eraser, props.tapPlaces, props.onEraseAt, props.onPlaceAt]);

  const handleLaneContext = useCallback(
    (mi: number, frac: number) => {
      props.onEraseAt(mi, frac);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.onEraseAt],
  );

  // 再生バーの小節と位置
  let activeIndex = -1;
  let fraction = 0;
  if (showPlayhead) {
    for (let i = 0; i < timings.length; i++) {
      const t = timings[i];
      if (playhead >= t.startTime && playhead < t.startTime + t.duration) {
        activeIndex = i;
        fraction = (playhead - t.startTime) / t.duration;
        break;
      }
    }
    if (activeIndex < 0 && timings.length > 0 && playhead > 0) {
      activeIndex = timings.length - 1;
      fraction = 1;
    }
  }

  // ノーツ選択のハイライト範囲を小節ごとに計算
  const laneSelectionFor = (mi: number): [number, number] | null => {
    if (!noteSel) return null;
    if (mi < noteSel.aM || mi > noteSel.bM) return null;
    const from = mi === noteSel.aM ? noteSel.aF : 0;
    const to = mi === noteSel.bM ? noteSel.bF : 1;
    return [from, to];
  };

  return (
    <div className="measure-grid">
      {measures.map((m, i) => (
        <MeasureRow
          key={m.id}
          measure={m}
          index={i}
          timing={timings[i]}
          selected={
            props.selection != null &&
            props.selection.start === props.selection.end &&
            i === props.selection.start
          }
          inSelection={
            props.selection != null && i >= props.selection.start && i <= props.selection.end
          }
          inputSlots={slotsOf(i)}
          cursorK={props.cursor && props.cursor.measure === i ? props.cursor.slot : null}
          laneSelection={laneSelectionFor(i)}
          playFraction={i === activeIndex ? fraction : null}
          isPlaying={props.isPlaying}
          rollSpans={props.rollSpans}
          balloon={props.balloon}
          onLaneDown={handleLaneDown}
          onLaneMove={handleLaneMove}
          onLaneContext={handleLaneContext}
          onSelectMeasure={props.onSelectMeasure}
          onDuplicate={props.onDuplicate}
          onDelete={props.onDelete}
          onInsertAfter={props.onInsertAfter}
          onOpenDetail={props.onOpenDetail}
        />
      ))}
      <button type="button" className="add-measure" onClick={props.onAddMeasure}>
        ＋ 小節を追加
      </button>
    </div>
  );
}
