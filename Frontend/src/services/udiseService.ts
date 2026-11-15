/**
 * UDISE+ student readiness report and CSV export (server only).
 * Lists active students with missing UDISE+ fields and downloads an Excel-ready UTF-8 BOM CSV.
 */
import { Result } from '../types/session';
import { API_BASE_URL, USE_BACKEND } from '../app/backendConfig';
import { authService } from './authService';
import { api } from './api/http';

export interface UdiseClassOption {
  id: string;
  label: string;
}

export interface UdiseIssueRow {
  studentId: string;
  admissionNumber: string;
  name: string;
  className: string;
  section: string;
  missingFields: string[];
}

export interface UdiseValidationReport {
  schoolId: string;
  schoolName: string;
  totalStudents: number;
  readyCount: number;
  incompleteCount: number;
  missingByField: Record<string, number>;
  classes: UdiseClassOption[];
  issues: UdiseIssueRow[];
}

export interface UdiseCsvDownload {
  filename: string;
  rowCount: number;
  skippedCount: number;
  blob: Blob;
}

const serverOnly = <T,>(): Promise<Result<T>> =>
  Promise.resolve({ ok: false, error: 'UDISE+ export needs the FutureSchool server.', code: 'SERVER_ONLY' });

function buildQuery(params: Record<string, string | boolean | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '' && v !== 'ALL') sp.set(k, String(v));
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

function parseFilename(disposition: string | null): string {
  if (!disposition) return 'udise-students.csv';
  const m = /filename="?([^";]+)"?/i.exec(disposition);
  return m?.[1] || 'udise-students.csv';
}

export const udiseService = {
  available: USE_BACKEND,

  validate: (classId?: string): Promise<Result<UdiseValidationReport>> =>
    USE_BACKEND ? api.get<UdiseValidationReport>(`/api/admin/udise/validation${buildQuery({ classId })}`) : serverOnly(),

  downloadCsv: async (classId?: string, onlyValid = false): Promise<Result<UdiseCsvDownload>> => {
    if (!USE_BACKEND) return serverOnly();
    const headers: Record<string, string> = { ...authService.authHeader() };
    if (!headers.Authorization) {
      return { ok: false, error: 'Your session has ended. Please sign in again.', code: 'NO_SESSION' };
    }
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/udise/export.csv${buildQuery({ classId, onlyValid })}`, {
        method: 'GET',
        headers
      });
      if (!res.ok) {
        const text = await res.text();
        let data: { error?: string; code?: string } | null = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = null;
        }
        if (res.status === 401 && !data?.code) {
          window.dispatchEvent(new CustomEvent('futureschool:unauthorized'));
          return { ok: false, error: data?.error ?? 'Your session has ended. Please sign in again.', code: 'UNAUTHORIZED' };
        }
        return { ok: false, error: data?.error ?? 'Could not export UDISE+ CSV.', code: data?.code ?? String(res.status) };
      }
      const blob = await res.blob();
      const filename = parseFilename(res.headers.get('Content-Disposition'));
      const rowCount = Number(res.headers.get('X-Udise-Row-Count') ?? '0');
      const skippedCount = Number(res.headers.get('X-Udise-Skipped-Count') ?? '0');
      return { ok: true, data: { filename, rowCount, skippedCount, blob } };
    } catch {
      return { ok: false, error: 'Cannot reach the FutureSchool server. Check your connection and try again.', code: 'NETWORK' };
    }
  }
};
