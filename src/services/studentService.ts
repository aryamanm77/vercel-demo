import { appendAuditLog, getMockDb, saveMockDb } from '../data/mockDatabase';
import { StudentRecord, StudentRosterSubmission } from '../types';
import { withAdapterDelay } from './apiConfig';

function revalidateRoster(roster: StudentRosterSubmission): void {
  const usnCounts = new Map<string, number>();
  roster.students.forEach((s) => {
    const cleanUsn = s.usn.trim().toUpperCase();
    if (cleanUsn) {
      usnCounts.set(cleanUsn, (usnCounts.get(cleanUsn) || 0) + 1);
    }
  });

  let validCount = 0;
  let invalidCount = 0;
  let duplicateUsnCount = 0;
  let missingInfoCount = 0;

  roster.students.forEach((s) => {
    const errors: string[] = [];
    const cleanUsn = s.usn.trim().toUpperCase();

    if (!cleanUsn || !s.studentName.trim() || !s.dob.trim()) {
      missingInfoCount++;
      errors.push('Missing required student field (USN, Name, or DOB).');
    }

    if (cleanUsn && (usnCounts.get(cleanUsn) || 0) > 1) {
      duplicateUsnCount++;
      errors.push(`Duplicate USN detected in ${roster.section} roster (${cleanUsn}).`);
    }

    if (cleanUsn && !/^4MH\d{2}[A-Z]{2}\d{3}$/.test(cleanUsn)) {
      errors.push(`USN "${cleanUsn}" does not match MIT Mysore USN format (e.g., 4MH24CS001).`);
    }

    if (s.departmentId !== roster.departmentId || s.section !== roster.section) {
      errors.push('Student department or section assignment does not match selected roster.');
    }

    s.isValid = errors.length === 0;
    s.validationErrors = errors;
    if (s.isValid) {
      validCount++;
    } else {
      invalidCount++;
    }
  });

  roster.totalStudents = roster.students.length;
  roster.validCount = validCount;
  roster.invalidCount = invalidCount;
  roster.duplicateUsnCount = duplicateUsnCount;
  roster.missingInfoCount = missingInfoCount;
}

