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
  /** この小節の頭の小節線（縦線）を表示するか。false → #BARLINEOFF */
  barline: boolean;
  /** この小節の頭に挿入する #DELAY 秒（音符が流れてくるのを遅らせる）。null = なし */
  delay: number | null;
  /**
   * 小節内の分割点（=小節をサブ区間に切る位置）。各区間は独自のSCROLL/GOGOを持てる。
   * TJA上では音符列の途中の改行＋#SCROLL/#GOGOに対応する。空 = 分割なし（従来通り1区間）。
   * 位置はノーツ解像度に依存しないよう小節内の割合(0〜1, 昇順)で保持する。
   */
  splits: MeasureSplit[];
  /** 小節内のスロット数（= notes.length）。配置ノーツから自動調整される */
  quantize: number;
  notes: NoteValue[];
}

/** 小節内のサブ区間の開始点。at より後ろの区間に scroll/gogo を適用する */
export interface MeasureSplit {
  /** 小節内の位置（0〜1の割合）。区間の開始点 */
  at: number;
  /** この区間頭で適用する #SCROLL。null = 変更しない（直前を継承） */
  scroll: number | null;
  /** この区間がゴーゴータイムか */
  gogo: boolean;
}

export interface Project {
  /** プロジェクト名（保存ファイル名の元になる）。空なら曲名(title)を使う */
  name: string;
  metadata: Metadata;
  measures: Measure[];
}

/** 入力単位（N分音符）の候補。TJAの分割数とは独立で、配置スナップに使う */
export const INPUT_UNIT_OPTIONS = [4, 8, 12, 16, 24, 32, 48, 64];

export const COURSE_OPTIONS = ['Easy', 'Normal', 'Hard', 'Oni', 'Edit'];
