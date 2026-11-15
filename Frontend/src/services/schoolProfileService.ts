/**
 * SchoolProfileService: the active school's name, branding, board profile and academic year.
 * Production: GET /api/schools/current, where the school comes from the token, never a parameter
 * the client can change. The mock takes schoolId from the session for the same effect.
 */
import { SchoolProfile } from '../types/school';
import { Result } from '../types/session';
import { MOCK_SCHOOL_PROFILES } from '../mock/schools';
import { USE_BACKEND } from '../app/backendConfig';
import { api } from './api/http';

export interface SchoolProfileService {
  getProfile(schoolId: string): Promise<Result<SchoolProfile>>;
  updateProfile?(body: { name?: string; address?: string; phone?: string; email?: string; lateFeePolicy?: string }): Promise<Result<SchoolProfile>>;
}

export class MockSchoolProfileService implements SchoolProfileService {
  async getProfile(schoolId: string): Promise<Result<SchoolProfile>> {
    const p = MOCK_SCHOOL_PROFILES[schoolId];
    return p ? { ok: true, data: p } : { ok: false, error: 'School not found.', code: 'NOT_FOUND' };
  }
}

export class ApiSchoolProfileService implements SchoolProfileService {
  getProfile(_schoolId: string): Promise<Result<SchoolProfile>> {
    return api.get<SchoolProfile>('/api/schools/current');
  }

  updateProfile(body: { name?: string; address?: string; phone?: string; email?: string; lateFeePolicy?: string }): Promise<Result<SchoolProfile>> {
    return api.put<SchoolProfile>('/api/schools/current', body);
  }
}

export const schoolProfileService: SchoolProfileService = USE_BACKEND
  ? new ApiSchoolProfileService()
  : new MockSchoolProfileService();
