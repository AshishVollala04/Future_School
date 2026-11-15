// Service-level rule checks (mock implementations). Run all with: npm run test:services
const SRC = new URL('../../src/', import.meta.url).href;
const mem: Record<string,string> = {};
(globalThis as any).window = { localStorage: { getItem:(k:string)=>k in mem?mem[k]:null, setItem:(k:string,v:string)=>{mem[k]=v}, removeItem:(k:string)=>{delete mem[k]}, key:(i:number)=>Object.keys(mem)[i]??null, get length(){return Object.keys(mem).length} } };
const u = (p: string) => SRC + p;
const { authService } = await import(u('services/authService.ts'));
const { feeService } = await import(u('services/feeService.ts'));
const { hallTicketService } = await import(u('services/hallTicketService.ts'));
const { academicsService } = await import(u('services/academicsService.ts'));
const { communicationService } = await import(u('services/communicationService.ts'));
const { auditService } = await import(u('services/auditService.ts'));
const check=(n:string,c:boolean,x?:any)=>console.log((c?'PASS ':'FAIL ')+n+(c?'':'  -> '+JSON.stringify(x)));
const code=(c:any)=>c.mockHint.match(/\d{6}/)[0];

// parent session for Aarav
let r:any=await authService.requestMobileOtp('9876543210','PARENT_LOGIN'); let v:any=await authService.verifyParentOtp(r.data.challengeId,code(r.data));
let s:any=await authService.startParentSession(v.data.ticket,'GVS-2027-0001');
const P={schoolId:'GVS',role:'PARENT',userId:s.data.userId,studentId:'GVS-2027-0001'};
const stepUp=async(sess:any,purpose:string)=>{const c:any=await authService.requestStepUp(sess.sessionId,purpose); return (await authService.verifyStepUp(sess.sessionId,c.data.challengeId,code(c.data)) as any).data.stepUpToken;};

let sum:any=await feeService.getSummary(P); check('Aarav outstanding ins2 = 6000', sum.data.instalments[1].outstanding===6000, sum.data.instalments[1]);
let ht:any=await hallTicketService.getForStudent(P); check('Aarav SA-1 PENDING with reason', ht.data[0].feeClearance==='PENDING' && /Term 2: School fee ₹6,000/.test(ht.data[0].pendingReasons[0]), ht.data[0]);
let other:any=await feeService.getSummary({...P,studentId:'GVS-2027-0001'} as any);
let leak:any=await hallTicketService.getForStudent(P,'GVS-2031-0042'); check('parent cannot read sibling via param', !leak.ok && leak.code==='FORBIDDEN');
let small:any=await feeService.createOrder(P,{amount:500}); check('partial below minimum refused', !small.ok);
let over:any=await feeService.createOrder(P,{amount:999999}); check('overpay refused', !over.ok);
let ord:any=await feeService.createOrder(P,{instalments:[2]}); check('order for ins 2 = 6000', ord.ok && ord.data.amount===6000, ord);
let noStep:any=await feeService.confirmMockPayment(P,ord.data.orderId,'UPI','fake'); check('payment without step-up refused', !noStep.ok && noStep.code==='STEP_UP_REQUIRED');
let tok=await stepUp(s.data,'PAYMENT'); let paid:any=await feeService.confirmMockPayment(P,ord.data.orderId,'UPI',tok);
check('payment recorded w/ receipt', paid.ok && paid.data.receiptNo && paid.data.isMock && paid.data.paidByGuardianId==='GRD-0001', paid);
let replay:any=await feeService.confirmMockPayment(P,ord.data.orderId,'UPI',tok); check('order single-use', !replay.ok);
ht=await hallTicketService.getForStudent(P); check('after pay: CLEARED but NOT available (no CT release)', ht.data[0].feeClearance==='CLEARED' && !ht.data[0].available, ht.data[0]);
check('payment audited', auditService.list('GVS').some((a:any)=>a.action==='FEE_PAYMENT_RECORDED'));

