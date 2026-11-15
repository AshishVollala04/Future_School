// API-mode contract checks: verifies real HTTP paths, headers, payloads and error handling against mocked fetch.
import assert from 'node:assert/strict';

process.env.VITE_BACKEND = 'api';

const store = new Map<string, string>();
const localStorageShim = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  get length() { return store.size; }
};
(globalThis as Record<string, unknown>).localStorage = localStorageShim;
const events: string[] = [];
(globalThis as Record<string, unknown>).window = {
  localStorage: localStorageShim,
  location: { hostname: 'localhost', origin: 'http://localhost:3000' },
  dispatchEvent: (e: { type?: string }) => { events.push(e.type ?? ''); return true; }
};
(globalThis as Record<string, unknown>).CustomEvent = class {
  type: string;
  constructor(type: string) { this.type = type; }
};

interface RecordedReq { method: string; url: string; headers: Record<string, string>; body?: string }
const recorded: RecordedReq[] = [];
let nextResponse: { status: number; body: unknown; headers?: Record<string, string> } = { status: 200, body: {} };

(globalThis as Record<string, unknown>).fetch = async (url: string, init: RequestInit = {}) => {
  recorded.push({
    method: init.method ?? 'GET',
    url,
    headers: (init.headers as Record<string, string>) ?? {},
    body: typeof init.body === 'string' ? init.body : undefined
  });
  const text = nextResponse.body === null ? '' : typeof nextResponse.body === 'string' ? nextResponse.body : JSON.stringify(nextResponse.body);
  return {
    ok: nextResponse.status >= 200 && nextResponse.status < 300,
    status: nextResponse.status,
    headers: new Headers(nextResponse.headers ?? {}),
    text: async () => text,
    blob: async () => new Blob([text], { type: 'text/csv' })
  };
};

// Seed active API session in localStorage using storage prefix `fs:`
store.set('fs:auth:session', JSON.stringify({
  session: {
    sessionId: 'S1',
    userId: 'ACC-L-0002',
    schoolId: 'GVS',
    role: 'ADMIN',
    authMethods: ['PASSWORD', 'EMAIL_OTP'],
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    accessToken: 'jwt-test-token',
    profile: { name: 'S. Sundaram', title: 'Admin' }
  },
  adminPermissions: ['FINANCE', 'ADMISSIONS', 'SECURITY', 'REPORTS'],
  adminQuorum: { activeAdmins: 2, meetsMinimum: true }
}));

const { api } = await import('../../src/services/api/http.ts');
const { schoolProfileService } = await import('../../src/services/schoolProfileService.ts');
const { udiseService } = await import('../../src/services/udiseService.ts');
const { studentDirectoryService } = await import('../../src/services/studentDirectoryService.ts');
const { withApiAdmin, withApiCounts } = await import('../../src/services/api/governanceApiServices.ts');

let passed = 0;
function check(name: string, fn: () => Promise<void> | void) {
  return Promise.resolve().then(fn).then(() => {
    console.log('PASS ' + name);
    passed++;
  });
}

await check('http helper sends GET/POST/PUT/PATCH with Bearer token', async () => {
  recorded.length = 0;
  nextResponse = { status: 200, body: { id: 'GVS', name: 'Greenwood' } };
  const r1 = await api.get<{ id: string }>('/api/schools/current');
  assert.equal(r1.ok, true);
  assert.equal(recorded[0].headers.Authorization, 'Bearer jwt-test-token');
  assert.equal(recorded[0].method, 'GET');

  await api.put('/api/students/S1', { apaarId: 'APAAR1' });
  assert.equal(recorded[1].method, 'PUT');
  assert.equal(recorded[1].headers['Content-Type'], 'application/json');
  assert.equal(recorded[1].body, JSON.stringify({ apaarId: 'APAAR1' }));

  await api.patch('/api/students/S1/hall-ticket', { released: true });
  assert.equal(recorded[2].method, 'PATCH');
});

await check('http helper emits futureschool:unauthorized only on bare 401', async () => {
  events.length = 0;
  nextResponse = { status: 401, body: { error: 'OTP wrong', code: 'BAD_OTP' } };
  const stepErr = await api.post('/api/test', {});
  assert.equal(stepErr.ok, false);
  assert.equal(events.length, 0);

  nextResponse = { status: 401, body: { error: 'Expired' } };
  const sessionErr = await api.get('/api/test');
  assert.equal(sessionErr.ok, false);
  assert.deepEqual(events, ['futureschool:unauthorized']);
});

