import { memo, useEffect, useRef } from 'react';
import { Measure } from '../types';
import { MeasureTiming } from '../utils/timing';
import { RollSpan, rollSegmentsForMeasure } from '../utils/rolls';
import Lane from './Lane';

/** 譜面Wiki風の全体表示。コンパクトな小節を並べ、再生位置バーも流れる */
interface Sizes {
  beatPx: number;
  noteSize: number;
  bigSize: number;
  laneH: number;
}

// 12分間隔でギリギリ重ならないサイズにする（16分からは軽く重なる）
const DESKTOP: Sizes = { beatPx: 42, noteSize: 12, bigSize: 18, laneH: 30 };
// スマホは1行に多くの小節が入るよう小さめにする
const MOBILE: Sizes = { beatPx: 29, noteSize: 8, bigSize: 12, laneH: 21 };

interface ItemProps {
  measure: Measure;
  index: number;
  playFraction: number | null;
  isPlaying: boolean;
  rollSpans: RollSpan[];
  balloon: number[];
  /** 小節をまたいだノーツ重なり順の基準（前の小節ほど大きい） */
  zBase: number;
  sizes: Sizes;
  onJump: (mi: number) => void;
}

const OverviewMeasure = memo(function OverviewMeasure({
  measure,
  index,
  playFraction,
  isPlaying,
  rollSpans,
  balloon,
  zBase,
  sizes,
  onJump,
}: ItemProps) {
  const ref = useRef<HTMLDivElement>(null);
  const wasActive = useRef(false);
  useEffect(() => {
    const active = playFraction != null;
    if (active && !wasActive.current && isPlaying) {
      ref.current?.scrollIntoView({ block: 'nearest' });
    }
    wasActive.current = active;
  }, [playFraction, isPlaying]);

  return (
    <div
      ref={ref}
      className={`ov-measure ${playFraction != null ? 'active' : ''} ${measure.gogo ? 'gogo' : ''}`}
      onClick={() => onJump(index)}
      title={`小節${index + 1}（クリックでこの小節へ）`}
    >
      <span className="ov-no">{index + 1}</span>
      <Lane
        notes={measure.notes}
        numerator={measure.numerator}
        denominator={measure.denominator}
        beatPx={sizes.beatPx}
        height={sizes.laneH}
        noteSize={sizes.noteSize}
        bigSize={sizes.bigSize}
        playFraction={playFraction}
        rollSegments={rollSegmentsForMeasure(rollSpans, index)}
        balloonCounts={balloon}
        compact
        zBase={zBase}
      />
    </div>
  );
});

interface Props {
  measures: Measure[];
  timings: MeasureTiming[];
  rollSpans: RollSpan[];
  balloon: number[];
  playhead: number;
  showPlayhead: boolean;
  isPlaying: boolean;
  isMobile: boolean;
  /** 表示した瞬間にスクロールして見せる小節（編集タブと同じ小節にフォーカスする） */
  focusIndex: number;
  onJump: (mi: number) => void;
}

export default function OverviewView({
  measures,
  timings,
  rollSpans,
  balloon,
  playhead,
  showPlayhead,
  isPlaying,
  isMobile,
  focusIndex,
  onJump,
}: Props) {
  const sizes = isMobile ? MOBILE : DESKTOP;

  // タブを開いた瞬間だけフォーカス小節へスクロール（再生中の追従は各小節側が担当）
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = listRef.current?.children[focusIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'center' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
  }

  return (
    <div className="overview" ref={listRef}>
      {measures.map((m, i) => (
        <OverviewMeasure
          key={m.id}
          measure={m}
          index={i}
          playFraction={i === activeIndex ? fraction : null}
          isPlaying={isPlaying}
          rollSpans={rollSpans}
          balloon={balloon}
          zBase={(measures.length - i) * 300 + 20}
          sizes={sizes}
          onJump={onJump}
        />
      ))}
    </div>
  );
}
