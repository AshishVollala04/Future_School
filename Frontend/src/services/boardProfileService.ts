/**
 * FutureSchool - Board Profile configuration (versioned, configurable).
 *
 * TELANGANA_SSC v2026.1. Class 10 values follow the product brief
 * (100 = 80 external + 20 internal, 35% pass, Second Language 20% pass mark,
 * Science split into Physical Science + Biology).
 * Classes 1-9 are PLACEHOLDER values until real school report cards are provided.
 * State rules change; nothing here is a claim of regulatory compliance.
 */

export interface SubjectAssessmentRule {
  code: string;
  name: string;
  type: 'LANGUAGE_1' | 'LANGUAGE_2' | 'LANGUAGE_3' | 'CORE_SUBJECT' | 'SPLIT_CORE';
  maxFaMarks: number;     // Formative Assessment (Internal, default 20)
  maxSaMarks: number;     // Summative Assessment (External, default 80)
  totalMarks: number;     // 100
  passMarks: number;      // 35% normally, 20% for Second Language (Telangana SSC rule)
  papers?: {
    code: string;
    name: string;
    maxFaMarks: number;
    maxSaMarks: number;
    totalMarks: number;
  }[];
}

export interface StageRule {
  classBand: 'CLASSES_1_5' | 'CLASSES_6_8' | 'CLASSES_9_10';
  classes: number[];
  termExams: string[];    // e.g. ['FA-1', 'FA-2', 'SA-1', 'FA-3', 'FA-4', 'Pre-Final', 'SA-2 (SSC)']
  subjects: SubjectAssessmentRule[];
  defaultPassPercentage: number;
}

export interface BoardProfile {
  id: string;             // 'TELANGANA_SSC'
  version: string;
  /** Classes whose rules are placeholders, not confirmed from real report cards. */
  placeholderClasses: number[];
  name: string;           // 'Telangana State Board of Secondary Education (SSC)'
  /** Short label for badges and headings: 'SSC', 'CBSE'. */
  shortName: string;
  /** What the two parts of a subject's marks are called on screens and report cards. */
  markLabels: { internal: string; external: string };
  /** Lowest passing percentage for most subjects. */
  passPercentage: number;
  stateCode: 'TS' | null;
  academicYear: '2026-2027';
  stages: Record<'CLASSES_1_5' | 'CLASSES_6_8' | 'CLASSES_9_10', StageRule>;
  gradingScale: {
    grade: string;
    gradePoints: number;
    minPercentage: number;
    maxPercentage: number;
    description: string;
  }[];
}

