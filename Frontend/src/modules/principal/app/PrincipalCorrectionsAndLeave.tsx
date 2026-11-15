/** Principal: published-mark corrections (approve with OTP) and teacher leave. */
import React, { useState } from 'react';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { useAuth } from '../../../context/AuthContext';
import { correctionService } from '../../../services/correctionService';
import { staffService } from '../../../services/staffService';
import { EmptyState, ErrorState, LoadingBlock, Panel, Pill } from '../../../components/common/States';
import { ErrorBox, inputClass } from '../../auth/authUi';
import { formatDate, formatDateTime } from '../../../utils/date';

export const PrincipalCorrections: React.FC = () => {
  const scope = useScope();
  const { promptSensitiveActionAuth } = useAuth();
  const q = useQuery(() => correctionService.listForPrincipal(scope), [scope.schoolId]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  if (q.status === 'loading') return <LoadingBlock />;
  if (q.status === 'error') return <ErrorState message={q.error} onRetry={q.reload} />;

  const reject = async (id: string) => {
    const r = await correctionService.principalDecide(scope, id, 'REJECT', notes[id] ?? '');
    if (!r.ok) setError(r.error);
    q.reload();
  };
  const approve = (id: string, title: string) =>
    promptSensitiveActionAuth(`Approve correction: ${title}`, async token => {
      const r = await correctionService.principalDecide(scope, id, 'APPROVE', notes[id] ?? '', token);
      if (!r.ok) setError(r.error);
      q.reload();
    });

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold">Published-mark corrections</h1>
        <p className="text-sm text-slate-600">Subject Teacher raises, Class Teacher verifies, you approve, Class Teacher republishes. The old version stays as SUPERSEDED.</p>
      </div>
      <ErrorBox message={error} />
      {q.data.length === 0 ? (
        <EmptyState title="No corrections" />
      ) : (
        <ul className="space-y-2.5">
          {q.data.map(c => {
            const title = `${c.studentName} (${c.classLabel}) · ${c.examName} ${c.subject}`;
            return (
              <li key={c.id}>
                <Panel className="p-3.5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold">{title}</p>
                    <Pill tone={c.status === 'VERIFIED' ? 'warning' : c.status === 'REJECTED' ? 'danger' : 'success'}>
                      {c.status === 'VERIFIED' ? 'Waiting for you' : c.status === 'APPROVED' ? 'Approved · to republish' : c.status.toLowerCase()}
                    </Pill>
                  </div>
                  <p className="text-base">
                    <span className="font-mono line-through text-slate-500">{String(c.from)}</span> → <span className="font-mono font-bold">{String(c.to)}</span>
                    <span className="text-sm text-slate-500"> ({c.field})</span>
                  </p>
                  <p className="text-sm">{c.reason}</p>
                  <ul className="text-xs text-slate-500">
                    {c.log.map((l, i) => (
                      <li key={i}>{formatDateTime(l.at)} · {l.action.toLowerCase()}{l.note ? ` · ${l.note}` : ''}</li>
                    ))}
                  </ul>
                  {c.status === 'VERIFIED' && (
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input value={notes[c.id] ?? ''} onChange={e => setNotes(n => ({ ...n, [c.id]: e.target.value.slice(0, 200) }))} placeholder="Note (required to reject)" className={`${inputClass} py-2 flex-1`} />
                      <button onClick={() => reject(c.id)} className="min-h-11 px-4 rounded-xl border border-rose-300 text-rose-800 font-semibold">Reject</button>
                      <button onClick={() => approve(c.id, title)} className="min-h-11 px-4 rounded-xl bg-blue-700 text-white font-semibold">Approve</button>
                    </div>
                  )}
                </Panel>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export const PrincipalTeacherLeave: React.FC = () => {
  const scope = useScope();
  const q = useQuery(() => staffService.listTeacherLeave(scope), [scope.schoolId]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  if (q.status === 'loading') return <LoadingBlock />;
  if (q.status === 'error') return <ErrorState message={q.error} onRetry={q.reload} />;
  const decide = async (id: string, d: 'APPROVED' | 'REJECTED') => {
    setError(null);
    const r = await staffService.decideTeacherLeave(scope, id, d, notes[id] ?? '');
    if (!r.ok) setError(r.error);
    q.reload();
  };
  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold">Teacher leave</h1>
        <p className="text-sm text-slate-600">After approval, the Admin arranges substitution and the timetable change.</p>
      </div>
      <ErrorBox message={error} />
      {q.data.length === 0 ? (
        <EmptyState title="No teacher leave requests" />
      ) : (
        <ul className="space-y-2.5">
          {q.data.map(l => (
            <li key={l.id}>
              <Panel className="p-3.5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{l.staffName}</p>
                    <p className="text-sm text-slate-600">
                      {formatDate(l.fromDate)}{l.toDate !== l.fromDate ? ` – ${formatDate(l.toDate)}` : ''} · {l.kind.toLowerCase()}
                    </p>
                  </div>
                  <Pill tone={l.status === 'APPROVED' ? 'success' : l.status === 'REJECTED' ? 'danger' : 'warning'}>{l.status.toLowerCase()}</Pill>
                </div>
                <p className="text-sm">{l.reason}</p>
                {l.status === 'PENDING' && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input value={notes[l.id] ?? ''} onChange={e => setNotes(n => ({ ...n, [l.id]: e.target.value.slice(0, 200) }))} placeholder="Note (required to reject)" className={`${inputClass} py-2 flex-1`} />
                    <button onClick={() => decide(l.id, 'REJECTED')} className="min-h-11 px-4 rounded-xl border border-rose-300 text-rose-800 font-semibold">Reject</button>
                    <button onClick={() => decide(l.id, 'APPROVED')} className="min-h-11 px-4 rounded-xl bg-blue-700 text-white font-semibold">Approve</button>
                  </div>
                )}
                {l.substitution && <p className="text-xs text-slate-500">Substitution: {l.substitution.note}</p>}
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
