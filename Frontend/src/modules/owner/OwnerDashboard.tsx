/**
 * Owner's dashboard: today's fees and attendance, per branch and in total.
 * Every number is counted from recorded payments, charges and registers on the server.
 * Simulated (test) payments are shown apart and never added to real money.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
          label={t('principal.owner.feesToday')}
          value={formatINR(m.cashToday + m.onlineToday)}
          sub={t('principal.owner.cashOnline', { cash: formatINR(m.cashToday), online: formatINR(m.onlineToday) })}
        />
        <Stat icon={<IndianRupee className="w-5 h-5" />} label={t('principal.owner.thisMonthLabel')} value={formatINR(m.thisMonth)} />
        <Stat
          icon={<AlertTriangle className="w-5 h-5" />}
          tone="rose"
          label={t('principal.owner.overdueFees')}
          value={formatINR(m.overdue)}
          sub={t('principal.owner.overdueSub', { count: m.studentsOverdue, amount: formatINR(m.outstanding) })}
        />
        <Stat
          icon={<CalendarCheck className="w-5 h-5" />}
          tone="amber"
          label={t('principal.owner.presentTodayLabel')}
          value={markedStudents > 0 ? `${pct(a.present, markedStudents)}%` : '—'}
          sub={markedStudents > 0 ? t('principal.owner.attSub', { present: a.present, absent: a.absent, leave: a.onLeave }) : t('principal.owner.noRegister')}
        />
      </div>
      {m.simulatedToday > 0 && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          {t('principal.owner.simulated', { amount: formatINR(m.simulatedToday) })}
        </p>
      )}
      <div className="grid lg:grid-cols-2 gap-3">
        <Panel className="p-4">
          <p className="font-semibold">{t('principal.owner.notTaken')}</p>
          {a.classesNotMarked.length === 0 ? (
            <p className="mt-1 text-sm text-emerald-700">{t('principal.owner.allSaved')}</p>
          ) : (
            <>
              <p className="mt-1 text-sm text-slate-600">{t('principal.owner.notSaved', { count: a.classesNotMarked.length, total: a.classes })}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {a.classesNotMarked.map(c => (
                  <span key={c} className="px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-900">{t('principal.owner.classChip', { label: c })}</span>
                ))}
              </div>
            </>
          )}
        </Panel>
        <Panel className="p-4">
          <p className="font-semibold">{t('principal.owner.mostOverdue')}</p>
          {m.overdueByClass.length === 0 ? (
            <p className="mt-1 text-sm text-emerald-700">{t('principal.owner.noOverdue')}</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100">
              {m.overdueByClass.map(c => (
                <li key={c.classLabel} className="py-2 flex items-center justify-between text-sm">
                  <span>{t('principal.owner.classRow', { label: c.classLabel, count: c.students })}</span>
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
  const { t, i18n } = useTranslation();
  const q = useQuery(() => ownerService.overview(), []);
  const [spinning, setSpinning] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const spinTimer = useRef<number | undefined>(undefined);

  // Stamp the time whenever fresh data arrives, and stop the spinner timer if the page closes.
  useEffect(() => {
    if (q.status === 'ready') setUpdatedAt(new Date());
  }, [q.data]);
  useEffect(() => () => window.clearTimeout(spinTimer.current), []);

  const refresh = () => {
    if (spinning) return;
    setSpinning(true);
    q.reload();
    // Keep the animation on long enough to notice, even when the numbers come back instantly.
    spinTimer.current = window.setTimeout(() => {
      setSpinning(false);
      setUpdatedAt(new Date());
    }, 900);
  };

  if (q.status === 'loading') return <LoadingBlock />;
  if (q.status === 'error') return <ErrorState message={q.error} onRetry={q.reload} />;
  const o = q.data;
  const many = o.branches.length > 1;
  const tot = o.totals;
  const time = updatedAt?.toLocaleTimeString(i18n.language === 'te' ? 'te-IN' : 'en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{t('principal.owner.title')}</h1>
          <p className="text-sm text-slate-600">
            {formatDate(o.date)} · {many ? t('principal.owner.branches', { count: o.branches.length }) : o.branches[0]?.schoolName}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <button
            type="button"
            onClick={refresh}
            disabled={spinning}
            aria-busy={spinning}
            className="min-h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm font-semibold inline-flex items-center gap-1.5 transition active:scale-95 disabled:opacity-70"
          >
            <RefreshCw className={`w-4 h-4 ${spinning ? 'animate-spin' : ''}`} />
            {spinning ? t('principal.owner.refreshing') : t('principal.owner.refresh')}
          </button>
          {time && <span className="text-xs text-slate-500">{t('principal.owner.updated', { time })}</span>}
        </div>
      </div>
      <div className={`space-y-6 transition-opacity duration-300 ${spinning ? 'opacity-60' : 'opacity-100'}`}>
        {many && (
          <Panel className="p-4 bg-slate-900 text-white border-slate-900">
            <p className="text-sm text-slate-300">{t('principal.owner.allBranches')}</p>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div><p className="text-xl font-extrabold tabular-nums">{formatINR(tot.cashToday + tot.onlineToday)}</p><p className="text-xs text-slate-300">{t('principal.owner.receivedToday')}</p></div>
              <div><p className="text-xl font-extrabold tabular-nums">{formatINR(tot.thisMonth)}</p><p className="text-xs text-slate-300">{t('principal.owner.thisMonth')}</p></div>
              <div><p className="text-xl font-extrabold tabular-nums">{formatINR(tot.overdue)}</p><p className="text-xs text-slate-300">{t('principal.owner.overdueStudents', { count: tot.studentsOverdue })}</p></div>
              <div><p className="text-xl font-extrabold tabular-nums">{tot.present + tot.absent > 0 ? `${pct(tot.present, tot.present + tot.absent)}%` : '—'}</p><p className="text-xs text-slate-300">{t('principal.owner.presentToday')}</p></div>
            </div>
          </Panel>
        )}
        {o.branches.map(b => <BranchView key={b.schoolId} b={b} showName={many} />)}
        <p className="text-xs text-slate-500">{t('principal.owner.footnote')}</p>
      </div>
    </div>
  );
};
