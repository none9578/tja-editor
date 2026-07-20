import { useEffect, useState } from 'react';
import { Measure } from '../types';
import { MeasureTiming } from '../utils/timing';
import { MeasurePatch } from './EditView';
import { NOTE_INFO } from '../noteInfo';
import { inputSlotCount } from '../utils/noteOps';
import { addSplit, getSections, mergeSection, updateSection } from '../utils/sections';

/**
 * 1小節の詳細設定モーダル。小節ヘッダの「詳細」から開く。
 * 上段: 小節単位の命令（拍子・BPM変更・小節線・DELAY）。
 * 下段: 小節を複数のサブ区間に切り分け、各区間にSCROLL/GOGOを設定する（小節内命令）。
 */
interface Props {
  index: number;
  measureCount: number;
  measure: Measure;
  timing: MeasureTiming;
  onChange: (patch: MeasurePatch) => void;
  onNav: (index: number) => void;
  onClose: () => void;
}

const GRID_OPTIONS = [4, 8, 12, 16, 24, 32];

export default function MeasureDetail({
  index,
  measureCount,
  measure,
  timing,
  onChange,
  onNav,
  onClose,
}: Props) {
  const [grid, setGrid] = useState(16);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const len = measure.notes.length;
  const sections = getSections(measure);
  const cells = inputSlotCount(measure, grid); // 目盛の数
  const splitFracs = sections.slice(1).map((s) => s.startFrac);
  const isSplitAt = (f: number) => splitFracs.some((sf) => Math.abs(sf - f) < 0.5 / len);

  const noteDots = (start: number, end: number) =>
    measure.notes.slice(start, end).map((v, i) => {
      if (v === 0) return null;
      const slot = start + i;
      const left = end > start ? ((slot - start) / (end - start)) * 100 : 0;
      return (
        <span
          key={slot}
          className={`note ${NOTE_INFO[v].className}`}
          style={{ left: `${left}%` }}
        >
          {NOTE_INFO[v].short}
        </span>
      );
    });

  return (
    <>
      <div className="mdetail-backdrop" onClick={onClose} />
      <div className="mdetail" role="dialog" aria-label={`小節${index + 1}の詳細設定`}>
        <div className="mdetail-head">
          <button type="button" className="mini" disabled={index <= 0} title="前の小節" onClick={() => onNav(index - 1)}>
            ◀
          </button>
          <span className="mdetail-title">小節 #{index + 1} の詳細設定</span>
          <button
            type="button"
            className="mini"
            disabled={index >= measureCount - 1}
            title="次の小節"
            onClick={() => onNav(index + 1)}
          >
            ▶
          </button>
          <span className="spacer" />
          <button type="button" className="mini" title="閉じる" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="mdetail-body">
          {/* ---- 小節単位の設定 ---- */}
          <div className="mdetail-field">
            <span className="mdetail-label">拍子（#MEASURE）</span>
            <div className="mdetail-control">
              <input
                type="number"
                min={1}
                max={32}
                value={measure.numerator}
                onChange={(e) => onChange({ numerator: Number(e.target.value) })}
              />
              <span>/</span>
              <input
                type="number"
                min={1}
                max={32}
                value={measure.denominator}
                onChange={(e) => onChange({ denominator: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="mdetail-field">
            <span className="mdetail-label">BPM変更（#BPMCHANGE）</span>
            <div className="mdetail-control">
              <input
                type="number"
                min={1}
                step={1}
                value={measure.bpmOverride ?? ''}
                placeholder={`${timing.bpm}`}
                onChange={(e) =>
                  onChange({ bpmOverride: e.target.value === '' ? null : Number(e.target.value) })
                }
              />
              {measure.bpmOverride != null && (
                <button type="button" className="mini" onClick={() => onChange({ bpmOverride: null })}>
                  解除
                </button>
              )}
            </div>
            <p className="mdetail-hint">この小節の頭からBPMを変える（小節の途中では変えられません）。</p>
          </div>

          <div className="mdetail-field">
            <label className="mdetail-check">
              <input
                type="checkbox"
                checked={!measure.barline}
                onChange={(e) => onChange({ barline: !e.target.checked })}
              />
              小節線を消す（#BARLINEOFF）
            </label>
          </div>

          <div className="mdetail-field">
            <span className="mdetail-label">遅延（#DELAY 秒）</span>
            <div className="mdetail-control">
              <input
                type="number"
                step={0.001}
                value={measure.delay ?? ''}
                placeholder="0"
                onChange={(e) =>
                  onChange({ delay: e.target.value === '' ? null : Number(e.target.value) })
                }
              />
              {measure.delay != null && (
                <button type="button" className="mini" onClick={() => onChange({ delay: null })}>
                  解除
                </button>
              )}
            </div>
            <p className="mdetail-hint">音符が流れてくるのを遅らせる（曲の継ぎ目の微調整用）。</p>
          </div>

          {/* ---- 小節内のセクション（SCROLL / GOGO） ---- */}
          <div className="mdetail-sections">
            <div className="mdetail-sec-head">
              <span className="mdetail-label">小節内のセクション（SCROLL・ゴーゴー）</span>
              <label className="mdetail-grid-sel">
                目盛
                <select value={grid} onChange={(e) => setGrid(Number(e.target.value))}>
                  {GRID_OPTIONS.map((g) => (
                    <option key={g} value={g}>
                      {g}分
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="mdetail-hint">
              目盛の線をクリックすると、その位置で小節を区切ります。区切った各区間ごとに
              SCROLL（見た目の速さ）とゴーゴーを設定できます。
            </p>

            {/* 分割用の基準レーン（小節全体） */}
            <div className="mdetail-ref">
              {Array.from({ length: Math.max(0, cells - 1) }, (_, i) => i + 1).map((j) => {
                const f = j / cells;
                const split = isSplitAt(f);
                return (
                  <button
                    key={j}
                    type="button"
                    className={`mdetail-tick ${split ? 'is-split' : ''}`}
                    style={{ left: `${f * 100}%` }}
                    title={split ? '区切り済み' : 'ここで区切る'}
                    onClick={() => {
                      if (!split) onChange({ splits: addSplit(measure, f) });
                    }}
                  />
                );
              })}
              {splitFracs.map((f, i) => (
                <div key={`b${i}`} className="mdetail-boundary" style={{ left: `${f * 100}%` }} />
              ))}
              <div className="mdetail-ref-notes">{noteDots(0, len)}</div>
            </div>

            {/* 各区間 */}
            <div className="mdetail-sec-list">
              {sections.map((sec) => (
                <div className="mdetail-sec" key={sec.index}>
                  <div
                    className={`mdetail-sec-lane ${sec.gogo ? 'gogo' : ''}`}
                    style={{ width: `${Math.max(6, ((sec.end - sec.start) / len) * 100)}%` }}
                  >
                    {noteDots(sec.start, sec.end)}
                  </div>
                  <div className="mdetail-sec-ctrl">
                    <span className="mdetail-sec-no">区間{sec.index + 1}</span>
                    <label>
                      SCROLL
                      <input
                        type="number"
                        step={0.1}
                        placeholder="継承"
                        value={sec.scroll ?? ''}
                        onChange={(e) =>
                          onChange(
                            updateSection(measure, sec.index, {
                              scroll: e.target.value === '' ? null : Number(e.target.value),
                            }),
                          )
                        }
                      />
                    </label>
                    <label className="mdetail-sec-gogo">
                      <input
                        type="checkbox"
                        checked={sec.gogo}
                        onChange={(e) =>
                          onChange(updateSection(measure, sec.index, { gogo: e.target.checked }))
                        }
                      />
                      GOGO
                    </label>
                    {sec.index > 0 && (
                      <button
                        type="button"
                        className="mini"
                        title="前の区間と結合する"
                        onClick={() => onChange({ splits: mergeSection(measure, sec.index) })}
                      >
                        結合
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="mdetail-note">TJA分割数（この小節の解像度）: {len}</p>
        </div>
      </div>
    </>
  );
}
