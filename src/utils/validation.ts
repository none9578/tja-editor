import { Project } from '../types';

export interface ValidationIssue {
  level: 'error' | 'warning';
  message: string;
}

/** プロジェクト全体のバリデーション */
export function validateProject(project: Project): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { metadata, measures } = project;

  if (!(metadata.bpm > 0)) {
    issues.push({ level: 'error', message: 'BPMは0より大きい値にしてください。' });
  }
  if (metadata.level < 1 || metadata.level > 10) {
    issues.push({ level: 'warning', message: 'LEVELは1〜10程度の範囲を推奨します。' });
  }

  measures.forEach((m, i) => {
    if (m.notes.length !== m.quantize) {
      issues.push({
        level: 'error',
        message: `小節${i + 1}: ノーツ数(${m.notes.length})がクオンタイズ(${m.quantize})と一致していません。`,
      });
    }
    if (m.bpmOverride != null && !(m.bpmOverride > 0)) {
      issues.push({ level: 'error', message: `小節${i + 1}: BPM変更は0より大きい値にしてください。` });
    }
    if (m.scrollOverride != null && !(m.scrollOverride > 0)) {
      issues.push({ level: 'error', message: `小節${i + 1}: SCROLLは0より大きい値にしてください。` });
    }
    if (!(m.numerator >= 1) || !(m.denominator >= 1)) {
      issues.push({ level: 'error', message: `小節${i + 1}: 拍子は1以上の整数にしてください。` });
    }
  });

  // 連打(5,6)・風船(7)と終了(8)の対応チェック
  let open: { type: number; measure: number } | null = null;
  let balloonCount = 0;
  measures.forEach((m, mi) => {
    m.notes.forEach((v) => {
      if (v === 5 || v === 6 || v === 7) {
        if (v === 7) balloonCount += 1;
        if (open) {
          issues.push({
            level: 'error',
            message: `小節${mi + 1}: 連打/風船の開始(小節${open.measure + 1})が終了(8)する前に新しい開始があります。`,
          });
        }
        open = { type: v, measure: mi };
      } else if (v === 8) {
        if (!open) {
          issues.push({
            level: 'error',
            message: `小節${mi + 1}: 開始ノーツ(5/6/7)のない終了(8)があります。`,
          });
        }
        open = null;
      } else if (v >= 1 && v <= 4 && open) {
        issues.push({
          level: 'warning',
          message: `小節${mi + 1}: 連打/風船の途中に通常ノーツがあります。`,
        });
        // 警告は連打1回につき1度で十分なので閉じたことにはしない
      }
    });
  });
  if (open != null) {
    const o = open as { type: number; measure: number };
    issues.push({
      level: 'error',
      message: `小節${o.measure + 1}: 連打/風船が終了(8)されていません。`,
    });
  }

  if (balloonCount !== metadata.balloon.length) {
    issues.push({
      level: 'error',
      message: `風船(7)の数(${balloonCount})とBALLOONの値の個数(${metadata.balloon.length})が一致していません。`,
    });
  }

  return issues;
}
