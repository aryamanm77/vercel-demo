import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { InstitutionLogo } from '../components/InstitutionLogo';
import { useAuth } from '../hooks/useAuth';
import { resetMockDb } from '../data/mockDatabase';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ identifier?: string; password?: string }>({});

  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [recoveryIdentifier, setRecoveryIdentifier] = useState('');
  const [recoverySubmitted, setRecoverySubmitted] = useState(false);
  const [resetDbNotice, setResetDbNotice] = useState(false);

  const validateForm = () => {
    const errs: { identifier?: string; password?: string } = {};
    if (!identifier.trim()) {
      errs.identifier = 'Institutional username, email, or Employee ID is required.';
    }
    if (!password) {
      errs.password = 'Password is required.';
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!validateForm()) return;

    setLoading(true);
    try {
      const response = await login({ identifier, password });
      navigate(response.redirectPath, { replace: true });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const fillDemoAccount = (demoEmail: string, demoPass: string) => {
    setIdentifier(demoEmail);
    setPassword(demoPass);
    setFieldErrors({});
    setErrorMsg(null);
  };

  const handleResetDemoData = () => {
    resetMockDb();
    setResetDbNotice(true);
    setTimeout(() => setResetDbNotice(false), 3000);
  };

  return (
    <div className="min-h-screen bg-[#F5F7FB] flex flex-col justify-between">
      {/* Top-Left Brand Header per UI/UX Style Guide */}
      <header className="w-full bg-white border-b border-[#D9E2EF] px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <InstitutionLogo
            variant="login"
            subtitle="Maharaja Institute of Technology Mysore – Examination Management System"
          />
          <div className="flex flex-wrap items-center gap-3 text-xs text-[#64748B]">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#2563EB] shrink-0" />
              <span>Central Administrative Portal (Principal & HOD)</span>
            </div>
            <span className="text-slate-300 hidden sm:inline" aria-hidden="true">|</span>
            <a
              href="/qbank/index.html"
              className="font-medium text-[#2563EB] hover:underline whitespace-nowrap"
            >
              QBank COE & Exam Portal
            </a>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <a
              href="/qbank/student.html"
              className="font-medium text-[#2563EB] hover:underline whitespace-nowrap"
            >
              Student Exam Portal
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {/* Left Column: Official Sign-In Form */}
          <div className="lg:col-span-7 bg-white rounded-lg border border-[#D9E2EF] shadow-xs p-6 sm:p-8 flex flex-col justify-between">
            <div>
              <div className="mb-6 pb-4 border-b border-[#D9E2EF]">
                <div className="text-xs font-semibold text-[#2563EB] tracking-wide mb-1">
                  Institutional Authentication
                </div>
                <h1 className="text-2xl font-bold text-[#17243A]">
                  Admin Portal Sign In
                </h1>
                <p className="text-sm text-[#64748B] mt-1">
                  Sign in with your authorized MIT Mysore credentials. Your role and department access scope are automatically resolved by the authentication service.
                </p>
              </div>

              {errorMsg && (
                <div
                  role="alert"
                  className="mb-5 p-3.5 rounded-md bg-[#B42318]/10 border border-[#B42318]/30 flex items-start gap-2.5 text-xs text-[#B42318]"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold">Authentication Error</div>
                    <div className="mt-0.5">{errorMsg}</div>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate className="space-y-4">
                <div>
                  <label
                    htmlFor="login-identifier"
                    className="block text-xs font-semibold text-[#1F2937] mb-1.5"
                  >
                    Institutional Email, Username, or Employee ID <span className="text-[#B42318]">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="login-identifier"
                      type="text"
                      autoComplete="username"
                      value={identifier}
                      onChange={(e) => {
                        setIdentifier(e.target.value);
                        if (fieldErrors.identifier) setFieldErrors({ ...fieldErrors, identifier: undefined });
                      }}
                      placeholder="e.g., principal@mitmysore.in or hod.cse@mitmysore.in"
                      className={`w-full pl-10 pr-3.5 py-2.5 text-sm bg-white border rounded-md text-[#1F2937] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB] ${
                        fieldErrors.identifier ? 'border-[#B42318]' : 'border-[#D9E2EF]'
                      }`}
                    />
                  </div>
                  {fieldErrors.identifier && (
                    <p className="mt-1 text-xs text-[#B42318]">{fieldErrors.identifier}</p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="login-password"
                      className="block text-xs font-semibold text-[#1F2937]"
                    >
                      Password <span className="text-[#B42318]">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setForgotModalOpen(true);
                        setRecoverySubmitted(false);
                      }}
                      className="text-xs font-medium text-[#2563EB] hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (fieldErrors.password) setFieldErrors({ ...fieldErrors, password: undefined });
                      }}
                      placeholder="Enter your institutional password"
                      className={`w-full pl-10 pr-10 py-2.5 text-sm bg-white border rounded-md text-[#1F2937] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB] ${
                        fieldErrors.password ? 'border-[#B42318]' : 'border-[#D9E2EF]'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#64748B] hover:text-[#1F2937]"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {fieldErrors.password && (
                    <p className="mt-1 text-xs text-[#B42318]">{fieldErrors.password}</p>
                  )}
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold rounded-md transition-colors disabled:opacity-60 cursor-pointer"
                  >
                    {loading ? 'Verifying Institutional Credentials...' : 'Sign In to Admin Portal'}
                  </button>
                </div>
              </form>
            </div>

            <div className="mt-6 pt-4 border-t border-[#D9E2EF] text-xs text-[#64748B] flex items-center justify-between gap-2">
              <span>Role-Based Access Control (RBAC) enforced on session token.</span>
              <span className="font-mono">API v1 · Mock Adapter Ready</span>
            </div>
          </div>

          {/* Right Column: Development Mode Demo Accounts & Architecture Notes */}
          <div className="lg:col-span-5 bg-[#17243A] text-white rounded-lg p-6 sm:p-7 flex flex-col justify-between">
            <div className="space-y-5">
              <div>
                <div className="text-xs font-semibold text-blue-300 tracking-wide">
                  Development Mode Credentials
                </div>
                <h2 className="text-lg font-bold text-white mt-1">
                  Authorized Test Accounts
                </h2>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  In accordance with the MIT Mysore System Architecture specification, users cannot select an arbitrary role on login. Select a verified account below to populate its credentials and test role-determined routing:
                </p>
              </div>

              <div className="space-y-3">
                {/* Principal Demo Account */}
                <div className="p-3.5 rounded-md bg-white/5 border border-white/15 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">
                      1. Principal Account (Institution-Wide)
                    </span>
                    <span className="text-[11px] font-mono text-blue-300">
                      MITM-ADM-001
                    </span>
                  </div>
                  <div className="text-xs text-slate-300 space-y-0.5 font-mono">
                    <div>Email: principal@mitmysore.in</div>
                    <div>Pass: Principal@2026</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => fillDemoAccount('principal@mitmysore.in', 'Principal@2026')}
                    className="w-full py-1.5 px-3 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold rounded-md transition-colors"
                  >
                    Fill Principal Credentials
                  </button>
                </div>

                {/* CSE HOD Demo Account */}
                <div className="p-3.5 rounded-md bg-white/5 border border-white/15 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">
                      2. HOD Account – CSE Department
                    </span>
                    <span className="text-[11px] font-mono text-violet-300">
                      MITM-CSE-101
                    </span>
                  </div>
                  <div className="text-xs text-slate-300 space-y-0.5 font-mono">
                    <div>Email: hod.cse@mitmysore.in</div>
                    <div>Pass: HodCse@2026</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => fillDemoAccount('hod.cse@mitmysore.in', 'HodCse@2026')}
                    className="w-full py-1.5 px-3 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-md transition-colors"
                  >
                    Fill CSE HOD Credentials
                  </button>
                </div>

                {/* ECE HOD Demo Account */}
                <div className="p-3.5 rounded-md bg-white/5 border border-white/15 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">
                      3. HOD Account – ECE Department
                    </span>
                    <span className="text-[11px] font-mono text-violet-300">
                      MITM-ECE-101
                    </span>
                  </div>
                  <div className="text-xs text-slate-300 space-y-0.5 font-mono">
                    <div>Email: hod.ece@mitmysore.in</div>
                    <div>Pass: HodEce@2026</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => fillDemoAccount('hod.ece@mitmysore.in', 'HodEce@2026')}
                    className="w-full py-1.5 px-3 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-md transition-colors"
                  >
                    Fill ECE HOD Credentials
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-white/10 flex items-center justify-between gap-2">
              <div className="text-[11px] text-slate-300">
                {resetDbNotice ? (
                  <span className="text-emerald-300 font-medium">
                    Development data restored to defaults.
                  </span>
                ) : (
                  <span>Need a fresh state after testing submissions?</span>
                )}
              </div>
              <button
                type="button"
                onClick={handleResetDemoData}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium text-slate-200 bg-white/10 hover:bg-white/20 transition-colors shrink-0"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Demo Data</span>
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full bg-white border-t border-[#D9E2EF] px-6 py-3.5 text-xs text-[#64748B]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Maharaja Institute of Technology Mysore – Examination Management System</span>
          <span>Central Administrative Portal · Belawadi, Srirangapatna Taluk, Mandya – 571477</span>
        </div>
      </footer>

      {/* Forgot Password Modal */}
      {forgotModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17243A]/60 p-4">
          <div className="w-full max-w-md bg-white rounded-lg border border-[#D9E2EF] shadow-lg overflow-hidden">
            <div className="px-6 py-4 bg-[#F5F7FB] border-b border-[#D9E2EF] flex items-center gap-2.5">
              <KeyRound className="w-5 h-5 text-[#2563EB]" />
              <h3 className="text-base font-bold text-[#17243A]">
                Authorized Password Recovery
              </h3>
            </div>
            <div className="p-6 space-y-4">
              {recoverySubmitted ? (
                <div className="p-4 rounded-md bg-[#16834A]/10 border border-[#16834A]/30 text-xs text-[#16834A] space-y-1.5">
                  <div className="flex items-center gap-2 font-semibold text-sm">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Recovery Request Logged</span>
                  </div>
                  <p className="text-[#1F2937]">
                    An institutional credential reset request for <strong>{recoveryIdentifier}</strong> has been logged with the Central Administration / Principal Office.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-[#64748B] leading-relaxed">
                    For security compliance, HOD and Administrative credentials cannot be reset anonymously. Enter your institutional email or Employee ID to initiate an audited reset request.
                  </p>
                  <div>
                    <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                      Institutional Email or Employee ID
                    </label>
                    <input
                      type="text"
                      value={recoveryIdentifier}
                      onChange={(e) => setRecoveryIdentifier(e.target.value)}
                      placeholder="e.g., hod.cse@mitmysore.in"
                      className="w-full px-3 py-2 text-sm border border-[#D9E2EF] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                    />
                  </div>
                </>
              )}
            </div>
            <div className="px-6 py-3.5 bg-[#F5F7FB] border-t border-[#D9E2EF] flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setForgotModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-[#1F2937] bg-white border border-[#D9E2EF] rounded-md hover:bg-slate-100"
              >
                Close
              </button>
              {!recoverySubmitted && (
                <button
                  type="button"
                  disabled={!recoveryIdentifier.trim()}
                  onClick={() => setRecoverySubmitted(true)}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md disabled:opacity-50"
                >
                  Request Authorized Reset
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
