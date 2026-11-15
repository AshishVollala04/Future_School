/**
 * School (tenant) profile as seen by a signed-in user of THAT school.
 * Platform-level fields (subscription, capacity, billing) live in types/tenant.ts
 * and are only used by the internal platform console.
 */
export interface AcademicYear {
  id: string;       // e.g. 'AY-2026-27'
  label: string;    // e.g. '2026-27'
  startsOn: string; // ISO date
  endsOn: string;   // ISO date
  status: 'ACTIVE' | 'CLOSED';
}

export interface SchoolProfile {
  id: string;            // tenant id, e.g. 'GVS'
  name: string;
  shortName: string;
  city: string;
  district: string;
  state: string;
  udiseCode?: string;
  boardProfileId: string; // e.g. 'TELANGANA_SSC'
  academicYear: AcademicYear;
  /** Branding. Defaults to FutureSchool teal/orange; schools may override later. */
  branding: {
    primary: string;
    accent: string;
    logoUrl?: string; // when absent the UI shows initials
  };
  contact: {
    phone: string;
    email: string;
    address: string;
  };
}
