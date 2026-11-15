/**
 * Prototype / mock identity directory.
 *
 * Imported ONLY by services/mockAuthService.ts. In production this data lives
 * in the backend (guardians, staff_memberships, identity_links, invitations),
 * every row carries school_id, and nothing here is shipped to the browser.
 *
 * Test logins are documented in docs/PROTOTYPE_LOGINS.md.
 */
import { ChildInfo } from '../types/roles';
import { PortalRole } from '../types/session';
import { MOCK_SCHOOL_PROFILES } from './schools';
import type { AdminPermission } from '../types/domain';

export const MOCK_SCHOOLS: Record<string, { name: string }> = Object.fromEntries(
  Object.values(MOCK_SCHOOL_PROFILES).map(p => [p.id, { name: p.name }])
);

const avatar = (seed: string) =>
  `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=d1fae5`;

export const MOCK_STUDENTS: ChildInfo[] = [
  {
    id: 'GVS-2027-0001', name: 'Aarav Sharma', grade: '10', section: 'A', rollNumber: '18',
    schoolId: 'GVS', schoolName: MOCK_SCHOOLS.GVS.name, board: 'TELANGANA_SSC', avatar: avatar('Aarav')
  },
  {
    id: 'GVS-2031-0042', name: 'Ananya Sharma', grade: '6', section: 'B', rollNumber: '07',
    schoolId: 'GVS', schoolName: MOCK_SCHOOLS.GVS.name, board: 'TELANGANA_SSC', avatar: avatar('Ananya')
  },
  {
    id: 'SJM-2033-0105', name: 'Rohan Sharma', grade: '4', section: 'B', rollNumber: '12',
    schoolId: 'SJM', schoolName: MOCK_SCHOOLS.SJM.name, board: 'CBSE', avatar: avatar('Rohan')
  },
  {
    id: 'GVS-2028-0117', name: 'Kavya Reddy', grade: '9', section: 'A', rollNumber: '03',
    schoolId: 'GVS', schoolName: MOCK_SCHOOLS.GVS.name, board: 'TELANGANA_SSC', avatar: avatar('Kavya')
  }
];

/** A child can have several guardian mobiles; a mobile can guard children in several schools. */
export interface MockGuardian {
  guardianId: string;
  name: string;
  mobile: string; // 10 digits, no country code
  relation: 'FATHER' | 'MOTHER' | 'GUARDIAN';
  studentIds: string[];
}

export const MOCK_GUARDIANS: MockGuardian[] = [
  { guardianId: 'GRD-0001', name: 'Rajesh Sharma', mobile: '9876543210', relation: 'FATHER', studentIds: ['GVS-2027-0001', 'GVS-2031-0042', 'SJM-2033-0105'] },
  { guardianId: 'GRD-0002', name: 'Meena Sharma', mobile: '9876543211', relation: 'MOTHER', studentIds: ['GVS-2027-0001', 'GVS-2031-0042', 'SJM-2033-0105'] },
  { guardianId: 'GRD-0003', name: 'Srinivas Reddy', mobile: '9848011111', relation: 'FATHER', studentIds: ['GVS-2028-0117'] }
];

export interface MockStaffMembership {
  membershipId: string;
  role: PortalRole;
  schoolId: string;
  title: string;
  classTeacherOf?: string;
  department?: string;
  /** Prototype / mock PIN. Production stores only a salted hash server-side. */
  pin?: string;
  /** Admin only: what this Admin may operate. Production: token claims checked server-side. */
  permissions?: AdminPermission[];
}

/** Teachers sign in with mobile + OTP. A teacher teaches in ONE school (one membership). */
export interface MockTeacher {
  staffId: string;
  name: string;
  mobile: string;
  memberships: MockStaffMembership[];
}

export const MOCK_TEACHERS: MockTeacher[] = [
  {
    staffId: 'STF-T-0001', name: 'Sarah Jenkins', mobile: '9848012345',
    memberships: [
      { membershipId: 'MEM-T-0001', role: 'TEACHER', schoolId: 'GVS', title: 'Class Teacher 10-A · Physical Science', classTeacherOf: 'Class 10-A', department: 'Physical Science' }
    ]
  },
  {
    staffId: 'STF-T-0101', name: 'J. Mary', mobile: '9848033333',
    memberships: [
      { membershipId: 'MEM-T-0101', role: 'TEACHER', schoolId: 'SJM', title: 'Class Teacher 4-B · English, Mathematics', classTeacherOf: 'Class 4-B', department: 'English' }
    ]
  },
  {
    staffId: 'STF-T-0002', name: 'Raghavan Nair', mobile: '9848022222',
    memberships: [
      { membershipId: 'MEM-T-0003', role: 'TEACHER', schoolId: 'GVS', title: 'Class Teacher 10-B · Mathematics', classTeacherOf: 'Class 10-B', department: 'Mathematics', pin: '2580' }
    ]
  }
];

