/**
 * Parent app shell (mobile-first PWA layout).
 * Top: a blue header with a wave edge: school, "Welcome back" (home) or the active child, and a
 * row of child chips when the parent has several children (tap to switch).
 * Bottom: Home, Academics, Fees, Messages, More. On desktop the same layout is centred.
 */
import React, { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, BookOpen, ChevronLeft, Home, IndianRupee, MessageSquare, MoreHorizontal, RotateCw } from 'lucide-react';
import { isParentTab, useGoBack } from '../../../app/backNavigation';
import { useAuth } from '../../../context/AuthContext';
import { useTenant } from '../../../context/TenantContext';
import { LanguageToggle } from '../../../components/common/LanguageToggle';
import { SensitiveActionModal } from '../../../components/common/SensitiveActionModal';
import { ErrorState, LoadingBlock } from '../../../components/common/States';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { authService } from '../../../services/authService';
import { PinSetupScreen } from '../../auth/PinSetupScreen';
import { readStudentPhoto } from '../../../utils/studentPhoto';

const TABS = [
  { to: '/parent/home', key: 'home', icon: Home },
  { to: '/parent/academics', key: 'academics', icon: BookOpen },
  { to: '/parent/fees', key: 'fees', icon: IndianRupee },
  { to: '/parent/messages', key: 'messages', icon: MessageSquare },
  { to: '/parent/more', key: 'more', icon: MoreHorizontal }
] as const;

/**
 * A parent without a sign-in PIN (first sign-in, or "Forgot PIN") sees only the PIN screen; the
 * server refuses everything else until then too. After a sign-in with an SMS code, this phone is
 * trusted, so next time the PIN alone is enough (no SMS).
 */
export const ParentShell: React.FC = () => {
  const scope = useScope();
  const { session } = useAuth();
  const { state: tenant, reload: reloadTenant } = useTenant();
  const trustedSessionRef = React.useRef<string | null>(null);
  const wasReadyRef = React.useRef(false);
  const pin = useQuery(() => authService.getParentPin(scope), [scope.userId]);
  const ready = pin.status === 'ready' && !(pin.data.setupRequired ?? !pin.data.pinSet);
  const smsSession = Boolean(session?.authMethods.includes('SMS_OTP'));
  useEffect(() => {
    if (ready && !wasReadyRef.current && tenant.status === 'error') {
      reloadTenant();
    }
    wasReadyRef.current = ready;
  }, [ready, tenant.status, reloadTenant]);
  useEffect(() => {
    if (!ready || !smsSession || !session?.sessionId) return;
    if (trustedSessionRef.current === session.sessionId) return;
    trustedSessionRef.current = session.sessionId;
    void authService.trustThisDevice();
  }, [ready, smsSession, session?.sessionId]);

  if (pin.status === 'loading') return <div className="p-6"><LoadingBlock /></div>;
  if (pin.status === 'error') return <div className="p-6"><ErrorState message={pin.error} onRetry={pin.reload} /></div>;
  if (!ready) {
    return (
      <PinSetupScreen
        resetting={pin.data.pinSet}
        save={p => authService.setParentPin(scope, p)}
        onDone={() => {
          pin.reload();
          reloadTenant();
        }}
      />
    );
  }
  return <ParentApp />;
};

/** The wave at the bottom of the blue header (as in the reference design). */
const HeaderWave: React.FC = () => (
  <svg className="absolute -bottom-px left-0 w-full h-7 text-slate-50" viewBox="0 0 400 28" preserveAspectRatio="none" aria-hidden="true">
    <path d="M0 14 C 70 30, 130 2, 200 14 S 330 28, 400 10 V28 H0 Z" fill="currentColor" />
  </svg>
);

