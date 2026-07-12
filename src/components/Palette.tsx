import { INPUT_UNIT_OPTIONS, NOTE_VALUES, NoteValue } from '../types';
import { NOTE_INFO } from '../noteInfo';
import { HitType } from '../hooks/usePlayer';

interface Props {
  selected: NoteValue;
  eraser: boolean;
  inputUnit: number;
  onSelect: (v: NoteValue) => void;
  onToggleEraser: () => void;
  onChangeInputUnit: (unit: number) => void;
  onPreview: (type: HitType) => void;
}

const PREVIEW_TYPE: Partial<Record<NoteValue, HitType>> = {
  1: 'don',
  3: 'bigDon',
  5: 'don',
  6: 'bigDon',
  7: 'don',
  2: 'ka',
  4: 'bigKa',
  8: 'ka',
};

export default function Palette({
  selected,
  eraser,
  inputUnit,
  onSelect,
  onToggleEraser,
  onChangeInputUnit,
  onPreview,
}: Props) {
  return (
    <div className="palette">
      {NOTE_VALUES.map((v) => {
        const info = NOTE_INFO[v];
        return (
          <button
            key={v}
            type="button"
            className={`palette-btn ${!eraser && selected === v ? 'active' : ''}`}
            title={`${v}: ${info.name}（キー: ${info.keyHint}）`}
            onClick={(e) => {
              onSelect(v);
              const t = PREVIEW_TYPE[v];
              if (t) onPreview(t);
              // フォーカスを残すと矢印キーがボタン操作になるため外す
              (e.currentTarget as HTMLButtonElement).blur();
            }}
          >
            <span className={`note ${info.className}`}>{info.short || '·'}</span>
            <span className="palette-name">
              {v}: {info.name}
            </span>
            <span className="palette-key">{info.keyHint}</span>
          </button>
        );
      })}
      <button
        type="button"
        className={`palette-btn eraser ${eraser ? 'active' : ''}`}
        title="消しゴムモード（右クリックでも消せます）"
        onClick={(e) => {
          onToggleEraser();
          (e.currentTarget as HTMLButtonElement).blur();
        }}
      >
        <span className="note n-eraser">✕</span>
        <span className="palette-name">消しゴム</span>
        <span className="palette-key">右クリック</span>
      </button>
      <label className="input-unit">
        入力単位
        <select
          value={inputUnit}
          onChange={(e) => {
            onChangeInputUnit(Number(e.target.value));
            // フォーカスが残ると矢印キーで単位が変わってしまうため外す
            (e.currentTarget as HTMLSelectElement).blur();
          }}
        >
          {INPUT_UNIT_OPTIONS.map((u) => (
            <option key={u} value={u}>
              {u}分
            </option>
          ))}
        </select>
        <span className="input-unit-hint">TJAの分割は配置から自動調整</span>
      </label>
    </div>
  );
}
