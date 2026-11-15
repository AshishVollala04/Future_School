/**
 * MarksService: marks entry -> Class Teacher review -> report cards -> Principal -> Class Teacher publishes.
 *
 * Rules:
 *  - A Subject Teacher enters marks ONLY for their assigned class + subject in an OPEN assessment.
 *  - Absence is 'AB', never 0. Values are whole numbers within the max.
 *  - Sheet: NOT_STARTED -> DRAFT -> SUBMITTED -> (RETURNED -> SUBMITTED)* -> ACCEPTED.
 *  - Class Teacher accepts/returns each subject; generates report cards only when all are ACCEPTED.
 *  - Principal approves or returns EACH card. Principal never publishes.
 *  - Class Teacher publishes only when ALL cards of the class are APPROVED.
 *  - Parents see nothing until publication (AcademicsService returns published results only).
 */
import type { Scope } from '../hooks/useScope';
import { Result } from '../types/session';
import { Assessment, ClassSection, MarkValue, MarksSheet, PublishedResult, ReportCard, StudentRecord } from '../types/domain';
import { getDb, saveDb } from '../mock/db';
import { SchoolDb } from '../mock/db/seed';
import { AccessDenied, guarded, RuleError } from './mock/guard';
import { auditService } from './auditService';
import { todayISO } from '../utils/date';
import { USE_BACKEND } from '../app/backendConfig';
import { ApiMarksService } from './api/staffApiServices';

export interface SheetSummary {
  sheet: Pick<MarksSheet, 'id' | 'subject' | 'status' | 'returnReason' | 'teacherStaffId'>;
  assessment: Assessment;
  classSection: Pick<ClassSection, 'id' | 'grade' | 'section'>;
  teacherName: string;
  entered: number;
  total: number;
}

export interface SheetView {
  sheet: MarksSheet;
  assessment: Assessment;
  classSection: ClassSection;
  students: Pick<StudentRecord, 'id' | 'name' | 'rollNumber'>[];
  canEdit: boolean;
  canReview: boolean;
}

export interface MarksService {
  listMySheets(scope: Scope): Promise<Result<SheetSummary[]>>;
  getSheet(scope: Scope, sheetId: string): Promise<Result<SheetView>>;
  saveSheet(scope: Scope, sheetId: string, rows: MarksSheet['rows'], submit: boolean): Promise<Result<SheetView>>;
  listClassSheets(scope: Scope, assessmentId: string, classSectionId: string): Promise<Result<SheetSummary[]>>;
  reviewSheet(scope: Scope, sheetId: string, action: 'ACCEPT' | 'RETURN', reason?: string): Promise<Result<SheetView>>;
  generateReportCards(scope: Scope, assessmentId: string, classSectionId: string): Promise<Result<ReportCard[]>>;
  listReportCards(scope: Scope, assessmentId: string, classSectionId: string): Promise<Result<(ReportCard & { studentName: string; rollNumber: string })[]>>;
  updateRemark(scope: Scope, cardId: string, remark: string): Promise<Result<ReportCard>>;
  submitToPrincipal(scope: Scope, assessmentId: string, classSectionId: string): Promise<Result<ReportCard[]>>;
  principalDecide(scope: Scope, cardId: string, decision: 'APPROVE' | 'RETURN', note?: string): Promise<Result<ReportCard>>;
  listForPrincipal(scope: Scope): Promise<Result<{ classSection: ClassSection; assessment: Assessment; cards: (ReportCard & { studentName: string; rollNumber: string })[] }[]>>;
  publish(scope: Scope, assessmentId: string, classSectionId: string): Promise<Result<{ published: number }>>;
  openAssessments(scope: Scope, grade?: number): Promise<Result<Assessment[]>>;
}

const sheetId = (a: string, c: string, s: string) => `${a}:${c}:${s}`;
const now = () => new Date().toISOString();

function teacherName(db: SchoolDb, cs: ClassSection, staffId: string) {
  return cs.subjectTeachers.find(t => t.staffId === staffId)?.name ?? (cs.classTeacherStaffId === staffId ? cs.classTeacherName : staffId);
}

function roster(db: SchoolDb, classSectionId: string) {
  return db.students.filter(s => s.classSectionId === classSectionId && s.status === 'ACTIVE').sort((a, b) => a.rollNumber.localeCompare(b.rollNumber));
}

