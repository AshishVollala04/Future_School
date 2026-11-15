/** Owner's dashboard (server only): today's money and attendance per branch the person manages. */
import { Result } from '../types/session';
import { USE_BACKEND } from '../app/backendConfig';
import { api } from './api/http';

export interface BranchMoney {
  cashToday: number;
  onlineToday: number;
  simulatedToday: number;
  receiptsToday: number;
  thisMonth: number;
  outstanding: number;
  overdue: number;
  studentsOverdue: number;
  overdueByClass: { classLabel: string; amount: number; students: number }[];
}

export interface BranchAttendance {
  students: number;
  present: number;
  absent: number;
  onLeave: number;
  notMarked: number;
  classes: number;
  classesNotMarked: string[];
}

export interface Branch {
  schoolId: string;
  schoolName: string;
  board: string | null;
  money: BranchMoney;
  attendance: BranchAttendance;
}

export interface OwnerOverview {
  date: string;
  branches: Branch[];
  totals: { cashToday: number; onlineToday: number; simulatedToday: number; thisMonth: number; outstanding: number; overdue: number; studentsOverdue: number; students: number; present: number; absent: number };
}

export const ownerService = {
  available: USE_BACKEND,
  overview: (): Promise<Result<OwnerOverview>> =>
    USE_BACKEND ? api.get<OwnerOverview>('/api/owner/overview') : Promise.resolve({ ok: false, error: "The owner's dashboard needs the FutureSchool server.", code: 'SERVER_ONLY' })
};
