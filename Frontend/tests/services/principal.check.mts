// Service-level rule checks (mock implementations). Run all with: npm run test:services
const SRC = new URL('../../src/', import.meta.url).href;
const mem: Record<string, string> = {};
(globalThis as any).window = { localStorage: { getItem: (k: string) => (k in mem ? mem[k] : null), setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; }, key: (i: number) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } } };
const u = (p: string) => SRC + p;
const { authService } = await import(u('services/authService.ts'));
const { governanceService } = await import(u('services/governanceService.ts'));
const { correctionService } = await import(u('services/correctionService.ts'));
const { staffService } = await import(u('services/staffService.ts'));
const { feeService } = await import(u('services/feeService.ts'));
const { academicsService } = await import(u('services/academicsService.ts'));
const { auditService } = await import(u('services/auditService.ts'));
const { addDaysISO } = await import(u('utils/date.ts'));
const check = (n: string, c: boolean, x?: any) => console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  -> ' + JSON.stringify(x)));
const code = (c: any) => c.mockHint.match(/\d{6}/)[0];

// Real principal session so step-up works
let r: any = await authService.beginPasswordSignIn('principal@greenwoodvalley.edu.in', 'Greenwood@2026');
let v: any = await authService.completeStaffSecondFactor(r.data.ticket, r.data.secondFactor.challengeId, code(r.data.secondFactor));
let s: any = await authService.startStaffSession(v.data.ticket, v.data.memberships[0].membershipId);
const PR = { schoolId: 'GVS', role: 'PRINCIPAL', userId: s.data.userId } as any;
const stepUp = async () => { const c: any = await authService.requestStepUp(s.data.sessionId, 'SENSITIVE_STAFF_ACTION'); return ((await authService.verifyStepUp(s.data.sessionId, c.data.challengeId, code(c.data))) as any).data.stepUpToken; };
const ADM = { schoolId: 'GVS', role: 'ADMIN', userId: 'ACC-L-0002' } as any;
const OPS = { schoolId: 'GVS', role: 'ADMIN', userId: 'ACC-L-0003' } as any;
const KAVYA = { schoolId: 'GVS', role: 'PARENT', userId: 'GRD-0003', studentId: 'GVS-2028-0117' } as any;
const AARAV = { schoolId: 'GVS', role: 'PARENT', userId: 'GRD-0001', studentId: 'GVS-2027-0001' } as any;

// Governance
const list: any = await governanceService.listForPrincipal(PR);
check('principal sees 3 (draft hidden)', list.ok && list.data.length === 3 && !list.data.some((x: any) => x.status === 'DRAFT'), list.data?.map((x: any) => x.status));
check('admin cannot approve', !((await governanceService.principalDecide(ADM, 'CR-GVS-1', 'APPROVE', '')) as any).ok);
check('approve needs step-up', ((await governanceService.principalDecide(PR, 'CR-GVS-1', 'APPROVE', '')) as any).code === 'STEP_UP_REQUIRED');
check('principal cannot execute', !((await governanceService.execute(PR, 'CR-GVS-3')) as any).ok);
const before: any = await feeService.getSummary(KAVYA);
check('approve concession', ((await governanceService.principalDecide(PR, 'CR-GVS-1', 'APPROVE', '', await stepUp())) as any).ok);
// Admin edits after approval -> execution blocked
const cr1 = (await governanceService.listForAdmin(ADM) as any).data.find((x: any) => x.id === 'CR-GVS-1');
await governanceService.updateDraft(ADM, 'CR-GVS-1', { ...cr1.payload, amountPerCharge: 3000 });
const blocked: any = await governanceService.execute(ADM, 'CR-GVS-1');
check('edited after approval -> execution blocked', !blocked.ok && blocked.code === 'CHANGED_AFTER_APPROVAL', blocked);
check('fee unchanged while blocked', ((await feeService.getSummary(KAVYA)) as any).data.totalConcession === before.data.totalConcession);
check('resubmit for approval', ((await governanceService.submit(ADM, 'CR-GVS-1')) as any).ok);
check('re-approve', ((await governanceService.principalDecide(PR, 'CR-GVS-1', 'APPROVE', '', await stepUp())) as any).ok);
const ex: any = await governanceService.execute(ADM, 'CR-GVS-1');
check('execute concession', ex.ok && ex.data.status === 'EXECUTED', ex);
check('concession applied (+6000)', ((await feeService.getSummary(KAVYA)) as any).data.totalConcession === before.data.totalConcession + 6000);
// Refund: return then reject path + original payment untouched
check('return needs note', !((await governanceService.principalDecide(PR, 'CR-GVS-2', 'RETURN', '')) as any).ok);
check('approve refund', ((await governanceService.principalDecide(PR, 'CR-GVS-2', 'APPROVE', '', await stepUp())) as any).ok);
const rf: any = await governanceService.execute(ADM, 'CR-GVS-2');
check('refund executed as separate record', rf.ok);
const pays: any = await feeService.listPayments({ schoolId: 'GVS', role: 'PARENT', userId: 'x', studentId: 'GVS-2027-0002' });
check('original payment kept + refund listed', pays.data.payments.length >= 1 && pays.data.refunds.length === 1 && pays.data.refunds[0].amount === 1500, pays.data);
// Exam schedule (already approved in seed)
check('execute exam schedule', ((await governanceService.execute(OPS, 'CR-GVS-3')) as any).ok);
// Fee structure draft: validation catches paid instalments? (instalment 4 unpaid) -> submit ok
check('admin submits fee structure draft', ((await governanceService.submit(ADM, 'CR-GVS-4')) as any).ok);
const bad: any = await governanceService.createDraft(ADM, 'Bad refund', { kind: 'REFUND', paymentId: pays.data.payments[0].id, amount: 999999, reason: 'Testing validation' });
check('invalid draft cannot be submitted', bad.ok && !((await governanceService.submit(ADM, bad.data.id)) as any).ok);
check('governance audited', auditService.list('GVS').filter((a: any) => a.action.startsWith('GOVERNANCE_')).length >= 4);

