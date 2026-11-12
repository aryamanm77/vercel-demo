import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  KeyRound,
  LogOut,
  ShieldCheck,
  UserCircle,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { authService } from '../services/authService';
import { API_CONFIG } from '../services/apiConfig';

interface ProfileSettingsPageProps {
  mode?: 'profile' | 'settings';
}

export const ProfileSettingsPage: React.FC<ProfileSettingsPageProps> = ({ mode = 'profile' }) => {
  const { user, refreshUser, logout } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'profile' | 'security'>(
    mode === 'settings' ? 'security' : 'profile'
  );

  const [fullName, setFullName] = useState(user?.fullName || '');
  const [designation, setDesignation] = useState(user?.designation || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSuccess, setPwdSuccess] = useState<string | null>(null);

  if (!user) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMessage(null);
    setProfileSaving(true);
    try {
      const updated = await authService.updateProfile(user.id, {
        fullName,
        designation,
        phone,
      });
      refreshUser(updated);
      setProfileMessage('Profile details updated in institutional directory.');
    } catch (err) {
      setProfileMessage(err instanceof Error ? err.message : 'Failed to update profile.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError(null);
    setPwdSuccess(null);

    if (newPassword !== confirmPassword) {
      setPwdError('New password and confirmation do not match.');
      return;
    }

    setPwdSaving(true);
    try {
      await authService.changePassword(user.id, currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPwdSuccess('Password updated via authenticated verification.');
    } catch (err) {
      setPwdError(err instanceof Error ? err.message : 'Password change failed.');
    } finally {
      setPwdSaving(false);
    }
  };

  const handleSignOut = () => {
    logout();
    navigate('/admin/login');
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#17243A]">
            Profile & Account Settings
          </h1>
          <p className="text-sm text-[#64748B] mt-0.5">
            Manage your institutional identity, contact records, and authenticated security preferences.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[#B42318] bg-white border border-[#B42318]/30 rounded-md hover:bg-[#B42318]/5 transition-colors self-start"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out of Session</span>
        </button>
      </div>

      {/* Interactive Filter Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors ${
            activeTab === 'profile'
              ? 'bg-white text-[#17243A] shadow-xs'
              : 'text-[#64748B] hover:text-[#1F2937]'
          }`}
        >
          Institutional Profile
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('security')}
          className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors ${
            activeTab === 'security'
              ? 'bg-white text-[#17243A] shadow-xs'
              : 'text-[#64748B] hover:text-[#1F2937]'
          }`}
        >
          Password & Session Security
        </button>
      </div>

      {activeTab === 'profile' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Read-only Institutional Identity Summary */}
          <div className="lg:col-span-5 bg-white rounded-lg border border-[#D9E2EF] p-6 space-y-5">
            <div className="flex items-center gap-3.5 pb-4 border-b border-[#D9E2EF]">
              <div className="w-12 h-12 rounded-full bg-[#17243A] text-white flex items-center justify-center">
                <UserCircle className="w-7 h-7" />
              </div>
              <div>
                <h2 className="text-base font-bold text-[#17243A]">{user.fullName}</h2>
                <div className="text-xs text-[#64748B]">{user.designation}</div>
              </div>
            </div>

            <dl className="space-y-3 text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <dt className="text-[#64748B]">Employee ID</dt>
                <dd className="font-mono font-semibold text-[#1F2937]">{user.employeeId}</dd>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <dt className="text-[#64748B]">Institutional Email</dt>
                <dd className="font-mono text-[#1F2937]">{user.email}</dd>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <dt className="text-[#64748B]">Authorized Role</dt>
                <dd className="font-semibold text-[#2563EB]">{user.role}</dd>
              </div>
              {user.departmentName && (
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <dt className="text-[#64748B]">Assigned Department</dt>
                  <dd className="font-semibold text-[#1F2937]">
                    {user.departmentName} ({user.departmentCode})
                  </dd>
                </div>
              )}
              <div className="flex justify-between py-1.5">
                <dt className="text-[#64748B]">Last Authenticated Sign-In</dt>
                <dd className="font-mono text-[#1F2937]">{user.lastLogin}</dd>
              </div>
            </dl>
          </div>

          {/* Editable Profile Fields */}
          <div className="lg:col-span-7 bg-white rounded-lg border border-[#D9E2EF] p-6">
            <h2 className="text-base font-bold text-[#17243A] mb-1">
              Update Directory Information
            </h2>
            <p className="text-xs text-[#64748B] mb-5">
              Employee ID, Role, and Assigned Department are bound by Central Administration and cannot be altered here.
            </p>

            {profileMessage && (
              <div className="mb-4 p-3 rounded-md bg-[#16834A]/10 border border-[#16834A]/30 text-xs text-[#16834A] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{profileMessage}</span>
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    Employee ID (Read-Only)
                  </label>
                  <input
                    type="text"
                    disabled
                    value={user.employeeId}
                    className="w-full px-3 py-2 text-sm bg-[#F5F7FB] border border-[#D9E2EF] rounded-md text-[#64748B] font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    Official Email (Read-Only)
                  </label>
                  <input
                    type="email"
                    disabled
                    value={user.email}
                    className="w-full px-3 py-2 text-sm bg-[#F5F7FB] border border-[#D9E2EF] rounded-md text-[#64748B]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                  Full Name <span className="text-[#B42318]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-[#D9E2EF] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    Designation
                  </label>
                  <input
                    type="text"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-[#D9E2EF] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    Office / Intercom Contact
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 821 2972201"
                    className="w-full px-3 py-2 text-sm bg-white border border-[#D9E2EF] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={profileSaving}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md transition-colors"
                >
                  {profileSaving ? 'Saving...' : 'Save Profile Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white rounded-lg border border-[#D9E2EF] p-6">
            <div className="flex items-center gap-2.5 mb-1">
              <KeyRound className="w-4 h-4 text-[#2563EB]" />
              <h2 className="text-base font-bold text-[#17243A]">
                Authenticated Password Change
              </h2>
            </div>
            <p className="text-xs text-[#64748B] mb-5">
              Update your institutional password. Current password verification is mandatory. Passwords and authentication tokens are never exposed in the interface.
            </p>

            {pwdError && (
              <div className="mb-4 p-3 rounded-md bg-[#B42318]/10 border border-[#B42318]/30 text-xs text-[#B42318]">
                {pwdError}
              </div>
            )}
            {pwdSuccess && (
              <div className="mb-4 p-3 rounded-md bg-[#16834A]/10 border border-[#16834A]/30 text-xs text-[#16834A]">
                {pwdSuccess}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
              <div>
                <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                  Current Password <span className="text-[#B42318]">*</span>
                </label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-[#D9E2EF] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                  New Password (minimum 8 characters) <span className="text-[#B42318]">*</span>
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-[#D9E2EF] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                  Confirm New Password <span className="text-[#B42318]">*</span>
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-[#D9E2EF] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>
              <button
                type="submit"
                disabled={pwdSaving}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md transition-colors"
              >
                {pwdSaving ? 'Updating Password...' : 'Update Password'}
              </button>
            </form>
          </div>

          <div className="lg:col-span-5 bg-white rounded-lg border border-[#D9E2EF] p-6 space-y-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#6D5CE8]" />
              <h3 className="text-sm font-bold text-[#17243A]">
                Backend API & Security Posture
              </h3>
            </div>
            <p className="text-xs text-[#64748B] leading-relaxed">
              This portal communicates with the central service layer through typed service contracts. No database credentials, signing keys, or protected answer keys are stored in browser configuration.
            </p>
            <div className="p-3.5 rounded-md bg-[#F5F7FB] border border-[#D9E2EF] text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-[#64748B]">Configured REST Endpoint:</span>
                <span className="font-mono text-[#1F2937]">{API_CONFIG.baseUrl}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B]">Service Adapter Mode:</span>
                <span className="font-mono font-semibold text-[#2563EB]">
                  {API_CONFIG.useMockAdapter ? 'Development Mock Adapter' : 'Live Java REST API'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
