interface Props {
  isPlaying: boolean;
  /** 譜面時刻（秒） */
  playhead: number;
  /** 音源時刻（秒） */
  audioTime: number;
  measureCount: number;
  playFromMeasure: number;
  onChangePlayFrom: (measureNo: number) => void;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onPlayFromTop: () => void;
}

function fmt(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`;
}

export default function Transport({
  isPlaying,
  playhead,
  audioTime,
  measureCount,
  playFromMeasure,
  onChangePlayFrom,
  onPlay,
  onPause,
  onStop,
  onPlayFromTop,
}: Props) {
  return (
    <div className="transport">
      {isPlaying ? (
        <button type="button" className="primary" onClick={onPause}>⏸ 一時停止</button>
      ) : (
        <button type="button" className="primary" onClick={onPlay} title="スペースキーでも再生/一時停止">
          ▶ 再生
        </button>
      )}
      <button type="button" onClick={onStop}>⏹ 停止</button>
      <button type="button" onClick={onPlayFromTop}>⏮ 小節1から再生</button>
      <label className="inline">
        小節
        <select
          value={Math.min(playFromMeasure, measureCount)}
          onChange={(e) => onChangePlayFrom(Number(e.target.value))}
        >
          {Array.from({ length: measureCount }, (_, i) => (
            <option key={i} value={i + 1}>
              {i + 1}
            </option>
          ))}
        </select>
        から再生
      </label>
      <span className="time-display">
        譜面 {fmt(playhead)} ／ 音源 {fmt(audioTime)}
      </span>
    </div>
  );
}