// Corrections
const SURESH = { schoolId: 'GVS', role: 'TEACHER', userId: 'STF-T-0007' } as any;
const JEN = { schoolId: 'GVS', role: 'TEACHER', userId: 'STF-T-0001' } as any;
const pc: any = await correctionService.listForPrincipal(PR);
check('principal sees verified correction', pc.ok && pc.data.some((c: any) => c.id === 'MC-GVS-1' && c.status === 'VERIFIED'));
check('teacher cannot approve correction', !((await correctionService.principalDecide(JEN, 'MC-GVS-1', 'APPROVE', '')) as any).ok);
check('principal approve needs OTP', ((await correctionService.principalDecide(PR, 'MC-GVS-1', 'APPROVE', '')) as any).code === 'STEP_UP_REQUIRED');
check('principal approves', ((await correctionService.principalDecide(PR, 'MC-GVS-1', 'APPROVE', '', await stepUp())) as any).ok);
check('principal cannot republish', !((await correctionService.republish(PR, 'MC-GVS-1')) as any).ok);
const rp: any = await correctionService.republish(JEN, 'MC-GVS-1');
check('CT republishes as v3', rp.ok && rp.data.version === 3 && rp.data.subjects.find((x: any) => x.subject === 'Social Studies').internal === 17, rp);
const res: any = await academicsService.getPublishedResults(AARAV);
const fa1 = res.data.filter((x: any) => x.examName === 'FA-1');
check('FA-1: v3 CURRENT, v2 + v1 SUPERSEDED kept', fa1.length === 3 && fa1.filter((x: any) => x.status === 'CURRENT').length === 1 && fa1.find((x: any) => x.version === 2).status === 'SUPERSEDED', fa1.map((x: any) => [x.version, x.status]));
// New correction flow from a subject teacher
const rows: any = await correctionService.listCorrectable(SURESH);
const row = rows.data.find((x: any) => x.studentId === 'GVS-2027-0001' && x.examName === 'FA-1');
check('subject teacher sees own subject only', rows.ok && rows.data.every((x: any) => x.subject === 'Social Studies'), rows.data?.map((x: any) => x.subject));
check('cannot correct other subject', !((await correctionService.raise(SURESH, { resultId: row.resultId, subject: 'Telugu', field: 'internal', to: 10, reason: 'Wrong entry made here' })) as any).ok);
check('reason required', !((await correctionService.raise(SURESH, { resultId: row.resultId, subject: 'Social Studies', field: 'internal', to: 18, reason: 'x' })) as any).ok);
const nc: any = await correctionService.raise(SURESH, { resultId: row.resultId, subject: 'Social Studies', field: 'internal', to: 18, reason: 'Re-checked; one answer was missed.' });
check('raise correction', nc.ok && nc.data.status === 'RAISED', nc);
check('duplicate open correction refused', !((await correctionService.raise(SURESH, { resultId: row.resultId, subject: 'Social Studies', field: 'internal', to: 19, reason: 'Another attempt here' })) as any).ok);
check('CT verifies', ((await correctionService.verify(JEN, nc.data.id, 'VERIFY', '')) as any).ok);

// Teacher leave
const NAIR = { schoolId: 'GVS', role: 'TEACHER', userId: 'STF-T-0002' } as any;
const tl: any = await staffService.applyLeave(NAIR, { fromDate: addDaysISO(15), toDate: addDaysISO(15), kind: 'CASUAL', reason: 'Family function' }, 'Raghavan Nair');
check('teacher applies leave', tl.ok);
check('teacher cannot decide', !((await staffService.decideTeacherLeave(NAIR, tl.data.id, 'APPROVED', '')) as any).ok);
check('principal approves teacher leave', ((await staffService.decideTeacherLeave(PR, tl.data.id, 'APPROVED', '')) as any).ok);

// Overview
const ov: any = await staffService.getOverview(PR);
check('overview has finance + academics + counts', ov.ok && ov.data.finance.collected > 0 && ov.data.academics.length > 0 && typeof ov.data.counts.corrections === 'number', ov);
check('parent cannot see overview', !((await staffService.getOverview(AARAV)) as any).ok);
