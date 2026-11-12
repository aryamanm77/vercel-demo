import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  Building2,
  CalendarCheck2,
  ClipboardList,
  FileBarChart2,
  GraduationCap,
  Plus,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { principalService, PrincipalDashboardMetrics } from '../../services/principalService';
import { auditService } from '../../services/auditService';
import { resultsService } from '../../services/resultsService';
import { AuditLogEntry, ExaminationScheduleItem } from '../../types';
import { StatusBadge } from '../../components/StatusBadge';

export const PrincipalDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<PrincipalDashboardMetrics | null>(null);
  const [recentAudits, setRecentAudits] = useState<AuditLogEntry[]>([]);
  const [examSchedules, setExamSchedules] = useState<ExaminationScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const [mRes, aRes, sRes] = await Promise.all([
          principalService.getDashboardOverview(),
          auditService.getAuditLogs(),
          resultsService.getAllInstitutionExamSchedules(),
        ]);
        if (!mounted) return;
        setMetrics(mRes.data);
        setRecentAudits(aRes.data.slice(0, 5));
        setExamSchedules(sRes.data);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading || !metrics) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-72 bg-slate-200 rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <div key={n} className="h-28 bg-white rounded-lg border border-[#D9E2EF] p-5 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      {/* Page Title & Academic Year Context */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="text-xs font-semibold text-[#2563EB] tracking-wide">
            Maharaja Institute of Technology Mysore · Central Administration
          </div>
          <h1 className="text-2xl font-bold text-[#17243A] mt-0.5">
            Principal Institutional Dashboard
          </h1>
          <p className="text-sm text-[#64748B] mt-0.5">
            Active Academic Year: <strong className="text-[#1F2937]">{metrics.currentAcademicYear}</strong> · Odd Semester Assessment Cycle
          </p>
        </div>

        {/* 5 Required Quick Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/admin/principal/departments?action=create')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Department</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/admin/principal/academic-structure')}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#1F2937] bg-white border border-[#D9E2EF] hover:bg-slate-100 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <GraduationCap className="w-3.5 h-3.5 text-[#2563EB]" />
            <span>Manage Academic Structure</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/admin/principal/users?role=HOD&action=create')}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#1F2937] bg-white border border-[#D9E2EF] hover:bg-slate-100 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5 text-[#6D5CE8]" />
            <span>Create HOD Account</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/admin/principal/users?role=ACADEMIC_STAFF')}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#1F2937] bg-white border border-[#D9E2EF] hover:bg-slate-100 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Users className="w-3.5 h-3.5 text-[#64748B]" />
            <span>Manage Staff</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/admin/principal/reports')}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#1F2937] bg-white border border-[#D9E2EF] hover:bg-slate-100 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileBarChart2 className="w-3.5 h-3.5 text-[#16834A]" />
            <span>View Institution Reports</span>
          </button>
        </div>
      </div>

      {/* Key Institutional Metrics Grid (9 core metrics across 2 rows) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg border border-[#D9E2EF] p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-[#64748B]">
            <span className="font-medium">Total Departments</span>
            <Building2 className="w-4 h-4 text-[#2563EB]" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono tabular-nums text-[#17243A]">
              {metrics.totalDepartments}
            </span>
            <span className="text-xs text-[#16834A] font-medium">
              {metrics.activeDepartments} Active
            </span>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-[#D9E2EF] p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-[#64748B]">
            <span className="font-medium">Assigned HODs & Staff</span>
            <UserCheck className="w-4 h-4 text-[#6D5CE8]" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono tabular-nums text-[#17243A]">
              {metrics.totalHods} <span className="text-xs font-sans font-normal text-[#64748B]">HODs</span>
            </span>
            <span className="text-xs text-[#64748B] font-mono tabular-nums">
              {metrics.totalStaffAccounts} Total Staff
            </span>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-[#D9E2EF] p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-[#64748B]">
            <span className="font-medium">Semesters & Subjects</span>
            <BookOpen className="w-4 h-4 text-[#2563EB]" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono tabular-nums text-[#17243A]">
              {metrics.totalAcademicSemesters} <span className="text-xs font-sans font-normal text-[#64748B]">Sems</span>
            </span>
            <span className="text-xs text-[#1F2937] font-semibold font-mono tabular-nums">
              {metrics.totalSubjects} Mapped Subjects
            </span>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-[#D9E2EF] p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-[#64748B]">
            <span className="font-medium">Registered Students</span>
            <Users className="w-4 h-4 text-[#16834A]" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono tabular-nums text-[#17243A]">
              {metrics.totalRegisteredStudents.toLocaleString()}
            </span>
            <span className="text-xs text-[#64748B]">
              AY {metrics.currentAcademicYear}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-[#D9E2EF] p-4 flex flex-col justify-between sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between text-xs text-[#64748B]">
            <span className="font-medium">Examination Cycles</span>
            <CalendarCheck2 className="w-4 h-4 text-[#6D5CE8]" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono tabular-nums text-[#17243A]">
              {metrics.activeExamCycles} <span className="text-xs font-sans font-normal text-[#64748B]">Active</span>
            </span>
            <span className="text-xs text-[#64748B] font-mono tabular-nums">
              {metrics.upcomingExams} Upcoming · {metrics.completedExams} Done
            </span>
          </div>
        </div>
      </div>

      {/* Department-Wise Overview Table */}
      <section className="bg-white rounded-lg border border-[#D9E2EF] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#D9E2EF] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-[#17243A]">
              Department-Wise Institutional Overview
            </h2>
            <p className="text-xs text-[#64748B]">
              Assigned Heads of Department, student strength, and 5-module question bank readiness across MIT Mysore.
            </p>
          </div>
          <Link
            to="/admin/principal/departments"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#2563EB] hover:underline whitespace-nowrap"
          >
            <span>Manage All Departments</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F5F7FB] border-b border-[#D9E2EF] text-[12px] font-semibold text-[#64748B]">
                <th className="py-3 px-5">Code</th>
                <th className="py-3 px-5">Department Name</th>
                <th className="py-3 px-5">Assigned HOD</th>
                <th className="py-3 px-5 text-right">Students</th>
                <th className="py-3 px-5 text-right">Configured Subjects</th>
                <th className="py-3 px-5">Question Bank Readiness</th>
                <th className="py-3 px-5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D9E2EF] text-[13px]">
              {metrics.departmentSummary.map((dept) => {
                const pct = Math.round(
                  (dept.finalizedQuestionBanks / Math.max(1, dept.totalQuestionBanks)) * 100
                );
                return (
                  <tr key={dept.id} className="hover:bg-[#F5F7FB]/60 transition-colors">
                    <td className="py-3 px-5 font-mono font-bold text-[#17243A]">
                      {dept.code}
                    </td>
                    <td className="py-3 px-5 font-medium text-[#1F2937]">
                      {dept.name}
                    </td>
                    <td className="py-3 px-5 text-[#1F2937]">
                      {dept.hodName}
                    </td>
                    <td className="py-3 px-5 text-right font-mono tabular-nums text-[#1F2937]">
                      {dept.students.toLocaleString()}
                    </td>
                    <td className="py-3 px-5 text-right font-mono tabular-nums text-[#1F2937]">
                      {dept.subjects}
                    </td>
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                          <div
                            className="h-full bg-[#2563EB]"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono tabular-nums text-[#64748B]">
                          {dept.finalizedQuestionBanks}/{dept.totalQuestionBanks} Finalized
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-5">
                      <StatusBadge status={dept.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Two-Column Split: Semester-Wise Overview + Examination Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Semester-Wise Overview */}
        <section className="lg:col-span-6 bg-white rounded-lg border border-[#D9E2EF] flex flex-col justify-between overflow-hidden">
          <div>
            <div className="px-6 py-4 border-b border-[#D9E2EF] flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-[#17243A]">
                  Semester-Wise Academic Overview
                </h2>
                <p className="text-xs text-[#64748B]">
                  1st to 8th Semester configuration for Academic Year {metrics.currentAcademicYear}
                </p>
              </div>
              <Link
                to="/admin/principal/academic-structure"
                className="text-xs font-semibold text-[#2563EB] hover:underline"
              >
                Configure
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F5F7FB] border-b border-[#D9E2EF] text-[12px] font-semibold text-[#64748B]">
                    <th className="py-2.5 px-5">Semester</th>
                    <th className="py-2.5 px-4">Cycle</th>
                    <th className="py-2.5 px-4 text-right">Sections</th>
                    <th className="py-2.5 px-4 text-right">Subjects</th>
                    <th className="py-2.5 px-5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D9E2EF] text-[13px]">
                  {metrics.semesterSummary.map((sem) => (
                    <tr key={sem.semesterNumber} className="hover:bg-[#F5F7FB]/60">
                      <td className="py-2.5 px-5 font-medium text-[#1F2937]">
                        {sem.semesterName}
                      </td>
                      <td className="py-2.5 px-4 text-xs text-[#64748B]">
                        {sem.cycle} Semester
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                        {sem.totalSections}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                        {sem.totalSubjects}
                      </td>
                      <td className="py-2.5 px-5">
                        <StatusBadge status={sem.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Examination Activity & Recent Audit Events */}
        <div className="lg:col-span-6 space-y-6 flex flex-col justify-between">
          {/* Active Examination Sessions Summary */}
          <section className="bg-white rounded-lg border border-[#D9E2EF] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#D9E2EF] flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-[#17243A]">
                  Active Examination Cycle Activity
                </h2>
                <p className="text-xs text-[#64748B]">
                  Odd Semester Internal Assessment – I (COE Scheduled Sessions)
                </p>
              </div>
              <Link
                to="/admin/principal/reports"
                className="text-xs font-semibold text-[#2563EB] hover:underline"
              >
                View Reports
              </Link>
            </div>
            <div className="divide-y divide-[#D9E2EF]">
              {examSchedules.slice(0, 4).map((item) => (
                <div key={item.id} className="px-6 py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#17243A] truncate">
                      {item.subjectCode} – {item.subjectName}
                    </div>
                    <div className="text-[11px] text-[#64748B] mt-0.5">
                      {item.departmentCode} · Sem {item.semesterNumber} ({item.section}) · {item.examDate}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={item.examCompletionStatus} />
                    <StatusBadge status={item.resultPublicationStatus} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Recent Administrative Audit Activity */}
          <section className="bg-white rounded-lg border border-[#D9E2EF] overflow-hidden">
            <div className="px-6 py-3.5 border-b border-[#D9E2EF] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-[#6D5CE8]" />
                <h2 className="text-sm font-bold text-[#17243A]">
                  Recent Administrative Activities
                </h2>
              </div>
              <Link
                to="/admin/principal/audit-logs"
                className="text-xs font-semibold text-[#2563EB] hover:underline"
              >
                Full Audit Log
              </Link>
            </div>
            <div className="divide-y divide-[#D9E2EF]">
              {recentAudits.map((log) => (
                <div key={log.id} className="px-6 py-2.5 flex items-start justify-between gap-4 text-xs">
                  <div className="min-w-0">
                    <div className="text-[#1F2937] font-medium truncate">
                      {log.activityDescription}
                    </div>
                    <div className="text-[11px] text-[#64748B] mt-0.5">
                      {log.actorName} ({log.actorRole}) · Dept: {log.departmentCode}
                    </div>
                  </div>
                  <span className="font-mono text-[11px] text-[#64748B] whitespace-nowrap shrink-0">
                    {log.timestamp.split(' ')[0]}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
