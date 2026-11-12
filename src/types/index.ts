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
}

export interface QuestionBankValidationIssue {
  questionId: string;
  moduleNumber: number;
  type: 'MISSING_FIELD' | 'DUPLICATE_TEXT' | 'MISSING_ANSWER' | 'INVALID_OPTIONS' | 'DIFFICULTY_MISMATCH';
  message: string;
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

export interface StudentRecord {
  id: string;
  usn: string;
  studentName: string;
  dob: string; // YYYY-MM-DD
  departmentId: string;
  departmentCode: string;
  semesterId: string;
  semesterNumber: number;
  section: string;
  academicYearId: string;
  isValid: boolean;
  validationErrors: string[];
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
    | 'ROSTER_SUBMITTED'
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
