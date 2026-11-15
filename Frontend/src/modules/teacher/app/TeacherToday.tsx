/** Teacher "Today": my periods + things waiting on me, split by hat. */
import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { academicsService } from '../../../services/academicsService';
import { marksService } from '../../../services/marksService';
import { leaveService } from '../../../services/leaveService';
import { attendanceService } from '../../../services/attendanceService';
import { hallTicketService } from '../../../services/hallTicketService';
import { substitutionService } from '../../../services/substitutionService';
import { EmptyState, LoadingBlock, Panel, Pill, Section } from '../../../components/common/States';
import { formatDate, isoWeekday, todayISO } from '../../../utils/date';

interface Task {
  to: string;
  title: string;
  detail: string;
  tone: 'warning' | 'info' | 'danger';
}

export const TeacherToday: React.FC = () => {
  const scope = useScope();
  const a = useQuery(() => academicsService.getTeacherAssignments(scope), [scope.schoolId, scope.userId]);
  const sheets = useQuery(() => marksService.listMySheets(scope), [scope.schoolId, scope.userId]);
  const periods = useQuery(() => academicsService.getMyPeriods(scope, isoWeekday()), [scope.schoolId, scope.userId]);
  const duties = useQuery(() => substitutionService.myDuties(scope), [scope.schoolId, scope.userId]);
  const ct = a.data?.classTeacherOf ?? null;
  const today = todayISO();
  const ctKey = [scope.schoolId, ct?.id];
  const leaves = useQuery(() => (ct ? leaveService.listForClass(scope, ct.id) : Promise.resolve({ ok: true as const, data: [] })), ctKey);
  const morning = useQuery(() => (ct ? attendanceService.getRegister(scope, ct.id, today, 'MORNING') : Promise.resolve({ ok: true as const, data: null })), ctKey);
  const review = useQuery(
    () => (ct ? marksService.openAssessments(scope, ct.grade).then(r => (r.ok && r.data[0] ? marksService.listClassSheets(scope, r.data[0].id, ct.id) : { ok: true as const, data: [] })) : Promise.resolve({ ok: true as const, data: [] })),
    ctKey
  );
  const tickets = useQuery(() => (ct ? hallTicketService.listForClass(scope, ct.id) : Promise.resolve({ ok: true as const, data: [] })), ctKey);

  if (a.status === 'loading') return <LoadingBlock />;

  const myPeriods = (periods.data ?? []).map(s => ({ ...s, cls: s.classLabel }));

  const teachingTasks: Task[] = (sheets.data ?? [])
    .filter(s => s.sheet.status !== 'SUBMITTED' && s.sheet.status !== 'ACCEPTED')
    .map(s => ({
      to: `/teacher/marks?sheet=${encodeURIComponent(s.sheet.id)}`,
      title: `${s.assessment.name} marks · ${s.sheet.subject} ${s.classSection.grade}-${s.classSection.section}`,
      detail: s.sheet.status === 'RETURNED' ? `Returned: ${s.sheet.returnReason}` : `${s.entered}/${s.total} entered`,
      tone: s.sheet.status === 'RETURNED' ? 'danger' : 'warning'
    }));

  const ctTasks: Task[] = [];
  if (ct) {
    if (morning.data && !morning.data.saved && new Date().getDay() !== 0) ctTasks.push({ to: '/teacher/attendance', title: 'Morning attendance not taken', detail: `Class ${ct.grade}-${ct.section}`, tone: 'warning' });
    const pl = (leaves.data ?? []).filter(l => l.status === 'PENDING');
    if (pl.length) ctTasks.push({ to: '/teacher/leave-requests', title: `${pl.length} leave request(s) to review`, detail: pl.map(l => l.studentName).join(', '), tone: 'warning' });
    const toReview = (review.data ?? []).filter(s => s.sheet.status === 'SUBMITTED');
    if (toReview.length) ctTasks.push({ to: '/teacher/class-results', title: `${toReview.length} subject(s) submitted for your review`, detail: toReview.map(s => s.sheet.subject).join(', '), tone: 'info' });
    const toRelease = (tickets.data ?? []).filter(t => t.feeClearance === 'CLEARED' && !t.release);
    if (toRelease.length) ctTasks.push({ to: '/teacher/hall-tickets', title: `${toRelease.length} hall ticket(s) ready to release`, detail: 'Fee cleared, waiting for you', tone: 'info' });
  }

  const tone = { warning: 'border-amber-300 bg-amber-50', info: 'border-blue-200 bg-white', danger: 'border-rose-300 bg-rose-50' };
  const TaskList: React.FC<{ tasks: Task[]; empty: string }> = ({ tasks, empty }) =>
    tasks.length === 0 ? (
      <EmptyState title={empty} />
    ) : (
      <ul className="space-y-2">
        {tasks.map(t => (
          <li key={t.to + t.title}>
            <Link to={t.to} className={`flex items-center gap-3 p-3.5 rounded-2xl border ${tone[t.tone]}`}>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold">{t.title}</span>
                <span className="block text-sm text-slate-600 truncate">{t.detail}</span>
              </span>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </Link>
          </li>
        ))}
      </ul>
    );

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-xl font-bold">Today</h1>
      <Section title="My periods">
        {myPeriods.length === 0 ? (
          <EmptyState title="No periods today" />
        ) : (
          <Panel className="divide-y divide-slate-100">
            {myPeriods.map(p => (
              <div key={p.cls + p.period} className="flex items-center gap-3 px-3.5 py-2.5">
                <span className="w-24 text-sm font-mono text-slate-500">{p.start}–{p.end}</span>
                <span className="flex-1 font-semibold">{p.subject}</span>
                <Pill tone="neutral">Class {p.cls}</Pill>
              </div>
            ))}
          </Panel>
        )}
      </Section>
      {(duties.data ?? []).length > 0 && (
        <Section title="Substitution duty">
          <Panel className="divide-y divide-slate-100 border-amber-300">
            {duties.data!.map(d => (
              <div key={d.date + d.classSectionId + d.period} className="flex items-center gap-3 px-3.5 py-2.5">
                <span className="w-28 text-sm text-slate-500">{d.date === today ? 'Today' : formatDate(d.date)} · P{d.period}</span>
                <span className="flex-1 font-semibold">{d.subject}</span>
                <Pill tone="warning">Class {d.classLabel}</Pill>
              </div>
            ))}
          </Panel>
        </Section>
      )}
      <Section title="My teaching">
        {sheets.status === 'loading' ? <LoadingBlock lines={1} /> : <TaskList tasks={teachingTasks} empty="No marks waiting on you" />}
      </Section>
      {ct && (
        <Section title={`My class (${ct.grade}-${ct.section})`}>
          <TaskList tasks={ctTasks} empty="Nothing waiting for the class teacher" />
        </Section>
      )}
    </div>
  );
};
