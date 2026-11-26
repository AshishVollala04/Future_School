/**
 * Parent Fees: the child's recorded dues per instalment (with the academic year), paid amounts,
 * concessions, due dates, overdue balance and the official receipts the school issued.
 *
 * There is no payment in the app: fees are paid at the school fee counter and recorded by the
 * school's finance staff, who issue the receipt. Parents can view and print those receipts.
 * Paying fees does not release a hall ticket by itself: the Class Teacher releases it after clearance.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, ChevronLeft, Download, Receipt, Lock, Building2 } from 'lucide-react';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { feeService } from '../../../services/feeService';
import { PdfService } from '../../../services/pdfService';
import { EmptyState, ErrorState, LoadingBlock, MockLabel, Panel, Pill, Section } from '../../../components/common/States';
import { Modal } from '../../../components/ui/Modal';
import { formatDate, formatDateTime, formatINR } from '../../../utils/date';
import { Payment } from '../../../types/domain';
import { useTenant } from '../../../context/TenantContext';

const formatTermTitle = (n: number, label: string) =>
  /^term\s+\d+$/i.test(label.trim()) ? label.trim() : `Term ${n}`;

export const ParentFeesPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const scope = useScope();
  const { school } = useTenant();
  const key = [scope.schoolId, scope.studentId];
  const live = { refreshOnDataChange: true, refreshIntervalMs: 30_000 };
  const summary = useQuery(() => feeService.getSummary(scope), key, live);
  const history = useQuery(() => feeService.listPayments(scope), key, live);
  const [tab, setTab] = React.useState<'dues' | 'history'>('dues');
  const [receipt, setReceipt] = React.useState<Payment | null>(null);
  const lang = i18n.language;

  if (summary.status === 'loading') return <LoadingBlock />;
  if (summary.status === 'error') return <ErrorState message={summary.error} onRetry={summary.reload} />;
  const s = summary.data;
  // Show the year on each instalment when dues span more than one academic year (arrears or next year's fees).
  const years = new Set(s.instalments.map(i => i.academicYear).filter(Boolean));
  const showYear = years.size > 1;
  const termTitle = (number: number, label: string, year?: string | null) =>
    `${formatTermTitle(number, label)}${showYear && year ? ` · ${year}` : ''}`;
  const lineLabel = (chargeId: string) => {
    for (const ins of s.instalments) {
      const line = ins.lines.find(l => l.charge.id === chargeId);
      if (line) return `${termTitle(ins.number, ins.label, ins.academicYear)} · ${line.charge.label}`;
    }
    return chargeId;
  };

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
              {s.instalments.map(ins => (
                <li key={`${ins.academicYearId ?? 'year'}-${ins.number}`}>
                  <Panel className="p-3.5">
                    <div className="flex items-center gap-3">
                      {ins.outstanding > 0 ? (
                        <Receipt className="w-6 h-6 text-slate-400" aria-hidden />
                      ) : (
                        <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                      )}
                      <span className="flex-1 min-w-0">
                        <span className="block text-base font-semibold">{termTitle(ins.number, ins.label, ins.academicYear)}</span>
                        <span className="block text-sm text-slate-500">{t('parent.fees.dueOn', { date: formatDate(ins.dueOn, lang) })}</span>
                      </span>
                      <span className="text-right">
                        <span className="block text-base font-bold">{ins.outstanding > 0 ? formatINR(ins.outstanding) : t('parent.fees.paidUp')}</span>
                        {ins.overdue && <Pill tone="danger">{t('parent.fees.overdue')}</Pill>}
                      </span>
                    </div>
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
              ))}
            </ul>
            {s.lateFeeNote && <p className="text-xs text-slate-500">{s.lateFeeNote}</p>}
          </Section>

          {s.totalOutstanding > 0 ? (
            <Panel className="p-4 space-y-3.5 border-rose-200 bg-rose-50/50 dark:bg-rose-950/20">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Fees due: {formatINR(s.totalOutstanding)}</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                    A hall ticket is released only after the fees required for that exam are cleared.
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs space-y-2">
                <p className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-blue-600" />
                  <span>How to pay:</span>
                </p>
                <ol className="list-decimal pl-4 space-y-1 text-slate-600 dark:text-slate-300">
                  <li>Pay at the school fee counter.</li>
                  <li>Give your child's admission number to the school accountant.</li>
                  <li>The fee office records the payment and issues a receipt. Your balance and receipts update here.</li>
                  <li>Once the exam's fees are cleared, the class teacher releases the hall ticket.</li>
                </ol>
              </div>
            </Panel>
          ) : (
            <Panel className="p-4 border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20">
              <div className="flex items-center gap-3 text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                <div>
                  <h3 className="text-sm font-bold">{t('parent.fees.allPaid')}</h3>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">No balance remaining. The class teacher releases hall tickets before each exam.</p>
                </div>
              </div>
            </Panel>
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
                  {p.isMock && <MockLabel>demo</MockLabel>}
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
                {receipt.allocations.map(a => (
                  <li key={a.chargeId} className="flex justify-between gap-2">
                    <span>{lineLabel(a.chargeId)}</span>
                    <span className="font-mono">{formatINR(a.amount)}</span>
                  </li>
                ))}
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
                  allocations: receipt.allocations.map(a => ({ label: lineLabel(a.chargeId), amount: a.amount }))
                })
              }
              className="w-full min-h-11 rounded-xl border border-blue-200 bg-blue-50 text-blue-800 font-semibold inline-flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" /> Print / Download Receipt PDF
            </button>
            <button
              type="button"
              onClick={() => setReceipt(null)}
              className="w-full min-h-11 rounded-xl border border-slate-200 bg-white text-slate-800 font-semibold inline-flex items-center justify-center gap-2"
            >
              <ChevronLeft className="w-4 h-4" /> {t('common.back')}
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
};
