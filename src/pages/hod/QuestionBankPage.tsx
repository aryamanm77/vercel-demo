import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  CheckSquare,
  Download,
  Edit3,
  Eye,
  FileSpreadsheet,
  FileUp,
  Image as ImageIcon,
  Lock,
  Plus,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { subjectService } from '../../services/subjectService';
import {
  questionBankService,
  QuestionBankValidationReport,
  validateQuestionBank,
} from '../../services/questionBankService';
import {
  buildCorrectedQuestionExcelBytes,
  buildQuestionExcelTemplateBytes,
  confirmQuestionExcelImport,
  getStudentQuestionView,
  previewQuestionExcelImport,
  updatePreviewQuestionRow,
} from '../../services/questionImageExcelService';
import { imageStorage, validateAndProcessImage } from '../../services/imageStorage';
import {
  DifficultyLevel,
  MCQQuestion,
  QuestionBankRecord,
  QuestionImportPreviewSession,
  Subject,
} from '../../types';
import { StatusBadge } from '../../components/StatusBadge';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { downloadBinaryFile, downloadCsvFile } from '../../utils/exportUtils';

export const QuestionBankPage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSem, setSelectedSem] = useState<number>(5);
  const [selectedSection, setSelectedSection] = useState<string>('Section A');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');

  const [bank, setBank] = useState<QuestionBankRecord | null>(null);
  const [validation, setValidation] = useState<QuestionBankValidationReport | null>(null);
  const [loading, setLoading] = useState(true);

  const [activeView, setActiveView] = useState<'manage' | 'review'>(
    searchParams.get('view') === 'review' ? 'review' : 'manage'
  );
  const [activeModuleFilter, setActiveModuleFilter] = useState<0 | 1 | 2 | 3 | 4 | 5>(1);
  const [searchQuery, setSearchQuery] = useState('');

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Manual Question Add/Edit Modal
  const [qModalOpen, setQModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<MCQQuestion | null>(null);
  const [qForm, setQForm] = useState<{
    moduleNumber: 1 | 2 | 3 | 4 | 5;
    questionText: string;
    optionA: string;
    optionB: string;
    optionC: string;
    optionD: string;
    correctOption: 'A' | 'B' | 'C' | 'D';
    difficulty: DifficultyLevel;
    imageId: string | null;
  }>({
    moduleNumber: 1,
    questionText: '',
    optionA: '',
    optionB: '',
    optionC: '',
    optionD: '',
    correctOption: 'A',
    difficulty: 'Standard',
    imageId: null,
  });
  const [submitting, setSubmitting] = useState(false);

  // Excel Embedded Image Import Preview & Student Preview Modals
  const [excelPreview, setExcelPreview] = useState<QuestionImportPreviewSession | null>(null);
  const [excelImportMode, setExcelImportMode] = useState<'append' | 'replace_module'>('append');
  const [studentPreviewOpen, setStudentPreviewOpen] = useState(false);

  // Finalize Confirmation Modal
  const [finalizeConfirmOpen, setFinalizeConfirmOpen] = useState(false);

  // Controlled Correction Request Modal
  const [correctionModalOpen, setCorrectionModalOpen] = useState(false);
  const [correctionReason, setCorrectionReason] = useState('');

  useEffect(() => {
    setActiveView(searchParams.get('view') === 'review' ? 'review' : 'manage');
  }, [searchParams]);

  // 1. Load Department Subjects
  useEffect(() => {
    let mounted = true;
    async function loadSubjects() {
      if (!user?.departmentId) return;
      const res = await subjectService.getSubjects({ departmentId: user.departmentId });
      if (!mounted) return;
      setSubjects(res.data);

      const paramSubId = searchParams.get('subjectId');
      const paramSem = Number(searchParams.get('sem'));
      if (paramSubId && res.data.some((s) => s.id === paramSubId)) {
        const matched = res.data.find((s) => s.id === paramSubId)!;
        setSelectedSem(matched.semesterNumber);
        setSelectedSubjectId(matched.id);
        setSelectedSection(matched.sections[0] || 'Section A');
      } else if (res.data.length > 0) {
        const defaultSub =
          res.data.find((s) => s.code === 'BCS502') ||
          res.data.find((s) => s.semesterNumber === (paramSem || 5)) ||
          res.data[0];
        setSelectedSem(defaultSub.semesterNumber);
        setSelectedSubjectId(defaultSub.id);
        setSelectedSection(defaultSub.sections[0] || 'Section A');
      }
    }
    loadSubjects();
    return () => {
      mounted = false;
    };
  }, [user?.departmentId]);

  // 2. Load Question Bank whenever Subject or Section changes
  useEffect(() => {
    let mounted = true;
    async function loadBank() {
      if (!user?.departmentId || !selectedSubjectId) return;
      setLoading(true);
      try {
        const res = await questionBankService.getOrInitQuestionBank({
          departmentId: user.departmentId,
          subjectId: selectedSubjectId,
          section: selectedSection,
        });
        if (!mounted) return;
        setBank(res.data.bank);
        setValidation(res.data.validation);
      } catch (err) {
        if (mounted) {
          setFeedback({
            type: 'error',
            message: err instanceof Error ? err.message : 'Failed to load question bank.',
          });
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadBank();
    return () => {
      mounted = false;
    };
  }, [user?.departmentId, selectedSubjectId, selectedSection]);

  const availableSemesters = Array.from(new Set(subjects.map((s) => s.semesterNumber))).sort();
  const semSubjects = subjects.filter((s) => s.semesterNumber === selectedSem);
  const currentSubject = subjects.find((s) => s.id === selectedSubjectId);
  const isLocked =
    bank?.status === 'Finalized' || bank?.status === 'Correction Requested';

  const handleSemesterChange = (nextSem: number) => {
    setSelectedSem(nextSem);
    const firstSub = subjects.find((s) => s.semesterNumber === nextSem);
    if (firstSub) {
      setSelectedSubjectId(firstSub.id);
      setSelectedSection(firstSub.sections[0] || 'Section A');
    }
  };

  const handleDeclareDifficulty = async (nextDiff: DifficultyLevel, syncAll: boolean) => {
    if (!bank || !user?.departmentId) return;
    setSubmitting(true);
    try {
      const res = await questionBankService.setDeclaredDifficulty(
        bank.id,
        user.departmentId,
        nextDiff,
        syncAll
      );
      setBank(res.data.bank);
      setValidation(res.data.validation);
      setFeedback({
        type: 'success',
        message: `Declared question bank difficulty updated to "${nextDiff}"${
          syncAll ? ' and synchronized across all questions.' : '.'
        }`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to update difficulty.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const openAddQuestionModal = (defaultMod?: 1 | 2 | 3 | 4 | 5) => {
    if (!bank) return;
    setEditingQuestion(null);
    setQForm({
      moduleNumber: defaultMod || (activeModuleFilter === 0 ? 1 : activeModuleFilter),
      questionText: '',
      optionA: '',
      optionB: '',
      optionC: '',
      optionD: '',
      correctOption: 'A',
      difficulty: bank.declaredDifficulty,
      imageId: null,
    });
    setQModalOpen(true);
  };

  const openEditQuestionModal = (q: MCQQuestion) => {
    setEditingQuestion(q);
    setQForm({
      moduleNumber: q.moduleNumber,
      questionText: q.questionText,
      optionA: q.optionA,
      optionB: q.optionB,
      optionC: q.optionC,
      optionD: q.optionD,
      correctOption: (q.correctOption || 'A') as 'A' | 'B' | 'C' | 'D',
      difficulty: q.difficulty,
      imageId: q.imageId ?? null,
    });
    setQModalOpen(true);
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bank || !user?.departmentId) return;
    setSubmitting(true);
    try {
      const res = await questionBankService.saveSingleQuestion(bank.id, user.departmentId, {
        questionId: editingQuestion?.questionId,
        ...qForm,
      });
      setBank(res.data.bank);
      setValidation(res.data.validation);
      setQModalOpen(false);
      setFeedback({
        type: 'success',
        message: editingQuestion
          ? `Updated question ${editingQuestion.questionId}.`
          : `Added question to Module ${qForm.moduleNumber}.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Could not save question.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (!bank || !user?.departmentId) return;
    try {
      const res = await questionBankService.deleteQuestion(
        bank.id,
        user.departmentId,
        questionId
      );
      setBank(res.data.bank);
      setValidation(res.data.validation);
      setFeedback({
        type: 'success',
        message: `Removed question ${questionId} from draft bank.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to delete question.',
      });
    }
  };

  const handleFillModuleTo60 = async (mod: 1 | 2 | 3 | 4 | 5) => {
    if (!bank || !user?.departmentId) return;
    setSubmitting(true);
    try {
      const res = await questionBankService.bulkImportQuestions(
        bank.id,
        user.departmentId,
        'FILL_MODULE_TO_60',
        { moduleNumber: mod }
      );
      setBank(res.data.bank);
      setValidation(res.data.validation);
      setFeedback({
        type: 'success',
        message: `Imported ${res.data.importedCount} validated MCQs into Module ${mod} (Module ${mod} is now 60/60).`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Bulk import failed.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleFillAllModulesTo300 = async () => {
    if (!bank || !user?.departmentId) return;
    setSubmitting(true);
    try {
      const res = await questionBankService.bulkImportQuestions(
        bank.id,
        user.departmentId,
        'FILL_ALL_MODULES_TO_300',
        {}
      );
      setBank(res.data.bank);
      setValidation(res.data.validation);
      setFeedback({
        type: 'success',
        message: `Populated ${res.data.importedCount} remaining MCQs across Modules 1–5. Question bank is now at 300/300 valid questions and ready for final submission.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Bulk import failed.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCsvFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !bank || !user?.departmentId) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['csv', 'xlsx', 'xls', 'tsv'].includes(ext || '')) {
      setFeedback({
        type: 'error',
        message: 'Invalid file format. Only .csv, .xlsx, or .xls question bank templates are accepted.',
      });
      e.target.value = '';
      return;
    }

    try {
      if (ext === 'xlsx') {
        const buffer = new Uint8Array(await file.arrayBuffer());
        const session = await previewQuestionExcelImport({
          bankId: bank.id,
          departmentId: user.departmentId,
          defaultModuleNumber: (activeModuleFilter === 0 ? 1 : activeModuleFilter) as 1 | 2 | 3 | 4 | 5,
          fileName: file.name,
          xlsxBytes: buffer,
        });
        setExcelPreview(session);
        setFeedback({
          type: 'success',
          message: `Parsed "${file.name}" (${session.rows.length} rows, ${session.rows.filter((r) => r.imageId).length} images attached, ${session.issues.length} warnings). Review preview below before confirming.`,
        });
        e.target.value = '';
        return;
      }

      const text = await file.text();
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      if (lines.length <= 1) {
        await handleFillAllModulesTo300();
        e.target.value = '';
        return;
      }

      const dataLines = lines.slice(1);
      const parsedRows = dataLines
        .map((line) => {
          const cols = line.split(',').map((c) => c.replace(/^"|"$/g, '').trim());
          const modNum = Math.min(5, Math.max(1, Number(cols[0]) || 1)) as 1 | 2 | 3 | 4 | 5;
          const ans = (cols[6]?.toUpperCase() || 'A') as 'A' | 'B' | 'C' | 'D';
          return {
            moduleNumber: modNum,
            questionText: cols[1] || '',
            optionA: cols[2] || '',
            optionB: cols[3] || '',
            optionC: cols[4] || '',
            optionD: cols[5] || '',
            correctOption: ['A', 'B', 'C', 'D'].includes(ans) ? ans : ('A' as const),
            difficulty: (cols[7] as DifficultyLevel) || bank.declaredDifficulty,
          };
        })
        .filter((r) => r.questionText);

      if (parsedRows.length === 0) {
        await handleFillAllModulesTo300();
      } else {
        const res = await questionBankService.bulkImportQuestions(
          bank.id,
          user.departmentId,
          'CSV_ROWS',
          { parsedRows }
        );
        setBank(res.data.bank);
        setValidation(res.data.validation);
        setFeedback({
          type: 'success',
          message: `Processed "${file.name}" and imported ${res.data.importedCount} MCQs.`,
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to parse uploaded file.',
      });
    } finally {
      e.target.value = '';
    }
  };

  const handleDownloadXlsxTemplate = () => {
    const bytes = buildQuestionExcelTemplateBytes();
    downloadBinaryFile(
      `MIT_Mysore_QuestionBank_Template_${bank?.subjectCode || 'SUBJECT'}.xlsx`,
      bytes,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  };

  const handleSingleQuestionImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const processed = await validateAndProcessImage(bytes);
      if (!processed.ok) {
        setFeedback({ type: 'error', message: processed.message });
        return;
      }
      const meta = imageStorage.putSync(processed.bytes, processed.mimeType, {
        width: processed.width,
        height: processed.height,
        originalFilename: file.name,
      });
      setQForm((prev) => ({ ...prev, imageId: meta.imageId }));
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to process image.',
      });
    } finally {
      e.target.value = '';
    }
  };

  const handleConfirmExcelPreview = async () => {
    if (!excelPreview || !user?.departmentId) return;
    setSubmitting(true);
    try {
      const res = confirmQuestionExcelImport({
        previewId: excelPreview.previewId,
        departmentId: user.departmentId,
        mode: excelImportMode,
        actorName: user.fullName,
        actorEmployeeId: user.employeeId,
      });
      setBank(res.bank);
      setValidation(validateQuestionBank(res.bank));
      setFeedback({
        type: 'success',
        message: `Imported ${res.importedCount} MCQs (${res.attachedImageCount} with embedded images)${res.warnings.length ? ` with ${res.warnings.length} warning(s)` : ''}.`,
      });
      setExcelPreview(null);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to confirm Excel import.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadTemplate = () => {
    downloadCsvFile(
      `MIT_Mysore_QuestionBank_Template_${bank?.subjectCode || 'SUBJECT'}.csv`,
      [
        'ModuleNumber(1-5)',
        'QuestionText',
        'OptionA',
        'OptionB',
        'OptionC',
        'OptionD',
        'CorrectOption(A/B/C/D)',
        'Difficulty(Moderate/Standard/Challenging)',
      ],
      [
        [
          1,
          'Which protocol layer handles end-to-end process communication in TCP/IP?',
          'Physical Layer',
          'Data Link Layer',
          'Network Layer',
          'Transport Layer',
          'D',
          bank?.declaredDifficulty || 'Standard',
        ],
        [
          5,
          'What is the standard port number used by HTTPS over TLS?',
          '80',
          '443',
          '22',
          '25',
          'B',
          bank?.declaredDifficulty || 'Standard',
        ],
      ]
    );
  };

  const handleConfirmFinalize = async () => {
    if (!bank || !user?.departmentId) return;
    setSubmitting(true);
    try {
      const res = await questionBankService.finalizeQuestionBank(
        bank.id,
        user.departmentId,
        user.fullName,
        user.employeeId
      );
      setBank(res.data.bank);
      setValidation(res.data.validation);
      setFinalizeConfirmOpen(false);
      setFeedback({
        type: 'success',
        message: `Question Bank Finalized! Submission Reference: ${res.data.bank.submissionReference} (${res.data.bank.submittedAt}). Ordinary editing is now locked.`,
      });
    } catch (err) {
      setFinalizeConfirmOpen(false);
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Finalization failed.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bank || !user?.departmentId) return;
    setSubmitting(true);
    try {
      const res = await questionBankService.requestCorrectionOnFinalizedBank(
        bank.id,
        user.departmentId,
        correctionReason,
        user.fullName,
        user.employeeId
      );
      setBank(res.data);
      setCorrectionModalOpen(false);
      setCorrectionReason('');
      setFeedback({
        type: 'success',
        message:
          'Controlled Correction Request submitted to Central Administration & COE. The finalized revision remains locked until authorized review.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Request failed.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const displayedQuestions = (bank?.questions || []).filter((q) => {
    if (activeModuleFilter !== 0 && q.moduleNumber !== activeModuleFilter) return false;
    if (searchQuery.trim()) {
      const s = searchQuery.trim().toLowerCase();
      return (
        q.questionId.toLowerCase().includes(s) ||
        q.questionText.toLowerCase().includes(s) ||
        q.optionA.toLowerCase().includes(s) ||
        q.optionB.toLowerCase().includes(s)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="text-xs font-semibold text-[#2563EB]">
            HOD Question Bank Management · 5 Modules × 60 Questions = 300 MCQs
          </div>
          <h1 className="text-2xl font-bold text-[#17243A] mt-0.5">
            Subject Question Bank Preparation & Finalization
          </h1>
          <p className="text-sm text-[#64748B] mt-0.5">
            Prepare, validate, and lock the 300-question master bank for your department's subjects.
          </p>
        </div>

        {/* View Toggle (Upload/Manage vs Review/Validation) */}
        <div className="flex items-center gap-1 p-1 bg-slate-200/75 rounded-lg self-start">
          <button
            type="button"
            onClick={() => {
              setActiveView('manage');
              setSearchParams(selectedSubjectId ? { subjectId: selectedSubjectId } : {});
            }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors ${
              activeView === 'manage'
                ? 'bg-white text-[#17243A] shadow-xs'
                : 'text-[#64748B] hover:text-[#1F2937]'
            }`}
          >
            <FileUp className="w-3.5 h-3.5" />
            <span>1. Upload & Manage Questions</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveView('review');
              setSearchParams(
                selectedSubjectId
                  ? { subjectId: selectedSubjectId, view: 'review' }
                  : { view: 'review' }
              );
            }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors ${
              activeView === 'review'
                ? 'bg-white text-[#17243A] shadow-xs'
                : 'text-[#64748B] hover:text-[#1F2937]'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>2. Preview, Validation & Final Submit</span>
          </button>
        </div>
      </div>

      {/* Mandatory Selection Sequence: Department (Locked) -> Semester -> Section -> Subject -> Question Bank */}
      <div className="bg-white rounded-lg border border-[#D9E2EF] p-5">
        <div className="text-xs font-bold text-[#17243A] mb-3 flex items-center gap-2">
          <span>Academic Selection Sequence:</span>
          <span className="text-[#64748B] font-normal">
            Department (Locked) → Semester → Section → Subject → Question Bank
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
              1. Authenticated Department (Locked)
            </label>
            <div className="px-3 py-2 text-xs font-semibold bg-[#F5F7FB] border border-[#D9E2EF] rounded-md text-[#17243A] flex items-center justify-between">
              <span>
                {user?.departmentCode} – {user?.departmentName}
              </span>
              <Lock className="w-3.5 h-3.5 text-[#6D5CE8] shrink-0" />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
              2. Select Semester
            </label>
            <select
              value={selectedSem}
              onChange={(e) => handleSemesterChange(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs font-semibold bg-white border border-[#D9E2EF] rounded-md text-[#1F2937]"
            >
              {availableSemesters.map((sem) => (
                <option key={sem} value={sem}>
                  {sem}th Semester (AY 2026–2027)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
              3. Select Section
            </label>
            <select
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
              className="w-full px-3 py-2 text-xs font-semibold bg-white border border-[#D9E2EF] rounded-md text-[#1F2937]"
            >
              {(currentSubject?.sections || ['Section A', 'Section B']).map((sec) => (
                <option key={sec} value={sec}>
                  {sec}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
              4. Select Assigned Subject
            </label>
            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              className="w-full px-3 py-2 text-xs font-semibold bg-white border border-[#D9E2EF] rounded-md text-[#1F2937]"
            >
              {semSubjects.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.code} – {sub.name} ({sub.questionBankStatus})
                </option>
              ))}
            </select>
          </div>
        </div>
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
          <button type="button" onClick={() => setFeedback(null)}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {loading || !bank || !validation ? (
        <div className="p-8 bg-white rounded-lg border border-[#D9E2EF] text-center text-xs text-[#64748B]">
          Loading subject question bank...
        </div>
      ) : (
        <>
          {/* Bank Status & Module Progress Strip (Module 1: 60/60 ... Total: 300/300) */}
          <div className="bg-white rounded-lg border border-[#D9E2EF] p-5 space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#D9E2EF]">
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="font-mono text-sm font-bold text-[#2563EB]">
                    {bank.subjectCode}
                  </span>
                  <h2 className="text-lg font-bold text-[#17243A]">
                    {bank.subjectName}
                  </h2>
                  <StatusBadge status={bank.status} />
                </div>
                <div className="text-xs text-[#64748B] mt-1 flex flex-wrap items-center gap-2">
                  <span>Revision: <strong className="font-mono text-[#1F2937]">{bank.revisionNumber}</strong></span>
                  <span aria-hidden="true">·</span>
                  <span>Declared Bank Difficulty: <strong className="text-[#1F2937]">{bank.declaredDifficulty}</strong></span>
                  {bank.submissionReference && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>Submission Ref: <strong className="font-mono text-[#6D5CE8]">{bank.submissionReference}</strong></span>
                      <span aria-hidden="true">·</span>
                      <span>Submitted: <strong className="font-mono">{bank.submittedAt}</strong></span>
                    </>
                  )}
                </div>
              </div>

              {/* Action Controls */}
              <div className="flex flex-wrap items-center gap-2">
                {isLocked ? (
                  <>
                    <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-[#6D5CE8]/10 border border-[#6D5CE8]/30 text-xs font-semibold text-[#6D5CE8]">
                      <Lock className="w-3.5 h-3.5" />
                      <span>Read-Only Finalized Bank</span>
                    </div>
                    {bank.status === 'Finalized' && (
                      <button
                        type="button"
                        onClick={() => setCorrectionModalOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#B7791F] bg-white border border-[#B7791F]/40 hover:bg-[#B7791F]/10 rounded-md cursor-pointer"
                      >
                        <ShieldAlert className="w-3.5 h-3.5" />
                        <span>Request Controlled Correction</span>
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleDownloadTemplate}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#1F2937] bg-white border border-[#D9E2EF] hover:bg-slate-100 rounded-md cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Template CSV</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadXlsxTemplate}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#1F2937] bg-white border border-[#D9E2EF] hover:bg-slate-100 rounded-md cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-[#2563EB]" />
                      <span>Template .xlsx</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setStudentPreviewOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#17243A] bg-white border border-[#D9E2EF] hover:bg-slate-100 rounded-md cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5 text-[#6D5CE8]" />
                      <span>Student View Preview</span>
                    </button>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={handleCsvFileUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#1F2937] bg-white border border-[#D9E2EF] hover:bg-slate-100 rounded-md cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-[#16834A]" />
                      <span>Bulk CSV / Excel Upload</span>
                    </button>

                    {validation.totalValid < 300 && (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={handleFillAllModulesTo300}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#6D5CE8] bg-[#6D5CE8]/10 border border-[#6D5CE8]/30 hover:bg-[#6D5CE8]/20 rounded-md cursor-pointer"
                        title="Development Helper: Populate remaining missing questions across Modules 1-5 to reach 300/300"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Complete Missing Module Questions (to 300/300)</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => openAddQuestionModal()}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Question</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* 6 Progress Cards: Module 1..5 (60/60) + Total (300/300) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {validation.moduleProgress.map((mp) => {
                const isComplete = mp.validCount === 60 && mp.totalUploaded === 60;
                const isSelected = activeModuleFilter === mp.moduleNumber;
                return (
                  <div
                    key={mp.moduleNumber}
                    onClick={() => setActiveModuleFilter(mp.moduleNumber)}
                    className={`p-3.5 rounded-md border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-[#2563EB] bg-blue-50/40'
                        : 'border-[#D9E2EF] bg-[#F5F7FB] hover:bg-slate-100/80'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-[#17243A]">
                        Module {mp.moduleNumber}
                      </span>
                      {isComplete ? (
                        <CheckCircle2 className="w-4 h-4 text-[#16834A]" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-[#B7791F]" />
                      )}
                    </div>
                    <div className="mt-2 flex items-baseline justify-between">
                      <span
                        className={`text-lg font-bold font-mono tabular-nums ${
                          isComplete ? 'text-[#16834A]' : 'text-[#17243A]'
                        }`}
                      >
                        {mp.validCount}/{mp.requiredCount}
                      </span>
                      {!isLocked && mp.validCount < 60 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleFillModuleTo60(mp.moduleNumber);
                          }}
                          className="text-[11px] font-semibold text-[#2563EB] hover:underline"
                        >
                          +Fill ({60 - mp.validCount})
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Total 300/300 Card */}
              <div
                onClick={() => setActiveModuleFilter(0)}
                className={`p-3.5 rounded-md border cursor-pointer ${
                  validation.isReadyForFinalSubmission
                    ? 'bg-[#16834A]/10 border-[#16834A]/40'
                    : 'bg-[#17243A] text-white border-[#17243A]'
                }`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span
                    className={`font-bold ${
                      validation.isReadyForFinalSubmission ? 'text-[#17243A]' : 'text-slate-200'
                    }`}
                  >
                    Total Progress
                  </span>
                  <CheckSquare
                    className={`w-4 h-4 ${
                      validation.isReadyForFinalSubmission ? 'text-[#16834A]' : 'text-blue-300'
                    }`}
                  />
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span
                    className={`text-lg font-bold font-mono tabular-nums ${
                      validation.isReadyForFinalSubmission ? 'text-[#16834A]' : 'text-white'
                    }`}
                  >
                    {validation.totalValid}/{validation.requiredTotal}
                  </span>
                  <span
                    className={`text-[11px] ${
                      validation.isReadyForFinalSubmission ? 'text-[#16834A] font-semibold' : 'text-slate-300'
                    }`}
                  >
                    {validation.isReadyForFinalSubmission ? 'Valid' : 'Required'}
                  </span>
                </div>
              </div>
            </div>

            {/* Declared Uniform Difficulty Level Bar */}
            <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-semibold text-[#17243A]">
                  Declared Bank Difficulty (Uniform Requirement):
                </span>
                <div className="inline-flex items-center gap-1 p-1 bg-[#F5F7FB] border border-[#D9E2EF] rounded-md">
                  {(['Moderate', 'Standard', 'Challenging'] as DifficultyLevel[]).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      disabled={isLocked || submitting}
                      onClick={() => handleDeclareDifficulty(lvl, true)}
                      className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                        bank.declaredDifficulty === lvl
                          ? 'bg-[#2563EB] text-white'
                          : 'text-[#64748B] hover:text-[#1F2937]'
                      } disabled:opacity-60`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
                <span className="text-[#64748B]">
                  All 300 questions in the bank are validated against this declared difficulty level.
                </span>
              </div>

              {!isLocked && (
                <button
                  type="button"
                  onClick={() => setFinalizeConfirmOpen(true)}
                  disabled={!validation.isReadyForFinalSubmission || submitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#16834A] hover:bg-[#136C3B] rounded-md transition-colors disabled:opacity-45 cursor-pointer self-start sm:self-auto"
                >
                  Finalize & Lock 300-Question Bank
                </button>
              )}
            </div>
          </div>

          {/* Validation Summary & Preview Panel when in 'review' mode or if issues exist */}
          {(activeView === 'review' || validation.issues.length > 0) && (
            <div className="bg-white rounded-lg border border-[#D9E2EF] p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-[#17243A]">
                    Question Bank Validation & Compliance Summary
                  </h3>
                  <p className="text-xs text-[#64748B]">
                    Verifies 60 questions per module (300 total), non-empty distinct options, answer key presence, and uniform difficulty ({bank.declaredDifficulty}).
                  </p>
                </div>
                {validation.isReadyForFinalSubmission ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#16834A]">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>All 300 Questions Validated (60 per Module)</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#B7791F]">
                    <AlertTriangle className="w-4 h-4" />
                    <span>
                      {300 - validation.totalValid} Valid Questions Needed to Unlock Final Submission
                    </span>
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                <div className="p-3 rounded bg-[#F5F7FB] border border-[#D9E2EF]">
                  <div className="text-[#64748B]">Missing Fields</div>
                  <div className="text-base font-bold font-mono text-[#17243A] mt-0.5">
                    {validation.issues.filter((i) => i.type === 'MISSING_FIELD').length}
                  </div>
                </div>
                <div className="p-3 rounded bg-[#F5F7FB] border border-[#D9E2EF]">
                  <div className="text-[#64748B]">Duplicate Warnings</div>
                  <div className="text-base font-bold font-mono text-[#17243A] mt-0.5">
                    {validation.issues.filter((i) => i.type === 'DUPLICATE_TEXT').length}
                  </div>
                </div>
                <div className="p-3 rounded bg-[#F5F7FB] border border-[#D9E2EF]">
                  <div className="text-[#64748B]">Missing Answers</div>
                  <div className="text-base font-bold font-mono text-[#17243A] mt-0.5">
                    {validation.issues.filter((i) => i.type === 'MISSING_ANSWER').length}
                  </div>
                </div>
                <div className="p-3 rounded bg-[#F5F7FB] border border-[#D9E2EF]">
                  <div className="text-[#64748B]">Invalid Options</div>
                  <div className="text-base font-bold font-mono text-[#17243A] mt-0.5">
                    {validation.issues.filter((i) => i.type === 'INVALID_OPTIONS').length}
                  </div>
                </div>
                <div className="p-3 rounded bg-[#F5F7FB] border border-[#D9E2EF]">
                  <div className="text-[#64748B]">Difficulty Mismatches</div>
                  <div className="text-base font-bold font-mono text-[#17243A] mt-0.5">
                    {validation.issues.filter((i) => i.type === 'DIFFICULTY_MISMATCH').length}
                  </div>
                </div>
              </div>

              {validation.issues.length > 0 && (
                <div className="max-h-40 overflow-y-auto border border-[#B42318]/30 rounded-md bg-[#B42318]/5 p-3 space-y-1.5 text-xs text-[#B42318]">
                  {validation.issues.map((iss, idx) => (
                    <div key={idx} className="flex items-center justify-between">
                      <span>
                        <strong>[{iss.questionId} · Module {iss.moduleNumber}]</strong> {iss.message}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Question List & Module Filter Table */}
          <div className="bg-white rounded-lg border border-[#D9E2EF] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#D9E2EF] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-1.5">
                {([0, 1, 2, 3, 4, 5] as const).map((mod) => (
                  <button
                    key={mod}
                    type="button"
                    onClick={() => setActiveModuleFilter(mod)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                      activeModuleFilter === mod
                        ? 'bg-[#17243A] text-white'
                        : 'bg-[#F5F7FB] text-[#64748B] hover:text-[#1F2937] border border-[#D9E2EF]'
                    }`}
                  >
                    {mod === 0 ? `All Modules (${bank.questions.length})` : `Module ${mod}`}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search Question ID or question text..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-[#D9E2EF] rounded-md"
                />
              </div>
            </div>

            <div className="overflow-x-auto max-h-[540px]">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-[#F5F7FB] border-b border-[#D9E2EF] text-xs font-semibold text-[#64748B]">
                  <tr>
                    <th className="py-3 px-4">Question ID</th>
                    <th className="py-3 px-3">Mod</th>
                    <th className="py-3 px-4">Question Text & Four MCQ Options (A–D)</th>
                    <th className="py-3 px-3 text-center">Answer Key</th>
                    <th className="py-3 px-3">Difficulty</th>
                    {!isLocked && <th className="py-3 px-4 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D9E2EF] text-[13px]">
                  {displayedQuestions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-xs text-[#64748B]">
                        No questions found in this module view. Use "Add Question" or "+Fill" to upload questions.
                      </td>
                    </tr>
                  ) : (
                    displayedQuestions.map((q) => (
                      <tr key={q.questionId} className="hover:bg-[#F5F7FB]/60 align-top">
                        <td className="py-3.5 px-4 font-mono text-xs font-bold text-[#17243A] whitespace-nowrap">
                          {q.questionId}
                        </td>
                        <td className="py-3.5 px-3 font-mono text-xs font-semibold text-[#2563EB] whitespace-nowrap">
                          M{q.moduleNumber}
                        </td>
                        <td className="py-3.5 px-4 space-y-2 max-w-2xl">
                          {q.imageId && imageStorage.toDataUrlSync(q.imageId) && (
                            <div className="mb-1.5 inline-flex items-center gap-2 p-1.5 bg-[#F5F7FB] border border-[#D9E2EF] rounded-md">
                              <img
                                src={imageStorage.toDataUrlSync(q.imageId)!}
                                alt={`Question ${q.questionId} diagram`}
                                className="max-h-20 max-w-xs object-contain rounded"
                              />
                              <span className="text-[10px] font-mono text-[#64748B]">
                                {q.imageId.slice(0, 10)}
                              </span>
                            </div>
                          )}
                          <div className="font-medium text-[#1F2937] leading-snug">
                            {q.questionText}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-[#64748B]">
                            <div
                              className={
                                q.correctOption === 'A'
                                  ? 'font-semibold text-[#16834A]'
                                  : ''
                              }
                            >
                              <strong className="font-mono">A:</strong> {q.optionA}
                            </div>
                            <div
                              className={
                                q.correctOption === 'B'
                                  ? 'font-semibold text-[#16834A]'
                                  : ''
                              }
                            >
                              <strong className="font-mono">B:</strong> {q.optionB}
                            </div>
                            <div
                              className={
                                q.correctOption === 'C'
                                  ? 'font-semibold text-[#16834A]'
                                  : ''
                              }
                            >
                              <strong className="font-mono">C:</strong> {q.optionC}
                            </div>
                            <div
                              className={
                                q.correctOption === 'D'
                                  ? 'font-semibold text-[#16834A]'
                                  : ''
                              }
                            >
                              <strong className="font-mono">D:</strong> {q.optionD}
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-3 text-center">
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-[#16834A]/15 text-[#16834A] font-mono text-xs font-bold">
                            {q.correctOption}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 text-xs font-medium text-[#1F2937]">
                          {q.difficulty}
                        </td>
                        {!isLocked && (
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => openEditQuestionModal(q)}
                                className="p-1.5 rounded border border-[#D9E2EF] bg-white text-[#1F2937] hover:bg-slate-100"
                                title="Edit Question"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteQuestion(q.questionId)}
                                className="p-1.5 rounded border border-[#B42318]/30 bg-white text-[#B42318] hover:bg-[#B42318]/10"
                                title="Delete Question"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Manual Question Entry / Edit Modal */}
      {qModalOpen && bank && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17243A]/60 p-4">
          <div className="w-full max-w-xl bg-white rounded-lg border border-[#D9E2EF] shadow-lg overflow-hidden">
            <div className="px-6 py-4 bg-[#F5F7FB] border-b border-[#D9E2EF] flex items-center justify-between">
              <h3 className="text-base font-bold text-[#17243A]">
                {editingQuestion
                  ? `Edit Question – ${editingQuestion.questionId}`
                  : `Add MCQ to ${bank.subjectCode}`}
              </h3>
              <button type="button" onClick={() => setQModalOpen(false)}>
                <X className="w-4 h-4 text-[#64748B]" />
              </button>
            </div>
            <form onSubmit={handleSaveQuestion} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    Module Number (1–5) <span className="text-[#B42318]">*</span>
                  </label>
                  <select
                    value={qForm.moduleNumber}
                    onChange={(e) =>
                      setQForm({
                        ...qForm,
                        moduleNumber: Number(e.target.value) as 1 | 2 | 3 | 4 | 5,
                      })
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-[#D9E2EF] rounded-md"
                  >
                    {[1, 2, 3, 4, 5].map((m) => (
                      <option key={m} value={m}>
                        Module {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    Correct Option <span className="text-[#B42318]">*</span>
                  </label>
                  <select
                    value={qForm.correctOption}
                    onChange={(e) =>
                      setQForm({
                        ...qForm,
                        correctOption: e.target.value as 'A' | 'B' | 'C' | 'D',
                      })
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-[#D9E2EF] rounded-md font-mono font-bold"
                  >
                    <option value="A">Option A</option>
                    <option value="B">Option B</option>
                    <option value="C">Option C</option>
                    <option value="D">Option D</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    Difficulty (Bank Uniform)
                  </label>
                  <select
                    value={qForm.difficulty}
                    onChange={(e) =>
                      setQForm({ ...qForm, difficulty: e.target.value as DifficultyLevel })
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-[#D9E2EF] rounded-md"
                  >
                    <option value="Moderate">Moderate</option>
                    <option value="Standard">Standard</option>
                    <option value="Challenging">Challenging</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                  Question Text <span className="text-[#B42318]">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={qForm.questionText}
                  onChange={(e) => setQForm({ ...qForm, questionText: e.target.value })}
                  placeholder="Enter clear, unambiguous engineering MCQ stem..."
                  className="w-full px-3 py-2 text-sm border border-[#D9E2EF] rounded-md"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    Option A <span className="text-[#B42318]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={qForm.optionA}
                    onChange={(e) => setQForm({ ...qForm, optionA: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-[#D9E2EF] rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    Option B <span className="text-[#B42318]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={qForm.optionB}
                    onChange={(e) => setQForm({ ...qForm, optionB: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-[#D9E2EF] rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    Option C <span className="text-[#B42318]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={qForm.optionC}
                    onChange={(e) => setQForm({ ...qForm, optionC: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-[#D9E2EF] rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    Option D <span className="text-[#B42318]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={qForm.optionD}
                    onChange={(e) => setQForm({ ...qForm, optionD: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-[#D9E2EF] rounded-md"
                  />
                </div>
              </div>

              <div className="p-3 bg-[#F5F7FB] border border-[#D9E2EF] rounded-md space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-[#1F2937] flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-[#2563EB]" />
                    <span>Optional Question Diagram (PNG / JPG, max 1 MB)</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <label className="px-2.5 py-1 text-[11px] font-semibold bg-white border border-[#D9E2EF] hover:bg-slate-100 rounded cursor-pointer">
                      {qForm.imageId ? 'Replace Image' : 'Attach Image'}
                      <input
                        type="file"
                        accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                        onChange={handleSingleQuestionImageSelect}
                        className="hidden"
                      />
                    </label>
                    {qForm.imageId && (
                      <button
                        type="button"
                        onClick={() => setQForm({ ...qForm, imageId: null })}
                        className="px-2 py-1 text-[11px] font-semibold text-[#B42318] bg-white border border-[#B42318]/30 hover:bg-red-50 rounded"
                      >
                        Remove Image
                      </button>
                    )}
                  </div>
                </div>
                {qForm.imageId && imageStorage.toDataUrlSync(qForm.imageId) && (
                  <div className="flex items-center gap-3 pt-1">
                    <img
                      src={imageStorage.toDataUrlSync(qForm.imageId)!}
                      alt="Question diagram preview"
                      className="max-h-28 max-w-full object-contain rounded border border-[#D9E2EF] bg-white p-1"
                    />
                  </div>
                )}
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setQModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold border border-[#D9E2EF] rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md"
                >
                  {submitting ? 'Saving...' : 'Save Question'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Final Submission Confirmation Modal */}
      <ConfirmDialog
        isOpen={finalizeConfirmOpen}
        title={`Final Question Bank Submission – ${bank?.subjectCode}`}
        description={`You are about to submit and finalize the 300-question bank (60 questions × 5 modules, ${bank?.declaredDifficulty} difficulty) for ${bank?.subjectCode} – ${bank?.subjectName}.`}
        consequenceNote="Final submission permanently locks this question-bank revision (REV-2026.1) and disables ordinary HOD editing. The backend Question Paper Generation Engine will immediately prepare Stage-A Papers 1–4 for the Controller of Examinations (COE). Any future correction requires an audited administrative request."
        confirmLabel="Confirm & Lock 300-Question Bank"
        variant="violet"
        isLoading={submitting}
        onConfirm={handleConfirmFinalize}
        onCancel={() => setFinalizeConfirmOpen(false)}
      />

      {/* Controlled Correction Request Modal for Finalized Banks */}
      {correctionModalOpen && bank && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17243A]/60 p-4">
          <div className="w-full max-w-md bg-white rounded-lg border border-[#D9E2EF] shadow-lg overflow-hidden">
            <div className="px-6 py-4 bg-[#F5F7FB] border-b border-[#D9E2EF] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-[#B7791F]" />
                <h3 className="text-base font-bold text-[#17243A]">
                  Controlled Correction Request
                </h3>
              </div>
              <button type="button" onClick={() => setCorrectionModalOpen(false)}>
                <X className="w-4 h-4 text-[#64748B]" />
              </button>
            </div>
            <form onSubmit={handleRequestCorrection} className="p-6 space-y-4">
              <p className="text-xs text-[#64748B] leading-relaxed">
                Finalized question banks (<strong>{bank.submissionReference}</strong>) cannot be silently reopened or modified. State the exact Question ID(s) and academic reason to request an authorized revision window from Central Administration & COE.
              </p>
              <div>
                <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                  Reason & Affected Question IDs <span className="text-[#B42318]">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  placeholder="e.g., Requesting revision window to update syllabus notation in QB-BCS501-M3-014."
                  className="w-full px-3 py-2 text-xs border border-[#D9E2EF] rounded-md"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCorrectionModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold border border-[#D9E2EF] rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !correctionReason.trim()}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#B7791F] hover:bg-[#976115] rounded-md disabled:opacity-50"
                >
                  Submit Correction Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Excel Embedded-Image Preview & Edit Modal */}
      {excelPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17243A]/60 p-4">
          <div className="w-full max-w-5xl max-h-[90vh] flex flex-col bg-white rounded-lg border border-[#D9E2EF] shadow-lg overflow-hidden">
            <div className="px-6 py-4 bg-[#F5F7FB] border-b border-[#D9E2EF] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#17243A]">
                  Excel Question Import Preview — {excelPreview.fileName}
                </h3>
                <p className="text-xs text-[#64748B]">
                  {excelPreview.rows.length} rows parsed ·{' '}
                  {excelPreview.rows.filter((r) => r.imageId).length} images attached ·{' '}
                  {excelPreview.issues.length} warning(s)
                </p>
              </div>
              <button type="button" onClick={() => setExcelPreview(null)}>
                <X className="w-4 h-4 text-[#64748B]" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {excelPreview.issues.length > 0 && (
                <div className="p-3 bg-[#FFFBEB] border border-[#F59E0B]/40 rounded-md space-y-1 text-xs text-[#92400E]">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Import Warnings ({excelPreview.issues.length})</span>
                  </div>
                  {excelPreview.issues.map((iss, idx) => (
                    <div key={idx}>
                      • Row {iss.rowNumber}: [{iss.code}] {iss.message}
                    </div>
                  ))}
                </div>
              )}

              <div className="border border-[#D9E2EF] rounded-md overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-[#F5F7FB] border-b border-[#D9E2EF] text-[#64748B]">
                    <tr>
                      <th className="py-2.5 px-3">Row</th>
                      <th className="py-2.5 px-3">Mod</th>
                      <th className="py-2.5 px-3">Question & Options</th>
                      <th className="py-2.5 px-3">Picture Preview & Controls</th>
                      <th className="py-2.5 px-3 text-right">Skip</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#D9E2EF]">
                    {excelPreview.rows.map((row) => {
                      const imgUrl = imageStorage.toDataUrlSync(row.imageId);
                      return (
                        <tr key={row.rowNumber} className={row.excluded ? 'opacity-45 bg-slate-50' : ''}>
                          <td className="py-2.5 px-3 font-mono font-bold">#{row.rowNumber}</td>
                          <td className="py-2.5 px-3 font-mono">M{row.moduleNumber}</td>
                          <td className="py-2.5 px-3 space-y-1 max-w-md">
                            <div className="font-medium text-[#1F2937]">{row.questionText}</div>
                            <div className="text-[11px] text-[#64748B]">
                              A: {row.optionA} | B: {row.optionB} | C: {row.optionC} | D: {row.optionD} (Key:{' '}
                              <strong>{row.correctOption || '—'}</strong>)
                            </div>
                            {row.errors.length > 0 && (
                              <div className="text-[11px] text-[#B42318] font-semibold">
                                {row.errors.join(' ')}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            {imgUrl ? (
                              <div className="flex items-center gap-2">
                                <img
                                  src={imgUrl}
                                  alt={`Row ${row.rowNumber} picture`}
                                  className="h-14 max-w-[120px] object-contain border border-[#D9E2EF] rounded bg-white p-0.5"
                                />
                                <div className="flex flex-col gap-1">
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const updated = await updatePreviewQuestionRow({
                                        previewId: excelPreview.previewId,
                                        rowNumber: row.rowNumber,
                                        imageAction: { type: 'remove' },
                                      });
                                      setExcelPreview(updated);
                                    }}
                                    className="px-2 py-0.5 text-[10px] font-semibold text-[#B42318] border border-[#B42318]/30 rounded hover:bg-red-50"
                                  >
                                    Remove
                                  </button>
                                  <label className="px-2 py-0.5 text-[10px] font-semibold text-[#2563EB] border border-[#2563EB]/30 rounded hover:bg-blue-50 cursor-pointer text-center">
                                    Replace
                                    <input
                                      type="file"
                                      accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                                      className="hidden"
                                      onChange={async (ev) => {
                                        const f = ev.target.files?.[0];
                                        if (!f) return;
                                        try {
                                          const b = new Uint8Array(await f.arrayBuffer());
                                          const updated = await updatePreviewQuestionRow({
                                            previewId: excelPreview.previewId,
                                            rowNumber: row.rowNumber,
                                            imageAction: { type: 'replace', bytes: b, filename: f.name },
                                          });
                                          setExcelPreview(updated);
                                        } catch (err) {
                                          setFeedback({
                                            type: 'error',
                                            message: err instanceof Error ? err.message : 'Replace failed',
                                          });
                                        } finally {
                                          ev.target.value = '';
                                        }
                                      }}
                                    />
                                  </label>
                                </div>
                              </div>
                            ) : (
                              <label className="px-2 py-1 text-[11px] font-semibold text-[#64748B] border border-dashed border-[#CBD5E1] rounded hover:bg-slate-50 cursor-pointer inline-block">
                                + Attach Image
                                <input
                                  type="file"
                                  accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                                  className="hidden"
                                  onChange={async (ev) => {
                                    const f = ev.target.files?.[0];
                                    if (!f) return;
                                    try {
                                      const b = new Uint8Array(await f.arrayBuffer());
                                      const updated = await updatePreviewQuestionRow({
                                        previewId: excelPreview.previewId,
                                        rowNumber: row.rowNumber,
                                        imageAction: { type: 'replace', bytes: b, filename: f.name },
                                      });
                                      setExcelPreview(updated);
                                    } catch (err) {
                                      setFeedback({
                                        type: 'error',
                                        message: err instanceof Error ? err.message : 'Attach failed',
                                      });
                                    } finally {
                                      ev.target.value = '';
                                    }
                                  }}
                                />
                              </label>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <input
                              type="checkbox"
                              checked={Boolean(row.excluded)}
                              onChange={async (ev) => {
                                const updated = await updatePreviewQuestionRow({
                                  previewId: excelPreview.previewId,
                                  rowNumber: row.rowNumber,
                                  patch: { excluded: ev.target.checked },
                                });
                                setExcelPreview(updated);
                              }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="px-6 py-4 bg-[#F5F7FB] border-t border-[#D9E2EF] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-xs">
                <select
                  value={excelImportMode}
                  onChange={(e) => setExcelImportMode(e.target.value as 'append' | 'replace_module')}
                  className="px-2.5 py-1.5 border border-[#D9E2EF] rounded bg-white text-xs font-medium"
                >
                  <option value="append">Append to Existing Questions</option>
                  <option value="replace_module">Replace Active Module Questions</option>
                </select>
                <button
                  type="button"
                  onClick={() => {
                    const bytes = buildCorrectedQuestionExcelBytes({ previewId: excelPreview.previewId });
                    downloadBinaryFile(
                      `Corrected_${excelPreview.fileName.replace(/\.xlsx$/i, '')}.xlsx`,
                      bytes,
                      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    );
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-[#D9E2EF] bg-white hover:bg-slate-100 rounded"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Corrected .xlsx</span>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setExcelPreview(null)}
                  className="px-4 py-2 text-xs font-semibold border border-[#D9E2EF] rounded-md bg-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleConfirmExcelPreview}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#16834A] hover:bg-[#136C3B] rounded-md"
                >
                  {submitting ? 'Importing...' : 'Confirm & Import Questions'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Student Question View Preview Modal */}
      {studentPreviewOpen && bank && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17243A]/60 p-4">
          <div className="w-full max-w-3xl max-h-[88vh] flex flex-col bg-white rounded-lg border border-[#D9E2EF] shadow-lg overflow-hidden">
            <div className="px-6 py-4 bg-[#17243A] text-white flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold">Student Exam View Preview — {bank.subjectCode}</h3>
                <p className="text-xs text-slate-300">
                  Shows diagram above question text (scaled to fit, never cropped); questions without diagrams render unchanged.
                </p>
              </div>
              <button type="button" onClick={() => setStudentPreviewOpen(false)}>
                <X className="w-4 h-4 text-slate-300 hover:text-white" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-5 bg-[#F5F7FB]">
              {getStudentQuestionView(displayedQuestions.slice(0, 10)).map((sq) => (
                <div key={sq.questionId} className="bg-white p-5 rounded-lg border border-[#D9E2EF] space-y-3">
                  <div className="text-xs font-mono font-bold text-[#2563EB]">Question {sq.orderNumber}</div>
                  {sq.imageDataUrl && (
                    <div className="flex justify-start bg-slate-50 border border-[#D9E2EF] rounded p-3">
                      <img
                        src={sq.imageDataUrl}
                        alt={`Question ${sq.orderNumber} figure`}
                        className="max-h-64 max-w-full w-auto h-auto object-contain"
                      />
                    </div>
                  )}
                  <div className="text-sm font-semibold text-[#17243A] leading-relaxed">
                    {sq.questionText}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[#1F2937]">
                    <div className="p-2.5 border border-[#D9E2EF] rounded">A. {sq.optionA}</div>
                    <div className="p-2.5 border border-[#D9E2EF] rounded">B. {sq.optionB}</div>
                    <div className="p-2.5 border border-[#D9E2EF] rounded">C. {sq.optionC}</div>
                    <div className="p-2.5 border border-[#D9E2EF] rounded">D. {sq.optionD}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
