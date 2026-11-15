/**
 * TeacherCommsService: the teacher's side of messages and homework.
 *  - A teacher sees and replies only to conversations addressed to them.
 *  - Only the Subject Teacher of a class + subject posts homework there, and only they update
 *    each student's status (PENDING / SUBMITTED / CHECKED).
 * Mock implementation below; VITE_BACKEND=api uses the server (same rules, enforced there).
 */
import type { Scope } from '../hooks/useScope';
import { Result } from '../types/session';
import { HomeworkItem, HomeworkStatus, MessageThread } from '../types/domain';
import { getDb, saveDb } from '../mock/db';
import { AccessDenied, guarded, RuleError } from './mock/guard';
import { todayISO } from '../utils/date';
import { USE_BACKEND } from '../app/backendConfig';
import { api } from './api/http';

export type TeacherThread = MessageThread & { studentName?: string; classLabel?: string };
export type TeacherHomework = Omit<HomeworkItem, 'statusByStudent'> & {
  classLabel: string;
  students: { id: string; name: string; rollNumber: string; status: HomeworkStatus }[];
};
export interface NewHomework {
  classSectionId: string;
  subject: string;
  title: string;
  instructions: string;
  dueOn: string;
  submissionType: HomeworkItem['submissionType'];
}

export interface TeacherCommsService {
  inbox(scope: Scope): Promise<Result<TeacherThread[]>>;
  reply(scope: Scope, threadId: string, body: string): Promise<Result<TeacherThread>>;
  myHomework(scope: Scope): Promise<Result<TeacherHomework[]>>;
  postHomework(scope: Scope, req: NewHomework): Promise<Result<HomeworkItem>>;
  setStatus(scope: Scope, homeworkId: string, studentId: string, status: HomeworkStatus): Promise<Result<{ id: string; studentId: string; status: HomeworkStatus }>>;
}

const MAX_BODY = 1000;
const last = (t: MessageThread) => t.messages[t.messages.length - 1]?.at ?? '';

class MockTeacherCommsService implements TeacherCommsService {
  private view(t: MessageThread): TeacherThread {
    const db = getDb(t.schoolId);
    const s = db.students.find(x => x.id === t.studentId);
    return { ...t, studentName: s?.name, classLabel: s ? `${s.grade}-${s.section}` : undefined };
  }

  inbox(scope: Scope) {
    return guarded(() => {
      if (scope.role !== 'TEACHER') throw new AccessDenied();
      return getDb(scope.schoolId).threads.filter(t => t.teacherStaffId === scope.userId).sort((a, b) => last(b).localeCompare(last(a))).map(t => this.view(t));
    });
  }

  reply(scope: Scope, threadId: string, body: string) {
    return guarded(() => {
      const db = getDb(scope.schoolId);
      const t = db.threads.find(x => x.id === threadId);
      if (!t || scope.role !== 'TEACHER' || t.teacherStaffId !== scope.userId) throw new AccessDenied('Conversation not found.');
      const text = body.trim();
      if (!text) throw new RuleError('Write a message.', 'EMPTY');
      if (text.length > MAX_BODY) throw new RuleError(`Keep messages under ${MAX_BODY} characters.`, 'TOO_LONG');
      t.messages.push({ from: 'TEACHER', author: t.teacherName, body: text, at: new Date().toISOString() });
      saveDb(db);
      return this.view(t);
    });
  }

  myHomework(scope: Scope) {
    return guarded(() => {
      if (scope.role !== 'TEACHER') throw new AccessDenied();
      const db = getDb(scope.schoolId);
      const mine = db.classSections.flatMap(cs => cs.subjectTeachers.filter(t => t.staffId === scope.userId).map(t => ({ cs, subject: t.subject, name: t.name })));
      return db.homework
        .filter(h => mine.some(m => m.cs.id === h.classSectionId && m.subject === h.subject))
        .sort((a, b) => b.dueOn.localeCompare(a.dueOn))
        .map(({ statusByStudent, ...h }) => {
          const cs = db.classSections.find(c => c.id === h.classSectionId)!;
          return {
            ...h,
            classLabel: `${cs.grade}-${cs.section}`,
            students: db.students
              .filter(s => s.classSectionId === cs.id && s.status === 'ACTIVE')
              .sort((a, b) => a.rollNumber.localeCompare(b.rollNumber))
              .map(s => ({ id: s.id, name: s.name, rollNumber: s.rollNumber, status: statusByStudent[s.id] ?? 'PENDING' }))
          };
        });
    });
  }

  postHomework(scope: Scope, req: NewHomework) {
    return guarded(() => {
      const db = getDb(scope.schoolId);
      const cs = db.classSections.find(c => c.id === req.classSectionId);
      const t = cs?.subjectTeachers.find(x => x.subject === req.subject && x.staffId === scope.userId);
      if (!cs || !t || scope.role !== 'TEACHER') throw new AccessDenied('Only the subject teacher of this class can post this homework.');
      if (req.title.trim().length < 3) throw new RuleError('Add a title.', 'TITLE');
      if (!req.dueOn || req.dueOn < todayISO()) throw new RuleError('The due date cannot be in the past.', 'DATES');
      const h: HomeworkItem = {
        id: `HW-${scope.schoolId}-${Date.now().toString(36)}`, schoolId: scope.schoolId, classSectionId: cs.id, subject: req.subject, teacherName: t.name,
        title: req.title.trim().slice(0, 200), instructions: req.instructions.trim().slice(0, 1000), assignedOn: todayISO(), dueOn: req.dueOn,
        submissionType: req.submissionType, statusByStudent: {}
      };
      db.homework.push(h);
      saveDb(db);
      return h;
    });
  }

  setStatus(scope: Scope, homeworkId: string, studentId: string, status: HomeworkStatus) {
    return guarded(() => {
      const db = getDb(scope.schoolId);
      const h = db.homework.find(x => x.id === homeworkId);
      const cs = h && db.classSections.find(c => c.id === h.classSectionId);
      if (!h || !cs || !cs.subjectTeachers.some(t => t.subject === h.subject && t.staffId === scope.userId)) throw new AccessDenied('Only the teacher who set this homework updates it.');
      if (!db.students.some(s => s.id === studentId && s.classSectionId === cs.id)) throw new AccessDenied('Student is not in this class.');
      h.statusByStudent[studentId] = status;
      saveDb(db);
      return { id: h.id, studentId, status };
    });
  }
}

class ApiTeacherCommsService implements TeacherCommsService {
  inbox = (_s: Scope) => api.get<TeacherThread[]>('/api/staff/messages');
  reply = (_s: Scope, threadId: string, body: string) => api.post<TeacherThread>(`/api/staff/messages/${encodeURIComponent(threadId)}/reply`, { body });
  myHomework = (_s: Scope) => api.get<TeacherHomework[]>('/api/staff/homework');
  postHomework = (_s: Scope, req: NewHomework) => api.post<HomeworkItem>('/api/staff/homework', req);
  setStatus = (_s: Scope, homeworkId: string, studentId: string, status: HomeworkStatus) =>
    api.post<{ id: string; studentId: string; status: HomeworkStatus }>(`/api/staff/homework/${encodeURIComponent(homeworkId)}/status`, { studentId, status });
}

export const teacherCommsService: TeacherCommsService = USE_BACKEND ? new ApiTeacherCommsService() : new MockTeacherCommsService();
