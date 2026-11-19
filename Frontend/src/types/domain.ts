/**
 * FutureSchool domain models (frontend view of backend entities).
 * Every school-owned record carries schoolId. Money is in whole rupees.
 */

export type ISODate = string; // 'YYYY-MM-DD'
export type ISODateTime = string;

export interface ClassSection {
  id: string; // e.g. 'GVS-10-A'
  schoolId: string;
  grade: number;
  section: string;
  classTeacherStaffId: string;
  classTeacherName: string;
  /** subject -> teacher (assigned subject teachers; parents may message only these + class teacher) */
  subjectTeachers: { subject: string; staffId: string; name: string }[];
}

export interface StudentRecord {
  id: string;
  schoolId: string;
  classSectionId: string;
  name: string;
  grade: number;
  section: string;
  rollNumber: string;
  admissionNo: string;
  transportRouteId?: string;
  transportStop?: string;
  status: 'ACTIVE' | 'TRANSFERRED' | 'EXITED';
}

export interface TimetableSlot {
  day: 1 | 2 | 3 | 4 | 5 | 6; // Mon..Sat
  period: number;
  start: string; // 'HH:MM'
  end: string;
  subject: string;
  teacherName: string;
}

export type HomeworkStatus = 'PENDING' | 'SUBMITTED' | 'CHECKED';
export interface HomeworkItem {
  id: string;
  schoolId: string;
  classSectionId: string;
  subject: string;
  teacherName: string;
  title: string;
  instructions: string;
  assignedOn: ISODate;
  dueOn: ISODate;
  submissionType: 'NOTEBOOK' | 'WORKSHEET' | 'NONE';
  /** per-student status */
  statusByStudent: Record<string, HomeworkStatus>;
}

export interface Notice {
  id: string;
  schoolId: string;
  /** 'ALL' or list of classSectionIds */
  audience: 'ALL' | string[];
  title: string;
  body: string;
  publishedAt: ISODateTime;
  priority: 'NORMAL' | 'IMPORTANT' | 'EMERGENCY';
}

export interface AttendanceDay {
  date: ISODate;
  /** present / absent / leave / not marked yet */
  morning: 'P' | 'A' | 'L' | '-';
  afternoon: 'P' | 'A' | 'L' | '-';
}

export interface ConsentRequest {
  id: string;
  schoolId: string;
  classSectionIds: string[];
  title: string;
  details: string;
  dueOn: ISODate;
  /** per-student response, attributable to the guardian who responded. Never rewritten by staff. */
  responses: Record<string, { decision: 'GIVEN' | 'DECLINED'; guardianId: string; at: ISODateTime }>;
}

export interface Meeting {
  id: string;
  schoolId: string;
  studentId: string;
  teacherName: string;
  purpose: string;
  at: ISODateTime;
  status: 'REQUESTED' | 'CONFIRMED' | 'RESCHEDULE_PROPOSED' | 'COMPLETED' | 'CANCELLED' | 'REJECTED';
  parentSummary?: string;
}

// ---------------------------------------------------------------------------
// Fees
// ---------------------------------------------------------------------------

export type FeeCategory = 'SCHOOL_FEE' | 'EXAM_FEE' | 'TRANSPORT_FEE' | 'ACTIVITY_FEE' | 'EVENT_FEE' | 'OTHER';

export interface Instalment {
  number: 1 | 2 | 3 | 4;
  label: string; // 'School Opening', 'Before SA-1', ...
  dueOn: ISODate;
}

export interface FeeCharge {
  id: string;
  schoolId: string;
  studentId: string;
  category: FeeCategory;
  instalment: 1 | 2 | 3 | 4;
  label: string;
  amount: number;
  dueOn: ISODate;
  /** Academic year the charge belongs to (server); absent in the prototype mock. */
  academicYearId?: string | null;
}

export interface FeeConcession {
  id: string;
  chargeId: string;
  kind: 'SIBLING' | 'SCHOLARSHIP' | 'STAFF_CHILD' | 'FINANCIAL_SUPPORT' | 'MANAGEMENT' | 'SPECIAL_WAIVER' | 'OTHER';
  amount: number;
  approvedOn: ISODate;
}

