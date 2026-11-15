/**
 * FutureSchool - Auth API Service
 * Interacts with Spring Boot backend at /api/auth
 */
import { apiClient } from './apiClient';

export interface AuthLoginResponse {
  token: string;
  role: string;
  name: string;
  loginId: string;
  studentId?: string;
  teacherId?: string;
  email?: string;
}

export interface UserAccountDTO {
  id?: number;
  loginId: string;
  name: string;
  email: string;
  role: string;
  studentId?: string;
  teacherId?: string;
  active: boolean;
}

export const AuthApiService = {
  /**
   * Real backend authentication with Spring Boot
   */
  login: async (loginId: string, password: string): Promise<AuthLoginResponse | null> => {
    return apiClient.post<AuthLoginResponse>('/api/auth/login', { loginId, password });
  },

  /**
   * Retrieve current authenticated user profile
   */
  getCurrentUser: async (): Promise<UserAccountDTO | null> => {
    return apiClient.get<UserAccountDTO>('/api/auth/me');
  },

  /**
   * List all system accounts (optionally filtered by role)
   */
  getAllUsers: async (role?: string): Promise<UserAccountDTO[] | null> => {
    const url = role ? `/api/auth/users?role=${encodeURIComponent(role)}` : '/api/auth/users';
    return apiClient.get<UserAccountDTO[]>(url);
  },

  /**
   * Change user password
   */
  changePassword: async (oldPassword: string, newPassword: string): Promise<{ success: boolean; message: string } | null> => {
    return apiClient.put<{ success: boolean; message: string }>('/api/auth/change-password', {
      oldPassword,
      newPassword,
    });
  },
};
