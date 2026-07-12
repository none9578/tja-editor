import { Measure } from '../types';

/** 連打・風船の開始〜終了の区間（レンダリング・再生用） */
export interface RollSpan {
  /** 5=連打, 6=大連打, 7=風船 */
  type: 5 | 6 | 7;
  startM: number;
  /** 小節内割合 0〜1 */
  startF: number;
  endM: number;
  endF: number;
  closed: boolean;
  /** typeが7のとき、何個目の風船か（BALLOON配列のインデックス）。それ以外は-1 */
  balloonIndex: number;
}

export function computeRollSpans(measures: Measure[]): RollSpan[] {
  const spans: RollSpan[] = [];
  let open: RollSpan | null = null;
  let balloonIdx = -1;
  measures.forEach((m, mi) => {
    const q = m.notes.length;
    m.notes.forEach((v, j) => {
      const f = j / q;
      if (v === 5 || v === 6 || v === 7) {
        if (open) {
          // 終了なしで新しい開始→前のは開始小節の終わりまでで打ち切り
          open.endM = open.startM;
          open.endF = 1;
          spans.push(open);
        }
        if (v === 7) balloonIdx += 1;
        open = {
          type: v,
          startM: mi,
          startF: f,
          endM: mi,
          endF: 1,
          closed: false,
          balloonIndex: v === 7 ? balloonIdx : -1,
        };
      } else if (v === 8) {
        if (open) {
          open.endM = mi;
          open.endF = f;
          open.closed = true;
          spans.push(open);
          open = null;
        }
      }
    });
  });
  if (open) spans.push(open);
  return spans;
}

export interface RollSegment {
  from: number;
  to: number;
  type: 5 | 6 | 7;
  startCap: boolean;
  endCap: boolean;
  /** typeが7のとき、何個目の風船か（BALLOON配列のインデックス） */
  balloonIndex: number;
}

/** 指定小節にかかる連打区間の断片を返す */
export function rollSegmentsForMeasure(spans: RollSpan[], mi: number): RollSegment[] {
  const segs: RollSegment[] = [];
  for (const s of spans) {
    if (mi < s.startM || mi > s.endM) continue;
    segs.push({
      from: mi === s.startM ? s.startF : 0,
      to: mi === s.endM ? s.endF : 1,
      type: s.type,
      startCap: mi === s.startM,
      endCap: mi === s.endM && s.closed,
      balloonIndex: s.balloonIndex,
    });
  }
  return segs;
}
