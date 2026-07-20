import { Measure, MeasureSplit } from '../types';

/**
 * 小節内のサブ区間。分割点(splits)と小節頭(scrollOverride/gogo)から導出する。
 * 区間0の scroll/gogo は measure.scrollOverride / measure.gogo に対応する。
 */
export interface Section {
  index: number;
  /** 区間の開始スロット（notes配列のインデックス, 含む） */
  start: number;
  /** 区間の終了スロット（含まない） */
  end: number;
  /** 区間頭の割合(0〜1) */
  startFrac: number;
  /** 区間終わりの割合(0〜1) */
  endFrac: number;
  /** この区間の #SCROLL（null = 継承） */
  scroll: number | null;
  /** この区間のゴーゴー */
  gogo: boolean;
}

/** 割合を notes 解像度のスロット境界に丸める */
function fracToSlot(frac: number, len: number): number {
  return Math.min(len, Math.max(0, Math.round(frac * len)));
}

/** 小節を区間配列に展開する（分割なしなら1区間） */
export function getSections(m: Measure): Section[] {
  const len = m.notes.length;
  // 分割点を割合順に整える。重複スロットに落ちるものは除く
  const pts = [...m.splits]
    .filter((s) => s.at > 0 && s.at < 1)
    .sort((a, b) => a.at - b.at);
  const sections: Section[] = [];
  // 分割点はスロット境界に丸めて扱う（TJAの切れ目は必ず整数スロット境界のため）。
  // 同じスロットに落ちる分割は最初の1つだけ採用する。
  let prevSlot = 0;
  const boundaries: { slot: number; scroll: number | null; gogo: boolean }[] = [];
  for (const p of pts) {
    const slot = fracToSlot(p.at, len);
    if (slot <= prevSlot) continue;
    boundaries.push({ slot, scroll: p.scroll, gogo: p.gogo });
    prevSlot = slot;
  }
  let prevScroll = m.scrollOverride;
  let prevGogo = m.gogo;
  let idx = 0;
  prevSlot = 0;
  for (const b of boundaries) {
    sections.push({
      index: idx++,
      start: prevSlot,
      end: b.slot,
      startFrac: prevSlot / len,
      endFrac: b.slot / len,
      scroll: prevScroll,
      gogo: prevGogo,
    });
    prevSlot = b.slot;
    prevScroll = b.scroll;
    prevGogo = b.gogo;
  }
  sections.push({
    index: idx,
    start: prevSlot,
    end: len,
    startFrac: prevSlot / len,
    endFrac: 1,
    scroll: prevScroll,
    gogo: prevGogo,
  });
  return sections;
}

/** 指定割合で分割を1つ増やす（既存境界と同じスロットなら無視）。新区間は直前のgogoを継承 */
export function addSplit(m: Measure, frac: number): MeasureSplit[] {
  const len = m.notes.length;
  const slot = fracToSlot(frac, len);
  if (slot <= 0 || slot >= len) return m.splits;
  // 既に同じスロットに境界があれば追加しない
  const existing = getSections(m);
  if (existing.some((s) => s.start === slot)) return m.splits;
  // 分割位置が属する区間のgogoを引き継ぐ
  const parent = existing.find((s) => s.start < slot && slot < s.end);
  // 位置はスロット境界に合わせて保持する（グリッドを切り替えても線がズレないように）
  const next: MeasureSplit = { at: slot / len, scroll: null, gogo: parent ? parent.gogo : m.gogo };
  return [...m.splits, next].sort((a, b) => a.at - b.at);
}

/** 区間 index の設定を更新する。index 0 は小節頭(scrollOverride/gogo)なので呼び出し側で分岐する */
export function updateSection(
  m: Measure,
  index: number,
  patch: { scroll?: number | null; gogo?: boolean },
): { scrollOverride?: number | null; gogo?: boolean; splits?: MeasureSplit[] } {
  const sections = getSections(m);
  if (index === 0) {
    const out: { scrollOverride?: number | null; gogo?: boolean } = {};
    if ('scroll' in patch) out.scrollOverride = patch.scroll ?? null;
    if ('gogo' in patch) out.gogo = patch.gogo;
    return out;
  }
  // index>=1 の区間開始スロットに対応する split を（スロット一致で）探して更新する
  const len = m.notes.length;
  const sec = sections[index];
  if (!sec) return {};
  const splits = m.splits.map((s) =>
    fracToSlot(s.at, len) === sec.start
      ? {
          ...s,
          scroll: 'scroll' in patch ? (patch.scroll ?? null) : s.scroll,
          gogo: 'gogo' in patch ? (patch.gogo ?? false) : s.gogo,
        }
      : s,
  );
  return { splits };
}

/** 区間 index を直前の区間と結合する（index>=1）。区間開始スロットの境界(splits)を除く */
export function mergeSection(m: Measure, index: number): MeasureSplit[] {
  const len = m.notes.length;
  const sections = getSections(m);
  const sec = sections[index];
  if (!sec || index < 1) return m.splits;
  return m.splits.filter((s) => fracToSlot(s.at, len) !== sec.start);
}
