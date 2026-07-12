import { Project } from '../types';

/**
 * ==== OFFSET（同期補正）の考え方 ====
 *
 * TJA出力値 OFFSET: は「譜面1小節目が始まる音源内時刻を負にした値」。
 *   譜面開始の音源内時刻 audioTime0 = -OFFSET
 *   例) OFFSET:-1.5 → 音源の1.5秒地点で1小節目が始まる。
 *
 * アプリ上の同期補正:
 *   譜面時刻 chartTime（1小節目の頭 = 0）と音源時刻 audioTime の変換は
 *     audioTime = chartTime - offset
 *     chartTime = audioTime + offset
 *   OFFSETを増やす(+) → 同じ音源時刻に対して譜面時刻が進む = 譜面が早くなる。
 *   OFFSETを減らす(-) → 譜面が遅くなる。
 */
export function chartToAudio(chartTime: number, offset: number): number {
  return chartTime - offset;
}

export function audioToChart(audioTime: number, offset: number): number {
  return audioTime + offset;
}

export interface MeasureTiming {
  /** 小節開始の譜面時刻（秒）。1小節目の頭 = 0 */
  startTime: number;
  /** 小節の長さ（秒） */
  duration: number;
  /** この小節に適用される実効BPM */
  bpm: number;
  /** この小節に適用される実効SCROLL（初期値1、時刻計算には影響しない） */
  scroll: number;
}

/**
 * 各小節の開始時刻・長さ・実効BPMを計算する。
 * 小節長秒 = (60 / BPM) * 4 * (numerator / denominator)
 * bpmOverride が設定された小節以降は、次のオーバーライドまでそのBPMを引き継ぐ。
 */
export function computeTimings(project: Project): MeasureTiming[] {
  let t = 0;
  let bpm = project.metadata.bpm > 0 ? project.metadata.bpm : 120;
  let scroll = 1;
  return project.measures.map((m) => {
    if (m.bpmOverride != null && m.bpmOverride > 0) bpm = m.bpmOverride;
    if (m.scrollOverride != null && m.scrollOverride > 0) scroll = m.scrollOverride;
    const duration = (60 / bpm) * 4 * (m.numerator / m.denominator);
    const timing: MeasureTiming = { startTime: t, duration, bpm, scroll };
    t += duration;
    return timing;
  });
}

/** スロットの譜面時刻 = 小節開始時刻 + 小節長 * slotIndex / quantize */
export function slotTime(timing: MeasureTiming, slotIndex: number, quantize: number): number {
  return timing.startTime + (timing.duration * slotIndex) / quantize;
}

/** 譜面全体の長さ（秒） */
export function totalDuration(timings: MeasureTiming[]): number {
  if (timings.length === 0) return 0;
  const last = timings[timings.length - 1];
  return last.startTime + last.duration;
}

/** 譜面時刻がどの小節内かを返す（範囲外は null） */
export function measureIndexAt(timings: MeasureTiming[], chartTime: number): number | null {
  for (let i = 0; i < timings.length; i++) {
    const t = timings[i];
    if (chartTime >= t.startTime && chartTime < t.startTime + t.duration) return i;
  }
  return null;
}
