// Service-level rule checks (mock implementations). Run all with: npm run test:services
const SRC = new URL('../../src/', import.meta.url).href;
const mem: Record<string, string> = {};
(globalThis as any).window = { localStorage: { getItem: (k: string) => (k in mem ? mem[k] : null), setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; }, key: (i: number) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } } };
const u = (p: string) => SRC + p;
const { leaveService } = await import(u('services/leaveService.ts'));
const { attendanceService } = await import(u('services/attendanceService.ts'));
const { marksService } = await import(u('services/marksService.ts'));
const { academicsService } = await import(u('services/academicsService.ts'));
const { addDaysISO, todayISO } = await import(u('utils/date.ts'));
const check = (n: string, c: boolean, x?: any) => console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  -> ' + JSON.stringify(x)));
const P = { schoolId: 'GVS', role: 'PARENT', userId: 'GRD-0001', studentId: 'GVS-2027-0001' } as any;
const JEN = { schoolId: 'GVS', role: 'TEACHER', userId: 'STF-T-0001' } as any;
const NAIR = { schoolId: 'GVS', role: 'TEACHER', userId: 'STF-T-0002' } as any;
const PR = { schoolId: 'GVS', role: 'PRINCIPAL', userId: 'ACC-L-0001' } as any;

// FLOW 1: leave
const ap: any = await leaveService.apply(P, { fromDate: addDaysISO(3), toDate: addDaysISO(4), kind: 'SICK', reason: 'Fever and cold' });
check('parent applies leave', ap.ok && ap.data.status === 'PENDING', ap);
const ov: any = await leaveService.apply(P, { fromDate: addDaysISO(4), toDate: addDaysISO(4), kind: 'SICK', reason: 'Fever again' });
check('overlapping leave refused', !ov.ok);
check('other CT cannot see 10-A leave', !((await leaveService.listForClass(NAIR, 'GVS-10-A')) as any).ok);
check('reject needs reason', !((await leaveService.decide(JEN, ap.data.id, 'REJECTED', '')) as any).ok);
const dec: any = await leaveService.decide(JEN, ap.data.id, 'APPROVED', 'Get well soon', 'Sarah Jenkins');
check('CT approves', dec.ok && dec.data.status === 'APPROVED');
const mine: any = await leaveService.listForChild(P);
check('parent sees approved', mine.data.find((l: any) => l.id === ap.data.id).status === 'APPROVED');

// Attendance
// Last school day before today (registers cannot be saved for Sundays), so this check passes on any day.
let back = -1;
while (new Date(addDaysISO(back) + 'T00:00:00').getDay() === 0) back--;
const day = addDaysISO(back);
const reg: any = await attendanceService.getRegister(JEN, 'GVS-10-A', day, 'MORNING');
check('CT gets register with 6 rows', reg.ok && reg.data.rows.length === 6, reg);
const regToday: any = await attendanceService.getRegister(JEN, 'GVS-10-A', todayISO(), 'MORNING');
const arif = regToday.data.rows.find((r: any) => r.studentId === 'GVS-2027-0006');
check('approved leave is context only (mark not auto-set)', Boolean(arif.leave) && arif.mark === null, arif);
check('non-CT cannot take register', !((await attendanceService.getRegister(NAIR, 'GVS-10-A', day, 'MORNING')) as any).ok);
const marks: any = {};
reg.data.rows.forEach((r: any) => (marks[r.studentId] = 'P'));
check('incomplete register refused', !((await attendanceService.saveRegister(JEN, { classSectionId: 'GVS-10-A', date: day, session: 'MORNING', marks: { 'GVS-2027-0001': 'P' } })) as any).ok);
marks['GVS-2027-0001'] = 'A';
const sv: any = await attendanceService.saveRegister(JEN, { classSectionId: 'GVS-10-A', date: day, session: 'MORNING', marks });
check('register saved', sv.ok && Boolean(sv.data.saved), sv);
check('future date refused', !((await attendanceService.saveRegister(JEN, { classSectionId: 'GVS-10-A', date: addDaysISO(2), session: 'MORNING', marks })) as any).ok);
marks['GVS-2027-0001'] = 'LATE';
const corrNo: any = await attendanceService.saveRegister(JEN, { classSectionId: 'GVS-10-A', date: day, session: 'MORNING', marks });
check('correction without reason refused', !corrNo.ok && corrNo.code === 'REASON_REQUIRED', corrNo);
const corr: any = await attendanceService.saveRegister(JEN, { classSectionId: 'GVS-10-A', date: day, session: 'MORNING', marks, correctionReason: 'Arrived late, not absent' });
check('correction kept in history', corr.ok && corr.data.saved.history.length === 1 && corr.data.saved.history[0].changes[0].from === 'A', corr);
const att: any = await academicsService.getAttendance(P, 30);
check('parent attendance reflects register (LATE counts present)', att.data.days.find((d: any) => d.date === day).morning === 'P');

