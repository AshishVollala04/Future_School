/**
 * GovernanceService: policy-sensitive changes.
 *
 *   Admin prepares DRAFT -> FutureSchool validates -> Principal approves (OTP re-check)
 *   -> APPROVED (approvedHash recorded) -> FutureSchool validates again at execution
 *   -> Admin executes -> EXECUTED + audit.
 *
 * If the payload changes after approval, its hash no longer matches approvedHash and
 * execution is BLOCKED; a new approval is required. Admin cannot approve; Principal
 * cannot execute. Executing never deletes history: concessions/refunds are new records.
 */
import type { Scope } from '../hooks/useScope';
import { Result } from '../types/session';
import { ChangePayload, ChangeRequest, FeeConcession } from '../types/domain';
import { getDb, saveDb } from '../mock/db';
import { SchoolDb, payloadHash } from '../mock/db/seed';
import { computeFeeLines } from './feeService';
import { AccessDenied, guarded, RuleError } from './mock/guard';
import { authService } from './authService';
import { auditService } from './auditService';
import { formatINR, todayISO } from '../utils/date';
import { PERMISSION_FOR_KIND, requireAdmin } from './mock/permissions';
import { computeStatus } from './hallTicketService';
import { FeeCategory } from '../types/domain';
import { USE_BACKEND } from '../app/backendConfig';
import { ApiGovernanceService } from './api/governanceApiServices';

const CATEGORY_NAME: Record<FeeCategory, string> = {
  SCHOOL_FEE: 'school fee', EXAM_FEE: 'exam fee', TRANSPORT_FEE: 'transport fee', ACTIVITY_FEE: 'activity fee', EVENT_FEE: 'event fee', OTHER: 'other'
};

export interface GovernanceService {
  listForPrincipal(scope: Scope): Promise<Result<ChangeRequest[]>>;
  listForAdmin(scope: Scope): Promise<Result<ChangeRequest[]>>;
  createDraft(scope: Scope, title: string, payload: ChangePayload, preparedByName?: string): Promise<Result<ChangeRequest>>;
  updateDraft(scope: Scope, id: string, payload: ChangePayload): Promise<Result<ChangeRequest>>;
  submit(scope: Scope, id: string): Promise<Result<ChangeRequest>>;
  principalDecide(scope: Scope, id: string, decision: 'APPROVE' | 'RETURN' | 'REJECT', note: string, stepUpToken?: string): Promise<Result<ChangeRequest>>;
  execute(scope: Scope, id: string): Promise<Result<ChangeRequest>>;
  /** Plain-language description of a payload for review screens. */
  describe(scope: Scope, req: ChangeRequest): string[];
}

const now = () => new Date().toISOString();

/** Business validation, run on submit, on approval and again at execution. */
export function validate(db: SchoolDb, p: ChangePayload, today = todayISO()): string[] {
  const issues: string[] = [];
  switch (p.kind) {
    case 'FEE_CONCESSION': {
      const st = db.students.find(s => s.id === p.studentId);
      if (!st) issues.push('Student not found.');
      if (p.amountPerCharge <= 0) issues.push('Concession amount must be positive.');
      if (p.justification.trim().length < 15) issues.push('Add a proper justification (15+ characters).');
      const lines = computeFeeLines(db, p.studentId, today);
      p.chargeIds.forEach(id => {
        const l = lines.find(x => x.charge.id === id);
        if (!l) issues.push(`Charge ${id} not found for this student.`);
        else if (p.amountPerCharge > l.outstanding) issues.push(`${l.charge.label} (instalment ${l.charge.instalment}): concession ${formatINR(p.amountPerCharge)} is more than the outstanding ${formatINR(l.outstanding)}.`);
      });
      break;
    }
    case 'REFUND': {
      const pay = db.payments.find(x => x.id === p.paymentId);
      if (!pay) {
        issues.push('Original payment not found.');
        break;
      }
      const refunded = db.refunds.filter(r => r.paymentId === pay.id && r.status !== 'REJECTED').reduce((a, r) => a + r.amount, 0);
      if (p.amount <= 0) issues.push('Refund amount must be positive.');
      if (p.amount + refunded > pay.amount) issues.push(`Refund exceeds what is refundable on ${pay.receiptNo} (${formatINR(pay.amount - refunded)} left).`);
      if (p.reason.trim().length < 10) issues.push('Give the refund reason.');
      break;
    }
    case 'LATE_FEE_WAIVER':
      if (p.amount <= 0) issues.push('Waiver amount must be positive.');
      break;
    case 'EXAM_SCHEDULE': {
      const ex = db.exams.find(e => e.id === p.examId);
      if (!ex) issues.push('Exam not found.');
      if (p.newStartsOn <= today) issues.push('New start date must be in the future.');
      if (new Date(p.newStartsOn + 'T00:00:00').getDay() === 0) issues.push('New start date is a Sunday.');
      break;
    }
    case 'FEE_STRUCTURE': {
      if (p.newSchoolFee <= 0) issues.push('Fee must be positive.');
      const affected = db.charges.filter(c => c.category === 'SCHOOL_FEE' && c.instalment === p.instalment && db.students.find(s => s.id === c.studentId)?.grade === p.grade);
      const paid = affected.filter(c => db.payments.some(pay => pay.allocations.some(a => a.chargeId === c.id)));
      if (paid.length) issues.push(`${paid.length} student(s) already paid this instalment; change it with adjustments instead.`);
      break;
    }
    case 'CLEARANCE_RULE': {
      const ex = db.exams.find(e => e.id === p.examId);
      if (!ex) issues.push('Exam not found.');
      else if (ex.startsOn <= today) issues.push('The exam has already started; its clearance rule is locked.');
      if (!p.categories.length) issues.push('Choose at least one fee category.');
      if (p.reason.trim().length < 10) issues.push('Give the reason for the change.');
      break;
    }
  }
  return issues;
}

