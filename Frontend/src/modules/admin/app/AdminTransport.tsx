/** Transport (TRANSPORT): route capacity and parent route requests. */
import React, { useState } from 'react';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { transportService } from '../../../services/transportService';
import { busService } from '../../../services/busService';
import { DriverLinkPanel } from '../../../components/bus/DriverLinkPanel';
import { EmptyState, ErrorState, LoadingBlock, Panel, Pill, Section } from '../../../components/common/States';
import { ErrorBox, inputClass } from '../../auth/authUi';
import { formatDate } from '../../../utils/date';

const KIND = { NEW: 'Start transport', CHANGE: 'Change route / stop', STOP: 'Stop transport' };

export const AdminTransport: React.FC = () => {
  const scope = useScope();
  const routes = useQuery(() => transportService.listRoutes(scope), [scope.schoolId]);
  const reqs = useQuery(() => transportService.listRequests(scope), [scope.schoolId]);
  const live = useQuery(() => busService.officeLive(), [scope.schoolId]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const decide = async (id: string, d: 'APPROVED' | 'REJECTED') => {
    setError(null);
    const r = await transportService.decide(scope, id, d, notes[id] ?? '');
    if (!r.ok) setError(r.error);
    reqs.reload();
    routes.reload();
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold">Transport</h1>
        <p className="text-sm text-slate-600">Seats are checked again when you approve. Fee changes for later instalments go through Finance.</p>
      </div>
      <ErrorBox message={error} />
      <Section title="Requests from parents">
        {reqs.status === 'loading' ? <LoadingBlock /> : reqs.status === 'error' ? <ErrorState message={reqs.error} onRetry={reqs.reload} /> : reqs.data.length === 0 ? <EmptyState title="No requests" /> : (
          <ul className="space-y-2">
            {reqs.data.map(r => (
              <li key={r.id}>
                <Panel className="p-3.5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{r.studentName} ({r.classLabel}) · {KIND[r.kind]}</p>
                      <p className="text-sm text-slate-600">
                        {r.fromRouteId ?? 'No route'} → {r.toRouteId ? `${r.toRouteId}, ${r.stopName}` : 'none'} · from {formatDate(r.effectiveFrom)}
                      </p>
                      <p className="text-sm">{r.reason}</p>
                    </div>
                    <Pill tone={r.status === 'APPROVED' ? 'success' : r.status === 'REJECTED' ? 'danger' : r.status === 'WITHDRAWN' ? 'neutral' : 'warning'}>{r.status.toLowerCase()}</Pill>
                  </div>
                  {r.status === 'PENDING' && (
                    <>
                      {r.toRouteSeatsLeft !== undefined && (
                        <p className={`text-sm ${r.toRouteSeatsLeft === 0 ? 'text-rose-700 font-semibold' : 'text-slate-600'}`}>
                          {r.toRouteSeatsLeft === 0 ? `${r.toRouteId} is full.` : `${r.toRouteSeatsLeft} seat(s) left on ${r.toRouteId}.`}
                        </p>
                      )}
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input value={notes[r.id] ?? ''} onChange={e => setNotes(n => ({ ...n, [r.id]: e.target.value.slice(0, 200) }))} placeholder="Note to parent (required to reject)" className={`${inputClass} py-2 flex-1`} />
                        <button onClick={() => decide(r.id, 'REJECTED')} className="min-h-11 px-4 rounded-xl border border-rose-300 text-rose-800 font-semibold">Reject</button>
                        <button onClick={() => decide(r.id, 'APPROVED')} className="min-h-11 px-4 rounded-xl bg-blue-700 text-white font-semibold">Approve</button>
                      </div>
                    </>
                  )}
                  {r.decision?.note && <p className="text-sm text-slate-600">Note: {r.decision.note}</p>}
                </Panel>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Routes">
        {routes.status === 'loading' ? <LoadingBlock /> : routes.status === 'error' ? <ErrorState message={routes.error} onRetry={routes.reload} /> : routes.data.length === 0 ? <EmptyState title="No routes set up" /> : (
          <div className="grid sm:grid-cols-2 gap-3">
            {routes.data.map(rt => (
              <Panel key={rt.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{rt.name}</p>
                    <p className="text-sm text-slate-500">{rt.vehicleNo}</p>
                  </div>
                  <Pill tone={rt.seatsLeft === 0 ? 'danger' : 'neutral'}>{rt.riders}/{rt.capacity} seats</Pill>
                </div>
                <ul className="text-sm text-slate-600">{rt.stops.map(s => <li key={s.name}>{s.name} · pick-up {s.pickup} · drop {s.drop}</li>)}</ul>
                {rt.riderList.length > 0 && <p className="text-xs text-slate-500">Riders: {rt.riderList.map(s => `${s.name} (${s.classLabel})`).join(', ')}</p>}
                <DriverLinkPanel routeId={rt.id} status={live.status === 'ready' ? live.data.find(b => b.routeId === rt.id) : undefined} onChange={live.reload} />
              </Panel>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
};
