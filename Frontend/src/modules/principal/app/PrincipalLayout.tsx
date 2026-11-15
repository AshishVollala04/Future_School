/**
 * Principal portal: School Leadership | Approvals | My Teaching (only with subject allocations).
 * The Principal governs and approves; does not publish results, enter others' marks or execute Admin changes.
 */
import React from 'react';
import { LayoutDashboard, MessageCircle, Award, ClipboardCheck, FileEdit, Home, NotebookPen, ShieldAlert, Users } from 'lucide-react';
import { StaffShell, StaffNavGroup, StaffNavItem } from '../../../components/layout/StaffShell';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { staffService } from '../../../services/staffService';
import { academicsService } from '../../../services/academicsService';

export const PrincipalLayout: React.FC = () => {
  const scope = useScope();
  const ov = useQuery(() => staffService.getOverview(scope), [scope.schoolId]);
  const assignments = useQuery(() => academicsService.getTeacherAssignments(scope), [scope.schoolId, scope.userId]);
  const c = ov.data?.counts;
  const groups: StaffNavGroup[] = [
    {
      title: 'School Leadership',
      items: [
        { to: '/principal/overview', label: 'Today at a glance', icon: LayoutDashboard },
        { to: '/principal/home', label: 'Action required & overview', icon: Home },
        { to: '/principal/hall-tickets', label: 'Hall tickets', icon: ShieldAlert },
        { to: '/principal/alerts', label: 'WhatsApp alerts', icon: MessageCircle }
      ]
    },
    {
      title: 'Approvals',
      items: [
        { to: '/principal/report-cards', label: 'Report cards', icon: Award, badge: c?.reportCards },
        { to: '/principal/corrections', label: 'Mark corrections', icon: FileEdit, badge: c?.corrections },
        { to: '/principal/teacher-leave', label: 'Teacher leave', icon: Users, badge: c?.teacherLeave },
        { to: '/principal/requests', label: 'Admin requests', icon: ClipboardCheck, badge: c?.governance }
      ]
    }
  ];
  // "My Teaching" appears only when the Principal actually has subject allocations.
  // Principal teaching uses the same marks tools as teachers; it links there once allocations exist.
  if ((assignments.data?.teaching ?? []).length > 0) {
    groups.push({ title: 'My Teaching', items: [{ to: '/principal/home', label: `My classes (${assignments.data!.teaching.length})`, icon: NotebookPen }] });
  }
  const bottom: StaffNavItem[] = [
    { to: '/principal/home', label: 'Home', icon: Home },
    { to: '/principal/report-cards', label: 'Cards', icon: Award },
    { to: '/principal/requests', label: 'Requests', icon: ClipboardCheck }
  ];
  return <StaffShell groups={groups} bottom={bottom} roleLabel="Principal" />;
};
