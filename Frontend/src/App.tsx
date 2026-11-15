/**
 * FutureSchool - Main Application Routing & Providers
 * 
 * NOTE: Route guards in this client codebase provide UX-level navigation flow only;
 * real authorization and data entitlement checks must strictly happen on the backend.
 */

import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AndroidBackHandler } from './app/backNavigation';
import { TenantProvider } from './context/TenantContext';
import { AuthProvider } from './context/AuthContext';
import { PlatformTenantProvider } from './context/PlatformTenantContext';

// === EAGER: Critical path — loaded before any lazy chunk ===
import { ProtectedRoute } from './components/common/ProtectedRoute';
import { AppShell } from './components/layout/AppShell';
import { LoginPage } from './modules/auth/LoginPage';
import { IdpCallback } from './modules/auth/IdpCallback';
import { LoadingSpinner } from './components/common/LoadingSpinner';
import { isEnabled } from './app/featureFlags';

// === LAZY: Student Modules ===
const StudentDashboard = React.lazy(() =>
  import('./modules/student/StudentDashboard').then(m => ({ default: m.StudentDashboard }))
);
const StudentAcademics = React.lazy(() =>
  import('./modules/student/StudentAcademics').then(m => ({ default: m.StudentAcademics }))
);
const StudentAttendance = React.lazy(() =>
  import('./modules/student/StudentAttendance').then(m => ({ default: m.StudentAttendance }))
);
const StudentHomework = React.lazy(() =>
  import('./modules/student/StudentHomework').then(m => ({ default: m.StudentHomework }))
);
const StudentQuiz = React.lazy(() =>
  import('./modules/student/StudentQuiz').then(m => ({ default: m.StudentQuiz }))
);
const StudentMaterials = React.lazy(() =>
  import('./modules/student/StudentMaterials').then(m => ({ default: m.StudentMaterials }))
);
const StudentLibrary = React.lazy(() =>
  import('./modules/student/StudentLibrary').then(m => ({ default: m.StudentLibrary }))
);
const StudentAiTutor = React.lazy(() =>
  import('./modules/student/StudentAiTutor').then(m => ({ default: m.StudentAiTutor }))
);
const StudentTimetable = React.lazy(() =>
  import('./modules/student/StudentTimetable').then(m => ({ default: m.StudentTimetable }))
);
const StudentHallTicket = React.lazy(() =>
  import('./modules/student/StudentHallTicket').then(m => ({ default: m.StudentHallTicket }))
);
const StudentProgress = React.lazy(() =>
  import('./modules/student/StudentProgress').then(m => ({ default: m.StudentProgress }))
);
const StudentProfile = React.lazy(() =>
  import('./modules/student/StudentProfile').then(m => ({ default: m.StudentProfile }))
);
const StudentFees = React.lazy(() =>
  import('./modules/student/StudentFees').then(m => ({ default: m.StudentFees }))
);
const StudentNotices = React.lazy(() =>
  import('./modules/student/StudentNotices').then(m => ({ default: m.StudentNotices }))
);

