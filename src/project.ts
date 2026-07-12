import { Measure, Metadata, NoteValue, Project } from './types';

let uidCounter = 0;
export function uid(): string {
  uidCounter += 1;
  return `m${Date.now().toString(36)}_${uidCounter}`;
}

export function defaultMetadata(): Metadata {
  return {
    title: '新規譜面',
    subtitle: '',
    bpm: 120,
    offset: 0,
    wave: '',
    course: 'Oni',
    level: 5,
    balloon: [],
    scoreMode: '',
    scoreInit: '',
    scoreDiff: '',
    songVol: '',
    seVol: '',
    demoStart: '',
  };
}

export function createMeasure(
  quantize = 16,
  numerator = 4,
  denominator = 4,
): Measure {
  return {
    id: uid(),
    numerator,
    denominator,
    bpmOverride: null,
    scrollOverride: null,
    gogo: false,
    quantize,
    notes: new Array<NoteValue>(quantize).fill(0),
  };
}

/** 旧バージョンの保存データ・外部JSONを現行の形に揃える */
export function normalizeProject(p: Project): Project {
  return {
    metadata: { ...defaultMetadata(), ...p.metadata },
    measures: p.measures.map((m) => ({
      id: m.id || uid(),
      numerator: m.numerator > 0 ? m.numerator : 4,
      denominator: m.denominator > 0 ? m.denominator : 4,
      bpmOverride: m.bpmOverride ?? null,
      scrollOverride: m.scrollOverride ?? null,
      gogo: m.gogo ?? false,
      quantize: m.notes?.length || 16,
      notes: Array.isArray(m.notes) && m.notes.length > 0 ? m.notes : new Array<NoteValue>(16).fill(0),
    })),
  };
}

export function createProject(): Project {
  return {
    metadata: defaultMetadata(),
    measures: [createMeasure(), createMeasure(), createMeasure(), createMeasure()],
  };
}

/** 小節の複製（idは新規採番） */
export function cloneMeasure(m: Measure): Measure {
  return { ...m, id: uid(), notes: [...m.notes] };
}

/**
 * クオンタイズ変更時にノーツ位置を比例配分で移し替える。
 * 移動先が埋まっている場合（縮小時の衝突）はそのノーツを捨てる。
 */
export function resampleNotes(notes: NoteValue[], newQuantize: number): NoteValue[] {
  const out = new Array<NoteValue>(newQuantize).fill(0);
  const oldQuantize = notes.length;
  if (oldQuantize === 0) return out;
  for (let i = 0; i < oldQuantize; i++) {
    const v = notes[i];
    if (v === 0) continue;
    const j = Math.round((i * newQuantize) / oldQuantize);
    if (j < newQuantize && out[j] === 0) out[j] = v;
  }
  return out;
}
