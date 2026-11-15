/**
 * Principal: approve or return EACH report card (e.g. approve 47, return 3).
 * The Principal never publishes; the Class Teacher publishes once all are approved.
 */
import React, { useState } from 'react';
import { useScope } from '../../hooks/useScope';
import { useQuery } from '../../hooks/useQuery';
import { marksService } from '../../services/marksService';
import { EmptyState, ErrorState, LoadingBlock, Panel, Pill, Section } from '../../components/common/States';
import { ErrorBox, inputClass } from '../auth/authUi';

export const PrincipalReportCardApprovals: React.FC = () => {
  const scope = useScope();
  const q = useQuery(() => marksService.listForPrincipal(scope), [scope.schoolId]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const decide = async (id: string, d: 'APPROVE' | 'RETURN') => {
    setBusy(id);
    setError(null);
    const r = await marksService.principalDecide(scope, id, d, notes[id]);
    setBusy(null);
    if (!r.ok) setError(r.error);
    q.reload();
  };

  const approveAll = async (ids: string[]) => {
    setBusy('all');
    setError(null);
    for (const id of ids) {
      const r = await marksService.principalDecide(scope, id, 'APPROVE');
      if (!r.ok) {
        setError(r.error);
        break;
      }
    }
    setBusy(null);
    q.reload();
  };

  if (q.status === 'loading') return <LoadingBlock />;
  if (q.status === 'error') return <ErrorState message={q.error} onRetry={q.reload} />;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold">Report card approvals</h1>
        <p className="text-sm text-slate-600">Approve or return each card. Class Teachers publish after every card in the class is approved.</p>
      </div>
      <ErrorBox message={error} />
      {q.data.length === 0 ? (
        <EmptyState title="No report cards waiting" />
      ) : (
        q.data.map(g => {
          const pending = g.cards.filter(c => c.status === 'SUBMITTED');
          return (
            <Section
              key={g.classSection.id + g.assessment.id}
              title={`${g.assessment.name} · Class ${g.classSection.grade}-${g.classSection.section} · ${g.classSection.classTeacherName}`}
              action={
                pending.length > 0 ? (
                  <button onClick={() => approveAll(pending.map(c => c.id))} disabled={busy === 'all'} className="min-h-10 px-3 rounded-lg bg-blue-700 text-white text-sm font-semibold disabled:opacity-50">
                    Approve all {pending.length}
                  </button>
                ) : undefined
              }
            >
              <Panel className="divide-y divide-slate-100">
                {g.cards.map(c => (
                  <div key={c.id} className="p-3.5 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 font-semibold">{c.rollNumber}. {c.studentName}</span>
                      <Pill tone={c.status === 'APPROVED' || c.status === 'PUBLISHED' ? 'success' : c.status === 'RETURNED' ? 'danger' : 'info'}>
                        {c.status === 'SUBMITTED' ? 'Waiting' : c.status === 'APPROVED' ? 'Approved' : c.status === 'RETURNED' ? 'Returned' : 'Published'}
                      </Pill>
                    </div>
                    <div className="overflow-x-auto">
                      <p className="text-sm text-slate-600 whitespace-nowrap">
                        {c.subjects.map(s => `${s.subject} ${s.internal}/${s.maxInternal + s.maxExternal}`).join(' · ')}
                      </p>
                    </div>
                    <p className="text-sm">“{c.classTeacherRemark}”</p>
                    {c.status === 'SUBMITTED' && (
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input value={notes[c.id] ?? ''} onChange={e => setNotes(n => ({ ...n, [c.id]: e.target.value.slice(0, 200) }))} placeholder="Note (required to return)" className={`${inputClass} py-2 flex-1`} />
                        <button onClick={() => decide(c.id, 'RETURN')} disabled={busy === c.id} className="min-h-11 px-4 rounded-xl border border-rose-300 text-rose-800 font-semibold">Return</button>
                        <button onClick={() => decide(c.id, 'APPROVE')} disabled={busy === c.id} className="min-h-11 px-4 rounded-xl bg-blue-700 text-white font-semibold">Approve</button>
                      </div>
                    )}
                    {c.status === 'RETURNED' && c.principalNote && <p className="text-xs text-rose-800">Your note: {c.principalNote}</p>}
                  </div>
                ))}
              </Panel>
            </Section>
          );
        })
      )}
    </div>
  );
};
