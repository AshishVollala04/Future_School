// Teacher notices (postNotice) and bell "viewed" tracking, mock implementations. Run with: npm run test:services
const SRC = new URL('../../src/', import.meta.url).href;
const mem: Record<string, string> = {};
(globalThis as any).window = { location: { origin: 'http://x' }, dispatchEvent: () => true, localStorage: { getItem: (k: string) => (k in mem ? mem[k] : null), setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; }, key: (i: number) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } } };
const u = (p: string) => SRC + p;
const { communicationService: cs } = await import(u('services/communicationService.ts'));
const { teacherCommsService: tc } = await import(u('services/teacherCommsService.ts'));
const { auditService } = await import(u('services/auditService.ts'));
const { teacherAlerts } = await import(u('services/teacherAlertsService.ts'));
const { getDb } = await import(u('mock/db/index.ts'));
let fails = 0;
const check = (n: string, c: boolean, x?: any) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  -> ' + JSON.stringify(x))); };
const SARAH = { schoolId: 'GVS', role: 'TEACHER', userId: 'STF-T-0001' } as any;
const AARAV = { schoolId: 'GVS', role: 'PARENT', userId: 'GRD-0001', studentId: 'GVS-2027-0001' } as any; // Class 10-A
const PRINCIPAL = { schoolId: 'GVS', role: 'PRINCIPAL', userId: 'STF-P-0001' } as any;

const db = getDb('GVS');
const isSarahs = (c: any) => c.classTeacherStaffId === SARAH.userId || c.subjectTeachers.some((t: any) => t.staffId === SARAH.userId);
const own = db.classSections.find((c: any) => c.classTeacherStaffId === SARAH.userId);
const notMine = db.classSections.find((c: any) => !isSarahs(c));
check('fixture: Sarah is class teacher of a class', Boolean(own), db.classSections.map((c: any) => c.id));
check('fixture: a class Sarah is not assigned to exists', Boolean(notMine));

// ---- postNotice rules
const base = { title: 'Science fair on Friday', body: 'Bring your project models to the hall by 9 AM.' };
const ok: any = await cs.postNotice(SARAH, { ...base, audience: [own.id], priority: 'IMPORTANT' });
check('teacher posts an Important notice to own class', ok.ok && ok.data.priority === 'IMPORTANT' && Array.isArray(ok.data.audience) && ok.data.audience[0] === own.id, ok);
check('teacher may post a Normal notice too', ((await cs.postNotice(SARAH, { ...base, title: 'Normal one', audience: [own.id], priority: 'NORMAL' })) as any).ok);
check('not to an unassigned class', !((await cs.postNotice(SARAH, { ...base, audience: [notMine.id], priority: 'NORMAL' })) as any).ok);
check('not to a mix incl. an unassigned class', !((await cs.postNotice(SARAH, { ...base, audience: [own.id, notMine.id], priority: 'NORMAL' })) as any).ok);
check('not to the whole school', !((await cs.postNotice(SARAH, { ...base, audience: ['ALL'], priority: 'NORMAL' })) as any).ok);
check('teacher cannot send Emergency', !((await cs.postNotice(SARAH, { ...base, audience: [own.id], priority: 'EMERGENCY' })) as any).ok);
check('empty audience refused', ((await cs.postNotice(SARAH, { ...base, audience: [], priority: 'NORMAL' })) as any).code === 'AUDIENCE');
check('too-short text refused', ((await cs.postNotice(SARAH, { title: 'Hi', body: 'x', audience: [own.id], priority: 'NORMAL' })) as any).code === 'EMPTY');
check('unknown class refused', !((await cs.postNotice(SARAH, { ...base, audience: ['GVS-99-Z'], priority: 'NORMAL' })) as any).ok);
check('a parent cannot post', !((await cs.postNotice(AARAV, { ...base, audience: [own.id], priority: 'NORMAL' })) as any).ok);
check('principal can post to the whole school', ((await cs.postNotice(PRINCIPAL, { ...base, title: 'Holiday', audience: ['ALL'], priority: 'EMERGENCY' })) as any).ok);

