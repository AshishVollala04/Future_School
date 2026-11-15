import { WorkflowStatus } from './roles';

export interface LeaveRequestWorkflow {
  id: string;
  studentId: string;
  studentName: string;
  grade: string;
  section: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  reason: string;
  parentName: string;
  status: WorkflowStatus; // PENDING -> APPROVED | REJECTED
  reviewedBy?: string;
  reviewComment?: string;
  appliedDate: string;
}

export interface TeacherLeaveWorkflow {
  id: string;
  teacherId: string;
  teacherName: string;
  subject: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: WorkflowStatus; // PENDING -> APPROVED
  substituteTeacherId?: string;
  substituteTeacherName?: string;
  principalComment?: string;
}

export interface MarksEntryWorkflow {
  id: string;
  classId: string; // "Grade 10-A"
  subject: string;
  teacherId: string;
  teacherName: string;
  status: WorkflowStatus; // DRAFT -> PENDING -> APPROVED -> RETURNED -> PUBLISHED
  isPublishedToStudents: boolean;
  principalApprovalStatus: 'PENDING' | 'APPROVED' | 'RETURNED';
  returnReason?: string;
  studentMarks: {
    studentId: string;
    studentName: string;
    rollNo: number;
    score: number;
    maxScore: number;
    isAbsent: boolean;
  }[];
}

export interface ReportCardCorrectionRequest {
  id: string;
  reportCardId: string;
  studentId: string;
  subjectTeacherId: string;
  subjectTeacherName: string;
  subject: string;
  originalMarks: number;
  proposedMarks: number;
  reason: string;
  classTeacherVerified: boolean;
  classTeacherVerifiedAt?: string;
  principalApproved: boolean;
  principalApprovedAt?: string;
  republished: boolean;
  republishedAt?: string;
  createdAt: string;
}

export interface FeeAdjustment {
  id: string;
  type: 'CONCESSION' | 'WAIVER' | 'SCHOLARSHIP' | 'ADMIN_CORRECTION';
  amount: number;
  reason: string;
  approvedBy: string;
  date: string;
}

export interface FeeRefund {
  id: string;
  originalTransactionId: string;
  amount: number;
  reason: string;
  processedBy: string;
  date: string;
  status: 'COMPLETED';
}

export interface ReportCardWorkflow {
  studentId: string;
  studentName: string;
  grade: string;
  section: string;
  status: WorkflowStatus; // DRAFT -> PENDING -> APPROVED -> RETURNED -> PUBLISHED
  overallPercentage: number;
  conductRemarks: string;
  principalSignature: boolean;
  isPublished: boolean;
  publishedAt?: string;
  version?: number;
  versionStatus?: 'CURRENT' | 'SUPERSEDED' | 'DRAFT';
  correctionState?: 'NONE' | 'RAISED' | 'VERIFIED' | 'APPROVED';
  activeCorrection?: ReportCardCorrectionRequest;
  previousVersionId?: string;
  id?: string;
}

export interface FeePaymentWorkflow {
  studentId: string;
  totalAnnualFee: number;
  paidAmount: number;
  pendingAmount: number;
  hasOutstandingPastDueDate: boolean;
  adjustments?: FeeAdjustment[];
  refunds?: FeeRefund[];
  hallTicketCleared: boolean; // cleared if pending <= 0 or authorized
  transactions: {
    id: string;
    receiptNo: string;
    amount: number;
    date: string;
    method: string;
    status: 'COMPLETED';
    instalment: string;
  }[];
}

export interface HallTicketReleaseWorkflow {
  studentId: string;
  studentName: string;
  grade: string;
  examName: string;
  feeCleared: boolean;
  attendanceQualified: boolean;
  classTeacherReleased: boolean; // released by teacher
  principalOverride: boolean;
  releaseDate?: string;
  hallTicketNumber?: string;
}

export interface TransportChangeWorkflow {
  id: string;
  studentId: string;
  studentName: string;
  currentRoute: string;
  requestedRoute: string;
  reason: string;
  status: WorkflowStatus; // PENDING -> APPROVED
  adminNote?: string;
  appliedDate?: string;
  parentName?: string;
}

export interface ComplaintWorkflow {
  id: string;
  studentId: string;
  parentName: string;
  category: 'ACADEMIC' | 'TRANSPORT' | 'SAFETY' | 'FACILITY' | 'OTHER';
  subject: string;
  description: string;
  status: WorkflowStatus; // PENDING -> ACTIVE -> RESOLVED -> CLOSED
  isEscalatedToPrincipal: boolean;
  responses: {
    author: string;
    role: string;
    message: string;
    timestamp: string;
  }[];
  parentConfirmedResolved: boolean;
}

export interface ConfigApprovalWorkflow {
  id: string;
  title: string;
  type: 'ACADEMIC_CALENDAR' | 'FEE_STRUCTURE' | 'TIMETABLE_VERSION' | 'STAFF_ALLOCATION';
  version: string;
  status: WorkflowStatus; // DRAFT -> PENDING -> APPROVED -> ACTIVE
  submittedByAdmin: string;
  principalSignoff?: string;
  executedByAdmin: boolean;
}
