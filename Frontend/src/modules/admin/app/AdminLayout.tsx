/**
 * Admin portal: operations, shown by permission. Hiding a menu is UX only;
 * every service re-checks the permission (production: the backend).
 *
 * The Admin cannot edit marks, approve report cards, publish results, or approve
 * their own governed changes. Those links simply do not exist here.
 */
import React from 'react';
import { Bus, ClipboardList, LayoutDashboard, MessageCircle, DoorOpen, FileClock, Home, MessageSquareWarning, ReceiptIndianRupee, ShieldCheck, UserCog, Users } from 'lucide-react';
import { StaffShell, StaffNavGroup, StaffNavItem } from '../../../components/layout/StaffShell';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { adminService } from '../../../services/adminService';
import { ErrorState, LoadingBlock } from '../../../components/common/States';
import { AdminPermission } from '../../../types/domain';

export const AdminLayout: React.FC = () => {
  const scope = useScope();
  const access = useQuery(() => adminService.getAccess(scope), [scope.schoolId, scope.userId]);
  const queue = useQuery(() => adminService.getWorkQueue(scope), [scope.schoolId, scope.userId]);
  if (access.status === 'loading') return <div className="p-6"><LoadingBlock /></div>;
  if (access.status === 'error') return <div className="p-6"><ErrorState message={access.error} onRetry={access.reload} /></div>;

  const can = (p: AdminPermission) => access.data.permissions.includes(p);
  const q = queue.data;
  const changes = (q?.governance.toExecute ?? 0) + (q?.governance.blocked ?? 0) + (q?.governance.returned ?? 0);

  const groups: StaffNavGroup[] = [
    {
      title: 'Operations',
      items: [
        ...(can('FINANCE') || can('REPORTS') ? [{ to: '/admin/overview', label: 'Today at a glance', icon: LayoutDashboard }] : []),
        { to: '/admin/home', label: 'Work queue', icon: Home },
        ...(can('FINANCE') || can('ACADEMIC_OPS') ? [{ to: '/admin/requests', label: 'Changes needing approval', icon: ClipboardList, badge: changes }] : [])
      ]
    }
  ];
  if (can('FINANCE')) groups.push({ title: 'Finance', items: [{ to: '/admin/fees', label: 'Fee desk', icon: ReceiptIndianRupee }] });
  const ops: StaffNavItem[] = [
    ...(can('ADMISSIONS') || can('ACADEMIC_OPS') ? [{ to: '/admin/students', label: 'Students & onboarding', icon: Users }] : []),
    ...(can('ACADEMIC_OPS') ? [{ to: '/admin/substitution', label: 'Substitution', icon: UserCog, badge: q?.substitutionsUncovered }] : []),
    ...(can('TRANSPORT') ? [{ to: '/admin/transport', label: 'Transport', icon: Bus, badge: q?.transportPending }] : []),
    ...(can('COMPLAINTS') ? [{ to: '/admin/complaints', label: 'Complaints', icon: MessageSquareWarning, badge: q?.complaintsOpen }] : []),
    { to: '/admin/gate', label: 'Pickup gate check', icon: DoorOpen },
    { to: '/admin/alerts', label: 'WhatsApp alerts', icon: MessageCircle }
  ];
  if (ops.length) groups.push({ title: 'School operations', items: ops });
  const sec: StaffNavItem[] = [
    ...(can('SECURITY') ? [{ to: '/admin/staff-access', label: 'Staff access', icon: ShieldCheck }] : []),
    ...(can('REPORTS') ? [
      { to: '/admin/audit', label: 'Audit log', icon: FileClock },
      { to: '/admin/udise', label: 'UDISE+ export', icon: FileClock }
    ] : [])
  ];
  if (sec.length) groups.push({ title: 'Security & reports', items: sec });

  const bottom: StaffNavItem[] = [
    { to: '/admin/home', label: 'Home', icon: Home },
    ...(can('FINANCE') || can('ACADEMIC_OPS') ? [{ to: '/admin/requests', label: 'Changes', icon: ClipboardList }] : []),
    ...(can('FINANCE') ? [{ to: '/admin/fees', label: 'Fees', icon: ReceiptIndianRupee }] : []),
    ...(can('COMPLAINTS') ? [{ to: '/admin/complaints', label: 'Complaints', icon: MessageSquareWarning }] : [])
  ];
  return <StaffShell groups={groups} bottom={bottom} roleLabel="Admin" />;
};
