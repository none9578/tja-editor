import { Project } from '../types';
import { MeasureTiming, totalDuration } from './timing';

export interface ChartStats {
  /** コンボ対象ノーツ数（1〜4） */
  totalNotes: number;
  maxCombo: number;
  donCount: number;
  kaCount: number;
  /** ドン割合（0〜1）。ノーツ0個ならnull */
  donRatio: number | null;
  rollCount: number;
  balloonCount: number;
  /** 平均密度（打/秒） */
  density: number;
  durationSec: number;
}

export function computeStats(project: Project, timings: MeasureTiming[]): ChartStats {
  let don = 0;
  let ka = 0;
  let rolls = 0;
  let balloons = 0;
  for (const m of project.measures) {
    for (const v of m.notes) {
      if (v === 1 || v === 3) don += 1;
      else if (v === 2 || v === 4) ka += 1;
      else if (v === 5 || v === 6) rolls += 1;
      else if (v === 7) balloons += 1;
    }
  }
  const total = don + ka;
  const duration = totalDuration(timings);
  return {
    totalNotes: total,
    maxCombo: total,
    donCount: don,
    kaCount: ka,
    donRatio: total > 0 ? don / total : null,
    rollCount: rolls,
    balloonCount: balloons,
    density: duration > 0 ? total / duration : 0,
    durationSec: duration,
  };
}
