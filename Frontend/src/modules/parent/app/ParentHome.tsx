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
  AlertOctagon, BookOpenCheck, Bus, CalendarCheck, CalendarClock, CalendarPlus, ChevronRight, ClipboardCheck, Clock,
  FileCheck2, IndianRupee, Megaphone, MessageSquare, NotebookPen, Ticket, Trophy
} from 'lucide-react';
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

/** One swipeable quick card. `alert` shows the orange dot from the reference design. */
const QuickCard: React.FC<{ to: string; icon: React.ReactNode; tint: string; title: string; status: string; alert?: boolean }> = ({ to, icon, tint, title, status, alert }) => (
  <Link to={to} className="lift snap-start shrink-0 w-40 rounded-3xl bg-white shadow-card border border-slate-100 p-4 relative">
    {alert && <span className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-orange-500" aria-hidden="true" />}
    <span className={`w-11 h-11 rounded-xl flex items-center justify-center ${tint}`}>{icon}</span>
    <span className="block mt-3 text-sm font-bold text-slate-900">{title}</span>
    <span className={`block text-xs mt-0.5 ${alert ? 'text-orange-600 font-semibold' : 'text-slate-500'}`}>{status}</span>
  </Link>
);

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
  const fees = useQuery(() => feeService.getSummary(scope), key);
  const homework = useQuery(() => academicsService.getHomework(scope), key);
  const timetable = useQuery(() => academicsService.getTimetable(scope), key);
  const notices = useQuery(() => communicationService.getNotices(scope), key);
  const consents = useQuery(() => communicationService.getConsents(scope), key);
  const meetings = useQuery(() => communicationService.getMeetings(scope), key);
  const tickets = useQuery(() => hallTicketService.getForStudent(scope), key);
  const attendance = useQuery(() => academicsService.getAttendance(scope, 30), key);
  const results = useQuery(() => academicsService.getPublishedResults(scope), key);

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
      {/* 1. Quick cards: overlap the header wave a little, like the reference */}
      <div className="-mt-6 -mx-4 px-4 flex gap-3 overflow-x-auto no-scrollbar snap-x pb-1 relative z-10">
        <QuickCard to="/parent/academics?tab=homework" icon={<BookOpenCheck className="w-6 h-6" />} tint="bg-blue-50 text-blue-700"
          title={t('parent.ui.homework')} status={pendingHw ? t('parent.ui.homeworkPending', { count: pendingHw }) : t('parent.ui.homeworkDone')} alert={overdueHw.length > 0} />
        <QuickCard to="/parent/fees" icon={<IndianRupee className="w-6 h-6" />} tint="bg-indigo-50 text-indigo-700"
          title={t('parent.ui.feePayment')} status={feeStatus} alert={Boolean(f && f.overdueAmount > 0)} />
        <QuickCard to="/parent/academics?tab=exams" icon={<Ticket className="w-6 h-6" />} tint="bg-sky-50 text-sky-700"
          title={t('parent.ui.hallTicket')} status={ticketStatus} alert={Boolean(nextTicket && !nextTicket.available && nextTicket.feeClearance === 'PENDING')} />
        <QuickCard to="/parent/leave" icon={<CalendarPlus className="w-6 h-6" />} tint="bg-emerald-50 text-emerald-700"
          title={t('parent.ui.applyLeave')} status={t('parent.ui.applyLeaveHint')} />
      </div>

      {/* 2. Needs attention */}
      {actions.length > 0 && (
        <section>
          <h2 className="text-lg font-extrabold tracking-tight mb-2.5">{t('parent.home.needsAttention')}</h2>
          <ul className="space-y-2.5">
            {(showAll ? actions : actions.slice(0, 3)).map(a => (
              <li key={a.id}>
                <Link to={a.to} className={`flex gap-3 p-3.5 rounded-2xl border ${toneClass[a.tone]} active:scale-[0.99] transition`}>
                  <span className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${iconClass[a.tone]}`}>{a.icon}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-base font-semibold text-slate-900">{a.title}</span>
                    <span className="block text-sm text-slate-600 line-clamp-2">{a.detail}</span>
                  </span>
                  <span className="self-center text-sm font-semibold text-blue-700 flex items-center shrink-0">
                    {a.cta} <ChevronRight className="w-4 h-4" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {actions.length > 3 && (
            <button type="button" onClick={() => setShowAll(v => !v)} className="mt-2 w-full min-h-11 rounded-xl text-sm font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100">
              {showAll ? t('parent.ui.showLess') : t('parent.ui.showMore', { count: actions.length - 3 })}
            </button>
          )}
        </section>
      )}

      {/* 3. Tiles */}
      <div className="grid grid-cols-2 gap-3">
        <Tile to="/parent/notices" icon={<Megaphone className="w-5 h-5" />} tint="bg-blue-50 text-blue-700" title={t('parent.ui.notices')}
          status={notices.data?.length ? t('parent.ui.noticesCount', { count: notices.data.length }) : t('parent.ui.noticesNone')} />
        <Tile to="/parent/attendance" icon={<CalendarCheck className="w-5 h-5" />} tint="bg-emerald-50 text-emerald-700" title={t('parent.ui.attendance')} status={attendanceStatus} />
        <Tile to="/parent/academics?tab=exams" icon={<Trophy className="w-5 h-5" />} tint="bg-amber-50 text-amber-700" title={t('parent.ui.results')} status={resultsStatus} />
        <Tile to="/parent/messages" icon={<MessageSquare className="w-5 h-5" />} tint="bg-indigo-50 text-indigo-700" title={t('parent.ui.messages')} status={t('parent.ui.messagesHint')} />
        <Tile to="/parent/academics?tab=timetable" icon={<Clock className="w-5 h-5" />} tint="bg-sky-50 text-sky-700" title={t('parent.ui.timetable')}
          status={todaySlots.length ? t('parent.ui.periodsToday', { count: todaySlots.length }) : t('parent.ui.noPeriodsToday')} />
        <Tile to="/parent/transport" icon={<Bus className="w-5 h-5" />} tint="bg-orange-50 text-orange-700" title={t('parent.ui.transport')} status={t('parent.ui.transportHint')} />
      </div>

      {/* 4. Notice board */}
      <Link to="/parent/notices" className="lift block rounded-3xl bg-gradient-to-br from-slate-950 via-blue-950 to-blue-800 text-white p-5 shadow-float">
        <span className="flex items-center justify-between">
          <span className="font-bold">{t('parent.ui.noticeBoard')}</span>
          <span className="text-sm text-blue-200 flex items-center">{t('parent.ui.viewAll')} <ChevronRight className="w-4 h-4" /></span>
        </span>
        {latest ? (
          <span className="block mt-2">
            <span className="block text-sm font-semibold">{latest.title}</span>
            <span className="block text-sm text-blue-100 line-clamp-2 mt-0.5">{latest.body}</span>
            <span className="block text-xs text-blue-300 mt-1.5">{formatDate(latest.publishedAt.slice(0, 10), lang)}</span>
          </span>
        ) : (
          <span className="block mt-2 text-sm text-blue-100">{t('parent.ui.noticesNone')}</span>
        )}
      </Link>
    </div>
  );
};
