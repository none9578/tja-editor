import { Project } from '../types';
import { MeasureTiming } from './timing';
import { RollSpan } from '../utils/rolls';
import { NoteEvent } from '../hooks/usePlayer';
import { getSections } from './sections';

/**
 * オート再生の描画は「画面表示」と「動画出力」の両方から使うため、ここに一本化する。
 * 譜面から描画に必要なデータを組み立てる buildPlayData と、
 * 1フレームを描く renderPlayFrame を提供する。オート画面に要素を足すときは
 * ここを直せば表示・動画の両方に反映される。
 */

const NOTE_R = 21;
const BIG_R = 30;
const FLY_SEC = 0.5;

interface LaneNote {
  time: number;
  value: 1 | 2 | 3 | 4;
  scroll: number;
  bpm: number;
}
interface RollDraw {
  start: number;
  end: number;
  type: 5 | 6 | 7;
  count: number | null;
  bpm: number;
  scrollStart: number;
  scrollEnd: number;
}

export interface PlayData {
  laneNotes: LaneNote[];
  rollDraws: RollDraw[];
  events: NoteEvent[];
  measureLines: { time: number; scroll: number; bpm: number; barline: boolean }[];
  gogoPoints: { time: number; value: boolean }[];
  noteCount: number;
}

/** 描画時の各種サイズ（画面と動画で別々に決める） */
export interface PlayLayout {
  noteR: number;
  bigR: number;
  laneH: number;
  laneY: number;
  cy: number;
  hitX: number;
  ppb: number;
  fs: number; // フォント等の倍率（画面=1）
}

/** 画面表示用レイアウト（従来のPlayViewと同じ値） */
export function liveLayout(W: number, H: number): PlayLayout {
  const mobile = W < 620;
  const noteR = mobile ? 15 : NOTE_R;
  const bigR = mobile ? 22 : BIG_R;
  const laneH = 110;
  const laneY = H - laneH - 60;
  return {
    noteR,
    bigR,
    laneH,
    laneY,
    cy: laneY + laneH / 2,
    hitX: mobile ? 44 : 110,
    ppb: 2 * noteR * (76 / 23),
    fs: 1,
  };
}

/** 動画出力用レイアウト（16:9・高さに比例して拡大） */
export function exportLayout(W: number, H: number): PlayLayout {
  const s = Math.max(1, H / 420);
  const noteR = NOTE_R * s;
  const laneH = 110 * s;
  const laneY = H - laneH - 60 * s;
  return {
    noteR,
    bigR: BIG_R * s,
    laneH,
    laneY,
    cy: laneY + laneH / 2,
    hitX: Math.max(110 * s, W * 0.08),
    ppb: 2 * noteR * (76 / 23),
    fs: s,
  };
}

/** 譜面から描画データを組み立てる */
export function buildPlayData(
  project: Project,
  timings: MeasureTiming[],
  rollSpans: RollSpan[],
  events: NoteEvent[],
): PlayData {
  const timeAt = (mi: number, frac: number) =>
    timings[mi].startTime + timings[mi].duration * frac;

  // 小節内も含めたSCROLL変化点（時刻→値）
  const scrollPoints: { time: number; value: number }[] = [];
  const gogoPoints: { time: number; value: boolean }[] = [];
  let scroll = 1;
  let gogo = false;
  project.measures.forEach((m, mi) => {
    for (const sec of getSections(m)) {
      const t = timeAt(mi, sec.startFrac);
      if (sec.scroll != null && sec.scroll > 0 && sec.scroll !== scroll) {
        scroll = sec.scroll;
        scrollPoints.push({ time: t, value: scroll });
      }
      if (sec.gogo !== gogo) {
        gogo = sec.gogo;
        gogoPoints.push({ time: t, value: gogo });
      }
    }
  });
  const scrollAt = (time: number) => {
    let v = 1;
    for (const p of scrollPoints) {
      if (p.time <= time + 1e-6) v = p.value;
      else break;
    }
    return v;
  };

  const laneNotes: LaneNote[] = [];
  project.measures.forEach((m, mi) => {
    const q = m.notes.length;
    m.notes.forEach((v, j) => {
      if (v >= 1 && v <= 4) {
        const time = timeAt(mi, j / q);
        laneNotes.push({ time, value: v as 1 | 2 | 3 | 4, scroll: scrollAt(time), bpm: timings[mi].bpm });
      }
    });
  });
  laneNotes.sort((a, b) => a.time - b.time);

  const rollDraws: RollDraw[] = rollSpans.map((s) => {
    const start = timeAt(s.startM, s.startF);
    const end = timeAt(s.endM, s.endF);
    return {
      start,
      end,
      type: s.type,
      count: s.type === 7 ? (project.metadata.balloon[s.balloonIndex] ?? 5) : null,
      bpm: timings[s.startM].bpm,
      scrollStart: scrollAt(start),
      scrollEnd: scrollAt(end),
    };
  });

  const measureLines = timings.map((t, i) => ({
    time: t.startTime,
    scroll: scrollAt(t.startTime),
    bpm: t.bpm,
    barline: project.measures[i]?.barline ?? true,
  }));

  return { laneNotes, rollDraws, events, measureLines, gogoPoints, noteCount: laneNotes.length };
}

/** 描画に足す状態（点数など。今は再生中フラグと開始済みフラグのみ） */
export interface PlayFrameState {
  W: number;
  H: number;
  now: number;
  isPlaying: boolean;
  started: boolean;
}