function apply(db: SchoolDb, req: ChangeRequest, actor: string) {
  const p = req.payload;
  switch (p.kind) {
    case 'FEE_CONCESSION':
      p.chargeIds.forEach((chargeId, i) => {
        const c: FeeConcession = { id: `CON-${req.id}-${i + 1}`, chargeId, kind: p.concessionKind, amount: p.amountPerCharge, approvedOn: todayISO() };
        db.concessions.push(c);
      });
      break;
    case 'REFUND':
      // The original payment is untouched; the refund is its own record.
      db.refunds.push({ id: `RF-${req.id}`, paymentId: p.paymentId, amount: p.amount, reason: p.reason, status: 'APPROVED', createdAt: now() });
      break;
    case 'EXAM_SCHEDULE': {
      const ex = db.exams.find(e => e.id === p.examId);
      if (ex) ex.startsOn = p.newStartsOn;
      break;
    }
    case 'FEE_STRUCTURE':
      db.charges
        .filter(c => c.category === 'SCHOOL_FEE' && c.instalment === p.instalment && db.students.find(s => s.id === c.studentId)?.grade === p.grade)
        .forEach(c => (c.amount = p.newSchoolFee));
      break;
    case 'CLEARANCE_RULE': {
      const ex = db.exams.find(e => e.id === p.examId);
      if (ex) ex.clearanceRule = { categories: [...p.categories], uptoInstalment: p.uptoInstalment };
      break;
    }
    case 'LATE_FEE_WAIVER':
      break; // late fees are not modelled in the prototype; the decision is still audited
  }
  req.history.push({ at: now(), by: actor, action: 'EXECUTED' });
}

class MockGovernanceService implements GovernanceService {
  private find(db: SchoolDb, id: string) {
    const r = db.changeRequests.find(x => x.id === id);
    if (!r) throw new AccessDenied('Request not found.');
    return r;
  }

  listForPrincipal(scope: Scope) {
    return guarded(() => {
      if (scope.role !== 'PRINCIPAL') throw new AccessDenied();
      const order: Record<string, number> = { PENDING_APPROVAL: 0, EXECUTION_BLOCKED: 1, APPROVED: 2, RETURNED: 3, EXECUTED: 4, REJECTED: 5 };
      return getDb(scope.schoolId)
        .changeRequests.filter(r => r.status !== 'DRAFT')
        .map(r => ({ ...r, validationIssues: validate(getDb(scope.schoolId), r.payload) }))
        .sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
    });
  }

  listForAdmin(scope: Scope) {
    return guarded(() => {
      if (scope.role !== 'ADMIN') throw new AccessDenied();
      const db = getDb(scope.schoolId);
      return db.changeRequests.map(r => ({ ...r, validationIssues: validate(db, r.payload) }));
    });
  }

