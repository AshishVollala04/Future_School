// Teacher sign-in PIN (mock), required: first PIN right after sign-in, asked after every OTP, lockout,
// change needs an OTP, cannot be removed, Admin (SECURITY) resets.
// Run all with: npm run test:services
const SRC = new URL('../../src/', import.meta.url).href;
const mem: Record<string, string> = {};
(globalThis as any).window = { location: { origin: 'http://x' }, localStorage: { getItem: (k: string) => (k in mem ? mem[k] : null), setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; }, key: (i: number) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } } };
const { authService: a } = await import(SRC + 'services/authService.ts');
const { pinWeakness } = await import(SRC + 'utils/pin.ts');
const check = (n: string, c: boolean, x?: any) => console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  -> ' + JSON.stringify(x)));
const code = (c: any) => c.mockHint.match(/\d{6}/)[0];

const NAIR = { schoolId: 'GVS', role: 'TEACHER', userId: 'STF-T-0002' } as any;
const SARAH = { schoolId: 'GVS', role: 'TEACHER', userId: 'STF-T-0001' } as any;
const FIN = { schoolId: 'GVS', role: 'ADMIN', userId: 'ACC-L-0002' } as any; // has Security
const OPS = { schoolId: 'GVS', role: 'ADMIN', userId: 'ACC-L-0003' } as any; // no Security

const verified = async (mobile: string) => {
  const r: any = await a.requestMobileOtp(mobile, 'TEACHER_LOGIN');
  return (await a.verifyTeacherOtp(r.data.challengeId, code(r.data))) as any;
};
const stepUp = async (sessionId: string) => {
  const c: any = await a.requestStepUp(sessionId, 'SENSITIVE_STAFF_ACTION');
  return ((await a.verifyStepUp(sessionId, c.data.challengeId, code(c.data))) as any).data.stepUpToken;
};

// Rule shared with the server
check('2580 is allowed', pinWeakness('2580', '9848022222') === null);
check('1111 / 1234 / 4321 / 0123 refused', ['1111', '1234', '4321', '0123'].every(p => pinWeakness(p) !== null));
check('part of mobile refused', pinWeakness('9848', '9848022222') !== null && pinWeakness('2223', '9848012223') !== null);
check('not 4 digits refused', pinWeakness('12a4') !== null && pinWeakness('12345') !== null);

// Asked after the OTP; the ticket survives while typing
let v = await verified('9848022222');
check('PIN required flag', v.data.memberships[0].requiresPin === true);
check('no PIN -> PIN_REQUIRED', ((await a.startTeacherSession(v.data.ticket, 'MEM-T-0003')) as any).code === 'PIN_REQUIRED');
const w: any = await a.startTeacherSession(v.data.ticket, 'MEM-T-0003', '1357');
check('wrong PIN -> 4 left', w.code === 'PIN_INVALID' && w.attemptsRemaining === 4, w);
const s: any = await a.startTeacherSession(v.data.ticket, 'MEM-T-0003', '2580');
check('right PIN opens session with PIN method', s.ok && s.data.authMethods.includes('PIN'), s);

// Teacher changes it (OTP first), old PIN stops working
check('weak PIN refused', ((await a.setMyPin(NAIR, '1234', 'x')) as any).code === 'WEAK_PIN');
check('changing without OTP refused', ((await a.setMyPin(NAIR, '7395', 'x')) as any).code === 'STEP_UP_REQUIRED');
check('changing with no token refused', ((await a.setMyPin(NAIR, '7395')) as any).code === 'STEP_UP_REQUIRED');
const set: any = await a.setMyPin(NAIR, '7395', await stepUp(s.data.sessionId));
check('PIN changed', set.ok && set.data.pinSet, set);
v = await verified('9848022222');
check('old PIN refused', ((await a.startTeacherSession(v.data.ticket, 'MEM-T-0003', '2580')) as any).code === 'PIN_INVALID');
check('new PIN works', ((await a.startTeacherSession(v.data.ticket, 'MEM-T-0003', '7395')) as any).ok);

// Lockout after 5 wrong in a row
v = await verified('9848022222');
let last: any;
for (let i = 0; i < 5; i++) last = await a.startTeacherSession(v.data.ticket, 'MEM-T-0003', '1357');
check('5th wrong -> PIN_LOCKED', last.code === 'PIN_LOCKED', last);
check('locked keeps the SMS ticket (for Forgot PIN)', ((await a.startTeacherSession(v.data.ticket, 'MEM-T-0003', '7395')) as any).code === 'PIN_LOCKED');
const lockedTicket = v.data.ticket;
check('teacher sees locked', ((await a.getMyPin(NAIR)) as any).data.locked === true);

