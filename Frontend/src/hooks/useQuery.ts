/**
 * Minimal async data hook for service calls returning Result<T>.
 * Gives every screen consistent loading / error / ready states and a reload().
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Result } from '../types/session';

export type QueryState<T> =
  | { status: 'loading'; data?: undefined; error?: undefined }
  | { status: 'error'; error: string; data?: undefined }
  | { status: 'ready'; data: T; error?: undefined };

export function useQuery<T>(fn: () => Promise<Result<T>>, deps: unknown[]): QueryState<T> & { reload: () => void } {
  const [state, setState] = useState<QueryState<T>>({ status: 'loading' });
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let live = true;
    setState(s => (s.status === 'ready' ? s : { status: 'loading' }));
    fnRef
      .current()
      .then(r => {
        if (!live) return;
        setState(r.ok ? { status: 'ready', data: r.data } : { status: 'error', error: r.error });
      })
      .catch(() => live && setState({ status: 'error', error: 'Something went wrong. Please try again.' }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick(t => t + 1), []);
  return { ...state, reload } as QueryState<T> & { reload: () => void };
}
