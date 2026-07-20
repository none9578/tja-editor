import { Project } from '../types';
import { downloadText } from './tja';

/** プロジェクトJSONのファイル形式。音源はbase64のdata URLで埋め込む
    （音源込みで1ファイルの完全バックアップにする。audioなしの旧形式も読める） */
export type ProjectFile = Project & { audio?: { name: string; dataUrl: string } };

/** ダウンロードファイル名のベース（プロジェクト名 > 曲名 > fallback。使えない記号は_に置換） */
export function fileBaseName(project: Project, fallback = 'chart'): string {
  return (project.name || project.metadata.title || fallback).replace(/[\\/:*?"<>|]/g, '_');
}

/** 音源込みプロジェクトJSONを保存する。戻り値は警告文（問題なければnull）。 */
export async function saveProjectJson(
  project: Project,
  audioFile: File | null,
): Promise<string | null> {
  let audio: ProjectFile['audio'];
  let warning: string | null = null;
  if (audioFile) {
    try {
      audio = {
        name: audioFile.name,
        dataUrl: await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.onerror = () => reject(r.error as Error);
          r.readAsDataURL(audioFile);
        }),
      };
    } catch {
      warning = '音源の読み出しに失敗したため、音源なしで保存しました。';
    }
  }
  const data: ProjectFile = audio ? { ...project, audio } : project;
  downloadText(JSON.stringify(data, null, 2), `${fileBaseName(project, 'project')}.tjaproj.json`);
  return warning;
}
