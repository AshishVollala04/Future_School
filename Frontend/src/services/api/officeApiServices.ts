/** Backend-backed complaints and transport (VITE_BACKEND=api). Same interfaces as the prototype services. */
import type { Scope } from '../../hooks/useScope';
import { Complaint, ComplaintCategory, TransportRequest } from '../../types/domain';
import type { ComplaintService, ComplaintView } from '../complaintService';
import type { MyTransport, RouteView, TransportRequestView, TransportService } from '../transportService';
import { api } from './http';

export class ApiComplaintService implements ComplaintService {
  listMine = (_s: Scope) => api.get<Complaint[]>('/api/parent/complaints');
  raise = (_s: Scope, req: { category: ComplaintCategory; subject: string; description: string }) => api.post<Complaint>('/api/parent/complaints', req);
  confirmResolved = (_s: Scope, id: string) => api.post<Complaint>(`/api/parent/complaints/${encodeURIComponent(id)}/confirm`, {});
  reopen = (_s: Scope, id: string, reason: string) => api.post<Complaint>(`/api/parent/complaints/${encodeURIComponent(id)}/reopen`, { reason });
  listForSchool = (_s: Scope) => api.get<ComplaintView[]>('/api/staff/complaints');
  respond = (_s: Scope, id: string, note: string, status: 'IN_PROGRESS' | 'RESOLVED') =>
    api.post<Complaint>(`/api/staff/complaints/${encodeURIComponent(id)}/respond`, { note, status });
}

export class ApiTransportService implements TransportService {
  getMine = (_s: Scope) => api.get<MyTransport>('/api/parent/transport');
  request = (_s: Scope, req: { kind: TransportRequest['kind']; toRouteId?: string; stopName?: string; reason: string; effectiveFrom: string }) =>
    api.post<TransportRequest>('/api/parent/transport/requests', req);
  withdraw = (_s: Scope, id: string) => api.post<TransportRequest>(`/api/parent/transport/requests/${encodeURIComponent(id)}/withdraw`, {});
  listRoutes = (_s: Scope) => api.get<(RouteView & { riderList: { id: string; name: string; classLabel: string; stop?: string }[] })[]>('/api/office/transport/routes');
  listRequests = (_s: Scope) => api.get<TransportRequestView[]>('/api/office/transport/requests');
  decide = (_s: Scope, id: string, decision: 'APPROVED' | 'REJECTED', note: string) =>
    api.post<TransportRequest>(`/api/office/transport/requests/${encodeURIComponent(id)}/decision`, { decision, note });
}