// === LAZY: Parent Modules ===
const ParentShell = React.lazy(() => import('./modules/parent/app/ParentShell').then(m => ({ default: m.ParentShell })));
const ParentHome = React.lazy(() => import('./modules/parent/app/ParentHome').then(m => ({ default: m.ParentHome })));
const ParentAttendancePage = React.lazy(() => import('./modules/parent/app/ParentAttendance').then(m => ({ default: m.ParentAttendancePage })));
const ParentAcademics = React.lazy(() => import('./modules/parent/app/ParentAcademics').then(m => ({ default: m.ParentAcademics })));
const ParentFeesPage = React.lazy(() => import('./modules/parent/app/ParentFeesPage').then(m => ({ default: m.ParentFeesPage })));
const ParentMessagesPage = React.lazy(() => import('./modules/parent/app/ParentMessagesPage').then(m => ({ default: m.ParentMessagesPage })));
const ParentMore = React.lazy(() => import('./modules/parent/app/ParentMore').then(m => ({ default: m.ParentMore })));
const ParentConsentPage = React.lazy(() => import('./modules/parent/app/ParentMore').then(m => ({ default: m.ParentConsentPage })));
const ParentNoticesPage = React.lazy(() => import('./modules/parent/app/ParentMore').then(m => ({ default: m.ParentNoticesPage })));
const ParentLeavePage = React.lazy(() => import('./modules/parent/app/ParentLeavePage').then(m => ({ default: m.ParentLeavePage })));
const ParentTransport = React.lazy(() => import('./modules/parent/app/ParentTransportPage').then(m => ({ default: m.ParentTransportPage })));
const ParentComplaints = React.lazy(() => import('./modules/parent/app/ParentComplaintsPage').then(m => ({ default: m.ParentComplaintsPage })));
const ParentMeetings = React.lazy(() => import('./modules/parent/app/ParentPickupAndMeetings').then(m => ({ default: m.ParentMeetingsPage })));
const ParentPickup = React.lazy(() => import('./modules/parent/app/ParentPickupAndMeetings').then(m => ({ default: m.ParentPickupPage })));

// === LAZY: Teacher Modules ===
const TeacherLayout = React.lazy(() => import('./modules/teacher/app/TeacherLayout').then(m => ({ default: m.TeacherLayout })));
const TeacherToday = React.lazy(() => import('./modules/teacher/app/TeacherToday').then(m => ({ default: m.TeacherToday })));
const TeacherAttendanceRegister = React.lazy(() => import('./modules/teacher/app/TeacherAttendanceRegister').then(m => ({ default: m.TeacherAttendanceRegister })));
const TeacherMarks = React.lazy(() => import('./modules/teacher/app/TeacherMarks').then(m => ({ default: m.TeacherMarks })));
const TeacherClassResults = React.lazy(() => import('./modules/teacher/app/TeacherClassResults').then(m => ({ default: m.TeacherClassResults })));
const TeacherLeaveReview = React.lazy(() => import('./modules/teacher/app/TeacherLeaveReview').then(m => ({ default: m.TeacherLeaveReview })));
const TeacherCorrections = React.lazy(() => import('./modules/teacher/app/TeacherCorrections').then(m => ({ default: m.TeacherCorrections })));
const TeacherMyLeave = React.lazy(() => import('./modules/teacher/app/TeacherMyLeave').then(m => ({ default: m.TeacherMyLeave })));
const TeacherSignInPin = React.lazy(() => import('./modules/teacher/app/TeacherSignInPin').then(m => ({ default: m.TeacherSignInPin })));
const TeacherMessages = React.lazy(() => import('./modules/teacher/app/TeacherMessagesAndHomework').then(m => ({ default: m.TeacherMessages })));
const TeacherHomework = React.lazy(() => import('./modules/teacher/app/TeacherMessagesAndHomework').then(m => ({ default: m.TeacherHomework })));
const TeacherHallTicketRelease = React.lazy(() => import('./modules/teacher/TeacherHallTicketRelease').then(m => ({ default: m.TeacherHallTicketRelease })));

// === LAZY: Principal Modules ===
const PrincipalLayout = React.lazy(() => import('./modules/principal/app/PrincipalLayout').then(m => ({ default: m.PrincipalLayout })));
const PrincipalHome = React.lazy(() => import('./modules/principal/app/PrincipalHome').then(m => ({ default: m.PrincipalHome })));
const PrincipalRequests = React.lazy(() => import('./modules/principal/app/PrincipalRequests').then(m => ({ default: m.PrincipalRequests })));
const PrincipalCorrections = React.lazy(() => import('./modules/principal/app/PrincipalCorrectionsAndLeave').then(m => ({ default: m.PrincipalCorrections })));
const PrincipalTeacherLeave = React.lazy(() => import('./modules/principal/app/PrincipalCorrectionsAndLeave').then(m => ({ default: m.PrincipalTeacherLeave })));
const PrincipalReportCardApprovals = React.lazy(() => import('./modules/principal/PrincipalReportCardApprovals').then(m => ({ default: m.PrincipalReportCardApprovals })));
const PrincipalHallTickets = React.lazy(() => import('./modules/principal/PrincipalHallTickets').then(m => ({ default: m.PrincipalHallTickets })));

