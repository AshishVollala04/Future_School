/**
 * Live bus tracking (server only).
 *   Office: make / cancel a private driver link per route, see which buses are live.
 *   Driver: opens /drive/<token> (no sign-in), starts a trip, the phone sends its position.
 *   Parent: sees the bus of their child's route only while a trip is live.
 * Only the latest position of a live trip exists on the server; nothing is kept after the trip.
 */
import { Result } from '../types/session';
import { API_BASE_URL, USE_BACKEND } from '../app/backendConfig';
import { api } from './api/http';

export interface BusStop {
  name: string;
  pickup?: string;
  drop?: string;
  lat?: number;
  lng?: number;
}

export interface LiveTrip {
  id: string;
  direction: 'PICKUP' | 'DROP';
  startedAt: number;
  lat?: number;
  lng?: number;
  accuracyM?: number;
  updatedAt?: number;
  stale: boolean;
  distanceKm?: number;
}

export interface ParentBus {
  usesTransport: boolean;
  routeName?: string;
  vehicleNo?: string;
  stop?: BusStop;
  trip?: LiveTrip;
}

export interface OfficeBus {
  routeId: string;
  name: string;
  vehicleNo: string;
  hasDriverLink: boolean;
  trip?: LiveTrip;
}

export interface DriverView {
  routeName: string;
  vehicleNo: string;
  stops: BusStop[];
  trip?: LiveTrip;
}

const serverOnly = <T,>(): Promise<Result<T>> =>
  Promise.resolve({ ok: false, error: 'Live bus tracking needs the FutureSchool server.', code: 'SERVER_ONLY' });

/** The driver is not signed in: these calls carry no session, only the link's token in the path. */
async function open<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Result<T>> {
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) return { ok: false, error: data?.error ?? 'Something went wrong. Please try again.', code: data?.code ?? String(res.status) };
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: 'No internet connection. The bus position will be sent when the connection is back.', code: 'NETWORK' };
  }
}

const t = (token: string) => `/api/public/bus/${encodeURIComponent(token)}`;

export const busService = {
  available: USE_BACKEND,
  parentLive: (): Promise<Result<ParentBus>> => (USE_BACKEND ? api.get<ParentBus>('/api/parent/bus/live') : serverOnly()),
  officeLive: (): Promise<Result<OfficeBus[]>> => (USE_BACKEND ? api.get<OfficeBus[]>('/api/office/bus/live') : serverOnly()),
  createLink: (routeId: string): Promise<Result<{ routeId: string; token: string }>> =>
    USE_BACKEND ? api.post(`/api/office/bus/routes/${encodeURIComponent(routeId)}/driver-link`, {}) : serverOnly(),
  revokeLink: (routeId: string): Promise<Result<{ routeId: string; revoked: number }>> =>
    USE_BACKEND ? api.post(`/api/office/bus/routes/${encodeURIComponent(routeId)}/driver-link/revoke`, {}) : serverOnly(),
  driver: (token: string) => open<DriverView>('GET', t(token)),
  start: (token: string, direction: 'PICKUP' | 'DROP') => open<DriverView>('POST', `${t(token)}/start`, { direction }),
  ping: (token: string, lat: number, lng: number, accuracy: number) => open<LiveTrip>('POST', `${t(token)}/ping`, { lat, lng, accuracy }),
  end: (token: string) => open<DriverView>('POST', `${t(token)}/end`, {}),
  markStop: (token: string, index: number, lat: number, lng: number) =>
    open<DriverView>('POST', `${t(token)}/stops/${index}/here`, { lat, lng })
};

/** "2 min ago" style age of a position. */
export function ageText(ms?: number): string {
  if (!ms) return '';
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s} s ago`;
  return `${Math.round(s / 60)} min ago`;
}
