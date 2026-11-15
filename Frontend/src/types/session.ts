import { ChildInfo, UserProfile } from './roles';

export type PortalRole = 'PARENT' | 'TEACHER' | 'PRINCIPAL' | 'ADMIN';

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string; attemptsRemaining?: number };

export type OtpChannel = 'SMS' | 'EMAIL';

/** What the client is allowed to know about an OTP challenge. Never the code. */
export interface OtpChallenge {
  challengeId: string;
  channel: OtpChannel;
  maskedDestination: string;
  expiresAt: number;
  resendAvailableAt: number;
  attemptsRemaining: number;
  /** Only the mock implementation fills this. Always labelled "Prototype / mock". */
  mockHint?: string;
}

/** A role + school pair the verified identity can open a session for. */
export interface MembershipOption {
  membershipId: string;
  role: PortalRole;
  schoolId: string;
  schoolName: string;
  title: string;
  requiresPin: boolean;
}

export interface ParentVerification {
  ticket: string;
  guardianName: string;
  children: ChildInfo[];
  /** The parent has a PIN, so it is asked after choosing the child (not after a PIN-only sign-in). */
  requiresPin?: boolean;
}

export interface StaffVerification {
  ticket: string;
  displayName: string;
  memberships: MembershipOption[];
}

export interface StaffFirstFactor {
  ticket: string;
  secondFactor: OtpChallenge;
}

export interface InvitationView {
  token: string;
  email: string;
  role: 'PRINCIPAL' | 'ADMIN';
  schoolId: string;
  schoolName: string;
  expiresAt: number;
}

/** DEVICE = a trusted device (PIN-only sign-in). PIN_RESET = 'Forgot PIN' session that can only set a new PIN. */
export type AuthMethod = 'SMS_OTP' | 'EMAIL_OTP' | 'PASSWORD' | 'IDP_MICROSOFT' | 'IDP_GOOGLE' | 'PIN' | 'DEVICE' | 'PIN_RESET';

/**
 * A session is scoped to exactly ONE role + ONE school (+ ONE student for parents).
 * In production this is an opaque server session / signed token; the client
 * only holds the handle and a display copy of the profile.
 */
export interface AuthSession {
  sessionId: string;
  userId: string;
  role: PortalRole;
  schoolId: string;
  studentId?: string;
  authMethods: AuthMethod[];
  issuedAt: number;
  expiresAt: number;
  accessToken: string;
  profile: UserProfile;
}

export type StepUpPurpose = 'PAYMENT' | 'PICKUP_AUTHORIZATION' | 'SENSITIVE_STAFF_ACTION' | 'PIN_CHANGE';
