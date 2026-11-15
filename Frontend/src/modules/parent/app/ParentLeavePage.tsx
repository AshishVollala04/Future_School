/** Parent: apply for the child's leave and track the Class Teacher's decision. */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { leaveService } from '../../../services/leaveService';
import { EmptyState, ErrorState, LoadingBlock, Panel, Pill, Section } from '../../../components/common/States';
import { ErrorBox, PrimaryButton, inputClass } from '../../auth/authUi';
import { addDaysISO, formatDate, todayISO } from '../../../utils/date';
import { LeaveRequest } from '../../../types/domain';

const KINDS: LeaveRequest['kind'][] = ['SICK', 'FAMILY', 'MEDICAL_APPOINTMENT', 'OTHER'];

export const ParentLeavePage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const scope = useScope();
  const q = useQuery(() => leaveService.listForChild(scope), [scope.schoolId, scope.studentId]);
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [kind, setKind] = useState<LeaveRequest['kind']>('SICK');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(false);
    const r = await leaveService.apply(scope, { fromDate: from, toDate: to < from ? from : to, kind, reason });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setReason('');
    setDone(true);
    q.reload();
  };

  const withdraw = async (id: string) => {
    const r = await leaveService.withdraw(scope, id);
    if (!r.ok) setError(r.error);
    q.reload();
  };

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-bold">{t('parent.more.leave')}</h1>
      <form onSubmit={submit}>
        <Panel className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-sm font-semibold text-slate-700 mb-1">{t('parent.leave.from')}</span>
              <input type="date" value={from} min={addDaysISO(-7)} onChange={e => setFrom(e.target.value)} className={`${inputClass} py-2`} />
            </label>
            <label className="block">
              <span className="block text-sm font-semibold text-slate-700 mb-1">{t('parent.leave.to')}</span>
              <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} className={`${inputClass} py-2`} />
            </label>
          </div>
          <label className="block">
            <span className="block text-sm font-semibold text-slate-700 mb-1">{t('parent.leave.kind')}</span>
            <select value={kind} onChange={e => setKind(e.target.value as LeaveRequest['kind'])} className={inputClass}>
              {KINDS.map(k => (
                <option key={k} value={k}>{t(`parent.leave.kind_${k}`)}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-sm font-semibold text-slate-700 mb-1">{t('parent.leave.reason')}</span>
            <textarea value={reason} onChange={e => setReason(e.target.value.slice(0, 500))} rows={3} className={inputClass} />
          </label>
          <ErrorBox message={error} />
          {done && <p role="status" className="text-sm text-emerald-800">{t('parent.leave.sent')}</p>}
          <PrimaryButton type="submit" loading={busy} disabled={reason.trim().length < 5}>{t('parent.leave.apply')}</PrimaryButton>
        </Panel>
      </form>

      <Section title={t('parent.leave.history')}>
        {q.status === 'loading' ? (
          <LoadingBlock lines={2} />
        ) : q.status === 'error' ? (
          <ErrorState message={q.error} onRetry={q.reload} />
        ) : q.data.length === 0 ? (
          <EmptyState title={t('parent.leave.none')} />
        ) : (
          <ul className="space-y-2.5">
            {q.data.map(l => (
              <li key={l.id}>
                <Panel className="p-3.5 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold">
                      {formatDate(l.fromDate, i18n.language)}{l.toDate !== l.fromDate ? ` – ${formatDate(l.toDate, i18n.language)}` : ''}
                    </p>
                    <Pill tone={l.status === 'APPROVED' ? 'success' : l.status === 'REJECTED' ? 'danger' : l.status === 'WITHDRAWN' ? 'neutral' : 'warning'}>
                      {t(`parent.leave.status_${l.status}`)}
                    </Pill>
                  </div>
                  <p className="text-sm text-slate-600">{t(`parent.leave.kind_${l.kind}`)} · {l.reason}</p>
                  {l.decision?.note && <p className="text-sm text-slate-700">{l.decision.byName}: {l.decision.note}</p>}
                  {l.status === 'PENDING' && (
                    <button onClick={() => withdraw(l.id)} className="min-h-11 text-sm font-semibold text-slate-600 underline">{t('parent.leave.withdraw')}</button>
                  )}
                </Panel>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
};
