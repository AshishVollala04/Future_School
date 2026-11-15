/**
 * WhatsApp alerts to parents (server only).
 *   ABSENT  - queued when today's register marks a child absent; held a few minutes so a wrong
 *             mark can be corrected (which cancels it). Never for a child on approved leave.
 *   FEE_DUE - sent by the office (FINANCE) for overdue fees, at most once a day per child.
 * With no WhatsApp account connected, alerts are LOGGED: recorded, never delivered.
 */
import { Result } from '../types/session';
import { USE_BACKEND } from '../app/backendConfig';
import { api } from './api/http';

export type AlertStatus = 'QUEUED' | 'SENT' | 'FAILED' | 'LOGGED' | 'CANCELLED' | 'SKIPPED';

export interface AlertView {
  id: string;
  kind: 'ABSENT' | 'FEE_DUE';
  studentId: string;
  studentName: string;
  mobile: string;
  preview: string;
  status: AlertStatus;
  error: string | null;
  createdAt: string;
  sentAt: string | null;
}

export interface AlertOverview {
  provider: 'log' | 'whatsapp-cloud';
  connected: boolean;
  absenceAlerts: boolean;
  feeReminders: boolean;
  holdMinutes: number;
  today: Partial<Record<AlertStatus, number>>;
  recent: AlertView[];
}

export interface FeeRun {
  queued: number;
  skipped: number;
  alreadyToday: number;
  note: string | null;
}

const serverOnly = <T,>(): Promise<Result<T>> =>
  Promise.resolve({ ok: false, error: 'WhatsApp alerts need the FutureSchool server.', code: 'SERVER_ONLY' });

export const alertService = {
  available: USE_BACKEND,
  overview: (): Promise<Result<AlertOverview>> => (USE_BACKEND ? api.get<AlertOverview>('/api/admin/alerts') : serverOnly()),
  updateSettings: (s: { absenceAlerts?: boolean; feeReminders?: boolean }): Promise<Result<AlertOverview>> =>
    USE_BACKEND ? api.post<AlertOverview>('/api/admin/alerts/settings', s) : serverOnly(),
  sendFeeReminders: (): Promise<Result<FeeRun>> => (USE_BACKEND ? api.post<FeeRun>('/api/admin/alerts/fee-reminders', {}) : serverOnly()),
  myPreference: (): Promise<Result<{ whatsappAlerts: boolean }>> =>
    USE_BACKEND ? api.get<{ whatsappAlerts: boolean }>('/api/parent/alerts/preference') : serverOnly(),
  setMyPreference: (on: boolean): Promise<Result<{ whatsappAlerts: boolean }>> =>
    USE_BACKEND ? api.post<{ whatsappAlerts: boolean }>('/api/parent/alerts/preference', { whatsappAlerts: on }) : serverOnly()
};
