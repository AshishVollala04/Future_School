/**
 * TransportService (Flow 4).
 *   Parent requests a new route, a change, or to stop transport
 *   -> Admin (TRANSPORT) approves (seat capacity re-checked at approval) or rejects
 *   -> the student's route/stop changes from the effective date. Audited.
 * Transport fee adjustments for later instalments are a Finance change and go through
 * governance; approving a route here never changes fees on its own.
 */
import type { Scope } from '../hooks/useScope';
import { Result } from '../types/session';
import { TransportRequest, TransportRoute } from '../types/domain';
import { getDb, saveDb } from '../mock/db';
import { SchoolDb } from '../mock/db/seed';
import { AccessDenied, guarded, RuleError, studentInScope } from './mock/guard';
import { requireAdmin } from './mock/permissions';
import { auditService } from './auditService';
import { todayISO } from '../utils/date';
import { USE_BACKEND } from '../app/backendConfig';
import { ApiTransportService } from './api/officeApiServices';

export interface RouteView extends TransportRoute {
  riders: number;
  seatsLeft: number;
}

export interface MyTransport {
  current?: { route: RouteView; stop?: { name: string; pickup: string; drop: string } };
  routes: RouteView[];
  requests: TransportRequest[];
}

export interface TransportRequestView extends TransportRequest {
  studentName: string;
  classLabel: string;
  toRouteSeatsLeft?: number;
}

export interface TransportService {
  getMine(scope: Scope): Promise<Result<MyTransport>>;
  request(scope: Scope, req: { kind: TransportRequest['kind']; toRouteId?: string; stopName?: string; reason: string; effectiveFrom: string }): Promise<Result<TransportRequest>>;
  withdraw(scope: Scope, id: string): Promise<Result<TransportRequest>>;
  listRoutes(scope: Scope): Promise<Result<(RouteView & { riderList: { id: string; name: string; classLabel: string; stop?: string }[] })[]>>;
  listRequests(scope: Scope): Promise<Result<TransportRequestView[]>>;
  decide(scope: Scope, id: string, decision: 'APPROVED' | 'REJECTED', note: string): Promise<Result<TransportRequest>>;
}

const riders = (db: SchoolDb, routeId: string) => db.students.filter(s => s.status === 'ACTIVE' && s.transportRouteId === routeId);
const view = (db: SchoolDb, r: TransportRoute): RouteView => {
  const n = riders(db, r.id).length;
  return { ...r, riders: n, seatsLeft: Math.max(0, r.capacity - n) };
};

