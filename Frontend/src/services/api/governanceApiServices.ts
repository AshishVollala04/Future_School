/**
 * Backend-backed governance, published-mark corrections and the office fee desk
 * (VITE_BACKEND=api). Every rule is enforced by the server: permissions, OTP, payload
 * fingerprint, re-validation at execution, versioned republishing.
 */
import type { Scope } from '../../hooks/useScope';
import type { AuditEvent } from '../auditService';
import { Result } from '../../types/session';
import { ChangePayload, ChangeRequest, ExamWindow, MarkCorrection, MarkValue, Payment, PublishedResult } from '../../types/domain';
import type { GovernanceService } from '../governanceService';
import type { CorrectableRow, CorrectionService, CorrectionView } from '../correctionService';
import type { FeeDeskService, FeePaymentAlert, StudentFeeAccount, StudentFeeRow } from '../feeDeskService';
import type { AdminService, AdminWorkQueue } from '../adminService';
import type { SchoolOverview, StaffService } from '../staffService';
import { api } from './http';

/** The server adds plain-language lines to every request; describe() just returns them. */
type ApiChangeRequest = ChangeRequest & { description?: string[] };

export class ApiGovernanceService implements GovernanceService {
  listForPrincipal = (_s: Scope) => api.get<ChangeRequest[]>('/api/governance/principal');
  listForAdmin = (_s: Scope) => api.get<ChangeRequest[]>('/api/governance/admin');
  createDraft = (_s: Scope, title: string, payload: ChangePayload) => api.post<ChangeRequest>('/api/governance/drafts', { title, payload });
  updateDraft = (_s: Scope, id: string, payload: ChangePayload) => api.post<ChangeRequest>(`/api/governance/${encodeURIComponent(id)}/edit`, { payload });
  submit = (_s: Scope, id: string) => api.post<ChangeRequest>(`/api/governance/${encodeURIComponent(id)}/submit`, {});
  principalDecide = (_s: Scope, id: string, decision: 'APPROVE' | 'RETURN' | 'REJECT', note: string, stepUpToken?: string) =>
    api.post<ChangeRequest>(`/api/governance/${encodeURIComponent(id)}/decision`, { decision, note, stepUpToken });
  execute = (_s: Scope, id: string) => api.post<ChangeRequest>(`/api/governance/${encodeURIComponent(id)}/execute`, {});
  describe(_s: Scope, req: ChangeRequest): string[] {
    return (req as ApiChangeRequest).description ?? [];
  }
}

export class ApiCorrectionService implements CorrectionService {
  listCorrectable = (_s: Scope) => api.get<CorrectableRow[]>('/api/corrections/correctable');
  raise = (_s: Scope, req: { resultId: string; subject: string; field: 'internal' | 'external'; to: MarkValue; reason: string }) =>
    api.post<MarkCorrection>('/api/corrections', req);
  listForClassTeacher = (_s: Scope, classSectionId: string) => api.get<CorrectionView[]>(`/api/corrections/class?classId=${encodeURIComponent(classSectionId)}`);
  verify = (_s: Scope, id: string, decision: 'VERIFY' | 'REJECT', note: string) =>
    api.post<MarkCorrection>(`/api/corrections/${encodeURIComponent(id)}/verify`, { decision, note });
  listForPrincipal = (_s: Scope) => api.get<CorrectionView[]>('/api/corrections/principal');
  principalDecide = (_s: Scope, id: string, decision: 'APPROVE' | 'REJECT', note: string, stepUpToken?: string) =>
    api.post<MarkCorrection>(`/api/corrections/${encodeURIComponent(id)}/decision`, { decision, note, stepUpToken });
  republish = (_s: Scope, id: string) => api.post<PublishedResult>(`/api/corrections/${encodeURIComponent(id)}/republish`, {});
}

export class ApiFeeDeskService implements FeeDeskService {
  search = (_s: Scope, query: string) => api.get<StudentFeeRow[]>(`/api/office/fees/students?q=${encodeURIComponent(query)}`);
  getAccount = (_s: Scope, studentId: string) => api.get<StudentFeeAccount>(`/api/office/fees/account?studentId=${encodeURIComponent(studentId)}`);
  recordCashPayment = (_s: Scope, studentId: string, amount: number, note: string) => api.post<Payment>('/api/office/fees/cash', { studentId, amount, note });
  getPaymentAlerts = (_s: Scope) => api.get<FeePaymentAlert[]>('/api/office/fees/alerts');
}

/** Admin work queue and audit/exams backed live by the server. */
export function withApiAdmin(next: AdminService): AdminService {
  return {
    getAccess: s => next.getAccess(s),
    listAudit: () => api.get<AuditEvent[]>('/api/governance/audit'),
    listExams: () => api.get<ExamWindow[]>('/api/governance/exams'),
    getWorkQueue: () => api.get<AdminWorkQueue>('/api/office/work-queue')
  };
}

/** Principal and Admin school overview backed live by the server. */
export function withApiCounts(next: StaffService): StaffService {
  return {
    myLeaves: s => next.myLeaves(s),
    applyLeave: (s, req, name) => next.applyLeave(s, req, name),
    listTeacherLeave: s => next.listTeacherLeave(s),
    decideTeacherLeave: (s, id, d, n) => next.decideTeacherLeave(s, id, d, n),
    getOverview: () => api.get<SchoolOverview>('/api/staff/overview')
  };
}
