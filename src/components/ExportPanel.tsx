import { useRef, useState } from 'react';
import { Project } from '../types';
import { downloadBlob, generateTja, parseTja } from '../utils/tja';
import { makeZip } from '../utils/zip';
import { fileBaseName, ProjectFile, saveProjectJson } from '../utils/projectFile';

interface Props {
  project: Project;
  onImport: (project: Project, warnings: string[]) => void;
  onLoadJson: (project: Project) => void;
  /** 読み込み済み音源の元ファイル（未読み込みならnull） */
  getAudioFile: () => File | null;
  onLoadAudio: (file: File) => void;
}

export default function ExportPanel({
  project,
  onImport,
  onLoadJson,
  getAudioFile,
  onLoadAudio,
}: Props) {
  const [preview, setPreview] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [courseChoices, setCourseChoices] = useState<Project[] | null>(null);
  const tjaInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

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
