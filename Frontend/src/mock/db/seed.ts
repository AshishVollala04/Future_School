/**
 * Prototype / mock seed data, ONE DATASET PER SCHOOL. Fictional people and schools.
 * Relative dates (homework, meetings, notices) are computed from "today" so the demo stays fresh.
 * Only services/mock* read this.
 */
import {
  Assessment,
  AttendanceRegister,
  ChangeRequest,
  MarkCorrection,
  TeacherLeave,
  Complaint,
  TransportRoute,
  TransportRequest,
  ClassSection,
  ConsentRequest,
  LeaveRequest,
  MarksSheet,
  ReportCard,
  ExamWindow,
  FeeCharge,
  FeeConcession,
  HallTicketRelease,
  HomeworkItem,
  Instalment,
  Meeting,
  MessageThread,
  Notice,
  Payment,
  PublishedResult,
  Refund,
  StudentRecord,
  TimetableSlot
} from '../../types/domain';
import { addDaysISO, todayISO } from '../../utils/date';

export interface SchoolDb {
  schoolId: string;
  classSections: ClassSection[];
  students: StudentRecord[];
  timetables: Record<string, TimetableSlot[]>; // by classSectionId
  homework: HomeworkItem[];
  notices: Notice[];
  consents: ConsentRequest[];
  meetings: Meeting[];
  instalments: Instalment[];
  charges: FeeCharge[];
  concessions: FeeConcession[];
  payments: Payment[];
  refunds: Refund[];
  lateFeePolicy: string;
  exams: ExamWindow[];
  hallTicketReleases: HallTicketRelease[];
  results: PublishedResult[];
  threads: MessageThread[];
  leaves: LeaveRequest[];
  registers: AttendanceRegister[];
  assessments: Assessment[];
  marksSheets: MarksSheet[];
  reportCards: ReportCard[];
  changeRequests: ChangeRequest[];
  corrections: MarkCorrection[];
  teacherLeaves: TeacherLeave[];
  complaints: Complaint[];
  transportRoutes: TransportRoute[];
  transportRequests: TransportRequest[];
}

const INSTALMENTS: Instalment[] = [
  { number: 1, label: 'Term 1', dueOn: '2026-06-15' },
  { number: 2, label: 'Term 2', dueOn: '2026-11-15' },
  { number: 3, label: 'Term 3', dueOn: '2027-01-10' },
  { number: 4, label: 'Term 4', dueOn: '2027-02-10' }
];

const SUBJECTS_BY_STAGE: Record<string, string[]> = {
  primary: ['Telugu', 'English', 'Mathematics', 'EVS', 'Hindi'],
  upper: ['Telugu', 'Hindi', 'English', 'Mathematics', 'Science', 'Social Studies'],
  high: ['Telugu', 'Hindi', 'English', 'Mathematics', 'Physical Science', 'Biology', 'Social Studies']
};

const stageOf = (grade: number) => (grade <= 5 ? 'primary' : grade <= 8 ? 'upper' : 'high');

const PERIOD_TIMES: [string, string][] = [
  ['09:00', '09:45'],
  ['09:45', '10:30'],
  ['10:45', '11:30'],
  ['11:30', '12:15'],
  ['13:00', '13:45'],
  ['13:45', '14:30']
];

/** Today plus `days`, moved to Monday if that day is a Sunday (exam dates on a Sunday fail validation). Mirrors DemoDates on the backend. */
function schoolDayIn(days: number): string {
  const d = addDaysISO(days);
  return new Date(d + 'T00:00:00').getDay() === 0 ? addDaysISO(days + 1) : d;
}

/** n-th school day (Mon-Sat) after today. */
function nextSchoolDay(n: number): string {
  let d = 0;
  let date = todayISO();
  while (n > 0) {
    d += 1;
    date = addDaysISO(d);
    if (new Date(date + 'T00:00:00').getDay() !== 0) n -= 1;
  }
  return date;
}

/**
 * Weekly timetables for all classes of a school, built together so no teacher is in two rooms in
 * the same period. Each class starts its subject rotation at a different offset; when the subject's
 * teacher is already busy in that period, the next subject in the rotation is taken.
 * Mirrors LeaveSeed.timetables() on the backend.
 */
function buildTimetables(classSections: ClassSection[]): Record<string, TimetableSlot[]> {
  const ordered = [...classSections].sort((x, y) => x.id.localeCompare(y.id));
  const busy = new Map<string, Set<string>>(); // "day-period" -> teacher names
  const out: Record<string, TimetableSlot[]> = {};
  ordered.forEach((cs, ci) => {
    const subjects = SUBJECTS_BY_STAGE[stageOf(cs.grade)];
    const teacherFor = (s: string) => cs.subjectTeachers.find(t => t.subject === s)?.name ?? cs.classTeacherName;
    const slots: TimetableSlot[] = [];
    for (let day = 1 as TimetableSlot['day']; day <= 6; day = (day + 1) as TimetableSlot['day']) {
      const periods = day === 6 ? 4 : 6;
      for (let p = 0; p < periods; p++) {
        const taken = busy.get(`${day}-${p}`) ?? new Set<string>();
        busy.set(`${day}-${p}`, taken);
        const base = day * 2 + p + ci;
        let subject = subjects[base % subjects.length];
        for (let k = 0; k < subjects.length; k++) {
          const candidate = subjects[(base + k) % subjects.length];
          if (!taken.has(teacherFor(candidate))) {
            subject = candidate;
            break;
          }
        }
        taken.add(teacherFor(subject));
        slots.push({ day, period: p + 1, start: PERIOD_TIMES[p][0], end: PERIOD_TIMES[p][1], subject, teacherName: teacherFor(subject) });
      }
    }
    out[cs.id] = slots;
  });
  return out;
}

function charges(schoolId: string, s: StudentRecord, annualSchoolFee: number, opts: { transport?: number; examFee?: number; activity?: number }): FeeCharge[] {
  const out: FeeCharge[] = [];
  const per = Math.round(annualSchoolFee / 4);
  for (const ins of INSTALMENTS) {
    out.push({ id: `${s.id}-SF-${ins.number}`, schoolId, studentId: s.id, category: 'SCHOOL_FEE', instalment: ins.number, label: 'School fee', amount: per, dueOn: ins.dueOn });
    if (opts.transport) {
      out.push({ id: `${s.id}-TR-${ins.number}`, schoolId, studentId: s.id, category: 'TRANSPORT_FEE', instalment: ins.number, label: `Transport (${s.transportRouteId})`, amount: opts.transport, dueOn: ins.dueOn });
    }
  }
  if (opts.activity) out.push({ id: `${s.id}-AC-1`, schoolId, studentId: s.id, category: 'ACTIVITY_FEE', instalment: 1, label: 'Activity fee', amount: opts.activity, dueOn: INSTALMENTS[0].dueOn });
  if (opts.examFee) out.push({ id: `${s.id}-EX-4`, schoolId, studentId: s.id, category: 'EXAM_FEE', instalment: 4, label: 'SSC board exam fee', amount: opts.examFee, dueOn: INSTALMENTS[3].dueOn });
  return out;
}

