/**
 * ApiAuthService: AuthService backed by the FutureSchool backend (/api/auth/*).
 *
 * Enabled with VITE_AUTH_BACKEND=api (see .env.example). Every check (OTP validity,
 * attempt limits, tickets, sessions, roles, which child / school) is done by the server.
 * The browser only stores the session handle + display profile, through the storage adapter.
 *
 * Microsoft/Google sign-in: the server runs the OIDC code flow (PKCE); the buttons appear only
 * for providers whose keys are configured (GET /api/auth/idp/providers).
 * Step-up tokens come from the server; the still-mock data services check them locally
 * until their APIs move to the backend, which will consume them server-side.
 */
import type { AdminQuorumStatus, AuthService, IdentityProvider, PinRole, StaffAccountView, TeacherPinRow, TeacherPinStatus, TrustedDeviceInfo } from './authService';
import type { Scope } from '../hooks/useScope';
import type { AdminPermission } from '../types/domain';
import {
  AuthSession,
  InvitationView,
  OtpChallenge,
  ParentVerification,
  Result,
  StaffFirstFactor,
  StaffVerification,
  StepUpPurpose
} from '../types/session';
import { storage, storageKeys } from './storage';

const SESSION_KEY = storageKeys.auth('session');
/** The trusted-device token lives only on this device (the server keeps a hash). Kept across sign-out. One per role. */
const DEVICE_KEY = (role: PinRole) => storageKeys.device(role === 'TEACHER' ? 'teacherPinDevice' : 'parentPinDevice');

interface StoredDevice extends TrustedDeviceInfo {
  token: string;
}

interface ChallengeDto {
  challengeId: string;
  channel: 'SMS' | 'EMAIL';
  maskedDestination: string;
  expiresAt: number;
  resendAvailableAt: number;
  attemptsRemaining: number;
  devCode?: string | null;
}

interface SessionDto {
  sessionId: string;
  userId: string;
  role: AuthSession['role'];
  schoolId: string;
  studentId?: string | null;
  authMethods: AuthSession['authMethods'];
  issuedAt: number;
  expiresAt: number;
  accessToken: string;
  profile: AuthSession['profile'];
  adminPermissions: AdminPermission[];
  adminQuorum: AdminQuorumStatus;
}

interface Stored {
  session: AuthSession;
  adminPermissions: AdminPermission[];
  adminQuorum: AdminQuorumStatus;
}

const fail = <T,>(error: string, code: string): Result<T> => ({ ok: false, error, code });

function toChallenge(c: ChallengeDto): OtpChallenge {
  return {
    challengeId: c.challengeId,
    channel: c.channel,
    maskedDestination: c.maskedDestination,
    expiresAt: c.expiresAt,
    resendAvailableAt: c.resendAvailableAt > 1e15 ? Number.POSITIVE_INFINITY : c.resendAvailableAt,
    attemptsRemaining: c.attemptsRemaining,
    devCode: c.devCode ?? undefined,
    // Staging / development server only (app.otp.dev-reveal=true). Production never returns the code.
    mockHint: c.devCode ? `Staging OTP (DB): ${c.devCode}` : undefined
  };
}

export class ApiAuthService implements AuthService {
  readonly isMock = false;
  private stepUps = new Map<string, { purpose: StepUpPurpose; sessionId: string; expiresAt: number }>();

  constructor(private readonly baseUrl: string) {}

  // ------------------------------------------------------------------ transport

