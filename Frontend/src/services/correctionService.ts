/**
 * Corrections to PUBLISHED results. Never overwritten:
 *   Subject Teacher raises -> Class Teacher verifies -> Principal approves (OTP)
 *   -> Class Teacher republishes -> new version CURRENT, old version SUPERSEDED.
 */
import type { Scope } from '../hooks/useScope';
import { Result } from '../types/session';
import { MarkCorrection, MarkValue, PublishedResult } from '../types/domain';
import { getDb, saveDb } from '../mock/db';
import { SchoolDb } from '../mock/db/seed';
import { AccessDenied, guarded, RuleError } from './mock/guard';
import { authService } from './authService';
import { auditService } from './auditService';
import { todayISO } from '../utils/date';
import { USE_BACKEND } from '../app/backendConfig';
import { ApiCorrectionService } from './api/governanceApiServices';

export interface CorrectableRow {
  resultId: string;
  studentId: string;
  studentName: string;
  rollNumber: string;
  examName: string;
  version: number;
  subject: string;
  internal: MarkValue;
  external: MarkValue;
  maxInternal: number;
  maxExternal: number;
  openCorrection?: MarkCorrection['status'];
}

export interface CorrectionView extends MarkCorrection {
  studentName: string;
  rollNumber: string;
  classLabel: string;
}

export interface CorrectionService {
  listCorrectable(scope: Scope): Promise<Result<CorrectableRow[]>>;
  raise(scope: Scope, req: { resultId: string; subject: string; field: 'internal' | 'external'; to: MarkValue; reason: string }): Promise<Result<MarkCorrection>>;
  listForClassTeacher(scope: Scope, classSectionId: string): Promise<Result<CorrectionView[]>>;
  verify(scope: Scope, id: string, decision: 'VERIFY' | 'REJECT', note: string): Promise<Result<MarkCorrection>>;
  listForPrincipal(scope: Scope): Promise<Result<CorrectionView[]>>;
  principalDecide(scope: Scope, id: string, decision: 'APPROVE' | 'REJECT', note: string, stepUpToken?: string): Promise<Result<MarkCorrection>>;
  republish(scope: Scope, id: string): Promise<Result<PublishedResult>>;
}

const now = () => new Date().toISOString();
const OPEN = ['RAISED', 'VERIFIED', 'APPROVED'];

function view(db: SchoolDb, c: MarkCorrection): CorrectionView {
  const s = db.students.find(x => x.id === c.studentId)!;
  const cs = db.classSections.find(x => x.id === c.classSectionId)!;
  return { ...c, studentName: s.name, rollNumber: s.rollNumber, classLabel: `${cs.grade}-${cs.section}` };
}

class MockCorrectionService implements CorrectionService {
  listCorrectable(scope: Scope) {
    return guarded(() => {
      if (scope.role !== 'TEACHER') throw new AccessDenied();
      const db = getDb(scope.schoolId);
      const out: CorrectableRow[] = [];
      for (const cs of db.classSections) {
        const mySubjects = cs.subjectTeachers.filter(t => t.staffId === scope.userId).map(t => t.subject);
        if (!mySubjects.length) continue;
        for (const st of db.students.filter(s => s.classSectionId === cs.id)) {
          for (const r of db.results.filter(x => x.studentId === st.id && x.status === 'CURRENT')) {
            for (const sub of r.subjects.filter(x => mySubjects.includes(x.subject))) {
              const open = db.corrections.find(c => c.resultId === r.id && c.subject === sub.subject && OPEN.includes(c.status));
              out.push({
                resultId: r.id, studentId: st.id, studentName: st.name, rollNumber: st.rollNumber, examName: r.examName, version: r.version,
                subject: sub.subject, internal: sub.internal, external: sub.external, maxInternal: sub.maxInternal, maxExternal: sub.maxExternal,
                openCorrection: open?.status
              });
            }
          }
        }
      }
      return out.sort((a, b) => a.examName.localeCompare(b.examName) || a.rollNumber.localeCompare(b.rollNumber));
    });
  }

  raise(scope: Scope, req: { resultId: string; subject: string; field: 'internal' | 'external'; to: MarkValue; reason: string }) {
    return guarded(() => {
      if (scope.role !== 'TEACHER') throw new AccessDenied();
      const db = getDb(scope.schoolId);
      const r = db.results.find(x => x.id === req.resultId);
      if (!r || r.status !== 'CURRENT') throw new RuleError('Only the current published version can be corrected.', 'STATE');
      const st = db.students.find(s => s.id === r.studentId)!;
      const cs = db.classSections.find(c => c.id === st.classSectionId)!;
      if (!cs.subjectTeachers.some(t => t.subject === req.subject && t.staffId === scope.userId)) throw new AccessDenied('Only the subject teacher can raise this correction.');
      const sub = r.subjects.find(x => x.subject === req.subject);
      if (!sub) throw new RuleError('Subject not on this result.', 'NOT_FOUND');
      const max = req.field === 'internal' ? sub.maxInternal : sub.maxExternal;
      if (max === 0) throw new RuleError('This field is not part of the assessment.', 'FIELD');
      if (!(req.to === 'AB' || (Number.isInteger(req.to) && req.to >= 0 && req.to <= max))) throw new RuleError(`Enter 0-${max} or AB.`, 'INVALID');
      if (req.to === sub[req.field]) throw new RuleError('The new value is the same as the published one.', 'SAME');
      if (req.reason.trim().length < 10) throw new RuleError('Explain the correction (10+ characters).', 'REASON');
      if (db.corrections.some(c => c.resultId === r.id && c.subject === req.subject && OPEN.includes(c.status))) throw new RuleError('A correction for this subject is already in progress.', 'OPEN');
      const c: MarkCorrection = {
        id: `MC-${scope.schoolId}-${Date.now().toString(36)}`, schoolId: scope.schoolId, resultId: r.id, studentId: st.id, classSectionId: cs.id,
        examName: r.examName, subject: req.subject, field: req.field, from: sub[req.field], to: req.to, reason: req.reason.trim(),
        raisedBy: scope.userId, status: 'RAISED', log: [{ at: now(), by: scope.userId, action: 'RAISED' }]
      };
      db.corrections.push(c);
      saveDb(db);
      return c;
    });
  }

