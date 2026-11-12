export type UserRole = 'PRINCIPAL' | 'HOD';

export type StaffRole = 'HOD' | 'ACADEMIC_STAFF';

export type AccountStatus = 'Active' | 'Inactive' | 'Reset Pending';

export type DepartmentStatus = 'Active' | 'Inactive';

export type SubmissionStatus =
  | 'Draft'
  | 'Validation Failed'
  | 'Submitted'
  | 'Finalized'
  | 'Correction Requested';

export type RosterStatus =
  | 'Draft'
  | 'Validation Failed'
  | 'Submitted'
  | 'Frozen by COE'
  | 'Correction Requested';

export type DifficultyLevel = 'Moderate' | 'Standard' | 'Challenging';

export type ExamSessionStatus =
  | 'Scheduled'
  | 'Package Prepared'
  | 'Ready for Transfer'
  | 'Verified at Lab'
  | 'Completed'
  | 'Results Imported'
  | 'Approved / Released';

export type ResultApprovalStatus =
  | 'Pending Approval'
  | 'Approved / Released';

export interface AuthUser {
  id: string;
  employeeId: string;
  fullName: string;
  email: string;
  username: string;
  role: UserRole;
  designation: string;
  departmentId?: string;
  departmentCode?: string;
  departmentName?: string;
  phone?: string;
  lastLogin: string;
}

export interface Department {
  id: string;
  code: string;
  name: string;
  identificationNumber: string;
  hodUserId?: string;
  hodName?: string;
  hodEmail?: string;
  contactEmail: string;
  contactPhone: string;
  buildingBlock: string;
  status: DepartmentStatus;
  createdAt: string;
  totalSubjects: number;
  totalStudents: number;
  totalStaff: number;
  hasExamRecords: boolean;
}

export interface AcademicYear {
  id: string;
  label: string;
  isCurrent: boolean;
  status: 'Active' | 'Upcoming' | 'Archived';
  startDate: string;
  endDate: string;
}

export interface Semester {
  id: string;
  number: number;
  name: string;
  cycle: 'Odd' | 'Even';
  academicYearId: string;
  status: 'Active' | 'Upcoming' | 'Completed';
}

export interface SectionRecord {
  id: string;
  name: string;
  departmentId: string;
  departmentCode: string;
  semesterId: string;
  semesterNumber: number;
  academicYearId: string;
  maxCapacity: number;
  enrolledCount: number;
}

export interface Subject {
  id: string;
  code: string;
  name: string;
  departmentId: string;
  departmentCode: string;
  semesterId: string;
  semesterNumber: number;
  academicYearId: string;
  moduleCount: number; // Always 5 as per MIT Mysore exam structure
  credits: number;
  sections: string[];
  questionBankStatus: SubmissionStatus;
}

export interface StaffAccount {
  id: string;
  employeeId: string;
  fullName: string;
  email: string;
  designation: string;
  departmentId: string;
  departmentCode: string;
  departmentName: string;
  assignedRole: StaffRole;
  status: AccountStatus;
  assignedAt: string;
  previousHodHistory?: {
    departmentCode: string;
    fromDate: string;
    toDate: string;
  }[];
}

export interface MCQQuestion {
  questionId: string;
  subjectId: string;
  moduleNumber: 1 | 2 | 3 | 4 | 5;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: 'A' | 'B' | 'C' | 'D' | '';
  difficulty: DifficultyLevel;
  updatedAt: string;
  imageId?: string | null;
}

export interface QuestionBankValidationIssue {
  questionId: string;
  moduleNumber: number;
  type: 'MISSING_FIELD' | 'DUPLICATE_TEXT' | 'MISSING_ANSWER' | 'INVALID_OPTIONS' | 'DIFFICULTY_MISMATCH';
  message: string;
}

export interface QuestionImportIssue {
  rowNumber: number; // 1-based Excel row (0 if workbook-level)
  severity: 'ERROR' | 'WARNING';
  code:
    | 'HEADER_IMAGE_IGNORED'
    | 'OUTSIDE_ROW_IMAGE_IGNORED'
    | 'MULTIPLE_IMAGES_ON_ROW'
    | 'UNREADABLE_IMAGE'
    | 'UNSUPPORTED_IMAGE_FORMAT'
    | 'IMAGE_TOO_LARGE'
    | 'INVALID_ROW_DATA';
  message: string;
}

export interface QuestionPreviewRow {
  rowNumber: number; // 1-based Excel row
  moduleNumber: 1 | 2 | 3 | 4 | 5;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: 'A' | 'B' | 'C' | 'D' | '';
  difficulty: DifficultyLevel;
  imageId: string | null;
  imageSource?: 'floating' | 'in_cell' | 'manual' | null;
  warnings: QuestionImportIssue[];
  errors: string[];
  excluded?: boolean;
}

export interface QuestionImportPreviewSession {
  previewId: string;
  bankId: string;
  subjectId: string;
  moduleNumber: 1 | 2 | 3 | 4 | 5;
  fileName: string;
  createdAt: string;
  rows: QuestionPreviewRow[];
  issues: QuestionImportIssue[];
}

