/**
 * Admin: start-of-year roster.
 *   1. Prepare the next academic year.
 *   2. Fees for that year (FINANCE): instalments + due dates, then the annual school fee per class.
 *   3. Plan (ADMISSIONS): a decision for every current student (promote / repeat / leaves) and the
 *      newly joining students with their parent's mobile. Review (nothing saved), then save the plan.
 *   4. Start the year: students move to their new classes; leavers become inactive. Records are kept.
 * Suggestions are only pre-filled where the next class is obvious; the admin decides everything else.
 * The server re-checks every rule; this page only collects decisions and shows its answers.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { adminService } from '../../../services/adminService';
import {
  rosterService, AcademicYearView, Decision, DecisionAction, NewStudent, PlanResult, RosterDraft, ScheduleItem
} from '../../../services/rosterService';
import { EmptyState, ErrorState, LoadingBlock, Panel, Pill, Section } from '../../../components/common/States';
import { ConfirmDialog } from '../../../components/ui/Modal';
import { ErrorBox, PrimaryButton, inputClass } from '../../auth/authUi';
import { formatDate } from '../../../utils/date';

interface RowState {
  action: DecisionAction | '';
  toClassId: string;
  roll: string;
  exitReason: string;
  suggested: boolean;
}

const emptyNew = (): NewStudent => ({ admissionNumber: '', name: '', toClassId: '', roll: '', guardianName: '', guardianMobile: '', guardianEmail: '' });

const nextYearDefaults = (current?: AcademicYearView) => {
  const start = current ? Number(current.startDate.slice(0, 4)) + 1 : new Date().getFullYear() + 1;
  return { name: `${start}-${String((start + 1) % 100).padStart(2, '0')}`, startDate: `${start}-06-01`, endDate: `${start + 1}-04-30` };
};

export const AdminAcademicYear: React.FC = () => {
  const scope = useScope();
  const access = useQuery(() => adminService.getAccess(scope), [scope.schoolId, scope.userId]);
  const years = useQuery(() => rosterService.years(), [scope.schoolId]);
  const perms = access.data?.permissions ?? [];
  const canPlan = perms.includes('ADMISSIONS');
  const canFees = perms.includes('FINANCE');

  if (!rosterService.available) {
    return <EmptyState title="The academic-year roster needs the FutureSchool server" />;
  }
  if (years.status === 'loading' || access.status === 'loading') return <LoadingBlock />;
  if (years.status === 'error') return <ErrorState message={years.error} onRetry={years.reload} />;

  const current = years.data.current;
  const planned = years.data.years.filter(y => y.status === 'PLANNED');
  const target = planned[0];

  return (
    <div className="space-y-6 max-w-5xl xl:max-w-6xl">
      <div>
        <h1 className="text-xl font-bold">New academic year</h1>
        <p className="text-sm text-slate-600">
          Promote returning students, keep back or mark leavers, add new students, then start the year. Past records are never deleted.
        </p>
      </div>

      <Panel className="p-4 flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-600">Current year:</span>
        <Pill tone="info">{current.name}</Pill>
        <span className="text-sm text-slate-500">{formatDate(current.startDate)} – {formatDate(current.endDate)}</span>
        {planned.map(p => (
          <Pill key={p.id} tone="warning">Next: {p.name}</Pill>
        ))}
      </Panel>

      {!target ? (
        canPlan ? <PrepareYear current={current} onDone={years.reload} /> : <EmptyState title="No next year prepared yet. An Admin with the Admissions permission prepares it." />
      ) : (
        <YearPlan key={target.id} yearId={target.id} canPlan={canPlan} canFees={canFees} onStarted={years.reload} />
      )}
    </div>
  );
};

// ------------------------------------------------------------------ 1. prepare

const PrepareYear: React.FC<{ current: AcademicYearView; onDone: () => void }> = ({ current, onDone }) => {
  const d = nextYearDefaults(current);
  const [form, setForm] = useState(d);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    const r = await rosterService.createYear(form);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onDone();
  };
  return (
    <Section title={`Prepare ${d.name}`}>
      <Panel className="p-4 space-y-3">
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="block">
            <span className="block text-sm font-semibold mb-1">Year</span>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputClass} />
          </label>
          <label className="block">
            <span className="block text-sm font-semibold mb-1">Starts</span>
            <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} className={inputClass} />
          </label>
          <label className="block">
            <span className="block text-sm font-semibold mb-1">Ends</span>
            <input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} className={inputClass} />
          </label>
        </div>
        <ErrorBox message={error} />
        <PrimaryButton onClick={submit} loading={busy}>
          <CalendarPlus className="w-4 h-4" /> Prepare {form.name}
        </PrimaryButton>
      </Panel>
    </Section>
  );
};

// ------------------------------------------------------------------ 2-4. plan a year

const YearPlan: React.FC<{ yearId: string; canPlan: boolean; canFees: boolean; onStarted: () => void }> = ({ yearId, canPlan, canFees, onStarted }) => {
  const draft = useQuery(() => rosterService.draft(yearId), [yearId], { autoRefresh: false });
  if (draft.status === 'loading') return <LoadingBlock />;
  if (draft.status === 'error') return <ErrorState message={draft.error} onRetry={draft.reload} />;
  const d = draft.data;
  return (
    <>
      <FeesForYear draft={d} canFees={canFees} onSaved={draft.reload} />
      {canPlan ? (
        <RosterPlanner draft={d} onSaved={draft.reload} onStarted={onStarted} />
      ) : (
        <EmptyState title="Promotions and new students are planned by an Admin with the Admissions permission." />
      )}
    </>
  );
};

const FeesForYear: React.FC<{ draft: RosterDraft; canFees: boolean; onSaved: () => void }> = ({ draft, canFees, onSaved }) => {
  const y = draft.year;
  const start = y.startDate;
  const defaults: ScheduleItem[] = draft.schedule.length
    ? draft.schedule
    : [1, 2, 3, 4].map(n => ({ number: n, label: `Term ${n}`, dueOn: '' }));
  const [items, setItems] = useState<ScheduleItem[]>(defaults);
  const grades = useMemo(() => Array.from(new Set(draft.classes.map(c => c.grade).filter(g => g > 0))).sort((a, b) => a - b), [draft.classes]);
  const [fees, setFees] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'schedule' | 'charges' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const saveSchedule = async () => {
    setBusy('schedule');
    setError(null);
    setDone(null);
    const r = await rosterService.setFeeSchedule(y.id, items);
    setBusy(null);
    if (!r.ok) return setError(r.error);
    setDone(`Fee schedule for ${y.name} saved.`);
    onSaved();
  };
  const charge = async () => {
    const map: Record<string, number> = {};
    for (const [g, v] of Object.entries(fees)) if (v.trim() !== '') map[g] = Number(v);
    setBusy('charges');
    setError(null);
    setDone(null);
    const r = await rosterService.generateCharges(y.id, map);
    setBusy(null);
    if (!r.ok) return setError(r.error);
    setDone(`School fee for ${y.name}: ${r.data.studentsCharged} student(s) charged, ${r.data.skipped} already charged or skipped`
      + (r.data.gradesWithoutFee.length ? `; no fee entered for class ${r.data.gradesWithoutFee.join(', ')}.` : '.'));
  };

  return (
    <Section title={`Fees for ${y.name}`}>
      <Panel className="p-4 space-y-4">
        {!canFees && <p className="text-sm text-slate-600">Only an Admin with the Finance permission sets fees.</p>}
        <div className="space-y-2">
          <p className="text-sm font-semibold">Instalments and due dates (inside {formatDate(y.startDate)} – {formatDate(y.endDate)})</p>
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-[3rem_1fr_1fr_auto] gap-2 items-center">
              <span className="text-sm text-slate-500">#{it.number}</span>
              <input aria-label={`Instalment ${it.number} name`} value={it.label} disabled={!canFees}
                onChange={e => setItems(list => list.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className={inputClass} />
              <input aria-label={`Instalment ${it.number} due date`} type="date" min={start} max={y.endDate} value={it.dueOn} disabled={!canFees}
                onChange={e => setItems(list => list.map((x, j) => (j === i ? { ...x, dueOn: e.target.value } : x)))} className={inputClass} />
              <button type="button" aria-label="Remove instalment" disabled={!canFees || items.length <= 1}
                onClick={() => setItems(list => list.filter((_, j) => j !== i))} className="w-10 h-10 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30">
                <Trash2 className="w-4 h-4 mx-auto" />
              </button>
            </div>
          ))}
          {canFees && (
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={items.length >= 12}
                onClick={() => setItems(list => [...list, { number: Math.max(0, ...list.map(x => x.number)) + 1, label: `Term ${list.length + 1}`, dueOn: '' }])}
                className="min-h-10 px-3 rounded-lg border border-slate-300 text-sm font-semibold inline-flex items-center gap-1.5">
                <Plus className="w-4 h-4" /> Add instalment
              </button>
              <PrimaryButton onClick={saveSchedule} loading={busy === 'schedule'}>Save schedule</PrimaryButton>
            </div>
          )}
        </div>

        {canFees && draft.schedule.length > 0 && (
          <div className="space-y-2 border-t border-slate-100 pt-4">
            <p className="text-sm font-semibold">Annual school fee per class (split over the instalments; students already charged for {y.name} are skipped)</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {grades.map(g => (
                <label key={g} className="block">
                  <span className="block text-xs text-slate-500 mb-0.5">Class {g} (₹)</span>
                  <input inputMode="numeric" value={fees[String(g)] ?? ''} onChange={e => setFees(f => ({ ...f, [String(g)]: e.target.value.replace(/\D/g, '') }))} className={inputClass} />
                </label>
              ))}
            </div>
            <PrimaryButton onClick={charge} loading={busy === 'charges'} disabled={Object.values(fees).every(v => !v)}>Charge school fee</PrimaryButton>
          </div>
        )}
        <ErrorBox message={error} />
        {done && <div role="status" className="p-3 rounded-xl text-sm bg-emerald-50 text-emerald-900 border border-emerald-200">{done}</div>}
      </Panel>
    </Section>
  );
};

const RosterPlanner: React.FC<{ draft: RosterDraft; onSaved: () => void; onStarted: () => void }> = ({ draft, onSaved, onStarted }) => {
  const y = draft.year;
  const classById = useMemo(() => new Map(draft.classes.map(c => [c.id, c])), [draft.classes]);
  const initial = useMemo(() => {
    const m: Record<string, RowState> = {};
    for (const r of draft.roster) {
      if (r.saved) m[r.studentId] = { action: r.saved.action, toClassId: r.saved.toClassId ?? '', roll: r.saved.roll ?? '', exitReason: r.saved.exitReason ?? '', suggested: false };
      else if (r.suggestion) m[r.studentId] = { action: 'PROMOTE', toClassId: r.suggestion.toClassId, roll: r.suggestion.roll, exitReason: '', suggested: true };
      else m[r.studentId] = { action: '', toClassId: '', roll: r.current.roll, exitReason: '', suggested: false };
    }
    return m;
  }, [draft.roster]);
  const [rows, setRows] = useState<Record<string, RowState>>(initial);
  const [newcomers, setNewcomers] = useState<NewStudent[]>([]);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [reviewedKey, setReviewedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<'preview' | 'apply' | 'start' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'apply' | 'start' | null>(null);
  const [started, setStarted] = useState<string | null>(null);
  useEffect(() => setRows(initial), [initial]);

  const update = (id: string, patch: Partial<RowState>) => setRows(r => ({ ...r, [id]: { ...r[id], ...patch, suggested: false } }));

  const decisions: Decision[] = draft.roster
    .map(r => ({ r, s: rows[r.studentId] }))
    .filter(({ s }) => s && s.action)
    .map(({ r, s }) => (s.action === 'EXIT'
      ? { studentId: r.studentId, action: 'EXIT' as const, exitReason: s.exitReason }
      : { studentId: r.studentId, action: s.action as DecisionAction, toClassId: s.toClassId, roll: s.roll }));
  const undecided = draft.roster.filter(r => !rows[r.studentId]?.action).length;
  const planKey = JSON.stringify({ decisions, newcomers });
  const reviewedOk = result !== null && reviewedKey === planKey && result.summary.needsCorrection === 0;

  const classesFor = (grade: number | null, action: RowState['action']) =>
    draft.classes.filter(c => grade == null || (action === 'REPEAT' ? c.grade === grade : c.grade === grade + 1));

  const review = async () => {
    setBusy('preview');
    setError(null);
    const r = await rosterService.preview(y.id, decisions, newcomers);
    setBusy(null);
    if (!r.ok) return setError(r.error);
    setResult(r.data);
    setReviewedKey(planKey);
  };
  const apply = async () => {
    setBusy('apply');
    setError(null);
    const r = await rosterService.apply(y.id, decisions, newcomers);
    setBusy(null);
    if (!r.ok) return setError(r.error);
    setResult(r.data);
    if (r.data.applied || r.data.summary.needsCorrection === 0) {
      setNewcomers([]);
      onSaved();
    }
  };
  const start = async () => {
    setBusy('start');
    setError(null);
    const r = await rosterService.start(y.id);
    setBusy(null);
    if (!r.ok) return setError(r.error);
    setStarted(r.data.started ? `${r.data.year} has started: ${r.data.returning} returning, ${r.data.joined} new, ${r.data.exited} left.` : r.data.message ?? 'Already started.');
    onStarted();
  };

  return (
    <>
      <Section title={`Students for ${y.name}`}>
        <p className="text-sm text-slate-600">
          Choose for every student. Rows marked <Pill tone="info">suggested</Pill> are pre-filled with the next class; check them. Others need your decision.
        </p>
        {draft.roster.length === 0 ? (
          <EmptyState title="No active students" />
        ) : (
          <Panel className="divide-y divide-slate-100">
            {draft.roster.map(r => {
              const s = rows[r.studentId];
              if (!s) return null;
              const dest = s.toClassId ? classById.get(s.toClassId) : undefined;
              return (
                <div key={r.studentId} className={`p-3 space-y-2 ${!s.action ? 'bg-amber-50/60' : ''}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{r.name}</span>
                    <span className="text-sm text-slate-500">{r.current.className}-{r.current.section} · Roll {r.current.roll}</span>
                    {s.suggested && <Pill tone="info">suggested</Pill>}
                    {!s.action && r.needsDecision && <span className="text-xs text-amber-800">{r.needsDecision}</span>}
                  </div>
                  <div className="grid sm:grid-cols-[10rem_1fr_7rem] gap-2">
                    <select aria-label={`Decision for ${r.name}`} value={s.action} className={inputClass}
                      onChange={e => update(r.studentId, { action: e.target.value as RowState['action'], toClassId: '' })}>
                      <option value="">Choose…</option>
                      <option value="PROMOTE">Promote</option>
                      <option value="REPEAT">Repeat the class</option>
                      <option value="EXIT">Leaves the school</option>
                    </select>
                    {s.action === 'EXIT' ? (
                      <input aria-label={`Reason ${r.name} leaves`} placeholder="Reason (e.g. transferred, did not return)" value={s.exitReason}
                        onChange={e => update(r.studentId, { exitReason: e.target.value.slice(0, 255) })} className={`${inputClass} sm:col-span-2`} />
                    ) : (
                      <>
                        <select aria-label={`Class for ${r.name} in ${y.name}`} value={s.toClassId} disabled={!s.action} className={inputClass}
                          onChange={e => update(r.studentId, { toClassId: e.target.value })}>
                          <option value="">Class in {y.name}…</option>
                          {classesFor(r.grade, s.action).map(c => (
                            <option key={c.id} value={c.id}>{c.name}-{c.section}</option>
                          ))}
                          {dest && !classesFor(r.grade, s.action).some(c => c.id === dest.id) && <option value={dest.id}>{dest.name}-{dest.section}</option>}
                        </select>
                        <input aria-label={`Roll for ${r.name}`} placeholder="Roll" value={s.roll} disabled={!s.action}
                          onChange={e => update(r.studentId, { roll: e.target.value.slice(0, 16) })} className={inputClass} />
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </Panel>
        )}
      </Section>

      <Section title={`New students joining in ${y.name}`}>
        {draft.admitted.length > 0 && (
          <Panel className="divide-y divide-slate-100">
            {draft.admitted.map(a => (
              <div key={a.studentId} className="p-3 flex flex-wrap items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="font-semibold">{a.name}</span>
                <span className="text-slate-500">{a.to.className}-{a.to.section} · Roll {a.to.roll} · Adm. {a.admissionNumber}</span>
                <Pill tone={a.guardianLinked ? 'success' : 'warning'}>{a.guardianLinked ? 'Parent linked' : 'No parent linked'}</Pill>
              </div>
            ))}
          </Panel>
        )}
        {newcomers.map((n, i) => (
          <Panel key={i} className="p-3 space-y-2">
            <div className="grid sm:grid-cols-4 gap-2">
              <input aria-label="Admission number" placeholder="Admission no." value={n.admissionNumber} onChange={e => setNewcomers(l => l.map((x, j) => (j === i ? { ...x, admissionNumber: e.target.value } : x)))} className={inputClass} />
              <input aria-label="Student name" placeholder="Student name" value={n.name} onChange={e => setNewcomers(l => l.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className={`${inputClass} sm:col-span-2`} />
              <input aria-label="Date of birth" type="date" value={n.dob ?? ''} onChange={e => setNewcomers(l => l.map((x, j) => (j === i ? { ...x, dob: e.target.value } : x)))} className={inputClass} />
              <select aria-label="Class" value={n.toClassId} onChange={e => setNewcomers(l => l.map((x, j) => (j === i ? { ...x, toClassId: e.target.value } : x)))} className={inputClass}>
                <option value="">Class…</option>
                {draft.classes.map(c => <option key={c.id} value={c.id}>{c.name}-{c.section}</option>)}
              </select>
              <input aria-label="Roll" placeholder="Roll" value={n.roll} onChange={e => setNewcomers(l => l.map((x, j) => (j === i ? { ...x, roll: e.target.value } : x)))} className={inputClass} />
              <input aria-label="Parent name" placeholder="Parent / guardian name" value={n.guardianName} onChange={e => setNewcomers(l => l.map((x, j) => (j === i ? { ...x, guardianName: e.target.value } : x)))} className={inputClass} />
              <input aria-label="Parent mobile" inputMode="tel" placeholder="Parent mobile (sign-in)" value={n.guardianMobile} onChange={e => setNewcomers(l => l.map((x, j) => (j === i ? { ...x, guardianMobile: e.target.value } : x)))} className={inputClass} />
              <input aria-label="Parent email" type="email" placeholder="Parent email (optional)" value={n.guardianEmail ?? ''} onChange={e => setNewcomers(l => l.map((x, j) => (j === i ? { ...x, guardianEmail: e.target.value } : x)))} className={`${inputClass} sm:col-span-2`} />
              <input aria-label="Annual fee" inputMode="numeric" placeholder="Annual fee ₹ (optional)" value={n.annualFee ?? ''} onChange={e => setNewcomers(l => l.map((x, j) => (j === i ? { ...x, annualFee: e.target.value ? Number(e.target.value.replace(/\D/g, '')) : undefined } : x)))} className={inputClass} />
              <button type="button" onClick={() => setNewcomers(l => l.filter((_, j) => j !== i))} className="min-h-11 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 inline-flex items-center justify-center gap-1.5">
                <Trash2 className="w-4 h-4" /> Remove
              </button>
            </div>
          </Panel>
        ))}
        <button type="button" onClick={() => setNewcomers(l => [...l, emptyNew()])} className="min-h-11 px-4 rounded-xl border border-blue-200 text-blue-800 text-sm font-semibold inline-flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Add a new student
        </button>
        <p className="text-xs text-slate-500">The parent signs in with this mobile number (OTP), then sets a PIN. A parent who already has an account is linked, not duplicated.</p>
      </Section>

      <Section title="Review and save">
        <Panel className="p-4 space-y-3">
          <p className="text-sm text-slate-600">
            {decisions.length} decision(s), {newcomers.length} new student(s){undecided > 0 ? `, ${undecided} student(s) still without a decision` : ''}.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={review} disabled={busy !== null || (decisions.length === 0 && newcomers.length === 0)}
              className="min-h-11 px-4 rounded-xl border border-slate-300 font-semibold disabled:opacity-50">
              {busy === 'preview' ? 'Checking…' : 'Review changes'}
            </button>
            <PrimaryButton onClick={() => setConfirm('apply')} loading={busy === 'apply'} disabled={!reviewedOk}>Save plan</PrimaryButton>
          </div>
          {!reviewedOk && result && reviewedKey !== planKey && <p className="text-xs text-slate-500">You changed the plan. Review it again before saving.</p>}
          <ErrorBox message={error} />
          {result && <PlanSummary result={result} />}
        </Panel>
      </Section>

      <Section title={`Start ${y.name}`}>
        <Panel className="p-4 space-y-3">
          <p className="text-sm text-slate-600">
            Starting the year moves students to their new classes and marks leavers as inactive. Attendance, marks, fees and receipts stay as they are.
          </p>
          {started ? (
            <div role="status" className="p-3 rounded-xl text-sm bg-emerald-50 text-emerald-900 border border-emerald-200">{started}</div>
          ) : (
            <PrimaryButton onClick={() => setConfirm('start')} loading={busy === 'start'}>Start {y.name}</PrimaryButton>
          )}
        </Panel>
      </Section>

      <ConfirmDialog
        isOpen={confirm === 'apply'}
        onClose={() => setConfirm(null)}
        onConfirm={apply}
        title={`Save the plan for ${y.name}?`}
        description="Promotions, leavers and new students are saved for next year. Nothing changes for the current year until you start the new year."
        confirmLabel="Save plan"
      />
      <ConfirmDialog
        isOpen={confirm === 'start'}
        onClose={() => setConfirm(null)}
        onConfirm={start}
        title={`Start ${y.name}?`}
        description="Every student moves to their planned class, new students become active and leavers become inactive. This cannot be undone from here."
        confirmLabel={`Start ${y.name}`}
        variant="danger"
      />
    </>
  );
};

const PlanSummary: React.FC<{ result: PlanResult }> = ({ result }) => {
  const s = result.summary;
  const errors = result.rows.filter(r => r.status === 'ERROR');
  const notes = result.rows.filter(r => r.status !== 'ERROR' && (r.message || r.guardian));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        <Pill tone="success">{s.promoted} promoted</Pill>
        <Pill tone="info">{s.repeated} repeating</Pill>
        <Pill tone="info">{s.added} added</Pill>
        <Pill tone="warning">{s.exited} leaving</Pill>
        <Pill tone="neutral">{s.skipped} unchanged</Pill>
        <Pill tone={s.needsCorrection ? 'danger' : 'success'}>{s.needsCorrection} need correction</Pill>
      </div>
      {result.applied && <div role="status" className="p-3 rounded-xl text-sm bg-emerald-50 text-emerald-900 border border-emerald-200">Plan saved.</div>}
      {result.dryRun && s.needsCorrection === 0 && <p className="text-sm text-emerald-800">Everything checks out. Nothing has been saved yet.</p>}
      {result.message && <p className="text-sm text-rose-800">{result.message}</p>}
      {errors.length > 0 && (
        <ul className="space-y-1 text-sm">
          {errors.map(r => (
            <li key={r.ref} className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-900">
              <span className="font-semibold">{r.name ?? r.ref}</span>: {r.message}
            </li>
          ))}
        </ul>
      )}
      {notes.length > 0 && (
        <ul className="space-y-1 text-xs text-slate-600">
          {notes.map(r => (
            <li key={r.ref}>{r.name ?? r.ref}: {[r.message, r.guardian].filter(Boolean).join(' ')}</li>
          ))}
        </ul>
      )}
      {result.undecided && result.undecided.length > 0 && (
        <p className="text-sm text-amber-800">{result.undecided.length} student(s) still need a decision before the year can start.</p>
      )}
    </div>
  );
};
