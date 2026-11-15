/**
 * Parent: early-pickup passes and meetings. Real data only; nothing here is simulated in the UI.
 * A pass needs a fresh OTP; the server makes the code, which is shown once.
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { pickupService, PickupPassView } from '../../../services/pickupService';
import { communicationService } from '../../../services/communicationService';
import { EmptyState, ErrorState, LoadingBlock, Panel, Pill, Section } from '../../../components/common/States';
import { ErrorBox, LinkButton, PrimaryButton, inputClass } from '../../auth/authUi';
import { formatDateTime } from '../../../utils/date';

const PASS_TONE: Record<PickupPassView['status'], 'success' | 'neutral' | 'danger' | 'info'> = { ACTIVE: 'success', USED: 'info', CANCELLED: 'neutral', EXPIRED: 'neutral' };

export const ParentPickupPage: React.FC = () => {
  const { t } = useTranslation();
  const scope = useScope();
  const { currentUser, promptSensitiveActionAuth } = useAuth();
  const q = useQuery(() => pickupService.getMine(scope), [scope.schoolId, scope.studentId]);
  const [form, setForm] = useState({ personName: '', relation: '', mobile: '', reason: '' });
  const [issued, setIssued] = useState<PickupPassView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const issue = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    promptSensitiveActionAuth(
      'Authorise early pickup',
      async token => {
        const r = await pickupService.issuePass(scope, form, token);
        if (!r.ok) return setError(r.error);
        setIssued(r.data);
        setForm({ personName: '', relation: '', mobile: '', reason: '' });
        q.reload();
      },
      'PICKUP_AUTHORIZATION'
    );
  };

  const cancel = async (id: string) => {
    const r = await pickupService.cancelPass(scope, id);
    if (!r.ok) setError(r.error);
    q.reload();
  };

  if (q.status === 'loading') return <LoadingBlock />;
  if (q.status === 'error') return <ErrorState message={q.error} onRetry={q.reload} />;
  const guardians = q.data.guardians.length ? q.data.guardians : [{ name: currentUser?.name ?? 'You', mobileMasked: '', you: true }];
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value.slice(0, k === 'reason' ? 300 : 128) }));

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-bold">{t('parent.more.pickup')}</h1>
      <Section title="Can collect your child">
        <Panel className="divide-y divide-slate-100">
          {guardians.map(g => (
            <div key={g.name} className="p-3 flex items-center justify-between gap-2">
              <span className="font-medium">{g.name}{g.you ? ' (you)' : ''}</span>
              <span className="text-sm text-slate-500">{g.mobileMasked}</span>
            </div>
          ))}
        </Panel>
        <p className="text-xs text-slate-500 mt-1">Guardians registered with the school. To change this list, contact the school office.</p>
      </Section>

      {issued?.code && (
        <Panel className="p-4 space-y-2 border-blue-600">
          <p className="font-semibold flex items-center gap-2"><KeyRound className="w-5 h-5 text-blue-700" /> Pass for {issued.personName}</p>
          <p className="font-mono text-2xl font-bold tracking-widest text-blue-800">{issued.code}</p>
          <p className="text-sm text-slate-600">
            Share this code with {issued.personName} yourself. It works once at the school gate until {formatDateTime(new Date(issued.validUntil).toISOString())}.
            It is shown only now.
          </p>
          <LinkButton onClick={() => setIssued(null)}>Done</LinkButton>
        </Panel>
      )}

      <form onSubmit={issue}>
        <Panel className="p-4 space-y-3">
          <p className="font-semibold">Someone else is collecting today</p>
          <div className="grid sm:grid-cols-2 gap-2">
            <label className="block"><span className="block text-sm font-semibold mb-1">Full name</span><input value={form.personName} onChange={set('personName')} className={inputClass} /></label>
            <label className="block"><span className="block text-sm font-semibold mb-1">Relation</span><input value={form.relation} onChange={set('relation')} placeholder="e.g. Uncle" className={inputClass} /></label>
          </div>
          <label className="block"><span className="block text-sm font-semibold mb-1">Their mobile</span><input inputMode="numeric" value={form.mobile} onChange={set('mobile')} className={inputClass} /></label>
          <label className="block"><span className="block text-sm font-semibold mb-1">Reason</span><input value={form.reason} onChange={set('reason')} className={inputClass} /></label>
          <p className="text-xs text-slate-500">You confirm with an OTP. The pass is valid for 2 hours and works once.</p>
          <ErrorBox message={error} />
          <PrimaryButton type="submit" disabled={form.personName.trim().length < 3 || form.relation.trim().length < 3 || form.mobile.replace(/\D/g, '').length < 10 || form.reason.trim().length < 5}>
            Create pickup pass
          </PrimaryButton>
        </Panel>
      </form>

      <Section title="Passes">
        {q.data.passes.length === 0 ? <EmptyState title="No pickup passes" /> : (
          <ul className="space-y-2">
            {q.data.passes.map(p => (
              <li key={p.id}>
                <Panel className="p-3.5 flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{p.personName} · {p.relation}</p>
                    <p className="text-sm text-slate-600">{p.mobileMasked} · {p.reason}</p>
                    <p className="text-xs text-slate-500">Valid until {formatDateTime(new Date(p.validUntil).toISOString())}{p.usedAt ? ` · used ${formatDateTime(p.usedAt)}` : ''}</p>
                  </div>
                  <div className="text-right space-y-1">
                    <Pill tone={PASS_TONE[p.status]}>{p.status.toLowerCase()}</Pill>
                    {p.status === 'ACTIVE' && <LinkButton onClick={() => cancel(p.id)}>Cancel</LinkButton>}
                  </div>
                </Panel>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
};

const MEETING_TONE: Record<string, 'success' | 'warning' | 'neutral' | 'danger'> = {
  CONFIRMED: 'success', REQUESTED: 'warning', RESCHEDULE_PROPOSED: 'warning', COMPLETED: 'neutral', CANCELLED: 'neutral', REJECTED: 'danger'
};

export const ParentMeetingsPage: React.FC = () => {
  const { t } = useTranslation();
  const scope = useScope();
  const q = useQuery(() => communicationService.getMeetings(scope), [scope.schoolId, scope.studentId]);
  if (q.status === 'loading') return <LoadingBlock />;
  if (q.status === 'error') return <ErrorState message={q.error} onRetry={q.reload} />;
  return (
    <div className="space-y-5">
      <h1 className="text-lg font-bold">{t('parent.more.meetings')}</h1>
      {q.data.length === 0 ? <EmptyState title="No meetings scheduled" hint="The class teacher will schedule a meeting here when needed." /> : (
        <ul className="space-y-2">
          {q.data.map(m => (
            <li key={m.id}>
              <Panel className="p-3.5 flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{m.purpose}</p>
                  <p className="text-sm text-slate-600">{m.teacherName} · {formatDateTime(m.at)}</p>
                  {m.parentSummary && <p className="text-sm mt-1">{m.parentSummary}</p>}
                </div>
                <Pill tone={MEETING_TONE[m.status] ?? 'neutral'}>{m.status.replace(/_/g, ' ').toLowerCase()}</Pill>
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
