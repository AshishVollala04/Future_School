/**
 * ComplaintService (Flow 5).
 *   Parent raises -> Admin (COMPLAINTS) responds / works on it -> Admin marks resolved
 *   -> Parent confirms (CLOSED) or reopens with a reason.
 * Safety concerns are flagged to the Principal automatically. Nothing is deleted.
 */
import type { Scope } from '../hooks/useScope';
import { Result } from '../types/session';
import { Complaint, ComplaintCategory } from '../types/domain';
import { getDb, saveDb } from '../mock/db';
import { AccessDenied, guarded, RuleError, studentInScope } from './mock/guard';
import { requireAdmin } from './mock/permissions';
import { auditService } from './auditService';
import { USE_BACKEND } from '../app/backendConfig';
import { ApiComplaintService } from './api/officeApiServices';

export interface ComplaintView extends Complaint {
  studentName: string;
  classLabel: string;
}

export interface ComplaintService {
  listMine(scope: Scope): Promise<Result<Complaint[]>>;
  raise(scope: Scope, req: { category: ComplaintCategory; subject: string; description: string }, parentName: string): Promise<Result<Complaint>>;
  confirmResolved(scope: Scope, id: string): Promise<Result<Complaint>>;
  reopen(scope: Scope, id: string, reason: string): Promise<Result<Complaint>>;
  listForSchool(scope: Scope): Promise<Result<ComplaintView[]>>;
  respond(scope: Scope, id: string, note: string, status: 'IN_PROGRESS' | 'RESOLVED'): Promise<Result<Complaint>>;
}

const now = () => new Date().toISOString();

class MockComplaintService implements ComplaintService {
  private mine(scope: Scope, id: string) {
    const s = studentInScope(scope);
    const db = getDb(scope.schoolId);
    const c = db.complaints.find(x => x.id === id && x.studentId === s.id);
    if (!c) throw new AccessDenied('Complaint not found.');
    return { db, c };
  }

  listMine(scope: Scope) {
    return guarded(() => {
      if (scope.role !== 'PARENT') throw new AccessDenied();
      const s = studentInScope(scope);
      return getDb(scope.schoolId).complaints.filter(c => c.studentId === s.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    });
  }

  raise(scope: Scope, req: { category: ComplaintCategory; subject: string; description: string }, parentName: string) {
    return guarded(() => {
      if (scope.role !== 'PARENT') throw new AccessDenied();
      const s = studentInScope(scope);
      if (req.subject.trim().length < 5) throw new RuleError('Add a short subject.', 'SUBJECT');
      if (req.description.trim().length < 15) throw new RuleError('Describe the issue (15+ characters).', 'DESCRIPTION');
      const db = getDb(scope.schoolId);
      if (db.complaints.filter(c => c.studentId === s.id && ['OPEN', 'IN_PROGRESS', 'REOPENED'].includes(c.status)).length >= 5) {
        throw new RuleError('You have 5 open complaints. Please wait for the school to respond.', 'LIMIT');
      }
      const at = now();
      const c: Complaint = {
        id: `CMP-${scope.schoolId}-${Date.now().toString(36)}`, schoolId: scope.schoolId, studentId: s.id,
        raisedByGuardianId: scope.userId, raisedByName: parentName, category: req.category,
        subject: req.subject.trim().slice(0, 120), description: req.description.trim().slice(0, 1000),
        status: 'OPEN', createdAt: at, principalInformed: req.category === 'SAFETY',
        log: [{ at, by: scope.userId, byRole: 'PARENT', action: 'RAISED' }]
      };
      db.complaints.push(c);
      saveDb(db);
      auditService.record({ schoolId: scope.schoolId, action: 'COMPLAINT_RAISED', actorId: scope.userId, actorRole: scope.role, targetId: c.id, details: `${c.category}: ${c.subject}` });
      return c;
    });
  }

  confirmResolved(scope: Scope, id: string) {
    return guarded(() => {
      if (scope.role !== 'PARENT') throw new AccessDenied();
      const { db, c } = this.mine(scope, id);
      if (c.status !== 'RESOLVED') throw new RuleError('Only a resolved complaint can be confirmed.', 'STATE');
      c.status = 'CLOSED';
      c.log.push({ at: now(), by: scope.userId, byRole: 'PARENT', action: 'CONFIRMED' });
      saveDb(db);
      return c;
    });
  }

  reopen(scope: Scope, id: string, reason: string) {
    return guarded(() => {
      if (scope.role !== 'PARENT') throw new AccessDenied();
      const { db, c } = this.mine(scope, id);
      if (c.status !== 'RESOLVED') throw new RuleError('Only a resolved complaint can be reopened.', 'STATE');
      if (reason.trim().length < 10) throw new RuleError('Tell the school what is still not right.', 'REASON');
      c.status = 'REOPENED';
      c.log.push({ at: now(), by: scope.userId, byRole: 'PARENT', action: 'REOPENED', note: reason.trim().slice(0, 500) });
      saveDb(db);
      return c;
    });
  }

  listForSchool(scope: Scope) {
    return guarded(() => {
      requireAdmin(scope, 'COMPLAINTS');
      const db = getDb(scope.schoolId);
      const rank: Record<string, number> = { REOPENED: 0, OPEN: 1, IN_PROGRESS: 2, RESOLVED: 3, CLOSED: 4 };
      return db.complaints
        .map(c => {
          const s = db.students.find(x => x.id === c.studentId);
          return { ...c, studentName: s?.name ?? c.studentId, classLabel: s ? `${s.grade}-${s.section}` : '' };
        })
        .sort((a, b) => rank[a.status] - rank[b.status] || a.createdAt.localeCompare(b.createdAt));
    });
  }

  respond(scope: Scope, id: string, note: string, status: 'IN_PROGRESS' | 'RESOLVED') {
    return guarded(() => {
      requireAdmin(scope, 'COMPLAINTS');
      const db = getDb(scope.schoolId);
      const c = db.complaints.find(x => x.id === id);
      if (!c) throw new AccessDenied('Complaint not found.');
      if (c.status === 'CLOSED') throw new RuleError('The parent has closed this complaint.', 'STATE');
      if (note.trim().length < 10) throw new RuleError('Write a reply the parent will see (10+ characters).', 'NOTE');
      c.status = status;
      c.log.push({ at: now(), by: scope.userId, byRole: 'ADMIN', action: status === 'RESOLVED' ? 'RESOLVED' : 'RESPONDED', note: note.trim().slice(0, 1000) });
      saveDb(db);
      auditService.record({ schoolId: scope.schoolId, action: `COMPLAINT_${status}`, actorId: scope.userId, actorRole: scope.role, targetId: c.id, details: c.subject });
      return c;
    });
  }
}

export const complaintService: ComplaintService = USE_BACKEND ? new ApiComplaintService() : new MockComplaintService();
