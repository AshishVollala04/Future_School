/**
 * Bus driver page, opened from the private link the school office shares (no sign-in).
 * Start a trip, keep this page open, and the phone sends the bus's position every few seconds.
 * Only the latest position of a live trip exists on the server; ending the trip clears it.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bus, CheckCircle2, MapPin, Navigation, Square, TriangleAlert } from 'lucide-react';
import { busService, DriverView, ageText } from '../../services/busService';
import { LanguageToggle } from '../../components/common/LanguageToggle';

const SEND_EVERY_MS = 10_000;

type Pos = { lat: number; lng: number; accuracy: number };

export const DriverTrackingPage: React.FC = () => {
  const { t } = useTranslation();
  const { token = '' } = useParams();
  const [view, setView] = useState<DriverView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  const lastSent = useRef(0);
  const latest = useRef<Pos | null>(null);
  const wake = useRef<{ release: () => Promise<void> } | null>(null);

  const live = Boolean(view?.trip);

  useEffect(() => {
    busService.driver(token).then(r => (r.ok ? setView(r.data) : setError(r.error)));
  }, [token]);

  const send = useCallback(async (force = false) => {
    const p = latest.current;
    if (!p) return;
    if (!force && Date.now() - lastSent.current < SEND_EVERY_MS) return;
    lastSent.current = Date.now();
    const r = await busService.ping(token, p.lat, p.lng, p.accuracy);
    if (r.ok) setSentAt(Date.now());
  }, [token]);

  // While a trip is live: watch the position, send it regularly, keep the screen on.
  useEffect(() => {
    if (!live) return;
    if (!('geolocation' in navigator)) {
      setGpsError(t('drive.noGps'));
      return;
    }
    const id = navigator.geolocation.watchPosition(
      g => {
        const p = { lat: g.coords.latitude, lng: g.coords.longitude, accuracy: Math.round(g.coords.accuracy) };
        latest.current = p;
        setPos(p);
        setGpsError(null);
        send();
      },
      e => setGpsError(e.code === e.PERMISSION_DENIED ? t('drive.permission') : t('drive.noSignal')),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
    const every = window.setInterval(() => {
      send(true);
      tick(x => x + 1);
    }, SEND_EVERY_MS);
    const lock = async () => {
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (k: 'screen') => Promise<{ release: () => Promise<void> }> } };
        if (nav.wakeLock && document.visibilityState === 'visible') wake.current = await nav.wakeLock.request('screen');
      } catch {
        /* the screen may still turn off; the page asks the driver to keep it on */
      }
    };
    lock();
    const onVisible = () => document.visibilityState === 'visible' && lock();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      navigator.geolocation.clearWatch(id);
      window.clearInterval(every);
      document.removeEventListener('visibilitychange', onVisible);
      wake.current?.release().catch(() => undefined);
      wake.current = null;
    };
  }, [live, send, t]);

  const start = async (direction: 'PICKUP' | 'DROP') => {
    setBusy(true);
    const r = await busService.start(token, direction);
    setBusy(false);
    if (r.ok) setView(r.data);
    else setError(r.error);
  };

  const end = async () => {
    if (!window.confirm(t('drive.confirmEnd'))) return;
    setBusy(true);
    const r = await busService.end(token);
    setBusy(false);
    if (r.ok) {
      setView(r.data);
      setPos(null);
      latest.current = null;
      setSentAt(null);
    } else setError(r.error);
  };

  const markStop = async (i: number) => {
    const p = latest.current;
    if (!p) return;
    const r = await busService.markStop(token, i, p.lat, p.lng);
    if (r.ok) setView(r.data);
    else setError(r.error);
  };

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="hero-glow text-white px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-6">
        <div className="max-w-md mx-auto flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 font-bold"><Bus className="w-5 h-5" /> {t('drive.title')}</span>
          <LanguageToggle onDark />
        </div>
        {view && (
          <div className="max-w-md mx-auto mt-3">
            <p className="text-2xl font-extrabold">{view.routeName}</p>
            <p className="text-blue-100">{view.vehicleNo}</p>
          </div>
        )}
      </header>

      <main className="max-w-md mx-auto p-4 space-y-4">
        {!window.isSecureContext && (
          <p className="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">{t('drive.needsHttps')}</p>
        )}
        {error && (
          <p className="rounded-2xl bg-rose-50 border border-rose-200 p-3 text-rose-900 flex gap-2"><TriangleAlert className="w-5 h-5 shrink-0" />{error}</p>
        )}
        {!view && !error && <p className="text-slate-500">{t('common.loading')}</p>}

        {view && !live && (
          <div className="space-y-3">
            <p className="text-slate-700">{t('drive.startHint')}</p>
            <button disabled={busy} onClick={() => start('PICKUP')} className="w-full min-h-16 rounded-2xl bg-blue-700 text-white text-lg font-bold disabled:opacity-50">
              {t('drive.startPickup')}
            </button>
            <button disabled={busy} onClick={() => start('DROP')} className="w-full min-h-16 rounded-2xl bg-slate-900 text-white text-lg font-bold disabled:opacity-50">
              {t('drive.startDrop')}
            </button>
          </div>
        )}

        {view && live && (
          <div className="space-y-3">
            <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4">
              <p className="flex items-center gap-2 text-emerald-900 font-bold text-lg">
                <span className="relative flex w-3 h-3"><span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60 animate-ping" /><span className="relative inline-flex w-3 h-3 rounded-full bg-emerald-600" /></span>
                {view.trip?.direction === 'DROP' ? t('drive.liveDrop') : t('drive.livePickup')}
              </p>
              <p className="mt-1 text-sm text-emerald-900">
                {sentAt ? t('drive.sent', { ago: ageText(sentAt) }) : t('drive.waitingGps')}
                {pos && ` · ±${pos.accuracy} m`}
              </p>
              <p className="mt-2 text-sm text-emerald-900 font-semibold">{t('drive.keepOpen')}</p>
            </div>
            {gpsError && <p className="rounded-2xl bg-rose-50 border border-rose-200 p-3 text-rose-900 flex gap-2"><TriangleAlert className="w-5 h-5 shrink-0" />{gpsError}</p>}
            <button disabled={busy} onClick={end} className="w-full min-h-14 rounded-2xl border-2 border-rose-300 bg-white text-rose-800 text-lg font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50">
              <Square className="w-5 h-5" /> {t('drive.end')}
            </button>
          </div>
        )}

        {view && view.stops.length > 0 && (
          <section className="rounded-2xl bg-white border border-slate-200">
            <p className="px-4 pt-3 font-bold">{t('drive.stops')}</p>
            <p className="px-4 text-sm text-slate-600">{t('drive.stopsHint')}</p>
            <ul className="divide-y divide-slate-100 mt-2">
              {view.stops.map((s, i) => (
                <li key={s.name} className="px-4 py-3 flex items-center gap-3">
                  <MapPin className={`w-5 h-5 shrink-0 ${s.lat != null ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{s.name}</p>
                    <p className="text-xs text-slate-500">{s.lat != null ? <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />{t('drive.stopSaved')}</span> : t('drive.stopNotSaved')}</p>
                  </div>
                  {live && pos && (
                    <button onClick={() => markStop(i)} className="min-h-11 px-3 rounded-xl border border-slate-300 text-sm font-semibold inline-flex items-center gap-1">
                      <Navigation className="w-4 h-4" /> {t('drive.here')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
        <p className="text-xs text-slate-500">{t('drive.privacy')}</p>
      </main>
    </div>
  );
};
