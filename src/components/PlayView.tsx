import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Project } from '../types';
import { MeasureTiming } from '../utils/timing';
import { RollSpan } from '../utils/rolls';
import { NoteEvent, Player } from '../hooks/usePlayer';

/**
 * オート再生画面。
 * ノーツが右から流れてきて、判定枠に到達すると自動で叩かれ、右上へ飛んでいく。
 * 音はusePlayer側でサンプル精度にスケジュール済みなので、ここは描画だけを担当する。
 *
 * ノーツの流れる速さは「1拍 = ノーツ直径 × 76/23 px」（編集画面と同じ重なり具合）。
 * この見た目の基準がBPMに応じたスクロール速度を理論的に決める。
 */
const NOTE_R = 21;
const BIG_R = 30;
/** 叩かれたノーツが右上へ飛ぶ時間（秒） */
const FLY_SEC = 0.5;

interface LaneNote {
  time: number;
  value: 1 | 2 | 3 | 4;
  mi: number;
}

interface RollDraw {
  start: number;
  end: number;
  type: 5 | 6 | 7;
  count: number | null;
  mi: number;
}

interface Props {
  project: Project;
  timings: MeasureTiming[];
  rollSpans: RollSpan[];
  player: Player;
  chartEnd: number;
  playFromMeasure: number;
  onChangePlayFrom: (measureNo: number) => void;
  /** 自動ヒット音イベント（連打の自動ドン含む）。飛んでいく演出に使う */
  events: NoteEvent[];
}

