/**
 * Backend-backed parent communication (VITE_BACKEND=api): notices, messages to the child's
 * teachers only, consent (final), meetings, and homework. Always the session's child.
 */
import type { Scope } from '../../hooks/useScope';
import { Meeting, MessageCategory, MessageThread, Notice } from '../../types/domain';
import type { CommunicationService, ConsentView, Recipient } from '../communicationService';
import type { AcademicsService, HomeworkView } from '../academicsService';
import { api } from './http';

export class ApiCommunicationService implements CommunicationService {
  getNotices = (s: Scope) => api.get<Notice[]>(s.role === 'PARENT' ? '/api/parent/notices' : '/api/staff/notices');
  getRecipients = (_s: Scope) => api.get<Recipient[]>('/api/parent/messages/recipients');
  getThreads = (_s: Scope) => api.get<MessageThread[]>('/api/parent/messages');
  startThread = (_s: Scope, req: { staffId: string; category: MessageCategory; subject: string; body: string }) => api.post<MessageThread>('/api/parent/messages', req);
  reply = (_s: Scope, threadId: string, body: string) => api.post<MessageThread>(`/api/parent/messages/${encodeURIComponent(threadId)}/reply`, { body });
  getConsents = (_s: Scope) => api.get<ConsentView[]>('/api/parent/consents');
  respondConsent = (_s: Scope, consentId: string, decision: 'GIVEN' | 'DECLINED') => api.post<ConsentView>(`/api/parent/consents/${encodeURIComponent(consentId)}`, { decision });
  getMeetings = (_s: Scope) => api.get<Meeting[]>('/api/parent/meetings');
}

/** Parent homework from the server; everything else from the given service. */
export function withApiHomework(next: AcademicsService): AcademicsService {
  return { ...next, getHomework: s => (s.role === 'PARENT' ? api.get<HomeworkView[]>('/api/parent/homework') : next.getHomework(s)) };
}
