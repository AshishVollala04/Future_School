/** Class Teacher: review student leave for my class. Approval does not change attendance by itself. */
import React, { useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { academicsService } from '../../../services/academicsService';
import { leaveService } from '../../../services/leaveService';
import { EmptyState, ErrorState, LoadingBlock, Panel, Pill } from '../../../components/common/States';
import { ErrorBox, inputClass } from '../../auth/authUi';
import { formatDate, formatDateTime } from '../../../utils/date';

const KIND: Record<string, string> = { SICK: 'Sick', FAMILY: 'Family', MEDICAL_APPOINTMENT: 'Medical appointment', OTHER: 'Other' };

export const TeacherLeaveReview: React.FC = () => {
  const scope = useScope();
  const { currentUser } = useAuth();
  const a = useQuery(() => academicsService.getTeacherAssignments(scope), [scope.schoolId, scope.userId]);
  const ct = a.data?.classTeacherOf ?? null;
  const q = useQuery(() => (ct ? leaveService.listForClass(scope, ct.id) : Promise.resolve({ ok: true as const, data: [] })), [scope.schoolId, ct?.id]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (a.status === 'loading') return <LoadingBlock />;
  if (!ct) return <EmptyState title="Leave is reviewed by the Class Teacher" />;

  const decide = async (id: string, d: 'APPROVED' | 'REJECTED') => {
    setBusy(id);
    setError(null);
    const r = await leaveService.decide(scope, id, d, notes[id], currentUser?.name);
    setBusy(null);
    if (!r.ok) setError(r.error);
    q.reload();
  };

  return (
    <div className="space-y-4 max-w-3xl xl:max-w-6xl">
      <div>
        <p className="text-sm font-semibold text-blue-800">My Class Teacher responsibility</p>
        <h1 className="text-xl font-bold">Leave requests · Class {ct.grade}-{ct.section}</h1>
        <p className="text-sm text-slate-600">Approved leave shows in the register as a hint. You still mark attendance yourself.</p>
      </div>
      <ErrorBox message={error} />
      {q.status === 'loading' ? (
        <LoadingBlock />
      ) : q.status === 'error' ? (
        <ErrorState message={q.error} onRetry={q.reload} />
      ) : q.data.length === 0 ? (
        <EmptyState title="No leave requests" />
      ) : (
        <ul className="space-y-2.5">
          {q.data.map(l => (
            <li key={l.id}>
              <Panel className="p-3.5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{l.rollNumber}. {l.studentName}</p>
                    <p className="text-sm text-slate-600">
                      {formatDate(l.fromDate)}{l.toDate !== l.fromDate ? ` – ${formatDate(l.toDate)}` : ''} · {KIND[l.kind]}
                    </p>
                  </div>
                  <Pill tone={l.status === 'APPROVED' ? 'success' : l.status === 'REJECTED' ? 'danger' : 'warning'}>{l.status === 'PENDING' ? 'Pending' : l.status === 'APPROVED' ? 'Approved' : 'Rejected'}</Pill>
                </div>
                <p className="text-sm">{l.reason}</p>
                <p className="text-xs text-slate-500">Requested {formatDateTime(l.requestedAt)}</p>
                {l.status === 'PENDING' ? (
                  <>
                    <input value={notes[l.id] ?? ''} onChange={e => setNotes(n => ({ ...n, [l.id]: e.target.value.slice(0, 200) }))} placeholder="Note to parent (required to reject)" className={`${inputClass} py-2`} />
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => decide(l.id, 'REJECTED')} disabled={busy === l.id} className="min-h-11 rounded-xl border border-rose-300 text-rose-800 font-semibold">Reject</button>
                      <button onClick={() => decide(l.id, 'APPROVED')} disabled={busy === l.id} className="min-h-11 rounded-xl bg-blue-700 text-white font-semibold">Approve</button>
                    </div>
                  </>
                ) : (
                  l.decision && <p className="text-xs text-slate-500">{l.decision.byName || 'Class Teacher'} · {formatDateTime(l.decision.at)}{l.decision.note ? ` · ${l.decision.note}` : ''}</p>
                )}
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
