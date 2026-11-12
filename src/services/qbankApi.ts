import type {
  ApprovalConfirmation,
  AuditLogEntry,
  AuditVerificationResult,
  AuthInfoResponse,
  BackupCreatedSummary,
  BackupInspection,
  BlueprintResult,
  ConfirmImportResult,
  ExamType,
  ExtraTimeGrant,
  FinishExamAck,
  HealthSnapshot,
  HeartbeatView,
  ImportPreviewResult,
  IssuedStudentCredential,
  LoginResponse,
  PublicSessionOption,
  ResultsJsonResponse,
  RoomMonitorView,
  RosterStudentSummary,
  SaveAnswersAck,
  SessionOverview,
  SetSummaryCard,
  StoredObjectInfo,
  StudentLoginHttpResponse,
  StudentPaperPayload,
  StudentRegistrationRequest,
  Subject,
  SubjectModule,
  UserRole,
  UserView,
} from '../types';

export const STAFF_TOKEN_KEY = 'qbank_staff_token';
export const STUDENT_TOKEN_KEY = 'qbank_student_jwt';

export class QBankApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'QBankApiError';
    this.status = status;
    this.code = code;
  }
}

export function getQBankBasePath(): string {
  if (typeof window !== 'undefined') {
    const win = window as unknown as { QBANK_BASE_PATH?: string };
    if (typeof win.QBANK_BASE_PATH === 'string' && win.QBANK_BASE_PATH.trim()) {
      return normalizeBasePath(win.QBANK_BASE_PATH);
    }
  }
  const envBase = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_QBANK_BASE_PATH;
  return normalizeBasePath(envBase || '/qbank');
}

function normalizeBasePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '/') return '';
  const withLead = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLead.endsWith('/') ? withLead.slice(0, -1) : withLead;
}

export function getStaffToken(): string | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage.getItem(STAFF_TOKEN_KEY) : null;
  } catch {
    return null;
  }
}

export function setStaffToken(token: string | null): void {
  try {
    if (typeof window === 'undefined') return;
    if (token) window.sessionStorage.setItem(STAFF_TOKEN_KEY, token);
    else window.sessionStorage.removeItem(STAFF_TOKEN_KEY);
  } catch {
    // ignore storage restriction
  }
}

export function getStudentToken(): string | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage.getItem(STUDENT_TOKEN_KEY) : null;
  } catch {
    return null;
  }
}

export function setStudentToken(token: string | null): void {
  try {
    if (typeof window === 'undefined') return;
    if (token) window.sessionStorage.setItem(STUDENT_TOKEN_KEY, token);
    else window.sessionStorage.removeItem(STUDENT_TOKEN_KEY);
  } catch {
    // ignore storage restriction
  }
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

interface RequestOptions {
  method?: string;
  json?: unknown;
  body?: BodyInit;
  bearerToken?: string | null;
  responseType?: 'json' | 'blob';
  headers?: Record<string, string>;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const headers: Record<string, string> = { ...(options.headers || {}) };
  const token = options.bearerToken !== undefined ? options.bearerToken : getStaffToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const xsrf = readCookie('XSRF-TOKEN');
  if (xsrf && method !== 'GET' && method !== 'HEAD') {
    headers['X-XSRF-TOKEN'] = xsrf;
  }

  let body = options.body;
  if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.json);
  }

  const url = `${getQBankBasePath()}/api/v1${path}`;
  const resp = await fetch(url, {
    method,
    headers,
    credentials: 'same-origin',
    body,
  });

  const contentType = resp.headers.get('content-type') || '';
  if (!resp.ok) {
    let errMsg = `HTTP ${resp.status}`;
    let errCode = `HTTP_${resp.status}`;
    try {
      if (contentType.includes('application/json')) {
        const errBody = (await resp.json()) as { message?: string; code?: string };
        errMsg = errBody.message || errMsg;
        errCode = errBody.code || errCode;
      } else {
        const txt = await resp.text();
        if (txt) errMsg = txt;
      }
    } catch {
      // ignore parse failure
    }
    throw new QBankApiError(errMsg, resp.status, errCode);
  }

  if (options.responseType === 'blob') {
    return (await resp.blob()) as unknown as T;
  }
  if (resp.status === 204) {
    return null as T;
  }
  if (contentType.includes('application/json')) {
    return (await resp.json()) as T;
  }
  return (await resp.text()) as unknown as T;
}

