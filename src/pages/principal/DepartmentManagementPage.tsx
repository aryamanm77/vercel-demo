import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Edit3,
  Eye,
  Plus,
  Power,
  Search,
  UserCheck,
  X,
} from 'lucide-react';
import { departmentService, CreateDepartmentPayload } from '../../services/departmentService';
import { userManagementService } from '../../services/userManagementService';
import { subjectService } from '../../services/subjectService';
import { Department, StaffAccount, Subject } from '../../types';
import { StatusBadge } from '../../components/StatusBadge';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useAuth } from '../../hooks/useAuth';

export const DepartmentManagementPage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [departments, setDepartments] = useState<Department[]>([]);
  const [staffAccounts, setStaffAccounts] = useState<StaffAccount[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Active' | 'Inactive'>('ALL');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Create / Edit Modal
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [formState, setFormState] = useState<CreateDepartmentPayload>({
    name: '',
    code: '',
    identificationNumber: '',
    contactEmail: '',
    contactPhone: '',
    buildingBlock: '',
    hodUserId: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Assign HOD Modal
  const [assignModalDept, setAssignModalDept] = useState<Department | null>(null);
  const [selectedHodId, setSelectedHodId] = useState('');

  // Department-Wise Detail Dashboard Drawer/Modal
  const [viewingDept, setViewingDept] = useState<Department | null>(null);

  // Deactivate Confirmation Dialog
  const [statusToggleDept, setStatusToggleDept] = useState<Department | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [dRes, sRes, subRes] = await Promise.all([
        departmentService.getAllDepartments(),
        userManagementService.getStaffAccounts(),
        subjectService.getSubjects(),
      ]);
      setDepartments(dRes.data);
      setStaffAccounts(sRes.data);
      setSubjects(subRes.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (searchParams.get('action') === 'create') {
      openCreateModal();
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const openCreateModal = () => {
    setEditingDept(null);
    setFormError(null);
    setFormState({
      name: '',
      code: '',
      identificationNumber: `MITM-DEPT-0${departments.length + 1}`,
      contactEmail: '',
      contactPhone: '0821-2972200',
      buildingBlock: 'Main Academic Block',
      hodUserId: '',
    });
    setFormModalOpen(true);
  };

  const openEditModal = (dept: Department) => {
    setEditingDept(dept);
    setFormError(null);
    setFormState({
      name: dept.name,
      code: dept.code,
      identificationNumber: dept.identificationNumber,
      contactEmail: dept.contactEmail,
      contactPhone: dept.contactPhone,
      buildingBlock: dept.buildingBlock,
      hodUserId: dept.hodUserId || '',
    });
    setFormModalOpen(true);
  };

  const handleSaveDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setFormError(null);
    setSubmitting(true);
    try {
      if (editingDept) {
        await departmentService.updateDepartment(
          editingDept.id,
          formState,
          user.fullName,
          user.employeeId
        );
        setFeedback({
          type: 'success',
          message: `Department "${formState.name}" (${formState.code.toUpperCase()}) updated.`,
        });
      } else {
        await departmentService.createDepartment(
          formState,
          user.fullName,
          user.employeeId
        );
        setFeedback({
          type: 'success',
          message: `Department "${formState.name}" (${formState.code.toUpperCase()}) created.`,
        });
      }
      setFormModalOpen(false);
      await loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Operation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssignHod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !assignModalDept || !selectedHodId) return;
    setSubmitting(true);
    try {
      await departmentService.assignHodToDepartment(
        assignModalDept.id,
        selectedHodId,
        user.fullName,
        user.employeeId
      );
      setFeedback({
        type: 'success',
        message: `Assigned HOD for ${assignModalDept.name} (${assignModalDept.code}). Historical records preserved.`,
      });
      setAssignModalDept(null);
      await loadData();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to assign HOD.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmToggleStatus = async () => {
    if (!user || !statusToggleDept) return;
    const nextStatus = statusToggleDept.status === 'Active' ? 'Inactive' : 'Active';
    setSubmitting(true);
    try {
      await departmentService.toggleDepartmentStatus(
        statusToggleDept.id,
        nextStatus,
        user.fullName,
        user.employeeId
      );
      setFeedback({
        type: 'success',
        message: `Department ${statusToggleDept.code} status changed to ${nextStatus}.`,
      });
      setStatusToggleDept(null);
      await loadData();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Status update failed.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const filteredDepartments = departments.filter((d) => {
    if (statusFilter !== 'ALL' && d.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      return (
        d.name.toLowerCase().includes(q) ||
        d.code.toLowerCase().includes(q) ||
        d.identificationNumber.toLowerCase().includes(q) ||
        (d.hodName || '').toLowerCase().includes(q)
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
            Department Management
          </h1>
          <p className="text-sm text-[#64748B] mt-0.5">
            Configure academic departments, assign Heads of Department (HODs), and inspect department-level readiness.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md transition-colors self-start cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Department</span>
        </button>
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
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="p-1 hover:opacity-75"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="bg-white rounded-lg border border-[#D9E2EF] p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by department name, code (CSE, ECE...), ID, or HOD..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-[#D9E2EF] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#F5F7FB] border border-[#D9E2EF] rounded-md self-start">
          {(['ALL', 'Active', 'Inactive'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                statusFilter === st
                  ? 'bg-white text-[#17243A] shadow-xs'
                  : 'text-[#64748B] hover:text-[#1F2937]'
              }`}
            >
              {st === 'ALL' ? 'All Departments' : st}
            </button>
          ))}
        </div>
      </div>

      {/* Departments Table */}
      <div className="bg-white rounded-lg border border-[#D9E2EF] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F5F7FB] border-b border-[#D9E2EF] text-[12px] font-semibold text-[#64748B]">
                <th className="py-3 px-5">Dept Code & ID</th>
                <th className="py-3 px-5">Department Name</th>
                <th className="py-3 px-5">Assigned HOD</th>
                <th className="py-3 px-5">Contact & Location</th>
                <th className="py-3 px-4 text-right">Students</th>
                <th className="py-3 px-4">Created</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D9E2EF] text-[13px]">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-xs text-[#64748B]">
                    Loading MIT Mysore departments...
                  </td>
                </tr>
              ) : filteredDepartments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-xs text-[#64748B]">
                    No departments match the current search filter.
                  </td>
                </tr>
              ) : (
                filteredDepartments.map((dept) => (
                  <tr key={dept.id} className="hover:bg-[#F5F7FB]/60 transition-colors">
                    <td className="py-3.5 px-5">
                      <div className="font-mono font-bold text-[#17243A]">{dept.code}</div>
                      <div className="text-[11px] font-mono text-[#64748B]">
                        {dept.identificationNumber}
                      </div>
                    </td>
                    <td className="py-3.5 px-5 font-semibold text-[#1F2937]">
                      {dept.name}
                    </td>
                    <td className="py-3.5 px-5">
                      {dept.hodName ? (
                        <div>
                          <div className="font-medium text-[#1F2937]">{dept.hodName}</div>
                          <div className="text-[11px] text-[#64748B] font-mono">{dept.hodEmail}</div>
                        </div>
                      ) : (
                        <span className="text-xs text-[#B7791F] font-medium">Unassigned</span>
                      )}
                    </td>
                    <td className="py-3.5 px-5 text-xs text-[#64748B]">
                      <div>{dept.contactEmail}</div>
                      <div>{dept.contactPhone} · {dept.buildingBlock}</div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#1F2937]">
                      {dept.totalStudents}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-[#64748B] whitespace-nowrap">
                      {dept.createdAt}
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={dept.status} />
                    </td>
                    <td className="py-3.5 px-5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setViewingDept(dept)}
                          className="p-1.5 rounded border border-[#D9E2EF] bg-white text-[#1F2937] hover:bg-slate-100"
                          title="View Department Dashboard"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(dept)}
                          className="p-1.5 rounded border border-[#D9E2EF] bg-white text-[#1F2937] hover:bg-slate-100"
                          title="Edit Department Details"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAssignModalDept(dept);
                            setSelectedHodId(dept.hodUserId || '');
                          }}
                          className="px-2.5 py-1 rounded border border-[#D9E2EF] bg-white text-xs font-medium text-[#2563EB] hover:bg-blue-50"
                          title="Assign or Replace HOD"
                        >
                          Assign HOD
                        </button>
                        <button
                          type="button"
                          onClick={() => setStatusToggleDept(dept)}
                          className={`p-1.5 rounded border transition-colors ${
                            dept.status === 'Active'
                              ? 'border-[#B7791F]/30 text-[#B7791F] hover:bg-[#B7791F]/10'
                              : 'border-[#16834A]/30 text-[#16834A] hover:bg-[#16834A]/10'
                          }`}
                          title={dept.status === 'Active' ? 'Deactivate Department' : 'Activate Department'}
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
        <div className="px-6 py-3 bg-[#F5F7FB] border-t border-[#D9E2EF] text-xs text-[#64748B]">
          Institutional Safeguard: Departments linked to examination records or academic subjects cannot be permanently deleted; use Deactivate to preserve historical audit integrity.
        </div>
      </div>

      {/* Add / Edit Department Modal */}
      {formModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17243A]/60 p-4">
          <div className="w-full max-w-xl bg-white rounded-lg border border-[#D9E2EF] shadow-lg overflow-hidden">
            <div className="px-6 py-4 bg-[#F5F7FB] border-b border-[#D9E2EF] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-[#2563EB]" />
                <h3 className="text-base font-bold text-[#17243A]">
                  {editingDept ? `Edit Department – ${editingDept.code}` : 'Create New Department'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setFormModalOpen(false)}
                className="p-1 text-[#64748B] hover:text-[#1F2937]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveDepartment} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 rounded-md bg-[#B42318]/10 border border-[#B42318]/30 text-xs text-[#B42318]">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    Department Name <span className="text-[#B42318]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formState.name}
                    onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                    placeholder="e.g., Artificial Intelligence and Machine Learning"
                    className="w-full px-3 py-2 text-sm border border-[#D9E2EF] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    Department Code <span className="text-[#B42318]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formState.code}
                    onChange={(e) => setFormState({ ...formState, code: e.target.value.toUpperCase() })}
                    placeholder="e.g., AIML"
                    className="w-full px-3 py-2 text-sm font-mono uppercase border border-[#D9E2EF] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    Department Identification No. <span className="text-[#B42318]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formState.identificationNumber}
                    onChange={(e) => setFormState({ ...formState, identificationNumber: e.target.value })}
                    placeholder="MITM-DEPT-07"
                    className="w-full px-3 py-2 text-sm font-mono border border-[#D9E2EF] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    Building / Academic Block
                  </label>
                  <input
                    type="text"
                    value={formState.buildingBlock}
                    onChange={(e) => setFormState({ ...formState, buildingBlock: e.target.value })}
                    placeholder="Main Academic Block – Floor 2"
                    className="w-full px-3 py-2 text-sm border border-[#D9E2EF] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    Department Office Email <span className="text-[#B42318]">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={formState.contactEmail}
                    onChange={(e) => setFormState({ ...formState, contactEmail: e.target.value })}
                    placeholder="office.aiml@mitmysore.in"
                    className="w-full px-3 py-2 text-sm border border-[#D9E2EF] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    Contact Telephone
                  </label>
                  <input
                    type="text"
                    value={formState.contactPhone}
                    onChange={(e) => setFormState({ ...formState, contactPhone: e.target.value })}
                    placeholder="0821-2972270"
                    className="w-full px-3 py-2 text-sm border border-[#D9E2EF] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  />
                </div>
              </div>

              {!editingDept && (
                <div>
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    Initial HOD Assignment (Optional)
                  </label>
                  <select
                    value={formState.hodUserId}
                    onChange={(e) => setFormState({ ...formState, hodUserId: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-white border border-[#D9E2EF] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  >
                    <option value="">-- Assign HOD Later --</option>
                    {staffAccounts.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.fullName} ({st.employeeId} · {st.departmentCode})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="pt-3 border-t border-[#D9E2EF] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setFormModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-[#1F2937] bg-white border border-[#D9E2EF] rounded-md hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : editingDept ? 'Update Department' : 'Create Department'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign or Replace HOD Modal */}
      {assignModalDept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17243A]/60 p-4">
          <div className="w-full max-w-md bg-white rounded-lg border border-[#D9E2EF] shadow-lg overflow-hidden">
            <div className="px-6 py-4 bg-[#F5F7FB] border-b border-[#D9E2EF] flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-[#2563EB]" />
              <h3 className="text-base font-bold text-[#17243A]">
                Assign HOD – {assignModalDept.code}
              </h3>
            </div>
            <form onSubmit={handleAssignHod} className="p-6 space-y-4">
              <p className="text-xs text-[#64748B] leading-relaxed">
                Select an authorized faculty account to serve as Head of Department for <strong>{assignModalDept.name}</strong>. Replacing an existing HOD preserves all prior question bank submissions and audit history.
              </p>
              <div>
                <label className="block text-xs font-semibold text-[#1F2937] mb-1.5">
                  Authorized Staff / HOD Account
                </label>
                <select
                  required
                  value={selectedHodId}
                  onChange={(e) => setSelectedHodId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-[#D9E2EF] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                >
                  <option value="">-- Select Faculty Member --</option>
                  {staffAccounts.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.fullName} ({st.employeeId} · Current: {st.departmentCode})
                    </option>
                  ))}
                </select>
              </div>
              <div className="pt-2 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setAssignModalDept(null)}
                  className="px-4 py-2 text-xs font-semibold text-[#1F2937] bg-white border border-[#D9E2EF] rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedHodId || submitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md disabled:opacity-50"
                >
                  Confirm HOD Assignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Department-Wise Dashboard Modal */}
      {viewingDept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17243A]/60 p-4">
          <div className="w-full max-w-2xl bg-white rounded-lg border border-[#D9E2EF] shadow-lg overflow-hidden">
            <div className="px-6 py-4 bg-[#17243A] text-white flex items-center justify-between">
              <div>
                <div className="text-xs text-blue-300 font-mono">
                  {viewingDept.identificationNumber} · Created {viewingDept.createdAt}
                </div>
                <h3 className="text-lg font-bold">
                  {viewingDept.name} ({viewingDept.code})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setViewingDept(null)}
                className="p-1 text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-3 gap-4">
                <div className="p-3.5 rounded-md bg-[#F5F7FB] border border-[#D9E2EF]">
                  <div className="text-xs text-[#64748B]">Enrolled Students</div>
                  <div className="text-xl font-bold font-mono text-[#17243A] mt-1">
                    {viewingDept.totalStudents}
                  </div>
                </div>
                <div className="p-3.5 rounded-md bg-[#F5F7FB] border border-[#D9E2EF]">
                  <div className="text-xs text-[#64748B]">Faculty & Staff</div>
                  <div className="text-xl font-bold font-mono text-[#17243A] mt-1">
                    {viewingDept.totalStaff}
                  </div>
                </div>
                <div className="p-3.5 rounded-md bg-[#F5F7FB] border border-[#D9E2EF]">
                  <div className="text-xs text-[#64748B]">Department Status</div>
                  <div className="mt-1.5">
                    <StatusBadge status={viewingDept.status} />
                  </div>
                </div>
              </div>

              <div className="text-xs space-y-2 border-t border-[#D9E2EF] pt-4">
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Assigned Head of Department:</span>
                  <span className="font-semibold text-[#1F2937]">{viewingDept.hodName || 'Unassigned'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Department Contact:</span>
                  <span className="font-mono text-[#1F2937]">{viewingDept.contactEmail} · {viewingDept.contactPhone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Academic Block Location:</span>
                  <span className="text-[#1F2937]">{viewingDept.buildingBlock}</span>
                </div>
              </div>

              <div className="border-t border-[#D9E2EF] pt-4">
                <h4 className="text-xs font-bold text-[#17243A] mb-2">
                  Mapped Subjects & Question Bank Status ({viewingDept.code})
                </h4>
                <div className="max-h-48 overflow-y-auto border border-[#D9E2EF] rounded-md divide-y divide-[#D9E2EF]">
                  {subjects
                    .filter((s) => s.departmentId === viewingDept.id)
                    .map((sub) => (
                      <div key={sub.id} className="px-4 py-2.5 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-mono font-bold text-[#17243A]">{sub.code}</span>
                          <span className="mx-1.5 text-slate-300">·</span>
                          <span className="text-[#1F2937]">{sub.name}</span>
                          <span className="ml-2 text-[#64748B]">(Sem {sub.semesterNumber})</span>
                        </div>
                        <StatusBadge status={sub.questionBankStatus} />
                      </div>
                    ))}
                  {subjects.filter((s) => s.departmentId === viewingDept.id).length === 0 && (
                    <div className="p-4 text-center text-xs text-[#64748B]">
                      No active subjects mapped in this view.
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="px-6 py-3.5 bg-[#F5F7FB] border-t border-[#D9E2EF] flex justify-end">
              <button
                type="button"
                onClick={() => setViewingDept(null)}
                className="px-4 py-2 text-xs font-semibold text-[#1F2937] bg-white border border-[#D9E2EF] rounded-md"
              >
                Close Department View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Activate / Deactivate Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(statusToggleDept)}
        title={
          statusToggleDept?.status === 'Active'
            ? `Deactivate Department (${statusToggleDept.code})`
            : `Activate Department (${statusToggleDept?.code})`
        }
        description={
          statusToggleDept?.status === 'Active'
            ? `Are you sure you want to deactivate ${statusToggleDept.name} (${statusToggleDept.code})?`
            : `Restore active status for ${statusToggleDept?.name} (${statusToggleDept?.code})?`
        }
        consequenceNote="Departments with historical examination records or mapped subjects are never deleted. Deactivating suspends new submissions while preserving all past question banks, student rosters, and audit logs."
        confirmLabel={statusToggleDept?.status === 'Active' ? 'Deactivate Department' : 'Activate Department'}
        variant={statusToggleDept?.status === 'Active' ? 'destructive' : 'primary'}
        isLoading={submitting}
        onConfirm={handleConfirmToggleStatus}
        onCancel={() => setStatusToggleDept(null)}
      />
    </div>
  );
};
