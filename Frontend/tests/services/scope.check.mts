// Service-level rule checks (mock implementations). Run all with: npm run test:services
const SRC = new URL('../../src/', import.meta.url).href;
const mem: Record<string,string> = {};
(globalThis as any).window = { localStorage: { getItem:(k:string)=>k in mem?mem[k]:null, setItem:(k:string,v:string)=>{mem[k]=v}, removeItem:(k:string)=>{delete mem[k]}, key:(i:number)=>Object.keys(mem)[i]??null, get length(){return Object.keys(mem).length} } };
const { getWorkflowStore } = await import(SRC + 'mock/workflowStore.ts');
const { scopeToStudent } = await import(SRC + 'hooks/useWorkflow.ts');
const check=(n:string,c:boolean)=>console.log((c?'PASS ':'FAIL ')+n);
const raw = getWorkflowStore('GVS').getState();
const aarav = scopeToStudent(raw,'GVS-2027-0001'), ananya = scopeToStudent(raw,'GVS-2031-0042');
check('Aarav sees own hall ticket + fees', aarav.hallTickets.length===1 && aarav.fees.pendingAmount===12000);
check('Ananya sees no Aarav hall ticket', ananya.hallTickets.length===0);
check('Ananya sees no Aarav fees/receipts', ananya.fees.pendingAmount===0 && ananya.fees.transactions.length===0);
check('Ananya sees no Aarav leave/complaints/transport', !ananya.leaveRequests.length && !ananya.complaints.length && !ananya.transportRequests.length);
check('Ananya sees no classmates marks', ananya.marksEntries.every((m:any)=>m.studentMarks.length===0));
check('Aarav sees only own mark row', aarav.marksEntries[0].studentMarks.length===1);
check('parent sees no staff leave/configs', !aarav.teacherLeaves.length && !aarav.configs.length);