export const qbankApi = {
  auth: {
    info: () => request<AuthInfoResponse>('/auth/info'),
    setupAdmin: (payload: { username: string; displayName: string; password: string }) =>
      request<UserView>('/auth/setup-admin', { method: 'POST', bearerToken: null, json: payload }),
    login: (payload: { username: string; password: string }) =>
      request<LoginResponse>('/auth/login', { method: 'POST', bearerToken: null, json: payload }),
    logout: () => request<{ status?: string }>('/auth/logout', { method: 'POST' }),
    changePassword: (payload: { currentPassword: string; newPassword: string }) =>
      request<{ status?: string }>('/auth/change-password', { method: 'POST', json: payload }),
  },

  subjects: {
    list: (includeArchived = false) =>
      request<Subject[]>(`/subjects${includeArchived ? '?includeArchived=true' : ''}`),
    modules: (subjectId: number) => request<SubjectModule[]>(`/subjects/${subjectId}/modules`),
    create: (payload: {
      code: string;
      name: string;
      expectedQuestionsPerModule: number;
      marksPerQuestion: number;
    }) => request<Subject>('/subjects', { method: 'POST', json: payload }),
    update: (
      subjectId: number,
      payload: {
        name: string;
        expectedQuestionsPerModule: number;
        marksPerQuestion: number;
        archived: boolean;
      }
    ) => request<Subject>(`/admin/subjects/${subjectId}`, { method: 'PUT', json: payload }),
  },

  admin: {
    listUsers: () => request<UserView[]>('/admin/users'),
    createUser: (payload: {
      username: string;
      displayName: string;
      role: Exclude<UserRole, 'STUDENT'>;
      temporaryPassword: string;
    }) => request<UserView>('/admin/users', { method: 'POST', json: payload }),
    updateUser: (userId: number, payload: { active: boolean; clearLockout: boolean }) =>
      request<UserView>(`/admin/users/${userId}`, { method: 'PUT', json: payload }),
    health: () => request<HealthSnapshot>('/admin/health'),
    listAudit: (params: { limit?: number; eventType?: string; actor?: string } = {}) => {
      const sp = new URLSearchParams();
      if (params.limit) sp.set('limit', String(params.limit));
      if (params.eventType?.trim()) sp.set('eventType', params.eventType.trim());
      if (params.actor?.trim()) sp.set('actor', params.actor.trim());
      const q = sp.toString();
      return request<AuditLogEntry[]>(`/admin/audit${q ? `?${q}` : ''}`);
    },
    verifyAuditChain: () => request<AuditVerificationResult>('/admin/audit/verify', { method: 'POST' }),
    listBackups: () => request<StoredObjectInfo[]>('/admin/backups'),
    createBackup: (tag = 'manual') =>
      request<BackupCreatedSummary>(`/admin/backups?tag=${encodeURIComponent(tag)}`, { method: 'POST' }),
    downloadBackup: (filename: string) =>
      request<Blob>(`/admin/backups/${encodeURIComponent(filename)}`, { responseType: 'blob' }),
    inspectBackup: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return request<BackupInspection>('/admin/backups/inspect', { method: 'POST', body: fd });
    },
    restoreBackup: (file: File, confirm: boolean) => {
      const fd = new FormData();
      fd.append('file', file);
      return request<BackupInspection>(`/admin/backups/restore?confirm=${confirm ? 'true' : 'false'}`, {
        method: 'POST',
        body: fd,
      });
    },
    getResults: (sessionId: number) => request<ResultsJsonResponse>(`/admin/sessions/${sessionId}/results`),
    downloadResultsCsv: (sessionId: number) =>
      request<Blob>(`/admin/sessions/${sessionId}/results.csv`, { responseType: 'blob' }),
    downloadResultsXlsx: (sessionId: number) =>
      request<Blob>(`/admin/sessions/${sessionId}/results.xlsx`, { responseType: 'blob' }),
    purgeRetention: (retentionDays?: number) => {
      const q = retentionDays ? `?retentionDays=${encodeURIComponent(String(retentionDays))}` : '';
      return request<Record<string, unknown>>(`/admin/retention/purge${q}`, { method: 'DELETE' });
    },
  },

  hod: {
    downloadTemplate: (multi = true) =>
      request<Blob>(`/hod/template?multi=${multi ? 'true' : 'false'}`, { responseType: 'blob' }),
    previewMulti: (subjectId: number, file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return request<ImportPreviewResult[]>(`/hod/subjects/${subjectId}/import-multi/preview`, {
        method: 'POST',
        body: fd,
      });
    },
    previewSingle: (subjectId: number, moduleNumber: number, file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return request<ImportPreviewResult>(
        `/hod/subjects/${subjectId}/modules/${moduleNumber}/preview`,
        { method: 'POST', body: fd }
      );
    },
    updatePreviewRow: (
      previewId: string,
      sourceRow: number,
      payload: {
        questionText: string;
        options: string[];
        correctIndex: number | null;
        excluded: boolean;
      }
    ) =>
      request<ImportPreviewResult>(`/hod/previews/${encodeURIComponent(previewId)}/rows/${sourceRow}`, {
        method: 'PUT',
        json: payload,
      }),
    confirmPreview: (previewId: string) =>
      request<ConfirmImportResult>(`/hod/previews/${encodeURIComponent(previewId)}/confirm`, {
        method: 'POST',
      }),
    discardPreview: (previewId: string) =>
      request<void>(`/hod/previews/${encodeURIComponent(previewId)}`, { method: 'DELETE' }),
  },

  coe: {
    blueprint: (payload: {
      subjectId: number;
      examType: ExamType;
      modules: number[];
      rotationOffset: number;
    }) => request<BlueprintResult>('/coe/blueprint', { method: 'POST', json: payload }),
    generateExam: (payload: {
      subjectId: number;
      title: string | null;
      examType: ExamType;
      modules: number[];
      examDate: string;
      rotationOffset: number;
      includeAfternoon: boolean;
      morningStartAt: string;
      morningEndAt: string;
      afternoonStartAt: string | null;
      afternoonEndAt: string | null;
    }) => request<unknown>('/coe/exams/generate', { method: 'POST', json: payload }),
    addAfternoon: (examId: number, payload: { startAt: string; endAt: string }) =>
      request<unknown>(`/coe/exams/${examId}/afternoon`, { method: 'POST', json: payload }),
    listSessions: () => request<SessionOverview[]>('/coe/sessions'),
    listSetCards: (sessionId: number) => request<SetSummaryCard[]>(`/coe/sessions/${sessionId}/sets`),
    approvalPreview: (sessionId: number, setNumber: number) =>
      request<ApprovalConfirmation>(`/coe/sessions/${sessionId}/sets/${setNumber}/approval-preview`),
    approveSession: (
      sessionId: number,
      payload: {
        setNumber: number;
        expectedVersion: number;
        scheduledStartAt?: string | null;
        scheduledEndAt?: string | null;
      }
    ) => request<unknown>(`/coe/sessions/${sessionId}/approve`, { method: 'POST', json: payload }),
    startSession: (sessionId: number) =>
      request<unknown>(`/coe/sessions/${sessionId}/start`, { method: 'POST' }),
    stopSession: (sessionId: number) =>
      request<unknown>(`/coe/sessions/${sessionId}/stop`, { method: 'POST' }),
    listRoster: (sessionId: number) =>
      request<RosterStudentSummary[]>(`/coe/sessions/${sessionId}/students`),
    registerStudents: (sessionId: number, students: StudentRegistrationRequest[]) =>
      request<IssuedStudentCredential[]>(`/coe/sessions/${sessionId}/students`, {
        method: 'POST',
        json: { students },
      }),
    updateAccommodation: (
      sessionId: number,
      rollNumber: string,
      payload: { fontScale: number; highContrast: boolean; accommodationExtraMinutes: number }
    ) =>
      request<RosterStudentSummary>(
        `/coe/sessions/${sessionId}/students/${encodeURIComponent(rollNumber)}/accommodation`,
        { method: 'PUT', json: payload }
      ),
    reissueCode: (sessionId: number, rollNumber: string) =>
      request<IssuedStudentCredential>(
        `/coe/sessions/${sessionId}/students/${encodeURIComponent(rollNumber)}/reissue-code`,
        { method: 'POST' }
      ),
  },

  invigilator: {
    monitorRoom: (sessionId: number, roomCode?: string) => {
      const q = roomCode?.trim() ? `?roomCode=${encodeURIComponent(roomCode.trim())}` : '';
      return request<RoomMonitorView>(`/invigilator/sessions/${sessionId}/monitor${q}`);
    },
    resetStudentLogin: (sessionId: number, rollNumber: string, reason: string) =>
      request<{ status?: string }>(
        `/invigilator/sessions/${sessionId}/students/${encodeURIComponent(rollNumber)}/reset-login`,
        { method: 'POST', json: { reason } }
      ),
    grantExtraTime: (
      sessionId: number,
      payload: {
        roomCode: string | null;
        rollNumber: string | null;
        extraMinutes: number;
        reason: string;
      }
    ) =>
      request<ExtraTimeGrant>(`/invigilator/sessions/${sessionId}/extra-time`, {
        method: 'POST',
        json: payload,
      }),
  },

  student: {
    publicSessions: () =>
      request<PublicSessionOption[]>('/student/public-sessions', { bearerToken: null }),
    login: (payload: { sessionId: number; rollNumber: string; accessCode: string }) =>
      request<StudentLoginHttpResponse>('/student/login', {
        method: 'POST',
        bearerToken: null,
        json: payload,
      }),
    getPaper: (studentToken: string) =>
      request<StudentPaperPayload>('/student/paper', { bearerToken: studentToken }),
    saveResponses: (
      studentToken: string,
      payload: {
        answers: Array<{
          questionPosition: number;
          selectedOptionIndex: number | null;
          clientTimestamp: string;
        }>;
        lastQuestionIndex: number;
      }
    ) =>
      request<SaveAnswersAck>('/student/responses', {
        method: 'POST',
        bearerToken: studentToken,
        json: payload,
      }),
    heartbeat: (studentToken: string, currentQuestionIndex: number) =>
      request<HeartbeatView>('/student/heartbeat', {
        method: 'POST',
        bearerToken: studentToken,
        json: { currentQuestionIndex },
      }),
    finish: (studentToken: string, lastQuestionIndex: number) =>
      request<FinishExamAck>('/student/finish', {
        method: 'POST',
        bearerToken: studentToken,
        json: { lastQuestionIndex },
      }),
  },
};