// === LAZY: Admin Modules ===
const AdminLayout = React.lazy(() => import('./modules/admin/app/AdminLayout').then(m => ({ default: m.AdminLayout })));
const AdminHome = React.lazy(() => import('./modules/admin/app/AdminHome').then(m => ({ default: m.AdminHome })));
const AdminRequests = React.lazy(() => import('./modules/admin/app/AdminRequests').then(m => ({ default: m.AdminRequests })));
const AdminFeeDesk = React.lazy(() => import('./modules/admin/app/AdminFeeDesk').then(m => ({ default: m.AdminFeeDesk })));
const AdminSubstitution = React.lazy(() => import('./modules/admin/app/AdminSubstitution').then(m => ({ default: m.AdminSubstitution })));
const AdminTransport = React.lazy(() => import('./modules/admin/app/AdminTransport').then(m => ({ default: m.AdminTransport })));
const AdminComplaints = React.lazy(() => import('./modules/admin/app/AdminComplaints').then(m => ({ default: m.AdminComplaints })));
const AdminStaffAccess = React.lazy(() => import('./modules/admin/app/AdminStaffAccessAndAudit').then(m => ({ default: m.AdminStaffAccess })));
const AdminAudit = React.lazy(() => import('./modules/admin/app/AdminStaffAccessAndAudit').then(m => ({ default: m.AdminAudit })));
const DriverTrackingPage = React.lazy(() => import('./modules/public/DriverTrackingPage').then(m => ({ default: m.DriverTrackingPage })));
const OwnerDashboard = React.lazy(() => import('./modules/owner/OwnerDashboard').then(m => ({ default: m.OwnerDashboard })));
const AdminAlerts = React.lazy(() => import('./modules/admin/app/AdminAlerts').then(m => ({ default: m.AdminAlerts })));
const AdminUdiseExport = React.lazy(() => import('./modules/admin/app/AdminUdiseExport').then(m => ({ default: m.AdminUdiseExport })));
const AdminStudents = React.lazy(() => import('./modules/admin/app/AdminStudents').then(m => ({ default: m.AdminStudents })));
const AdminGateCheck = React.lazy(() => import('./modules/admin/app/AdminGateCheck').then(m => ({ default: m.AdminGateCheck })));

// === LAZY: Platform Admin Modules ===
const PlatformDashboard = React.lazy(() =>
  import('./modules/platformAdmin/PlatformDashboard').then(m => ({ default: m.PlatformDashboard }))
);
const PlatformTenantsDirectory = React.lazy(() =>
  import('./modules/platformAdmin/PlatformTenants').then(m => ({ default: m.PlatformTenantsDirectory }))
);
const PlatformVerificationQueue = React.lazy(() =>
  import('./modules/platformAdmin/PlatformTenants').then(m => ({ default: m.PlatformVerificationQueue }))
);
const PlatformTenantOnboarding = React.lazy(() =>
  import('./modules/platformAdmin/PlatformTenants').then(m => ({ default: m.PlatformTenantOnboarding }))
);
const PlatformSubscriptionPlans = React.lazy(() =>
  import('./modules/platformAdmin/PlatformSubscriptions').then(m => ({ default: m.PlatformSubscriptionPlans }))
);
const PlatformCapacityEntitlements = React.lazy(() =>
  import('./modules/platformAdmin/PlatformSubscriptions').then(m => ({ default: m.PlatformCapacityEntitlements }))
);
const PlatformSystemHealth = React.lazy(() =>
  import('./modules/platformAdmin/PlatformGovernance').then(m => ({ default: m.PlatformSystemHealth }))
);
const PlatformSecurityAudit = React.lazy(() =>
  import('./modules/platformAdmin/PlatformGovernance').then(m => ({ default: m.PlatformSecurityAudit }))
);
const PlatformSupportCases = React.lazy(() =>
  import('./modules/platformAdmin/PlatformGovernance').then(m => ({ default: m.PlatformSupportCases }))
);