export default function PlayView({
  project,
  timings,
  rollSpans,
  player,
  chartEnd,
  playFromMeasure,
  onChangePlayFrom,
  events,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const timeAt = useCallback(
    (mi: number, frac: number) => timings[mi].startTime + timings[mi].duration * frac,
    [timings],
  );

  // レーンに流れる通常ノーツ（1〜4）
  const laneNotes = useMemo<LaneNote[]>(() => {
    const notes: LaneNote[] = [];
    project.measures.forEach((m, mi) => {
      const q = m.notes.length;
      m.notes.forEach((v, j) => {
        if (v >= 1 && v <= 4) {
          notes.push({ time: timeAt(mi, j / q), value: v as 1 | 2 | 3 | 4, mi });
        }
      });
    });
    notes.sort((a, b) => a.time - b.time);
    return notes;
  }, [project, timeAt]);

  // 連打・風船の帯
  const rollDraws = useMemo<RollDraw[]>(
    () =>
      rollSpans.map((s) => ({
        start: timeAt(s.startM, s.startF),
        end: timeAt(s.endM, s.endF),
        type: s.type,
        count: s.type === 7 ? (project.metadata.balloon[s.balloonIndex] ?? 5) : null,
        mi: s.startM,
      })),
    [rollSpans, project, timeAt],
  );

  const start = useCallback(() => {
    const mi = Math.min(playFromMeasure - 1, timings.length - 1);
    // いきなり始まると目で追えないので、1.5秒〜1小節ぶんの助走を入れる
    const startT = timings[mi]?.startTime ?? 0;
    const leadIn = Math.min(3, Math.max(1.5, timings[mi]?.duration ?? 2));
    player.play(startT - leadIn);
  }, [playFromMeasure, timings, player]);

  /** Q or タップ: 一時停止 ⇄ 再開 */
  const togglePause = useCallback(() => {
    if (player.isPlaying) player.pause();
    else if (player.playheadRef.current > -10 && player.playhead !== 0) {
      player.play(player.playheadRef.current);
    } else {
      start();
    }
  }, [player, start]);

  /** 一時停止中に ← → で開始小節を移動する */
  const seekMeasure = useCallback(
    (delta: number) => {
      if (player.isPlaying) return;
      const now = player.playheadRef.current;
      let mi = timings.findIndex((t) => now >= t.startTime && now < t.startTime + t.duration);
      if (mi < 0) mi = Math.min(playFromMeasure - 1, timings.length - 1);
      mi = Math.min(timings.length - 1, Math.max(0, mi + delta));
      onChangePlayFrom(mi + 1);
      player.seek(timings[mi].startTime);
    },
    [player, timings, playFromMeasure, onChangePlayFrom],
  );

  // キーボード（Q・←→のみ）
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
      if (e.key.toLowerCase() === 'q' || e.key === ' ') {
        e.preventDefault();
        if (!e.repeat) togglePause();
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        seekMeasure(e.key === 'ArrowRight' ? 1 : -1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePause, seekMeasure]);

  // ---- 描画ループ ----
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !wrap) return;
      const W = wrap.clientWidth;
      const H = 230;
      if (canvas.width !== W) canvas.width = W;
      if (canvas.height !== H) canvas.height = H;
      const ctx = canvas.getContext('2d')!;
      const now = player.playheadRef.current;

      const laneY = 60;
      const laneH = 110;
      const cy = laneY + laneH / 2;
      const mobile = W < 620;
      const noteR = mobile ? 15 : NOTE_R;
      const bigR = mobile ? 22 : BIG_R;
      const ppb = 2 * noteR * (76 / 23);
      const hitX = mobile ? 60 : 110;

      // 現在の小節（ゴーゴー判定）
      let inGogo = false;
      for (let i = 0; i < timings.length; i++) {
        const t = timings[i];
        if (now >= t.startTime && now < t.startTime + t.duration) {
          inGogo = project.measures[i]?.gogo ?? false;
          break;
        }
      }

      // 背景
      ctx.fillStyle = '#171512';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = inGogo ? '#553530' : '#3d3934';
      ctx.fillRect(0, laneY, W, laneH);
      ctx.fillStyle = '#2c2925';
      ctx.fillRect(0, laneY, W, 8);
      ctx.fillRect(0, laneY + laneH - 8, W, 8);

      const speedOf = (t: MeasureTiming) => (t.bpm / 60) * ppb * t.scroll;

      // 小節線
      ctx.strokeStyle = '#5c574f';
      ctx.lineWidth = 2;
      for (const t of timings) {
        const x = hitX + (t.startTime - now) * speedOf(t);
        if (x < -10 || x > W + 10) continue;
        ctx.beginPath();
        ctx.moveTo(x, laneY + 8);
        ctx.lineTo(x, laneY + laneH - 8);
        ctx.stroke();
      }

      // 判定枠
      ctx.strokeStyle = '#b8b0a0';
      ctx.lineWidth = 3;
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
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#fff';
        ctx.stroke();
        ctx.lineWidth = 1.5;
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

      // 連打・風船の帯（終端が判定枠を過ぎるまで表示）
      for (const r of rollDraws) {
        const t1 = timings[r.mi];
        const x1 = Math.max(hitX, hitX + (r.start - now) * speedOf(t1));
        const x2 = hitX + (r.end - now) * speedOf(t1);
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
          ctx.lineWidth = 3;
          ctx.stroke();
          drawNote(x1, cy, rad, '#e6b422', '連');
        }
      }

      // 通常ノーツ（未到達分だけレーンに描く。後ろから=先のノーツが上）
      for (let i = laneNotes.length - 1; i >= 0; i--) {
        const n = laneNotes[i];
        if (n.time <= now) continue; // 叩かれた分は飛翔側で描く
        const t = timings[n.mi];
        const x = hitX + (n.time - now) * speedOf(t);
        if (x < -50 || x > W + 50) continue;
        const big = n.value === 3 || n.value === 4;
        const don = n.value === 1 || n.value === 3;
        drawNote(x, cy, big ? bigR : noteR, don ? '#e0452a' : '#2a7fc4');
      }

      // 叩かれたノーツが右上へ飛んでいく演出（連打の自動ドンも飛ぶ）
      const tx = W - 34;
      const ty = 22;
      for (const e of events) {
        const p = (now - e.time) / FLY_SEC;
        if (p < 0 || p >= 1) continue;
        const big = e.type === 'bigDon' || e.type === 'bigKa';
        const don = e.type === 'don' || e.type === 'bigDon';
        // 判定枠から右上コーナーへ、山なりの軌道（2次ベジェ）で飛ばす
        const q = 1 - p;
        const cx2 = hitX + (tx - hitX) * 0.35;
        const cy2 = laneY - 55;
        const x = q * q * hitX + 2 * q * p * cx2 + p * p * tx;
        const y = q * q * cy + 2 * q * p * cy2 + p * p * ty;
        const r = (big ? bigR : noteR) * (1 - 0.45 * p);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = don ? '#e0452a' : '#2a7fc4';
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#fff';
        ctx.stroke();
      }

      // HUD
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#e8e4da';
      ctx.font = 'bold 14px sans-serif';
      let passed = 0;
      for (const n of laneNotes) {
        if (n.time <= now) passed += 1;
        else break;
      }
      ctx.fillText(`オート再生  ${passed} / ${laneNotes.length}`, 12, 24);
      if (passed >= 2 && player.isPlaying) {
        ctx.textAlign = 'center';
        ctx.font = 'bold 26px sans-serif';
        ctx.fillStyle = '#ffd23f';
        ctx.fillText(`${passed} コンボ`, W / 2, 44);
      }

      // 一時停止中の操作ガイド
      if (!player.isPlaying && player.playheadRef.current !== 0) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fillRect(0, laneY, W, 34);
        ctx.textAlign = 'center';
        ctx.font = 'bold 15px sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText('一時停止中： タップ / Q = 再開 ・ ← → = 小節移動', W / 2, laneY + 23);
      } else if (!player.isPlaying) {
        ctx.textAlign = 'center';
        ctx.font = '14px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillText('▶ スタート（またはタップ）でオート再生が始まります', W / 2, cy + 4);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [player, timings, chartEnd, project, laneNotes, rollDraws, events]);

  return (
    <div className="play-view">
      <div className="play-controls">
        <button type="button" className="primary" onClick={start}>
          ▶ スタート
        </button>
        <button type="button" onClick={togglePause}>⏸ 一時停止/再開 (Q)</button>
        <button type="button" onClick={() => player.stop()}>⏹ 停止</button>
        <button
          type="button"
          disabled={player.isPlaying}
          title="一時停止中に前の小節へ（←キーでも可）"
          onClick={() => seekMeasure(-1)}
        >
          ◀ 小節
        </button>
        <button
          type="button"
          disabled={player.isPlaying}
          title="一時停止中に次の小節へ（→キーでも可）"
          onClick={() => seekMeasure(1)}
        >
          小節 ▶
        </button>
        <label className="inline">
          小節
          <select
            value={Math.min(playFromMeasure, timings.length)}
            onChange={(e) => onChangePlayFrom(Number(e.target.value))}
          >
            {timings.map((_, i) => (
              <option key={i} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
          から
        </label>
      </div>
      <div className="play-canvas-wrap" ref={wrapRef}>
        {/* タップ = 一時停止/再開 */}
        <canvas
          ref={canvasRef}
          height={230}
          onPointerDown={(e) => {
            e.preventDefault();
            togglePause();
          }}
        />
      </div>
      <p className="play-hint">
        譜面がオートで演奏されます。スタート時は約1.5秒〜1小節ぶんの助走が入ります。
        音とノーツ表示がズレて感じる場合は「オフセット調整」の再生環境補正を使ってください（tjaには出力されません）。
      </p>
    </div>
  );
}
