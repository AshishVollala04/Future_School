/**
 * Parent-teacher messages. Recipients are limited to the child's Class Teacher and
 * assigned Subject Teachers. Formal issues are routed to their own workflows.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, PenSquare } from 'lucide-react';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { communicationService } from '../../../services/communicationService';
import { EmptyState, ErrorState, LoadingBlock, Panel } from '../../../components/common/States';
import { ErrorBox, PrimaryButton, LinkButton, inputClass } from '../../auth/authUi';
import { formatDateTime } from '../../../utils/date';
import { MessageCategory, MessageThread } from '../../../types/domain';

const CATEGORIES: MessageCategory[] = ['ACADEMIC_PROGRESS', 'HOMEWORK', 'ATTENDANCE', 'CONDUCT', 'EXAM_MARKS', 'GENERAL'];

export const ParentMessagesPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const scope = useScope();
  const key = [scope.schoolId, scope.studentId];
  const threads = useQuery(() => communicationService.getThreads(scope), key);
  const recipients = useQuery(() => communicationService.getRecipients(scope), key);
  const [openId, setOpenId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  const open = threads.data?.find(x => x.id === openId) ?? null;

  if (composing && recipients.status === 'ready') {
    return <Compose recipients={recipients.data} onCancel={() => setComposing(false)} onSent={th => { setComposing(false); threads.reload(); setOpenId(th.id); }} />;
  }
  if (open) return <ThreadView thread={open} onBack={() => setOpenId(null)} onChanged={threads.reload} />;

  return (
    <div className="space-y-4">
      <PrimaryButton onClick={() => setComposing(true)} disabled={recipients.status !== 'ready'}>
        <PenSquare className="w-4 h-4" /> {t('parent.messages.new')}
      </PrimaryButton>
      <p className="text-xs text-slate-500">
        {t('parent.messages.routing')}{' '}
        <Link to="/parent/complaints" className="underline">{t('parent.more.complaints')}</Link>,{' '}
        <Link to="/parent/leave" className="underline">{t('parent.more.leave')}</Link>,{' '}
        <Link to="/parent/transport" className="underline">{t('parent.more.transport')}</Link>.
      </p>
      {threads.status === 'loading' ? (
        <LoadingBlock />
      ) : threads.status === 'error' ? (
        <ErrorState message={threads.error} onRetry={threads.reload} />
      ) : threads.data.length === 0 ? (
        <EmptyState title={t('parent.messages.none')} />
      ) : (
        <ul className="space-y-2.5">
          {threads.data.map(th => {
            const last = th.messages[th.messages.length - 1];
            return (
              <li key={th.id}>
                <button type="button" onClick={() => setOpenId(th.id)} className="w-full text-left">
                  <Panel className="p-3.5 flex items-center gap-3">
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-blue-800 truncate">{th.teacherName} · {th.teacherRole}</span>
                      <span className="block text-base font-semibold truncate">{th.subject}</span>
                      <span className="block text-sm text-slate-500 truncate">{last?.body}</span>
                    </span>
                    <span className="text-xs text-slate-400 shrink-0">{last && formatDateTime(last.at, i18n.language)}</span>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </Panel>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

const Compose: React.FC<{
  recipients: { staffId: string; name: string; role: string }[];
  onCancel: () => void;
  onSent: (t: MessageThread) => void;
}> = ({ recipients, onCancel, onSent }) => {
  const { t } = useTranslation();
  const scope = useScope();
  const [staffId, setStaffId] = useState(recipients[0]?.staffId ?? '');
  const [category, setCategory] = useState<MessageCategory>('GENERAL');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await communicationService.startThread(scope, { staffId, category, subject, body });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onSent(r.data);
  };

  return (
    <form onSubmit={send} className="space-y-4">
      <h2 className="text-lg font-bold">{t('parent.messages.new')}</h2>
      <label className="block">
        <span className="block text-sm font-semibold text-slate-700 mb-1.5">{t('parent.messages.to')}</span>
        <select value={staffId} onChange={e => setStaffId(e.target.value)} className={inputClass}>
          {recipients.map(r => (
            <option key={r.staffId} value={r.staffId}>{r.name} · {r.role}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="block text-sm font-semibold text-slate-700 mb-1.5">{t('parent.messages.category')}</span>
        <select value={category} onChange={e => setCategory(e.target.value as MessageCategory)} className={inputClass}>
          {CATEGORIES.map(c => (
            <option key={c} value={c}>{t(`parent.messages.cat_${c}`)}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="block text-sm font-semibold text-slate-700 mb-1.5">{t('parent.messages.subject')}</span>
        <input value={subject} onChange={e => setSubject(e.target.value.slice(0, 120))} className={inputClass} />
      </label>
      <label className="block">
        <span className="block text-sm font-semibold text-slate-700 mb-1.5">{t('parent.messages.message')}</span>
        <textarea value={body} onChange={e => setBody(e.target.value.slice(0, 1000))} rows={5} className={inputClass} />
      </label>
      <ErrorBox message={error} />
      <PrimaryButton type="submit" loading={busy} disabled={!subject.trim() || !body.trim()}>{t('parent.messages.send')}</PrimaryButton>
      <LinkButton onClick={onCancel}>{t('login.cancel')}</LinkButton>
    </form>
  );
};

const ThreadView: React.FC<{ thread: MessageThread; onBack: () => void; onChanged: () => void }> = ({ thread, onBack, onChanged }) => {
  const { t, i18n } = useTranslation();
  const scope = useScope();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await communicationService.reply(scope, thread.id, body);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setBody('');
    onChanged();
  };

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="min-h-11 flex items-center gap-1 text-sm font-semibold text-blue-800">
        <ChevronLeft className="w-4 h-4" /> {t('login.back')}
      </button>
      <div>
        <p className="text-sm font-semibold text-blue-800">{thread.teacherName} · {thread.teacherRole}</p>
        <h2 className="text-lg font-bold">{thread.subject}</h2>
        <p className="text-xs text-slate-500">{t(`parent.messages.cat_${thread.category}`)}</p>
      </div>
      <ul className="space-y-2">
        {thread.messages.map((m, i) => (
          <li key={i} className={`flex ${m.from === 'PARENT' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${m.from === 'PARENT' ? 'bg-blue-700 text-white' : 'bg-white border border-slate-200'}`}>
              <p className="text-sm whitespace-pre-wrap">{m.body}</p>
              <p className={`text-[11px] mt-1 ${m.from === 'PARENT' ? 'text-blue-100' : 'text-slate-400'}`}>{formatDateTime(m.at, i18n.language)}</p>
            </div>
          </li>
        ))}
      </ul>
      <form onSubmit={send} className="space-y-2">
        <textarea value={body} onChange={e => setBody(e.target.value.slice(0, 1000))} rows={3} placeholder={t('parent.messages.reply')} className={inputClass} />
        <ErrorBox message={error} />
        <PrimaryButton type="submit" loading={busy} disabled={!body.trim()}>{t('parent.messages.send')}</PrimaryButton>
      </form>
    </div>
  );
};
