import { appendAuditLog, getMockDb, saveMockDb } from '../data/mockDatabase';
import {
  CoeStudentCountSummary,
  ExamEligibilityConfig,
  ExamVersionAssignment,
  PublicStudentDirectoryRecord,
  StudentDirectoryRecord,
  StudentDirectorySettings,
  UserRole,
} from '../types';

export type DirectoryActorRole = UserRole | 'COE' | 'INVIGILATOR';

export interface DirectoryActorContext {
  role: DirectoryActorRole;
  branchCode?: string; // required when role === 'HOD'
  actorName: string;
  actorEmployeeId: string;
}

export class PortalAccessError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'PortalAccessError';
    this.statusCode = statusCode;
  }
}

export interface StudentSearchFilter {
  branch?: string;
  semester?: number;
  section?: string;
  status?: 'ACTIVE' | 'INACTIVE';
  query?: string;
  page?: number;
  pageSize?: number;
}

export interface StudentSearchResult {
  items: PublicStudentDirectoryRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export interface StudentDirectoryPort {
  findByUsn(usn: string, actor: DirectoryActorContext): PublicStudentDirectoryRecord | null;
  search(filter: StudentSearchFilter, actor: DirectoryActorContext): StudentSearchResult;
  listForExam(examId: string, actor: DirectoryActorContext): PublicStudentDirectoryRecord[];
}

export interface VersionAssigner {
  assignVersions(params: {
    examId: string;
    students: PublicStudentDirectoryRecord[];
    roomResolver?: (student: PublicStudentDirectoryRecord) => string;
  }): ExamVersionAssignment[];
}

// Re-export strip helper so DOB NEVER leaks from directory reads, logs, or COE responses
export function toPublicStudentRecord(record: StudentDirectoryRecord): PublicStudentDirectoryRecord {
  const { dob: _omittedDob, ...rest } = record;
  void _omittedDob;
  return {
    ...rest,
    attributes: { ...record.attributes },
    semesterHistory: [...record.semesterHistory],
  };
}

export function normalizeBranchAlias(rawBranch: string, settings: StudentDirectorySettings): string | null {
  const cleaned = rawBranch.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!cleaned) return null;
  if (settings.branchAliases[cleaned]) return settings.branchAliases[cleaned];
  const upper = rawBranch.trim().toUpperCase();
  const knownCanonicals = new Set(Object.values(settings.branchAliases).map((b) => b.toUpperCase()));
  if (knownCanonicals.has(upper)) return upper;
  // Also accept existing departments in db
  const db = getMockDb();
  const matchedDept = db.departments.find(
    (d) => d.code.toUpperCase() === upper || d.name.toLowerCase() === cleaned,
  );
  return matchedDept ? matchedDept.code.toUpperCase() : null;
}

function assertStaffCanReadBranch(actor: DirectoryActorContext, targetBranch?: string): void {
  if (actor.role === 'COE') {
    throw new PortalAccessError(403, 'COE role cannot access personal student directory records.');
  }
  if (actor.role === 'HOD') {
    if (!actor.branchCode) {
      throw new PortalAccessError(403, 'HOD actor is missing assigned branch context.');
    }
    if (targetBranch && targetBranch.trim().toUpperCase() !== actor.branchCode.trim().toUpperCase()) {
      throw new PortalAccessError(
        403,
        `Forbidden: HOD (${actor.branchCode.toUpperCase()}) cannot access ${targetBranch.toUpperCase()} student records.`,
      );
    }
  }
}

export class LocalStudentDirectoryAdapter implements StudentDirectoryPort {
  findByUsn(usn: string, actor: DirectoryActorContext): PublicStudentDirectoryRecord | null {
    if (actor.role === 'COE') {
      throw new PortalAccessError(403, 'COE role cannot view individual student records.');
    }
    const db = getMockDb();
    const cleanUsn = usn.trim().toUpperCase();
    const rec = (db.studentDirectory || []).find((s) => s.usn === cleanUsn);
    if (!rec) return null;

    if (actor.role === 'HOD') {
      assertStaffCanReadBranch(actor, rec.branchCode);
    }
    return toPublicStudentRecord(rec);
  }

