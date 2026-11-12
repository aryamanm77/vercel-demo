import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  KeyRound,
  Layers,
  Play,
  Sliders,
  Square,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { StatusBadge } from '../../components/StatusBadge';
import { qbankApi } from '../../services/qbankApi';
import type {
  ApprovalConfirmation,
  BlueprintResult,
  ExamType,
  IssuedStudentCredential,
  RosterStudentSummary,
  SessionOverview,
  SetSummaryCard,
  StudentRegistrationRequest,
  Subject,
  SubjectModule,
} from '../../types';
import { downloadBinaryFile, downloadCsvFile } from '../../utils/exportUtils';
import {
  buildRosterTemplateXlsx,
  computeAvailableQuestions,
  formatInstant,
  formatModuleShort,
  moduleUnitWeight,
  parseRosterSpreadsheetFile,
  toLocalDatetimeValue,
} from '../../utils/qbankHelpers';

type CoeTab = 'generate' | 'sessions' | 'roster';

export const CoeWorkspacePage: React.FC = () => {
  const [tab, setTab] = useState<CoeTab>('generate');
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Blueprint & Generation
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [examTitle, setExamTitle] = useState('');
  const [examType, setExamType] = useState<ExamType>('INTERNAL');
  const [examDate, setExamDate] = useState(new Date().toISOString().slice(0, 10));
  const [rotationOffset, setRotationOffset] = useState(0);
  const [modUnits, setModUnits] = useState<Record<number, string>>({
    1: '1',
    2: '2',
    3: '3',
    4: '',
    5: '',
  });
  const [modules, setModules] = useState<SubjectModule[]>([]);
  const [blueprint, setBlueprint] = useState<BlueprintResult | null>(null);
  const [blueprintError, setBlueprintError] = useState<string | null>(null);
  const [morningStart, setMorningStart] = useState(() => toLocalDatetimeValue(new Date()));
  const [morningEnd, setMorningEnd] = useState(() =>
    toLocalDatetimeValue(new Date(Date.now() + 3600000))
  );
  const [includeAfternoon, setIncludeAfternoon] = useState(false);
  const [afternoonStart, setAfternoonStart] = useState(() =>
    toLocalDatetimeValue(new Date(Date.now() + 7200000))
  );
  const [afternoonEnd, setAfternoonEnd] = useState(() =>
    toLocalDatetimeValue(new Date(Date.now() + 10800000))
  );

  // Sessions & Set selection
  const [sessions, setSessions] = useState<SessionOverview[]>([]);
  const [setModal, setSetModal] = useState<{
    session: SessionOverview;
    cards: SetSummaryCard[];
    readOnly: boolean;
  } | null>(null);
  const [approveModal, setApproveModal] = useState<{
    session: SessionOverview;
    meta: ApprovalConfirmation;
  } | null>(null);

  // Student Roster & Access Codes
  const [rosterSessionId, setRosterSessionId] = useState<string>('');
  const [roster, setRoster] = useState<RosterStudentSummary[]>([]);
  const [issuedCredentials, setIssuedCredentials] = useState<IssuedStudentCredential[]>([]);
  const [rollNumber, setRollNumber] = useState('');
  const [fullName, setFullName] = useState('');
  const [roomCode, setRoomCode] = useState('LH-101');
  const [rowNumber, setRowNumber] = useState('1');
  const [seatNumber, setSeatNumber] = useState('1');
  const [fontScale, setFontScale] = useState('1.0');
  const [highContrast, setHighContrast] = useState(false);
  const [extraMinutes, setExtraMinutes] = useState('0');
  const [pendingBatch, setPendingBatch] = useState<StudentRegistrationRequest[]>([]);
  const [batchWarnings, setBatchWarnings] = useState<string[]>([]);
  const [accomModal, setAccomModal] = useState<RosterStudentSummary | null>(null);
  const [accomScale, setAccomScale] = useState(1.0);
  const [accomHc, setAccomHc] = useState(false);
  const [accomExtra, setAccomExtra] = useState(0);

  const selectedModulesList = React.useMemo(() => {
    if (examType === 'SEE') return [1, 2, 3, 4, 5];
    return [1, 2, 3, 4, 5]
      .map((m) => Number(modUnits[m]))
      .filter((v) => v > 0);
  }, [examType, modUnits]);

  const loadSubjectsAndSessions = useCallback(async () => {
    try {
      const [subList, sessList] = await Promise.all([
        qbankApi.subjects.list(false),
        qbankApi.coe.listSessions(),
      ]);
      setSubjects(subList);
      setSessions(sessList);
      if (subList.length > 0 && !selectedSubjectId) {
        setSelectedSubjectId(String(subList[0].id));
      }
      if (sessList.length > 0 && !rosterSessionId) {
        setRosterSessionId(String(sessList[0].sessionId));
      }
    } catch (err) {
      setFlash({
        kind: 'err',
        msg: err instanceof Error ? err.message : 'Unable to load COE data',
      });
    }
  }, [rosterSessionId, selectedSubjectId]);

  const refreshBlueprint = useCallback(async () => {
    setBlueprint(null);
    setBlueprintError(null);
    if (!selectedSubjectId) {
      setModules([]);
      return;
    }
    try {
      const mods = await qbankApi.subjects.modules(Number(selectedSubjectId));
      setModules(mods);
      if (selectedModulesList.length === 0) {
        setBlueprintError('Select at least 1 module or half-module.');
        return;
      }
      const bp = await qbankApi.coe.blueprint({
        subjectId: Number(selectedSubjectId),
        examType,
        modules: selectedModulesList,
        rotationOffset,
      });
      setBlueprint(bp);
    } catch (err) {
      setBlueprintError(err instanceof Error ? err.message : 'Blueprint unavailable');
    }
  }, [examType, rotationOffset, selectedModulesList, selectedSubjectId]);

  const loadRoster = useCallback(async (sidStr: string) => {
    const sid = Number(sidStr);
    if (!sid) {
      setRoster([]);
      return;
    }
    try {
      setRoster(await qbankApi.coe.listRoster(sid));
    } catch (err) {
      setFlash({
        kind: 'err',
        msg: err instanceof Error ? err.message : 'Failed to load student roster',
      });
    }
  }, []);

  useEffect(() => {
    void loadSubjectsAndSessions();
  }, [loadSubjectsAndSessions]);

  useEffect(() => {
    void refreshBlueprint();
  }, [refreshBlueprint]);

  useEffect(() => {
    if (tab === 'roster' && rosterSessionId) {
      void loadRoster(rosterSessionId);
    }
  }, [tab, rosterSessionId, loadRoster]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubjectId || selectedModulesList.length === 0) {
      setFlash({ kind: 'err', msg: 'Select subject and at least one module.' });
      return;
    }
    setBusy(true);
    setFlash(null);
    try {
      await qbankApi.coe.generateExam({
        subjectId: Number(selectedSubjectId),
        title: examTitle.trim() || null,
        examType,
        modules: selectedModulesList,
        examDate,
        rotationOffset,
        includeAfternoon,
        morningStartAt: new Date(morningStart).toISOString(),
        morningEndAt: new Date(morningEnd).toISOString(),
        afternoonStartAt: includeAfternoon ? new Date(afternoonStart).toISOString() : null,
        afternoonEndAt: includeAfternoon ? new Date(afternoonEnd).toISOString() : null,
      });
      await loadSubjectsAndSessions();
      setFlash({ kind: 'ok', msg: '4 disjoint paper sets generated (zero-knowledge metadata only).' });
      setTab('sessions');
    } catch (err) {
      setFlash({ kind: 'err', msg: err instanceof Error ? err.message : 'Generation failed' });
    } finally {
      setBusy(false);
    }
  };

  const openSetCards = async (session: SessionOverview, readOnly: boolean) => {
    setBusy(true);
    try {
      const cards = await qbankApi.coe.listSetCards(session.sessionId);
      setSetModal({ session, cards, readOnly });
    } catch (err) {
      setFlash({ kind: 'err', msg: err instanceof Error ? err.message : 'Failed to load sets' });
    } finally {
      setBusy(false);
    }
  };

  const openApprovalPreview = async (session: SessionOverview, setNumber: number) => {
    setBusy(true);
    try {
      const meta = await qbankApi.coe.approvalPreview(session.sessionId, setNumber);
      setSetModal(null);
      setApproveModal({ session, meta });
    } catch (err) {
      setFlash({
        kind: 'err',
        msg: err instanceof Error ? err.message : 'Approval preview failed',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleApproveAndFreeze = async () => {
    if (!approveModal) return;
    setBusy(true);
    try {
      await qbankApi.coe.approveSession(approveModal.session.sessionId, {
        setNumber: approveModal.meta.setNumber,
        expectedVersion: approveModal.meta.version,
      });
      setApproveModal(null);
      await loadSubjectsAndSessions();
      setFlash({
        kind: 'ok',
        msg: `Set ${approveModal.meta.setNumber} FROZEN (Versions A-D sealed).`,
      });
    } catch (err) {
      setFlash({ kind: 'err', msg: err instanceof Error ? err.message : 'Approve failed' });
    } finally {
      setBusy(false);
    }
  };

  const handleSessionAction = async (
    session: SessionOverview,
    action: 'start' | 'stop' | 'afternoon'
  ) => {
    if (
      action === 'stop' &&
      !window.confirm(`Stop ${session.subjectCode} [${session.slot}]? Active exams will finalize.`)
    ) {
      return;
    }
    setBusy(true);
    try {
      if (action === 'start') await qbankApi.coe.startSession(session.sessionId);
      else if (action === 'stop') await qbankApi.coe.stopSession(session.sessionId);
      else
        await qbankApi.coe.addAfternoon(session.examId, {
          startAt: new Date(afternoonStart).toISOString(),
          endAt: new Date(afternoonEnd).toISOString(),
        });
      await loadSubjectsAndSessions();
      setFlash({ kind: 'ok', msg: `Session #${session.sessionId} ${action} completed.` });
    } catch (err) {
      setFlash({ kind: 'err', msg: err instanceof Error ? err.message : `Session ${action} failed` });
    } finally {
      setBusy(false);
    }
  };

  const handleRegisterSingleStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    const sid = Number(rosterSessionId);
    if (!sid) return;
    setBusy(true);
    try {
      const issued = await qbankApi.coe.registerStudents(sid, [
        {
          rollNumber: rollNumber.trim(),
          fullName: fullName.trim(),
          roomCode: roomCode.trim() || 'MAIN',
          rowNumber: rowNumber.trim() ? Number(rowNumber) : null,
          seatNumber: seatNumber.trim() ? Number(seatNumber) : null,
          fontScale: Number(fontScale) || 1.0,
          highContrast,
          accommodationExtraMinutes: Number(extraMinutes) || 0,
        },
      ]);
      setIssuedCredentials(issued);
      setRollNumber('');
      setFullName('');
      await loadRoster(rosterSessionId);
      setFlash({ kind: 'ok', msg: `Registered ${issued[0]?.rollNumber} and issued access code.` });
    } catch (err) {
      setFlash({
        kind: 'err',
        msg: err instanceof Error ? err.message : 'Student registration failed',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRosterFilePick = async (file: File) => {
    try {
      const parsed = await parseRosterSpreadsheetFile(file);
      setPendingBatch(parsed.students);
      setBatchWarnings(parsed.warnings);
      if (parsed.students.length === 0) {
        setFlash({
          kind: 'err',
          msg: parsed.warnings[0] || 'No valid students parsed from spreadsheet.',
        });
      }
    } catch (err) {
      setFlash({
        kind: 'err',
        msg: err instanceof Error ? err.message : 'Unable to read roster spreadsheet',
      });
    }
  };

  const handleConfirmBatchRoster = async () => {
    const sid = Number(rosterSessionId);
    if (!sid || pendingBatch.length === 0) return;
    setBusy(true);
    try {
      const issued = await qbankApi.coe.registerStudents(sid, pendingBatch);
      setIssuedCredentials(issued);
      setPendingBatch([]);
      setBatchWarnings([]);
      await loadRoster(rosterSessionId);
      setFlash({
        kind: 'ok',
        msg: `Registered ${issued.length} student(s) and generated one-time access codes.`,
      });
    } catch (err) {
      setFlash({
        kind: 'err',
        msg: err instanceof Error ? err.message : 'Bulk registration failed',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleReissueCode = async (roll: string) => {
    const sid = Number(rosterSessionId);
    if (!sid) return;
    setBusy(true);
    try {
      const cred = await qbankApi.coe.reissueCode(sid, roll);
      setIssuedCredentials([cred]);
      setFlash({
        kind: 'ok',
        msg: `Reissued access code for ${cred.rollNumber}: ${cred.oneTimeAccessCode}`,
      });
    } catch (err) {
      setFlash({
        kind: 'err',
        msg: err instanceof Error ? err.message : 'Unable to reissue access code',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSaveAccommodation = async (e: React.FormEvent) => {
    e.preventDefault();
    const sid = Number(rosterSessionId);
    if (!sid || !accomModal) return;
    setBusy(true);
    try {
      await qbankApi.coe.updateAccommodation(sid, accomModal.rollNumber, {
        fontScale: accomScale,
        highContrast: accomHc,
        accommodationExtraMinutes: accomExtra,
      });
      setAccomModal(null);
      await loadRoster(rosterSessionId);
      setFlash({ kind: 'ok', msg: `Updated accommodations for ${accomModal.rollNumber}.` });
    } catch (err) {
      setFlash({
        kind: 'err',
        msg: err instanceof Error ? err.message : 'Accommodation update failed',
      });
    } finally {
      setBusy(false);
    }
  };

  const byModNum: Record<number, SubjectModule> = {};
  modules.forEach((m) => {
    byModNum[m.moduleNumber] = m;
  });
  const totalHalfUnits = selectedModulesList.reduce((acc, u) => acc + moduleUnitWeight(u), 0);
  const multiplier = includeAfternoon ? 8 : 4;

  return (
    <div className="space-y-5">
      {flash && (
        <div
          className={`p-3 rounded-lg border text-xs font-medium ${
            flash.kind === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          {flash.msg}
        </div>
      )}

      <div className="flex flex-wrap gap-2 bg-white p-2 rounded-lg border border-slate-200">
        <button
          type="button"
          onClick={() => setTab('generate')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-semibold ${
            tab === 'generate' ? 'bg-[#0F172A] text-white' : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <Layers className="w-4 h-4" /> Paper Generation
        </button>
        <button
          type="button"
          onClick={() => setTab('sessions')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-semibold ${
            tab === 'sessions' ? 'bg-[#0F172A] text-white' : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" /> Exam Sessions ({sessions.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('roster')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-semibold ${
            tab === 'roster' ? 'bg-[#0F172A] text-white' : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <Users className="w-4 h-4" /> Student Roster &amp; Access Codes
        </button>
      </div>

      {tab === 'generate' && (
        <form onSubmit={handleGenerate} className="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
          <h2 className="text-base font-bold text-slate-900">COE Exam Blueprint &amp; 4-Set Generation</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Subject</label>
              <select
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
              >
                {subjects.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Exam Title</label>
              <input
                type="text"
                value={examTitle}
                onChange={(e) => setExamTitle(e.target.value)}
                placeholder="Optional title"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Exam Type</label>
              <select
                value={examType}
                onChange={(e) => setExamType(e.target.value as ExamType)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
              >
                <option value="INTERNAL">INTERNAL (30 marks)</option>
                <option value="SEE">SEE (50 marks, M1-M5)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Exam Date</label>
              <input
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Rotation</label>
              <select
                value={String(rotationOffset)}
                onChange={(e) => setRotationOffset(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
              >
                {[0, 1, 2, 3, 4].map((r) => (
                  <option key={r} value={String(r)}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="p-3 rounded-md bg-slate-50 border border-slate-200 flex flex-wrap items-center gap-3">
            <span className="text-xs font-bold text-slate-800">Modules:</span>
            {[1, 2, 3, 4, 5].map((m) => (
              <label key={m} className="inline-flex items-center gap-1.5 text-xs font-semibold">
                M{m}
                <select
                  disabled={examType === 'SEE'}
                  value={examType === 'SEE' ? String(m) : modUnits[m]}
                  onChange={(e) => setModUnits((prev) => ({ ...prev, [m]: e.target.value }))}
                  className="px-2 py-1 border border-slate-300 rounded bg-white text-xs"
                >
                  <option value="">Off</option>
                  <option value={String(m)}>Full (1.0)</option>
                  <option value={String(m * 10 + 1)}>1st Half (0.5)</option>
                  <option value={String(m * 10 + 2)}>2nd Half (0.5)</option>
                </select>
              </label>
            ))}
            <span className="ml-auto text-xs font-mono px-2 py-0.5 rounded bg-slate-200">
              {(totalHalfUnits / 2).toFixed(1)} module(s)
            </span>
          </div>

          <div className="p-3.5 rounded-md border border-slate-200 bg-white space-y-1 text-xs">
            {blueprint ? (
              <>
                <div className="font-bold text-slate-900">{blueprint.summaryText}</div>
                <div className="flex flex-wrap gap-3 pt-1">
                  {Object.entries(blueprint.moduleCounts || {}).map(([k, reqPerSet]) => {
                    const u = Number(k);
                    const reqTotal = reqPerSet * multiplier;
                    const { available, ready } = computeAvailableQuestions(u, byModNum);
                    const ok = ready && available >= reqTotal;
                    return (
                      <span
                        key={k}
                        className={`font-mono ${ok ? 'text-emerald-700' : 'text-red-700 font-semibold'}`}
                      >
                        {formatModuleShort(u)}: need {reqTotal} ({multiplier}×{reqPerSet}), have{' '}
                        {available} {ok ? 'OK' : 'SHORT'}
                      </span>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="text-slate-500">
                {blueprintError || 'Select a subject to preview module readiness.'}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Morning Start
              </label>
              <input
                type="datetime-local"
                value={morningStart}
                onChange={(e) => setMorningStart(e.target.value)}
                className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Morning End</label>
              <input
                type="datetime-local"
                value={morningEnd}
                onChange={(e) => setMorningEnd(e.target.value)}
                className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-md"
              />
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 pb-2">
              <input
                type="checkbox"
                checked={includeAfternoon}
                onChange={(e) => setIncludeAfternoon(e.target.checked)}
              />
              Add Afternoon Session
            </label>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Afternoon Start
              </label>
              <input
                type="datetime-local"
                disabled={!includeAfternoon}
                value={afternoonStart}
                onChange={(e) => setAfternoonStart(e.target.value)}
                className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-md disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Afternoon End
              </label>
              <input
                type="datetime-local"
                disabled={!includeAfternoon}
                value={afternoonEnd}
                onChange={(e) => setAfternoonEnd(e.target.value)}
                className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-md disabled:opacity-50"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={busy || !selectedSubjectId}
            className="py-2 px-5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-md disabled:opacity-50"
          >
            Generate 4 Disjoint Sets
          </button>
        </form>
      )}

      {tab === 'sessions' && (
        <div className="space-y-3">
          {sessions.length === 0 ? (
            <div className="bg-white rounded-lg border border-slate-200 p-6 text-sm text-slate-500">
              No exam sessions generated yet.
            </div>
          ) : (
            sessions.map((s) => (
              <div
                key={s.sessionId}
                className="bg-white rounded-lg border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">
                      {s.subjectCode} — {s.title} [{s.slot}]
                    </span>
                    <StatusBadge status={s.status} />
                  </div>
                  <p className="text-xs text-slate-600">
                    Session #{s.sessionId} · {s.examType} · {s.examDate} ·{' '}
                    {s.chosenSetNumber ? `Set ${s.chosenSetNumber} (FROZEN)` : 'Pending Set'} ·{' '}
                    {formatInstant(s.scheduledStartAt)} → {formatInstant(s.scheduledEndAt)}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void openSetCards(s, s.status !== 'DRAFT')}
                    className="px-3 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold"
                  >
                    {s.status === 'DRAFT' ? 'Select & Approve Set' : 'View Sets'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRosterSessionId(String(s.sessionId));
                      setTab('roster');
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold"
                  >
                    <Users className="w-3.5 h-3.5" /> Student Roster
                  </button>
                  {s.status === 'FROZEN' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleSessionAction(s, 'start')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold"
                    >
                      <Play className="w-3.5 h-3.5" /> Start Exam
                    </button>
                  )}
                  {(s.status === 'LIVE' || s.status === 'FROZEN') && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleSessionAction(s, 'stop')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-red-700 hover:bg-red-800 text-white text-xs font-semibold"
                    >
                      <Square className="w-3.5 h-3.5" /> Stop
                    </button>
                  )}
                  {s.slot === 'MORNING' &&
                    !s.hasAfternoon &&
                    (s.status === 'DRAFT' || s.status === 'FROZEN') && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleSessionAction(s, 'afternoon')}
                        className="px-3 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold"
                      >
                        + Afternoon
                      </button>
                    )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'roster' && (
        <div className="space-y-5">
          <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-[280px] flex-1">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Exam Session for Student Roster &amp; Access Codes
                </label>
                <select
                  value={rosterSessionId}
                  onChange={(e) => setRosterSessionId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
                >
                  {sessions.map((s) => (
                    <option key={s.sessionId} value={String(s.sessionId)}>
                      #{s.sessionId} · {s.subjectCode} — {s.title} [{s.slot}] ({s.status})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    downloadBinaryFile(
                      'qbank-student-roster-template.xlsx',
                      buildRosterTemplateXlsx(),
                      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold"
                >
                  <Download className="w-3.5 h-3.5" /> Roster Template (.xlsx)
                </button>
                <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer">
                  <Upload className="w-3.5 h-3.5" /> Bulk Import (.xlsx / .csv)
                  <input
                    type="file"
                    accept=".xlsx,.csv"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleRosterFilePick(f);
                    }}
                  />
                </label>
              </div>
            </div>

            {pendingBatch.length > 0 && (
              <div className="p-4 rounded-md bg-blue-50 border border-blue-200 space-y-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-blue-950">
                    Ready to register {pendingBatch.length} student(s) into Session #{rosterSessionId}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPendingBatch([]);
                        setBatchWarnings([]);
                      }}
                      className="px-3 py-1 rounded border border-slate-300 bg-white font-semibold"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleConfirmBatchRoster()}
                      className="px-3 py-1 rounded bg-blue-700 hover:bg-blue-800 text-white font-semibold"
                    >
                      Register &amp; Issue Access Codes
                    </button>
                  </div>
                </div>
                {batchWarnings.length > 0 && (
                  <div className="text-amber-800">{batchWarnings.join(' · ')}</div>
                )}
              </div>
            )}

            <form
              onSubmit={handleRegisterSingleStudent}
              className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 items-end pt-2 border-t border-slate-100"
            >
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Roll No / USN *
                </label>
                <input
                  type="text"
                  required
                  value={rollNumber}
                  onChange={(e) => setRollNumber(e.target.value)}
                  placeholder="1JT23CS001"
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Student Name"
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Room</label>
                <input
                  type="text"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Row / Seat
                </label>
                <div className="flex gap-1">
                  <input
                    type="number"
                    min={1}
                    value={rowNumber}
                    onChange={(e) => setRowNumber(e.target.value)}
                    placeholder="Row"
                    className="w-1/2 px-2 py-1.5 text-xs border border-slate-300 rounded"
                  />
                  <input
                    type="number"
                    min={1}
                    value={seatNumber}
                    onChange={(e) => setSeatNumber(e.target.value)}
                    placeholder="Seat"
                    className="w-1/2 px-2 py-1.5 text-xs border border-slate-300 rounded"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Scale / Extra Min
                </label>
                <div className="flex gap-1">
                  <input
                    type="number"
                    step={0.1}
                    min={0.8}
                    max={1.8}
                    value={fontScale}
                    onChange={(e) => setFontScale(e.target.value)}
                    className="w-1/2 px-2 py-1.5 text-xs border border-slate-300 rounded"
                  />
                  <input
                    type="number"
                    min={0}
                    value={extraMinutes}
                    onChange={(e) => setExtraMinutes(e.target.value)}
                    className="w-1/2 px-2 py-1.5 text-xs border border-slate-300 rounded"
                  />
                </div>
              </div>
              <label className="flex items-center gap-1.5 text-[11px] font-semibold pb-2">
                <input
                  type="checkbox"
                  checked={highContrast}
                  onChange={(e) => setHighContrast(e.target.checked)}
                />
                High Contrast
              </label>
              <button
                type="submit"
                disabled={busy || !rosterSessionId}
                className="inline-flex items-center justify-center gap-1 py-1.5 px-3 bg-[#0F172A] hover:bg-slate-800 text-white text-xs font-semibold rounded"
              >
                <UserPlus className="w-3.5 h-3.5" /> Add Student
              </button>
            </form>
          </div>

          {issuedCredentials.length > 0 && (
            <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold text-emerald-950">
                  Issued One-Time Student Access Codes (save or print now — shown only at issuance)
                </div>
                <button
                  type="button"
                  onClick={() =>
                    downloadCsvFile(
                      `qbank-session-${rosterSessionId}-access-codes.csv`,
                      ['Roll Number', 'Full Name', 'Room', 'Row', 'Seat', 'Version', 'Access Code'],
                      issuedCredentials.map((c) => [
                        c.rollNumber,
                        c.fullName,
                        c.roomCode,
                        c.rowNumber ?? '',
                        c.seatNumber ?? '',
                        c.assignedVersion,
                        c.oneTimeAccessCode,
                      ])
                    )
                  }
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" /> Export Access Codes CSV
                </button>
              </div>
              <div className="overflow-x-auto bg-white rounded border border-emerald-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-emerald-100/60 border-b border-emerald-200">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Roll Number</th>
                      <th className="px-3 py-2 font-semibold">Full Name</th>
                      <th className="px-3 py-2 font-semibold">Room / Seat</th>
                      <th className="px-3 py-2 font-semibold">Version</th>
                      <th className="px-3 py-2 font-semibold">One-Time Access Code</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-emerald-100">
                    {issuedCredentials.map((c) => (
                      <tr key={c.rollNumber}>
                        <td className="px-3 py-2 font-mono font-semibold">{c.rollNumber}</td>
                        <td className="px-3 py-2">{c.fullName}</td>
                        <td className="px-3 py-2">
                          {c.roomCode} {c.rowNumber ? `R${c.rowNumber}` : ''}{' '}
                          {c.seatNumber ? `S${c.seatNumber}` : ''}
                        </td>
                        <td className="px-3 py-2 font-mono">{c.assignedVersion}</td>
                        <td className="px-3 py-2 font-mono font-bold text-emerald-900">
                          {c.oneTimeAccessCode}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                Session #{rosterSessionId || '-'} Registered Roster ({roster.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Roll Number</th>
                    <th className="px-4 py-2.5 font-semibold">Full Name</th>
                    <th className="px-4 py-2.5 font-semibold">Room / Seat</th>
                    <th className="px-4 py-2.5 font-semibold">Version</th>
                    <th className="px-4 py-2.5 font-semibold">Login State</th>
                    <th className="px-4 py-2.5 font-semibold">Accommodations</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {roster.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                        No students registered for this session yet.
                      </td>
                    </tr>
                  ) : (
                    roster.map((st) => (
                      <tr key={st.rollNumber} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-mono font-semibold">{st.rollNumber}</td>
                        <td className="px-4 py-2.5">{st.fullName}</td>
                        <td className="px-4 py-2.5">
                          {st.roomCode} {st.rowNumber ? `R${st.rowNumber}` : ''}{' '}
                          {st.seatNumber ? `S${st.seatNumber}` : ''}
                        </td>
                        <td className="px-4 py-2.5 font-mono">{st.assignedVersion}</td>
                        <td className="px-4 py-2.5">
                          <StatusBadge status={st.loginState} />
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {st.fontScale}× · {st.highContrast ? 'HC · ' : ''}+
                          {st.accommodationExtraMinutes + st.grantedExtraMinutes}m
                        </td>
                        <td className="px-4 py-2.5 text-right space-x-1.5 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              setAccomModal(st);
                              setAccomScale(st.fontScale || 1.0);
                              setAccomHc(Boolean(st.highContrast));
                              setAccomExtra(st.accommodationExtraMinutes || 0);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 font-semibold"
                          >
                            <Sliders className="w-3 h-3" /> Accom
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleReissueCode(st.rollNumber)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 font-semibold"
                          >
                            <KeyRound className="w-3 h-3" /> Reissue Code
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {setModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-2xl rounded-lg bg-white border border-slate-200 shadow-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">
                {setModal.readOnly ? 'Paper Sets' : 'Select & Approve Set'} —{' '}
                {setModal.session.subjectCode} [{setModal.session.slot}]
              </h3>
              <button
                type="button"
                onClick={() => setSetModal(null)}
                className="p-1 text-slate-500 hover:text-slate-900 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {setModal.cards.map((c) => (
                <div key={c.setNumber} className="p-3 rounded-lg border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <strong className="text-sm">Set {c.setNumber}</strong>
                    <StatusBadge status={c.status} />
                  </div>
                  <div className="text-xs text-slate-600">{c.questionCount} questions</div>
                  {!setModal.readOnly && c.status === 'GENERATED' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void openApprovalPreview(setModal.session, c.setNumber)}
                      className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded"
                    >
                      Approve
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {approveModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-lg bg-white border border-slate-200 shadow-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">
                Approve &amp; Freeze Set {approveModal.meta.setNumber}
              </h3>
            </div>
            <div className="p-5 space-y-3 text-xs text-slate-700">
              <p className="font-semibold text-slate-900">
                {approveModal.meta.subjectCode} — {approveModal.meta.examTitle} [
                {approveModal.meta.slot}]
              </p>
              <p>
                Set {approveModal.meta.setNumber} · {approveModal.meta.questionCount} questions ·{' '}
                {approveModal.meta.totalMarks} marks
              </p>
              <div className="p-3 rounded bg-amber-50 border border-amber-200 text-amber-900">
                Freezing seals Candidate Versions A–D and archives Sets{' '}
                {[1, 2, 3, 4].filter((n) => n !== approveModal.meta.setNumber).join(', ')}.
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setApproveModal(null)}
                  className="px-3.5 py-2 border border-slate-300 rounded-md font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleApproveAndFreeze()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold"
                >
                  Confirm Approve &amp; Freeze
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {accomModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-lg bg-white border border-slate-200 shadow-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">
                Accommodations — {accomModal.rollNumber}
              </h3>
              <button
                type="button"
                onClick={() => setAccomModal(null)}
                className="p-1 text-slate-500 hover:text-slate-900 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveAccommodation} className="p-5 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Font Scale</label>
                <input
                  type="number"
                  step={0.1}
                  min={0.85}
                  max={1.8}
                  value={accomScale}
                  onChange={(e) => setAccomScale(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Extra Minutes Accommodation
                </label>
                <input
                  type="number"
                  min={0}
                  value={accomExtra}
                  onChange={(e) => setAccomExtra(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                />
              </div>
              <label className="flex items-center gap-2 font-semibold text-slate-800">
                <input
                  type="checkbox"
                  checked={accomHc}
                  onChange={(e) => setAccomHc(e.target.checked)}
                />
                Default to High Contrast Mode
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAccomModal(null)}
                  className="px-3.5 py-2 border border-slate-300 rounded-md font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md font-semibold"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