export const TELANGANA_SSC_PROFILE: BoardProfile = {
  id: 'TELANGANA_SSC',
  version: '2026.1',
  placeholderClasses: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  name: 'Telangana State Board of Secondary Education (SSC)',
  shortName: 'SSC',
  markLabels: { internal: 'FA (internal)', external: 'SA (external)' },
  passPercentage: 35,
  stateCode: 'TS',
  academicYear: '2026-2027',
  gradingScale: [
    { grade: 'A1', gradePoints: 10, minPercentage: 91, maxPercentage: 100, description: 'Outstanding Mastery' },
    { grade: 'A2', gradePoints: 9,  minPercentage: 81, maxPercentage: 90,  description: 'Excellent Proficiency' },
    { grade: 'B1', gradePoints: 8,  minPercentage: 71, maxPercentage: 80,  description: 'Very Good' },
    { grade: 'B2', gradePoints: 7,  minPercentage: 61, maxPercentage: 70,  description: 'Good' },
    { grade: 'C1', gradePoints: 6,  minPercentage: 51, maxPercentage: 60,  description: 'Satisfactory' },
    { grade: 'C2', gradePoints: 5,  minPercentage: 41, maxPercentage: 50,  description: 'Fair' },
    { grade: 'D',  gradePoints: 4,  minPercentage: 35, maxPercentage: 40,  description: 'Pass (Marginal)' },
    { grade: 'E',  gradePoints: 3,  minPercentage: 0,  maxPercentage: 34,  description: 'Needs Improvement / Remedial' }
  ],
  stages: {
    CLASSES_1_5: {
      classBand: 'CLASSES_1_5',
      classes: [1, 2, 3, 4, 5],
      termExams: ['FA-1', 'FA-2', 'SA-1', 'FA-3', 'FA-4', 'SA-2'],
      defaultPassPercentage: 35,
      subjects: [
        { code: 'TS-PR-L1', name: 'First Language (Telugu / Urdu)', type: 'LANGUAGE_1', maxFaMarks: 20, maxSaMarks: 80, totalMarks: 100, passMarks: 35 },
        { code: 'TS-PR-L2', name: 'Second Language (Hindi / Telugu)', type: 'LANGUAGE_2', maxFaMarks: 20, maxSaMarks: 80, totalMarks: 100, passMarks: 20 },
        { code: 'TS-PR-L3', name: 'Third Language (English)', type: 'LANGUAGE_3', maxFaMarks: 20, maxSaMarks: 80, totalMarks: 100, passMarks: 35 },
        { code: 'TS-PR-MTH', name: 'Mathematics', type: 'CORE_SUBJECT', maxFaMarks: 20, maxSaMarks: 80, totalMarks: 100, passMarks: 35 },
        { code: 'TS-PR-EVS', name: 'Environmental Studies', type: 'CORE_SUBJECT', maxFaMarks: 20, maxSaMarks: 80, totalMarks: 100, passMarks: 35 }
      ]
    },
    CLASSES_6_8: {
      classBand: 'CLASSES_6_8',
      classes: [6, 7, 8],
      termExams: ['FA-1', 'FA-2', 'SA-1', 'FA-3', 'FA-4', 'SA-2'],
      defaultPassPercentage: 35,
      subjects: [
        { code: 'TS-UP-L1', name: 'First Language (Telugu / Composite)', type: 'LANGUAGE_1', maxFaMarks: 20, maxSaMarks: 80, totalMarks: 100, passMarks: 35 },
        { code: 'TS-UP-L2', name: 'Second Language (Hindi / Telugu)', type: 'LANGUAGE_2', maxFaMarks: 20, maxSaMarks: 80, totalMarks: 100, passMarks: 20 },
        { code: 'TS-UP-L3', name: 'Third Language (English)', type: 'LANGUAGE_3', maxFaMarks: 20, maxSaMarks: 80, totalMarks: 100, passMarks: 35 },
        { code: 'TS-UP-MTH', name: 'Mathematics', type: 'CORE_SUBJECT', maxFaMarks: 20, maxSaMarks: 80, totalMarks: 100, passMarks: 35 },
        { code: 'TS-UP-SCI', name: 'General Science', type: 'CORE_SUBJECT', maxFaMarks: 20, maxSaMarks: 80, totalMarks: 100, passMarks: 35 },
        { code: 'TS-UP-SOC', name: 'Social Studies', type: 'CORE_SUBJECT', maxFaMarks: 20, maxSaMarks: 80, totalMarks: 100, passMarks: 35 }
      ]
    },
    CLASSES_9_10: {
      classBand: 'CLASSES_9_10',
      classes: [9, 10],
      termExams: ['FA-1', 'FA-2', 'SA-1', 'FA-3', 'FA-4', 'SA-2', 'Pre-Final', 'Final'],
      defaultPassPercentage: 35,
      subjects: [
        {
          code: '01T/01U',
          name: 'First Language (Telugu / Urdu / Regional)',
          type: 'LANGUAGE_1',
          maxFaMarks: 20,
          maxSaMarks: 80,
          totalMarks: 100,
          passMarks: 35
        },
        {
          code: '02H/02T',
          name: 'Second Language (Hindi / Telugu)',
          type: 'LANGUAGE_2',
          maxFaMarks: 20,
          maxSaMarks: 80,
          totalMarks: 100,
          passMarks: 20 // Note: Telangana SSC Board rule specifically sets Second Language pass marks to 20%
        },
        {
          code: '03E',
          name: 'Third Language (English)',
          type: 'LANGUAGE_3',
          maxFaMarks: 20,
          maxSaMarks: 80,
          totalMarks: 100,
          passMarks: 35
        },
        {
          code: '15E',
          name: 'Mathematics',
          type: 'CORE_SUBJECT',
          maxFaMarks: 20,
          maxSaMarks: 80,
          totalMarks: 100,
          passMarks: 35
        },
        {
          code: '19E/20E',
          name: 'General Science (Physical & Biological)',
          type: 'SPLIT_CORE',
          maxFaMarks: 20,
          maxSaMarks: 80,
          totalMarks: 100,
          passMarks: 35,
          papers: [
            { code: '19E', name: 'Paper I: Physical Science (Physics & Chemistry)', maxFaMarks: 10, maxSaMarks: 40, totalMarks: 50 },
            { code: '20E', name: 'Paper II: Biological Science (Botany & Zoology)', maxFaMarks: 10, maxSaMarks: 40, totalMarks: 50 }
          ]
        },
        {
          code: '21E',
          name: 'Social Studies (History, Civics, Geography & Economics)',
          type: 'CORE_SUBJECT',
          maxFaMarks: 20,
          maxSaMarks: 80,
          totalMarks: 100,
          passMarks: 35
        }
      ]
    }
  }
};

