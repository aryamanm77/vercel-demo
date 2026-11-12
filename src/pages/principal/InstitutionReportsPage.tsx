import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BarChart3,
  CheckCircle2,
  Download,
  FileBarChart2,
  Lock,
  ShieldAlert,
} from 'lucide-react';
import { principalService, PrincipalDashboardMetrics } from '../../services/principalService';
import { resultsService } from '../../services/resultsService';
import { analyticsService, DepartmentPerformanceAnalytics } from '../../services/analyticsService';
import { questionBankService } from '../../services/questionBankService';
import { auditService } from '../../services/auditService';
import { StudentExamResult, SubmissionHistoryEntry } from '../../types';
import { StatusBadge } from '../../components/StatusBadge';
import { downloadCsvFile } from '../../utils/exportUtils';
import { useAuth } from '../../hooks/useAuth';

export const InstitutionReportsPage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [viewMode, setViewMode] = useState<'overview' | 'analytics'>(
    searchParams.get('view') === 'analytics' ? 'analytics' : 'overview'
  );

  const [metrics, setMetrics] = useState<PrincipalDashboardMetrics | null>(null);
  const [releasedResults, setReleasedResults] = useState<StudentExamResult[]>([]);
  const [withheldSubjects, setWithheldSubjects] = useState<
    { subjectCode: string; subjectName: string; section: string; status: string }[]
  >([]);
  const [submissions, setSubmissions] = useState<SubmissionHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Filters
  const [ayFilter, setAyFilter] = useState('ay-2026-27');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [semFilter, setSemFilter] = useState<number>(0);
  const [subFilter, setSubFilter] = useState('ALL');
  const [cycleFilter, setCycleFilter] = useState('Odd Semester Internal Assessment – I (Nov 2026)');

  useEffect(() => {
    setViewMode(searchParams.get('view') === 'analytics' ? 'analytics' : 'overview');
  }, [searchParams]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const [mRes, rRes, subRes] = await Promise.all([
          principalService.getDashboardOverview(),
          resultsService.getReleasedResults({
            requesterRole: 'PRINCIPAL',
            departmentId: deptFilter === 'ALL' ? undefined : deptFilter,
            academicYearId: ayFilter,
            semesterNumber: semFilter > 0 ? semFilter : undefined,
          }),
          questionBankService.getSubmissionHistory(
            deptFilter === 'ALL' ? undefined : deptFilter
          ),
        ]);
        if (!mounted) return;
        setMetrics(mRes.data);
        setReleasedResults(rRes.data.releasedResults);
        setWithheldSubjects(rRes.data.withheldSubjects);
        setSubmissions(subRes.data);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [ayFilter, deptFilter, semFilter]);

  const filteredResults = releasedResults.filter((r) => {
    if (subFilter !== 'ALL' && r.subjectCode !== subFilter) return false;
    return true;
  });

  const analytics: DepartmentPerformanceAnalytics = analyticsService.computeAnalytics(filteredResults);

  const uniqueSubjectsInResults = Array.from(
    new Set(releasedResults.map((r) => r.subjectCode))
  );

  const handleExportReport = async () => {
    if (!user) return;
    await auditService.recordReportAccess(
      user.fullName,
      user.employeeId,
      `Institution COE-Approved Results & Readiness Report (${deptFilter})`
    );
    downloadCsvFile(
      `MIT_Mysore_Institution_Report_${new Date().toISOString().split('T')[0]}.csv`,
      [
        'Examination Cycle',
        'Department',
        'Semester',
        'Section',
        'Subject Code',
        'Subject Name',
        'USN',
        'Student Name',
        'Marks Obtained',
        'Max Marks',
        'Percentage',
        'Result Status',
        'COE Approval Status',
      ],
      filteredResults.map((r) => [
        r.examCycleName,
        r.departmentCode,
        r.semesterNumber,
        r.section,
        r.subjectCode,
        r.subjectName,
        r.usn,
        r.studentName,
        r.marksObtained,
        r.maxMarks,
        `${r.percentage}%`,
        r.resultStatus,
        r.coeApprovalStatus,
      ])
    );
    setExportNotice('Authorized CSV report exported and logged in institutional audit trail.');
    setTimeout(() => setExportNotice(null), 4000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#17243A]">
            Institution-Wide Reports & Academic Analytics
          </h1>
          <p className="text-sm text-[#64748B] mt-0.5">
            Comprehensive oversight of department student counts, question-bank completion, HOD submissions, and COE-approved examination results.
          </p>
        </div>
        <button
          type="button"
          onClick={handleExportReport}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md transition-colors self-start cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>Export Authorized Report (CSV)</span>
        </button>
      </div>

      {exportNotice && (
        <div className="p-3 rounded-md bg-[#16834A]/10 border border-[#16834A]/30 text-xs text-[#16834A] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{exportNotice}</span>
        </div>
      )}

      {/* Multi-Parameter Filter Bar (Academic Year, Department, Semester, Subject, Exam Cycle) */}
      <div className="bg-white rounded-lg border border-[#D9E2EF] p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
            Academic Year
          </label>
          <select
            value={ayFilter}
            onChange={(e) => setAyFilter(e.target.value)}
            className="w-full px-3 py-1.5 text-xs bg-white border border-[#D9E2EF] rounded-md"
          >
            <option value="ay-2026-27">2026–2027 (Active)</option>
            <option value="ay-2027-28">2027–2028 (Upcoming)</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
            Department
          </label>
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="w-full px-3 py-1.5 text-xs bg-white border border-[#D9E2EF] rounded-md"
          >
            <option value="ALL">All Departments (Institution-Wide)</option>
            {metrics?.departmentSummary.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} – {d.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
            Semester
          </label>
          <select
            value={semFilter}
            onChange={(e) => setSemFilter(Number(e.target.value))}
            className="w-full px-3 py-1.5 text-xs bg-white border border-[#D9E2EF] rounded-md"
          >
            <option value={0}>All Semesters</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                Semester {n}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
            Subject Filter
          </label>
          <select
            value={subFilter}
            onChange={(e) => setSubFilter(e.target.value)}
            className="w-full px-3 py-1.5 text-xs bg-white border border-[#D9E2EF] rounded-md"
          >
            <option value="ALL">All Released Subjects</option>
            {uniqueSubjectsInResults.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
            Examination Cycle
          </label>
          <select
            value={cycleFilter}
            onChange={(e) => setCycleFilter(e.target.value)}
            className="w-full px-3 py-1.5 text-xs bg-white border border-[#D9E2EF] rounded-md"
          >
            <option value="Odd Semester Internal Assessment – I (Nov 2026)">
              Odd Sem IA – I (Nov 2026)
            </option>
          </select>
        </div>
      </div>

      {/* Mode Switcher */}
      <div className="flex items-center gap-1 p-1 bg-slate-200/75 rounded-lg w-fit">
        <button
          type="button"
          onClick={() => {
            setViewMode('overview');
            setSearchParams({});
          }}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md transition-colors ${
            viewMode === 'overview'
              ? 'bg-white text-[#17243A] shadow-xs'
              : 'text-[#64748B] hover:text-[#1F2937]'
          }`}
        >
          <FileBarChart2 className="w-3.5 h-3.5" />
          <span>Readiness, Submissions & COE-Approved Results</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setViewMode('analytics');
            setSearchParams({ view: 'analytics' });
          }}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md transition-colors ${
            viewMode === 'analytics'
              ? 'bg-white text-[#17243A] shadow-xs'
              : 'text-[#64748B] hover:text-[#1F2937]'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>Department & Semester Distribution Analytics</span>
        </button>
      </div>

      {/* COE Result Release Gate Banner */}
      {withheldSubjects.length > 0 && (
        <div className="p-4 rounded-lg bg-[#B7791F]/10 border border-[#B7791F]/30 flex items-start gap-3 text-xs">
          <ShieldAlert className="w-5 h-5 text-[#B7791F] shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-[#17243A]">
              COE Result Release Gate Active ({withheldSubjects.length} Session Awaiting COE Approval)
            </div>
            <p className="text-[#64748B] mt-0.5">
              Per MIT Mysore Examination Policy, results are displayed only after Controller of Examinations (COE) verification and official release. Currently withheld:{' '}
              {withheldSubjects.map((w) => `${w.subjectCode} (${w.section}: ${w.status})`).join('; ')}.
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="p-8 bg-white rounded-lg border border-[#D9E2EF] text-center text-xs text-[#64748B]">
          Compiling institutional reports...
        </div>
      ) : viewMode === 'overview' ? (
        <div className="space-y-6">
          {/* Performance KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="bg-white rounded-lg border border-[#D9E2EF] p-4">
              <div className="text-xs text-[#64748B]">Evaluated Students</div>
              <div className="text-xl font-bold font-mono tabular-nums text-[#17243A] mt-1">
                {analytics.totalEvaluated}
              </div>
            </div>
            <div className="bg-white rounded-lg border border-[#D9E2EF] p-4">
              <div className="text-xs text-[#64748B]">Pass Percentage</div>
              <div className="text-xl font-bold font-mono tabular-nums text-[#16834A] mt-1">
                {analytics.passPercentage}%
              </div>
            </div>
            <div className="bg-white rounded-lg border border-[#D9E2EF] p-4">
              <div className="text-xs text-[#64748B]">Fail Percentage</div>
              <div className="text-xl font-bold font-mono tabular-nums text-[#B42318] mt-1">
                {analytics.failPercentage}%
              </div>
            </div>
            <div className="bg-white rounded-lg border border-[#D9E2EF] p-4">
              <div className="text-xs text-[#64748B]">Highest Marks</div>
              <div className="text-xl font-bold font-mono tabular-nums text-[#2563EB] mt-1">
                {analytics.highestMarks} / 30
              </div>
            </div>
            <div className="bg-white rounded-lg border border-[#D9E2EF] p-4">
              <div className="text-xs text-[#64748B]">Average Marks</div>
              <div className="text-xl font-bold font-mono tabular-nums text-[#17243A] mt-1">
                {analytics.averageMarks} / 30
              </div>
            </div>
            <div className="bg-white rounded-lg border border-[#D9E2EF] p-4">
              <div className="text-xs text-[#64748B]">Lowest Marks</div>
              <div className="text-xl font-bold font-mono tabular-nums text-[#64748B] mt-1">
                {analytics.lowestMarks} / 30
              </div>
            </div>
          </div>

          {/* HOD Question Bank & Roster Submission Status */}
          <div className="bg-white rounded-lg border border-[#D9E2EF] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#D9E2EF]">
              <h2 className="text-base font-bold text-[#17243A]">
                HOD Question-Bank Completion & Submission Status
              </h2>
              <p className="text-xs text-[#64748B]">
                Tracks 300-question bank finalization and student roster freezes across departments.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F5F7FB] border-b border-[#D9E2EF] text-xs font-semibold text-[#64748B]">
                    <th className="py-3 px-5">Reference ID</th>
                    <th className="py-3 px-4">Dept</th>
                    <th className="py-3 px-5">Subject / Roster</th>
                    <th className="py-3 px-4">Sem & Section</th>
                    <th className="py-3 px-4 text-right">Questions</th>
                    <th className="py-3 px-4">Submitted By</th>
                    <th className="py-3 px-4">Roster Status</th>
                    <th className="py-3 px-5">Submission Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D9E2EF] text-[13px]">
                  {submissions.map((sub) => (
                    <tr key={sub.id} className="hover:bg-[#F5F7FB]/60">
                      <td className="py-3 px-5 font-mono text-xs font-semibold text-[#17243A]">
                        {sub.referenceId}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-[#2563EB]">
                        {sub.departmentCode}
                      </td>
                      <td className="py-3 px-5">
                        <div className="font-semibold text-[#1F2937]">
                          {sub.subjectCode} – {sub.subjectName}
                        </div>
                        <div className="text-[11px] text-[#64748B] font-mono">
                          Revision: {sub.revision}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs">
                        Sem {sub.semesterNumber} · {sub.section}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        {sub.questionCount} / 300
                      </td>
                      <td className="py-3 px-4 text-xs">
                        <div>{sub.submittedBy}</div>
                        <div className="text-[11px] font-mono text-[#64748B]">{sub.submittedAt}</div>
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge status={sub.rosterStatus} />
                      </td>
                      <td className="py-3 px-5">
                        <StatusBadge status={sub.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* COE-Approved Examination Results Table */}
          <div className="bg-white rounded-lg border border-[#D9E2EF] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#D9E2EF] flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-[#17243A]">
                  COE-Approved & Released Examination Results
                </h2>
                <p className="text-xs text-[#64748B]">
                  Showing {filteredResults.length} verified student result records released by the Controller of Examinations.
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[#16834A] font-semibold">
                <Lock className="w-3.5 h-3.5" />
                <span>COE Signature Verified</span>
              </div>
            </div>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-[#F5F7FB] border-b border-[#D9E2EF] text-xs font-semibold text-[#64748B]">
                  <tr>
                    <th className="py-3 px-5">USN</th>
                    <th className="py-3 px-5">Student Name</th>
                    <th className="py-3 px-4">Dept & Section</th>
                    <th className="py-3 px-5">Subject</th>
                    <th className="py-3 px-4 text-right">Marks</th>
                    <th className="py-3 px-4 text-right">Percentage</th>
                    <th className="py-3 px-4">Outcome</th>
                    <th className="py-3 px-5">COE Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D9E2EF] text-[13px]">
                  {filteredResults.map((r) => (
                    <tr key={r.id} className="hover:bg-[#F5F7FB]/60">
                      <td className="py-2.5 px-5 font-mono font-bold text-[#17243A]">
                        {r.usn}
                      </td>
                      <td className="py-2.5 px-5 font-medium text-[#1F2937]">
                        {r.studentName}
                      </td>
                      <td className="py-2.5 px-4 text-xs">
                        <span className="font-mono font-bold text-[#2563EB]">{r.departmentCode}</span> · Sem {r.semesterNumber} ({r.section})
                      </td>
                      <td className="py-2.5 px-5 text-xs">
                        <span className="font-mono font-semibold">{r.subjectCode}</span> – {r.subjectName}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold">
                        {r.marksObtained} / {r.maxMarks}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                        {r.percentage}%
                      </td>
                      <td className="py-2.5 px-4">
                        <StatusBadge status={r.resultStatus} />
                      </td>
                      <td className="py-2.5 px-5">
                        <StatusBadge status={r.coeApprovalStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Department-Wise Student Counts & Question Bank Completion */}
          <div className="lg:col-span-6 bg-white rounded-lg border border-[#D9E2EF] p-6 space-y-4">
            <div>
              <h2 className="text-base font-bold text-[#17243A]">
                Department-Wise Student Counts & Question Bank Completion
              </h2>
              <p className="text-xs text-[#64748B]">
                Comparative student enrollment and finalized question-bank percentages.
              </p>
            </div>
            <div className="space-y-4 pt-2">
              {metrics?.departmentSummary.map((d) => {
                const maxStu = 750;
                const stuWidth = Math.min(100, Math.round((d.students / maxStu) * 100));
                const qbPct = Math.round(
                  (d.finalizedQuestionBanks / Math.max(1, d.totalQuestionBanks)) * 100
                );
                return (
                  <div key={d.id} className="space-y-1.5 pb-3 border-b border-slate-100 last:border-none">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-[#17243A]">
                        {d.code} – {d.name}
                      </span>
                      <span className="font-mono tabular-nums text-[#1F2937]">
                        {d.students} Students · QB: {qbPct}%
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
                      <div
                        className="h-full bg-[#2563EB]"
                        style={{ width: `${stuWidth}%` }}
                        title={`Students: ${d.students}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Semester-Wise Student Distribution & Subject Performance */}
          <div className="lg:col-span-6 bg-white rounded-lg border border-[#D9E2EF] p-6 space-y-5">
            <div>
              <h2 className="text-base font-bold text-[#17243A]">
                Subject-Wise & Section-Wise Performance Comparison
              </h2>
              <p className="text-xs text-[#64748B]">
                Based strictly on COE-Approved examination results.
              </p>
            </div>

            <div className="space-y-3">
              <div className="text-xs font-bold text-[#17243A]">Subject-Wise Performance</div>
              {analytics.subjectComparison.map((sub) => (
                <div
                  key={sub.subjectCode}
                  className="p-3.5 rounded-md bg-[#F5F7FB] border border-[#D9E2EF] flex items-center justify-between"
                >
                  <div>
                    <div className="text-xs font-bold text-[#17243A]">
                      {sub.subjectCode} – {sub.subjectName}
                    </div>
                    <div className="text-[11px] text-[#64748B]">
                      Evaluated Candidates: {sub.studentsCount}
                    </div>
                  </div>
                  <div className="text-right font-mono text-xs">
                    <div className="font-bold text-[#16834A]">{sub.passPercentage}% Pass</div>
                    <div className="text-[#64748B]">Avg: {sub.averageMarks}/30</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-3 pt-2 border-t border-[#D9E2EF]">
              <div className="text-xs font-bold text-[#17243A]">Section-Wise Comparison</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {analytics.sectionComparison.map((sec) => (
                  <div
                    key={sec.section}
                    className="p-3.5 rounded-md bg-[#F5F7FB] border border-[#D9E2EF] space-y-1"
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-[#17243A]">
                      <span>{sec.section}</span>
                      <span className="font-mono text-[#2563EB]">{sec.passPercentage}% Pass</span>
                    </div>
                    <div className="text-[11px] text-[#64748B] font-mono">
                      Avg: {sec.averageMarks}/30 · Highest: {sec.highestMarks}/30 ({sec.studentsCount} Students)
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
