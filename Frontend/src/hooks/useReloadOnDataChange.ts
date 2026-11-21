/**
 * Reload the given queries whenever school data changes (any successful save, see app/staffEvents),
 * so badge counts and quick-card statuses drop as soon as someone acts, without a page reload.
 * Pass each query's stable `reload` function.
 */
import { useEffect } from 'react';
import { onStaffDataChanged } from '../app/staffEvents';

export function useReloadOnDataChange(...reloads: Array<() => void>): void {
  useEffect(
    () => onStaffDataChanged(() => reloads.forEach(r => r())),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    reloads
  );
}