/**
 * Calculates grade and grade points based on percentage and absence
 * Conforms strictly to PRD 2.0: Absence is 'AB', never '0'.
 */
export function calculateTelanganaSscGrade(
  totalMarks: number,
  isAbsent: boolean,
  subjectType: 'LANGUAGE_1' | 'LANGUAGE_2' | 'LANGUAGE_3' | 'CORE_SUBJECT' | 'SPLIT_CORE' = 'CORE_SUBJECT'
): { grade: string; gradePoints: number; isPassed: boolean; remark: string } {
  if (isAbsent) {
    return {
      grade: 'AB',
      gradePoints: 0,
      isPassed: false,
      remark: 'Absent (Exam Not Taken)'
    };
  }

  // Second Language pass mark is 20% in Telangana SSC
  const passRequirement = subjectType === 'LANGUAGE_2' ? 20 : 35;
  const isPassed = totalMarks >= passRequirement;

  if (totalMarks >= 91) return { grade: 'A1', gradePoints: 10, isPassed: true, remark: 'Outstanding' };
  if (totalMarks >= 81) return { grade: 'A2', gradePoints: 9,  isPassed: true, remark: 'Excellent' };
  if (totalMarks >= 71) return { grade: 'B1', gradePoints: 8,  isPassed: true, remark: 'Very Good' };
  if (totalMarks >= 61) return { grade: 'B2', gradePoints: 7,  isPassed: true, remark: 'Good' };
  if (totalMarks >= 51) return { grade: 'C1', gradePoints: 6,  isPassed: true, remark: 'Satisfactory' };
  if (totalMarks >= 41) return { grade: 'C2', gradePoints: 5,  isPassed: true, remark: 'Fair' };
  
  if (totalMarks >= passRequirement) {
    return { grade: 'D', gradePoints: 4, isPassed: true, remark: 'Pass' };
  }

  return { grade: 'E', gradePoints: 3, isPassed: false, remark: 'Needs Improvement' };
}

/**
 * Calculates GPA from array of subject scores
 */
export function calculateTelanganaGpa(
  subjects: Array<{ totalMarks: number; isAbsent: boolean; type?: 'LANGUAGE_1' | 'LANGUAGE_2' | 'LANGUAGE_3' | 'CORE_SUBJECT' | 'SPLIT_CORE' }>
): { gpa: number; isAllPassed: boolean; totalGradePoints: number } {
  if (!subjects.length) return { gpa: 0, isAllPassed: false, totalGradePoints: 0 };

  let totalPoints = 0;
  let isAllPassed = true;

  for (const s of subjects) {
    const res = calculateTelanganaSscGrade(s.totalMarks, s.isAbsent, s.type || 'CORE_SUBJECT');
    totalPoints += res.gradePoints;
    if (!res.isPassed) {
      isAllPassed = false;
    }
  }

  const gpa = Number((totalPoints / subjects.length).toFixed(1));
  return {
    gpa,
    isAllPassed,
    totalGradePoints: totalPoints
  };
}

/**
 * CBSE v2026.1: the common pattern most CBSE schools use, as configurable settings.
 *   Exams: Periodic Test 1-3, Half-Yearly, Annual (Class 10: Board Exam).
 *   Classes 9-10: 80 theory + 20 internal assessment; 33% to pass.
 *   Grades A1-E on the 8-point scale CBSE uses for school report cards.
 * Telangana requires Telugu as a subject in all schools, CBSE included.
 * CBSE changes its scheme by circular; check the current year's circular before go-live.
 */
const cbseSubjects = (band: string, science: string) => [
  { code: `CB-${band}-ENG`, name: 'English', type: 'LANGUAGE_1' as const, maxFaMarks: 20, maxSaMarks: 80, totalMarks: 100, passMarks: 33 },
  { code: `CB-${band}-HIN`, name: 'Hindi', type: 'LANGUAGE_2' as const, maxFaMarks: 20, maxSaMarks: 80, totalMarks: 100, passMarks: 33 },
  { code: `CB-${band}-TEL`, name: 'Telugu', type: 'LANGUAGE_3' as const, maxFaMarks: 20, maxSaMarks: 80, totalMarks: 100, passMarks: 33 },
  { code: `CB-${band}-MTH`, name: 'Mathematics', type: 'CORE_SUBJECT' as const, maxFaMarks: 20, maxSaMarks: 80, totalMarks: 100, passMarks: 33 },
  { code: `CB-${band}-SCI`, name: science, type: 'CORE_SUBJECT' as const, maxFaMarks: 20, maxSaMarks: 80, totalMarks: 100, passMarks: 33 }
];