  createDraft(scope: Scope, title: string, payload: ChangePayload, preparedByName = '') {
    return guarded(() => {
      if (scope.role !== 'ADMIN') throw new AccessDenied('Only Admin prepares changes.');
      requireAdmin(scope, PERMISSION_FOR_KIND[payload.kind]);
      const db = getDb(scope.schoolId);
      const r: ChangeRequest = {
        id: `CR-${scope.schoolId}-${Date.now().toString(36)}`, schoolId: scope.schoolId, kind: payload.kind, title: title.trim() || payload.kind,
        payload, payloadHash: payloadHash(payload), status: 'DRAFT', preparedBy: scope.userId, preparedByName,
        validationIssues: validate(db, payload), history: [{ at: now(), by: scope.userId, action: 'DRAFTED' }]
      };
      db.changeRequests.push(r);
      saveDb(db);
      return r;
    });
  }

  updateDraft(scope: Scope, id: string, payload: ChangePayload) {
    return guarded(() => {
      if (scope.role !== 'ADMIN') throw new AccessDenied();
      const db = getDb(scope.schoolId);
      const r = this.find(db, id);
      requireAdmin(scope, PERMISSION_FOR_KIND[r.kind]);
      if (!['DRAFT', 'RETURNED', 'APPROVED', 'EXECUTION_BLOCKED'].includes(r.status)) throw new RuleError('This request can no longer be edited.', 'LOCKED');
      if (payload.kind !== r.kind) throw new RuleError('Change type cannot be switched.', 'KIND');
      r.payload = payload;
      r.payloadHash = payloadHash(payload);
      r.validationIssues = validate(db, payload);
      r.history.push({ at: now(), by: scope.userId, action: r.status === 'APPROVED' ? 'EDITED_AFTER_APPROVAL' : 'EDITED' });
      saveDb(db);
      return r;
    });
  }

  submit(scope: Scope, id: string) {
    return guarded(() => {
      if (scope.role !== 'ADMIN') throw new AccessDenied();
      const db = getDb(scope.schoolId);
      const r = this.find(db, id);
      requireAdmin(scope, PERMISSION_FOR_KIND[r.kind]);
      if (!['DRAFT', 'RETURNED', 'EXECUTION_BLOCKED'].includes(r.status) && !(r.status === 'APPROVED' && r.payloadHash !== r.approvedHash)) {
        throw new RuleError('Only drafts or changed requests can be submitted.', 'STATE');
      }
      const issues = validate(db, r.payload);
      r.validationIssues = issues;
      if (issues.length) throw new RuleError(`Fix before submitting: ${issues.join(' ')}`, 'INVALID');
      r.status = 'PENDING_APPROVAL';
      r.approvedHash = undefined;
      r.history.push({ at: now(), by: scope.userId, action: 'SUBMITTED' });
      saveDb(db);
      return r;
    });
  }

  principalDecide(scope: Scope, id: string, decision: 'APPROVE' | 'RETURN' | 'REJECT', note: string, stepUpToken?: string) {
    return guarded(() => {
      if (scope.role !== 'PRINCIPAL') throw new AccessDenied('Only the Principal approves.');
      const db = getDb(scope.schoolId);
      const r = this.find(db, id);
      if (r.status !== 'PENDING_APPROVAL') throw new RuleError('This request is not waiting for approval.', 'STATE');
      if (decision !== 'APPROVE' && note.trim().length < 5) throw new RuleError('Add a note for the Admin.', 'REASON');
      if (decision === 'APPROVE') {
        if (!stepUpToken || !authService.consumeStepUp(stepUpToken, 'SENSITIVE_STAFF_ACTION')) throw new RuleError('Please confirm with the OTP again.', 'STEP_UP_REQUIRED');
        const issues = validate(db, r.payload);
        if (issues.length) throw new RuleError(`Cannot approve: ${issues.join(' ')}`, 'INVALID');
        r.status = 'APPROVED';
        r.approvedHash = r.payloadHash;
      } else {
        r.status = decision === 'RETURN' ? 'RETURNED' : 'REJECTED';
      }
      r.history.push({ at: now(), by: scope.userId, action: decision === 'APPROVE' ? 'APPROVED' : decision === 'RETURN' ? 'RETURNED' : 'REJECTED', note: note.trim() || undefined });
      saveDb(db);
      auditService.record({ schoolId: scope.schoolId, action: `GOVERNANCE_${decision}`, actorId: scope.userId, actorRole: scope.role, targetId: r.id, details: r.title, reason: note.trim() || undefined });
      return r;
    });
  }

