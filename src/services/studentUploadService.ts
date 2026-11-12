import { appendAuditLog, getMockDb, saveMockDb } from '../data/mockDatabase';
import {
  StudentDirectoryRecord,
  StudentDirectorySettings,
  StudentRowDisposition,
  StudentUploadIssue,
  StudentUploadPreviewRow,
  StudentUploadPreviewSession,
} from '../types';
import { buildXlsxBuffer, parseXlsxBuffer } from '../utils/xlsxCodec';
import { bytesToBase64 } from './imageStorage';
import {
  DirectoryActorContext,
  normalizeBranchAlias,
  PortalAccessError,
} from './studentDirectoryPort';

const studentPreviewSessions = new Map<string, StudentUploadPreviewSession>();

const STUDENT_HEADER_SYNONYMS: Record<
  'usn' | 'studentName' | 'dob' | 'branch' | 'semester' | 'section',
  string[]
> = {
  usn: ['usn', 'rollno', 'rollnumber', 'regno', 'registrationno', 'studentid', 'id'],
  studentName: ['name', 'studentname', 'fullname', 'candidate', 'candidatename'],
  dob: ['dob', 'dateofbirth', 'birthdate', 'birthday'],
  branch: ['branch', 'department', 'dept', 'deptcode', 'departmentcode', 'program', 'programme'],
  semester: ['semester', 'sem', 'semesterno'],
  section: ['section', 'sec'],
};

function normalizeHeader(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-_().:]+/g, '');
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (year < 1950 || year > 2026 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

function formatIsoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseDobValue(
  raw: string | number | boolean | null | undefined,
  dayFirst: boolean,
): { iso: string; ambiguous: boolean; valid: boolean } {
  if (raw === null || raw === undefined || raw === '') {
    return { iso: '', ambiguous: false, valid: false };
  }

  // Excel serial date number (epoch 1899-12-30 accounts for Excel 1900 leap bug cleanly)
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw > 1000 && raw < 100000) {
      const utcMs = Date.UTC(1899, 11, 30) + Math.floor(raw) * 86400000;
      const dt = new Date(utcMs);
      const y = dt.getUTCFullYear();
      const m = dt.getUTCMonth() + 1;
      const d = dt.getUTCDate();
      if (isValidCalendarDate(y, m, d)) {
        return { iso: formatIsoDate(y, m, d), ambiguous: false, valid: true };
      }
    }
    return { iso: String(raw), ambiguous: false, valid: false };
  }

  const text = String(raw).trim();
  if (!text) return { iso: '', ambiguous: false, valid: false };

  // Pure numeric string representing Excel serial
  if (/^\d{4,6}$/.test(text)) {
    const serial = parseInt(text, 10);
    if (serial > 1000 && serial < 100000) {
      const utcMs = Date.UTC(1899, 11, 30) + serial * 86400000;
      const dt = new Date(utcMs);
      const y = dt.getUTCFullYear();
      const m = dt.getUTCMonth() + 1;
      const d = dt.getUTCDate();
      if (isValidCalendarDate(y, m, d)) {
        return { iso: formatIsoDate(y, m, d), ambiguous: false, valid: true };
      }
    }
  }

  // Unambiguous YYYY-MM-DD / YYYY/MM/DD / YYYY.MM.DD
  const ymd = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (ymd) {
    const y = parseInt(ymd[1], 10);
    const m = parseInt(ymd[2], 10);
    const d = parseInt(ymd[3], 10);
    if (isValidCalendarDate(y, m, d)) {
      return { iso: formatIsoDate(y, m, d), ambiguous: false, valid: true };
    }
    return { iso: text, ambiguous: false, valid: false };
  }

  // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY (or MM/DD/YYYY when !dayFirst)
  const dmy = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmy) {
    const first = parseInt(dmy[1], 10);
    const second = parseInt(dmy[2], 10);
    const year = parseInt(dmy[3], 10);

    const bothValidOrder = first >= 1 && first <= 12 && second >= 1 && second <= 12 && first !== second;
    const day = dayFirst ? first : second;
    const month = dayFirst ? second : first;

    if (isValidCalendarDate(year, month, day)) {
      return { iso: formatIsoDate(year, month, day), ambiguous: bothValidOrder, valid: true };
    }
    // Fallback if one orientation is unambiguous (e.g. 2004-05-19 written 05/19/2004 under dayFirst)
    if (isValidCalendarDate(year, first, second)) {
      return { iso: formatIsoDate(year, first, second), ambiguous: true, valid: true };
    }
    return { iso: text, ambiguous: false, valid: false };
  }

  return { iso: text, ambiguous: false, valid: false };
}

