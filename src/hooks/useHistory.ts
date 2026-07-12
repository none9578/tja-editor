import { useCallback, useState } from 'react';

const MAX_HISTORY = 200;

interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

/** Undo/Redo付きの状態管理フック */
export function useHistory<T>(initial: T) {
  const [state, setState] = useState<HistoryState<T>>({
    past: [],
    present: initial,
    future: [],
  });

  /** 履歴に積んで更新する */
  const commit = useCallback((updater: T | ((prev: T) => T)) => {
    setState((s) => {
      const next =
        typeof updater === 'function' ? (updater as (prev: T) => T)(s.present) : updater;
      if (next === s.present) return s;
      const past = [...s.past, s.present];
      if (past.length > MAX_HISTORY) past.shift();
      return { past, present: next, future: [] };
    });
  }, []);

  /** 履歴に積まずに置き換える（インポート・ロード用） */
  const reset = useCallback((next: T) => {
    setState({ past: [], present: next, future: [] });
  }, []);

  const undo = useCallback(() => {
    setState((s) => {
      if (s.past.length === 0) return s;
      const past = [...s.past];
      const present = past.pop() as T;
      return { past, present, future: [s.present, ...s.future] };
    });
  }, []);

  const redo = useCallback(() => {
    setState((s) => {
      if (s.future.length === 0) return s;
      const [present, ...future] = s.future;
      return { past: [...s.past, s.present], present, future };
    });
  }, []);

  return {
    state: state.present,
    commit,
    reset,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
