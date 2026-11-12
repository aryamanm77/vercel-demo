import React, { useEffect, useState } from 'react';
import { ClipboardList, Lock, Search } from 'lucide-react';
import { auditService } from '../../services/auditService';
import { AuditLogEntry } from '../../types';
import { StatusBadge } from '../../components/StatusBadge';

export const AuditLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [deptFilter, setDeptFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const res = await auditService.getAuditLogs({
          departmentCode: deptFilter,
          role: roleFilter,
          actionCategory: categoryFilter,
          searchQuery,
        });
        if (mounted) setLogs(res.data);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [deptFilter, roleFilter, categoryFilter, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#17243A]">
            Institutional Audit Logs
          </h1>
          <p className="text-sm text-[#64748B] mt-0.5">
            Append-only cryptographic and administrative activity ledger across Principal and HOD portals.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md bg-white border border-[#D9E2EF] text-xs font-semibold text-[#17243A] self-start">
          <Lock className="w-3.5 h-3.5 text-[#6D5CE8]" />
          <span>Immutable Ledger · Read-Only</span>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-[#D9E2EF] p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search user, activity, or Employee ID..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-[#D9E2EF] rounded-md"
          />
        </div>

        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="px-3 py-2 text-xs bg-white border border-[#D9E2EF] rounded-md"
        >
          <option value="ALL">All Related Departments</option>
          <option value="CSE">CSE</option>
          <option value="ECE">ECE</option>
          <option value="EEE">EEE</option>
          <option value="ME">ME</option>
          <option value="CV">CV</option>
          <option value="ISE">ISE</option>
        </select>

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-3 py-2 text-xs bg-white border border-[#D9E2EF] rounded-md"
        >
          <option value="ALL">All Roles (Principal & HOD)</option>
          <option value="PRINCIPAL">PRINCIPAL</option>
          <option value="HOD">HOD</option>
        </select>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 text-xs bg-white border border-[#D9E2EF] rounded-md"
        >
          <option value="ALL">All Activity Types</option>
          <option value="DEPARTMENT_CREATED">Department Created</option>
          <option value="HOD_ASSIGNED">HOD Assigned</option>
          <option value="STAFF_ACCOUNT_CREATED">Staff Account Created</option>
          <option value="ACADEMIC_SEMESTER_CONFIGURED">Academic Semester Configured</option>
          <option value="SUBJECT_MAPPED">Subject Mapped</option>
          <option value="DEPARTMENT_STATUS_CHANGED">Department Status Changed</option>
          <option value="QUESTION_BANK_FINALIZED">Question Bank Finalized</option>
          <option value="ROSTER_SUBMITTED">Student Roster Submitted</option>
          <option value="REPORT_ACCESSED">Institution Report Accessed</option>
        </select>
      </div>

      {/* Audit Log Table (Strictly Read-Only: No Edit or Delete buttons) */}
      <div className="bg-white rounded-lg border border-[#D9E2EF] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F5F7FB] border-b border-[#D9E2EF] text-xs font-semibold text-[#64748B]">
                <th className="py-3 px-5">Date & Time</th>
                <th className="py-3 px-5">User</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-5">Activity</th>
                <th className="py-3 px-4">Related Department</th>
                <th className="py-3 px-5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D9E2EF] text-[13px]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-[#64748B]">
                    Loading immutable audit records...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-[#64748B]">
                    No audit records match the current filter.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-[#F5F7FB]/60">
                    <td className="py-3.5 px-5 font-mono text-xs text-[#1F2937] whitespace-nowrap">
                      {log.timestamp}
                    </td>
                    <td className="py-3.5 px-5">
                      <div className="font-semibold text-[#17243A]">{log.actorName}</div>
                      <div className="text-[11px] font-mono text-[#64748B]">
                        {log.actorEmployeeId}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`text-xs font-semibold ${
                          log.actorRole === 'PRINCIPAL' ? 'text-[#2563EB]' : 'text-[#6D5CE8]'
                        }`}
                      >
                        {log.actorRole}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-xs text-[#1F2937] leading-relaxed max-w-xl">
                      <div className="font-mono text-[11px] text-[#64748B] mb-0.5">
                        {log.actionCategory}
                      </div>
                      {log.activityDescription}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-[#17243A]">
                      {log.departmentCode}
                    </td>
                    <td className="py-3.5 px-5">
                      <StatusBadge status={log.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-3 bg-[#F5F7FB] border-t border-[#D9E2EF] flex items-center gap-2 text-xs text-[#64748B]">
          <ClipboardList className="w-4 h-4 text-[#6D5CE8] shrink-0" />
          <span>
            Security Compliance: Audit records are append-only in PostgreSQL and cannot be edited or deleted by any user role.
          </span>
        </div>
      </div>
    </div>
  );
};
