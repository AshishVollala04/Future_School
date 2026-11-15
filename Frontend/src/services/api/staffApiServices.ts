/**
 * Backend-backed staff services: attendance register, marks to publication, staff hall-ticket tools,
 * class structure. Enabled with VITE_BACKEND=api. The server checks the role AND the relationship
 * (Class Teacher of this class, Subject Teacher of this subject) on every call.
 */
import type { Scope } from '../../hooks/useScope';
import { AttendanceMark, AttendanceSession, Assessment, ClassSection, HallTicketStatus, MarksSheet, ReportCard } from '../../types/domain';
import type { AttendanceService, RegisterView } from '../attendanceService';
import type { MarksService, SheetSummary, SheetView } from '../marksService';
import type { AcademicsService, TeacherAssignments } from '../academicsService';
import type { HallTicketService } from '../hallTicketService';
import { api } from './http';

const qs = (p: Record<string, string | number | undefined>) =>
  Object.entries(p)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');

const isStaff = (scope: Scope) => scope.role === 'TEACHER' || scope.role === 'PRINCIPAL' || scope.role === 'ADMIN';

type CardRow = ReportCard & { studentName: string; rollNumber: string };

export class ApiAttendanceService implements AttendanceService {
  getRegister(_scope: Scope, classSectionId: string, date: string, session: AttendanceSession) {
    return api.get<RegisterView>(`/api/staff/attendance/register?${qs({ classId: classSectionId, date, session })}`);
  }

  saveRegister(
    _scope: Scope,
    req: { classSectionId: string; date: string; session: AttendanceSession; marks: Record<string, AttendanceMark>; correctionReason?: string }
  ) {
    return api.post<RegisterView>('/api/staff/attendance/register', req);
  }
}

export class ApiMarksService implements MarksService {
  listMySheets = (_s: Scope) => api.get<SheetSummary[]>('/api/staff/marks/my-sheets');
  getSheet = (_s: Scope, sheetId: string) => api.get<SheetView>(`/api/staff/marks/sheet?${qs({ id: sheetId })}`);
  saveSheet = (_s: Scope, sheetId: string, rows: MarksSheet['rows'], submit: boolean) => api.post<SheetView>('/api/staff/marks/sheet', { id: sheetId, rows, submit });
  listClassSheets = (_s: Scope, assessmentId: string, classSectionId: string) =>
    api.get<SheetSummary[]>(`/api/staff/marks/class-sheets?${qs({ assessmentId, classId: classSectionId })}`);
  reviewSheet = (_s: Scope, sheetId: string, action: 'ACCEPT' | 'RETURN', reason?: string) => api.post<SheetView>('/api/staff/marks/review', { id: sheetId, action, reason });
  generateReportCards = (_s: Scope, assessmentId: string, classSectionId: string) =>
    api.post<ReportCard[]>('/api/staff/report-cards/generate', { assessmentId, classId: classSectionId });
  listReportCards = (_s: Scope, assessmentId: string, classSectionId: string) =>
    api.get<CardRow[]>(`/api/staff/report-cards?${qs({ assessmentId, classId: classSectionId })}`);
  updateRemark = (_s: Scope, cardId: string, remark: string) => api.post<ReportCard>('/api/staff/report-cards/remark', { id: cardId, remark });
  submitToPrincipal = (_s: Scope, assessmentId: string, classSectionId: string) =>
    api.post<ReportCard[]>('/api/staff/report-cards/submit', { assessmentId, classId: classSectionId });
  principalDecide = (_s: Scope, cardId: string, decision: 'APPROVE' | 'RETURN', note?: string) =>
    api.post<ReportCard>('/api/staff/report-cards/decision', { id: cardId, decision, note });
  listForPrincipal = (_s: Scope) => api.get<{ classSection: ClassSection; assessment: Assessment; cards: CardRow[] }[]>('/api/staff/report-cards/principal');
  publish = (_s: Scope, assessmentId: string, classSectionId: string) => api.post<{ published: number }>('/api/staff/results/publish', { assessmentId, classId: classSectionId });
  openAssessments = (_s: Scope, grade?: number) => api.get<Assessment[]>(`/api/staff/assessments/open?${qs({ grade })}`);
}

/** Class structure for staff from the server; parent data via the parent API service; the rest from the fallback. */
export class ApiStaffAcademics {
  constructor(private readonly next: AcademicsService) {}

  wrap(): AcademicsService {
    const next = this.next;
    return {
      getTeacherAssignments: (scope: Scope) => (isStaff(scope) ? api.get<TeacherAssignments>('/api/staff/assignments') : next.getTeacherAssignments(scope)),
      listClasses: (scope: Scope) => (isStaff(scope) ? api.get<ClassSection[]>('/api/staff/classes') : next.listClasses(scope)),
      getMyPeriods: (scope: Scope, day: number) => next.getMyPeriods(scope, day),
      getOverview: (scope: Scope) => next.getOverview(scope),
      getTimetable: (scope: Scope) => next.getTimetable(scope),
      getHomework: (scope: Scope) => next.getHomework(scope),
      getAttendance: (scope: Scope, days?: number) => next.getAttendance(scope, days),
      getPublishedResults: (scope: Scope) => next.getPublishedResults(scope)
    };
  }
}

/** Staff hall-ticket tools from the server; parent view from the given (parent-API) service. */
export function withStaffHallTickets(next: HallTicketService): HallTicketService {
  return {
    getForStudent: (scope, studentId) => next.getForStudent(scope, studentId),
    listForClass: (scope, classSectionId, examId) =>
      isStaff(scope) ? api.get<HallTicketStatus[]>(`/api/staff/hall-tickets?${qs({ classId: classSectionId, examId })}`) : next.listForClass(scope, classSectionId, examId),
    release: (scope, examId, studentId) => (isStaff(scope) ? api.post<HallTicketStatus>('/api/staff/hall-tickets/release', { examId, studentId }) : next.release(scope, examId, studentId)),
    principalOverride: (scope, examId, studentId, reason, stepUpToken) =>
      isStaff(scope)
        ? api.post<HallTicketStatus>('/api/staff/hall-tickets/override', { examId, studentId, reason, stepUpToken })
        : next.principalOverride(scope, examId, studentId, reason, stepUpToken)
  };
}
