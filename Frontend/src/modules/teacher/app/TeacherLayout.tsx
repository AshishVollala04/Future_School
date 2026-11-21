/**
 * Teacher portal layout. Two hats, kept visibly separate:
 *   MY TEACHING                      (every teacher: subjects they teach)
 *   MY CLASS TEACHER RESPONSIBILITY  (only if they are a Class Teacher this year)
 *
 * A teacher without a sign-in PIN (first sign-in, after an Admin reset, or "Forgot PIN") sees
 * only the PIN screen. The server refuses everything else until then too. After a sign-in with
 * an SMS code, this device is trusted, so next time the PIN alone is enough (no SMS).
 */
import React, { useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { BookOpenCheck, DoorOpen, CalendarCheck, CalendarOff, ClipboardList, FileCheck2, FileEdit, Home, KeyRound, Megaphone, MessageSquare, NotebookPen, ShieldCheck, UserCheck } from 'lucide-react';
import { TeacherBell } from './TeacherBell';
import { StaffShell, StaffNavGroup, StaffNavItem } from '../../../components/layout/StaffShell';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { useReloadOnDataChange } from '../../../hooks/useReloadOnDataChange';
import { academicsService } from '../../../services/academicsService';
import { leaveService } from '../../../services/leaveService';
import { ErrorState, LoadingBlock } from '../../../components/common/States';
import { authService } from '../../../services/authService';
import { TeacherPinSetup } from './TeacherSignInPin';

export const TeacherLayout: React.FC = () => {
  const scope = useScope();
  const { session } = useAuth();
  const pin = useQuery(() => authService.getMyPin(scope), [scope.schoolId, scope.userId]);
  const ready = pin.status === 'ready' && !(pin.data.setupRequired ?? !pin.data.pinSet);
  const smsSession = Boolean(session?.authMethods.includes('SMS_OTP'));
  useEffect(() => {
    // Trust this device once the PIN is in place, so the next sign-in needs no SMS.
    if (!ready || !smsSession) return;
    const d = authService.getTrustedDevice('TEACHER');
    if (d && d.userId === scope.userId) return;
    void authService.trustThisDevice();
  }, [ready, smsSession, scope.userId]);

  if (pin.status === 'loading') return <div className="p-6"><LoadingBlock /></div>;
  if (pin.status === 'error') return <div className="p-6"><ErrorState message={pin.error} onRetry={pin.reload} /></div>;
  if (!ready) return <TeacherPinSetup resetting={pin.data.pinSet} onDone={pin.reload} />;
  return <TeacherPortal />;
};

const TeacherPortal: React.FC = () => {
  const scope = useScope();
  const a = useQuery(() => academicsService.getTeacherAssignments(scope), [scope.schoolId, scope.userId]);
  const ct = a.data?.classTeacherOf ?? null;
  const leaves = useQuery(
    () => (ct ? leaveService.listForClass(scope, ct.id) : Promise.resolve({ ok: true as const, data: [] })),
    [scope.schoolId, ct?.id]
  );
  // The leave-request badge drops as soon as the Class Teacher decides one.
  useReloadOnDataChange(leaves.reload);
  if (a.status === 'loading') return <div className="p-6"><LoadingBlock /></div>;

  const pendingLeave = (leaves.data ?? []).filter(l => l.status === 'PENDING').length;
  const groups: StaffNavGroup[] = [
    {
      title: 'My Teaching',
      items: [
        { to: '/teacher/today', label: 'Today', icon: Home },
        { to: '/teacher/marks', label: 'Marks entry', icon: NotebookPen },
        { to: '/teacher/homework', label: 'Homework', icon: BookOpenCheck },
        { to: '/teacher/messages', label: 'Messages from parents', icon: MessageSquare },
        { to: '/teacher/notices', label: 'Notices', icon: Megaphone },
        { to: '/teacher/corrections', label: 'Result corrections', icon: FileEdit },
        { to: '/teacher/my-leave', label: 'My leave', icon: CalendarOff },
        { to: '/teacher/pin', label: 'Sign-in PIN', icon: KeyRound }
      ]
    }
  ];
  if (ct) {
    groups.push({
      title: `My Class Teacher Responsibility · ${ct.grade}-${ct.section}`,
      items: [
        { to: '/teacher/attendance', label: 'Attendance register', icon: CalendarCheck },
        { to: '/teacher/leave-requests', label: 'Leave requests', icon: UserCheck, badge: pendingLeave },
        { to: '/teacher/class-results', label: 'Marks review & report cards', icon: ClipboardList },
        { to: '/teacher/hall-tickets', label: 'Hall ticket release', icon: ShieldCheck },
        { to: '/teacher/gate', label: 'Pickup gate check', icon: DoorOpen }
      ]
    });
  }
  const bottom: StaffNavItem[] = [
    { to: '/teacher/today', label: 'Today', icon: Home },
    ...(ct ? [{ to: '/teacher/attendance', label: 'Attendance', icon: CalendarCheck }] : []),
    { to: '/teacher/marks', label: 'Marks', icon: NotebookPen },
    ...(ct ? [{ to: '/teacher/class-results', label: 'Results', icon: FileCheck2 }] : [])
  ];
  // Mobile drawer: only what the bottom bar, the Today cards and the in-page links don't already reach.
  // (Marks, attendance, results: bottom bar. Homework, messages, leave requests, hall tickets: Today cards.
  //  Result corrections: a link inside Marks entry and Marks review.) No section title.
  const drawerGroups: StaffNavGroup[] = [
    {
      title: '',
      items: [
        { to: '/teacher/notices', label: 'Notices', icon: Megaphone },
        { to: '/teacher/my-leave', label: 'My leave', icon: CalendarOff },
        { to: '/teacher/pin', label: 'Sign-in PIN', icon: KeyRound }
      ]
    }
  ];
  return (
    <StaffShell
      groups={groups}
      bottom={bottom}
      drawerGroups={drawerGroups}
      showMoreInBottomNav={false}
      headerExtra={<TeacherBell />}
      roleLabel={ct ? `Class Teacher ${ct.grade}-${ct.section}` : 'Subject Teacher'}
    />
  );
};
