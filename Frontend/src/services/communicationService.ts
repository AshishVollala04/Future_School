/**
 * CommunicationService: notices, parent-teacher messages, consent, meetings.
 *
 * Messaging rule: a parent can message ONLY the child's Class Teacher or the child's
 * assigned Subject Teachers. There is no teacher directory search.
 * Fees, complaints, leave and transport have their own workflows, not chat.
 *
 * Consent rule: a response is attributable to the guardian and is final from the
 * parent side; staff can never rewrite it (Declined -> Approved is impossible here).
 */
import type { Scope } from '../hooks/useScope';
import { Result } from '../types/session';
import { ConsentRequest, Meeting, MessageCategory, MessageThread, Notice } from '../types/domain';
import { getDb, saveDb } from '../mock/db';
import { AccessDenied, guarded, RuleError, studentInScope } from './mock/guard';
import { auditService } from './auditService';
import { todayISO } from '../utils/date';
import { USE_BACKEND } from '../app/backendConfig';
import { ApiCommunicationService } from './api/commsApiServices';

export interface Recipient {
  staffId: string;
  name: string;
  role: string; // 'Class Teacher' or the subject
}

export interface ConsentView extends Omit<ConsentRequest, 'responses'> {
  response?: ConsentRequest['responses'][string];
  expired: boolean;
}

export interface CommunicationService {
  getNotices(scope: Scope): Promise<Result<Notice[]>>;
  getRecipients(scope: Scope): Promise<Result<Recipient[]>>;
  getThreads(scope: Scope): Promise<Result<MessageThread[]>>;
  startThread(scope: Scope, req: { staffId: string; category: MessageCategory; subject: string; body: string }): Promise<Result<MessageThread>>;
  reply(scope: Scope, threadId: string, body: string): Promise<Result<MessageThread>>;
  getConsents(scope: Scope): Promise<Result<ConsentView[]>>;
  respondConsent(scope: Scope, consentId: string, decision: 'GIVEN' | 'DECLINED'): Promise<Result<ConsentView>>;
  getMeetings(scope: Scope): Promise<Result<Meeting[]>>;
}

const MAX_BODY = 1000;

class MockCommunicationService implements CommunicationService {
  getNotices(scope: Scope) {
    return guarded(() => {
      const s = scope.role === 'PARENT' ? studentInScope(scope) : null;
      return getDb(scope.schoolId)
        .notices.filter(n => n.audience === 'ALL' || !s || n.audience.includes(s.classSectionId))
        .sort((a, b) => {
          const rank = { EMERGENCY: 0, IMPORTANT: 1, NORMAL: 2 } as const;
          return rank[a.priority] - rank[b.priority] || b.publishedAt.localeCompare(a.publishedAt);
        });
    });
  }

  private recipientsFor(scope: Scope): Recipient[] {
    const s = studentInScope(scope);
    const cs = getDb(scope.schoolId).classSections.find(c => c.id === s.classSectionId);
    if (!cs) return [];
    const list: Recipient[] = [{ staffId: cs.classTeacherStaffId, name: cs.classTeacherName, role: 'Class Teacher' }];
    for (const t of cs.subjectTeachers) {
      const existing = list.find(r => r.staffId === t.staffId);
      if (existing) existing.role += ` · ${t.subject}`;
      else list.push({ staffId: t.staffId, name: t.name, role: t.subject });
    }
    return list;
  }

  getRecipients(scope: Scope) {
    return guarded(() => this.recipientsFor(scope));
  }

  getThreads(scope: Scope) {
    return guarded(() => {
      const s = studentInScope(scope);
      return getDb(scope.schoolId)
        .threads.filter(t => t.studentId === s.id)
        .sort((a, b) => (b.messages.at(-1)?.at ?? '').localeCompare(a.messages.at(-1)?.at ?? ''));
    });
  }

