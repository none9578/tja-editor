import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Measure, Metadata, NoteValue, Project } from './types';
import { cloneMeasure, createMeasure, createProject, normalizeProject, uid } from './project';
import { computeTimings, totalDuration } from './utils/timing';
import { validateProject } from './utils/validation';
import { computeStats } from './utils/stats';
import {
  clearRange,
  convertTimeSignature,
  eraseNear,
  inputPosFrac,
  inputSlotCount,
  setNoteAt,
} from './utils/noteOps';
import { computeRollSpans } from './utils/rolls';
import { useHistory } from './hooks/useHistory';
import { HitType, NoteEvent, usePlayer } from './hooks/usePlayer';
import { useIsMobile } from './hooks/useIsMobile';
import MobilePad from './components/MobilePad';
import ModeSelect, { UiMode } from './components/ModeSelect';
import MetadataForm from './components/MetadataForm';
import OffsetPanel from './components/OffsetPanel';
import AudioPanel from './components/AudioPanel';
import Transport from './components/Transport';
import Palette from './components/Palette';
import EditView, { MeasurePatch, NoteSelection } from './components/EditView';
import OverviewView from './components/OverviewView';
import PlayView from './components/PlayView';
import ExportPanel from './components/ExportPanel';
import StatsBar from './components/StatsBar';
import ValidationPanel from './components/ValidationPanel';

const STORAGE_KEY = 'tja-editor:project:v1';
const THEME_KEY = 'tja-editor:theme';
const CALIBRATION_KEY = 'tja-editor:calibration';
const UI_MODE_KEY = 'tja-editor:uimode';

function loadLastUiMode(): UiMode | null {
  const v = localStorage.getItem(UI_MODE_KEY);
  return v === 'pc' || v === 'mobile' ? v : null;
}

type Tab = 'edit' | 'overview' | 'play' | 'file';

function loadSavedProject(): Project | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Project;
    if (!data.metadata || !Array.isArray(data.measures) || data.measures.length === 0) return null;
    return normalizeProject(data);
  } catch {
    return null;
  }
}

function loadCalibration(): number {
  const v = Number(localStorage.getItem(CALIBRATION_KEY));
  return Number.isFinite(v) ? v : 0;
}

