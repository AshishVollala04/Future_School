/** Parent: raise a complaint, read the school's replies, confirm resolution or reopen. */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../context/AuthContext';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { complaintService } from '../../../services/complaintService';
import { EmptyState, ErrorState, LoadingBlock, Panel, Pill, Section } from '../../../components/common/States';
import { ErrorBox, PrimaryButton, inputClass } from '../../auth/authUi';
import { ComplaintCategory, ComplaintStatus } from '../../../types/domain';
import { formatDateTime } from '../../../utils/date';

const CATEGORIES: { id: ComplaintCategory; label: string }[] = [
  { id: 'ACADEMIC', label: 'Studies' },
  { id: 'TRANSPORT', label: 'Transport' },
  { id: 'FACILITY', label: 'Facilities' },
  { id: 'FEES', label: 'Fees' },
  { id: 'SAFETY', label: 'Safety' },
  { id: 'OTHER', label: 'Other' }
];
const STATUS: Record<ComplaintStatus, { label: string; tone: 'neutral' | 'warning' | 'info' | 'danger' | 'success' }> = {
  OPEN: { label: 'Sent', tone: 'warning' },
  IN_PROGRESS: { label: 'School is working on it', tone: 'info' },
  RESOLVED: { label: 'Resolved · please confirm', tone: 'success' },
  CLOSED: { label: 'Closed', tone: 'neutral' },
  REOPENED: { label: 'Reopened', tone: 'warning' }
};

export const ParentComplaintsPage: React.FC = () => {
  const { t } = useTranslation();
  const scope = useScope();
  const { currentUser } = useAuth();
  const q = useQuery(() => complaintService.listMine(scope), [scope.schoolId, scope.studentId]);
  const [category, setCategory] = useState<ComplaintCategory>('ACADEMIC');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [reopenText, setReopenText] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await complaintService.raise(scope, { category, subject, description }, currentUser?.name ?? '');
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setSubject('');
    setDescription('');
    setDone(category === 'SAFETY' ? 'Sent. Safety concerns also go to the Principal.' : 'Sent to the school office.');
    q.reload();
  };

  const act = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    const r = await fn();
    if (!r.ok) setError(r.error ?? 'Failed');
    q.reload();
  };

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-bold">{t('parent.more.complaints')}</h1>
      <form onSubmit={submit}>
        <Panel className="p-4 space-y-3">
          <label className="block">
            <span className="block text-sm font-semibold mb-1">About</span>
            <select value={category} onChange={e => setCategory(e.target.value as ComplaintCategory)} className={inputClass}>
              {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
          <label className="block"><span className="block text-sm font-semibold mb-1">Subject</span><input value={subject} onChange={e => setSubject(e.target.value.slice(0, 120))} className={inputClass} /></label>
          <label className="block"><span className="block text-sm font-semibold mb-1">What happened?</span><textarea value={description} onChange={e => setDescription(e.target.value.slice(0, 1000))} rows={3} className={inputClass} /></label>
          <ErrorBox message={error} />
          {done && <p role="status" className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900">{done}</p>}
          <PrimaryButton type="submit" loading={busy} disabled={subject.trim().length < 5 || description.trim().length < 15}>Send to school</PrimaryButton>
        </Panel>
      </form>
      <Section title="My complaints">
        {q.status === 'loading' ? <LoadingBlock lines={2} /> : q.status === 'error' ? <ErrorState message={q.error} onRetry={q.reload} /> : q.data.length === 0 ? <EmptyState title="No complaints" /> : (
          <ul className="space-y-2">
            {q.data.map(c => (
              <li key={c.id}>
                <Panel className="p-3.5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold">{c.subject}</p>
                    <Pill tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Pill>
                  </div>
                  <p className="text-sm text-slate-600">{c.description}</p>
                  {c.log.filter(l => l.note).map((l, i) => (
                    <div key={i} className={`p-2.5 rounded-xl text-sm ${l.byRole === 'ADMIN' ? 'bg-blue-50' : 'bg-slate-50'}`}>
                      <p className="text-xs text-slate-500">{l.byRole === 'ADMIN' ? 'School' : 'You'} · {formatDateTime(l.at)}</p>
                      <p>{l.note}</p>
                    </div>
                  ))}
                  {c.status === 'RESOLVED' && (
                    <div className="space-y-2">
                      <PrimaryButton onClick={() => act(() => complaintService.confirmResolved(scope, c.id))}>Yes, it is resolved</PrimaryButton>
                      <textarea value={reopenText[c.id] ?? ''} onChange={e => setReopenText(x => ({ ...x, [c.id]: e.target.value.slice(0, 500) }))} rows={2} placeholder="Not solved? Tell the school what is still wrong" className={inputClass} />
                      <button onClick={() => act(() => complaintService.reopen(scope, c.id, reopenText[c.id] ?? ''))} disabled={(reopenText[c.id] ?? '').trim().length < 10} className="w-full min-h-11 rounded-xl border border-slate-300 font-semibold disabled:opacity-50">Reopen</button>
                    </div>
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
