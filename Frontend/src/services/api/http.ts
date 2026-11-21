/**
 * Small typed HTTP helper for backend-backed services. Always returns a Result,
 * never throws, and never invents data on failure.
 */
import { Result } from '../../types/session';
import { API_BASE_URL } from '../../app/backendConfig';
import { authService } from '../authService';
import { notifyStaffDataChanged } from '../../app/staffEvents';

async function send<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH', path: string, body?: unknown): Promise<Result<T>> {
  const headers: Record<string, string> = { ...authService.authHeader() };
  if (!headers.Authorization) return { ok: false, error: 'Your session has ended. Please sign in again.', code: 'NO_SESSION' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    // Only a 401 with no code means the session is gone. A 401 with a code (e.g. STEP_UP_REQUIRED,
    // PIN_INVALID) answers this request; signing the user out for it would lose their work.
    if (res.status === 401 && !data?.code) {
      window.dispatchEvent(new CustomEvent('futureschool:unauthorized'));
      return { ok: false, error: data?.error ?? 'Your session has ended. Please sign in again.', code: data?.code ?? 'UNAUTHORIZED' };
    }
    if (!res.ok) return { ok: false, error: data?.error ?? 'Something went wrong. Please try again.', code: data?.code ?? String(res.status) };
    // A successful change: let menu badges, quick cards and the bell refresh their counts right away.
    if (method !== 'GET') notifyStaffDataChanged();
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: 'Cannot reach the FutureSchool server. Check your connection and try again.', code: 'NETWORK' };
  }
}

export const api = {
  get: <T>(path: string) => send<T>('GET', path),
  post: <T>(path: string, body: unknown) => send<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => send<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => send<T>('PATCH', path, body)
};
