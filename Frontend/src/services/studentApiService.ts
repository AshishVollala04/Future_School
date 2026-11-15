/**
 * FutureSchool - Student API Service
 * Interacts with Spring Boot backend at /api/students and /api/attendance
 */
import { apiClient } from './apiClient';

export interface StudentEntity {
  id: string;
  name: string;
  rollNumber: string;
  className: string;
  section: string;
  classId: string;
  gender: string;
  dateOfBirth?: string;
  bloodGroup?: string;
  parentName: string;
  parentMobile: string;
  parentEmail?: string;
  parentAccountId?: string;
  status: string;
  academicYear?: string;
  hallTicketReleased?: boolean;
  hallTicketApproved?: boolean;
}

export interface AttendanceRecordDTO {
  id?: number;
  studentId: string;
  studentName?: string;
  classId: string;
  date: string;
  session?: 'MORNING' | 'AFTERNOON' | 'FULL_DAY';
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
  remarks?: string;
  recordedBy?: string;
}

export interface AttendanceSummaryDTO {
  totalDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  percentage: number;
}

export const StudentApiService = {
  getAll: (classId?: string, search?: string) => {
    let url = '/api/students';
    const params = new URLSearchParams();
    if (classId) params.append('classId', classId);
    if (search) params.append('search', search);
    const queryString = params.toString();
    if (queryString) url += `?${queryString}`;
    return apiClient.get<StudentEntity[]>(url);
  },

  getById: (id: string) => apiClient.get<StudentEntity>(`/api/students/${id}`),

  getByClass: (classId: string) => apiClient.get<StudentEntity[]>(`/api/students/class/${classId}`),

  getByParent: (parentAccountId: string) => apiClient.get<StudentEntity[]>(`/api/students/parent/${parentAccountId}`),

  createStudent: (student: Partial<StudentEntity>, initialPassword?: string) => {
    const url = initialPassword ? `/api/students?initialPassword=${encodeURIComponent(initialPassword)}` : '/api/students';
    return apiClient.post<StudentEntity>(url, student);
  },

  updateStudent: (id: string, student: Partial<StudentEntity>) =>
    apiClient.put<StudentEntity>(`/api/students/${id}`, student),

  updateHallTicket: (id: string, released: boolean, approved: boolean) =>
    apiClient.patch<StudentEntity>(`/api/students/${id}/hall-ticket`, { released, approved }),

  // Marks Endpoints
  getMarks: (studentId: string) =>
    apiClient.get<any[]>(`/api/marks/student/${studentId}`),

  // Attendance Endpoints
  getAttendanceHistory: (studentId: string) =>
    apiClient.get<AttendanceRecordDTO[]>(`/api/attendance/student/${studentId}`),

  getAttendanceSummary: (studentId: string) =>
    apiClient.get<AttendanceSummaryDTO>(`/api/attendance/summary/${studentId}`),

  markAttendance: (classId: string, date: string, records: AttendanceRecordDTO[]) =>
    apiClient.post<{ success: boolean; message: string; records: AttendanceRecordDTO[] }>(
      `/api/attendance/mark?classId=${encodeURIComponent(classId)}&date=${encodeURIComponent(date)}`,
      records
    ),
};
