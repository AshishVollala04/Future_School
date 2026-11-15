// Parent sign-in PIN (mock), on the account: SMS the first time on a phone -> set PIN; next time PIN only
// (no SMS) -> pick child; Forgot / locked: same SMS code -> new PIN; change needs an OTP.
// Run all with: npm run test:services
const SRC = new URL('../../src/', import.meta.url).href;
const mem: Record<string, string> = {};
(globalThis as any).window = { location: { origin: 'http://x' }, localStorage: { getItem: (k: string) => (k in mem ? mem[k] : null), setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; }, key: (i: number) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } } };
const { authService: a } = await import(SRC + 'services/authService.ts');
const check = (n: string, c: boolean, x?: any) => console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  -> ' + JSON.stringify(x)));
const code = (c: any) => c.mockHint.match(/\d{6}/)[0];

const SRINIVAS = { schoolId: 'GVS', role: 'PARENT', userId: 'GRD-0003', studentId: 'GVS-2028-0117' } as any;
const verified = async (mobile: string) => {
  const r: any = await a.requestMobileOtp(mobile, 'PARENT_LOGIN');
  return (await a.verifyParentOtp(r.data.challengeId, code(r.data))) as any;
};
const stepUp = async (sessionId: string, purpose: string) => {
  const c: any = await a.requestStepUp(sessionId, purpose);
  return ((await a.verifyStepUp(sessionId, c.data.challengeId, code(c.data))) as any).data.stepUpToken;
};

// First time: SMS, no PIN yet -> session that must set one
let v = await verified('9848011111');
check('no PIN yet', v.ok && v.data.requiresPin === false, v);
const first: any = await a.startParentSession(v.data.ticket, 'GVS-2028-0117');
check('session opens', first.ok && first.data.authMethods.join() === 'SMS_OTP', first);
check('must set a PIN', ((await a.getParentPin(SRINIVAS)) as any).data.setupRequired === true);
check('cannot trust the phone before a PIN', ((await a.trustThisDevice()) as any).code === 'PIN_SETUP_REQUIRED');
check('weak PIN refused', ((await a.setParentPin(SRINIVAS, '1234')) as any).code === 'WEAK_PIN');
check('part of mobile refused', ((await a.setParentPin(SRINIVAS, '1111')) as any).code === 'WEAK_PIN');
check('first PIN, no extra SMS', ((await a.setParentPin(SRINIVAS, '4826')) as any).ok);
check('then the app opens', ((await a.getParentPin(SRINIVAS)) as any).data.setupRequired === false);
const trust: any = await a.trustThisDevice();
check('phone trusted', trust.ok && trust.data.role === 'PARENT' && trust.data.name === 'Srinivas Reddy' && trust.data.mobile === '••••••1111', trust);
check('teacher device slot untouched', a.getTrustedDevice('TEACHER') === null);

// Next time: PIN only -> children -> session (no PIN asked again)
const q: any = await a.parentPinSignIn('4826');
check('PIN only gives the children', q.ok && q.data.children.length === 1 && q.data.requiresPin === false, q);
const s2: any = await a.startParentSession(q.data.ticket, 'GVS-2028-0117');
check('session with DEVICE + PIN', s2.ok && s2.data.authMethods.join() === 'DEVICE,PIN', s2);
check('a PIN-only session cannot trust another phone', ((await a.trustThisDevice()) as any).code === 'OTP_REQUIRED');
check('wrong PIN counted', ((await a.parentPinSignIn('1357')) as any).attemptsRemaining === 4);