export interface ShuffledPaperQuestion {
  orderNumber: number;
  questionId: string;
  moduleNumber: 1 | 2 | 3 | 4 | 5;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: 'A' | 'B' | 'C' | 'D';
  imageId: string | null;
}

export interface GeneratedPaperSet {
  version: 'A' | 'B' | 'C' | 'D';
  subjectId: string;
  subjectCode: string;
  seed: string;
  questions: ShuffledPaperQuestion[];
  answerKey: Record<number, 'A' | 'B' | 'C' | 'D'>;
}

export interface CoeQuestionBankSummary {
  bankId: string;
  departmentCode: string;
  subjectCode: string;
  subjectName: string;
  revision: string;
  status: SubmissionStatus;
  totalQuestions: number;
  moduleCounts: Record<number, number>;
  finalizedAt?: string;
}

export interface StudentQuestionViewItem {
  orderNumber: number;
  questionId: string;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  imageDataUrl: string | null;
  imageId: string | null;
}

export interface ModuleProgress {
  moduleNumber: 1 | 2 | 3 | 4 | 5;
  totalUploaded: number;
  validCount: number;
  requiredCount: 60;
}

export interface QuestionBankRecord {
  id: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  departmentId: string;
  departmentCode: string;
  semesterId: string;
  semesterNumber: number;
  academicYearId: string;
  section: string;
  revisionNumber: string;
  declaredDifficulty: DifficultyLevel;
  status: SubmissionStatus;
  questions: MCQQuestion[];
  submittedBy?: string;
  submittedAt?: string;
  submissionReference?: string;
  correctionRequestNote?: string;
  correctionRequestedAt?: string;
}

export type StudentDirectoryStatus = 'ACTIVE' | 'INACTIVE';

export interface SemesterChangeEntry {
  fromSemester: number | null;
  toSemester: number;
  changedAt: string;
  changedBy: string;
  reason?: string;
}

export interface StudentRecord {
  id: string;
  usn: string;
  studentName: string;
  dob: string; // YYYY-MM-DD (never logged or returned in COE/student responses)
  departmentId: string;
  departmentCode: string;
  semesterId: string;
  semesterNumber: number;
  section: string;
  academicYearId: string;
  isValid: boolean;
  validationErrors: string[];
  status?: StudentDirectoryStatus;
  attributes?: Record<string, string>;
  semesterHistory?: SemesterChangeEntry[];
  updatedAt?: string;
}

export interface StudentDirectoryRecord {
  id: string;
  usn: string;
  studentName: string;
  dob: string; // ISO YYYY-MM-DD (stored internally only)
  departmentId: string;
  branchCode: string; // canonical normalized branch e.g. CSE, ECE
  semesterNumber: number;
  section: string;
  status: StudentDirectoryStatus;
  attributes: Record<string, string>;
  semesterHistory: SemesterChangeEntry[];
  createdAt: string;
  updatedAt: string;
}

export type PublicStudentDirectoryRecord = Omit<StudentDirectoryRecord, 'dob'>;

export type UploadIssueSeverity = 'ERROR' | 'WARNING';

export interface StudentUploadIssue {
  field: string;
  severity: UploadIssueSeverity;
  code:
    | 'MISSING_REQUIRED'
    | 'DUPLICATE_USN_IN_FILE'
    | 'WRONG_BRANCH'
    | 'CROSS_BRANCH_CONFLICT'
    | 'INVALID_USN_FORMAT'
    | 'AMBIGUOUS_DOB'
    | 'INVALID_DOB'
    | 'INVALID_SEMESTER'
    | 'UNKNOWN_BRANCH';
  message: string;
}

export type StudentRowDisposition = 'NEW' | 'UPDATED' | 'UNCHANGED' | 'CONFLICT' | 'ERROR' | 'EXCLUDED';

export interface StudentUploadPreviewRow {
  rowNumber: number; // 1-based Excel row
  usn: string;
  studentName: string;
  dob: string; // normalized ISO YYYY-MM-DD or raw if invalid
  branchRaw: string;
  branchCode: string; // normalized branch code
  semesterNumber: number | null;
  section: string;
  attributes: Record<string, string>;
  disposition: StudentRowDisposition;
  issues: StudentUploadIssue[];
  excluded: boolean;
}

export interface StudentUploadPreviewSession {
  previewId: string;
  fileName: string;
  uploadedBy: string;
  uploadedByRole: UserRole | 'COE';
  actorBranchCode?: string;
  uploadedAt: string;
  rawUploadAuditId: string;
  detectedColumns: Record<string, string>;
  extraColumns: string[];
  counts: {
    newCount: number;
    updatedCount: number;
    unchangedCount: number;
    conflictCount: number;
    errorCount: number;
    warningCount: number;
    excludedCount: number;
  };
  rows: StudentUploadPreviewRow[];
}

export interface StudentDirectorySettings {
  branchAliases: Record<string, string>; // lowercase alias -> canonical branch code
  usnRegex: string;
  usnStrictMode: boolean; // false -> WARNING, true -> ERROR
  dobDayFirst: boolean;
  sessionAccessCodeEnabled: boolean;
  sessionAccessCode: string;
  maxLoginAttemptsPerUsn: number;
  maxLoginAttemptsPerClient: number;
  lockoutDurationMs: number;
  tokenTtlMs: number;
}

