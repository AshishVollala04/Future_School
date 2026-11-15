/**
 * Parent attendance: a month calendar with a coloured circle per school day.
 *   green = present (both sessions), red = absent (no session present), amber = half day,
 *   sky = leave, grey = not marked yet. The month's attendance % is from marked sessions only.
 * Below: upcoming events (the child's exams and confirmed teacher meetings), from real data.
 */
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { academicsService } from '../../../services/academicsService';
import { hallTicketService } from '../../../services/hallTicketService';
import { communicationService } from '../../../services/communicationService';
import { ErrorState, LoadingBlock } from '../../../components/common/States';
import { useAuth } from '../../../context/AuthContext';
import { AttendanceDay } from '../../../types/domain';
import { todayISO } from '../../../utils/date';

type DayKind = 'present' | 'absent' | 'half' | 'leave' | 'none';

function kindOf(d: AttendanceDay | undefined): DayKind {
  if (!d) return 'none';
  const s = [d.morning, d.afternoon];
  const p = s.filter(x => x === 'P').length;
  if (p === 2) return 'present';
  if (s.includes('L') && p === 0 && !s.includes('A')) return 'leave';
  if (p === 1) return 'half';
  if (s.includes('A')) return 'absent';
  return 'none';
}

const circle: Record<DayKind, string> = {
  present: 'bg-emerald-500 text-white',
  absent: 'bg-rose-500 text-white',
  half: 'bg-amber-400 text-white',
  leave: 'bg-sky-400 text-white',
  none: 'bg-slate-100 text-slate-500'
};

const pad = (n: number) => String(n).padStart(2, '0');
const locale = (lang: string) => (lang === 'te' ? 'te-IN' : 'en-IN');

