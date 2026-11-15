/**
 * AdminService: what the signed-in Admin may do, their work queue, and the audit log.
 * Work-queue counts are operational only (no ranking of students, teachers or parents).
 */
import type { Scope } from '../hooks/useScope';
import { Result } from '../types/session';
import { AdminPermission, ExamWindow } from '../types/domain';
import { getDb } from '../mock/db';
import { AccessDenied, guarded } from './mock/guard';
import { adminPermissions, PERMISSION_FOR_KIND, requireAdmin } from './mock/permissions';
import { auditService, AuditEvent } from './auditService';
import { authService } from './authService';
import { substitutionService } from './substitutionService';
import { USE_BACKEND } from '../app/backendConfig';
import { withApiAdmin } from './api/governanceApiServices';

export interface AdminAccess {
  permissions: AdminPermission[];
  quorum: { activeAdmins: number; meetsMinimum: boolean };
}

export interface AdminWorkQueue {
  governance: { toExecute: number; blocked: number; returned: number; drafts: number; waitingPrincipal: number };
  substitutionsUncovered: number;
  complaintsOpen: number;
  safetyComplaints: number;
  transportPending: number;
}

export interface AdminService {
  getAccess(scope: Scope): Promise<Result<AdminAccess>>;
  getWorkQueue(scope: Scope): Promise<Result<AdminWorkQueue>>;
  listAudit(scope: Scope): Promise<Result<AuditEvent[]>>;
  /** Exam windows, for scheduling and clearance-rule requests. */
  listExams(scope: Scope): Promise<Result<ExamWindow[]>>;
}

class MockAdminService implements AdminService {
  getAccess(scope: Scope) {
    return guarded(() => {
      if (scope.role !== 'ADMIN') throw new AccessDenied();
      return { permissions: adminPermissions(scope), quorum: authService.getAdminQuorum(scope.schoolId) };
    });
  }

  getWorkQueue(scope: Scope) {
    return guarded(async (): Promise<AdminWorkQueue> => {
      if (scope.role !== 'ADMIN') throw new AccessDenied();
      const perms = adminPermissions(scope);
      const db = getDb(scope.schoolId);
      // Only count governed changes this Admin is permitted to act on.
      const mine = db.changeRequests.filter(r => perms.includes(PERMISSION_FOR_KIND[r.kind]));
      const count = (st: string) => mine.filter(r => r.status === st).length;
      let uncovered = 0;
      if (perms.includes('ACADEMIC_OPS')) {
        const needs = await substitutionService.listNeeds(scope);
        if (needs.ok) uncovered = needs.data.filter(n => !n.assigned).length;
      }
      const open = perms.includes('COMPLAINTS') ? db.complaints.filter(c => ['OPEN', 'IN_PROGRESS', 'REOPENED'].includes(c.status)) : [];
      return {
        governance: {
          toExecute: mine.filter(r => r.status === 'APPROVED' && r.payloadHash === r.approvedHash).length,
          blocked: count('EXECUTION_BLOCKED') + mine.filter(r => r.status === 'APPROVED' && r.payloadHash !== r.approvedHash).length,
          returned: count('RETURNED'),
          drafts: count('DRAFT'),
          waitingPrincipal: count('PENDING_APPROVAL')
        },
        substitutionsUncovered: uncovered,
        complaintsOpen: open.length,
        safetyComplaints: open.filter(c => c.category === 'SAFETY').length,
        transportPending: perms.includes('TRANSPORT') ? db.transportRequests.filter(r => r.status === 'PENDING').length : 0
      };
    });
  }

  listAudit(scope: Scope) {
    return guarded(() => {
      requireAdmin(scope, 'REPORTS');
      return auditService.list(scope.schoolId);
    });
  }

  listExams(scope: Scope) {
    return guarded(() => {
      if (scope.role !== 'ADMIN' && scope.role !== 'PRINCIPAL') throw new AccessDenied();
      return [...getDb(scope.schoolId).exams].sort((a, b) => a.startsOn.localeCompare(b.startsOn));
    });
  }
}

export const adminService: AdminService = USE_BACKEND ? withApiAdmin(new MockAdminService()) : new MockAdminService();