export interface ExamEligibilityConfig {
  examId: string;
  allowedBranches: string[];
  semesterNumber: number;
  allowedSections: string[];
  isFrozen: boolean;
  frozenAt?: string;
  eligibleUsnsSnapshot: string[]; // frozen immutable snapshot when frozen
}

export interface ExamVersionAssignment {
  usn: string;
  studentName: string;
  branchCode: string;
  semesterNumber: number;
  section: string;
  roomCode: string;
  seatOrder: number;
  assignedVersion: 'A' | 'B' | 'C' | 'D';
}

export interface CoeStudentCountSummary {
  branchCode: string;
  semesterNumber: number;
  section: string;
  activeCount: number;
  inactiveCount: number;
  totalCount: number;
}

export interface StudentAuthSession {
  token: string;
  usn: string;
  examId: string;
  issuedAt: number;
  expiresAt: number;
  signature: string;
  sessionVersion: number;
}

export interface StudentLoginAuditState {
  activeTokensByUsn: Record<string, StudentAuthSession>;
  failedAttemptsByUsn: Record<string, { count: number; lockedUntil: number }>;
  failedAttemptsByClient: Record<string, { count: number; lockedUntil: number }>;
}

export interface StudentRosterSubmission {
  id: string;
  departmentId: string;
  departmentCode: string;
  academicYearId: string;
  semesterId: string;
  semesterNumber: number;
  section: string;
  version: string;
  totalStudents: number;
  validCount: number;
  invalidCount: number;
  duplicateUsnCount: number;
  missingInfoCount: number;
  status: RosterStatus;
  submittedBy?: string;
  submittedAt?: string;
  correctionRequestReason?: string;
  students: StudentRecord[];
}

export interface SubmissionHistoryEntry {
  id: string;
  referenceId: string;
  type: 'QUESTION_BANK' | 'STUDENT_ROSTER';
  departmentId: string;
  departmentCode: string;
  academicYearId: string;
  semesterNumber: number;
  section: string;
  subjectCode: string;
  subjectName: string;
  revision: string;
  questionCount: number;
  declaredDifficulty?: DifficultyLevel;
  rosterStatus: RosterStatus;
  rosterCount: number;
  submittedBy: string;
  submittedAt: string;
  status: SubmissionStatus;
  notes?: string;
}

export interface ExaminationScheduleItem {
  id: string;
  examCycleName: string;
  academicYearId: string;
  departmentId: string;
  departmentCode: string;
  semesterNumber: number;
  section: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  examDate: string;
  sessionTime: 'Morning (09:30 AM - 11:00 AM)' | 'Afternoon (02:00 PM - 03:30 PM)';
  coePrepStatus: 'Stage A: 4 Papers Prepared' | 'Stage B: Versions A-D Generated' | 'Package Encrypted & Signed' | 'Pending Question Bank';
  examCompletionStatus: 'Upcoming' | 'In Progress (Offline Lab)' | 'Completed' | 'Postponed';
  resultProcessingStatus: 'Not Started' | 'Evaluated at Lab' | 'Imported by COE' | 'Verified by COE';
  resultPublicationStatus: ResultApprovalStatus;
  frozenRosterCount: number;
  questionBankRevision: string;
}

export interface StudentExamResult {
  id: string;
  examId: string;
  examCycleName: string;
  academicYearId: string;
  departmentId: string;
  departmentCode: string;
  semesterNumber: number;
  section: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  usn: string;
  studentName: string;
  maxMarks: number;
  marksObtained: number;
  percentage: number;
  resultStatus: 'PASS' | 'FAIL' | 'ABSENT';
  coeApprovalStatus: ResultApprovalStatus;
  releasedAt?: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorName: string;
  actorEmployeeId: string;
  actorRole: UserRole | 'COE' | 'SYSTEM';
  actionCategory:
    | 'DEPARTMENT_CREATED'
    | 'DEPARTMENT_STATUS_CHANGED'
    | 'HOD_ASSIGNED'
    | 'STAFF_ACCOUNT_CREATED'
    | 'ACADEMIC_SEMESTER_CONFIGURED'
    | 'SUBJECT_MAPPED'
    | 'QUESTION_BANK_FINALIZED'
    | 'QUESTION_BANK_CORRECTION_REQUEST'
    | 'QUESTION_BANK_IMPORTED'
    | 'ROSTER_SUBMITTED'
    | 'STUDENT_DIRECTORY_ADDED'
    | 'STUDENT_DIRECTORY_UPDATED'
    | 'STUDENT_DIRECTORY_DEACTIVATED'
    | 'STUDENT_DIRECTORY_REACTIVATED'
    | 'EXAM_ELIGIBILITY_UPDATED'
    | 'EXAM_VERSION_ASSIGNED'
    | 'STUDENT_SESSION_RESET'
    | 'REPORT_ACCESSED';
  activityDescription: string;
  departmentCode: string;
  status: 'Completed' | 'Verified' | 'Flagged';
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  timestamp: string;
}
