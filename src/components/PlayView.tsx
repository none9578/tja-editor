import { useCallback, useEffect, useRef, useState } from 'react';
import { Project } from '../types';
import { MeasureTiming } from '../utils/timing';
import { RollSpan } from '../utils/rolls';
import { Player } from '../hooks/usePlayer';

/**
 * プレイ画面: ノーツが右から流れてきて、キーで叩いて判定する。
 * デフォルトキー: ドン = F / J、カッ = D / K（変更可・localStorage保存）
 * 判定幅（鬼準拠）: 良 ±25ms / 可 ±75ms / 不可 ±108ms
 */

const GOOD = 0.025;
const OK = 0.075;
const BAD = 0.108;

/**
 * ノーツの流れる速さは「1拍 = ノーツ直径 × 76/23 px」（編集画面と同じ重なり具合）。
 * 16分で少し重なり、12分でギリギリ重ならない太鼓の達人風の見た目が
 * BPMに応じたスクロール速度を理論的に決める。実際のppbは画面幅に応じて描画時に計算する。
 */
const NOTE_R = 21;
const BIG_R = 30;

const KEYS_STORAGE = 'tja-editor:playkeys:v1';
const JUDGE_OFFSET_KEY = 'tja-editor:judgeoffset';

interface KeyConfig {
  don: [string, string];
  ka: [string, string];
}

function loadKeys(): KeyConfig {
  try {
    const raw = localStorage.getItem(KEYS_STORAGE);
    if (raw) {
      const k = JSON.parse(raw) as KeyConfig;
      if (k.don?.length === 2 && k.ka?.length === 2) return k;
    }
  } catch {
    /* ignore */
  }
  return { don: ['f', 'j'], ka: ['d', 'k'] };
}

interface JNote {
  time: number;
  value: 1 | 2 | 3 | 4;
  /** pending=未判定 hit=叩いた miss=逃した */
  state: 'pending' | 'hit' | 'miss';
  mi: number;
}

interface JRoll {
  start: number;
  end: number;
  type: 5 | 6 | 7;
  count: number; // 風船の必要打数（連打はInfinity）
  hits: number;
  popped: boolean;
  mi: number;
}

interface Session {
  notes: JNote[];
  rolls: JRoll[];
  combo: number;
  maxCombo: number;
  good: number;
  ok: number;
  bad: number;
  rollHits: number;
}

interface Flash {
  text: string;
  color: string;
  until: number;
}

interface Props {
  project: Project;
  timings: MeasureTiming[];
  rollSpans: RollSpan[];
  player: Player;
  chartEnd: number;
  playFromMeasure: number;
  onChangePlayFrom: (measureNo: number) => void;
}

