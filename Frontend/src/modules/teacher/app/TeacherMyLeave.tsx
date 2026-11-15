/** Teacher's own leave: apply and track the Principal's decision. */
import React, { useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { staffService } from '../../../services/staffService';
import { EmptyState, ErrorState, LoadingBlock, Panel, Pill, Section } from '../../../components/common/States';
import { ErrorBox, PrimaryButton, inputClass } from '../../auth/authUi';
import { TeacherLeave } from '../../../types/domain';
import { addDaysISO, formatDate } from '../../../utils/date';

export const TeacherMyLeave: React.FC = () => {
  const scope = useScope();
  const { currentUser } = useAuth();
  const q = useQuery(() => staffService.myLeaves(scope), [scope.schoolId, scope.userId]);
  const [from, setFrom] = useState(addDaysISO(1));
  const [to, setTo] = useState(addDaysISO(1));
  const [kind, setKind] = useState<TeacherLeave['kind']>('CASUAL');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const apply = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await staffService.applyLeave(scope, { fromDate: from, toDate: to < from ? from : to, kind, reason }, currentUser?.name ?? '');
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setReason('');
    q.reload();
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <h1 className="text-xl font-bold">My leave</h1>
      <form onSubmit={apply}>
        <Panel className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="block"><span className="block text-sm font-semibold mb-1">From</span><input type="date" value={from} onChange={e => setFrom(e.target.value)} className={`${inputClass} py-2`} /></label>
            <label className="block"><span className="block text-sm font-semibold mb-1">To</span><input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} className={`${inputClass} py-2`} /></label>
          </div>
          <label className="block">
            <span className="block text-sm font-semibold mb-1">Type</span>
            <select value={kind} onChange={e => setKind(e.target.value as TeacherLeave['kind'])} className={inputClass}>
              <option value="CASUAL">Casual</option>
              <option value="SICK">Sick</option>
              <option value="TRAINING">Training</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label className="block"><span className="block text-sm font-semibold mb-1">Reason</span><textarea value={reason} onChange={e => setReason(e.target.value.slice(0, 500))} rows={2} className={inputClass} /></label>
          <ErrorBox message={error} />
          <PrimaryButton type="submit" loading={busy} disabled={reason.trim().length < 5}>Send to Principal</PrimaryButton>
        </Panel>
      </form>
      <Section title="My requests">
        {q.status === 'loading' ? <LoadingBlock lines={1} /> : q.status === 'error' ? <ErrorState message={q.error} onRetry={q.reload} /> : q.data.length === 0 ? <EmptyState title="No leave requests" /> : (
          <ul className="space-y-2">
            {q.data.map(l => (
              <li key={l.id}>
                <Panel className="p-3.5 flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{formatDate(l.fromDate)}{l.toDate !== l.fromDate ? ` – ${formatDate(l.toDate)}` : ''}</p>
                    <p className="text-sm text-slate-600">{l.kind.toLowerCase()} · {l.reason}</p>
                    {l.decision?.note && <p className="text-sm">Principal: {l.decision.note}</p>}
                  </div>
                  <Pill tone={l.status === 'APPROVED' ? 'success' : l.status === 'REJECTED' ? 'danger' : 'warning'}>{l.status.toLowerCase()}</Pill>
                </Panel>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
};