// ---- visible to parents immediately (Aarav is in 10-A, Sarah's class)
if (own.id === 'GVS-10-A') {
  const pn: any = await cs.getNotices(AARAV);
  check('parent of that class sees the new notice', pn.ok && pn.data.some((n: any) => n.id === ok.data.id), pn);
}
const audit = auditService.list('GVS').filter((e: any) => e.action === 'NOTICE_PUBLISHED' && e.targetId === ok.data.id);
check('posting is audited with actor and role', audit.length === 1 && audit[0].actorId === SARAH.userId && audit[0].actorRole === 'TEACHER', audit);

// ---- bell: viewed tracking
const notices: any = (await cs.getNotices(SARAH)).data;
let seen = teacherAlerts.getSeen(SARAH);
check('priority notices start unread', teacherAlerts.unreadNotices(notices, seen).length > 0);
seen = teacherAlerts.markNoticesSeen(SARAH, notices);
check('marking notices seen clears them', teacherAlerts.unreadNotices(notices, seen).length === 0);
check('seen state is persisted', teacherAlerts.unreadNotices(notices, teacherAlerts.getSeen(SARAH)).length === 0);
await new Promise(r => setTimeout(r, 5));
const fresh: any = await cs.postNotice(SARAH, { ...base, title: 'New important', audience: [own.id], priority: 'IMPORTANT' });
const after: any = (await cs.getNotices(SARAH)).data;
check('a new priority notice brings the badge back', teacherAlerts.unreadNotices(after, teacherAlerts.getSeen(SARAH)).some((n: any) => n.id === fresh.data.id));
await cs.postNotice(SARAH, { ...base, title: 'New normal', audience: [own.id], priority: 'NORMAL' });
const after2: any = (await cs.getNotices(SARAH)).data;
check('a Normal notice does not count', teacherAlerts.unreadNotices(after2, teacherAlerts.getSeen(SARAH)).length === 1);

// Seeded conversation TH-GVS-1 (Aarav -> Sarah) ends with the teacher's reply, so nothing waits yet.
const inbox0: any = (await tc.inbox(SARAH)).data;
check('a conversation the teacher already answered does not count', teacherAlerts.unreadMessages(inbox0, teacherAlerts.getSeen(SARAH)).length === 0);
const sent: any = await cs.reply(AARAV, 'TH-GVS-1', 'Thank you. Is the test on Monday?');
check('parent message sent', sent.ok, sent);
const inbox: any = (await tc.inbox(SARAH)).data;
const waiting = teacherAlerts.unreadMessages(inbox, teacherAlerts.getSeen(SARAH));
check('a parent message waiting for reply is unread', waiting.some((t: any) => t.id === 'TH-GVS-1'), inbox.map((t: any) => t.messages.at(-1)?.from));
teacherAlerts.markMessagesSeen(SARAH, inbox);
check('marking messages seen clears them', teacherAlerts.unreadMessages(inbox, teacherAlerts.getSeen(SARAH)).length === 0);
await new Promise(r => setTimeout(r, 5));
const t0 = waiting[0];
await cs.reply(AARAV, t0.id, 'One more question, please.');
const inbox2: any = (await tc.inbox(SARAH)).data;
check('a new parent message brings the badge back', teacherAlerts.unreadMessages(inbox2, teacherAlerts.getSeen(SARAH)).some((t: any) => t.id === t0.id));
await tc.reply(SARAH, t0.id, 'Sure, see you tomorrow.');
const inbox3: any = (await tc.inbox(SARAH)).data;
check('a replied conversation no longer counts', !teacherAlerts.unreadMessages(inbox3, teacherAlerts.getSeen(SARAH)).some((t: any) => t.id === t0.id));
const otherTeacher = { ...SARAH, userId: 'STF-T-0002' };
check('seen state is per teacher', teacherAlerts.getSeen(otherTeacher).noticesAt === '');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
if (fails) process.exit(1);
