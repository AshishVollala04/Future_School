/**
 * FutureSchool - AuditService
 *
 * Append-only. There is intentionally no update or delete method.
 * Production: an INSERT-only audit_events table (school_id, actor_id, action,
 * target, details, created_at) with RLS, no UPDATE/DELETE grants, and
 * server-assigned timestamps. The browser can never write audit rows directly.
 */
import { storage, storageKeys } from './storage';

export interface AuditEvent {
  id: string;
  schoolId: string;
  action: string;
  actorId: string;
  actorRole: string;
  targetId: string;
  details: string;
  /** Free-form reason, mandatory for overrides and corrections. */
  reason?: string;
  at: string; // ISO timestamp
}

export interface AuditService {
  record(event: Omit<AuditEvent, 'id' | 'at'>): AuditEvent;
  list(schoolId: string): AuditEvent[];
}

const MAX_EVENTS_PER_SCHOOL = 500;

function newId(): string {
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `AUD-${Date.now().toString(36).toUpperCase()}-${rnd}`;
}

class MockAuditService implements AuditService {
  record(event: Omit<AuditEvent, 'id' | 'at'>): AuditEvent {
    const full: AuditEvent = { ...event, id: newId(), at: new Date().toISOString() };
    const key = storageKeys.school(event.schoolId, 'audit');
    const existing = storage.get<AuditEvent[]>(key, []);
    storage.set(key, [full, ...existing].slice(0, MAX_EVENTS_PER_SCHOOL));
    return full;
  }

  list(schoolId: string): AuditEvent[] {
    return storage.get<AuditEvent[]>(storageKeys.school(schoolId, 'audit'), []);
  }
}

export const auditService: AuditService = new MockAuditService();
