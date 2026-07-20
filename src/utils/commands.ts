import { Project } from '../types';
import { getSections } from './sections';

/** 譜面の真上に表示する命令ラベル。小節内の割合(0〜1)の位置に置く */
export interface CommandGroup {
  /** 小節内の位置（0〜1） */
  frac: number;
  /** 同じ位置の命令（複数なら縦に重ねる） */
  texts: string[];
}

function fmt(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

/**
 * 各小節に表示する命令ラベルを、TJA出力と同じ走行状態で算出する。
 * BPMCHANGE / MEASURE / BARLINE / DELAY は小節頭、SCROLL(HS) / GOGO は区間頭に置く。
 */
export function computeMeasureCommands(project: Project): CommandGroup[][] {
  let bpm = project.metadata.bpm > 0 ? project.metadata.bpm : 120;
  let scroll = 1;
  let num = 4;
  let den = 4;
  let gogo = false;
  let barline = true;
  return project.measures.map((m) => {
    const groups: CommandGroup[] = [];
    const headTexts: string[] = [];
    if (m.bpmOverride != null && m.bpmOverride !== bpm) {
      headTexts.push(`BPM${fmt(m.bpmOverride)}`);
      bpm = m.bpmOverride;
    }
    if (m.numerator !== num || m.denominator !== den) {
      headTexts.push(`${m.numerator}/${m.denominator}`);
      num = m.numerator;
      den = m.denominator;
    }
    if (m.barline !== barline) {
      headTexts.push(m.barline ? '線ON' : '線OFF');
      barline = m.barline;
    }
    if (m.delay != null && m.delay !== 0) headTexts.push(`DELAY${fmt(m.delay)}`);

    const sections = getSections(m);
    sections.forEach((sec, si) => {
      const texts = si === 0 ? [...headTexts] : [];
      if (sec.scroll != null && sec.scroll !== scroll) {
        texts.push(`HS${fmt(sec.scroll)}`);
        scroll = sec.scroll;
      }
      if (sec.gogo !== gogo) {
        texts.push(sec.gogo ? 'GOGO' : 'ゴーゴー終');
        gogo = sec.gogo;
      }
      if (texts.length > 0) groups.push({ frac: sec.startFrac, texts });
    });
    return groups;
  });
}
