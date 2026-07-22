import { useRef, useState } from 'react';
import { Project } from '../types';
import { MeasureTiming } from '../utils/timing';
import { RollSpan } from '../utils/rolls';
import { NoteEvent } from '../hooks/usePlayer';
import { downloadBlob, generateTja, parseTja } from '../utils/tja';
import { makeZip } from '../utils/zip';
import { fileBaseName, ProjectFile, saveProjectJson } from '../utils/projectFile';
import { buildPlayData } from '../utils/playRender';
import { ExportAudio, exportPlayVideo } from '../utils/videoExport';

const VIDEO_SIZES = {
  s: { label: '小 (854×480)', w: 854, h: 480, bitrate: 2_500_000 },
  m: { label: '中 (1280×720)', w: 1280, h: 720, bitrate: 5_000_000 },
  l: { label: '大 (1920×1080)', w: 1920, h: 1080, bitrate: 9_000_000 },
} as const;

interface Props {
  project: Project;
  timings: MeasureTiming[];
  rollSpans: RollSpan[];
  events: NoteEvent[];
  onImport: (project: Project, warnings: string[]) => void;
  onLoadJson: (project: Project) => void;
  /** 読み込み済み音源の元ファイル（未読み込みならnull） */
  getAudioFile: () => File | null;
  onLoadAudio: (file: File) => void;
  getExportAudio: () => ExportAudio;
}