// After an SMS code an existing PIN is asked; locked -> Forgot PIN on the same code
v = await verified('9848011111');
check('PIN asked after SMS', v.data.requiresPin === true);
check('not your child answered first', ((await a.startParentSession(v.data.ticket, 'GVS-2027-0001')) as any).code === 'NOT_LINKED');
check('PIN required', ((await a.startParentSession(v.data.ticket, 'GVS-2028-0117')) as any).code === 'PIN_REQUIRED');
for (let i = 0; i < 4; i++) await a.startParentSession(v.data.ticket, 'GVS-2028-0117', '1357');
check('locked after 5 wrong', ((await a.startParentSession(v.data.ticket, 'GVS-2028-0117', '4826')) as any).code === 'PIN_LOCKED');
check('locked on the phone too', ((await a.parentPinSignIn('4826')) as any).code === 'PIN_LOCKED');
const fp: any = await a.startParentSession(v.data.ticket, 'GVS-2028-0117', undefined, true);
check('Forgot PIN on the same SMS code', fp.ok && fp.data.authMethods.includes('PIN_RESET'), fp);
check('reset session must set a PIN', ((await a.getParentPin(SRINIVAS)) as any).data.setupRequired === true);
check('new PIN without a second OTP', ((await a.setParentPin(SRINIVAS, '7395')) as any).ok);
check('phone works with the new PIN', ((await a.parentPinSignIn('7395')) as any).ok);

// Changing the PIN needs a fresh OTP
const s3: any = await a.startParentSession(((await a.parentPinSignIn('7395')) as any).data.ticket, 'GVS-2028-0117');
check('change without OTP refused', ((await a.setParentPin(SRINIVAS, '6159')) as any).code === 'STEP_UP_REQUIRED');
check('change with OTP', ((await a.setParentPin(SRINIVAS, '6159', await stepUp(s3.data.sessionId, 'PIN_CHANGE'))) as any).ok);

// Not you?
await a.forgetTrustedDevice('PARENT');
check('forgotten phone: back to SMS', a.getTrustedDevice('PARENT') === null && ((await a.parentPinSignIn('6159')) as any).code === 'DEVICE_UNKNOWN');
check('teachers cannot use the parent PIN', !((await a.getParentPin({ schoolId: 'GVS', role: 'TEACHER', userId: 'STF-T-0001' } as any)) as any).ok);

// Paying a fee (or a pickup pass) with the PIN: no SMS; staff actions and PIN changes keep the SMS code
check('payment: wrong PIN refused', ((await a.verifyStepUpWithPin(s3.data.sessionId, 'PAYMENT', '1357')) as any).code === 'PIN_INVALID');
const pay: any = await a.verifyStepUpWithPin(s3.data.sessionId, 'PAYMENT', '6159');
check('payment confirmed with the PIN', pay.ok && a.consumeStepUp(pay.data.stepUpToken, 'PAYMENT'), pay);
check('the token is single use', !a.consumeStepUp(pay.data.stepUpToken, 'PAYMENT'));
const pick: any = await a.verifyStepUpWithPin(s3.data.sessionId, 'PICKUP_AUTHORIZATION', '6159');
check('a pickup token is not a payment token', pick.ok && !a.consumeStepUp(pick.data.stepUpToken, 'PAYMENT'));
check('changing the PIN still needs SMS', ((await a.verifyStepUpWithPin(s3.data.sessionId, 'PIN_CHANGE', '6159')) as any).code === 'OTP_REQUIRED');
check('staff actions still need SMS', ((await a.verifyStepUpWithPin(s3.data.sessionId, 'SENSITIVE_STAFF_ACTION', '6159')) as any).code === 'OTP_REQUIRED');

// Page reload persistence: a fresh MockAuthService keeps the parent PIN + trusted device in localStorage
const { MockAuthService } = await import(SRC + 'services/mockAuthService.ts');
const vReload = await verified('9848011111');
const sReload: any = await a.startParentSession(vReload.data.ticket, 'GVS-2028-0117', '6159');
if (sReload.ok) await a.trustThisDevice();
const aReload = new MockAuthService();
check('reload keeps trusted device and parent PIN without OTP', aReload.getTrustedDevice('PARENT') !== null && ((await aReload.parentPinSignIn('6159')) as any).ok);