  search(filter: StudentSearchFilter, actor: DirectoryActorContext): StudentSearchResult {
    assertStaffCanReadBranch(actor, filter.branch);
    const db = getMockDb();
    const settings = db.directorySettings!;
    let list = [...(db.studentDirectory || [])];

    if (actor.role === 'HOD') {
      const hodBranch = actor.branchCode!.trim().toUpperCase();
      list = list.filter((s) => s.branchCode === hodBranch);
    } else if (filter.branch && filter.branch !== 'ALL') {
      const norm = normalizeBranchAlias(filter.branch, settings) || filter.branch.trim().toUpperCase();
      list = list.filter((s) => s.branchCode === norm);
    }

    if (filter.semester && filter.semester > 0) {
      list = list.filter((s) => s.semesterNumber === filter.semester);
    }
    if (filter.section && filter.section !== 'ALL') {
      const sec = filter.section.trim().toUpperCase().replace(/^SECTION\s+/i, '');
      list = list.filter((s) => s.section.toUpperCase() === sec);
    }
    if (filter.status) {
      list = list.filter((s) => s.status === filter.status);
    }
    if (filter.query && filter.query.trim()) {
      const q = filter.query.trim().toLowerCase();
      list = list.filter(
        (s) => s.usn.toLowerCase().includes(q) || s.studentName.toLowerCase().includes(q),
      );
    }

    list.sort((a, b) => a.usn.localeCompare(b.usn));

    const pageSize = Math.max(1, filter.pageSize ?? 50);
    const page = Math.max(1, filter.page ?? 1);
    const total = list.length;
    const start = (page - 1) * pageSize;
    const items = list.slice(start, start + pageSize).map(toPublicStudentRecord);

    return { items, total, page, pageSize };
  }

  listForExam(examId: string, actor: DirectoryActorContext): PublicStudentDirectoryRecord[] {
    if (actor.role === 'COE') {
      throw new PortalAccessError(403, 'COE role can inspect branch/semester/section counts only.');
    }
    const db = getMockDb();
    const cfg = (db.examEligibilityConfigs || []).find((c) => c.examId === examId);
    if (!cfg) return [];

    let eligible: StudentDirectoryRecord[];
    const dir = db.studentDirectory || [];
    if (cfg.isFrozen && cfg.eligibleUsnsSnapshot.length > 0) {
      const snapSet = new Set(cfg.eligibleUsnsSnapshot);
      eligible = dir.filter((s) => snapSet.has(s.usn) && s.status === 'ACTIVE');
    } else {
      const branchSet = new Set(cfg.allowedBranches.map((b) => b.toUpperCase()));
      const secSet = new Set(cfg.allowedSections.map((s) => s.toUpperCase().replace(/^SECTION\s+/i, '')));
      eligible = dir.filter(
        (s) =>
          s.status === 'ACTIVE' &&
          branchSet.has(s.branchCode.toUpperCase()) &&
          s.semesterNumber === cfg.semesterNumber &&
          (secSet.size === 0 || secSet.has(s.section.toUpperCase())),
      );
    }

    if (actor.role === 'HOD' && actor.branchCode) {
      const hodBranch = actor.branchCode.toUpperCase();
      eligible = eligible.filter((s) => s.branchCode === hodBranch);
    }

    return eligible.sort((a, b) => a.usn.localeCompare(b.usn)).map(toPublicStudentRecord);
  }
}

export const studentDirectoryPort = new LocalStudentDirectoryAdapter();

// ---------------------------------------------------------------------------
// Directory Lifecycle Mutations (Status Toggle, Settings, COE Counts, Eligibility)
// ---------------------------------------------------------------------------

