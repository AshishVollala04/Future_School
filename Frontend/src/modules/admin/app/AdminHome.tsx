/** Admin work queue: what is waiting on this Admin, by permission. Operational numbers only. */
import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { adminService } from '../../../services/adminService';
import { staffService } from '../../../services/staffService';
import { EmptyState, ErrorState, LoadingBlock, Panel, Pill, Section } from '../../../components/common/States';
import { PERMISSION_LABEL } from '../../../services/mock/permissions';
import { formatINR } from '../../../utils/date';

interface Item {
  to: string;
  title: string;
  detail: string;
  tone: 'danger' | 'warning' | 'info';
}

export const AdminHome: React.FC = () => {
  const scope = useScope();
  const access = useQuery(() => adminService.getAccess(scope), [scope.schoolId, scope.userId]);
  const q = useQuery(() => adminService.getWorkQueue(scope), [scope.schoolId, scope.userId]);
  const can = (p: string) => (access.data?.permissions ?? []).includes(p as never);
  const ov = useQuery(() => staffService.getOverview(scope), [scope.schoolId]);

  if (access.status === 'loading' || q.status === 'loading') return <LoadingBlock />;
  if (access.status === 'error') return <ErrorState message={access.error} onRetry={access.reload} />;
  if (q.status === 'error') return <ErrorState message={q.error} onRetry={q.reload} />;

  const g = q.data.governance;
  const items: Item[] = [];
  if (g.blocked) items.push({ to: '/admin/requests', title: `${g.blocked} change(s) blocked`, detail: 'Edited after approval or failed re-validation. Needs a fresh approval.', tone: 'danger' });
  if (g.toExecute) items.push({ to: '/admin/requests', title: `${g.toExecute} approved change(s) to execute`, detail: 'The Principal approved. FutureSchool re-validates when you execute.', tone: 'warning' });
  if (g.returned) items.push({ to: '/admin/requests', title: `${g.returned} change(s) returned by the Principal`, detail: 'Read the note, fix and resubmit.', tone: 'warning' });
  if (q.data.substitutionsUncovered) items.push({ to: '/admin/substitution', title: `${q.data.substitutionsUncovered} period(s) without a substitute`, detail: 'Approved teacher leave needs cover.', tone: 'warning' });
  if (q.data.safetyComplaints) items.push({ to: '/admin/complaints', title: `${q.data.safetyComplaints} safety complaint(s) open`, detail: 'The Principal is informed automatically.', tone: 'danger' });
  if (q.data.complaintsOpen) items.push({ to: '/admin/complaints', title: `${q.data.complaintsOpen} complaint(s) open`, detail: 'Parents are waiting for a reply.', tone: 'info' });
  if (q.data.transportPending) items.push({ to: '/admin/transport', title: `${q.data.transportPending} transport request(s)`, detail: 'Seat capacity is checked when you approve.', tone: 'info' });

  const tone = { danger: 'border-rose-300 bg-rose-50', warning: 'border-amber-300 bg-amber-50', info: 'border-blue-200 bg-white' };
  const fin = ov.data?.finance;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold">Work queue</h1>
        <p className="text-sm text-slate-600">You can operate: {access.data.permissions.map(p => PERMISSION_LABEL[p]).join(', ') || 'nothing yet'}.</p>
      </div>
      {!access.data.quorum.meetsMinimum && (
        <p role="alert" className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-sm text-amber-900 flex gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> Only {access.data.quorum.activeAdmins} active Admin. Keep at least two so the school is never locked out.
        </p>
      )}
      <Section title="Waiting on you">
        {items.length === 0 ? (
          <EmptyState title="Nothing waiting" hint="New items appear here as they arrive." />
        ) : (
          <ul className="space-y-2">
            {items.map(i => (
              <li key={i.title}>
                <Link to={i.to} className={`flex items-center gap-3 p-3.5 rounded-2xl border ${tone[i.tone]}`}>
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold">{i.title}</span>
                    <span className="block text-sm text-slate-600">{i.detail}</span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
      {g.waitingPrincipal > 0 && <p className="text-sm text-slate-600"><Pill tone="neutral">{g.waitingPrincipal}</Pill> change(s) are with the Principal.</p>}
      {can('FINANCE') && fin && (
        <Section title="Fee collection (this year)">
          <Panel className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div><p className="text-slate-500">Charged</p><p className="font-bold text-base">{formatINR(fin.charged)}</p></div>
            <div><p className="text-slate-500">Concessions</p><p className="font-bold text-base">{formatINR(fin.concession)}</p></div>
            <div><p className="text-slate-500">Collected</p><p className="font-bold text-base">{formatINR(fin.collected)}</p></div>
            <div><p className="text-slate-500">Overdue</p><p className="font-bold text-base text-rose-700">{formatINR(fin.overdue)}</p></div>
          </Panel>
        </Section>
      )}
    </div>
  );
};