  private async call<T>(path: string, body: unknown = {}, withAuth = false): Promise<Result<T>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (withAuth) {
      const t = this.getAccessToken();
      if (!t) return fail('Your session has ended. Please sign in again.', 'NO_SESSION');
      headers.Authorization = `Bearer ${t}`;
    }
    try {
      const res = await fetch(`${this.baseUrl}/api/auth${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (!res.ok) {
        // A 401 with no code means the server no longer accepts the session (expired, signed out,
        // suspended). A 401 with a code is an answer about this step, e.g. a wrong PIN or OTP while
        // confirming a payment: the session stays.
        if (res.status === 401 && withAuth && !data.code) storage.remove(SESSION_KEY);
        return { ok: false, error: data.error ?? 'Something went wrong. Please try again.', code: data.code ?? String(res.status), attemptsRemaining: data.attemptsRemaining };
      }
      return { ok: true, data: data as T };
    } catch {
      return fail('Cannot reach the FutureSchool server. Check your connection and try again.', 'NETWORK');
    }
  }

  private async challengeCall(path: string, body: unknown, withAuth = false): Promise<Result<OtpChallenge>> {
    const r = await this.call<ChallengeDto>(path, body, withAuth);
    return r.ok ? { ok: true, data: toChallenge(r.data) } : r;
  }

  private async sessionCall(path: string, body: unknown, withAuth = false): Promise<Result<AuthSession>> {
    const r = await this.call<SessionDto>(path, body, withAuth);
    if (!r.ok) return r;
    const d = r.data;
    const session: AuthSession = {
      sessionId: d.sessionId,
      userId: d.userId,
      role: d.role,
      schoolId: d.schoolId,
      studentId: d.studentId ?? undefined,
      authMethods: d.authMethods,
      issuedAt: d.issuedAt,
      expiresAt: d.expiresAt,
      accessToken: d.accessToken,
      profile: d.profile
    };
    storage.set<Stored>(SESSION_KEY, { session, adminPermissions: d.adminPermissions ?? [], adminQuorum: d.adminQuorum });
    return { ok: true, data: session };
  }

  private stored(): Stored | null {
    const s = storage.get<Stored | null>(SESSION_KEY, null);
    // A mock-shaped session (from before the switch) has no adminQuorum: ignore it.
    if (!s || !s.session || !s.adminQuorum || Date.now() > s.session.expiresAt) {
      if (s) storage.remove(SESSION_KEY);
      return null;
    }
    return s;
  }

  // ------------------------------------------------------------------ parent & teacher

  requestMobileOtp(mobile: string, purpose: 'PARENT_LOGIN' | 'TEACHER_LOGIN') {
    return this.challengeCall('/otp/request', { mobile, purpose });
  }

  resendOtp(challengeId: string) {
    return this.challengeCall('/otp/resend', { challengeId });
  }

  verifyParentOtp(challengeId: string, code: string) {
    return this.call<ParentVerification>('/parent/verify', { challengeId, code });
  }

  startParentSession(ticket: string, studentId: string, pin?: string, forgotPin?: boolean) {
    const body: Record<string, unknown> = { ticket, studentId };
    if (pin) body.pin = pin;
    if (forgotPin) body.forgotPin = true;
    return this.sessionCall('/parent/session', body);
  }

  verifyTeacherOtp(challengeId: string, code: string) {
    return this.call<StaffVerification>('/teacher/verify', { challengeId, code });
  }

  startTeacherSession(ticket: string, membershipId: string, pin?: string, forgotPin?: boolean) {
    const body: Record<string, unknown> = { ticket, membershipId };
    if (pin) body.pin = pin;
    if (forgotPin) body.forgotPin = true;
    return this.sessionCall('/teacher/session', body);
  }

  // ------------------------------------------------------------------ trusted device (PIN-only sign-in)

  getTrustedDevice(role: PinRole): TrustedDeviceInfo | null {
    const d = storage.get<StoredDevice | null>(DEVICE_KEY(role), null);
    if (!d || Date.now() > d.expiresAt) return null;
    const { token: _t, ...info } = d;
    return info;
  }

  async trustThisDevice(): Promise<Result<TrustedDeviceInfo>> {
    const s = this.stored()?.session;
    if (!s || (s.role !== 'TEACHER' && s.role !== 'PARENT')) return fail('Only teachers and parents sign in with a PIN.', 'FORBIDDEN');
    const role: PinRole = s.role === 'TEACHER' ? 'TEACHER' : 'PARENT';
    const label = typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 120) : undefined;
    const r = await this.call<{ deviceToken: string; expiresAt: number; name: string; mobile: string }>(
      role === 'TEACHER' ? '/teacher/device' : '/parent/device', { label }, true);
    if (!r.ok) return r;
    const d: StoredDevice = {
      token: r.data.deviceToken, role, userId: s.userId, name: r.data.name, mobile: r.data.mobile,
      // A parent's children can be in several schools: show the school only for teachers.
      schoolName: role === 'TEACHER' ? s.profile.schoolName ?? '' : '', expiresAt: r.data.expiresAt
    };
    storage.set(DEVICE_KEY(role), d);
    const { token: _t, ...info } = d;
    return { ok: true, data: info };
  }

  private dropDeviceIfGone(role: PinRole, code?: string) {
    if (code === 'DEVICE_UNKNOWN' || code === 'PIN_NOT_SET' || code === 'NOT_LINKED' || code === 'NO_LINKS') storage.remove(DEVICE_KEY(role));
  }

  async pinSignIn(pin: string): Promise<Result<AuthSession>> {
    const d = storage.get<StoredDevice | null>(DEVICE_KEY('TEACHER'), null);
    if (!d) return fail('Please sign in with the SMS code on this device.', 'DEVICE_UNKNOWN');
    const r = await this.sessionCall('/teacher/pin-login', { deviceToken: d.token, pin });
    if (!r.ok) this.dropDeviceIfGone('TEACHER', r.code);
    return r;
  }

  async parentPinSignIn(pin: string): Promise<Result<ParentVerification>> {
    const d = storage.get<StoredDevice | null>(DEVICE_KEY('PARENT'), null);
    if (!d) return fail('Please sign in with the SMS code on this device.', 'DEVICE_UNKNOWN');
    const r = await this.call<ParentVerification>('/parent/pin-login', { deviceToken: d.token, pin });
    if (!r.ok) this.dropDeviceIfGone('PARENT', r.code);
    return r;
  }

  async forgetTrustedDevice(role: PinRole): Promise<void> {
    const d = storage.get<StoredDevice | null>(DEVICE_KEY(role), null);
    storage.remove(DEVICE_KEY(role));
    if (d) await this.call('/teacher/device/forget', { deviceToken: d.token });
  }

  getParentPin(_scope: Scope) {
    return this.raw<TeacherPinStatus>('GET', '/api/parent/pin');
  }

  setParentPin(_scope: Scope, pin: string, stepUpToken?: string) {
    return this.raw<TeacherPinStatus>('POST', '/api/parent/pin', stepUpToken ? { pin, stepUpToken } : { pin });
  }

  // ------------------------------------------------------------------ principal & admin

  /** Any server path, with or without the session token (used outside /api/auth/*). */
  private async raw<T>(method: 'GET' | 'POST', path: string, body?: unknown, withAuth = true): Promise<Result<T>> {
    const headers: Record<string, string> = withAuth ? this.authHeader() : {};
    if (withAuth && !headers.Authorization) return fail('Your session has ended. Please sign in again.', 'NO_SESSION');
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    try {
      const res = await fetch(`${this.baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (!res.ok) {
        if (res.status === 401 && withAuth && !data?.code) {
          storage.remove(SESSION_KEY);
          if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('futureschool:unauthorized'));
        }
        return { ok: false, error: data?.error ?? 'Something went wrong. Please try again.', code: data?.code ?? String(res.status) };
      }
      return { ok: true, data: data as T };
    } catch {
      return fail('Cannot reach the FutureSchool server. Check your connection and try again.', 'NETWORK');
    }
  }