export function setStudentActiveStatus(params: {
  usn: string;
  status: 'ACTIVE' | 'INACTIVE';
  actor: DirectoryActorContext;
}): PublicStudentDirectoryRecord {
  if (params.actor.role !== 'HOD' && params.actor.role !== 'PRINCIPAL') {
    throw new PortalAccessError(403, 'Only HOD or Principal/Admin may change student directory status.');
  }
  const db = getMockDb();
  const cleanUsn = params.usn.trim().toUpperCase();
  const record = (db.studentDirectory || []).find((s) => s.usn === cleanUsn);
  if (!record) {
    throw new PortalAccessError(404, `Student ${cleanUsn} not found in directory.`);
  }
  if (params.actor.role === 'HOD') {
    assertStaffCanReadBranch(params.actor, record.branchCode);
  }

  record.status = params.status;
  record.updatedAt = new Date().toISOString();
  saveMockDb(db);

  appendAuditLog({
    actorName: params.actor.actorName,
    actorEmployeeId: params.actor.actorEmployeeId,
    actorRole: params.actor.role === 'HOD' ? 'HOD' : 'PRINCIPAL',
    actionCategory:
      params.status === 'INACTIVE'
        ? 'STUDENT_DIRECTORY_DEACTIVATED'
        : 'STUDENT_DIRECTORY_REACTIVATED',
    activityDescription: `Marked student ${record.usn} (${record.studentName}, Sem ${record.semesterNumber} Sec ${record.section}) as ${params.status}.`,
    departmentCode: record.branchCode,
    status: 'Verified',
  });

  return toPublicStudentRecord(record);
}

// COE-safe aggregate counts ONLY (zero USN, zero Name, zero DOB)
export function getCoeStudentCounts(): CoeStudentCountSummary[] {
  const db = getMockDb();
  const buckets = new Map<string, CoeStudentCountSummary>();
  for (const s of db.studentDirectory || []) {
    const key = `${s.branchCode}::${s.semesterNumber}::${s.section}`;
    const existing = buckets.get(key) || {
      branchCode: s.branchCode,
      semesterNumber: s.semesterNumber,
      section: s.section,
      activeCount: 0,
      inactiveCount: 0,
      totalCount: 0,
    };
    if (s.status === 'ACTIVE') existing.activeCount++;
    else existing.inactiveCount++;
    existing.totalCount++;
    buckets.set(key, existing);
  }
  return Array.from(buckets.values()).sort(
    (a, b) =>
      a.branchCode.localeCompare(b.branchCode) ||
      a.semesterNumber - b.semesterNumber ||
      a.section.localeCompare(b.section),
  );
}

export function getDirectorySettings(): StudentDirectorySettings {
  const db = getMockDb();
  return JSON.parse(JSON.stringify(db.directorySettings!));
}

export function updateDirectorySettings(
  patch: Partial<StudentDirectorySettings>,
  actor: DirectoryActorContext,
): StudentDirectorySettings {
  if (actor.role !== 'PRINCIPAL') {
    throw new PortalAccessError(403, 'Only Principal/Admin may update global directory settings.');
  }
  const db = getMockDb();
  db.directorySettings = {
    ...db.directorySettings!,
    ...patch,
    branchAliases: {
      ...db.directorySettings!.branchAliases,
      ...(patch.branchAliases || {}),
    },
  };
  saveMockDb(db);
  return JSON.parse(JSON.stringify(db.directorySettings));
}

// ---------------------------------------------------------------------------
// Exam Eligibility Configuration & Deterministic A–D Neighbor Version Assigner
// ---------------------------------------------------------------------------

