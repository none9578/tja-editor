import { useState } from 'react';
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
  // プリセットに無い値（＝「その他」で指定した任意の N）を使っているかどうか。
  // 入力単位は素の数値なので、エンジンはもともと 2〜128 の任意の分母を扱える。
  const isPreset = INPUT_UNIT_OPTIONS.includes(inputUnit);
  const [customOpen, setCustomOpen] = useState(!isPreset);
  const [customText, setCustomText] = useState(String(inputUnit));

  // 打ち替えやすいよう入力欄は文字列で保持し、2〜128 の範囲に収まった時だけ反映する
  const applyCustom = (raw: string) => {
    setCustomText(raw);
    const n = Math.floor(Number(raw));
    if (Number.isFinite(n) && n >= 2 && n <= 128) onChangeInputUnit(n);
  };
  const commitCustom = () => {
    const n = Math.min(128, Math.max(2, Math.floor(Number(customText) || inputUnit)));
    setCustomText(String(n));
    onChangeInputUnit(n);
  };

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
          value={customOpen ? 'other' : inputUnit}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'other') {
              setCustomOpen(true);
              setCustomText(String(inputUnit));
            } else {
              setCustomOpen(false);
              onChangeInputUnit(Number(v));
            }
            // フォーカスが残ると矢印キーで単位が変わってしまうため外す
            (e.currentTarget as HTMLSelectElement).blur();
          }}
        >
          {INPUT_UNIT_OPTIONS.map((u) => (
            <option key={u} value={u}>
              {u}分
            </option>
          ))}
          <option value="other">その他</option>
        </select>
        {customOpen && (
          <span className="input-unit-custom">
            <input
              type="number"
              min={2}
              max={128}
              value={customText}
              onChange={(e) => applyCustom(e.target.value)}
              onBlur={commitCustom}
            />
            分（2〜128）
          </span>
        )}
        <span className="input-unit-hint">TJAの分割は配置から自動調整</span>
      </label>
    </div>
  );
}
