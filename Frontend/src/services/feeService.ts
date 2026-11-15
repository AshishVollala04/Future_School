/**
 * FeeService.
 *
 * Production flow: backend calculates the amount -> creates a payment-provider order ->
 * hosted checkout -> provider webhook verified server-side -> allocations + receipt.
 * The browser never decides that a payment succeeded and never handles card/UPI data.
 *
 * Prototype: confirmMockPayment() stands in for "provider webhook verified". It is
 * clearly labelled mock and requires a fresh step-up OTP token.
 */
import type { Scope } from '../hooks/useScope';
import { Result } from '../types/session';
import { FeeLine, FeeSummary, Payment, PaymentAllocation, PaymentOrder, Refund } from '../types/domain';
import { getDb, saveDb } from '../mock/db';
import { SchoolDb } from '../mock/db/seed';
import { guarded, RuleError, studentInScope, AccessDenied } from './mock/guard';
import { authService } from './authService';
import { auditService } from './auditService';
import { todayISO } from '../utils/date';
import { USE_BACKEND } from '../app/backendConfig';
import { ApiFeeService } from './api/parentApiServices';

export const PARTIAL_PAYMENT_MINIMUM = 1000;

export interface FeeService {
  getSummary(scope: Scope): Promise<Result<FeeSummary>>;
  listPayments(scope: Scope): Promise<Result<{ payments: Payment[]; refunds: Refund[] }>>;
  /** Either whole instalments, or a partial amount (allocated oldest-due first). */
  createOrder(scope: Scope, req: { instalments?: number[]; amount?: number; stepUpToken?: string }): Promise<Result<PaymentOrder>>;
  confirmMockPayment(scope: Scope, orderId: string, method: Payment['method'], stepUpToken: string): Promise<Result<Payment>>;
  verifyPayment(
    scope: Scope,
    orderId: string,
    req: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string; method: Payment['method']; stepUpToken?: string }
  ): Promise<Result<Payment>>;
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

const ORDER_TTL_MS = 15 * 60 * 1000;

class MockFeeService implements FeeService {
  private orders = new Map<string, PaymentOrder & { schoolId: string }>();

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

  createOrder(scope: Scope, req: { instalments?: number[]; amount?: number; stepUpToken?: string }) {
    return guarded(() => {
      if (scope.role !== 'PARENT') throw new AccessDenied('Online payment is made by the parent.');
      const s = studentInScope(scope);
      const db = getDb(scope.schoolId);
      const lines = computeFeeLines(db, s.id);
      const totalOutstanding = lines.reduce((a, x) => a + x.outstanding, 0);
      if (totalOutstanding <= 0) throw new RuleError('There is nothing to pay.', 'NOTHING_DUE');

      let allocations: PaymentAllocation[];
      if (req.instalments && req.instalments.length) {
        const chosen = lines.filter(l => req.instalments!.includes(l.charge.instalment));
        allocations = chosen.filter(l => l.outstanding > 0).map(l => ({ chargeId: l.charge.id, amount: l.outstanding }));
      } else {
        const amount = Math.floor(req.amount ?? 0);
        if (amount <= 0) throw new RuleError('Enter an amount.', 'BAD_AMOUNT');
        if (amount > totalOutstanding) throw new RuleError('Amount is more than the outstanding balance.', 'BAD_AMOUNT');
        if (amount < Math.min(PARTIAL_PAYMENT_MINIMUM, totalOutstanding)) {
          throw new RuleError(`Minimum part payment is ₹${PARTIAL_PAYMENT_MINIMUM.toLocaleString('en-IN')}.`, 'BAD_AMOUNT');
        }
        allocations = allocate(lines, amount);
      }
      const amount = allocations.reduce((a, x) => a + x.amount, 0);
      if (amount <= 0) throw new RuleError('Selected instalments are already paid.', 'NOTHING_DUE');
      const order = {
        orderId: `order_mock_${Date.now().toString(36)}`,
        studentId: s.id,
        amount,
        allocations,
        expiresAt: Date.now() + ORDER_TTL_MS,
        isMock: true,
        schoolId: scope.schoolId
      };
      this.orders.set(order.orderId, order);
      const { schoolId: _s, ...view } = order;
      return view;
    });
  }

  confirmMockPayment(scope: Scope, orderId: string, method: Payment['method'], stepUpToken: string) {
    return guarded(() => {
      const order = this.orders.get(orderId);
      if (!order || order.schoolId !== scope.schoolId) throw new RuleError('Payment session not found. Start again.', 'NO_ORDER');
      const s = studentInScope(scope, order.studentId);
      if (Date.now() > order.expiresAt) {
        this.orders.delete(orderId);
        throw new RuleError('Payment session expired. Start again.', 'ORDER_EXPIRED');
      }
      if (!authService.consumeStepUp(stepUpToken, 'PAYMENT')) {
        throw new RuleError('Please confirm with the OTP again.', 'STEP_UP_REQUIRED');
      }
      // Fresh validation at "webhook" time: dues may have changed since the order was created.
      const db = getDb(scope.schoolId);
      const lines = computeFeeLines(db, s.id);
      for (const a of order.allocations) {
        const l = lines.find(x => x.charge.id === a.chargeId);
        if (!l || l.outstanding < a.amount) {
          this.orders.delete(orderId);
          throw new RuleError('Your dues changed. Please start the payment again.', 'STALE_ORDER');
        }
      }
      const seq = db.payments.length + 1001;
      const payment: Payment = {
        id: `PAY-${scope.schoolId}-${Date.now().toString(36)}`,
        schoolId: scope.schoolId,
        studentId: s.id,
        amount: order.amount,
        method,
        providerRef: order.orderId,
        paidAt: new Date().toISOString(),
        paidByGuardianId: scope.userId,
        receiptNo: `${scope.schoolId}/2026-27/${seq}`,
        allocations: order.allocations,
        isMock: true
      };
      db.payments.push(payment);
      saveDb(db);
      this.orders.delete(orderId);
      auditService.record({
        schoolId: scope.schoolId,
        action: 'FEE_PAYMENT_RECORDED',
        actorId: scope.userId,
        actorRole: scope.role,
        targetId: s.id,
        details: `Prototype / mock payment ${payment.receiptNo} for ₹${payment.amount}.`
      });
      return payment;
    });
  }

  verifyPayment(
    scope: Scope,
    orderId: string,
    req: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string; method: Payment['method']; stepUpToken?: string }
  ) {
    return this.confirmMockPayment(scope, orderId, req.method, req.stepUpToken ?? '');
  }
}

export const feeService: FeeService = USE_BACKEND ? new ApiFeeService() : new MockFeeService();