/** Get or lazily create the sheet for an allocation. */
function ensureSheet(db: SchoolDb, a: Assessment, cs: ClassSection, subject: string): MarksSheet {
  const id = sheetId(a.id, cs.id, subject);
  let sh = db.marksSheets.find(x => x.id === id);
  if (!sh) {
    const t = cs.subjectTeachers.find(x => x.subject === subject);
    if (!t) throw new AccessDenied('Subject is not taught in this class.');
    const rows: MarksSheet['rows'] = {};
    roster(db, cs.id).forEach(s => (rows[s.id] = { internal: null, external: null }));
    sh = { id, schoolId: db.schoolId, assessmentId: a.id, classSectionId: cs.id, subject, teacherStaffId: t.staffId, status: 'NOT_STARTED', rows, log: [] };
    db.marksSheets.push(sh);
  }
  return sh;
}

function summary(db: SchoolDb, sh: MarksSheet): SheetSummary {
  const a = db.assessments.find(x => x.id === sh.assessmentId)!;
  const cs = db.classSections.find(x => x.id === sh.classSectionId)!;
  const ids = roster(db, cs.id).map(s => s.id);
  const needExternal = a.maxExternal > 0;
  const entered = ids.filter(id => sh.rows[id]?.internal != null && (!needExternal || sh.rows[id]?.external != null)).length;
  return {
    sheet: { id: sh.id, subject: sh.subject, status: sh.status, returnReason: sh.returnReason, teacherStaffId: sh.teacherStaffId },
    assessment: a,
    classSection: { id: cs.id, grade: cs.grade, section: cs.section },
    teacherName: teacherName(db, cs, sh.teacherStaffId),
    entered,
    total: ids.length
  };
}

function loadSheet(db: SchoolDb, id: string) {
  const sh = db.marksSheets.find(x => x.id === id);
  if (!sh) throw new AccessDenied('Marks sheet not found.');
  const a = db.assessments.find(x => x.id === sh.assessmentId)!;
  const cs = db.classSections.find(x => x.id === sh.classSectionId)!;
  return { sh, a, cs };
}

function validValue(v: MarkValue | null, max: number): boolean {
  if (v === null || v === 'AB') return true;
  return Number.isInteger(v) && v >= 0 && v <= max;
}

const isCT = (scope: Scope, cs: ClassSection) => scope.role === 'TEACHER' && cs.classTeacherStaffId === scope.userId;

function cardView(db: SchoolDb, c: ReportCard) {
  const st = db.students.find(s => s.id === c.studentId)!;
  return { ...c, studentName: st.name, rollNumber: st.rollNumber };
}

class MockMarksService implements MarksService {
  private sheetView(scope: Scope, db: SchoolDb, id: string): SheetView {
    const { sh, a, cs } = loadSheet(db, id);
    const isOwner = scope.role === 'TEACHER' && sh.teacherStaffId === scope.userId;
    if (!isOwner && !isCT(scope, cs) && scope.role !== 'PRINCIPAL') throw new AccessDenied('You are not assigned to this class and subject.');
    return {
      sheet: sh,
      assessment: a,
      classSection: cs,
      students: roster(db, cs.id).map(s => ({ id: s.id, name: s.name, rollNumber: s.rollNumber })),
      canEdit: isOwner && a.status === 'OPEN' && ['NOT_STARTED', 'DRAFT', 'RETURNED'].includes(sh.status),
      canReview: isCT(scope, cs) && sh.status === 'SUBMITTED'
    };
  }

  openAssessments(scope: Scope, grade?: number) {
    return guarded(() => getDb(scope.schoolId).assessments.filter(a => a.status === 'OPEN' && (grade == null || a.grades.includes(grade))));
  }

  listMySheets(scope: Scope) {
    return guarded(() => {
      if (scope.role !== 'TEACHER') throw new AccessDenied();
      const db = getDb(scope.schoolId);
      const out: SheetSummary[] = [];
      for (const a of db.assessments.filter(x => x.status === 'OPEN')) {
        for (const cs of db.classSections.filter(c => a.grades.includes(c.grade) && roster(db, c.id).length > 0)) {
          for (const t of cs.subjectTeachers.filter(x => x.staffId === scope.userId)) {
            out.push(summary(db, ensureSheet(db, a, cs, t.subject)));
          }
        }
      }
      saveDb(db);
      const order = { RETURNED: 0, DRAFT: 1, NOT_STARTED: 2, SUBMITTED: 3, ACCEPTED: 4 } as const;
      return out.sort((x, y) => order[x.sheet.status] - order[y.sheet.status]);
    });
  }

