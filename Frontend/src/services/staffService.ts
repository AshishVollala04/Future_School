/**
 * StaffService: teacher leave (Teacher applies -> Principal decides; Admin arranges substitution later)
 * and the Principal/Admin school overview (operational numbers only, never rankings of people).
 */
import type { Scope } from '../hooks/useScope';
import { Result } from '../types/session';
import { TeacherLeave } from '../types/domain';
import { getDb, saveDb } from '../mock/db';
import { AccessDenied, guarded, RuleError } from './mock/guard';
import { computeFeeLines } from './feeService';
import { computeStatus } from './hallTicketService';
import { auditService } from './auditService';
import { addDaysISO, todayISO } from '../utils/date';
import { USE_BACKEND } from '../app/backendConfig';
import { withApiCounts } from './api/governanceApiServices';
import { withApiTeacherLeave } from './api/leaveApiServices';

export interface SchoolOverview {
  attendance: { date: string; classesTotal: number; morningTaken: number; afternoonTaken: number; presentPct: number | null };
  academics: { classLabel: string; classTeacher: string; assessment: string; subjectsAccepted: number; subjectsTotal: number; cards: Record<string, number>; published: boolean }[];
  finance: { charged: number; concession: number; collected: number; outstanding: number; overdue: number; byInstalment: { label: string; due: number; collected: number }[] };
  hallTickets: { exam: string; startsOn: string; students: number; cleared: number; released: number }[];
  counts: { reportCards: number; corrections: number; teacherLeave: number; governance: number };
}

export interface StaffService {
  myLeaves(scope: Scope): Promise<Result<TeacherLeave[]>>;
  applyLeave(scope: Scope, req: { fromDate: string; toDate: string; kind: TeacherLeave['kind']; reason: string }, staffName: string): Promise<Result<TeacherLeave>>;
  listTeacherLeave(scope: Scope): Promise<Result<TeacherLeave[]>>;
  decideTeacherLeave(scope: Scope, id: string, decision: 'APPROVED' | 'REJECTED', note: string): Promise<Result<TeacherLeave>>;
  getOverview(scope: Scope): Promise<Result<SchoolOverview>>;
}

class MockStaffService implements StaffService {
  myLeaves(scope: Scope) {
    return guarded(() => {
      if (scope.role !== 'TEACHER') throw new AccessDenied();
      return getDb(scope.schoolId).teacherLeaves.filter(l => l.staffId === scope.userId).reverse();
    });
  }

  applyLeave(scope: Scope, req: { fromDate: string; toDate: string; kind: TeacherLeave['kind']; reason: string }, staffName: string) {
    return guarded(() => {
      if (scope.role !== 'TEACHER') throw new AccessDenied();
      if (!req.fromDate || req.toDate < req.fromDate) throw new RuleError('Check the dates.', 'DATES');
      if (req.fromDate < addDaysISO(-3)) throw new RuleError('Leave can be applied up to 3 days after.', 'DATES');
      if (req.reason.trim().length < 5) throw new RuleError('Add a short reason.', 'REASON');
      const db = getDb(scope.schoolId);
      if (db.teacherLeaves.some(l => l.staffId === scope.userId && (l.status === 'PENDING' || l.status === 'APPROVED') && !(l.toDate < req.fromDate || l.fromDate > req.toDate))) {
        throw new RuleError('You already have leave for these dates.', 'OVERLAP');
      }
      const l: TeacherLeave = {
        id: `TL-${scope.schoolId}-${Date.now().toString(36)}`, schoolId: scope.schoolId, staffId: scope.userId, staffName,
        fromDate: req.fromDate, toDate: req.toDate, kind: req.kind, reason: req.reason.trim().slice(0, 500), status: 'PENDING'
      };
      db.teacherLeaves.push(l);
      saveDb(db);
      return l;
    });
  }

  listTeacherLeave(scope: Scope) {
    return guarded(() => {
      if (scope.role !== 'PRINCIPAL' && scope.role !== 'ADMIN') throw new AccessDenied();
      return [...getDb(scope.schoolId).teacherLeaves].sort((a, b) => Number(b.status === 'PENDING') - Number(a.status === 'PENDING') || a.fromDate.localeCompare(b.fromDate));
    });
  }

