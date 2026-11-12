import { appendAuditLog, getMockDb, saveMockDb } from '../data/mockDatabase';
import {
  ExamVersionAssignment,
  PublicStudentDirectoryRecord,
  StudentAuthSession,
  StudentQuestionViewItem,
} from '../types';
import { sha256Hex } from './imageStorage';
import { generateShuffledPaperSets, getStudentQuestionView } from './questionImageExcelService';
import {
  assignExamVersionsForExam,
  DirectoryActorContext,
  PortalAccessError,
  toPublicStudentRecord,
} from './studentDirectoryPort';

const SERVER_SIGNING_SECRET = 'MIT_MYSORE_EXAM_TOKEN_SECRET_V1';

export interface StudentLoginInput {
  usn: string;
  dob: string; // YYYY-MM-DD from <input type="date">
  sessionCode?: string;
  examId?: string;
  clientId?: string;
  nowMs?: number;
}

export interface StudentExamPayload {
  student: PublicStudentDirectoryRecord;
  exam: {
    id: string;
    examCycleName: string;
    subjectCode: string;
    subjectName: string;
    examDate: string;
    sessionTime: string;
  };
  assignedVersion: 'A' | 'B' | 'C' | 'D';
  seatOrder: number;
  roomCode: string;
  questions: StudentQuestionViewItem[];
  expiresAt: number;
}

function encodeB64Url(text: string): string {
  const b64 =
    typeof Buffer !== 'undefined'
      ? Buffer.from(text, 'utf-8').toString('base64')
      : btoa(unescape(encodeURIComponent(text)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeB64Url(b64u: string): string {
  const padded = b64u.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64u.length + 3) % 4);
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(padded, 'base64').toString('utf-8');
  }
  return decodeURIComponent(escape(atob(padded)));
}

function signPayload(payloadB64: string): string {
  return sha256Hex(new TextEncoder().encode(`${SERVER_SIGNING_SECRET}:${payloadB64}`));
}

function isStudentEligibleForConfig(
  studentUsn: string,
  studentBranch: string,
  studentSem: number,
  studentSec: string,
  cfg: {
    allowedBranches: string[];
    semesterNumber: number;
    allowedSections: string[];
    isFrozen: boolean;
    eligibleUsnsSnapshot: string[];
  },
): boolean {
  if (cfg.isFrozen) {
    return cfg.eligibleUsnsSnapshot.includes(studentUsn);
  }
  const branchOk = cfg.allowedBranches
    .map((b) => b.toUpperCase())
    .includes(studentBranch.toUpperCase());
  const semOk = cfg.semesterNumber === studentSem;
  const secSet = cfg.allowedSections.map((s) => s.toUpperCase().replace(/^SECTION\s+/i, ''));
  const secOk = secSet.length === 0 || secSet.includes(studentSec.toUpperCase());
  return branchOk && semOk && secOk;
}

function recordFailedAttempt(
  cleanUsn: string,
  clientId: string,
  nowMs: number,
): void {
  const db = getMockDb();
  const settings = db.directorySettings!;
  const state = db.studentLoginAuditState!;

  const usnEntry = state.failedAttemptsByUsn[cleanUsn] || { count: 0, lockedUntil: 0 };
  usnEntry.count += 1;
  if (usnEntry.count >= settings.maxLoginAttemptsPerUsn) {
    usnEntry.lockedUntil = nowMs + settings.lockoutDurationMs;
  }
  state.failedAttemptsByUsn[cleanUsn] = usnEntry;

  const clientEntry = state.failedAttemptsByClient[clientId] || { count: 0, lockedUntil: 0 };
  clientEntry.count += 1;
  if (clientEntry.count >= settings.maxLoginAttemptsPerClient) {
    clientEntry.lockedUntil = nowMs + settings.lockoutDurationMs;
  }
  state.failedAttemptsByClient[clientId] = clientEntry;

  saveMockDb(db);
}

