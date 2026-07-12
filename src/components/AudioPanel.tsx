import { useRef } from 'react';
import { AudioInfo } from '../hooks/usePlayer';

interface Props {
  audioInfo: AudioInfo | null;
  hitSoundOn: boolean;
  musicVolume: number;
  onLoadFile: (file: File) => void;
  onToggleHitSound: (on: boolean) => void;
  onChangeVolume: (v: number) => void;
}

export default function AudioPanel({
  audioInfo,
  hitSoundOn,
  musicVolume,
  onLoadFile,
  onToggleHitSound,
  onChangeVolume,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="audio-panel">
      <div className="audio-row">
        <button type="button" onClick={() => inputRef.current?.click()}>
          🎵 音源を読み込む
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*,.mp3,.ogg,.wav"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onLoadFile(f);
            e.target.value = '';
          }}
        />
        <span className="audio-name">
          {audioInfo
            ? `${audioInfo.name}（${audioInfo.duration.toFixed(1)}秒）`
            : '未読み込み（音源なしでもノーツ音だけで再生できます）'}
        </span>
      </div>
      <div className="audio-row">
        <label className="inline">
          <input
            type="checkbox"
            checked={hitSoundOn}
            onChange={(e) => onToggleHitSound(e.target.checked)}
          />
          ノーツ音（ドン・カッ）を鳴らす
        </label>
        <label className="inline">
          曲音量
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={musicVolume}
            onChange={(e) => onChangeVolume(Number(e.target.value))}
          />
        </label>
      </div>
    </div>
  );
}
