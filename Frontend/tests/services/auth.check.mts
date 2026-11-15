// Service-level rule checks (mock implementations). Run all with: npm run test:services
const SRC = new URL('../../src/', import.meta.url).href;
const mem: Record<string,string> = {};
(globalThis as any).window = { localStorage: {
  getItem: (k:string)=> k in mem ? mem[k] : null, setItem:(k:string,v:string)=>{mem[k]=v}, removeItem:(k:string)=>{delete mem[k]},
  key:(i:number)=>Object.keys(mem)[i] ?? null, get length(){return Object.keys(mem).length} } };
const { MockAuthService } = await import(SRC + 'services/mockAuthService.ts');
const a = new MockAuthService();
const code = (c:any)=> c.mockHint.match(/\d{6}/)[0];
const check = (name:string, cond:boolean) => console.log((cond?'PASS ':'FAIL ')+name);

// Parent
let r:any = await a.requestMobileOtp('98765 43210','PARENT_LOGIN'); check('parent otp issued', r.ok);
let w:any = await a.verifyParentOtp(r.data.challengeId,'000000'); check('wrong otp rejected w/ attempts', !w.ok && w.attemptsRemaining===4);
let v:any = await a.verifyParentOtp(r.data.challengeId, code(r.data)); check('parent verify -> 3 children / 2 schools', v.ok && v.data.children.length===3 && new Set(v.data.children.map((c:any)=>c.schoolId)).size===2);
let reuse:any = await a.verifyParentOtp(r.data.challengeId, code(r.data)); check('otp single-use', !reuse.ok);
let notMine:any = await a.startParentSession(v.data.ticket,'GVS-2028-0117'); check('cannot pick unlinked child', !notMine.ok);
let s:any = await a.startParentSession(v.data.ticket,'GVS-2027-0001'); check('parent session scoped', s.ok && s.data.schoolId==='GVS' && s.data.studentId==='GVS-2027-0001');
let sw:any = await a.switchChild(s.data.sessionId,'SJM-2033-0105'); check('switch child changes school scope', sw.ok && sw.data.schoolId==='SJM');
let sw2:any = await a.switchChild(sw.data.sessionId,'GVS-2028-0117'); check('switch to unlinked child refused', !sw2.ok);
// lockout
let r2:any = await a.requestMobileOtp('9876543211','PARENT_LOGIN'); let last:any;
for (let i=0;i<5;i++) last = await a.verifyParentOtp(r2.data.challengeId,'111111');
check('locked after 5 wrong', last.code==='LOCKED');
let rs:any = await a.resendOtp((await a.requestMobileOtp('9876543211','PARENT_LOGIN') as any).data.challengeId); check('resend cooldown enforced', !rs.ok && rs.code==='COOLDOWN');
let unk:any = await a.requestMobileOtp('9000000000','PARENT_LOGIN'); let unkv:any = await a.verifyParentOtp(unk.data.challengeId, code(unk.data)); check('unregistered mobile -> NO_LINKS', unkv.code==='NO_LINKS');
// expiry
let re:any = await a.requestMobileOtp('9848011111','PARENT_LOGIN'); (a as any).challenges.get(re.data.challengeId).expiresAt = Date.now()-1;
let ex:any = await a.verifyParentOtp(re.data.challengeId, code(re.data)); check('expired otp rejected', ex.code==='EXPIRED');

