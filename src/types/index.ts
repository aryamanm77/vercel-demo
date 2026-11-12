export type UserRole = 'ADMIN' | 'HOD' | 'COE' | 'INVIGILATOR' | 'STUDENT';
export type AuthMode = 'standalone' | 'host';
export type ModuleStatus = 'EMPTY' | 'READY' | string;
export type ExamType = 'INTERNAL' | 'SEE';
export type ExamSessionSlot = 'MORNING' | 'AFTERNOON';
export type SessionStatus = 'DRAFT' | 'FROZEN' | 'LIVE' | 'ENDED' | string;
export type StudentLoginState = 'NOT_STARTED' | 'ACTIVE' | 'DISCONNECTED' | 'FINISHED' | string;
export type RowStatus = 'VALID' | 'WARNING' | 'ERROR' | 'EXCLUDED' | 'DUPLICATE_SKIPPED' | string;
export type ImportSeverity = 'ERROR' | 'WARNING' | 'INFO' | string;

export interface UserView {
  id: number;
  username: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  mustChangePassword: boolean;
  failedLoginAttempts: number;
  lockedUntil: string | null;
}

export interface AuthInfoResponse {
  authMode: AuthMode;
  setupRequired: boolean;
  user: UserView | null;
}

export interface LoginResponse {
  token: string;
  expiresAt: string;
  user: UserView;
}

export interface Subject {
  id: number;
  code: string;
  name: string;
  expectedQuestionsPerModule: number;
  marksPerQuestion: number;
  archived: boolean;
  createdAt: string;
}

export interface SubjectModule {
  id: number;
  subjectId: number;
  subjectCode: string;
  moduleNumber: number;
  status: ModuleStatus;
  questionCount: number;
  lastImportFilename: string | null;
  lastImportedBy: string | null;
  lastImportedAt: string | null;
  lastErrorCount: number;
  lastWarningCount: number;
}

export interface ImportIssue {
  sheet: string | null;
  row: number;
  severity: ImportSeverity;
  message: string;
}

export interface ParsedQuestionRow {
  sourceRow: number;
  questionText: string;
  normalizedHash: string | null;
  options: string[];
  rawAnswerInput: string | null;
  correctIndex: number | null;
  answerInferredFromText: boolean;
  duplicateSkipped: boolean;
  excluded: boolean;
  status: RowStatus;
  issues: ImportIssue[];
}

export interface ImportPreviewResult {
  previewId: string;
  subjectId: number;
  subjectCode: string;
  moduleNumber: number;
  filename: string;
  sheetName: string;
  totalRows: number;
  validCount: number;
  warningCount: number;
  errorCount: number;
  duplicateSkippedCount: number;
  excludedCount: number;
  expectedCount: number;
  canConfirmDirectly: boolean;
  issues: ImportIssue[];
  rows: ParsedQuestionRow[];
}

export interface ConfirmImportResult {
  subjectId: number;
  subjectCode: string;
  moduleNumber: number;
  status: ModuleStatus;
  questionCount: number;
  warningCount: number;
}

export interface BlueprintResult {
  examType: ExamType;
  totalMarks: number;
  marksPerQuestion: number;
  totalQuestions: number;
  selectedModules: number[];
  rotationOffset: number;
  moduleCounts: Record<string, number>;
  summaryText: string;
}

export interface SessionOverview {
  sessionId: number;
  examId: number;
  subjectCode: string;
  title: string;
  examType: ExamType;
  examDate: string;
  slot: ExamSessionSlot;
  status: SessionStatus;
  chosenSetNumber: number | null;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  version: number;
  hasAfternoon: boolean;
}

export interface SetSummaryCard {
  setNumber: number;
  status: string;
  questionCount: number;
}

export interface ApprovalConfirmation {
  subjectCode: string;
  subjectName: string;
  examTitle: string;
  examType: ExamType;
  slot: ExamSessionSlot;
  examDate: string;
  setNumber: number;
  questionCount: number;
  totalMarks: number;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  version: number;
}

export interface StudentRegistrationRequest {
  rollNumber: string;
  fullName: string;
  roomCode: string;
  rowNumber: number | null;
  seatNumber: number | null;
  fontScale: number;
  highContrast: boolean;
  accommodationExtraMinutes: number;
}

export interface IssuedStudentCredential {
  rollNumber: string;
  fullName: string;
  roomCode: string;
  rowNumber: number | null;
  seatNumber: number | null;
  assignedVersion: string;
  oneTimeAccessCode: string;
  fontScale: number;
  highContrast: boolean;
  accommodationExtraMinutes: number;
}

