import React from 'react';
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
} from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { UserRole } from './types';
import { PrincipalLayout } from './layouts/PrincipalLayout';
import { HodLayout } from './layouts/HodLayout';
import { LoginPage } from './pages/LoginPage';
import { ProfileSettingsPage } from './pages/ProfileSettingsPage';

// Principal Pages
import { PrincipalDashboardPage } from './pages/principal/PrincipalDashboardPage';
import { DepartmentManagementPage } from './pages/principal/DepartmentManagementPage';
import { AcademicStructurePage } from './pages/principal/AcademicStructurePage';
import { UserManagementPage } from './pages/principal/UserManagementPage';
import { InstitutionReportsPage } from './pages/principal/InstitutionReportsPage';
import { AuditLogsPage } from './pages/principal/AuditLogsPage';

// HOD Pages
import { HodDashboardPage } from './pages/hod/HodDashboardPage';
import { QuestionBankPage } from './pages/hod/QuestionBankPage';
import { StudentManagementPage } from './pages/hod/StudentManagementPage';
import { SubmissionHistoryPage } from './pages/hod/SubmissionHistoryPage';
import { HodExamStatusPage } from './pages/hod/HodExamStatusPage';
import { DepartmentResultsPage } from './pages/hod/DepartmentResultsPage';

const RoleGuard: React.FC<{
  allowedRole: UserRole;
  children: React.ReactNode;
}> = ({ allowedRole, children }) => {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/admin/login" replace />;
  }

  if (user.role !== allowedRole) {
    const returnPath =
      user.role === 'PRINCIPAL' ? '/admin/principal/dashboard' : '/admin/hod/dashboard';
    return (
      <div className="min-h-screen bg-[#F5F7FB] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-lg border border-[#D9E2EF] p-6 space-y-4 text-center">
          <div className="w-12 h-12 rounded-full bg-[#B42318]/10 text-[#B42318] flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-bold text-[#17243A]">
            Access Restricted – Role Permission Boundary
          </h1>
          <p className="text-xs text-[#64748B] leading-relaxed">
            Your signed-in role (<strong>{user.role}</strong>) is not authorized to access this portal module. Restricted institutional data has not been exposed.
          </p>
          <div className="pt-2">
            <Link
              to={returnPath}
              className="inline-block px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md"
            >
              Return to Authorized Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

const RootRedirect: React.FC = () => {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/admin/login" replace />;
  }
  return (
    <Navigate
      to={user.role === 'PRINCIPAL' ? '/admin/principal/dashboard' : '/admin/hod/dashboard'}
      replace
    />
  );
};

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/admin" element={<RootRedirect />} />
          <Route path="/admin/login" element={<LoginPage />} />

          {/* PART A: PRINCIPAL PORTAL ROUTES */}
          <Route
            path="/admin/principal"
            element={
              <RoleGuard allowedRole="PRINCIPAL">
                <PrincipalLayout />
              </RoleGuard>
            }
          >
            <Route index element={<Navigate to="/admin/principal/dashboard" replace />} />
            <Route path="dashboard" element={<PrincipalDashboardPage />} />
            <Route path="departments" element={<DepartmentManagementPage />} />
            <Route path="academic-structure" element={<AcademicStructurePage />} />
            <Route path="users" element={<UserManagementPage />} />
            <Route path="reports" element={<InstitutionReportsPage />} />
            <Route path="audit-logs" element={<AuditLogsPage />} />
            <Route path="profile" element={<ProfileSettingsPage mode="profile" />} />
            <Route path="settings" element={<ProfileSettingsPage mode="settings" />} />
          </Route>

          {/* PART B: HOD PORTAL ROUTES */}
          <Route
            path="/admin/hod"
            element={
              <RoleGuard allowedRole="HOD">
                <HodLayout />
              </RoleGuard>
            }
          >
            <Route index element={<Navigate to="/admin/hod/dashboard" replace />} />
            <Route path="dashboard" element={<HodDashboardPage subView="dashboard" />} />
            <Route path="department" element={<HodDashboardPage subView="department" />} />
            <Route path="subjects" element={<HodDashboardPage subView="subjects" />} />
            <Route path="question-bank" element={<QuestionBankPage />} />
            <Route path="student-management" element={<StudentManagementPage />} />
            <Route path="submission-history" element={<SubmissionHistoryPage />} />
            <Route path="exam-status" element={<HodExamStatusPage />} />
            <Route path="results" element={<DepartmentResultsPage />} />
            <Route path="profile" element={<ProfileSettingsPage mode="profile" />} />
            <Route path="settings" element={<ProfileSettingsPage mode="settings" />} />
          </Route>

          {/* Catch-all Redirect */}
          <Route path="*" element={<RootRedirect />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
