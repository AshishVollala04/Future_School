/**
 * Principal home: "Action Required" inbox first, then Today's School, Academic and Financial overview.
 * Operational figures only. No ranking or scoring of students, teachers or parents.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { staffService } from '../../../services/staffService';
import { EmptyState, ErrorState, LoadingBlock, Panel, Pill, Section } from '../../../components/common/States';
import { formatDate, formatINR } from '../../../utils/date';

const Stat: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
  <Panel className="p-3.5">
    <p className="text-xs font-medium text-slate-500">{label}</p>
    <p className="text-2xl font-bold mt-0.5">{value}</p>
    {hint && <p className="text-xs text-slate-500 mt-0.5">{hint}</p>}
  </Panel>
);

export const PrincipalHome: React.FC = () => {
  const scope = useScope();
  const q = useQuery(() => staffService.getOverview(scope), [scope.schoolId]);
  if (q.status === 'loading') return <LoadingBlock />;
  if (q.status === 'error') return <ErrorState message={q.error} onRetry={q.reload} />;
  const o = q.data;

  // Plain wording with real plurals: "1 mark correction to approve", "2 Admin requests to approve".
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
  const actions = [
    { n: o.counts.reportCards, to: '/principal/report-cards', title: plural(o.counts.reportCards, 'Report card waiting for your approval', 'Report cards waiting for your approval') },
    { n: o.counts.corrections, to: '/principal/corrections', title: plural(o.counts.corrections, 'Mark correction to approve', 'Mark corrections to approve') },
    { n: o.counts.governance, to: '/principal/requests', title: plural(o.counts.governance, 'Admin request to approve', 'Admin requests to approve') },
    { n: o.counts.teacherLeave, to: '/principal/teacher-leave', title: plural(o.counts.teacherLeave, 'Teacher leave request', 'Teacher leave requests') }
  ].filter(a => a.n > 0);

  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-xl font-bold">Good day</h1>

      <Section title="Action required">
        {actions.length === 0 ? (
          <EmptyState title="Nothing waiting for you" />
        ) : (
          <ul className="space-y-2">
            {actions.map(a => (
              <li key={a.to}>
                <Link to={a.to} className="flex items-center gap-3 p-3.5 rounded-2xl border border-amber-300 bg-amber-50">
                  <span className="w-9 h-9 rounded-xl bg-orange-500 text-white font-bold flex items-center justify-center">{a.n}</span>
                  <span className="flex-1 font-semibold">{a.title}</span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Today's school · ${formatDate(o.attendance.date)}`}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <Stat label="Morning registers" value={`${o.attendance.morningTaken}/${o.attendance.classesTotal}`} hint="classes recorded" />
          <Stat label="Afternoon registers" value={`${o.attendance.afternoonTaken}/${o.attendance.classesTotal}`} hint="classes recorded" />
          <Stat label="Present (recorded)" value={o.attendance.presentPct == null ? '—' : `${o.attendance.presentPct}%`} hint="of marked sessions" />
          {o.hallTickets[0] ? (
            <Stat label={`${o.hallTickets[0].exam} hall tickets`} value={`${o.hallTickets[0].released}/${o.hallTickets[0].students}`} hint={`released · ${o.hallTickets[0].cleared} fee cleared`} />
          ) : (
            <Stat label="Hall tickets" value="—" hint="no upcoming exam" />
          )}
        </div>
      </Section>

      <Section title="Academic overview">
        {o.academics.length === 0 ? (
          <EmptyState title="No assessments in progress" />
        ) : (
          <>
          {/* Phone: one card per class instead of a table that scrolls sideways. */}
          <ul className="sm:hidden space-y-2">
            {o.academics.map(a => (
              <li key={a.classLabel + a.assessment}>
                <Panel className="p-3.5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span>
                      <span className="block font-semibold">{a.classLabel} · {a.assessment}</span>
                      <span className="block text-xs text-slate-500">{a.classTeacher}</span>
                    </span>
                    <span className="text-sm font-semibold text-blue-800">{a.subjectsAccepted}/{a.subjectsTotal} subjects</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-blue-600" style={{ width: `${pct(a.subjectsAccepted, a.subjectsTotal)}%` }} />
                  </div>
                  <div className="text-xs">
                    {a.published ? (
                      <Pill tone="success">Published</Pill>
                    ) : Object.keys(a.cards).length === 0 ? (
                      <span className="text-slate-400">Report cards not generated</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {Object.entries(a.cards).map(([k, n]) => (
                          <Pill key={k} tone={k === 'APPROVED' ? 'success' : k === 'RETURNED' ? 'danger' : k === 'SUBMITTED' ? 'info' : 'neutral'}>{n} {k.toLowerCase()}</Pill>
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
                  <th className="p-3 font-medium">Class</th>
                  <th className="p-3 font-medium">Assessment</th>
                  <th className="p-3 font-medium">Subjects accepted</th>
                  <th className="p-3 font-medium">Report cards</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {o.academics.map(a => (
                  <tr key={a.classLabel + a.assessment}>
                    <td className="p-3">
                      <span className="font-semibold">{a.classLabel}</span>
                      <span className="block text-xs text-slate-500">{a.classTeacher}</span>
                    </td>
                    <td className="p-3">{a.assessment}</td>
                    <td className="p-3">{a.subjectsAccepted}/{a.subjectsTotal}</td>
                    <td className="p-3">
                      {a.published ? (
                        <Pill tone="success">Published</Pill>
                      ) : Object.keys(a.cards).length === 0 ? (
                        <span className="text-slate-400">Not generated</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {Object.entries(a.cards).map(([k, n]) => (
                            <Pill key={k} tone={k === 'APPROVED' ? 'success' : k === 'RETURNED' ? 'danger' : k === 'SUBMITTED' ? 'info' : 'neutral'}>{n} {k.toLowerCase()}</Pill>
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
      </Section>

      <Section title="Financial overview">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <Stat label="Collected" value={formatINR(o.finance.collected)} hint={`${pct(o.finance.collected, o.finance.charged - o.finance.concession)}% of net dues`} />
          <Stat label="Outstanding" value={formatINR(o.finance.outstanding)} />
          <Stat label="Overdue" value={formatINR(o.finance.overdue)} />
          <Stat label="Concessions" value={formatINR(o.finance.concession)} />
        </div>
        <Panel className="p-3.5 space-y-2.5">
          {o.finance.byInstalment.map(i => (
            <div key={i.label}>
              <div className="flex justify-between text-sm">
                <span>{i.label}</span>
                <span className="font-mono text-slate-600">{formatINR(i.collected)} / {formatINR(i.due)}</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden mt-1" role="progressbar" aria-valuenow={pct(i.collected, i.due)} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full bg-blue-600" style={{ width: `${pct(i.collected, i.due)}%` }} />
              </div>
            </div>
          ))}
        </Panel>
      </Section>
    </div>
  );
};
