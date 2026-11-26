/**
 * Staff shell (Teacher now; Principal/Admin next). Desktop: sidebar. Mobile: top bar + bottom bar + drawer.
 * Navigation is passed in as groups so each portal decides what it shows (e.g. the Class Teacher group
 * appears only for Class Teachers).
 */
import React, { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, LogOut, Menu, X } from 'lucide-react';
import { isHome, useGoBack } from '../../app/backNavigation';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { LanguageToggle } from '../common/LanguageToggle';
import { SensitiveActionModal } from '../common/SensitiveActionModal';
import { ErrorState, LoadingBlock } from '../common/States';
import { ConfirmDialog } from '../ui/Modal';

export interface StaffNavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}
export interface StaffNavGroup {
  title: string;
  items: StaffNavItem[];
}

export interface StaffShellProps {
  /** Desktop sidebar (and the mobile drawer unless `drawerGroups` is given). */
  groups: StaffNavGroup[];
  /** Mobile bottom bar. */
  bottom: StaffNavItem[];
  roleLabel: string;
  /** Mobile drawer only, e.g. the items not already reachable from the bottom bar or home cards. */
  drawerGroups?: StaffNavGroup[];
  /** Show the "More" button in the mobile bottom bar (default true). The top-left menu button stays either way. */
  showMoreInBottomNav?: boolean;
  /** Extra header controls shown beside the language toggle (e.g. the teacher's alerts bell). */
  headerExtra?: React.ReactNode;
}

