/**
 * Minimal async data hook for service calls returning Result<T>.
 * Gives every screen consistent loading / error / ready states, reload(), and optional
 * automatic background refresh on tab focus, network reconnect, cross-tab writes, and intervals.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Result } from '../types/session';
import { onStaffDataChanged } from '../app/staffEvents';

export type QueryState<T> =
  | { status: 'loading'; data?: undefined; error?: undefined }
  | { status: 'error'; error: string; data?: undefined }
  | { status: 'ready'; data: T; error?: undefined };

export interface UseQueryOptions {
  /** Re-fetch in background when returning to the tab, focusing the window, or reconnecting. Default: true. */
  autoRefresh?: boolean;
  /** Optional polling interval (ms) while the tab is visible. Default: 0 (off). */
  refreshIntervalMs?: number;
  /** Reload automatically whenever same-tab or cross-tab data saves occur. Default: false. */
  refreshOnDataChange?: boolean;
  /** Minimum ms between automatic focus/visibility/interval refreshes. Default: 4000. */
  minRefreshGapMs?: number;
}

export function useQuery<T>(
  fn: () => Promise<Result<T>>,
  deps: unknown[],
  options?: UseQueryOptions
): QueryState<T> & { reload: () => void } {
  const [state, setState] = useState<QueryState<T>>({ status: 'loading' });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const statusRef = useRef<QueryState<T>['status']>('loading');
  statusRef.current = state.status;
  const epochRef = useRef(0);
  const seqRef = useRef(0);
  const inFlightRef = useRef(false);
  const lastFetchAtRef = useRef(0);
  const pendingDataRefreshRef = useRef(false);

  const run = useCallback((silent: boolean) => {
    const seq = ++seqRef.current;
    const epoch = epochRef.current;
    inFlightRef.current = true;
    pendingDataRefreshRef.current = false;
    lastFetchAtRef.current = Date.now();
    if (!silent && statusRef.current !== 'ready') {
      setState({ status: 'loading' });
    }
    fnRef
      .current()
      .then(r => {
        if (epoch !== epochRef.current || seq !== seqRef.current) return;
        inFlightRef.current = false;
        lastFetchAtRef.current = Date.now();
        if (r.ok) {
          setState({ status: 'ready', data: r.data });
        } else if (!silent || statusRef.current !== 'ready') {
          setState({ status: 'error', error: r.error });
        }
      })
      .catch(() => {
        if (epoch !== epochRef.current || seq !== seqRef.current) return;
        inFlightRef.current = false;
        if (!silent || statusRef.current !== 'ready') {
          setState({ status: 'error', error: 'Something went wrong. Please try again.' });
        }
      });
  }, []);

  useEffect(() => {
    epochRef.current += 1;
    inFlightRef.current = false;
    lastFetchAtRef.current = 0;
    run(false);
    return () => {
      epochRef.current += 1;
      inFlightRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, run]);

  const autoRefresh = options?.autoRefresh ?? true;
  const refreshIntervalMs = options?.refreshIntervalMs ?? 0;
  const refreshOnDataChange = options?.refreshOnDataChange ?? false;
  const minRefreshGapMs = options?.minRefreshGapMs ?? 2500;

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (!autoRefresh && !refreshOnDataChange && refreshIntervalMs <= 0) return;

    const trigger = (force: boolean) => {
      if (document.visibilityState === 'hidden') return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      if (inFlightRef.current) return;
      const shouldForce = force || pendingDataRefreshRef.current;
      if (!shouldForce && Date.now() - lastFetchAtRef.current < minRefreshGapMs) return;
      run(true);
    };

    const onVisible = () => trigger(false);
    const onOnline = () => trigger(statusRef.current === 'error');
    const onDataChanged = () => {
      if (document.visibilityState === 'hidden') {
        pendingDataRefreshRef.current = true;
        return;
      }
      trigger(true);
    };
    if (autoRefresh) {
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('focus', onVisible);
      window.addEventListener('online', onOnline);
    }
    const unsubData = refreshOnDataChange ? onStaffDataChanged(onDataChanged) : undefined;
    const timer = refreshIntervalMs > 0 ? window.setInterval(() => trigger(false), refreshIntervalMs) : undefined;

    return () => {
      if (autoRefresh) {
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('focus', onVisible);
        window.removeEventListener('online', onOnline);
      }
      unsubData?.();
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [autoRefresh, refreshIntervalMs, refreshOnDataChange, minRefreshGapMs, run]);

  const reload = useCallback(() => run(false), [run]);
  return { ...state, reload } as QueryState<T> & { reload: () => void };
}