export const studentService = {
  async getOrInitRoster(params: {
    departmentId: string;
    academicYearId: string;
    semesterNumber: number;
    section: string;
  }) {
    return withAdapterDelay<StudentRosterSubmission>(() => {
      const db = getMockDb();
      const dept = db.departments.find((d) => d.id === params.departmentId);
      if (!dept) throw new Error('Authorized department not found.');

      let roster = db.studentRosters.find(
        (r) =>
          r.departmentId === params.departmentId &&
          r.academicYearId === params.academicYearId &&
          r.semesterNumber === params.semesterNumber &&
          r.section === params.section
      );

      if (!roster) {
        const sem = db.semesters.find((s) => s.number === params.semesterNumber);
        roster = {
          id: `ros-${dept.code.toLowerCase()}-${params.semesterNumber}-${Date.now()}`,
          departmentId: dept.id,
          departmentCode: dept.code,
          academicYearId: params.academicYearId,
          semesterId: sem?.id || `sem-${params.semesterNumber}`,
          semesterNumber: params.semesterNumber,
          section: params.section,
          version: 'ROSTER-V1.0-DRAFT',
          totalStudents: 0,
          validCount: 0,
          invalidCount: 0,
          duplicateUsnCount: 0,
          missingInfoCount: 0,
          status: 'Draft',
          students: [],
        };
        db.studentRosters.push(roster);
      }

      revalidateRoster(roster);
      saveMockDb(db);
      return JSON.parse(JSON.stringify(roster));
    });
  },

  async addOrUpdateStudent(
    rosterId: string,
    departmentId: string,
    studentPayload: {
      id?: string;
      usn: string;
      studentName: string;
      dob: string;
    }
  ) {
    return withAdapterDelay<StudentRosterSubmission>(() => {
      const db = getMockDb();
      const roster = db.studentRosters.find((r) => r.id === rosterId);
      if (!roster) throw new Error('Student roster not found.');
      if (roster.departmentId !== departmentId) {
        throw new Error('Unauthorized department access.');
      }
      if (roster.status === 'Frozen by COE') {
        throw new Error(
          'This student roster has been frozen by the Controller of Examinations (COE) for an active examination session. Submit a controlled correction request to modify.'
        );
      }

      if (studentPayload.id) {
        const existing = roster.students.find((s) => s.id === studentPayload.id);
        if (!existing) throw new Error('Student record not found.');
        existing.usn = studentPayload.usn.trim().toUpperCase();
        existing.studentName = studentPayload.studentName.trim();
        existing.dob = studentPayload.dob.trim();
      } else {
        const newStudent: StudentRecord = {
          id: `stu-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          usn: studentPayload.usn.trim().toUpperCase(),
          studentName: studentPayload.studentName.trim(),
          dob: studentPayload.dob.trim(),
          departmentId: roster.departmentId,
          departmentCode: roster.departmentCode,
          semesterId: roster.semesterId,
          semesterNumber: roster.semesterNumber,
          section: roster.section,
          academicYearId: roster.academicYearId,
          isValid: true,
          validationErrors: [],
        };
        roster.students.push(newStudent);
      }

      revalidateRoster(roster);
      saveMockDb(db);
      return JSON.parse(JSON.stringify(roster));
    });
  },

  async removeStudentRecord(rosterId: string, departmentId: string, studentId: string) {
    return withAdapterDelay<StudentRosterSubmission>(() => {
      const db = getMockDb();
      const roster = db.studentRosters.find((r) => r.id === rosterId);
      if (!roster) throw new Error('Roster not found.');
      if (roster.departmentId !== departmentId) throw new Error('Unauthorized.');
      if (roster.status === 'Frozen by COE') {
        throw new Error('Frozen rosters cannot be edited directly.');
      }

      roster.students = roster.students.filter((s) => s.id !== studentId);
      revalidateRoster(roster);
      saveMockDb(db);
      return JSON.parse(JSON.stringify(roster));
    });
  },

  async bulkImportStudents(
    rosterId: string,
    departmentId: string,
    rows: { usn: string; studentName: string; dob: string }[]
  ) {
    return withAdapterDelay<StudentRosterSubmission>(() => {
      const db = getMockDb();
      const roster = db.studentRosters.find((r) => r.id === rosterId);
      if (!roster) throw new Error('Roster not found.');
      if (roster.departmentId !== departmentId) throw new Error('Unauthorized.');
      if (roster.status === 'Frozen by COE') {
        throw new Error('Frozen rosters cannot be modified withoutCOE authorization.');
      }

      rows.forEach((row, index) => {
        roster.students.push({
          id: `stu-bulk-${Date.now()}-${index}`,
          usn: row.usn.trim().toUpperCase(),
          studentName: row.studentName.trim(),
          dob: row.dob.trim(),
          departmentId: roster.departmentId,
          departmentCode: roster.departmentCode,
          semesterId: roster.semesterId,
          semesterNumber: roster.semesterNumber,
          section: roster.section,
          academicYearId: roster.academicYearId,
          isValid: true,
          validationErrors: [],
        });
      });

      revalidateRoster(roster);
      saveMockDb(db);
      return JSON.parse(JSON.stringify(roster));
    });
  },

  async submitStudentRoster(
    rosterId: string,
    departmentId: string,
    actorName: string,
    actorEmployeeId: string
  ) {
    return withAdapterDelay<StudentRosterSubmission>(() => {
      const db = getMockDb();
      const roster = db.studentRosters.find((r) => r.id === rosterId);
      if (!roster) throw new Error('Roster not found.');
      if (roster.departmentId !== departmentId) throw new Error('Unauthorized.');

      revalidateRoster(roster);

      if (roster.totalStudents === 0) {
        throw new Error('Cannot submit an empty student roster.');
      }
      if (roster.invalidCount > 0) {
        roster.status = 'Validation Failed';
        saveMockDb(db);
        throw new Error(
          `Roster contains ${roster.invalidCount} invalid student record(s) (${roster.duplicateUsnCount} duplicate USN, ${roster.missingInfoCount} missing fields). Resolve all validation errors before final submission.`
        );
      }

      const now = new Date();
      const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

      roster.status = 'Submitted';
      roster.version = 'ROSTER-V2.0';
      roster.submittedBy = `${actorName} (HOD - ${roster.departmentCode})`;
      roster.submittedAt = ts;

      db.submissionHistory.unshift({
        id: `sub-hist-ros-${Date.now()}`,
        referenceId: `MITM-ROS-${roster.departmentCode}-S${roster.semesterNumber}-${roster.section.replace(/\s+/g, '')}`,
        type: 'STUDENT_ROSTER',
        departmentId: roster.departmentId,
        departmentCode: roster.departmentCode,
        academicYearId: roster.academicYearId,
        semesterNumber: roster.semesterNumber,
        section: roster.section,
        subjectCode: 'ALL-SEM-SUBJECTS',
        subjectName: `Semester ${roster.semesterNumber} – ${roster.section} Student Roster`,
        revision: roster.version,
        questionCount: 300,
        rosterStatus: 'Submitted',
        rosterCount: roster.totalStudents,
        submittedBy: actorName,
        submittedAt: ts,
        status: 'Submitted',
        notes: `Verified ${roster.validCount} student records for ${roster.departmentCode} Sem ${roster.semesterNumber} ${roster.section}.`,
      });

      saveMockDb(db);

      appendAuditLog({
        actorName,
        actorEmployeeId,
        actorRole: 'HOD',
        actionCategory: 'ROSTER_SUBMITTED',
        activityDescription: `Submitted verified Student Roster (${roster.validCount} students, ${roster.version}) for ${roster.departmentCode} Sem ${roster.semesterNumber} ${roster.section}.`,
        departmentCode: roster.departmentCode,
        status: 'Verified',
      });

      return JSON.parse(JSON.stringify(roster));
    });
  },

  async requestFrozenRosterCorrection(
    rosterId: string,
    departmentId: string,
    reason: string,
    actorName: string,
    actorEmployeeId: string
  ) {
    return withAdapterDelay<StudentRosterSubmission>(() => {
      const db = getMockDb();
      const roster = db.studentRosters.find((r) => r.id === rosterId);
      if (!roster) throw new Error('Roster not found.');
      if (roster.departmentId !== departmentId) throw new Error('Unauthorized.');
      if (!reason.trim()) throw new Error('Correction justification is required.');

      roster.status = 'Correction Requested';
      roster.correctionRequestReason = reason.trim();
      saveMockDb(db);

      appendAuditLog({
        actorName,
        actorEmployeeId,
        actorRole: 'HOD',
        actionCategory: 'ROSTER_SUBMITTED',
        activityDescription: `Requested authorized COE roster amendment for ${roster.departmentCode} Sem ${roster.semesterNumber} ${roster.section}: "${reason.trim()}"`,
        departmentCode: roster.departmentCode,
        status: 'Flagged',
      });

      return JSON.parse(JSON.stringify(roster));
    });
  },
};