/** オート再生の1フレームを描く（画面・動画で共用） */
export function renderPlayFrame(
  ctx: CanvasRenderingContext2D,
  frame: PlayFrameState,
  layout: PlayLayout,
  data: PlayData,
): void {
  const { W, H, now } = frame;
  const { noteR, bigR, laneH, laneY, cy, hitX, ppb, fs } = layout;

  let inGogo = false;
  for (const p of data.gogoPoints) {
    if (p.time <= now + 1e-6) inGogo = p.value;
    else break;
  }

  // 背景
  ctx.fillStyle = '#171512';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = inGogo ? '#553530' : '#3d3934';
  ctx.fillRect(0, laneY, W, laneH);
  ctx.fillStyle = '#2c2925';
  ctx.fillRect(0, laneY, W, 8 * fs);
  ctx.fillRect(0, laneY + laneH - 8 * fs, W, 8 * fs);

  const speedAt = (bpm: number, scroll: number) => (bpm / 60) * ppb * scroll;

  // 小節線（#BARLINEOFFは引かない）
  ctx.strokeStyle = '#5c574f';
  ctx.lineWidth = 2 * fs;
  for (const ml of data.measureLines) {
    if (!ml.barline) continue;
    const x = hitX + (ml.time - now) * speedAt(ml.bpm, ml.scroll);
    if (x < -10 || x > W + 10) continue;
    ctx.beginPath();
    ctx.moveTo(x, laneY + 8 * fs);
    ctx.lineTo(x, laneY + laneH - 8 * fs);
    ctx.stroke();
  }

  // 判定枠
  ctx.strokeStyle = '#b8b0a0';
  ctx.lineWidth = 3 * fs;
  ctx.beginPath();
  ctx.arc(hitX, cy, noteR + 1, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(184,176,160,0.35)';
  ctx.beginPath();
  ctx.arc(hitX, cy, bigR + 3, 0, Math.PI * 2);
  ctx.stroke();

  const drawNote = (x: number, y: number, r: number, fill: string, text?: string) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 3 * fs;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.lineWidth = 1.5 * fs;
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.arc(x, y, r + 2, 0, Math.PI * 2);
    ctx.stroke();
    if (text) {
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${r * 0.8}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y + 1);
    }
  };

  // 連打・風船の帯
  for (const r of data.rollDraws) {
    const x1 = Math.max(hitX, hitX + (r.start - now) * speedAt(r.bpm, r.scrollStart));
    const x2 = hitX + (r.end - now) * speedAt(r.bpm, r.scrollEnd);
    if (x2 < hitX - 10 || x1 > W + 60) continue;
    const rad = r.type === 6 ? bigR : noteR;
    if (r.type === 7) {
      drawNote(Math.min(Math.max(x1, hitX), x2), cy, noteR, '#f08830', `${r.count}`);
    } else {
      ctx.fillStyle = '#e6b422';
      ctx.beginPath();
      ctx.moveTo(x1, cy - rad);
      ctx.lineTo(x2, cy - rad);
      ctx.arc(x2, cy, rad, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(x1, cy + rad);
      ctx.arc(x1, cy, rad, Math.PI / 2, -Math.PI / 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3 * fs;
      ctx.stroke();
      drawNote(x1, cy, rad, '#e6b422', '連');
    }
  }

  // 通常ノーツ（未到達分。後ろから=先のノーツが上）
  for (let i = data.laneNotes.length - 1; i >= 0; i--) {
    const n = data.laneNotes[i];
    if (n.time <= now) continue;
    const x = hitX + (n.time - now) * speedAt(n.bpm, n.scroll);
    if (x < -50 || x > W + 50) continue;
    const big = n.value === 3 || n.value === 4;
    const don = n.value === 1 || n.value === 3;
    drawNote(x, cy, big ? bigR : noteR, don ? '#e0452a' : '#2a7fc4');
  }

  // 叩かれたノーツが右上へ飛ぶ演出
  const ty = 22 * fs;
  const tx = Math.min(W - 34 * fs, hitX + (cy - ty) * 3);
  for (const e of data.events) {
    const p = (now - e.time) / FLY_SEC;
    if (p < 0 || p >= 1) continue;
    const big = e.type === 'bigDon' || e.type === 'bigKa';
    const don = e.type === 'don' || e.type === 'bigDon';
    const q = 1 - p;
    const cx2 = hitX + (tx - hitX) * 0.35;
    const cy2 = laneY * 0.25 - 10 * fs;
    const x = q * q * hitX + 2 * q * p * cx2 + p * p * tx;
    const y = q * q * cy + 2 * q * p * cy2 + p * p * ty;
    const r = (big ? bigR : noteR) * (1 - 0.45 * p);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = don ? '#e0452a' : '#2a7fc4';
    ctx.fill();
    ctx.lineWidth = 2.5 * fs;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
  }

  // HUD（オート再生・コンボ）
  let passed = 0;
  for (const n of data.laneNotes) {
    if (n.time <= now) passed += 1;
    else break;
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#e8e4da';
  ctx.font = `bold ${14 * fs}px sans-serif`;
  ctx.fillText(`オート再生  ${passed} / ${data.noteCount}`, 12 * fs, 24 * fs);
  if (passed >= 2) {
    ctx.textAlign = 'center';
    ctx.font = `bold ${26 * fs}px sans-serif`;
    ctx.fillStyle = '#ffd23f';
    ctx.fillText(`${passed} コンボ`, W / 2, 44 * fs);
  }

  // 操作ガイド（画面表示のみ。動画では isPlaying=true にして出さない）
  if (!frame.isPlaying && frame.started) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(0, laneY, W, 34);
    ctx.textAlign = 'center';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText('一時停止中： タップ / Q = 再開 ・ ← → = 小節移動', W / 2, laneY + 23);
  } else if (!frame.isPlaying) {
    ctx.textAlign = 'center';
    ctx.font = '14px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('▶ スタート（またはタップ）でオート再生が始まります', W / 2, cy + 4);
  }
}
