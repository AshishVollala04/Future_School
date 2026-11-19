/**
 * Teacher header bell: an orange badge with
 *   unread parent messages waiting for a reply + unread EMERGENCY/IMPORTANT notices.
 * Tapping it opens an Alerts dropdown (parent messages, latest notices). Opening the dropdown, or
 * visiting /teacher/messages or /teacher/notices, marks those alerts as seen (teacherAlertsService),
 * so the badge clears until a new parent message or a new priority notice arrives.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell, ChevronRight, Megaphone, MessageSquare } from 'lucide-react';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { teacherCommsService } from '../../../services/teacherCommsService';
import { communicationService } from '../../../services/communicationService';
import { AlertsSeen, lastMessageAt, teacherAlerts, waitingThreads } from '../../../services/teacherAlertsService';
import { onStaffDataChanged } from '../../../app/staffEvents';
import { formatDate } from '../../../utils/date';

const PRIORITY_PILL: Record<string, string> = {
  EMERGENCY: 'bg-rose-100 text-rose-800',
  IMPORTANT: 'bg-amber-100 text-amber-800',
  NORMAL: 'bg-slate-100 text-slate-600'
};

export const TeacherBell: React.FC = () => {
  const scope = useScope();
  const location = useLocation();
  const inbox = useQuery(() => teacherCommsService.inbox(scope), [scope.schoolId, scope.userId]);
  const notices = useQuery(() => communicationService.getNotices(scope), [scope.schoolId, scope.userId]);
  const [seen, setSeen] = useState<AlertsSeen>(() => teacherAlerts.getSeen(scope));
  // What counted as "seen" when the dropdown opened, so the new items stay highlighted while it is open.
  const [openedWith, setOpenedWith] = useState<AlertsSeen | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Fresh counts on every page change and after any staff action (reply, post, ...).
  const reloadInbox = inbox.reload;
  const reloadNotices = notices.reload;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    reloadInbox();
    reloadNotices();
  }, [location.pathname, reloadInbox, reloadNotices]);
  useEffect(
    () =>
      onStaffDataChanged(() => {
        reloadInbox();
        reloadNotices();
      }),
    [reloadInbox, reloadNotices]
  );

  const threads = inbox.data ?? [];
  const allNotices = notices.data ?? [];

  // useScope() builds a new object each render, so effects depend on its values, and the seen state
  // only changes when a timestamp actually moves (otherwise these effects would re-render forever).
  const { schoolId, userId } = scope;
  const applySeen = (next: AlertsSeen) =>
    setSeen(prev => (prev.messagesAt === next.messagesAt && prev.noticesAt === next.noticesAt ? prev : next));

  // Visiting the messages / notices page counts as viewing those alerts.
  const onMessages = location.pathname.startsWith('/teacher/messages');
  const onNotices = location.pathname.startsWith('/teacher/notices');
  useEffect(() => {
    if (onMessages && inbox.status === 'ready') applySeen(teacherAlerts.markMessagesSeen({ ...scope, schoolId, userId }, inbox.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onMessages, inbox.status, inbox.data, schoolId, userId]);
  useEffect(() => {
    if (onNotices && notices.status === 'ready') applySeen(teacherAlerts.markNoticesSeen({ ...scope, schoolId, userId }, notices.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onNotices, notices.status, notices.data, schoolId, userId]);

  const unreadMsgs = teacherAlerts.unreadMessages(threads, seen);
  const unreadNotices = teacherAlerts.unreadNotices(allNotices, seen);
  const count = unreadMsgs.length + unreadNotices.length;

  const open = openedWith !== null;
  const close = () => setOpenedWith(null);
  const toggle = () => {
    if (open) return close();
    setOpenedWith(seen);
    teacherAlerts.markMessagesSeen(scope, threads);
    applySeen(teacherAlerts.markNoticesSeen(scope, allNotices));
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [open]);
  // Close when navigating via a link inside the dropdown.
  useEffect(() => {
    setOpenedWith(null);
  }, [location.pathname]);

  const waiting = waitingThreads(threads).slice(0, 5);
  const latestNotices = [...allNotices].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, 4);
  const newMsg = new Set((openedWith ? teacherAlerts.unreadMessages(threads, openedWith) : []).map(t => t.id));
  const newNotice = new Set((openedWith ? teacherAlerts.unreadNotices(allNotices, openedWith) : []).map(n => n.id));

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={count ? `Alerts, ${count} new` : 'Alerts'}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative w-10 h-10 rounded-full flex items-center justify-center text-white bg-white/15 hover:bg-white/25 border border-white/30"
      >
        <Bell className="w-5 h-5" />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-orange-500 text-white text-[11px] font-bold flex items-center justify-center ring-2 ring-blue-700">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Alerts"
          className="fixed left-3 right-3 top-[4.5rem] sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96 z-50 bg-white text-slate-900 rounded-2xl shadow-2xl border border-slate-200 overflow-hidden fs-rise"
        >
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="font-bold">Alerts</p>
            <button type="button" onClick={close} className="text-sm font-semibold text-slate-500 hover:text-slate-800">Close</button>
          </div>

          <div className="max-h-[70vh] overflow-y-auto">
            <section className="p-3">
              <p className="px-1 pb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Messages from parents</p>
              {waiting.length === 0 ? (
                <p className="px-1 py-2 text-sm text-slate-500">No messages waiting for a reply.</p>
              ) : (
                <ul className="space-y-1">
                  {waiting.map(t => {
                    const lastMsg = t.messages[t.messages.length - 1];
                    return (
                      <li key={t.id}>
                        <Link to="/teacher/messages" className={`flex gap-3 p-2.5 rounded-xl hover:bg-slate-50 ${newMsg.has(t.id) ? 'bg-orange-50' : ''}`}>
                          <span className="w-9 h-9 shrink-0 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center"><MessageSquare className="w-4 h-4" /></span>
                          <span className="flex-1 min-w-0">
                            <span className="flex items-center gap-1.5">
                              <span className="font-semibold text-sm truncate">{t.studentName ?? 'Parent'}{t.classLabel ? ` · ${t.classLabel}` : ''}</span>
                              {newMsg.has(t.id) && <span className="shrink-0 px-1.5 rounded bg-orange-500 text-white text-[10px] font-bold">NEW</span>}
                            </span>
                            <span className="block text-xs font-medium text-slate-700 truncate">{t.subject}</span>
                            <span className="block text-xs text-slate-500 truncate">{lastMsg?.body}</span>
                          </span>
                          <span className="text-[11px] text-slate-400 shrink-0">{formatDate(lastMessageAt(t).slice(0, 10))}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
              <Link to="/teacher/messages" className="mt-1 flex items-center justify-end gap-0.5 px-1 text-sm font-semibold text-blue-700">
                Open messages <ChevronRight className="w-4 h-4" />
              </Link>
            </section>

            <section className="p-3 border-t border-slate-100">
              <p className="px-1 pb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">School notices</p>
              {latestNotices.length === 0 ? (
                <p className="px-1 py-2 text-sm text-slate-500">No notices yet.</p>
              ) : (
                <ul className="space-y-1">
                  {latestNotices.map(n => (
                    <li key={n.id}>
                      <Link to="/teacher/notices" className={`flex gap-3 p-2.5 rounded-xl hover:bg-slate-50 ${newNotice.has(n.id) ? 'bg-orange-50' : ''}`}>
                        <span className="w-9 h-9 shrink-0 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center"><Megaphone className="w-4 h-4" /></span>
                        <span className="flex-1 min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span className="font-semibold text-sm truncate">{n.title}</span>
                            {newNotice.has(n.id) && <span className="shrink-0 px-1.5 rounded bg-orange-500 text-white text-[10px] font-bold">NEW</span>}
                          </span>
                          <span className="flex items-center gap-1.5 mt-0.5">
                            <span className={`px-1.5 rounded text-[10px] font-bold ${PRIORITY_PILL[n.priority]}`}>{n.priority.toLowerCase()}</span>
                            <span className="text-[11px] text-slate-400">{formatDate(n.publishedAt.slice(0, 10))}</span>
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <Link to="/teacher/notices" className="mt-1 flex items-center justify-end gap-0.5 px-1 text-sm font-semibold text-blue-700">
                All notices <ChevronRight className="w-4 h-4" />
              </Link>
            </section>
          </div>
        </div>
      )}
    </div>
  );
};
