/**
 * apiClient.ts
 * A clean fetch wrapper that automatically injects Bearer tokens,
 * handles 401 unauthorized events, and gracefully degrades on network errors.
 */

import { authService } from './authService';
import { API_BASE_URL } from '../app/backendConfig';

function getToken(): string | null {
  return authService.getAccessToken();
}

function buildHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extra
  };
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

function handleUnauthorized(): void {
  window.dispatchEvent(new CustomEvent('futureschool:unauthorized'));
}

async function request<T>(url: string, options: RequestInit): Promise<T | null> {
  const target = url.startsWith('/') ? `${API_BASE_URL}${url}` : url;
  try {
    const res = await fetch(target, options);
    if (res.status === 401) {
      handleUnauthorized();
      return null;
    }
    if (!res.ok) return null;
    // Handle empty responses (e.g. 204 No Content)
    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    // Network error or JSON parse failure — graceful degradation
    return null;
  }
}

export const apiClient = {
  get: <T>(url: string): Promise<T | null> =>
    request<T>(url, { method: 'GET', headers: buildHeaders() }),

  post: <T>(url: string, body: unknown): Promise<T | null> =>
    request<T>(url, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(body)
    }),

  put: <T>(url: string, body: unknown): Promise<T | null> =>
    request<T>(url, {
      method: 'PUT',
      headers: buildHeaders(),
      body: JSON.stringify(body)
    }),

  patch: <T>(url: string, body: unknown): Promise<T | null> =>
    request<T>(url, {
      method: 'PATCH',
      headers: buildHeaders(),
      body: JSON.stringify(body)
    }),

  delete: <T>(url: string): Promise<T | null> =>
    request<T>(url, { method: 'DELETE', headers: buildHeaders() })
};
