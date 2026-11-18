/** "More" tab + the small parent pages that live under it (consent, notices). */
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MessageCircle, ChevronRight, ClipboardCheck, LogOut, MessageSquareWarning } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { communicationService } from '../../../services/communicationService';
import { alertService } from '../../../services/alertService';
import { EmptyState, ErrorState, LoadingBlock, Panel, Pill } from '../../../components/common/States';
import { ErrorBox } from '../../auth/authUi';
import { formatDate, formatDateTime } from '../../../utils/date';
import { ConfirmDialog } from '../../../components/ui/Modal';

export const ParentMore: React.FC = () => {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const items = [
    { to: '/parent/consent', key: 'consent', icon: ClipboardCheck },
    { to: '/parent/complaints', key: 'complaints', icon: MessageSquareWarning }
  ];
  return (
    <div className="space-y-4">
      <Panel className="divide-y divide-slate-100">
        {items.map(({ to, key, icon: Icon }) => (
          <Link key={key} to={to} className="flex items-center gap-3 px-3.5 min-h-14">
            <Icon className="w-5 h-5 text-blue-700" />
            <span className="flex-1 text-base font-medium">{t(`parent.more.${key}`)}</span>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </Link>
        ))}
      </Panel>
      {alertService.available && <WhatsAppSwitch />}
      <button
        type="button"
        onClick={() => setConfirmLogout(true)}
        className="w-full min-h-12 rounded-xl border border-rose-200 bg-white text-rose-700 font-semibold flex items-center justify-center gap-2"
      >
        <LogOut className="w-4 h-4" /> {t('nav.logout')}
      </button>
      <ConfirmDialog
        isOpen={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        onConfirm={() => {
          logout();
          navigate('/login', { replace: true });
        }}
        title="Log out?"
        description="You will need to sign in again to see your child's details."
        confirmLabel="Log out"
        variant="danger"
      />
    </div>
  );
};

/** The parent's own switch for school WhatsApp alerts (applies to all their children). */
const WhatsAppSwitch: React.FC = () => {
  const { t } = useTranslation();
  const q = useQuery(() => alertService.myPreference(), []);
  const [error, setError] = useState<string | null>(null);
  if (q.status !== 'ready') return null;
  const on = q.data.whatsappAlerts;
  const flip = async () => {
    setError(null);
    const r = await alertService.setMyPreference(!on);
    if (!r.ok) setError(r.error);
    q.reload();
  };
  return (
    <Panel className="p-3.5 space-y-2">
      <div className="flex items-center gap-3">
        <MessageCircle className="w-5 h-5 text-emerald-600 shrink-0" />
        <div className="flex-1">
          <p className="text-base font-medium">{t('parent.alerts.title')}</p>
          <p className="text-sm text-slate-600">{t('parent.alerts.hint')}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={t('parent.alerts.title')}
          onClick={flip}
          className={`shrink-0 w-12 h-7 rounded-full relative transition-colors ${on ? 'bg-emerald-600' : 'bg-slate-300'}`}
        >
          <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${on ? 'left-[1.375rem]' : 'left-0.5'}`} />
        </button>
      </div>
      <ErrorBox message={error} />
    </Panel>
  );
};

export const ParentConsentPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const scope = useScope();
  const q = useQuery(() => communicationService.getConsents(scope), [scope.schoolId, scope.studentId]);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ id: string; decision: 'GIVEN' | 'DECLINED' } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const respond = async () => {
    if (!confirming) return;
    setBusy(confirming.id);
    setError(null);
    const r = await communicationService.respondConsent(scope, confirming.id, confirming.decision);
    setBusy(null);
    setConfirming(null);
    if (!r.ok) setError(r.error);
    q.reload();
  };

  if (q.status === 'loading') return <LoadingBlock />;
  if (q.status === 'error') return <ErrorState message={q.error} onRetry={q.reload} />;
  if (q.data.length === 0) return <EmptyState title={t('parent.consent.none')} />;
  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold">{t('parent.more.consent')}</h1>
      <ErrorBox message={error} />
      {q.data.map(c => (
        <Panel key={c.id} className="p-3.5 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <p className="text-base font-semibold">{c.title}</p>
            {c.response ? (
              <Pill tone={c.response.decision === 'GIVEN' ? 'success' : 'neutral'}>{t(`parent.consent.${c.response.decision}`)}</Pill>
            ) : c.expired ? (
              <Pill tone="neutral">{t('parent.consent.closed')}</Pill>
            ) : (
              <Pill tone="warning">{t('parent.consent.pending')}</Pill>
            )}
          </div>
          <p className="text-sm text-slate-600">{c.details}</p>
          <p className="text-xs text-slate-500">{t('parent.home.dueBy', { date: formatDate(c.dueOn, i18n.language) })}</p>
          {c.response ? (
            <p className="text-xs text-slate-500">{t('parent.consent.respondedAt', { at: formatDateTime(c.response.at, i18n.language) })}</p>
          ) : !c.expired && confirming?.id === c.id ? (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <p className="text-sm">{t('parent.consent.confirm', { decision: t(`parent.consent.${confirming.decision}`) })}</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setConfirming(null)} className="min-h-11 rounded-xl border border-slate-300 font-semibold">{t('login.cancel')}</button>
                <button onClick={respond} disabled={busy === c.id} className="min-h-11 rounded-xl bg-blue-700 text-white font-semibold">{t('common.confirm')}</button>
              </div>
            </div>
          ) : (
            !c.expired && (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setConfirming({ id: c.id, decision: 'DECLINED' })} className="min-h-11 rounded-xl border border-slate-300 font-semibold">{t('parent.consent.decline')}</button>
                <button onClick={() => setConfirming({ id: c.id, decision: 'GIVEN' })} className="min-h-11 rounded-xl bg-blue-700 text-white font-semibold">{t('parent.consent.give')}</button>
              </div>
            )
          )}
        </Panel>
      ))}
    </div>
  );
};

export const ParentNoticesPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const scope = useScope();
  const q = useQuery(() => communicationService.getNotices(scope), [scope.schoolId, scope.studentId]);
  if (q.status === 'loading') return <LoadingBlock />;
  if (q.status === 'error') return <ErrorState message={q.error} onRetry={q.reload} />;
  if (q.data.length === 0) return <EmptyState title={t('parent.notices.none')} />;
  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold">{t('parent.more.notices')}</h1>
      {q.data.map(n => (
        <Panel key={n.id} className={`p-3.5 ${n.priority === 'EMERGENCY' ? 'border-rose-300 bg-rose-50' : ''}`}>
          <div className="flex items-start justify-between gap-2">
            <p className="text-base font-semibold">{n.title}</p>
            {n.priority !== 'NORMAL' && <Pill tone={n.priority === 'EMERGENCY' ? 'danger' : 'warning'}>{t(`parent.notices.${n.priority}`)}</Pill>}
          </div>
          <p className="text-sm text-slate-700 mt-1">{n.body}</p>
          <p className="text-xs text-slate-500 mt-2">{formatDateTime(n.publishedAt, i18n.language)}</p>
        </Panel>
      ))}
    </div>
  );
};
