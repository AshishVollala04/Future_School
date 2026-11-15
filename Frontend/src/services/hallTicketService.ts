/**
 * HallTicketService.
 *
 * Rules:
 *  - Fee clearance is computed from the Admin-configured rule on the exam
 *    (categories + instalments). Result: CLEARED or PENDING, with reasons.
 *  - The Class Teacher of the student's class releases the hall ticket.
 *    Release requires CLEARED. Payment alone never releases it.
 *  - Principal emergency override: only for a CLEARED student, with a reason
 *    (min 10 chars), a fresh step-up OTP, and an audit entry.
 *  - Parents see the ticket only when available (cleared AND released/overridden).
 */
import type { Scope } from '../hooks/useScope';
import { Result } from '../types/session';
import { ExamWindow, HallTicketStatus, StudentRecord } from '../types/domain';
import { getDb, saveDb } from '../mock/db';
import { SchoolDb } from '../mock/db/seed';
import { computeFeeLines } from './feeService';
import { AccessDenied, guarded, RuleError, studentInScope } from './mock/guard';
import { authService } from './authService';
import { auditService } from './auditService';
import { formatINR, todayISO } from '../utils/date';
import { USE_BACKEND } from '../app/backendConfig';
import { ApiHallTicketService } from './api/parentApiServices';
import { withStaffHallTickets } from './api/staffApiServices';

const CATEGORY_LABEL: Record<string, string> = {
  SCHOOL_FEE: 'School fee',
  TRANSPORT_FEE: 'Transport fee',
  EXAM_FEE: 'Exam fee',
  ACTIVITY_FEE: 'Activity fee',
  EVENT_FEE: 'Event fee',
  OTHER: 'Other'
};

export interface HallTicketService {
  /** Parent / any staff: statuses for one student's upcoming exams. */
  getForStudent(scope: Scope, studentId?: string): Promise<Result<HallTicketStatus[]>>;
  /** Class Teacher: own class. Principal/Admin: any class in the school. */
  listForClass(scope: Scope, classSectionId: string, examId?: string): Promise<Result<HallTicketStatus[]>>;
  release(scope: Scope, examId: string, studentId: string): Promise<Result<HallTicketStatus>>;
  principalOverride(scope: Scope, examId: string, studentId: string, reason: string, stepUpToken: string): Promise<Result<HallTicketStatus>>;
}

export function computeStatus(db: SchoolDb, exam: ExamWindow, s: StudentRecord, today = todayISO()): HallTicketStatus {
  const lines = computeFeeLines(db, s.id, today).filter(
    l => exam.clearanceRule.categories.includes(l.charge.category) && l.charge.instalment <= exam.clearanceRule.uptoInstalment
  );
  const pendingReasons = lines
    .filter(l => l.outstanding > 0)
    .map(l => {
      const ins = db.instalments.find(i => i.number === l.charge.instalment);
      const label = ins?.label && /^term\s+\d+$/i.test(ins.label.trim()) ? ins.label.trim() : `Term ${l.charge.instalment}`;
      return `${label}: ${CATEGORY_LABEL[l.charge.category]} ${formatINR(l.outstanding)} pending`;
    });
  const feeClearance = pendingReasons.length ? 'PENDING' : 'CLEARED';
  const release = db.hallTicketReleases.find(r => r.examId === exam.id && r.studentId === s.id);
  const available = feeClearance === 'CLEARED' && Boolean(release);
  return {
    exam,
    student: { id: s.id, name: s.name, rollNumber: s.rollNumber, grade: s.grade, section: s.section },
    feeClearance,
    pendingReasons,
    release,
    available,
    hallTicketNo: available ? `${exam.name}-${s.grade}${s.section}-${s.rollNumber}` : undefined
  };
}

function upcomingExams(db: SchoolDb, grade: number, today = todayISO()) {
  return db.exams.filter(e => e.grades.includes(grade) && e.startsOn >= today).sort((a, b) => a.startsOn.localeCompare(b.startsOn));
}

function assertClassAccess(scope: Scope, db: SchoolDb, classSectionId: string) {
  const cs = db.classSections.find(c => c.id === classSectionId);
  if (!cs) throw new AccessDenied('Class not found in this school.');
  if (scope.role === 'PRINCIPAL' || scope.role === 'ADMIN') return cs;
  if (scope.role === 'TEACHER' && cs.classTeacherStaffId === scope.userId) return cs;
  throw new AccessDenied('Only the Class Teacher of this class can do this.');
}

