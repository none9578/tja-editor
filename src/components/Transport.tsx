interface Props {
  isPlaying: boolean;
  /** 譜面時刻（秒） */
  playhead: number;
  measureCount: number;
  playFromMeasure: number;
  onChangePlayFrom: (measureNo: number) => void;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onPlayFromTop: () => void;
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`;
}

/**
 * 画面下部に固定されるフローティング再生バー。
 * 譜面をどこまでスクロールしても再生・停止に常に手が届く。
 */
export default function Transport({
  isPlaying,
  playhead,
  measureCount,
  playFromMeasure,
  onChangePlayFrom,
  onPlay,
  onPause,
  onStop,
  onPlayFromTop,
}: Props) {
  return (
    <div className="float-transport">
      <button
        type="button"
        className="ft-btn"
        title="小節1から再生"
        onClick={onPlayFromTop}
      >
        ⏮
      </button>
      <button
        type="button"
        className="ft-btn ft-main"
        title={isPlaying ? '一時停止（Space）' : '再生（Space）'}
        onClick={isPlaying ? onPause : onPlay}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>
      <button type="button" className="ft-btn" title="停止（開始位置に戻る）" onClick={onStop}>
        ⏹
      </button>
      <label className="ft-measure" title="再生を開始する小節">
        <select
          value={Math.min(playFromMeasure, measureCount)}
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
      </label>
      <span className="ft-time">{fmtTime(playhead)}</span>
    </div>
  );
}
