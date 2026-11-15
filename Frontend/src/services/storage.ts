/**
 * FutureSchool - Browser storage adapter.
 *
 * The ONLY module allowed to touch localStorage / sessionStorage.
 * Components never call this directly; services do. When the REST backend
 * replaces the mocks, most of these keys disappear (server becomes the source
 * of truth) and only device preferences + the session handle remain.
 *
 * Key layout:
 *   fs:device:<name>                      device prefs (theme, language)
 *   fs:auth:<name>                        auth/session handle
 *   fs:school:<schoolId>:<name>           per-school mock data
 *   fs:cache:<schoolId>:<studentId|-> :<name>   disposable view caches
 */

const PREFIX = 'fs:';

function safeStore(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export const storage = {
  get<T>(key: string, fallback: T): T {
    const s = safeStore();
    if (!s) return fallback;
    try {
      const raw = s.getItem(PREFIX + key);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  },

  set<T>(key: string, value: T): void {
    const s = safeStore();
    if (!s) return;
    try {
      s.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      /* quota or private mode: non-fatal for a prototype */
    }
  },

  remove(key: string): void {
    safeStore()?.removeItem(PREFIX + key);
  },

  /** Remove every key that starts with the given (un-prefixed) prefix. */
  removeByPrefix(prefix: string): void {
    const s = safeStore();
    if (!s) return;
    const full = PREFIX + prefix;
    const doomed: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k && k.startsWith(full)) doomed.push(k);
    }
    doomed.forEach(k => s.removeItem(k));
  },

  /** One-time cleanup of keys written by earlier prototype versions. */
  purgeLegacyKeys(): void {
    const s = safeStore();
    if (!s) return;
    const legacy: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k && k.startsWith('futureschool_')) legacy.push(k);
    }
    legacy.forEach(k => s.removeItem(k));
  }
};

export const storageKeys = {
  device: (name: string) => `device:${name}`,
  auth: (name: string) => `auth:${name}`,
  school: (schoolId: string, name: string) => `school:${requireSchool(schoolId)}:${name}`,
  cache: (schoolId: string, studentId: string | undefined, name: string) =>
    `cache:${requireSchool(schoolId)}:${studentId ?? '-'}:${name}`,
  cachePrefixAll: () => 'cache:'
};

function requireSchool(schoolId: string): string {
  if (!schoolId) throw new Error('schoolId is required for school-scoped storage');
  return schoolId;
}
