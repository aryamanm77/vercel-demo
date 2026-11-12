import { appendAuditLog, getMockDb, saveMockDb } from '../data/mockDatabase';
import {
  CoeQuestionBankSummary,
  DifficultyLevel,
  GeneratedPaperSet,
  MCQQuestion,
  QuestionBankRecord,
  QuestionImportIssue,
  QuestionImportPreviewSession,
  QuestionPreviewRow,
  ShuffledPaperQuestion,
  StudentQuestionViewItem,
} from '../types';
import {
  buildXlsxBuffer,
  parseXlsxBuffer,
  XlsxExtractedImage,
  XlsxWriteImageInput,
} from '../utils/xlsxCodec';
import { imageStorage, validateAndProcessImage } from './imageStorage';
import { validateQuestionBank } from './questionBankService';

const previewSessions = new Map<string, QuestionImportPreviewSession>();

const QUESTION_HEADER_SYNONYMS: Record<
  'questionText' | 'optionA' | 'optionB' | 'optionC' | 'optionD' | 'correctOption' | 'difficulty' | 'moduleNumber',
  string[]
> = {
  questionText: ['question', 'questiontext', 'question_text', 'qtext', 'stem', 'prompt'],
  optionA: ['optiona', 'option_a', 'opta', 'choicea', 'a'],
  optionB: ['optionb', 'option_b', 'optb', 'choiceb', 'b'],
  optionC: ['optionc', 'option_c', 'optc', 'choicec', 'c'],
  optionD: ['optiond', 'option_d', 'optd', 'choiced', 'd'],
  correctOption: ['correct', 'correctoption', 'correct_option', 'answer', 'ans', 'key'],
  difficulty: ['difficulty', 'level', 'diff'],
  moduleNumber: ['module', 'modulenumber', 'module_number', 'mod', 'unit'],
};

function normalizeHeaderKey(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-_().:]+/g, '');
}

function detectQuestionColumnMap(headerRow: (string | number | boolean | null)[]): {
  isHeaderRow: boolean;
  colMap: Partial<Record<keyof typeof QUESTION_HEADER_SYNONYMS, number>>;
} {
  const colMap: Partial<Record<keyof typeof QUESTION_HEADER_SYNONYMS, number>> = {};
  for (let c = 0; c < headerRow.length; c++) {
    const norm = normalizeHeaderKey(headerRow[c]);
    if (!norm) continue;
    for (const [field, aliases] of Object.entries(QUESTION_HEADER_SYNONYMS) as [
      keyof typeof QUESTION_HEADER_SYNONYMS,
      string[],
    ][]) {
      if (aliases.includes(norm) && colMap[field] === undefined) {
        colMap[field] = c;
      }
    }
  }
  const matchedCount = Object.keys(colMap).length;
  return {
    isHeaderRow: matchedCount >= 3 && colMap.questionText !== undefined,
    colMap,
  };
}

function parseCorrectOption(raw: unknown): 'A' | 'B' | 'C' | 'D' | '' {
  const s = String(raw ?? '').trim().toUpperCase();
  if (s === 'A' || s === 'B' || s === 'C' || s === 'D') return s;
  if (s.startsWith('OPTION ')) {
    const letter = s.replace('OPTION ', '').trim();
    if (letter === 'A' || letter === 'B' || letter === 'C' || letter === 'D') return letter;
  }
  return '';
}

function parseDifficulty(raw: unknown, fallback: DifficultyLevel): DifficultyLevel {
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === 'easy' || s === 'moderate') return 'Moderate';
  if (s === 'standard' || s === 'medium') return 'Standard';
  if (s === 'tough' || s === 'hard' || s === 'challenging') return 'Challenging';
  return fallback;
}

function getCellText(
  row: (string | number | boolean | null)[],
  colIndex: number | undefined,
): string {
  if (colIndex === undefined || colIndex < 0 || colIndex >= row.length) return '';
  return String(row[colIndex] ?? '').trim();
}

