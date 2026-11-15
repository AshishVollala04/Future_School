/**
 * Product feature flags. Per-school overrides will come from the school profile later.
 * Students have no phones: the student experience is a read-only Child View inside the parent session.
 */
export const FEATURES = {
  STUDENT_LOGIN: false,
  STUDENT_AI_TUTOR: false,
  STUDENT_QUIZ: false,
  /** Internal platform console (school onboarding). Not part of the school app. */
  PLATFORM_CONSOLE: false
} as const;

export type FeatureName = keyof typeof FEATURES;

export const isEnabled = (f: FeatureName): boolean => FEATURES[f];