// FLOW 2: marks -> report cards -> principal -> publish
const my: any = await marksService.listMySheets(JEN);
check('Jenkins sees only Physical Science sheets', my.ok && my.data.length > 0 && my.data.every((s: any) => s.sheet.subject === 'Physical Science'), my.data?.map((s: any) => s.sheet.subject));
const PS = 'AS-GVS-FA2:GVS-10-A:Physical Science';
const MA = 'AS-GVS-FA2:GVS-10-A:Mathematics';
check('teacher cannot edit unassigned subject', !((await marksService.saveSheet(JEN, MA, {}, false)) as any).ok);
const v: any = await marksService.getSheet(JEN, PS);
const rows: any = {};
v.data.students.forEach((s: any, i: number) => (rows[s.id] = { internal: i === 0 ? 'AB' : 12 + i, external: null }));
check('value above max refused', !((await marksService.saveSheet(JEN, PS, { ...rows, [v.data.students[1].id]: { internal: 25, external: null } }, false)) as any).ok);
check('submit incomplete refused', !((await marksService.saveSheet(JEN, PS, { [v.data.students[0].id]: { internal: 'AB', external: null } }, true)) as any).ok);
const sub: any = await marksService.saveSheet(JEN, PS, rows, true);
check('Phys Sci submitted, AB kept', sub.ok && sub.data.sheet.status === 'SUBMITTED' && sub.data.sheet.rows[v.data.students[0].id].internal === 'AB', sub);
check('cannot generate before all accepted', !((await marksService.generateReportCards(JEN, 'AS-GVS-FA2', 'GVS-10-A')) as any).ok);
const mv: any = await marksService.getSheet(NAIR, MA);
const mrows: any = {};
mv.data.students.forEach((s: any, i: number) => (mrows[s.id] = { internal: 10 + i, external: null }));
check('Nair submits Maths', ((await marksService.saveSheet(NAIR, MA, mrows, true)) as any).ok);
const ret: any = await marksService.reviewSheet(JEN, MA, 'RETURN', 'Roll 05 looks wrong');
check('CT returns Maths with reason', ret.ok && ret.data.sheet.status === 'RETURNED', ret);
check('subject teacher cannot accept own sheet', !((await marksService.reviewSheet(NAIR, MA, 'ACCEPT')) as any).ok);
check('Nair resubmits', ((await marksService.saveSheet(NAIR, MA, mrows, true)) as any).ok);
let cls: any = await marksService.listClassSheets(JEN, 'AS-GVS-FA2', 'GVS-10-A');
for (const s of cls.data) if (s.sheet.status === 'SUBMITTED') await marksService.reviewSheet(JEN, s.sheet.id, 'ACCEPT');
cls = await marksService.listClassSheets(JEN, 'AS-GVS-FA2', 'GVS-10-A');
check('all 7 subjects accepted', cls.data.length === 7 && cls.data.every((s: any) => s.sheet.status === 'ACCEPTED'), cls.data.map((s: any) => s.sheet.status));
const beforeFA2 = ((await academicsService.getPublishedResults(P)) as any).data.filter((r: any) => r.examName === 'FA-2').length;
const gen: any = await marksService.generateReportCards(JEN, 'AS-GVS-FA2', 'GVS-10-A');
check('6 report cards generated', gen.ok && gen.data.length === 6, gen);
check('pass marks: 2nd language 20% = 4/20, others 35% = 7/20', gen.data[0].subjects.find((x: any) => x.subject === 'Hindi').passMark === 4 && gen.data[0].subjects.find((x: any) => x.subject === 'Telugu').passMark === 7);
check('submit needs remarks', !((await marksService.submitToPrincipal(JEN, 'AS-GVS-FA2', 'GVS-10-A')) as any).ok);
for (const c of gen.data) await marksService.updateRemark(JEN, c.id, 'Steady progress.');
check('submitted to principal', ((await marksService.submitToPrincipal(JEN, 'AS-GVS-FA2', 'GVS-10-A')) as any).ok);
check('teacher cannot approve a card', !((await marksService.principalDecide(JEN, gen.data[0].id, 'APPROVE')) as any).ok);
const q: any = await marksService.listForPrincipal(PR);
check('principal sees 6 submitted', q.ok && q.data[0].cards.length === 6, q);
for (const c of gen.data.slice(1)) await marksService.principalDecide(PR, c.id, 'APPROVE');
check('principal returns 1 (approves 5)', ((await marksService.principalDecide(PR, gen.data[0].id, 'RETURN', 'Check the remark for roll 01')) as any).ok);
const pubEarly: any = await marksService.publish(JEN, 'AS-GVS-FA2', 'GVS-10-A');
check('publish blocked until all approved', !pubEarly.ok && /1 pending/.test(pubEarly.error), pubEarly);
check('parent sees no FA-2 before publish', ((await academicsService.getPublishedResults(P)) as any).data.filter((r: any) => r.examName === 'FA-2').length === beforeFA2);
check('principal cannot publish', !((await marksService.publish(PR, 'AS-GVS-FA2', 'GVS-10-A')) as any).ok);
await marksService.updateRemark(JEN, gen.data[0].id, 'Good effort. Revise Biology.');
await marksService.submitToPrincipal(JEN, 'AS-GVS-FA2', 'GVS-10-A');
await marksService.principalDecide(PR, gen.data[0].id, 'APPROVE');
const pub: any = await marksService.publish(JEN, 'AS-GVS-FA2', 'GVS-10-A');
check('CT publishes 6', pub.ok && pub.data.published === 6, pub);
const fa2 = ((await academicsService.getPublishedResults(P)) as any).data.find((r: any) => r.examName === 'FA-2' && r.status === 'CURRENT');
check('parent now sees FA-2 v1 CURRENT', fa2 && fa2.status === 'CURRENT' && fa2.version === beforeFA2 + 1, fa2);
check('accepted sheet locked after publish', !((await marksService.saveSheet(JEN, PS, rows, false)) as any).ok);

// Demo timetable: no teacher is in two classes in the same period (every day, every period, both schools).
const { getDb } = await import(u('mock/db/index.ts'));
for (const school of ['GVS', 'SJM']) {
  const db = getDb(school);
  const seen = new Map<string, string>();
  const clashes: string[] = [];
  for (const [classId, slots] of Object.entries(db.timetables) as [string, any[]][]) {
    for (const s of slots) {
      const key = `${s.day}-${s.period}-${s.teacherName}`;
      if (seen.has(key)) clashes.push(`${key}: ${seen.get(key)} & ${classId}`);
      else seen.set(key, classId);
    }
  }
  check(`${school} timetable has no teacher double-booked`, clashes.length === 0, clashes.slice(0, 3));
}
