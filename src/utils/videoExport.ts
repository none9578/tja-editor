import { NoteEvent } from '../hooks/usePlayer';
import { PlayData, exportLayout, renderPlayFrame } from './playRender';

/**
 * オート再生を16:9のオフスクリーンcanvasに描画しながらMediaRecorderで録画し、
 * 動画ファイル(Blob)を作る。描画は playRender を画面表示と共用しているので、
 * オート画面に要素を足せば動画にも自動で反映される。録画は実時間で進む。
 */
export interface ExportAudio {
  buffers: { don: AudioBuffer | null; ka: AudioBuffer | null; balloon: AudioBuffer | null };
  music: AudioBuffer | null;
  offset: number;
  hitSoundOn: boolean;
  musicVolume: number;
}

export interface ExportOptions {
  data: PlayData;
  events: NoteEvent[];
  audio: ExportAudio;
  fromTime: number;
  toTime: number;
  width: number;
  height: number;
  fps?: number;
  bitrate?: number;
  onProgress?: (ratio: number) => void;
  /** 録画中のcanvasを画面に出す（ミニプレーヤー）用。生成直後に呼ばれる */
  onCanvas?: (canvas: HTMLCanvasElement) => void;
  /** 録画音声をスピーカーにも流して監視するか（既定true） */
  monitor?: boolean;
}

/** 使えるコンテナ形式を選ぶ（mp4優先、非対応ならwebm） */
function pickMime(): { mime: string; ext: string } | null {
  const cands = [
    { mime: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', ext: 'mp4' },
    { mime: 'video/mp4', ext: 'mp4' },
    { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
    { mime: 'video/webm;codecs=vp8,opus', ext: 'webm' },
    { mime: 'video/webm', ext: 'webm' },
  ];
  for (const c of cands) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c.mime)) return c;
  }
  return null;
}

const FLY_TAIL = 0.6; // 最後の飛翔演出が終わるまでの余白（秒）

export async function exportPlayVideo(
  opts: ExportOptions,
): Promise<{ blob: Blob; ext: string }> {
  const { data, events, audio, fromTime, toTime, width, height } = opts;
  const fps = opts.fps ?? 30;
  const picked = pickMime();
  if (!picked) throw new Error('このブラウザは動画の録画に対応していません。');

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const layout = exportLayout(width, height);
  opts.onCanvas?.(canvas); // ミニプレーヤーとして画面に出せるよう渡す

  // 音声（曲＋太鼓音）をMediaStreamへ流す（monitor時はスピーカーにも）
  const ac = new AudioContext();
  await ac.resume();
  const dest = ac.createMediaStreamDestination();
  const monitor = opts.monitor !== false;
  const sinkOf = (node: AudioNode) => {
    node.connect(dest);
    if (monitor) node.connect(ac.destination);
  };
  const t0 = ac.currentTime + 0.25; // スケジューリング余裕
  const chartToAc = (chart: number) => t0 + (chart - fromTime);

  if (audio.music && audio.musicVolume > 0) {
    const g = ac.createGain();
    g.gain.value = audio.musicVolume;
    sinkOf(g);
    const src = ac.createBufferSource();
    src.buffer = audio.music;
    src.connect(g);
    const fromAudio = fromTime - audio.offset; // 同期補正
    if (fromAudio >= 0) {
      if (fromAudio < audio.music.duration) src.start(t0, fromAudio);
    } else {
      src.start(t0 - fromAudio, 0);
    }
  }
  if (audio.hitSoundOn) {
    for (const e of events) {
      if (e.time < fromTime - 1e-4 || e.time > toTime + 1e-4) continue;
      const buf =
        e.type === 'balloon'
          ? audio.buffers.balloon
          : e.type === 'don' || e.type === 'bigDon'
            ? audio.buffers.don
            : audio.buffers.ka;
      if (!buf) continue;
      const src = ac.createBufferSource();
      src.buffer = buf;
      const g = ac.createGain();
      g.gain.value = e.type === 'bigDon' || e.type === 'bigKa' ? 1.25 : 1;
      src.connect(g);
      sinkOf(g);
      src.start(chartToAc(e.time));
    }
  }

  // 映像＋音声を1本のストリームにまとめて録画
  const stream = canvas.captureStream(fps);
  for (const track of dest.stream.getAudioTracks()) stream.addTrack(track);
  const recorder = new MediaRecorder(stream, {
    mimeType: picked.mime,
    videoBitsPerSecond: opts.bitrate,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const done = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: picked.mime }));
  });
  recorder.start();

  await new Promise<void>((resolve) => {
    let raf = 0;
    const tick = () => {
      const now = fromTime + (ac.currentTime - t0);
      renderPlayFrame(
        ctx,
        { W: width, H: height, now, isPlaying: true, started: true },
        layout,
        data,
      );
      opts.onProgress?.(Math.min(1, Math.max(0, (now - fromTime) / (toTime - fromTime))));
      if (now >= toTime + FLY_TAIL) {
        cancelAnimationFrame(raf);
        resolve();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });

  recorder.stop();
  const blob = await done;
  void ac.close();
  return { blob, ext: picked.ext };
}
