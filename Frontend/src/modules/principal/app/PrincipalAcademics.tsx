/**
 * Principal: academic overview of every class (subjects accepted, report-card status), on its own
 * page so a school with 20+ classes does not crowd the home dashboard. Opened from the home quick card.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { staffService } from '../../../services/staffService';
import { onStaffDataChanged } from '../../../app/staffEvents';
import { EmptyState, ErrorState, LoadingBlock, Panel, Pill } from '../../../components/common/States';
import { inputClass } from '../../auth/authUi';

export const PrincipalAcademics: React.FC = () => {
  const { t } = useTranslation();
  const scope = useScope();
  const q = useQuery(() => staffService.getOverview(scope), [scope.schoolId]);
  const reload = q.reload;
  useEffect(() => onStaffDataChanged(reload), [reload]);
  const [search, setSearch] = useState('');

  const rows = useMemo(() => {
    const all = q.data?.academics ?? [];
    const s = search.trim().toLowerCase();
    return s ? all.filter(a => `${a.classLabel} ${a.classTeacher} ${a.assessment}`.toLowerCase().includes(s)) : all;
  }, [q.data, search]);

  if (q.status === 'loading') return <LoadingBlock />;
  if (q.status === 'error') return <ErrorState message={q.error} onRetry={q.reload} />;

  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  const cardTone = (k: string) => (k === 'APPROVED' ? 'success' : k === 'RETURNED' ? 'danger' : k === 'SUBMITTED' ? 'info' : 'neutral');
  const cardLabel = (k: string, n: number) => `${n} ${t(`principal.home.cardStatus.${k}`, { defaultValue: k.toLowerCase() })}`;

  return (
    <div className="space-y-4 max-w-5xl xl:max-w-6xl">
      <h1 className="text-xl font-bold">{t('principal.home.academicOverview')}</h1>

      {q.data.academics.length === 0 ? (
        <EmptyState title={t('principal.home.noAssessments')} />
      ) : (
        <>
          <label className="relative block max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('principal.quick.searchClass')}
              aria-label={t('principal.quick.searchClass')}
              className={`${inputClass} pl-9`}
            />
          </label>

          {rows.length === 0 ? (
            <EmptyState title={t('principal.quick.noMatch')} />
          ) : (
            <>
              {/* Phone: one card per class instead of a table that scrolls sideways. */}
              <ul className="sm:hidden space-y-2">
                {rows.map(a => (
                  <li key={a.classLabel + a.assessment}>
                    <Panel className="p-3.5 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <span>
                          <span className="block font-semibold">{a.classLabel} · {a.assessment}</span>
                          <span className="block text-xs text-slate-500">{a.classTeacher}</span>
                        </span>
                        <span className="text-sm font-semibold text-blue-800">{t('principal.home.subjectsOf', { a: a.subjectsAccepted, b: a.subjectsTotal })}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full bg-blue-600" style={{ width: `${pct(a.subjectsAccepted, a.subjectsTotal)}%` }} />
                      </div>
                      <div className="text-xs">
                        {a.published ? (
                          <Pill tone="success">{t('principal.home.published')}</Pill>
                        ) : Object.keys(a.cards).length === 0 ? (
                          <span className="text-slate-400">{t('principal.home.cardsNotGenerated')}</span>
                        ) : (
                          <span className="flex flex-wrap gap-1">
                            {Object.entries(a.cards).map(([k, n]) => (
                              <Pill key={k} tone={cardTone(k)}>{cardLabel(k, n)}</Pill>
                            ))}
                          </span>
                        )}
                      </div>
                    </Panel>
                  </li>
                ))}
              </ul>
              <Panel className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead className="text-left text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="p-3 font-medium">{t('principal.home.colClass')}</th>
                      <th className="p-3 font-medium">{t('principal.home.colAssessment')}</th>
                      <th className="p-3 font-medium">{t('principal.home.colSubjectsAccepted')}</th>
                      <th className="p-3 font-medium">{t('principal.home.colReportCards')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map(a => (
                      <tr key={a.classLabel + a.assessment}>
                        <td className="p-3">
                          <span className="font-semibold">{a.classLabel}</span>
                          <span className="block text-xs text-slate-500">{a.classTeacher}</span>
                        </td>
                        <td className="p-3">{a.assessment}</td>
                        <td className="p-3">{a.subjectsAccepted}/{a.subjectsTotal}</td>
                        <td className="p-3">
                          {a.published ? (
                            <Pill tone="success">{t('principal.home.published')}</Pill>
                          ) : Object.keys(a.cards).length === 0 ? (
                            <span className="text-slate-400">{t('principal.home.notGenerated')}</span>
                          ) : (
                            <span className="flex flex-wrap gap-1">
                              {Object.entries(a.cards).map(([k, n]) => (
                                <Pill key={k} tone={cardTone(k)}>{cardLabel(k, n)}</Pill>
                              ))}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            </>
          )}
        </>
      )}
    </div>
  );
};