/** The calendar card. Used on its own page and in Academics > Attendance. */
export const AttendanceCalendar: React.FC = () => {
  const { t, i18n } = useTranslation();
  const scope = useScope();
  const { currentUser } = useAuth();
  const q = useQuery(() => academicsService.getAttendance(scope, 190), [scope.schoolId, scope.studentId]);
  const today = todayISO();
  const [month, setMonth] = useState(today.slice(0, 7)); // YYYY-MM

  const byDate = useMemo(() => new Map((q.data?.days ?? []).map(d => [d.date, d])), [q.data]);
  if (q.status === 'loading') return <LoadingBlock />;
  if (q.status === 'error') return <ErrorState message={q.error} onRetry={q.reload} />;

  const earliest = q.data.days.length ? q.data.days[0].date.slice(0, 7) : today.slice(0, 7);
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const lead = first.getDay(); // Sunday-first, as in the reference design
  const shift = (delta: number) => {
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  };

  // This month's % from marked sessions only (a day not marked yet is not an absence).
  let marked = 0, present = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const d = byDate.get(`${month}-${pad(day)}`);
    if (!d) continue;
    for (const s of [d.morning, d.afternoon]) {
      if (s === '-') continue;
      marked++;
      if (s === 'P') present++;
    }
  }
  const pct = marked ? Math.round((present / marked) * 1000) / 10 : null;
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2023, 0, 1 + i).toLocaleDateString(locale(i18n.language), { weekday: 'narrow' }));
  const child = currentUser?.activeChild;

  return (
    <div className="rounded-3xl bg-white shadow-card border border-slate-200/80 overflow-hidden">
      <div className="hero-glow text-white px-4 py-4 flex items-center gap-3">
        {child && <img src={child.avatar} alt="" className="w-11 h-11 rounded-full bg-white ring-2 ring-white/60" />}
        <span className="flex-1 min-w-0">
          <span className="block text-xs text-blue-100">{t('parent.ui.averageAttendance')}</span>
          <span className="block font-semibold truncate">{child?.name}</span>
        </span>
        <span className="text-3xl font-bold">{pct === null ? '—' : `${pct}%`}</span>
      </div>

      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <button type="button" onClick={() => shift(-1)} disabled={month <= earliest} aria-label={t('parent.ui.prevMonth')}
            className="w-10 h-10 rounded-full flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-30">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="font-bold flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-blue-700" />
            {first.toLocaleDateString(locale(i18n.language), { month: 'long', year: 'numeric' })}
          </span>
          <button type="button" onClick={() => shift(1)} disabled={month >= today.slice(0, 7)} aria-label={t('parent.ui.nextMonth')}
            className="w-10 h-10 rounded-full flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-30">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        {pct === null && <p className="text-center text-sm text-slate-500 mb-2">{t('parent.ui.notMarkedMonth')}</p>}

        <div className="grid grid-cols-7 gap-y-2 text-center">
          {weekdays.map((w, i) => (
            <span key={i} className="text-xs font-semibold text-slate-400 pb-1">{w}</span>
          ))}
          {Array.from({ length: lead }, (_, i) => <span key={'lead' + i} />)}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const date = `${month}-${pad(i + 1)}`;
            const kind = date > today ? 'none' : kindOf(byDate.get(date));
            const future = date > today;
            const label = t(`parent.ui.${{ present: 'present', absent: 'absent', half: 'halfDay', leave: 'leave', none: 'notMarked' }[kind]}`);
            return (
              <span key={date} className="flex justify-center">
                <span
                  title={t('parent.ui.dayStatus', { date, status: label })}
                  aria-label={t('parent.ui.dayStatus', { date, status: label })}
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold ${future ? 'text-slate-300' : circle[kind]} ${
                    date === today ? 'ring-2 ring-blue-600 ring-offset-2' : ''
                  }`}
                >
                  {i + 1}
                </span>
              </span>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-600">
          {(['present', 'absent', 'half', 'leave', 'none'] as DayKind[]).map(k => (
            <span key={k} className="flex items-center gap-1.5">
              <span className={`w-3 h-3 rounded-full ${circle[k].split(' ')[0]}`} />
              {t(`parent.ui.${{ present: 'present', absent: 'absent', half: 'halfDay', leave: 'leave', none: 'notMarked' }[k]}`)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

/** Exams for the child and confirmed meetings, soonest first. */
export const UpcomingEvents: React.FC = () => {
  const { t, i18n } = useTranslation();
  const scope = useScope();
  const key = [scope.schoolId, scope.studentId];
  const exams = useQuery(() => hallTicketService.getForStudent(scope), key);
  const meetings = useQuery(() => communicationService.getMeetings(scope), key);
  if (exams.status === 'loading' || meetings.status === 'loading') return <LoadingBlock lines={1} />;
  const today = todayISO();
  const events = [
    ...(exams.data ?? []).filter(h => h.exam.startsOn >= today).map(h => ({ id: h.exam.id, date: h.exam.startsOn, title: h.exam.name, sub: t('parent.ui.exam'), to: '/parent/academics?tab=exams' })),
    ...(meetings.data ?? []).filter(m => m.status === 'CONFIRMED' && m.at.slice(0, 10) >= today)
      .map(m => ({ id: m.id, date: m.at.slice(0, 10), title: t('parent.ui.meetingWith', { teacher: m.teacherName }), sub: m.purpose, to: '/parent/meetings' }))
  ].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <section>
      <h2 className="text-lg font-extrabold tracking-tight mb-2.5">{t('parent.ui.upcomingEvents')}</h2>
      {events.length === 0 ? (
        <p className="text-sm text-slate-500 rounded-2xl bg-white border border-slate-200 p-4">{t('parent.ui.noEvents')}</p>
      ) : (
        <div className="-mx-4 px-4 flex gap-3 overflow-x-auto no-scrollbar snap-x">
          {events.map(e => {
            const d = new Date(e.date + 'T00:00:00');
            return (
              <Link key={e.id} to={e.to} className="snap-start shrink-0 w-64 rounded-2xl bg-white border border-slate-200 shadow-sm p-3 flex items-center gap-3">
                <span className="w-12 h-12 shrink-0 rounded-xl bg-blue-700 text-white flex flex-col items-center justify-center leading-none">
                  <span className="text-lg font-bold">{d.getDate()}</span>
                  <span className="text-[10px] uppercase">{d.toLocaleDateString(locale(i18n.language), { month: 'short' })}</span>
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold truncate">{e.title}</span>
                  <span className="block text-xs text-slate-500 truncate">{e.sub}</span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
};

export const ParentAttendancePage: React.FC = () => (
  <div className="space-y-5 pt-2">
    <AttendanceCalendar />
    <UpcomingEvents />
  </div>
);
