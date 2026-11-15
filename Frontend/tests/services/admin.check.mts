// Service-level rule checks (mock implementations). Run all with: npm run test:services
const SRC = new URL('../../src/', import.meta.url).href;
const mem: Record<string, string> = {};
(globalThis as any).window = { location: { origin: 'http://x' }, localStorage: { getItem: (k: string) => (k in mem ? mem[k] : null), setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; }, key: (i: number) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } } };
const u = (p: string) => SRC + p;
const { authService } = await import(u('services/authService.ts'));
const { governanceService } = await import(u('services/governanceService.ts'));
const { feeDeskService } = await import(u('services/feeDeskService.ts'));
const { feeService } = await import(u('services/feeService.ts'));
const { hallTicketService } = await import(u('services/hallTicketService.ts'));
const { substitutionService } = await import(u('services/substitutionService.ts'));
const { complaintService } = await import(u('services/complaintService.ts'));
const { transportService } = await import(u('services/transportService.ts'));
const { adminService } = await import(u('services/adminService.ts'));
const { staffService } = await import(u('services/staffService.ts'));
const { auditService } = await import(u('services/auditService.ts'));
const { addDaysISO } = await import(u('utils/date.ts'));
let fails = 0;
const check = (n: string, c: boolean, x?: any) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  -> ' + JSON.stringify(x))); };
const code = (c: any) => c.mockHint.match(/\d{6}/)[0];

const signIn = async (email: string, pw: string) => {
  const r: any = await authService.beginPasswordSignIn(email, pw);
  const v: any = await authService.completeStaffSecondFactor(r.data.ticket, r.data.secondFactor.challengeId, code(r.data.secondFactor));
  return (await authService.startStaffSession(v.data.ticket, v.data.memberships[0].membershipId)) as any;
};
const stepUpFor = (s: any) => async () => {
  const c: any = await authService.requestStepUp(s.data.sessionId, 'SENSITIVE_STAFF_ACTION');
  return ((await authService.verifyStepUp(s.data.sessionId, c.data.challengeId, code(c.data))) as any).data.stepUpToken;
};

const FIN = { schoolId: 'GVS', role: 'ADMIN', userId: 'ACC-L-0002' } as any; // Finance, Admissions, Security, Reports
const OPS = { schoolId: 'GVS', role: 'ADMIN', userId: 'ACC-L-0003' } as any; // Academic ops, Transport, Complaints, Reports
const SJM_ADMIN = { schoolId: 'SJM', role: 'ADMIN', userId: 'ACC-L-0002' } as any;
const TEACHER = { schoolId: 'GVS', role: 'TEACHER', userId: 'STF-T-0001' } as any;
const KAVYA = { schoolId: 'GVS', role: 'PARENT', userId: 'GRD-0003', studentId: 'GVS-2028-0117' } as any;
const AARAV = { schoolId: 'GVS', role: 'PARENT', userId: 'GRD-0001', studentId: 'GVS-2027-0001' } as any;

// --- Permissions
const acc: any = await adminService.getAccess(FIN);
check('finance admin permissions', acc.ok && acc.data.permissions.includes('FINANCE') && !acc.data.permissions.includes('TRANSPORT'), acc);
check('ops admin has no finance', !((await feeDeskService.search(OPS, '')) as any).ok);
check('teacher cannot use fee desk', !((await feeDeskService.search(TEACHER, '')) as any).ok);
check('admin of GVS has no SJM permissions', ((await adminService.getAccess(SJM_ADMIN)) as any).data.permissions.length === 0);
check('finance admin cannot execute exam change', ((await governanceService.execute(FIN, 'CR-GVS-3')) as any).code === 'FORBIDDEN');
check('ops admin cannot draft concession', !((await governanceService.createDraft(OPS, 'x', { kind: 'FEE_CONCESSION', studentId: 'GVS-2028-0117', chargeIds: [], amountPerCharge: 1, concessionKind: 'OTHER', justification: 'x' })) as any).ok);
const wq: any = await adminService.getWorkQueue(OPS);
check('ops work queue counts own kinds only', wq.ok && wq.data.governance.toExecute === 1 && wq.data.transportPending === 1 && wq.data.complaintsOpen === 1, wq.data);
check('ops admin executes approved exam change', ((await governanceService.execute(OPS, 'CR-GVS-3')) as any).ok);

