/**
 * FutureSchool - Notice API Service
 * Interacts with Spring Boot backend at /api/notices
 */
import { apiClient } from './apiClient';

export interface SchoolNoticeDTO {
  id: string;
  title: string;
  content: string;
  date: string;
  targetRole?: string;
  important?: boolean;
  author?: string;
}

export const NoticeApiService = {
  getAll: (role?: string) => {
    const url = role ? `/api/notices?role=${encodeURIComponent(role)}` : '/api/notices';
    return apiClient.get<SchoolNoticeDTO[]>(url);
  },

  create: (notice: Partial<SchoolNoticeDTO>) =>
    apiClient.post<SchoolNoticeDTO>('/api/notices', notice),

  delete: (id: string) =>
    apiClient.delete<{ success: boolean; message: string }>(`/api/notices/${id}`),
};