export default function PlayView({
  project,
  timings,
  rollSpans,
  player,
  chartEnd,
  playFromMeasure,
  onChangePlayFrom,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<Session | null>(null);
  const flashRef = useRef<Flash | null>(null);
  const finishedRef = useRef(false);

  const [keys, setKeys] = useState<KeyConfig>(loadKeys);
  const [capturing, setCapturing] = useState<{ drum: 'don' | 'ka'; idx: 0 | 1 } | null>(null);
  const [results, setResults] = useState<Session | null>(null);
  // キー入力の遅延補正（秒）。tjaのOFFSETとは独立で、この端末にのみ保存される
  const [judgeOffset, setJudgeOffset] = useState(() => {
    const v = Number(localStorage.getItem(JUDGE_OFFSET_KEY));
    return Number.isFinite(v) ? v : 0;
  });

  const keysRef = useRef(keys);
  keysRef.current = keys;
  const capturingRef = useRef(capturing);
  capturingRef.current = capturing;
  const judgeOffsetRef = useRef(judgeOffset);
  judgeOffsetRef.current = judgeOffset;

  useEffect(() => {
    localStorage.setItem(JUDGE_OFFSET_KEY, String(judgeOffset));
  }, [judgeOffset]);

  const timeAt = useCallback(
    (mi: number, frac: number) => timings[mi].startTime + timings[mi].duration * frac,
    [timings],
  );

  const buildSession = useCallback((): Session => {
    const notes: JNote[] = [];
    project.measures.forEach((m, mi) => {
      const q = m.notes.length;
      m.notes.forEach((v, j) => {
        if (v >= 1 && v <= 4) {
          notes.push({ time: timeAt(mi, j / q), value: v as 1 | 2 | 3 | 4, state: 'pending', mi });
        }
      });
    });
    notes.sort((a, b) => a.time - b.time);
    const rolls: JRoll[] = rollSpans.map((s) => ({
      start: timeAt(s.startM, s.startF),
      end: timeAt(s.endM, s.endF),
      type: s.type,
      count: s.type === 7 ? (project.metadata.balloon[s.balloonIndex] ?? 5) : Infinity,
      hits: 0,
      popped: false,
      mi: s.startM,
    }));
    return { notes, rolls, combo: 0, maxCombo: 0, good: 0, ok: 0, bad: 0, rollHits: 0 };
  }, [project, rollSpans, timeAt]);

  const start = useCallback(() => {
    const mi = Math.min(playFromMeasure - 1, timings.length - 1);
    sessionRef.current = buildSession();
    finishedRef.current = false;
    flashRef.current = null;
    setResults(null);
    // いきなり始まると焦るので、1.5秒〜1小節ぶんの助走を入れてから再生する
    const startT = timings[mi]?.startTime ?? 0;
    const leadIn = Math.min(3, Math.max(1.5, timings[mi]?.duration ?? 2));
    player.play(startT - leadIn);
  }, [playFromMeasure, timings, buildSession, player]);

  /** Q: 一時停止 ⇄ 再開（太鼓さん次郎と同じ操作） */
  const togglePause = useCallback(() => {
    if (player.isPlaying) {
      player.pause();
    } else if (sessionRef.current && !finishedRef.current) {
      player.play(player.playheadRef.current);
    } else {
      start();
    }
  }, [player, start]);

  /** 一時停止中に ← → で開始小節を移動する（セッションは作り直し） */
  const seekMeasure = useCallback(
    (delta: number) => {
      if (player.isPlaying) return;
      const now = player.playheadRef.current;
      let mi = timings.findIndex((t) => now >= t.startTime && now < t.startTime + t.duration);
      if (mi < 0) mi = Math.min(playFromMeasure - 1, timings.length - 1);
      mi = Math.min(timings.length - 1, Math.max(0, mi + delta));
      onChangePlayFrom(mi + 1);
      sessionRef.current = buildSession();
      finishedRef.current = false;
      setResults(null);
      player.seek(timings[mi].startTime);
    },
    [player, timings, playFromMeasure, onChangePlayFrom, buildSession],
  );

  // ---- 入力判定 ----
  const hit = useCallback(
    (drum: 'don' | 'ka', big: boolean) => {
      player.preview(drum === 'don' ? (big ? 'bigDon' : 'don') : big ? 'bigKa' : 'ka');
      const s = sessionRef.current;
      if (!s || !player.isPlaying) return;
      // 判定調整: キー入力遅延ぶんだけ「叩いた時刻」を補正する
      const now = player.playheadRef.current - judgeOffsetRef.current;

      // 連打・風船の区間内か
      for (const r of s.rolls) {
        if (now < r.start - 0.02 || now > r.end + 0.02) continue;
        if (r.type === 7) {
          if (drum !== 'don' || r.popped) continue;
          r.hits += 1;
          s.rollHits += 1;
          if (r.hits >= r.count) {
            r.popped = true;
            flashRef.current = { text: '破裂！', color: '#f08830', until: performance.now() + 500 };
          }
        } else {
          r.hits += 1;
          s.rollHits += 1;
        }
        return;
      }

      // 最寄りの未判定ノーツ
      let best: JNote | null = null;
      let bestDist = BAD;
      for (const n of s.notes) {
        if (n.state !== 'pending') continue;
        const d = Math.abs(n.time - now);
        if (d < bestDist) {
          bestDist = d;
          best = n;
        }
        if (n.time - now > BAD) break;
      }
      if (!best) return;
      const expected = best.value === 1 || best.value === 3 ? 'don' : 'ka';
      best.state = 'hit';
      if (drum !== expected || bestDist > OK) {
        best.state = drum !== expected ? 'miss' : 'hit';
        s.bad += 1;
        s.combo = 0;
        flashRef.current = { text: '不可', color: '#9aa0a6', until: performance.now() + 350 };
        return;
      }
      if (bestDist <= GOOD) {
        s.good += 1;
        flashRef.current = { text: '良', color: '#ffb01f', until: performance.now() + 350 };
      } else {
        s.ok += 1;
        flashRef.current = { text: '可', color: '#e8e6e0', until: performance.now() + 350 };
      }
      s.combo += 1;
      s.maxCombo = Math.max(s.maxCombo, s.combo);
    },
    [player],
  );

  // ---- キーボード ----
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
      const key = e.key.toLowerCase();

      const cap = capturingRef.current;
      if (cap) {
        e.preventDefault();
        setKeys((prev) => {
          const next: KeyConfig = { don: [...prev.don], ka: [...prev.ka] } as KeyConfig;
          next[cap.drum][cap.idx] = key;
          localStorage.setItem(KEYS_STORAGE, JSON.stringify(next));
          return next;
        });
        setCapturing(null);
        return;
      }

      if (key === 'q') {
        e.preventDefault();
        if (!e.repeat) togglePause();
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        seekMeasure(e.key === 'ArrowRight' ? 1 : -1);
        return;
      }

      if (e.repeat) return;
      const k = keysRef.current;
      if (k.don.includes(key)) {
        e.preventDefault();
        hit('don', false);
      } else if (k.ka.includes(key)) {
        e.preventDefault();
        hit('ka', false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hit, togglePause, seekMeasure]);

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
      const s = sessionRef.current;

      // 見逃し処理
      if (s && player.isPlaying) {
        for (const n of s.notes) {
          if (n.state === 'pending' && n.time < now - BAD) {
            n.state = 'miss';
            s.bad += 1;
            s.combo = 0;
          }
          if (n.time > now) break;
        }
      }

      // 終了検出
      if (s && !player.isPlaying && !finishedRef.current && now >= chartEnd - 0.1) {
        finishedRef.current = true;
        setResults({ ...s });
      }

      const laneY = 60;
      const laneH = 110;
      const cy = laneY + laneH / 2;
      // 狭い画面（スマホ）ではノーツと判定枠を小さくして見える範囲を確保する
      const mobile = W < 620;
      const noteR = mobile ? 15 : NOTE_R;
      const bigR = mobile ? 22 : BIG_R;
      const ppb = 2 * noteR * (76 / 23);
      const hitX = mobile ? 60 : 110;

      // 背景（ゴーゴータイム中はレーンを赤っぽくする）
      let inGogo = false;
      for (let i = 0; i < timings.length; i++) {
        const t = timings[i];
        if (now >= t.startTime && now < t.startTime + t.duration) {
          inGogo = project.measures[i]?.gogo ?? false;
          break;
        }
      }
      ctx.fillStyle = '#171512';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = inGogo ? '#553530' : '#3d3934';
      ctx.fillRect(0, laneY, W, laneH);
      ctx.fillStyle = '#2c2925';
      ctx.fillRect(0, laneY, W, 8);
      ctx.fillRect(0, laneY + laneH - 8, W, 8);

      // 編集画面と同じ重なり具合になる理論スクロール速度（px/秒）
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

      const drawNote = (x: number, r: number, fill: string, text?: string) => {
        ctx.beginPath();
        ctx.arc(x, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#fff';
        ctx.stroke();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.beginPath();
        ctx.arc(x, cy, r + 2, 0, Math.PI * 2);
        ctx.stroke();
        if (text) {
          ctx.fillStyle = '#fff';
          ctx.font = `bold ${r * 0.8}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, x, cy + 1);
        }
      };

      if (s) {
        // 連打・風船（帯）
        for (const r of s.rolls) {
          const t1 = timings[r.mi];
          const x1 = hitX + (r.start - now) * speedOf(t1);
          const x2 = hitX + (r.end - now) * speedOf(t1);
          if (x2 < -60 || x1 > W + 60) continue;
          const rad = r.type === 6 ? bigR : noteR;
          const color = r.type === 7 ? '#f08830' : '#e6b422';
          if (r.type === 7) {
            if (!r.popped) {
              const bx = Math.max(x1, hitX);
              drawNote(Math.min(bx, x2), noteR, color, `${Math.max(0, r.count - r.hits)}`);
            }
          } else {
            ctx.fillStyle = color;
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
            drawNote(x1, rad, '#e6b422', '連');
          }
        }
        // 通常ノーツ（後ろから描く＝先のノーツが上）
        for (let i = s.notes.length - 1; i >= 0; i--) {
          const n = s.notes[i];
          if (n.state === 'hit') continue;
          const t = timings[n.mi];
          const x = hitX + (n.time - now) * speedOf(t);
          if (x < -50 || x > W + 50) continue;
          const big = n.value === 3 || n.value === 4;
          const don = n.value === 1 || n.value === 3;
          drawNote(x, big ? bigR : noteR, don ? '#e0452a' : '#2a7fc4');
        }
      }

      // HUD
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#e8e4da';
      ctx.font = 'bold 15px sans-serif';
      if (s) {
        ctx.fillText(
          `良 ${s.good}   可 ${s.ok}   不可 ${s.bad}   連打 ${s.rollHits}`,
          12,
          24,
        );
        if (s.combo >= 2) {
          ctx.textAlign = 'center';
          ctx.font = 'bold 26px sans-serif';
          ctx.fillStyle = '#ffd23f';
          ctx.fillText(`${s.combo} コンボ`, W / 2, 40);
          ctx.textAlign = 'left';
        }
      } else {
        ctx.fillText('「スタート」を押してプレイ開始（ドン: F/J・カッ: D/K・Q: 一時停止）', 12, 24);
      }

      // 判定表示
      const flash = flashRef.current;
      if (flash && performance.now() < flash.until) {
        ctx.textAlign = 'center';
        ctx.font = 'bold 24px sans-serif';
        ctx.fillStyle = flash.color;
        ctx.fillText(flash.text, hitX, laneY - 8);
      }

      // タップゾーンのガイド（開始前・一時停止中に表示）
      const showGuide = !s || (!player.isPlaying && !finishedRef.current);
      if (showGuide) {
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
        for (const gx of [W * 0.25, W * 0.75]) {
          ctx.beginPath();
          ctx.moveTo(gx, laneY);
          ctx.lineTo(gx, laneY + laneH);
          ctx.stroke();
        }
        ctx.restore();
        ctx.textAlign = 'center';
        ctx.font = '12px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        const gy = laneY + laneH - 12;
        ctx.fillText('タップ: カッ', W * 0.125, gy);
        ctx.fillText('タップ: ドン', W * 0.5, gy);
        ctx.fillText('タップ: カッ', W * 0.875, gy);
      }

      // 一時停止中の操作ガイド
      if (s && !player.isPlaying && !finishedRef.current) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fillRect(0, laneY, W, 34);
        ctx.textAlign = 'center';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText('一時停止中： Q or ⏸ = 再開 ／ ← → = 小節を移動', W / 2, laneY + 23);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [player, timings, chartEnd, project]);

  const keyLabel = (k: string) => (k === ' ' ? 'Space' : k.toUpperCase());

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
        <label
          className="inline"
          title="キー入力の遅延補正。ちゃんと叩いているのに「遅い」判定になるならプラスに、「早い」判定になるならマイナスにしてください。tjaには出力されません。"
        >
          判定調整
          <input
            type="number"
            step={1}
            value={Math.round(judgeOffset * 1000)}
            onChange={(e) => setJudgeOffset(Number(e.target.value) / 1000)}
            style={{ width: 64 }}
          />
          ms
        </label>
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
        <span className="play-keys">
          ドン:
          {([0, 1] as const).map((i) => (
            <button
              key={`d${i}`}
              type="button"
              className={`mini ${capturing?.drum === 'don' && capturing.idx === i ? 'capturing' : ''}`}
              title="クリックして新しいキーを押すと変更できます"
              onClick={() => setCapturing({ drum: 'don', idx: i })}
            >
              {capturing?.drum === 'don' && capturing.idx === i ? '…' : keyLabel(keys.don[i])}
            </button>
          ))}
          カッ:
          {([0, 1] as const).map((i) => (
            <button
              key={`k${i}`}
              type="button"
              className={`mini ${capturing?.drum === 'ka' && capturing.idx === i ? 'capturing' : ''}`}
              title="クリックして新しいキーを押すと変更できます"
              onClick={() => setCapturing({ drum: 'ka', idx: i })}
            >
              {capturing?.drum === 'ka' && capturing.idx === i ? '…' : keyLabel(keys.ka[i])}
            </button>
          ))}
        </span>
      </div>
      <div className="play-canvas-wrap" ref={wrapRef}>
        {/* タップ演奏: 左右の端(1/4ずつ)=カッ、中央=ドン。マルチタッチ対応 */}
        <canvas
          ref={canvasRef}
          height={230}
          onPointerDown={(e) => {
            e.preventDefault();
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const isKa = x < rect.width * 0.25 || x > rect.width * 0.75;
            hit(isKa ? 'ka' : 'don', false);
          }}
        />
        {results && (
          <div className="play-results">
            <h3>リザルト</h3>
            <table>
              <tbody>
                <tr><td>良</td><td>{results.good}</td></tr>
                <tr><td>可</td><td>{results.ok}</td></tr>
                <tr><td>不可</td><td>{results.bad}</td></tr>
                <tr><td>最大コンボ</td><td>{results.maxCombo}</td></tr>
                <tr><td>連打数</td><td>{results.rollHits}</td></tr>
              </tbody>
            </table>
            <button type="button" onClick={() => setResults(null)}>閉じる</button>
          </div>
        )}
      </div>
      <p className="play-hint">
        操作: ドン=F/J・カッ=D/K（変更可）／ Q=一時停止・再開 ／ 一時停止中に ← → で小節移動。
        スタート時は約1.5秒〜1小節ぶんの助走が入ります。風船は表示された残り打数ぶんドンを叩くと破裂します。
        判定幅: 良±25ms / 可±75ms / 不可±108ms。
        曲とノーツ表示がズレて感じる場合は「オフセット調整」の再生環境補正を、
        叩いた判定だけがズレる場合は上の「判定調整」を使ってください（どちらもtjaには出力されません）。
      </p>
    </div>
  );
}
