import { ChangeEvent } from 'react';
import { COURSE_OPTIONS, Metadata } from '../types';

interface Props {
  metadata: Metadata;
  balloonNoteCount: number;
  onChange: (patch: Partial<Metadata>) => void;
}

export default function MetadataForm({ metadata, balloonNoteCount, onChange }: Props) {
  const num = (e: ChangeEvent<HTMLInputElement>) => Number(e.target.value);

  const balloonText = metadata.balloon.join(',');
  const setBalloonText = (text: string) => {
    const values = text
      .split(/[,、\s]+/)
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n) && n > 0)
      .map((n) => Math.floor(n));
    onChange({ balloon: values });
  };

  const syncBalloon = () => {
    const next = [...metadata.balloon];
    while (next.length < balloonNoteCount) next.push(5);
    next.length = balloonNoteCount;
    onChange({ balloon: next });
  };

  return (
    <div className="metadata-form">
      <label>
        <span>TITLE</span>
        <input
          type="text"
          value={metadata.title}
          onChange={(e) => onChange({ title: e.target.value })}
        />
      </label>
      <label>
        <span>SUBTITLE</span>
        <input
          type="text"
          value={metadata.subtitle}
          placeholder="例: --アーティスト名"
          onChange={(e) => onChange({ subtitle: e.target.value })}
        />
      </label>
      <label>
        <span>BPM</span>
        <input
          type="number"
          min={1}
          step={0.1}
          value={metadata.bpm}
          onChange={(e) => onChange({ bpm: num(e) })}
        />
      </label>
      <label>
        <span>WAVE</span>
        <input
          type="text"
          value={metadata.wave}
          placeholder="例: song.ogg"
          onChange={(e) => onChange({ wave: e.target.value })}
        />
      </label>
      <label>
        <span>COURSE</span>
        <select value={metadata.course} onChange={(e) => onChange({ course: e.target.value })}>
          {COURSE_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>LEVEL</span>
        <input
          type="number"
          min={1}
          max={10}
          value={metadata.level}
          onChange={(e) => onChange({ level: num(e) })}
        />
      </label>
      <label className="balloon-field">
        <span>BALLOON</span>
        <input
          type="text"
          defaultValue={balloonText}
          key={balloonText}
          placeholder="例: 5,10,20"
          onBlur={(e) => setBalloonText(e.target.value)}
        />
        <button
          type="button"
          className="mini"
          title="譜面上の風船ノーツ(7)の数に合わせてBALLOONの個数を調整します"
          onClick={syncBalloon}
        >
          風船数({balloonNoteCount})に合わせる
        </button>
      </label>
      <label>
        <span>SCOREMODE</span>
        <select value={metadata.scoreMode} onChange={(e) => onChange({ scoreMode: e.target.value })}>
          <option value="">（出力しない）</option>
          <option value="0">0 (旧配点)</option>
          <option value="1">1 (旧筐体)</option>
          <option value="2">2 (新配点)</option>
        </select>
      </label>
      <label>
        <span>SCOREINIT</span>
        <input
          type="text"
          value={metadata.scoreInit}
          placeholder="例: 1000"
          onChange={(e) => onChange({ scoreInit: e.target.value })}
        />
      </label>
      <label>
        <span>SCOREDIFF</span>
        <input
          type="text"
          value={metadata.scoreDiff}
          placeholder="例: 100"
          onChange={(e) => onChange({ scoreDiff: e.target.value })}
        />
      </label>
      <label>
        <span>DEMOSTART</span>
        <input
          type="text"
          value={metadata.demoStart}
          placeholder="試聴開始秒 例: 54"
          onChange={(e) => onChange({ demoStart: e.target.value })}
        />
      </label>
      <label>
        <span>SONGVOL</span>
        <input
          type="text"
          value={metadata.songVol}
          placeholder="曲音量 例: 100"
          onChange={(e) => onChange({ songVol: e.target.value })}
        />
      </label>
      <label>
        <span>SEVOL</span>
        <input
          type="text"
          value={metadata.seVol}
          placeholder="効果音量 例: 100"
          onChange={(e) => onChange({ seVol: e.target.value })}
        />
      </label>
    </div>
  );
}
