/**
 * Signal for "school data changed": sent after every successful save (any POST / PUT / PATCH
 * to the server, or any write to the prototype store). Syncs both the active tab and any
 * other open tabs on the same origin via BroadcastChannel so counts, quick cards, and live
 * views (such as Parent Fees) refresh immediately without a full page reload.
 */
const EVENT = 'futureschool:staff-data-changed';
const CHANNEL = 'futureschool:data-sync';

let channel: BroadcastChannel | null | undefined;
function getChannel(): BroadcastChannel | null {
  if (channel !== undefined) return channel;
  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof BroadcastChannel === 'undefined') {
    channel = null;
    return null;
  }
  try {
    channel = new BroadcastChannel(CHANNEL);
  } catch {
    channel = null;
  }
  return channel;
}

export const notifyStaffDataChanged = (): void => {
  // Never let the signal break a save (e.g. non-browser test shims without dispatchEvent / Event).
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function' || typeof Event !== 'function') return;
  try {
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* listeners are best-effort */
  }
  try {
    getChannel()?.postMessage({ at: Date.now() });
  } catch {
    /* cross-tab broadcast is best-effort */
  }
};

/** Subscribe; returns the unsubscribe function (use it as a useEffect cleanup). */
export const onStaffDataChanged = (listener: () => void): (() => void) => {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => undefined;
  window.addEventListener(EVENT, listener);
  const ch = getChannel();
  const onMessage = () => listener();
  ch?.addEventListener('message', onMessage);
  return () => {
    window.removeEventListener(EVENT, listener);
    ch?.removeEventListener('message', onMessage);
  };
};