export default function App() {
  return (
    <BrowserRouter>
      <AndroidBackHandler />
      <AuthProvider>
        <TenantProvider>
          <Suspense fallback={<LoadingSpinner />}>
            <Routes>
              {/* Public Authentication Route */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/drive/:token" element={<DriverTrackingPage />} />
              <Route path="/login/idp-callback" element={<IdpCallback />} />

              {/* Root Redirect */}
              <Route path="/" element={<Navigate to="/login" replace />} />

              {/* ========================================================= */}
              {/* 1. STUDENT ROUTES (Protected)                             */}
              {/* ========================================================= */}
              {isEnabled('STUDENT_LOGIN') && (
              <Route
                path="/student"
                element={
                  <ProtectedRoute allowedRoles={['STUDENT']}>
                    <AppShell />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="/student/dashboard" replace />} />
                <Route path="dashboard" element={<StudentDashboard />} />
                <Route path="academics" element={<StudentAcademics />} />
                <Route path="attendance" element={<StudentAttendance />} />
                <Route path="timetable" element={<StudentTimetable />} />
                <Route path="progress" element={<StudentProgress />} />
                <Route path="homework" element={<StudentHomework />} />
                <Route path="quiz" element={<StudentQuiz />} />
                <Route path="materials" element={<StudentMaterials />} />
                <Route path="library" element={<StudentLibrary />} />
                <Route path="ai-tutor" element={<StudentAiTutor />} />
                <Route path="exams" element={<StudentAcademics />} />
                <Route path="results" element={<StudentAcademics />} />
                <Route path="fees" element={<StudentFees />} />
                <Route path="notices" element={<StudentNotices />} />
                <Route path="hall-ticket" element={<StudentHallTicket />} />
                <Route path="profile" element={<StudentProfile />} />
              </Route>
              )}

              {/* ========================================================= */}
              {/* 2. PARENT ROUTES (Protected)                              */}
              {/* ========================================================= */}
              <Route
                path="/parent"
                element={
                  <ProtectedRoute allowedRoles={['PARENT']}>
                    <ParentShell />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="/parent/home" replace />} />
                <Route path="home" element={<ParentHome />} />
                <Route path="academics" element={<ParentAcademics />} />
                <Route path="fees" element={<ParentFeesPage />} />
                <Route path="messages" element={<ParentMessagesPage />} />
                <Route path="more" element={<ParentMore />} />
                <Route path="leave" element={<ParentLeavePage />} />
                <Route path="consent" element={<ParentConsentPage />} />
                <Route path="meetings" element={<ParentMeetings />} />
                <Route path="pickup" element={<ParentPickup />} />
                <Route path="transport" element={<ParentTransport />} />
                <Route path="complaints" element={<ParentComplaints />} />
                <Route path="notices" element={<ParentNoticesPage />} />
                <Route path="attendance" element={<ParentAttendancePage />} />
                <Route path="dashboard" element={<Navigate to="/parent/home" replace />} />
                <Route path="*" element={<Navigate to="/parent/home" replace />} />
              </Route>

              {/* ========================================================= */}
              {/* 3. TEACHER ROUTES (Protected)                             */}
              {/* ========================================================= */}
              <Route
                path="/teacher"
                element={
                  <ProtectedRoute allowedRoles={['TEACHER']}>
                    <TeacherLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="/teacher/today" replace />} />
                <Route path="today" element={<TeacherToday />} />
                <Route path="attendance" element={<TeacherAttendanceRegister />} />
                <Route path="marks" element={<TeacherMarks />} />
                <Route path="class-results" element={<TeacherClassResults />} />
                <Route path="leave-requests" element={<TeacherLeaveReview />} />
                <Route path="hall-tickets" element={<TeacherHallTicketRelease />} />
                <Route path="corrections" element={<TeacherCorrections />} />
                <Route path="my-leave" element={<TeacherMyLeave />} />
                <Route path="pin" element={<TeacherSignInPin />} />
                <Route path="messages" element={<TeacherMessages />} />
                <Route path="homework" element={<TeacherHomework />} />
                <Route path="*" element={<Navigate to="/teacher/today" replace />} />
              </Route>

              {/* ========================================================= */}
              {/* 4. PRINCIPAL ROUTES (Protected)                           */}
              {/* ========================================================= */}
              <Route
                path="/principal"
                element={
                  <ProtectedRoute allowedRoles={['PRINCIPAL']}>
                    <PrincipalLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="/principal/home" replace />} />
                <Route path="home" element={<PrincipalHome />} />
                <Route path="report-cards" element={<PrincipalReportCardApprovals />} />
                <Route path="corrections" element={<PrincipalCorrections />} />
                <Route path="teacher-leave" element={<PrincipalTeacherLeave />} />
                <Route path="requests" element={<PrincipalRequests />} />
                <Route path="hall-tickets" element={<PrincipalHallTickets />} />
                <Route path="overview" element={<OwnerDashboard />} />
                <Route path="alerts" element={<AdminAlerts />} />
                <Route path="*" element={<Navigate to="/principal/home" replace />} />
              </Route>

              {/* ========================================================= */}
              {/* 5. ADMIN ROUTES (Protected)                               */}
              {/* ========================================================= */}
              <Route
                path="/admin"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN']}>
                    <AdminLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="/admin/home" replace />} />
                <Route path="home" element={<AdminHome />} />
                <Route path="requests" element={<AdminRequests />} />
                <Route path="fees" element={<AdminFeeDesk />} />
                <Route path="substitution" element={<AdminSubstitution />} />
                <Route path="transport" element={<AdminTransport />} />
                <Route path="complaints" element={<AdminComplaints />} />
                <Route path="staff-access" element={<AdminStaffAccess />} />
                <Route path="audit" element={<AdminAudit />} />
                <Route path="gate" element={<AdminGateCheck />} />
                <Route path="overview" element={<OwnerDashboard />} />
                <Route path="alerts" element={<AdminAlerts />} />
                <Route path="udise" element={<AdminUdiseExport />} />
                <Route path="students" element={<AdminStudents />} />
                <Route path="*" element={<Navigate to="/admin/home" replace />} />
              </Route>

              {/* ========================================================= */}
              {/* 6. PLATFORM ADMIN ROUTES (Protected)                      */}
              {/* ========================================================= */}
              {isEnabled('PLATFORM_CONSOLE') && (
              <Route
                path="/platform"
                element={
                  <ProtectedRoute allowedRoles={['PLATFORM_ADMIN']}>
                    <PlatformTenantProvider>
                      <AppShell />
                    </PlatformTenantProvider>
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="/platform/dashboard" replace />} />
                <Route path="dashboard" element={<PlatformDashboard />} />
                <Route path="schools" element={<PlatformTenantsDirectory />} />
                <Route path="verification" element={<PlatformVerificationQueue />} />
                <Route path="onboarding" element={<PlatformTenantOnboarding />} />
                <Route path="plans" element={<PlatformSubscriptionPlans />} />
                <Route path="capacity" element={<PlatformCapacityEntitlements />} />
                <Route path="health" element={<PlatformSystemHealth />} />
                <Route path="audit" element={<PlatformSecurityAudit />} />
                <Route path="support" element={<PlatformSupportCases />} />
              </Route>
              )}

              {/* Catch-all fallback */}
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </Suspense>
        </TenantProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
