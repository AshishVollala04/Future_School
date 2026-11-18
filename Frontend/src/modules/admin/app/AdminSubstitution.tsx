/** Substitution (ACADEMIC_OPS): cover every period of approved teacher leave with a free teacher. */
import React, { useState } from 'react';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { substitutionService, SubstitutionNeed } from '../../../services/substitutionService';
import { EmptyState, ErrorState, LoadingBlock, Panel, Pill, Section } from '../../../components/common/States';
import { ErrorBox, inputClass } from '../../auth/authUi';
import { formatDate } from '../../../utils/date';

const key = (n: SubstitutionNeed) => `${n.leaveId}|${n.date}|${n.classSectionId}|${n.period}`;

export const AdminSubstitution: React.FC = () => {
  const scope = useScope();
  const q = useQuery(() => substitutionService.listNeeds(scope), [scope.schoolId]);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  if (q.status === 'loading') return <LoadingBlock />;
  if (q.status === 'error') return <ErrorState message={q.error} onRetry={q.reload} />;

  const assign = async (n: SubstitutionNeed) => {
    const sub = pick[key(n)];
    if (!sub) return;
    setBusyKey(key(n));
    setError(null);
    const r = await substitutionService.assign(scope, { leaveId: n.leaveId, date: n.date, classSectionId: n.classSectionId, period: n.period, substituteStaffId: sub });
    setBusyKey(null);
    if (!r.ok) setError(r.error);
    q.reload();
  };

  const byLeave = new Map<string, SubstitutionNeed[]>();
  q.data.forEach(n => byLeave.set(n.leaveId, [...(byLeave.get(n.leaveId) ?? []), n]));

  return (
    <div className="space-y-5 max-w-3xl xl:max-w-6xl">
      <div>
        <h1 className="text-xl font-bold">Substitution</h1>
        <p className="text-sm text-slate-600">Only leave the Principal approved appears here. The list offers teachers who are free in that period.</p>
      </div>
      <ErrorBox message={error} />
      {q.data.length === 0 ? (
        <EmptyState title="No periods need cover" hint="Approved teacher leave will appear here." />
      ) : (
        [...byLeave.values()].map(needs => {
          const covered = needs.filter(n => n.assigned).length;
          return (
            <Section key={needs[0].leaveId} title={`${needs[0].absentName} · ${covered}/${needs.length} covered`}>
              <Panel className="divide-y divide-slate-100">
                {needs.map(n => (
                  <div key={key(n)} className="p-3 flex flex-col sm:flex-row sm:items-center gap-2">
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold">{formatDate(n.date)} · P{n.period} ({n.start}–{n.end})</span>
                      <span className="block text-sm text-slate-500">Class {n.classLabel} · {n.subject}</span>
                    </span>
                    {n.assigned && <Pill tone="success">{n.assigned.substituteName}</Pill>}
                    {n.freeTeachers.length === 0 ? (
                      <Pill tone="danger">No teacher free</Pill>
                    ) : (
                      <span className="flex gap-2">
                        <select aria-label={`Substitute for ${n.classLabel} period ${n.period}`} value={pick[key(n)] ?? ''} onChange={e => setPick(p => ({ ...p, [key(n)]: e.target.value }))} className={`${inputClass} py-2 min-w-40`}>
                          <option value="">{n.assigned ? 'Change…' : 'Choose…'}</option>
                          {n.freeTeachers.map(t => <option key={t.staffId} value={t.staffId}>{t.name}</option>)}
                        </select>
                        <button onClick={() => assign(n)} disabled={!pick[key(n)] || busyKey === key(n)} className="min-h-11 px-4 rounded-xl bg-blue-700 text-white font-semibold disabled:opacity-50">Assign</button>
                      </span>
                    )}
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
