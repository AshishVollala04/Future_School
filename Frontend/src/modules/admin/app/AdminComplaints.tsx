/** Complaints (COMPLAINTS): reply to parents, work on it, mark resolved. The parent confirms or reopens. */
import React, { useState } from 'react';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { complaintService } from '../../../services/complaintService';
import { EmptyState, ErrorState, LoadingBlock, Panel, Pill } from '../../../components/common/States';
import { ErrorBox, inputClass } from '../../auth/authUi';
import { ComplaintStatus } from '../../../types/domain';
import { formatDateTime } from '../../../utils/date';

export const COMPLAINT_STATUS: Record<ComplaintStatus, { label: string; tone: 'neutral' | 'warning' | 'info' | 'danger' | 'success' }> = {
  OPEN: { label: 'Open', tone: 'warning' },
  IN_PROGRESS: { label: 'In progress', tone: 'info' },
  RESOLVED: { label: 'Resolved · waiting for parent', tone: 'success' },
  CLOSED: { label: 'Closed', tone: 'neutral' },
  REOPENED: { label: 'Reopened', tone: 'danger' }
};

export const AdminComplaints: React.FC = () => {
  const scope = useScope();
  const q = useQuery(() => complaintService.listForSchool(scope), [scope.schoolId]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  if (q.status === 'loading') return <LoadingBlock />;
  if (q.status === 'error') return <ErrorState message={q.error} onRetry={q.reload} />;

  const respond = async (id: string, status: 'IN_PROGRESS' | 'RESOLVED') => {
    setError(null);
    const r = await complaintService.respond(scope, id, notes[id] ?? '', status);
    if (!r.ok) return setError(r.error);
    setNotes(n => ({ ...n, [id]: '' }));
    q.reload();
  };

  return (
    <div className="space-y-4 max-w-3xl xl:max-w-6xl">
      <div>
        <h1 className="text-xl font-bold">Complaints</h1>
        <p className="text-sm text-slate-600">Parents see every reply. Safety complaints are shown to the Principal automatically.</p>
      </div>
      <ErrorBox message={error} />
      {q.data.length === 0 ? <EmptyState title="No complaints" /> : (
        <ul className="space-y-2.5">
          {q.data.map(c => (
            <li key={c.id}>
              <Panel className={`p-3.5 space-y-2 ${c.category === 'SAFETY' ? 'border-rose-300' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{c.subject}</p>
                    <p className="text-sm text-slate-500">{c.studentName} ({c.classLabel}) · {c.raisedByName} · {c.category.toLowerCase()}{c.principalInformed ? ' · Principal informed' : ''}</p>
                  </div>
                  <Pill tone={COMPLAINT_STATUS[c.status].tone}>{COMPLAINT_STATUS[c.status].label}</Pill>
                </div>
                <p className="text-sm">{c.description}</p>
                <ul className="text-xs text-slate-500 space-y-0.5">
                  {c.log.map((l, i) => <li key={i}>{formatDateTime(l.at)} · {l.byRole.toLowerCase()} {l.action.toLowerCase()}{l.note ? `: ${l.note}` : ''}</li>)}
                </ul>
                {c.status !== 'CLOSED' && c.status !== 'RESOLVED' && (
                  <div className="space-y-2">
                    <textarea value={notes[c.id] ?? ''} onChange={e => setNotes(n => ({ ...n, [c.id]: e.target.value.slice(0, 1000) }))} rows={2} placeholder="Reply to the parent" className={inputClass} />
                    <div className="flex flex-col sm:flex-row gap-2">
                      <button onClick={() => respond(c.id, 'IN_PROGRESS')} className="min-h-11 px-4 rounded-xl border border-slate-300 font-semibold">Reply · keep working</button>
                      <button onClick={() => respond(c.id, 'RESOLVED')} className="min-h-11 px-4 rounded-xl bg-blue-700 text-white font-semibold">Reply · mark resolved</button>
                    </div>
                  </div>
                )}
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
