/**
 * Parent Fees: four instalments, pay one/several terms or a part amount, receipts and history.
 *
 * Payment is SIMULATED (prototype / mock). The flow mirrors production:
 *   backend creates order (amount + allocation decided server-side)
 *   -> OTP re-check -> hosted checkout (simulated) -> verified webhook (simulated) -> receipt.
 * No card number, CVV, UPI PIN, OTP or bank password is ever collected or stored.
 */
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Download, Receipt, ShieldCheck } from 'lucide-react';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { useAuth } from '../../../context/AuthContext';
import { feeService, PARTIAL_PAYMENT_MINIMUM } from '../../../services/feeService';
import { PdfService } from '../../../services/pdfService';
import { EmptyState, ErrorState, LoadingBlock, MockLabel, Panel, Pill, Section } from '../../../components/common/States';
import { Modal } from '../../../components/ui/Modal';
import { ErrorBox, PrimaryButton, LinkButton, inputClass } from '../../auth/authUi';
import { formatDate, formatDateTime, formatINR } from '../../../utils/date';
import { USE_BACKEND } from '../../../app/backendConfig';
import { Payment, PaymentOrder } from '../../../types/domain';
import { useTenant } from '../../../context/TenantContext';

const formatTermTitle = (n: number, label: string) =>
  /^term\s+\d+$/i.test(label.trim()) ? label.trim() : `Term ${n}`;

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayConstructor {
  new (opts: Record<string, unknown>): { open(): void };
}

function loadRazorpayCheckout(): Promise<RazorpayConstructor> {
  const w = window as unknown as { Razorpay?: RazorpayConstructor };
  if (w.Razorpay) return Promise.resolve(w.Razorpay);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.async = true;
    s.onload = () => (w.Razorpay ? resolve(w.Razorpay) : reject(new Error('Razorpay unavailable')));
    s.onerror = () => reject(new Error('Could not load Razorpay checkout'));
    document.body.appendChild(s);
  });
}

const METHODS: Payment['method'][] = ['UPI', 'CARD', 'NETBANKING'];