// Teacher: one school only + PIN
let t:any = await a.requestMobileOtp('9848012345','TEACHER_LOGIN'); let tv:any = await a.verifyTeacherOtp(t.data.challengeId, code(t.data));
check('teacher has one school', tv.ok && tv.data.memberships.length===1 && tv.data.memberships[0].schoolId==='GVS');
let ts:any = await a.startTeacherSession(tv.data.ticket,'MEM-T-0001'); check('teacher session GVS', ts.ok && ts.data.schoolId==='GVS' && ts.data.role==='TEACHER');
let tm:any = await a.requestMobileOtp('9848033333','TEACHER_LOGIN'); let tmv:any = await a.verifyTeacherOtp(tm.data.challengeId, code(tm.data));
check('SJM teacher has only SJM', tmv.ok && tmv.data.memberships.length===1 && tmv.data.memberships[0].schoolId==='SJM');
let other:any = await a.startTeacherSession(tmv.data.ticket,'MEM-T-0001'); check('another teacher\'s membership refused', !other.ok);
let pp:any = await a.verifyParentOtp((await a.requestMobileOtp('9848012345','TEACHER_LOGIN') as any).data.challengeId,'123456'); check('teacher otp not usable for parent purpose', !pp.ok);
let t2:any = await a.requestMobileOtp('9848022222','TEACHER_LOGIN'); let t2v:any = await a.verifyTeacherOtp(t2.data.challengeId, code(t2.data));
let np:any = await a.startTeacherSession(t2v.data.ticket,'MEM-T-0003'); check('PIN required', np.code==='PIN_REQUIRED');
let bp:any = await a.startTeacherSession(t2v.data.ticket,'MEM-T-0003','1111'); check('wrong PIN rejected', bp.code==='PIN_INVALID');
let gp:any = await a.startTeacherSession(t2v.data.ticket,'MEM-T-0003','2580'); check('right PIN ok', gp.ok && gp.data.authMethods.includes('PIN'));

// Staff
let bad:any = await a.beginPasswordSignIn('nobody@x.in','whatever'); check('unknown email denied (generic)', !bad.ok && bad.code==='DENIED');
let wrongpw:any = await a.beginPasswordSignIn('principal@greenwoodvalley.edu.in','nope'); check('wrong password same generic msg', wrongpw.error===bad.error);
let pw:any = await a.beginPasswordSignIn('principal@greenwoodvalley.edu.in','Greenwood@2026'); check('password -> email otp 2nd factor', pw.ok && pw.data.secondFactor.channel==='EMAIL');
let sf:any = await a.completeStaffSecondFactor(pw.data.ticket, pw.data.secondFactor.challengeId, code(pw.data.secondFactor));
let ss:any = await a.startStaffSession(sf.data.ticket, sf.data.memberships[0].membershipId); check('principal session 2 factors', ss.ok && ss.data.authMethods.join()==='PASSWORD,EMAIL_OTP');
let ms:any = await a.beginIdpSignIn('MICROSOFT','principal@greenwoodvalley.edu.in'); check('MS SSO linked by subject', ms.ok);
let gUnlinked:any = await a.beginIdpSignIn('GOOGLE','office@greenwoodvalley.edu.in'); check('Google identity w/o link refused', gUnlinked.code==='IDP_NOT_LINKED');
let inv:any = await a.getInvitation('inv-sjm-accounts-7Q4K2'); check('invitation readable', inv.ok && inv.data.role==='ADMIN');
let iw:any = await a.beginIdpSignIn('GOOGLE','accounts@stjudemodel.edu.in','inv-sjm-accounts-7Q4K2'); let iwc:any = await a.completeStaffSecondFactor(iw.data.ticket, iw.data.secondFactor.challengeId, code(iw.data.secondFactor));
check('invite accepted via Google', iwc.ok);
let inv2:any = await a.getInvitation('inv-sjm-accounts-7Q4K2'); check('invitation single-use', !inv2.ok);
let again:any = await a.beginIdpSignIn('GOOGLE','accounts@stjudemodel.edu.in'); check('linked after invite', again.ok);
check('quorum GVS=2 admins', a.getAdminQuorum('GVS').meetsMinimum);
check('quorum SJM below minimum before? now 1', a.getAdminQuorum('SJM').activeAdmins===1);

// Step-up
const sess = a.restoreSession()!;
let su:any = await a.requestStepUp(sess.sessionId,'PAYMENT'); let suv:any = await a.verifyStepUp(sess.sessionId, su.data.challengeId, code(su.data));
check('step-up token issued', suv.ok);
check('step-up wrong purpose refused', !a.consumeStepUp(suv.data.stepUpToken,'PICKUP_AUTHORIZATION'));
let su2:any = await a.requestStepUp(sess.sessionId,'PAYMENT'); let suv2:any = await a.verifyStepUp(sess.sessionId, su2.data.challengeId, code(su2.data));
check('step-up consumed once', a.consumeStepUp(suv2.data.stepUpToken,'PAYMENT') && !a.consumeStepUp(suv2.data.stepUpToken,'PAYMENT'));
a.logout(); check('logout clears session', a.restoreSession()===null);