let rcpt = 1000;
function payment(schoolId: string, studentId: string, paidAt: string, method: Payment['method'], allocations: { chargeId: string; amount: number }[]): Payment {
  rcpt += 1;
  return {
    id: `PAY-${schoolId}-${rcpt}`,
    schoolId,
    studentId,
    amount: allocations.reduce((a, x) => a + x.amount, 0),
    method,
    providerRef: `mock_${rcpt}`,
    paidAt,
    receiptNo: `${schoolId}/2026-27/${rcpt}`,
    allocations,
    isMock: true
  };
}

/** Stable fingerprint of a payload (prototype; production uses a server-side hash). */
export function payloadHash(v: unknown): string {
  const str = JSON.stringify(v);
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

function seedChangeRequests(schoolId: string, payments: Payment[]): ChangeRequest[] {
  const admin = { id: 'ACC-L-0002', name: 'S. Sundaram' };
  const mk = (id: string, title: string, payload: ChangeRequest['payload'], status: ChangeRequest['status'], daysAgo: number): ChangeRequest => {
    const hash = payloadHash(payload);
    const history: ChangeRequest['history'] = [{ at: addDaysISO(-daysAgo) + 'T11:00:00+05:30', by: admin.id, action: 'SUBMITTED' }];
    if (status === 'APPROVED') history.push({ at: addDaysISO(-daysAgo + 1) + 'T12:00:00+05:30', by: 'ACC-L-0001', action: 'APPROVED' });
    return {
      id, schoolId, kind: payload.kind, title, payload, payloadHash: hash, approvedHash: status === 'APPROVED' ? hash : undefined,
      status, preparedBy: admin.id, preparedByName: admin.name, validationIssues: [], history: status === 'DRAFT' ? [] : history
    };
  };
  const aadhya = payments.find(p => p.studentId === 'GVS-2027-0002')!;
  return [
    mk('CR-GVS-1', 'Financial support concession: Kavya Reddy (9-A)', {
      kind: 'FEE_CONCESSION', studentId: 'GVS-2028-0117', chargeIds: ['GVS-2028-0117-SF-3', 'GVS-2028-0117-SF-4'], amountPerCharge: 2000,
      concessionKind: 'FINANCIAL_SUPPORT', justification: 'Father lost his job in August; application and documents verified by the office.'
    }, 'PENDING_APPROVAL', 2),
    mk('CR-GVS-2', `Refund ₹1,500: activity fee paid twice (${aadhya.receiptNo})`, {
      kind: 'REFUND', paymentId: aadhya.id, amount: 1500, reason: 'Activity fee was also paid in cash at the office on the same day.'
    }, 'PENDING_APPROVAL', 1),
    mk('CR-GVS-3', 'Move SA-1 start by 2 days', { kind: 'EXAM_SCHEDULE', examId: 'EX-GVS-SA1', newStartsOn: schoolDayIn(9), reason: 'Local body election holiday on original exam date.' }, 'APPROVED', 3),
    mk('CR-GVS-4', 'Class 9 fee: instalment 4 revision', { kind: 'FEE_STRUCTURE', grade: 9, instalment: 4, newSchoolFee: 11500, reason: 'Lab consumables cost increase.' }, 'DRAFT', 0)
  ];
}

// ---------------------------------------------------------------------------

function seedGVS(): SchoolDb {
  const schoolId = 'GVS';
  const T = {
    jenkins: { staffId: 'STF-T-0001', name: 'Sarah Jenkins' },
    nair: { staffId: 'STF-T-0002', name: 'Raghavan Nair' },
    lakshmi: { staffId: 'STF-T-0003', name: 'K. Lakshmi' },
    anjali: { staffId: 'STF-T-0004', name: 'S. Anjali' },
    ramesh: { staffId: 'STF-T-0005', name: 'P. Ramesh' },
    farhana: { staffId: 'STF-T-0006', name: 'M. Farhana' },
    suresh: { staffId: 'STF-T-0007', name: 'V. Suresh' },
    padma: { staffId: 'STF-T-0008', name: 'T. Padma' },
    kiran: { staffId: 'STF-T-0009', name: 'R. Kiran' }
  };
  const high = (ct: { staffId: string; name: string }) => [
    { subject: 'Telugu', ...T.lakshmi },
    { subject: 'Hindi', ...T.anjali },
    { subject: 'English', ...T.ramesh },
    { subject: 'Mathematics', ...T.nair },
    { subject: 'Physical Science', ...T.jenkins },
    { subject: 'Biology', ...T.farhana },
    { subject: 'Social Studies', ...(ct.staffId === T.kiran.staffId ? T.kiran : T.suresh) }
  ];
  const classSections: ClassSection[] = [
    { id: 'GVS-10-A', schoolId, grade: 10, section: 'A', classTeacherStaffId: T.jenkins.staffId, classTeacherName: T.jenkins.name, subjectTeachers: high(T.jenkins) },
    { id: 'GVS-10-B', schoolId, grade: 10, section: 'B', classTeacherStaffId: T.nair.staffId, classTeacherName: T.nair.name, subjectTeachers: high(T.nair) },
    { id: 'GVS-9-A', schoolId, grade: 9, section: 'A', classTeacherStaffId: T.kiran.staffId, classTeacherName: T.kiran.name, subjectTeachers: high(T.kiran) },
    {
      id: 'GVS-6-B', schoolId, grade: 6, section: 'B', classTeacherStaffId: T.padma.staffId, classTeacherName: T.padma.name,
      subjectTeachers: [
        { subject: 'Telugu', ...T.lakshmi },
        { subject: 'Hindi', ...T.anjali },
        { subject: 'English', ...T.padma },
        { subject: 'Mathematics', ...T.padma },
        { subject: 'Science', ...T.farhana },
        { subject: 'Social Studies', ...T.suresh }
      ]
    }
  ];

  const st = (id: string, cls: string, name: string, roll: string, route?: string): StudentRecord => {
    const cs = classSections.find(c => c.id === cls)!;
    const stop = route === 'Route 4' ? 'Kondapur X Roads' : route === 'Route 2' ? 'Madhapur Metro' : undefined;
    return { id, schoolId, classSectionId: cls, name, grade: cs.grade, section: cs.section, rollNumber: roll, admissionNo: id, transportRouteId: route, transportStop: stop, status: 'ACTIVE' };
  };
  const students: StudentRecord[] = [
    st('GVS-2027-0001', 'GVS-10-A', 'Aarav Sharma', '18', 'Route 4'),
    st('GVS-2027-0002', 'GVS-10-A', 'Aadhya Patel', '01'),
    st('GVS-2027-0003', 'GVS-10-A', 'Aditya Nair', '02', 'Route 2'),
    st('GVS-2027-0004', 'GVS-10-A', 'Devansh Reddy', '05'),
    st('GVS-2027-0005', 'GVS-10-A', 'Harini Rao', '09'),
    st('GVS-2027-0006', 'GVS-10-A', 'Mohammed Arif', '14', 'Route 4'),
    st('GVS-2031-0042', 'GVS-6-B', 'Ananya Sharma', '07', 'Route 4'),
    st('GVS-2028-0117', 'GVS-9-A', 'Kavya Reddy', '03')
  ];

  const allCharges: FeeCharge[] = students.flatMap(s =>
    s.grade === 10
      ? charges(schoolId, s, 48000, { transport: s.transportRouteId ? 1500 : undefined, examFee: 1500, activity: 2000 })
      : s.grade === 9
        ? charges(schoolId, s, 44000, { transport: s.transportRouteId ? 1500 : undefined, activity: 2000 })
        : charges(schoolId, s, 36000, { transport: s.transportRouteId ? 1200 : undefined, activity: 1500 })
  );

  const concessions: FeeConcession[] = [1, 2, 3, 4].map(n => ({
    id: `CON-GVS-ANANYA-${n}`,
    chargeId: `GVS-2031-0042-SF-${n}`,
    kind: 'SIBLING' as const,
    amount: 900,
    approvedOn: '2026-06-02'
  }));

  const full = (sid: string, ...ids: string[]) =>
    ids.map(id => {
      const c = allCharges.find(x => x.id === `${sid}-${id}`)!;
      const con = concessions.filter(k => k.chargeId === c.id).reduce((a, k) => a + k.amount, 0);
      return { chargeId: c.id, amount: c.amount - con };
    });

  const payments: Payment[] = [
    payment(schoolId, 'GVS-2027-0001', '2026-06-12T10:15:00+05:30', 'UPI', full('GVS-2027-0001', 'SF-1', 'TR-1', 'AC-1')),
    payment(schoolId, 'GVS-2027-0001', '2026-10-28T19:40:00+05:30', 'UPI', [
      { chargeId: 'GVS-2027-0001-SF-2', amount: 6000 },
      { chargeId: 'GVS-2027-0001-TR-2', amount: 1500 }
    ]),
    payment(schoolId, 'GVS-2031-0042', '2026-06-12T10:18:00+05:30', 'UPI', full('GVS-2031-0042', 'SF-1', 'TR-1', 'AC-1')),
    payment(schoolId, 'GVS-2031-0042', '2026-10-28T19:42:00+05:30', 'UPI', full('GVS-2031-0042', 'SF-2', 'TR-2')),
    payment(schoolId, 'GVS-2028-0117', '2026-07-03T11:00:00+05:30', 'CASH_AT_OFFICE', [
      { chargeId: 'GVS-2028-0117-SF-1', amount: 8000 },
      { chargeId: 'GVS-2028-0117-AC-1', amount: 2000 }
    ]),
    payment(schoolId, 'GVS-2027-0002', '2026-06-10T09:00:00+05:30', 'NETBANKING', full('GVS-2027-0002', 'SF-1', 'AC-1', 'SF-2')),
    payment(schoolId, 'GVS-2027-0003', '2026-06-10T09:30:00+05:30', 'UPI', full('GVS-2027-0003', 'SF-1', 'TR-1', 'AC-1', 'SF-2', 'TR-2')),
    payment(schoolId, 'GVS-2027-0005', '2026-06-11T12:00:00+05:30', 'UPI', full('GVS-2027-0005', 'SF-1', 'AC-1', 'SF-2')),
    payment(schoolId, 'GVS-2027-0006', '2026-06-11T12:30:00+05:30', 'CARD', full('GVS-2027-0006', 'SF-1', 'TR-1', 'AC-1'))
  ];

  const timetables = buildTimetables(classSections);

  const homework: HomeworkItem[] = [
    {
      id: 'HW-GVS-1', schoolId, classSectionId: 'GVS-10-A', subject: 'Mathematics', teacherName: T.nair.name,
      title: 'Exercise 5.2: Arithmetic progressions', instructions: 'Solve questions 1-12 in the homework notebook. Show all steps.',
      assignedOn: addDaysISO(-4), dueOn: addDaysISO(-1), submissionType: 'NOTEBOOK',
      statusByStudent: { 'GVS-2027-0001': 'PENDING', 'GVS-2027-0002': 'SUBMITTED', 'GVS-2027-0003': 'CHECKED' }
    },
    {
      id: 'HW-GVS-2', schoolId, classSectionId: 'GVS-10-A', subject: 'Physical Science', teacherName: T.jenkins.name,
      title: 'Chemical reactions: balance 10 equations', instructions: 'Worksheet given in class. Submit to the class teacher.',
      assignedOn: addDaysISO(-1), dueOn: addDaysISO(2), submissionType: 'WORKSHEET', statusByStudent: {}
    },
    {
      id: 'HW-GVS-3', schoolId, classSectionId: 'GVS-10-A', subject: 'English', teacherName: T.ramesh.name,
      title: 'Letter writing: request to the Principal', instructions: '150-200 words.',
      assignedOn: addDaysISO(-6), dueOn: addDaysISO(-3), submissionType: 'NOTEBOOK', statusByStudent: { 'GVS-2027-0001': 'CHECKED' }
    },
    {
      id: 'HW-GVS-4', schoolId, classSectionId: 'GVS-6-B', subject: 'Science', teacherName: T.farhana.name,
      title: 'Draw and label a plant cell', instructions: 'Use the science notebook.',
      assignedOn: addDaysISO(-2), dueOn: addDaysISO(1), submissionType: 'NOTEBOOK', statusByStudent: {}
    },
    {
      id: 'HW-GVS-5', schoolId, classSectionId: 'GVS-9-A', subject: 'Social Studies', teacherName: T.kiran.name,
      title: 'Map work: rivers of Telangana', instructions: 'Outline map provided.',
      assignedOn: addDaysISO(-5), dueOn: addDaysISO(-2), submissionType: 'WORKSHEET', statusByStudent: { 'GVS-2028-0117': 'SUBMITTED' }
    }
  ];

  const nowISO = new Date().toISOString();
  const notices: Notice[] = [
    {
      id: 'NT-GVS-1', schoolId, audience: 'ALL', priority: 'EMERGENCY', publishedAt: nowISO,
      title: 'Heavy rain alert: early dismissal today',
      body: 'School will close at 12:30 PM today due to a heavy rain warning. Buses leave at 12:45 PM. Please arrange pickup.'
    },
    {
      id: 'NT-GVS-2', schoolId, audience: 'ALL', priority: 'IMPORTANT', publishedAt: addDaysISO(-2) + 'T09:00:00+05:30',
      title: 'SA-1 timetable published',
      body: 'Summative Assessment 1 begins on 23 Nov. Hall tickets are issued by class teachers after fee clearance.'
    },
    {
      id: 'NT-GVS-3', schoolId, audience: ['GVS-6-B'], priority: 'NORMAL', publishedAt: addDaysISO(-3) + 'T15:00:00+05:30',
      title: 'Class 6-B: science exhibition', body: 'Students may bring models on Friday.'
    }
  ];

  const consents: ConsentRequest[] = [
    {
      id: 'CN-GVS-1', schoolId, classSectionIds: ['GVS-10-A', 'GVS-10-B'], dueOn: addDaysISO(5), responses: {},
      title: 'Science museum visit (Birla Science Centre)',
      details: 'Day trip by school bus, 9:00 AM to 3:30 PM. Lunch provided. No additional fee.'
    }
  ];

  const tomorrowAt = (h: number, m: number) => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };
  const meetings: Meeting[] = [
    { id: 'MT-GVS-1', schoolId, studentId: 'GVS-2027-0001', teacherName: T.jenkins.name, purpose: 'SA-1 preparation', at: tomorrowAt(10, 30), status: 'CONFIRMED' }
  ];

  const exams: ExamWindow[] = [
    { id: 'EX-GVS-SA1', schoolId, name: 'SA-1', startsOn: schoolDayIn(7), grades: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], clearanceRule: { categories: ['SCHOOL_FEE', 'TRANSPORT_FEE'], uptoInstalment: 2 } }
  ];

  const hallTicketReleases: HallTicketRelease[] = [
    { examId: 'EX-GVS-SA1', studentId: 'GVS-2031-0042', releasedBy: T.padma.staffId, releasedAt: addDaysISO(-1) + 'T12:00:00+05:30' },
    { examId: 'EX-GVS-SA1', studentId: 'GVS-2027-0003', releasedBy: T.jenkins.staffId, releasedAt: addDaysISO(-1) + 'T12:05:00+05:30' }
  ];

  const fa1 = (maths: number, version: number, status: 'CURRENT' | 'SUPERSEDED'): PublishedResult => ({
    id: `RES-GVS-AARAV-FA1-v${version}`,
    studentId: 'GVS-2027-0001',
    examName: 'FA-1',
    version,
    status,
    publishedOn: version === 1 ? '2026-08-20' : '2026-08-27',
    classTeacherRemark: 'Consistent effort. Practise numerical problems in Physical Science.',
    subjects: [
      { subject: 'Telugu', internal: 17, external: 0, maxInternal: 20, maxExternal: 0, passMark: 7 },
      { subject: 'Hindi', internal: 15, external: 0, maxInternal: 20, maxExternal: 0, passMark: 4 },
      { subject: 'English', internal: 18, external: 0, maxInternal: 20, maxExternal: 0, passMark: 7 },
      { subject: 'Mathematics', internal: maths, external: 0, maxInternal: 20, maxExternal: 0, passMark: 7 },
      { subject: 'Physical Science', internal: 8, external: 0, maxInternal: 10, maxExternal: 0, passMark: 4 },
      { subject: 'Biology', internal: 'AB', external: 0, maxInternal: 10, maxExternal: 0, passMark: 4 },
      { subject: 'Social Studies', internal: 16, external: 0, maxInternal: 20, maxExternal: 0, passMark: 7 }
    ]
  });

  const aaravExtraResults: PublishedResult[] = [
    {
      id: 'RES-GVS-AARAV-FA2-v1', studentId: 'GVS-2027-0001', examName: 'FA-2', version: 1, status: 'CURRENT', publishedOn: '2026-09-25',
      classTeacherRemark: 'Good improvement in Mathematics and Physical Science.',
      subjects: [
        { subject: 'Telugu', internal: 18, external: 0, maxInternal: 20, maxExternal: 0, passMark: 7 },
        { subject: 'Hindi', internal: 16, external: 0, maxInternal: 20, maxExternal: 0, passMark: 4 },
        { subject: 'English', internal: 18, external: 0, maxInternal: 20, maxExternal: 0, passMark: 7 },
        { subject: 'Mathematics', internal: 19, external: 0, maxInternal: 20, maxExternal: 0, passMark: 7 },
        { subject: 'Physical Science', internal: 10, external: 0, maxInternal: 10, maxExternal: 0, passMark: 4 },
        { subject: 'Biology', internal: 8, external: 0, maxInternal: 10, maxExternal: 0, passMark: 4 },
        { subject: 'Social Studies', internal: 17, external: 0, maxInternal: 20, maxExternal: 0, passMark: 7 }
      ]
    },
    {
      id: 'RES-GVS-AARAV-SA1-v1', studentId: 'GVS-2027-0001', examName: 'SA-1', version: 1, status: 'CURRENT', publishedOn: '2026-10-30',
      classTeacherRemark: 'Strong overall Term-1 performance. Keep practising Biology diagrams.',
      subjects: [
        { subject: 'Telugu', internal: 18, external: 69, maxInternal: 20, maxExternal: 80, passMark: 35 },
        { subject: 'Hindi', internal: 16, external: 62, maxInternal: 20, maxExternal: 80, passMark: 20 },
        { subject: 'English', internal: 19, external: 73, maxInternal: 20, maxExternal: 80, passMark: 35 },
        { subject: 'Mathematics', internal: 19, external: 76, maxInternal: 20, maxExternal: 80, passMark: 35 },
        { subject: 'Physical Science', internal: 9, external: 35, maxInternal: 10, maxExternal: 40, passMark: 18 },
        { subject: 'Biology', internal: 4, external: 33, maxInternal: 10, maxExternal: 40, passMark: 17 },
        { subject: 'Social Studies', internal: 18, external: 70, maxInternal: 20, maxExternal: 80, passMark: 35 }
      ]
    },
    {
      id: 'RES-GVS-AARAV-FA3-v1', studentId: 'GVS-2027-0001', examName: 'FA-3', version: 1, status: 'CURRENT', publishedOn: '2026-12-18',
      classTeacherRemark: 'Steady improvement in Physical Science numericals.',
      subjects: [
        { subject: 'Telugu', internal: 18, external: 0, maxInternal: 20, maxExternal: 0, passMark: 7 },
        { subject: 'Hindi', internal: 16, external: 0, maxInternal: 20, maxExternal: 0, passMark: 4 },
        { subject: 'English', internal: 19, external: 0, maxInternal: 20, maxExternal: 0, passMark: 7 },
        { subject: 'Mathematics', internal: 19, external: 0, maxInternal: 20, maxExternal: 0, passMark: 7 },
        { subject: 'Physical Science', internal: 9, external: 0, maxInternal: 10, maxExternal: 0, passMark: 4 },
        { subject: 'Biology', internal: 8, external: 0, maxInternal: 10, maxExternal: 0, passMark: 4 },
        { subject: 'Social Studies', internal: 18, external: 0, maxInternal: 20, maxExternal: 0, passMark: 7 }
      ]
    },
    {
      id: 'RES-GVS-AARAV-FA4-v1', studentId: 'GVS-2027-0001', examName: 'FA-4', version: 1, status: 'CURRENT', publishedOn: '2027-01-28',
      classTeacherRemark: 'Well prepared for board revision tests.',
      subjects: [
        { subject: 'Telugu', internal: 19, external: 0, maxInternal: 20, maxExternal: 0, passMark: 7 },
        { subject: 'Hindi', internal: 17, external: 0, maxInternal: 20, maxExternal: 0, passMark: 4 },
        { subject: 'English', internal: 19, external: 0, maxInternal: 20, maxExternal: 0, passMark: 7 },
        { subject: 'Mathematics', internal: 20, external: 0, maxInternal: 20, maxExternal: 0, passMark: 7 },
        { subject: 'Physical Science', internal: 9, external: 0, maxInternal: 10, maxExternal: 0, passMark: 4 },
        { subject: 'Biology', internal: 10, external: 0, maxInternal: 10, maxExternal: 0, passMark: 4 },
        { subject: 'Social Studies', internal: 18, external: 0, maxInternal: 20, maxExternal: 0, passMark: 7 }
      ]
    },
    {
      id: 'RES-GVS-AARAV-SA2-v1', studentId: 'GVS-2027-0001', examName: 'SA-2', version: 1, status: 'CURRENT', publishedOn: '2027-02-15',
      classTeacherRemark: 'Strong Term-2 performance across all subjects.',
      subjects: [
        { subject: 'Telugu', internal: 19, external: 71, maxInternal: 20, maxExternal: 80, passMark: 35 },
        { subject: 'Hindi', internal: 17, external: 65, maxInternal: 20, maxExternal: 80, passMark: 20 },
        { subject: 'English', internal: 19, external: 75, maxInternal: 20, maxExternal: 80, passMark: 35 },
        { subject: 'Mathematics', internal: 20, external: 77, maxInternal: 20, maxExternal: 80, passMark: 35 },
        { subject: 'Physical Science', internal: 9, external: 36, maxInternal: 10, maxExternal: 40, passMark: 18 },
        { subject: 'Biology', internal: 9, external: 35, maxInternal: 10, maxExternal: 40, passMark: 17 },
        { subject: 'Social Studies', internal: 18, external: 72, maxInternal: 20, maxExternal: 80, passMark: 35 }
      ]
    },
    {
      id: 'RES-GVS-AARAV-PREFINAL-v1', studentId: 'GVS-2027-0001', examName: 'Pre-Final', version: 1, status: 'CURRENT', publishedOn: '2027-03-05',
      classTeacherRemark: 'Excellent Pre-Final readiness across all SSC papers.',
      subjects: [
        { subject: 'Telugu', internal: 19, external: 72, maxInternal: 20, maxExternal: 80, passMark: 35 },
        { subject: 'Hindi', internal: 17, external: 67, maxInternal: 20, maxExternal: 80, passMark: 20 },
        { subject: 'English', internal: 19, external: 75, maxInternal: 20, maxExternal: 80, passMark: 35 },
        { subject: 'Mathematics', internal: 20, external: 77, maxInternal: 20, maxExternal: 80, passMark: 35 },
        { subject: 'Physical Science', internal: 9, external: 37, maxInternal: 10, maxExternal: 40, passMark: 18 },
        { subject: 'Biology', internal: 9, external: 36, maxInternal: 10, maxExternal: 40, passMark: 17 },
        { subject: 'Social Studies', internal: 19, external: 73, maxInternal: 20, maxExternal: 80, passMark: 35 }
      ]
    },
    {
      id: 'RES-GVS-AARAV-FINAL-v1', studentId: 'GVS-2027-0001', examName: 'Final', version: 1, status: 'CURRENT', publishedOn: '2027-03-22',
      classTeacherRemark: 'Outstanding SSC final performance.',
      subjects: [
        { subject: 'Telugu', internal: 19, external: 73, maxInternal: 20, maxExternal: 80, passMark: 35 },
        { subject: 'Hindi', internal: 17, external: 68, maxInternal: 20, maxExternal: 80, passMark: 20 },
        { subject: 'English', internal: 19, external: 76, maxInternal: 20, maxExternal: 80, passMark: 35 },
        { subject: 'Mathematics', internal: 20, external: 78, maxInternal: 20, maxExternal: 80, passMark: 35 },
        { subject: 'Physical Science', internal: 9, external: 38, maxInternal: 10, maxExternal: 40, passMark: 18 },
        { subject: 'Biology', internal: 9, external: 37, maxInternal: 10, maxExternal: 40, passMark: 17 },
        { subject: 'Social Studies', internal: 19, external: 74, maxInternal: 20, maxExternal: 80, passMark: 35 }
      ]
    }
  ];

  const ananyaResults: PublishedResult[] = [
    {
      id: 'RES-GVS-ANANYA-FA1-v1', studentId: 'GVS-2031-0042', examName: 'FA-1', version: 1, status: 'CURRENT', publishedOn: '2026-08-27',
      classTeacherRemark: 'Active participant in class.',
      subjects: [
        { subject: 'Telugu', internal: 17, external: 0, maxInternal: 20, maxExternal: 0, passMark: 7 },
        { subject: 'Hindi', internal: 16, external: 0, maxInternal: 20, maxExternal: 0, passMark: 4 },
        { subject: 'English', internal: 19, external: 0, maxInternal: 20, maxExternal: 0, passMark: 7 },
        { subject: 'Mathematics', internal: 18, external: 0, maxInternal: 20, maxExternal: 0, passMark: 7 },
        { subject: 'Science', internal: 17, external: 0, maxInternal: 20, maxExternal: 0, passMark: 7 },
        { subject: 'Social Studies', internal: 18, external: 0, maxInternal: 20, maxExternal: 0, passMark: 7 }
      ]
    },
    {
      id: 'RES-GVS-ANANYA-FA2-v1', studentId: 'GVS-2031-0042', examName: 'FA-2', version: 1, status: 'CURRENT', publishedOn: '2026-09-25',
      classTeacherRemark: 'Very neat presentation in Science.',
      subjects: [
        { subject: 'Telugu', internal: 18, external: 0, maxInternal: 20, maxExternal: 0, passMark: 7 },
        { subject: 'Hindi', internal: 17, external: 0, maxInternal: 20, maxExternal: 0, passMark: 4 },
        { subject: 'English', internal: 19, external: 0, maxInternal: 20, maxExternal: 0, passMark: 7 },
        { subject: 'Mathematics', internal: 19, external: 0, maxInternal: 20, maxExternal: 0, passMark: 7 },
        { subject: 'Science', internal: 18, external: 0, maxInternal: 20, maxExternal: 0, passMark: 7 },
        { subject: 'Social Studies', internal: 17, external: 0, maxInternal: 20, maxExternal: 0, passMark: 7 }
      ]
    },
    {
      id: 'RES-GVS-ANANYA-SA1-v1', studentId: 'GVS-2031-0042', examName: 'SA-1', version: 1, status: 'CURRENT', publishedOn: '2026-10-30',
      classTeacherRemark: 'Excellent Term-1 performance across all subjects.',
      subjects: [
        { subject: 'Telugu', internal: 18, external: 70, maxInternal: 20, maxExternal: 80, passMark: 35 },
        { subject: 'Hindi', internal: 17, external: 66, maxInternal: 20, maxExternal: 80, passMark: 20 },
        { subject: 'English', internal: 19, external: 75, maxInternal: 20, maxExternal: 80, passMark: 35 },
        { subject: 'Mathematics', internal: 19, external: 74, maxInternal: 20, maxExternal: 80, passMark: 35 },
        { subject: 'Science', internal: 18, external: 71, maxInternal: 20, maxExternal: 80, passMark: 35 },
        { subject: 'Social Studies', internal: 18, external: 69, maxInternal: 20, maxExternal: 80, passMark: 35 }
      ]
    },
    {
      id: 'RES-GVS-ANANYA-FA3-v1', studentId: 'GVS-2031-0042', examName: 'FA-3', version: 1, status: 'CURRENT', publishedOn: '2026-12-18',
      classTeacherRemark: 'Consistent work in Mathematics and English.',
      subjects: [
        { subject: 'Telugu', internal: 18, external: 0, maxInternal: 20, maxExternal: 0, passMark: 7 },
        { subject: 'Hindi', internal: 17, external: 0, maxInternal: 20, maxExternal: 0, passMark: 4 },
        { subject: 'English', internal: 19, external: 0, maxInternal: 20, maxExternal: 0, passMark: 7 },
        { subject: 'Mathematics', internal: 19, external: 0, maxInternal: 20, maxExternal: 0, passMark: 7 },
        { subject: 'Science', internal: 19, external: 0, maxInternal: 20, maxExternal: 0, passMark: 7 },
        { subject: 'Social Studies', internal: 18, external: 0, maxInternal: 20, maxExternal: 0, passMark: 7 }
      ]
    },
    {
      id: 'RES-GVS-ANANYA-FA4-v1', studentId: 'GVS-2031-0042', examName: 'FA-4', version: 1, status: 'CURRENT', publishedOn: '2027-01-28',
      classTeacherRemark: 'Very good project work in Social Studies.',
      subjects: [
        { subject: 'Telugu', internal: 19, external: 0, maxInternal: 20, maxExternal: 0, passMark: 7 },
        { subject: 'Hindi', internal: 18, external: 0, maxInternal: 20, maxExternal: 0, passMark: 4 },
        { subject: 'English', internal: 19, external: 0, maxInternal: 20, maxExternal: 0, passMark: 7 },
        { subject: 'Mathematics', internal: 19, external: 0, maxInternal: 20, maxExternal: 0, passMark: 7 },
        { subject: 'Science', internal: 19, external: 0, maxInternal: 20, maxExternal: 0, passMark: 7 },
        { subject: 'Social Studies', internal: 19, external: 0, maxInternal: 20, maxExternal: 0, passMark: 7 }
      ]
    },
    {
      id: 'RES-GVS-ANANYA-SA2-v1', studentId: 'GVS-2031-0042', examName: 'SA-2', version: 1, status: 'CURRENT', publishedOn: '2027-03-22',
      classTeacherRemark: 'Promoted with A1 grade. Well done!',
      subjects: [
        { subject: 'Telugu', internal: 19, external: 72, maxInternal: 20, maxExternal: 80, passMark: 35 },
        { subject: 'Hindi', internal: 18, external: 69, maxInternal: 20, maxExternal: 80, passMark: 20 },
        { subject: 'English', internal: 19, external: 76, maxInternal: 20, maxExternal: 80, passMark: 35 },
        { subject: 'Mathematics', internal: 19, external: 75, maxInternal: 20, maxExternal: 80, passMark: 35 },
        { subject: 'Science', internal: 19, external: 73, maxInternal: 20, maxExternal: 80, passMark: 35 },
        { subject: 'Social Studies', internal: 19, external: 72, maxInternal: 20, maxExternal: 80, passMark: 35 }
      ]
    }
  ];

  const threads: MessageThread[] = [
    {
      id: 'TH-GVS-1', schoolId, studentId: 'GVS-2027-0001', teacherStaffId: T.jenkins.staffId, teacherName: T.jenkins.name,
      teacherRole: 'Class Teacher', category: 'ATTENDANCE', subject: 'Late arrival on Monday',
      messages: [
        { from: 'PARENT', author: 'Rajesh Sharma', body: 'Aarav will be 30 minutes late on Monday due to a hospital appointment.', at: addDaysISO(-3) + 'T08:10:00+05:30' },
        { from: 'TEACHER', author: T.jenkins.name, body: 'Noted, thank you. Please send the leave note through the app.', at: addDaysISO(-3) + 'T09:02:00+05:30' }
      ]
    }
  ];

  const leaves: LeaveRequest[] = [
    {
      id: 'LV-GVS-1', schoolId, studentId: 'GVS-2027-0001', classSectionId: 'GVS-10-A', fromDate: addDaysISO(1), toDate: addDaysISO(1),
      kind: 'MEDICAL_APPOINTMENT', reason: 'Eye check-up at the hospital in the morning.', requestedByGuardianId: 'GRD-0001',
      requestedAt: addDaysISO(-1) + 'T20:10:00+05:30', status: 'PENDING'
    },
    {
      id: 'LV-GVS-2', schoolId, studentId: 'GVS-2027-0006', classSectionId: 'GVS-10-A', fromDate: todayISO(), toDate: addDaysISO(1),
      kind: 'FAMILY', reason: 'Family function out of town.', requestedByGuardianId: 'GRD-9006',
      requestedAt: addDaysISO(-3) + 'T18:00:00+05:30', status: 'APPROVED',
      decision: { by: T.jenkins.staffId, byName: T.jenkins.name, at: addDaysISO(-2) + 'T09:00:00+05:30', note: 'Approved.' }
    }
  ];

  const assessments: Assessment[] = [
    {
      id: 'AS-GVS-FA2', schoolId, name: 'FA-2', academicYear: '2026-27', grades: [9, 10], maxInternal: 20, maxExternal: 0,
      passPercent: 35, secondLanguagePassPercent: 20, secondLanguageSubjects: ['Hindi'], status: 'OPEN'
    }
  ];

  const tenA = students.filter(x => x.classSectionId === 'GVS-10-A');
  const score = (sid: string, subj: string) => {
    let h = 7;
    for (const ch of sid + subj) h = (h * 33 + ch.charCodeAt(0)) % 9973;
    return 9 + (h % 12); // 9..20
  };
  const sheet = (subject: string, status: MarksSheet['status'], fill: 'ALL' | 'SOME' | 'NONE', absent?: string): MarksSheet => {
    const cs = classSections.find(c => c.id === 'GVS-10-A')!;
    const teacher = cs.subjectTeachers.find(x => x.subject === subject)!;
    const rows: MarksSheet['rows'] = {};
    tenA.forEach((st, i) => {
      const filled = fill === 'ALL' || (fill === 'SOME' && i < 3);
      rows[st.id] = { internal: !filled ? null : st.id === absent ? 'AB' : score(st.id, subject), external: null };
    });
    return {
      id: `AS-GVS-FA2:GVS-10-A:${subject}`, schoolId, assessmentId: 'AS-GVS-FA2', classSectionId: 'GVS-10-A', subject,
      teacherStaffId: teacher.staffId, status, rows,
      log: status === 'SUBMITTED' ? [{ at: addDaysISO(-2) + 'T16:00:00+05:30', by: teacher.staffId, action: 'SUBMITTED' }] : []
    };
  };
  const marksSheets: MarksSheet[] = [
    sheet('Telugu', 'SUBMITTED', 'ALL'),
    sheet('Hindi', 'SUBMITTED', 'ALL'),
    sheet('English', 'SUBMITTED', 'ALL'),
    sheet('Mathematics', 'DRAFT', 'SOME'),
    sheet('Physical Science', 'NOT_STARTED', 'NONE'),
    sheet('Biology', 'SUBMITTED', 'ALL', 'GVS-2027-0004'),
    sheet('Social Studies', 'SUBMITTED', 'ALL')
  ];

  const corrections: MarkCorrection[] = [
    {
      id: 'MC-GVS-1', schoolId, resultId: 'RES-GVS-AARAV-FA1-v2', studentId: 'GVS-2027-0001', classSectionId: 'GVS-10-A',
      examName: 'FA-1', subject: 'Social Studies', field: 'internal', from: 16, to: 17,
      reason: 'Totalling error on page 2 of the answer script; one mark was not added.', raisedBy: T.suresh.staffId, status: 'VERIFIED',
      log: [
        { at: addDaysISO(-2) + 'T15:00:00+05:30', by: T.suresh.staffId, action: 'RAISED' },
        { at: addDaysISO(-1) + 'T10:00:00+05:30', by: T.jenkins.staffId, action: 'VERIFIED', note: 'Checked the script. Correct.' }
      ]
    }
  ];

  const teacherLeaves: TeacherLeave[] = [
    {
      id: 'TL-GVS-1', schoolId, staffId: T.nair.staffId, staffName: T.nair.name, fromDate: addDaysISO(8), toDate: addDaysISO(9),
      kind: 'TRAINING', reason: 'SCERT mathematics teacher training at Hyderabad.', status: 'PENDING'
    },
    {
      // Approved: the Admin still has to arrange substitutes (Flow 6).
      id: 'TL-GVS-2', schoolId, staffId: T.lakshmi.staffId, staffName: T.lakshmi.name, fromDate: nextSchoolDay(1), toDate: nextSchoolDay(1),
      kind: 'SICK', reason: 'Medical appointment.', status: 'APPROVED',
      decision: { by: 'ACC-L-0001', at: addDaysISO(-1) + 'T16:00:00+05:30' }
    }
  ];

  const transportRoutes: TransportRoute[] = [
    {
      id: 'Route 2', schoolId, name: 'Route 2 · Madhapur', vehicleNo: 'TS 09 UB 2211', capacity: 40, feePerInstalment: 1500,
      stops: [{ name: 'Madhapur Metro', pickup: '07:10', drop: '16:05' }, { name: 'Hitech City', pickup: '07:20', drop: '15:55' }]
    },
    {
      id: 'Route 4', schoolId, name: 'Route 4 · Kondapur', vehicleNo: 'TS 09 UB 4410', capacity: 3, feePerInstalment: 1500,
      stops: [{ name: 'Kondapur X Roads', pickup: '07:05', drop: '16:10' }, { name: 'Botanical Garden', pickup: '07:15', drop: '16:00' }]
    },
    {
      id: 'Route 7', schoolId, name: 'Route 7 · Gachibowli', vehicleNo: 'TS 09 UB 7702', capacity: 36, feePerInstalment: 1500,
      stops: [{ name: 'Gachibowli Stadium', pickup: '07:00', drop: '16:15' }, { name: 'DLF Gate', pickup: '07:12', drop: '16:02' }]
    }
  ];

  const transportRequests: TransportRequest[] = [
    {
      id: 'TRQ-GVS-1', schoolId, studentId: 'GVS-2028-0117', requestedByGuardianId: 'GRD-0003', kind: 'NEW', toRouteId: 'Route 4', stopName: 'Botanical Garden',
      reason: 'We moved to Kondapur this month.', effectiveFrom: addDaysISO(7), status: 'PENDING', createdAt: addDaysISO(-1) + 'T19:00:00+05:30'
    }
  ];

  const complaints: Complaint[] = [
    {
      id: 'CMP-GVS-1', schoolId, studentId: 'GVS-2027-0001', raisedByGuardianId: 'GRD-0001', raisedByName: 'Rajesh Sharma', category: 'TRANSPORT',
      subject: 'Route 4 bus late in the evening', description: 'The bus reached Kondapur 25 minutes late on three days this week.',
      status: 'OPEN', createdAt: addDaysISO(-2) + 'T20:10:00+05:30', principalInformed: false,
      log: [{ at: addDaysISO(-2) + 'T20:10:00+05:30', by: 'GRD-0001', byRole: 'PARENT', action: 'RAISED' }]
    }
  ];

  return {
    schoolId, classSections, students, timetables, homework, notices, consents, meetings,
    instalments: INSTALMENTS, charges: allCharges, concessions, payments, refunds: [],
    lateFeePolicy: 'Late fee as per school policy, set by the school Admin. None is applied automatically in this prototype.',
    exams, hallTicketReleases, results: [fa1(15, 1, 'SUPERSEDED'), fa1(18, 2, 'CURRENT'), ...aaravExtraResults, ...ananyaResults], threads,
    leaves, registers: [], assessments, marksSheets, reportCards: [],
    changeRequests: seedChangeRequests(schoolId, payments), corrections, teacherLeaves,
    complaints, transportRoutes, transportRequests
  };
}