  execute(scope: Scope, id: string) {
    return guarded(() => {
      if (scope.role !== 'ADMIN') throw new AccessDenied('Admin executes approved changes.');
      const db = getDb(scope.schoolId);
      const r = this.find(db, id);
      requireAdmin(scope, PERMISSION_FOR_KIND[r.kind]);
      if (r.status !== 'APPROVED') throw new RuleError('Only approved requests can be executed.', 'STATE');
      if (r.payloadHash !== r.approvedHash) {
        r.status = 'EXECUTION_BLOCKED';
        r.history.push({ at: now(), by: scope.userId, action: 'EXECUTION_BLOCKED', note: 'Changed after approval; a new approval is required.' });
        saveDb(db);
        throw new RuleError('Blocked: this request changed after the Principal approved it. Submit it again for approval.', 'CHANGED_AFTER_APPROVAL');
      }
      const issues = validate(db, r.payload);
      if (issues.length) {
        r.status = 'EXECUTION_BLOCKED';
        r.validationIssues = issues;
        r.history.push({ at: now(), by: scope.userId, action: 'EXECUTION_BLOCKED', note: issues.join(' ') });
        saveDb(db);
        throw new RuleError(`Blocked by fresh validation: ${issues.join(' ')}`, 'INVALID');
      }
      apply(db, r, scope.userId);
      r.status = 'EXECUTED';
      saveDb(db);
      auditService.record({ schoolId: scope.schoolId, action: 'GOVERNANCE_EXECUTED', actorId: scope.userId, actorRole: scope.role, targetId: r.id, details: r.title });
      return r;
    });
  }

  describe(scope: Scope, req: ChangeRequest): string[] {
    const db = getDb(scope.schoolId);
    const p = req.payload;
    const name = (sid: string) => {
      const s = db.students.find(x => x.id === sid);
      return s ? `${s.name} (${s.grade}-${s.section})` : sid;
    };
    switch (p.kind) {
      case 'FEE_CONCESSION':
        return [`Student: ${name(p.studentId)}`, `Type: ${p.concessionKind.replace(/_/g, ' ').toLowerCase()}`, `${formatINR(p.amountPerCharge)} on each of ${p.chargeIds.length} charge(s)`, `Justification: ${p.justification}`];
      case 'REFUND': {
        const pay = db.payments.find(x => x.id === p.paymentId);
        return [`Original payment: ${pay?.receiptNo} · ${pay ? formatINR(pay.amount) : ''} · ${pay ? name(pay.studentId) : ''}`, `Refund: ${formatINR(p.amount)}`, `Reason: ${p.reason}`, 'The original payment record is kept; the refund is a separate record.'];
      }
      case 'LATE_FEE_WAIVER':
        return [`Student: ${name(p.studentId)}`, `Waive ${formatINR(p.amount)}`, `Reason: ${p.reason}`];
      case 'EXAM_SCHEDULE': {
        const ex = db.exams.find(e => e.id === p.examId);
        return [`Exam: ${ex?.name}`, `From ${ex?.startsOn} to ${p.newStartsOn}`, `Reason: ${p.reason}`];
      }
      case 'FEE_STRUCTURE':
        return [`Class ${p.grade}, instalment ${p.instalment}: school fee ${formatINR(p.newSchoolFee)}`, `Reason: ${p.reason}`];
      case 'CLEARANCE_RULE': {
        const ex = db.exams.find(e => e.id === p.examId);
        if (!ex) return [`Exam ${p.examId} not found`];
        const rule = (cats: FeeCategory[], upto: number) => `${cats.map(c => CATEGORY_NAME[c]).join(', ')} up to instalment ${upto}`;
        const after = { ...ex, clearanceRule: { categories: p.categories, uptoInstalment: p.uptoInstalment } };
        const students = db.students.filter(s => ex.grades.includes(s.grade) && s.status === 'ACTIVE');
        const before = students.filter(s => computeStatus(db, ex, s).feeClearance === 'CLEARED').length;
        const nowCleared = students.filter(s => computeStatus(db, after, s).feeClearance === 'CLEARED').length;
        return [
          `Exam: ${ex.name} (starts ${ex.startsOn})`,
          `Now: ${rule(ex.clearanceRule.categories, ex.clearanceRule.uptoInstalment)}`,
          `Proposed: ${rule(p.categories, p.uptoInstalment)}`,
          `Fee-cleared students: ${before} now, ${nowCleared} under the new rule (of ${students.length}).`,
          'A hall ticket still needs Class Teacher release; payment alone never releases it.',
          `Reason: ${p.reason}`
        ];
      }
    }
  }
}

export const governanceService: GovernanceService = USE_BACKEND ? new ApiGovernanceService() : new MockGovernanceService();
