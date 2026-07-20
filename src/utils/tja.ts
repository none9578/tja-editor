import { Measure, Metadata, NoteValue, Project } from '../types';
import { defaultMetadata, uid } from '../project';

/** 数値を最大3桁小数の文字列にする（TJA出力用） */
function fmtNum(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

/** 現在のプロジェクトから .tja テキストを生成する */
export function generateTja(project: Project): string {
  const m = project.metadata;
  const lines: string[] = [];

  lines.push(`TITLE:${m.title}`);
  if (m.subtitle) lines.push(`SUBTITLE:${m.subtitle}`);
  lines.push(`BPM:${fmtNum(m.bpm)}`);
  lines.push(`WAVE:${m.wave}`);
  lines.push(`OFFSET:${fmtNum(m.offset)}`);
  if (m.demoStart !== '') lines.push(`DEMOSTART:${m.demoStart}`);
  if (m.songVol !== '') lines.push(`SONGVOL:${m.songVol}`);
  if (m.seVol !== '') lines.push(`SEVOL:${m.seVol}`);
  lines.push(`COURSE:${m.course}`);
  lines.push(`LEVEL:${m.level}`);
  if (m.balloon.length > 0) lines.push(`BALLOON:${m.balloon.join(',')}`);
  if (m.scoreMode !== '') lines.push(`SCOREMODE:${m.scoreMode}`);
  if (m.scoreInit !== '') lines.push(`SCOREINIT:${m.scoreInit}`);
  if (m.scoreDiff !== '') lines.push(`SCOREDIFF:${m.scoreDiff}`);

  lines.push('');
  lines.push('#START');

  // 譜面数字は必ず #START〜#END の内側にのみ出力する
  let currentBpm = m.bpm;
  let currentScroll = 1;
  let currentNum = 4;
  let currentDen = 4;
  let currentGogo = false;
  for (const measure of project.measures) {
    if (measure.bpmOverride != null && measure.bpmOverride !== currentBpm) {
      lines.push(`#BPMCHANGE ${fmtNum(measure.bpmOverride)}`);
      currentBpm = measure.bpmOverride;
    }
    if (measure.scrollOverride != null && measure.scrollOverride !== currentScroll) {
      lines.push(`#SCROLL ${fmtNum(measure.scrollOverride)}`);
      currentScroll = measure.scrollOverride;
    }
    if (measure.numerator !== currentNum || measure.denominator !== currentDen) {
      lines.push(`#MEASURE ${measure.numerator}/${measure.denominator}`);
      currentNum = measure.numerator;
      currentDen = measure.denominator;
    }
    if (measure.gogo !== currentGogo) {
      lines.push(measure.gogo ? '#GOGOSTART' : '#GOGOEND');
      currentGogo = measure.gogo;
    }
    lines.push(measure.notes.join('') + ',');
  }
  if (currentGogo) lines.push('#GOGOEND');

  lines.push('#END');
  lines.push('');
  return lines.join('\n');
}

export interface ImportResult {
  /** 最初のコースのプロジェクト（後方互換用） */
  project: Project;
  /** ファイル内の全コース */
  courses: Project[];
  warnings: string[];
}

/**
 * TJAテキストをパースする。
 * 対応: 主要ヘッダ / SONGVOL / SEVOL / DEMOSTART / #START / #END /
 *       #MEASURE / #BPMCHANGE / #SCROLL / #GOGOSTART / #GOGOEND / 小節の数字列 /
 *       複数コース（COURSEごとに #START〜#END を繰り返す形式）
 * 未対応のコマンド・ヘッダは警告を出して無視する。
 */
export function parseTja(text: string): ImportResult {
  const warnings: string[] = [];
  const courses: Project[] = [];
  const meta: Metadata = defaultMetadata();
  meta.title = '';

  let inBody = false;
  let measures: Measure[] = [];
  let pendingBpm: number | null = null;
  let pendingScroll: number | null = null;
  let gogo = false;
  let curNum = 4;
  let curDen = 4;
  let buf = ''; // カンマ待ちの数字列

  const unknownWarned = new Set<string>();

  const pushMeasure = (digits: string) => {
    const clean = digits.replace(/[^0-8]/g, '');
    let notes: NoteValue[];
    if (clean.length === 0) {
      // 「,」のみの行 = まるごと休符の1小節
      notes = new Array<NoteValue>(16).fill(0);
    } else {
      notes = [...clean].map((c) => Number(c) as NoteValue);
    }
    measures.push({
      id: uid(),
      numerator: curNum,
      denominator: curDen,
      bpmOverride: pendingBpm,
      scrollOverride: pendingScroll,
      gogo,
      quantize: notes.length,
      notes,
    });
    pendingBpm = null;
    pendingScroll = null;
  };

  const bufHasNotes = () => buf.replace(/[^0-8]/g, '').length > 0;

  const finishCourse = () => {
    if (measures.length === 0) {
      warnings.push(`コース ${meta.course}: 小節がありません。空の小節を1つ作成しました。`);
      pushMeasure('');
    }
    courses.push({
      name: '',
      metadata: { ...meta, balloon: [...meta.balloon] },
      measures,
    });
    measures = [];
    inBody = false;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\/\/.*$/, '').trim();
    if (!line) continue;

    if (!inBody) {
      if (/^#START(\s|$)/i.test(line)) {
        inBody = true;
        // コースごとに譜面状態をリセット
        pendingBpm = null;
        pendingScroll = null;
        gogo = false;
        curNum = 4;
        curDen = 4;
        buf = '';
        measures = [];
        continue;
      }
      const header = line.match(/^([A-Z0-9]+):(.*)$/i);
      if (header) {
        const key = header[1].toUpperCase();
        const value = header[2].trim();
        switch (key) {
          case 'TITLE': meta.title = value; break;
          case 'SUBTITLE': meta.subtitle = value; break;
          case 'BPM': {
            const n = Number(value);
            if (Number.isFinite(n) && n > 0) meta.bpm = n;
            else warnings.push(`BPMの値 "${value}" を読み取れませんでした。`);
            break;
          }
          case 'OFFSET': {
            const n = Number(value);
            if (Number.isFinite(n)) meta.offset = n;
            else warnings.push(`OFFSETの値 "${value}" を読み取れませんでした。`);
            break;
          }
          case 'WAVE': meta.wave = value; break;
          case 'COURSE': meta.course = value || 'Oni'; break;
          case 'LEVEL': {
            const n = Number(value);
            if (Number.isFinite(n)) meta.level = n;
            break;
          }
          case 'BALLOON':
            meta.balloon = value
              .split(',')
              .map((s) => Number(s.trim()))
              .filter((n) => Number.isFinite(n) && n > 0);
            break;
          case 'SCOREMODE': meta.scoreMode = value; break;
          case 'SCOREINIT': meta.scoreInit = value; break;
          case 'SCOREDIFF': meta.scoreDiff = value; break;
          case 'SONGVOL': meta.songVol = value; break;
          case 'SEVOL': meta.seVol = value; break;
          case 'DEMOSTART': meta.demoStart = value; break;
          default:
            if (!unknownWarned.has(key)) {
              unknownWarned.add(key);
              warnings.push(`未対応のヘッダ "${key}:" を無視しました。`);
            }
        }
      } else {
        warnings.push(`ヘッダとして解釈できない行を無視しました: "${line}"`);
      }
      continue;
    }

    // ---- 譜面本体 ----
    if (line.startsWith('#')) {
      if (/^#END(\s|$)/i.test(line)) {
        if (bufHasNotes()) {
          warnings.push('カンマで閉じられていない小節がありました。1小節として読み込みます。');
          pushMeasure(buf);
          buf = '';
        }
        finishCourse();
        continue;
      }
      const mMatch = line.match(/^#MEASURE\s+(\d+)\s*\/\s*(\d+)/i);
      if (mMatch) {
        if (bufHasNotes()) {
          warnings.push('小節の途中の #MEASURE は次の小節から適用します。');
        }
        curNum = Number(mMatch[1]);
        curDen = Number(mMatch[2]);
        continue;
      }
      const bMatch = line.match(/^#BPMCHANGE\s+([\d.]+)/i);
      if (bMatch) {
        if (bufHasNotes()) {
          warnings.push('小節の途中の #BPMCHANGE は次の小節の先頭に適用します。');
        }
        pendingBpm = Number(bMatch[1]);
        continue;
      }
      const sMatch = line.match(/^#SCROLL\s+([\d.]+)/i);
      if (sMatch) {
        if (bufHasNotes()) {
          warnings.push('小節の途中の #SCROLL は次の小節の先頭に適用します。');
        }
        pendingScroll = Number(sMatch[1]);
        continue;
      }
      if (/^#GOGOSTART(\s|$)/i.test(line)) {
        if (bufHasNotes()) {
          warnings.push('小節の途中の #GOGOSTART は次の小節から適用します。');
        }
        gogo = true;
        continue;
      }
      if (/^#GOGOEND(\s|$)/i.test(line)) {
        if (bufHasNotes()) {
          warnings.push('小節の途中の #GOGOEND は次の小節から適用します。');
        }
        gogo = false;
        continue;
      }
      const cmd = line.split(/\s/)[0];
      if (!unknownWarned.has(cmd)) {
        unknownWarned.add(cmd);
        warnings.push(`未対応のコマンド "${cmd}" を無視しました。`);
      }
      continue;
    }

    // 数字列。1行に複数のカンマがあってもよい
    const parts = line.split(',');
    for (let i = 0; i < parts.length - 1; i++) {
      buf += parts[i];
      pushMeasure(buf);
      buf = '';
    }
    buf += parts[parts.length - 1];
  }

  if (inBody) {
    warnings.push('#END が見つかりませんでした。');
    if (bufHasNotes()) {
      pushMeasure(buf);
    }
    finishCourse();
  }
  if (courses.length === 0) {
    warnings.push('#START が見つかりませんでした。譜面本体は読み込まれていません。');
    measures = [];
    pushMeasure('');
    courses.push({ name: '', metadata: { ...meta, balloon: [...meta.balloon] }, measures });
  }
  for (const c of courses) {
    if (!c.metadata.title) c.metadata.title = '(無題)';
  }

  return { project: courses[0], courses, warnings };
}

/** .tja ファイルとしてダウンロードする */
export function downloadText(text: string, filename: string): void {
  downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), filename);
}

/** バイナリ（zip・音源ファイルなど）をダウンロードする */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
