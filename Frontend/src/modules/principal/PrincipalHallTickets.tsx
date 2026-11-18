/**
 * Principal: school-wide hall ticket monitoring + controlled emergency override.
 * Override only for a fee-CLEARED, unreleased student, with a reason, OTP re-check and audit.
 * The Principal does not release routinely; that is the Class Teacher's job.
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
    if (reason.trim().length < 10) return setError(t('principal.hall.reasonShort'));
    promptSensitiveActionAuth(t('principal.hall.sensitive', { name: target.student.name }), async token => {
      const r = await hallTicketService.principalOverride(scope, target.exam.id, target.student.id, reason, token);
      if (!r.ok) return setError(r.error);
      setDone(t('principal.hall.done', { name: target.student.name }));
      setTarget(null);
      setReason('');
      list.reload();
    });
  };

  const rows = list.data ?? [];
  return (
    <div className="space-y-4 max-w-4xl xl:max-w-6xl">
      <div>
        <h1 className="text-xl font-bold">{t('principal.hall.title')}</h1>
        <p className="text-sm text-slate-600">{t('principal.hall.subtitle')}</p>
      </div>
      <label className="block max-w-xs">
        <span className="block text-sm font-semibold text-slate-700 mb-1.5">{t('principal.hall.classLabel')}</span>
        <select value={classId} onChange={e => setPicked(e.target.value)} className={inputClass} disabled={classes.status !== 'ready'}>
          {(classes.data ?? []).map(c => (
            <option key={c.id} value={c.id}>{t('principal.hall.classOption', { grade: c.grade, section: c.section, teacher: c.classTeacherName })}</option>
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
                <th className="p-3 font-medium">{t('principal.hall.colStudent')}</th>
                <th className="p-3 font-medium">{t('principal.hall.colFee')}</th>
                <th className="p-3 font-medium">{t('principal.hall.colRelease')}</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(h => (
                <tr key={h.student.id}>
                  <td className="p-3 font-medium">{h.student.rollNumber}. {h.student.name}</td>
                  <td className="p-3">
                    <Pill tone={h.feeClearance === 'CLEARED' ? 'success' : 'warning'}>{h.feeClearance === 'CLEARED' ? t('principal.hall.cleared') : t('principal.hall.pending')}</Pill>
                  </td>
                  <td className="p-3">{h.release ? (h.release.principalOverride ? t('principal.hall.override') : t('principal.hall.classTeacher')) : '—'}</td>
                  <td className="p-3 text-right">
                    {!h.release && h.feeClearance === 'CLEARED' && (
                      <button onClick={() => { setTarget(h); setError(null); setDone(null); }} className="min-h-10 px-3 rounded-lg border border-orange-300 text-orange-800 text-sm font-semibold hover:bg-orange-50">
                        {t('principal.hall.emergency')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      <Modal isOpen={Boolean(target)} onClose={() => setTarget(null)} title={t('principal.hall.emergency')}>
        {target && (
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-orange-50 border border-orange-200 text-sm text-orange-900 flex gap-2">
              <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{t('principal.hall.modalDesc', { name: target.student.name, exam: target.exam.name })}</span>
            </div>
            <label className="block">
              <span className="block text-sm font-semibold text-slate-700 mb-1.5">{t('principal.hall.reasonLabel')}</span>
              <textarea value={reason} onChange={e => setReason(e.target.value.slice(0, 500))} rows={3} className={inputClass} />
            </label>
            <ErrorBox message={error} />
            <PrimaryButton onClick={submit}>{t('principal.hall.confirmOtp')}</PrimaryButton>
            <LinkButton onClick={() => setTarget(null)}>{t('principal.act.cancel')}</LinkButton>
          </div>
        )}
      </Modal>
    </div>
  );
};