class MockHallTicketService implements HallTicketService {
  getForStudent(scope: Scope, studentId?: string) {
    return guarded(() => {
      const s = studentInScope(scope, studentId);
      const db = getDb(scope.schoolId);
      return upcomingExams(db, s.grade).map(e => computeStatus(db, e, s));
    });
  }

  listForClass(scope: Scope, classSectionId: string, examId?: string) {
    return guarded(() => {
      const db = getDb(scope.schoolId);
      const cs = assertClassAccess(scope, db, classSectionId);
      const exam = examId ? db.exams.find(e => e.id === examId) : upcomingExams(db, cs.grade)[0];
      if (!exam) return [];
      return db.students
        .filter(s => s.classSectionId === cs.id && s.status === 'ACTIVE')
        .sort((a, b) => a.rollNumber.localeCompare(b.rollNumber))
        .map(s => computeStatus(db, exam, s));
    });
  }

  release(scope: Scope, examId: string, studentId: string) {
    return guarded(() => {
      if (scope.role !== 'TEACHER') throw new AccessDenied('Only the Class Teacher releases hall tickets.');
      const db = getDb(scope.schoolId);
      const s = studentInScope(scope, studentId);
      assertClassAccess(scope, db, s.classSectionId);
      const exam = db.exams.find(e => e.id === examId);
      if (!exam) throw new RuleError('Exam not found.', 'NOT_FOUND');
      const status = computeStatus(db, exam, s);
      if (status.release) throw new RuleError('Already released.', 'ALREADY_RELEASED');
      if (status.feeClearance !== 'CLEARED') {
        throw new RuleError(`Fee clearance is pending: ${status.pendingReasons.join('; ')}`, 'FEE_PENDING');
      }
      db.hallTicketReleases.push({ examId, studentId, releasedBy: scope.userId, releasedAt: new Date().toISOString() });
      saveDb(db);
      auditService.record({
        schoolId: scope.schoolId, action: 'HALL_TICKET_RELEASED', actorId: scope.userId, actorRole: scope.role,
        targetId: studentId, details: `${exam.name} hall ticket released by Class Teacher.`
      });
      return computeStatus(db, exam, s);
    });
  }

  principalOverride(scope: Scope, examId: string, studentId: string, reason: string, stepUpToken: string) {
    return guarded(() => {
      if (scope.role !== 'PRINCIPAL') throw new AccessDenied('Only the Principal can use the emergency override.');
      const db = getDb(scope.schoolId);
      const s = studentInScope(scope, studentId);
      const exam = db.exams.find(e => e.id === examId);
      if (!exam) throw new RuleError('Exam not found.', 'NOT_FOUND');
      const status = computeStatus(db, exam, s);
      if (status.release) throw new RuleError('Already released.', 'ALREADY_RELEASED');
      if (status.feeClearance !== 'CLEARED') throw new RuleError('Override is allowed only for a fee-cleared student.', 'FEE_PENDING');
      if (reason.trim().length < 10) throw new RuleError('Give a reason of at least 10 characters.', 'REASON_REQUIRED');
      if (!authService.consumeStepUp(stepUpToken, 'SENSITIVE_STAFF_ACTION')) throw new RuleError('Please confirm with the OTP again.', 'STEP_UP_REQUIRED');
      const at = new Date().toISOString();
      db.hallTicketReleases.push({ examId, studentId, releasedBy: scope.userId, releasedAt: at, principalOverride: { reason: reason.trim(), by: scope.userId, at } });
      saveDb(db);
      auditService.record({
        schoolId: scope.schoolId, action: 'HALL_TICKET_PRINCIPAL_OVERRIDE', actorId: scope.userId, actorRole: scope.role,
        targetId: studentId, details: `${exam.name} hall ticket released by Principal emergency override.`, reason: reason.trim()
      });
      return computeStatus(db, exam, s);
    });
  }
}

export const hallTicketService: HallTicketService = USE_BACKEND
  ? withStaffHallTickets(new ApiHallTicketService(new MockHallTicketService()))
  : new MockHallTicketService();
