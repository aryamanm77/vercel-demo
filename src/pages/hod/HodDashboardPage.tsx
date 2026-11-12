import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Award,
  BookOpen,
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileUp,
  History,
  Lock,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { departmentService } from '../../services/departmentService';
import { subjectService } from '../../services/subjectService';
import { questionBankService } from '../../services/questionBankService';
import { resultsService } from '../../services/resultsService';
import { academicService } from '../../services/academicService';
import {
  Department,
  ExaminationScheduleItem,
  QuestionBankRecord,
  SectionRecord,
  StudentExamResult,
  Subject,
} from '../../types';
import { StatusBadge } from '../../components/StatusBadge';

interface HodDashboardPageProps {
  subView?: 'dashboard' | 'department' | 'subjects';
}

export const HodDashboardPage: React.FC<HodDashboardPageProps> = ({
  subView = 'dashboard',
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [department, setDepartment] = useState<Department | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [sections, setSections] = useState<SectionRecord[]>([]);
  const [questionBanks, setQuestionBanks] = useState<QuestionBankRecord[]>([]);
  const [examSchedules, setExamSchedules] = useState<ExaminationScheduleItem[]>([]);
  const [releasedResults, setReleasedResults] = useState<StudentExamResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!user?.departmentId) return;
      setLoading(true);
      try {
        const [deptRes, subRes, secRes, qbRes, schedRes, resRes] = await Promise.all([
          departmentService.getDepartmentById(user.departmentId),
          subjectService.getSubjects({ departmentId: user.departmentId }),
          academicService.getSections(user.departmentId),
          questionBankService.getDepartmentQuestionBanks(user.departmentId),
          resultsService.getDepartmentExamSchedules(user.departmentId),
          resultsService.getReleasedResults({
            requesterRole: 'HOD',
            requesterDepartmentId: user.departmentId,
          }),
        ]);
        if (!mounted) return;
        setDepartment(deptRes.data);
        setSubjects(subRes.data);
        setSections(secRes.data);
        setQuestionBanks(qbRes.data);
        setExamSchedules(schedRes.data);
        setReleasedResults(resRes.data.releasedResults);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [user?.departmentId]);

  if (!user?.departmentId) {
    return (
      <div className="p-6 bg-white rounded-lg border border-[#D9E2EF] text-sm text-[#B42318]">
        Unauthorized: No department is bound to this HOD session.
      </div>
    );
  }

  if (loading || !department) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-80 bg-slate-200 rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-28 bg-white rounded-lg border border-[#D9E2EF] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const submittedOrFinalizedCount = subjects.filter(
    (s) => s.questionBankStatus === 'Finalized' || s.questionBankStatus === 'Submitted'
  ).length;
  const pendingQbCount = subjects.length - submittedOrFinalizedCount;
  const upcomingExamsCount = examSchedules.filter(
    (e) => e.examCompletionStatus === 'Upcoming'
  ).length;
  const activeSemesters = Array.from(new Set(subjects.map((s) => s.semesterNumber))).sort();

  if (subView === 'department') {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-[#6D5CE8]">
              Department Profile & Academic Scope
            </div>
            <h1 className="text-2xl font-bold text-[#17243A] mt-0.5">
              {department.name} ({department.code})
            </h1>
            <p className="text-sm text-[#64748B]">
              Department ID: <span className="font-mono">{department.identificationNumber}</span> · Bound HOD: <strong>{user.fullName}</strong>
            </p>
          </div>
          <Link
            to="/admin/hod/question-bank"
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md self-start"
          >
            <FileUp className="w-4 h-4" />
            <span>Manage Question Banks</span>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg border border-[#D9E2EF] p-5">
            <div className="text-xs text-[#64748B]">Department Strength</div>
            <div className="text-2xl font-bold font-mono text-[#17243A] mt-1">
              {department.totalStudents} Students
            </div>
            <div className="text-xs text-[#64748B] mt-1">
              Across {sections.length} configured sections
            </div>
          </div>
          <div className="bg-white rounded-lg border border-[#D9E2EF] p-5">
            <div className="text-xs text-[#64748B]">Department Faculty & Staff</div>
            <div className="text-2xl font-bold font-mono text-[#17243A] mt-1">
              {department.totalStaff} Members
            </div>
            <div className="text-xs text-[#64748B] mt-1">
              Location: {department.buildingBlock}
            </div>
          </div>
          <div className="bg-white rounded-lg border border-[#D9E2EF] p-5">
            <div className="text-xs text-[#64748B]">Department Office Contact</div>
            <div className="text-sm font-mono font-bold text-[#17243A] mt-1.5">
              {department.contactEmail}
            </div>
            <div className="text-xs font-mono text-[#64748B] mt-1">
              Tel: {department.contactPhone}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-[#D9E2EF] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#D9E2EF]">
            <h2 className="text-base font-bold text-[#17243A]">
              Active Student Sections ({department.code})
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F5F7FB] border-b border-[#D9E2EF] text-xs font-semibold text-[#64748B]">
                  <th className="py-3 px-5">Semester</th>
                  <th className="py-3 px-5">Section Name</th>
                  <th className="py-3 px-5 text-right">Enrolled Students</th>
                  <th className="py-3 px-5 text-right">Section Capacity</th>
                  <th className="py-3 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D9E2EF] text-[13px]">
                {sections.map((sec) => (
                  <tr key={sec.id} className="hover:bg-[#F5F7FB]/60">
                    <td className="py-3 px-5 font-semibold text-[#17243A]">
                      Semester {sec.semesterNumber}
                    </td>
                    <td className="py-3 px-5 font-semibold text-[#2563EB]">
                      {sec.name}
                    </td>
                    <td className="py-3 px-5 text-right font-mono tabular-nums">
                      {sec.enrolledCount}
                    </td>
                    <td className="py-3 px-5 text-right font-mono tabular-nums text-[#64748B]">
                      {sec.maxCapacity}
                    </td>
                    <td className="py-3 px-5 text-right">
                      <Link
                        to={`/admin/hod/student-management?sem=${sec.semesterNumber}&sec=${encodeURIComponent(sec.name)}`}
                        className="text-xs font-semibold text-[#2563EB] hover:underline"
                      >
                        Manage Roster
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  if (subView === 'subjects') {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-[#2563EB]">
              Assigned Curriculum · {department.code}
            </div>
            <h1 className="text-2xl font-bold text-[#17243A] mt-0.5">
              My Department Subjects (5-Module Structure)
            </h1>
            <p className="text-sm text-[#64748B]">
              Subjects mapped to {department.name} by the Principal Office for Academic Year 2026–2027.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-[#D9E2EF] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F5F7FB] border-b border-[#D9E2EF] text-xs font-semibold text-[#64748B]">
                  <th className="py-3 px-5">Subject Code</th>
                  <th className="py-3 px-5">Subject Name</th>
                  <th className="py-3 px-4">Semester</th>
                  <th className="py-3 px-4">Assigned Sections</th>
                  <th className="py-3 px-4">Required Question Bank</th>
                  <th className="py-3 px-4">Current Status</th>
                  <th className="py-3 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D9E2EF] text-[13px]">
                {subjects.map((sub) => {
                  const qb = questionBanks.find((q) => q.subjectId === sub.id);
                  const count = qb ? qb.questions.length : 0;
                  return (
                    <tr key={sub.id} className="hover:bg-[#F5F7FB]/60">
                      <td className="py-3.5 px-5 font-mono font-bold text-[#17243A]">
                        {sub.code}
                      </td>
                      <td className="py-3.5 px-5 font-semibold text-[#1F2937]">
                        {sub.name}
                      </td>
                      <td className="py-3.5 px-4">Semester {sub.semesterNumber}</td>
                      <td className="py-3.5 px-4 text-xs text-[#64748B]">
                        {sub.sections.join(' · ')}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs">
                        {count} / 300 MCQs (5 Modules × 60)
                      </td>
                      <td className="py-3.5 px-4">
                        <StatusBadge status={sub.questionBankStatus} />
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <Link
                          to={`/admin/hod/question-bank?subjectId=${sub.id}&sem=${sub.semesterNumber}`}
                          className="px-3 py-1.5 rounded bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold transition-colors inline-block"
                        >
                          {sub.questionBankStatus === 'Finalized' ? 'Inspect Bank' : 'Prepare Bank'}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      {/* Top Department-Scoped Header & 4 Quick Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#6D5CE8]">
            <Lock className="w-3.5 h-3.5" />
            <span>Assigned Department Scope: {department.code} ({department.identificationNumber})</span>
          </div>
          <h1 className="text-2xl font-bold text-[#17243A] mt-0.5">
            {department.name} – HOD Dashboard
          </h1>
          <p className="text-sm text-[#64748B] mt-0.5">
            Head of Department: <strong className="text-[#1F2937]">{user.fullName}</strong> · Academic Year 2026–2027
          </p>
        </div>

        {/* 4 Required Quick Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/admin/hod/question-bank')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md transition-colors cursor-pointer"
          >
            <FileUp className="w-3.5 h-3.5" />
            <span>Upload Question Bank</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/admin/hod/student-management')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#1F2937] bg-white border border-[#D9E2EF] hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
          >
            <Users className="w-3.5 h-3.5 text-[#2563EB]" />
            <span>Upload Student Details</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/admin/hod/submission-history')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#1F2937] bg-white border border-[#D9E2EF] hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
          >
            <History className="w-3.5 h-3.5 text-[#6D5CE8]" />
            <span>Review Submissions</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/admin/hod/results')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#1F2937] bg-white border border-[#D9E2EF] hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
          >
            <Award className="w-3.5 h-3.5 text-[#16834A]" />
            <span>View Department Results</span>
          </button>
        </div>
      </div>

      {/* Department Isolation Assurance Notice */}
      <div className="bg-white rounded-lg border border-[#D9E2EF] px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-[#1F2937]">
          <ShieldCheck className="w-4 h-4 text-[#16834A] shrink-0" />
          <span>
            <strong>Department Access Isolation Active:</strong> This session is strictly scoped to <strong>{department.name} ({department.code})</strong>. Question banks, student rosters, and results from other departments are inaccessible.
          </span>
        </div>
        <span className="font-mono text-[#64748B] shrink-0">
          Active Semesters: {activeSemesters.map((s) => `Sem ${s}`).join(', ')}
        </span>
      </div>

      {/* Key HOD Metrics Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg border border-[#D9E2EF] p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-[#64748B]">
            <span>Assigned Department</span>
            <Building2 className="w-4 h-4 text-[#2563EB]" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-[#17243A]">
              {department.code}
            </span>
            <span className="text-xs text-[#64748B]">
              {activeSemesters.length} Active Sems
            </span>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-[#D9E2EF] p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-[#64748B]">
            <span>Department Subjects</span>
            <BookOpen className="w-4 h-4 text-[#6D5CE8]" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono tabular-nums text-[#17243A]">
              {subjects.length}
            </span>
            <span className="text-xs text-[#64748B]">5 Modules Each</span>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-[#D9E2EF] p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-[#64748B]">
            <span>Question Banks Status</span>
            <CheckCircle2 className="w-4 h-4 text-[#16834A]" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono tabular-nums text-[#16834A]">
              {submittedOrFinalizedCount} <span className="text-xs font-sans font-normal text-[#64748B]">Submitted</span>
            </span>
            <span className="text-xs font-semibold text-[#B7791F] font-mono tabular-nums">
              {pendingQbCount} Pending
            </span>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-[#D9E2EF] p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-[#64748B]">
            <span>Department Students</span>
            <Users className="w-4 h-4 text-[#2563EB]" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono tabular-nums text-[#17243A]">
              {department.totalStudents}
            </span>
            <span className="text-xs text-[#6D5CE8] font-medium">
              Roster Frozen / Active
            </span>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-[#D9E2EF] p-4 flex flex-col justify-between sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between text-xs text-[#64748B]">
            <span>Exams & Released Results</span>
            <CalendarClock className="w-4 h-4 text-[#B7791F]" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono tabular-nums text-[#17243A]">
              {upcomingExamsCount} <span className="text-xs font-sans font-normal text-[#64748B]">Upcoming</span>
            </span>
            <span className="text-xs text-[#16834A] font-mono font-semibold">
              {releasedResults.length} Results Out
            </span>
          </div>
        </div>
      </div>

      {/* Subject Question Bank Readiness Table */}
      <section className="bg-white rounded-lg border border-[#D9E2EF] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#D9E2EF] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-[#17243A]">
              {department.code} Subject Question Bank Readiness (300 Questions / 5 Modules)
            </h2>
            <p className="text-xs text-[#64748B]">
              Each subject requires 60 validated MCQs per module (Modules 1 to 5) with uniform difficulty before final submission.
            </p>
          </div>
          <Link
            to="/admin/hod/question-bank"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#2563EB] hover:underline"
          >
            <span>Open Question Bank Workspace</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F5F7FB] border-b border-[#D9E2EF] text-xs font-semibold text-[#64748B]">
                <th className="py-3 px-5">Subject Code</th>
                <th className="py-3 px-5">Subject Title</th>
                <th className="py-3 px-4">Semester</th>
                <th className="py-3 px-4">Sections</th>
                <th className="py-3 px-5">Uploaded Progress (M1–M5)</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D9E2EF] text-[13px]">
              {subjects.map((sub) => {
                const qb = questionBanks.find((q) => q.subjectId === sub.id);
                const uploaded = qb ? qb.questions.length : 0;
                const pct = Math.min(100, Math.round((uploaded / 300) * 100));
                return (
                  <tr key={sub.id} className="hover:bg-[#F5F7FB]/60">
                    <td className="py-3.5 px-5 font-mono font-bold text-[#17243A]">
                      {sub.code}
                    </td>
                    <td className="py-3.5 px-5 font-semibold text-[#1F2937]">
                      {sub.name}
                    </td>
                    <td className="py-3.5 px-4 text-xs">
                      Semester {sub.semesterNumber}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-[#64748B]">
                      {sub.sections.join(' · ')}
                    </td>
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-28 h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                          <div
                            className={`h-full ${
                              uploaded === 300 ? 'bg-[#16834A]' : 'bg-[#2563EB]'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs tabular-nums text-[#1F2937]">
                          {uploaded}/300
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={sub.questionBankStatus} />
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      <Link
                        to={`/admin/hod/question-bank?subjectId=${sub.id}&sem=${sub.semesterNumber}`}
                        className="text-xs font-semibold text-[#2563EB] hover:underline"
                      >
                        {sub.questionBankStatus === 'Finalized' ? 'View Locked Bank' : 'Upload / Validate'}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Two-Column Split: COE Examination Schedule Status + Released Department Results Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <section className="lg:col-span-7 bg-white rounded-lg border border-[#D9E2EF] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#D9E2EF] flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-[#17243A]">
                COE Examination Status ({department.code})
              </h2>
              <p className="text-xs text-[#64748B]">
                Read-only schedule and COE preparation state for {department.code} sessions.
              </p>
            </div>
            <Link
              to="/admin/hod/exam-status"
              className="text-xs font-semibold text-[#2563EB] hover:underline"
            >
              Full Schedule
            </Link>
          </div>
          <div className="divide-y divide-[#D9E2EF]">
            {examSchedules.map((sched) => (
              <div key={sched.id} className="px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-[#17243A]">
                    {sched.subjectCode} – {sched.subjectName} ({sched.section})
                  </div>
                  <div className="text-[11px] text-[#64748B] mt-0.5 font-mono">
                    {sched.examDate} · {sched.sessionTime}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={sched.coePrepStatus} />
                  <StatusBadge status={sched.resultPublicationStatus} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="lg:col-span-5 bg-white rounded-lg border border-[#D9E2EF] p-6 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#17243A]">
                Released Department Results
              </h2>
              <Award className="w-5 h-5 text-[#16834A]" />
            </div>
            <p className="text-xs text-[#64748B] leading-relaxed">
              Results are released to the HOD Portal only after the Controller of Examinations (COE) verifies the lab-signed evaluation package and approves publication.
            </p>

            <div className="p-4 rounded-md bg-[#F5F7FB] border border-[#D9E2EF] space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-[#64748B]">COE-Approved Student Results:</span>
                <span className="font-mono font-bold text-[#16834A]">
                  {releasedResults.length} Records Released
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-[#64748B]">Sessions Pending COE Approval:</span>
                <span className="font-mono font-semibold text-[#B7791F]">
                  {examSchedules.filter((e) => e.resultPublicationStatus === 'Pending Approval').length} Sessions Withheld
                </span>
              </div>
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-[#D9E2EF] flex items-center justify-between">
            <span className="text-xs text-[#64748B]">
              Department-scoped analytics ready
            </span>
            <Link
              to="/admin/hod/results"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md"
            >
              <span>Inspect Released Results</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
};
