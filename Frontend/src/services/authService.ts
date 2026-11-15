/**
 * FutureSchool - AuthService contract.
 *
 * Components and contexts depend on THIS interface only. The prototype binds it
 * to MockAuthService; production binds it to a REST client where every check
 * (OTP validity, attempt limits, invitation state, IdP token verification,
 * session issuance) happens on the server. The browser never decides whether
 * an OTP, password or payment is valid.
 */
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
import { MockAuthService } from './mockAuthService';
import { ApiAuthService } from './apiAuthService';
import { API_BASE_URL, USE_BACKEND } from '../app/backendConfig';
import type { Scope } from '../hooks/useScope';
import type { AdminPermission } from '../types/domain';

export type IdentityProvider = 'MICROSOFT' | 'GOOGLE';

export interface AdminQuorumStatus {
  activeAdmins: number;
  meetsMinimum: boolean;
}

export interface AuthService {
  /** True when backed by the prototype mock (UI shows "Prototype / mock" labels). */
  readonly isMock: boolean;

  // Parent & Teacher: mobile + OTP
  requestMobileOtp(mobile: string, purpose: 'PARENT_LOGIN' | 'TEACHER_LOGIN'): Promise<Result<OtpChallenge>>;
  resendOtp(challengeId: string): Promise<Result<OtpChallenge>>;
  verifyParentOtp(challengeId: string, code: string): Promise<Result<ParentVerification>>;
  /** Same PIN rules as teachers, on the parent's account: pin after an SMS code when set; forgotPin = set a new one. */
  startParentSession(ticket: string, studentId: string, pin?: string, forgotPin?: boolean): Promise<Result<AuthSession>>;
  verifyTeacherOtp(challengeId: string, code: string): Promise<Result<StaffVerification>>;
  /** forgotPin: skip the PIN; the session can only set a new PIN (the SMS code proves the phone, and it unlocks a locked PIN). */
  startTeacherSession(ticket: string, membershipId: string, pin?: string, forgotPin?: boolean): Promise<Result<AuthSession>>;

  // PIN-only sign-in on a trusted device (no SMS), for teachers and parents. SMS only: first time on a
  // device, a new device, or 'Forgot PIN'.
  /** The device this browser was trusted for, for this kind of user, if any (no secrets shown). */
  getTrustedDevice(role: PinRole): TrustedDeviceInfo | null;
  /** After an SMS sign-in with a PIN set: remember this device for the current session's role. */
  trustThisDevice(): Promise<Result<TrustedDeviceInfo>>;
  /** Teacher: PIN only, on the trusted device. DEVICE_UNKNOWN / PIN_NOT_SET: the record is dropped; sign in with SMS. */
  pinSignIn(pin: string): Promise<Result<AuthSession>>;
  /** Parent: PIN only, on the trusted device. Returns the children and a ticket; then startParentSession (no PIN). */
  parentPinSignIn(pin: string): Promise<Result<ParentVerification>>;
  /** "Not you? Use another number": stop trusting this device. */
  forgetTrustedDevice(role: PinRole): Promise<void>;

  // Parent sign-in PIN (required, on the account: the same for every child and school).
  getParentPin(scope: Scope): Promise<Result<TeacherPinStatus>>;
  /** First PIN or after 'Forgot PIN': no extra SMS. Changing it: a fresh PIN_CHANGE OTP. */
  setParentPin(scope: Scope, pin: string, stepUpToken?: string): Promise<Result<TeacherPinStatus>>;

  // Principal & Admin: school's own email, always two factors
  getInvitation(token: string): Promise<Result<InvitationView>>;
  /** Live server: opens the provider's page (the browser leaves; code REDIRECTING). Prototype: signs in at once. */
  beginIdpSignIn(provider: IdentityProvider, email: string, inviteToken?: string): Promise<Result<StaffFirstFactor>>;
  /** After Microsoft/Google send the browser back to /login/idp-callback with ?state&code. */
  completeIdpSignIn(state: string, code: string): Promise<Result<StaffFirstFactor>>;
  /** Which Microsoft/Google buttons to show. Live server: only providers whose keys are set (none until then). */
  getIdpProviders(): Promise<IdentityProvider[]>;
  beginPasswordSignIn(email: string, password: string, inviteToken?: string): Promise<Result<StaffFirstFactor>>;
  completeStaffSecondFactor(ticket: string, challengeId: string, code: string): Promise<Result<StaffVerification>>;
  startStaffSession(ticket: string, membershipId: string): Promise<Result<AuthSession>>;