  getInvitation(token: string): Promise<Result<InvitationView>> {
    return this.raw<InvitationView>('GET', `/api/auth/invitations/${encodeURIComponent(token)}`, undefined, false);
  }

  async beginIdpSignIn(provider: IdentityProvider, email: string, inviteToken?: string): Promise<Result<StaffFirstFactor>> {
    const r = await this.call<{ authorizeUrl: string }>('/idp/start', { provider, email, inviteToken: inviteToken ?? null });
    if (!r.ok) return r;
    // The provider sends the browser back to /login/idp-callback (IdpCallback), which finishes the sign-in.
    window.location.assign(r.data.authorizeUrl);
    return fail(`Opening ${provider === 'MICROSOFT' ? 'Microsoft' : 'Google'}...`, 'REDIRECTING');
  }

  completeIdpSignIn(state: string, code: string) {
    return this.call<{ ticket: string; secondFactor: ChallengeDto }>('/idp/complete', { state, code })
      .then(r => (r.ok ? { ok: true as const, data: { ticket: r.data.ticket, secondFactor: toChallenge(r.data.secondFactor) } } : r));
  }

  async getIdpProviders(): Promise<IdentityProvider[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/auth/idp/providers`);
      if (!res.ok) return [];
      const d = await res.json();
      return Array.isArray(d.providers) ? d.providers.filter((p: string) => p === 'MICROSOFT' || p === 'GOOGLE') : [];
    } catch {
      return [];
    }
  }

  async beginPasswordSignIn(email: string, password: string, inviteToken?: string): Promise<Result<StaffFirstFactor>> {
    // With an invitation: choose a password; it takes effect only after the email OTP.
    const r = inviteToken
      ? await this.call<{ ticket: string; secondFactor: ChallengeDto }>(`/invitations/${encodeURIComponent(inviteToken)}/accept`, { email, password })
      : await this.call<{ ticket: string; secondFactor: ChallengeDto }>('/staff/password', { email, password });
    return r.ok ? { ok: true, data: { ticket: r.data.ticket, secondFactor: toChallenge(r.data.secondFactor) } } : r;
  }

  completeStaffSecondFactor(ticket: string, challengeId: string, code: string) {
    return this.call<StaffVerification>('/staff/verify', { ticket, challengeId, code });
  }

  startStaffSession(ticket: string, membershipId: string) {
    return this.sessionCall('/staff/session', { ticket, membershipId });
  }

  // ------------------------------------------------------------------ session

  restoreSession(): AuthSession | null {
    return this.stored()?.session ?? null;
  }

  async switchChild(sessionId: string, studentId: string): Promise<Result<AuthSession>> {
    if (this.stored()?.session.sessionId !== sessionId) return fail('Your session has ended. Please sign in again.', 'NO_SESSION');
    return this.sessionCall('/parent/switch', { studentId }, true);
  }

  logout(): void {
    const token = this.getAccessToken();
    storage.remove(SESSION_KEY);
    this.stepUps.clear();
    if (token) {
      // Ends the server session; the local copy is already gone even if this fails.
      fetch(`${this.baseUrl}/api/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined);
    }
  }

  getAccessToken(): string | null {
    return this.stored()?.session.accessToken ?? null;
  }

  authHeader(): Record<string, string> {
    const t = this.getAccessToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
  }

  // ------------------------------------------------------------------ step-up

  async requestStepUp(sessionId: string, purpose: StepUpPurpose): Promise<Result<OtpChallenge>> {
    if (this.stored()?.session.sessionId !== sessionId) return fail('Your session has ended. Please sign in again.', 'NO_SESSION');
    return this.challengeCall('/step-up/request', { purpose }, true);
  }

  async verifyStepUp(sessionId: string, challengeId: string, code: string): Promise<Result<{ stepUpToken: string }>> {
    const r = await this.call<{ stepUpToken: string; purpose: StepUpPurpose; expiresAt: number }>('/step-up/verify', { challengeId, code }, true);
    if (!r.ok) return r;
    this.stepUps.set(r.data.stepUpToken, { purpose: r.data.purpose, sessionId, expiresAt: r.data.expiresAt });
    return { ok: true, data: { stepUpToken: r.data.stepUpToken } };
  }

  consumeStepUp(stepUpToken: string, purpose: StepUpPurpose): boolean {
    const t = this.stepUps.get(stepUpToken);
    const s = this.stored();
    if (!t || !s || t.sessionId !== s.session.sessionId || Date.now() > t.expiresAt || t.purpose !== purpose) return false;
    this.stepUps.delete(stepUpToken);
    return true;
  }

  // ------------------------------------------------------------------ governance & staff access

  getAdminQuorum(schoolId: string): AdminQuorumStatus {
    const s = this.stored();
    return s && s.session.schoolId === schoolId ? s.adminQuorum : { activeAdmins: 0, meetsMinimum: true };
  }

  getAdminPermissions(schoolId: string, accountId: string): AdminPermission[] {
    const s = this.stored();
    return s && s.session.schoolId === schoolId && s.session.userId === accountId && s.session.role === 'ADMIN' ? s.adminPermissions : [];
  }

  listSchoolAccounts(_scope: Scope): Promise<Result<StaffAccountView[]>> {
    return this.raw<StaffAccountView[]>('GET', '/api/office/staff');
  }

  inviteAdmin(_scope: Scope, req: { name: string; email: string; title: string; permissions: AdminPermission[]; role?: 'PRINCIPAL' | 'ADMIN' }) {
    return this.raw<{ token: string; expiresAt: number }>('POST', '/api/office/staff/invite', req);
  }

  setAdminStatus(_scope: Scope, accountId: string, status: 'ACTIVE' | 'DISABLED', reason: string, stepUpToken: string) {
    return this.raw<StaffAccountView>('POST', `/api/office/staff/${encodeURIComponent(accountId)}/status`, { status, reason, stepUpToken });
  }

  verifyStepUpWithPin(sessionId: string, purpose: StepUpPurpose, pin: string) {
    if (this.stored()?.session.sessionId !== sessionId) return Promise.resolve(fail<{ stepUpToken: string }>('Your session has ended. Please sign in again.', 'NO_SESSION'));
    return this.call<{ stepUpToken: string; purpose: StepUpPurpose; expiresAt: number }>('/step-up/pin', { purpose, pin }, true).then(r => {
      if (!r.ok) return r;
      this.stepUps.set(r.data.stepUpToken, { purpose: r.data.purpose, sessionId, expiresAt: r.data.expiresAt });
      return { ok: true as const, data: { stepUpToken: r.data.stepUpToken } };
    });
  }

  // ------------------------------------------------------------------ teacher sign-in PIN

  getMyPin(_scope: Scope) {
    return this.raw<TeacherPinStatus>('GET', '/api/staff/pin');
  }

  setMyPin(_scope: Scope, pin: string, stepUpToken?: string) {
    return this.raw<TeacherPinStatus>('POST', '/api/staff/pin', stepUpToken ? { pin, stepUpToken } : { pin });
  }

  listTeacherPins(_scope: Scope) {
    return this.raw<TeacherPinRow[]>('GET', '/api/office/teacher-pins');
  }

  resetTeacherPin(_scope: Scope, membershipId: string, reason: string, stepUpToken: string) {
    return this.raw<TeacherPinStatus>('POST', `/api/office/teacher-pins/${encodeURIComponent(membershipId)}/reset`, { reason, stepUpToken });
  }
}
