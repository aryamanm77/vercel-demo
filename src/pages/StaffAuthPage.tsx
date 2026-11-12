import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ExternalLink,
  GraduationCap,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export const StaffAuthPage: React.FC = () => {
  const { loading, serverError, authMode, setupRequired, user, refreshInfo, setupAdmin, login, changePassword } =
    useAuth();

  // Initial setup form
  const [setupUser, setSetupUser] = useState('admin');
  const [setupName, setSetupName] = useState('System Administrator');
  const [setupPw, setSetupPw] = useState('');

  // Login form
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Forced change password
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');

  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);
    setBusy(true);
    try {
      await setupAdmin(setupUser.trim(), setupName.trim(), setupPw);
      setInfoMsg('Primary QBank Admin account created. Sign in below to continue.');
      setSetupPw('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Admin setup failed');
    } finally {
      setBusy(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);
    setBusy(true);
    try {
      await login(username.trim(), password);
      setPassword('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid username or password');
    } finally {
      setBusy(false);
    }
  };

  const handleForceChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setBusy(true);
    try {
      await changePassword(curPw, newPw);
      setCurPw('');
      setNewPw('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to update password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F6FA] flex flex-col">
      <header className="bg-[#0F172A] text-white border-b border-slate-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600/20 border border-blue-400/40 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h1 className="font-bold text-base tracking-tight">
                QBank Examination Portal
              </h1>
              <p className="text-xs text-slate-300">
                Admin · HOD · Controller of Examinations · Invigilator · Student
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/admin/student"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors"
            >
              <GraduationCap className="w-3.5 h-3.5" />
              Student Exam Login
            </Link>
            <a
              href="/qbank/index.html"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
            >
              Classic QBank UI
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          {loading ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center shadow-sm">
              <RefreshCw className="w-6 h-6 text-blue-600 animate-spin mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-700">Connecting to QBank backend...</p>
            </div>
          ) : serverError ? (
            <div className="bg-white rounded-xl border border-red-200 p-6 shadow-sm space-y-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-base font-bold text-slate-900">QBank Server Waking Up</h2>
                  <p className="text-xs text-slate-600 mt-1">{serverError}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void refreshInfo()}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-md transition-colors"
              >
                Retry Connection
              </button>
            </div>
          ) : setupRequired ? (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Initial QBank Admin Setup</h2>
                <p className="text-xs text-slate-600 mt-1">
                  Create the primary Admin account to configure subjects and create HOD, COE, and
                  Invigilator accounts.
                </p>
              </div>
              {errorMsg && (
                <div className="p-3 rounded bg-red-50 border border-red-200 text-xs text-red-800">
                  {errorMsg}
                </div>
              )}
              <form onSubmit={handleSetup} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Username</label>
                  <input
                    type="text"
                    required
                    value={setupUser}
                    onChange={(e) => setSetupUser(e.target.value)}
                    placeholder="admin"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={setupName}
                    onChange={(e) => setSetupName(e.target.value)}
                    placeholder="System Administrator"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Password (minimum 8 characters)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={setupPw}
                    onChange={(e) => setSetupPw(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-md transition-colors disabled:opacity-50"
                >
                  {busy ? 'Creating Admin...' : 'Create Admin Account'}
                </button>
              </form>
            </div>
          ) : user && user.mustChangePassword && authMode === 'standalone' ? (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2.5">
                <KeyRound className="w-5 h-5 text-amber-600" />
                <div>
                  <h2 className="text-base font-bold text-slate-900">Change Temporary Password</h2>
                  <p className="text-xs text-slate-600">
                    Signed in as {user.displayName} ({user.role})
                  </p>
                </div>
              </div>
              {errorMsg && (
                <div className="p-3 rounded bg-red-50 border border-red-200 text-xs text-red-800">
                  {errorMsg}
                </div>
              )}
              <form onSubmit={handleForceChange} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Current Temporary Password
                  </label>
                  <input
                    type="password"
                    required
                    value={curPw}
                    onChange={(e) => setCurPw(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    New Password (minimum 8 characters)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-md transition-colors disabled:opacity-50"
                >
                  {busy ? 'Updating...' : 'Update Password & Continue'}
                </button>
              </form>
            </div>
          ) : authMode === 'host' && !user ? (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm text-sm text-slate-700">
              Sign in via your host portal session to access QBank.
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2.5">
                <UserCheck className="w-5 h-5 text-blue-600" />
                <div>
                  <h2 className="text-lg font-bold text-slate-900">QBank Staff Sign-In</h2>
                  <p className="text-xs text-slate-500">
                    Admin · HOD (Question Upload) · COE (Papers &amp; Roster) · Invigilator
                  </p>
                </div>
              </div>

              {infoMsg && (
                <div className="p-3 rounded bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                  {infoMsg}
                </div>
              )}
              {errorMsg && (
                <div className="p-3 rounded bg-red-50 border border-red-200 text-xs text-red-800">
                  {errorMsg}
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Username</label>
                  <input
                    type="text"
                    required
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="admin / hod_cs / coe / invigilator"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-md transition-colors disabled:opacity-50"
                >
                  {busy ? 'Signing In...' : 'Sign In to QBank'}
                </button>
              </form>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-xs">
                <span className="text-slate-500">Taking an exam as a student?</span>
                <Link
                  to="/admin/student"
                  className="font-semibold text-emerald-700 hover:text-emerald-800 underline"
                >
                  Open Student Exam Portal →
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
