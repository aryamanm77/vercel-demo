import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { QBankShell } from './layouts/QBankShell';
import { StaffAuthPage } from './pages/StaffAuthPage';
import { AdminWorkspacePage } from './pages/admin/AdminWorkspacePage';
import { CoeWorkspacePage } from './pages/coe/CoeWorkspacePage';
import { HodWorkspacePage } from './pages/hod/HodWorkspacePage';
import { InvigilatorWorkspacePage } from './pages/invigilator/InvigilatorWorkspacePage';
import { StudentPortalPage } from './pages/student/StudentPortalPage';

const StaffPortalGate: React.FC = () => {
  const { loading, serverError, authMode, setupRequired, user } = useAuth();

  if (
    loading ||
    serverError ||
    setupRequired ||
    !user ||
    (user.mustChangePassword && authMode === 'standalone')
  ) {
    return <StaffAuthPage />;
  }

  switch (user.role) {
    case 'ADMIN':
      return (
        <QBankShell title="Admin Workspace" subtitle="Users · Subjects · Health · Audit · Backups · Results">
          <AdminWorkspacePage />
        </QBankShell>
      );
    case 'HOD':
      return (
        <QBankShell title="HOD Workspace" subtitle="Module Question Bank Excel Import">
          <HodWorkspacePage />
        </QBankShell>
      );
    case 'COE':
      return (
        <QBankShell title="COE Workspace" subtitle="Paper Sets · Session Control · Student Roster">
          <CoeWorkspacePage />
        </QBankShell>
      );
    case 'INVIGILATOR':
      return (
        <QBankShell title="Invigilator Workspace" subtitle="Room Monitor · Reset Login · Extra Time">
          <InvigilatorWorkspacePage />
        </QBankShell>
      );
    default:
      return (
        <QBankShell title="QBank Staff Portal">
          <div className="bg-white rounded-lg border border-slate-200 p-6 text-sm text-slate-700">
            Signed-in role &ldquo;{user.role}&rdquo; uses the{' '}
            <a href="/admin/student" className="text-blue-600 underline font-semibold">
              Student Exam Portal
            </a>
            .
          </div>
        </QBankShell>
      );
  }
};

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/admin/student" element={<StudentPortalPage />} />
          <Route path="/student" element={<StudentPortalPage />} />
          <Route path="/admin/login" element={<StaffPortalGate />} />
          <Route path="/admin/*" element={<StaffPortalGate />} />
          <Route path="/" element={<Navigate to="/admin/login" replace />} />
          <Route path="*" element={<Navigate to="/admin/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
