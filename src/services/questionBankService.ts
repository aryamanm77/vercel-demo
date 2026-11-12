import {
  appendAuditLog,
  generateModuleQuestions,
  getMockDb,
  saveMockDb,
} from '../data/mockDatabase';
import {
  DifficultyLevel,
  MCQQuestion,
  ModuleProgress,
  QuestionBankRecord,
  QuestionBankValidationIssue,
  SubmissionHistoryEntry,
} from '../types';
import { withAdapterDelay } from './apiConfig';

export interface QuestionBankValidationReport {
  isReadyForFinalSubmission: boolean;
  totalUploaded: number;
  totalValid: number;
  requiredTotal: 300;
  declaredDifficulty: DifficultyLevel;
  moduleProgress: ModuleProgress[];
  issues: QuestionBankValidationIssue[];
}

export function validateQuestionBank(bank: QuestionBankRecord): QuestionBankValidationReport {
  const issues: QuestionBankValidationIssue[] = [];
  const seenTexts = new Map<string, string>();
  const validIds = new Set<string>();

  for (const q of bank.questions) {
    let qValid = true;
    const normText = q.questionText.trim().toLowerCase();

    if (!q.questionText.trim()) {
      qValid = false;
      issues.push({
        questionId: q.questionId,
        moduleNumber: q.moduleNumber,
        type: 'MISSING_FIELD',
        message: 'Question text is empty.',
      });
    } else if (seenTexts.has(normText)) {
      qValid = false;
      issues.push({
        questionId: q.questionId,
        moduleNumber: q.moduleNumber,
        type: 'DUPLICATE_TEXT',
        message: `Duplicate question text matches ${seenTexts.get(normText)}.`,
      });
    } else {
      seenTexts.set(normText, q.questionId);
    }

    const opts = [q.optionA.trim(), q.optionB.trim(), q.optionC.trim(), q.optionD.trim()];
    if (opts.some((o) => !o)) {
      qValid = false;
      issues.push({
        questionId: q.questionId,
        moduleNumber: q.moduleNumber,
        type: 'INVALID_OPTIONS',
        message: 'All four MCQ options (A, B, C, D) must be non-empty.',
      });
    } else if (new Set(opts.map((o) => o.toLowerCase())).size < 4) {
      qValid = false;
      issues.push({
        questionId: q.questionId,
        moduleNumber: q.moduleNumber,
        type: 'INVALID_OPTIONS',
        message: 'Options A, B, C, and D must be distinct.',
      });
    }

    if (!['A', 'B', 'C', 'D'].includes(q.correctOption)) {
      qValid = false;
      issues.push({
        questionId: q.questionId,
        moduleNumber: q.moduleNumber,
        type: 'MISSING_ANSWER',
        message: 'A valid correct answer (A, B, C, or D) must be specified.',
      });
    }

    if (q.difficulty !== bank.declaredDifficulty) {
      qValid = false;
      issues.push({
        questionId: q.questionId,
        moduleNumber: q.moduleNumber,
        type: 'DIFFICULTY_MISMATCH',
        message: `Question difficulty (${q.difficulty}) does not match declared bank difficulty (${bank.declaredDifficulty}).`,
      });
    }

    if (qValid) {
      validIds.add(q.questionId);
    }
  }

  const moduleNumbers: (1 | 2 | 3 | 4 | 5)[] = [1, 2, 3, 4, 5];
  const moduleProgress: ModuleProgress[] = moduleNumbers.map((mod) => {
    const modQuestions = bank.questions.filter((q) => q.moduleNumber === mod);
    const modValid = modQuestions.filter((q) => validIds.has(q.questionId)).length;
    return {
      moduleNumber: mod,
      totalUploaded: modQuestions.length,
      validCount: modValid,
      requiredCount: 60,
    };
  });

  const allModulesExact60 = moduleProgress.every(
    (m) => m.totalUploaded === 60 && m.validCount === 60
  );

  return {
    isReadyForFinalSubmission: allModulesExact60 && issues.length === 0,
    totalUploaded: bank.questions.length,
    totalValid: validIds.size,
    requiredTotal: 300,
    declaredDifficulty: bank.declaredDifficulty,
    moduleProgress,
    issues,
  };
}

