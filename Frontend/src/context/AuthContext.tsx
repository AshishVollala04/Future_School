/**
 * FutureSchool - AuthContext
 *
 * Thin React binding over AuthService. Holds the current scoped session
 * (one role + one school, + one student for parents) and the step-up prompt.
 * Contains no credential logic: every check is delegated to the service.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { UserProfile, UserRole, ChildInfo } from '../types/roles';
import { AuthSession, StepUpPurpose } from '../types/session';
import { authService } from '../services/authService';
import { sessionCache } from '../services/sessionCache';

export interface SensitiveActionState {
  isOpen: boolean;
  actionTitle: string;
  purpose: StepUpPurpose;
  onSuccess: (stepUpToken: string) => void;
}

interface AuthContextType {
  session: AuthSession | null;
  currentUser: UserProfile | null;
  currentRole: UserRole | null;
  isAuthenticated: boolean;
  linkedChildren: ChildInfo[];
  startSession: (session: AuthSession) => void;
  logout: () => void;
  switchActiveChild: (studentId: string) => Promise<boolean>;

  /** Ask the user to re-verify (OTP) before a sensitive action. */
  promptSensitiveActionAuth: (actionTitle: string, onSuccess: (stepUpToken: string) => void, purpose?: StepUpPurpose) => void;
  sensitiveActionState: SensitiveActionState | null;
  cancelSensitiveActionAuth: () => void;
  completeSensitiveActionAuth: (stepUpToken: string) => void;

  adminQuorumWarning: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<AuthSession | null>(() => authService.restoreSession());
  const [sensitiveActionState, setSensitiveActionState] = useState<SensitiveActionState | null>(null);

  // Expire the session in-app when its TTL passes.
  useEffect(() => {
    if (!session) return;
    const ms = session.expiresAt - Date.now();
    if (ms <= 0) {
      setSession(null);
      return;
    }
    const t = window.setTimeout(() => setSession(authService.restoreSession()), Math.min(ms + 50, 2 ** 31 - 1));
    return () => window.clearTimeout(t);
  }, [session]);

  // apiClient signals 401 -> drop session.
  useEffect(() => {
    const onUnauthorized = () => {
      authService.logout();
      sessionCache.clearAll();
      setSession(null);
    };
    window.addEventListener('futureschool:unauthorized', onUnauthorized);
    return () => window.removeEventListener('futureschool:unauthorized', onUnauthorized);
  }, []);

  const startSession = useCallback((next: AuthSession) => {
    sessionCache.clearAll();
    setSensitiveActionState(null);
    setSession(next);
  }, []);

  const logout = useCallback(() => {
    authService.logout(session?.sessionId);
    sessionCache.clearAll();
    setSensitiveActionState(null);
    setSession(null);
  }, [session]);

  const switchActiveChild = useCallback(
    async (studentId: string): Promise<boolean> => {
      if (!session || session.role !== 'PARENT' || session.studentId === studentId) return false;
      const res = await authService.switchChild(session.sessionId, studentId);
      if (!res.ok) return false;
      // Nothing from the previous child (or school) may survive the switch.
      sessionCache.clearAll();
      setSensitiveActionState(null);
      setSession(res.data);
      return true;
    },
    [session]
  );

  const promptSensitiveActionAuth = useCallback(
    (actionTitle: string, onSuccess: (stepUpToken: string) => void, purpose: StepUpPurpose = 'SENSITIVE_STAFF_ACTION') => {
      setSensitiveActionState({ isOpen: true, actionTitle, purpose, onSuccess });
    },
    []
  );

  const cancelSensitiveActionAuth = useCallback(() => setSensitiveActionState(null), []);

  const completeSensitiveActionAuth = useCallback(
    (stepUpToken: string) => {
      const pending = sensitiveActionState;
      setSensitiveActionState(null);
      pending?.onSuccess(stepUpToken);
    },
    [sensitiveActionState]
  );

  const adminQuorumWarning = useMemo(() => {
    if (!session || (session.role !== 'ADMIN' && session.role !== 'PRINCIPAL')) return null;
    const q = authService.getAdminQuorum(session.schoolId);
    return q.meetsMinimum
      ? null
      : `Only ${q.activeAdmins} active Admin for this school. Keep at least two so access is never lost.`;
  }, [session]);

  const value: AuthContextType = {
    session,
    currentUser: session?.profile ?? null,
    currentRole: session?.role ?? null,
    isAuthenticated: Boolean(session),
    linkedChildren: session?.profile.linkedChildren ?? [],
    startSession,
    logout,
    switchActiveChild,
    promptSensitiveActionAuth,
    sensitiveActionState,
    cancelSensitiveActionAuth,
    completeSensitiveActionAuth,
    adminQuorumWarning
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
