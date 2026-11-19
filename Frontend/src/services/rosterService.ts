/**
 * Academic-year roster (school admins): prepare the next year, plan it (promote / repeat / exit /
 * add new students), preview, apply, start the year, and set the year's fee schedule and charges.
 * Server only: every rule (permissions, school scope, validation, idempotency, audit) is enforced by
 * the FutureSchool server; the prototype mock has no roster.
 */
import { Result } from '../types/session';
import { USE_BACKEND } from '../app/backendConfig';
import { api } from './api/http';

export type YearStatus = 'CURRENT' | 'PLANNED' | 'PAST';

export interface AcademicYearView {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: YearStatus;
  enrolled?: number;
}

export interface Placement {
  classId: string;
  className: string;
  section: string;
  roll: string;
}

export interface ClassOption {
  id: string;
  name: string;
  section: string;
  grade: number;
}

export type DecisionAction = 'PROMOTE' | 'REPEAT' | 'EXIT';

export interface SavedDecision {
  action: DecisionAction;
  toClassId?: string;
  roll?: string;
  exitDate?: string;
  exitReason?: string;
}

export interface RosterRow {
  studentId: string;
  name: string;
  admissionNumber?: string;
  current: Placement;
  grade: number | null;
  saved?: SavedDecision;
  suggestion?: { action: 'PROMOTE'; toClassId: string; roll: string };
  needsDecision?: string;
}

export interface ScheduleItem {
  number: number;
  label: string;
  dueOn: string;
}

export interface RosterDraft {
  year: AcademicYearView;
  currentYear: AcademicYearView;
  planning: boolean;
  classes: ClassOption[];
  roster: RosterRow[];
  admitted: { studentId: string; name: string; admissionNumber?: string; to: Placement; guardianLinked: boolean }[];
  schedule: ScheduleItem[];
}

export interface Decision {
  studentId: string;
  action: DecisionAction;
  toClassId?: string;
  roll?: string;
  exitDate?: string;
  exitReason?: string;
}

export interface NewStudent {
  admissionNumber: string;
  name: string;
  dob?: string;
  gender?: string;
  toClassId: string;
  roll: string;
  guardianName: string;
  guardianMobile: string;
  guardianEmail?: string;
  annualFee?: number;
}

export interface PlanRow {
  ref: string;
  studentId?: string | null;
  name?: string | null;
  action: string;
  status: 'OK' | 'SKIPPED' | 'ERROR';
  message?: string | null;
  from?: Placement | null;
  to?: Placement | null;
  guardian?: string | null;
}

export interface PlanResult {
  dryRun: boolean;
  applied: boolean;
  year: AcademicYearView;
  summary: { promoted: number; repeated: number; added: number; exited: number; skipped: number; needsCorrection: number };
  rows: PlanRow[];
  message?: string;
  undecided?: { studentId: string; name: string; className: string; section: string }[];
}

const serverOnly = <T,>(): Promise<Result<T>> =>
  Promise.resolve({ ok: false, error: 'The academic-year roster needs the FutureSchool server.', code: 'SERVER_ONLY' });

const base = '/api/admin/roster/years';
const y = (id: string) => `${base}/${encodeURIComponent(id)}`;

export const rosterService = {
  available: USE_BACKEND,

  years: (): Promise<Result<{ current: AcademicYearView; years: AcademicYearView[] }>> => (USE_BACKEND ? api.get(base) : serverOnly()),

  createYear: (body: { name: string; startDate: string; endDate: string }): Promise<Result<AcademicYearView>> =>
    USE_BACKEND ? api.post(base, body) : serverOnly(),

  draft: (yearId: string): Promise<Result<RosterDraft>> => (USE_BACKEND ? api.get(`${y(yearId)}/draft`) : serverOnly()),

  preview: (yearId: string, decisions: Decision[], newStudents: NewStudent[]): Promise<Result<PlanResult>> =>
    USE_BACKEND ? api.post(`${y(yearId)}/preview`, { decisions, newStudents }) : serverOnly(),

  apply: (yearId: string, decisions: Decision[], newStudents: NewStudent[]): Promise<Result<PlanResult>> =>
    USE_BACKEND ? api.post(`${y(yearId)}/apply`, { decisions, newStudents }) : serverOnly(),

  start: (yearId: string): Promise<Result<{ started: boolean; alreadyCurrent?: boolean; year?: string; returning?: number; joined?: number; exited?: number; message?: string }>> =>
    USE_BACKEND ? api.post(`${y(yearId)}/start`, {}) : serverOnly(),

  setFeeSchedule: (yearId: string, instalments: ScheduleItem[]): Promise<Result<{ year: AcademicYearView; schedule: ScheduleItem[] }>> =>
    USE_BACKEND ? api.put(`${y(yearId)}/fee-schedule`, { instalments }) : serverOnly(),

  generateCharges: (yearId: string, annualFeeByGrade: Record<string, number>): Promise<Result<{ year: string; studentsCharged: number; skipped: number; gradesWithoutFee: number[] }>> =>
    USE_BACKEND ? api.post(`${y(yearId)}/fee-charges`, { annualFeeByGrade }) : serverOnly()
};