await check('schoolProfileService uses ApiSchoolProfileService under VITE_BACKEND=api', async () => {
  recorded.length = 0;
  nextResponse = { status: 200, body: { id: 'TSR', name: 'New Campus High School' } };
  const got = await schoolProfileService.getProfile('IGNORED');
  assert.equal(got.ok, true);
  if (got.ok) assert.equal(got.data.id, 'TSR');
  assert.ok(recorded[0].url.endsWith('/api/schools/current'));

  await schoolProfileService.updateProfile?.({ phone: '+91 40 1234 5678' });
  assert.equal(recorded[1].method, 'PUT');
  assert.ok(recorded[1].url.endsWith('/api/schools/current'));
});

await check('udiseService & studentDirectoryService hit real endpoints under API mode', async () => {
  recorded.length = 0;
  nextResponse = { status: 200, body: { totalStudents: 8, readyCount: 6, incompleteCount: 2, issues: [], classes: [], missingByField: {} } };
  const val = await udiseService.validate('ALL');
  assert.equal(val.ok, true);
  assert.equal(recorded[0].url, '/api/admin/udise/validation');

  nextResponse = { status: 200, body: 'col1,col2\n1,2', headers: { 'Content-Disposition': 'attachment; filename="udise-GVS.csv"', 'X-Udise-Row-Count': '8', 'X-Udise-Skipped-Count': '0' } };
  const dl = await udiseService.downloadCsv('GVS-10-A', true);
  assert.equal(dl.ok, true);
  if (dl.ok) assert.equal(dl.data.filename, 'udise-GVS.csv');

  nextResponse = { status: 200, body: { createdCount: 2, skippedCount: 0, classesCreated: 1, parentsLinked: 2, errors: [], createdStudentIds: ['S1', 'S2'] } };
  const imp = await studentDirectoryService.importCsv('Student Name\nA', 40000);
  assert.equal(imp.ok, true);
  assert.equal(recorded[2].method, 'POST');
  assert.equal(recorded[2].url, '/api/admin/students/import');
});

await check('withApiAdmin and withApiCounts fetch live endpoints without calling mock', async () => {
  recorded.length = 0;
  let mockCalled = false;
  const mockAdmin = {
    getAccess: async () => ({ ok: true as const, data: { permissions: [], quorum: { activeAdmins: 2, meetsMinimum: true } } }),
    getWorkQueue: async () => { mockCalled = true; throw new Error('Mock called'); },
    listAudit: async () => { mockCalled = true; throw new Error('Mock called'); },
    listExams: async () => { mockCalled = true; throw new Error('Mock called'); }
  };
  const mockStaff = {
    myLeaves: async () => { throw new Error('unused'); },
    applyLeave: async () => { throw new Error('unused'); },
    listTeacherLeave: async () => { throw new Error('unused'); },
    decideTeacherLeave: async () => { throw new Error('unused'); },
    getOverview: async () => { mockCalled = true; throw new Error('Mock called'); }
  };
  const scope = { schoolId: 'GVS', userId: 'ACC-L-0002', role: 'ADMIN' as const };
  nextResponse = { status: 200, body: { governance: { toExecute: 1, blocked: 0, returned: 0, drafts: 0, waitingPrincipal: 0 }, substitutionsUncovered: 0, complaintsOpen: 0, safetyComplaints: 0, transportPending: 0 } };
  const wq = await withApiAdmin(mockAdmin).getWorkQueue(scope);
  assert.equal(wq.ok, true);
  assert.ok(recorded[0].url.endsWith('/api/office/work-queue'));

  nextResponse = { status: 200, body: { attendance: { date: '2026-11-11', classesTotal: 4, morningTaken: 2, afternoonTaken: 0, presentPct: 90 }, academics: [], finance: { charged: 1000, concession: 0, collected: 500, overdue: 0, byInstalment: [] }, hallTickets: [], counts: { reportCards: 0, corrections: 0, teacherLeave: 0, governance: 0 } } };
  const ov = await withApiCounts(mockStaff).getOverview(scope);
  assert.equal(ov.ok, true);
  assert.ok(recorded[1].url.endsWith('/api/staff/overview'));
  assert.equal(mockCalled, false);
});

if (passed === 0) process.exit(1);
