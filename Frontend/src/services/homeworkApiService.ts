/**
 * FutureSchool - Homework API Service
 * Interacts with Spring Boot backend at /api/homework
 */
import { apiClient } from './apiClient';

export interface HomeworkDTO {
  id: string;
  title: string;
  subject: string;
  classId: string;
  teacherId?: string;
  teacherName?: string;
  description?: string;
  dueDate: string;
  submissionDate?: string;
  status?: string;
}

export const HomeworkApiService = {
  getAll: (classId?: string, teacherId?: string) => {
    let url = '/api/homework';
    const params = new URLSearchParams();
    if (classId) params.append('classId', classId);
    if (teacherId) params.append('teacherId', teacherId);
    const queryString = params.toString();
    if (queryString) url += `?${queryString}`;
    return apiClient.get<HomeworkDTO[]>(url);
  },

  create: (homework: Partial<HomeworkDTO>) =>
    apiClient.post<HomeworkDTO>('/api/homework', homework),

  delete: (id: string) =>
    apiClient.delete<{ success: boolean; message: string }>(`/api/homework/${id}`),
};
