import { Measure, NoteValue } from '../types';
import { Frac, frac, fracEq, fracToNumber, lcm } from './fraction';

/**
 * ノーツ配置の考え方:
 * - 小節内の位置は「小節長に対する既約分数」で扱う（例: 16分の3つ目 = 3/16）。
 * - TJAの分割数（quantize = notes.length）は、配置済みノーツを表現できる
 *   最小の分割に自動調整する。ただし基準（16分グリッド相当）未満には縮めない。
 * - 入力単位（N分音符）はUI側の状態で、TJAの分割とは独立。
 */

export interface NoteEntry {
  pos: Frac;
  value: NoteValue;
}

/** 基準分割 = 16分音符グリッド相当のスロット数（4/4なら16、3/4なら12） */
export function baseSlots(numerator: number, denominator: number): number {
  const b = (16 * numerator) / denominator;
  return Number.isInteger(b) && b > 0 ? b : 16;
}

/** 小節のノーツを (位置分数, 値) のリストに変換する */
export function measureEntries(m: Measure): NoteEntry[] {
  const out: NoteEntry[] = [];
  const q = m.notes.length;
  m.notes.forEach((v, j) => {
    if (v !== 0) out.push({ pos: frac(j, q), value: v });
  });
  return out;
}

/** エントリ一覧から最小分割のnotes配列を再構築する */
export function rebuildMeasure(m: Measure, entries: NoteEntry[]): Measure {
  const base = baseSlots(m.numerator, m.denominator);
  let q = base;
  for (const e of entries) q = lcm(q, e.pos.d);
  const notes = new Array<NoteValue>(q).fill(0);
  for (const e of entries) {
    const idx = (e.pos.n * q) / e.pos.d;
    if (Number.isInteger(idx) && idx >= 0 && idx < q) notes[idx] = e.value;
  }
  return { ...m, quantize: q, notes };
}

/** 指定位置にノーツを配置（value=0で削除）。分割は自動調整される */
export function setNoteAt(m: Measure, pos: Frac, value: NoteValue): Measure {
  if (pos.n < 0 || fracToNumber(pos) >= 1) return m;
  const entries = measureEntries(m).filter((e) => !fracEq(e.pos, pos));
  if (value !== 0) entries.push({ pos, value });
  return rebuildMeasure(m, entries);
}

/** 指定位置のノーツ値を返す */
export function noteValueAt(m: Measure, pos: Frac): NoteValue {
  const q = m.notes.length;
  const idx = (pos.n * q) / pos.d;
  if (Number.isInteger(idx) && idx >= 0 && idx < q) return m.notes[idx];
  return 0;
}

/** fracFloat付近（±tolerance）のノーツを1つ消す。消したらtrueと新Measure */
export function eraseNear(
  m: Measure,
  fracFloat: number,
  tolerance: number,
): { measure: Measure; erased: boolean } {
  const entries = measureEntries(m);
  let bestIdx = -1;
  let bestDist = tolerance;
  entries.forEach((e, i) => {
    const d = Math.abs(fracToNumber(e.pos) - fracFloat);
    if (d <= bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  });
  if (bestIdx < 0) return { measure: m, erased: false };
  entries.splice(bestIdx, 1);
  return { measure: rebuildMeasure(m, entries), erased: true };
}

/** 範囲 [from, to]（小節内割合・両端含む）のノーツを消す */
export function clearRange(m: Measure, from: number, to: number): Measure {
  const eps = 1e-6;
  const entries = measureEntries(m).filter((e) => {
    const f = fracToNumber(e.pos);
    return f < from - eps || f > to + eps;
  });
  return rebuildMeasure(m, entries);
}

/**
 * 拍子変更: ノーツの「拍単位の絶対位置」を保ったまま小節を伸縮する。
 * 短くなった場合、はみ出すノーツは削除される。
 */
export function convertTimeSignature(m: Measure, newNum: number, newDen: number): Measure {
  const entries = measureEntries(m);
  const converted: NoteEntry[] = [];
  for (const e of entries) {
    // 位置(旧小節割合) → 新小節割合 = f * (oldNum/oldDen) / (newNum/newDen)
    const n = e.pos.n * m.numerator * newDen;
    const d = e.pos.d * m.denominator * newNum;
    if (n / d < 1 - 1e-9) converted.push({ pos: frac(n, d), value: e.value });
  }
  return rebuildMeasure({ ...m, numerator: newNum, denominator: newDen }, converted);
}

/** 入力単位N分音符での小節内スロット数（線の本数 = これ+右端） */
export function inputSlotCount(m: Measure, unit: number): number {
  const s = (unit * m.numerator) / m.denominator;
  return Math.max(1, Math.floor(s + 1e-9));
}

/** 入力単位N分音符でのk番目の位置（小節長に対する分数） */
export function inputPosFrac(m: Measure, unit: number, k: number): Frac {
  // k / (unit * num / den) = k*den / (unit*num)
  return frac(k * m.denominator, unit * m.numerator);
}
