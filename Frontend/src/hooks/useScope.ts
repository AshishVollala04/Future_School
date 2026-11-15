/**
 * The request scope every service call needs: who, which school, which student.
 * Services must take this explicitly; they never infer a school on their own.
 * Production: the backend derives the same scope from the token and ignores client input.
 */
import { useAuth } from '../context/AuthContext';
import { PortalRole } from '../types/session';

export interface Scope {
  schoolId: string;
  role: PortalRole;
  userId: string;
  /** Present only for parent sessions. */
  studentId?: string;
}

export function useScope(): Scope {
  const { session } = useAuth();
  if (!session) throw new Error('useScope called without an active session');
  return { schoolId: session.schoolId, role: session.role, userId: session.userId, studentId: session.studentId };
}

/** Same as useScope, but returns null instead of throwing (for shared components). */
export function useOptionalScope(): Scope | null {
  const { session } = useAuth();
  return session
    ? { schoolId: session.schoolId, role: session.role, userId: session.userId, studentId: session.studentId }
    : null;
}
