import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  BookOpen,
  Calendar,
  CheckCircle2,
  GraduationCap,
  Layers,
  Plus,
  X,
} from 'lucide-react';
import { academicService } from '../../services/academicService';
import { departmentService } from '../../services/departmentService';
import { subjectService } from '../../services/subjectService';
import { AcademicYear, Department, SectionRecord, Semester, Subject } from '../../types';
import { StatusBadge } from '../../components/StatusBadge';
import { useAuth } from '../../hooks/useAuth';

export const AcademicStructurePage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTab =
    searchParams.get('tab') === 'subjects'
      ? 'subjects'
      : searchParams.get('tab') === 'sections'
      ? 'sections'
      : 'years-semesters';

  const [activeTab, setActiveTab] = useState<'years-semesters' | 'sections' | 'subjects'>(initialTab);

  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [sections, setSections] = useState<SectionRecord[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Filters
  const [deptFilter, setDeptFilter] = useState<string>('ALL');
  const [semFilter, setSemFilter] = useState<number>(0);

  // Academic Year Form
  const [yearModalOpen, setYearModalOpen] = useState(false);
  const [newYearLabel, setNewYearLabel] = useState('');
  const [newYearStart, setNewYearStart] = useState('2028-08-01');
  const [newYearEnd, setNewYearEnd] = useState('2029-06-30');
  const [newYearCurrent, setNewYearCurrent] = useState(false);

  // Section Form
  const [sectionModalOpen, setSectionModalOpen] = useState(false);
  const [secDeptId, setSecDeptId] = useState('');
  const [secSemNumber, setSecSemNumber] = useState(5);
  const [secName, setSecName] = useState('Section C');
  const [secCapacity, setSecCapacity] = useState(60);

  // Subject Mapping Form
  const [subjectModalOpen, setSubjectModalOpen] = useState(false);
  const [subCode, setSubCode] = useState('');
  const [subName, setSubName] = useState('');
  const [subDeptId, setSubDeptId] = useState('');
  const [subSemNumber, setSubSemNumber] = useState(5);
  const [subCredits, setSubCredits] = useState(4);
  const [subSections, setSubSections] = useState<string[]>(['Section A', 'Section B']);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [ayRes, semRes, secRes, subRes, deptRes] = await Promise.all([
        academicService.getAcademicYears(),
        academicService.getSemesters(),
        academicService.getSections(),
        subjectService.getSubjects(),
        departmentService.getAllDepartments(),
      ]);
      setAcademicYears(ayRes.data);
      setSemesters(semRes.data);
      setSections(secRes.data);
      setSubjects(subRes.data);
      setDepartments(deptRes.data);
      if (deptRes.data.length > 0 && !secDeptId) {
        setSecDeptId(deptRes.data[0].id);
        setSubDeptId(deptRes.data[0].id);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'subjects') setActiveTab('subjects');
    else if (tabParam === 'sections') setActiveTab('sections');
    else setActiveTab('years-semesters');
  }, [searchParams]);

  const switchTab = (tab: 'years-semesters' | 'sections' | 'subjects') => {
    setActiveTab(tab);
    if (tab === 'years-semesters') setSearchParams({});
    else setSearchParams({ tab });
  };

  const handleCreateYear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      await academicService.createAcademicYear(
        {
          label: newYearLabel,
          startDate: newYearStart,
          endDate: newYearEnd,
          isCurrent: newYearCurrent,
        },
        user.fullName,
        user.employeeId
      );
      setFeedback({ type: 'success', message: `Academic Year ${newYearLabel} configured.` });
      setYearModalOpen(false);
      setNewYearLabel('');
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Error creating academic year.' });
    }
  };

  const handleSetActiveYear = async (yearId: string) => {
    if (!user) return;
    try {
      await academicService.setActiveAcademicYear(yearId, user.fullName, user.employeeId);
      setFeedback({ type: 'success', message: 'Updated current active Academic Year.' });
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to update year.' });
    }
  };

  const handleToggleSemesterStatus = async (sem: Semester) => {
    if (!user) return;
    const nextStatus = sem.status === 'Active' ? 'Upcoming' : 'Active';
    try {
      await academicService.updateSemesterStatus(sem.id, nextStatus, user.fullName, user.employeeId);
      setFeedback({ type: 'success', message: `${sem.name} set to ${nextStatus}.` });
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Error updating semester.' });
    }
  };

  const handleCreateSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const currentAy = academicYears.find((a) => a.isCurrent)?.id || 'ay-2026-27';
    try {
      await academicService.createSection(
        {
          name: secName,
          departmentId: secDeptId,
          semesterNumber: secSemNumber,
          academicYearId: currentAy,
          maxCapacity: secCapacity,
        },
        user.fullName,
        user.employeeId
      );
      setFeedback({ type: 'success', message: `Created ${secName} for Semester ${secSemNumber}.` });
      setSectionModalOpen(false);
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Error creating section.' });
    }
  };

  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const currentAy = academicYears.find((a) => a.isCurrent)?.id || 'ay-2026-27';
    try {
      await subjectService.createSubject(
        {
          code: subCode,
          name: subName,
          departmentId: subDeptId,
          semesterNumber: subSemNumber,
          academicYearId: currentAy,
          credits: subCredits,
          sections: subSections,
        },
        user.fullName,
        user.employeeId
      );
      setFeedback({
        type: 'success',
        message: `Mapped 5-module subject ${subCode.toUpperCase()} (${subName}) to department curriculum.`,
      });
      setSubjectModalOpen(false);
      setSubCode('');
      setSubName('');
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Error mapping subject.' });
    }
  };

  const toggleSubSectionSelection = (secLabel: string) => {
    if (subSections.includes(secLabel)) {
      if (subSections.length > 1) {
        setSubSections(subSections.filter((s) => s !== secLabel));
      }
    } else {
      setSubSections([...subSections, secLabel]);
    }
  };

  const filteredSections = sections.filter((s) => {
    if (deptFilter !== 'ALL' && s.departmentId !== deptFilter) return false;
    if (semFilter > 0 && s.semesterNumber !== semFilter) return false;
    return true;
  });

  const filteredSubjects = subjects.filter((s) => {
    if (deptFilter !== 'ALL' && s.departmentId !== deptFilter) return false;
    if (semFilter > 0 && s.semesterNumber !== semFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#17243A]">
            Academic Structure Management
          </h1>
          <p className="text-sm text-[#64748B] mt-0.5">
            Define institutional Academic Years, 1st–8th Semesters, Department Sections, and 5-Module Subject Mappings.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'years-semesters' && (
            <button
              type="button"
              onClick={() => setYearModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Academic Year</span>
            </button>
          )}
          {activeTab === 'sections' && (
            <button
              type="button"
              onClick={() => setSectionModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Department Section</span>
            </button>
          )}
          {activeTab === 'subjects' && (
            <button
              type="button"
              onClick={() => setSubjectModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Map New Subject (5 Modules)</span>
            </button>
          )}
        </div>
      </div>

      {/* Feedback Notice */}
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

      {/* Segmented Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/75 rounded-lg w-fit">
        <button
          type="button"
          onClick={() => switchTab('years-semesters')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md transition-colors ${
            activeTab === 'years-semesters'
              ? 'bg-white text-[#17243A] shadow-xs'
              : 'text-[#64748B] hover:text-[#1F2937]'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>A & B. Academic Years & Semesters (1st–8th)</span>
        </button>
        <button
          type="button"
          onClick={() => switchTab('sections')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md transition-colors ${
            activeTab === 'sections'
              ? 'bg-white text-[#17243A] shadow-xs'
              : 'text-[#64748B] hover:text-[#1F2937]'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>C. Department Sections</span>
        </button>
        <button
          type="button"
          onClick={() => switchTab('subjects')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md transition-colors ${
            activeTab === 'subjects'
              ? 'bg-white text-[#17243A] shadow-xs'
              : 'text-[#64748B] hover:text-[#1F2937]'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>D. Subjects & Department Mapping (5 Modules)</span>
        </button>
      </div>

      {loading ? (
        <div className="p-8 bg-white rounded-lg border border-[#D9E2EF] text-center text-xs text-[#64748B]">
          Loading academic structure...
        </div>
      ) : activeTab === 'years-semesters' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Academic Years */}
          <div className="lg:col-span-5 bg-white rounded-lg border border-[#D9E2EF] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#D9E2EF]">
              <h2 className="text-base font-bold text-[#17243A]">
                A. Institutional Academic Years
              </h2>
              <p className="text-xs text-[#64748B]">
                Manage active and upcoming academic year cycles.
              </p>
            </div>
            <div className="divide-y divide-[#D9E2EF]">
              {academicYears.map((ay) => (
                <div key={ay.id} className="p-5 flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold font-mono text-[#17243A]">
                        {ay.label}
                      </span>
                      {ay.isCurrent && (
                        <span className="text-xs font-semibold text-[#2563EB]">
                          · Current Active Cycle
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[#64748B] font-mono mt-1">
                      {ay.startDate} to {ay.endDate}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={ay.status} />
                    {!ay.isCurrent && (
                      <button
                        type="button"
                        onClick={() => handleSetActiveYear(ay.id)}
                        className="px-2.5 py-1 text-xs font-semibold text-[#2563EB] bg-blue-50 hover:bg-blue-100 rounded border border-blue-200"
                      >
                        Set Current
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Semesters 1st to 8th */}
          <div className="lg:col-span-7 bg-white rounded-lg border border-[#D9E2EF] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#D9E2EF]">
              <h2 className="text-base font-bold text-[#17243A]">
                B. Semesters Configuration (1st to 8th Semester)
              </h2>
              <p className="text-xs text-[#64748B]">
                Activate Odd or Even semester cycles across all engineering departments.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F5F7FB] border-b border-[#D9E2EF] text-xs font-semibold text-[#64748B]">
                    <th className="py-3 px-5">Semester</th>
                    <th className="py-3 px-5">Cycle Classification</th>
                    <th className="py-3 px-5">Current Status</th>
                    <th className="py-3 px-5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D9E2EF] text-[13px]">
                  {semesters.map((sem) => (
                    <tr key={sem.id} className="hover:bg-[#F5F7FB]/60">
                      <td className="py-3 px-5 font-semibold text-[#17243A]">
                        {sem.name}
                      </td>
                      <td className="py-3 px-5 text-xs text-[#64748B]">
                        {sem.cycle} Semester Cycle
                      </td>
                      <td className="py-3 px-5">
                        <StatusBadge status={sem.status} />
                      </td>
                      <td className="py-3 px-5 text-right">
                        <button
                          type="button"
                          onClick={() => handleToggleSemesterStatus(sem)}
                          className="px-3 py-1 text-xs font-medium text-[#1F2937] bg-white border border-[#D9E2EF] rounded hover:bg-slate-100"
                        >
                          {sem.status === 'Active' ? 'Mark Upcoming' : 'Activate Semester'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : activeTab === 'sections' ? (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white rounded-lg border border-[#D9E2EF] p-4 flex flex-wrap items-center gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                Filter by Department
              </label>
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="px-3 py-1.5 text-xs bg-white border border-[#D9E2EF] rounded-md"
              >
                <option value="ALL">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} – {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                Filter by Semester
              </label>
              <select
                value={semFilter}
                onChange={(e) => setSemFilter(Number(e.target.value))}
                className="px-3 py-1.5 text-xs bg-white border border-[#D9E2EF] rounded-md"
              >
                <option value={0}>All Semesters (1st–8th)</option>
                {semesters.map((s) => (
                  <option key={s.id} value={s.number}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-[#D9E2EF] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#D9E2EF]">
              <h2 className="text-base font-bold text-[#17243A]">
                C. Department-Specific Student Sections
              </h2>
              <p className="text-xs text-[#64748B]">
                Different departments maintain independent section structures based on student intake.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F5F7FB] border-b border-[#D9E2EF] text-xs font-semibold text-[#64748B]">
                    <th className="py-3 px-5">Department</th>
                    <th className="py-3 px-5">Semester</th>
                    <th className="py-3 px-5">Section Name</th>
                    <th className="py-3 px-5 text-right">Enrolled Students</th>
                    <th className="py-3 px-5 text-right">Max Capacity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D9E2EF] text-[13px]">
                  {filteredSections.map((sec) => (
                    <tr key={sec.id} className="hover:bg-[#F5F7FB]/60">
                      <td className="py-3 px-5 font-mono font-bold text-[#17243A]">
                        {sec.departmentCode}
                      </td>
                      <td className="py-3 px-5">
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white rounded-lg border border-[#D9E2EF] p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                  Department
                </label>
                <select
                  value={deptFilter}
                  onChange={(e) => setDeptFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-white border border-[#D9E2EF] rounded-md"
                >
                  <option value="ALL">All Departments</option>
                  {departments.map((d) => (
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
                  className="px-3 py-1.5 text-xs bg-white border border-[#D9E2EF] rounded-md"
                >
                  <option value={0}>All Semesters</option>
                  {semesters.map((s) => (
                    <option key={s.id} value={s.number}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="text-xs text-[#64748B] flex items-center gap-1.5">
              <GraduationCap className="w-4 h-4 text-[#6D5CE8]" />
              <span>Standard Structure: <strong>5 Modules per Subject</strong> (60 MCQs/Module = 300 Total)</span>
            </div>
          </div>

          {/* Subjects Table */}
          <div className="bg-white rounded-lg border border-[#D9E2EF] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#D9E2EF]">
              <h2 className="text-base font-bold text-[#17243A]">
                D. Department-to-Subject Mapping Registry
              </h2>
              <p className="text-xs text-[#64748B]">
                HODs retrieve their department's assigned subjects directly from this registry.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F5F7FB] border-b border-[#D9E2EF] text-xs font-semibold text-[#64748B]">
                    <th className="py-3 px-5">Subject Code</th>
                    <th className="py-3 px-5">Subject Title</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4">Semester</th>
                    <th className="py-3 px-4">Modules</th>
                    <th className="py-3 px-4">Applicable Sections</th>
                    <th className="py-3 px-5">Question Bank Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D9E2EF] text-[13px]">
                  {filteredSubjects.map((sub) => (
                    <tr key={sub.id} className="hover:bg-[#F5F7FB]/60">
                      <td className="py-3.5 px-5 font-mono font-bold text-[#17243A]">
                        {sub.code}
                      </td>
                      <td className="py-3.5 px-5 font-semibold text-[#1F2937]">
                        {sub.name}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-semibold text-[#2563EB]">
                        {sub.departmentCode}
                      </td>
                      <td className="py-3.5 px-4 text-xs">
                        Semester {sub.semesterNumber}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-[#1F2937]">
                        {sub.moduleCount} Modules (300 Qs)
                      </td>
                      <td className="py-3.5 px-4 text-xs text-[#64748B]">
                        {sub.sections.join(' · ')}
                      </td>
                      <td className="py-3.5 px-5">
                        <StatusBadge status={sub.questionBankStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add Academic Year */}
      {yearModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17243A]/60 p-4">
          <div className="w-full max-w-md bg-white rounded-lg border border-[#D9E2EF] shadow-lg overflow-hidden">
            <div className="px-6 py-4 bg-[#F5F7FB] border-b border-[#D9E2EF] flex items-center justify-between">
              <h3 className="text-base font-bold text-[#17243A]">Configure Academic Year</h3>
              <button type="button" onClick={() => setYearModalOpen(false)}>
                <X className="w-4 h-4 text-[#64748B]" />
              </button>
            </div>
            <form onSubmit={handleCreateYear} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                  Academic Year Label <span className="text-[#B42318]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newYearLabel}
                  onChange={(e) => setNewYearLabel(e.target.value)}
                  placeholder="e.g., 2028–2029"
                  className="w-full px-3 py-2 text-sm border border-[#D9E2EF] rounded-md"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">Start Date</label>
                  <input
                    type="date"
                    required
                    value={newYearStart}
                    onChange={(e) => setNewYearStart(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#D9E2EF] rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">End Date</label>
                  <input
                    type="date"
                    required
                    value={newYearEnd}
                    onChange={(e) => setNewYearEnd(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#D9E2EF] rounded-md"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-[#1F2937]">
                <input
                  type="checkbox"
                  checked={newYearCurrent}
                  onChange={(e) => setNewYearCurrent(e.target.checked)}
                />
                <span>Set immediately as Current Active Academic Year</span>
              </label>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setYearModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold border border-[#D9E2EF] rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] rounded-md"
                >
                  Save Academic Year
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create Section */}
      {sectionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17243A]/60 p-4">
          <div className="w-full max-w-md bg-white rounded-lg border border-[#D9E2EF] shadow-lg overflow-hidden">
            <div className="px-6 py-4 bg-[#F5F7FB] border-b border-[#D9E2EF] flex items-center justify-between">
              <h3 className="text-base font-bold text-[#17243A]">Create Department Section</h3>
              <button type="button" onClick={() => setSectionModalOpen(false)}>
                <X className="w-4 h-4 text-[#64748B]" />
              </button>
            </div>
            <form onSubmit={handleCreateSection} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#1F2937] mb-1">Department</label>
                <select
                  required
                  value={secDeptId}
                  onChange={(e) => setSecDeptId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-[#D9E2EF] rounded-md"
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.code} – {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">Semester</label>
                  <select
                    value={secSemNumber}
                    onChange={(e) => setSecSemNumber(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm bg-white border border-[#D9E2EF] rounded-md"
                  >
                    {semesters.map((s) => (
                      <option key={s.id} value={s.number}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">Section Name</label>
                  <input
                    type="text"
                    required
                    value={secName}
                    onChange={(e) => setSecName(e.target.value)}
                    placeholder="Section C"
                    className="w-full px-3 py-2 text-sm border border-[#D9E2EF] rounded-md"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#1F2937] mb-1">Maximum Student Capacity</label>
                <input
                  type="number"
                  min={10}
                  max={120}
                  value={secCapacity}
                  onChange={(e) => setSecCapacity(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-[#D9E2EF] rounded-md"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSectionModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold border border-[#D9E2EF] rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] rounded-md"
                >
                  Create Section
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Map New Subject */}
      {subjectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17243A]/60 p-4">
          <div className="w-full max-w-lg bg-white rounded-lg border border-[#D9E2EF] shadow-lg overflow-hidden">
            <div className="px-6 py-4 bg-[#F5F7FB] border-b border-[#D9E2EF] flex items-center justify-between">
              <h3 className="text-base font-bold text-[#17243A]">
                Map New Subject to Department Curriculum
              </h3>
              <button type="button" onClick={() => setSubjectModalOpen(false)}>
                <X className="w-4 h-4 text-[#64748B]" />
              </button>
            </div>
            <form onSubmit={handleCreateSubject} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    Subject Code <span className="text-[#B42318]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={subCode}
                    onChange={(e) => setSubCode(e.target.value.toUpperCase())}
                    placeholder="BCS504"
                    className="w-full px-3 py-2 text-sm font-mono uppercase border border-[#D9E2EF] rounded-md"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    Subject Name <span className="text-[#B42318]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={subName}
                    onChange={(e) => setSubName(e.target.value)}
                    placeholder="Web Technology and Applications"
                    className="w-full px-3 py-2 text-sm border border-[#D9E2EF] rounded-md"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    Assigned Department <span className="text-[#B42318]">*</span>
                  </label>
                  <select
                    required
                    value={subDeptId}
                    onChange={(e) => setSubDeptId(e.target.value)}
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
                    Semester <span className="text-[#B42318]">*</span>
                  </label>
                  <select
                    value={subSemNumber}
                    onChange={(e) => setSubSemNumber(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm bg-white border border-[#D9E2EF] rounded-md"
                  >
                    {semesters.map((s) => (
                      <option key={s.id} value={s.number}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    Question Bank Structure
                  </label>
                  <input
                    type="text"
                    disabled
                    value="5 Modules (300 MCQs Required)"
                    className="w-full px-3 py-2 text-xs bg-[#F5F7FB] border border-[#D9E2EF] rounded-md text-[#64748B] font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    Academic Credits
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={6}
                    value={subCredits}
                    onChange={(e) => setSubCredits(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-[#D9E2EF] rounded-md"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1F2937] mb-1.5">
                  Applicable Department Sections
                </label>
                <div className="flex items-center gap-3">
                  {['Section A', 'Section B', 'Section C'].map((secLabel) => (
                    <label key={secLabel} className="flex items-center gap-1.5 text-xs text-[#1F2937]">
                      <input
                        type="checkbox"
                        checked={subSections.includes(secLabel)}
                        onChange={() => toggleSubSectionSelection(secLabel)}
                      />
                      <span>{secLabel}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-[#D9E2EF] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSubjectModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold border border-[#D9E2EF] rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] rounded-md"
                >
                  Map Subject to Department
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
