/**
 * Prototype / mock AuthService.
 *
 * Simulates what the backend will do. All mock credentials stay inside this
 * file and mock/authDirectory.ts. OTPs are random per challenge; the mock
 * reveals them through `mockHint`, which the UI labels "Prototype / mock".
 *
 * Rules simulated here (production enforces them server-side):
 *  - OTP: 6 digits, 5-minute expiry, 5 wrong attempts locks the challenge,
 *    30s resend cooldown, max 3 resends, max 5 requests per destination / 15 min.
 *  - Staff email: unknown emails denied; IdP accounts linked by (provider, subject);
 *    always two factors; invitations are single-use with a 48h expiry.
 *  - Sessions: exactly one role + one school (+ one student for parents).
 */
import type { AdminQuorumStatus, AuthService, IdentityProvider, PinRole, StaffAccountView, TeacherPinRow, TeacherPinStatus, TrustedDeviceInfo } from './authService';
import { pinWeakness } from '../utils/pin';
import type { Scope } from '../hooks/useScope';
import type { AdminPermission } from '../types/domain';
import {
  AuthMethod,
  AuthSession,
  InvitationView,
  MembershipOption,
  OtpChallenge,
  OtpChannel,
  ParentVerification,
  PortalRole,
  Result,
  StaffFirstFactor,
  StaffVerification,
  StepUpPurpose
} from '../types/session';
import { ChildInfo, UserProfile } from '../types/roles';
import { createSimulatedJwt } from '../types/auth';
import {
  MOCK_GUARDIANS,
  MOCK_IDP_IDENTITIES,
  MOCK_LEADERSHIP,
  MOCK_SCHOOLS,
  MOCK_STUDENTS,
  MOCK_TEACHERS,
  MockInvitation,
  MockLeadershipAccount,
  MockStaffMembership,
  MockTeacher,
  seedInvitations
} from '../mock/authDirectory';
import { storage, storageKeys } from './storage';
import { auditService } from './auditService';

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 30 * 1000;
const OTP_MAX_RESENDS = 3;
const OTP_RATE_WINDOW_MS = 15 * 60 * 1000;
const OTP_RATE_MAX = 5;
const TICKET_TTL_MS = 10 * 60 * 1000;
const STEP_UP_TTL_MS = 2 * 60 * 1000;
const PASSWORD_MAX_FAILS = 5;
const PASSWORD_LOCK_MS = 15 * 60 * 1000;
const PIN_MAX_FAILS = 5;
const SESSION_TTL: Record<PortalRole, number> = {
  PARENT: 30 * 24 * 60 * 60 * 1000,
  TEACHER: 7 * 24 * 60 * 60 * 1000,
  PRINCIPAL: 12 * 60 * 60 * 1000,
  ADMIN: 12 * 60 * 60 * 1000
};

const SESSION_KEY = storageKeys.auth('session');
/** This browser's trusted-device record (token kept only here). */
const DEVICE_KEY = (role: PinRole) => storageKeys.device(role === 'TEACHER' ? 'teacherPinDevice' : 'parentPinDevice');
/** Prototype stand-in for the server's trusted_devices table. */
const MOCK_DEVICES_KEY = storageKeys.auth('mockTrustedDevices');
const MOCK_PARENT_PINS_KEY = storageKeys.auth('mockParentPins');
const DEVICE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

interface StoredDevice extends TrustedDeviceInfo {
  token: string;
}
/** userId: staffId (teacher) or guardianId (parent). */
type MockDeviceTable = Record<string, { kind: PinRole; userId: string; membershipId: string; revoked: boolean; expiresAt: number }>;
const INVITES_KEY = storageKeys.auth('invitations');
const ACCOUNT_OVERLAY_KEY = storageKeys.auth('leadershipOverlay');
/** Accounts created by an Admin invitation (prototype only). */
const ADDED_ACCOUNTS_KEY = storageKeys.auth('addedLeadership');
const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

interface Challenge {
  id: string;
  channel: OtpChannel;
  destination: string;
  code: string;
  purpose: string;
  createdAt: number;
  expiresAt: number;
  lastSentAt: number;
  resends: number;
  attemptsLeft: number;
  consumed: boolean;
  /** Ticket waiting for this challenge (staff second factor). */
  ticket?: string;
}

type Ticket =
  | { kind: 'PARENT'; mobile: string; expiresAt: number; pinDone?: boolean }
  | { kind: 'TEACHER'; mobile: string; expiresAt: number }
  | {
      kind: 'STAFF_FIRST_FACTOR';
      accountId: string;
      methods: AuthMethod[];
      inviteToken?: string;
      pendingLink?: { provider: IdentityProvider; subject: string };
      pendingPassword?: string;
      expiresAt: number;
    }
  | { kind: 'STAFF_VERIFIED'; accountId: string; methods: AuthMethod[]; expiresAt: number };

interface StoredSession {
  session: AuthSession;
  /** Where step-up OTPs go. Server-side only in production. */
  contact: { channel: OtpChannel; destination: string };
}

type AccountOverlay = Record<string, Partial<Pick<MockLeadershipAccount, 'status' | 'password' | 'idpLinks'>>>;

function randomDigits(n: number): string {
  const buf = new Uint32Array(n);
  crypto.getRandomValues(buf);
  return Array.from(buf, v => String(v % 10)).join('');
}

function randomId(prefix: string): string {
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  return `${prefix}_${buf[0].toString(36)}${buf[1].toString(36)}`;
}