export interface PaymentAllocation {
  chargeId: string;
  amount: number;
}

/** A completed payment. Created only after (mock) provider verification. Never edited or deleted. */
export interface Payment {
  id: string;
  schoolId: string;
  studentId: string;
  amount: number;
  method: 'UPI' | 'CARD' | 'NETBANKING' | 'CASH_AT_OFFICE';
  providerRef: string;
  paidAt: ISODateTime;
  paidByGuardianId?: string;
  /** Office cash payments: the Admin who recorded it. */
  recordedByStaffId?: string;
  receiptNo: string;
  allocations: PaymentAllocation[];
  isMock: boolean;
}

/** Refunds are separate records referencing the original payment. */
export interface Refund {
  id: string;
  paymentId: string;
  amount: number;
  reason: string;
  status: 'REQUESTED' | 'APPROVED' | 'PAID' | 'REJECTED';
  createdAt: ISODateTime;
}

export interface FeeLine {
  charge: FeeCharge;
  concession: number;
  paid: number;
  outstanding: number;
  overdue: boolean;
}

export interface FeeSummary {
  /** One entry per instalment per academic year; academicYear is the label, e.g. "2027-28". */
  instalments: (Instalment & { lines: FeeLine[]; outstanding: number; overdue: boolean; academicYearId?: string | null; academicYear?: string | null })[];
  totalCharged: number;
  totalConcession: number;
  totalPaid: number;
  totalOutstanding: number;
  overdueAmount: number;
  nextDue?: { instalment: Instalment; amount: number };
  lateFeeNote?: string;
}

export interface PaymentOrder {
  orderId: string;
  studentId: string;
  amount: number;
  /** allocation preview computed by the "backend"; client cannot change it */
  allocations: PaymentAllocation[];
  expiresAt: number;
  isMock: boolean;
  provider?: 'mock' | 'razorpay';
  razorpayKeyId?: string;
  razorpayOrderId?: string;
  amountPaise?: number;
  currency?: string;
  prefillName?: string;
  prefillContact?: string;
}

// ---------------------------------------------------------------------------
// Exams, hall tickets, results
// ---------------------------------------------------------------------------

export interface ExamWindow {
  id: string;
  schoolId: string;
  name: string; // 'SA-1', 'SA-2', 'Pre-Final'
  startsOn: ISODate;
  grades: number[];
  /** Admin-configured: which fee categories, up to which instalment, must be cleared */
  clearanceRule: { categories: FeeCategory[]; uptoInstalment: 1 | 2 | 3 | 4 };
}

export interface HallTicketRelease {
  examId: string;
  studentId: string;
  releasedBy: string;
  releasedAt: ISODateTime;
  principalOverride?: { reason: string; by: string; at: ISODateTime };
}

export interface HallTicketStatus {
  exam: ExamWindow;
  student: Pick<StudentRecord, 'id' | 'name' | 'rollNumber' | 'grade' | 'section'>;
  feeClearance: 'CLEARED' | 'PENDING';
  pendingReasons: string[];
  release?: HallTicketRelease;
  /** Visible to parent only when cleared AND released (or override). */
  available: boolean;
  hallTicketNo?: string;
  subjects?: Array<{ name: string; date: string; day: string; time: string; room: string }>;
}

export type MarkValue = number | 'AB';