export const CBSE_PROFILE: BoardProfile = {
  id: 'CBSE',
  version: '2026.1',
  placeholderClasses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  name: 'Central Board of Secondary Education (CBSE)',
  shortName: 'CBSE',
  markLabels: { internal: 'Internal assessment', external: 'Theory' },
  passPercentage: 33,
  stateCode: null,
  academicYear: '2026-2027',
  gradingScale: [
    { grade: 'A1', gradePoints: 10, minPercentage: 91, maxPercentage: 100, description: 'Outstanding' },
    { grade: 'A2', gradePoints: 9,  minPercentage: 81, maxPercentage: 90,  description: 'Excellent' },
    { grade: 'B1', gradePoints: 8,  minPercentage: 71, maxPercentage: 80,  description: 'Very good' },
    { grade: 'B2', gradePoints: 7,  minPercentage: 61, maxPercentage: 70,  description: 'Good' },
    { grade: 'C1', gradePoints: 6,  minPercentage: 51, maxPercentage: 60,  description: 'Fair' },
    { grade: 'C2', gradePoints: 5,  minPercentage: 41, maxPercentage: 50,  description: 'Average' },
    { grade: 'D',  gradePoints: 4,  minPercentage: 33, maxPercentage: 40,  description: 'Pass' },
    { grade: 'E',  gradePoints: 0,  minPercentage: 0,  maxPercentage: 32,  description: 'Needs improvement' }
  ],
  stages: {
    CLASSES_1_5: {
      classBand: 'CLASSES_1_5',
      classes: [1, 2, 3, 4, 5],
      termExams: ['PT-1', 'Half-Yearly', 'PT-2', 'Annual'],
      defaultPassPercentage: 33,
      subjects: cbseSubjects('PR', 'Environmental Studies (EVS)')
    },
    CLASSES_6_8: {
      classBand: 'CLASSES_6_8',
      classes: [6, 7, 8],
      termExams: ['PT-1', 'Half-Yearly', 'PT-2', 'PT-3', 'Annual'],
      defaultPassPercentage: 33,
      subjects: [...cbseSubjects('UP', 'Science'), { code: 'CB-UP-SST', name: 'Social Science', type: 'CORE_SUBJECT', maxFaMarks: 20, maxSaMarks: 80, totalMarks: 100, passMarks: 33 }]
    },
    CLASSES_9_10: {
      classBand: 'CLASSES_9_10',
      classes: [9, 10],
      termExams: ['PT-1', 'Half-Yearly', 'PT-2', 'PT-3', 'Pre-Board', 'Annual', 'Board Exam'],
      defaultPassPercentage: 33,
      subjects: [...cbseSubjects('SEC', 'Science'), { code: 'CB-SEC-SST', name: 'Social Science', type: 'CORE_SUBJECT', maxFaMarks: 20, maxSaMarks: 80, totalMarks: 100, passMarks: 33 }]
    }
  }
};

const BOARD_PROFILES: Record<string, BoardProfile> = {
  CBSE: CBSE_PROFILE,
  [TELANGANA_SSC_PROFILE.id]: TELANGANA_SSC_PROFILE
};

/** Older and server names for the same board. */
const BOARD_ALIASES: Record<string, string> = { STATE_SSC: 'TELANGANA_SSC', TS_SSC: 'TELANGANA_SSC' };

export function getBoardProfile(id: string): BoardProfile | null {
  return BOARD_PROFILES[BOARD_ALIASES[id] ?? id] ?? null;
}

/** The board's grade for a percentage (A1 ... E). Absence is never graded; callers show AB. */
export function gradeForPercentage(profile: BoardProfile | null, pct: number): string {
  const scale = (profile ?? TELANGANA_SSC_PROFILE).gradingScale;
  return (scale.find(g => pct >= g.minPercentage) ?? scale[scale.length - 1]).grade;
}

/** Every exam name the board uses, in the order of the school year (for sorting results). */
export function examOrder(profile: BoardProfile | null): string[] {
  const p = profile ?? TELANGANA_SSC_PROFILE;
  const seen: string[] = [];
  // The senior band lists every exam in the year's order; younger bands use a subset.
  for (const band of ['CLASSES_9_10', 'CLASSES_6_8', 'CLASSES_1_5'] as const) {
    for (const e of p.stages[band].termExams) if (!seen.includes(e)) seen.push(e);
  }
  return seen;
}

export function isPlaceholderClass(profile: BoardProfile, classNumber: number): boolean {
  return profile.placeholderClasses.includes(classNumber);
}
