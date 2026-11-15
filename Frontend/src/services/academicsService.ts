/**
 * AcademicsService: read-only Child View data for a student.
 * Results: only PUBLISHED results are ever returned. Unpublished marks never reach the client.
 */
import type { Scope } from '../hooks/useScope';
import { Result } from '../types/session';
import { AttendanceDay, ClassSection, HomeworkItem, HomeworkStatus, PublishedResult, StudentRecord, TimetableSlot } from '../types/domain';
import { getDb } from '../mock/db';
import { AccessDenied, guarded, studentInScope } from './mock/guard';
import { addDaysISO, todayISO } from '../utils/date';
import { USE_BACKEND } from '../app/backendConfig';
import { ApiAcademicsService } from './api/parentApiServices';
import { ApiStaffAcademics } from './api/staffApiServices';
import { withApiTimetable } from './api/leaveApiServices';
import { withApiHomework } from './api/commsApiServices';

export interface ChildOverview {
  student: StudentRecord;
  classSection: ClassSection;
}

export interface HomeworkView extends Omit<HomeworkItem, 'statusByStudent'> {
  status: HomeworkStatus;
  overdue: boolean;
}

export interface AttendanceSummary {
  days: AttendanceDay[];
  workingSessions: number;
  presentSessions: number;
  percentage: number;
  absentDays: number;
  leaveDays: number;
}

/** Teacher's two hats, kept separate in the UI. */
export interface TeacherAssignments {
  classTeacherOf: ClassSection | null;
  teaching: { classSection: ClassSection; subject: string }[];
}

export interface AcademicsService {
  getTeacherAssignments(scope: Scope): Promise<Result<TeacherAssignments>>;
  /** Staff only: all classes in the school. */
  listClasses(scope: Scope): Promise<Result<ClassSection[]>>;
  /** Teacher: periods I teach on a weekday (1=Mon). */
  getMyPeriods(scope: Scope, day: number): Promise<Result<(TimetableSlot & { classLabel: string })[]>>;
  getOverview(scope: Scope): Promise<Result<ChildOverview>>;
  getTimetable(scope: Scope): Promise<Result<TimetableSlot[]>>;
  getHomework(scope: Scope): Promise<Result<HomeworkView[]>>;
  getAttendance(scope: Scope, days?: number): Promise<Result<AttendanceSummary>>;
  getPublishedResults(scope: Scope): Promise<Result<PublishedResult[]>>;
}

