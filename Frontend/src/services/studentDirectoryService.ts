/**
 * Student Directory, UDISE+ Profile Editing, Bulk CSV Onboarding & Class/Subject Allocations.
 */
import { Result } from '../types/session';
import { USE_BACKEND } from '../app/backendConfig';
import { api } from './api/http';

export interface StudentProfileDTO {
  id: string;
  admissionNumber: string;
  name: string;
  dob?: string;
  gender?: string;
  classId: string;
  className: string;
  section: string;
  roll: string;
  parentAccountId?: string;
  parentName?: string;
  parentMobile?: string;
  parentEmail?: string;
  address?: string;
  district?: string;
  mandal?: string;
  pincode?: string;
  aadhaarNumber?: string;
  apaarId?: string;
  casteCategory?: string;
  subCaste?: string;
  religion?: string;
  motherTongue?: string;
  bloodGroup?: string;
  fatherName?: string;
  motherName?: string;
  mediumOfInstruction?: string;
  secondLanguage?: string;
  feeBalance?: number;
  status: string;
}

export interface CsvImportResult {
  createdCount: number;
  skippedCount: number;
  classesCreated: number;
  parentsLinked: number;
  errors: Array<{ row: number; message: string }>;
  createdStudentIds: string[];
}

export interface AcademicsSetupView {
  classes: Array<{
    id: string;
    schoolId: string;
    grade: number;
    section: string;
    classTeacherStaffId?: string;
    classTeacherName?: string;
    subjectTeachers: Array<{ subject: string; staffId: string; name: string }>;
  }>;
  teachers: Array<{ staffId: string; name: string; title: string }>;
}

const serverOnly = <T,>(): Promise<Result<T>> =>
  Promise.resolve({ ok: false, error: 'Student directory & CSV onboarding require the FutureSchool server.', code: 'SERVER_ONLY' });

export const studentDirectoryService = {
  available: USE_BACKEND,

  listStudents: (search?: string): Promise<Result<StudentProfileDTO[]>> =>
    USE_BACKEND
      ? api.get<StudentProfileDTO[]>(`/api/students${search ? `?search=${encodeURIComponent(search)}` : ''}`)
      : serverOnly(),

  getStudent: (id: string): Promise<Result<StudentProfileDTO>> =>
    USE_BACKEND ? api.get<StudentProfileDTO>(`/api/students/${encodeURIComponent(id)}`) : serverOnly(),

  createStudent: (student: Partial<StudentProfileDTO>): Promise<Result<StudentProfileDTO>> =>
    USE_BACKEND ? api.post<StudentProfileDTO>('/api/students', student) : serverOnly(),

  updateStudent: (id: string, updated: Partial<StudentProfileDTO>): Promise<Result<StudentProfileDTO>> =>
    USE_BACKEND ? api.put<StudentProfileDTO>(`/api/students/${encodeURIComponent(id)}`, updated) : serverOnly(),

  importCsv: (csv: string, defaultAnnualFee = 0): Promise<Result<CsvImportResult>> =>
    USE_BACKEND ? api.post<CsvImportResult>('/api/admin/students/import', { csv, defaultAnnualFee }) : serverOnly(),

  getImportTemplate: (): Promise<Result<{ headers: string; sampleCsv: string }>> =>
    USE_BACKEND ? api.get<{ headers: string; sampleCsv: string }>('/api/admin/students/import-template') : serverOnly(),

  getAcademicsSetup: (): Promise<Result<AcademicsSetupView>> =>
    USE_BACKEND ? api.get<AcademicsSetupView>('/api/admin/academics/setup') : serverOnly(),

  createClass: (cls: { gradeNumber: number; section: string; name?: string; classTeacherId?: string; classTeacherName?: string }): Promise<Result<unknown>> =>
    USE_BACKEND
      ? api.post('/api/classes', { ...cls, name: cls.name || `Class ${cls.gradeNumber}`, schoolLevel: cls.gradeNumber >= 9 ? 'Senior' : 'Middle', active: true })
      : serverOnly(),

  assignSubjectTeacher: (body: { classId: string; subject: string; staffId: string }): Promise<Result<unknown>> =>
    USE_BACKEND ? api.post('/api/admin/academics/subject-teachers', body) : serverOnly(),

  listTeachers: (): Promise<Result<Array<{
    id: string;
    teacherId: string;
    name: string;
    email?: string;
    phone?: string;
    designation?: string;
    qualification?: string;
    primarySubject?: string;
    active: boolean;
  }>>> => (USE_BACKEND ? api.get('/api/teachers') : serverOnly()),

  createTeacher: (teacher: {
    name: string;
    phone: string;
    email?: string;
    primarySubject: string;
    designation?: string;
    qualification?: string;
  }): Promise<Result<{ id: string; teacherId: string; name: string }>> =>
    USE_BACKEND ? api.post('/api/teachers', { ...teacher, active: true }) : serverOnly()
};
