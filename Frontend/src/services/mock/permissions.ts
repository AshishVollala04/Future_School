/**
 * Admin permission checks (prototype). Production: permission claims in the staff token,
 * enforced by the backend on every request. Navigation hiding in the UI is UX only.
 */
import type { Scope } from '../../hooks/useScope';
import { AdminPermission, ChangeKind } from '../../types/domain';
import { authService } from '../authService';
import { AccessDenied } from './guard';

export const PERMISSION_LABEL: Record<AdminPermission, string> = {
  FINANCE: 'Finance',
  ADMISSIONS: 'Admissions',
  ACADEMIC_OPS: 'Academic operations',
  TRANSPORT: 'Transport',
  COMPLAINTS: 'Complaints',
  SECURITY: 'Security & staff access',
  REPORTS: 'Reports & audit'
};

/** Which permission an Admin needs to prepare or execute each governed change. */
export const PERMISSION_FOR_KIND: Record<ChangeKind, AdminPermission> = {
  FEE_CONCESSION: 'FINANCE',
  REFUND: 'FINANCE',
  LATE_FEE_WAIVER: 'FINANCE',
  FEE_STRUCTURE: 'FINANCE',
  EXAM_SCHEDULE: 'ACADEMIC_OPS',
  CLEARANCE_RULE: 'ACADEMIC_OPS'
};

export function adminPermissions(scope: Scope): AdminPermission[] {
  return scope.role === 'ADMIN' ? authService.getAdminPermissions(scope.schoolId, scope.userId) : [];
}

export function requireAdmin(scope: Scope, perm: AdminPermission): void {
  if (scope.role !== 'ADMIN') throw new AccessDenied('This is an Admin action.');
  if (!adminPermissions(scope).includes(perm)) throw new AccessDenied(`You do not have the ${PERMISSION_LABEL[perm]} permission.`);
}
