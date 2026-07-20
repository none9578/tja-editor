import { useEffect } from 'react';
import { Measure } from '../types';
import { MeasureTiming } from '../utils/timing';
import { MeasurePatch } from './EditView';

/**
 * 1小節の詳細設定モーダル。小節ヘッダの「詳細」から開く。
 * 小節単位で入れるTJA命令（拍子・BPM変更・SCROLL・ゴーゴー・小節線・DELAY）を
 * まとめて編集する。滅多に使わない設定を譜面の間に常時出さないための独立ウィンドウ。
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

export default function MeasureDetail({
  index,
  measureCount,
  measure,
  timing,
  onChange,
  onNav,
  onClose,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const numInput = (v: number | null, set: (n: number | null) => void, placeholder: string) => ({
    type: 'number' as const,
    value: v ?? '',
    placeholder,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      set(e.target.value === '' ? null : Number(e.target.value)),
  });

  return (
    <>
      <div className="mdetail-backdrop" onClick={onClose} />
      <div className="mdetail" role="dialog" aria-label={`小節${index + 1}の詳細設定`}>
        <div className="mdetail-head">
          <button
            type="button"
            className="mini"
            disabled={index <= 0}
            title="前の小節"
            onClick={() => onNav(index - 1)}
          >
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
            <p className="mdetail-hint">1小節の拍数。既定は 4/4。</p>
          </div>

          <div className="mdetail-field">
            <span className="mdetail-label">BPM変更（#BPMCHANGE）</span>
            <div className="mdetail-control">
              <input
                min={1}
                step={1}
                {...numInput(measure.bpmOverride, (n) => onChange({ bpmOverride: n }), `${timing.bpm}`)}
              />
              {measure.bpmOverride != null && (
                <button type="button" className="mini" onClick={() => onChange({ bpmOverride: null })}>
                  解除
                </button>
              )}
            </div>
            <p className="mdetail-hint">この小節からBPMを変える。空欄 = 直前を引き継ぐ。</p>
          </div>

          <div className="mdetail-field">
            <span className="mdetail-label">スクロール速度（#SCROLL）</span>
            <div className="mdetail-control">
              <input
                min={0.1}
                step={0.1}
                {...numInput(
                  measure.scrollOverride,
                  (n) => onChange({ scrollOverride: n }),
                  `${timing.scroll}`,
                )}
              />
              {measure.scrollOverride != null && (
                <button
                  type="button"
                  className="mini"
                  onClick={() => onChange({ scrollOverride: null })}
                >
                  解除
                </button>
              )}
            </div>
            <p className="mdetail-hint">BPMを変えずに見た目の流れる速さだけ変える（2 = 2倍速）。</p>
          </div>

          <div className="mdetail-field">
            <label className="mdetail-check">
              <input
                type="checkbox"
                checked={measure.gogo}
                onChange={(e) => onChange({ gogo: e.target.checked })}
              />
              ゴーゴータイム（#GOGOSTART / #GOGOEND）
            </label>
            <p className="mdetail-hint">この小節を光らせる盛り上がり区間にする。</p>
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
            <p className="mdetail-hint">この小節の頭の縦線を非表示にする。</p>
          </div>

          <div className="mdetail-field">
            <span className="mdetail-label">遅延（#DELAY 秒）</span>
            <div className="mdetail-control">
              <input
                step={0.001}
                {...numInput(measure.delay, (n) => onChange({ delay: n }), '0')}
              />
              {measure.delay != null && (
                <button type="button" className="mini" onClick={() => onChange({ delay: null })}>
                  解除
                </button>
              )}
            </div>
            <p className="mdetail-hint">
              この小節の音符が流れてくるのを指定秒だけ遅らせる（曲の継ぎ目の微調整用）。
            </p>
          </div>

          <p className="mdetail-note">TJA分割数（この小節の解像度）: {measure.notes.length}</p>
        </div>
      </div>
    </>
  );
}
