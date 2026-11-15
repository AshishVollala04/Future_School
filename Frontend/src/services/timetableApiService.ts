/**
 * FutureSchool - Timetable API Service
 * Interacts with Spring Boot backend at /api/timetable
 */
import { apiClient } from './apiClient';

export interface TimetableSlotDTO {
  id?: number;
  classId: string;
  dayOfWeek: string;
  periodNumber: number;
  startTime: string;
  endTime: string;
  subject: string;
  teacherId?: string;
  teacherName?: string;
  roomNumber?: string;
}

export const TimetableApiService = {
  getByClass: (classId: string) =>
    apiClient.get<TimetableSlotDTO[]>(`/api/timetable/class/${classId}`),

  getByTeacher: (teacherId: string) =>
    apiClient.get<TimetableSlotDTO[]>(`/api/timetable/teacher/${teacherId}`),

  saveSlot: (slot: TimetableSlotDTO) =>
    apiClient.post<TimetableSlotDTO>('/api/timetable', slot),

  saveBulk: (classId: string, slots: TimetableSlotDTO[]) =>
    apiClient.post<TimetableSlotDTO[]>(`/api/timetable/bulk/${classId}`, slots),
};
