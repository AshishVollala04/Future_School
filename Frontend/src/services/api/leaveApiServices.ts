/**
 * Backend-backed leave, teacher leave, substitution and timetables (VITE_BACKEND=api).
 * The server uses the session's child for parents and checks the Class Teacher / Principal /
 * ACADEMIC_OPS relationship for staff.
 */
import type { Scope } from '../../hooks/useScope';
import { LeaveRequest, SubstitutionSlot, TeacherLeave, TimetableSlot } from '../../types/domain';
import type { LeaveService } from '../leaveService';
import type { SubstitutionNeed, SubstitutionService } from '../substitutionService';
import type { StaffService } from '../staffService';
import type { AcademicsService } from '../academicsService';
import { api } from './http';

export class ApiLeaveService implements LeaveService {
  listForChild = (_s: Scope) => api.get<LeaveRequest[]>('/api/parent/leave');
  apply = (_s: Scope, req: { fromDate: string; toDate: string; kind: LeaveRequest['kind']; reason: string }) => api.post<LeaveRequest>('/api/parent/leave', req);
  withdraw = (_s: Scope, leaveId: string) => api.post<LeaveRequest>(`/api/parent/leave/${encodeURIComponent(leaveId)}/withdraw`, {});
  listForClass = (_s: Scope, classSectionId: string) =>
    api.get<(LeaveRequest & { studentName: string; rollNumber: string })[]>(`/api/staff/leave/class?classId=${encodeURIComponent(classSectionId)}`);
  decide = (_s: Scope, leaveId: string, decision: 'APPROVED' | 'REJECTED', note?: string) =>
    api.post<LeaveRequest>(`/api/staff/leave/${encodeURIComponent(leaveId)}/decision`, { decision, note });
}

export class ApiSubstitutionService implements SubstitutionService {
  listNeeds = (_s: Scope) => api.get<SubstitutionNeed[]>('/api/staff/substitution');
  assign = (_s: Scope, req: { leaveId: string; date: string; classSectionId: string; period: number; substituteStaffId: string }) =>
    api.post<SubstitutionSlot>('/api/staff/substitution', req);
  myDuties = (_s: Scope) => api.get<SubstitutionSlot[]>('/api/staff/substitution/my-duties');
}

/** Teacher leave from the server; overview and counts from the given service. */
export function withApiTeacherLeave(next: StaffService): StaffService {
  return {
    myLeaves: () => api.get<TeacherLeave[]>('/api/staff/my-leave'),
    applyLeave: (_s, req) => api.post<TeacherLeave>('/api/staff/my-leave', req),
    listTeacherLeave: () => api.get<TeacherLeave[]>('/api/staff/teacher-leave'),
    decideTeacherLeave: (_s, id, decision, note) => api.post<TeacherLeave>(`/api/staff/teacher-leave/${encodeURIComponent(id)}/decision`, { decision, note }),
    getOverview: s => next.getOverview(s)
  };
}

/** Parent timetable and teacher periods from the server; the rest from the given service. */
export function withApiTimetable(next: AcademicsService): AcademicsService {
  return {
    ...next,
    getTeacherAssignments: s => next.getTeacherAssignments(s),
    listClasses: s => next.listClasses(s),
    getOverview: s => next.getOverview(s),
    getHomework: s => next.getHomework(s),
    getAttendance: (s, d) => next.getAttendance(s, d),
    getPublishedResults: s => next.getPublishedResults(s),
    getTimetable: s => (s.role === 'PARENT' ? api.get<TimetableSlot[]>('/api/parent/timetable') : next.getTimetable(s)),
    getMyPeriods: (s, day) =>
      s.role === 'TEACHER' || s.role === 'PRINCIPAL'
        ? api.get<(TimetableSlot & { classLabel: string })[]>(`/api/staff/my-periods?day=${day}`)
        : next.getMyPeriods(s, day)
  };
}
