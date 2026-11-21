/**
 * PickupService: early-pickup passes.
 *  - Who may already collect the child: the guardians linked to them.
 *  - A pass for another named person needs a fresh PICKUP_AUTHORIZATION OTP. The server makes
 *    the code; it is shown ONCE, valid 2 hours, and accepted once at the gate.
 *  - Staff verify a code at the gate; it is then marked used.
 * Mock implementation for the prototype; VITE_BACKEND=api uses the server (same rules).
 */
import type { Scope } from '../hooks/useScope';
import { Result } from '../types/session';
import { USE_BACKEND } from '../app/backendConfig';
import { authService } from './authService';
import { auditService } from './auditService';
import { AccessDenied, guarded, RuleError, studentInScope } from './mock/guard';
import { getDb } from '../mock/db';
import { storage, storageKeys } from './storage';
import { api } from './api/http';

export interface PickupPassView {
  id: string;
  studentId: string;
  personName: string;
  relation: string;
  mobileMasked: string;
  reason: string;
  issuedAt: string;
  validUntil: number;
  status: 'ACTIVE' | 'USED' | 'CANCELLED' | 'EXPIRED';
  usedAt?: string;
  /** Only in the response that issues the pass. */
  code?: string;
  studentName?: string;
  classLabel?: string;
  mobile?: string;
}

export interface MyPickup {
  guardians: { name: string; mobileMasked: string; you: boolean }[];
  passes: PickupPassView[];
}

export interface PickupService {
  getMine(scope: Scope): Promise<Result<MyPickup>>;
  issuePass(scope: Scope, req: { personName: string; relation: string; mobile: string; reason: string }, stepUpToken: string): Promise<Result<PickupPassView>>;
  cancelPass(scope: Scope, id: string): Promise<Result<PickupPassView>>;
  verifyAtGate(scope: Scope, code: string): Promise<Result<PickupPassView>>;
}

// ---------------------------------------------------------------------------- mock

interface StoredPass extends Omit<PickupPassView, 'code' | 'mobileMasked' | 'status'> {
  mobile: string;
  codeHash: string;
  status: 'ACTIVE' | 'USED' | 'CANCELLED';
}

const TTL = 2 * 60 * 60 * 1000;
const key = (schoolId: string) => storageKeys.school(schoolId, 'pickupPasses');
const mask = (m: string) => '••••••' + m.slice(-4);
/** Prototype only: a non-cryptographic fingerprint so the plain code is not kept. */
const fingerprint = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
};

function view(p: StoredPass): PickupPassView {
  const { codeHash: _c, mobile, ...rest } = p;
  return { ...rest, mobileMasked: mask(mobile), status: p.status === 'ACTIVE' && Date.now() > p.validUntil ? 'EXPIRED' : p.status };
}

class MockPickupService implements PickupService {
  private all(schoolId: string) {
    return storage.get<StoredPass[]>(key(schoolId), []);
  }

  getMine(scope: Scope) {
    return guarded(() => {
      const s = studentInScope(scope);
      if (scope.role !== 'PARENT') throw new AccessDenied();
      return { guardians: [], passes: this.all(scope.schoolId).filter(p => p.studentId === s.id).map(view).reverse() };
    });
  }