export interface RosterStudentSummary {
  rollNumber: string;
  fullName: string;
  roomCode: string;
  rowNumber: number | null;
  seatNumber: number | null;
  assignedVersion: string;
  loginState: StudentLoginState;
  fontScale: number;
  highContrast: boolean;
  accommodationExtraMinutes: number;
  grantedExtraMinutes: number;
}

export interface InvigilatorStudentStatus {
  rollNumber: string;
  fullName: string;
  roomCode: string;
  rowNumber: number | null;
  seatNumber: number | null;
  observedState: StudentLoginState;
  answeredCount: number;
  lastQuestionIndex: number;
  totalExtraMinutes: number;
  effectiveEndAt: string | null;
  lastHeartbeatAt: string | null;
  finishedAt: string | null;
}

export interface ExtraTimeGrant {
  id: number | null;
  sessionId: number | null;
  roomCode: string | null;
  rollNumber: string | null;
  extraMinutes: number;
  reason: string;
  grantedBy: string;
  grantedAt: string;
}

export interface RoomMonitorView {
  sessionId: number;
  roomCode: string | null;
  sessionStatus: SessionStatus;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  serverNow: string;
  totalStudents: number;
  activeCount: number;
  disconnectedCount: number;
  finishedCount: number;
  notStartedCount: number;
  students: InvigilatorStudentStatus[];
  recentGrants: ExtraTimeGrant[];
}

export interface HealthSnapshot {
  dbStatus: string;
  dbLatencyMs: number;
  diskFreeMb: number;
  liveSessionCount: number;
  frozenSessionCount: number;
  totalRegisteredStudents: number;
  backupCount: number;
  lastBackupAt: string | null;
  serverErrorsCount: number;
  lastErrorAt: string | null;
  alerts: string[];
  checkedAt: string;
}

export interface AuditLogEntry {
  id: number;
  seqNo: number;
  eventType: string;
  actorUsername: string;
  actorRole: string;
  entityType: string;
  entityId: string;
  detailsJson: string;
  createdAt: string;
  prevHash: string;
  entryHash: string;
}

export interface AuditVerificationResult {
  intact: boolean;
  totalChecked: number;
  firstBrokenSeqNo: number | null;
  message: string;
}

export interface StoredObjectInfo {
  key: string;
  sizeBytes: number;
  modifiedAt: string;
}

export interface BackupCreatedSummary {
  filename: string;
  sizeBytes: number;
  createdAt: string;
  payloadSha256: string;
  rowCounts: Record<string, number>;
}

export interface BackupInspection {
  formatVersion: number;
  createdAt: string;
  dialect: string;
  payloadSha256: string;
  rowCounts: Record<string, number>;
}

export interface StudentScoreResult {
  rollNumber: string;
  fullName: string;
  roomCode: string;
  assignedVersion: string;
  totalQuestions: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  marksAwarded: number;
  maxMarks: number;
}

export interface ResultsJsonResponse {
  examId: number;
  subjectCode: string;
  title: string;
  sessionId: number;
  slot: ExamSessionSlot;
  csvSha256: string;
  xlsxSha256: string;
  results: StudentScoreResult[];
}

export interface PublicSessionOption {
  sessionId: number;
  subjectCode: string;
  title: string;
  slot: ExamSessionSlot;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
}

export interface StudentLoginHttpResponse {
  signedToken: string;
  sessionId: number;
  rollNumber: string;
  fullName: string;
  assignedVersion: string;
  scheduledStartAt: string | null;
  effectiveEndAt: string;
  fontScale: number;
  highContrast: boolean;
  lastQuestionIndex: number;
  serverNow: string;
}

export interface StudentQuestionView {
  position: number;
  text: string;
  options: string[];
}

export interface StudentPaperPayload {
  sessionId: number;
  rollNumber: string;
  fullName: string;
  assignedVersion: string;
  scheduledStartAt: string | null;
  effectiveEndAt: string;
  serverNow: string;
  fontScale: number;
  highContrast: boolean;
  lastQuestionIndex: number;
  questions: StudentQuestionView[];
  savedSelections: Record<string, number>;
}

export interface SaveAnswersAck {
  sessionId: number;
  savedCount: number;
  serverNow: string;
  effectiveEndAt: string;
}

export interface HeartbeatView {
  serverNow: string;
  effectiveEndAt: string;
  sessionStatus: SessionStatus;
}

export interface FinishExamAck {
  sessionId: number;
  rollNumber: string;
  finishedAt: string;
}
