import { useCallback, useEffect, useRef, useState } from 'react';

export type HitType = 'don' | 'ka' | 'bigDon' | 'bigKa';

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

interface InternalState {
  /** 再生開始した譜面時刻（停止で戻る位置） */
  startChart: number;
  /** perf時計の基準（音源が主導していないときに使用） */
  baseChart: number;
  basePerf: number;
  /** 音源の状態: waiting=負の音源時刻を待機中 / playing / done=音源範囲外 */
  audioState: 'none' | 'waiting' | 'playing' | 'done';
  noteIdx: number;
  raf: number;
  /** rAFが止まる環境（非表示タブ等）向けのフォールバックタイマー */
  interval: number;
  lastTick: number;
}

/**
 * 音源＋ノーツ音の再生エンジン。
 * 同期の考え方は utils/timing.ts のコメント参照:
 *   audioTime = chartTime - offset
 * 音源が再生中は audio.currentTime を正として譜面位置バーを動かし、
 * 音源開始前（audioTime < 0 の区間）や音源なしのときは performance.now() 時計で進める。
 */
export function usePlayer(offset: number, noteEvents: NoteEvent[], chartEnd: number) {
  const [audioInfo, setAudioInfo] = useState<AudioInfo | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playhead, setPlayheadState] = useState(0); // 譜面時刻
  /** Reactの再描画を待たずに最新の譜面時刻を読むためのref（プレイ画面のcanvas用） */
  const playheadRef = useRef(0);
  const setPlayhead = useCallback((t: number) => {
    playheadRef.current = t;
    setPlayheadState(t);
  }, []);
  const [hitSoundOn, setHitSoundOn] = useState(true);
  // デフォルトは曲を控えめ・太鼓音を大きめにしてズレ確認しやすくする
  const [musicVolume, setMusicVolume] = useState(0.5);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const buffersRef = useRef<{ don: AudioBuffer | null; ka: AudioBuffer | null }>({
    don: null,
    ka: null,
  });

  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const eventsRef = useRef(noteEvents);
  eventsRef.current = noteEvents;
  const chartEndRef = useRef(chartEnd);
  chartEndRef.current = chartEnd;
  const hitOnRef = useRef(hitSoundOn);
  hitOnRef.current = hitSoundOn;

  const stRef = useRef<InternalState>({
    startChart: 0,
    baseChart: 0,
    basePerf: 0,
    audioState: 'none',
    noteIdx: 0,
    raf: 0,
    interval: 0,
    lastTick: 0,
  });

  const ensureCtx = useCallback(() => {
    if (!ctxRef.current) {
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
    }
    void ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const playHit = useCallback((type: HitType) => {
    const ctx = ensureCtx();
    const buf =
      type === 'don' || type === 'bigDon' ? buffersRef.current.don : buffersRef.current.ka;
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = type === 'bigDon' || type === 'bigKa' ? 1.25 : 1;
    src.connect(gain).connect(ctx.destination);
    src.start();
  }, [ensureCtx]);

  const stopRaf = useCallback(() => {
    if (stRef.current.raf) cancelAnimationFrame(stRef.current.raf);
    stRef.current.raf = 0;
    if (stRef.current.interval) clearInterval(stRef.current.interval);
    stRef.current.interval = 0;
  }, []);

  /** 1フレーム分の同期処理。trueを返したら再生終了 */
  const tick = useCallback((): boolean => {
    const st = stRef.current;
    st.lastTick = performance.now();
    const audio = audioRef.current;
    const off = offsetRef.current;
    let chart: number;

    if (audio && st.audioState === 'playing' && !audio.paused && !audio.ended) {
      // 音源再生中は音源時刻を正とする（ドリフト防止）
      chart = audio.currentTime + off;
      st.baseChart = chart;
      st.basePerf = performance.now();
    } else {
      chart = st.baseChart + (performance.now() - st.basePerf) / 1000;
      if (audio && st.audioState === 'waiting') {
        const audioTime = chart - off;
        if (audioTime >= 0) {
          if (audioTime < audio.duration) {
            audio.currentTime = audioTime;
            void audio.play();
            st.audioState = 'playing';
          } else {
            st.audioState = 'done';
          }
        }
      }
      if (audio && st.audioState === 'playing' && audio.ended) {
        st.audioState = 'done';
      }
    }

    // ヒット音: 前フレームから今フレームまでに通過したノーツを鳴らす
    const events = eventsRef.current;
    while (st.noteIdx < events.length && events[st.noteIdx].time <= chart) {
      if (hitOnRef.current) playHit(events[st.noteIdx].type);
      st.noteIdx += 1;
    }

    setPlayhead(chart);

    const audioDone =
      !audio || st.audioState === 'done' || st.audioState === 'none' || audio.ended;
    if (chart > chartEndRef.current + 0.5 && audioDone) {
      // 終端に達したら停止（位置は終端に置く）
      audio?.pause();
      stopRaf();
      setIsPlaying(false);
      setPlayhead(chartEndRef.current);
      return true;
    }
    return false;
  }, [playHit, stopRaf]);

  const loop = useCallback(() => {
    if (!tick()) stRef.current.raf = requestAnimationFrame(loop);
  }, [tick]);

  /** rAF・intervalの二重駆動を開始する（intervalは非表示タブ対策） */
  const startTicking = useCallback(() => {
    const st = stRef.current;
    st.lastTick = performance.now();
    st.raf = requestAnimationFrame(loop);
    st.interval = window.setInterval(() => {
      // rAFが直近で動いていれば何もしない
      if (performance.now() - stRef.current.lastTick > 90) tick();
    }, 100);
  }, [loop, tick]);

  /** 指定の譜面時刻から再生を開始する */
  const play = useCallback(
    (fromChart: number) => {
      ensureCtx();
      stopRaf();
      const st = stRef.current;
      const audio = audioRef.current;
      st.startChart = fromChart;
      st.baseChart = fromChart;
      st.basePerf = performance.now();
      const events = eventsRef.current;
      st.noteIdx = events.findIndex((e) => e.time >= fromChart - 1e-4);
      if (st.noteIdx < 0) st.noteIdx = events.length;

      if (audio) {
        audio.pause();
        const audioTime = fromChart - offsetRef.current; // 同期補正
        if (audioTime >= 0 && audioTime < audio.duration) {
          audio.currentTime = audioTime;
          void audio.play();
          st.audioState = 'playing';
        } else if (audioTime < 0) {
          audio.currentTime = 0;
          st.audioState = 'waiting';
        } else {
          st.audioState = 'done';
        }
      } else {
        st.audioState = 'none';
      }
      setIsPlaying(true);
      setPlayhead(fromChart);
      startTicking();
    },
    [ensureCtx, startTicking, stopRaf],
  );

  const pause = useCallback(() => {
    audioRef.current?.pause();
    stopRaf();
    setIsPlaying(false);
  }, [stopRaf]);

  /** 停止: 再生開始位置に戻す */
  const stop = useCallback(() => {
    audioRef.current?.pause();
    stopRaf();
    setIsPlaying(false);
    setPlayhead(stRef.current.startChart);
    stRef.current.baseChart = stRef.current.startChart;
  }, [stopRaf]);

  /** 一時停止中の位置移動 / 再生中のシーク */
  const seek = useCallback(
    (chart: number) => {
      if (isPlaying) {
        play(chart);
      } else {
        stRef.current.baseChart = chart;
        stRef.current.startChart = chart;
        setPlayhead(chart);
      }
    },
    [isPlaying, play],
  );

  const loadAudioFile = useCallback(
    (file: File) => {
      pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(file);
      urlRef.current = url;
      const el = new Audio(url);
      el.preload = 'auto';
      el.volume = musicVolume;
      el.addEventListener('loadedmetadata', () => {
        setAudioInfo({ name: file.name, duration: el.duration });
      });
      el.addEventListener('error', () => {
        setAudioInfo(null);
        audioRef.current = null;
      });
      audioRef.current = el;
    },
    [pause, musicVolume],
  );

  const changeMusicVolume = useCallback((v: number) => {
    setMusicVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
  }, []);

  /** パレットのボタン押下などで単発のヒット音を鳴らす */
  const preview = useCallback(
    (type: HitType) => {
      playHit(type);
    },
    [playHit],
  );

  useEffect(() => {
    return () => {
      stopRaf();
      audioRef.current?.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
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
    preview,
  };
}
