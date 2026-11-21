/**
 * A tiny signal for "school data changed": sent after every successful save (any POST / PUT / PATCH
 * to the server, or any write to the prototype store). Menu badge counts, home quick cards and the
 * bell listen to it and reload, so a number disappears as soon as someone acts on it instead of
 * waiting for a full page reload.
 */
const EVENT = 'futureschool:staff-data-changed';

export const notifyStaffDataChanged = (): void => {
  // Never let the signal break a save (e.g. non-browser test shims without dispatchEvent / Event).
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function' || typeof Event !== 'function') return;
  try {
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* listeners are best-effort */
  }
};

/** Subscribe; returns the unsubscribe function (use it as a useEffect cleanup). */
export const onStaffDataChanged = (listener: () => void): (() => void) => {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => undefined;
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
};
