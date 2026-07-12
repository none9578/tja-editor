interface Props {
  offset: number;
  onChange: (offset: number) => void;
  /** 再生環境ごとの補正秒（TJAには出力しない・localStorage保存） */
  calibration: number;
  onCalibrationChange: (v: number) => void;
}

/**
 * OFFSET調整パネル。
 * アプリ内部ではTJAの OFFSET: にそのまま出力される値を保持している。
 * OFFSETを増やす(+) → 譜面が早くなる（ノーツが曲の早い位置で鳴る）
 * OFFSETを減らす(-) → 譜面が遅くなる
 * 同期式は utils/timing.ts 参照: audioTime = chartTime - offset
 */
export default function OffsetPanel({ offset, onChange, calibration, onCalibrationChange }: Props) {
  const nudge = (d: number) => onChange(Math.round((offset + d) * 1000) / 1000);
  const nudgeCal = (d: number) => onCalibrationChange(Math.round((calibration + d) * 1000) / 1000);

  return (
    <div className="offset-panel">
      <div className="offset-row">
        <span className="offset-label">OFFSET（秒）</span>
        <input
          type="number"
          step={0.001}
          value={offset}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
      <div className="offset-row offset-buttons">
        <span className="offset-hint">譜面を遅らせる ◀</span>
        <button type="button" onClick={() => nudge(-0.01)}>-0.01</button>
        <button type="button" onClick={() => nudge(-0.001)}>-0.001</button>
        <button type="button" onClick={() => nudge(+0.001)}>+0.001</button>
        <button type="button" onClick={() => nudge(+0.01)}>+0.01</button>
        <span className="offset-hint">▶ 譜面を早める</span>
      </div>
      <p className="offset-note">
        TJAの <code>OFFSET:</code> として出力される値です。マイナスにするほど譜面（1小節目）が曲の後ろの位置から始まります。
        再生してノーツ音と曲がズレて聞こえるときは、ノーツが曲より遅い→「譜面を早める(+)」、早い→「譜面を遅らせる(-)」で合わせてください。
      </p>

      <div className="offset-row calibration-row">
        <span className="offset-label">再生環境補正（秒）</span>
        <input
          type="number"
          step={0.001}
          value={calibration}
          onChange={(e) => onCalibrationChange(Number(e.target.value))}
        />
        <button type="button" onClick={() => nudgeCal(-0.01)}>-0.01</button>
        <button type="button" onClick={() => nudgeCal(-0.001)}>-0.001</button>
        <button type="button" onClick={() => nudgeCal(+0.001)}>+0.001</button>
        <button type="button" onClick={() => nudgeCal(+0.01)}>+0.01</button>
      </div>
      <p className="offset-note">
        端末・ブラウザ固有の再生遅延を合わせるための補正です。<b>TJAファイルには出力されず</b>、この端末にだけ保存されます。
        効き方はOFFSETと同じ（+で譜面が早く、−で遅く）。まずこちらで自分の環境のズレを合わせ、OFFSETは曲自体の頭出しに使うのがおすすめです。
      </p>
    </div>
  );
}
