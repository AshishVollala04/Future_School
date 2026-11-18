/**
 * Principal: Admin requests (concessions, refunds, schedule and fee changes).
 * Approve (with OTP), return to Admin, or reject. The Admin executes after approval;
 * any change made after approval blocks execution until it is approved again.
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { useAuth } from '../../../context/AuthContext';
import { governanceService } from '../../../services/governanceService';
import { notifyStaffDataChanged } from '../../../app/staffEvents';
import { EmptyState, ErrorState, LoadingBlock, Panel, Pill } from '../../../components/common/States';
import { Modal } from '../../../components/ui/Modal';
import { ErrorBox, PrimaryButton, inputClass } from '../../auth/authUi';
import { ChangeRequest, ChangeStatus } from '../../../types/domain';
import { formatDateTime } from '../../../utils/date';

const TONE: Record<ChangeStatus, 'neutral' | 'warning' | 'info' | 'danger' | 'success'> = {
  DRAFT: 'neutral',
  PENDING_APPROVAL: 'warning',
  RETURNED: 'neutral',
  REJECTED: 'danger',
  APPROVED: 'info',
  EXECUTED: 'success',
  EXECUTION_BLOCKED: 'danger'
};

export const PrincipalRequests: React.FC = () => {
  const { t } = useTranslation();
  const scope = useScope();
  const { promptSensitiveActionAuth } = useAuth();
  const q = useQuery(() => governanceService.listForPrincipal(scope), [scope.schoolId]);
  const [filter, setFilter] = useState<'PENDING' | 'ALL'>('PENDING');
  const [open, setOpen] = useState<ChangeRequest | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (q.status === 'loading') return <LoadingBlock />;
  if (q.status === 'error') return <ErrorState message={q.error} onRetry={q.reload} />;
  const rows = q.data.filter(r => filter === 'ALL' || r.status === 'PENDING_APPROVAL');
  const statusLabel = (s: ChangeStatus) => t(`principal.req.status.${s}`);

  const close = () => {
    setOpen(null);
    setNote('');
    setError(null);
  };

  const decide = async (d: 'RETURN' | 'REJECT') => {
    if (!open) return;
    setBusy(true);
    const r = await governanceService.principalDecide(scope, open.id, d, note);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    close();
    q.reload();
    notifyStaffDataChanged();
  };

  const approve = () => {
    if (!open) return;
    promptSensitiveActionAuth(t('principal.req.sensitive', { title: open.title }), async token => {
      setBusy(true);
      const r = await governanceService.principalDecide(scope, open.id, 'APPROVE', note, token);
      setBusy(false);
      if (!r.ok) return setError(r.error);
      close();
      q.reload();
      notifyStaffDataChanged();
    });
  };

  return (
    <div className="space-y-4 max-w-4xl xl:max-w-6xl">
      <div>
        <h1 className="text-xl font-bold">{t('principal.req.title')}</h1>
        <p className="text-sm text-slate-600">{t('principal.req.subtitle')}</p>
      </div>
      <div className="inline-grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-200/70">
        {(['PENDING', 'ALL'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`min-h-10 px-4 rounded-lg text-sm font-semibold ${filter === f ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-600'}`}>
            {f === 'PENDING' ? t('principal.req.filterPending') : t('principal.req.filterAll')}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <EmptyState title={filter === 'PENDING' ? t('principal.req.nonePending') : t('principal.req.noneAll')} />
      ) : (
        <Panel className="divide-y divide-slate-100">
          {rows.map(r => (
            <button key={r.id} onClick={() => setOpen(r)} className="w-full p-3.5 flex flex-col sm:flex-row sm:items-center gap-2 text-left hover:bg-slate-50">
              <span className="flex-1 min-w-0">
                <span className="block font-semibold">{r.title}</span>
                <span className="block text-sm text-slate-500">{t('principal.req.preparedBy', { name: r.preparedByName, kind: r.kind.replace(/_/g, ' ').toLowerCase() })}</span>
              </span>
              {r.validationIssues.length > 0 && r.status === 'PENDING_APPROVAL' && <Pill tone="danger">{t('principal.req.issues', { count: r.validationIssues.length })}</Pill>}
              <Pill tone={TONE[r.status]}>{statusLabel(r.status)}</Pill>
            </button>
          ))}
        </Panel>
      )}

      <Modal isOpen={Boolean(open)} onClose={close} title={open?.title ?? ''}>
        {open && (
          <div className="space-y-3 text-sm">
            <Pill tone={TONE[open.status]}>{statusLabel(open.status)}</Pill>
            <ul className="space-y-1">
              {governanceService.describe(scope, open).map(l => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            {open.validationIssues.length > 0 && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900">
                <p className="font-semibold flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {t('principal.req.validation')}</p>
                <ul className="list-disc pl-5 mt-1">{open.validationIssues.map(i => <li key={i}>{i}</li>)}</ul>
              </div>
            )}
            <div>
              <p className="font-semibold mb-1">{t('principal.req.history')}</p>
              <ul className="space-y-0.5 text-slate-600">
                {open.history.map((h, i) => (
                  <li key={i}>{formatDateTime(h.at)} · {h.action.replace(/_/g, ' ').toLowerCase()}{h.note ? ` · ${h.note}` : ''}</li>
                ))}
              </ul>
            </div>
            {open.status === 'PENDING_APPROVAL' && (
              <>
                <label className="block">
                  <span className="block font-semibold text-slate-700 mb-1">{t('principal.act.noteReturnOrReject')}</span>
                  <textarea value={note} onChange={e => setNote(e.target.value.slice(0, 300))} rows={2} className={inputClass} />
                </label>
                <ErrorBox message={error} />
                <div className="grid sm:grid-cols-3 gap-2">
                  <button onClick={() => decide('REJECT')} disabled={busy} className="min-h-11 rounded-xl border border-rose-300 text-rose-800 font-semibold">{t('principal.act.reject')}</button>
                  <button onClick={() => decide('RETURN')} disabled={busy} className="min-h-11 rounded-xl border border-slate-300 font-semibold">{t('principal.act.returnToAdmin')}</button>
                  <PrimaryButton onClick={approve} loading={busy} disabled={open.validationIssues.length > 0}>{t('principal.act.approve')}</PrimaryButton>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
