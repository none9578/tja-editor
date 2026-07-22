import { NoteEvent } from '../hooks/usePlayer';
import { PlayData, exportLayout, renderPlayFrame } from './playRender';

/**
 * オート再生を動画(Blob)に書き出す。
 *
 * 主経路: WebCodecs による「決定論エンコード」。各フレームを正確なタイムスタンプで
 * 1枚ずつ描いて符号化するので、実時間キャプチャのようなカクつき・フレーム落ちが原理的に無い。
 * 音声は OfflineAudioContext で先に完全ミックスしてから符号化するのでズレない。
 *
 * WebCodecs非対応のブラウザでは、従来どおり MediaRecorder で実時間録画する（フォールバック）。
 *
 * 描画は playRender を画面表示と共用しているので、オート画面に要素を足せば動画にも反映される。
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
  /** 開始前の助走（秒）。この間に音をフェードインしつつ譜面が流れ込む */
  leadIn: number;
  /** 終了後の余韻（秒）。この間に音をフェードアウトしながら流し続ける */
  outro: number;
  width: number;
  height: number;
  fps?: number;
  bitrate?: number;
  onProgress?: (ratio: number) => void;
  /** ミニプレーヤー用の小さなプレビューcanvasを渡す */
  onPreview?: (canvas: HTMLCanvasElement) => void;
  /** 実時間録画（フォールバック）時、音声をスピーカーにも流すか（既定true） */
  monitor?: boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const G = globalThis as Any;

const SAMPLE_RATE = 48000;
const AUDIO_BITRATE = 160_000;

/** 全音声を OfflineAudioContext で先にミックス（助走フェードイン・余韻フェードアウト込み）する */
async function renderAudioOffline(
  opts: ExportOptions,
  startNow: number,
  endNow: number,
): Promise<AudioBuffer> {
  const { audio, events, fromTime, toTime, leadIn, outro } = opts;
  const dur = endNow - startNow;
  // 音声長は映像（frameCount/fps）とそろえる。長いと末尾の映像フレームが固まって見える
  const fps = opts.fps ?? 60;
  const frames = Math.max(1, Math.round(dur * fps));
  const octx: OfflineAudioContext = new (G.OfflineAudioContext || G.webkitOfflineAudioContext)(
    2,
    Math.max(1, Math.round((frames / fps) * SAMPLE_RATE)),
    SAMPLE_RATE,
  );
  const t0 = 0; // now=startNow に対応
  const acAt = (chart: number) => t0 + (chart - startNow);

  const master = octx.createGain();
  master.connect(octx.destination);
  master.gain.setValueAtTime(leadIn > 0 ? 0 : 1, t0);
  if (leadIn > 0) master.gain.linearRampToValueAtTime(1, acAt(fromTime));
  master.gain.setValueAtTime(1, acAt(toTime));
  if (outro > 0) master.gain.linearRampToValueAtTime(0, acAt(endNow));

  if (audio.music && audio.musicVolume > 0) {
    const g = octx.createGain();
    g.gain.value = audio.musicVolume;
    g.connect(master);
    const src = octx.createBufferSource();
    src.buffer = audio.music;
    src.connect(g);
    const fromAudio = startNow - audio.offset;
    if (fromAudio >= 0) {
      if (fromAudio < audio.music.duration) src.start(t0, fromAudio);
    } else {
      src.start(t0 - fromAudio, 0);
    }
  }
  if (audio.hitSoundOn) {
    for (const e of events) {
      if (e.time < startNow - 1e-4 || e.time > endNow + 1e-4) continue;
      const buf =
        e.type === 'balloon'
          ? audio.buffers.balloon
          : e.type === 'don' || e.type === 'bigDon'
            ? audio.buffers.don
            : audio.buffers.ka;
      if (!buf) continue;
      const src = octx.createBufferSource();
      src.buffer = buf;
      const g = octx.createGain();
      g.gain.value = e.type === 'bigDon' || e.type === 'bigKa' ? 1.25 : 1;
      src.connect(g).connect(master);
      src.start(acAt(e.time));
    }
  }
  return await octx.startRendering();
}

/**
 * 出力コンテナとコーデックを選ぶ。mp4(H264+AAC)優先、非対応ならwebm(VP9/VP8+Opus)。
 * mediabunny の getFirstEncodable* で実際にエンコード可能かを問い合わせる。
 */
