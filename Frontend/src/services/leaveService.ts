/**
 * LeaveService (student leave).
 * Parent applies -> Class Teacher of that class approves/rejects -> parent sees the decision.
 * Approved leave is shown as CONTEXT in the attendance register; it never changes attendance by itself.
 */
import type { Scope } from '../hooks/useScope';
import { Result } from '../types/session';
import { LeaveRequest } from '../types/domain';
import { getDb, saveDb } from '../mock/db';
import { AccessDenied, guarded, RuleError, studentInScope } from './mock/guard';
import { auditService } from './auditService';
import { addDaysISO, daysBetween, todayISO } from '../utils/date';
import { USE_BACKEND } from '../app/backendConfig';
import { ApiLeaveService } from './api/leaveApiServices';

export interface LeaveService {
  listForChild(scope: Scope): Promise<Result<LeaveRequest[]>>;
  apply(scope: Scope, req: { fromDate: string; toDate: string; kind: LeaveRequest['kind']; reason: string }): Promise<Result<LeaveRequest>>;
  withdraw(scope: Scope, leaveId: string): Promise<Result<LeaveRequest>>;
  /** Class Teacher: requests for their class. */
  listForClass(scope: Scope, classSectionId: string): Promise<Result<(LeaveRequest & { studentName: string; rollNumber: string })[]>>;
  decide(scope: Scope, leaveId: string, decision: 'APPROVED' | 'REJECTED', note?: string, byName?: string): Promise<Result<LeaveRequest>>;
}

const MAX_DAYS = 15;

class MockLeaveService implements LeaveService {
  listForChild(scope: Scope) {
    return guarded(() => {
      const s = studentInScope(scope);
      return getDb(scope.schoolId).leaves.filter(l => l.studentId === s.id).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    });
  }

  apply(scope: Scope, req: { fromDate: string; toDate: string; kind: LeaveRequest['kind']; reason: string }) {
    return guarded(() => {
      if (scope.role !== 'PARENT') throw new AccessDenied('Leave is applied by the parent.');
      const s = studentInScope(scope);
      const reason = req.reason.trim();
      if (!req.fromDate || !req.toDate) throw new RuleError('Choose the dates.', 'DATES');
      if (req.toDate < req.fromDate) throw new RuleError('The end date is before the start date.', 'DATES');
      if (req.fromDate < addDaysISO(-7)) throw new RuleError('Leave can be applied up to 7 days after the absence.', 'DATES');
      if (daysBetween(req.fromDate, req.toDate) + 1 > MAX_DAYS) throw new RuleError(`For more than ${MAX_DAYS} days, please contact the school office.`, 'DATES');
      if (reason.length < 5) throw new RuleError('Add a short reason.', 'REASON');
      const db = getDb(scope.schoolId);
      const overlap = db.leaves.some(
        l => l.studentId === s.id && (l.status === 'PENDING' || l.status === 'APPROVED') && !(l.toDate < req.fromDate || l.fromDate > req.toDate)
      );
      if (overlap) throw new RuleError('There is already a leave request for these dates.', 'OVERLAP');
      const leave: LeaveRequest = {
        id: `LV-${scope.schoolId}-${Date.now().toString(36)}`,
        schoolId: scope.schoolId,
        studentId: s.id,
        classSectionId: s.classSectionId,
        fromDate: req.fromDate,
        toDate: req.toDate,
        kind: req.kind,
        reason: reason.slice(0, 500),
        requestedByGuardianId: scope.userId,
        requestedAt: new Date().toISOString(),
        status: 'PENDING'
      };
      db.leaves.push(leave);
      saveDb(db);
      return leave;
    });
  }

  withdraw(scope: Scope, leaveId: string) {
    return guarded(() => {
      const db = getDb(scope.schoolId);
      const l = db.leaves.find(x => x.id === leaveId);
      if (!l) throw new AccessDenied('Leave request not found.');
      studentInScope(scope, l.studentId);
      if (scope.role !== 'PARENT') throw new AccessDenied();
      if (l.status !== 'PENDING') throw new RuleError('Only a pending request can be withdrawn.', 'STATE');
      l.status = 'WITHDRAWN';
      saveDb(db);
      return l;
    });
  }

  listForClass(scope: Scope, classSectionId: string) {
    return guarded(() => {
      const db = getDb(scope.schoolId);
      const cs = db.classSections.find(c => c.id === classSectionId);
      if (!cs) throw new AccessDenied('Class not found.');
      if (!(scope.role === 'TEACHER' && cs.classTeacherStaffId === scope.userId) && scope.role !== 'PRINCIPAL') {
        throw new AccessDenied('Only the Class Teacher can review leave for this class.');
      }
      return db.leaves
        .filter(l => l.classSectionId === classSectionId && l.status !== 'WITHDRAWN')
        .map(l => {
          const st = db.students.find(x => x.id === l.studentId)!;
          return { ...l, studentName: st.name, rollNumber: st.rollNumber };
        })
        .sort((a, b) => Number(b.status === 'PENDING') - Number(a.status === 'PENDING') || b.requestedAt.localeCompare(a.requestedAt));
    });
  }

  decide(scope: Scope, leaveId: string, decision: 'APPROVED' | 'REJECTED', note?: string, byName = '') {
    return guarded(() => {
      const db = getDb(scope.schoolId);
      const l = db.leaves.find(x => x.id === leaveId);
      if (!l) throw new AccessDenied('Leave request not found.');
      const cs = db.classSections.find(c => c.id === l.classSectionId);
      if (!(scope.role === 'TEACHER' && cs?.classTeacherStaffId === scope.userId)) throw new AccessDenied('Only the Class Teacher decides leave.');
      if (l.status !== 'PENDING') throw new RuleError('This request was already decided.', 'STATE');
      if (decision === 'REJECTED' && !(note && note.trim().length >= 5)) throw new RuleError('Give the parent a short reason for rejecting.', 'REASON');
      l.status = decision;
      l.decision = { by: scope.userId, byName, at: new Date().toISOString(), note: note?.trim() || undefined };
      saveDb(db);
      auditService.record({
        schoolId: scope.schoolId, action: `LEAVE_${decision}`, actorId: scope.userId, actorRole: scope.role,
        targetId: l.studentId, details: `${l.fromDate} to ${l.toDate}`
      });
      return l;
    });
  }
}

export const leaveService: LeaveService = USE_BACKEND ? new ApiLeaveService() : new MockLeaveService();

/** Approved leave covering a date (used as register context). */
export function approvedLeaveOn(leaves: LeaveRequest[], studentId: string, date = todayISO()) {
  return leaves.find(l => l.studentId === studentId && l.status === 'APPROVED' && l.fromDate <= date && l.toDate >= date);
}