  getSheet(scope: Scope, id: string) {
    return guarded(() => this.sheetView(scope, getDb(scope.schoolId), id));
  }

  saveSheet(scope: Scope, id: string, rows: MarksSheet['rows'], submit: boolean) {
    return guarded(() => {
      const db = getDb(scope.schoolId);
      const view = this.sheetView(scope, db, id);
      if (!view.canEdit) throw new RuleError('This sheet cannot be edited now.', 'LOCKED');
      const { sh, a } = loadSheet(db, id);
      const ids = view.students.map(s => s.id);
      const next: MarksSheet['rows'] = {};
      for (const sid of ids) {
        const r = rows[sid] ?? { internal: null, external: null };
        if (!validValue(r.internal, a.maxInternal) || (a.maxExternal > 0 && !validValue(r.external, a.maxExternal))) {
          const st = view.students.find(s => s.id === sid);
          throw new RuleError(`Check marks for ${st?.rollNumber}. ${st?.name}: use 0-max or AB.`, 'INVALID');
        }
        next[sid] = { internal: r.internal, external: a.maxExternal > 0 ? r.external : null };
      }
      if (submit) {
        const blank = ids.filter(x => next[x].internal === null || (a.maxExternal > 0 && next[x].external === null));
        if (blank.length) throw new RuleError(`Enter marks or AB for every student (${blank.length} left).`, 'INCOMPLETE');
      }
      const wasReturned = sh.status === 'RETURNED';
      sh.rows = next;
      sh.status = submit ? 'SUBMITTED' : 'DRAFT';
      if (submit) sh.returnReason = undefined;
      sh.log.push({ at: now(), by: scope.userId, action: submit ? 'SUBMITTED' : 'SAVED', note: submit && wasReturned ? 'Resubmitted after correction' : undefined });
      saveDb(db);
      return this.sheetView(scope, db, id);
    });
  }

  listClassSheets(scope: Scope, assessmentId: string, classSectionId: string) {
    return guarded(() => {
      const db = getDb(scope.schoolId);
      const cs = db.classSections.find(c => c.id === classSectionId);
      const a = db.assessments.find(x => x.id === assessmentId);
      if (!cs || !a) throw new AccessDenied('Not found.');
      if (!isCT(scope, cs) && scope.role !== 'PRINCIPAL') throw new AccessDenied('Only the Class Teacher reviews this class.');
      const list = cs.subjectTeachers.map(t => summary(db, ensureSheet(db, a, cs, t.subject)));
      saveDb(db);
      return list;
    });
  }

  reviewSheet(scope: Scope, id: string, action: 'ACCEPT' | 'RETURN', reason?: string) {
    return guarded(() => {
      const db = getDb(scope.schoolId);
      const view = this.sheetView(scope, db, id);
      if (!view.canReview) throw new RuleError('Only a submitted sheet can be reviewed by the Class Teacher.', 'STATE');
      const { sh } = loadSheet(db, id);
      if (action === 'RETURN') {
        const r = reason?.trim() ?? '';
        if (r.length < 5) throw new RuleError('Tell the subject teacher what to correct.', 'REASON');
        sh.status = 'RETURNED';
        sh.returnReason = r;
        sh.log.push({ at: now(), by: scope.userId, action: 'RETURNED', note: r });
      } else {
        sh.status = 'ACCEPTED';
        sh.log.push({ at: now(), by: scope.userId, action: 'ACCEPTED' });
      }
      saveDb(db);
      return this.sheetView(scope, db, id);
    });
  }

