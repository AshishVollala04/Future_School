/**
 * Backend-backed parent services (fees, attendance, results, hall tickets).
 *
 * The server always uses the SESSION's child; the client never sends a student id.
 * Staff calls on the same interfaces still go to the prototype services until their
 * APIs move to the backend.
 */
import type { Scope } from '../../hooks/useScope';
import { Result } from '../../types/session';
import { FeeSummary, HallTicketStatus, Payment, PaymentOrder, PublishedResult, Refund } from '../../types/domain';
import type { FeeService } from '../feeService';
import type { AcademicsService, AttendanceSummary } from '../academicsService';
import type { HallTicketService } from '../hallTicketService';
import { api } from './http';

const parentOnly = <T,>(): Result<T> => ({ ok: false, error: 'Online payment is made by the parent.', code: 'FORBIDDEN' });

export class ApiFeeService implements FeeService {
  getSummary(scope: Scope) {
    return scope.role === 'PARENT' ? api.get<FeeSummary>('/api/parent/fees/summary') : Promise.resolve(parentOnly<FeeSummary>());
  }

  listPayments(scope: Scope) {
    return scope.role === 'PARENT'
      ? api.get<{ payments: Payment[]; refunds: Refund[] }>('/api/parent/fees/payments')
      : Promise.resolve(parentOnly<{ payments: Payment[]; refunds: Refund[] }>());
  }

  createOrder(scope: Scope, req: { instalments?: number[]; amount?: number; stepUpToken?: string }) {
    if (scope.role !== 'PARENT') return Promise.resolve(parentOnly<PaymentOrder>());
    const payload = req.instalments?.length
      ? { instalments: req.instalments, ...(req.stepUpToken ? { stepUpToken: req.stepUpToken } : {}) }
      : { amount: req.amount, ...(req.stepUpToken ? { stepUpToken: req.stepUpToken } : {}) };
    return api.post<PaymentOrder>('/api/parent/fees/orders', payload);
  }

  confirmMockPayment(scope: Scope, orderId: string, method: Payment['method'], stepUpToken: string) {
    if (scope.role !== 'PARENT') return Promise.resolve(parentOnly<Payment>());
    return api.post<Payment>(`/api/parent/fees/orders/${encodeURIComponent(orderId)}/confirm-mock`, { method, stepUpToken });
  }

  verifyPayment(
    scope: Scope,
    orderId: string,
    req: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string; method: Payment['method']; stepUpToken?: string }
  ) {
    if (scope.role !== 'PARENT') return Promise.resolve(parentOnly<Payment>());
    return api.post<Payment>(`/api/parent/fees/orders/${encodeURIComponent(orderId)}/verify`, req);
  }
}

/** Parent attendance + results from the server; everything else from the given fallback. */
export class ApiAcademicsService implements AcademicsService {
  constructor(private readonly fallback: AcademicsService) {}

  getTeacherAssignments = (scope: Scope) => this.fallback.getTeacherAssignments(scope);
  listClasses = (scope: Scope) => this.fallback.listClasses(scope);
  getMyPeriods = (scope: Scope, day: number) => this.fallback.getMyPeriods(scope, day);
  getOverview = (scope: Scope) => this.fallback.getOverview(scope);
  getTimetable = (scope: Scope) => this.fallback.getTimetable(scope);
  getHomework = (scope: Scope) => this.fallback.getHomework(scope);

  getAttendance(scope: Scope, days = 30) {
    return scope.role === 'PARENT' ? api.get<AttendanceSummary>(`/api/parent/attendance?days=${days}`) : this.fallback.getAttendance(scope, days);
  }

  getPublishedResults(scope: Scope) {
    return scope.role === 'PARENT' ? api.get<PublishedResult[]>('/api/parent/results') : this.fallback.getPublishedResults(scope);
  }
}

/** Parent hall tickets from the server; Class Teacher / Principal tools from the given fallback. */
export class ApiHallTicketService implements HallTicketService {
  constructor(private readonly fallback: HallTicketService) {}

  getForStudent(scope: Scope, studentId?: string) {
    return scope.role === 'PARENT' ? api.get<HallTicketStatus[]>('/api/parent/hall-tickets') : this.fallback.getForStudent(scope, studentId);
  }

  listForClass = (scope: Scope, classSectionId: string, examId?: string) => this.fallback.listForClass(scope, classSectionId, examId);
  release = (scope: Scope, examId: string, studentId: string) => this.fallback.release(scope, examId, studentId);
  principalOverride = (scope: Scope, examId: string, studentId: string, reason: string, stepUpToken: string) =>
    this.fallback.principalOverride(scope, examId, studentId, reason, stepUpToken);
}