/** PC=常時表示のパネル、スマホ=折りたたみ式（タップで開閉）にして省スペース化 */
function PanelSection({
  title,
  mobile,
  children,
}: {
  title: string;
  mobile: boolean;
  children: ReactNode;
}) {
  if (mobile) {
    return (
      <details className="panel collapsible">
        <summary>{title}</summary>
        {children}
      </details>
    );
  }
  return (
    <section className="panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

const HIT_TYPE: Partial<Record<NoteValue, HitType>> = {
  1: 'don',
  2: 'ka',
  3: 'bigDon',
  4: 'bigKa',
};

/** 風船(7)の個数に合わせて BALLOON 配列の長さを自動調整する（値は保持、不足は5で補う） */
function syncBalloons(p: Project): Project {
  let count = 0;
  for (const m of p.measures) for (const v of m.notes) if (v === 7) count += 1;
  if (count === p.metadata.balloon.length) return p;
  const balloon = p.metadata.balloon.slice(0, count);
  while (balloon.length < count) balloon.push(5);
  return { ...p, metadata: { ...p.metadata, balloon } };
}

export default function App() {
  const initial = useMemo(() => loadSavedProject() ?? createProject(), []);
  const { state: project, commit, reset, undo, redo, canUndo, canRedo } = useHistory(initial);

  const [tab, setTab] = useState<Tab>('edit');
  const [inputUnit, setInputUnit] = useState(16);
  const [selectedNote, setSelectedNote] = useState<NoteValue>(1);
  const [eraser, setEraser] = useState(false);
  const [cursor, setCursor] = useState<{ measure: number; slot: number } | null>(null);
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [noteSel, setNoteSel] = useState<NoteSelection | null>(null);
  const [clipboard, setClipboard] = useState<Measure[]>([]);
  const [playFromMeasure, setPlayFromMeasure] = useState(1);
  const [dark, setDark] = useState(() => localStorage.getItem(THEME_KEY) === 'dark');
  const [calibration, setCalibration] = useState(loadCalibration);
  // 画面モードは自動判定せず、起動時にユーザーが選ぶ（nullの間は選択画面を表示）
  const [uiMode, setUiMode] = useState<UiMode | null>(null);
  const deviceMobile = useIsMobile(); // 選択画面の「おすすめ」表示にだけ使う
  const isMobile = uiMode === 'mobile';

  const selectUiMode = useCallback((mode: UiMode) => {
    setUiMode(mode);
    localStorage.setItem(UI_MODE_KEY, mode);
  }, []);

  const headerRef = useRef<HTMLElement>(null);

  const timings = useMemo(() => computeTimings(project), [project]);
  const chartEnd = useMemo(() => totalDuration(timings), [timings]);
  const issues = useMemo(() => validateProject(project), [project]);
  const stats = useMemo(() => computeStats(project, timings), [project, timings]);
  const rollSpans = useMemo(() => computeRollSpans(project.measures), [project]);

  const timeAt = useCallback(
    (mi: number, frac: number) => timings[mi].startTime + timings[mi].duration * frac,
    [timings],
  );

  // 再生時の自動ヒット音イベント。
  // 通常ノーツに加え、連打は20分音符間隔の自動ドンに展開する。
  // 風船は「開始〜終了の区間で必要打数をちょうど叩き終わる」ように均等配分し、
  // 最後の1打が終了位置に一致する（＝そこで破裂する）。
  const autoEvents = useMemo<NoteEvent[]>(() => {
    const events: NoteEvent[] = [];
    project.measures.forEach((m, mi) => {
      const q = m.notes.length;
      m.notes.forEach((v, j) => {
        const type = HIT_TYPE[v];
        if (type) events.push({ time: timeAt(mi, j / q), type });
      });
    });
    for (const s of rollSpans) {
      const startT = timeAt(s.startM, s.startF);
      const endT = timeAt(s.endM, s.endF);
      if (s.type === 7) {
        const count = project.metadata.balloon[s.balloonIndex] ?? 5;
        const dur = endT - startT;
        if (dur > 1e-4 && count > 0) {
          if (count === 1) {
            events.push({ time: endT, type: 'don' });
          } else {
            for (let i = 0; i < count; i++) {
              events.push({ time: startT + (dur * i) / (count - 1), type: 'don' });
            }
          }
        }
      } else {
        const bpm = timings[s.startM].bpm;
        const interval = (60 / bpm) * (4 / 20); // 20分音符間隔
        for (let t = startT; t < endT - 1e-4; t += interval) {
          events.push({ time: t, type: s.type === 6 ? 'bigDon' : 'don' });
        }
      }
    }
    events.sort((a, b) => a.time - b.time);
    return events;
  }, [project, timings, rollSpans, timeAt]);

  // 再生同期は「OFFSET + 環境補正」で行う（補正はTJAに出力しない）
  const player = usePlayer(project.metadata.offset + calibration, autoEvents, chartEnd);
  const playerRef = useRef(player);
  playerRef.current = player;

  // 固定ヘッダの実高さをCSS変数に反映（折り返しで高さが変わるため実測する）
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const update = () =>
      document.documentElement.style.setProperty('--header-h', `${el.offsetHeight}px`);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- ダークモード / 環境補正 / 自動保存 ----
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    localStorage.setItem(CALIBRATION_KEY, String(calibration));
  }, [calibration]);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
      } catch {
        // 容量オーバー等は無視
      }
    }, 500);
    return () => clearTimeout(t);
  }, [project]);

  // タブ切替時は再生を止める（キー操作や自動音の競合を避ける）
  const switchTab = useCallback((next: Tab) => {
    playerRef.current.pause();
    setTab(next);
  }, []);

  // 入力単位の変更: カーソルの「小節内の位置」を保ったまま、新単位の最寄りの線に載せ替える
  const changeInputUnit = useCallback(
    (unit: number) => {
      setCursor((c) => {
        if (!c) return c;
        const m = project.measures[c.measure];
        if (!m) return c;
        const oldSlots = inputSlotCount(m, inputUnit);
        const newSlots = inputSlotCount(m, unit);
        const k = Math.min(
          newSlots - 1,
          Math.max(0, Math.round((c.slot / oldSlots) * newSlots)),
        );
        return { measure: c.measure, slot: k };
      });
      setInputUnit(unit);
    },
    [project, inputUnit],
  );

  // ---- 編集操作 ----
  const updateMetadata = useCallback(
    (patch: Partial<Metadata>) => {
      commit((p) => ({ ...p, metadata: { ...p.metadata, ...patch } }));
    },
    [commit],
  );

  /** 入力単位のk番目の線にノーツを配置 */
  const placeAt = useCallback(
    (mi: number, k: number, value?: NoteValue) => {
      const v = value ?? (eraser ? 0 : selectedNote);
      commit((p) => {
        const m = p.measures[mi];
        if (!m) return p;
        const pos = inputPosFrac(m, inputUnit, k);
        const next = setNoteAt(m, pos, v);
        if (next === m) return p;
        const measures = [...p.measures];
        measures[mi] = next;
        return syncBalloons({ ...p, measures });
      });
      const type = HIT_TYPE[v];
      if (type) playerRef.current.preview(type);
    },
    [commit, eraser, selectedNote, inputUnit],
  );

  /** 位置frac付近のノーツを1つ消す（入力単位に関係なく最寄りを消せる） */
  const eraseAt = useCallback(
    (mi: number, frac: number) => {
      commit((p) => {
        const m = p.measures[mi];
        if (!m) return p;
        const slots = inputSlotCount(m, inputUnit);
        const { measure, erased } = eraseNear(m, frac, 0.5 / slots);
        if (!erased) return p;
        const measures = [...p.measures];
        measures[mi] = measure;
        return syncBalloons({ ...p, measures });
      });
    },
    [commit, inputUnit],
  );

  /** ノーツ範囲選択を削除 */
  const deleteNoteSelection = useCallback(() => {
    if (!noteSel) return;
    commit((p) => {
      const measures = [...p.measures];
      for (let mi = noteSel.aM; mi <= noteSel.bM && mi < measures.length; mi++) {
        const from = mi === noteSel.aM ? noteSel.aF : 0;
        const to = mi === noteSel.bM ? noteSel.bF : 1;
        measures[mi] = clearRange(measures[mi], from, to);
      }
      return syncBalloons({ ...p, measures });
    });
    setNoteSel(null);
  }, [commit, noteSel]);

  const changeMeasure = useCallback(
    (mi: number, patch: MeasurePatch) => {
      commit((p) => {
        const m = p.measures[mi];
        if (!m) return p;
        let next: Measure = { ...m };
        if (
          (patch.numerator != null && patch.numerator !== m.numerator) ||
          (patch.denominator != null && patch.denominator !== m.denominator)
        ) {
          const num = patch.numerator ?? m.numerator;
          const den = patch.denominator ?? m.denominator;
          if (num >= 1 && den >= 1) next = convertTimeSignature(next, num, den);
        }
        if ('bpmOverride' in patch) next = { ...next, bpmOverride: patch.bpmOverride ?? null };
        if ('scrollOverride' in patch)
          next = { ...next, scrollOverride: patch.scrollOverride ?? null };
        if (patch.gogo != null) next = { ...next, gogo: patch.gogo };
        const measures = [...p.measures];
        measures[mi] = next;
        return syncBalloons({ ...p, measures });
      });
    },
    [commit],
  );

  const addMeasure = useCallback(() => {
    commit((p) => {
      const last = p.measures[p.measures.length - 1];
      const m = last
        ? { ...createMeasure(16, last.numerator, last.denominator), gogo: last.gogo }
        : createMeasure();
      return { ...p, measures: [...p.measures, m] };
    });
  }, [commit]);

  const insertAfter = useCallback(
    (mi: number) => {
      commit((p) => {
        const base = p.measures[mi];
        const m = base
          ? { ...createMeasure(16, base.numerator, base.denominator), gogo: base.gogo }
          : createMeasure();
        const measures = [...p.measures];
        measures.splice(mi + 1, 0, m);
        return { ...p, measures };
      });
    },
    [commit],
  );

  const duplicateMeasure = useCallback(
    (mi: number) => {
      commit((p) => {
        const m = p.measures[mi];
        if (!m) return p;
        const measures = [...p.measures];
        measures.splice(mi + 1, 0, cloneMeasure(m));
        return syncBalloons({ ...p, measures });
      });
    },
    [commit],
  );

  const deleteMeasure = useCallback(
    (mi: number) => {
      commit((p) => {
        if (p.measures.length <= 1) return p;
        const measures = p.measures.filter((_, i) => i !== mi);
        return syncBalloons({ ...p, measures });
      });
      setSelection(null);
      setCursor(null);
      setNoteSel(null);
    },
    [commit],
  );

  const selectMeasure = useCallback((mi: number, shiftKey: boolean) => {
    setSelection((sel) => {
      if (shiftKey && sel) {
        return { start: Math.min(sel.start, mi), end: Math.max(sel.start, mi) };
      }
      return { start: mi, end: mi };
    });
    setPlayFromMeasure(mi + 1);
  }, []);

  const copySelection = useCallback(() => {
    if (!selection) return;
    setClipboard(
      project.measures
        .slice(selection.start, selection.end + 1)
        .map((m) => ({ ...m, notes: [...m.notes] })),
    );
  }, [selection, project]);

  const pasteClipboard = useCallback(() => {
    if (clipboard.length === 0) return;
    commit((p) => {
      const at = selection ? selection.end + 1 : p.measures.length;
      const copies = clipboard.map((m) => ({ ...m, id: uid(), notes: [...m.notes] }));
      const measures = [...p.measures];
      measures.splice(at, 0, ...copies);
      return syncBalloons({ ...p, measures });
    });
  }, [clipboard, selection, commit]);

  const deleteSelection = useCallback(() => {
    if (!selection) return;
    commit((p) => {
      const measures = p.measures.filter((_, i) => i < selection.start || i > selection.end);
      return syncBalloons({ ...p, measures: measures.length > 0 ? measures : [createMeasure()] });
    });
    setSelection(null);
    setCursor(null);
    setNoteSel(null);
  }, [selection, commit]);

  const newProject = useCallback(() => {
    if (!window.confirm('現在の譜面を破棄して新規作成しますか？（自動保存も上書きされます）')) return;
    reset(createProject());
    setSelection(null);
    setCursor(null);
    setNoteSel(null);
    setPlayFromMeasure(1);
  }, [reset]);

  const handleImport = useCallback(
    (imported: Project) => {
      reset(normalizeProject(imported));
      setSelection(null);
      setCursor(null);
      setNoteSel(null);
      setPlayFromMeasure(1);
    },
    [reset],
  );

  // ---- カーソル操作（キーボードとスマホ用パッドで共有） ----
  /** 入力単位の線に沿ってカーソルを移動する。小節が変われば小節選択も追従 */
  const moveCursorBy = useCallback(
    (dm: number, ds: number) => {
      const slotsOf = (mi: number) => inputSlotCount(project.measures[mi], inputUnit);
      const base = cursor ?? { measure: 0, slot: 0 };
      let m = Math.min(Math.max(base.measure + dm, 0), project.measures.length - 1);
      let s = dm !== 0 ? Math.min(base.slot, slotsOf(m) - 1) : base.slot + ds;
      if (ds !== 0) {
        if (s < 0) {
          if (base.measure > 0) {
            m = base.measure - 1;
            s = slotsOf(m) - 1;
          } else s = 0;
        } else if (s >= slotsOf(base.measure)) {
          if (base.measure < project.measures.length - 1) {
            m = base.measure + 1;
            s = 0;
          } else s = slotsOf(base.measure) - 1;
        }
      }
      setCursor({ measure: m, slot: s });
      if (m !== base.measure || !cursor) selectMeasure(m, false);
    },
    [cursor, project, inputUnit, selectMeasure],
  );

  /** カーソル位置にノーツを置いて次の線へ進む（テンポ入力） */
  const inputAtCursor = useCallback(
    (v: NoteValue) => {
      const slotsOf = (mi: number) => inputSlotCount(project.measures[mi], inputUnit);
      const cur = cursor ?? { measure: 0, slot: 0 };
      placeAt(cur.measure, cur.slot, v);
      let m = cur.measure;
      let s = cur.slot + 1;
      if (s >= slotsOf(m)) {
        if (m < project.measures.length - 1) {
          m += 1;
          s = 0;
          selectMeasure(m, false);
        } else s = cur.slot;
      }
      setCursor({ measure: m, slot: s });
    },
    [cursor, project, inputUnit, placeAt, selectMeasure],
  );

  /** カーソル位置のノーツを消す（進まない） */
  const clearAtCursor = useCallback(() => {
    if (cursor) placeAt(cursor.measure, cursor.slot, 0);
  }, [cursor, placeAt]);

  // ---- 再生 ----
  const playFrom = useCallback(
    (mi: number) => {
      const t = timings[mi];
      if (!t) return;
      setPlayFromMeasure(mi + 1);
      playerRef.current.play(t.startTime);
    },
    [timings],
  );

  const handlePlay = useCallback(() => {
    const mi = Math.min(playFromMeasure - 1, timings.length - 1);
    const resumeAt = playerRef.current.playhead;
    const from = resumeAt > 0 && resumeAt < chartEnd ? resumeAt : (timings[mi]?.startTime ?? 0);
    playerRef.current.play(from);
  }, [playFromMeasure, timings, chartEnd]);

  /** 小節プレビュー用: 一時停止して再生開始位置を前後の小節頭へ動かす
      （再生中でも止まる。再生は▶で行う）。
      戻る（d<0）は小節の途中なら常に現在の小節頭へ。頭にいるときだけ前の小節へ
      （音楽プレイヤーの曲戻しと同じ感覚） */
  const stepPlayMeasure = useCallback(
    (d: number) => {
      const wasActive = playerRef.current.isPlaying || playerRef.current.playheadRef.current > 0;
      playerRef.current.pause();
      const ph = playerRef.current.playheadRef.current;
      let cur = Math.min(playFromMeasure - 1, timings.length - 1);
      if (wasActive) {
        for (let i = 0; i < timings.length; i++) if (timings[i].startTime <= ph + 1e-3) cur = i;
        if (d < 0 && ph - timings[cur].startTime > 1e-3) d += 1;
      }
      const target = Math.min(Math.max(cur + d, 0), timings.length - 1);
      const t = timings[target];
      if (!t) return;
      setPlayFromMeasure(target + 1);
      playerRef.current.seek(t.startTime);
    },
    [playFromMeasure, timings],
  );

  const jumpTo = useCallback(
    (mi: number) => {
      const t = timings[mi];
      if (!t) return;
      setPlayFromMeasure(mi + 1);
      setSelection({ start: mi, end: mi });
      playerRef.current.seek(t.startTime);
    },
    [timings],
  );

  // ---- キーボード操作（編集タブのみ。プレイタブはPlayView側で処理） ----
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      // Undo / Redo / コピー / 貼り付け（全タブ共通）
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }

      if (tab !== 'edit') {
        if (e.key === ' ' && tab === 'overview') {
          e.preventDefault();
          if (playerRef.current.isPlaying) playerRef.current.pause();
          else handlePlay();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        copySelection();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        pasteClipboard();
        return;
      }

      if (e.key === ' ') {
        e.preventDefault();
        if (playerRef.current.isPlaying) playerRef.current.pause();
        else handlePlay();
        return;
      }

      if (e.key === 'Escape') {
        setNoteSel(null);
        return;
      }

      // カーソル移動（入力単位の線に沿って動く）
      const move = (dm: number, ds: number) => {
        e.preventDefault();
        moveCursorBy(dm, ds);
      };
      if (e.key === 'ArrowRight') return move(0, 1);
      if (e.key === 'ArrowLeft') return move(0, -1);
      if (e.key === 'ArrowDown') return move(1, 0);
      if (e.key === 'ArrowUp') return move(-1, 0);

      // Delete: 範囲選択があればそれを削除、なければカーソル位置を消す
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (noteSel) deleteNoteSelection();
        else clearAtCursor();
        return;
      }

      // ノーツ入力（カーソル線に配置して1つ進む）
      if (!cursor) return;
      const put = (v: NoteValue) => {
        e.preventDefault();
        inputAtCursor(v);
      };
      const key = e.key.toLowerCase();
      if (key === 'd') return put(e.shiftKey ? 3 : 1);
      if (key === 'k') return put(e.shiftKey ? 4 : 2);
      if (key === 'r') return put(e.shiftKey ? 6 : 5);
      if (key === 'b') return put(7);
      if (key === 'e') return put(8);
      if (key >= '0' && key <= '8' && key.length === 1) return put(Number(key) as NoteValue);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    tab,
    cursor,
    noteSel,
    moveCursorBy,
    inputAtCursor,
    clearAtCursor,
    deleteNoteSelection,
    undo,
    redo,
    copySelection,
    pasteClipboard,
    handlePlay,
  ]);

  // 起動直後はモード選択画面（広告スペース付き）を表示する
  if (uiMode === null) {
    return (
      <ModeSelect
        recommended={deviceMobile ? 'mobile' : 'pc'}
        last={loadLastUiMode()}
        onSelect={selectUiMode}
      />
    );
  }

  return (
    <div
      className={`app ${isMobile ? 'mode-mobile' : ''} ${isMobile && tab === 'edit' ? 'with-pad' : ''}`}
    >
      <header className="app-header" ref={headerRef}>
        <h1>TJA譜面エディタ</h1>
        <nav className="tab-bar">
          <button
            type="button"
            className={tab === 'edit' ? 'tab active' : 'tab'}
            onClick={() => switchTab('edit')}
          >
            ✏ 編集
          </button>
          <button
            type="button"
            className={tab === 'overview' ? 'tab active' : 'tab'}
            onClick={() => switchTab('overview')}
          >
            📜 全体
          </button>
          <button
            type="button"
            className={tab === 'play' ? 'tab active' : 'tab'}
            onClick={() => switchTab('play')}
          >
            🥁 オート再生
          </button>
          <button
            type="button"
            className={tab === 'file' ? 'tab active' : 'tab'}
            onClick={() => switchTab('file')}
          >
            📂 ファイル
          </button>
        </nav>
        <div className="header-buttons">
          <button type="button" onClick={undo} disabled={!canUndo} title="Ctrl+Z">
            ↩ 元に戻す
          </button>
          <button type="button" onClick={redo} disabled={!canRedo} title="Ctrl+Y">
            ↪ やり直す
          </button>
          <button type="button" title="新規作成（現在の譜面を破棄）" onClick={newProject}>
            🗋 新規
          </button>
          <button
            type="button"
            title="PC版とスマホ版を切り替える"
            onClick={() => selectUiMode(isMobile ? 'pc' : 'mobile')}
          >
            {isMobile ? '💻 PC版' : '📱 スマホ版'}
          </button>
          <button
            type="button"
            title={dark ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
            onClick={() => setDark((d) => !d)}
          >
            {dark ? '☀' : '🌙'}
          </button>
        </div>
      </header>

      {tab === 'edit' && (
        <div className="top-panels">
          <PanelSection title="曲情報（TJAメタデータ）" mobile={isMobile}>
            <MetadataForm
              metadata={project.metadata}
              balloonNoteCount={stats.balloonCount}
              onChange={updateMetadata}
            />
          </PanelSection>
          <PanelSection title="音源・オフセット調整" mobile={isMobile}>
            <AudioPanel
              audioInfo={player.audioInfo}
              hitSoundOn={player.hitSoundOn}
              musicVolume={player.musicVolume}
              onLoadFile={(f) => {
                player.loadAudioFile(f);
                updateMetadata({ wave: f.name });
              }}
              onToggleHitSound={player.setHitSoundOn}
              onChangeVolume={player.changeMusicVolume}
            />
            {!isMobile && <h2>オフセット調整</h2>}
            <OffsetPanel
              offset={project.metadata.offset}
              onChange={(v) => updateMetadata({ offset: v })}
              calibration={calibration}
              onCalibrationChange={setCalibration}
            />
          </PanelSection>
        </div>
      )}

      {tab === 'edit' && (
        <div className="sticky-bar">
          {!isMobile && (
            <Palette
              selected={selectedNote}
              eraser={eraser}
              inputUnit={inputUnit}
              onSelect={(v) => {
                setSelectedNote(v);
                setEraser(false);
              }}
              onToggleEraser={() => setEraser((x) => !x)}
              onChangeInputUnit={changeInputUnit}
              onPreview={player.preview}
            />
          )}
          <div className="selection-tools">
            <span className="selection-info">
              {noteSel
                ? `ノーツ範囲選択中（Delete で削除 / Esc で解除）`
                : selection
                  ? selection.start === selection.end
                    ? `小節${selection.start + 1}を選択中`
                    : `小節${selection.start + 1}〜${selection.end + 1}を選択中`
                  : 'ドラッグでノーツ範囲選択 / 小節ヘッダをクリックで小節選択（Shift+クリックで範囲）'}
            </span>
            {noteSel && (
              <button type="button" className="mini danger" onClick={deleteNoteSelection}>
                選択ノーツを削除
              </button>
            )}
            <button type="button" className="mini" disabled={!selection} onClick={copySelection}>
              小節コピー
            </button>
            <button
              type="button"
              className="mini"
              disabled={clipboard.length === 0}
              onClick={pasteClipboard}
            >
              貼り付け({clipboard.length})
            </button>
            <button
              type="button"
              className="mini danger"
              disabled={!selection}
              onClick={deleteSelection}
            >
              小節削除
            </button>
          </div>
        </div>
      )}

      {/* フローティング再生バー（スクロールしても常に手が届く）。
          スマホ編集時は入力パッド側に再生・停止があるため出さない。
          ファイルタブは再生と無関係なので出さない */}
      {(tab === 'overview' || (tab === 'edit' && !isMobile)) && (
        <Transport
          isPlaying={player.isPlaying}
          playhead={player.playhead}
          measureCount={project.measures.length}
          playFromMeasure={playFromMeasure}
          onChangePlayFrom={setPlayFromMeasure}
          onPlay={handlePlay}
          onPause={player.pause}
          onStop={player.stop}
          onPlayFromTop={() => playFrom(0)}
        />
      )}

      {tab === 'edit' && (
        <>
          <section className="panel grid-panel">
            <h2>譜面</h2>
            <EditView
              measures={project.measures}
              timings={timings}
              rollSpans={rollSpans}
              balloon={project.metadata.balloon}
              inputUnit={inputUnit}
              selection={selection}
              noteSel={noteSel}
              cursor={cursor}
              playhead={player.playhead}
              showPlayhead={player.isPlaying || player.playhead > 0}
              isPlaying={player.isPlaying}
              eraser={eraser}
              tapPlaces={!isMobile}
              onPlaceAt={placeAt}
              onEraseAt={eraseAt}
              onNoteSelChange={setNoteSel}
              onCursorChange={setCursor}
              onSelectMeasure={selectMeasure}
              onChangeMeasure={changeMeasure}
              onDuplicate={duplicateMeasure}
              onDelete={deleteMeasure}
              onInsertAfter={insertAfter}
              onPlayFrom={playFrom}
              onAddMeasure={addMeasure}
            />
          </section>

          <section className="panel">
            <h2>統計</h2>
            <StatsBar stats={stats} />
          </section>

          <section className="panel">
            <h2>チェック結果</h2>
            <ValidationPanel issues={issues} />
          </section>

          <footer className="app-footer">
            キー操作: D=ドン / K=カッ / Shift+D=大ドン / Shift+K=大カッ / R=連打 / Shift+R=大連打 /
            B=風船 / E=終了 / Delete=削除 / 矢印=カーソル移動 / Space=再生・一時停止 / Ctrl+Z=元に戻す
            ／ ドラッグ=ノーツ範囲選択
          </footer>
        </>
      )}

      {tab === 'file' && (
        <>
          <section className="panel">
            <h2>エクスポート / インポート</h2>
            <ExportPanel
              project={project}
              onImport={handleImport}
              onLoadJson={handleImport}
              getAudioFile={() => playerRef.current.getAudioFile()}
              onLoadAudio={(f) => playerRef.current.loadAudioFile(f)}
            />
          </section>

          <section className="panel">
            <h2>統計</h2>
            <StatsBar stats={stats} />
          </section>
        </>
      )}

      {tab === 'overview' && (
        <section className="panel">
          <h2>譜面全体（クリックでその小節へ移動）</h2>
          <OverviewView
            measures={project.measures}
            timings={timings}
            rollSpans={rollSpans}
            balloon={project.metadata.balloon}
            playhead={player.playhead}
            showPlayhead={player.isPlaying || player.playhead > 0}
            isPlaying={player.isPlaying}
            isMobile={isMobile}
            onJump={jumpTo}
          />
        </section>
      )}

      {isMobile && tab === 'edit' && (
        <MobilePad
          inputUnit={inputUnit}
          canUndo={canUndo}
          isPlaying={player.isPlaying}
          playhead={player.playhead}
          measureCount={project.measures.length}
          playFromMeasure={playFromMeasure}
          onChangeInputUnit={changeInputUnit}
          onMove={moveCursorBy}
          onInput={inputAtCursor}
          onClear={clearAtCursor}
          onUndo={undo}
          onPlayPause={() => (player.isPlaying ? player.pause() : handlePlay())}
          onStop={player.stop}
          onChangePlayFrom={setPlayFromMeasure}
          onStepMeasure={stepPlayMeasure}
        />
      )}

      {tab === 'play' && (
        <section className="panel">
          <PlayView
            project={project}
            timings={timings}
            rollSpans={rollSpans}
            player={player}
            chartEnd={chartEnd}
            playFromMeasure={playFromMeasure}
            onChangePlayFrom={setPlayFromMeasure}
            events={autoEvents}
          />
        </section>
      )}
    </div>
  );
}
