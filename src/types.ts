/** ノーツ値（TJAの数字と同じ） */
export type NoteValue = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const NOTE_VALUES: NoteValue[] = [0, 1, 2, 3, 4, 5, 6, 7, 8];

export interface Metadata {
  title: string;
  subtitle: string;
  /** 曲全体の基準BPM */
  bpm: number;
  /**
   * TJAの OFFSET: として出力される値（秒）。
   * TJA仕様: 譜面1小節目の開始は音源の「-OFFSET」秒地点。
   * 例) OFFSET:-1.5 → 音源の1.5秒地点から1小節目が始まる。
   */
  offset: number;
  wave: string;
  course: string;
  level: number;
  /** 風船の必要打数（7の出現順） */
  balloon: number[];
  /** '' = 出力しない, '0' | '1' | '2' */
  scoreMode: string;
  scoreInit: string;
  scoreDiff: string;
  /** 曲の音量（0〜100目安）。'' = 出力しない */
  songVol: string;
  /** 効果音の音量（0〜100目安）。'' = 出力しない */
  seVol: string;
  /** 選曲画面の試聴開始秒。'' = 出力しない */
  demoStart: string;
}

export interface Measure {
  id: string;
  /** 拍子の分子（デフォルト4） */
  numerator: number;
  /** 拍子の分母（デフォルト4） */
  denominator: number;
  /** この小節の先頭でBPM変更する場合の値。null = 変更なし（直前のBPMを継承） */
  bpmOverride: number | null;
  /** この小節の先頭で #SCROLL 変更する場合の値。null = 変更なし（継承、初期値1） */
  scrollOverride: number | null;
  /** この小節がゴーゴータイム中かどうか（#GOGOSTART/#GOGOENDに変換される） */
  gogo: boolean;
  /** 小節内のスロット数（= notes.length）。配置ノーツから自動調整される */
  quantize: number;
  notes: NoteValue[];
  // 将来の拡張用（分岐・DELAYなど）はここにフィールドを追加する
  // 例: delay?: number | null;
}

export interface Project {
  metadata: Metadata;
  measures: Measure[];
}

/** 入力単位（N分音符）の候補。TJAの分割数とは独立で、配置スナップに使う */
export const INPUT_UNIT_OPTIONS = [4, 8, 12, 16, 24, 32, 48, 64];

export const COURSE_OPTIONS = ['Easy', 'Normal', 'Hard', 'Oni', 'Edit'];
