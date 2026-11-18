/**
 * Principal: approve or return EACH report card (e.g. approve 47, return 3).
 * The Principal never publishes; the Class Teacher publishes once all are approved.
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useScope } from '../../hooks/useScope';
import { useQuery } from '../../hooks/useQuery';
import { marksService } from '../../services/marksService';
import { notifyStaffDataChanged } from '../../app/staffEvents';
import { EmptyState, ErrorState, LoadingBlock, Panel, Pill, Section } from '../../components/common/States';
import { ErrorBox, inputClass } from '../auth/authUi';

export const PrincipalReportCardApprovals: React.FC = () => {
  const { t } = useTranslation();
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
    notifyStaffDataChanged();
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
    notifyStaffDataChanged();
  };

  if (q.status === 'loading') return <LoadingBlock />;
  if (q.status === 'error') return <ErrorState message={q.error} onRetry={q.reload} />;

  const statusLabel = (s: string) =>
    s === 'SUBMITTED' ? t('principal.cards.waiting') : s === 'APPROVED' ? t('principal.cards.approved') : s === 'RETURNED' ? t('principal.cards.returned') : t('principal.cards.published');

  return (
    <div className="space-y-6 max-w-4xl xl:max-w-6xl">
      <div>
        <h1 className="text-xl font-bold">{t('principal.cards.title')}</h1>
        <p className="text-sm text-slate-600">{t('principal.cards.subtitle')}</p>
      </div>
      <ErrorBox message={error} />
      {q.data.length === 0 ? (
        <EmptyState title={t('principal.cards.none')} />
      ) : (
        q.data.map(g => {
          const pending = g.cards.filter(c => c.status === 'SUBMITTED');
          return (
            <Section
              key={g.classSection.id + g.assessment.id}
              title={t('principal.cards.groupTitle', {
                assessment: g.assessment.name,
                grade: g.classSection.grade,
                section: g.classSection.section,
                teacher: g.classSection.classTeacherName
              })}
              action={
                pending.length > 0 ? (
                  <button onClick={() => approveAll(pending.map(c => c.id))} disabled={busy === 'all'} className="min-h-10 px-3 rounded-lg bg-blue-700 text-white text-sm font-semibold disabled:opacity-50">
                    {t('principal.cards.approveAll', { count: pending.length })}
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
                        {statusLabel(c.status)}
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
                        <input value={notes[c.id] ?? ''} onChange={e => setNotes(n => ({ ...n, [c.id]: e.target.value.slice(0, 200) }))} placeholder={t('principal.act.noteReturn')} className={`${inputClass} py-2 flex-1`} />
                        <button onClick={() => decide(c.id, 'RETURN')} disabled={busy === c.id} className="min-h-11 px-4 rounded-xl border border-rose-300 text-rose-800 font-semibold">{t('principal.act.return')}</button>
                        <button onClick={() => decide(c.id, 'APPROVE')} disabled={busy === c.id} className="min-h-11 px-4 rounded-xl bg-blue-700 text-white font-semibold">{t('principal.act.approve')}</button>
                      </div>
                    )}
                    {c.status === 'RETURNED' && c.principalNote && <p className="text-xs text-rose-800">{t('principal.cards.yourNote', { note: c.principalNote })}</p>}
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
