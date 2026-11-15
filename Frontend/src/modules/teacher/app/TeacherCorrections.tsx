/**
 * Published-result corrections from the teacher side.
 *  My Teaching: raise a correction for MY subject on a published result.
 *  My Class Teacher Responsibility: verify corrections for my class, and republish after Principal approval.
 */
import React, { useState } from 'react';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { academicsService } from '../../../services/academicsService';
import { correctionService, CorrectableRow } from '../../../services/correctionService';
import { EmptyState, ErrorState, LoadingBlock, Panel, Pill, Section } from '../../../components/common/States';
import { ErrorBox, PrimaryButton, LinkButton, inputClass } from '../../auth/authUi';
import { MarkValue } from '../../../types/domain';

const STATUS_LABEL: Record<string, string> = {
  RAISED: 'Waiting for Class Teacher',
  VERIFIED: 'Waiting for Principal',
  APPROVED: 'Approved · republish',
  REPUBLISHED: 'Republished',
  REJECTED: 'Rejected'
};

export const TeacherCorrections: React.FC = () => {
  const scope = useScope();
  const a = useQuery(() => academicsService.getTeacherAssignments(scope), [scope.schoolId, scope.userId]);
  const rows = useQuery(() => correctionService.listCorrectable(scope), [scope.schoolId, scope.userId]);
  const ct = a.data?.classTeacherOf ?? null;
  const mine = useQuery(() => (ct ? correctionService.listForClassTeacher(scope, ct.id) : Promise.resolve({ ok: true as const, data: [] })), [scope.schoolId, ct?.id]);
  const [target, setTarget] = useState<CorrectableRow | null>(null);
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const reloadAll = () => {
    rows.reload();
    mine.reload();
  };

  const raise = async () => {
    if (!target) return;
    setError(null);
    const t = value.trim().toUpperCase();
    const to: MarkValue = t === 'A' || t === 'AB' ? 'AB' : Number(t);
    if (to !== 'AB' && !Number.isInteger(to)) return setError('Enter a number or AB.');
    const r = await correctionService.raise(scope, { resultId: target.resultId, subject: target.subject, field: 'internal', to, reason });
    if (!r.ok) return setError(r.error);
    setDone('Correction raised. The Class Teacher verifies it next.');
    setTarget(null);
    setValue('');
    setReason('');
    reloadAll();
  };

  const act = async (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) => {
    setError(null);
    const r = await fn();
    if (!r.ok) setError(r.error ?? 'Failed');
    else setDone(msg);
    reloadAll();
  };

  if (a.status === 'loading') return <LoadingBlock />;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold">Corrections to published results</h1>
        <p className="text-sm text-slate-600">Published marks are never overwritten. A correction creates a new version; the old one is kept as superseded.</p>
      </div>
      <ErrorBox message={error} />
      {done && <p role="status" className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900">{done}</p>}

      {ct && (
        <Section title={`My class (${ct.grade}-${ct.section}): verify & republish`}>
          {mine.status === 'loading' ? (
            <LoadingBlock lines={1} />
          ) : mine.status === 'error' ? (
            <ErrorState message={mine.error} onRetry={mine.reload} />
          ) : mine.data.length === 0 ? (
            <EmptyState title="No corrections for your class" />
          ) : (
            <ul className="space-y-2">
              {mine.data.map(c => (
                <li key={c.id}>
                  <Panel className="p-3.5 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold">{c.rollNumber}. {c.studentName} · {c.examName} {c.subject}</p>
                      <Pill tone={c.status === 'APPROVED' ? 'warning' : c.status === 'REPUBLISHED' ? 'success' : c.status === 'REJECTED' ? 'danger' : 'info'}>{STATUS_LABEL[c.status]}</Pill>
                    </div>
                    <p><span className="font-mono line-through text-slate-500">{String(c.from)}</span> → <span className="font-mono font-bold">{String(c.to)}</span></p>
                    <p className="text-sm text-slate-600">{c.reason}</p>
                    {c.status === 'RAISED' && (
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input value={notes[c.id] ?? ''} onChange={e => setNotes(n => ({ ...n, [c.id]: e.target.value.slice(0, 200) }))} placeholder="Note (required to reject)" className={`${inputClass} py-2 flex-1`} />
                        <button onClick={() => act(() => correctionService.verify(scope, c.id, 'REJECT', notes[c.id] ?? ''), 'Correction rejected.')} className="min-h-11 px-4 rounded-xl border border-rose-300 text-rose-800 font-semibold">Reject</button>
                        <button onClick={() => act(() => correctionService.verify(scope, c.id, 'VERIFY', notes[c.id] ?? ''), 'Verified and sent to the Principal.')} className="min-h-11 px-4 rounded-xl bg-blue-700 text-white font-semibold">Verify</button>
                      </div>
                    )}
                    {c.status === 'APPROVED' && (
                      <PrimaryButton onClick={() => act(() => correctionService.republish(scope, c.id), 'Republished as a new version. Parents see the corrected result.')}>
                        Republish new version
                      </PrimaryButton>
                    )}
                  </Panel>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      <Section title="My subjects: raise a correction">
        {rows.status === 'loading' ? (
          <LoadingBlock />
        ) : rows.status === 'error' ? (
          <ErrorState message={rows.error} onRetry={rows.reload} />
        ) : rows.data.length === 0 ? (
          <EmptyState title="No published results for your subjects yet" />
        ) : (
          <Panel className="divide-y divide-slate-100">
            {rows.data.map(r => (
              <div key={r.resultId + r.subject} className="p-3 flex items-center gap-3">
                <span className="flex-1 min-w-0">
                  <span className="block font-medium truncate">{r.rollNumber}. {r.studentName}</span>
                  <span className="block text-sm text-slate-500">{r.examName} v{r.version} · {r.subject}</span>
                </span>
                <span className="font-mono">{String(r.internal)}/{r.maxInternal}</span>
                {r.openCorrection ? (
                  <Pill tone="info">{STATUS_LABEL[r.openCorrection]}</Pill>
                ) : (
                  <button onClick={() => { setTarget(r); setDone(null); setError(null); }} className="min-h-10 px-3 rounded-lg border border-slate-300 text-sm font-semibold">Correct</button>
                )}
              </div>
            ))}
          </Panel>
        )}
      </Section>

      {target && (
        <Panel className="p-4 space-y-3 border-blue-600">
          <p className="font-semibold">{target.studentName} · {target.examName} {target.subject}: published {String(target.internal)}/{target.maxInternal}</p>
          <label className="block">
            <span className="block text-sm font-semibold text-slate-700 mb-1">Correct value (number or AB)</span>
            <input value={value} onChange={e => setValue(e.target.value.slice(0, 3))} className={`${inputClass} max-w-[8rem]`} />
          </label>
          <label className="block">
            <span className="block text-sm font-semibold text-slate-700 mb-1">Reason</span>
            <textarea value={reason} onChange={e => setReason(e.target.value.slice(0, 300))} rows={2} className={inputClass} />
          </label>
          <div className="flex gap-2">
            <PrimaryButton onClick={raise} disabled={!value || reason.trim().length < 10}>Raise correction</PrimaryButton>
          </div>
          <LinkButton onClick={() => setTarget(null)}>Cancel</LinkButton>
        </Panel>
      )}
    </div>
  );
};