export const ParentFeesPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const scope = useScope();
  const { school } = useTenant();
  const { promptSensitiveActionAuth } = useAuth();
  const key = [scope.schoolId, scope.studentId];
  const summary = useQuery(() => feeService.getSummary(scope), key);
  const history = useQuery(() => feeService.listPayments(scope), key);
  const [tab, setTab] = useState<'dues' | 'history'>('dues');
  const [selected, setSelected] = useState<number[]>([]);
  const [mode, setMode] = useState<'TERMS' | 'PARTIAL'>('TERMS');
  const [partial, setPartial] = useState('');
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [method, setMethod] = useState<Payment['method']>('UPI');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Payment | null>(null);
  const lang = i18n.language;

  const payable = useMemo(() => (summary.data?.instalments ?? []).filter(i => i.outstanding > 0), [summary.data]);
  const selectedTotal = payable.filter(i => selected.includes(i.number)).reduce((a, i) => a + i.outstanding, 0);

  const toggle = (n: number) => {
    // Terms are paid in order: selecting a later term selects earlier unpaid ones too.
    const earlier = payable.filter(i => i.number <= n).map(i => i.number);
    setSelected(prev => (prev.includes(n) ? prev.filter(x => x < n) : Array.from(new Set([...prev, ...earlier]))));
  };

  const openRazorpay = async (ord: PaymentOrder) => {
    try {
      const Razorpay = await loadRazorpayCheckout();
      const rzp = new Razorpay({
        key: ord.razorpayKeyId,
        amount: ord.amountPaise ?? ord.amount * 100,
        currency: ord.currency ?? 'INR',
        name: school?.name ?? 'FutureSchool',
        description: `School fee (${ord.orderId})`,
        order_id: ord.razorpayOrderId,
        prefill: {
          name: ord.prefillName,
          contact: ord.prefillContact,
        },
        theme: { color: '#1E40AF' },
        handler: async (res: RazorpayResponse) => {
          setBusy(true);
          const v = await feeService.verifyPayment(scope, ord.orderId, {
            razorpayOrderId: res.razorpay_order_id,
            razorpayPaymentId: res.razorpay_payment_id,
            razorpaySignature: res.razorpay_signature,
            method: 'UPI',
          });
          setBusy(false);
          if (!v.ok) {
            setError(v.error);
            return;
          }
          setSelected([]);
          setPartial('');
          setReceipt(v.data);
          summary.reload();
          history.reload();
        },
        modal: {
          ondismiss: () => setBusy(false),
        },
      });
      rzp.open();
    } catch {
      setBusy(false);
      setError('Could not open Razorpay checkout. Please check your connection and try again.');
    }
  };

  const handleOrder = (ord: PaymentOrder) => {
    if (ord.provider === 'razorpay' && ord.razorpayOrderId && ord.razorpayKeyId) {
      void openRazorpay(ord);
      return;
    }
    setOrder(ord);
  };

  const startPayment = async () => {
    setError(null);
    const req = mode === 'TERMS' ? { instalments: selected } : { amount: Number(partial) };
    setBusy(true);
    const r = await feeService.createOrder(scope, req);
    setBusy(false);
    if (r.ok) {
      handleOrder(r.data);
      return;
    }
    if (r.code !== 'STEP_UP_REQUIRED') {
      setError(r.error);
      return;
    }
    const amt = mode === 'TERMS' ? selectedTotal : Number(partial);
    promptSensitiveActionAuth(
      t('parent.fees.confirmPayment', { amount: formatINR(amt) }),
      async token => {
        setBusy(true);
        const r2 = await feeService.createOrder(scope, { ...req, stepUpToken: token });
        setBusy(false);
        if (!r2.ok) {
          setError(r2.error);
          return;
        }
        handleOrder(r2.data);
      },
      'PAYMENT'
    );
  };

  const confirm = () => {
    if (!order) return;
    promptSensitiveActionAuth(
      t('parent.fees.confirmPayment', { amount: formatINR(order.amount) }),
      async token => {
        setBusy(true);
        const r = await feeService.confirmMockPayment(scope, order.orderId, method, token);
        setBusy(false);
        if (!r.ok) {
          setError(r.error);
          if (r.code !== 'STEP_UP_REQUIRED') setOrder(null);
          return;
        }
        setOrder(null);
        setSelected([]);
        setPartial('');
        setReceipt(r.data);
        summary.reload();
        history.reload();
      },
      'PAYMENT'
    );
  };

  if (summary.status === 'loading') return <LoadingBlock />;
  if (summary.status === 'error') return <ErrorState message={summary.error} onRetry={summary.reload} />;
  const s = summary.data;

  return (
    <div className="space-y-5">
      <Panel className="p-4">
        <p className="text-sm text-slate-500">{t('parent.fees.outstanding')}</p>
        <p className="text-3xl font-bold">{formatINR(s.totalOutstanding)}</p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          <Pill tone="neutral">{t('parent.fees.paid')}: {formatINR(s.totalPaid)}</Pill>
          {s.totalConcession > 0 && <Pill tone="info">{t('parent.fees.concession')}: {formatINR(s.totalConcession)}</Pill>}
          {s.overdueAmount > 0 && <Pill tone="danger">{t('parent.fees.overdue')}: {formatINR(s.overdueAmount)}</Pill>}
        </div>
      </Panel>

      <div role="tablist" className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-slate-200/70">
        {(['dues', 'history'] as const).map(x => (
          <button key={x} role="tab" aria-selected={tab === x} onClick={() => setTab(x)} className={`min-h-11 rounded-xl text-sm font-semibold ${tab === x ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-600'}`}>
            {t(`parent.fees.${x}`)}
          </button>
        ))}
      </div>

      {tab === 'dues' ? (
        <>
          <Section title={t('parent.fees.instalments')}>
            <ul className="space-y-2.5">
              {s.instalments.map(ins => {
                const isSel = selected.includes(ins.number);
                const clickable = ins.outstanding > 0 && mode === 'TERMS';
                return (
                  <li key={ins.number}>
                    <Panel className={`p-3.5 ${isSel ? 'border-blue-600 ring-1 ring-blue-600' : ''}`}>
                      <button type="button" disabled={!clickable} onClick={() => toggle(ins.number)} className="w-full text-left disabled:cursor-default">
                        <div className="flex items-center gap-3">
                          {ins.outstanding > 0 ? (
                            <span className={`w-6 h-6 rounded-md border-2 flex items-center justify-center ${isSel ? 'bg-blue-700 border-blue-700 text-white' : 'border-slate-300'}`} aria-hidden>
                              {isSel && '✓'}
                            </span>
                          ) : (
                            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                          )}
                          <span className="flex-1 min-w-0">
                            <span className="block text-base font-semibold">
                              {formatTermTitle(ins.number, ins.label)}
                            </span>
                            <span className="block text-sm text-slate-500">{t('parent.fees.dueOn', { date: formatDate(ins.dueOn, lang) })}</span>
                          </span>
                          <span className="text-right">
                            <span className="block text-base font-bold">{ins.outstanding > 0 ? formatINR(ins.outstanding) : t('parent.fees.paidUp')}</span>
                            {ins.overdue && <Pill tone="danger">{t('parent.fees.overdue')}</Pill>}
                          </span>
                        </div>
                      </button>
                      <ul className="mt-2 pl-9 space-y-0.5 text-sm text-slate-600">
                        {ins.lines.map(l => (
                          <li key={l.charge.id} className="flex justify-between gap-2">
                            <span className="truncate">{l.charge.label}{l.concession > 0 ? ` (−${formatINR(l.concession)})` : ''}</span>
                            <span className="font-mono">{l.outstanding > 0 ? formatINR(l.outstanding) : '✓'}</span>
                          </li>
                        ))}
                      </ul>
                    </Panel>
                  </li>
                );
              })}
            </ul>
            {s.lateFeeNote && <p className="text-xs text-slate-500">{s.lateFeeNote}</p>}
          </Section>

          {payable.length > 0 ? (
            <Panel className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold">{t('parent.fees.pay')}</h2>
                {!USE_BACKEND && <MockLabel />}
              </div>
              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100">
                {(['TERMS', 'PARTIAL'] as const).map(m => (
                  <button key={m} onClick={() => setMode(m)} className={`min-h-11 rounded-lg text-sm font-semibold ${mode === m ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-600'}`}>
                    {t(`parent.fees.mode_${m}`)}
                  </button>
                ))}
              </div>
              {mode === 'PARTIAL' && (
                <label className="block">
                  <span className="block text-sm font-semibold text-slate-700 mb-1.5">{t('parent.fees.amount')}</span>
                  <input inputMode="numeric" value={partial} onChange={e => setPartial(e.target.value.replace(/\D/g, '').slice(0, 7))} placeholder={String(PARTIAL_PAYMENT_MINIMUM)} className={inputClass} />
                  <span className="block text-xs text-slate-500 mt-1">{t('parent.fees.partialHelp', { min: formatINR(PARTIAL_PAYMENT_MINIMUM) })}</span>
                </label>
              )}
              <ErrorBox message={error} />
              <PrimaryButton
                onClick={startPayment}
                loading={busy && !order}
                disabled={mode === 'TERMS' ? selected.length === 0 : !partial}
              >
                {mode === 'TERMS' ? t('parent.fees.continueAmount', { amount: formatINR(selectedTotal) }) : t('parent.fees.continue')}
              </PrimaryButton>
            </Panel>
          ) : (
            <EmptyState title={t('parent.fees.allPaid')} icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />} />
          )}
        </>
      ) : history.status === 'loading' ? (
        <LoadingBlock />
      ) : history.status === 'error' ? (
        <ErrorState message={history.error} onRetry={history.reload} />
      ) : history.data.payments.length === 0 ? (
        <EmptyState title={t('parent.fees.noPayments')} />
      ) : (
        <ul className="space-y-2.5">
          {history.data.payments.map(p => (
            <li key={p.id}>
              <button type="button" onClick={() => setReceipt(p)} className="w-full text-left">
                <Panel className="p-3.5 flex items-center gap-3">
                  <Receipt className="w-5 h-5 text-blue-700" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-base font-semibold">{formatINR(p.amount)}</span>
                    <span className="block text-sm text-slate-500 truncate">
                      {formatDateTime(p.paidAt, lang)} · {t(`parent.fees.method_${p.method}`)} · {p.receiptNo}
                    </span>
                  </span>
                  {p.isMock && <MockLabel>mock</MockLabel>}
                </Panel>
              </button>
            </li>
          ))}
          {history.data.refunds.map(r => (
            <li key={r.id}>
              <Panel className="p-3.5 text-sm">
                {t('parent.fees.refund')}: {formatINR(r.amount)} · {r.status} · {r.reason}
              </Panel>
            </li>
          ))}
        </ul>
      )}

      {/* Simulated hosted checkout */}
      <Modal isOpen={Boolean(order)} onClose={() => !busy && setOrder(null)} title={t('parent.fees.checkout')}>
        {order && (
          <div className="space-y-4">
            <MockLabel>{t('parent.fees.mockCheckout')}</MockLabel>
            <p className="text-3xl font-bold">{formatINR(order.amount)}</p>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-700">{t('parent.fees.method')}</p>
              {METHODS.map(m => (
                <label key={m} className={`flex items-center gap-3 min-h-12 px-3 rounded-xl border ${method === m ? 'border-blue-600 bg-blue-50' : 'border-slate-200'}`}>
                  <input type="radio" name="method" checked={method === m} onChange={() => setMethod(m)} className="accent-blue-700" />
                  <span className="text-base">{t(`parent.fees.method_${m}`)}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-slate-500 flex items-start gap-1.5">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              {t('parent.fees.noSecrets')}
            </p>
            <ErrorBox message={error} />
            <PrimaryButton onClick={confirm} loading={busy}>
              {t('parent.fees.payAmount', { amount: formatINR(order.amount) })}
            </PrimaryButton>
            <LinkButton onClick={() => setOrder(null)} disabled={busy}>
              {t('login.cancel')}
            </LinkButton>
          </div>
        )}
      </Modal>

      <Modal isOpen={Boolean(receipt)} onClose={() => setReceipt(null)} title={t('parent.fees.receipt')}>
        {receipt && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-emerald-700 font-semibold">
              <CheckCircle2 className="w-5 h-5" /> {t('parent.fees.paymentRecorded')}
            </div>
            {receipt.isMock && <MockLabel>{t('parent.fees.mockReceipt')}</MockLabel>}
            <dl className="grid grid-cols-2 gap-y-1.5">
              <dt className="text-slate-500">{t('parent.fees.receiptNo')}</dt>
              <dd className="font-mono text-right">{receipt.receiptNo}</dd>
              <dt className="text-slate-500">{t('parent.fees.amount')}</dt>
              <dd className="text-right font-semibold">{formatINR(receipt.amount)}</dd>
              <dt className="text-slate-500">{t('parent.fees.method')}</dt>
              <dd className="text-right">{t(`parent.fees.method_${receipt.method}`)}</dd>
              <dt className="text-slate-500">{t('parent.fees.date')}</dt>
              <dd className="text-right">{formatDateTime(receipt.paidAt, lang)}</dd>
            </dl>
            <div>
              <p className="font-semibold mb-1">{t('parent.fees.allocation')}</p>
              <ul className="space-y-0.5">
                {receipt.allocations.map(a => {
                  const line = s.instalments.flatMap(i => i.lines).find(l => l.charge.id === a.chargeId);
                  return (
                    <li key={a.chargeId} className="flex justify-between">
                      <span>{line ? `Term ${line.charge.instalment} · ${line.charge.label}` : a.chargeId}</span>
                      <span className="font-mono">{formatINR(a.amount)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <p className="text-xs text-slate-500">{t('parent.fees.hallTicketNote')}</p>
            <button
              type="button"
              onClick={() =>
                PdfService.printFeeReceipt({
                  receiptNo: receipt.receiptNo,
                  schoolName: school?.name ?? 'FutureSchool',
                  schoolAddress: school?.contact.address,
                  studentName: receipt.studentId,
                  studentId: receipt.studentId,
                  paidAt: receipt.paidAt,
                  method: t(`parent.fees.method_${receipt.method}`),
                  amount: receipt.amount,
                  providerRef: receipt.providerRef,
                  allocations: receipt.allocations.map(a => {
                    const line = s.instalments.flatMap(i => i.lines).find(l => l.charge.id === a.chargeId);
                    return { label: line ? `Term ${line.charge.instalment} · ${line.charge.label}` : a.chargeId, amount: a.amount };
                  })
                })
              }
              className="w-full min-h-11 rounded-xl border border-blue-200 bg-blue-50 text-blue-800 font-semibold inline-flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" /> Print / Download Receipt PDF
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
};
