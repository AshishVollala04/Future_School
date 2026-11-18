/**
 * Fee desk (FINANCE): look up a student's fees and record cash received at the office.
 * Concessions and refunds are NOT done here; they go to "Changes needing approval".
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Search, TriangleAlert } from 'lucide-react';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { FeePaymentAlert, feeDeskService } from '../../../services/feeDeskService';
import { PdfService } from '../../../services/pdfService';
import { useTenant } from '../../../context/TenantContext';
import { EmptyState, ErrorState, LoadingBlock, MockLabel, Panel, Pill, Section } from '../../../components/common/States';
import { ErrorBox, PrimaryButton, inputClass } from '../../auth/authUi';
import { formatDate, formatDateTime, formatINR } from '../../../utils/date';
import { USE_BACKEND } from '../../../app/backendConfig';

const METHOD: Record<string, string> = { UPI: 'UPI', CARD: 'Card', NETBANKING: 'Net banking', CASH_AT_OFFICE: 'Cash at office' };

export const AdminFeeDesk: React.FC = () => {
  const scope = useScope();
  const { school } = useTenant();
  const [term, setTerm] = useState('');
  const [applied, setApplied] = useState('');
  const [studentId, setStudentId] = useState<string | null>(null);
  const list = useQuery(() => feeDeskService.search(scope, applied), [scope.schoolId, applied]);
  const acct = useQuery(() => (studentId ? feeDeskService.getAccount(scope, studentId) : Promise.resolve({ ok: true as const, data: null })), [scope.schoolId, studentId]);
  const alerts = useQuery<FeePaymentAlert[]>(
    () => (feeDeskService.getPaymentAlerts ? feeDeskService.getPaymentAlerts(scope) : Promise.resolve({ ok: true as const, data: [] })),
    [scope.schoolId]
  );
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const record = async () => {
    if (!studentId) return;
    setBusy(true);
    setError(null);
    const r = await feeDeskService.recordCashPayment(scope, studentId, Number(amount), note);
    setBusy(false);
    setConfirming(false);
    if (!r.ok) return setError(r.error);
    setDone(`Recorded ${formatINR(r.data.amount)} · receipt ${r.data.receiptNo}. Hall tickets still need Class Teacher release.`);
    setAmount('');
    setNote('');
    acct.reload();
    list.reload();
  };

  return (
    <div className="space-y-5 max-w-4xl xl:max-w-6xl">
      <div>
        <h1 className="text-xl font-bold">Fee desk</h1>
        <p className="text-sm text-slate-600">
          Record cash received at the office. Concessions and refunds need the Principal: <Link to="/admin/requests" className="text-blue-800 font-semibold underline">prepare a request</Link>.
        </p>
      </div>
      <form onSubmit={e => { e.preventDefault(); setApplied(term); }} className="flex gap-2">
        <input value={term} onChange={e => setTerm(e.target.value)} placeholder="Name, admission no. or class (10-A)" className={`${inputClass} flex-1`} aria-label="Search students" />
        <button type="submit" className="min-h-12 px-4 rounded-xl bg-blue-700 text-white font-semibold flex items-center gap-1.5"><Search className="w-4 h-4" /> Search</button>
      </form>

      {alerts.status === 'ready' && alerts.data.length > 0 && (
        <Panel className="p-4 border-amber-300 bg-amber-50 space-y-2">
          <p className="text-sm font-bold text-amber-900 flex items-center gap-2">
            <TriangleAlert className="w-4 h-4 text-amber-700 shrink-0" />
            Online payment reconciliation alerts ({alerts.data.length})
          </p>
          <ul className="space-y-1.5 text-xs text-amber-950">
            {alerts.data.slice(0, 5).map(a => (
              <li key={a.id} className="bg-white/70 rounded-lg px-3 py-2 border border-amber-200">
                <span className="font-semibold">{a.action === 'PAYMENT_CAPTURE_UNRECORDED' ? 'Action needed' : 'Late capture recorded'}:</span>{' '}
                {a.details} <span className="text-slate-500">({formatDateTime(a.at)})</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <Section title="Students">
          {list.status === 'loading' ? <LoadingBlock /> : list.status === 'error' ? <ErrorState message={list.error} onRetry={list.reload} /> : list.data.length === 0 ? <EmptyState title="No students found" /> : (
            <Panel className="divide-y divide-slate-100">
              {list.data.map(r => (
                <button key={r.student.id} onClick={() => { setStudentId(r.student.id); setDone(null); setError(null); }} className={`w-full p-3 flex items-center gap-3 text-left hover:bg-slate-50 ${studentId === r.student.id ? 'bg-blue-50' : ''}`}>
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium truncate">{r.student.name}</span>
                    <span className="block text-sm text-slate-500">{r.student.grade}-{r.student.section} · {r.student.admissionNo}</span>
                  </span>
                  {r.outstanding === 0 ? <Pill tone="success">Paid up</Pill> : <span className="text-right text-sm"><span className="block font-semibold">{formatINR(r.outstanding)}</span>{r.overdue > 0 && <span className="block text-rose-700">{formatINR(r.overdue)} overdue</span>}</span>}
                </button>
              ))}
            </Panel>
          )}
        </Section>

        <Section title="Account">
          {!studentId ? <EmptyState title="Choose a student" /> : acct.status === 'loading' ? <LoadingBlock /> : acct.status === 'error' ? <ErrorState message={acct.error} onRetry={acct.reload} /> : acct.data && (
            <div className="space-y-3">
              <Panel className="p-4 space-y-2">
                <p className="font-semibold">{acct.data.student.name} · {acct.data.student.grade}-{acct.data.student.section}</p>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div><p className="text-slate-500">Paid</p><p className="font-bold">{formatINR(acct.data.summary.totalPaid)}</p></div>
                  <div><p className="text-slate-500">Concession</p><p className="font-bold">{formatINR(acct.data.summary.totalConcession)}</p></div>
                  <div><p className="text-slate-500">Outstanding</p><p className="font-bold">{formatINR(acct.data.summary.totalOutstanding)}</p></div>
                </div>
                <ul className="text-sm divide-y divide-slate-100">
                  {acct.data.summary.instalments.map(i => (
                    <li key={i.number} className="py-1.5 flex justify-between gap-2">
                      <span>{`Term ${i.number}`} · due {formatDate(i.dueOn)}</span>
                      {i.outstanding === 0 ? <Pill tone="success">Paid</Pill> : <Pill tone={i.overdue ? 'danger' : 'warning'}>{formatINR(i.outstanding)}</Pill>}
                    </li>
                  ))}
                </ul>
              </Panel>

              {acct.data.summary.totalOutstanding > 0 && (
                <Panel className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">Record cash payment</p>
                    {!USE_BACKEND && <MockLabel />}
                  </div>
                  <label className="block">
                    <span className="block text-sm font-semibold mb-1">Amount received (₹)</span>
                    <input inputMode="numeric" value={amount} onChange={e => { setAmount(e.target.value.replace(/\D/g, '').slice(0, 7)); setConfirming(false); }} className={inputClass} />
                  </label>
                  <label className="block">
                    <span className="block text-sm font-semibold mb-1">Note (optional, e.g. counter slip no.)</span>
                    <input value={note} onChange={e => setNote(e.target.value.slice(0, 80))} className={inputClass} />
                  </label>
                  <p className="text-xs text-slate-500">Applied to the oldest dues first. Never write card, UPI PIN or bank details here.</p>
                  <ErrorBox message={error} />
                  {confirming ? (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 space-y-2">
                      <p className="text-sm">Record <b>{formatINR(Number(amount))}</b> cash for {acct.data.student.name}? Receipts cannot be deleted.</p>
                      <div className="flex gap-2">
                        <button onClick={() => setConfirming(false)} className="min-h-11 px-4 rounded-xl border border-slate-300 font-semibold">Back</button>
                        <PrimaryButton onClick={record} loading={busy}>Confirm</PrimaryButton>
                      </div>
                    </div>
                  ) : (
                    <PrimaryButton onClick={() => setConfirming(true)} disabled={!Number(amount)}>Record payment</PrimaryButton>
                  )}
                </Panel>
              )}
              {done && <p role="status" className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900">{done}</p>}

              <Section title="Receipts">
                {acct.data.payments.length === 0 ? <EmptyState title="No payments yet" /> : (
                  <Panel className="divide-y divide-slate-100 text-sm">
                    {acct.data.payments.map(p => (
                      <div key={p.id} className="p-3 flex items-center justify-between gap-2">
                        <span><span className="block font-medium">{p.receiptNo}</span><span className="text-slate-500">{formatDateTime(p.paidAt)} · {METHOD[p.method] ?? p.method}</span></span>
                        <span className="flex items-center gap-3">
                          <span className="text-right font-semibold">{formatINR(p.amount)}{acct.data!.refunds.filter(r => r.paymentId === p.id).map(r => <span key={r.id} className="block text-xs text-amber-800">Refund {formatINR(r.amount)}</span>)}</span>
                          <button
                            type="button"
                            onClick={() =>
                              PdfService.printFeeReceipt({
                                receiptNo: p.receiptNo,
                                schoolName: school?.name ?? 'FutureSchool',
                                schoolAddress: school?.contact.address,
                                studentName: acct.data!.student.name,
                                studentId: acct.data!.student.id,
                                classLabel: `${acct.data!.student.grade}-${acct.data!.student.section}`,
                                paidAt: p.paidAt,
                                method: METHOD[p.method] ?? p.method,
                                amount: p.amount,
                                providerRef: p.providerRef,
                                allocations: p.allocations.map(a => {
                                  const line = acct.data!.summary.instalments.flatMap(i => i.lines).find(l => l.charge.id === a.chargeId);
                                  return { label: line ? `Term ${line.charge.instalment} · ${line.charge.label}` : a.chargeId, amount: a.amount };
                                })
                              })
                            }
                            aria-label={`Print receipt ${p.receiptNo}`}
                            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-blue-700"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        </span>
                      </div>
                    ))}
                  </Panel>
                )}
              </Section>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
};
