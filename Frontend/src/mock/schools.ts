/**
 * Prototype / mock school profiles. Fictional schools; any resemblance is coincidental.
 * Read only through services/schoolProfileService.ts.
 */
import { SchoolProfile } from '../types/school';

const AY_2026_27 = {
  id: 'AY-2026-27',
  label: '2026-27',
  startsOn: '2026-06-12',
  endsOn: '2027-04-23',
  status: 'ACTIVE' as const
};

const DEFAULT_BRANDING = { primary: '#1d4ed8', accent: '#ea580c' };

export const MOCK_SCHOOL_PROFILES: Record<string, SchoolProfile> = {
  GVS: {
    id: 'GVS',
    name: 'Greenwood Valley High School',
    shortName: 'Greenwood Valley',
    city: 'Hyderabad',
    district: 'Medchal-Malkajgiri',
    state: 'Telangana',
    boardProfileId: 'TELANGANA_SSC',
    academicYear: AY_2026_27,
    branding: DEFAULT_BRANDING,
    contact: {
      phone: '+91 40 0000 1001',
      email: 'office@greenwoodvalley.edu.in',
      address: 'Kompally, Hyderabad, Telangana'
    }
  },
  SJM: {
    id: 'SJM',
    name: 'St. Jude Model High School',
    shortName: 'St. Jude Model',
    city: 'Secunderabad',
    district: 'Hyderabad',
    state: 'Telangana',
    boardProfileId: 'CBSE',
    academicYear: AY_2026_27,
    branding: DEFAULT_BRANDING,
    contact: {
      phone: '+91 40 0000 2002',
      email: 'office@stjudemodel.edu.in',
      address: 'West Marredpally, Secunderabad, Telangana'
    }
  }
};
