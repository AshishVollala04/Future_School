/**
 * SubstitutionService (Flow 6): after the Principal approves teacher leave, the Admin
 * (ACADEMIC_OPS) assigns a free teacher to every period the absent teacher would teach.
 * The substitute sees the duty on their Today screen. Nothing is deleted; reassigning
 * a period replaces the assignment and is audited.
 */
import type { Scope } from '../hooks/useScope';
import { Result } from '../types/session';
import { ClassSection, SubstitutionSlot, TeacherLeave } from '../types/domain';
import { getDb, saveDb } from '../mock/db';
import { SchoolDb } from '../mock/db/seed';
import { AccessDenied, guarded, RuleError } from './mock/guard';
import { requireAdmin } from './mock/permissions';
import { auditService } from './auditService';
import { addDaysISO, isoWeekday, todayISO } from '../utils/date';
import { USE_BACKEND } from '../app/backendConfig';
import { ApiSubstitutionService } from './api/leaveApiServices';

export interface StaffRef {
  staffId: string;
  name: string;
}

export interface SubstitutionNeed {
  leaveId: string;
  absentStaffId: string;
  absentName: string;
  date: string;
  classSectionId: string;
  classLabel: string;
  period: number;
  start: string;
  end: string;
  subject: string;
  assigned?: SubstitutionSlot;
  freeTeachers: StaffRef[];
}

export interface SubstitutionService {
  listNeeds(scope: Scope): Promise<Result<SubstitutionNeed[]>>;
  assign(scope: Scope, req: { leaveId: string; date: string; classSectionId: string; period: number; substituteStaffId: string }): Promise<Result<SubstitutionSlot>>;
  /** Teacher: substitution duties on a date. */
  myDuties(scope: Scope, date?: string): Promise<Result<SubstitutionSlot[]>>;
}

const staffOf = (cs: ClassSection, subject: string) => cs.subjectTeachers.find(t => t.subject === subject)?.staffId ?? cs.classTeacherStaffId;

export function schoolStaff(db: SchoolDb): StaffRef[] {
  const m = new Map<string, string>();
  db.classSections.forEach(cs => {
    m.set(cs.classTeacherStaffId, cs.classTeacherName);
    cs.subjectTeachers.forEach(t => m.set(t.staffId, t.name));
  });
  return [...m.entries()].map(([staffId, name]) => ({ staffId, name })).sort((a, b) => a.name.localeCompare(b.name));
}

function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const start = new Date(from + 'T00:00:00');
  for (let i = 0; i < 31; i++) {
    const d = addDaysISO(i, start);
    if (d > to) break;
    out.push(d);
  }
  return out;
}

const weekday = (date: string) => isoWeekday(new Date(date + 'T00:00:00'));
const allSlots = (db: SchoolDb) => db.teacherLeaves.flatMap(l => l.substitution?.slots ?? []);
const onLeave = (db: SchoolDb, staffId: string, date: string) =>
  db.teacherLeaves.some(l => l.staffId === staffId && l.status === 'APPROVED' && l.fromDate <= date && l.toDate >= date);

/** Is this teacher free at (date, period)? Not teaching, not on leave, not already substituting. */
function isFree(db: SchoolDb, staffId: string, date: string, period: number, ignore?: { classSectionId: string }): boolean {
  if (onLeave(db, staffId, date)) return false;
  const day = weekday(date);
  const teaching = db.classSections.some(cs => (db.timetables[cs.id] ?? []).some(s => s.day === day && s.period === period && staffOf(cs, s.subject) === staffId));
  if (teaching) return false;
  return !allSlots(db).some(s => s.date === date && s.period === period && s.substituteStaffId === staffId && s.classSectionId !== ignore?.classSectionId);
}

