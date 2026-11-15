/**
 * Disposable, session-scoped view cache.
 *
 * Every key includes schoolId (and studentId for parent views). The whole
 * cache is wiped on login, logout and child switch so nothing from one child
 * or school can leak into another session.
 */
import { storage, storageKeys } from './storage';

const memory = new Map<string, unknown>();
const listeners = new Set<() => void>();

export const sessionCache = {
  get<T>(schoolId: string, studentId: string | undefined, name: string): T | undefined {
    const key = storageKeys.cache(schoolId, studentId, name);
    if (memory.has(key)) return memory.get(key) as T;
    const v = storage.get<T | undefined>(key, undefined);
    if (v !== undefined) memory.set(key, v);
    return v;
  },

  set<T>(schoolId: string, studentId: string | undefined, name: string, value: T): void {
    const key = storageKeys.cache(schoolId, studentId, name);
    memory.set(key, value);
    storage.set(key, value);
  },

  clearAll(): void {
    memory.clear();
    storage.removeByPrefix(storageKeys.cachePrefixAll());
    listeners.forEach(fn => fn());
  },

  /** Services holding in-memory state subscribe to reset on scope change. */
  onClear(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
};
