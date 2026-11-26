/**
 * FutureSchool - Sign in
 *
 *  Parent            mobile + OTP  -> child picker (grouped by school)
 *  Teacher           mobile + OTP  -> school/role picker -> optional PIN
 *  Principal / Admin school email  -> Microsoft / Google, or password, + email OTP (always 2 factors)
 *
 * `/login?invite=<token>` opens the Principal/Admin tab with the invitation applied.
 */
import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Briefcase, FlaskConical, GraduationCap, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { authService } from '../../services/authService';
import { AuthSession, InvitationView } from '../../types/session';
import { LanguageToggle } from '../../components/common/LanguageToggle';
import { ErrorBox } from './authUi';
import { ParentLogin } from './ParentLogin';
import { TeacherLogin } from './TeacherLogin';
import { StaffEmailLogin } from './StaffEmailLogin';

type Tab = 'PARENT' | 'TEACHER' | 'STAFF';

export const homePathFor = (role: string) => `/${role.toLowerCase()}/dashboard`;

import { APP_VARIANT, allowsRole } from '../../app/appVariant';
import { USE_BACKEND } from '../../app/backendConfig';

export const LoginPage: React.FC = () => {
  const { t } = useTranslation();
  const { startSession, isAuthenticated, currentRole } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const inviteToken = params.get('invite');

  // ?idp=1: back from Microsoft/Google, so continue on the Principal / Admin tab.
  const [tab, setTab] = useState<Tab>(
    APP_VARIANT === 'parent' ? 'PARENT' : inviteToken || params.get('idp') ? 'STAFF' : APP_VARIANT === 'staff' ? 'TEACHER' : 'PARENT'
  );
  const [wrongApp, setWrongApp] = useState(false);
  const [invitation, setInvitation] = useState<InvitationView | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(Boolean(inviteToken));

  useEffect(() => {
    // Wake the Render free-tier container while the user enters their mobile/email credentials.
    if (USE_BACKEND) void authService.getIdpProviders();
  }, []);

  useEffect(() => {
    if (!inviteToken) return;
    let live = true;
    authService.getInvitation(inviteToken).then(r => {
      if (!live) return;
      setInviteLoading(false);
      if (r.ok) setInvitation(r.data);
      else setInviteError(r.error);
    });
    return () => {
      live = false;
    };
  }, [inviteToken]);

  if (isAuthenticated && currentRole && allowsRole(currentRole)) return <Navigate to={homePathFor(currentRole)} replace />;

  const onSession = (s: AuthSession) => {
    if (!allowsRole(s.role)) {
      setWrongApp(true);
      return;
    }
    startSession(s);
    navigate(homePathFor(s.role), { replace: true });
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'PARENT' as Tab, label: t('login.tabParent'), icon: <Users className="w-4 h-4" /> },
    { id: 'TEACHER' as Tab, label: t('login.tabTeacher'), icon: <Briefcase className="w-4 h-4" /> },
    { id: 'STAFF' as Tab, label: t('login.tabStaff'), icon: <ShieldCheck className="w-4 h-4" /> }
  ].filter(x => (APP_VARIANT === 'parent' ? x.id === 'PARENT' : APP_VARIANT === 'staff' ? x.id !== 'PARENT' : true));

  return (
    <div className="min-h-dvh bg-slate-50 flex flex-col items-center">
      {/* Same blue header and wave as the apps, so the product feels like one thing from the first screen. */}
      <header className="relative w-full hero-glow text-white px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-20">
        <div className="mx-auto w-full max-w-md flex justify-end">
          <LanguageToggle onDark />
        </div>
        <div className="mx-auto max-w-md flex flex-col items-center text-center mt-2">
          <div className="w-14 h-14 rounded-2xl bg-white text-blue-700 flex items-center justify-center shadow-lg shadow-blue-900/20 mb-3">
            <GraduationCap className="w-7 h-7" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight">
            Future<span className="text-orange-300">School</span>
          </h1>
          {APP_VARIANT === 'staff' && <p className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-orange-200">{t('login.adminApp')}</p>}
          <p className="mt-1 text-sm text-blue-100">{t(APP_VARIANT === 'staff' ? 'login.taglineStaff' : 'login.tagline')}</p>
        </div>
        <svg className="absolute -bottom-px left-0 w-full h-8 text-slate-50" viewBox="0 0 400 28" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 14 C 70 30, 130 2, 200 14 S 330 28, 400 10 V28 H0 Z" fill="currentColor" />
        </svg>
      </header>

      <main className="fs-rise relative -mt-14 w-[calc(100%-2rem)] max-w-md bg-white rounded-3xl border border-slate-200/80 shadow-float p-5 sm:p-8">
        {wrongApp && (
          <div className="mb-4">
            <ErrorBox message={t(APP_VARIANT === 'parent' ? 'login.useStaffApp' : 'login.useParentApp')} />
          </div>
        )}
        {tabs.length > 1 && (
        <div role="tablist" aria-label={t('login.signInAs')} className={`grid ${tabs.length === 2 ? 'grid-cols-2' : 'grid-cols-3'} gap-1 p-1 mb-6 rounded-2xl bg-slate-100`}>
          {tabs.map(x => (
            <button
              key={x.id}
              role="tab"
              type="button"
              aria-selected={tab === x.id}
              onClick={() => setTab(x.id)}
              className={`min-h-12 px-1 rounded-xl text-[13px] sm:text-sm font-semibold flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 leading-tight transition-colors ${
                tab === x.id ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {x.icon}
              {/* Wraps instead of being cut off on small phones ("Principal / Admin"). */}
              <span className="text-center">{x.label}</span>
            </button>
          ))}
        </div>
        )}

        {/* key forces each flow to start fresh when the tab changes */}
        {tab === 'PARENT' && <ParentLogin key="p" onSession={onSession} />}
        {tab === 'TEACHER' && <TeacherLogin key="t" onSession={onSession} />}
        {tab === 'STAFF' &&
          (inviteLoading ? (
            <p className="text-sm text-slate-500">{t('common.loading')}</p>
          ) : (
            <div className="space-y-4">
              {inviteError && <ErrorBox message={inviteError} />}
              <StaffEmailLogin key={invitation?.token ?? 's'} onSession={onSession} invitation={invitation} />
            </div>
          ))}
      </main>

      {authService.isMock && (
        <p className="mt-4 mx-4 max-w-md text-xs text-amber-800 flex items-center gap-1.5">
          <FlaskConical className="w-3.5 h-3.5 shrink-0" />
          {t('login.prototypeNotice')}
        </p>
      )}
    </div>
  );
};
