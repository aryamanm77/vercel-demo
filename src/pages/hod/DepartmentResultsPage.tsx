import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Award,
  BarChart2,
  Download,
  Lock,
  Search,
  ShieldAlert,
  Trophy,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { resultsService } from '../../services/resultsService';
import {
  analyticsService,
  DepartmentPerformanceAnalytics,
} from '../../services/analyticsService';
import { StudentExamResult } from '../../types';
import { StatusBadge } from '../../components/StatusBadge';
import { downloadCsvFile } from '../../utils/exportUtils';

export const DepartmentResultsPage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [viewMode, setViewMode] = useState<'table' | 'analytics'>(
    searchParams.get('view') === 'analytics' ? 'analytics' : 'table'
  );

  const [releasedResults, setReleasedResults] = useState<StudentExamResult[]>([]);
  const [withheldSubjects, setWithheldSubjects] = useState<
    { subjectCode: string; subjectName: string; section: string; status: string }[]
  >([]);
  const [loading, setLoading] = useState(true);

  const [semesterFilter, setSemesterFilter] = useState<number>(0);
  const [sectionFilter, setSectionFilter] = useState<string>('ALL');
  const [subjectFilter, setSubjectFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setViewMode(searchParams.get('view') === 'analytics' ? 'analytics' : 'table');
  }, [searchParams]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!user?.departmentId) return;
      setLoading(true);
      try {
        const res = await resultsService.getReleasedResults({
          requesterRole: 'HOD',
          requesterDepartmentId: user.departmentId,
          semesterNumber: semesterFilter > 0 ? semesterFilter : undefined,
          section: sectionFilter !== 'ALL' ? sectionFilter : undefined,
        });
        if (!mounted) return;
        setReleasedResults(res.data.releasedResults);
        setWithheldSubjects(res.data.withheldSubjects);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [user?.departmentId, semesterFilter, sectionFilter]);

  const filteredResults = releasedResults.filter((r) => {
    if (subjectFilter !== 'ALL' && r.subjectCode !== subjectFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      return (
        r.usn.toLowerCase().includes(q) ||
        r.studentName.toLowerCase().includes(q) ||
        r.subjectCode.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const analytics: DepartmentPerformanceAnalytics =
    analyticsService.computeAnalytics(filteredResults);

  const availableSubjects = Array.from(
    new Set(releasedResults.map((r) => r.subjectCode))
  );

  const handleExportDepartmentResults = () => {
    downloadCsvFile(
      `MIT_Mysore_${user?.departmentCode}_Released_Results_${new Date().toISOString().split('T')[0]}.csv`,
      [
        'Examination Name',
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
      ])
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#16834A]">
            <Lock className="w-3.5 h-3.5" />
            <span>COE-Approved Department Results · {user?.departmentCode} Only</span>
          </div>
          <h1 className="text-2xl font-bold text-[#17243A] mt-0.5">
            {user?.departmentName} – Examination Results & Analytics
          </h1>
          <p className="text-sm text-[#64748B] mt-0.5">
            Displays verified student marks and performance analytics strictly after Controller of Examinations (COE) approval and release.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-200/75 rounded-lg">
            <button
              type="button"
              onClick={() => {
                setViewMode('table');
                setSearchParams({});
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors ${
                viewMode === 'table'
                  ? 'bg-white text-[#17243A] shadow-xs'
                  : 'text-[#64748B] hover:text-[#1F2937]'
              }`}
            >
              <Award className="w-3.5 h-3.5" />
              <span>Individual Student Results</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('analytics');
                setSearchParams({ view: 'analytics' });
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors ${
                viewMode === 'analytics'
                  ? 'bg-white text-[#17243A] shadow-xs'
                  : 'text-[#64748B] hover:text-[#1F2937]'
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5" />
              <span>Performance Analytics</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportDepartmentResults}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Withheld Unapproved Results Notice */}
      {withheldSubjects.length > 0 && (
        <div className="p-4 rounded-lg bg-[#B7791F]/10 border border-[#B7791F]/30 flex items-start gap-3 text-xs">
          <ShieldAlert className="w-5 h-5 text-[#B7791F] shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-[#17243A]">
              Unapproved Results Hidden ({withheldSubjects.length} Session Awaiting COE Release)
            </div>
            <p className="text-[#64748B] mt-0.5">
              Results for{' '}
              <strong>
                {withheldSubjects.map((w) => `${w.subjectCode} (${w.section})`).join(', ')}
              </strong>{' '}
              remain locked under COE control until official verification and release.
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg border border-[#D9E2EF] p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
            Semester
          </label>
          <select
            value={semesterFilter}
            onChange={(e) => setSemesterFilter(Number(e.target.value))}
            className="w-full px-3 py-1.5 text-xs bg-white border border-[#D9E2EF] rounded-md"
          >
            <option value={0}>All Semesters</option>
            <option value={3}>3rd Semester</option>
            <option value={5}>5th Semester</option>
            <option value={7}>7th Semester</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
            Section
          </label>
          <select
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value)}
            className="w-full px-3 py-1.5 text-xs bg-white border border-[#D9E2EF] rounded-md"
          >
            <option value="ALL">All Sections</option>
            <option value="Section A">Section A</option>
            <option value="Section B">Section B</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
            Subject
          </label>
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="w-full px-3 py-1.5 text-xs bg-white border border-[#D9E2EF] rounded-md"
          >
            <option value="ALL">All Released Subjects</option>
            {availableSubjects.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
            Search Student USN / Name
          </label>
          <div className="relative">
            <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="e.g., 4MH24CS001"
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-[#D9E2EF] rounded-md"
            />
          </div>
        </div>
      </div>

      {/* Analytics KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg border border-[#D9E2EF] p-4">
          <div className="text-xs text-[#64748B]">Highest Marks</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-[#2563EB] mt-1">
            {analytics.highestMarks} <span className="text-xs font-normal text-[#64748B]">/ 30</span>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-[#D9E2EF] p-4">
          <div className="text-xs text-[#64748B]">Lowest Marks</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-[#17243A] mt-1">
            {analytics.lowestMarks} <span className="text-xs font-normal text-[#64748B]">/ 30</span>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-[#D9E2EF] p-4">
          <div className="text-xs text-[#64748B]">Average Marks</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-[#6D5CE8] mt-1">
            {analytics.averageMarks} <span className="text-xs font-normal text-[#64748B]">/ 30</span>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-[#D9E2EF] p-4">
          <div className="text-xs text-[#64748B]">Pass Percentage</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-[#16834A] mt-1">
            {analytics.passPercentage}%
          </div>
        </div>
        <div className="bg-white rounded-lg border border-[#D9E2EF] p-4">
          <div className="text-xs text-[#64748B]">Fail Percentage</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-[#B42318] mt-1">
            {analytics.failPercentage}%
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-8 bg-white rounded-lg border border-[#D9E2EF] text-center text-xs text-[#64748B]">
          Loading released department results...
        </div>
      ) : viewMode === 'table' ? (
        <div className="bg-white rounded-lg border border-[#D9E2EF] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#D9E2EF] flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-[#17243A]">
                Released Student Marks ({user?.departmentCode})
              </h2>
              <p className="text-xs text-[#64748B]">
                Showing {filteredResults.length} COE-released records for {user?.departmentName}.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-[#F5F7FB] border-b border-[#D9E2EF] text-xs font-semibold text-[#64748B]">
                <tr>
                  <th className="py-3 px-5">Student USN</th>
                  <th className="py-3 px-5">Student Name</th>
                  <th className="py-3 px-4">Examination Name</th>
                  <th className="py-3 px-4">Sem & Section</th>
                  <th className="py-3 px-5">Subject</th>
                  <th className="py-3 px-4 text-right">Marks</th>
                  <th className="py-3 px-5">Result Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D9E2EF] text-[13px]">
                {filteredResults.map((r) => (
                  <tr key={r.id} className="hover:bg-[#F5F7FB]/60">
                    <td className="py-3 px-5 font-mono font-bold text-[#17243A]">
                      {r.usn}
                    </td>
                    <td className="py-3 px-5 font-medium text-[#1F2937]">
                      {r.studentName}
                    </td>
                    <td className="py-3 px-4 text-xs text-[#64748B]">
                      {r.examCycleName}
                    </td>
                    <td className="py-3 px-4 text-xs">
                      Sem {r.semesterNumber} · {r.section}
                    </td>
                    <td className="py-3 px-5 text-xs">
                      <span className="font-mono font-bold text-[#2563EB]">{r.subjectCode}</span> – {r.subjectName}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-[#17243A]">
                      {r.marksObtained} / {r.maxMarks} ({r.percentage}%)
                    </td>
                    <td className="py-3 px-5">
                      <StatusBadge status={r.resultStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Top-Performing Students */}
          <div className="lg:col-span-6 bg-white rounded-lg border border-[#D9E2EF] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#D9E2EF] flex items-center gap-2">
              <Trophy className="w-4 h-4 text-[#B7791F]" />
              <h2 className="text-base font-bold text-[#17243A]">
                Top-Performing Students ({user?.departmentCode})
              </h2>
            </div>
            <div className="divide-y divide-[#D9E2EF]">
              {analytics.topPerformers.map((stu, idx) => (
                <div
                  key={stu.id}
                  className="px-6 py-3.5 flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-[#17243A] text-white font-mono text-xs font-bold flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <div>
                      <div className="text-xs font-bold text-[#17243A]">
                        {stu.studentName} ({stu.usn})
                      </div>
                      <div className="text-[11px] text-[#64748B]">
                        {stu.subjectCode} · {stu.section}
                      </div>
                    </div>
                  </div>
                  <div className="text-right font-mono">
                    <div className="text-sm font-bold text-[#16834A]">
                      {stu.marksObtained} / {stu.maxMarks}
                    </div>
                    <div className="text-[11px] text-[#64748B]">{stu.percentage}%</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section-Wise & Subject-Wise Comparison Charts */}
          <div className="lg:col-span-6 space-y-6">
            <div className="bg-white rounded-lg border border-[#D9E2EF] p-6 space-y-4">
              <h2 className="text-base font-bold text-[#17243A]">
                Section-Wise Performance Comparison
              </h2>
              <div className="space-y-4">
                {analytics.sectionComparison.map((sec) => (
                  <div key={sec.section} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-[#17243A]">
                        {sec.section} ({sec.studentsCount} Students)
                      </span>
                      <span className="font-mono text-[#1F2937]">
                        Avg: <strong>{sec.averageMarks}/30</strong> · High: <strong>{sec.highestMarks}/30</strong> · Pass: <strong className="text-[#16834A]">{sec.passPercentage}%</strong>
                      </span>
                    </div>
                    <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                      <div
                        className="h-full bg-[#2563EB]"
                        style={{ width: `${sec.passPercentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-lg border border-[#D9E2EF] p-6 space-y-4">
              <h2 className="text-base font-bold text-[#17243A]">
                Subject-Wise Performance Summary
              </h2>
              <div className="space-y-4">
                {analytics.subjectComparison.map((sub) => (
                  <div key={sub.subjectCode} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-[#17243A]">
                        {sub.subjectCode} – {sub.subjectName}
                      </span>
                      <span className="font-mono text-[#1F2937]">
                        Avg: <strong>{sub.averageMarks}/30</strong> · Pass: <strong className="text-[#16834A]">{sub.passPercentage}%</strong>
                      </span>
                    </div>
                    <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                      <div
                        className="h-full bg-[#6D5CE8]"
                        style={{ width: `${sub.passPercentage}%` }}
                      />
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
