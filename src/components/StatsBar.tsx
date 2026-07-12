import { ChartStats } from '../utils/stats';

interface Props {
  stats: ChartStats;
}

export default function StatsBar({ stats }: Props) {
  return (
    <div className="stats-bar">
      <span>ノーツ数 <b>{stats.totalNotes}</b></span>
      <span>最大コンボ <b>{stats.maxCombo}</b></span>
      <span>
        ドン/カッ <b>{stats.donCount}</b> / <b>{stats.kaCount}</b>
        {stats.donRatio != null && <> ({Math.round(stats.donRatio * 100)}% : {100 - Math.round(stats.donRatio * 100)}%)</>}
      </span>
      <span>連打 <b>{stats.rollCount}</b></span>
      <span>風船 <b>{stats.balloonCount}</b></span>
      <span>譜面長 <b>{stats.durationSec.toFixed(1)}</b>秒</span>
      <span>平均密度 <b>{stats.density.toFixed(2)}</b> 打/秒</span>
    </div>
  );
}