function needsFor(db: SchoolDb, l: TeacherLeave, today: string): SubstitutionNeed[] {
  const staff = schoolStaff(db);
  return datesBetween(l.fromDate < today ? today : l.fromDate, l.toDate).flatMap(date => {
    const day = weekday(date);
    if (day === 7) return [];
    return db.classSections.flatMap(cs =>
      (db.timetables[cs.id] ?? [])
        .filter(s => s.day === day && staffOf(cs, s.subject) === l.staffId)
        .map(s => ({
          leaveId: l.id,
          absentStaffId: l.staffId,
          absentName: l.staffName,
          date,
          classSectionId: cs.id,
          classLabel: `${cs.grade}-${cs.section}`,
          period: s.period,
          start: s.start,
          end: s.end,
          subject: s.subject,
          assigned: l.substitution?.slots?.find(x => x.date === date && x.classSectionId === cs.id && x.period === s.period),
          freeTeachers: staff.filter(t => t.staffId !== l.staffId && isFree(db, t.staffId, date, s.period, { classSectionId: cs.id }))
        }))
    );
  });
}

class MockSubstitutionService implements SubstitutionService {
  listNeeds(scope: Scope) {
    return guarded(() => {
      requireAdmin(scope, 'ACADEMIC_OPS');
      const db = getDb(scope.schoolId);
      const today = todayISO();
      return db.teacherLeaves
        .filter(l => l.status === 'APPROVED' && l.toDate >= today)
        .flatMap(l => needsFor(db, l, today))
        .sort((a, b) => a.date.localeCompare(b.date) || a.period - b.period);
    });
  }

  assign(scope: Scope, req: { leaveId: string; date: string; classSectionId: string; period: number; substituteStaffId: string }) {
    return guarded(() => {
      requireAdmin(scope, 'ACADEMIC_OPS');
      const db = getDb(scope.schoolId);
      const l = db.teacherLeaves.find(x => x.id === req.leaveId);
      if (!l) throw new AccessDenied('Leave not found.');
      if (l.status !== 'APPROVED') throw new RuleError('Substitutes are arranged only for leave the Principal approved.', 'STATE');
      const need = needsFor(db, l, todayISO()).find(n => n.date === req.date && n.classSectionId === req.classSectionId && n.period === req.period);
      if (!need) throw new RuleError('That period is not part of this leave.', 'NO_PERIOD');
      const sub = need.freeTeachers.find(t => t.staffId === req.substituteStaffId);
      if (!sub) throw new RuleError('That teacher is not free in this period.', 'NOT_FREE');
      const slot: SubstitutionSlot = {
        date: need.date, classSectionId: need.classSectionId, classLabel: need.classLabel, period: need.period, start: need.start,
        subject: need.subject, substituteStaffId: sub.staffId, substituteName: sub.name, arrangedAt: new Date().toISOString()
      };
      const slots = (l.substitution?.slots ?? []).filter(x => !(x.date === slot.date && x.classSectionId === slot.classSectionId && x.period === slot.period));
      slots.push(slot);
      const total = needsFor(db, l, todayISO()).length;
      l.substitution = { arrangedBy: scope.userId, note: `${slots.length} of ${total} period(s) covered`, slots };
      saveDb(db);
      auditService.record({
        schoolId: scope.schoolId, action: need.assigned ? 'SUBSTITUTE_REASSIGNED' : 'SUBSTITUTE_ASSIGNED', actorId: scope.userId, actorRole: scope.role,
        targetId: l.id, details: `${slot.date} P${slot.period} ${slot.classLabel} ${slot.subject}: ${sub.name} for ${l.staffName}`
      });
      return slot;
    });
  }

  myDuties(scope: Scope, date = todayISO()) {
    return guarded(() => {
      if (scope.role !== 'TEACHER') throw new AccessDenied();
      return allSlots(getDb(scope.schoolId))
        .filter(s => s.substituteStaffId === scope.userId && s.date >= date)
        .sort((a, b) => a.date.localeCompare(b.date) || a.period - b.period);
    });
  }
}

export const substitutionService: SubstitutionService = USE_BACKEND ? new ApiSubstitutionService() : new MockSubstitutionService();