async function pickOutput(
  mb: Any,
  width: number,
  height: number,
  bitrate: number,
): Promise<null | { container: 'mp4' | 'webm'; vcodec: string; acodec: string; ext: string }> {
  if (typeof G.VideoEncoder === 'undefined' || typeof G.AudioEncoder === 'undefined') return null;
  const vOpts = { width, height, bitrate };
  const aOpts = { numberOfChannels: 2, sampleRate: SAMPLE_RATE, bitrate: AUDIO_BITRATE };
  // mp4: H264 + AAC
  const avc = await mb.getFirstEncodableVideoCodec(['avc'], vOpts);
  const aac = await mb.getFirstEncodableAudioCodec(['aac'], aOpts);
  if (avc && aac) return { container: 'mp4', vcodec: avc, acodec: aac, ext: 'mp4' };
  // webm: VP9/VP8 + Opus
  const vpx = await mb.getFirstEncodableVideoCodec(['vp9', 'vp8'], vOpts);
  const opus = await mb.getFirstEncodableAudioCodec(['opus'], aOpts);
  if (vpx && opus) return { container: 'webm', vcodec: vpx, acodec: opus, ext: 'webm' };
  return null;
}

/**
 * mediabunny で決定論的にエンコードする。非対応ならnullを返す。
 *
 * mediabunny は WebCodecs のエンコーダ生成・バックプレッシャ・多重化を内部で正しく面倒みるので、
 * 自前で mp4-muxer/webm-muxer を叩いていた頃に起きた「mp4のAAC音声トラックだけ無音になる」不具合を回避できる。
 * 映像は CanvasSource（各フレームを指定タイムスタンプでキャプチャ）、音声は OfflineAudioContext で
 * 先に理論ミックスした AudioBuffer を AudioBufferSource でまるごと符号化する。
 */
async function encodeDeterministic(
  opts: ExportOptions,
  startNow: number,
  endNow: number,
  renderCanvas: HTMLCanvasElement,
  renderAt: (now: number) => void,
): Promise<{ blob: Blob; ext: string } | null> {
  const { width, height } = opts;
  const fps = opts.fps ?? 60;
  const bitrate = opts.bitrate ?? 6_000_000;

  const mb: Any = await import('mediabunny');
  const pick = await pickOutput(mb, width, height, bitrate);
  if (!pick) return null;

  const audioBuf = await renderAudioOffline(opts, startNow, endNow);

  const output = new mb.Output({
    format:
      pick.container === 'mp4'
        ? new mb.Mp4OutputFormat({ fastStart: 'in-memory' })
        : new mb.WebMOutputFormat(),
    target: new mb.BufferTarget(),
  });

  const videoSource = new mb.CanvasSource(renderCanvas, {
    codec: pick.vcodec,
    bitrate,
    keyFrameInterval: 2,
  });
  output.addVideoTrack(videoSource, { frameRate: fps });

  const audioSource = new mb.AudioBufferSource({
    codec: pick.acodec,
    bitrate: AUDIO_BITRATE,
  });
  output.addAudioTrack(audioSource);

  await output.start();

  // ---- 映像フレームを1枚ずつキャプチャ＆符号化（各addのPromiseを待ってバックプレッシャを尊重）----
  const total = endNow - startNow;
  const frameCount = Math.max(1, Math.round(total * fps));
  const frameDur = 1 / fps;
  for (let i = 0; i < frameCount; i++) {
    const now = startNow + i / fps;
    renderAt(now);
    await videoSource.add(i / fps, frameDur);
    if (i % 6 === 0) {
      opts.onProgress?.((i / frameCount) * 0.9);
      await new Promise((r) => setTimeout(r, 0)); // 画面更新のため譲る
    }
  }

  // ---- 音声（ミックス済みバッファをまるごと）----
  opts.onProgress?.(0.94);
  await audioSource.add(audioBuf);

  opts.onProgress?.(0.97);
  await output.finalize();
  opts.onProgress?.(1);

  const buffer = output.target.buffer as ArrayBuffer;
  const blob = new Blob([buffer], {
    type: pick.container === 'mp4' ? 'video/mp4' : 'video/webm',
  });
  return { blob, ext: pick.ext };
}

