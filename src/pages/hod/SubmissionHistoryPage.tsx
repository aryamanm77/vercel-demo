import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, History, Lock, Search, X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { questionBankService } from '../../services/questionBankService';
import { SubmissionHistoryEntry, SubmissionStatus } from '../../types';
import { StatusBadge } from '../../components/StatusBadge';

export const SubmissionHistoryPage: React.FC = () => {
  const { user } = useAuth();
  const [entries, setEntries] = useState<SubmissionHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState<'ALL' | SubmissionStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<SubmissionHistoryEntry | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!user?.departmentId) return;
      setLoading(true);
      try {
        const res = await questionBankService.getSubmissionHistory(user.departmentId);
        if (mounted) setEntries(res.data);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [user?.departmentId]);

  const filteredEntries = entries.filter((item) => {
    if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      return (
        item.subjectCode.toLowerCase().includes(q) ||
        item.subjectName.toLowerCase().includes(q) ||
        item.referenceId.toLowerCase().includes(q) ||
        item.revision.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="text-xs font-semibold text-[#6D5CE8]">
            Department Audit & Version Ledger · {user?.departmentCode}
          </div>
          <h1 className="text-2xl font-bold text-[#17243A] mt-0.5">
            Question Bank & Student Roster Submission History
          </h1>
          <p className="text-sm text-[#64748B] mt-0.5">
            Inspect previous submission revisions, question counts, student roster states, and finalization timestamps. Finalized question banks are strictly read-only.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md bg-white border border-[#D9E2EF] text-xs font-semibold text-[#17243A] self-start">
          <Lock className="w-3.5 h-3.5 text-[#6D5CE8]" />
          <span>Finalized Revisions Locked</span>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-[#D9E2EF] p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F5F7FB] border border-[#D9E2EF] rounded-md">
          {(
            [
              'ALL',
              'Draft',
              'Validation Failed',
              'Submitted',
              'Finalized',
              'Correction Requested',
            ] as const
          ).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded transition-colors ${
                statusFilter === st
                  ? 'bg-white text-[#17243A] shadow-xs'
                  : 'text-[#64748B] hover:text-[#1F2937]'
              }`}
            >
              {st === 'ALL' ? 'All Statuses' : st}
            </button>
          ))}
        </div>

        <div className="relative w-full lg:w-80">
          <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search subject, revision, or reference ID..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-[#D9E2EF] rounded-md"
          />
        </div>
      </div>

      {/* Submission History Table */}
      <div className="bg-white rounded-lg border border-[#D9E2EF] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F5F7FB] border-b border-[#D9E2EF] text-xs font-semibold text-[#64748B]">
                <th className="py-3 px-5">Subject</th>
                <th className="py-3 px-4">Sem & Section</th>
                <th className="py-3 px-4">QB Revision</th>
                <th className="py-3 px-4 text-right">Questions</th>
                <th className="py-3 px-4">Student Roster Status</th>
                <th className="py-3 px-4">Submitted By</th>
                <th className="py-3 px-4">Submission Timestamp</th>
                <th className="py-3 px-4">Finalization Status</th>
                <th className="py-3 px-5 text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D9E2EF] text-[13px]">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-xs text-[#64748B]">
                    Loading submission history...
                  </td>
                </tr>
              ) : filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-xs text-[#64748B]">
                    No submission history entries match the current filter.
                  </td>
                </tr>
              ) : (
                filteredEntries.map((item) => (
                  <tr key={item.id} className="hover:bg-[#F5F7FB]/60">
                    <td className="py-3.5 px-5">
                      <div className="font-mono font-bold text-[#17243A]">{item.subjectCode}</div>
                      <div className="text-xs text-[#1F2937]">{item.subjectName}</div>
                      <div className="text-[11px] font-mono text-[#64748B]">
                        Ref: {item.referenceId}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-xs">
                      Sem {item.semesterNumber} · {item.section}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs font-semibold text-[#2563EB]">
                      {item.revision}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                      {item.questionCount} / 300
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={item.rosterStatus} />
                    </td>
                    <td className="py-3.5 px-4 text-xs text-[#1F2937]">
                      {item.submittedBy}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-[#64748B] whitespace-nowrap">
                      {item.submittedAt}
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedRecord(item)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-[#D9E2EF] bg-white text-xs font-medium text-[#1F2937] hover:bg-slate-100"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Details</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Read-Only Submission Record Inspector Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17243A]/60 p-4">
          <div className="w-full max-w-lg bg-white rounded-lg border border-[#D9E2EF] shadow-lg overflow-hidden">
            <div className="px-6 py-4 bg-[#17243A] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-blue-300" />
                <h3 className="text-base font-bold">
                  Submission Record – {selectedRecord.referenceId}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className="text-slate-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-md bg-[#F5F7FB] border border-[#D9E2EF]">
                <div>
                  <div className="text-[#64748B]">Subject</div>
                  <div className="font-bold text-[#17243A] mt-0.5">
                    {selectedRecord.subjectCode} – {selectedRecord.subjectName}
                  </div>
                </div>
                <div>
                  <div className="text-[#64748B]">Revision & Status</div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="font-mono font-bold">{selectedRecord.revision}</span>
                    <StatusBadge status={selectedRecord.status} />
                  </div>
                </div>
                <div>
                  <div className="text-[#64748B]">Question Count</div>
                  <div className="font-mono font-bold text-[#1F2937] mt-0.5">
                    {selectedRecord.questionCount} / 300 MCQs (5 Modules)
                  </div>
                </div>
                <div>
                  <div className="text-[#64748B]">Student Roster State</div>
                  <div className="mt-1">
                    <StatusBadge status={selectedRecord.rosterStatus} />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Submitted By:</span>
                  <span className="font-semibold text-[#1F2937]">{selectedRecord.submittedBy}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Submission Timestamp:</span>
                  <span className="font-mono text-[#1F2937]">{selectedRecord.submittedAt}</span>
                </div>
                {selectedRecord.declaredDifficulty && (
                  <div className="flex justify-between">
                    <span className="text-[#64748B]">Declared Bank Difficulty:</span>
                    <span className="font-semibold text-[#1F2937]">{selectedRecord.declaredDifficulty}</span>
                  </div>
                )}
              </div>

              {selectedRecord.notes && (
                <div className="p-3 rounded bg-slate-50 border border-[#D9E2EF] text-[#1F2937]">
                  <div className="font-semibold text-[#17243A] mb-0.5">Audit Note:</div>
                  <div>{selectedRecord.notes}</div>
                </div>
              )}
            </div>
            <div className="px-6 py-3.5 bg-[#F5F7FB] border-t border-[#D9E2EF] flex items-center justify-between">
              <Link
                to="/admin/hod/question-bank?view=review"
                className="text-xs font-semibold text-[#2563EB] hover:underline"
              >
                Open in Read-Only Question Bank Viewer
              </Link>
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className="px-4 py-2 text-xs font-semibold bg-white border border-[#D9E2EF] rounded-md"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