function mapIssueCode(
  failCode: 'UNSUPPORTED_FORMAT' | 'SIZE_EXCEEDED' | 'UNREADABLE_IMAGE',
): QuestionImportIssue['code'] {
  if (failCode === 'UNSUPPORTED_FORMAT') return 'UNSUPPORTED_IMAGE_FORMAT';
  if (failCode === 'SIZE_EXCEEDED') return 'IMAGE_TOO_LARGE';
  return 'UNREADABLE_IMAGE';
}

export async function previewQuestionExcelImport(params: {
  bankId: string;
  departmentId: string;
  defaultModuleNumber: 1 | 2 | 3 | 4 | 5;
  fileName: string;
  xlsxBytes: Uint8Array;
}): Promise<QuestionImportPreviewSession> {
  const db = getMockDb();
  const bank = db.questionBanks.find((b) => b.id === params.bankId);
  if (!bank) throw new Error('Question bank not found.');
  if (bank.departmentId !== params.departmentId) {
    throw new Error('Unauthorized department access.');
  }
  if (bank.status === 'Finalized' || bank.status === 'Correction Requested') {
    throw new Error('Finalized question banks are locked and read-only.');
  }

  const parsed = parseXlsxBuffer(params.xlsxBytes);
  const workbookIssues: QuestionImportIssue[] = [];

  // Locate header row (first non-empty row matching header synonyms, or row 1 positional)
  let headerRowIdx = -1; // 0-based index into parsed.rows
  let colMap: Partial<Record<keyof typeof QUESTION_HEADER_SYNONYMS, number>> = {
    questionText: 0,
    optionA: 1,
    optionB: 2,
    optionC: 3,
    optionD: 4,
    correctOption: 5,
    difficulty: 6,
  };

  for (let r = 0; r < Math.min(parsed.rows.length, 5); r++) {
    const row = parsed.rows[r];
    if (!row || row.every((v) => v === null || String(v).trim() === '')) continue;
    const detected = detectQuestionColumnMap(row);
    if (detected.isHeaderRow) {
      headerRowIdx = r;
      colMap = detected.colMap;
    }
    break;
  }

  const startDataIdx = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;
  const headerExcelRow = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;

  // Group extracted images by 1-based Excel row
  const imagesByRow = new Map<number, XlsxExtractedImage[]>();
  for (const img of parsed.images) {
    const list = imagesByRow.get(img.row1Based) || [];
    list.push(img);
    imagesByRow.set(img.row1Based, list);
  }

  const previewRows: QuestionPreviewRow[] = [];
  const validQuestionExcelRows = new Set<number>();

  for (let r = startDataIdx; r < parsed.rows.length; r++) {
    const excelRow = r + 1;
    const row = parsed.rows[r];
    if (!row) continue;

    const questionText = getCellText(row, colMap.questionText);
    const optionA = getCellText(row, colMap.optionA);
    const optionB = getCellText(row, colMap.optionB);
    const optionC = getCellText(row, colMap.optionC);
    const optionD = getCellText(row, colMap.optionD);
    const correctOption = parseCorrectOption(getCellText(row, colMap.correctOption));
    const difficulty = parseDifficulty(getCellText(row, colMap.difficulty), bank.declaredDifficulty);
    const rawMod = parseInt(getCellText(row, colMap.moduleNumber), 10);
    const moduleNumber = (
      [1, 2, 3, 4, 5].includes(rawMod) ? rawMod : params.defaultModuleNumber
    ) as 1 | 2 | 3 | 4 | 5;

    const hasAnyCellText = [questionText, optionA, optionB, optionC, optionD, correctOption].some(
      (x) => x !== '',
    );
    if (!hasAnyCellText) continue;

    validQuestionExcelRows.add(excelRow);

    const rowErrors: string[] = [];
    if (!questionText) rowErrors.push('Missing question text.');
    if (!optionA || !optionB || !optionC || !optionD) {
      rowErrors.push('All four options (A, B, C, D) are required.');
    }
    if (!correctOption) rowErrors.push('Valid correct option (A, B, C, D) is required.');

    const rowWarnings: QuestionImportIssue[] = [];
    let resolvedImageId: string | null = null;
    let resolvedImageSource: 'floating' | 'in_cell' | null = null;

    const rowImgs = imagesByRow.get(excelRow) || [];
    if (rowImgs.length > 1) {
      const warn: QuestionImportIssue = {
        rowNumber: excelRow,
        severity: 'WARNING',
        code: 'MULTIPLE_IMAGES_ON_ROW',
        message: `Row ${excelRow} has ${rowImgs.length} embedded pictures. Using only the first valid picture for the question stem.`,
      };
      rowWarnings.push(warn);
      workbookIssues.push(warn);
    }

    for (const img of rowImgs) {
      if (resolvedImageId) break;
      const processed = await validateAndProcessImage(img.bytes);
      if (!processed.ok) {
        const warn: QuestionImportIssue = {
          rowNumber: excelRow,
          severity: 'WARNING',
          code: mapIssueCode(processed.code),
          message: `Row ${excelRow} image (${img.filename}): ${processed.message}`,
        };
        rowWarnings.push(warn);
        workbookIssues.push(warn);
      } else {
        const stored = imageStorage.putSync(processed.bytes, processed.mimeType, {
          width: processed.width,
          height: processed.height,
          originalFilename: img.filename,
        });
        resolvedImageId = stored.imageId;
        resolvedImageSource = img.source;
      }
    }

    previewRows.push({
      rowNumber: excelRow,
      moduleNumber,
      questionText,
      optionA,
      optionB,
      optionC,
      optionD,
      correctOption,
      difficulty,
      imageId: resolvedImageId,
      imageSource: resolvedImageSource,
      warnings: rowWarnings,
      errors: rowErrors,
      excluded: false,
    });
  }

  // Warn on images placed on header row or outside parsed question rows
  for (const [excelRow, imgs] of imagesByRow.entries()) {
    if (headerExcelRow > 0 && excelRow === headerExcelRow) {
      for (const img of imgs) {
        workbookIssues.push({
          rowNumber: excelRow,
          severity: 'WARNING',
          code: 'HEADER_IMAGE_IGNORED',
          message: `Picture "${img.filename}" on header row ${excelRow} was ignored.`,
        });
      }
    } else if (!validQuestionExcelRows.has(excelRow)) {
      for (const img of imgs) {
        workbookIssues.push({
          rowNumber: excelRow,
          severity: 'WARNING',
          code: 'OUTSIDE_ROW_IMAGE_IGNORED',
          message: `Picture "${img.filename}" on row ${excelRow} is outside any valid question row and was ignored.`,
        });
      }
    }
  }

  const session: QuestionImportPreviewSession = {
    previewId: `qprev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    bankId: bank.id,
    subjectId: bank.subjectId,
    moduleNumber: params.defaultModuleNumber,
    fileName: params.fileName,
    createdAt: new Date().toISOString(),
    rows: previewRows,
    issues: workbookIssues,
  };
  previewSessions.set(session.previewId, session);
  return JSON.parse(JSON.stringify(session));
}

export function getQuestionPreviewSession(previewId: string): QuestionImportPreviewSession | null {
  const s = previewSessions.get(previewId);
  return s ? JSON.parse(JSON.stringify(s)) : null;
}

export async function updatePreviewQuestionRow(params: {
  previewId: string;
  rowNumber: number;
  patch?: Partial<
    Pick<
      QuestionPreviewRow,
      'questionText' | 'optionA' | 'optionB' | 'optionC' | 'optionD' | 'correctOption' | 'difficulty' | 'moduleNumber' | 'excluded'
    >
  >;
  imageAction?:
    | { type: 'remove' }
    | { type: 'replace'; bytes: Uint8Array; filename?: string };
}): Promise<QuestionImportPreviewSession> {
  const session = previewSessions.get(params.previewId);
  if (!session) throw new Error('Question import preview session not found.');
  const row = session.rows.find((r) => r.rowNumber === params.rowNumber);
  if (!row) throw new Error(`Preview row ${params.rowNumber} not found.`);

  if (params.patch) {
    Object.assign(row, params.patch);
  }

  if (params.imageAction) {
    if (params.imageAction.type === 'remove') {
      row.imageId = null;
      row.imageSource = null;
    } else if (params.imageAction.type === 'replace') {
      const processed = await validateAndProcessImage(params.imageAction.bytes);
      if (!processed.ok) {
        const warn: QuestionImportIssue = {
          rowNumber: row.rowNumber,
          severity: 'WARNING',
          code: mapIssueCode(processed.code),
          message: `Replacement image rejected: ${processed.message}`,
        };
        row.warnings.push(warn);
        session.issues.push(warn);
        throw new Error(processed.message);
      }
      const stored = imageStorage.putSync(processed.bytes, processed.mimeType, {
        width: processed.width,
        height: processed.height,
        originalFilename: params.imageAction.filename,
      });
      row.imageId = stored.imageId;
      row.imageSource = 'manual';
    }
  }

  // Revalidate row errors
  const errors: string[] = [];
  if (!row.questionText.trim()) errors.push('Missing question text.');
  if (!row.optionA.trim() || !row.optionB.trim() || !row.optionC.trim() || !row.optionD.trim()) {
    errors.push('All four options (A, B, C, D) are required.');
  }
  if (!row.correctOption) errors.push('Valid correct option (A, B, C, D) is required.');
  row.errors = errors;

  return JSON.parse(JSON.stringify(session));
}

export function confirmQuestionExcelImport(params: {
  previewId: string;
  departmentId: string;
  mode: 'append' | 'replace_module';
  actorName?: string;
  actorEmployeeId?: string;
}): {
  bank: QuestionBankRecord;
  importedCount: number;
  attachedImageCount: number;
  warnings: QuestionImportIssue[];
} {
  const session = previewSessions.get(params.previewId);
  if (!session) throw new Error('Question import preview session not found.');

  const db = getMockDb();
  const bank = db.questionBanks.find((b) => b.id === session.bankId);
  if (!bank) throw new Error('Question bank not found.');
  if (bank.departmentId !== params.departmentId) {
    throw new Error('Unauthorized department access.');
  }
  if (bank.status === 'Finalized' || bank.status === 'Correction Requested') {
    throw new Error('Finalized question banks are locked and read-only.');
  }

  const eligibleRows = session.rows.filter((r) => !r.excluded && r.errors.length === 0);
  if (eligibleRows.length === 0) {
    throw new Error('No valid non-excluded question rows remain to import.');
  }

  if (params.mode === 'replace_module') {
    bank.questions = bank.questions.filter((q) => q.moduleNumber !== session.moduleNumber);
  }

  const countByModule = new Map<number, number>();
  for (const q of bank.questions) {
    countByModule.set(q.moduleNumber, (countByModule.get(q.moduleNumber) || 0) + 1);
  }

  let importedCount = 0;
  let attachedImageCount = 0;

  for (const row of eligibleRows) {
    const currentModCount = countByModule.get(row.moduleNumber) || 0;
    if (currentModCount >= 60) break;
    const seq = String(currentModCount + 1).padStart(3, '0');
    const q: MCQQuestion = {
      questionId: `QB-${bank.subjectCode}-M${row.moduleNumber}-${seq}-${Date.now().toString().slice(-3)}`,
      subjectId: bank.subjectId,
      moduleNumber: row.moduleNumber,
      questionText: row.questionText.trim(),
      optionA: row.optionA.trim(),
      optionB: row.optionB.trim(),
      optionC: row.optionC.trim(),
      optionD: row.optionD.trim(),
      correctOption: row.correctOption,
      difficulty: row.difficulty,
      updatedAt: new Date().toISOString(),
      ...(row.imageId ? { imageId: row.imageId } : {}),
    };
    bank.questions.push(q);
    countByModule.set(row.moduleNumber, currentModCount + 1);
    importedCount++;
    if (row.imageId) attachedImageCount++;
  }

  saveMockDb(db);
  validateQuestionBank(bank);

  if (params.actorName && params.actorEmployeeId) {
    appendAuditLog({
      actorName: params.actorName,
      actorEmployeeId: params.actorEmployeeId,
      actorRole: 'HOD',
      actionCategory: 'QUESTION_BANK_IMPORTED',
      activityDescription: `Imported ${importedCount} MCQ questions (${attachedImageCount} with images) from "${session.fileName}" into ${bank.subjectCode}.`,
      departmentCode: bank.departmentCode,
      status: session.issues.length > 0 ? 'Flagged' : 'Completed',
    });
  }

  return {
    bank: JSON.parse(JSON.stringify(bank)),
    importedCount,
    attachedImageCount,
    warnings: JSON.parse(JSON.stringify(session.issues)),
  };
}

export function buildQuestionExcelTemplateBytes(): Uint8Array {
  return buildXlsxBuffer({
    sheetName: 'Questions',
    headers: [
      'Module',
      'Question',
      'Option A',
      'Option B',
      'Option C',
      'Option D',
      'Correct',
      'Difficulty',
    ],
    rows: [
      [
        1,
        'What is the time complexity of binary search on a sorted array of n elements?',
        'O(1)',
        'O(log n)',
        'O(n)',
        'O(n log n)',
        'B',
        'Moderate',
      ],
    ],
  });
}

export function buildCorrectedQuestionExcelBytes(
  source: { previewId: string } | { questions: MCQQuestion[] },
): Uint8Array {
  let rowsInput: Array<{
    moduleNumber: number;
    questionText: string;
    optionA: string;
    optionB: string;
    optionC: string;
    optionD: string;
    correctOption: string;
    difficulty: string;
    imageId?: string | null;
  }>;

  if ('previewId' in source) {
    const session = previewSessions.get(source.previewId);
    if (!session) throw new Error('Question import preview session not found.');
    rowsInput = session.rows.filter((r) => !r.excluded);
  } else {
    rowsInput = source.questions;
  }

  const rows: (string | number | null)[][] = [];
  const images: XlsxWriteImageInput[] = [];

  rowsInput.forEach((item, idx) => {
    const excelRow = idx + 2; // row 1 is headers
    rows.push([
      item.moduleNumber,
      item.questionText,
      item.optionA,
      item.optionB,
      item.optionC,
      item.optionD,
      item.correctOption,
      item.difficulty,
      item.imageId ? `img:${item.imageId.slice(0, 12)}` : '',
    ]);

    if (item.imageId) {
      const asset = imageStorage.getSync(item.imageId);
      if (asset) {
        images.push({
          row1Based: excelRow,
          col0Based: 8,
          bytes: asset.bytes,
          mimeType: asset.mimeType,
          filename: asset.originalFilename || `q-${excelRow}`,
        });
      }
    }
  });

  return buildXlsxBuffer({
    sheetName: 'Questions',
    headers: [
      'Module',
      'Question',
      'Option A',
      'Option B',
      'Option C',
      'Option D',
      'Correct',
      'Difficulty',
      'Image',
    ],
    rows,
    images,
  });
}

// ---------------------------------------------------------------------------
// Deterministic Paper Shuffle & Set Generation (A–D), COE & Student Views
// ---------------------------------------------------------------------------

function hashSeed(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h || 1;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function deterministicShuffle<T>(items: T[], rng: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

export function generateShuffledPaperSets(params: {
  questions: MCQQuestion[];
  subjectId: string;
  subjectCode: string;
  seed: string;
  questionCount?: number;
}): Record<'A' | 'B' | 'C' | 'D', GeneratedPaperSet> {
  const validPool = params.questions.filter(
    (q) => q.correctOption === 'A' || q.correctOption === 'B' || q.correctOption === 'C' || q.correctOption === 'D',
  );
  const versions: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];
  const result = {} as Record<'A' | 'B' | 'C' | 'D', GeneratedPaperSet>;

  for (const version of versions) {
    const rng = mulberry32(hashSeed(`${params.seed}::${version}`));
    const picked = deterministicShuffle(validPool, rng).slice(
      0,
      params.questionCount ?? validPool.length,
    );

    const shuffledQuestions: ShuffledPaperQuestion[] = [];
    const answerKey: Record<number, 'A' | 'B' | 'C' | 'D'> = {};

    picked.forEach((q, idx) => {
      const orderNumber = idx + 1;
      const optionEntries: { key: 'A' | 'B' | 'C' | 'D'; text: string }[] = [
        { key: 'A', text: q.optionA },
        { key: 'B', text: q.optionB },
        { key: 'C', text: q.optionC },
        { key: 'D', text: q.optionD },
      ];
      const perm = deterministicShuffle(optionEntries, rng);
      const newCorrectIdx = perm.findIndex((o) => o.key === q.correctOption);
      const newCorrectLetter = (['A', 'B', 'C', 'D'] as const)[Math.max(0, newCorrectIdx)];

      answerKey[orderNumber] = newCorrectLetter;
      shuffledQuestions.push({
        orderNumber,
        questionId: q.questionId,
        moduleNumber: q.moduleNumber,
        questionText: q.questionText,
        optionA: perm[0].text,
        optionB: perm[1].text,
        optionC: perm[2].text,
        optionD: perm[3].text,
        correctOption: newCorrectLetter,
        imageId: q.imageId ?? null,
      });
    });

    result[version] = {
      version,
      subjectId: params.subjectId,
      subjectCode: params.subjectCode,
      seed: `${params.seed}::${version}`,
      questions: shuffledQuestions,
      answerKey,
    };
  }

  return result;
}

// COE View: Strictly metadata + counts ONLY (never returns questions, answers, or images)
export function getCoeQuestionBankSummary(bankId: string): CoeQuestionBankSummary {
  const db = getMockDb();
  const bank = db.questionBanks.find((b) => b.id === bankId);
  if (!bank) throw new Error('Question bank not found.');
  const moduleCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const q of bank.questions) {
    moduleCounts[q.moduleNumber] = (moduleCounts[q.moduleNumber] || 0) + 1;
  }
  return {
    bankId: bank.id,
    departmentCode: bank.departmentCode,
    subjectCode: bank.subjectCode,
    subjectName: bank.subjectName,
    revision: bank.revisionNumber,
    status: bank.status,
    totalQuestions: bank.questions.length,
    moduleCounts,
    finalizedAt: bank.submittedAt,
  };
}

export function listCoeQuestionBankSummaries(): CoeQuestionBankSummary[] {
  const db = getMockDb();
  return db.questionBanks.map((b) => getCoeQuestionBankSummary(b.id));
}

// Student Question View: renders resolved image (if attached) alongside question text & options, without answer key
export function getStudentQuestionView(
  questions: (MCQQuestion | ShuffledPaperQuestion)[],
): StudentQuestionViewItem[] {
  return questions.map((q, idx) => {
    const orderNumber = 'orderNumber' in q ? q.orderNumber : idx + 1;
    const imageId = q.imageId ?? null;
    const imageDataUrl = imageStorage.toDataUrlSync(imageId);
    return {
      orderNumber,
      questionId: q.questionId,
      questionText: q.questionText,
      optionA: q.optionA,
      optionB: q.optionB,
      optionC: q.optionC,
      optionD: q.optionD,
      imageId,
      imageDataUrl,
    };
  });
}
