/**
 * Principal portal: School Leadership | Approvals | My Teaching (only with subject allocations).
 * The Principal governs and approves; does not publish results, enter others' marks or execute Admin changes.
 * The numbers beside "Approvals" reload after every approve / reject / return and on every page change,
 * so a count disappears as soon as the Principal acts on it.
 */
import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, MessageCircle, Award, ClipboardCheck, FileEdit, Home, NotebookPen, ShieldAlert, Users } from 'lucide-react';
import { StaffShell, StaffNavGroup, StaffNavItem } from '../../../components/layout/StaffShell';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { staffService } from '../../../services/staffService';
import { academicsService } from '../../../services/academicsService';
import { onStaffDataChanged } from '../../../app/staffEvents';

export const PrincipalLayout: React.FC = () => {
  const { t } = useTranslation();
  const scope = useScope();
  const location = useLocation();
  const ov = useQuery(() => staffService.getOverview(scope), [scope.schoolId]);
  const assignments = useQuery(() => academicsService.getTeacherAssignments(scope), [scope.schoolId, scope.userId]);

  // Reload the counts when the Principal acts on something...
  const reloadOverview = ov.reload;
  useEffect(() => onStaffDataChanged(reloadOverview), [reloadOverview]);
  // ...and whenever they move to another page (skips the first render: the query is already loading).
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    reloadOverview();
  }, [location.pathname, reloadOverview]);

  const c = ov.data?.counts;
  const groups: StaffNavGroup[] = [
    {
      title: t('principal.nav.leadership'),
      items: [
        { to: '/principal/overview', label: t('principal.nav.overview'), icon: LayoutDashboard },
        { to: '/principal/home', label: t('principal.nav.home'), icon: Home },
        { to: '/principal/hall-tickets', label: t('principal.nav.hallTickets'), icon: ShieldAlert },
        { to: '/principal/alerts', label: t('principal.nav.alerts'), icon: MessageCircle }
      ]
    },
    {
      title: t('principal.nav.approvals'),
      items: [
        { to: '/principal/report-cards', label: t('principal.nav.reportCards'), icon: Award, badge: c?.reportCards },
        { to: '/principal/corrections', label: t('principal.nav.corrections'), icon: FileEdit, badge: c?.corrections },
        { to: '/principal/teacher-leave', label: t('principal.nav.teacherLeave'), icon: Users, badge: c?.teacherLeave },
        { to: '/principal/requests', label: t('principal.nav.requests'), icon: ClipboardCheck, badge: c?.governance }
      ]
    }
  ];
  // "My Teaching" appears only when the Principal actually has subject allocations.
  // Principal teaching uses the same marks tools as teachers; it links there once allocations exist.
  if ((assignments.data?.teaching ?? []).length > 0) {
    groups.push({
      title: t('principal.nav.teaching'),
      items: [{ to: '/principal/home', label: t('principal.nav.myClasses', { count: assignments.data!.teaching.length }), icon: NotebookPen }]
    });
  }
  const bottom: StaffNavItem[] = [
    { to: '/principal/home', label: t('principal.nav.bottomHome'), icon: Home },
    { to: '/principal/report-cards', label: t('principal.nav.bottomCards'), icon: Award },
    { to: '/principal/requests', label: t('principal.nav.bottomRequests'), icon: ClipboardCheck }
  ];
  return <StaffShell groups={groups} bottom={bottom} roleLabel={t('principal.role')} />;
};
