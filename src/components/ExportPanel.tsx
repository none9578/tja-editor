import { useRef, useState } from 'react';
import { Project } from '../types';
import { downloadText, generateTja, parseTja } from '../utils/tja';

interface Props {
  project: Project;
  onImport: (project: Project, warnings: string[]) => void;
  onLoadJson: (project: Project) => void;
}

export default function ExportPanel({ project, onImport, onLoadJson }: Props) {
  const [preview, setPreview] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [courseChoices, setCourseChoices] = useState<Project[] | null>(null);
  const tjaInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  const refresh = () => setPreview(generateTja(project));

  const download = () => {
    const text = generateTja(project);
    setPreview(text);
    const name = (project.metadata.title || 'chart').replace(/[\\/:*?"<>|]/g, '_');
    downloadText(text, `${name}.tja`);
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

  const saveJson = () => {
    const name = (project.metadata.title || 'project').replace(/[\\/:*?"<>|]/g, '_');
    downloadText(JSON.stringify(project, null, 2), `${name}.tjaproj.json`);
  };

  const loadJson = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as Project;
      if (!data.metadata || !Array.isArray(data.measures)) throw new Error('bad format');
      onLoadJson(data);
      setWarnings([]);
    } catch {
      setWarnings(['プロジェクトJSONの読み込みに失敗しました。形式を確認してください。']);
    }
  };

  return (
    <div className="export-panel">
      <div className="export-buttons">
        <button type="button" className="primary" onClick={download}>
          ⬇ .tja をダウンロード
        </button>
        <button type="button" onClick={refresh}>TJAプレビューを更新</button>
        <button type="button" onClick={() => tjaInputRef.current?.click()}>
          ⬆ .tja をインポート
        </button>
        <button type="button" onClick={saveJson}>プロジェクトJSONを保存</button>
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
