/**
 * Shared guard for recovering smoothly when a new Vercel deployment replaces
 * lazy-loaded Vite JS chunks while an older tab is still open.
 */
const RELOAD_KEY = 'fs:build-reload-at';
const COOLDOWN_MS = 15_000;

export function reloadOnceForNewBuild(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const prev = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? '0');
    if (prev && Date.now() - prev < COOLDOWN_MS) return false;
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    /* ignore storage failures in private browsing */
  }
  window.location.reload();
  return true;
}

export function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk|error loading dynamically imported module/i.test(msg);
}
