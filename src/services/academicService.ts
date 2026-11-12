import { appendAuditLog, getMockDb, saveMockDb } from '../data/mockDatabase';
import { AcademicYear, SectionRecord, Semester } from '../types';
import { withAdapterDelay } from './apiConfig';

export const academicService = {
  async getAcademicYears() {
    return withAdapterDelay<AcademicYear[]>(() => [...getMockDb().academicYears]);
  },

  async createAcademicYear(
    payload: { label: string; startDate: string; endDate: string; isCurrent: boolean },
    actorName: string,
    actorEmployeeId: string
  ) {
    return withAdapterDelay<AcademicYear>(() => {
      const db = getMockDb();
      if (db.academicYears.some((a) => a.label === payload.label.trim())) {
        throw new Error(`Academic year "${payload.label}" already exists.`);
      }
      if (payload.isCurrent) {
        db.academicYears.forEach((a) => {
          a.isCurrent = false;
          if (a.status === 'Active') a.status = 'Archived';
        });
      }
      const created: AcademicYear = {
        id: `ay-${Date.now()}`,
        label: payload.label.trim(),
        startDate: payload.startDate,
        endDate: payload.endDate,
        isCurrent: payload.isCurrent,
        status: payload.isCurrent ? 'Active' : 'Upcoming',
      };
      db.academicYears.unshift(created);
      saveMockDb(db);

      appendAuditLog({
        actorName,
        actorEmployeeId,
        actorRole: 'PRINCIPAL',
        actionCategory: 'ACADEMIC_SEMESTER_CONFIGURED',
        activityDescription: `Configured Academic Year ${created.label} (${created.status}).`,
        departmentCode: 'ALL',
        status: 'Completed',
      });

      return created;
    });
  },

  async setActiveAcademicYear(yearId: string, actorName: string, actorEmployeeId: string) {
    return withAdapterDelay<AcademicYear[]>(() => {
      const db = getMockDb();
      db.academicYears.forEach((ay) => {
        if (ay.id === yearId) {
          ay.isCurrent = true;
          ay.status = 'Active';
        } else {
          ay.isCurrent = false;
        }
      });
      saveMockDb(db);

      const target = db.academicYears.find((a) => a.id === yearId);
      appendAuditLog({
        actorName,
        actorEmployeeId,
        actorRole: 'PRINCIPAL',
        actionCategory: 'ACADEMIC_SEMESTER_CONFIGURED',
        activityDescription: `Set ${target?.label || yearId} as the Current Active Academic Year.`,
        departmentCode: 'ALL',
        status: 'Completed',
      });

      return [...db.academicYears];
    });
  },

  async getSemesters() {
    return withAdapterDelay<Semester[]>(() => [...getMockDb().semesters]);
  },

  async updateSemesterStatus(
    semesterId: string,
    status: 'Active' | 'Upcoming' | 'Completed',
    actorName: string,
    actorEmployeeId: string
  ) {
    return withAdapterDelay<Semester>(() => {
      const db = getMockDb();
      const sem = db.semesters.find((s) => s.id === semesterId);
      if (!sem) throw new Error('Semester not found.');
      sem.status = status;
      saveMockDb(db);

      appendAuditLog({
        actorName,
        actorEmployeeId,
        actorRole: 'PRINCIPAL',
        actionCategory: 'ACADEMIC_SEMESTER_CONFIGURED',
        activityDescription: `Updated ${sem.name} (${sem.cycle} Cycle) status to ${status}.`,
        departmentCode: 'ALL',
        status: 'Completed',
      });

      return { ...sem };
    });
  },

  async getSections(departmentId?: string, semesterNumber?: number) {
    return withAdapterDelay<SectionRecord[]>(() => {
      let list = [...getMockDb().sections];
      if (departmentId) {
        list = list.filter((s) => s.departmentId === departmentId);
      }
      if (semesterNumber) {
        list = list.filter((s) => s.semesterNumber === semesterNumber);
      }
      return list;
    });
  },

  async createSection(
    payload: {
      name: string;
      departmentId: string;
      semesterNumber: number;
      academicYearId: string;
      maxCapacity: number;
    },
    actorName: string,
    actorEmployeeId: string
  ) {
    return withAdapterDelay<SectionRecord>(() => {
      const db = getMockDb();
      const dept = db.departments.find((d) => d.id === payload.departmentId);
      if (!dept) throw new Error('Selected department not found.');
      const sem = db.semesters.find((s) => s.number === payload.semesterNumber);
      if (!sem) throw new Error('Selected semester not found.');

      const normalizedName = payload.name.trim().startsWith('Section')
        ? payload.name.trim()
        : `Section ${payload.name.trim().toUpperCase()}`;

      const exists = db.sections.some(
        (sec) =>
          sec.departmentId === dept.id &&
          sec.semesterNumber === sem.number &&
          sec.name.toLowerCase() === normalizedName.toLowerCase()
      );
      if (exists) {
        throw new Error(`${normalizedName} already exists for ${dept.code} ${sem.name}.`);
      }

      const created: SectionRecord = {
        id: `sec-${dept.code.toLowerCase()}-${sem.number}-${Date.now()}`,
        name: normalizedName,
        departmentId: dept.id,
        departmentCode: dept.code,
        semesterId: sem.id,
        semesterNumber: sem.number,
        academicYearId: payload.academicYearId,
        maxCapacity: payload.maxCapacity || 60,
        enrolledCount: 0,
      };

      db.sections.push(created);
      saveMockDb(db);

      appendAuditLog({
        actorName,
        actorEmployeeId,
        actorRole: 'PRINCIPAL',
        actionCategory: 'ACADEMIC_SEMESTER_CONFIGURED',
        activityDescription: `Created ${created.name} for ${dept.code} – ${sem.name} (Capacity: ${created.maxCapacity}).`,
        departmentCode: dept.code,
        status: 'Completed',
      });

      return created;
    });
  },
};
