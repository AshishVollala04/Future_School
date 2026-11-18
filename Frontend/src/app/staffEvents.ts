/**
 * A tiny signal for "staff work changed" (an approval, rejection or return was just made).
 * The Principal's menu counts and home cards listen to it and reload, so a number disappears
 * as soon as the Principal acts on it instead of waiting for a full page reload.
 */
const EVENT = 'futureschool:staff-data-changed';

export const notifyStaffDataChanged = (): void => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
};

/** Subscribe; returns the unsubscribe function (use it as a useEffect cleanup). */
export const onStaffDataChanged = (listener: () => void): (() => void) => {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
};