// teacher sessions
let tr:any=await authService.requestMobileOtp('9848022222','TEACHER_LOGIN'); let tv:any=await authService.verifyTeacherOtp(tr.data.challengeId,code(tr.data));
await authService.startTeacherSession(tv.data.ticket,'MEM-T-0003','2580');
const NAIR={schoolId:'GVS',role:'TEACHER',userId:'STF-T-0002'};
let notCT:any=await hallTicketService.release(NAIR as any,'EX-GVS-SA1','GVS-2027-0001'); check('non-class-teacher cannot release', !notCT.ok && notCT.code==='FORBIDDEN', notCT);
const JENK={schoolId:'GVS',role:'TEACHER',userId:'STF-T-0001'};
let list:any=await hallTicketService.listForClass(JENK as any,'GVS-10-A'); check('CT lists 10-A (6 students)', list.ok && list.data.length===6, list);
let blocked:any=await hallTicketService.release(JENK as any,'EX-GVS-SA1','GVS-2027-0004'); check('release blocked when fee pending', !blocked.ok && blocked.code==='FEE_PENDING', blocked);
let rel:any=await hallTicketService.release(JENK as any,'EX-GVS-SA1','GVS-2027-0001'); check('CT releases cleared Aarav', rel.ok && rel.data.available, rel);
ht=await hallTicketService.getForStudent(P); check('parent now sees hall ticket no', ht.data[0].available && ht.data[0].hallTicketNo, ht.data[0]);
let otherClass:any=await hallTicketService.listForClass(JENK as any,'GVS-6-B'); check('CT cannot list another class', !otherClass.ok);

// principal override
const PR={schoolId:'GVS',role:'PRINCIPAL',userId:'ACC-L-0001'};
let po1:any=await hallTicketService.principalOverride(PR as any,'EX-GVS-SA1','GVS-2027-0004','Emergency case reason','x'); check('override refused for fee-pending', !po1.ok && po1.code==='FEE_PENDING', po1);
let po2:any=await hallTicketService.principalOverride(PR as any,'EX-GVS-SA1','GVS-2027-0005','short','x'); check('override needs 10+ char reason', !po2.ok && po2.code==='REASON_REQUIRED', po2);
let poT:any=await hallTicketService.principalOverride(JENK as any,'EX-GVS-SA1','GVS-2027-0005','Long enough reason here','x'); check('teacher cannot override', !poT.ok && poT.code==='FORBIDDEN');

// academics & comms
let res:any=await academicsService.getPublishedResults(P); const fa1Res=res.data.filter((x:any)=>x.examName==='FA-1'); check('results v2 CURRENT first, v1 SUPERSEDED kept', fa1Res[0].status==='CURRENT' && fa1Res[0].version===2 && fa1Res[1].status==='SUPERSEDED');
check('absence stored as AB', fa1Res[0].subjects.some((x:any)=>x.internal==='AB'));
let hw:any=await academicsService.getHomework(P); check('overdue homework first', hw.data[0].overdue===true);
let rc:any=await communicationService.getRecipients(P); check('recipients = CT + subject teachers only', rc.data[0].role.startsWith('Class Teacher') && rc.data.length===7, rc.data);
let bad:any=await communicationService.startThread(P,{staffId:'STF-T-0008',category:'GENERAL',subject:'x',body:'y'}); check('cannot message unrelated teacher', !bad.ok);
let cs:any=await communicationService.getConsents(P); let c1:any=await communicationService.respondConsent(P,cs.data[0].id,'DECLINED');
let c2:any=await communicationService.respondConsent(P,cs.data[0].id,'GIVEN'); check('consent attributable + final', c1.ok && c1.data.response.guardianId==='GRD-0001' && !c2.ok);
let sj:any=await feeService.getSummary({schoolId:'SJM',role:'PARENT',userId:'GRD-0001',studentId:'GVS-2027-0001'} as any); check('GVS student not found in SJM scope', !sj.ok);
