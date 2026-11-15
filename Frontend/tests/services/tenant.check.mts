// Service-level rule checks (mock implementations). Run all with: npm run test:services
const SRC = new URL('../../src/', import.meta.url).href;
const mem: Record<string,string> = {};
(globalThis as any).window = { localStorage: { getItem:(k:string)=>k in mem?mem[k]:null, setItem:(k:string,v:string)=>{mem[k]=v}, removeItem:(k:string)=>{delete mem[k]}, key:(i:number)=>Object.keys(mem)[i]??null, get length(){return Object.keys(mem).length} } };
const { getWorkflowStore } = await import(SRC + 'mock/workflowStore.ts');
const { schoolProfileService } = await import(SRC + 'services/schoolProfileService.ts');
const { auditService } = await import(SRC + 'services/auditService.ts');
const check=(n:string,c:boolean)=>console.log((c?'PASS ':'FAIL ')+n);
const gvs=getWorkflowStore('GVS'), sjm=getWorkflowStore('SJM');
check('GVS seeded', gvs.getState().leaveRequests.length===1);
check('SJM empty', sjm.getState().leaveRequests.length===0 && sjm.getState().hallTickets.length===0);
sjm.submitParentLeave({studentId:'SJM-2033-0105',studentName:'Rohan',grade:'Class 4',section:'B',leaveType:'Sick',startDate:'2026-11-10',endDate:'2026-11-10',reason:'fever',parentName:'Rajesh'} as any);
check('SJM write not visible in GVS', gvs.getState().leaveRequests.length===1 && sjm.getState().leaveRequests.length===1);
check('storage keys school-scoped', Object.keys(mem).some(k=>k==='fs:school:SJM:workflow') && !Object.keys(mem).some(k=>k.includes('futureschool_')));
gvs.getState().hallTickets[0].feeCleared=true; gvs.principalOverrideHallTicket('GVS-2027-0001','Medical emergency documented');
check('override audit in GVS only', auditService.list('GVS').length===1 && auditService.list('SJM').length===0);
check('profile GVS', (await schoolProfileService.getProfile('GVS')).ok);
check('unknown school -> error', !(await schoolProfileService.getProfile('ZZZ')).ok);
let threw=false; try { getWorkflowStore(''); } catch { threw=true } check('empty schoolId rejected', threw);