export function loginStudent(input: StudentLoginInput): StudentAuthSession {
  const nowMs = input.nowMs ?? Date.now();
  const cleanUsn = input.usn.trim().toUpperCase();
  const cleanDob = input.dob.trim();
  const clientId = (input.clientId || 'browser-client').trim();

  const db = getMockDb();
  const settings = db.directorySettings!;
  const state = db.studentLoginAuditState!;

  const usnLock = state.failedAttemptsByUsn[cleanUsn];
  if (usnLock && usnLock.lockedUntil > nowMs) {
    throw new PortalAccessError(
      429,
      'Too many failed attempts for this USN. Account temporarily locked.',
    );
  }

  const clientLock = state.failedAttemptsByClient[clientId];
  if (clientLock && clientLock.lockedUntil > nowMs) {
    throw new PortalAccessError(
      429,
      'Too many failed attempts from this client. Please try again later.',
    );
  }

  if (settings.sessionAccessCodeEnabled) {
    const providedCode = (input.sessionCode || '').trim();
    if (!providedCode || providedCode !== settings.sessionAccessCode) {
      recordFailedAttempt(cleanUsn, clientId, nowMs);
      throw new PortalAccessError(401, 'Details not found');
    }
  }

  const record = (db.studentDirectory || []).find((s) => s.usn === cleanUsn);
  if (!record || !cleanDob || record.dob !== cleanDob) {
    recordFailedAttempt(cleanUsn, clientId, nowMs);
    throw new PortalAccessError(401, 'Details not found');
  }

  // Credentials valid: reset rate limit counters for this USN & client
  delete state.failedAttemptsByUsn[cleanUsn];
  delete state.failedAttemptsByClient[clientId];
  saveMockDb(db);

  // Check ACTIVE status and exam eligibility
  if (record.status !== 'ACTIVE') {
    throw new PortalAccessError(403, 'Not scheduled');
  }

  const configs = db.examEligibilityConfigs || [];
  let targetConfig = input.examId ? configs.find((c) => c.examId === input.examId) : undefined;
  if (input.examId && !targetConfig) {
    throw new PortalAccessError(403, 'Not scheduled');
  }
  if (!targetConfig) {
    targetConfig = configs.find((c) =>
      isStudentEligibleForConfig(
        record.usn,
        record.branchCode,
        record.semesterNumber,
        record.section,
        c,
      ),
    );
  }

  if (
    !targetConfig ||
    !isStudentEligibleForConfig(
      record.usn,
      record.branchCode,
      record.semesterNumber,
      record.section,
      targetConfig,
    )
  ) {
    throw new PortalAccessError(403, 'Not scheduled');
  }

  // Single active session check per student
  const existingSession = state.activeTokensByUsn[cleanUsn];
  if (existingSession && existingSession.expiresAt > nowMs) {
    throw new PortalAccessError(
      409,
      'Already logged in on an active session. Contact invigilator to reset session.',
    );
  }

  const nextVersion = (existingSession?.sessionVersion ?? 0) + 1;
  const issuedAt = nowMs;
  const expiresAt = nowMs + settings.tokenTtlMs;

  const payloadB64 = encodeB64Url(
    JSON.stringify({
      usn: cleanUsn,
      examId: targetConfig.examId,
      iat: issuedAt,
      exp: expiresAt,
      ver: nextVersion,
    }),
  );
  const signature = signPayload(payloadB64);
  const token = `${payloadB64}.${signature}`;

  const session: StudentAuthSession = {
    token,
    usn: cleanUsn,
    examId: targetConfig.examId,
    issuedAt,
    expiresAt,
    signature,
    sessionVersion: nextVersion,
  };

  state.activeTokensByUsn[cleanUsn] = session;
  saveMockDb(db);

  return { ...session };
}

export function verifyStudentToken(
  token: string,
  nowMs: number = Date.now(),
): StudentAuthSession {
  const parts = token.split('.');
  if (parts.length !== 2) {
    throw new PortalAccessError(401, 'Invalid student token.');
  }
  const [payloadB64, sig] = parts;
  if (signPayload(payloadB64) !== sig) {
    throw new PortalAccessError(401, 'Invalid token signature.');
  }

  let parsed: { usn: string; examId: string; iat: number; exp: number; ver: number };
  try {
    parsed = JSON.parse(decodeB64Url(payloadB64));
  } catch {
    throw new PortalAccessError(401, 'Malformed student token payload.');
  }

  if (parsed.exp <= nowMs) {
    throw new PortalAccessError(401, 'Student session token has expired.');
  }

  const db = getMockDb();
  const active = db.studentLoginAuditState?.activeTokensByUsn[parsed.usn];
  if (!active || active.token !== token) {
    throw new PortalAccessError(401, 'Session invalidated or reset by invigilator.');
  }

  const record = (db.studentDirectory || []).find((s) => s.usn === parsed.usn);
  if (!record || record.status !== 'ACTIVE') {
    throw new PortalAccessError(403, 'Not scheduled');
  }

  return active;
}

