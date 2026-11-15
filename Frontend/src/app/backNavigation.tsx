/**
 * Back navigation that behaves like a phone app.
 *
 *  - Inside the app, back goes to the previous screen.
 *  - On a screen with no previous screen (opened from a link or after sign-in), back goes to
 *    that portal's home instead of closing the app.
 *  - On a home screen (or sign-in), the Android back button needs a second press within
 *    2 seconds to leave the app, with a short "Press back again to exit" note.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

/** Each portal's home; back from here leaves the app. */
const HOMES = ['/parent/home', '/teacher/today', '/principal/home', '/admin/home', '/student/dashboard', '/platform/dashboard', '/login'];

/** Main tabs of the parent app: reached from the bottom bar, so they need no back arrow. */
const PARENT_TABS = ['/parent/home', '/parent/academics', '/parent/fees', '/parent/messages', '/parent/more'];

export const isHome = (path: string) => HOMES.includes(path.replace(/\/+$/, '')) || path === '/';

export const isParentTab = (path: string) => PARENT_TABS.includes(path.replace(/\/+$/, ''));

/** React Router stores how deep this tab's history is; 0 means there is no earlier in-app screen. */
export const canGoBackInApp = () => {
  const idx = (window.history.state as { idx?: number } | null)?.idx;
  return typeof idx === 'number' && idx > 0;
};

/** The home of the portal a path belongs to, e.g. /parent/transport -> /parent/home. */
export const portalHome = (path: string) => {
  const seg = path.split('/').filter(Boolean)[0] ?? '';
  return HOMES.find(h => h.startsWith(`/${seg}/`)) ?? '/';
};

/** Go back one screen, or to the portal's home when there is nothing to go back to. */
export function useGoBack(fallback?: string) {
  const navigate = useNavigate();
  const location = useLocation();
  return () => {
    if (canGoBackInApp()) navigate(-1);
    else navigate(fallback ?? portalHome(location.pathname), { replace: true });
  };
}

/** Android hardware back button. Renders the "press again to exit" note; nothing on the web. */
export const AndroidBackHandler: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const path = useRef(location.pathname);
  const lastPress = useRef(0);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    path.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const sub = App.addListener('backButton', () => {
      const p = path.current;
      if (!isHome(p)) {
        if (canGoBackInApp()) navigate(-1);
        else navigate(portalHome(p), { replace: true });
        return;
      }
      const now = Date.now();
      if (now - lastPress.current < 2000) {
        App.exitApp();
        return;
      }
      lastPress.current = now;
      setHint(true);
      window.setTimeout(() => setHint(false), 2000);
    });
    return () => {
      sub.then(s => s.remove());
    };
  }, [navigate]);

  if (!hint) return null;
  return (
    <div role="status" className="fixed bottom-24 inset-x-0 z-[100] flex justify-center pointer-events-none">
      <span className="px-4 py-2 rounded-full bg-slate-900/90 text-white text-sm shadow-lg">{t('common.pressBackToExit')}</span>
    </div>
  );
};