  issuePass(scope: Scope, req: { personName: string; relation: string; mobile: string; reason: string }, stepUpToken: string) {
    return guarded(() => {
      if (scope.role !== 'PARENT') throw new AccessDenied();
      const s = studentInScope(scope);
      const mobile = req.mobile.replace(/\D/g, '').slice(-10);
      if (req.personName.trim().length < 3) throw new RuleError('Enter the full name of the person collecting the child.', 'NAME');
      if (req.relation.trim().length < 3) throw new RuleError('Enter their relation to the child.', 'RELATION');
      if (!/^[6-9]\d{9}$/.test(mobile)) throw new RuleError('Enter a valid 10-digit mobile number.', 'MOBILE');
      if (req.reason.trim().length < 5) throw new RuleError('Add a short reason.', 'REASON');
      const list = this.all(scope.schoolId);
      if (list.filter(p => p.studentId === s.id && p.status === 'ACTIVE' && Date.now() < p.validUntil).length >= 2) {
        throw new RuleError('There are already 2 active passes for this child. Cancel one first.', 'LIMIT');
      }
      if (!authService.consumeStepUp(stepUpToken, 'PICKUP_AUTHORIZATION')) throw new RuleError('Please confirm with the OTP again.', 'STEP_UP_REQUIRED');
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const buf = new Uint32Array(8);
      crypto.getRandomValues(buf);
      const code = Array.from(buf, n => alphabet[n % alphabet.length]).join('');
      const p: StoredPass = {
        id: `PP-${scope.schoolId}-${Date.now().toString(36)}`, studentId: s.id, personName: req.personName.trim(), relation: req.relation.trim(), mobile,
        reason: req.reason.trim(), issuedAt: new Date().toISOString(), validUntil: Date.now() + TTL, status: 'ACTIVE', codeHash: fingerprint(code)
      };
      storage.set(key(scope.schoolId), [...list, p]);
      auditService.record({ schoolId: scope.schoolId, action: 'PICKUP_PASS_ISSUED', actorId: scope.userId, actorRole: scope.role, targetId: s.id, details: `Pass for ${p.personName}`, reason: p.reason });
      return { ...view(p), code };
    });
  }

  cancelPass(scope: Scope, id: string) {
    return guarded(() => {
      const s = studentInScope(scope);
      const list = this.all(scope.schoolId);
      const p = list.find(x => x.id === id && x.studentId === s.id);
      if (!p) throw new AccessDenied('Pass not found.');
      if (p.status !== 'ACTIVE') throw new RuleError('This pass is no longer active.', 'STATE');
      p.status = 'CANCELLED';
      storage.set(key(scope.schoolId), list);
      return view(p);
    });
  }

  verifyAtGate(scope: Scope, code: string) {
    return guarded(() => {
      if (scope.role !== 'TEACHER') throw new AccessDenied("Pickup passes are checked by the child's Class Teacher.");
      const list = this.all(scope.schoolId);
      const p = list.find(x => x.codeHash === fingerprint(code.trim().toUpperCase()));
      if (!p) throw new RuleError('No pass with this code.', 'INVALID');
      const db = getDb(scope.schoolId);
      const child = db.students.find(x => x.id === p.studentId);
      const cls = child ? db.classSections.find(c => c.id === child.classSectionId) : undefined;
      if (!cls || cls.classTeacherStaffId !== scope.userId) {
        throw new AccessDenied("This pass is for a child in another class. Ask that child's Class Teacher to check it.");
      }
      if (p.status === 'USED') throw new RuleError(`This pass was already used at ${p.usedAt}.`, 'USED');
      if (p.status !== 'ACTIVE') throw new RuleError('This pass was cancelled by the parent.', 'CANCELLED');
      if (Date.now() > p.validUntil) throw new RuleError('This pass has expired.', 'EXPIRED');
      (p as StoredPass & { status: string }).status = 'USED';
      p.usedAt = new Date().toISOString();
      storage.set(key(scope.schoolId), list);
      const st = getDb(scope.schoolId).students.find(x => x.id === p.studentId);
      return { ...view(p), studentName: st?.name, classLabel: st ? `${st.grade}-${st.section}` : undefined, mobile: p.mobile };
    });
  }
}

// ---------------------------------------------------------------------------- api

class ApiPickupService implements PickupService {
  getMine = (_s: Scope) => api.get<MyPickup>('/api/parent/pickup');
  issuePass = (_s: Scope, req: { personName: string; relation: string; mobile: string; reason: string }, stepUpToken: string) =>
    api.post<PickupPassView>('/api/parent/pickup/passes', { ...req, stepUpToken });
  cancelPass = (_s: Scope, id: string) => api.post<PickupPassView>(`/api/parent/pickup/passes/${encodeURIComponent(id)}/cancel`, {});
  verifyAtGate = (_s: Scope, code: string) => api.post<PickupPassView>('/api/staff/pickup/verify', { code });
}

export const pickupService: PickupService = USE_BACKEND ? new ApiPickupService() : new MockPickupService();