// --- Fee desk cash payment
const kBefore: any = await feeService.getSummary(KAVYA);
check('cash > outstanding rejected', ((await feeDeskService.recordCashPayment(FIN, 'GVS-2028-0117', 10_000_000, '')) as any).code === 'BAD_AMOUNT');
check('cash 0 rejected', !((await feeDeskService.recordCashPayment(FIN, 'GVS-2028-0117', 0, '')) as any).ok);
const cash: any = await feeDeskService.recordCashPayment(FIN, 'GVS-2028-0117', 5000, 'slip 44');
check('cash recorded with receipt', cash.ok && cash.data.method === 'CASH_AT_OFFICE' && cash.data.recordedByStaffId === 'ACC-L-0002' && /GVS\/2026-27\//.test(cash.data.receiptNo), cash);
const kAfter: any = await feeService.getSummary(KAVYA);
check('parent sees cash payment', kAfter.data.totalPaid === kBefore.data.totalPaid + 5000);
check('cash allocated oldest first', cash.data.allocations[0].chargeId === 'GVS-2028-0117-SF-1', cash.data.allocations);
check('cash audited', auditService.list('GVS').some((e: any) => e.action === 'FEE_CASH_RECORDED'));

// --- Clearance rule (governance) + hall ticket still needs release
const exams: any = await adminService.listExams(OPS);
const sa1 = exams.data.find((e: any) => e.name === 'SA-1');
const cr: any = await governanceService.createDraft(OPS, 'SA-1: school fee up to instalment 1', { kind: 'CLEARANCE_RULE', examId: sa1.id, categories: ['SCHOOL_FEE', 'ACTIVITY_FEE'], uptoInstalment: 2, reason: 'Board circular on fee clearance' }, 'Priya');
check('clearance draft created', cr.ok && cr.data.status === 'DRAFT', cr);
check('describe shows impact', governanceService.describe(OPS, cr.data).some((l: string) => l.startsWith('Fee-cleared students')));
check('submit clearance', ((await governanceService.submit(OPS, cr.data.id)) as any).ok);
const pr = await signIn('principal@greenwoodvalley.edu.in', 'Greenwood@2026');
const PR = { schoolId: 'GVS', role: 'PRINCIPAL', userId: pr.data.userId } as any;
const prStep = stepUpFor(pr);
check('principal approves clearance', ((await governanceService.principalDecide(PR, cr.data.id, 'APPROVE', '', await prStep())) as any).ok);
// edit after approval -> blocked
const latest: any = (await governanceService.listForAdmin(OPS) as any).data.find((x: any) => x.id === cr.data.id);
await governanceService.updateDraft(OPS, cr.data.id, { ...latest.payload, categories: ['SCHOOL_FEE'], uptoInstalment: 1 });
const blk: any = await governanceService.execute(OPS, cr.data.id);
check('clearance edited after approval -> blocked', blk.code === 'CHANGED_AFTER_APPROVAL', blk);
check('resubmit + reapprove', ((await governanceService.submit(OPS, cr.data.id)) as any).ok && ((await governanceService.principalDecide(PR, cr.data.id, 'APPROVE', '', await prStep())) as any).ok);
check('execute clearance', ((await governanceService.execute(OPS, cr.data.id)) as any).ok);
const kt: any = await hallTicketService.getForStudent(KAVYA);
const kTicket = Array.isArray(kt.data) ? kt.data[0] : kt.data;
check('kavya cleared under new rule but not available without release', kTicket && kTicket.feeClearance === 'CLEARED' && !kTicket.available, kTicket);

// --- Substitution
const needs: any = await substitutionService.listNeeds(OPS);
check('substitution needs from approved leave only', needs.ok && needs.data.length > 0 && needs.data.every((n: any) => n.leaveId === 'TL-GVS-2'), needs.data?.map((n: any) => n.leaveId));
check('finance admin cannot arrange substitutes', !((await substitutionService.listNeeds(FIN)) as any).ok);
const n0 = needs.data[0];
const sub = n0.freeTeachers.find((t: any) => t.staffId === 'STF-T-0001') ?? n0.freeTeachers[0];
check('free teachers exclude absent teacher', !n0.freeTeachers.some((t: any) => t.staffId === 'STF-T-0003'));
const busy = (await substitutionService.assign(OPS, { leaveId: n0.leaveId, date: n0.date, classSectionId: n0.classSectionId, period: n0.period, substituteStaffId: 'STF-T-0003' })) as any;
check('cannot assign the absent teacher', !busy.ok);
const as: any = await substitutionService.assign(OPS, { leaveId: n0.leaveId, date: n0.date, classSectionId: n0.classSectionId, period: n0.period, substituteStaffId: sub.staffId });
check('assign substitute', as.ok, as);
const subScope = { schoolId: 'GVS', role: 'TEACHER', userId: sub.staffId } as any;
check('substitute sees duty', ((await substitutionService.myDuties(subScope)) as any).data.some((d: any) => d.date === n0.date && d.period === n0.period));
const pending: any = await staffService.listTeacherLeave(PR);
check('pending leave not offered for substitution', !needs.data.some((n: any) => n.leaveId === 'TL-GVS-1') && pending.data.some((l: any) => l.id === 'TL-GVS-1'));
const after: any = await substitutionService.listNeeds(OPS);
check('assigned shows, teacher now busy elsewhere in that period', after.data.find((n: any) => n.date === n0.date && n.period === n0.period && n.classSectionId === n0.classSectionId).assigned?.substituteStaffId === sub.staffId);

// --- Complaints
check('parent cannot see school list', !((await complaintService.listForSchool(AARAV)) as any).ok);
check('finance admin lacks complaints', !((await complaintService.listForSchool(FIN)) as any).ok);
const c1: any = await complaintService.raise(KAVYA, { category: 'SAFETY', subject: 'Broken railing', description: 'The stair railing near 9-A is loose and unsafe.' }, 'Srinivas Reddy');
check('safety complaint flags principal', c1.ok && c1.data.principalInformed, c1);
check('aarav parent cannot see kavya complaint', !((await complaintService.listMine(AARAV)) as any).data.some((c: any) => c.id === c1.data.id));
check('cannot confirm before resolved', !((await complaintService.confirmResolved(KAVYA, c1.data.id)) as any).ok);
check('reply needs text', !((await complaintService.respond(OPS, c1.data.id, '', 'IN_PROGRESS')) as any).ok);
check('admin resolves with reply', ((await complaintService.respond(OPS, c1.data.id, 'Railing repaired by the maintenance team today.', 'RESOLVED')) as any).ok);
check('reopen needs reason', !((await complaintService.reopen(KAVYA, c1.data.id, 'no')) as any).ok);
check('parent reopens', ((await complaintService.reopen(KAVYA, c1.data.id, 'Still loose on the second floor.')) as any).data.status === 'REOPENED');
await complaintService.respond(OPS, c1.data.id, 'Second floor railing fixed as well.', 'RESOLVED');
check('parent confirms -> closed', ((await complaintService.confirmResolved(KAVYA, c1.data.id)) as any).data.status === 'CLOSED');
check('closed complaint cannot be changed', !((await complaintService.respond(OPS, c1.data.id, 'Another update here.', 'IN_PROGRESS')) as any).ok);

// --- Transport
const reqs: any = await transportService.listRequests(OPS);
const tr = reqs.data.find((r: any) => r.id === 'TRQ-GVS-1');
check('route 4 full shown', tr.toRouteSeatsLeft === 0, tr);
const full: any = await transportService.decide(OPS, 'TRQ-GVS-1', 'APPROVED', '');
check('approve blocked when route full', full.code === 'FULL', full);
check('reject needs note', !((await transportService.decide(OPS, 'TRQ-GVS-1', 'REJECTED', '')) as any).ok);
check('reject with note', ((await transportService.decide(OPS, 'TRQ-GVS-1', 'REJECTED', 'Route 4 is full. Route 7 has seats.')) as any).ok);
const k2: any = await transportService.request(KAVYA, { kind: 'CHANGE', toRouteId: 'Route 7', stopName: 'DLF Gate', reason: 'Route 4 full', effectiveFrom: addDaysISO(3) });
check('parent requests route 7', k2.ok && k2.data.kind === 'NEW', k2);
check('one pending at a time', !((await transportService.request(KAVYA, { kind: 'CHANGE', toRouteId: 'Route 2', stopName: 'Hitech City', reason: 'again', effectiveFrom: addDaysISO(3) })) as any).ok);
check('bad stop rejected', !((await transportService.request(AARAV, { kind: 'CHANGE', toRouteId: 'Route 7', stopName: 'Nowhere', reason: 'moving', effectiveFrom: addDaysISO(3) })) as any).ok);
check('approve route 7', ((await transportService.decide(OPS, k2.data.id, 'APPROVED', '')) as any).ok);
const mine: any = await transportService.getMine(KAVYA);
check('parent sees new route and stop', mine.data.current?.route.id === 'Route 7' && mine.data.current?.stop?.name === 'DLF Gate', mine.data.current);
check('teacher cannot decide transport', !((await transportService.decide(TEACHER, k2.data.id, 'APPROVED', '')) as any).ok);

// --- Staff access & quorum
check('ops admin lacks security', !((await authService.listSchoolAccounts(OPS)) as any).ok);
const fin = await signIn('admin@greenwoodvalley.edu.in', 'Greenwood@2026');
const finStep = stepUpFor(fin);
const FINS = { schoolId: 'GVS', role: 'ADMIN', userId: fin.data.userId } as any;
const accts: any = await authService.listSchoolAccounts(FINS);
check('lists principal + 2 admins', accts.ok && accts.data.length === 3, accts.data?.map((a: any) => a.email));
check('cannot suspend self', ((await authService.setAdminStatus(FINS, fin.data.userId, 'DISABLED', 'testing self suspension', await finStep())) as any).code === 'SELF');
check('quorum blocks suspending 2nd admin', ((await authService.setAdminStatus(FINS, 'ACC-L-0003', 'DISABLED', 'Leaving the school next week', await finStep())) as any).code === 'QUORUM');
check('duplicate email invite refused', ((await authService.inviteAdmin(FINS, { name: 'Dup', email: 'office@greenwoodvalley.edu.in', title: 'x', permissions: ['REPORTS'] })) as any).code === 'EXISTS');
const inv: any = await authService.inviteAdmin(FINS, { name: 'Kiran Rao', email: 'kiran.rao@greenwoodvalley.edu.in', title: 'Administrator · Transport', permissions: ['TRANSPORT', 'REPORTS'] });
check('invite created', inv.ok && inv.data.token.startsWith('inv-gvs-'), inv);
check('invite visible to login', ((await authService.getInvitation(inv.data.token)) as any).ok);
// accept invite (password + email OTP)
const a1: any = await authService.beginPasswordSignIn('kiran.rao@greenwoodvalley.edu.in', 'NewAdmin2026x', inv.data.token);
const a2: any = await authService.completeStaffSecondFactor(a1.data.ticket, a1.data.secondFactor.challengeId, code(a1.data.secondFactor));
check('invited admin accepts', a2.ok, a2);
check('quorum now 3', authService.getAdminQuorum('GVS').activeAdmins === 3);
check('new admin gets only granted permissions', JSON.stringify(authService.getAdminPermissions('GVS', a1.data ? (accts.data[0] && (await authService.listSchoolAccounts(FINS) as any).data.find((a: any) => a.email === 'kiran.rao@greenwoodvalley.edu.in').accountId) : '')) === JSON.stringify(['TRANSPORT', 'REPORTS']));
check('suspend needs OTP', ((await authService.setAdminStatus(FINS, 'ACC-L-0003', 'DISABLED', 'Leaving the school next week', 'bad')) as any).code === 'STEP_UP_REQUIRED');
check('suspend allowed with 3 admins', ((await authService.setAdminStatus(FINS, 'ACC-L-0003', 'DISABLED', 'Leaving the school next week', await finStep())) as any).ok);
check('suspended admin loses permissions', authService.getAdminPermissions('GVS', 'ACC-L-0003').length === 0);
check('suspended admin cannot sign in', !((await authService.beginPasswordSignIn('office@greenwoodvalley.edu.in', 'Greenwood@2026')) as any).ok);
check('reactivate', ((await authService.setAdminStatus(FINS, 'ACC-L-0003', 'ACTIVE', 'Returned from leave today', await finStep())) as any).ok);
check('security actions audited', ['ADMIN_INVITED', 'ADMIN_SUSPENDED', 'ADMIN_REACTIVATED'].every(a => auditService.list('GVS').some((e: any) => e.action === a)));

// --- Audit access
check('reports admin reads audit', ((await adminService.listAudit(OPS)) as any).ok);
check('parent cannot read audit', !((await adminService.listAudit(AARAV)) as any).ok);
check('admin still cannot approve governance', !((await governanceService.principalDecide(FIN, 'CR-GVS-2', 'APPROVE', '')) as any).ok);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