  listForClassTeacher(scope: Scope, classSectionId: string) {
    return guarded(() => {
      const db = getDb(scope.schoolId);
      const cs = db.classSections.find(c => c.id === classSectionId);
      if (!cs || !(scope.role === 'TEACHER' && cs.classTeacherStaffId === scope.userId)) throw new AccessDenied();
      return db.corrections.filter(c => c.classSectionId === classSectionId).map(c => view(db, c)).reverse();
    });
  }

  verify(scope: Scope, id: string, decision: 'VERIFY' | 'REJECT', note: string) {
    return guarded(() => {
      const db = getDb(scope.schoolId);
      const c = db.corrections.find(x => x.id === id);
      if (!c) throw new AccessDenied('Correction not found.');
      const cs = db.classSections.find(x => x.id === c.classSectionId)!;
      if (!(scope.role === 'TEACHER' && cs.classTeacherStaffId === scope.userId)) throw new AccessDenied('Only the Class Teacher verifies corrections.');
      if (c.raisedBy === scope.userId) throw new RuleError('You raised this correction; it must be verified by someone else.', 'SAME_PERSON');
      if (c.status !== 'RAISED') throw new RuleError('Not waiting for verification.', 'STATE');
      if (decision === 'REJECT' && note.trim().length < 5) throw new RuleError('Add a note.', 'REASON');
      c.status = decision === 'VERIFY' ? 'VERIFIED' : 'REJECTED';
      c.log.push({ at: now(), by: scope.userId, action: c.status, note: note.trim() || undefined });
      saveDb(db);
      return c;
    });
  }

  listForPrincipal(scope: Scope) {
    return guarded(() => {
      if (scope.role !== 'PRINCIPAL') throw new AccessDenied();
      const db = getDb(scope.schoolId);
      return db.corrections.filter(c => c.status !== 'RAISED').map(c => view(db, c)).sort((a, b) => Number(b.status === 'VERIFIED') - Number(a.status === 'VERIFIED'));
    });
  }

  principalDecide(scope: Scope, id: string, decision: 'APPROVE' | 'REJECT', note: string, stepUpToken?: string) {
    return guarded(() => {
      if (scope.role !== 'PRINCIPAL') throw new AccessDenied('Only the Principal approves corrections.');
      const db = getDb(scope.schoolId);
      const c = db.corrections.find(x => x.id === id);
      if (!c) throw new AccessDenied('Correction not found.');
      if (c.status !== 'VERIFIED') throw new RuleError('Not waiting for approval.', 'STATE');
      if (decision === 'APPROVE') {
        if (!stepUpToken || !authService.consumeStepUp(stepUpToken, 'SENSITIVE_STAFF_ACTION')) throw new RuleError('Please confirm with the OTP again.', 'STEP_UP_REQUIRED');
      } else if (note.trim().length < 5) throw new RuleError('Add a note.', 'REASON');
      c.status = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      c.log.push({ at: now(), by: scope.userId, action: c.status, note: note.trim() || undefined });
      saveDb(db);
      auditService.record({
        schoolId: scope.schoolId, action: `MARK_CORRECTION_${c.status}`, actorId: scope.userId, actorRole: scope.role, targetId: c.studentId,
        details: `${c.examName} ${c.subject}: ${c.from} → ${c.to}`, reason: c.reason
      });
      return c;
    });
  }

  republish(scope: Scope, id: string) {
    return guarded(() => {
      const db = getDb(scope.schoolId);
      const c = db.corrections.find(x => x.id === id);
      if (!c) throw new AccessDenied('Correction not found.');
      const cs = db.classSections.find(x => x.id === c.classSectionId)!;
      if (!(scope.role === 'TEACHER' && cs.classTeacherStaffId === scope.userId)) throw new AccessDenied('Only the Class Teacher republishes.');
      if (c.status !== 'APPROVED') throw new RuleError('The Principal has not approved this correction yet.', 'STATE');
      const current = db.results.find(r => r.id === c.resultId);
      if (!current || current.status !== 'CURRENT') throw new RuleError('The result changed since this correction was raised. Raise it again.', 'STALE');
      const version = db.results.filter(r => r.studentId === c.studentId && r.examName === c.examName).reduce((m, r) => Math.max(m, r.version), 0) + 1;
      const next: PublishedResult = {
        ...current,
        id: `${current.id.replace(/-v\d+$/, '')}-v${version}`,
        version,
        status: 'CURRENT',
        publishedOn: todayISO(),
        subjects: current.subjects.map(s => (s.subject === c.subject ? { ...s, [c.field]: c.to } : s))
      };
      current.status = 'SUPERSEDED';
      db.results.push(next);
      c.status = 'REPUBLISHED';
      c.log.push({ at: now(), by: scope.userId, action: 'REPUBLISHED', note: `v${version}` });
      saveDb(db);
      auditService.record({
        schoolId: scope.schoolId, action: 'RESULT_REPUBLISHED', actorId: scope.userId, actorRole: scope.role, targetId: c.studentId,
        details: `${c.examName} v${current.version} superseded by v${version} (${c.subject} ${c.from} → ${c.to}).`
      });
      return next;
    });
  }
}

export const correctionService: CorrectionService = USE_BACKEND ? new ApiCorrectionService() : new MockCorrectionService();