  decideTeacherLeave(scope: Scope, id: string, decision: 'APPROVED' | 'REJECTED', note: string) {
    return guarded(() => {
      if (scope.role !== 'PRINCIPAL') throw new AccessDenied('Only the Principal approves teacher leave.');
      const db = getDb(scope.schoolId);
      const l = db.teacherLeaves.find(x => x.id === id);
      if (!l) throw new AccessDenied('Leave not found.');
      if (l.status !== 'PENDING') throw new RuleError('Already decided.', 'STATE');
      if (decision === 'REJECTED' && note.trim().length < 5) throw new RuleError('Add a reason.', 'REASON');
      l.status = decision;
      l.decision = { by: scope.userId, at: new Date().toISOString(), note: note.trim() || undefined };
      saveDb(db);
      auditService.record({ schoolId: scope.schoolId, action: `TEACHER_LEAVE_${decision}`, actorId: scope.userId, actorRole: scope.role, targetId: l.staffId, details: `${l.fromDate} to ${l.toDate}` });
      return l;
    });
  }

  getOverview(scope: Scope) {
    return guarded((): SchoolOverview => {
      if (scope.role !== 'PRINCIPAL' && scope.role !== 'ADMIN') throw new AccessDenied();
      const db = getDb(scope.schoolId);
      const today = new Date().getDay() === 0 ? addDaysISO(-1) : todayISO();
      const classes = db.classSections.filter(cs => db.students.some(s => s.classSectionId === cs.id));
      const regs = db.registers.filter(r => r.date === today);
      const marks = regs.flatMap(r => Object.values(r.marks));
      const present = marks.filter(m => m === 'P' || m === 'LATE').length;

      const academics = classes.flatMap(cs =>
        db.assessments
          .filter(a => a.grades.includes(cs.grade))
          .map(a => {
            const sheets = db.marksSheets.filter(m => m.assessmentId === a.id && m.classSectionId === cs.id);
            const cards = db.reportCards.filter(c => c.assessmentId === a.id && c.classSectionId === cs.id);
            const byStatus: Record<string, number> = {};
            cards.forEach(c => (byStatus[c.status] = (byStatus[c.status] ?? 0) + 1));
            return {
              classLabel: `${cs.grade}-${cs.section}`,
              classTeacher: cs.classTeacherName,
              assessment: a.name,
              subjectsAccepted: sheets.filter(s => s.status === 'ACCEPTED').length,
              subjectsTotal: cs.subjectTeachers.length,
              cards: byStatus,
              published: cards.length > 0 && cards.every(c => c.status === 'PUBLISHED')
            };
          })
      );

      const lines = db.students.flatMap(s => computeFeeLines(db, s.id));
      const finance = {
        charged: lines.reduce((a, l) => a + l.charge.amount, 0),
        concession: lines.reduce((a, l) => a + l.concession, 0),
        collected: lines.reduce((a, l) => a + l.paid, 0),
        outstanding: lines.reduce((a, l) => a + l.outstanding, 0),
        overdue: lines.filter(l => l.overdue).reduce((a, l) => a + l.outstanding, 0),
        byInstalment: db.instalments.map(i => {
          const ls = lines.filter(l => l.charge.instalment === i.number);
          return { label: `${i.number}. ${i.label}`, due: ls.reduce((a, l) => a + l.charge.amount - l.concession, 0), collected: ls.reduce((a, l) => a + l.paid, 0) };
        })
      };

      const hallTickets = db.exams
        .filter(e => e.startsOn >= todayISO())
        .map(e => {
          const sts = db.students.filter(s => e.grades.includes(s.grade) && s.status === 'ACTIVE').map(s => computeStatus(db, e, s));
          return { exam: e.name, startsOn: e.startsOn, students: sts.length, cleared: sts.filter(x => x.feeClearance === 'CLEARED').length, released: sts.filter(x => x.release).length };
        });

      return {
        attendance: {
          date: today,
          classesTotal: classes.length,
          morningTaken: regs.filter(r => r.session === 'MORNING').length,
          afternoonTaken: regs.filter(r => r.session === 'AFTERNOON').length,
          presentPct: marks.length ? Math.round((present / marks.length) * 1000) / 10 : null
        },
        academics,
        finance,
        hallTickets,
        counts: {
          reportCards: db.reportCards.filter(c => c.status === 'SUBMITTED').length,
          corrections: db.corrections.filter(c => c.status === 'VERIFIED').length,
          teacherLeave: db.teacherLeaves.filter(l => l.status === 'PENDING').length,
          governance: db.changeRequests.filter(r => r.status === 'PENDING_APPROVAL').length
        }
      };
    });
  }
}

export const staffService: StaffService = USE_BACKEND ? withApiTeacherLeave(withApiCounts(new MockStaffService())) : new MockStaffService();