export function configureExamEligibility(params: {
  examId: string;
  allowedBranches: string[];
  semesterNumber: number;
  allowedSections: string[];
  actor: DirectoryActorContext;
}): ExamEligibilityConfig {
  if (params.actor.role !== 'COE' && params.actor.role !== 'PRINCIPAL') {
    throw new PortalAccessError(403, 'Only COE or Principal/Admin can configure exam eligibility.');
  }
  const db = getMockDb();
  const settings = db.directorySettings!;
  const normalizedBranches = params.allowedBranches.map(
    (b) => normalizeBranchAlias(b, settings) || b.trim().toUpperCase(),
  );
  const normalizedSections = params.allowedSections.map((s) =>
    s.trim().toUpperCase().replace(/^SECTION\s+/i, ''),
  );

  let cfg = (db.examEligibilityConfigs || []).find((c) => c.examId === params.examId);
  if (cfg?.isFrozen) {
    throw new PortalAccessError(409, `Exam ${params.examId} eligibility snapshot is already frozen.`);
  }
  if (!cfg) {
    cfg = {
      examId: params.examId,
      allowedBranches: normalizedBranches,
      semesterNumber: params.semesterNumber,
      allowedSections: normalizedSections,
      isFrozen: false,
      eligibleUsnsSnapshot: [],
    };
    db.examEligibilityConfigs!.push(cfg);
  } else {
    cfg.allowedBranches = normalizedBranches;
    cfg.semesterNumber = params.semesterNumber;
    cfg.allowedSections = normalizedSections;
  }

  saveMockDb(db);

  appendAuditLog({
    actorName: params.actor.actorName,
    actorEmployeeId: params.actor.actorEmployeeId,
    actorRole: params.actor.role === 'COE' ? 'COE' : 'PRINCIPAL',
    actionCategory: 'EXAM_ELIGIBILITY_UPDATED',
    activityDescription: `Updated eligibility for Exam ${params.examId}: Branches [${normalizedBranches.join(', ')}], Sem ${params.semesterNumber}, Sections [${normalizedSections.join(', ')}].`,
    departmentCode: normalizedBranches[0] || 'ALL',
    status: 'Completed',
  });

  return JSON.parse(JSON.stringify(cfg));
}

export function freezeExamEligibilitySnapshot(params: {
  examId: string;
  actor: DirectoryActorContext;
}): ExamEligibilityConfig {
  if (params.actor.role !== 'COE' && params.actor.role !== 'PRINCIPAL') {
    throw new PortalAccessError(403, 'Only COE or Principal/Admin can freeze exam eligibility.');
  }
  const db = getMockDb();
  const cfg = (db.examEligibilityConfigs || []).find((c) => c.examId === params.examId);
  if (!cfg) {
    throw new PortalAccessError(404, `Eligibility config for exam ${params.examId} not found.`);
  }

  const branchSet = new Set(cfg.allowedBranches.map((b) => b.toUpperCase()));
  const secSet = new Set(cfg.allowedSections.map((s) => s.toUpperCase()));

  const snapshot = (db.studentDirectory || [])
    .filter(
      (s) =>
        s.status === 'ACTIVE' &&
        branchSet.has(s.branchCode.toUpperCase()) &&
        s.semesterNumber === cfg.semesterNumber &&
        (secSet.size === 0 || secSet.has(s.section.toUpperCase())),
    )
    .map((s) => s.usn)
    .sort((a, b) => a.localeCompare(b));

  cfg.isFrozen = true;
  cfg.frozenAt = new Date().toISOString();
  cfg.eligibleUsnsSnapshot = snapshot;
  saveMockDb(db);

  appendAuditLog({
    actorName: params.actor.actorName,
    actorEmployeeId: params.actor.actorEmployeeId,
    actorRole: params.actor.role === 'COE' ? 'COE' : 'PRINCIPAL',
    actionCategory: 'EXAM_ELIGIBILITY_UPDATED',
    activityDescription: `Froze eligible student snapshot for Exam ${params.examId} (${snapshot.length} ACTIVE students).`,
    departmentCode: cfg.allowedBranches[0] || 'ALL',
    status: 'Verified',
  });

  return JSON.parse(JSON.stringify(cfg));
}

