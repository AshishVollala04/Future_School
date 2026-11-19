/**
 * FeeService: what a parent sees about their child's fees.
 *
 * Parents do not pay in the app. Fees are paid at the school counter and recorded by finance staff
 * (fee desk), who issue the official receipt; this service only reads dues, paid amounts,
 * concessions, due dates and recorded receipts. There is no order, checkout or payment call.
 */
import type { Scope } from '../hooks/useScope';
import { Result } from '../types/session';
import { FeeLine, FeeSummary, Payment, PaymentAllocation, Refund } from '../types/domain';
import { getDb } from '../mock/db';
import { SchoolDb } from '../mock/db/seed';
import { guarded, studentInScope } from './mock/guard';
import { todayISO } from '../utils/date';
import { USE_BACKEND } from '../app/backendConfig';
import { ApiFeeService } from './api/parentApiServices';

export interface FeeService {
  getSummary(scope: Scope): Promise<Result<FeeSummary>>;
  listPayments(scope: Scope): Promise<Result<{ payments: Payment[]; refunds: Refund[] }>>;
}

/** Pure fee arithmetic, shared with HallTicketService. */
export function computeFeeLines(db: SchoolDb, studentId: string, today = todayISO()): FeeLine[] {
  return db.charges
    .filter(c => c.studentId === studentId)
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.id.localeCompare(b.id))
    .map(charge => {
      const concession = db.concessions.filter(k => k.chargeId === charge.id).reduce((a, k) => a + k.amount, 0);
      const paid = db.payments.flatMap(p => p.allocations).filter(a => a.chargeId === charge.id).reduce((a, x) => a + x.amount, 0);
      const outstanding = Math.max(0, charge.amount - concession - paid);
      return { charge, concession, paid, outstanding, overdue: outstanding > 0 && charge.dueOn < today };
    });
}

export function summarise(db: SchoolDb, studentId: string, today = todayISO()): FeeSummary {
  const lines = computeFeeLines(db, studentId, today);
  const instalments = db.instalments.map(ins => {
    const l = lines.filter(x => x.charge.instalment === ins.number);
    return { ...ins, lines: l, outstanding: l.reduce((a, x) => a + x.outstanding, 0), overdue: l.some(x => x.overdue) };
  });
  const next = instalments.find(i => i.outstanding > 0);
  return {
    instalments,
    totalCharged: lines.reduce((a, x) => a + x.charge.amount, 0),
    totalConcession: lines.reduce((a, x) => a + x.concession, 0),
    totalPaid: lines.reduce((a, x) => a + x.paid, 0),
    totalOutstanding: lines.reduce((a, x) => a + x.outstanding, 0),
    overdueAmount: lines.filter(x => x.overdue).reduce((a, x) => a + x.outstanding, 0),
    nextDue: next ? { instalment: { number: next.number, label: next.label, dueOn: next.dueOn }, amount: next.outstanding } : undefined,
    lateFeeNote: db.lateFeePolicy
  };
}

export function allocate(lines: FeeLine[], amount: number): PaymentAllocation[] {
  const out: PaymentAllocation[] = [];
  let left = amount;
  for (const l of lines) {
    if (left <= 0) break;
    if (l.outstanding <= 0) continue;
    const take = Math.min(left, l.outstanding);
    out.push({ chargeId: l.charge.id, amount: take });
    left -= take;
  }
  return out;
}


class MockFeeService implements FeeService {
  getSummary(scope: Scope) {
    return guarded(() => {
      const s = studentInScope(scope);
      return summarise(getDb(scope.schoolId), s.id);
    });
  }

  listPayments(scope: Scope) {
    return guarded(() => {
      const s = studentInScope(scope);
      const db = getDb(scope.schoolId);
      const payments = db.payments.filter(p => p.studentId === s.id).sort((a, b) => b.paidAt.localeCompare(a.paidAt));
      const ids = new Set(payments.map(p => p.id));
      return { payments, refunds: db.refunds.filter(r => ids.has(r.paymentId)) };
    });
  }


}

export const feeService: FeeService = USE_BACKEND ? new ApiFeeService() : new MockFeeService();