export const StaffShell: React.FC<StaffShellProps> = ({ groups, bottom, roleLabel, drawerGroups, showMoreInBottomNav = true, headerExtra }) => {
  const { t } = useTranslation();
  const { session, currentUser, logout } = useAuth();
  const { state: tenant, school, boardProfile, reload: reloadTenant } = useTenant();
  const navigate = useNavigate();
  const [drawer, setDrawer] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const location = useLocation();
  const goBack = useGoBack();

  const signOut = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const nav = (list: StaffNavGroup[], onPick?: () => void) => (
    <nav className="space-y-5">
      {list.map((g, gi) => (
        <div key={g.title || `group-${gi}`}>
          {g.title && <h3 className="px-3 mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{g.title}</h3>}
          <ul className="space-y-0.5">
            {g.items.map(i => (
              <li key={i.to}>
                <NavLink
                  to={i.to}
                  onClick={onPick}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 min-h-11 rounded-xl text-sm font-medium ${isActive ? 'bg-blue-700 text-white' : 'text-slate-700 hover:bg-slate-100'}`
                  }
                >
                  <i.icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1 truncate">{i.label}</span>
                  {Boolean(i.badge) && <span className="min-w-5 h-5 px-1.5 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center">{i.badge}</span>}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900">
      {/* Same blue brand as the parent app and sign-in page. */}
      <header className="sticky top-0 z-30 hero-glow text-white shadow-md shadow-blue-900/10 pt-[env(safe-area-inset-top)]">
        <div className="min-h-16 py-2 px-3 sm:px-5 flex items-center gap-3">
          <button className="lg:hidden w-11 h-11 -ml-1 flex items-center justify-center rounded-xl hover:bg-white/15" onClick={() => setDrawer(true)} aria-label={t('staff.openMenu')}>
            <Menu className="w-5 h-5" />
          </button>
          {!isHome(location.pathname) && (
            <button className="w-11 h-11 -ml-1 flex items-center justify-center rounded-xl hover:bg-white/15" onClick={goBack} aria-label={t('staff.back')}>
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            {/* Wraps to two lines on a phone instead of cutting the school name. */}
            <p className="text-sm sm:text-base font-bold leading-tight line-clamp-2">{school?.name ?? 'FutureSchool'}</p>
            <p className="text-xs text-blue-100 truncate">
              {currentUser?.name} · {roleLabel}
              {school && ` · ${boardProfile ? `${boardProfile.shortName} · ` : ''}AY ${school.academicYear.label}`}
            </p>
          </div>
          {headerExtra}
          <LanguageToggle onDark />
          <button onClick={() => setConfirmSignOut(true)} className="hidden sm:flex min-h-10 px-3 rounded-full items-center gap-1.5 text-sm font-semibold text-white/90 hover:bg-white/15" aria-label={t('staff.signOut')}>
            <LogOut className="w-4 h-4" /> {t('staff.signOut')}
          </button>
        </div>
      </header>

      <div className="flex max-w-[1400px] mx-auto">
        <aside className="hidden lg:block w-64 shrink-0 border-r border-slate-200 bg-white min-h-[calc(100dvh-4rem)] p-3">{nav(groups)}</aside>
        <main className="flex-1 min-w-0 p-4 sm:p-6 pb-28 lg:pb-8" key={`${session?.role}:${session?.schoolId}`}>
          {tenant.status === 'loading' ? <LoadingBlock /> : tenant.status === 'error' ? <ErrorState message={tenant.error} onRetry={reloadTenant} /> : (
            <div key={location.pathname} className="fs-rise"><Outlet /></div>
          )}
        </main>
      </div>

      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 grid pb-[env(safe-area-inset-bottom)]" style={{ gridTemplateColumns: `repeat(${bottom.length + (showMoreInBottomNav ? 1 : 0)}, minmax(0, 1fr))` }}>
        {bottom.map(i => (
          <NavLink key={i.to} to={i.to} className={({ isActive }) => `min-h-16 flex flex-col items-center justify-center gap-1 text-xs font-semibold ${isActive ? 'text-blue-800' : 'text-slate-500'}`}>
            <i.icon className="w-5 h-5" />
            <span className="truncate max-w-full px-1">{i.label}</span>
          </NavLink>
        ))}
        {showMoreInBottomNav && (
          <button onClick={() => setDrawer(true)} className="min-h-16 flex flex-col items-center justify-center gap-1 text-xs font-semibold text-slate-500">
            <Menu className="w-5 h-5" /> {t('staff.more')}
          </button>
        )}
      </nav>

      {/* Mobile menu: always mounted so it can slide in and out; `inert` keeps it unreachable while closed. */}
      <div className={`fixed inset-0 z-50 lg:hidden ${drawer ? '' : 'pointer-events-none'}`} inert={!drawer} aria-hidden={!drawer}>
        <div
          className={`absolute inset-0 bg-slate-950/50 transition-opacity duration-300 ease-out ${drawer ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setDrawer(false)}
        />
        <div
          className={`absolute inset-y-0 left-0 w-80 max-w-[85vw] bg-white p-3 overflow-y-auto flex flex-col shadow-2xl transition-transform duration-300 ease-out ${drawer ? 'translate-x-0' : '-translate-x-full'}`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="px-2 text-sm font-bold text-blue-800">{t('staff.menu')}</span>
            <button className="w-11 h-11 flex items-center justify-center rounded-xl hover:bg-slate-100" onClick={() => setDrawer(false)} aria-label={t('staff.closeMenu')}>
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1">{nav(drawerGroups ?? groups, () => setDrawer(false))}</div>
          <button onClick={() => setConfirmSignOut(true)} className="mt-4 min-h-12 rounded-xl border border-rose-200 text-rose-700 font-semibold flex items-center justify-center gap-2">
            <LogOut className="w-4 h-4" /> {t('staff.signOut')}
          </button>
        </div>
      </div>
      <ConfirmDialog
        isOpen={confirmSignOut}
        onClose={() => setConfirmSignOut(false)}
        onConfirm={signOut}
        title={t('staff.signOutTitle')}
        description={t('staff.signOutDesc')}
        confirmLabel={t('staff.signOut')}
        cancelLabel={t('common.cancel')}
        variant="danger"
      />
      <SensitiveActionModal />
    </div>
  );
};
