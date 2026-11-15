/**
 * WhatsApp alerts: what went (or would go) to parents, the school's on/off settings, and
 * fee reminders (FINANCE). The server re-checks every permission.
 * Honest status: with no WhatsApp account connected nothing is delivered, and the page says so.
 */
import React, { useState } from 'react';
import { BellRing, CheckCircle2, MessageCircle, Send, TriangleAlert } from 'lucide-react';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { adminService } from '../../../services/adminService';
import { alertService, AlertStatus, FeeRun } from '../../../services/alertService';
import { EmptyState, ErrorState, LoadingBlock, Panel, Pill, Section } from '../../../components/common/States';
import { ErrorBox } from '../../auth/authUi';
import { formatDateTime } from '../../../utils/date';

const STATUS: Record<AlertStatus, { label: string; tone: 'neutral' | 'warning' | 'info' | 'danger' | 'success' }> = {
  QUEUED: { label: 'Waiting to send', tone: 'info' },
  SENT: { label: 'Sent', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'danger' },
  LOGGED: { label: 'Recorded, not sent', tone: 'warning' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  SKIPPED: { label: 'Not sent', tone: 'neutral' }
};

const KIND = { ABSENT: 'Absent today', FEE_DUE: 'Fee overdue' };

const Toggle: React.FC<{ on: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string; hint: string }> = ({ on, disabled, onChange, label, hint }) => (
  <label className={`flex items-start justify-between gap-4 p-3.5 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
    <span>
      <span className="block font-semibold">{label}</span>
      <span className="block text-sm text-slate-600">{hint}</span>
    </span>
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`shrink-0 mt-0.5 w-12 h-7 rounded-full transition-colors relative ${on ? 'bg-blue-600' : 'bg-slate-300'}`}
    >
      <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${on ? 'left-[1.375rem]' : 'left-0.5'}`} />
    </button>
  </label>
);

export const AdminAlerts: React.FC = () => {
  const scope = useScope();
  const q = useQuery(() => alertService.overview(), [scope.schoolId]);
  const access = useQuery(() => adminService.getAccess(scope), [scope.schoolId, scope.userId]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<FeeRun | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'ABSENT' | 'FEE_DUE'>('ALL');

  const isAdmin = scope.role === 'ADMIN';
  const finance = access.status === 'ready' && access.data.permissions.includes('FINANCE');

  const change = async (s: { absenceAlerts?: boolean; feeReminders?: boolean }) => {
    setError(null);
    const r = await alertService.updateSettings(s);
    if (!r.ok) setError(r.error);
    q.reload();
  };

  const remind = async () => {
    setError(null);
    setBusy(true);
    const r = await alertService.sendFeeReminders();
    setBusy(false);
    if (r.ok) setRun(r.data);
    else setError(r.error);
    q.reload();
  };

  if (q.status === 'loading') return <LoadingBlock />;
  if (q.status === 'error') return <ErrorState message={q.error} onRetry={q.reload} />;
  const o = q.data;
  const shown = o.recent.filter(a => filter === 'ALL' || a.kind === filter);
  const t = o.today;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><MessageCircle className="w-5 h-5 text-emerald-600" /> WhatsApp alerts</h1>
        <p className="text-sm text-slate-600">Parents hear about an absence the same morning, and about overdue fees when the office sends a reminder.</p>
      </div>

      {o.connected ? (
        <Panel className="p-4 flex items-start gap-3 border-emerald-200 bg-emerald-50">
          <CheckCircle2 className="w-5 h-5 text-emerald-700 mt-0.5" />
          <p className="text-sm text-emerald-900"><b>WhatsApp is connected.</b> Alerts are delivered from the school's WhatsApp Business number.</p>
        </Panel>
      ) : (
        <Panel className="p-4 flex items-start gap-3 border-amber-200 bg-amber-50">
          <TriangleAlert className="w-5 h-5 text-amber-700 mt-0.5" />
          <p className="text-sm text-amber-900">
            <b>WhatsApp is not connected yet.</b> Alerts are recorded below exactly as parents would get them, but <b>nothing is delivered</b> until the school's
            WhatsApp Business number is set up.
          </p>
        </Panel>
      )}

      <ErrorBox message={error} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { k: 'Sent today', v: t.SENT ?? 0 },
          { k: 'Waiting', v: t.QUEUED ?? 0 },
          { k: o.connected ? 'Failed' : 'Recorded only', v: o.connected ? (t.FAILED ?? 0) : (t.LOGGED ?? 0) },
          { k: 'Not sent', v: (t.SKIPPED ?? 0) + (t.CANCELLED ?? 0) }
        ].map(x => (
          <Panel key={x.k} className="p-4">
            <p className="text-2xl font-extrabold tabular-nums">{x.v}</p>
            <p className="text-xs text-slate-500">{x.k}</p>
          </Panel>
        ))}
      </div>

      <Section title="Settings">
        <Panel className="divide-y divide-slate-100">
          <Toggle
            label="Absence alerts"
            hint={`Sent ${o.holdMinutes} minutes after the class teacher saves today's register, so a wrong mark can be fixed first. Not sent for approved leave.`}
            on={o.absenceAlerts}
            disabled={!isAdmin}
            onChange={v => change({ absenceAlerts: v })}
          />
          <Toggle
            label="Fee reminders"
            hint="Only for overdue fees, and at most once a day per child."
            on={o.feeReminders}
            disabled={!isAdmin}
            onChange={v => change({ feeReminders: v })}
          />
        </Panel>
        {!isAdmin && <p className="mt-2 text-xs text-slate-500">Only the Admin changes these settings.</p>}
      </Section>

      {finance && (
        <Section title="Fee reminders">
          <Panel className="p-4 space-y-3">
            <p className="text-sm text-slate-600">Sends one WhatsApp message to each family with an overdue fee. Parents who turned alerts off are skipped.</p>
            <button
              type="button"
              onClick={remind}
              disabled={busy || !o.feeReminders}
              className="min-h-11 px-4 rounded-xl bg-blue-700 text-white font-semibold inline-flex items-center gap-2 disabled:opacity-50"
            >
              <Send className="w-4 h-4" /> {busy ? 'Sending…' : 'Remind families with overdue fees'}
            </button>
            {run && (
              <p className="text-sm">
                {run.queued} reminder(s) queued, {run.skipped} not sent (no mobile or opted out), {run.alreadyToday} already reminded today.
                {run.note && <span className="block text-amber-800 mt-1">{run.note}</span>}
              </p>
            )}
          </Panel>
        </Section>
      )}

      <Section
        title="Recent alerts"
        action={
          <div className="flex gap-1 text-sm">
            {(['ALL', 'ABSENT', 'FEE_DUE'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg font-medium ${filter === f ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                {f === 'ALL' ? 'All' : KIND[f]}
              </button>
            ))}
          </div>
        }
      >
        {shown.length === 0 ? (
          <EmptyState title="No alerts yet" hint="Absence alerts appear here when today's register is saved." icon={<BellRing className="w-6 h-6" />} />
        ) : (
          <ul className="space-y-2">
            {shown.map(a => (
              <li key={a.id}>
                <Panel className="p-3.5 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold">{a.studentName} · <span className="text-slate-600 font-medium">{KIND[a.kind]}</span></p>
                    <Pill tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Pill>
                  </div>
                  <p className="text-sm text-slate-700 bg-emerald-50/60 border border-emerald-100 rounded-xl px-3 py-2">{a.preview}</p>
                  <p className="text-xs text-slate-500">
                    To {a.mobile} · {formatDateTime(a.createdAt)}{a.sentAt ? ` · sent ${formatDateTime(a.sentAt)}` : ''}
                  </p>
                  {a.error && <p className="text-xs text-slate-600">{a.error}</p>}
                </Panel>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
};