  generateReportCards(scope: Scope, assessmentId: string, classSectionId: string) {
    return guarded(() => {
      const db = getDb(scope.schoolId);
      const cs = db.classSections.find(c => c.id === classSectionId);
      const a = db.assessments.find(x => x.id === assessmentId);
      if (!cs || !a) throw new AccessDenied('Not found.');
      if (!isCT(scope, cs)) throw new AccessDenied('Only the Class Teacher generates report cards.');
      const sheets = cs.subjectTeachers.map(t => ensureSheet(db, a, cs, t.subject));
      const notAccepted = sheets.filter(s => s.status !== 'ACCEPTED');
      if (notAccepted.length) throw new RuleError(`Accept all subjects first: ${notAccepted.map(s => s.subject).join(', ')}.`, 'NOT_READY');
      const existing = db.reportCards.filter(c => c.assessmentId === a.id && c.classSectionId === cs.id);
      if (existing.some(c => c.status === 'SUBMITTED' || c.status === 'APPROVED' || c.status === 'PUBLISHED')) {
        throw new RuleError('Report cards are already with the Principal or published.', 'LOCKED');
      }
      const total = a.maxInternal + a.maxExternal;
      const cards = roster(db, cs.id).map(st => {
        const prev = existing.find(c => c.studentId === st.id);
        const subjects = sheets.map(sh => ({
          subject: sh.subject,
          internal: sh.rows[st.id]?.internal ?? 'AB',
          external: a.maxExternal > 0 ? sh.rows[st.id]?.external ?? 'AB' : 0,
          maxInternal: a.maxInternal,
          maxExternal: a.maxExternal,
          passMark: Math.ceil((total * (a.secondLanguageSubjects.includes(sh.subject) ? a.secondLanguagePassPercent : a.passPercent)) / 100)
        })) as ReportCard['subjects'];
        const card: ReportCard = {
          id: `${a.id}:${st.id}`, schoolId: db.schoolId, assessmentId: a.id, classSectionId: cs.id, studentId: st.id, subjects,
          classTeacherRemark: prev?.classTeacherRemark ?? '', status: prev?.status === 'RETURNED' ? 'RETURNED' : 'DRAFT',
          principalNote: prev?.principalNote, log: [...(prev?.log ?? []), { at: now(), by: scope.userId, action: 'GENERATED' }]
        };
        return card;
      });
      db.reportCards = db.reportCards.filter(c => !(c.assessmentId === a.id && c.classSectionId === cs.id)).concat(cards);
      saveDb(db);
      return cards;
    });
  }

  listReportCards(scope: Scope, assessmentId: string, classSectionId: string) {
    return guarded(() => {
      const db = getDb(scope.schoolId);
      const cs = db.classSections.find(c => c.id === classSectionId);
      if (!cs) throw new AccessDenied('Class not found.');
      if (!isCT(scope, cs) && scope.role !== 'PRINCIPAL') throw new AccessDenied();
      return db.reportCards
        .filter(c => c.assessmentId === assessmentId && c.classSectionId === classSectionId)
        .map(c => cardView(db, c))
        .sort((a, b) => a.rollNumber.localeCompare(b.rollNumber));
    });
  }

  updateRemark(scope: Scope, cardId: string, remark: string) {
    return guarded(() => {
      const db = getDb(scope.schoolId);
      const c = db.reportCards.find(x => x.id === cardId);
      if (!c) throw new AccessDenied('Report card not found.');
      const cs = db.classSections.find(x => x.id === c.classSectionId)!;
      if (!isCT(scope, cs)) throw new AccessDenied();
      if (c.status !== 'DRAFT' && c.status !== 'RETURNED') throw new RuleError('This card is locked.', 'LOCKED');
      c.classTeacherRemark = remark.trim().slice(0, 300);
      saveDb(db);
      return c;
    });
  }

  submitToPrincipal(scope: Scope, assessmentId: string, classSectionId: string) {
    return guarded(() => {
      const db = getDb(scope.schoolId);
      const cs = db.classSections.find(c => c.id === classSectionId);
      if (!cs || !isCT(scope, cs)) throw new AccessDenied('Only the Class Teacher submits report cards.');
      const cards = db.reportCards.filter(c => c.assessmentId === assessmentId && c.classSectionId === classSectionId);
      if (!cards.length) throw new RuleError('Generate report cards first.', 'NOT_READY');
      const toSend = cards.filter(c => c.status === 'DRAFT' || c.status === 'RETURNED');
      if (!toSend.length) throw new RuleError('Nothing to submit.', 'NOTHING');
      const noRemark = toSend.filter(c => !c.classTeacherRemark);
      if (noRemark.length) throw new RuleError(`Add a remark for every student (${noRemark.length} left).`, 'REMARKS');
      toSend.forEach(c => {
        c.status = 'SUBMITTED';
        c.log.push({ at: now(), by: scope.userId, action: 'SUBMITTED_TO_PRINCIPAL' });
      });
      saveDb(db);
      return cards;
    });
  }

