import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  Edit3,
  KeyRound,
  Power,
  Search,
  ShieldCheck,
  UserPlus,
  X,
} from 'lucide-react';
import {
  CreateStaffAccountPayload,
  userManagementService,
} from '../../services/userManagementService';
import { departmentService } from '../../services/departmentService';
import { Department, StaffAccount, StaffRole } from '../../types';
import { StatusBadge } from '../../components/StatusBadge';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useAuth } from '../../hooks/useAuth';

export const UserManagementPage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const roleParam = searchParams.get('role');
  const [roleFilter, setRoleFilter] = useState<'ALL' | StaffRole>(
    roleParam === 'HOD' || roleParam === 'ACADEMIC_STAFF' ? roleParam : 'ALL'
  );
  const [deptFilter, setDeptFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [accounts, setAccounts] = useState<StaffAccount[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Create / Edit Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<StaffAccount | null>(null);
  const [formState, setFormState] = useState<CreateStaffAccountPayload>({
    fullName: '',
    employeeId: '',
    email: '',
    designation: 'Professor & Head of Department',
    departmentId: '',
    assignedRole: 'HOD',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Access Reset Dialog
  const [resetTarget, setResetTarget] = useState<StaffAccount | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [accRes, deptRes] = await Promise.all([
        userManagementService.getStaffAccounts(),
        departmentService.getAllDepartments(),
      ]);
      setAccounts(accRes.data);
      setDepartments(deptRes.data);
      if (deptRes.data.length > 0 && !formState.departmentId) {
        setFormState((prev) => ({ ...prev, departmentId: deptRes.data[0].id }));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const rp = searchParams.get('role');
    if (rp === 'HOD' || rp === 'ACADEMIC_STAFF') {
      setRoleFilter(rp);
    }
    if (searchParams.get('action') === 'create') {
      openCreateModal(rp === 'ACADEMIC_STAFF' ? 'ACADEMIC_STAFF' : 'HOD');
    }
  }, [searchParams]);

  const openCreateModal = (defaultRole: StaffRole = 'HOD') => {
    setEditingAccount(null);
    setFormError(null);
    setFormState({
      fullName: '',
      employeeId: `MITM-${Math.floor(100 + Math.random() * 899)}`,
      email: '',
      designation:
        defaultRole === 'HOD'
          ? 'Professor & Head of Department'
          : 'Associate Professor & Exam Coordinator',
      departmentId: departments[0]?.id || 'dept-cse',
      assignedRole: defaultRole,
    });
    setModalOpen(true);
  };

  const openEditModal = (acc: StaffAccount) => {
    setEditingAccount(acc);
    setFormError(null);
    setFormState({
      fullName: acc.fullName,
      employeeId: acc.employeeId,
      email: acc.email,
      designation: acc.designation,
      departmentId: acc.departmentId,
      assignedRole: acc.assignedRole,
    });
    setModalOpen(true);
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setFormError(null);
    setSubmitting(true);
    try {
      if (editingAccount) {
        await userManagementService.updateStaffAccount(
          editingAccount.id,
          {
            fullName: formState.fullName,
            designation: formState.designation,
            departmentId: formState.departmentId,
            assignedRole: formState.assignedRole,
          },
          user.fullName,
          user.employeeId
        );
        setFeedback({
          type: 'success',
          message: `Updated account details for ${formState.fullName} (${formState.employeeId}).`,
        });
      } else {
        await userManagementService.createStaffAccount(
          formState,
          user.fullName,
          user.employeeId
        );
        setFeedback({
          type: 'success',
          message: `Provisioned ${formState.assignedRole} account for ${formState.fullName}. Any replaced HOD history has been preserved.`,
        });
      }
      setModalOpen(false);
      await loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save account.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleAccountStatus = async (acc: StaffAccount) => {
    if (!user) return;
    const nextStatus = acc.status === 'Active' ? 'Inactive' : 'Active';
    try {
      await userManagementService.updateStaffAccount(
        acc.id,
        { status: nextStatus },
        user.fullName,
        user.employeeId
      );
      setFeedback({
        type: 'success',
        message: `Account ${acc.employeeId} (${acc.fullName}) status changed to ${nextStatus}.`,
      });
      await loadData();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to update status.',
      });
    }
  };

  const handleConfirmReset = async () => {
    if (!user || !resetTarget) return;
    setSubmitting(true);
    try {
      const res = await userManagementService.triggerAuthorizedAccessReset(
        resetTarget.id,
        user.fullName,
        user.employeeId
      );
      setFeedback({
        type: 'success',
        message: res.data.message,
      });
      setResetTarget(null);
      await loadData();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Access reset failed.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const filteredAccounts = accounts.filter((acc) => {
    if (roleFilter !== 'ALL' && acc.assignedRole !== roleFilter) return false;
    if (deptFilter !== 'ALL' && acc.departmentId !== deptFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      return (
        acc.fullName.toLowerCase().includes(q) ||
        acc.employeeId.toLowerCase().includes(q) ||
        acc.email.toLowerCase().includes(q) ||
        acc.departmentCode.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#17243A]">
            HOD & Authorized Staff Account Management
          </h1>
          <p className="text-sm text-[#64748B] mt-0.5">
            Provision HOD and academic staff accounts, manage department assignments, and initiate audited access resets.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openCreateModal('HOD')}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Create HOD / Staff Account</span>
          </button>
        </div>
      </div>

      {/* Security Boundary Note */}
      <div className="bg-white rounded-lg border border-[#D9E2EF] p-4 flex items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-2.5 text-[#1F2937]">
          <ShieldCheck className="w-4 h-4 text-[#2563EB] shrink-0" />
          <span>
            <strong>Authentication Security Policy:</strong> Passwords and cryptographic secrets are never displayed to the Principal. Access recovery uses audited institutional reset dispatches.
          </span>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-3.5 rounded-md border flex items-center justify-between text-xs ${
            feedback.type === 'success'
              ? 'bg-[#16834A]/10 border-[#16834A]/30 text-[#16834A]'
              : 'bg-[#B42318]/10 border-[#B42318]/30 text-[#B42318]'
          }`}
        >
          <div className="flex items-center gap-2 font-medium">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button type="button" onClick={() => setFeedback(null)}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white rounded-lg border border-[#D9E2EF] p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-[#F5F7FB] border border-[#D9E2EF] rounded-md">
            {(
              [
                { key: 'ALL', label: 'All Accounts' },
                { key: 'HOD', label: 'HOD Accounts' },
                { key: 'ACADEMIC_STAFF', label: 'Authorized Staff' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setRoleFilter(tab.key);
                  if (tab.key === 'ALL') setSearchParams({});
                  else setSearchParams({ role: tab.key });
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                  roleFilter === tab.key
                    ? 'bg-white text-[#17243A] shadow-xs'
                    : 'text-[#64748B] hover:text-[#1F2937]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-white border border-[#D9E2EF] rounded-md"
          >
            <option value="ALL">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} – {d.name}
              </option>
            ))}
          </select>
        </div>

        <div className="relative w-full lg:w-80">
          <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name, Employee ID, email..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-[#D9E2EF] rounded-md"
          />
        </div>
      </div>

      {/* Staff Accounts Table */}
      <div className="bg-white rounded-lg border border-[#D9E2EF] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F5F7FB] border-b border-[#D9E2EF] text-xs font-semibold text-[#64748B]">
                <th className="py-3 px-5">Employee ID</th>
                <th className="py-3 px-5">Full Name & Email</th>
                <th className="py-3 px-5">Designation</th>
                <th className="py-3 px-4">Assigned Department</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Account Status</th>
                <th className="py-3 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D9E2EF] text-[13px]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs text-[#64748B]">
                    Loading institutional accounts...
                  </td>
                </tr>
              ) : filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs text-[#64748B]">
                    No accounts match the selected filter criteria.
                  </td>
                </tr>
              ) : (
                filteredAccounts.map((acc) => (
                  <tr key={acc.id} className="hover:bg-[#F5F7FB]/60">
                    <td className="py-3.5 px-5 font-mono font-bold text-[#17243A]">
                      {acc.employeeId}
                    </td>
                    <td className="py-3.5 px-5">
                      <div className="font-semibold text-[#1F2937]">{acc.fullName}</div>
                      <div className="text-xs font-mono text-[#64748B]">{acc.email}</div>
                      {acc.previousHodHistory && acc.previousHodHistory.length > 0 && (
                        <div className="text-[11px] text-[#6D5CE8] mt-0.5">
                          Former HOD ({acc.previousHodHistory[0].departmentCode}: {acc.previousHodHistory[0].fromDate} – {acc.previousHodHistory[0].toDate})
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-5 text-xs text-[#1F2937]">
                      {acc.designation}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-mono font-bold text-[#2563EB]">{acc.departmentCode}</div>
                      <div className="text-[11px] text-[#64748B] truncate max-w-[180px]">
                        {acc.departmentName}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`text-xs font-semibold ${
                          acc.assignedRole === 'HOD' ? 'text-[#6D5CE8]' : 'text-[#64748B]'
                        }`}
                      >
                        {acc.assignedRole === 'HOD' ? 'Head of Department (HOD)' : 'Authorized Staff'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={acc.status} />
                    </td>
                    <td className="py-3.5 px-5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditModal(acc)}
                          className="p-1.5 rounded border border-[#D9E2EF] bg-white text-[#1F2937] hover:bg-slate-100"
                          title="Edit Account Details"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setResetTarget(acc)}
                          className="px-2.5 py-1 rounded border border-[#D9E2EF] bg-white text-xs font-medium text-[#2563EB] hover:bg-blue-50 inline-flex items-center gap-1"
                          title="Trigger Authorized Access Reset"
                        >
                          <KeyRound className="w-3 h-3" />
                          <span>Reset Access</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleAccountStatus(acc)}
                          className={`p-1.5 rounded border transition-colors ${
                            acc.status === 'Active'
                              ? 'border-[#B7791F]/30 text-[#B7791F] hover:bg-[#B7791F]/10'
                              : 'border-[#16834A]/30 text-[#16834A] hover:bg-[#16834A]/10'
                          }`}
                          title={acc.status === 'Active' ? 'Deactivate Account' : 'Activate Account'}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Account Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17243A]/60 p-4">
          <div className="w-full max-w-lg bg-white rounded-lg border border-[#D9E2EF] shadow-lg overflow-hidden">
            <div className="px-6 py-4 bg-[#F5F7FB] border-b border-[#D9E2EF] flex items-center justify-between">
              <h3 className="text-base font-bold text-[#17243A]">
                {editingAccount
                  ? `Update Account – ${editingAccount.employeeId}`
                  : 'Create HOD / Authorized Staff Account'}
              </h3>
              <button type="button" onClick={() => setModalOpen(false)}>
                <X className="w-4 h-4 text-[#64748B]" />
              </button>
            </div>
            <form onSubmit={handleSaveAccount} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 rounded-md bg-[#B42318]/10 border border-[#B42318]/30 text-xs text-[#B42318]">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    Full Name <span className="text-[#B42318]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formState.fullName}
                    onChange={(e) => setFormState({ ...formState, fullName: e.target.value })}
                    placeholder="Dr. Ramesh Babu K"
                    className="w-full px-3 py-2 text-sm border border-[#D9E2EF] rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    Employee ID <span className="text-[#B42318]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(editingAccount)}
                    value={formState.employeeId}
                    onChange={(e) =>
                      setFormState({ ...formState, employeeId: e.target.value.toUpperCase() })
                    }
                    className="w-full px-3 py-2 text-sm font-mono uppercase border border-[#D9E2EF] rounded-md disabled:bg-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    Institutional Email <span className="text-[#B42318]">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    disabled={Boolean(editingAccount)}
                    value={formState.email}
                    onChange={(e) => setFormState({ ...formState, email: e.target.value })}
                    placeholder="hod.aiml@mitmysore.in"
                    className="w-full px-3 py-2 text-sm border border-[#D9E2EF] rounded-md disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    Designation <span className="text-[#B42318]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formState.designation}
                    onChange={(e) => setFormState({ ...formState, designation: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-[#D9E2EF] rounded-md"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    Assigned Department <span className="text-[#B42318]">*</span>
                  </label>
                  <select
                    required
                    value={formState.departmentId}
                    onChange={(e) => setFormState({ ...formState, departmentId: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-white border border-[#D9E2EF] rounded-md"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.code} – {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    Assigned Role <span className="text-[#B42318]">*</span>
                  </label>
                  <select
                    value={formState.assignedRole}
                    onChange={(e) =>
                      setFormState({ ...formState, assignedRole: e.target.value as StaffRole })
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-[#D9E2EF] rounded-md"
                  >
                    <option value="HOD">Head of Department (HOD)</option>
                    <option value="ACADEMIC_STAFF">Authorized Academic Staff</option>
                  </select>
                </div>
              </div>

              <div className="p-3 rounded bg-[#F5F7FB] border border-[#D9E2EF] text-xs text-[#64748B]">
                Note: Assigning a new HOD to a department with an existing HOD automatically transitions the outgoing HOD while preserving all historical examination submissions and audit records.
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold border border-[#D9E2EF] rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md"
                >
                  {submitting ? 'Saving...' : editingAccount ? 'Save Changes' : 'Provision Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Authorized Access Reset */}
      <ConfirmDialog
        isOpen={Boolean(resetTarget)}
        title="Initiate Authorized Access Reset"
        description={`Send an audited credential recovery dispatch to ${resetTarget?.fullName} (${resetTarget?.email})?`}
        consequenceNote="The Principal Portal never views or sets plaintext passwords. Confirming dispatches a one-time reset token via the central Java authentication service and logs the event in the institutional audit trail."
        confirmLabel="Dispatch Authorized Reset"
        isLoading={submitting}
        onConfirm={handleConfirmReset}
        onCancel={() => setResetTarget(null)}
      />
    </div>
  );
};
