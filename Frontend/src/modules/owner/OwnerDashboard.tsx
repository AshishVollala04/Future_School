/**
 * Owner's dashboard: today's fees and attendance, per branch and in total.
 * Every number is counted from recorded payments, charges and registers on the server.
 * Simulated (test) payments are shown apart and never added to real money.
 */
import React from 'react';
import { AlertTriangle, CalendarCheck, IndianRupee, RefreshCw, Wallet } from 'lucide-react';
import { useQuery } from '../../hooks/useQuery';
import { ownerService, Branch } from '../../services/ownerService';
import { ErrorState, LoadingBlock, Panel } from '../../components/common/States';
import { formatDate, formatINR } from '../../utils/date';

const Stat: React.FC<{ label: string; value: string; sub?: string; tone?: 'blue' | 'emerald' | 'rose' | 'amber'; icon: React.ReactNode }> = ({ label, value, sub, tone = 'blue', icon }) => {
  const tones = {
    blue: 'bg-blue-50 text-blue-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    rose: 'bg-rose-50 text-rose-700',
    amber: 'bg-amber-50 text-amber-700'
  };
  return (
    <Panel className="p-4">
      <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${tones[tone]}`}>{icon}</span>
      <p className="mt-3 text-2xl font-extrabold tabular-nums tracking-tight">{value}</p>
      <p className="text-sm font-medium text-slate-700">{label}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </Panel>
  );
};

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

const BranchView: React.FC<{ b: Branch; showName: boolean }> = ({ b, showName }) => {
  const m = b.money;
  const a = b.attendance;
  const markedStudents = a.present + a.absent + a.onLeave;
  return (
    <section className="space-y-3">
      {showName && (
        <h2 className="text-base font-bold flex items-center gap-2">
          {b.schoolName}
          {b.board && <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-bold text-slate-600">{b.board === 'CBSE' ? 'CBSE' : 'SSC'}</span>}
        </h2>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          icon={<Wallet className="w-5 h-5" />}
          tone="emerald"
          label="Fees received today"
          value={formatINR(m.cashToday + m.onlineToday)}
          sub={`Cash ${formatINR(m.cashToday)} · Online ${formatINR(m.onlineToday)}`}
        />
        <Stat icon={<IndianRupee className="w-5 h-5" />} label="Received this month" value={formatINR(m.thisMonth)} />
        <Stat
          icon={<AlertTriangle className="w-5 h-5" />}
          tone="rose"
          label="Overdue fees"
          value={formatINR(m.overdue)}
          sub={`${m.studentsOverdue} student(s) · ${formatINR(m.outstanding)} still to come in total`}
        />
        <Stat
          icon={<CalendarCheck className="w-5 h-5" />}
          tone="amber"
          label="Present today"
          value={markedStudents > 0 ? `${pct(a.present, markedStudents)}%` : '—'}
          sub={markedStudents > 0 ? `${a.present} present · ${a.absent} AB · ${a.onLeave} on leave` : 'No register saved yet today'}
        />
      </div>
      {m.simulatedToday > 0 && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          {formatINR(m.simulatedToday)} in simulated test payments today is not counted above.
        </p>
      )}
      <div className="grid lg:grid-cols-2 gap-3">
        <Panel className="p-4">
          <p className="font-semibold">Attendance not taken yet</p>
          {a.classesNotMarked.length === 0 ? (
            <p className="mt-1 text-sm text-emerald-700">Every class has saved today's morning register.</p>
          ) : (
            <>
              <p className="mt-1 text-sm text-slate-600">{a.classesNotMarked.length} of {a.classes} classes have not saved today's morning register.</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {a.classesNotMarked.map(c => (
                  <span key={c} className="px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-900">Class {c}</span>
                ))}
              </div>
            </>
          )}
        </Panel>
        <Panel className="p-4">
          <p className="font-semibold">Most overdue by class</p>
          {m.overdueByClass.length === 0 ? (
            <p className="mt-1 text-sm text-emerald-700">No overdue fees.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100">
              {m.overdueByClass.map(c => (
                <li key={c.classLabel} className="py-2 flex items-center justify-between text-sm">
                  <span>Class {c.classLabel} · {c.students} student(s)</span>
                  <span className="font-semibold tabular-nums text-rose-700">{formatINR(c.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </section>
  );
};

export const OwnerDashboard: React.FC = () => {
  const q = useQuery(() => ownerService.overview(), []);
  if (q.status === 'loading') return <LoadingBlock />;
  if (q.status === 'error') return <ErrorState message={q.error} onRetry={q.reload} />;
  const o = q.data;
  const many = o.branches.length > 1;
  const t = o.totals;
  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Today at a glance</h1>
          <p className="text-sm text-slate-600">
            {formatDate(o.date)} · {many ? `${o.branches.length} branches` : o.branches[0]?.schoolName}
          </p>
        </div>
        <button onClick={q.reload} className="min-h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm font-semibold inline-flex items-center gap-1.5">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>
      {many && (
        <Panel className="p-4 bg-slate-900 text-white border-slate-900">
          <p className="text-sm text-slate-300">All branches</p>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div><p className="text-xl font-extrabold tabular-nums">{formatINR(t.cashToday + t.onlineToday)}</p><p className="text-xs text-slate-300">received today</p></div>
            <div><p className="text-xl font-extrabold tabular-nums">{formatINR(t.thisMonth)}</p><p className="text-xs text-slate-300">this month</p></div>
            <div><p className="text-xl font-extrabold tabular-nums">{formatINR(t.overdue)}</p><p className="text-xs text-slate-300">overdue · {t.studentsOverdue} student(s)</p></div>
            <div><p className="text-xl font-extrabold tabular-nums">{t.present + t.absent > 0 ? `${pct(t.present, t.present + t.absent)}%` : '—'}</p><p className="text-xs text-slate-300">present today</p></div>
          </div>
        </Panel>
      )}
      {o.branches.map(b => <BranchView key={b.schoolId} b={b} showName={many} />)}
      <p className="text-xs text-slate-500">Counted from recorded payments, fee charges and today's morning registers. Absent is shown as AB.</p>
    </div>
  );
};