  principalDecide(scope: Scope, cardId: string, decision: 'APPROVE' | 'RETURN', note?: string) {
    return guarded(() => {
      if (scope.role !== 'PRINCIPAL') throw new AccessDenied('Only the Principal approves report cards.');
      const db = getDb(scope.schoolId);
      const c = db.reportCards.find(x => x.id === cardId);
      if (!c) throw new AccessDenied('Report card not found.');
      if (c.status !== 'SUBMITTED') throw new RuleError('This card is not waiting for approval.', 'STATE');
      if (decision === 'RETURN') {
        const n = note?.trim() ?? '';
        if (n.length < 5) throw new RuleError('Tell the Class Teacher what to correct.', 'REASON');
        c.status = 'RETURNED';
        c.principalNote = n;
      } else {
        c.status = 'APPROVED';
        c.principalNote = undefined;
      }
      c.log.push({ at: now(), by: scope.userId, action: decision === 'APPROVE' ? 'APPROVED' : 'RETURNED', note });
      saveDb(db);
      return c;
    });
  }

  listForPrincipal(scope: Scope) {
    return guarded(() => {
      if (scope.role !== 'PRINCIPAL') throw new AccessDenied();
      const db = getDb(scope.schoolId);
      const groups = new Map<string, ReportCard[]>();
      db.reportCards
        .filter(c => c.status !== 'DRAFT')
        .forEach(c => {
          const k = `${c.assessmentId}|${c.classSectionId}`;
          groups.set(k, [...(groups.get(k) ?? []), c]);
        });
      return Array.from(groups.entries()).map(([k, cards]) => {
        const [aid, cid] = k.split('|');
        return {
          classSection: db.classSections.find(c => c.id === cid)!,
          assessment: db.assessments.find(a => a.id === aid)!,
          cards: cards.map(c => cardView(db, c)).sort((a, b) => a.rollNumber.localeCompare(b.rollNumber))
        };
      });
    });
  }

  publish(scope: Scope, assessmentId: string, classSectionId: string) {
    return guarded(() => {
      const db = getDb(scope.schoolId);
      const cs = db.classSections.find(c => c.id === classSectionId);
      const a = db.assessments.find(x => x.id === assessmentId);
      if (!cs || !a) throw new AccessDenied('Not found.');
      if (!isCT(scope, cs)) throw new AccessDenied('Only the Class Teacher publishes results.');
      const cards = db.reportCards.filter(c => c.assessmentId === a.id && c.classSectionId === cs.id);
      if (!cards.length) throw new RuleError('No report cards yet.', 'NOT_READY');
      const notApproved = cards.filter(c => c.status !== 'APPROVED');
      if (notApproved.length) throw new RuleError(`Publication waits until all cards are approved (${notApproved.length} pending).`, 'NOT_READY');
      const today = todayISO();
      cards.forEach(c => {
        const prior = db.results.filter(r => r.studentId === c.studentId && r.examName === a.name);
        prior.forEach(r => (r.status = 'SUPERSEDED'));
        const version = prior.reduce((m, r) => Math.max(m, r.version), 0) + 1;
        const res: PublishedResult = {
          id: `RES-${c.id}-v${version}`, studentId: c.studentId, examName: a.name, version, status: 'CURRENT',
          publishedOn: today, subjects: c.subjects, classTeacherRemark: c.classTeacherRemark
        };
        db.results.push(res);
        c.status = 'PUBLISHED';
        c.log.push({ at: now(), by: scope.userId, action: 'PUBLISHED', note: `v${version}` });
      });
      saveDb(db);
      auditService.record({
        schoolId: scope.schoolId, action: 'RESULTS_PUBLISHED', actorId: scope.userId, actorRole: scope.role,
        targetId: `${a.id}:${cs.id}`, details: `${a.name} results published for Class ${cs.grade}-${cs.section} (${cards.length} students).`
      });
      return { published: cards.length };
    });
  }
}

export const marksService: MarksService = USE_BACKEND ? new ApiMarksService() : new MockMarksService();
