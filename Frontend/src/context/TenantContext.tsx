/**
 * FutureSchool - TenantProvider
 *
 * The active school comes ONLY from the signed-in session (session.schoolId).
 * There is no tenant switcher for school users: to see another school, a user
 * opens a different session (e.g. parent switches to a child in that school).
 *
 * Provides: school profile (name, branding, academic year) + board profile.
 * Applies branding as CSS variables (--fs-primary, --fs-accent).
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { SchoolProfile } from '../types/school';
import { schoolProfileService } from '../services/schoolProfileService';
import { BoardProfile, getBoardProfile } from '../services/boardProfileService';

type TenantState =
  | { status: 'none' }
  | { status: 'loading'; schoolId: string }
  | { status: 'error'; schoolId: string; error: string }
  | { status: 'ready'; schoolId: string; school: SchoolProfile; boardProfile: BoardProfile | null };

interface TenantContextType {
  state: TenantState;
  /** Convenience accessors; null until ready. */
  school: SchoolProfile | null;
  boardProfile: BoardProfile | null;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

const DEFAULT_PRIMARY = '#1d4ed8';
const DEFAULT_ACCENT = '#ea580c';

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session } = useAuth();
  const schoolId = session?.schoolId ?? null;
  const [state, setState] = useState<TenantState>({ status: 'none' });

  useEffect(() => {
    if (!schoolId) {
      setState({ status: 'none' });
      return;
    }
    let live = true;
    setState({ status: 'loading', schoolId });
    schoolProfileService.getProfile(schoolId).then(r => {
      if (!live) return;
      if (!r.ok) setState({ status: 'error', schoolId, error: r.error });
      else setState({ status: 'ready', schoolId, school: r.data, boardProfile: getBoardProfile(r.data.boardProfileId) });
    });
    return () => {
      live = false;
    };
  }, [schoolId]);

  useEffect(() => {
    const root = document.documentElement;
    const b = state.status === 'ready' ? state.school.branding : null;
    root.style.setProperty('--fs-primary', b?.primary ?? DEFAULT_PRIMARY);
    root.style.setProperty('--fs-accent', b?.accent ?? DEFAULT_ACCENT);
  }, [state]);

  const value: TenantContextType = {
    state,
    school: state.status === 'ready' ? state.school : null,
    boardProfile: state.status === 'ready' ? state.boardProfile : null
  };

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
};

export const useTenant = (): TenantContextType => {
  const c = useContext(TenantContext);
  if (!c) throw new Error('useTenant must be used within a TenantProvider');
  return c;
};
