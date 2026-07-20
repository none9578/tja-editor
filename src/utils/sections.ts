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
  let prevFrac = 0;
  let prevScroll = m.scrollOverride;
  let prevGogo = m.gogo;
  let idx = 0;
  const boundaries: { frac: number; scroll: number | null; gogo: boolean }[] = [];
  for (const p of pts) {
    if (fracToSlot(p.at, len) <= fracToSlot(prevFrac, len)) continue; // 同じスロットに潰れる分割は無視
    boundaries.push({ frac: p.at, scroll: p.scroll, gogo: p.gogo });
    prevFrac = p.at;
  }
  prevFrac = 0;
  for (const b of boundaries) {
    sections.push({
      index: idx++,
      start: fracToSlot(prevFrac, len),
      end: fracToSlot(b.frac, len),
      startFrac: prevFrac,
      endFrac: b.frac,
      scroll: prevScroll,
      gogo: prevGogo,
    });
    prevFrac = b.frac;
    prevScroll = b.scroll;
    prevGogo = b.gogo;
  }
  sections.push({
    index: idx,
    start: fracToSlot(prevFrac, len),
    end: len,
    startFrac: prevFrac,
    endFrac: 1,
    scroll: prevScroll,
    gogo: prevGogo,
  });
  return sections;
}

/** 指定割合で分割を1つ増やす（既存境界に近すぎる場合は無視）。新区間は直前のgogoを継承 */
export function addSplit(m: Measure, frac: number): MeasureSplit[] {
  const len = m.notes.length;
  const slot = fracToSlot(frac, len);
  if (slot <= 0 || slot >= len) return m.splits;
  // 既に同じスロットに境界があれば追加しない
  const existing = getSections(m);
  if (existing.some((s) => s.start === slot)) return m.splits;
  // 分割位置が属する区間のgogoを引き継ぐ
  const parent = existing.find((s) => s.start < slot && slot < s.end);
  const next: MeasureSplit = { at: frac, scroll: null, gogo: parent ? parent.gogo : m.gogo };
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
  // index>=1 は splits[index-1] に対応
  const sec = sections[index];
  if (!sec) return {};
  const splits = m.splits
    .slice()
    .sort((a, b) => a.at - b.at)
    .map((s) =>
      Math.abs(s.at - sec.startFrac) < 1e-9
        ? {
            ...s,
            scroll: 'scroll' in patch ? (patch.scroll ?? null) : s.scroll,
            gogo: 'gogo' in patch ? (patch.gogo ?? false) : s.gogo,
          }
        : s,
    );
  return { splits };
}

/** 区間 index を直前の区間と結合する（index>=1）。index-1 の境界(splits)を除く */
export function mergeSection(m: Measure, index: number): MeasureSplit[] {
  const sections = getSections(m);
  const sec = sections[index];
  if (!sec || index < 1) return m.splits;
  return m.splits.filter((s) => Math.abs(s.at - sec.startFrac) >= 1e-9);
}
