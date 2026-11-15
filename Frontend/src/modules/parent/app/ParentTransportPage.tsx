/** Parent: child's bus route and stop, and requests to start, change or stop transport. */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bus } from 'lucide-react';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { transportService } from '../../../services/transportService';
import { LiveBusCard } from '../../../components/bus/LiveBusCard';
import { EmptyState, ErrorState, LoadingBlock, Panel, Pill, Section } from '../../../components/common/States';
import { ErrorBox, PrimaryButton, LinkButton, inputClass } from '../../auth/authUi';
import { addDaysISO, formatDate, formatINR, todayISO } from '../../../utils/date';

const KIND = { NEW: 'Start transport', CHANGE: 'Change route / stop', STOP: 'Stop transport' };

export const ParentTransportPage: React.FC = () => {
  const { t } = useTranslation();
  const scope = useScope();
  const q = useQuery(() => transportService.getMine(scope), [scope.schoolId, scope.studentId]);
  const [mode, setMode] = useState<'CHANGE' | 'STOP' | null>(null);
  const [routeId, setRouteId] = useState('');
  const [stop, setStop] = useState('');
  const [from, setFrom] = useState(addDaysISO(7));
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (q.status === 'loading') return <LoadingBlock />;
  if (q.status === 'error') return <ErrorState message={q.error} onRetry={q.reload} />;
  const { current, routes, requests } = q.data;
  const pending = requests.find(r => r.status === 'PENDING');
  const route = routes.find(r => r.id === routeId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await transportService.request(scope, { kind: mode === 'STOP' ? 'STOP' : 'CHANGE', toRouteId: routeId, stopName: stop, reason, effectiveFrom: from });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setMode(null);
    setReason('');
    q.reload();
  };

  const withdraw = async (id: string) => {
    const r = await transportService.withdraw(scope, id);
    if (!r.ok) setError(r.error);
    q.reload();
  };

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-bold">{t('parent.more.transport')}</h1>
      {current ? (
        <Panel className="p-4 space-y-1">
          <p className="flex items-center gap-2 font-semibold"><Bus className="w-5 h-5 text-blue-700" /> {current.route.name}</p>
          <p className="text-sm text-slate-600">Bus {current.route.vehicleNo}</p>
          {current.stop && <p className="text-sm">Stop: <b>{current.stop.name}</b> · pick-up {current.stop.pickup} · drop {current.stop.drop}</p>}
          <LiveBusCard studentId={scope.studentId} />
        </Panel>
      ) : (
        <EmptyState title="Your child does not use school transport" />
      )}

      <ErrorBox message={error} />
      {pending ? (
        <Panel className="p-4 space-y-2 border-amber-300">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold">{KIND[pending.kind]}</p>
            <Pill tone="warning">Waiting for school</Pill>
          </div>
          <p className="text-sm">{pending.toRouteId ? `${pending.toRouteId}, ${pending.stopName}` : 'Stop using the bus'} · from {formatDate(pending.effectiveFrom)}</p>
          <LinkButton onClick={() => withdraw(pending.id)}>Withdraw request</LinkButton>
        </Panel>
      ) : mode ? (
        <form onSubmit={submit}>
          <Panel className="p-4 space-y-3">
            {mode === 'CHANGE' && (
              <>
                <label className="block">
                  <span className="block text-sm font-semibold mb-1">Route</span>
                  <select value={routeId} onChange={e => { setRouteId(e.target.value); setStop(''); }} className={inputClass}>
                    <option value="">Choose…</option>
                    {routes.map(r => <option key={r.id} value={r.id}>{r.name} · {r.seatsLeft > 0 ? `${r.seatsLeft} seats left` : 'full'} · {formatINR(r.feePerInstalment)}/instalment</option>)}
                  </select>
                </label>
                {route && (
                  <label className="block">
                    <span className="block text-sm font-semibold mb-1">Stop</span>
                    <select value={stop} onChange={e => setStop(e.target.value)} className={inputClass}>
                      <option value="">Choose…</option>
                      {route.stops.map(s => <option key={s.name} value={s.name}>{s.name} · pick-up {s.pickup}</option>)}
                    </select>
                  </label>
                )}
                {route && route.seatsLeft === 0 && <p className="text-sm text-amber-800">This route is full right now. The school may offer another route.</p>}
              </>
            )}
            <label className="block"><span className="block text-sm font-semibold mb-1">From</span><input type="date" min={todayISO()} value={from} onChange={e => setFrom(e.target.value)} className={inputClass} /></label>
            <label className="block"><span className="block text-sm font-semibold mb-1">Reason</span><textarea value={reason} onChange={e => setReason(e.target.value.slice(0, 300))} rows={2} className={inputClass} /></label>
            <PrimaryButton type="submit" loading={busy} disabled={reason.trim().length < 5 || (mode === 'CHANGE' && (!routeId || !stop))}>Send request</PrimaryButton>
            <LinkButton type="button" onClick={() => setMode(null)}>Cancel</LinkButton>
          </Panel>
        </form>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <PrimaryButton onClick={() => setMode('CHANGE')}>{current ? 'Change route or stop' : 'Request school transport'}</PrimaryButton>
          {current && <button onClick={() => setMode('STOP')} className="min-h-12 rounded-xl border border-slate-300 font-semibold">Stop transport</button>}
        </div>
      )}

      {requests.filter(r => r.status !== 'PENDING').length > 0 && (
        <Section title="Past requests">
          <ul className="space-y-2">
            {requests.filter(r => r.status !== 'PENDING').map(r => (
              <li key={r.id}>
                <Panel className="p-3.5 flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{KIND[r.kind]}</p>
                    <p className="text-sm text-slate-600">{r.toRouteId ? `${r.toRouteId}, ${r.stopName}` : 'Stop'} · from {formatDate(r.effectiveFrom)}</p>
                    {r.decision?.note && <p className="text-sm">School: {r.decision.note}</p>}
                  </div>
                  <Pill tone={r.status === 'APPROVED' ? 'success' : r.status === 'REJECTED' ? 'danger' : 'neutral'}>{r.status.toLowerCase()}</Pill>
                </Panel>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
};