function parseCsvGrid(text: string): (string | null)[][] {
  return text
    .split(/\r?\n/)
    .map((line) => line.split(',').map((c) => c.replace(/^"|"$/g, '').trim()));
}

function evaluateRow(params: {
  row: StudentUploadPreviewRow;
  seenUsns: Map<string, number>;
  settings: StudentDirectorySettings;
  existingByUsn: Map<string, StudentDirectoryRecord>;
  actor: DirectoryActorContext;
}): void {
  const { row, seenUsns, settings, existingByUsn, actor } = params;
  const issues: StudentUploadIssue[] = [];

  const usn = row.usn.trim().toUpperCase();
  row.usn = usn;
  row.studentName = row.studentName.trim();
  row.section = row.section.trim().toUpperCase().replace(/^SECTION\s+/i, '') || 'A';

  if (!usn) {
    issues.push({
      field: 'usn',
      severity: 'ERROR',
      code: 'MISSING_REQUIRED',
      message: 'Missing required USN.',
    });
  } else {
    const firstSeenRow = seenUsns.get(usn);
    if (firstSeenRow !== undefined && firstSeenRow !== row.rowNumber) {
      issues.push({
        field: 'usn',
        severity: 'ERROR',
        code: 'DUPLICATE_USN_IN_FILE',
        message: `Duplicate USN "${usn}" (already appeared on row ${firstSeenRow}).`,
      });
    } else {
      seenUsns.set(usn, row.rowNumber);
    }

    try {
      const re = new RegExp(settings.usnRegex, 'i');
      if (!re.test(usn)) {
        issues.push({
          field: 'usn',
          severity: settings.usnStrictMode ? 'ERROR' : 'WARNING',
          code: 'INVALID_USN_FORMAT',
          message: `USN "${usn}" does not match configured pattern (${settings.usnRegex}).`,
        });
      }
    } catch {
      // Invalid regex configured; skip regex check safely
    }
  }

  if (!row.studentName) {
    issues.push({
      field: 'studentName',
      severity: 'ERROR',
      code: 'MISSING_REQUIRED',
      message: 'Missing required Student Name.',
    });
  }

  if (!row.dob) {
    issues.push({
      field: 'dob',
      severity: 'ERROR',
      code: 'MISSING_REQUIRED',
      message: 'Missing required DOB.',
    });
  } else {
    const dobParsed = parseDobValue(row.dob, settings.dobDayFirst);
    if (!dobParsed.valid) {
      issues.push({
        field: 'dob',
        severity: 'ERROR',
        code: 'INVALID_DOB',
        message: 'Invalid DOB value (not logged for privacy).',
      });
    } else {
      row.dob = dobParsed.iso;
      if (dobParsed.ambiguous) {
        issues.push({
          field: 'dob',
          severity: 'WARNING',
          code: 'AMBIGUOUS_DOB',
          message: `Ambiguous day/month DOB interpreted using ${settings.dobDayFirst ? 'DD/MM' : 'MM/DD'} order.`,
        });
      }
    }
  }

  // Branch alias normalization + HOD branch scoping
  const normBranch = row.branchRaw
    ? normalizeBranchAlias(row.branchRaw, settings)
    : actor.role === 'HOD' && actor.branchCode
      ? actor.branchCode.toUpperCase()
      : null;

  if (!normBranch) {
    row.branchCode = row.branchRaw.trim().toUpperCase();
    issues.push({
      field: 'branch',
      severity: 'ERROR',
      code: 'UNKNOWN_BRANCH',
      message: `Unrecognized branch "${row.branchRaw}".`,
    });
  } else {
    row.branchCode = normBranch;
    if (
      actor.role === 'HOD' &&
      actor.branchCode &&
      normBranch !== actor.branchCode.trim().toUpperCase()
    ) {
      issues.push({
        field: 'branch',
        severity: 'ERROR',
        code: 'WRONG_BRANCH',
        message: `Wrong branch "${normBranch}": HOD can only upload students for ${actor.branchCode.toUpperCase()}.`,
      });
    }
  }

  if (!row.semesterNumber || row.semesterNumber < 1 || row.semesterNumber > 8) {
    issues.push({
      field: 'semester',
      severity: 'ERROR',
      code: 'INVALID_SEMESTER',
      message: 'Semester must be between 1 and 8.',
    });
  }

  // Disposition & Cross-branch conflict check
  const existing = usn ? existingByUsn.get(usn) : undefined;
  let hasCrossBranchConflict = false;
  if (existing && row.branchCode && existing.branchCode !== row.branchCode) {
    hasCrossBranchConflict = true;
    issues.push({
      field: 'branch',
      severity: 'ERROR',
      code: 'CROSS_BRANCH_CONFLICT',
      message: `USN ${usn} already belongs to branch ${existing.branchCode}; cannot move via upload to ${row.branchCode}.`,
    });
  }

  row.issues = issues;

  if (row.excluded) {
    row.disposition = 'EXCLUDED';
    return;
  }

  const hasError = issues.some((i) => i.severity === 'ERROR');
  if (hasCrossBranchConflict) {
    row.disposition = 'CONFLICT';
  } else if (hasError) {
    row.disposition = 'ERROR';
  } else if (!existing) {
    row.disposition = 'NEW';
  } else {
    const attrChanged =
      JSON.stringify(existing.attributes || {}) !== JSON.stringify(row.attributes || {});
    const changed =
      existing.studentName !== row.studentName ||
      existing.dob !== row.dob ||
      existing.semesterNumber !== (row.semesterNumber ?? existing.semesterNumber) ||
      existing.section !== row.section ||
      attrChanged;
    row.disposition = changed ? 'UPDATED' : 'UNCHANGED';
  }
}

