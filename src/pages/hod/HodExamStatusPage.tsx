import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarClock, Lock, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { resultsService } from '../../services/resultsService';
import { ExaminationScheduleItem } from '../../types';
import { StatusBadge } from '../../components/StatusBadge';

export const HodExamStatusPage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [schedules, setSchedules] = useState<ExaminationScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [viewMode, setViewMode] = useState<'status' | 'sessions'>(
    searchParams.get('view') === 'sessions' ? 'sessions' : 'status'
  );

  useEffect(() => {
    setViewMode(searchParams.get('view') === 'sessions' ? 'sessions' : 'status');
  }, [searchParams]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!user?.departmentId) return;
      setLoading(true);
      try {
        const res = await resultsService.getDepartmentExamSchedules(user.departmentId);
        if (mounted) setSchedules(res.data);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [user?.departmentId]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="text-xs font-semibold text-[#2563EB]">
            Department Examination Tracking · {user?.departmentCode}
          </div>
          <h1 className="text-2xl font-bold text-[#17243A] mt-0.5">
            Examination Status & Session Information
          </h1>
          <p className="text-sm text-[#64748B] mt-0.5">
            Read-only visibility into scheduled examinations, COE preparation stages, and result release states for {user?.departmentName}.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-200/75 rounded-lg self-start">
          <button
            type="button"
            onClick={() => {
              setViewMode('status');
              setSearchParams({});
            }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors ${
              viewMode === 'status'
                ? 'bg-white text-[#17243A] shadow-xs'
                : 'text-[#64748B] hover:text-[#1F2937]'
            }`}
          >
            <CalendarClock className="w-3.5 h-3.5" />
            <span>Examination Status</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setViewMode('sessions');
              setSearchParams({ view: 'sessions' });
            }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors ${
              viewMode === 'sessions'
                ? 'bg-white text-[#17243A] shadow-xs'
                : 'text-[#64748B] hover:text-[#1F2937]'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Session & Package Boundary Info</span>
          </button>
        </div>
      </div>

      {/* Strict COE Governance Notice */}
      <div className="bg-white rounded-lg border border-[#D9E2EF] p-4 flex items-start gap-3 text-xs">
        <ShieldCheck className="w-5 h-5 text-[#6D5CE8] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-bold text-[#17243A]">
            COE Security & Role Separation Boundary
          </div>
          <p className="text-[#64748B] leading-relaxed">
            The Controller of Examinations (COE) exclusively controls examination scheduling, Stage-A/B paper selection (Papers 1–4 and Versions A–D), encrypted offline lab packages, and examination execution. HODs have read-only status visibility and cannot modify schedules, select papers, or inspect protected session packages.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="p-8 bg-white rounded-lg border border-[#D9E2EF] text-center text-xs text-[#64748B]">
          Loading department examination status...
        </div>
      ) : viewMode === 'status' ? (
        <div className="bg-white rounded-lg border border-[#D9E2EF] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#D9E2EF]">
            <h2 className="text-base font-bold text-[#17243A]">
              Scheduled Department Examinations ({user?.departmentCode})
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F5F7FB] border-b border-[#D9E2EF] text-xs font-semibold text-[#64748B]">
                  <th className="py-3 px-5">Examination Cycle & Subject</th>
                  <th className="py-3 px-4">Sem & Section</th>
                  <th className="py-3 px-4">Date & Session</th>
                  <th className="py-3 px-4">COE Preparation Status</th>
                  <th className="py-3 px-4">Exam Completion</th>
                  <th className="py-3 px-4">Result Processing</th>
                  <th className="py-3 px-5">Result Publication</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D9E2EF] text-[13px]">
                {schedules.map((item) => (
                  <tr key={item.id} className="hover:bg-[#F5F7FB]/60">
                    <td className="py-3.5 px-5">
                      <div className="text-[11px] text-[#64748B]">{item.examCycleName}</div>
                      <div className="font-bold text-[#17243A] mt-0.5">
                        <span className="font-mono text-[#2563EB]">{item.subjectCode}</span> – {item.subjectName}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-xs">
                      Sem {item.semesterNumber} · {item.section}
                    </td>
                    <td className="py-3.5 px-4 text-xs">
                      <div className="font-mono font-semibold text-[#1F2937]">{item.examDate}</div>
                      <div className="text-[11px] text-[#64748B]">{item.sessionTime}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={item.coePrepStatus} />
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={item.examCompletionStatus} />
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={item.resultProcessingStatus} />
                    </td>
                    <td className="py-3.5 px-5">
                      <StatusBadge status={item.resultPublicationStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {schedules.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-lg border border-[#D9E2EF] p-5 space-y-4 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#D9E2EF]">
                  <div>
                    <span className="font-mono text-xs font-bold text-[#2563EB]">
                      {item.subjectCode} · {item.section}
                    </span>
                    <h3 className="text-base font-bold text-[#17243A]">
                      {item.subjectName}
                    </h3>
                  </div>
                  <StatusBadge status={item.examCompletionStatus} />
                </div>

                <dl className="mt-3 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-[#64748B]">Scheduled Sitting:</dt>
                    <dd className="font-mono font-semibold text-[#1F2937]">
                      {item.examDate} · {item.sessionTime}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-[#64748B]">Locked Question Bank Revision:</dt>
                    <dd className="font-mono font-semibold text-[#6D5CE8]">
                      {item.questionBankRevision}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-[#64748B]">Frozen Eligible Roster Snapshot:</dt>
                    <dd className="font-mono text-[#1F2937]">
                      {item.frozenRosterCount} Students Frozen
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-[#64748B]">COE Paper & Package Stage:</dt>
                    <dd className="font-semibold text-[#1F2937]">{item.coePrepStatus}</dd>
                  </div>
                </dl>
              </div>

              <div className="p-3 rounded bg-[#F5F7FB] border border-[#D9E2EF] text-[11px] text-[#64748B] flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-[#6D5CE8] shrink-0" />
                <span>
                  Protected Session Package: Selected paper number, A–D shuffled question order, and cryptographic lab keys are isolated in the COE & Lab Server boundary.
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
