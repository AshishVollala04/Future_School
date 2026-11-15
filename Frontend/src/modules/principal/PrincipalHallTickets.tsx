/**
 * Principal: school-wide hall ticket monitoring + controlled emergency override.
 * Override only for a fee-CLEARED, unreleased student, with a reason, OTP re-check and audit.
 * The Principal does not release routinely; that is the Class Teacher's job.
 */
import React, { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useScope } from '../../hooks/useScope';
import { useQuery } from '../../hooks/useQuery';
import { useAuth } from '../../context/AuthContext';
import { hallTicketService } from '../../services/hallTicketService';
import { academicsService } from '../../services/academicsService';
import { ErrorState, LoadingBlock, Panel, Pill } from '../../components/common/States';
import { Modal } from '../../components/ui/Modal';
import { ErrorBox, PrimaryButton, LinkButton, inputClass } from '../auth/authUi';
import { HallTicketStatus } from '../../types/domain';

export const PrincipalHallTickets: React.FC = () => {
  const scope = useScope();
  const { promptSensitiveActionAuth } = useAuth();
  const classes = useQuery(() => academicsService.listClasses(scope), [scope.schoolId]);
  const [picked, setPicked] = useState<string | null>(null);
  const classId = picked ?? classes.data?.[0]?.id ?? '';
  const list = useQuery(
    () => (classId ? hallTicketService.listForClass(scope, classId) : Promise.resolve({ ok: true as const, data: [] as HallTicketStatus[] })),
    [scope.schoolId, classId]
  );
  const [target, setTarget] = useState<HallTicketStatus | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const submit = () => {
    if (!target) return;
    setError(null);
    if (reason.trim().length < 10) return setError('Give a reason of at least 10 characters. It is recorded in the audit log.');
    promptSensitiveActionAuth(`Emergency hall ticket override for ${target.student.name}`, async token => {
      const r = await hallTicketService.principalOverride(scope, target.exam.id, target.student.id, reason, token);
      if (!r.ok) return setError(r.error);
      setDone(`Override recorded for ${target.student.name}.`);
      setTarget(null);
      setReason('');
      list.reload();
    });
  };

  const rows = list.data ?? [];
  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold">Hall ticket status</h1>
        <p className="text-sm text-slate-600">Class Teachers release hall tickets after fee clearance. Use the override only in exceptional cases.</p>
      </div>
      <label className="block max-w-xs">
        <span className="block text-sm font-semibold text-slate-700 mb-1.5">Class</span>
        <select value={classId} onChange={e => setPicked(e.target.value)} className={inputClass} disabled={classes.status !== 'ready'}>
          {(classes.data ?? []).map(c => (
            <option key={c.id} value={c.id}>Class {c.grade}-{c.section} · {c.classTeacherName}</option>
          ))}
        </select>
      </label>
      {done && <div role="status" className="p-3 rounded-xl text-sm bg-emerald-50 text-emerald-900 border border-emerald-200">{done}</div>}
      {list.status === 'loading' ? (
        <LoadingBlock />
      ) : list.status === 'error' ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="text-left text-slate-500 border-b border-slate-200">
              <tr>
                <th className="p-3 font-medium">Student</th>
                <th className="p-3 font-medium">Fee clearance</th>
                <th className="p-3 font-medium">Release</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(h => (
                <tr key={h.student.id}>
                  <td className="p-3 font-medium">{h.student.rollNumber}. {h.student.name}</td>
                  <td className="p-3">
                    <Pill tone={h.feeClearance === 'CLEARED' ? 'success' : 'warning'}>{h.feeClearance === 'CLEARED' ? 'Cleared' : 'Pending'}</Pill>
                  </td>
                  <td className="p-3">{h.release ? (h.release.principalOverride ? 'Override' : 'Class Teacher') : '—'}</td>
                  <td className="p-3 text-right">
                    {!h.release && h.feeClearance === 'CLEARED' && (
                      <button onClick={() => { setTarget(h); setError(null); setDone(null); }} className="min-h-10 px-3 rounded-lg border border-orange-300 text-orange-800 text-sm font-semibold hover:bg-orange-50">
                        Emergency override
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      <Modal isOpen={Boolean(target)} onClose={() => setTarget(null)} title="Emergency override">
        {target && (
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-orange-50 border border-orange-200 text-sm text-orange-900 flex gap-2">
              <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                {target.student.name} ({target.exam.name}). Fees are cleared but the Class Teacher has not released the ticket. This is recorded in the audit log with your reason.
              </span>
            </div>
            <label className="block">
              <span className="block text-sm font-semibold text-slate-700 mb-1.5">Reason (required)</span>
              <textarea value={reason} onChange={e => setReason(e.target.value.slice(0, 500))} rows={3} className={inputClass} />
            </label>
            <ErrorBox message={error} />
            <PrimaryButton onClick={submit}>Confirm with OTP</PrimaryButton>
            <LinkButton onClick={() => setTarget(null)}>Cancel</LinkButton>
          </div>
        )}
      </Modal>
    </div>
  );
};