function recomputeSessionCounts(session: StudentUploadPreviewSession): void {
  const counts = {
    newCount: 0,
    updatedCount: 0,
    unchangedCount: 0,
    conflictCount: 0,
    errorCount: 0,
    warningCount: 0,
    excludedCount: 0,
  };
  for (const r of session.rows) {
    if (r.disposition === 'NEW') counts.newCount++;
    else if (r.disposition === 'UPDATED') counts.updatedCount++;
    else if (r.disposition === 'UNCHANGED') counts.unchangedCount++;
    else if (r.disposition === 'CONFLICT') counts.conflictCount++;
    else if (r.disposition === 'ERROR') counts.errorCount++;
    else if (r.disposition === 'EXCLUDED') counts.excludedCount++;

    counts.warningCount += r.issues.filter((i) => i.severity === 'WARNING').length;
  }
  session.counts = counts;
}

function reevaluateSession(session: StudentUploadPreviewSession, actor: DirectoryActorContext): void {
  const db = getMockDb();
  const existingByUsn = new Map<string, StudentDirectoryRecord>();
  for (const s of db.studentDirectory || []) existingByUsn.set(s.usn, s);

  const seenUsns = new Map<string, number>();
  for (const row of session.rows) {
    if (!row.excluded && row.usn.trim()) {
      const clean = row.usn.trim().toUpperCase();
      if (!seenUsns.has(clean)) seenUsns.set(clean, row.rowNumber);
    }
  }

  for (const row of session.rows) {
    evaluateRow({
      row,
      seenUsns,
      settings: db.directorySettings!,
      existingByUsn,
      actor,
    });
  }
  recomputeSessionCounts(session);
}

export function generateStudentTemplateXlsx(): Uint8Array {
  return buildXlsxBuffer({
    sheetName: 'Students',
    headers: ['USN', 'Name', 'DOB', 'Branch', 'Semester', 'Section'],
    rows: [['4MH23CS001', 'Aarav Sharma', '2005-05-14', 'CSE', 5, 'A']],
  });
}

