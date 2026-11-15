/**
 * FutureSchool - useWorkflow Hook
 * Provides reactive access to central simulated workflows with both tuple and object destructuring support
 */

import { useState, useEffect } from 'react';
import { getWorkflowStore, WorkflowState } from '../mock/workflowStore';
import { useScope } from './useScope';

/**
 * Parent sessions see only their own student's rows, mirroring backend row-level
 * security. Staff sessions see the whole school (role checks come later per module).
 */
export function scopeToStudent(s: WorkflowState, studentId: string): WorkflowState {
  const mine = <T extends { studentId: string }>(rows: T[]) => rows.filter(r => r.studentId === studentId);
  return {
    ...s,
    leaveRequests: mine(s.leaveRequests),
    reportCards: mine(s.reportCards),
    hallTickets: mine(s.hallTickets),
    transportRequests: mine(s.transportRequests),
    complaints: mine(s.complaints),
    fees:
      s.fees.studentId === studentId
        ? s.fees
        : { ...s.fees, studentId, totalAnnualFee: 0, paidAmount: 0, pendingAmount: 0, hasOutstandingPastDueDate: false, hallTicketCleared: false, transactions: [] },
    marksEntries: s.marksEntries.map(m => ({ ...m, studentMarks: m.studentMarks.filter(x => x.studentId === studentId) })),
    teacherLeaves: [],
    configs: []
  };
}

/** Workflow state for the signed-in school only (and the signed-in student, for parents). */
export function useWorkflow() {
  const { schoolId, role, studentId } = useScope();
  const workflowStore = getWorkflowStore(schoolId);
  const read = () => {
    const raw = workflowStore.getState();
    return role === 'PARENT' && studentId ? scopeToStudent(raw, studentId) : { ...raw };
  };
  const [state, setState] = useState<WorkflowState>(read);

  useEffect(() => {
    setState(read());
    return workflowStore.subscribe(() => setState(read()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowStore, role, studentId]);

  // Compute convenient mapped helpers
  const hallTicketCleared = 
    state.fees.hallTicketCleared || 
    state.hallTickets.some(h => h.feeCleared || h.principalOverride || h.classTeacherReleased);

  const configChanges = state.configs.map(c => ({
    id: c.id,
    title: c.title,
    description: `Administrative Master Policy: ${c.title} (${c.version})`,
    requestedBy: c.submittedByAdmin,
    requestedAt: '2027-04-10',
    approvedAt: c.principalSignoff ? '2027-04-11' : undefined,
    executedAt: c.executedByAdmin ? '2027-04-12' : undefined,
    status: c.status
  }));

  const helpers = {
    state,
    store: workflowStore,
    leaveRequests: state.leaveRequests,
    teacherLeaves: state.teacherLeaves,
    marksEntries: state.marksEntries,
    reportCards: state.reportCards,
    fees: state.fees,
    hallTickets: state.hallTickets,
    transportRequests: state.transportRequests,
    complaints: state.complaints,
    configs: state.configs,
    configChanges,
    hallTicketCleared,

    // Methods
    executeConfigChange: (id: string) => workflowStore.adminExecuteConfig(id),
    approveTransportRequest: (id: string) => workflowStore.approveTransportChange(id),
    overrideHallTicketClearance: (studentId: string, reason: string) => workflowStore.principalOverrideHallTicket(studentId, reason),
    fastForwardScenario: (scenario: number) => workflowStore.applyScenario(scenario),
    resetDemoData: () => workflowStore.resetToDefault()
  };

  // Create an array tuple [state, store] that also has all helper properties attached
  const tuple = [state, workflowStore] as [WorkflowState, typeof workflowStore] & typeof helpers;
  Object.assign(tuple, helpers);

  return tuple;
}
