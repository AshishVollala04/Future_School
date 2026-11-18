import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { ROLE_NAVIGATION } from '../../app/navigationConfig';
import { NavGroup, NavItem, UserRole } from '../../types/roles';
import { NavIcon } from './NavIcon';
import { Logo } from '../common/Logo';
import {
  Menu,
  X,
  Search,
  Bell,
  Sun,
  Moon,
  LogOut,
  ChevronDown,
  Globe,
  ShieldCheck,
  Check,
  CheckCircle2,
  Building2,
  Sparkles,
  Home,
  CalendarCheck,
  CreditCard,
  Award,
  User,
  Eye
} from 'lucide-react';
import { LanguageToggle } from '../common/LanguageToggle';
import { SensitiveActionModal } from '../common/SensitiveActionModal';
import { ConfirmDialog } from '../ui/Modal';

export const AppShell: React.FC = () => {
  const { session, currentUser, currentRole, logout, switchActiveChild, linkedChildren } = useAuth();
  const [childSwitcherOpen, setChildSwitcherOpen] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const activeChild = currentRole === 'PARENT' ? currentUser?.activeChild : undefined;
  const scopeKey = `${session?.role}:${session?.schoolId}:${session?.studentId ?? ''}`;

  const handleSwitchChild = async (studentId: string) => {
    setSwitchingTo(studentId);
    const ok = await switchActiveChild(studentId);
    setSwitchingTo(null);
    setChildSwitcherOpen(false);
    if (ok) navigate('/parent/dashboard', { replace: true });
  };
  const { state: tenantState, school } = useTenant();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    return document.documentElement.classList.contains('dark');
  });

  const navigate = useNavigate();
  const location = useLocation();

  const toggleDarkMode = () => {
    if (darkMode) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('futureschool_theme', 'light');
      setDarkMode(false);
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('futureschool_theme', 'dark');
      setDarkMode(true);
    }
  };

  const navGroups: NavGroup[] = currentRole && ROLE_NAVIGATION[currentRole as UserRole] 
    ? ROLE_NAVIGATION[currentRole as UserRole] 
    : [];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col antialiased">
      {/* 1. TopBar Navigation */}
      <header className="sticky top-0 z-40 h-16 w-full bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800/80 px-4 sm:px-6 flex items-center justify-between gap-4 shadow-xs">
        {/* Left: Mobile Drawer Trigger + Brand Wordmark + Tenant Badge */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileDrawerOpen(true)}
            className="lg:hidden p-2 -ml-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <Logo size="sm" />
            <div className="hidden sm:inline-block h-5 w-[1px] bg-slate-200 dark:bg-slate-700" />
            
            {/* Active school: from the session only. No switcher. */}
            {school && (
              <div className="hidden sm:flex items-center gap-2 min-w-0">
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{school.name}</span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-900 border border-blue-200">
                  AY {school.academicYear.label}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Center: Search placeholder */}
        <div className="hidden md:flex items-center flex-1 max-w-md mx-4">
          <div className="relative w-full">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              readOnly
              placeholder="Search students, subjects, circulars or files (Ctrl + K)..."
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 placeholder-slate-400 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-600"
              onClick={() => alert('Search index: Enter student roll number, subject code or notice title in any module.')}
            />
          </div>
        </div>

        {/* Right: Actions (Language, Theme, Notifications, Profile) */}
        <div className="flex items-center gap-2">
          {/* Language Placeholder */}
          <div className="hidden sm:flex items-center gap-1 px-2 py-1.5 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 rounded-lg">
            <Globe className="w-3.5 h-3.5" />
            <span>EN</span>
          </div>

          {/* Theme Toggle */}
          <button
            onClick={toggleDarkMode}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Toggle theme"
          >
            {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Notifications Dropdown Trigger */}
          <div className="relative">
            <button
              onClick={() => setNotificationsOpen(!notificationsOpen)}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors relative"
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4" />
            </button>

            {notificationsOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setNotificationsOpen(false)} />
                <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-4 z-50">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">Campus Notifications</h4>
                    <span className="text-[10px] text-slate-400 font-medium">All caught up</span>
                  </div>
                  <div className="py-6 text-center">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1.5" />
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300">No new notices</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">All official campus bulletins are up to date.</p>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Language Switcher (EN <-> Telugu) */}
          <LanguageToggle />

          {/* User Profile Menu */}
          <div className="relative">
            <button
              onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
              className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <img
                src={currentUser?.avatar || 'https://api.dicebear.com/7.x/notionists/svg?seed=Aarav'}
                alt={currentUser?.name}
                className="w-8 h-8 rounded-xl object-cover ring-1 ring-slate-200 dark:ring-slate-700 bg-blue-50"
              />
              <div className="hidden md:block text-left">
                <div className="text-xs font-bold text-slate-900 dark:text-white truncate max-w-[130px]">
                  {currentUser?.name}
                </div>
                <div className="text-[10px] text-slate-500 font-mono truncate max-w-[130px]">
                  {currentUser?.id}
                </div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {profileDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setProfileDropdownOpen(false)} />
                <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-2 z-50">
                  <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                    <p className="text-xs font-bold text-slate-900 dark:text-white">{currentUser?.name}</p>
                    <p className="text-[11px] text-slate-500 font-mono">{currentUser?.email}</p>
                    <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60">
                      {currentUser?.roleLabel}
                    </span>
                  </div>

                  <div className="pt-1">
                    <button
                      onClick={() => setConfirmLogout(true)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* 2. Main Layout Split (Desktop Sidebar + Content Body) */}
      <div className="flex-1 flex max-w-[1600px] w-full mx-auto">
        {/* Desktop Sidebar (hidden on mobile, visible lg:) */}
        <aside className="hidden lg:flex flex-col w-64 xl:w-72 shrink-0 border-r border-slate-200 dark:border-slate-800/80 bg-white/60 dark:bg-slate-900/40 backdrop-blur-md p-4 min-h-[calc(100vh-4rem)]">
          <div className="space-y-6 flex-1 overflow-y-auto pr-1">
            {navGroups.map((group: NavGroup) => (
              <div key={group.title}>
                <h3 className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  {group.title}
                </h3>
                <div className="space-y-1">
                  {group.items.map((item: NavItem) => (
                    <NavLink
                      key={item.id}
                      to={item.path}
                      className={({ isActive }) =>
                        `flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                          isActive
                            ? 'bg-indigo-600 text-white shadow-xs shadow-indigo-600/30 font-bold'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white'
                        }`
                      }
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <NavIcon name={item.iconName} className="w-4 h-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </div>
                      {item.badge !== undefined && (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          item.badgeColor === 'orange' ? 'bg-orange-500 text-white' :
                          item.badgeColor === 'rose' ? 'bg-rose-500 text-white' :
                          'bg-indigo-600 text-white'
                        }`}>
                          {item.badge}
                        </span>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 mt-4 text-[11px] text-slate-400 text-center">
            {school ? `${school.name} · AY ${school.academicYear.label}` : 'FutureSchool'}
          </div>
        </aside>

        {/* Mobile Drawer (visible when mobileDrawerOpen) */}
        {mobileDrawerOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <div
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm"
              onClick={() => setMobileDrawerOpen(false)}
            />
            <div className="relative w-72 max-w-[80vw] bg-white dark:bg-slate-900 p-4 h-full flex flex-col shadow-2xl z-10 overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <Logo size="sm" />
                <button
                  onClick={() => setMobileDrawerOpen(false)}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-5 mt-4 flex-1">
                {navGroups.map((group: NavGroup) => (
                  <div key={group.title}>
                    <h3 className="px-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      {group.title}
                    </h3>
                    <div className="space-y-1">
                      {group.items.map((item: NavItem) => (
                        <NavLink
                          key={item.id}
                          to={item.path}
                          onClick={() => setMobileDrawerOpen(false)}
                          className={({ isActive }) =>
                            `flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                              isActive
                                ? 'bg-indigo-600 text-white font-bold'
                                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`
                          }
                        >
                          <div className="flex items-center gap-3">
                            <NavIcon name={item.iconName} className="w-4 h-4 shrink-0" />
                            <span>{item.label}</span>
                          </div>
                          {item.badge !== undefined && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-500 text-white">
                              {item.badge}
                            </span>
                          )}
                        </NavLink>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={() => setConfirmLogout(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/40 rounded-xl"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Log Out</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 min-w-0 pb-24 xl:p-10">
          {activeChild && (
            <button
              type="button"
              onClick={() => linkedChildren.length > 1 && setChildSwitcherOpen(true)}
              className="w-full mb-4 min-h-14 px-3.5 py-2.5 rounded-2xl bg-white border border-slate-200 flex items-center gap-3 text-left"
              aria-label="Active child"
            >
              <img src={activeChild.avatar} alt="" className="w-10 h-10 rounded-full bg-slate-100" />
              <span className="flex-1 min-w-0">
                <span className="block text-base font-semibold text-slate-900 truncate">{activeChild.name}</span>
                <span className="block text-sm text-slate-500 truncate">
                  Class {activeChild.grade}-{activeChild.section} · {activeChild.schoolName}
                </span>
              </span>
              {linkedChildren.length > 1 && (
                <span className="text-sm font-semibold text-blue-800 flex items-center gap-1">
                  Switch <ChevronDown className="w-4 h-4" />
                </span>
              )}
            </button>
          )}
          {/* Remount every page when role/school/student scope changes so no state leaks across. */}
          <div key={scopeKey}>
            {tenantState.status === 'loading' ? (
              <p className="text-sm text-slate-500 py-12 text-center">Loading school…</p>
            ) : tenantState.status === 'error' ? (
              <div role="alert" className="max-w-md mx-auto my-12 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-sm text-rose-800">
                Could not load your school ({tenantState.error}). Please sign out and sign in again.
              </div>
            ) : (
              <Outlet />
            )}
          </div>
        </main>

        <ConfirmDialog
          isOpen={confirmLogout}
          onClose={() => setConfirmLogout(false)}
          onConfirm={handleLogout}
          title="Log out?"
          description="You will need to sign in again to continue."
          confirmLabel="Log out"
          variant="danger"
        />
        {childSwitcherOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
            <div className="fixed inset-0 bg-slate-950/50" onClick={() => setChildSwitcherOpen(false)} />
            <div role="dialog" aria-label="Switch child" className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-2">
              <h2 className="text-lg font-bold text-slate-900 px-1">Switch child</h2>
              {linkedChildren.map(c => (
                <button
                  key={c.id}
                  type="button"
                  disabled={Boolean(switchingTo)}
                  onClick={() => (c.id === activeChild?.id ? setChildSwitcherOpen(false) : handleSwitchChild(c.id))}
                  className={`w-full min-h-16 px-3.5 py-3 rounded-2xl border flex items-center gap-3 text-left ${
                    c.id === activeChild?.id ? 'border-blue-600 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <img src={c.avatar} alt="" className="w-10 h-10 rounded-full bg-slate-100" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-base font-semibold text-slate-900 truncate">{c.name}</span>
                    <span className="block text-sm text-slate-500 truncate">Class {c.grade}-{c.section} · {c.schoolName}</span>
                  </span>
                  {c.id === activeChild?.id && <Check className="w-5 h-5 text-blue-700" />}
                  {switchingTo === c.id && <span className="text-sm text-slate-500">…</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>


      {/* =========================================================================
          RAILONE-STYLE MOBILE BOTTOM NAVIGATION BAR (Visible on mobile/tablet)
         ========================================================================= */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 px-3 py-1.5 flex items-center justify-around shadow-2xl">
        <NavLink
          to={`/${currentRole?.toLowerCase()}/dashboard`}
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition-all ${
              isActive
                ? 'text-blue-800 dark:text-blue-400 font-bold'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
            }`
          }
        >
          <Home className="w-5 h-5" />
          <span className="text-[10px] tracking-tight">Home</span>
        </NavLink>

        <NavLink
          to={
            currentRole === 'TEACHER'
              ? '/teacher/attendance'
              : currentRole === 'ADMIN'
              ? '/admin/academic-structure'
              : `/${currentRole?.toLowerCase()}/attendance`
          }
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition-all ${
              isActive
                ? 'text-blue-800 dark:text-blue-400 font-bold'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
            }`
          }
        >
          <CalendarCheck className="w-5 h-5" />
          <span className="text-[10px] tracking-tight">Attendance</span>
        </NavLink>

        <NavLink
          to={
            currentRole === 'TEACHER'
              ? '/teacher/marks'
              : currentRole === 'ADMIN'
              ? '/admin/fees'
              : `/${currentRole?.toLowerCase()}/fees`
          }
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition-all ${
              isActive
                ? 'text-blue-800 dark:text-blue-400 font-bold'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
            }`
          }
        >
          <CreditCard className="w-5 h-5" />
          <span className="text-[10px] tracking-tight">
            {currentRole === 'TEACHER' ? 'Marks' : 'Fees & Pass'}
          </span>
        </NavLink>

        <NavLink
          to={
            currentRole === 'PARENT'
              ? '/parent/academics'
              : currentRole === 'STUDENT'
              ? '/student/academics'
              : currentRole === 'TEACHER'
              ? '/teacher/homework'
              : `/${currentRole?.toLowerCase()}/dashboard`
          }
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition-all ${
              isActive
                ? 'text-blue-800 dark:text-blue-400 font-bold'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
            }`
          }
        >
          <Award className="w-5 h-5" />
          <span className="text-[10px] tracking-tight">Report Card</span>
        </NavLink>

        <NavLink
          to={
            currentRole === 'PARENT'
              ? '/parent/overview'
              : currentRole === 'STUDENT'
              ? '/student/profile'
              : currentRole === 'TEACHER'
              ? '/teacher/students'
              : `/${currentRole?.toLowerCase()}/dashboard`
          }
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition-all ${
              isActive
                ? 'text-blue-800 dark:text-blue-400 font-bold'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
            }`
          }
        >
          <User className="w-5 h-5" />
          <span className="text-[10px] tracking-tight">Student ID</span>
        </NavLink>
      </nav>


      {/* =========================================================================
          RAILONE-STYLE MOBILE BOTTOM NAVIGATION BAR (Visible on mobile/tablet)
         ========================================================================= */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 px-3 py-1.5 flex items-center justify-around shadow-2xl">
        <NavLink
          to={`/${currentRole?.toLowerCase()}/dashboard`}
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition-all ${
              isActive
                ? 'text-blue-800 dark:text-blue-400 font-bold'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
            }`
          }
        >
          <Home className="w-5 h-5" />
          <span className="text-[10px] tracking-tight">Home</span>
        </NavLink>

        <NavLink
          to={
            currentRole === 'TEACHER'
              ? '/teacher/attendance'
              : currentRole === 'ADMIN'
              ? '/admin/academic-structure'
              : `/${currentRole?.toLowerCase()}/attendance`
          }
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition-all ${
              isActive
                ? 'text-blue-800 dark:text-blue-400 font-bold'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
            }`
          }
        >
          <CalendarCheck className="w-5 h-5" />
          <span className="text-[10px] tracking-tight">Attendance</span>
        </NavLink>

        <NavLink
          to={
            currentRole === 'TEACHER'
              ? '/teacher/marks'
              : currentRole === 'ADMIN'
              ? '/admin/fees'
              : `/${currentRole?.toLowerCase()}/fees`
          }
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition-all ${
              isActive
                ? 'text-blue-800 dark:text-blue-400 font-bold'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
            }`
          }
        >
          <CreditCard className="w-5 h-5" />
          <span className="text-[10px] tracking-tight">
            {currentRole === 'TEACHER' ? 'Marks' : 'Fees & Pass'}
          </span>
        </NavLink>

        <NavLink
          to={
            currentRole === 'PARENT'
              ? '/parent/academics'
              : currentRole === 'STUDENT'
              ? '/student/academics'
              : currentRole === 'TEACHER'
              ? '/teacher/homework'
              : `/${currentRole?.toLowerCase()}/dashboard`
          }
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition-all ${
              isActive
                ? 'text-blue-800 dark:text-blue-400 font-bold'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
            }`
          }
        >
          <Award className="w-5 h-5" />
          <span className="text-[10px] tracking-tight">Report Card</span>
        </NavLink>

        <NavLink
          to={
            currentRole === 'PARENT'
              ? '/parent/overview'
              : currentRole === 'STUDENT'
              ? '/student/profile'
              : currentRole === 'TEACHER'
              ? '/teacher/students'
              : `/${currentRole?.toLowerCase()}/dashboard`
          }
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition-all ${
              isActive
                ? 'text-blue-800 dark:text-blue-400 font-bold'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
            }`
          }
        >
          <User className="w-5 h-5" />
          <span className="text-[10px] tracking-tight">Student ID</span>
        </NavLink>
      </nav>

      {/* Step-Up Security Re-Authentication for Sensitive Actions */}
      <SensitiveActionModal />
    </div>
  );
};