export function previewStudentUpload(params: {
  fileName: string;
  bytes: Uint8Array;
  actor: DirectoryActorContext;
}): StudentUploadPreviewSession {
  if (params.actor.role !== 'HOD' && params.actor.role !== 'PRINCIPAL') {
    throw new PortalAccessError(403, 'Only HOD or Principal/Admin can upload student directory files.');
  }
  const db = getMockDb();
  const settings = db.directorySettings!;

  // Keep raw uploaded file untouched as an audit record
  const rawAuditId = `raw-up-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  db.rawUploadAuditArtifacts![rawAuditId] = {
    id: rawAuditId,
    fileName: params.fileName,
    uploadedAt: new Date().toISOString(),
    uploadedBy: `${params.actor.actorName} (${params.actor.actorEmployeeId})`,
    base64: bytesToBase64(params.bytes),
  };
  saveMockDb(db);

  let grid: (string | number | boolean | null)[][];
  const ext = params.fileName.split('.').pop()?.toLowerCase();
  if (ext === 'csv' || ext === 'tsv') {
    grid = parseCsvGrid(new TextDecoder('utf-8').decode(params.bytes));
  } else {
    grid = parseXlsxBuffer(params.bytes).rows;
  }

  // Locate header row (first non-empty row matching at least 2 known columns, else positional)
  let headerRowIdx = -1;
  let colMap: Partial<Record<keyof typeof STUDENT_HEADER_SYNONYMS, number>> = {
    usn: 0,
    studentName: 1,
    dob: 2,
    branch: 3,
    semester: 4,
    section: 5,
  };
  const headerLabels: string[] = [];

  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    if (!row || row.every((c) => c === null || String(c).trim() === '')) continue;

    const matched: Partial<Record<keyof typeof STUDENT_HEADER_SYNONYMS, number>> = {};
    for (let c = 0; c < row.length; c++) {
      headerLabels[c] = String(row[c] ?? `col_${c + 1}`).trim();
      const norm = normalizeHeader(row[c]);
      if (!norm) continue;
      for (const [field, synonyms] of Object.entries(STUDENT_HEADER_SYNONYMS) as [
        keyof typeof STUDENT_HEADER_SYNONYMS,
        string[],
      ][]) {
        if (synonyms.includes(norm) && matched[field] === undefined) {
          matched[field] = c;
        }
      }
    }

    headerRowIdx = r;
    if (Object.keys(matched).length >= 2) {
      colMap = matched;
    }
    break;
  }

  if (headerRowIdx < 0) {
    throw new Error('Uploaded student file contains no readable rows.');
  }

  const mappedCols = new Set(Object.values(colMap).filter((v): v is number => v !== undefined));
  const extraColIndices: { idx: number; key: string }[] = [];
  for (let c = 0; c < headerLabels.length; c++) {
    if (!mappedCols.has(c) && headerLabels[c]) {
      extraColIndices.push({ idx: c, key: headerLabels[c] });
    }
  }

  const detectedColumns: Record<string, string> = {};
  for (const [field, idx] of Object.entries(colMap)) {
    if (idx !== undefined) detectedColumns[field] = headerLabels[idx] || `Col ${idx + 1}`;
  }

  const existingByUsn = new Map<string, StudentDirectoryRecord>();
  for (const s of db.studentDirectory || []) existingByUsn.set(s.usn, s);

  const seenUsns = new Map<string, number>();
  const rows: StudentUploadPreviewRow[] = [];

  for (let r = headerRowIdx + 1; r < grid.length; r++) {
    const rawRow = grid[r];
    if (!rawRow || rawRow.every((c) => c === null || String(c).trim() === '')) continue; // Ignore blank rows

    const excelRow = r + 1;
    const getRaw = (idx: number | undefined) =>
      idx !== undefined && idx < rawRow.length ? rawRow[idx] : '';

    const rawUsn = String(getRaw(colMap.usn) ?? '').trim().toUpperCase();
    const rawName = String(getRaw(colMap.studentName) ?? '').trim();
    const dobCell = getRaw(colMap.dob);
    const dobParsed = parseDobValue(dobCell, settings.dobDayFirst);
    const branchRaw = String(getRaw(colMap.branch) ?? '').trim();
    const semRaw = String(getRaw(colMap.semester) ?? '').trim();
    const semNum = parseInt(semRaw, 10);
    const sectionRaw = String(getRaw(colMap.section) ?? '').trim();

    const attributes: Record<string, string> = {};
    for (const extra of extraColIndices) {
      const val = getRaw(extra.idx);
      if (val !== null && val !== undefined && String(val).trim() !== '') {
        attributes[extra.key] = String(val).trim();
      }
    }

    const previewRow: StudentUploadPreviewRow = {
      rowNumber: excelRow,
      usn: rawUsn,
      studentName: rawName,
      dob: dobParsed.valid ? dobParsed.iso : String(dobCell ?? '').trim(),
      branchRaw,
      branchCode: '',
      semesterNumber: Number.isNaN(semNum) ? null : semNum,
      section: sectionRaw || 'A',
      attributes,
      disposition: 'NEW',
      issues: [],
      excluded: false,
    };

    // Preserve raw ambiguity/date flag on initial parse
    evaluateRow({
      row: previewRow,
      seenUsns,
      settings,
      existingByUsn,
      actor: params.actor,
    });
    if (
      dobParsed.valid &&
      dobParsed.ambiguous &&
      !previewRow.issues.some((i) => i.code === 'AMBIGUOUS_DOB')
    ) {
      previewRow.issues.push({
        field: 'dob',
        severity: 'WARNING',
        code: 'AMBIGUOUS_DOB',
        message: `Ambiguous day/month DOB interpreted using ${settings.dobDayFirst ? 'DD/MM' : 'MM/DD'} order.`,
      });
    }

    rows.push(previewRow);
  }

  const session: StudentUploadPreviewSession = {
    previewId: `sprev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fileName: params.fileName,
    uploadedBy: params.actor.actorName,
    uploadedByRole: params.actor.role,
    actorBranchCode: params.actor.branchCode,
    uploadedAt: new Date().toISOString(),
    rawUploadAuditId: rawAuditId,
    detectedColumns,
    extraColumns: extraColIndices.map((e) => e.key),
    counts: {
      newCount: 0,
      updatedCount: 0,
      unchangedCount: 0,
      conflictCount: 0,
      errorCount: 0,
      warningCount: 0,
      excludedCount: 0,
    },
    rows,
  };

  recomputeSessionCounts(session);
  studentPreviewSessions.set(session.previewId, session);
  return JSON.parse(JSON.stringify(session));
}

