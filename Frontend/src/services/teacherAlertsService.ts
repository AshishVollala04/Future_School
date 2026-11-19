/**
 * Teacher bell alerts: which parent messages and priority notices are still "new" for this teacher.
 *
 *  - A parent message counts while its conversation is waiting for the teacher's reply
 *    (last message is from the parent) and arrived after the teacher last looked.
 *  - A notice counts when it is EMERGENCY or IMPORTANT and was published after the teacher last looked.
 *
 * "Looked" = opened the bell, or visited /teacher/messages or /teacher/notices. We remember the
 * newest timestamp seen (not the clock time), per school and per teacher, so a new message or a
 * new priority notice brings the badge back. Device-local: stored with the storage adapter.
 */
import type { Scope } from '../hooks/useScope';
import type { MessageThread, Notice } from '../types/domain';
import { storage } from './storage';

export interface AlertsSeen {
  messagesAt: string; // newest parent-message time already seen (ISO), '' = none
  noticesAt: string; // newest priority-notice time already seen (ISO), '' = none
}

const key = (scope: Scope) => `school:${scope.schoolId}:teacher-alerts-seen:${scope.userId}`;
const time = (iso: string | undefined) => (iso ? Date.parse(iso) || 0 : 0);
const later = (a: string, b: string) => (time(b) > time(a) ? b : a);

/** Conversations whose last message is from the parent (the teacher owes a reply). */
export const waitingThreads = <T extends MessageThread>(threads: T[]): T[] =>
  threads.filter(t => t.messages[t.messages.length - 1]?.from === 'PARENT');

export const lastMessageAt = (t: MessageThread): string => t.messages[t.messages.length - 1]?.at ?? '';

export const priorityNotices = (notices: Notice[]): Notice[] => notices.filter(n => n.priority === 'EMERGENCY' || n.priority === 'IMPORTANT');

export const teacherAlerts = {
  getSeen(scope: Scope): AlertsSeen {
    const s = storage.get<Partial<AlertsSeen>>(key(scope), {});
    return { messagesAt: s.messagesAt ?? '', noticesAt: s.noticesAt ?? '' };
  },

  unreadMessages<T extends MessageThread>(threads: T[], seen: AlertsSeen): T[] {
    return waitingThreads(threads).filter(t => time(lastMessageAt(t)) > time(seen.messagesAt));
  },

  unreadNotices(notices: Notice[], seen: AlertsSeen): Notice[] {
    return priorityNotices(notices).filter(n => time(n.publishedAt) > time(seen.noticesAt));
  },

  /** Marks every waiting parent message up to the newest one as seen. Returns the new state. */
  markMessagesSeen(scope: Scope, threads: MessageThread[]): AlertsSeen {
    const seen = this.getSeen(scope);
    const newest = waitingThreads(threads).map(lastMessageAt).reduce(later, seen.messagesAt);
    const next = { ...seen, messagesAt: newest };
    if (next.messagesAt !== seen.messagesAt) storage.set(key(scope), next);
    return next;
  },

  /** Marks every priority notice up to the newest one as seen. Returns the new state. */
  markNoticesSeen(scope: Scope, notices: Notice[]): AlertsSeen {
    const seen = this.getSeen(scope);
    const newest = priorityNotices(notices).map(n => n.publishedAt).reduce(later, seen.noticesAt);
    const next = { ...seen, noticesAt: newest };
    if (next.noticesAt !== seen.noticesAt) storage.set(key(scope), next);
    return next;
  }
};