export const questionBankService = {
  async getOrInitQuestionBank(params: {
    departmentId: string;
    subjectId: string;
    section: string;
  }) {
    return withAdapterDelay<{
      bank: QuestionBankRecord;
      validation: QuestionBankValidationReport;
    }>(() => {
      const db = getMockDb();
      const subj = db.subjects.find((s) => s.id === params.subjectId);
      if (!subj) throw new Error('Selected subject not found.');

      if (subj.departmentId !== params.departmentId) {
        throw new Error(
          'Access Denied: HODs may only access question banks belonging to their assigned department.'
        );
      }

      let bank = db.questionBanks.find(
        (qb) => qb.subjectId === params.subjectId && qb.section === params.section
      );

      // If no section-specific bank exists, check if there is a primary bank for the subject or create a new draft
      if (!bank) {
        const templateBank = db.questionBanks.find((qb) => qb.subjectId === params.subjectId);
        if (templateBank) {
          bank = templateBank;
        } else {
          bank = {
            id: `qb-${subj.code.toLowerCase()}-${Date.now()}`,
            subjectId: subj.id,
            subjectCode: subj.code,
            subjectName: subj.name,
            departmentId: subj.departmentId,
            departmentCode: subj.departmentCode,
            semesterId: subj.semesterId,
            semesterNumber: subj.semesterNumber,
            academicYearId: subj.academicYearId,
            section: params.section,
            revisionNumber: 'REV-2026.1-DRAFT',
            declaredDifficulty: 'Standard',
            status: 'Draft',
            questions: [],
          };
          db.questionBanks.push(bank);
          saveMockDb(db);
        }
      }

      return {
        bank: JSON.parse(JSON.stringify(bank)),
        validation: validateQuestionBank(bank),
      };
    });
  },

  async getDepartmentQuestionBanks(departmentId: string) {
    return withAdapterDelay<QuestionBankRecord[]>(() => {
      const db = getMockDb();
      return db.questionBanks
        .filter((qb) => qb.departmentId === departmentId)
        .map((qb) => ({ ...qb }));
    });
  },

  async setDeclaredDifficulty(
    bankId: string,
    departmentId: string,
    difficulty: DifficultyLevel,
    syncAllQuestions: boolean
  ) {
    return withAdapterDelay<{
      bank: QuestionBankRecord;
      validation: QuestionBankValidationReport;
    }>(() => {
      const db = getMockDb();
      const bank = db.questionBanks.find((q) => q.id === bankId);
      if (!bank) throw new Error('Question bank not found.');
      if (bank.departmentId !== departmentId) {
        throw new Error('Unauthorized department access.');
      }
      if (bank.status === 'Finalized' || bank.status === 'Correction Requested') {
        throw new Error('Finalized question banks are locked and cannot be modified.');
      }

      bank.declaredDifficulty = difficulty;
      if (syncAllQuestions) {
        bank.questions.forEach((q) => {
          q.difficulty = difficulty;
        });
      }

      saveMockDb(db);
      return {
        bank: JSON.parse(JSON.stringify(bank)),
        validation: validateQuestionBank(bank),
      };
    });
  },

  async saveSingleQuestion(
    bankId: string,
    departmentId: string,
    questionPayload: Omit<MCQQuestion, 'questionId' | 'subjectId' | 'updatedAt'> & {
      questionId?: string;
    }
  ) {
    return withAdapterDelay<{
      bank: QuestionBankRecord;
      validation: QuestionBankValidationReport;
    }>(() => {
      const db = getMockDb();
      const bank = db.questionBanks.find((q) => q.id === bankId);
      if (!bank) throw new Error('Question bank not found.');
      if (bank.departmentId !== departmentId) {
        throw new Error('Unauthorized department access.');
      }
      if (bank.status === 'Finalized' || bank.status === 'Correction Requested') {
        throw new Error('Finalized question banks are locked and read-only.');
      }

      const modQuestions = bank.questions.filter(
        (q) => q.moduleNumber === questionPayload.moduleNumber
      );

      if (questionPayload.questionId) {
        const existing = bank.questions.find((q) => q.questionId === questionPayload.questionId);
        if (!existing) throw new Error('Question ID not found.');
        existing.moduleNumber = questionPayload.moduleNumber;
        existing.questionText = questionPayload.questionText.trim();
        existing.optionA = questionPayload.optionA.trim();
        existing.optionB = questionPayload.optionB.trim();
        existing.optionC = questionPayload.optionC.trim();
        existing.optionD = questionPayload.optionD.trim();
        existing.correctOption = questionPayload.correctOption;
        existing.difficulty = questionPayload.difficulty;
        existing.updatedAt = new Date().toISOString();
      } else {
        if (modQuestions.length >= 60) {
          throw new Error(
            `Module ${questionPayload.moduleNumber} already has the maximum 60 questions. Edit or remove an existing question in Module ${questionPayload.moduleNumber}.`
          );
        }
        const nextNum = String(modQuestions.length + 1).padStart(3, '0');
        const newQ: MCQQuestion = {
          questionId: `QB-${bank.subjectCode}-M${questionPayload.moduleNumber}-${nextNum}-${Math.floor(10 + Math.random() * 89)}`,
          subjectId: bank.subjectId,
          moduleNumber: questionPayload.moduleNumber,
          questionText: questionPayload.questionText.trim(),
          optionA: questionPayload.optionA.trim(),
          optionB: questionPayload.optionB.trim(),
          optionC: questionPayload.optionC.trim(),
          optionD: questionPayload.optionD.trim(),
          correctOption: questionPayload.correctOption,
          difficulty: questionPayload.difficulty,
          updatedAt: new Date().toISOString(),
        };
        bank.questions.push(newQ);
      }

      saveMockDb(db);
      return {
        bank: JSON.parse(JSON.stringify(bank)),
        validation: validateQuestionBank(bank),
      };
    });
  },

  async deleteQuestion(bankId: string, departmentId: string, questionId: string) {
    return withAdapterDelay<{
      bank: QuestionBankRecord;
      validation: QuestionBankValidationReport;
    }>(() => {
      const db = getMockDb();
      const bank = db.questionBanks.find((q) => q.id === bankId);
      if (!bank) throw new Error('Question bank not found.');
      if (bank.departmentId !== departmentId) throw new Error('Unauthorized.');
      if (bank.status === 'Finalized' || bank.status === 'Correction Requested') {
        throw new Error('Finalized question banks are locked.');
      }

      bank.questions = bank.questions.filter((q) => q.questionId !== questionId);
      saveMockDb(db);
      return {
        bank: JSON.parse(JSON.stringify(bank)),
        validation: validateQuestionBank(bank),
      };
    });
  },

  async bulkImportQuestions(
    bankId: string,
    departmentId: string,
    mode: 'CSV_ROWS' | 'FILL_MODULE_TO_60' | 'FILL_ALL_MODULES_TO_300',
    payload: {
      moduleNumber?: 1 | 2 | 3 | 4 | 5;
      parsedRows?: {
        moduleNumber: 1 | 2 | 3 | 4 | 5;
        questionText: string;
        optionA: string;
        optionB: string;
        optionC: string;
        optionD: string;
        correctOption: 'A' | 'B' | 'C' | 'D';
        difficulty?: DifficultyLevel;
      }[];
    }
  ) {
    return withAdapterDelay<{
      bank: QuestionBankRecord;
      validation: QuestionBankValidationReport;
      importedCount: number;
    }>(() => {
      const db = getMockDb();
      const bank = db.questionBanks.find((q) => q.id === bankId);
      if (!bank) throw new Error('Question bank not found.');
      if (bank.departmentId !== departmentId) throw new Error('Unauthorized.');
      if (bank.status === 'Finalized' || bank.status === 'Correction Requested') {
        throw new Error('Finalized question banks are read-only.');
      }

      let importedCount = 0;

      if (mode === 'CSV_ROWS' && payload.parsedRows) {
        for (const row of payload.parsedRows) {
          const currentModCount = bank.questions.filter(
            (q) => q.moduleNumber === row.moduleNumber
          ).length;
          if (currentModCount < 60) {
            const seq = String(currentModCount + 1).padStart(3, '0');
            bank.questions.push({
              questionId: `QB-${bank.subjectCode}-M${row.moduleNumber}-${seq}-${Math.floor(10 + Math.random() * 89)}`,
              subjectId: bank.subjectId,
              moduleNumber: row.moduleNumber,
              questionText: row.questionText.trim(),
              optionA: row.optionA.trim(),
              optionB: row.optionB.trim(),
              optionC: row.optionC.trim(),
              optionD: row.optionD.trim(),
              correctOption: row.correctOption,
              difficulty: row.difficulty || bank.declaredDifficulty,
              updatedAt: new Date().toISOString(),
            });
            importedCount++;
          }
        }
      } else if (mode === 'FILL_MODULE_TO_60' && payload.moduleNumber) {
        const mod = payload.moduleNumber;
        const existingInMod = bank.questions.filter((q) => q.moduleNumber === mod);
        const needed = 60 - existingInMod.length;
        if (needed > 0) {
          const generated = generateModuleQuestions(
            bank.subjectId,
            bank.subjectCode,
            bank.subjectName,
            mod,
            60,
            bank.declaredDifficulty
          ).slice(existingInMod.length);
          bank.questions.push(...generated);
          importedCount = generated.length;
        }
      } else if (mode === 'FILL_ALL_MODULES_TO_300') {
        const mods: (1 | 2 | 3 | 4 | 5)[] = [1, 2, 3, 4, 5];
        for (const mod of mods) {
          const existingInMod = bank.questions.filter((q) => q.moduleNumber === mod);
          const needed = 60 - existingInMod.length;
          if (needed > 0) {
            const generated = generateModuleQuestions(
              bank.subjectId,
              bank.subjectCode,
              bank.subjectName,
              mod,
              60,
              bank.declaredDifficulty
            ).slice(existingInMod.length);
            bank.questions.push(...generated);
            importedCount += generated.length;
          }
        }
      }

      saveMockDb(db);
      return {
        bank: JSON.parse(JSON.stringify(bank)),
        validation: validateQuestionBank(bank),
        importedCount,
      };
    });
  },

  async finalizeQuestionBank(
    bankId: string,
    departmentId: string,
    actorName: string,
    actorEmployeeId: string
  ) {
    return withAdapterDelay<{
      bank: QuestionBankRecord;
      validation: QuestionBankValidationReport;
    }>(() => {
      const db = getMockDb();
      const bank = db.questionBanks.find((q) => q.id === bankId);
      if (!bank) throw new Error('Question bank not found.');
      if (bank.departmentId !== departmentId) {
        throw new Error('Unauthorized department access.');
      }
      if (bank.status === 'Finalized') {
        throw new Error('This question bank is already finalized.');
      }

      const validation = validateQuestionBank(bank);
      if (!validation.isReadyForFinalSubmission) {
        bank.status = 'Validation Failed';
        saveMockDb(db);
        throw new Error(
          `Validation Failed: Question bank requires 60 valid questions in each of the 5 modules (300 total) with matching "${bank.declaredDifficulty}" difficulty. Currently ${validation.totalValid}/300 valid.`
        );
      }

      const now = new Date();
      const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      const refCode = `MITM-QB-2026-${bank.departmentCode}-${bank.subjectCode}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      bank.status = 'Finalized';
      bank.revisionNumber = 'REV-2026.1';
      bank.submittedBy = `${actorName} (HOD - ${bank.departmentCode})`;
      bank.submittedAt = ts;
      bank.submissionReference = refCode;

      const subj = db.subjects.find((s) => s.id === bank.subjectId);
      if (subj) {
        subj.questionBankStatus = 'Finalized';
      }

      // Update exam schedule prep status if linked
      db.examSchedules.forEach((sched) => {
        if (sched.subjectId === bank.subjectId) {
          sched.coePrepStatus = 'Stage A: 4 Papers Prepared';
          sched.questionBankRevision = bank.revisionNumber;
        }
      });

      const historyEntry: SubmissionHistoryEntry = {
        id: `sub-hist-${Date.now()}`,
        referenceId: refCode,
        type: 'QUESTION_BANK',
        departmentId: bank.departmentId,
        departmentCode: bank.departmentCode,
        academicYearId: bank.academicYearId,
        semesterNumber: bank.semesterNumber,
        section: bank.section,
        subjectCode: bank.subjectCode,
        subjectName: bank.subjectName,
        revision: bank.revisionNumber,
        questionCount: 300,
        declaredDifficulty: bank.declaredDifficulty,
        rosterStatus: 'Frozen by COE',
        rosterCount: 25,
        submittedBy: actorName,
        submittedAt: ts,
        status: 'Finalized',
        notes: `Finalized 300 questions (60/module, ${bank.declaredDifficulty} difficulty). Locked for COE Stage-A paper generation.`,
      };
      db.submissionHistory.unshift(historyEntry);

      saveMockDb(db);

      appendAuditLog({
        actorName,
        actorEmployeeId,
        actorRole: 'HOD',
        actionCategory: 'QUESTION_BANK_FINALIZED',
        activityDescription: `Finalized 300-question bank for ${bank.subjectCode} (${bank.subjectName}) [Ref: ${refCode}].`,
        departmentCode: bank.departmentCode,
        status: 'Verified',
      });

      return {
        bank: JSON.parse(JSON.stringify(bank)),
        validation,
      };
    });
  },

  async requestCorrectionOnFinalizedBank(
    bankId: string,
    departmentId: string,
    reason: string,
    actorName: string,
    actorEmployeeId: string
  ) {
    return withAdapterDelay<QuestionBankRecord>(() => {
      const db = getMockDb();
      const bank = db.questionBanks.find((q) => q.id === bankId);
      if (!bank) throw new Error('Question bank not found.');
      if (bank.departmentId !== departmentId) throw new Error('Unauthorized.');
      if (bank.status !== 'Finalized') {
        throw new Error('Only finalized question banks require a controlled correction request.');
      }
      if (!reason.trim()) {
        throw new Error('Please provide a detailed justification for the administrative correction request.');
      }

      const now = new Date();
      const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      bank.status = 'Correction Requested';
      bank.correctionRequestNote = reason.trim();
      bank.correctionRequestedAt = ts;

      const subj = db.subjects.find((s) => s.id === bank.subjectId);
      if (subj) {
        subj.questionBankStatus = 'Correction Requested';
      }

      db.submissionHistory.unshift({
        id: `sub-hist-corr-${Date.now()}`,
        referenceId: `${bank.submissionReference || 'MITM-QB'}-CR`,
        type: 'QUESTION_BANK',
        departmentId: bank.departmentId,
        departmentCode: bank.departmentCode,
        academicYearId: bank.academicYearId,
        semesterNumber: bank.semesterNumber,
        section: bank.section,
        subjectCode: bank.subjectCode,
        subjectName: bank.subjectName,
        revision: bank.revisionNumber,
        questionCount: bank.questions.length,
        declaredDifficulty: bank.declaredDifficulty,
        rosterStatus: 'Frozen by COE',
        rosterCount: 25,
        submittedBy: actorName,
        submittedAt: ts,
        status: 'Correction Requested',
        notes: `Controlled revision request logged: ${reason.trim()}`,
      });

      saveMockDb(db);

      appendAuditLog({
        actorName,
        actorEmployeeId,
        actorRole: 'HOD',
        actionCategory: 'QUESTION_BANK_CORRECTION_REQUEST',
        activityDescription: `Submitted controlled Correction Request for finalized bank ${bank.subjectCode} (${bank.revisionNumber}): "${reason.trim()}"`,
        departmentCode: bank.departmentCode,
        status: 'Flagged',
      });

      return JSON.parse(JSON.stringify(bank));
    });
  },

  async getSubmissionHistory(departmentId?: string) {
    return withAdapterDelay<SubmissionHistoryEntry[]>(() => {
      const db = getMockDb();
      let list = [...db.submissionHistory];
      if (departmentId) {
        list = list.filter((item) => item.departmentId === departmentId);
      }
      return list;
    });
  },
};
