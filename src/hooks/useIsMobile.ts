import { useEffect, useState } from 'react';

/**
 * スマホ向けUI（下部入力パッドなど）を出すかどうか。
 * タッチが主入力の端末、または狭い画面のときにtrue。
 * CSS側のメディアクエリ（styles.cssの同条件）と揃えること。
 */
const QUERY = '(pointer: coarse), (max-width: 700px)';

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isMobile;
}
