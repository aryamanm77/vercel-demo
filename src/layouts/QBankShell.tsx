import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ExternalLink,
  GraduationCap,
  KeyRound,
  LogOut,
  Shield,
  X,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { StatusBadge } from '../components/StatusBadge';

interface QBankShellProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export const QBankShell: React.FC<QBankShellProps> = ({ title, subtitle, children }) => {
  const { user, authMode, logout, changePassword } = useAuth();
  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    setPwSuccess(null);
    setPwBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
      setPwSuccess('Password updated.');
      setCurrentPassword('');
      setNewPassword('');
      setTimeout(() => {
        setPwModalOpen(false);
        setPwSuccess(null);
      }, 900);
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Unable to update password');
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F6FA] text-slate-900 flex flex-col">
      <header className="bg-[#0F172A] text-white border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600/20 border border-blue-400/40 flex items-center justify-center">
              <Shield className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-tight text-base">QBank Portal</span>
                {user && <StatusBadge status={user.role} />}
              </div>
              <p className="text-xs text-slate-300">
                {title}
                {subtitle ? ` — ${subtitle}` : ''}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/admin/student"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600/20 border border-emerald-400/40 text-emerald-200 hover:bg-emerald-600/30 text-xs font-semibold transition-colors"
            >
              <GraduationCap className="w-3.5 h-3.5" />
              Student Exam Portal
            </Link>
            <a
              href="/qbank/index.html"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
            >
              Classic QBank UI
              <ExternalLink className="w-3 h-3" />
            </a>

            {user && (
              <>
                <span className="text-xs text-slate-300 px-2 border-l border-slate-700">
                  {user.displayName} ({user.username})
                </span>
                {authMode === 'standalone' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setPwModalOpen(true)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-xs font-medium transition-colors"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      Password
                    </button>
                    <button
                      type="button"
                      onClick={() => void logout()}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-red-900/50 hover:bg-red-800/70 border border-red-500/40 text-red-100 text-xs font-semibold transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Sign Out
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">{children}</main>

      {pwModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-lg bg-white border border-slate-200 shadow-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">Change Staff Password</h3>
              <button
                type="button"
                onClick={() => setPwModalOpen(false)}
                className="p-1 text-slate-500 hover:text-slate-900 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handlePasswordSubmit} className="p-5 space-y-4">
              {pwError && (
                <div className="p-2.5 rounded bg-red-50 border border-red-200 text-xs text-red-800">
                  {pwError}
                </div>
              )}
              {pwSuccess && (
                <div className="p-2.5 rounded bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                  {pwSuccess}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
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
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPwModalOpen(false)}
                  className="px-3.5 py-2 text-xs font-semibold border border-slate-300 rounded-md hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pwBusy}
                  className="px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {pwBusy ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