export class DeterministicNeighborVersionAssigner implements VersionAssigner {
  assignVersions(params: {
    examId: string;
    students: PublicStudentDirectoryRecord[];
    roomResolver?: (student: PublicStudentDirectoryRecord) => string;
  }): ExamVersionAssignment[] {
    const versions: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];
    // Group by room/section so neighbors sorted by USN in the same room/section always differ
    const byRoom = new Map<string, PublicStudentDirectoryRecord[]>();
    for (const s of params.students) {
      const room = params.roomResolver ? params.roomResolver(s) : `${s.branchCode}-${s.section}`;
      const list = byRoom.get(room) || [];
      list.push(s);
      byRoom.set(room, list);
    }

    const assignments: ExamVersionAssignment[] = [];
    const sortedRooms = Array.from(byRoom.keys()).sort();
    for (const room of sortedRooms) {
      const roomStudents = byRoom.get(room)!.sort((a, b) => a.usn.localeCompare(b.usn));
      // Deterministic room seed offset
      let seedOffset = 0;
      const seedStr = `${params.examId}::${room}`;
      for (let i = 0; i < seedStr.length; i++) seedOffset = (seedOffset + seedStr.charCodeAt(i)) % 4;

      roomStudents.forEach((s, idx) => {
        const version = versions[(seedOffset + idx) % 4];
        assignments.push({
          usn: s.usn,
          studentName: s.studentName,
          branchCode: s.branchCode,
          semesterNumber: s.semesterNumber,
          section: s.section,
          roomCode: room,
          seatOrder: idx + 1,
          assignedVersion: version,
        });
      });
    }

    return assignments;
  }
}

export function assignExamVersionsForExam(params: {
  examId: string;
  actor: DirectoryActorContext;
  roomResolver?: (student: PublicStudentDirectoryRecord) => string;
  assigner?: VersionAssigner;
}): ExamVersionAssignment[] {
  if (params.actor.role !== 'COE' && params.actor.role !== 'PRINCIPAL') {
    throw new PortalAccessError(403, 'Only COE or Principal/Admin can assign exam paper versions.');
  }
  const db = getMockDb();
  const cfg = (db.examEligibilityConfigs || []).find((c) => c.examId === params.examId);
  if (!cfg) throw new PortalAccessError(404, `Exam eligibility config for ${params.examId} not found.`);

  const branchSet = new Set(cfg.allowedBranches.map((b) => b.toUpperCase()));
  const secSet = new Set(cfg.allowedSections.map((s) => s.toUpperCase()));
  const dir = db.studentDirectory || [];
  const rawEligible =
    cfg.isFrozen && cfg.eligibleUsnsSnapshot.length > 0
      ? dir.filter((s) => cfg.eligibleUsnsSnapshot.includes(s.usn) && s.status === 'ACTIVE')
      : dir.filter(
          (s) =>
            s.status === 'ACTIVE' &&
            branchSet.has(s.branchCode.toUpperCase()) &&
            s.semesterNumber === cfg.semesterNumber &&
            (secSet.size === 0 || secSet.has(s.section.toUpperCase())),
        );

  const assigner = params.assigner || new DeterministicNeighborVersionAssigner();
  const assignments = assigner.assignVersions({
    examId: params.examId,
    students: rawEligible.map(toPublicStudentRecord),
    roomResolver: params.roomResolver,
  });

  db.examVersionAssignments![params.examId] = assignments;
  saveMockDb(db);

  appendAuditLog({
    actorName: params.actor.actorName,
    actorEmployeeId: params.actor.actorEmployeeId,
    actorRole: params.actor.role === 'COE' ? 'COE' : 'PRINCIPAL',
    actionCategory: 'EXAM_VERSION_ASSIGNED',
    activityDescription: `Assigned deterministic A–D paper versions for Exam ${params.examId} across ${assignments.length} eligible active students.`,
    departmentCode: cfg.allowedBranches[0] || 'ALL',
    status: 'Verified',
  });

  return JSON.parse(JSON.stringify(assignments));
}