  // Session
  restoreSession(): AuthSession | null;
  switchChild(sessionId: string, studentId: string): Promise<Result<AuthSession>>;
  logout(sessionId?: string): void;
  getAccessToken(): string | null;
  /** `{ Authorization: Bearer … }` for the current session, or `{}`. */
  authHeader(): Record<string, string>;

  // Step-up re-verification (payments, pickup authorization, sensitive staff actions)
  requestStepUp(sessionId: string, purpose: StepUpPurpose): Promise<Result<OtpChallenge>>;
  verifyStepUp(sessionId: string, challengeId: string, code: string): Promise<Result<{ stepUpToken: string }>>;
  /** Parent: confirm a PAYMENT or PICKUP_AUTHORIZATION with the PIN instead of an SMS code (no SMS). Same single-use token. */
  verifyStepUpWithPin(sessionId: string, purpose: StepUpPurpose, pin: string): Promise<Result<{ stepUpToken: string }>>;
  /** Single-use: returns true once for a fresh token of the matching purpose. */
  consumeStepUp(stepUpToken: string, purpose: StepUpPurpose): boolean;

  // Governance
  getAdminQuorum(schoolId: string): AdminQuorumStatus;

  // Staff access (Admin with SECURITY permission). Production: server-side, audited.
  /** Permissions of an active Admin membership in a school; empty for other roles. */
  getAdminPermissions(schoolId: string, accountId: string): AdminPermission[];
  listSchoolAccounts(scope: Scope): Promise<Result<StaffAccountView[]>>;
  inviteAdmin(scope: Scope, req: { name: string; email: string; title: string; permissions: AdminPermission[] }): Promise<Result<{ token: string; expiresAt: number }>>;
  /** Suspend / reactivate an Admin. Never deletes. Keeps at least two active Admins. */
  setAdminStatus(scope: Scope, accountId: string, status: 'ACTIVE' | 'DISABLED', reason: string, stepUpToken: string): Promise<Result<StaffAccountView>>;

  // Teacher sign-in PIN (required, asked after the SMS OTP). Only a hash is kept on the server.
  // A teacher without one must set it right after signing in; until then the server refuses
  // everything else (PIN_SETUP_REQUIRED). It cannot be removed.
  getMyPin(scope: Scope): Promise<Result<TeacherPinStatus>>;
  /** First PIN: no extra OTP (the session was just opened with one). Changing it: a fresh SENSITIVE_STAFF_ACTION OTP. Easy PINs are refused. */
  setMyPin(scope: Scope, pin: string, stepUpToken?: string): Promise<Result<TeacherPinStatus>>;
  /** Admin with SECURITY: teachers of this school and their PIN status (never the PIN). */
  listTeacherPins(scope: Scope): Promise<Result<TeacherPinRow[]>>;
  /** Admin with SECURITY: clear a teacher's PIN (e.g. locked); they set a new one at the next sign-in. Reason + fresh OTP; audited. */
  resetTeacherPin(scope: Scope, membershipId: string, reason: string, stepUpToken: string): Promise<Result<TeacherPinStatus>>;
}

export type PinRole = 'TEACHER' | 'PARENT';

export interface TrustedDeviceInfo {
  role: PinRole;
  userId: string;
  name: string;
  /** Masked, e.g. ••••••2345 */
  mobile: string;
  schoolName: string;
  expiresAt: number;
}

export interface TeacherPinStatus {
  /** No PIN yet, or a 'Forgot PIN' session: only the PIN screen is shown. */
  setupRequired?: boolean;
  pinSet: boolean;
  locked: boolean;
  updatedAt: number | null;
}

export interface TeacherPinRow extends TeacherPinStatus {
  membershipId: string;
  name: string;
  title: string;
  active: boolean;
  /** Masked, e.g. ••••••2222 */
  mobile: string;
}

export interface StaffAccountView {
  accountId: string;
  name: string;
  email: string;
  role: 'PRINCIPAL' | 'ADMIN';
  title: string;
  status: 'ACTIVE' | 'INVITED' | 'DISABLED';
  signIn: string[];
  permissions: AdminPermission[];
  pendingInvite?: { token: string; expiresAt: number };
}

/** See app/backendConfig.ts: VITE_BACKEND=api uses the real server, otherwise the prototype mock. */
export const authService: AuthService = USE_BACKEND ? new ApiAuthService(API_BASE_URL) : new MockAuthService();