/**
 * Principal / Admin accounts use the SCHOOL'S OWN email. FutureSchool does not issue mailboxes.
 * Identity-provider links are keyed by (provider, subject) — the IdP's immutable oid/sub —
 * never by the email string the IdP happens to return.
 */
export interface MockLeadershipAccount {
  accountId: string;
  name: string;
  email: string;
  status: 'ACTIVE' | 'INVITED' | 'DISABLED';
  /** Prototype / mock password. Production: argon2/bcrypt hash on the server only. */
  password?: string;
  idpLinks: { provider: 'MICROSOFT' | 'GOOGLE'; subject: string }[];
  memberships: MockStaffMembership[];
}

export const MOCK_LEADERSHIP: MockLeadershipAccount[] = [
  {
    accountId: 'ACC-L-0001', name: 'Dr. Shashi Shekhar', email: 'principal@greenwoodvalley.edu.in', status: 'ACTIVE',
    password: 'Greenwood@2026',
    idpLinks: [{ provider: 'MICROSOFT', subject: 'ms-oid-7f3a2c19-0001' }],
    memberships: [{ membershipId: 'MEM-L-0001', role: 'PRINCIPAL', schoolId: 'GVS', title: 'Principal' }]
  },
  {
    accountId: 'ACC-L-0002', name: 'S. Sundaram', email: 'admin@greenwoodvalley.edu.in', status: 'ACTIVE',
    password: 'Greenwood@2026',
    idpLinks: [{ provider: 'GOOGLE', subject: 'g-sub-104882913370001' }],
    memberships: [{ membershipId: 'MEM-L-0002', role: 'ADMIN', schoolId: 'GVS', title: 'Administrator · Finance & Admissions', permissions: ['FINANCE', 'ADMISSIONS', 'SECURITY', 'REPORTS'] }]
  },
  {
    accountId: 'ACC-L-0003', name: 'Priya Narayanan', email: 'office@greenwoodvalley.edu.in', status: 'ACTIVE',
    password: 'Greenwood@2026',
    idpLinks: [],
    memberships: [{ membershipId: 'MEM-L-0003', role: 'ADMIN', schoolId: 'GVS', title: 'Administrator · Operations', permissions: ['ACADEMIC_OPS', 'TRANSPORT', 'COMPLAINTS', 'REPORTS'] }]
  },
  {
    accountId: 'ACC-L-0004', name: 'Fr. Thomas Mathew', email: 'principal@stjudemodel.edu.in', status: 'ACTIVE',
    password: 'StJude@2026',
    idpLinks: [{ provider: 'GOOGLE', subject: 'g-sub-209331875520004' }],
    memberships: [{ membershipId: 'MEM-L-0004', role: 'PRINCIPAL', schoolId: 'SJM', title: 'Principal' }]
  },
  {
    accountId: 'ACC-L-0005', name: 'Invited Administrator', email: 'accounts@stjudemodel.edu.in', status: 'INVITED',
    idpLinks: [],
    memberships: [{ membershipId: 'MEM-L-0005', role: 'ADMIN', schoolId: 'SJM', title: 'Administrator · Accounts', permissions: ['FINANCE', 'ADMISSIONS', 'ACADEMIC_OPS', 'TRANSPORT', 'COMPLAINTS', 'SECURITY', 'REPORTS'] }]
  }
];

/**
 * What the mock Microsoft / Google tenant would return for a given mailbox.
 * Note office@greenwoodvalley has a Google identity that is NOT linked to the
 * FutureSchool account, so SSO is refused for it (password + email OTP still works).
 */
export const MOCK_IDP_IDENTITIES: { provider: 'MICROSOFT' | 'GOOGLE'; email: string; subject: string }[] = [
  { provider: 'MICROSOFT', email: 'principal@greenwoodvalley.edu.in', subject: 'ms-oid-7f3a2c19-0001' },
  { provider: 'GOOGLE', email: 'admin@greenwoodvalley.edu.in', subject: 'g-sub-104882913370001' },
  { provider: 'GOOGLE', email: 'office@greenwoodvalley.edu.in', subject: 'g-sub-555000111220003' },
  { provider: 'GOOGLE', email: 'principal@stjudemodel.edu.in', subject: 'g-sub-209331875520004' },
  { provider: 'GOOGLE', email: 'accounts@stjudemodel.edu.in', subject: 'g-sub-318772640090005' }
];

export interface MockInvitation {
  token: string;
  accountId: string;
  email: string;
  role: 'PRINCIPAL' | 'ADMIN';
  schoolId: string;
  invitedBy: string;
  createdAt: number;
  expiresAt: number;
  usedAt?: number;
}

const HOURS_48 = 48 * 60 * 60 * 1000;

export function seedInvitations(now: number): MockInvitation[] {
  return [
    {
      token: 'inv-sjm-accounts-7Q4K2',
      accountId: 'ACC-L-0005',
      email: 'accounts@stjudemodel.edu.in',
      role: 'ADMIN',
      schoolId: 'SJM',
      invitedBy: 'ACC-L-0004',
      createdAt: now,
      expiresAt: now + HOURS_48
    }
  ];
}