function cleanMobile(raw: string): string | null {
  let d = raw.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

function maskMobile(m: string): string {
  return `+91 ${m.slice(0, 2)}••••••${m.slice(-2)}`;
}

function maskEmail(e: string): string {
  const [user, domain] = e.split('@');
  return `${user.slice(0, 2)}${'•'.repeat(Math.max(1, user.length - 2))}@${domain}`;
}

const fail = <T,>(error: string, code?: string, attemptsRemaining?: number): Result<T> => ({
  ok: false,
  error,
  code,
  attemptsRemaining
});
const ok = <T,>(data: T): Result<T> => ({ ok: true, data });

const GENERIC_STAFF_DENIAL =
  'Email or password is incorrect, or this email is not authorised for FutureSchool. Ask your school Admin for an invitation.';

export class MockAuthService implements AuthService {
  readonly isMock = true;

  private challenges = new Map<string, Challenge>();
  private tickets = new Map<string, Ticket>();
  private stepUpTokens = new Map<string, { purpose: StepUpPurpose; sessionId: string; expiresAt: number }>();
  private requestLog = new Map<string, number[]>();
  private passwordFails = new Map<string, { count: number; lockedUntil: number }>();
  private pinFails = new Map<string, number>();
  /** Parent PINs, by guardianId (persisted in mock localStorage so page reloads keep PIN login). */
  private parentPinOf(guardianId: string): { pin: string; updatedAt: number } | null {
    const map = storage.get<Record<string, { pin: string; updatedAt: number }>>(MOCK_PARENT_PINS_KEY, {});
    return map[guardianId] ?? null;
  }

  private saveParentPin(guardianId: string, pin: string): void {
    const map = storage.get<Record<string, { pin: string; updatedAt: number }>>(MOCK_PARENT_PINS_KEY, {});
    map[guardianId] = { pin, updatedAt: Date.now() };
    storage.set(MOCK_PARENT_PINS_KEY, map);
  }

  private guardianByMobile(mobile: string) {
    return MOCK_GUARDIANS.find(x => x.mobile === mobile);
  }

  /** Prototype: PIN changes live in memory only (back to the directory's PIN on reload). */
  private pinChanges = new Map<string, { pin: string | null; updatedAt: number }>();

  private pinOf(m: MockStaffMembership): string | null {
    const c = this.pinChanges.get(m.membershipId);
    return c ? c.pin : m.pin ?? null;
  }

  private pinStatus(m: MockStaffMembership): TeacherPinStatus {
    const pin = this.pinOf(m);
    return {
      pinSet: Boolean(pin),
      locked: Boolean(pin) && (this.pinFails.get(m.membershipId) || 0) >= PIN_MAX_FAILS,
      updatedAt: this.pinChanges.get(m.membershipId)?.updatedAt ?? null
    };
  }

  // ---------------------------------------------------------------------------
  // OTP engine
  // ---------------------------------------------------------------------------

  private issueChallenge(channel: OtpChannel, destination: string, purpose: string, ticket?: string): Result<OtpChallenge> {
    const now = Date.now();
    const recent = (this.requestLog.get(destination) || []).filter(t => now - t < OTP_RATE_WINDOW_MS);
    if (recent.length >= OTP_RATE_MAX) {
      return fail('Too many codes requested. Please wait 15 minutes and try again.', 'RATE_LIMITED');
    }
    recent.push(now);
    this.requestLog.set(destination, recent);

    const c: Challenge = {
      id: randomId('otp'),
      channel,
      destination,
      code: randomDigits(6),
      purpose,
      createdAt: now,
      expiresAt: now + OTP_TTL_MS,
      lastSentAt: now,
      resends: 0,
      attemptsLeft: OTP_MAX_ATTEMPTS,
      consumed: false,
      ticket
    };
    this.challenges.set(c.id, c);
    return ok(this.view(c));
  }

  private view(c: Challenge): OtpChallenge {
    return {
      challengeId: c.id,
      channel: c.channel,
      maskedDestination: c.channel === 'SMS' ? maskMobile(c.destination) : maskEmail(c.destination),
      expiresAt: c.expiresAt,
      resendAvailableAt: c.resends >= OTP_MAX_RESENDS ? Number.POSITIVE_INFINITY : c.lastSentAt + OTP_RESEND_COOLDOWN_MS,
      attemptsRemaining: c.attemptsLeft,
      mockHint: `Prototype / mock: the code is ${c.code}`
    };
  }

  private checkCode(challengeId: string, code: string, purpose?: string): Result<Challenge> {
    const c = this.challenges.get(challengeId);
    if (!c || c.consumed || (purpose && c.purpose !== purpose)) {
      return fail('This code is no longer valid. Request a new one.', 'NOT_FOUND');
    }
    if (Date.now() > c.expiresAt) {
      c.consumed = true;
      return fail('This code has expired. Request a new one.', 'EXPIRED');
    }
    if (c.attemptsLeft <= 0) {
      return fail('Too many wrong attempts. Request a new code.', 'LOCKED', 0);
    }
    if (!/^\d{6}$/.test(code.trim()) || code.trim() !== c.code) {
      c.attemptsLeft -= 1;
      if (c.attemptsLeft <= 0) {
        c.consumed = true;
        return fail('Too many wrong attempts. Request a new code.', 'LOCKED', 0);
      }
      return fail(`Incorrect code. ${c.attemptsLeft} attempt(s) left.`, 'INVALID', c.attemptsLeft);
    }
    c.consumed = true;
    return ok(c);
  }

  async resendOtp(challengeId: string): Promise<Result<OtpChallenge>> {
    const c = this.challenges.get(challengeId);
    if (!c || c.consumed) return fail('This code is no longer valid. Start again.', 'NOT_FOUND');
    const now = Date.now();
    if (c.resends >= OTP_MAX_RESENDS) return fail('Resend limit reached. Start again.', 'RESEND_LIMIT');
    if (now < c.lastSentAt + OTP_RESEND_COOLDOWN_MS) return fail('Please wait before requesting another code.', 'COOLDOWN');
    // A resend issues a fresh code and resets expiry, but keeps the attempt budget.
    c.code = randomDigits(6);
    c.lastSentAt = now;
    c.expiresAt = now + OTP_TTL_MS;
    c.resends += 1;
    return ok(this.view(c));
  }

  private newTicket(t: Ticket): string {
    const id = randomId('tkt');
    this.tickets.set(id, t);
    return id;
  }

  private takeTicket<K extends Ticket['kind']>(id: string, kind: K): Extract<Ticket, { kind: K }> | null {
    const t = this.tickets.get(id);
    if (!t || t.kind !== kind || Date.now() > t.expiresAt) return null;
    return t as Extract<Ticket, { kind: K }>;
  }

  // ---------------------------------------------------------------------------
  // Parent
  // ---------------------------------------------------------------------------

  async requestMobileOtp(mobile: string, purpose: 'PARENT_LOGIN' | 'TEACHER_LOGIN'): Promise<Result<OtpChallenge>> {
    const m = cleanMobile(mobile);
    if (!m) return fail('Enter a valid 10-digit Indian mobile number.', 'BAD_MOBILE');
    // Deliberately does not reveal whether the number is registered.
    return this.issueChallenge('SMS', m, purpose);
  }

  private childrenForMobile(mobile: string): { guardianName: string; children: ChildInfo[] } | null {
    const g = MOCK_GUARDIANS.find(x => x.mobile === mobile);
    if (!g) return null;
    const children = MOCK_STUDENTS.filter(s => g.studentIds.includes(s.id));
    return children.length ? { guardianName: g.name, children } : null;
  }

  async verifyParentOtp(challengeId: string, code: string): Promise<Result<ParentVerification>> {
    const r = this.checkCode(challengeId, code, 'PARENT_LOGIN');
    if (!r.ok) return r;
    const found = this.childrenForMobile(r.data.destination);
    if (!found) {
      return fail(
        'No students are linked to this mobile number. Please contact your school office to register it.',
        'NO_LINKS'
      );
    }
    const ticket = this.newTicket({ kind: 'PARENT', mobile: r.data.destination, expiresAt: Date.now() + TICKET_TTL_MS });
    const g = this.guardianByMobile(r.data.destination);
    return ok({ ticket, guardianName: found.guardianName, children: found.children, requiresPin: Boolean(g && this.parentPinOf(g.guardianId)) });
  }

  async startParentSession(ticket: string, studentId: string, pin?: string, forgotPin?: boolean): Promise<Result<AuthSession>> {
    const t = this.takeTicket(ticket, 'PARENT');
    if (!t) return fail('Your verification has expired. Please sign in again.', 'TICKET_EXPIRED');
    if (!this.childrenForMobile(t.mobile)?.children.some(c => c.id === studentId)) return fail('This student is not linked to your mobile number.', 'NOT_LINKED');
    const g = this.guardianByMobile(t.mobile);
    const methods: AuthMethod[] = t.pinDone ? ['DEVICE', 'PIN'] : ['SMS_OTP'];
    const expected = g ? this.parentPinOf(g.guardianId)?.pin ?? null : null;
    if (expected && !t.pinDone) {
      if (forgotPin) {
        methods.push('PIN_RESET');
      } else {
        const bad = this.checkPinFor('P:' + g!.guardianId, expected, pin);
        if (bad) return bad; // the ticket stays valid, so 'Forgot PIN' needs no new SMS
        methods.push('PIN');
      }
    }
    const session = this.buildParentSession(t.mobile, studentId, methods);
    if (!session) return fail('This student is not linked to your mobile number.', 'NOT_LINKED');
    this.tickets.delete(ticket);
    return ok(session);
  }

  async verifyStepUpWithPin(sessionId: string, purpose: StepUpPurpose, pin: string): Promise<Result<{ stepUpToken: string }>> {
    const s = this.stored()?.session;
    if (!s || s.sessionId !== sessionId) return fail('Your session has ended. Please sign in again.', 'NO_SESSION');
    if (s.role !== 'PARENT' || (purpose !== 'PAYMENT' && purpose !== 'PICKUP_AUTHORIZATION')) return fail('Please confirm with the SMS code.', 'OTP_REQUIRED');
    const expected = this.parentPinOf(s.userId)?.pin ?? null;
    if (!expected || s.authMethods.includes('PIN_RESET')) return fail('Set your 4-digit sign-in PIN first.', 'PIN_SETUP_REQUIRED');
    const bad = this.checkPinFor<{ stepUpToken: string }>('P:' + s.userId, expected, pin);
    if (bad) return bad;
    const stepUpToken = randomId('stp');
    this.stepUpTokens.set(stepUpToken, { purpose, sessionId, expiresAt: Date.now() + STEP_UP_TTL_MS });
    return ok({ stepUpToken });
  }

  // Parent PIN (on the account, the same for every child)

  private parentStatus(guardianId: string, setupRequired: boolean): TeacherPinStatus {
    const p = this.parentPinOf(guardianId);
    return { setupRequired, pinSet: Boolean(p), locked: Boolean(p) && (this.pinFails.get('P:' + guardianId) || 0) >= PIN_MAX_FAILS, updatedAt: p?.updatedAt ?? null };
  }

  async getParentPin(scope: Scope): Promise<Result<TeacherPinStatus>> {
    if (scope.role !== 'PARENT') return fail('This is for parents.', 'FORBIDDEN');
    return ok(this.parentStatus(scope.userId, !this.parentPinOf(scope.userId) || this.resettingPin(scope)));
  }

  async setParentPin(scope: Scope, pin: string, stepUpToken?: string): Promise<Result<TeacherPinStatus>> {
    if (scope.role !== 'PARENT') return fail('This is for parents.', 'FORBIDDEN');
    const g = MOCK_GUARDIANS.find(x => x.guardianId === scope.userId);
    const weak = pinWeakness(pin, g?.mobile);
    if (weak) return fail(weak, 'WEAK_PIN');
    const change = Boolean(this.parentPinOf(scope.userId));
    const forgot = this.resettingPin(scope);
    if (change && !forgot && !this.consumeStepUp(stepUpToken ?? '', 'PIN_CHANGE')) return fail('Please confirm with the OTP again.', 'STEP_UP_REQUIRED');
    this.saveParentPin(scope.userId, pin);
    this.pinFails.delete('P:' + scope.userId);
    if (forgot) {
      const st = this.stored()!;
      st.session.authMethods = [...st.session.authMethods.filter(x => x !== 'PIN_RESET'), 'PIN'];
      storage.set(SESSION_KEY, st);
    }
    return ok(this.parentStatus(scope.userId, false));
  }

  private buildParentSession(mobile: string, studentId: string, methods: AuthMethod[]): AuthSession | null {
    const g = MOCK_GUARDIANS.find(x => x.mobile === mobile);
    const found = this.childrenForMobile(mobile);
    const child = found?.children.find(c => c.id === studentId);
    if (!g || !found || !child) return null;
    const profile: UserProfile = {
      id: g.guardianId,
      name: g.name,
      email: '',
      role: 'PARENT',
      avatar: `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(g.name)}&backgroundColor=ccfbf1`,
      roleLabel: 'Parent / Guardian',
      tenantId: child.schoolId,
      schoolCode: child.schoolId,
      schoolName: child.schoolName,
      studentId: child.id,
      studentName: child.name,
      grade: child.grade,
      section: child.section,
      rollNumber: child.rollNumber,
      activeChild: child,
      linkedChildren: found.children
    };
    return this.persistSession('PARENT', g.guardianId, child.schoolId, profile, methods, { channel: 'SMS', destination: mobile }, child.id);
  }

  // ---------------------------------------------------------------------------
  // Teacher
  // ---------------------------------------------------------------------------

  private toOption(m: MockStaffMembership): MembershipOption {
    return {
      membershipId: m.membershipId,
      role: m.role,
      schoolId: m.schoolId,
      schoolName: MOCK_SCHOOLS[m.schoolId]?.name ?? m.schoolId,
      title: m.title,
      requiresPin: Boolean(this.pinOf(m))
    };
  }

  async verifyTeacherOtp(challengeId: string, code: string): Promise<Result<StaffVerification>> {
    const r = this.checkCode(challengeId, code, 'TEACHER_LOGIN');
    if (!r.ok) return r;
    const t = MOCK_TEACHERS.find(x => x.mobile === r.data.destination);
    if (!t || t.memberships.length === 0) {
      return fail('This number is not registered as teaching staff at any school. Contact your school Admin.', 'NO_LINKS');
    }
    const ticket = this.newTicket({ kind: 'TEACHER', mobile: t.mobile, expiresAt: Date.now() + TICKET_TTL_MS });
    return ok({ ticket, displayName: t.name, memberships: t.memberships.map(m => this.toOption(m)) });
  }

  /** Same rule as the server: missing, wrong (counted) or locked PIN -> a failure; null when correct. */
  private checkPin(m: MockStaffMembership, pin?: string): Result<AuthSession> | null {
    return this.checkPinFor(m.membershipId, this.pinOf(m), pin);
  }

  /** key: membershipId (teacher) or 'P:' + guardianId (parent account). */
  private checkPinFor<T = AuthSession>(key: string, expected: string | null, pin?: string): Result<T> | null {
    if (!expected) return null;
    const fails = this.pinFails.get(key) || 0;
    const locked = () => fail<T>("PIN locked after 5 wrong tries. Tap 'Forgot PIN' to get an SMS code and set a new one.", 'PIN_LOCKED', 0);
    if (fails >= PIN_MAX_FAILS) return locked();
    if (!pin) return fail<T>('Enter your 4-digit PIN.', 'PIN_REQUIRED');
    if (pin !== expected) {
      this.pinFails.set(key, fails + 1);
      const left = PIN_MAX_FAILS - fails - 1;
      return left <= 0 ? locked() : fail<T>(`Incorrect PIN. ${left} attempt(s) left.`, 'PIN_INVALID', left);
    }
    this.pinFails.delete(key);
    return null;
  }

  private teacherProfile(teacher: MockTeacher, m: MockStaffMembership): UserProfile {
    return {
      id: teacher.staffId,
      name: teacher.name,
      email: '',
      role: 'TEACHER',
      avatar: `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(teacher.name)}&backgroundColor=ffedd5`,
      roleLabel: m.title,
      tenantId: m.schoolId,
      schoolCode: m.schoolId,
      schoolName: MOCK_SCHOOLS[m.schoolId]?.name ?? m.schoolId,
      department: m.department,
      classTeacherOf: m.classTeacherOf
    };
  }

  async startTeacherSession(ticket: string, membershipId: string, pin?: string, forgotPin?: boolean): Promise<Result<AuthSession>> {
    const t = this.takeTicket(ticket, 'TEACHER');
    if (!t) return fail('Your verification has expired. Please sign in again.', 'TICKET_EXPIRED');
    const teacher = MOCK_TEACHERS.find(x => x.mobile === t.mobile);
    const m = teacher?.memberships.find(x => x.membershipId === membershipId);
    if (!teacher || !m) return fail('That role is not available for this number.', 'NOT_LINKED');

    const methods: AuthMethod[] = ['SMS_OTP'];
    if (this.pinOf(m)) {
      if (forgotPin) {
        methods.push('PIN_RESET');
      } else {
        const bad = this.checkPin(m, pin);
        if (bad) return bad; // the ticket stays valid, so 'Forgot PIN' needs no new SMS
        methods.push('PIN');
      }
    }
    this.tickets.delete(ticket);
    return ok(this.persistSession('TEACHER', teacher.staffId, m.schoolId, this.teacherProfile(teacher, m), methods, { channel: 'SMS', destination: teacher.mobile }));
  }

  // ---------------------------------------------------------------------------
  // Principal & Admin (school email)
  // ---------------------------------------------------------------------------

  private loadInvites(): MockInvitation[] {
    const stored = storage.get<MockInvitation[] | null>(INVITES_KEY, null);
    if (stored) return stored;
    const seeded = seedInvitations(Date.now());
    storage.set(INVITES_KEY, seeded);
    return seeded;
  }

  private accounts(): MockLeadershipAccount[] {
    const overlay = storage.get<AccountOverlay>(ACCOUNT_OVERLAY_KEY, {});
    const added = storage.get<MockLeadershipAccount[]>(ADDED_ACCOUNTS_KEY, []);
    return [...MOCK_LEADERSHIP, ...added].map(a => ({ ...a, ...overlay[a.accountId] }));
  }

  private patchAccount(accountId: string, patch: AccountOverlay[string]) {
    const overlay = storage.get<AccountOverlay>(ACCOUNT_OVERLAY_KEY, {});
    overlay[accountId] = { ...overlay[accountId], ...patch };
    storage.set(ACCOUNT_OVERLAY_KEY, overlay);
  }

  private validInvite(token: string | undefined, email?: string): MockInvitation | null {
    if (!token) return null;
    const inv = this.loadInvites().find(i => i.token === token);
    if (!inv || inv.usedAt || Date.now() > inv.expiresAt) return null;
    if (email && inv.email.toLowerCase() !== email.trim().toLowerCase()) return null;
    return inv;
  }

  async getInvitation(token: string): Promise<Result<InvitationView>> {
    const inv = this.validInvite(token);
    if (!inv) return fail('This invitation link is invalid, expired or already used. Ask your Admin for a new one.', 'INVITE_INVALID');
    return ok({
      token: inv.token,
      email: inv.email,
      role: inv.role,
      schoolId: inv.schoolId,
      schoolName: MOCK_SCHOOLS[inv.schoolId]?.name ?? inv.schoolId,
      expiresAt: inv.expiresAt
    });
  }

  async beginIdpSignIn(provider: IdentityProvider, email: string, inviteToken?: string): Promise<Result<StaffFirstFactor>> {
    const clean = email.trim().toLowerCase();
    // Prototype / mock: stands in for the OIDC redirect + server-side ID-token verification.
    const identity = MOCK_IDP_IDENTITIES.find(i => i.provider === provider && i.email === clean);
    const label = provider === 'MICROSOFT' ? 'Microsoft' : 'Google';
    if (!identity) return fail(`${label} sign-in was cancelled or no ${label} account exists for that email.`, 'IDP_FAILED');

    // Link lookup is by immutable subject (oid/sub), NOT by the email string.
    const linked = this.accounts().find(
      a => a.status === 'ACTIVE' && a.idpLinks.some(l => l.provider === provider && l.subject === identity.subject)
    );
    if (linked) {
      return this.issueStaffSecondFactor({
        kind: 'STAFF_FIRST_FACTOR',
        accountId: linked.accountId,
        methods: [provider === 'MICROSOFT' ? 'IDP_MICROSOFT' : 'IDP_GOOGLE'],
        expiresAt: Date.now() + TICKET_TTL_MS
      }, linked.email);
    }

    const inv = this.validInvite(inviteToken, identity.email);
    if (inv) {
      return this.issueStaffSecondFactor({
        kind: 'STAFF_FIRST_FACTOR',
        accountId: inv.accountId,
        methods: [provider === 'MICROSOFT' ? 'IDP_MICROSOFT' : 'IDP_GOOGLE'],
        inviteToken: inv.token,
        pendingLink: { provider, subject: identity.subject },
        expiresAt: Date.now() + TICKET_TTL_MS
      }, inv.email);
    }

    return fail(
      `This ${label} account is not linked to FutureSchool. Use your password, or ask your school Admin for an invitation.`,
      'IDP_NOT_LINKED'
    );
  }

  async completeIdpSignIn(_state: string, _code: string): Promise<Result<StaffFirstFactor>> {
    // Prototype: beginIdpSignIn signs in directly; there is no provider redirect to return from.
    return fail('Microsoft/Google sign-in did not complete. Please try again.', 'IDP_FAILED');
  }

  async getIdpProviders(): Promise<IdentityProvider[]> {
    return ['MICROSOFT', 'GOOGLE'];
  }

  async beginPasswordSignIn(email: string, password: string, inviteToken?: string): Promise<Result<StaffFirstFactor>> {
    const clean = email.trim().toLowerCase();
    const lock = this.passwordFails.get(clean);
    if (lock && Date.now() < lock.lockedUntil) {
      return fail('Too many failed attempts. Try again in 15 minutes.', 'LOCKED');
    }

    const inv = this.validInvite(inviteToken, clean);
    if (inv) {
      if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
        return fail('Choose a password of at least 10 characters with letters and numbers.', 'WEAK_PASSWORD');
      }
      return this.issueStaffSecondFactor({
        kind: 'STAFF_FIRST_FACTOR',
        accountId: inv.accountId,
        methods: ['PASSWORD'],
        inviteToken: inv.token,
        pendingPassword: password,
        expiresAt: Date.now() + TICKET_TTL_MS
      }, inv.email);
    }

    const account = this.accounts().find(a => a.email === clean && a.status === 'ACTIVE');
    if (!account || !account.password || account.password !== password) {
      const prev = this.passwordFails.get(clean) || { count: 0, lockedUntil: 0 };
      const count = prev.count + 1;
      this.passwordFails.set(clean, { count, lockedUntil: count >= PASSWORD_MAX_FAILS ? Date.now() + PASSWORD_LOCK_MS : 0 });
      return fail(GENERIC_STAFF_DENIAL, 'DENIED');
    }
    this.passwordFails.delete(clean);
    return this.issueStaffSecondFactor({
      kind: 'STAFF_FIRST_FACTOR',
      accountId: account.accountId,
      methods: ['PASSWORD'],
      expiresAt: Date.now() + TICKET_TTL_MS
    }, account.email);
  }

  private issueStaffSecondFactor(t: Extract<Ticket, { kind: 'STAFF_FIRST_FACTOR' }>, email: string): Result<StaffFirstFactor> {
    const ticket = this.newTicket(t);
    const ch = this.issueChallenge('EMAIL', email, 'STAFF_SECOND_FACTOR', ticket);
    if (!ch.ok) {
      this.tickets.delete(ticket);
      return ch;
    }
    return ok({ ticket, secondFactor: ch.data });
  }

  async completeStaffSecondFactor(ticket: string, challengeId: string, code: string): Promise<Result<StaffVerification>> {
    const t = this.takeTicket(ticket, 'STAFF_FIRST_FACTOR');
    if (!t) return fail('Your sign-in has expired. Please start again.', 'TICKET_EXPIRED');
    const c = this.challenges.get(challengeId);
    if (!c || c.ticket !== ticket) return fail('This code is no longer valid. Start again.', 'NOT_FOUND');
    const r = this.checkCode(challengeId, code, 'STAFF_SECOND_FACTOR');
    if (!r.ok) return r;

    const account = this.accounts().find(a => a.accountId === t.accountId);
    if (!account) return fail(GENERIC_STAFF_DENIAL, 'DENIED');

    // Apply invitation only after BOTH factors succeed.
    if (t.inviteToken) {
      const inv = this.validInvite(t.inviteToken, account.email);
      if (!inv) return fail('This invitation is no longer valid.', 'INVITE_INVALID');
      this.patchAccount(account.accountId, {
        status: 'ACTIVE',
        ...(t.pendingPassword ? { password: t.pendingPassword } : {}),
        ...(t.pendingLink ? { idpLinks: [...account.idpLinks, t.pendingLink] } : {})
      });
      storage.set(INVITES_KEY, this.loadInvites().map(i => (i.token === inv.token ? { ...i, usedAt: Date.now() } : i)));
      auditService.record({
        schoolId: inv.schoolId,
        action: 'INVITATION_ACCEPTED',
        actorId: account.accountId,
        actorRole: inv.role,
        targetId: account.accountId,
        details: t.pendingLink
          ? `Invitation accepted; ${t.pendingLink.provider} identity linked by subject.`
          : 'Invitation accepted; password set.'
      });
    }

    this.tickets.delete(ticket);
    const verified = this.newTicket({
      kind: 'STAFF_VERIFIED',
      accountId: account.accountId,
      methods: [...t.methods, 'EMAIL_OTP'],
      expiresAt: Date.now() + TICKET_TTL_MS
    });
    return ok({ ticket: verified, displayName: account.name, memberships: account.memberships.map(m => this.toOption(m)) });
  }

  async startStaffSession(ticket: string, membershipId: string): Promise<Result<AuthSession>> {
    const t = this.takeTicket(ticket, 'STAFF_VERIFIED');
    if (!t) return fail('Your sign-in has expired. Please start again.', 'TICKET_EXPIRED');
    const account = this.accounts().find(a => a.accountId === t.accountId);
    const m = account?.memberships.find(x => x.membershipId === membershipId);
    if (!account || !m || account.status !== 'ACTIVE') return fail('That role is not available for this account.', 'NOT_LINKED');

    const profile: UserProfile = {
      id: account.accountId,
      name: account.name,
      email: account.email,
      role: m.role,
      avatar: `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(account.name)}&backgroundColor=e2e8f0`,
      roleLabel: m.title,
      tenantId: m.schoolId,
      schoolCode: m.schoolId,
      schoolName: MOCK_SCHOOLS[m.schoolId]?.name ?? m.schoolId,
      requiresMfa: true
    };
    this.tickets.delete(ticket);
    auditService.record({
      schoolId: m.schoolId,
      action: 'STAFF_SIGN_IN',
      actorId: account.accountId,
      actorRole: m.role,
      targetId: account.accountId,
      details: `Signed in with ${t.methods.join(' + ')}.`
    });
    return ok(this.persistSession(m.role, account.accountId, m.schoolId, profile, t.methods, { channel: 'EMAIL', destination: account.email }));
  }

  // ---------------------------------------------------------------------------
  // Session
  // ---------------------------------------------------------------------------

  private persistSession(
    role: PortalRole,
    userId: string,
    schoolId: string,
    profile: UserProfile,
    methods: AuthMethod[],
    contact: StoredSession['contact'],
    studentId?: string
  ): AuthSession {
    const now = Date.now();
    const ttl = SESSION_TTL[role];
    const session: AuthSession = {
      sessionId: randomId('ses'),
      userId,
      role,
      schoolId,
      studentId,
      authMethods: methods,
      issuedAt: now,
      expiresAt: now + ttl,
      accessToken: createSimulatedJwt(profile, Math.floor(ttl / 1000)).accessToken,
      profile
    };
    storage.set<StoredSession>(SESSION_KEY, { session, contact });
    return session;
  }

  private stored(): StoredSession | null {
    const s = storage.get<StoredSession | null>(SESSION_KEY, null);
    if (!s || !s.session || Date.now() > s.session.expiresAt) {
      if (s) storage.remove(SESSION_KEY);
      return null;
    }
    return s;
  }

  restoreSession(): AuthSession | null {
    return this.stored()?.session ?? null;
  }

  getAccessToken(): string | null {
    return this.stored()?.session.accessToken ?? null;
  }

  authHeader(): Record<string, string> {
    const token = this.getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async switchChild(sessionId: string, studentId: string): Promise<Result<AuthSession>> {
    const s = this.stored();
    if (!s || s.session.sessionId !== sessionId || s.session.role !== 'PARENT') {
      return fail('Your session has ended. Please sign in again.', 'NO_SESSION');
    }
    const next = this.buildParentSession(s.contact.destination, studentId, s.session.authMethods);
    if (!next) return fail('This student is not linked to your mobile number.', 'NOT_LINKED');
    return ok(next);
  }

  logout(): void {
    storage.remove(SESSION_KEY);
    this.stepUpTokens.clear();
  }

  // ---------------------------------------------------------------------------
  // Step-up
  // ---------------------------------------------------------------------------

  async requestStepUp(sessionId: string, purpose: StepUpPurpose): Promise<Result<OtpChallenge>> {
    const s = this.stored();
    if (!s || s.session.sessionId !== sessionId) return fail('Your session has ended. Please sign in again.', 'NO_SESSION');
    return this.issueChallenge(s.contact.channel, s.contact.destination, `STEP_UP:${purpose}:${sessionId}`);
  }

  async verifyStepUp(sessionId: string, challengeId: string, code: string): Promise<Result<{ stepUpToken: string }>> {
    const c = this.challenges.get(challengeId);
    if (!c || !c.purpose.startsWith('STEP_UP:') || !c.purpose.endsWith(`:${sessionId}`)) {
      return fail('This code is no longer valid. Request a new one.', 'NOT_FOUND');
    }
    const purpose = c.purpose.split(':')[1] as StepUpPurpose;
    const r = this.checkCode(challengeId, code);
    if (!r.ok) return r;
    const stepUpToken = randomId('stp');
    this.stepUpTokens.set(stepUpToken, { purpose, sessionId, expiresAt: Date.now() + STEP_UP_TTL_MS });
    return ok({ stepUpToken });
  }

  consumeStepUp(stepUpToken: string, purpose: StepUpPurpose): boolean {
    const t = this.stepUpTokens.get(stepUpToken);
    this.stepUpTokens.delete(stepUpToken);
    const s = this.stored();
    return Boolean(t && s && t.purpose === purpose && t.sessionId === s.session.sessionId && Date.now() <= t.expiresAt);
  }

  // ---------------------------------------------------------------------------
  // Governance
  // ---------------------------------------------------------------------------

  getAdminQuorum(schoolId: string): AdminQuorumStatus {
    const activeAdmins = this.accounts().filter(
      a => a.status === 'ACTIVE' && a.memberships.some(m => m.role === 'ADMIN' && m.schoolId === schoolId)
    ).length;
    return { activeAdmins, meetsMinimum: activeAdmins >= 2 };
  }

  // ---------------------------------------------------------------------------
  // Staff access management
  // ---------------------------------------------------------------------------

  getAdminPermissions(schoolId: string, accountId: string): AdminPermission[] {
    const a = this.accounts().find(x => x.accountId === accountId && x.status === 'ACTIVE');
    return a?.memberships.find(m => m.role === 'ADMIN' && m.schoolId === schoolId)?.permissions ?? [];
  }

  private requireSecurity(scope: Scope): string | null {
    if (scope.role !== 'ADMIN') return 'Only an Admin manages staff access.';
    if (!this.getAdminPermissions(scope.schoolId, scope.userId).includes('SECURITY')) return 'You do not have the Security permission.';
    return null;
  }

  private accountView(a: MockLeadershipAccount, schoolId: string): StaffAccountView | null {
    const m = a.memberships.find(x => x.schoolId === schoolId && (x.role === 'ADMIN' || x.role === 'PRINCIPAL'));
    if (!m) return null;
    const inv = a.status === 'INVITED'
      ? this.loadInvites().find(i => i.accountId === a.accountId && !i.usedAt && Date.now() <= i.expiresAt)
      : undefined;
    return {
      accountId: a.accountId, name: a.name, email: a.email, role: m.role as 'PRINCIPAL' | 'ADMIN', title: m.title, status: a.status,
      signIn: [...a.idpLinks.map(l => (l.provider === 'MICROSOFT' ? 'Microsoft' : 'Google')), ...(a.password ? ['Password'] : [])],
      permissions: m.permissions ?? [],
      pendingInvite: inv ? { token: inv.token, expiresAt: inv.expiresAt } : undefined
    };
  }

  async listSchoolAccounts(scope: Scope): Promise<Result<StaffAccountView[]>> {
    const denied = this.requireSecurity(scope);
    if (denied) return fail(denied, 'FORBIDDEN');
    return ok(this.accounts().map(a => this.accountView(a, scope.schoolId)).filter((v): v is StaffAccountView => Boolean(v)));
  }

  async inviteAdmin(scope: Scope, req: { name: string; email: string; title: string; permissions: AdminPermission[] }): Promise<Result<{ token: string; expiresAt: number }>> {
    const denied = this.requireSecurity(scope);
    if (denied) return fail(denied, 'FORBIDDEN');
    const email = req.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Enter the school email address.', 'BAD_EMAIL');
    if (req.name.trim().length < 3) return fail('Enter the full name.', 'BAD_NAME');
    if (!req.permissions.length) return fail('Choose at least one permission.', 'NO_PERMISSIONS');
    if (this.accounts().some(a => a.email === email)) return fail('An account with this email already exists.', 'EXISTS');
    const accountId = `ACC-L-${Date.now().toString(36).toUpperCase()}`;
    const account: MockLeadershipAccount = {
      accountId, name: req.name.trim(), email, status: 'INVITED', idpLinks: [],
      memberships: [{ membershipId: `MEM-${accountId}`, role: 'ADMIN', schoolId: scope.schoolId, title: req.title.trim() || 'Administrator', permissions: req.permissions }]
    };
    storage.set(ADDED_ACCOUNTS_KEY, [...storage.get<MockLeadershipAccount[]>(ADDED_ACCOUNTS_KEY, []), account]);
    const token = `inv-${scope.schoolId.toLowerCase()}-${randomDigits(6)}`;
    const now = Date.now();
    storage.set(INVITES_KEY, [...this.loadInvites(), { token, accountId, email, role: 'ADMIN', schoolId: scope.schoolId, invitedBy: scope.userId, createdAt: now, expiresAt: now + INVITE_TTL_MS }]);
    auditService.record({ schoolId: scope.schoolId, action: 'ADMIN_INVITED', actorId: scope.userId, actorRole: scope.role, targetId: accountId, details: `${email} · ${req.permissions.join(', ')}` });
    return ok({ token, expiresAt: now + INVITE_TTL_MS });
  }

  async setAdminStatus(scope: Scope, accountId: string, status: 'ACTIVE' | 'DISABLED', reason: string, stepUpToken: string): Promise<Result<StaffAccountView>> {
    const denied = this.requireSecurity(scope);
    if (denied) return fail(denied, 'FORBIDDEN');
    if (accountId === scope.userId) return fail('You cannot change your own access.', 'SELF');
    const a = this.accounts().find(x => x.accountId === accountId);
    const m = a?.memberships.find(x => x.schoolId === scope.schoolId && x.role === 'ADMIN');
    if (!a || !m) return fail('Admin account not found in this school.', 'NOT_FOUND');
    if (reason.trim().length < 10) return fail('Give a reason (10+ characters).', 'REASON');
    if (status === 'DISABLED') {
      if (a.status !== 'ACTIVE') return fail('This account is not active.', 'STATE');
      if (this.getAdminQuorum(scope.schoolId).activeAdmins - 1 < 2) {
        return fail('Blocked: the school must keep at least two active Admins. Invite and activate another Admin first.', 'QUORUM');
      }
    } else if (a.status !== 'DISABLED') {
      return fail('Only a suspended account can be reactivated.', 'STATE');
    }
    if (!this.consumeStepUp(stepUpToken, 'SENSITIVE_STAFF_ACTION')) return fail('Please confirm with the OTP again.', 'STEP_UP_REQUIRED');
    this.patchAccount(accountId, { status });
    auditService.record({
      schoolId: scope.schoolId, action: status === 'DISABLED' ? 'ADMIN_SUSPENDED' : 'ADMIN_REACTIVATED', actorId: scope.userId, actorRole: scope.role,
      targetId: accountId, details: a.email, reason: reason.trim()
    });
    return ok(this.accountView({ ...a, status }, scope.schoolId)!);
  }

  // ---------------------------------------------------------------------------
  // Teacher sign-in PIN
  // ---------------------------------------------------------------------------

  private myTeacher(scope: Scope): { t: MockTeacher; m: MockStaffMembership } | null {
    if (scope.role !== 'TEACHER') return null;
    const t = MOCK_TEACHERS.find(x => x.staffId === scope.userId);
    const m = t?.memberships.find(x => x.schoolId === scope.schoolId);
    return t && m ? { t, m } : null;
  }

  async getMyPin(scope: Scope): Promise<Result<TeacherPinStatus>> {
    const me = this.myTeacher(scope);
    if (!me) return fail('Only teachers have a sign-in PIN.', 'FORBIDDEN');
    return ok({ ...this.pinStatus(me.m), setupRequired: !this.pinOf(me.m) || this.resettingPin(scope) });
  }

  /** The current session is a 'Forgot PIN' session for this teacher. */
  private resettingPin(scope: Scope): boolean {
    const s = this.stored()?.session;
    return Boolean(s && s.userId === scope.userId && s.authMethods.includes('PIN_RESET'));
  }

  async setMyPin(scope: Scope, pin: string, stepUpToken?: string): Promise<Result<TeacherPinStatus>> {
    const me = this.myTeacher(scope);
    if (!me) return fail('Only teachers have a sign-in PIN.', 'FORBIDDEN');
    const weak = pinWeakness(pin, me.t.mobile);
    if (weak) return fail(weak, 'WEAK_PIN');
    const change = Boolean(this.pinOf(me.m));
    const forgot = this.resettingPin(scope);
    // First PIN or 'Forgot PIN': the session was opened with an SMS code moments ago. A normal change needs a fresh one.
    if (change && !forgot && !this.consumeStepUp(stepUpToken ?? '', 'SENSITIVE_STAFF_ACTION')) return fail('Please confirm with the OTP again.', 'STEP_UP_REQUIRED');
    this.pinChanges.set(me.m.membershipId, { pin, updatedAt: Date.now() });
    this.pinFails.delete(me.m.membershipId);
    if (forgot) {
      const st = this.stored()!;
      st.session.authMethods = [...st.session.authMethods.filter(x => x !== 'PIN_RESET'), 'PIN'];
      storage.set(SESSION_KEY, st);
    }
    auditService.record({ schoolId: scope.schoolId, action: forgot ? 'TEACHER_PIN_RESET_BY_SMS' : change ? 'TEACHER_PIN_CHANGED' : 'TEACHER_PIN_SET', actorId: scope.userId, actorRole: scope.role, targetId: me.m.membershipId, details: me.t.name });
    return ok({ ...this.pinStatus(me.m), setupRequired: false });
  }

  async listTeacherPins(scope: Scope): Promise<Result<TeacherPinRow[]>> {
    const denied = this.requireSecurity(scope);
    if (denied) return fail(denied, 'FORBIDDEN');
    const rows: TeacherPinRow[] = [];
    for (const t of MOCK_TEACHERS) {
      for (const m of t.memberships) {
        if (m.schoolId !== scope.schoolId) continue;
        rows.push({ ...this.pinStatus(m), membershipId: m.membershipId, name: t.name, title: m.title, active: true, mobile: '••••••' + t.mobile.slice(-4) });
      }
    }
    return ok(rows.sort((a, b) => a.name.localeCompare(b.name)));
  }

  async resetTeacherPin(scope: Scope, membershipId: string, reason: string, stepUpToken: string): Promise<Result<TeacherPinStatus>> {
    const denied = this.requireSecurity(scope);
    if (denied) return fail(denied, 'FORBIDDEN');
    const t = MOCK_TEACHERS.find(x => x.memberships.some(m => m.membershipId === membershipId && m.schoolId === scope.schoolId));
    const m = t?.memberships.find(x => x.membershipId === membershipId);
    if (!t || !m) return fail('Teacher not found in this school.', 'FORBIDDEN');
    if (reason.trim().length < 10) return fail('Give a reason (10+ characters).', 'REASON');
    if (!this.pinOf(m)) return fail('This teacher has no PIN.', 'STATE');
    if (!this.consumeStepUp(stepUpToken, 'SENSITIVE_STAFF_ACTION')) return fail('Please confirm with the OTP again.', 'STEP_UP_REQUIRED');
    this.pinChanges.set(membershipId, { pin: null, updatedAt: Date.now() });
    this.pinFails.delete(membershipId);
    const table = storage.get<MockDeviceTable>(MOCK_DEVICES_KEY, {});
    for (const d of Object.values(table)) if (d.membershipId === membershipId) d.revoked = true;
    storage.set(MOCK_DEVICES_KEY, table);
    auditService.record({ schoolId: scope.schoolId, action: 'TEACHER_PIN_RESET', actorId: scope.userId, actorRole: scope.role, targetId: membershipId, details: t.name, reason: reason.trim() });
    return ok(this.pinStatus(m));
  }

  // ---------------------------------------------------------------------------
  // Trusted device: PIN-only sign-in (no SMS)
  // ---------------------------------------------------------------------------

  getTrustedDevice(role: PinRole): TrustedDeviceInfo | null {
    const d = storage.get<StoredDevice | null>(DEVICE_KEY(role), null);
    if (!d || Date.now() > d.expiresAt) return null;
    const { token: _t, ...info } = d;
    return info;
  }

  async trustThisDevice(): Promise<Result<TrustedDeviceInfo>> {
    const s = this.stored()?.session;
    if (!s || (s.role !== 'TEACHER' && s.role !== 'PARENT')) return fail('Only teachers and parents sign in with a PIN.', 'FORBIDDEN');
    if (!s.authMethods.includes('SMS_OTP')) return fail('Sign in with the SMS code on this device first.', 'OTP_REQUIRED');
    const role: PinRole = s.role === 'TEACHER' ? 'TEACHER' : 'PARENT';
    let name: string, mobile: string, membershipId: string, schoolName = '';
    if (role === 'TEACHER') {
      const teacher = MOCK_TEACHERS.find(x => x.staffId === s.userId);
      const m = teacher?.memberships.find(x => x.schoolId === s.schoolId);
      if (!teacher || !m) return fail('Only teachers sign in with a PIN.', 'FORBIDDEN');
      if (!this.pinOf(m) || s.authMethods.includes('PIN_RESET')) return fail('Set your 4-digit sign-in PIN first.', 'PIN_SETUP_REQUIRED');
      name = teacher.name; mobile = teacher.mobile; membershipId = m.membershipId;
      schoolName = MOCK_SCHOOLS[m.schoolId]?.name ?? m.schoolId;
    } else {
      const g = MOCK_GUARDIANS.find(x => x.guardianId === s.userId);
      if (!g) return fail('Only parents sign in with a PIN.', 'FORBIDDEN');
      if (!this.parentPinOf(g.guardianId) || s.authMethods.includes('PIN_RESET')) return fail('Set your 4-digit sign-in PIN first.', 'PIN_SETUP_REQUIRED');
      name = g.name; mobile = g.mobile; membershipId = g.guardianId;
    }
    const token = randomId('dev') + randomId('x');
    const expiresAt = Date.now() + DEVICE_TTL_MS;
    const table = storage.get<MockDeviceTable>(MOCK_DEVICES_KEY, {});
    table[token] = { kind: role, userId: s.userId, membershipId, revoked: false, expiresAt };
    storage.set(MOCK_DEVICES_KEY, table);
    const d: StoredDevice = { token, role, userId: s.userId, name, mobile: '••••••' + mobile.slice(-4), schoolName, expiresAt };
    storage.set(DEVICE_KEY(role), d);
    const { token: _t, ...info } = d;
    return ok(info);
  }

  private deviceRow(role: PinRole) {
    const d = storage.get<StoredDevice | null>(DEVICE_KEY(role), null);
    const row = d ? storage.get<MockDeviceTable>(MOCK_DEVICES_KEY, {})[d.token] : undefined;
    if (!d || !row || row.revoked || row.kind !== role || Date.now() > row.expiresAt) {
      storage.remove(DEVICE_KEY(role));
      return null;
    }
    return row;
  }

  async pinSignIn(pin: string): Promise<Result<AuthSession>> {
    const row = this.deviceRow('TEACHER');
    const teacher = row ? MOCK_TEACHERS.find(x => x.staffId === row.userId) : undefined;
    const m = teacher?.memberships.find(x => x.membershipId === row?.membershipId);
    if (!row || !teacher || !m) return fail('Please sign in with the SMS code on this device.', 'DEVICE_UNKNOWN');
    if (!this.pinOf(m)) {
      storage.remove(DEVICE_KEY('TEACHER'));
      return fail('Your PIN was reset. Sign in with the SMS code to set a new one.', 'PIN_NOT_SET');
    }
    const bad = this.checkPin(m, pin);
    if (bad) return bad;
    return ok(this.persistSession('TEACHER', teacher.staffId, m.schoolId, this.teacherProfile(teacher, m), ['DEVICE', 'PIN'], { channel: 'SMS', destination: teacher.mobile }));
  }

  async parentPinSignIn(pin: string): Promise<Result<ParentVerification>> {
    const row = this.deviceRow('PARENT');
    const g = row ? MOCK_GUARDIANS.find(x => x.guardianId === row.userId) : undefined;
    const found = g ? this.childrenForMobile(g.mobile) : null;
    if (!row || !g || !found) return fail('Please sign in with the SMS code on this device.', 'DEVICE_UNKNOWN');
    const expected = this.parentPinOf(g.guardianId)?.pin ?? null;
    if (!expected) {
      storage.remove(DEVICE_KEY('PARENT'));
      return fail('Your PIN was reset. Sign in with the SMS code to set a new one.', 'PIN_NOT_SET');
    }
    const bad = this.checkPinFor<ParentVerification>('P:' + g.guardianId, expected, pin);
    if (bad) return bad;
    const ticket = this.newTicket({ kind: 'PARENT', mobile: g.mobile, expiresAt: Date.now() + TICKET_TTL_MS, pinDone: true });
    return ok({ ticket, guardianName: found.guardianName, children: found.children, requiresPin: false });
  }

  async forgetTrustedDevice(role: PinRole): Promise<void> {
    const d = storage.get<StoredDevice | null>(DEVICE_KEY(role), null);
    storage.remove(DEVICE_KEY(role));
    if (!d) return;
    const table = storage.get<MockDeviceTable>(MOCK_DEVICES_KEY, {});
    if (table[d.token]) table[d.token].revoked = true;
    storage.set(MOCK_DEVICES_KEY, table);
  }
}
