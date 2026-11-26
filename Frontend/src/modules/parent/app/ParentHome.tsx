/**
 * Parent Home, laid out like a modern school app (blue header from ParentShell above):
 *   1. Quick cards (swipe): homework, fee payment, hall ticket, apply leave. A dot marks what needs action.
 *   2. "Needs your attention": emergency notices, overdue/due fees, overdue homework, meetings,
 *      consent, hall tickets (action-first, unchanged rules).
 *   3. A 2-column grid of tiles, each with a live status line (attendance %, notices, results...).
 *   4. Notice board: the latest notice on a dark-blue card.
 * Every number shown comes from the child's real data; nothing is a placeholder.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertOctagon, BookOpenCheck, Bus, CalendarCheck, CalendarClock, CalendarPlus, ClipboardCheck, Clock,
  FileCheck2, IndianRupee, NotebookPen, ShieldCheck, Ticket, Trophy
} from 'lucide-react';
import { NoticeBoardCard, QuickCard } from '../../../components/common/HomeCards';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { feeService } from '../../../services/feeService';
import { academicsService } from '../../../services/academicsService';
import { communicationService } from '../../../services/communicationService';
import { hallTicketService } from '../../../services/hallTicketService';
import { ErrorState, LoadingBlock } from '../../../components/common/States';
import { daysBetween, formatDate, formatINR, isoWeekday, todayISO } from '../../../utils/date';

type Tone = 'danger' | 'warning' | 'info';
interface Action {
  id: string;
  tone: Tone;
  icon: React.ReactNode;
  title: string;
  detail: string;
  to: string;
  cta: string;
}

const toneClass: Record<Tone, string> = {
  danger: 'border-rose-200 bg-rose-50',
  warning: 'border-amber-200 bg-amber-50',
  info: 'border-blue-100 bg-white'
};
const iconClass: Record<Tone, string> = {
  danger: 'bg-rose-600 text-white',
  warning: 'bg-orange-500 text-white',
  info: 'bg-blue-700 text-white'
};

/** A grid tile: icon + title + a real status line. */
const Tile: React.FC<{ to: string; icon: React.ReactNode; tint: string; title: string; status: string }> = ({ to, icon, tint, title, status }) => (
  <Link to={to} className="lift rounded-3xl bg-white border border-slate-200/80 shadow-card p-4 flex flex-col gap-2.5 min-h-28 hover:border-blue-200">
    <span className="flex items-center gap-2">
      <span className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center ${tint}`}>{icon}</span>
      <span className="text-sm font-bold text-slate-900 leading-tight">{title}</span>
    </span>
    <span className="text-xs text-slate-500 leading-snug">{status}</span>
  </Link>
);

export const ParentHome: React.FC = () => {
  const { t, i18n } = useTranslation();
  const scope = useScope();
  const key = [scope.schoolId, scope.studentId];
  const live = { refreshOnDataChange: true, refreshIntervalMs: 60_000 };
  const fees = useQuery(() => feeService.getSummary(scope), key, live);
  const homework = useQuery(() => academicsService.getHomework(scope), key, live);
  const timetable = useQuery(() => academicsService.getTimetable(scope), key, live);
  const notices = useQuery(() => communicationService.getNotices(scope), key, live);
  const consents = useQuery(() => communicationService.getConsents(scope), key, live);
  const meetings = useQuery(() => communicationService.getMeetings(scope), key, live);
  const tickets = useQuery(() => hallTicketService.getForStudent(scope), key, live);
  const attendance = useQuery(() => academicsService.getAttendance(scope, 30), key, live);
  const results = useQuery(() => academicsService.getPublishedResults(scope), key, live);

  const core = [fees, homework, notices, consents, meetings, tickets];
  const loading = core.some(q => q.status === 'loading');
  const failed = core.find(q => q.status === 'error');
  const lang = i18n.language;
  const today = todayISO();
  const [showAll, setShowAll] = useState(false);

  if (loading) return <div className="pt-2"><LoadingBlock lines={4} /></div>;
  if (failed) return <ErrorState message={failed.error ?? ''} onRetry={() => core.forEach(q => q.reload())} />;

  // ---------------------------------------------------------------- needs attention (unchanged rules)
  const actions: Action[] = [];
  notices.data
    ?.filter(n => n.priority === 'EMERGENCY')
    .forEach(n => actions.push({ id: n.id, tone: 'danger', icon: <AlertOctagon className="w-5 h-5" />, title: n.title, detail: n.body, to: '/parent/notices', cta: t('parent.home.view') }));
  const f = fees.data;
  if (f && f.overdueAmount > 0) {
    actions.push({
      id: 'fee-overdue', tone: 'danger', icon: <IndianRupee className="w-5 h-5" />,
      title: t('parent.home.feeOverdue', { amount: formatINR(f.overdueAmount) }),
      detail: t('parent.home.feeOverdueHelp'), to: '/parent/fees', cta: t('parent.home.payNow')
    });
  } else if (f?.nextDue && daysBetween(today, f.nextDue.instalment.dueOn) <= 14) {
    actions.push({
      id: 'fee-due', tone: 'warning', icon: <IndianRupee className="w-5 h-5" />,
      title: t('parent.home.feeDue', { amount: formatINR(f.nextDue.amount) }),
      detail: t('parent.home.feeDueHelp', { label: f.nextDue.instalment.label, date: formatDate(f.nextDue.instalment.dueOn, lang) }),
      to: '/parent/fees', cta: t('parent.home.payNow')
    });
  }
  const overdueHw = homework.data?.filter(h => h.overdue) ?? [];
  if (overdueHw.length) {
    actions.push({
      id: 'hw', tone: 'warning', icon: <NotebookPen className="w-5 h-5" />,
      title: t('parent.home.homeworkOverdue', { count: overdueHw.length }),
      detail: overdueHw.map(h => `${h.subject}: ${h.title}`).join(' · '), to: '/parent/academics?tab=homework', cta: t('parent.home.view')
    });
  }
  meetings.data
    ?.filter(m => m.status === 'CONFIRMED' && daysBetween(today, m.at.slice(0, 10)) <= 1 && m.at >= new Date().toISOString())
    .forEach(m =>
      actions.push({
        id: m.id, tone: 'info', icon: <CalendarClock className="w-5 h-5" />,
        title: t('parent.home.meeting', { teacher: m.teacherName }),
        detail: `${new Date(m.at).toLocaleString(lang === 'te' ? 'te-IN' : 'en-IN', { weekday: 'short', hour: 'numeric', minute: '2-digit' })} · ${m.purpose}`,
        to: '/parent/meetings', cta: t('parent.home.view')
      })
    );
  consents.data
    ?.filter(c => !c.response && !c.expired)
    .forEach(c =>
      actions.push({
        id: c.id, tone: 'warning', icon: <ClipboardCheck className="w-5 h-5" />,
        title: t('parent.home.consent'), detail: `${c.title} · ${t('parent.home.dueBy', { date: formatDate(c.dueOn, lang) })}`,
        to: '/parent/consent', cta: t('parent.home.respond')
      })
    );
  tickets.data?.forEach(h => {
    if (h.available) {
      actions.push({ id: 'ht-' + h.exam.id, tone: 'info', icon: <FileCheck2 className="w-5 h-5" />, title: t('parent.home.hallTicketReady', { exam: h.exam.name }), detail: h.hallTicketNo ?? '', to: '/parent/academics?tab=exams', cta: t('parent.home.view') });
    } else if (h.feeClearance === 'PENDING') {
      actions.push({ id: 'ht-' + h.exam.id, tone: 'warning', icon: <FileCheck2 className="w-5 h-5" />, title: t('parent.home.hallTicketBlocked', { exam: h.exam.name }), detail: h.pendingReasons.join(' · '), to: '/parent/fees', cta: t('parent.home.payNow') });
    }
  });

  // ---------------------------------------------------------------- quick cards (real statuses)
  const pendingHw = homework.data?.filter(h => h.status === 'PENDING').length ?? 0;
  const feeStatus = f && f.overdueAmount > 0
    ? t('parent.ui.feeOverdue', { amount: formatINR(f.overdueAmount) })
    : f?.nextDue ? t('parent.ui.feeDue', { amount: formatINR(f.nextDue.amount) }) : t('parent.ui.feeNone');
  const nextTicket = tickets.data?.[0];
  const ticketStatus = !nextTicket ? t('parent.ui.htNone')
    : nextTicket.available ? `${nextTicket.exam.name}: ${t('parent.ui.htReady')}` : `${nextTicket.exam.name}: ${t('parent.ui.htOnHold')}`;

  // ---------------------------------------------------------------- tiles (real statuses)
  const att = attendance.data;
  const attendanceStatus = attendance.status !== 'ready' ? '…'
    : att && att.workingSessions > 0 ? t('parent.ui.attendancePct', { pct: att.percentage }) : t('parent.ui.attendanceNone');
  const resultsStatus = results.status !== 'ready' ? '…'
    : results.data.length ? t('parent.ui.resultsCount', { count: results.data.length }) : t('parent.ui.resultsNone');
  const todaySlots = (timetable.data ?? []).filter(s => s.day === isoWeekday());
  const latest = [...(notices.data ?? [])].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0];

  return (
    <div className="space-y-6">
      {/* 1. Notice board shifted to the very top */}
      <NoticeBoardCard
        className="-mt-6 relative z-10"
        to="/parent/notices"
        heading={t('parent.ui.noticeBoard')}
        viewAll={t('parent.ui.viewAll')}
        emptyText={t('parent.ui.noticesNone')}
        latest={latest ? { title: latest.title, body: latest.body, date: formatDate(latest.publishedAt.slice(0, 10), lang) } : null}
      />

      {/* 2. Quick cards: 2x2 grid on mobile/tablet, 4-col on desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 relative z-10">
        <QuickCard to="/parent/academics?tab=homework" icon={<BookOpenCheck className="w-6 h-6" />} tint="bg-blue-50 text-blue-700"
          title={t('parent.ui.homework')} status={pendingHw ? t('parent.ui.homeworkPending', { count: pendingHw }) : t('parent.ui.homeworkDone')} alert={overdueHw.length > 0} fill />
        <QuickCard to="/parent/fees" icon={<IndianRupee className="w-6 h-6" />} tint="bg-indigo-50 text-indigo-700"
          title={t('parent.ui.feePayment')} status={feeStatus} alert={Boolean(f && f.overdueAmount > 0)} fill />
        <QuickCard to="/parent/academics?tab=exams" icon={<Ticket className="w-6 h-6" />} tint="bg-sky-50 text-sky-700"
          title={t('parent.ui.hallTicket')} status={ticketStatus} alert={Boolean(nextTicket && !nextTicket.available && nextTicket.feeClearance === 'PENDING')} fill />
        <QuickCard to="/parent/attendance" icon={<CalendarCheck className="w-6 h-6" />} tint="bg-emerald-50 text-emerald-700"
          title={t('parent.ui.attendance')} status={attendanceStatus} fill />
      </div>

      {/* 3. Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Tile to="/parent/meetings" icon={<CalendarClock className="w-5 h-5" />} tint="bg-blue-50 text-blue-700" title={t('parent.more.meetings')}
          status={t('parent.ui.meetingsHint')} />
        <Tile to="/parent/pickup" icon={<ShieldCheck className="w-5 h-5" />} tint="bg-violet-50 text-violet-700" title={t('parent.more.pickup')} status={t('parent.ui.pickupHint')} />
        <Tile to="/parent/academics?tab=exams" icon={<Trophy className="w-5 h-5" />} tint="bg-amber-50 text-amber-700" title={t('parent.ui.results')} status={resultsStatus} />
        <Tile to="/parent/leave" icon={<CalendarPlus className="w-5 h-5" />} tint="bg-emerald-50 text-emerald-700" title={t('parent.ui.applyLeave')} status={t('parent.ui.applyLeaveHint')} />
        <Tile to="/parent/academics?tab=timetable" icon={<Clock className="w-5 h-5" />} tint="bg-sky-50 text-sky-700" title={t('parent.ui.timetable')}
          status={todaySlots.length ? t('parent.ui.periodsToday', { count: todaySlots.length }) : t('parent.ui.noPeriodsToday')} />
        <Tile to="/parent/transport" icon={<Bus className="w-5 h-5" />} tint="bg-orange-50 text-orange-700" title={t('parent.ui.transport')} status={t('parent.ui.transportHint')} />
      </div>

    </div>
  );
};