export function resetStudentLoginSession(params: {
  usn: string;
  actor: DirectoryActorContext;
}): boolean {
  if (
    params.actor.role !== 'HOD' &&
    params.actor.role !== 'PRINCIPAL' &&
    params.actor.role !== 'COE' &&
    params.actor.role !== 'INVIGILATOR'
  ) {
    throw new PortalAccessError(403, 'Unauthorized to reset student session.');
  }
  const db = getMockDb();
  const cleanUsn = params.usn.trim().toUpperCase();
  const existed = Boolean(db.studentLoginAuditState?.activeTokensByUsn[cleanUsn]);
  if (db.studentLoginAuditState?.activeTokensByUsn[cleanUsn]) {
    delete db.studentLoginAuditState.activeTokensByUsn[cleanUsn];
  }
  if (db.studentLoginAuditState?.failedAttemptsByUsn[cleanUsn]) {
    delete db.studentLoginAuditState.failedAttemptsByUsn[cleanUsn];
  }
  saveMockDb(db);

  const student = (db.studentDirectory || []).find((s) => s.usn === cleanUsn);
  appendAuditLog({
    actorName: params.actor.actorName,
    actorEmployeeId: params.actor.actorEmployeeId,
    actorRole: params.actor.role === 'INVIGILATOR' || params.actor.role === 'COE' ? 'COE' : params.actor.role,
    actionCategory: 'STUDENT_SESSION_RESET',
    activityDescription: `Reset login session and lockout counters for student ${cleanUsn}.`,
    departmentCode: student?.branchCode || 'ALL',
    status: 'Completed',
  });

  return existed;
}

export function logoutStudentSession(token: string): void {
  const db = getMockDb();
  for (const [usn, s] of Object.entries(db.studentLoginAuditState?.activeTokensByUsn || {})) {
    if (s.token === token) {
      delete db.studentLoginAuditState!.activeTokensByUsn[usn];
      saveMockDb(db);
      return;
    }
  }
}

export function getStudentExamView(
  token: string,
  nowMs: number = Date.now(),
): StudentExamPayload {
  const session = verifyStudentToken(token, nowMs);
  const db = getMockDb();

  const record = (db.studentDirectory || []).find((s) => s.usn === session.usn);
  if (!record || record.status !== 'ACTIVE') {
    throw new PortalAccessError(403, 'Not scheduled');
  }

  const exam = db.examSchedules.find((ex) => ex.id === session.examId);
  if (!exam) {
    throw new PortalAccessError(403, 'Not scheduled');
  }

  // Ensure version assignment exists (deterministically compute if not yet cached)
  let assignments: ExamVersionAssignment[] = db.examVersionAssignments?.[exam.id] || [];
  let myAssignment = assignments.find((a) => a.usn === record.usn);
  if (!myAssignment) {
    assignments = assignExamVersionsForExam({
      examId: exam.id,
      actor: {
        role: 'COE',
        actorName: 'System Exam Scheduler',
        actorEmployeeId: 'SYSTEM-COE',
      },
    });
    myAssignment = assignments.find((a) => a.usn === record.usn);
  }
  const assignedVersion: 'A' | 'B' | 'C' | 'D' = myAssignment?.assignedVersion || 'A';

  const bank = db.questionBanks.find((qb) => qb.subjectId === exam.subjectId) || db.questionBanks[0];
  const sets = generateShuffledPaperSets({
    questions: bank ? bank.questions : [],
    subjectId: exam.subjectId,
    subjectCode: exam.subjectCode,
    seed: `${exam.id}-${exam.subjectCode}`,
    questionCount: Math.min(25, bank?.questions.length || 0),
  });

  const questions = getStudentQuestionView(sets[assignedVersion].questions);

  return {
    student: toPublicStudentRecord(record), // Never contains DOB
    exam: {
      id: exam.id,
      examCycleName: exam.examCycleName,
      subjectCode: exam.subjectCode,
      subjectName: exam.subjectName,
      examDate: exam.examDate,
      sessionTime: exam.sessionTime,
    },
    assignedVersion,
    seatOrder: myAssignment?.seatOrder ?? 1,
    roomCode: myAssignment?.roomCode ?? `${record.branchCode}-${record.section}`,
    questions,
    expiresAt: session.expiresAt,
  };
}
