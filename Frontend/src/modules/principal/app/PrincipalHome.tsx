/**
 * Principal home: quick cards for approvals (pending count + orange dot) and the academic overview
 * (its own page), then Today's School and the Financial overview.
 * Operational figures only. No ranking or scoring of students, teachers or parents.
 */
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Award, BookOpen, ClipboardCheck, FileEdit, ShieldAlert, Users } from 'lucide-react';
import { QuickCard } from '../../../components/common/HomeCards';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { staffService } from '../../../services/staffService';
import { onStaffDataChanged } from '../../../app/staffEvents';
import { ErrorState, LoadingBlock, Panel, Section } from '../../../components/common/States';
import { formatDate, formatINR } from '../../../utils/date';

const Stat: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
  <Panel className="p-3.5">
    <p className="text-xs font-medium text-slate-500">{label}</p>
    <p className="text-2xl font-bold mt-0.5">{value}</p>
    {hint && <p className="text-xs text-slate-500 mt-0.5">{hint}</p>}
  </Panel>
);

export const PrincipalHome: React.FC = () => {
  const { t } = useTranslation();
  const scope = useScope();
  const q = useQuery(() => staffService.getOverview(scope), [scope.schoolId]);
  const reload = q.reload;
  useEffect(() => onStaffDataChanged(reload), [reload]);

  if (q.status === 'loading') return <LoadingBlock />;
  if (q.status === 'error') return <ErrorState message={q.error} onRetry={q.reload} />;
  const o = q.data;

  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-xl font-bold">{t('principal.home.goodDay')}</h1>

      {/* Quick cards: a 2×2 grid on every screen size. */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { to: '/principal/report-cards', n: o.counts.reportCards, title: t('principal.nav.reportCards'), icon: <Award className="w-6 h-6" />, tint: 'bg-blue-50 text-blue-700' },
          { to: '/principal/corrections', n: o.counts.corrections, title: t('principal.nav.corrections'), icon: <FileEdit className="w-6 h-6" />, tint: 'bg-indigo-50 text-indigo-700' },
          { to: '/principal/requests', n: o.counts.governance, title: t('principal.nav.requests'), icon: <ClipboardCheck className="w-6 h-6" />, tint: 'bg-sky-50 text-sky-700' },
          { to: '/principal/teacher-leave', n: o.counts.teacherLeave, title: t('principal.nav.teacherLeave'), icon: <Users className="w-6 h-6" />, tint: 'bg-emerald-50 text-emerald-700' }
        ].map(c => (
          <QuickCard key={c.to} fill to={c.to} icon={c.icon} tint={c.tint} title={c.title} alert={c.n > 0}
            status={c.n > 0 ? t('principal.quick.pending', { count: c.n }) : t('principal.quick.nothing')} />
        ))}
        {/* Every class's progress lives on its own page (20+ classes would crowd the dashboard). */}
        <QuickCard fill to="/principal/academics" icon={<BookOpen className="w-6 h-6" />} tint="bg-violet-50 text-violet-700"
          title={t('principal.home.academicOverview')}
          status={o.academics.length === 0 ? t('principal.home.noAssessments')
            : t('principal.quick.academicStatus', { published: o.academics.filter(x => x.published).length, total: o.academics.length })} />
        <QuickCard fill to="/principal/hall-tickets" icon={<ShieldAlert className="w-6 h-6" />} tint="bg-amber-50 text-amber-700"
          title={t('principal.nav.hallTickets')}
          status={o.hallTickets[0]
            ? t('principal.quick.hallStatus', { exam: o.hallTickets[0].exam, released: o.hallTickets[0].released, total: o.hallTickets[0].students })
            : t('principal.home.noUpcomingExam')} />
      </div>

      <Section title={t('principal.home.todaySchool', { date: formatDate(o.attendance.date) })}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <Stat label={t('principal.home.morningRegisters')} value={`${o.attendance.morningTaken}/${o.attendance.classesTotal}`} hint={t('principal.home.classesRecorded')} />
          <Stat label={t('principal.home.afternoonRegisters')} value={`${o.attendance.afternoonTaken}/${o.attendance.classesTotal}`} hint={t('principal.home.classesRecorded')} />
          <Stat label={t('principal.home.presentRecorded')} value={o.attendance.presentPct == null ? '—' : `${o.attendance.presentPct}%`} hint={t('principal.home.ofMarkedSessions')} />
          {o.hallTickets[0] ? (
            <Stat
              label={t('principal.home.hallTicketsOf', { exam: o.hallTickets[0].exam })}
              value={`${o.hallTickets[0].released}/${o.hallTickets[0].students}`}
              hint={t('principal.home.releasedCleared', { count: o.hallTickets[0].cleared })}
            />
          ) : (
            <Stat label={t('principal.home.hallTickets')} value="—" hint={t('principal.home.noUpcomingExam')} />
          )}
        </div>
      </Section>

      <Section title={t('principal.home.financialOverview')}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <Stat
            label={t('principal.home.collected')}
            value={formatINR(o.finance.collected)}
            hint={t('principal.home.pctNet', { pct: pct(o.finance.collected, o.finance.charged - o.finance.concession) })}
          />
          <Stat label={t('principal.home.outstanding')} value={formatINR(o.finance.outstanding)} />
          <Stat label={t('principal.home.overdue')} value={formatINR(o.finance.overdue)} />
          <Stat label={t('principal.home.concessions')} value={formatINR(o.finance.concession)} />
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