function seedSJM(): SchoolDb {
  const schoolId = 'SJM';
  const ct = { staffId: 'STF-T-0101', name: 'J. Mary' };
  const classSections: ClassSection[] = [
    {
      id: 'SJM-4-B', schoolId, grade: 4, section: 'B', classTeacherStaffId: ct.staffId, classTeacherName: ct.name,
      subjectTeachers: [
        { subject: 'Telugu', staffId: 'STF-T-0102', name: 'G. Swapna' },
        { subject: 'English', ...ct },
        { subject: 'Mathematics', ...ct },
        { subject: 'EVS', staffId: 'STF-T-0103', name: 'D. Prakash' },
        { subject: 'Hindi', staffId: 'STF-T-0104', name: 'N. Rekha' }
      ]
    }
  ];
  const students: StudentRecord[] = [
    { id: 'SJM-2033-0105', schoolId, classSectionId: 'SJM-4-B', name: 'Rohan Sharma', grade: 4, section: 'B', rollNumber: '12', admissionNo: 'SJM-2033-0105', status: 'ACTIVE' }
  ];
  const allCharges = charges(schoolId, students[0], 30000, { activity: 1000 });
  const pay = (ids: string[]) => ids.map(id => ({ chargeId: `SJM-2033-0105-${id}`, amount: allCharges.find(c => c.id === `SJM-2033-0105-${id}`)!.amount }));
  return {
    schoolId, classSections, students,
    timetables: { 'SJM-4-B': buildTimetables([classSections[0]])['SJM-4-B'] },
    homework: [
      {
        id: 'HW-SJM-1', schoolId, classSectionId: 'SJM-4-B', subject: 'EVS', teacherName: 'D. Prakash',
        title: 'Collect five different leaves', instructions: 'Paste them in the scrapbook and name them.',
        assignedOn: addDaysISO(-1), dueOn: addDaysISO(3), submissionType: 'NOTEBOOK', statusByStudent: {}
      }
    ],
    notices: [
      { id: 'NT-SJM-1', schoolId, audience: 'ALL', priority: 'NORMAL', publishedAt: addDaysISO(-1) + 'T10:00:00+05:30', title: 'Children’s Day celebrations', body: 'Students may come in colour dress on 14 Nov.' }
    ],
    consents: [],
    meetings: [],
    instalments: INSTALMENTS,
    charges: allCharges,
    concessions: [],
    payments: [
      payment(schoolId, 'SJM-2033-0105', '2026-06-14T18:00:00+05:30', 'UPI', pay(['SF-1', 'AC-1'])),
      payment(schoolId, 'SJM-2033-0105', '2026-10-20T18:00:00+05:30', 'UPI', pay(['SF-2']))
    ],
    refunds: [],
    lateFeePolicy: 'Late fee as per school policy, set by the school Admin.',
    // St. Jude follows CBSE (Classes 1-5: PT-1, Half-Yearly, PT-2, Annual; 33% to pass).
    // Only exams already held are shown; nothing is published for a future date.
    exams: [{ id: 'EX-SJM-SA1', schoolId, name: 'Half-Yearly', startsOn: schoolDayIn(9), grades: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], clearanceRule: { categories: ['SCHOOL_FEE'], uptoInstalment: 2 } }],
    hallTicketReleases: [{ examId: 'EX-SJM-SA1', studentId: 'SJM-2033-0105', releasedBy: ct.staffId, releasedAt: addDaysISO(-2) + 'T11:00:00+05:30' }],
    results: [
      {
        id: 'RES-SJM-ROHAN-PT1-v1', studentId: 'SJM-2033-0105', examName: 'PT-1', version: 1, status: 'CURRENT', publishedOn: '2026-08-27',
        classTeacherRemark: 'Very cheerful and attentive in class.',
        subjects: [
          { subject: 'English', internal: 18, external: 0, maxInternal: 20, maxExternal: 0, passMark: 7 },
          { subject: 'Hindi', internal: 15, external: 0, maxInternal: 20, maxExternal: 0, passMark: 7 },
          { subject: 'Telugu', internal: 16, external: 0, maxInternal: 20, maxExternal: 0, passMark: 7 },
          { subject: 'Mathematics', internal: 17, external: 0, maxInternal: 20, maxExternal: 0, passMark: 7 },
          { subject: 'EVS', internal: 18, external: 0, maxInternal: 20, maxExternal: 0, passMark: 7 }
        ]
      },
      {
        id: 'RES-SJM-ROHAN-HY-v1', studentId: 'SJM-2033-0105', examName: 'Half-Yearly', version: 1, status: 'CURRENT', publishedOn: '2026-10-30',
        classTeacherRemark: 'Well done in the half-yearly exam!',
        subjects: [
          { subject: 'English', internal: 19, external: 74, maxInternal: 20, maxExternal: 80, passMark: 33 },
          { subject: 'Hindi', internal: 16, external: 61, maxInternal: 20, maxExternal: 80, passMark: 33 },
          { subject: 'Telugu', internal: 17, external: 65, maxInternal: 20, maxExternal: 80, passMark: 33 },
          { subject: 'Mathematics', internal: 18, external: 72, maxInternal: 20, maxExternal: 80, passMark: 33 },
          { subject: 'EVS', internal: 19, external: 73, maxInternal: 20, maxExternal: 80, passMark: 33 }
        ]
      }
    ],
    threads: [],
    leaves: [],
    registers: [],
    assessments: [],
    marksSheets: [],
    reportCards: [],
    changeRequests: [],
    corrections: [],
    teacherLeaves: [],
    complaints: [],
    transportRoutes: [],
    transportRequests: []
  };
}

export const SEEDS: Record<string, () => SchoolDb> = { GVS: seedGVS, SJM: seedSJM };

/** Seed resets daily so relative demo dates stay meaningful. */
export const SEED_VERSION = `v4-${todayISO()}`;