/** MediaRecorderで実時間録画するフォールバック */
function pickRecorderMime(): { mime: string; ext: string } | null {
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

async function recordRealtime(
  opts: ExportOptions,
  startNow: number,
  endNow: number,
  renderCanvas: HTMLCanvasElement,
  renderAt: (now: number) => void,
): Promise<{ blob: Blob; ext: string }> {
  const { audio, events, fromTime, toTime, leadIn, outro } = opts;
  const fps = opts.fps ?? 60;
  const picked = pickRecorderMime();
  if (!picked) throw new Error('このブラウザは動画の録画に対応していません。');

  const ac: AudioContext = new (G.AudioContext || G.webkitAudioContext)();
  await ac.resume();
  const dest = ac.createMediaStreamDestination();
  const monitor = opts.monitor !== false;
  const t0 = ac.currentTime + 0.25;
  const acAt = (chart: number) => t0 + (chart - startNow);
  const master = ac.createGain();
  master.connect(dest);
  if (monitor) master.connect(ac.destination);
  master.gain.setValueAtTime(leadIn > 0 ? 0 : 1, t0);
  if (leadIn > 0) master.gain.linearRampToValueAtTime(1, acAt(fromTime));
  master.gain.setValueAtTime(1, acAt(toTime));
  if (outro > 0) master.gain.linearRampToValueAtTime(0, acAt(endNow));

  if (audio.music && audio.musicVolume > 0) {
    const g = ac.createGain();
    g.gain.value = audio.musicVolume;
    g.connect(master);
    const src = ac.createBufferSource();
    src.buffer = audio.music;
    src.connect(g);
    const fromAudio = startNow - audio.offset;
    if (fromAudio >= 0) {
      if (fromAudio < audio.music.duration) src.start(t0, fromAudio);
    } else {
      src.start(t0 - fromAudio, 0);
    }
  }
  if (audio.hitSoundOn) {
    for (const e of events) {
      if (e.time < startNow - 1e-4 || e.time > endNow + 1e-4) continue;
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
      src.connect(g).connect(master);
      src.start(acAt(e.time));
    }
  }

  const stream = renderCanvas.captureStream(fps);
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
    const total = endNow - startNow;
    const tick = () => {
      const now = startNow + (ac.currentTime - t0);
      renderAt(now);
      opts.onProgress?.(Math.min(1, Math.max(0, (now - startNow) / total)));
      if (now >= endNow) {
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

export async function exportPlayVideo(
  opts: ExportOptions,
): Promise<{ blob: Blob; ext: string }> {
  const { data, fromTime, toTime, leadIn, outro, width, height } = opts;
  const startNow = fromTime - leadIn;
  const endNow = toTime + outro;

  // 符号化用のオフスクリーンcanvas（画面には出さない＝合成負荷や間引きの影響を受けない）
  const renderCanvas = document.createElement('canvas');
  renderCanvas.width = width;
  renderCanvas.height = height;
  const rctx = renderCanvas.getContext('2d')!;
  const layout = exportLayout(width, height);

  // ミニプレーヤー用の小さなプレビュー
  const pw = Math.min(480, width);
  const ph = Math.round((pw * height) / width);
  const preview = document.createElement('canvas');
  preview.width = pw;
  preview.height = ph;
  const pctx = preview.getContext('2d')!;
  opts.onPreview?.(preview);

  let lastPreview = 0;
  const renderAt = (now: number) => {
    renderPlayFrame(
      rctx,
      { W: width, H: height, now, isPlaying: true, started: true },
      layout,
      data,
    );
    const t = performance.now();
    if (t - lastPreview > 40) {
      // ~25fpsで十分。プレビュー更新が符号化を邪魔しないよう間引く
      pctx.drawImage(renderCanvas, 0, 0, pw, ph);
      lastPreview = t;
    }
  };

  // 決定論エンコードを試す。コーデック非対応(null)や途中のエンコード失敗時は、
  // 音声が確実に入る実時間録画にフォールバックする（無音のまま書き出さない）。
  try {
    const deterministic = await encodeDeterministic(opts, startNow, endNow, renderCanvas, renderAt);
    if (deterministic) return deterministic;
  } catch (e) {
    console.warn('決定論エンコードに失敗したため実時間録画に切り替えます:', e);
    opts.onProgress?.(0);
  }
  return await recordRealtime(opts, startNow, endNow, renderCanvas, renderAt);
}
