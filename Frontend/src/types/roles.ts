export type UserRole = 
  | 'STUDENT' 
  | 'PARENT' 
  | 'TEACHER' 
  | 'PRINCIPAL' 
  | 'ADMIN' 
  | 'PLATFORM_ADMIN';

export type AdminPermission = 
  | 'ADMISSIONS'
  | 'FINANCE'
  | 'ACADEMIC_OPERATIONS'
  | 'TRANSPORT'
  | 'SECURITY'
  | 'REPORTS';

export type AdminRoleProfile = 
  | 'FULL_ADMIN'
  | 'ADMISSIONS_ADMIN'
  | 'FINANCE_ADMIN'
  | 'TRANSPORT_ADMIN'
  | 'SECURITY_ADMIN';

export type WorkflowStatus = 
  | 'DRAFT'
  | 'PENDING'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'RETURNED'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'OVERDUE'
  | 'BLOCKED'
  | 'PUBLISHED'
  | 'RESOLVED'
  | 'EXECUTED';

export interface ChildInfo {
  id: string;            // e.g. 'GVS-2027-0001'
  name: string;          // e.g. 'Aarav Sharma'
  grade: string;         // e.g. '10'
  section: string;       // e.g. 'A'
  rollNumber: string;    // e.g. '18'
  schoolId: string;      // e.g. 'GVS'
  schoolName: string;    // e.g. 'Greenwood Valley High School'
  board: string;         // e.g. 'Telangana State SSC'
  avatar: string;
}

export interface UserProfile {
  id: string;             // e.g. GVS-2027-0001, TCH0001, PRN0001, ADM0001, PLA0001
  name: string;
  email: string;
  role: UserRole;
  avatar: string;
  roleLabel: string;
  tenantId?: string;      // null or undefined for PLATFORM_ADMIN (cross-tenant)
  schoolCode?: string;
  schoolName?: string;
  department?: string;
  studentId?: string;
  studentName?: string;
  grade?: string;
  section?: string;
  rollNumber?: string;     // For Student and Parent
  classTeacherOf?: string; // For Teacher (e.g. "Grade 10-A")
  permissions?: AdminPermission[];
  requiresMfa?: boolean;
  activeChild?: ChildInfo;
  linkedChildren?: ChildInfo[];
}

export interface NavItem {
  id: string;
  label: string;
  path: string;
  iconName: string;
  badge?: string | number;
  badgeColor?: 'teal' | 'orange' | 'rose' | 'slate';
  category?: string;
  requiredPermission?: AdminPermission;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}
