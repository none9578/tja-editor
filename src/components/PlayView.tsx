import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Project } from '../types';
import { MeasureTiming } from '../utils/timing';
import { RollSpan } from '../utils/rolls';
import { NoteEvent, Player } from '../hooks/usePlayer';
import { buildPlayData, liveLayout, renderPlayFrame } from '../utils/playRender';

/**
 * オート再生画面。
 * ノーツが右から流れてきて、判定枠に到達すると自動で叩かれ、右上へ飛んでいく。
 * 音はusePlayer側でサンプル精度にスケジュール済みなので、ここは描画だけを担当する。
 *
 * ノーツの流れる速さは「1拍 = ノーツ直径 × 76/23 px」（編集画面と同じ重なり具合）。
 * 描画本体は utils/playRender に一本化し、動画出力と共用する。
 */
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
  playFromMeasure,
  onChangePlayFrom,
  events,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 描画データ（画面表示・動画出力で共通に使う）
  const playData = useMemo(
    () => buildPlayData(project, timings, rollSpans, events),
    [project, timings, rollSpans, events],
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

  // ---- 描画ループ（描画本体は playRender に一本化。動画出力と共用） ----
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !wrap) return;
      const W = wrap.clientWidth;
      const mobile = W < 620;
      // 横に長い画面ほどレーン上下の黒帯を増やして、飛んでいくノーツの角度を確保する
      const H = mobile ? 230 : Math.min(420, Math.round(230 + (W - 620) * 0.5));
      if (canvas.width !== W) canvas.width = W;
      if (canvas.height !== H) canvas.height = H;
      const ctx = canvas.getContext('2d')!;
      renderPlayFrame(
        ctx,
        {
          W,
          H,
          now: player.playheadRef.current,
          isPlaying: player.isPlaying,
          started: player.playheadRef.current !== 0,
        },
        liveLayout(W, H),
        playData,
      );
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [player, playData]);

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
        <br />
        ※点数・魂ゲージは雰囲気を掴むための簡易シミュレーションです。実際の太鼓の達人などとは配点・ゲージの溜まり方が異なります。
      </p>
    </div>
  );
}