export default function ExportPanel({
  project,
  timings,
  rollSpans,
  events,
  onImport,
  onLoadJson,
  getAudioFile,
  onLoadAudio,
  getExportAudio,
}: Props) {
  const [preview, setPreview] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [courseChoices, setCourseChoices] = useState<Project[] | null>(null);
  const tjaInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  const measureCount = project.measures.length;
  // 数値ではなく文字列で保持する。数値stateだと「0」を「16」に打ち替えるとき
  // 一度「016」にしてから先頭の0を消す必要があり面倒なため（コピーメニューと同じ方針）。
  const [vidFrom, setVidFrom] = useState('1');
  const [vidTo, setVidTo] = useState(String(measureCount));
  const [vidSize, setVidSize] = useState<keyof typeof VIDEO_SIZES>('m');
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const previewRef = useRef<HTMLDivElement>(null);

  // 選んだ範囲＋助走＋余韻の合計時間（＝おおよその書き出し時間）
  // 空欄や不正値は1扱いにフォールバックしてクランプする
  const numFrom = Number.parseInt(vidFrom, 10) || 1;
  const numTo = Number.parseInt(vidTo, 10) || 1;
  const rangeA = Math.max(1, Math.min(numFrom, measureCount));
  const rangeB = Math.max(rangeA, Math.min(numTo, measureCount));
  const leadIn = timings.length > 0 ? Math.min(3, Math.max(1.5, timings[rangeA - 1].duration)) : 1.5;
  const outro = timings.length > 0 ? Math.min(3, Math.max(1.5, timings[rangeB - 1].duration)) : 1.5;
  const estSec =
    timings.length > 0
      ? timings[rangeB - 1].startTime +
        timings[rangeB - 1].duration -
        timings[rangeA - 1].startTime +
        leadIn +
        outro
      : 0;
  const fmtSec = (s: number) => {
    const n = Math.max(0, Math.ceil(s));
    return n >= 60 ? `${Math.floor(n / 60)}分${String(n % 60).padStart(2, '0')}秒` : `${n}秒`;
  };

  const exportVideo = async () => {
    const fromTime = timings[rangeA - 1].startTime;
    const toTime = timings[rangeB - 1].startTime + timings[rangeB - 1].duration;
    const size = VIDEO_SIZES[vidSize];
    setExporting(true);
    setProgress(0);
    setWarnings([]);
    try {
      const data = buildPlayData(project, timings, rollSpans, events);
      const { blob, ext } = await exportPlayVideo({
        data,
        events,
        audio: getExportAudio(),
        fromTime,
        toTime,
        leadIn,
        outro,
        width: size.w,
        height: size.h,
        bitrate: size.bitrate,
        onProgress: setProgress,
        onPreview: (cv) => {
          const box = previewRef.current;
          if (!box) return;
          box.innerHTML = '';
          cv.style.width = '100%';
          cv.style.height = 'auto';
          cv.style.display = 'block';
          box.appendChild(cv);
        },
      });
      downloadBlob(blob, `${fileBaseName(project)}_${rangeA}-${rangeB}.${ext}`);
      if (ext === 'webm') {
        setWarnings([
          'このブラウザはmp4録画に非対応のためwebmで書き出しました（YouTubeはそのまま投稿できます）。',
        ]);
      }
    } catch (e) {
      setWarnings([`動画の書き出しに失敗しました: ${e instanceof Error ? e.message : String(e)}`]);
    } finally {
      setExporting(false);
      if (previewRef.current) previewRef.current.innerHTML = '';
    }
  };

  const refresh = () => setPreview(generateTja(project));

  const download = () => {
    const text = generateTja(project);
    setPreview(text);
    downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), `${fileBaseName(project)}.tja`);
  };

  /** 読み込んだ音源ファイルをそのままダウンロードする */
  const downloadAudio = () => {
    const f = getAudioFile();
    if (f) downloadBlob(f, f.name);
  };

  /** .tja＋音源をzipで書き出す（太鼓さん大次郎などのzipインポート向け） */
  const downloadZip = async () => {
    const f = getAudioFile();
    if (!f) return;
    const text = generateTja(project);
    setPreview(text);
    const name = fileBaseName(project);
    const zip = makeZip([
      { name: `${name}.tja`, data: new TextEncoder().encode(text) },
      { name: f.name, data: new Uint8Array(await f.arrayBuffer()) },
    ]);
    downloadBlob(zip, `${name}.zip`);
  };

  const importTja = async (file: File) => {
    const text = await file.text();
    const result = parseTja(text);
    setWarnings(result.warnings);
    if (result.courses.length > 1) {
      // 複数コース入りのTJA → どのコースを読み込むか選んでもらう
      setCourseChoices(result.courses);
    } else {
      setCourseChoices(null);
      onImport(result.project, result.warnings);
    }
  };

  const chooseCourse = (p: Project) => {
    setCourseChoices(null);
    onImport(p, warnings);
  };

  const saveJson = async () => {
    const w = await saveProjectJson(project, getAudioFile());
    setWarnings(w ? [w] : []);
  };

  const loadJson = async (file: File) => {
    let data: ProjectFile;
    try {
      data = JSON.parse(await file.text()) as ProjectFile;
      if (!data.metadata || !Array.isArray(data.measures)) throw new Error('bad format');
    } catch {
      setWarnings(['プロジェクトJSONの読み込みに失敗しました。形式を確認してください。']);
      return;
    }
    const { audio, ...projectData } = data;
    onLoadJson(projectData as Project);
    if (audio?.dataUrl) {
      try {
        const buf = await (await fetch(audio.dataUrl)).arrayBuffer();
        onLoadAudio(new File([buf], audio.name));
      } catch {
        setWarnings(['埋め込み音源の復元に失敗しました。音源を読み込み直してください。']);
        return;
      }
    }
    setWarnings([]);
  };

  return (
    <div className="export-panel">
      <div className="export-buttons">
        <button type="button" className="primary" onClick={download}>
          ⬇ .tja をダウンロード
        </button>
        <button
          type="button"
          className="primary"
          disabled={!getAudioFile()}
          title="太鼓さん大次郎などのzipインポートにそのまま使えます"
          onClick={() => void downloadZip()}
        >
          ⬇ .tja＋音源をzipで
        </button>
        <button type="button" disabled={!getAudioFile()} onClick={downloadAudio}>
          ⬇ 音源をダウンロード
        </button>
        <button type="button" onClick={refresh}>TJAプレビューを更新</button>
        <button type="button" onClick={() => tjaInputRef.current?.click()}>
          ⬆ .tja をインポート
        </button>
        <button type="button" onClick={() => void saveJson()}>
          プロジェクトJSONを保存（音源込み）
        </button>
        <button type="button" onClick={() => jsonInputRef.current?.click()}>
          プロジェクトJSONを読み込み
        </button>
        {/* .tjaはOS未登録の拡張子で、acceptで絞る（MIME併記でも）と
            モバイルのピッカーで選択不可になるため、絞り込みなしにしている */}
        <input
          ref={tjaInputRef}
          type="file"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importTja(f);
            e.target.value = '';
          }}
        />
        {/* acceptで絞るとモバイルのピッカーで選択不可になる端末があるため絞らない
            （.tjaインポートと同じ対応。読み込み時にJSONとして検証している） */}
        <input
          ref={jsonInputRef}
          type="file"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void loadJson(f);
            e.target.value = '';
          }}
        />
      </div>

      {/* オート再生の動画出力（16:9・音声込み） */}
      <div className="video-export">
        <h3>オート再生の動画を書き出し</h3>
        <div className="video-export-row">
          <label className="inline">
            小節
            <input
              type="number"
              min={1}
              max={measureCount}
              value={vidFrom}
              disabled={exporting}
              onChange={(e) => setVidFrom(e.target.value)}
            />
            〜
            <input
              type="number"
              min={1}
              max={measureCount}
              value={vidTo}
              disabled={exporting}
              onChange={(e) => setVidTo(e.target.value)}
            />
          </label>
          <label className="inline">
            サイズ
            <select
              value={vidSize}
              disabled={exporting}
              onChange={(e) => setVidSize(e.target.value as keyof typeof VIDEO_SIZES)}
            >
              {Object.entries(VIDEO_SIZES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="primary" disabled={exporting} onClick={() => void exportVideo()}>
            {exporting ? `書き出し中… ${Math.round(progress * 100)}%` : '🎬 動画を書き出し'}
          </button>
          {!exporting && (
            <span className="video-export-est">予想時間: 約 {fmtSec(estSec)}</span>
          )}
        </div>

        {/* プレビュー領域は常時DOMに置く（録画開始直後に canvas を差し込むため）。
            非表示は exporting クラスで切り替える */}
        <div className={`video-export-live ${exporting ? 'active' : ''}`}>
          <div className="video-export-preview" ref={previewRef} />
          {exporting && (
            <div className="video-export-progress">
              <div className="video-export-bar">
                <div className="video-export-bar-fill" style={{ width: `${progress * 100}%` }} />
              </div>
              <span>
                {Math.round(progress * 100)}% ・ 残り 約 {fmtSec(estSec * (1 - progress))}
              </span>
            </div>
          )}
        </div>

        <p className="video-export-hint">
          16:9・音声込みで書き出します（曲は読み込んでいれば一緒に録音）。録画は実時間で進むため、
          指定した小節ぶんの再生時間がかかります。書き出し中は下にオート再生が流れます。
          このタブを開いたままにしてください。
        </p>
      </div>
      {courseChoices && (
        <div className="course-chooser">
          <p>このTJAには複数のコースが入っています。読み込むコースを選んでください：</p>
          <div className="course-buttons">
            {courseChoices.map((c, i) => (
              <button key={i} type="button" className="primary" onClick={() => chooseCourse(c)}>
                {c.metadata.course} ★{c.metadata.level}（{c.measures.length}小節）
              </button>
            ))}
            <button type="button" onClick={() => setCourseChoices(null)}>キャンセル</button>
          </div>
        </div>
      )}
      {warnings.length > 0 && (
        <ul className="import-warnings">
          {warnings.map((w, i) => (
            <li key={i}>⚠️ {w}</li>
          ))}
        </ul>
      )}
      {preview && <textarea className="tja-preview" readOnly value={preview} rows={16} />}
    </div>
  );
}
