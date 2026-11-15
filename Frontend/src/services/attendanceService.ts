/**
 * AttendanceService (Class Teacher register).
 * - Only the Class Teacher of the class records morning/afternoon attendance.
 * - Approved leave is returned as context; it is never applied automatically.
 * - Saving again with changes is a CORRECTION: needs a reason and is appended to history.
 */
import type { Scope } from '../hooks/useScope';
import { Result } from '../types/session';
import { AttendanceMark, AttendanceRegister, AttendanceSession, LeaveRequest } from '../types/domain';
import { getDb, saveDb } from '../mock/db';
import { AccessDenied, guarded, RuleError } from './mock/guard';
import { approvedLeaveOn } from './leaveService';
import { auditService } from './auditService';
import { todayISO } from '../utils/date';
import { USE_BACKEND } from '../app/backendConfig';
import { ApiAttendanceService } from './api/staffApiServices';

export interface RegisterRow {
  studentId: string;
  name: string;
  rollNumber: string;
  mark: AttendanceMark | null; // null = not yet recorded
  leave?: Pick<LeaveRequest, 'id' | 'kind' | 'fromDate' | 'toDate'>;
}

export interface RegisterView {
  classSectionId: string;
  date: string;
  session: AttendanceSession;
  saved: Pick<AttendanceRegister, 'savedAt' | 'savedBy' | 'history'> | null;
  rows: RegisterRow[];
}

export interface AttendanceService {
  getRegister(scope: Scope, classSectionId: string, date: string, session: AttendanceSession): Promise<Result<RegisterView>>;
  saveRegister(
    scope: Scope,
    req: { classSectionId: string; date: string; session: AttendanceSession; marks: Record<string, AttendanceMark>; correctionReason?: string }
  ): Promise<Result<RegisterView>>;
}

function assertClassTeacher(scope: Scope, classSectionId: string) {
  const cs = getDb(scope.schoolId).classSections.find(c => c.id === classSectionId);
  if (!cs) throw new AccessDenied('Class not found.');
  if (!(scope.role === 'TEACHER' && cs.classTeacherStaffId === scope.userId)) {
    throw new AccessDenied('Only the Class Teacher records attendance for this class.');
  }
  return cs;
}

const regId = (c: string, d: string, s: AttendanceSession) => `${c}:${d}:${s}`;

class MockAttendanceService implements AttendanceService {
  private view(scope: Scope, classSectionId: string, date: string, session: AttendanceSession): RegisterView {
    const db = getDb(scope.schoolId);
    const reg = db.registers.find(r => r.id === regId(classSectionId, date, session)) ?? null;
    const rows = db.students
      .filter(s => s.classSectionId === classSectionId && s.status === 'ACTIVE')
      .sort((a, b) => a.rollNumber.localeCompare(b.rollNumber))
      .map(s => {
        const lv = approvedLeaveOn(db.leaves, s.id, date);
        return {
          studentId: s.id,
          name: s.name,
          rollNumber: s.rollNumber,
          mark: reg?.marks[s.id] ?? null,
          leave: lv ? { id: lv.id, kind: lv.kind, fromDate: lv.fromDate, toDate: lv.toDate } : undefined
        };
      });
    return { classSectionId, date, session, saved: reg ? { savedAt: reg.savedAt, savedBy: reg.savedBy, history: reg.history } : null, rows };
  }

  getRegister(scope: Scope, classSectionId: string, date: string, session: AttendanceSession) {
    return guarded(() => {
      assertClassTeacher(scope, classSectionId);
      return this.view(scope, classSectionId, date, session);
    });
  }

  saveRegister(
    scope: Scope,
    req: { classSectionId: string; date: string; session: AttendanceSession; marks: Record<string, AttendanceMark>; correctionReason?: string }
  ) {
    return guarded(() => {
      assertClassTeacher(scope, req.classSectionId);
      if (req.date > todayISO()) throw new RuleError('Attendance cannot be recorded for a future date.', 'FUTURE');
      if (new Date(req.date + 'T00:00:00').getDay() === 0) throw new RuleError('Sunday is not a working day.', 'HOLIDAY');
      const db = getDb(scope.schoolId);
      const roster = db.students.filter(s => s.classSectionId === req.classSectionId && s.status === 'ACTIVE');
      const missing = roster.filter(s => !req.marks[s.id]);
      if (missing.length) throw new RuleError(`Mark every student first (${missing.length} left).`, 'INCOMPLETE');
      const id = regId(req.classSectionId, req.date, req.session);
      const existing = db.registers.find(r => r.id === id);
      const now = new Date().toISOString();
      const marks: Record<string, AttendanceMark> = {};
      roster.forEach(s => (marks[s.id] = req.marks[s.id]));

      if (!existing) {
        db.registers.push({ id, schoolId: scope.schoolId, classSectionId: req.classSectionId, date: req.date, session: req.session, marks, savedBy: scope.userId, savedAt: now, history: [] });
      } else {
        const changes = roster
          .filter(s => existing.marks[s.id] !== marks[s.id])
          .map(s => ({ studentId: s.id, from: existing.marks[s.id], to: marks[s.id] }));
        if (changes.length === 0) return this.view(scope, req.classSectionId, req.date, req.session);
        const reason = req.correctionReason?.trim() ?? '';
        if (reason.length < 5) throw new RuleError('This register was already saved. Give a reason for the correction.', 'REASON_REQUIRED');
        existing.history.push({ at: now, by: scope.userId, reason, changes });
        existing.marks = marks;
        auditService.record({
          schoolId: scope.schoolId, action: 'ATTENDANCE_CORRECTED', actorId: scope.userId, actorRole: scope.role,
          targetId: id, details: `${changes.length} change(s).`, reason
        });
      }
      saveDb(db);
      return this.view(scope, req.classSectionId, req.date, req.session);
    });
  }
}

export const attendanceService: AttendanceService = USE_BACKEND ? new ApiAttendanceService() : new MockAttendanceService();
