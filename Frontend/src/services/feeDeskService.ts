/**
 * FeeDeskService: the school office (Admin with FINANCE permission).
 *  - Look up a student's fee account.
 *  - Record a CASH payment received at the counter (allocated oldest-due first).
 *
 * Concessions, refunds and waivers are NOT done here: they go through governance
 * (Admin drafts -> Principal approves -> Admin executes).
 * Recording a payment never releases a hall ticket; the Class Teacher still releases it.
 * No card, UPI PIN, bank password or OTP is ever collected or stored.
 */
import type { Scope } from '../hooks/useScope';
import { Result } from '../types/session';
import { FeeSummary, Payment, Refund, StudentRecord } from '../types/domain';
import { getDb, saveDb } from '../mock/db';
import { allocate, computeFeeLines, summarise } from './feeService';
import { AccessDenied, guarded, RuleError } from './mock/guard';
import { requireAdmin } from './mock/permissions';
import { auditService } from './auditService';
import { USE_BACKEND } from '../app/backendConfig';
import { ApiFeeDeskService } from './api/governanceApiServices';

export interface StudentFeeRow {
  student: Pick<StudentRecord, 'id' | 'name' | 'grade' | 'section' | 'rollNumber' | 'admissionNo'>;
  outstanding: number;
  overdue: number;
}

export interface StudentFeeAccount {
  student: StudentFeeRow['student'];
  summary: FeeSummary;
  payments: Payment[];
  refunds: Refund[];
}

export interface FeePaymentAlert {
  id: string;
  action: string;
  studentId: string;
  details: string;
  at: string;
}

export interface FeeDeskService {
  search(scope: Scope, query: string): Promise<Result<StudentFeeRow[]>>;
  getAccount(scope: Scope, studentId: string): Promise<Result<StudentFeeAccount>>;
  recordCashPayment(scope: Scope, studentId: string, amount: number, note: string): Promise<Result<Payment>>;
  getPaymentAlerts?(scope: Scope): Promise<Result<FeePaymentAlert[]>>;
}

const pick = (s: StudentRecord): StudentFeeRow['student'] => ({ id: s.id, name: s.name, grade: s.grade, section: s.section, rollNumber: s.rollNumber, admissionNo: s.admissionNo });

class MockFeeDeskService implements FeeDeskService {
  search(scope: Scope, query: string) {
    return guarded(() => {
      requireAdmin(scope, 'FINANCE');
      const db = getDb(scope.schoolId);
      const q = query.trim().toLowerCase();
      return db.students
        .filter(s => !q || s.name.toLowerCase().includes(q) || s.admissionNo.toLowerCase().includes(q) || `${s.grade}-${s.section}`.toLowerCase() === q)
        .map(s => {
          const lines = computeFeeLines(db, s.id);
          return {
            student: pick(s),
            outstanding: lines.reduce((a, l) => a + l.outstanding, 0),
            overdue: lines.filter(l => l.overdue).reduce((a, l) => a + l.outstanding, 0)
          };
        })
        .sort((a, b) => b.student.grade - a.student.grade || a.student.section.localeCompare(b.student.section) || a.student.rollNumber.localeCompare(b.student.rollNumber));
    });
  }

  getAccount(scope: Scope, studentId: string) {
    return guarded(() => {
      requireAdmin(scope, 'FINANCE');
      const db = getDb(scope.schoolId);
      const s = db.students.find(x => x.id === studentId);
      if (!s) throw new AccessDenied('Student not found in this school.');
      const payments = db.payments.filter(p => p.studentId === s.id).sort((a, b) => b.paidAt.localeCompare(a.paidAt));
      const ids = new Set(payments.map(p => p.id));
      return { student: pick(s), summary: summarise(db, s.id), payments, refunds: db.refunds.filter(r => ids.has(r.paymentId)) };
    });
  }

  recordCashPayment(scope: Scope, studentId: string, amount: number, note: string) {
    return guarded(() => {
      requireAdmin(scope, 'FINANCE');
      const db = getDb(scope.schoolId);
      const s = db.students.find(x => x.id === studentId);
      if (!s) throw new AccessDenied('Student not found in this school.');
      const amt = Math.floor(amount);
      if (!Number.isFinite(amt) || amt <= 0) throw new RuleError('Enter the amount received.', 'BAD_AMOUNT');
      const lines = computeFeeLines(db, s.id);
      const outstanding = lines.reduce((a, l) => a + l.outstanding, 0);
      if (outstanding <= 0) throw new RuleError('Nothing is outstanding for this student.', 'NOTHING_DUE');
      if (amt > outstanding) throw new RuleError('Amount is more than the outstanding balance. Do not collect extra.', 'BAD_AMOUNT');
      const payment: Payment = {
        id: `PAY-${scope.schoolId}-${Date.now().toString(36)}`,
        schoolId: scope.schoolId,
        studentId: s.id,
        amount: amt,
        method: 'CASH_AT_OFFICE',
        providerRef: `office-cash${note.trim() ? ` · ${note.trim().slice(0, 80)}` : ''}`,
        paidAt: new Date().toISOString(),
        recordedByStaffId: scope.userId,
        receiptNo: `${scope.schoolId}/2026-27/${db.payments.length + 1001}`,
        allocations: allocate(lines, amt),
        isMock: true
      };
      db.payments.push(payment);
      saveDb(db);
      auditService.record({
        schoolId: scope.schoolId, action: 'FEE_CASH_RECORDED', actorId: scope.userId, actorRole: scope.role, targetId: s.id,
        details: `Prototype / mock: cash ₹${amt} recorded at office, receipt ${payment.receiptNo}.`
      });
      return payment;
    });
  }
}

export const feeDeskService: FeeDeskService = USE_BACKEND ? new ApiFeeDeskService() : new MockFeeDeskService();
