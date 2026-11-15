/**
 * FutureSchool - Fee API Service
 * Interacts with Spring Boot backend at /api/fees
 */
import { apiClient } from './apiClient';

export interface FeeTransactionDTO {
  id: string;
  receiptNumber: string;
  studentId: string;
  studentName: string;
  classId: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  feeHead: string;
  remarks?: string;
  status?: string;
}

export const FeeApiService = {
  getByStudent: (studentId: string) =>
    apiClient.get<FeeTransactionDTO[]>(`/api/fees/student/${studentId}`),

  collectPayment: (payload: {
    id?: string;
    receiptNumber: string;
    studentId: string;
    studentName: string;
    classId: string;
    amount: number;
    paymentDate: string;
    paymentMethod: string;
    feeHead: string;
  }) => apiClient.post<FeeTransactionDTO>('/api/fees/collect', payload),

  getAllTransactions: () =>
    apiClient.get<FeeTransactionDTO[]>('/api/fees/transactions'),
};