  startThread(scope: Scope, req: { staffId: string; category: MessageCategory; subject: string; body: string }) {
    return guarded(() => {
      if (scope.role !== 'PARENT') throw new AccessDenied();
      const s = studentInScope(scope);
      const r = this.recipientsFor(scope).find(x => x.staffId === req.staffId);
      if (!r) throw new AccessDenied('You can message only your child’s class teacher or subject teachers.');
      const subject = req.subject.trim();
      const body = req.body.trim();
      if (!subject || !body) throw new RuleError('Add a subject and a message.', 'EMPTY');
      if (body.length > MAX_BODY) throw new RuleError(`Keep messages under ${MAX_BODY} characters.`, 'TOO_LONG');
      const db = getDb(scope.schoolId);
      const thread: MessageThread = {
        id: `TH-${scope.schoolId}-${Date.now().toString(36)}`,
        schoolId: scope.schoolId,
        studentId: s.id,
        teacherStaffId: r.staffId,
        teacherName: r.name,
        teacherRole: r.role,
        category: req.category,
        subject,
        messages: [{ from: 'PARENT', author: '', body, at: new Date().toISOString() }]
      };
      db.threads.push(thread);
      saveDb(db);
      return thread;
    });
  }

  reply(scope: Scope, threadId: string, body: string) {
    return guarded(() => {
      const db = getDb(scope.schoolId);
      const t = db.threads.find(x => x.id === threadId);
      if (!t) throw new AccessDenied('Conversation not found.');
      studentInScope(scope, t.studentId);
      const text = body.trim();
      if (!text) throw new RuleError('Write a message.', 'EMPTY');
      if (text.length > MAX_BODY) throw new RuleError(`Keep messages under ${MAX_BODY} characters.`, 'TOO_LONG');
      t.messages.push({ from: scope.role === 'PARENT' ? 'PARENT' : 'TEACHER', author: '', body: text, at: new Date().toISOString() });
      saveDb(db);
      return t;
    });
  }

  private consentView(c: ConsentRequest, studentId: string): ConsentView {
    const { responses, ...rest } = c;
    return { ...rest, response: responses[studentId], expired: c.dueOn < todayISO() };
  }

  getConsents(scope: Scope) {
    return guarded(() => {
      const s = studentInScope(scope);
      return getDb(scope.schoolId)
        .consents.filter(c => c.classSectionIds.includes(s.classSectionId))
        .map(c => this.consentView(c, s.id));
    });
  }

  respondConsent(scope: Scope, consentId: string, decision: 'GIVEN' | 'DECLINED') {
    return guarded(() => {
      if (scope.role !== 'PARENT') throw new AccessDenied('Only a parent can respond to consent.');
      const s = studentInScope(scope);
      const db = getDb(scope.schoolId);
      const c = db.consents.find(x => x.id === consentId && x.classSectionIds.includes(s.classSectionId));
      if (!c) throw new AccessDenied('Consent request not found.');
      if (c.responses[s.id]) throw new RuleError('You have already responded. Contact the school to change it.', 'ALREADY_RESPONDED');
      if (c.dueOn < todayISO()) throw new RuleError('The response window has closed.', 'EXPIRED');
      c.responses[s.id] = { decision, guardianId: scope.userId, at: new Date().toISOString() };
      saveDb(db);
      auditService.record({
        schoolId: scope.schoolId, action: 'CONSENT_RESPONSE', actorId: scope.userId, actorRole: scope.role,
        targetId: s.id, details: `${decision} for "${c.title}".`
      });
      return this.consentView(c, s.id);
    });
  }

  getMeetings(scope: Scope) {
    return guarded(() => {
      const s = studentInScope(scope);
      return getDb(scope.schoolId).meetings.filter(m => m.studentId === s.id).sort((a, b) => a.at.localeCompare(b.at));
    });
  }
}

export const communicationService: CommunicationService = USE_BACKEND ? new ApiCommunicationService() : new MockCommunicationService();