const ParentApp: React.FC = () => {
  const { t } = useTranslation();
  const { session, currentUser, linkedChildren, switchActiveChild } = useAuth();
  const { state: tenant, school, boardProfile, reload: reloadTenant } = useTenant();
  const navigate = useNavigate();
  const location = useLocation();
  const [switching, setSwitching] = useState<string | null>(null);
  const child = currentUser?.activeChild;
  const childPhoto = child ? readStudentPhoto(child.id) : null;
  const onHome = location.pathname.startsWith('/parent/home');
  const subPage = !isParentTab(location.pathname);
  const goBack = useGoBack('/parent/more');

  const pick = async (id: string) => {
    if (id === child?.id || switching) return;
    setSwitching(id);
    const ok = await switchActiveChild(id);
    setSwitching(null);
    if (ok) navigate(location.pathname, { replace: true });
  };

  return (
    <div className="min-h-dvh bg-slate-100 text-slate-900">
      <div className="mx-auto w-full max-w-xl md:max-w-3xl lg:max-w-5xl xl:max-w-6xl min-h-dvh bg-slate-50 flex flex-col md:border-x md:border-slate-200 md:shadow-sm">
        <header className="relative hero-glow text-white px-4 md:px-8 pt-[max(0.5rem,env(safe-area-inset-top))] pb-9">
          <div className="flex items-center justify-between gap-2 min-h-10">
            {subPage && (
              <button
                type="button"
                onClick={goBack}
                aria-label={t('common.back')}
                className="-ml-2 shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-white hover:bg-white/15"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}
            <span className="flex-1 min-w-0 text-sm font-semibold text-blue-100 truncate">
              {school?.name ?? 'FutureSchool'}
              {boardProfile && <span className="ml-1.5 align-middle px-1.5 py-0.5 rounded-md bg-white/15 text-[10px] font-bold tracking-wide">{boardProfile.shortName}</span>}
            </span>
            <LanguageToggle onDark />
          </div>
          {child && (
            <div className="mt-2 flex items-center gap-3">
              <span className="flex-1 min-w-0">
                {onHome ? (
                  <>
                    <span className="block text-sm text-blue-100">{t('parent.ui.welcomeBack')}</span>
                    <span className="block text-[28px] leading-tight font-extrabold tracking-tight truncate">{currentUser?.name}</span>
                  </>
                ) : (
                  <>
                    <span className="block text-lg font-bold truncate">{child.name}</span>
                    <span className="block text-sm text-blue-100 truncate">
                      {t('login.classSection', { grade: child.grade, section: child.section })} · {child.schoolName}
                    </span>
                  </>
                )}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <Link
                  to="/parent/notices"
                  aria-label={t('parent.more.notices')}
                  className="relative w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white"
                >
                  <Bell className="w-5 h-5" />
                </Link>
                <Link to="/parent/profile" aria-label="Student profile" className="shrink-0 rounded-full">
                  <img src={childPhoto ?? child.avatar} alt="" className="w-12 h-12 rounded-full bg-white/90 ring-2 ring-white/70 object-cover" />
                </Link>
              </div>
            </div>
          )}
          {linkedChildren.length > 1 && (
            <div role="tablist" aria-label={t('parent.switchChild')} className="mt-3 -mx-4 px-4 flex gap-2 overflow-x-auto no-scrollbar">
              {linkedChildren.map(c => {
                const active = c.id === child?.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    disabled={Boolean(switching)}
                    onClick={() => pick(c.id)}
                    className={`shrink-0 min-h-11 pl-1.5 pr-3 rounded-xl flex items-center gap-2 text-sm font-semibold transition ${
                      active ? 'bg-white text-blue-800 shadow' : 'bg-white/15 text-white hover:bg-white/25'
                    }`}
                  >
                    {switching === c.id ? (
                      <RotateCw className="w-7 h-7 p-1 animate-spin" />
                    ) : (
                      <img src={c.avatar} alt="" className="w-7 h-7 rounded-full bg-white" />
                    )}
                    <span className="text-left leading-tight">
                      <span className="block">{c.name.split(' ')[0]}</span>
                      <span className={`block text-[11px] font-medium ${active ? 'text-blue-600' : 'text-blue-100'}`}>
                        {t('login.classSection', { grade: c.grade, section: c.section })}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <HeaderWave />
        </header>

        <main className="flex-1 px-4 md:px-8 pt-1 pb-28" key={`${session?.schoolId}:${session?.studentId}`}>
          {tenant.status === 'loading' ? (
            <LoadingBlock />
          ) : tenant.status === 'error' ? (
            <ErrorState message={tenant.error} onRetry={reloadTenant} />
          ) : (
            <div key={location.pathname} className="fs-rise">
              <Outlet />
            </div>
          )}
        </main>

        <nav
          className="fixed bottom-0 inset-x-0 z-30 mx-auto w-full max-w-xl md:max-w-3xl lg:max-w-5xl xl:max-w-6xl bg-white/85 backdrop-blur-xl border-t border-slate-200/70 shadow-[0_-8px_30px_-18px_rgb(15_23_42/0.25)] grid grid-cols-5 pb-[env(safe-area-inset-bottom)]"
          aria-label={t('parent.mainNav')}
        >
          {TABS.map(({ to, key, icon: Icon }) => (
            <NavLink
              key={key}
              to={to}
              className={({ isActive }) =>
                `min-h-16 flex flex-col items-center justify-center gap-1 text-xs font-semibold ${isActive ? 'text-blue-700' : 'text-slate-500'}`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`px-4 py-1 rounded-full transition-colors ${isActive ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30' : ''}`}>
                    <Icon className="w-5 h-5" />
                  </span>
                  {t(`parent.tabs.${key}`)}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
      <SensitiveActionModal />
    </div>
  );
};
