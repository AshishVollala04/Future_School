/**
 * Authorization checks used by mock services, written the way the backend will
 * enforce them: School -> Role -> Relationship -> Business rule.
 * These run in the browser only because this is a prototype; they are NOT security.
 */
import type { Scope } from '../../hooks/useScope';
import { Result } from '../../types/session';
import { getDb } from '../../mock/db';
import { StudentRecord } from '../../types/domain';

export class AccessDenied extends Error {
  constructor(message = 'You do not have access to this record.') {
    super(message);
  }
}

/** Simulated network latency so loading states are exercised. */
export const latency = (ms = 120) => new Promise(r => setTimeout(r, ms));

export const ok = <T,>(data: T): Result<T> => ({ ok: true, data });
export const fail = <T,>(error: string, code?: string): Result<T> => ({ ok: false, error, code });

/** Parent: only their session student. Staff: any student in their school (role checks per action). */
export function studentInScope(scope: Scope, studentId?: string): StudentRecord {
  const id = studentId ?? scope.studentId;
  if (!id) throw new AccessDenied('No student selected.');
  if (scope.role === 'PARENT' && id !== scope.studentId) throw new AccessDenied();
  const s = getDb(scope.schoolId).students.find(x => x.id === id);
  if (!s) throw new AccessDenied('Student not found in this school.');
  return s;
}

/** Wrap a service body so AccessDenied becomes a Result error. */
export async function guarded<T>(fn: () => T | Promise<T>): Promise<Result<T>> {
  await latency();
  try {
    return ok(await fn());
  } catch (e) {
    if (e instanceof AccessDenied) return fail(e.message, 'FORBIDDEN');
    if (e instanceof RuleError) return fail(e.message, e.code);
    throw e;
  }
}

/** Business-rule violation (e.g. releasing a hall ticket before fee clearance). */
export class RuleError extends Error {
  constructor(message: string, readonly code = 'RULE') {
    super(message);
  }
}
