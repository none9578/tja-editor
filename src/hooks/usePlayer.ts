import { useCallback, useEffect, useRef, useState } from 'react';

export type HitType = 'don' | 'ka' | 'bigDon' | 'bigKa' | 'balloon';

export interface NoteEvent {
  /** 譜面時刻（秒） */
  time: number;
  type: HitType;
}

export interface AudioInfo {
  name: string;
  duration: number;
}

/** usePlayerの戻り値の型（コンポーネントのprops用） */
export type Player = ReturnType<typeof usePlayer>;

/**
 * 再生エンジン（理論ミックス方式）。
 *
 * 再生開始のたびに、音源とすべてのノーツ音を同一のAudioContextクロック上へ
 * サンプル精度で事前スケジュールする。ミックスはオーディオスレッドが行うため、
 * rAF・タイマー・タブの状態などJavaScript側の揺れは音のタイミングに一切影響しない
 * （スマホでも安定する）。rAFは再生位置バーの表示更新にだけ使う。
 *
 * 同期式は utils/timing.ts 参照: audioTime = chartTime - offset
 */
export function usePlayer(offset: number, noteEvents: NoteEvent[], chartEnd: number) {
  const [audioInfo, setAudioInfo] = useState<AudioInfo | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playhead, setPlayheadState] = useState(0); // 譜面時刻
  /** Reactの再描画を待たずに最新の譜面時刻を読むためのref（canvas描画用） */
  const playheadRef = useRef(0);
  const [hitSoundOn, setHitSoundOnState] = useState(true);
  // デフォルトは曲を控えめ・太鼓音を大きめにしてズレ確認しやすくする
  const [musicVolume, setMusicVolumeState] = useState(0.5);

  const ctxRef = useRef<AudioContext | null>(null);
  const buffersRef = useRef<{
    don: AudioBuffer | null;
    ka: AudioBuffer | null;
    balloon: AudioBuffer | null;
  }>({
    don: null,
    ka: null,
    balloon: null,
  });
  const musicBufRef = useRef<AudioBuffer | null>(null);
  /** 読み込んだ音源の元ファイル（デコード後も保持し、プロジェクト保存で埋め込む） */
  const audioFileRef = useRef<File | null>(null);
  const musicGainRef = useRef<GainNode | null>(null);
  const hitGainRef = useRef<GainNode | null>(null);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const anchorRef = useRef({ chart: 0, ctxTime: 0 });
  const startChartRef = useRef(0);
  const tickerRef = useRef({ raf: 0, interval: 0 });
  const isPlayingRef = useRef(false);

  const offsetRef = useRef(offset);
  const eventsRef = useRef(noteEvents);
  eventsRef.current = noteEvents;
  const chartEndRef = useRef(chartEnd);
  chartEndRef.current = chartEnd;
  const hitOnRef = useRef(hitSoundOn);
  const musicVolRef = useRef(musicVolume);

  const setPlayhead = useCallback((t: number) => {
    playheadRef.current = t;
    setPlayheadState(t);
  }, []);

  const ensureCtx = useCallback(() => {
    // close済み（StrictModeの二重マウント等）のコンテキストは作り直す
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      ctxRef.current = new AudioContext();
      // ドン・カッのヒット音を読み込む（public/sounds/ に同梱）
      const load = async (path: string): Promise<AudioBuffer | null> => {
        try {
          const res = await fetch(path);
          const buf = await res.arrayBuffer();
          return await ctxRef.current!.decodeAudioData(buf);
        } catch {
          return null;
        }
      };
      void load('sounds/don.wav').then((b) => (buffersRef.current.don = b));
      void load('sounds/ka.wav').then((b) => (buffersRef.current.ka = b));
      // 風船を割った（連打終了）ときの音
      void load('sounds/balloon.wav').then((b) => (buffersRef.current.balloon = b));
    }
    void ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  // 初回マウント時にヒット音の読み込みを始めておく（最初の再生から鳴らすため）
  useEffect(() => {
    ensureCtx();
  }, [ensureCtx]);

  const stopSources = useCallback(() => {
    for (const s of sourcesRef.current) {
      try {
        s.stop();
      } catch {
        /* 未開始・停止済みは無視 */
      }
    }
    sourcesRef.current = [];
  }, []);

  const stopTicker = useCallback(() => {
    if (tickerRef.current.raf) cancelAnimationFrame(tickerRef.current.raf);
    if (tickerRef.current.interval) clearInterval(tickerRef.current.interval);
    tickerRef.current.raf = 0;
    tickerRef.current.interval = 0;
  }, []);

  /** 現在の譜面時刻（オーディオクロック基準） */
  const currentChart = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return playheadRef.current;
    return anchorRef.current.chart + (ctx.currentTime - anchorRef.current.ctxTime);
  }, []);

  /** 表示更新1回ぶん。trueで再生終了 */
  const tick = useCallback((): boolean => {
    const chart = currentChart();
    setPlayhead(chart);
    const musicEndChart = musicBufRef.current
      ? musicBufRef.current.duration + offsetRef.current
      : 0;
    const end = Math.max(chartEndRef.current, musicEndChart);
    // 譜面の終わりで急に止めず、助走と同じくらいの余韻（空レーンが流れる時間）を残す
    if (chart > end + 1.8) {
      stopSources();
      stopTicker();
      isPlayingRef.current = false;
      setIsPlaying(false);
      setPlayhead(end);
      return true;
    }
    return false;
  }, [currentChart, setPlayhead, stopSources, stopTicker]);

  const startTicker = useCallback(() => {
    stopTicker();
    const loop = () => {
      if (!tick()) tickerRef.current.raf = requestAnimationFrame(loop);
    };
    tickerRef.current.raf = requestAnimationFrame(loop);
    // 非表示タブではrAFが止まるため低頻度のフォールバックを併用（音は影響を受けない）
    tickerRef.current.interval = window.setInterval(() => {
      if (isPlayingRef.current) tick();
    }, 250);
  }, [stopTicker, tick]);

  /**
   * 指定の譜面時刻から再生する。
   * 音源と全ノーツ音をこの場で一括スケジュール（=理論的にミックス）する。
   */
  const play = useCallback(
    (fromChart: number) => {
      const ctx = ensureCtx();
      stopSources();

      const t0 = ctx.currentTime + 0.08; // スケジューリング余裕
      anchorRef.current = { chart: fromChart, ctxTime: t0 };
      startChartRef.current = fromChart;

      // 曲（音量は再生中もmusicGainで変えられる）
      const musicGain = ctx.createGain();
      musicGain.gain.value = musicVolRef.current;
      musicGain.connect(ctx.destination);
      musicGainRef.current = musicGain;
      const music = musicBufRef.current;
      if (music) {
        const fromAudio = fromChart - offsetRef.current; // 同期補正
        if (fromAudio < music.duration) {
          const src = ctx.createBufferSource();
          src.buffer = music;
          src.connect(musicGain);
          if (fromAudio >= 0) src.start(t0, fromAudio);
          else src.start(t0 - fromAudio, 0); // 助走中は待ってから頭出し
          sourcesRef.current.push(src);
        }
      }

      // ノーツ音（ON/OFFは再生中もhitGainで切り替えられる）
      const hitGain = ctx.createGain();
      hitGain.gain.value = hitOnRef.current ? 1 : 0;
      hitGain.connect(ctx.destination);
      hitGainRef.current = hitGain;
      for (const e of eventsRef.current) {
        if (e.time < fromChart - 1e-4) continue;
        const buf =
          e.type === 'balloon'
            ? buffersRef.current.balloon
            : e.type === 'don' || e.type === 'bigDon'
              ? buffersRef.current.don
              : buffersRef.current.ka;
        if (!buf) continue;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const g = ctx.createGain();
        g.gain.value = e.type === 'bigDon' || e.type === 'bigKa' ? 1.25 : 1;
        src.connect(g).connect(hitGain);
        src.start(t0 + (e.time - fromChart));
        sourcesRef.current.push(src);
      }

      isPlayingRef.current = true;
      setIsPlaying(true);
      setPlayhead(fromChart);
      startTicker();
    },
    [ensureCtx, stopSources, setPlayhead, startTicker],
  );

  const pause = useCallback(() => {
    if (isPlayingRef.current) setPlayhead(currentChart());
    stopSources();
    stopTicker();
    isPlayingRef.current = false;
    setIsPlaying(false);
  }, [currentChart, setPlayhead, stopSources, stopTicker]);

  /** 停止: 再生開始位置に戻す */
  const stop = useCallback(() => {
    stopSources();
    stopTicker();
    isPlayingRef.current = false;
    setIsPlaying(false);
    setPlayhead(startChartRef.current);
  }, [setPlayhead, stopSources, stopTicker]);

  /** 一時停止中の位置移動 / 再生中のシーク */
  const seek = useCallback(
    (chart: number) => {
      if (isPlayingRef.current) {
        play(chart);
      } else {
        startChartRef.current = chart;
        setPlayhead(chart);
      }
    },
    [play, setPlayhead],
  );

  // OFFSET・環境補正・譜面が変わったら、再生中なら現在位置から組み直す
  // （調整ボタンを押した結果がすぐ音に反映される）
  offsetRef.current = offset;
  useEffect(() => {
    if (isPlayingRef.current) play(playheadRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, noteEvents]);

  const loadAudioFile = useCallback(
    (file: File) => {
      pause();
      const ctx = ensureCtx();
      void file
        .arrayBuffer()
        .then((buf) => ctx.decodeAudioData(buf))
        .then((decoded) => {
          musicBufRef.current = decoded;
          audioFileRef.current = file;
          setAudioInfo({ name: file.name, duration: decoded.duration });
        })
        .catch(() => {
          musicBufRef.current = null;
          audioFileRef.current = null;
          setAudioInfo(null);
        });
    },
    [ensureCtx, pause],
  );

  /** 読み込み済み音源の元ファイル（プロジェクトJSONへの埋め込み用） */
  const getAudioFile = useCallback(() => audioFileRef.current, []);

  const setHitSoundOn = useCallback((on: boolean) => {
    setHitSoundOnState(on);
    hitOnRef.current = on;
    if (hitGainRef.current) hitGainRef.current.gain.value = on ? 1 : 0;
  }, []);

  const changeMusicVolume = useCallback((v: number) => {
    setMusicVolumeState(v);
    musicVolRef.current = v;
    if (musicGainRef.current) musicGainRef.current.gain.value = v;
  }, []);

  /** パレットのボタン押下などで単発のヒット音を鳴らす */
  /** 動画出力用: デコード済みバッファ・音源・各設定を取り出す */
  const getExportAudio = useCallback(
    () => ({
      buffers: buffersRef.current,
      music: musicBufRef.current,
      offset: offsetRef.current,
      hitSoundOn: hitOnRef.current,
      musicVolume: musicVolRef.current,
    }),
    [],
  );

  const preview = useCallback(
    (type: HitType) => {
      const ctx = ensureCtx();
      const buf =
        type === 'balloon'
          ? buffersRef.current.balloon
          : type === 'don' || type === 'bigDon'
            ? buffersRef.current.don
            : buffersRef.current.ka;
      if (!buf) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = type === 'bigDon' || type === 'bigKa' ? 1.25 : 1;
      src.connect(g).connect(ctx.destination);
      src.start();
    },
    [ensureCtx],
  );

  useEffect(() => {
    return () => {
      stopSources();
      stopTicker();
      void ctxRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    audioInfo,
    isPlaying,
    playhead,
    playheadRef,
    hitSoundOn,
    setHitSoundOn,
    musicVolume,
    changeMusicVolume,
    play,
    pause,
    stop,
    seek,
    loadAudioFile,
    getAudioFile,
    getExportAudio,
    preview,
  };
}