// Only an Admin with Security resets; reason + OTP
check('ops admin cannot list', !((await a.listTeacherPins(OPS)) as any).ok);
check('teacher cannot list', !((await a.listTeacherPins(SARAH)) as any).ok);
const fr: any = await a.beginPasswordSignIn('admin@greenwoodvalley.edu.in', 'Greenwood@2026');
const fv: any = await a.completeStaffSecondFactor(fr.data.ticket, fr.data.secondFactor.challengeId, code(fr.data.secondFactor));
const fin: any = await a.startStaffSession(fv.data.ticket, fv.data.memberships[0].membershipId);
const list: any = await a.listTeacherPins(FIN);
const row = list.data.find((x: any) => x.membershipId === 'MEM-T-0003');
check('list shows locked, masked mobile, no PIN', row?.locked === true && row.mobile === '••••••2222' && !JSON.stringify(list.data).includes('7395'), row);
check('only this school', list.data.every((x: any) => x.membershipId !== 'MEM-T-0101'));
check('reason required', ((await a.resetTeacherPin(FIN, 'MEM-T-0003', 'x', await stepUp(fin.data.sessionId))) as any).code === 'REASON');
check('OTP required', ((await a.resetTeacherPin(FIN, 'MEM-T-0003', 'Teacher forgot the PIN.', 'x')) as any).code === 'STEP_UP_REQUIRED');
check('other school refused', !((await a.resetTeacherPin(FIN, 'MEM-T-0101', 'Teacher forgot the PIN.', await stepUp(fin.data.sessionId))) as any).ok);
const reset: any = await a.resetTeacherPin(FIN, 'MEM-T-0003', 'Teacher forgot the PIN.', await stepUp(fin.data.sessionId));
check('reset removes PIN', reset.ok && !reset.data.pinSet && !reset.data.locked, reset);
v = await verified('9848022222');
check('after reset OTP alone works', v.data.memberships[0].requiresPin === false && ((await a.startTeacherSession(v.data.ticket, 'MEM-T-0003')) as any).ok);
check('there is no remove', typeof (a as any).removeMyPin === 'undefined');

// First PIN needs no second OTP (Sarah has none; so does Nair after the reset)
check('Sarah starts without a PIN', ((await a.getMyPin(SARAH)) as any).data.pinSet === false);
check('first PIN: weak still refused', ((await a.setMyPin(SARAH, '2345')) as any).code === 'WEAK_PIN');
const first: any = await a.setMyPin(SARAH, '2580');
check('first PIN set without extra OTP', first.ok && first.data.pinSet, first);
v = await verified('9848012345');
check('then asked after the OTP', v.data.memberships[0].requiresPin === true);

// Forgot PIN on the same SMS code (no second SMS): a session that can only set a new PIN; it also unlocks.
// (Sarah: Nair has used up the per-number OTP limit in this run.)
v = await verified('9848012345');
for (let i = 0; i < 5; i++) await a.startTeacherSession(v.data.ticket, 'MEM-T-0001', '1357');
check('Sarah locked', ((await a.startTeacherSession(v.data.ticket, 'MEM-T-0001', '2580')) as any).code === 'PIN_LOCKED');
const fp: any = await a.startTeacherSession(v.data.ticket, 'MEM-T-0001', undefined, true);
check('forgot PIN opens a reset session on the same SMS code', fp.ok && fp.data.authMethods.includes('PIN_RESET'), fp);
check('reset session must set a PIN', ((await a.getMyPin(SARAH)) as any).data.setupRequired === true);
check('cannot trust the device before the new PIN', ((await a.trustThisDevice()) as any).code === 'PIN_SETUP_REQUIRED');
check('new PIN without a second OTP', ((await a.setMyPin(SARAH, '6159')) as any).ok);
check('then the portal opens', ((await a.getMyPin(SARAH)) as any).data.setupRequired === false);
void lockedTicket;

// Trusted device: PIN only next time, no SMS
const trust: any = await a.trustThisDevice();
check('device trusted after an SMS sign-in', trust.ok && trust.data.name === 'Sarah Jenkins' && trust.data.mobile === '••••••2345', trust);
check('the device token is not exposed', !('token' in (a.getTrustedDevice('TEACHER') as any)));
const quick: any = await a.pinSignIn('6159');
check('PIN only signs in (DEVICE + PIN)', quick.ok && quick.data.authMethods.join() === 'DEVICE,PIN', quick);
check('a PIN-only session cannot trust another device', ((await a.trustThisDevice()) as any).code === 'OTP_REQUIRED');
check('wrong PIN counted', ((await a.pinSignIn('1357')) as any).attemptsRemaining === 4);
check('right PIN clears the count', ((await a.pinSignIn('6159')) as any).ok);
await a.forgetTrustedDevice('TEACHER');
check('forgotten device: back to SMS', a.getTrustedDevice('TEACHER') === null && ((await a.pinSignIn('6159')) as any).code === 'DEVICE_UNKNOWN');