class MockTransportService implements TransportService {
  getMine(scope: Scope) {
    return guarded((): MyTransport => {
      if (scope.role !== 'PARENT') throw new AccessDenied();
      const s = studentInScope(scope);
      const db = getDb(scope.schoolId);
      const routes = db.transportRoutes.map(r => view(db, r));
      const route = routes.find(r => r.id === s.transportRouteId);
      return {
        current: route ? { route, stop: route.stops.find(x => x.name === s.transportStop) } : undefined,
        routes,
        requests: db.transportRequests.filter(r => r.studentId === s.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      };
    });
  }

  request(scope: Scope, req: { kind: TransportRequest['kind']; toRouteId?: string; stopName?: string; reason: string; effectiveFrom: string }) {
    return guarded(() => {
      if (scope.role !== 'PARENT') throw new AccessDenied();
      const s = studentInScope(scope);
      const db = getDb(scope.schoolId);
      if (db.transportRequests.some(r => r.studentId === s.id && r.status === 'PENDING')) throw new RuleError('A request is already waiting. Withdraw it first to change it.', 'PENDING_EXISTS');
      if (req.kind === 'STOP' && !s.transportRouteId) throw new RuleError('Your child does not use school transport.', 'NO_ROUTE');
      if (req.kind !== 'STOP') {
        const route = db.transportRoutes.find(r => r.id === req.toRouteId);
        if (!route) throw new RuleError('Choose a route.', 'ROUTE');
        if (!route.stops.some(x => x.name === req.stopName)) throw new RuleError('Choose a stop on that route.', 'STOP');
        if (route.id === s.transportRouteId && req.stopName === s.transportStop) throw new RuleError('That is already your route and stop.', 'SAME');
      }
      if (req.effectiveFrom < todayISO()) throw new RuleError('The start date cannot be in the past.', 'DATE');
      if (req.reason.trim().length < 5) throw new RuleError('Add a short reason.', 'REASON');
      const r: TransportRequest = {
        id: `TRQ-${scope.schoolId}-${Date.now().toString(36)}`, schoolId: scope.schoolId, studentId: s.id, requestedByGuardianId: scope.userId,
        kind: s.transportRouteId ? (req.kind === 'STOP' ? 'STOP' : 'CHANGE') : 'NEW',
        fromRouteId: s.transportRouteId, toRouteId: req.kind === 'STOP' ? undefined : req.toRouteId, stopName: req.kind === 'STOP' ? undefined : req.stopName,
        reason: req.reason.trim().slice(0, 300), effectiveFrom: req.effectiveFrom, status: 'PENDING', createdAt: new Date().toISOString()
      };
      db.transportRequests.push(r);
      saveDb(db);
      return r;
    });
  }

  withdraw(scope: Scope, id: string) {
    return guarded(() => {
      if (scope.role !== 'PARENT') throw new AccessDenied();
      const s = studentInScope(scope);
      const db = getDb(scope.schoolId);
      const r = db.transportRequests.find(x => x.id === id && x.studentId === s.id);
      if (!r) throw new AccessDenied('Request not found.');
      if (r.status !== 'PENDING') throw new RuleError('Only a waiting request can be withdrawn.', 'STATE');
      r.status = 'WITHDRAWN';
      saveDb(db);
      return r;
    });
  }

  listRoutes(scope: Scope) {
    return guarded(() => {
      requireAdmin(scope, 'TRANSPORT');
      const db = getDb(scope.schoolId);
      return db.transportRoutes.map(r => ({
        ...view(db, r),
        riderList: riders(db, r.id).map(s => ({ id: s.id, name: s.name, classLabel: `${s.grade}-${s.section}`, stop: s.transportStop }))
      }));
    });
  }

  listRequests(scope: Scope) {
    return guarded(() => {
      requireAdmin(scope, 'TRANSPORT');
      const db = getDb(scope.schoolId);
      return db.transportRequests
        .map(r => {
          const s = db.students.find(x => x.id === r.studentId);
          const to = db.transportRoutes.find(x => x.id === r.toRouteId);
          return { ...r, studentName: s?.name ?? r.studentId, classLabel: s ? `${s.grade}-${s.section}` : '', toRouteSeatsLeft: to ? view(db, to).seatsLeft : undefined };
        })
        .sort((a, b) => Number(b.status === 'PENDING') - Number(a.status === 'PENDING') || b.createdAt.localeCompare(a.createdAt));
    });
  }

  decide(scope: Scope, id: string, decision: 'APPROVED' | 'REJECTED', note: string) {
    return guarded(() => {
      requireAdmin(scope, 'TRANSPORT');
      const db = getDb(scope.schoolId);
      const r = db.transportRequests.find(x => x.id === id);
      if (!r) throw new AccessDenied('Request not found.');
      if (r.status !== 'PENDING') throw new RuleError('Already decided.', 'STATE');
      if (decision === 'REJECTED' && note.trim().length < 5) throw new RuleError('Tell the parent why (5+ characters).', 'REASON');
      const s = db.students.find(x => x.id === r.studentId);
      if (!s) throw new AccessDenied('Student not found.');
      if (decision === 'APPROVED') {
        if (r.kind === 'STOP') {
          s.transportRouteId = undefined;
          s.transportStop = undefined;
        } else {
          const route = db.transportRoutes.find(x => x.id === r.toRouteId);
          if (!route) throw new RuleError('Route no longer exists.', 'ROUTE');
          const moving = s.transportRouteId !== route.id;
          if (moving && view(db, route).seatsLeft <= 0) throw new RuleError(`${route.name} is full (${route.capacity} seats). Reject, or offer another route.`, 'FULL');
          s.transportRouteId = route.id;
          s.transportStop = r.stopName;
        }
      }
      r.status = decision;
      r.decision = { by: scope.userId, at: new Date().toISOString(), note: note.trim() || undefined };
      saveDb(db);
      auditService.record({
        schoolId: scope.schoolId, action: `TRANSPORT_${decision}`, actorId: scope.userId, actorRole: scope.role, targetId: s.id,
        details: `${r.kind} ${r.fromRouteId ?? '-'} -> ${r.toRouteId ?? 'none'} from ${r.effectiveFrom}`, reason: note.trim() || undefined
      });
      return r;
    });
  }
}

export const transportService: TransportService = USE_BACKEND ? new ApiTransportService() : new MockTransportService();
