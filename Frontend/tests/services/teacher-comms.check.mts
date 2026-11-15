// Service-level rule checks (mock implementations). Run all with: npm run test:services
const SRC = new URL('../../src/', import.meta.url).href;
const mem: Record<string, string> = {};
(globalThis as any).window = { location: { origin: 'http://x' }, dispatchEvent: () => true, localStorage: { getItem: (k: string) => (k in mem ? mem[k] : null), setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; }, key: (i: number) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } } };
const u = (p: string) => SRC + p;
const { teacherCommsService: tc } = await import(u('services/teacherCommsService.ts'));
const { communicationService: cs } = await import(u('services/communicationService.ts'));
const { academicsService: ac } = await import(u('services/academicsService.ts'));
const { addDaysISO } = await import(u('utils/date.ts'));
let fails = 0;
const check = (n: string, c: boolean, x?: any) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  -> ' + JSON.stringify(x))); };
const SARAH = { schoolId: 'GVS', role: 'TEACHER', userId: 'STF-T-0001' } as any;
const NAIR = { schoolId: 'GVS', role: 'TEACHER', userId: 'STF-T-0002' } as any;
const AARAV = { schoolId: 'GVS', role: 'PARENT', userId: 'GRD-0001', studentId: 'GVS-2027-0001' } as any;

const inbox: any = await tc.inbox(SARAH);
check('sarah inbox has seeded thread', inbox.ok && inbox.data.some((t: any) => t.id === 'TH-GVS-1'), inbox);
check('nair inbox excludes sarah thread', !((await tc.inbox(NAIR)) as any).data.some((t: any) => t.id === 'TH-GVS-1'));
check('nair cannot reply to sarah thread', !((await tc.reply(NAIR, 'TH-GVS-1', 'hi')) as any).ok);
const r: any = await tc.reply(SARAH, 'TH-GVS-1', 'Thanks for letting me know.');
check('sarah replies', r.ok && r.data.messages.at(-1).from === 'TEACHER', r);
check('parent sees reply', ((await cs.getThreads(AARAV)) as any).data[0].messages.at(-1).body === 'Thanks for letting me know.');
check('empty reply refused', !((await tc.reply(SARAH, 'TH-GVS-1', '  ')) as any).ok);

check('sarah cannot post maths', !((await tc.postHomework(SARAH, { classSectionId: 'GVS-10-A', subject: 'Mathematics', title: 'X title', instructions: '', dueOn: addDaysISO(2), submissionType: 'NOTEBOOK' })) as any).ok);
check('past due refused', ((await tc.postHomework(SARAH, { classSectionId: 'GVS-10-A', subject: 'Physical Science', title: 'Past', instructions: '', dueOn: addDaysISO(-1), submissionType: 'NOTEBOOK' })) as any).code === 'DATES');
const hw: any = await tc.postHomework(SARAH, { classSectionId: 'GVS-10-A', subject: 'Physical Science', title: "Ohm's law", instructions: '5 numericals', dueOn: addDaysISO(2), submissionType: 'NOTEBOOK' });
check('sarah posts PS homework', hw.ok, hw);
check('parent sees new homework', ((await ac.getHomework(AARAV)) as any).data.some((h: any) => h.id === hw.data.id));
check('mark checked', ((await tc.setStatus(SARAH, hw.data.id, 'GVS-2027-0001', 'CHECKED')) as any).ok);
check('parent sees checked', ((await ac.getHomework(AARAV)) as any).data.find((h: any) => h.id === hw.data.id).status === 'CHECKED');
check('nair cannot mark sarah homework', !((await tc.setStatus(NAIR, hw.data.id, 'GVS-2027-0001', 'PENDING')) as any).ok);
const mine: any = await tc.myHomework(SARAH);
check('my homework lists class roster', mine.ok && mine.data.find((h: any) => h.id === hw.data.id).students.length === 6, mine.data?.[0]);
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
