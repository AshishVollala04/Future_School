/** Parent: the child's bus on a map while a trip is live; refreshes every 15 seconds. */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { busService, ParentBus, ageText } from '../../services/busService';
import { BusMap } from './BusMap';

const REFRESH_MS = 15_000;

export const LiveBusCard: React.FC<{ studentId?: string }> = ({ studentId }) => {
  const { t } = useTranslation();
  const [data, setData] = useState<ParentBus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!busService.available) return;
    let live = true;
    const load = () =>
      busService.parentLive().then(r => {
        if (!live) return;
        if (r.ok) {
          setData(r.data);
          setError(null);
        } else setError(r.error);
      });
    load();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, REFRESH_MS);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [studentId]);

  if (!busService.available) return <p className="text-xs text-slate-500">{t('bus.serverOnly')}</p>;
  if (error) return <p className="text-xs text-rose-700">{error}</p>;
  if (!data || !data.usesTransport) return null;
  const trip = data.trip;
  if (!trip) return <p className="text-sm text-slate-600">{t('bus.notRunning')}</p>;

  const stop = data.stop?.lat != null && data.stop?.lng != null ? { lat: data.stop.lat, lng: data.stop.lng } : undefined;
  return (
    <div className="space-y-2 pt-2">
      <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
        <span className="relative flex w-2.5 h-2.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60 animate-ping" />
          <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-emerald-600" />
        </span>
        {trip.direction === 'DROP' ? t('bus.liveDrop') : t('bus.livePickup')}
      </p>
      {trip.lat != null && trip.lng != null ? (
        <>
          <BusMap bus={{ lat: trip.lat, lng: trip.lng }} stop={stop} />
          <p className={`text-sm ${trip.stale ? 'text-amber-800' : 'text-slate-700'}`}>
            {trip.stale ? t('bus.stale', { ago: ageText(trip.updatedAt) }) : t('bus.updated', { ago: ageText(trip.updatedAt) })}
            {trip.distanceKm != null && !trip.stale && ` · ${t('bus.distance', { km: trip.distanceKm })}`}
          </p>
        </>
      ) : (
        <p className="text-sm text-slate-600">{t('bus.waiting')}</p>
      )}
    </div>
  );
};
