/**
 * Teacher "Today", laid out like the Parent home:
 *   1. Quick cards with live counts (an orange dot marks what needs action):
 *      Homework, Messages from parents, and for Class Teachers: Leave requests, Hall ticket.
 *   2. The red Notice board banner with the latest notice.
 *   3. My periods and Substitution duty.
 */
import React from 'react';
import { BookOpenCheck, DoorOpen, MessageSquare, ShieldCheck, UserCheck } from 'lucide-react';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { useReloadOnDataChange } from '../../../hooks/useReloadOnDataChange';
import { academicsService } from '../../../services/academicsService';
import { leaveService } from '../../../services/leaveService';
import { hallTicketService } from '../../../services/hallTicketService';
import { substitutionService } from '../../../services/substitutionService';
import { teacherCommsService } from '../../../services/teacherCommsService';
import { communicationService } from '../../../services/communicationService';
import { waitingThreads } from '../../../services/teacherAlertsService';
import { EmptyState, LoadingBlock, Panel, Pill, Section } from '../../../components/common/States';
import { NoticeBoardCard, QuickCard } from '../../../components/common/HomeCards';
import { formatDate, isoWeekday, todayISO } from '../../../utils/date';

export const TeacherToday: React.FC = () => {
  const scope = useScope();
  const mine = [scope.schoolId, scope.userId];
  const a = useQuery(() => academicsService.getTeacherAssignments(scope), mine);
  const periods = useQuery(() => academicsService.getMyPeriods(scope, isoWeekday()), mine);
  const duties = useQuery(() => substitutionService.myDuties(scope), mine);
  const homework = useQuery(() => teacherCommsService.myHomework(scope), mine);
  const inbox = useQuery(() => teacherCommsService.inbox(scope), mine);
  const notices = useQuery(() => communicationService.getNotices(scope), mine);
  const ct = a.data?.classTeacherOf ?? null;
  const today = todayISO();
  const ctKey = [scope.schoolId, ct?.id];
  const leaves = useQuery(() => (ct ? leaveService.listForClass(scope, ct.id) : Promise.resolve({ ok: true as const, data: [] })), ctKey);
  const tickets = useQuery(() => (ct ? hallTicketService.listForClass(scope, ct.id) : Promise.resolve({ ok: true as const, data: [] })), ctKey);

  useReloadOnDataChange(homework.reload, inbox.reload, notices.reload, leaves.reload, tickets.reload);
  if (a.status === 'loading') return <LoadingBlock />;

  const myPeriods = (periods.data ?? []).map(s => ({ ...s, cls: s.classLabel }));

  // ---- live counts for the quick cards ('…' while a count is still loading)
  const hw = homework.data ?? [];
  const toCheck = hw.reduce((n, h) => n + h.students.filter(s => s.status === 'SUBMITTED').length, 0);
  const activeHw = hw.filter(h => h.dueOn >= today).length;
  const hwStatus = homework.status !== 'ready' ? '…' : toCheck > 0 ? `${toCheck} to check` : activeHw > 0 ? `${activeHw} active` : 'None active';

  const waiting = waitingThreads(inbox.data ?? []).length;
  const msgStatus = inbox.status !== 'ready' ? '…' : waiting > 0 ? `${waiting} waiting for reply` : 'All replied';

  const pendingLeave = (leaves.data ?? []).filter(l => l.status === 'PENDING').length;
  const leaveStatus = leaves.status !== 'ready' ? '…' : pendingLeave > 0 ? `${pendingLeave} pending` : 'None pending';

  const toRelease = (tickets.data ?? []).filter(t => t.feeClearance === 'CLEARED' && !t.release).length;
  const ticketStatus = tickets.status !== 'ready' ? '…' : toRelease > 0 ? `${toRelease} ready to release` : 'Nothing to release';

  const latest = [...(notices.data ?? [])].sort((x, y) => Date.parse(y.publishedAt) - Date.parse(x.publishedAt))[0];

  return (
    <div className="space-y-6 max-w-3xl xl:max-w-6xl">
      <h1 className="text-xl font-bold">Today</h1>

      {/* 1. Quick cards in a 2×2 grid (same as the Principal and Admin homes). */}
      <div className="grid grid-cols-2 gap-3">
        <QuickCard fill to="/teacher/homework" icon={<BookOpenCheck className="w-6 h-6" />} tint="bg-blue-50 text-blue-700" title="Homework" status={hwStatus} alert={toCheck > 0} />
        <QuickCard fill to="/teacher/messages" icon={<MessageSquare className="w-6 h-6" />} tint="bg-indigo-50 text-indigo-700" title="Messages from parents" status={msgStatus} alert={waiting > 0} />
        {ct && (
          <>
            <QuickCard fill to="/teacher/leave-requests" icon={<UserCheck className="w-6 h-6" />} tint="bg-emerald-50 text-emerald-700" title="Leave requests" status={leaveStatus} alert={pendingLeave > 0} />
            <QuickCard fill to="/teacher/hall-tickets" icon={<ShieldCheck className="w-6 h-6" />} tint="bg-sky-50 text-sky-700" title="Hall ticket" status={ticketStatus} alert={toRelease > 0} />
            <QuickCard fill to="/teacher/gate" icon={<DoorOpen className="w-6 h-6" />} tint="bg-amber-50 text-amber-700" title="Pickup gate check" status="Check a pickup pass" />
          </>
        )}
      </div>

      {/* 2. Notice board */}
      <NoticeBoardCard
        to="/teacher/notices"
        heading="Notice board"
        viewAll="View all"
        emptyText="No notices yet"
        latest={latest ? { title: latest.title, body: latest.body, date: formatDate(latest.publishedAt.slice(0, 10)), priority: latest.priority } : null}
      />

      {/* 3. Periods and substitution */}
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
    </div>
  );
};
