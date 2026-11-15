/**
 * Admin: changes that need the Principal's approval.
 *   Draft -> FutureSchool validates -> Submit -> Principal approves (OTP) -> Admin executes
 *   (FutureSchool validates again). Editing after approval blocks execution until re-approved.
 * The Admin can never approve. Only kinds this Admin has permission for are offered.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Plus } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { governanceService } from '../../../services/governanceService';
import { adminService } from '../../../services/adminService';
import { feeDeskService } from '../../../services/feeDeskService';
import { PERMISSION_FOR_KIND } from '../../../services/mock/permissions';
import { EmptyState, ErrorState, LoadingBlock, Panel, Pill } from '../../../components/common/States';
import { Modal } from '../../../components/ui/Modal';
import { ErrorBox, LinkButton, PrimaryButton, inputClass } from '../../auth/authUi';
import { ChangeKind, ChangePayload, ChangeRequest, ChangeStatus, FeeCategory, FeeConcession } from '../../../types/domain';
import { addDaysISO, formatDate, formatDateTime, formatINR } from '../../../utils/date';

export const KIND_LABEL: Record<ChangeKind, string> = {
  FEE_CONCESSION: 'Fee concession',
  REFUND: 'Refund',
  LATE_FEE_WAIVER: 'Late fee waiver',
  FEE_STRUCTURE: 'Fee structure change',
  EXAM_SCHEDULE: 'Exam date change',
  CLEARANCE_RULE: 'Hall-ticket fee clearance rule'
};

const STATUS: Record<ChangeStatus, { label: string; tone: 'neutral' | 'warning' | 'info' | 'danger' | 'success' }> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  PENDING_APPROVAL: { label: 'With the Principal', tone: 'info' },
  RETURNED: { label: 'Returned to you', tone: 'warning' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  APPROVED: { label: 'Approved · execute', tone: 'warning' },
  EXECUTED: { label: 'Executed', tone: 'success' },
  EXECUTION_BLOCKED: { label: 'Execution blocked', tone: 'danger' }
};

const changedAfterApproval = (r: ChangeRequest) => r.status === 'APPROVED' && r.payloadHash !== r.approvedHash;
const TABS = { TODO: 'To do', PRINCIPAL: 'With Principal', DONE: 'Done' } as const;
type Tab = keyof typeof TABS;
const tabOf = (r: ChangeRequest): Tab => (r.status === 'PENDING_APPROVAL' ? 'PRINCIPAL' : r.status === 'EXECUTED' || r.status === 'REJECTED' ? 'DONE' : 'TODO');

export const AdminRequests: React.FC = () => {
  const scope = useScope();
  const { currentUser } = useAuth();
  const access = useQuery(() => adminService.getAccess(scope), [scope.schoolId, scope.userId]);
  const q = useQuery(() => governanceService.listForAdmin(scope), [scope.schoolId]);
  const [tab, setTab] = useState<Tab>('TODO');
  const [open, setOpen] = useState<ChangeRequest | null>(null);
  const [editing, setEditing] = useState<{ kind: ChangeKind; existing?: ChangeRequest } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (q.status === 'loading' || access.status === 'loading') return <LoadingBlock />;
  if (q.status === 'error') return <ErrorState message={q.error} onRetry={q.reload} />;
  if (access.status === 'error') return <ErrorState message={access.error} onRetry={access.reload} />;

  const allowedKinds = (Object.keys(KIND_LABEL) as ChangeKind[]).filter(k => access.data.permissions.includes(PERMISSION_FOR_KIND[k]));
  const canAct = (r: ChangeRequest) => allowedKinds.includes(r.kind);
  const rows = q.data.filter(r => tabOf(r) === tab).sort((a, b) => (b.history.at(-1)?.at ?? '').localeCompare(a.history.at(-1)?.at ?? ''));

  const run = async (fn: () => Promise<{ ok: true; data: ChangeRequest } | { ok: false; error: string }>, msg: string) => {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    q.reload();
    if (!r.ok) {
      setError(r.error);
      // Re-read so a newly blocked state shows immediately.
      const fresh = await governanceService.listForAdmin(scope);
      if (fresh.ok && open) setOpen(fresh.data.find(x => x.id === open.id) ?? null);
      return;
    }
    setDone(msg);
    setOpen(null);
  };

  const save = async (title: string, payload: ChangePayload) => {
    setError(null);
    const r = editing?.existing
      ? await governanceService.updateDraft(scope, editing.existing.id, payload)
      : await governanceService.createDraft(scope, title, payload, currentUser?.name ?? '');
    if (!r.ok) return r.error;
    setEditing(null);
    setOpen(r.data);
    setDone(editing?.existing && changedAfterApproval(r.data) ? 'Saved. Because you changed it after approval, it must be approved again before it can be executed.' : 'Saved as a draft.');
    q.reload();
    return null;
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Changes needing approval</h1>
          <p className="text-sm text-slate-600">You prepare, the Principal approves, you execute. FutureSchool checks the rules at every step.</p>
        </div>
        {allowedKinds.length > 0 && (
          <div className="relative">
            <select
              aria-label="New request"
              value=""
              onChange={e => { setDone(null); setError(null); setEditing({ kind: e.target.value as ChangeKind }); }}
              className="appearance-none min-h-11 pl-9 pr-4 rounded-xl bg-blue-700 text-white font-semibold"
            >
              <option value="" disabled>New request</option>
              {allowedKinds.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
            <Plus className="w-4 h-4 text-white absolute left-3 top-3.5 pointer-events-none" />
          </div>
        )}
      </div>
      {done && <p role="status" className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900">{done}</p>}
      <div className="inline-grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-200/70">
        {(Object.keys(TABS) as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`min-h-10 px-3 rounded-lg text-sm font-semibold ${tab === t ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-600'}`}>
            {TABS[t]} ({q.data.filter(r => tabOf(r) === t).length})
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <EmptyState title="Nothing here" />
      ) : (
        <Panel className="divide-y divide-slate-100">
          {rows.map(r => {
            const blocked = r.status === 'EXECUTION_BLOCKED' || changedAfterApproval(r);
            return (
              <button key={r.id} onClick={() => { setOpen(r); setError(null); setDone(null); }} className="w-full p-3.5 flex flex-col sm:flex-row sm:items-center gap-2 text-left hover:bg-slate-50">
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold">{r.title}</span>
                  <span className="block text-sm text-slate-500">{KIND_LABEL[r.kind]} · {r.preparedByName || 'Admin'}{!canAct(r) ? ' · view only' : ''}</span>
                </span>
                {r.validationIssues.length > 0 && tabOf(r) === 'TODO' && <Pill tone="danger">{r.validationIssues.length} issue(s)</Pill>}
                <Pill tone={blocked ? 'danger' : STATUS[r.status].tone}>{blocked ? 'Blocked · changed after approval' : STATUS[r.status].label}</Pill>
              </button>
            );
          })}
        </Panel>
      )}

      <Modal isOpen={Boolean(open)} onClose={() => setOpen(null)} title={open?.title ?? ''} size="lg">
        {open && (
          <div className="space-y-3 text-sm">
            <Pill tone={STATUS[open.status].tone}>{STATUS[open.status].label}</Pill>
            {(open.status === 'EXECUTION_BLOCKED' || changedAfterApproval(open)) && (
              <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900">
                <p className="font-semibold flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> Execution blocked</p>
                <p>This request was changed after the Principal approved it, or it no longer passes validation. Submit it again for approval.</p>
              </div>
            )}
            <ul className="space-y-1">{governanceService.describe(scope, open).map(l => <li key={l}>{l}</li>)}</ul>
            {open.validationIssues.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
                <p className="font-semibold">FutureSchool validation</p>
                <ul className="list-disc pl-5 mt-1">{open.validationIssues.map(i => <li key={i}>{i}</li>)}</ul>
              </div>
            )}
            <div>
              <p className="font-semibold mb-1">History</p>
              <ul className="space-y-0.5 text-slate-600">
                {open.history.map((h, i) => <li key={i}>{formatDateTime(h.at)} · {h.action.replace(/_/g, ' ').toLowerCase()}{h.note ? ` · ${h.note}` : ''}</li>)}
              </ul>
            </div>
            <ErrorBox message={error} />
            {canAct(open) ? (
              <div className="flex flex-col sm:flex-row gap-2">
                {['DRAFT', 'RETURNED', 'APPROVED', 'EXECUTION_BLOCKED'].includes(open.status) && (
                  <button onClick={() => { setEditing({ kind: open.kind, existing: open }); setOpen(null); }} disabled={busy} className="min-h-11 px-4 rounded-xl border border-slate-300 font-semibold">
                    {open.status === 'APPROVED' ? 'Edit (needs re-approval)' : 'Edit'}
                  </button>
                )}
                {(['DRAFT', 'RETURNED', 'EXECUTION_BLOCKED'].includes(open.status) || changedAfterApproval(open)) && (
                  <PrimaryButton loading={busy} disabled={open.validationIssues.length > 0} onClick={() => run(() => governanceService.submit(scope, open.id), 'Sent to the Principal for approval.')}>
                    {open.status === 'DRAFT' ? 'Submit to Principal' : 'Submit again for approval'}
                  </PrimaryButton>
                )}
                {open.status === 'APPROVED' && (
                  <PrimaryButton loading={busy} onClick={() => run(() => governanceService.execute(scope, open.id), 'Executed. The change is live and audited.')}>Execute</PrimaryButton>
                )}
              </div>
            ) : (
              <p className="text-slate-500">You can view this request; another Admin with the right permission acts on it.</p>
            )}
          </div>
        )}
      </Modal>

      <Modal isOpen={Boolean(editing)} onClose={() => setEditing(null)} title={editing ? `${editing.existing ? 'Edit' : 'New'}: ${KIND_LABEL[editing.kind]}` : ''} size="lg">
        {editing && <RequestEditor kind={editing.kind} existing={editing.existing} onSave={save} onCancel={() => setEditing(null)} />}
      </Modal>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

const CONCESSION_KINDS: FeeConcession['kind'][] = ['SIBLING', 'SCHOLARSHIP', 'STAFF_CHILD', 'FINANCIAL_SUPPORT', 'MANAGEMENT', 'SPECIAL_WAIVER', 'OTHER'];
const CATEGORIES: FeeCategory[] = ['SCHOOL_FEE', 'EXAM_FEE', 'TRANSPORT_FEE', 'ACTIVITY_FEE', 'EVENT_FEE', 'OTHER'];
const lower = (s: string) => s.replace(/_/g, ' ').toLowerCase();
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="block text-sm font-semibold text-slate-700 mb-1">{label}</span>
    {children}
  </label>
);

const RequestEditor: React.FC<{
  kind: ChangeKind;
  existing?: ChangeRequest;
  onSave: (title: string, p: ChangePayload) => Promise<string | null>;
  onCancel: () => void;
}> = ({ kind, existing, onSave, onCancel }) => {
  const scope = useScope();
  const init = existing?.payload as Record<string, unknown> | undefined;
  const [title, setTitle] = useState(existing?.title ?? '');
  const [studentId, setStudentId] = useState<string>((init?.studentId as string) ?? '');
  const [chargeIds, setChargeIds] = useState<string[]>((init?.chargeIds as string[]) ?? []);
  const [amount, setAmount] = useState(String(init?.amountPerCharge ?? init?.amount ?? init?.newSchoolFee ?? ''));
  const [concessionKind, setConcessionKind] = useState<FeeConcession['kind']>((init?.concessionKind as FeeConcession['kind']) ?? 'FINANCIAL_SUPPORT');
  const [text, setText] = useState(String(init?.justification ?? init?.reason ?? ''));
  const [paymentId, setPaymentId] = useState((init?.paymentId as string) ?? '');
  const [examId, setExamId] = useState((init?.examId as string) ?? '');
  const [date, setDate] = useState((init?.newStartsOn as string) ?? addDaysISO(14));
  const [grade, setGrade] = useState(String(init?.grade ?? 10));
  const [instalment, setInstalment] = useState(String(init?.instalment ?? init?.uptoInstalment ?? 2));
  const [cats, setCats] = useState<FeeCategory[]>((init?.categories as FeeCategory[]) ?? ['SCHOOL_FEE']);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const needsStudent = kind === 'FEE_CONCESSION' || kind === 'REFUND' || kind === 'LATE_FEE_WAIVER';
  const students = useQuery(() => (needsStudent ? feeDeskService.search(scope, '') : Promise.resolve({ ok: true as const, data: [] })), [scope.schoolId, kind]);
  const account = useQuery(
    () => (needsStudent && studentId ? feeDeskService.getAccount(scope, studentId) : Promise.resolve({ ok: true as const, data: null })),
    [scope.schoolId, studentId]
  );
  const exams = useQuery(() => (kind === 'EXAM_SCHEDULE' || kind === 'CLEARANCE_RULE' ? adminService.listExams(scope) : Promise.resolve({ ok: true as const, data: [] })), [scope.schoolId, kind]);

  // When editing a clearance rule, start from the exam's current rule.
  useEffect(() => {
    if (kind !== 'CLEARANCE_RULE' || existing || !examId) return;
    const ex = exams.data?.find(e => e.id === examId);
    if (ex) {
      setCats(ex.clearanceRule.categories);
      setInstalment(String(ex.clearanceRule.uptoInstalment));
    }
  }, [examId, exams.data, kind, existing]);

  const lines = useMemo(() => (account.data?.summary.instalments ?? []).flatMap(i => i.lines).filter(l => l.outstanding > 0), [account.data]);
  const n = Number(amount);

  const payload = (): ChangePayload | string => {
    switch (kind) {
      case 'FEE_CONCESSION':
        if (!studentId || !chargeIds.length) return 'Choose the student and at least one charge.';
        return { kind, studentId, chargeIds, amountPerCharge: n, concessionKind, justification: text };
      case 'REFUND':
        if (!paymentId) return 'Choose the original payment.';
        return { kind, paymentId, amount: n, reason: text };
      case 'LATE_FEE_WAIVER':
        if (!studentId) return 'Choose the student.';
        return { kind, studentId, amount: n, reason: text };
      case 'EXAM_SCHEDULE':
        if (!examId) return 'Choose the exam.';
        return { kind, examId, newStartsOn: date, reason: text };
      case 'FEE_STRUCTURE':
        return { kind, grade: Number(grade), instalment: Number(instalment) as 1 | 2 | 3 | 4, newSchoolFee: n, reason: text };
      case 'CLEARANCE_RULE':
        if (!examId) return 'Choose the exam.';
        return { kind, examId, categories: cats, uptoInstalment: Number(instalment) as 1 | 2 | 3 | 4, reason: text };
    }
  };

  const submit = async () => {
    const p = payload();
    if (typeof p === 'string') return setError(p);
    if (!existing && title.trim().length < 5) return setError('Give the request a short title.');
    setBusy(true);
    const err = await onSave(title, p);
    setBusy(false);
    setError(err);
  };

  const studentPicker = (
    <Field label="Student">
      <select value={studentId} onChange={e => { setStudentId(e.target.value); setChargeIds([]); setPaymentId(''); }} className={inputClass} disabled={Boolean(existing)}>
        <option value="">Choose…</option>
        {(students.data ?? []).map(s => (
          <option key={s.student.id} value={s.student.id}>{s.student.name} · {s.student.grade}-{s.student.section} · due {formatINR(s.outstanding)}</option>
        ))}
      </select>
    </Field>
  );

  return (
    <div className="space-y-3 text-sm">
      {existing?.status === 'APPROVED' && (
        <p role="alert" className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900">
          This request is already approved. Saving a change blocks execution until the Principal approves it again.
        </p>
      )}
      {!existing && <Field label="Title"><input value={title} onChange={e => setTitle(e.target.value.slice(0, 100))} className={inputClass} placeholder="e.g. Financial support for Kavya Reddy" /></Field>}

      {kind === 'FEE_CONCESSION' && (
        <>
          {studentPicker}
          {studentId && (
            <Field label="Charges (outstanding only)">
              {account.status === 'loading' ? <LoadingBlock lines={1} /> : lines.length === 0 ? <p className="text-slate-500">Nothing outstanding.</p> : (
                <div className="space-y-1">
                  {lines.map(l => (
                    <label key={l.charge.id} className="flex items-center gap-2 min-h-10">
                      <input type="checkbox" checked={chargeIds.includes(l.charge.id)} onChange={e => setChargeIds(c => (e.target.checked ? [...c, l.charge.id] : c.filter(x => x !== l.charge.id)))} className="w-5 h-5" />
                      <span>{l.charge.label} · instalment {l.charge.instalment} · outstanding {formatINR(l.outstanding)}</span>
                    </label>
                  ))}
                </div>
              )}
            </Field>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Amount per charge (₹)"><input inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value.replace(/\D/g, '').slice(0, 7))} className={inputClass} /></Field>
            <Field label="Type">
              <select value={concessionKind} onChange={e => setConcessionKind(e.target.value as FeeConcession['kind'])} className={inputClass}>
                {CONCESSION_KINDS.map(k => <option key={k} value={k}>{lower(k)}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Justification"><textarea value={text} onChange={e => setText(e.target.value.slice(0, 500))} rows={3} className={inputClass} /></Field>
        </>
      )}

      {kind === 'REFUND' && (
        <>
          {studentPicker}
          {studentId && (
            <Field label="Original payment">
              <select value={paymentId} onChange={e => setPaymentId(e.target.value)} className={inputClass} disabled={Boolean(existing)}>
                <option value="">Choose…</option>
                {(account.data?.payments ?? []).map(p => <option key={p.id} value={p.id}>{p.receiptNo} · {formatINR(p.amount)} · {formatDate(p.paidAt)}</option>)}
              </select>
            </Field>
          )}
          <Field label="Refund amount (₹)"><input inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value.replace(/\D/g, '').slice(0, 7))} className={inputClass} /></Field>
          <Field label="Reason"><textarea value={text} onChange={e => setText(e.target.value.slice(0, 300))} rows={2} className={inputClass} /></Field>
          <p className="text-slate-500">The original payment stays on record. The refund is a separate record.</p>
        </>
      )}

      {kind === 'LATE_FEE_WAIVER' && (
        <>
          {studentPicker}
          <Field label="Waiver amount (₹)"><input inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value.replace(/\D/g, '').slice(0, 7))} className={inputClass} /></Field>
          <Field label="Reason"><textarea value={text} onChange={e => setText(e.target.value.slice(0, 300))} rows={2} className={inputClass} /></Field>
        </>
      )}

      {(kind === 'EXAM_SCHEDULE' || kind === 'CLEARANCE_RULE') && (
        <Field label="Exam">
          <select value={examId} onChange={e => setExamId(e.target.value)} className={inputClass} disabled={Boolean(existing)}>
            <option value="">Choose…</option>
            {(exams.data ?? []).map(e => <option key={e.id} value={e.id}>{e.name} · starts {formatDate(e.startsOn)}</option>)}
          </select>
        </Field>
      )}

      {kind === 'EXAM_SCHEDULE' && (
        <>
          <Field label="New start date"><input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputClass} /></Field>
          <Field label="Reason"><textarea value={text} onChange={e => setText(e.target.value.slice(0, 300))} rows={2} className={inputClass} /></Field>
        </>
      )}

      {kind === 'CLEARANCE_RULE' && (
        <>
          <Field label="Fee categories that must be cleared">
            <div className="grid grid-cols-2 gap-1">
              {CATEGORIES.map(c => (
                <label key={c} className="flex items-center gap-2 min-h-10">
                  <input type="checkbox" checked={cats.includes(c)} onChange={e => setCats(x => (e.target.checked ? [...x, c] : x.filter(y => y !== c)))} className="w-5 h-5" />
                  <span>{lower(c)}</span>
                </label>
              ))}
            </div>
          </Field>
          <Field label="Up to instalment">
            <select value={instalment} onChange={e => setInstalment(e.target.value)} className={inputClass}>
              {[1, 2, 3, 4].map(i => <option key={i} value={i}>Instalment {i}</option>)}
            </select>
          </Field>
          <Field label="Reason"><textarea value={text} onChange={e => setText(e.target.value.slice(0, 300))} rows={2} className={inputClass} /></Field>
          <p className="text-slate-500">Payment alone never releases a hall ticket. The Class Teacher still releases it.</p>
        </>
      )}

      {kind === 'FEE_STRUCTURE' && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Class">
              <select value={grade} onChange={e => setGrade(e.target.value)} className={inputClass}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </Field>
            <Field label="Instalment">
              <select value={instalment} onChange={e => setInstalment(e.target.value)} className={inputClass}>
                {[1, 2, 3, 4].map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </Field>
            <Field label="School fee (₹)"><input inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value.replace(/\D/g, '').slice(0, 7))} className={inputClass} /></Field>
          </div>
          <Field label="Reason"><textarea value={text} onChange={e => setText(e.target.value.slice(0, 300))} rows={2} className={inputClass} /></Field>
        </>
      )}

      <ErrorBox message={error} />
      <PrimaryButton onClick={submit} loading={busy}>{existing ? 'Save changes' : 'Save draft'}</PrimaryButton>
      <LinkButton onClick={onCancel}>Cancel</LinkButton>
    </div>
  );
};