export interface PublishedResult {
  id: string;
  studentId: string;
  examName: string;
  version: number;
  status: 'CURRENT' | 'SUPERSEDED';
  publishedOn: ISODate;
  subjects: { subject: string; internal: MarkValue; external: MarkValue; maxInternal: number; maxExternal: number; passMark: number }[];
  classTeacherRemark?: string;
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export type MessageCategory = 'ACADEMIC_PROGRESS' | 'HOMEWORK' | 'ATTENDANCE' | 'CONDUCT' | 'EXAM_MARKS' | 'GENERAL';

export interface MessageThread {
  id: string;
  schoolId: string;
  studentId: string;
  teacherStaffId: string;
  teacherName: string;
  teacherRole: string; // 'Class Teacher' | 'Mathematics'
  category: MessageCategory;
  subject: string;
  messages: { from: 'PARENT' | 'TEACHER'; author: string; body: string; at: ISODateTime }[];
}

// ---------------------------------------------------------------------------
// Leave, attendance registers
// ---------------------------------------------------------------------------

export interface LeaveRequest {
  id: string;
  schoolId: string;
  studentId: string;
  classSectionId: string;
  fromDate: ISODate;
  toDate: ISODate;
  kind: 'SICK' | 'FAMILY' | 'MEDICAL_APPOINTMENT' | 'OTHER';
  reason: string;
  requestedByGuardianId: string;
  requestedAt: ISODateTime;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
  decision?: { by: string; byName: string; at: ISODateTime; note?: string };
}

export type AttendanceMark = 'P' | 'A' | 'L' | 'LATE';
export type AttendanceSession = 'MORNING' | 'AFTERNOON';

/** One saved register (class + date + session). Corrections append history; nothing is overwritten silently. */
export interface AttendanceRegister {
  id: string; // `${classSectionId}:${date}:${session}`
  schoolId: string;
  classSectionId: string;
  date: ISODate;
  session: AttendanceSession;
  marks: Record<string, AttendanceMark>;
  savedBy: string;
  savedAt: ISODateTime;
  history: { at: ISODateTime; by: string; reason: string; changes: { studentId: string; from: AttendanceMark; to: AttendanceMark }[] }[];
}

// ---------------------------------------------------------------------------
// Marks, report cards
// ---------------------------------------------------------------------------

export interface Assessment {
  id: string;
  schoolId: string;
  name: string; // 'FA-2'
  academicYear: string;
  grades: number[];
  maxInternal: number;
  maxExternal: number;
  /** pass mark as % of the total, per subject; Second Language has its own (configurable) */
  passPercent: number;
  secondLanguagePassPercent: number;
  secondLanguageSubjects: string[];
  status: 'OPEN' | 'CLOSED';
}

export type SheetStatus = 'NOT_STARTED' | 'DRAFT' | 'SUBMITTED' | 'RETURNED' | 'ACCEPTED';

export interface MarksSheet {
  id: string; // `${assessmentId}:${classSectionId}:${subject}`
  schoolId: string;
  assessmentId: string;
  classSectionId: string;
  subject: string;
  teacherStaffId: string;
  status: SheetStatus;
  /** null = not entered yet; 'AB' = absent (never 0) */
  rows: Record<string, { internal: MarkValue | null; external: MarkValue | null }>;
  returnReason?: string;
  log: { at: ISODateTime; by: string; action: 'SAVED' | 'SUBMITTED' | 'RETURNED' | 'ACCEPTED'; note?: string }[];
}

export type ReportCardStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'RETURNED' | 'PUBLISHED';

export interface ReportCard {
  id: string; // `${assessmentId}:${studentId}`
  schoolId: string;
  assessmentId: string;
  classSectionId: string;
  studentId: string;
  subjects: PublishedResult['subjects'];
  classTeacherRemark: string;
  status: ReportCardStatus;
  principalNote?: string;
  log: { at: ISODateTime; by: string; action: string; note?: string }[];
}

// ---------------------------------------------------------------------------
// Governance (Admin draft -> validate -> Principal approve -> re-validate -> Admin execute)
// ---------------------------------------------------------------------------

export type ChangeKind = 'FEE_CONCESSION' | 'REFUND' | 'LATE_FEE_WAIVER' | 'EXAM_SCHEDULE' | 'FEE_STRUCTURE' | 'CLEARANCE_RULE';

export type ChangePayload =
  | { kind: 'FEE_CONCESSION'; studentId: string; chargeIds: string[]; amountPerCharge: number; concessionKind: FeeConcession['kind']; justification: string }
  | { kind: 'REFUND'; paymentId: string; amount: number; reason: string }
  | { kind: 'LATE_FEE_WAIVER'; studentId: string; amount: number; reason: string }
  | { kind: 'EXAM_SCHEDULE'; examId: string; newStartsOn: ISODate; reason: string }
  | { kind: 'FEE_STRUCTURE'; grade: number; instalment: 1 | 2 | 3 | 4; newSchoolFee: number; reason: string }
  | { kind: 'CLEARANCE_RULE'; examId: string; categories: FeeCategory[]; uptoInstalment: 1 | 2 | 3 | 4; reason: string };

export type ChangeStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'RETURNED' | 'REJECTED' | 'APPROVED' | 'EXECUTED' | 'EXECUTION_BLOCKED';

export interface ChangeRequest {
  id: string;
  schoolId: string;
  kind: ChangeKind;
  title: string;
  payload: ChangePayload;
  /** fingerprint of payload; execution requires it to equal approvedHash */
  payloadHash: string;
  approvedHash?: string;
  status: ChangeStatus;
  preparedBy: string;
  preparedByName: string;
  validationIssues: string[];
  history: { at: ISODateTime; by: string; action: string; note?: string }[];
}

// ---------------------------------------------------------------------------
// Published mark corrections (versioned, never overwritten)
// ---------------------------------------------------------------------------

export interface MarkCorrection {
  id: string;
  schoolId: string;
  resultId: string; // the CURRENT PublishedResult being corrected
  studentId: string;
  classSectionId: string;
  examName: string;
  subject: string;
  field: 'internal' | 'external';
  from: MarkValue;
  to: MarkValue;
  reason: string;
  raisedBy: string;
  status: 'RAISED' | 'VERIFIED' | 'APPROVED' | 'REPUBLISHED' | 'REJECTED';
  log: { at: ISODateTime; by: string; action: string; note?: string }[];
}

// ---------------------------------------------------------------------------
// Teacher leave
// ---------------------------------------------------------------------------

export interface TeacherLeave {
  id: string;
  schoolId: string;
  staffId: string;
  staffName: string;
  fromDate: ISODate;
  toDate: ISODate;
  kind: 'CASUAL' | 'SICK' | 'TRAINING' | 'OTHER';
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
  decision?: { by: string; at: ISODateTime; note?: string };
  /** filled later by Admin (substitution) */
  substitution?: { arrangedBy: string; note: string; slots?: SubstitutionSlot[] };
}

// ---------------------------------------------------------------------------
// Admin operations: substitution, complaints, transport
// ---------------------------------------------------------------------------

/** What an Admin membership may operate. Production: claims in the staff token, enforced server-side. */
export type AdminPermission = 'FINANCE' | 'ADMISSIONS' | 'ACADEMIC_OPS' | 'TRANSPORT' | 'COMPLAINTS' | 'SECURITY' | 'REPORTS';

export interface SubstitutionSlot {
  date: ISODate;
  classSectionId: string;
  classLabel: string;
  period: number;
  start: string;
  subject: string;
  substituteStaffId: string;
  substituteName: string;
  arrangedAt: ISODateTime;
}

export type ComplaintCategory = 'ACADEMIC' | 'TRANSPORT' | 'FACILITY' | 'SAFETY' | 'FEES' | 'OTHER';
export type ComplaintStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'REOPENED';

export interface Complaint {
  id: string;
  schoolId: string;
  studentId: string;
  raisedByGuardianId: string;
  raisedByName: string;
  category: ComplaintCategory;
  subject: string;
  description: string;
  status: ComplaintStatus;
  createdAt: ISODateTime;
  /** Safety concerns are always visible to the Principal. */
  principalInformed: boolean;
  log: { at: ISODateTime; by: string; byRole: string; action: string; note?: string }[];
}

export interface TransportRoute {
  id: string; // 'Route 4'
  schoolId: string;
  name: string;
  vehicleNo: string;
  capacity: number;
  stops: { name: string; pickup: string; drop: string }[];
  feePerInstalment: number;
}

export interface TransportRequest {
  id: string;
  schoolId: string;
  studentId: string;
  requestedByGuardianId: string;
  kind: 'NEW' | 'CHANGE' | 'STOP';
  fromRouteId?: string;
  toRouteId?: string;
  stopName?: string;
  reason: string;
  effectiveFrom: ISODate;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
  createdAt: ISODateTime;
  decision?: { by: string; at: ISODateTime; note?: string };
}