export function updateStudentPreviewRow(params: {
  previewId: string;
  rowNumber: number;
  actor: DirectoryActorContext;
  patch?: Partial<
    Pick<
      StudentUploadPreviewRow,
      'usn' | 'studentName' | 'dob' | 'branchRaw' | 'semesterNumber' | 'section' | 'excluded'
    >
  >;
}): StudentUploadPreviewSession {
  const session = studentPreviewSessions.get(params.previewId);
  if (!session) throw new Error('Student upload preview session not found.');
  const row = session.rows.find((r) => r.rowNumber === params.rowNumber);
  if (!row) throw new Error(`Preview row ${params.rowNumber} not found.`);

  if (params.patch) {
    Object.assign(row, params.patch);
  }
  reevaluateSession(session, params.actor);
  return JSON.parse(JSON.stringify(session));
}

export function confirmStudentUpload(params: {
  previewId: string;
  actor: DirectoryActorContext;
}): {
  addedCount: number;
  updatedCount: number;
  unchangedCount: number;
  skippedErrorCount: number;
  rawUploadAuditId: string;
} {
  if (params.actor.role !== 'HOD' && params.actor.role !== 'PRINCIPAL') {
    throw new PortalAccessError(403, 'Unauthorized role for student upload confirmation.');
  }
  const session = studentPreviewSessions.get(params.previewId);
  if (!session) throw new Error('Student upload preview session not found.');

  reevaluateSession(session, params.actor);

  const db = getMockDb();
  const dir = db.studentDirectory!;
  const byUsn = new Map<string, StudentDirectoryRecord>();
  for (const s of dir) byUsn.set(s.usn, s);

  const nowIso = new Date().toISOString();
  let addedCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;
  let skippedErrorCount = 0;
  const affectedBranches = new Set<string>();

  for (const row of session.rows) {
    if (row.excluded || row.disposition === 'ERROR' || row.disposition === 'CONFLICT') {
      skippedErrorCount++;
      continue;
    }

    const dept = db.departments.find(
      (d) => d.code.toUpperCase() === row.branchCode.toUpperCase(),
    );
    const deptId = dept ? dept.id : `dept-${row.branchCode.toLowerCase()}`;
    const existing = byUsn.get(row.usn);

    if (!existing) {
      const created: StudentDirectoryRecord = {
        id: `stud-${row.usn}-${Date.now().toString().slice(-4)}`,
        usn: row.usn,
        studentName: row.studentName,
        dob: row.dob,
        departmentId: deptId,
        branchCode: row.branchCode,
        semesterNumber: row.semesterNumber || 5,
        section: row.section || 'A',
        status: 'ACTIVE',
        attributes: { ...row.attributes },
        semesterHistory: [
          {
            fromSemester: null,
            toSemester: row.semesterNumber || 5,
            changedAt: nowIso,
            changedBy: `${params.actor.actorName} (${params.actor.actorEmployeeId})`,
            reason: `Initial directory upload (${session.fileName})`,
          },
        ],
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      dir.push(created);
      byUsn.set(created.usn, created);
      addedCount++;
      affectedBranches.add(created.branchCode);
    } else if (row.disposition === 'UPDATED') {
      const prevSem = existing.semesterNumber;
      const nextSem = row.semesterNumber || prevSem;
      if (prevSem !== nextSem) {
        existing.semesterHistory.push({
          fromSemester: prevSem,
          toSemester: nextSem,
          changedAt: nowIso,
          changedBy: `${params.actor.actorName} (${params.actor.actorEmployeeId})`,
          reason: `Directory upload (${session.fileName})`,
        });
      }
      existing.studentName = row.studentName;
      existing.dob = row.dob;
      existing.semesterNumber = nextSem;
      existing.section = row.section || existing.section;
      existing.attributes = { ...existing.attributes, ...row.attributes };
      existing.updatedAt = nowIso;
      updatedCount++;
      affectedBranches.add(existing.branchCode);
    } else {
      unchangedCount++;
    }
  }

  saveMockDb(db);

  const deptLabel =
    Array.from(affectedBranches).join(', ') || params.actor.branchCode || 'ALL';

  // Audit entries MUST NEVER include DOB
  if (addedCount > 0) {
    appendAuditLog({
      actorName: params.actor.actorName,
      actorEmployeeId: params.actor.actorEmployeeId,
      actorRole: params.actor.role === 'HOD' ? 'HOD' : 'PRINCIPAL',
      actionCategory: 'STUDENT_DIRECTORY_ADDED',
      activityDescription: `Added ${addedCount} student(s) to directory from "${session.fileName}" [Raw Audit ID: ${session.rawUploadAuditId}].`,
      departmentCode: deptLabel,
      status: 'Verified',
    });
  }
  if (updatedCount > 0) {
    appendAuditLog({
      actorName: params.actor.actorName,
      actorEmployeeId: params.actor.actorEmployeeId,
      actorRole: params.actor.role === 'HOD' ? 'HOD' : 'PRINCIPAL',
      actionCategory: 'STUDENT_DIRECTORY_UPDATED',
      activityDescription: `Updated ${updatedCount} existing student(s) from "${session.fileName}" without deleting unlisted students.`,
      departmentCode: deptLabel,
      status: 'Verified',
    });
  }

  return {
    addedCount,
    updatedCount,
    unchangedCount,
    skippedErrorCount,
    rawUploadAuditId: session.rawUploadAuditId,
  };
}

export function buildCorrectedStudentExcelBytes(previewId: string): Uint8Array {
  const session = studentPreviewSessions.get(previewId);
  if (!session) throw new Error('Student upload preview session not found.');

  const extraCols = session.extraColumns;
  const headers = ['USN', 'Name', 'DOB', 'Branch', 'Semester', 'Section', ...extraCols];
  const validRows = session.rows.filter(
    (r) => !r.excluded && r.disposition !== 'ERROR' && r.disposition !== 'CONFLICT',
  );

  const rows = validRows.map((r) => [
    r.usn,
    r.studentName,
    r.dob,
    r.branchCode,
    r.semesterNumber ?? '',
    r.section,
    ...extraCols.map((col) => r.attributes[col] ?? ''),
  ]);

  return buildXlsxBuffer({
    sheetName: 'Students_Corrected',
    headers,
    rows,
  });
}