/** Deterministic mock attendance so the demo is stable. */
function mockAttendance(studentId: string, days: number): AttendanceDay[] {
  let h = 0;
  for (const ch of studentId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const out: AttendanceDay[] = [];
  for (let i = days; i >= 1; i--) {
    const date = addDaysISO(-i);
    if (new Date(date + 'T00:00:00').getDay() === 0) continue; // Sunday
    h = (h * 1103515245 + 12345) >>> 0;
    const r = h % 100;
    const m: AttendanceDay['morning'] = r < 4 ? 'A' : r < 6 ? 'L' : 'P';
    const a: AttendanceDay['afternoon'] = m !== 'P' ? m : r < 8 ? 'A' : 'P';
    out.push({ date, morning: m, afternoon: a });
  }
  return out;
}

class MockAcademicsService implements AcademicsService {
  getMyPeriods(scope: Scope, day: number) {
    return guarded(() => {
      if (scope.role !== 'TEACHER' && scope.role !== 'PRINCIPAL') throw new AccessDenied();
      const db = getDb(scope.schoolId);
      return db.classSections
        .flatMap(cs =>
          (db.timetables[cs.id] ?? [])
            .filter(s => s.day === day && cs.subjectTeachers.some(t => t.subject === s.subject && t.staffId === scope.userId))
            .map(s => ({ ...s, classLabel: `${cs.grade}-${cs.section}` }))
        )
        .sort((a, b) => a.start.localeCompare(b.start));
    });
  }

  listClasses(scope: Scope) {
    return guarded(() => {
      if (scope.role === 'PARENT') throw new AccessDenied();
      return [...getDb(scope.schoolId).classSections].sort((a, b) => b.grade - a.grade || a.section.localeCompare(b.section));
    });
  }

  getTeacherAssignments(scope: Scope) {
    return guarded(() => {
      const classes = getDb(scope.schoolId).classSections;
      return {
        classTeacherOf: classes.find(c => c.classTeacherStaffId === scope.userId) ?? null,
        teaching: classes.flatMap(c => c.subjectTeachers.filter(t => t.staffId === scope.userId).map(t => ({ classSection: c, subject: t.subject })))
      };
    });
  }

  getOverview(scope: Scope) {
    return guarded(() => {
      const student = studentInScope(scope);
      const classSection = getDb(scope.schoolId).classSections.find(c => c.id === student.classSectionId)!;
      return { student, classSection };
    });
  }

  getTimetable(scope: Scope) {
    return guarded(() => {
      const s = studentInScope(scope);
      return getDb(scope.schoolId).timetables[s.classSectionId] ?? [];
    });
  }

  getHomework(scope: Scope) {
    return guarded(() => {
      const s = studentInScope(scope);
      const today = todayISO();
      return getDb(scope.schoolId)
        .homework.filter(h => h.classSectionId === s.classSectionId)
        .map(({ statusByStudent, ...h }) => {
          const status = statusByStudent[s.id] ?? 'PENDING';
          return { ...h, status, overdue: status === 'PENDING' && h.dueOn < today };
        })
        .sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.dueOn.localeCompare(b.dueOn));
    });
  }

  getAttendance(scope: Scope, days = 30) {
    return guarded(() => {
      const s = studentInScope(scope);
      const db = getDb(scope.schoolId);
      // Generated history, overridden by registers the Class Teacher actually saved.
      const fromReg = (date: string, session: 'MORNING' | 'AFTERNOON') => {
        const m = db.registers.find(r => r.classSectionId === s.classSectionId && r.date === date && r.session === session)?.marks[s.id];
        return m ? (m === 'LATE' ? 'P' : m) : undefined;
      };
      const today = todayISO();
      const base = mockAttendance(s.id, days);
      if (fromReg(today, 'MORNING') || fromReg(today, 'AFTERNOON')) base.push({ date: today, morning: '-', afternoon: '-' });
      const list = base
        .map(d => ({ date: d.date, morning: fromReg(d.date, 'MORNING') ?? d.morning, afternoon: fromReg(d.date, 'AFTERNOON') ?? d.afternoon }))
        .filter(d => d.date < today || fromReg(d.date, 'MORNING') || fromReg(d.date, 'AFTERNOON'));
      const workingSessions = list.reduce((a, d) => a + (d.morning !== '-' ? 1 : 0) + (d.afternoon !== '-' ? 1 : 0), 0);
      const presentSessions = list.reduce((a, d) => a + (d.morning === 'P' ? 1 : 0) + (d.afternoon === 'P' ? 1 : 0), 0);
      return {
        days: list,
        workingSessions,
        presentSessions,
        percentage: workingSessions ? Math.round((presentSessions / workingSessions) * 1000) / 10 : 0,
        absentDays: list.filter(d => d.morning === 'A' && d.afternoon === 'A').length,
        leaveDays: list.filter(d => d.morning === 'L').length
      };
    });
  }

  getPublishedResults(scope: Scope) {
    return guarded(() => {
      const s = studentInScope(scope);
      return getDb(scope.schoolId)
        .results.filter(r => r.studentId === s.id)
        .sort((a, b) =>
          a.status !== b.status ? (a.status === 'CURRENT' ? -1 : 1) : b.publishedOn.localeCompare(a.publishedOn) || b.version - a.version
        );
    });
  }
}

export const academicsService: AcademicsService = USE_BACKEND
  ? withApiHomework(withApiTimetable(new ApiStaffAcademics(new ApiAcademicsService(new MockAcademicsService())).wrap()))
  : new MockAcademicsService();
