import { NoteValue } from './types';

export interface NoteInfo {
  value: NoteValue;
  name: string;
  short: string;
  className: string;
  keyHint: string;
}

export const NOTE_INFO: Record<NoteValue, NoteInfo> = {
  0: { value: 0, name: '空白', short: '', className: 'n0', keyHint: 'Del' },
  1: { value: 1, name: 'ドン', short: 'ド', className: 'n1', keyHint: 'D' },
  2: { value: 2, name: 'カッ', short: 'カ', className: 'n2', keyHint: 'K' },
  3: { value: 3, name: '大ドン', short: 'ド', className: 'n3', keyHint: 'Shift+D' },
  4: { value: 4, name: '大カッ', short: 'カ', className: 'n4', keyHint: 'Shift+K' },
  5: { value: 5, name: '連打開始', short: '連', className: 'n5', keyHint: 'R' },
  6: { value: 6, name: '大連打開始', short: '連', className: 'n6', keyHint: 'Shift+R' },
  7: { value: 7, name: '風船開始', short: '風', className: 'n7', keyHint: 'B' },
  8: { value: 8, name: '連打・風船終了', short: '終', className: 'n8', keyHint: 'E' },
};
