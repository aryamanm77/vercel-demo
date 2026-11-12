import { appendAuditLog, getMockDb, saveMockDb } from '../data/mockDatabase';
import { Subject } from '../types';
import { withAdapterDelay } from './apiConfig';

export interface CreateSubjectPayload {
  code: string;
  name: string;
  departmentId: string;
  semesterNumber: number;
  academicYearId: string;
  credits: number;
  sections: string[];
}

export const subjectService = {
  async getSubjects(filters?: { departmentId?: string; semesterNumber?: number; academicYearId?: string }) {
    return withAdapterDelay<Subject[]>(() => {
      let list = [...getMockDb().subjects];
      if (filters?.departmentId) {
        list = list.filter((s) => s.departmentId === filters.departmentId);
      }
      if (filters?.semesterNumber) {
        list = list.filter((s) => s.semesterNumber === filters.semesterNumber);
      }
      if (filters?.academicYearId) {
        list = list.filter((s) => s.academicYearId === filters.academicYearId);
      }
      return list;
    });
  },

  async createSubject(payload: CreateSubjectPayload, actorName: string, actorEmployeeId: string) {
    return withAdapterDelay<Subject>(() => {
      const db = getMockDb();
      const dept = db.departments.find((d) => d.id === payload.departmentId);
      if (!dept) throw new Error('Department not found.');
      const sem = db.semesters.find((s) => s.number === payload.semesterNumber);
      if (!sem) throw new Error('Semester not found.');

      const normalizedCode = payload.code.trim().toUpperCase();
      if (db.subjects.some((s) => s.code.toUpperCase() === normalizedCode && s.departmentId === dept.id)) {
        throw new Error(`Subject code "${normalizedCode}" is already mapped to ${dept.code}.`);
      }

      const newSubject: Subject = {
        id: `subj-${normalizedCode.toLowerCase()}-${Date.now()}`,
        code: normalizedCode,
        name: payload.name.trim(),
        departmentId: dept.id,
        departmentCode: dept.code,
        semesterId: sem.id,
        semesterNumber: sem.number,
        academicYearId: payload.academicYearId,
        moduleCount: 5, // Fixed 5-module institutional standard
        credits: payload.credits || 4,
        sections: payload.sections.length > 0 ? payload.sections : ['Section A'],
        questionBankStatus: 'Draft',
      };

      db.subjects.push(newSubject);
      dept.totalSubjects += 1;
      saveMockDb(db);

      appendAuditLog({
        actorName,
        actorEmployeeId,
        actorRole: 'PRINCIPAL',
        actionCategory: 'SUBJECT_MAPPED',
        activityDescription: `Mapped 5-module subject ${newSubject.code} (${newSubject.name}) to ${dept.code} – ${sem.name} (${newSubject.sections.join(', ')}).`,
        departmentCode: dept.code,
        status: 'Completed',
      });

      return newSubject;
    });
  },

  async updateSubjectMapping(
    subjectId: string,
    updates: { name?: string; credits?: number; sections?: string[] },
    actorName: string,
    actorEmployeeId: string
  ) {
    return withAdapterDelay<Subject>(() => {
      const db = getMockDb();
      const subj = db.subjects.find((s) => s.id === subjectId);
      if (!subj) throw new Error('Subject record not found.');

      if (updates.name) subj.name = updates.name.trim();
      if (updates.credits !== undefined) subj.credits = updates.credits;
      if (updates.sections && updates.sections.length > 0) subj.sections = updates.sections;

      saveMockDb(db);

      appendAuditLog({
        actorName,
        actorEmployeeId,
        actorRole: 'PRINCIPAL',
        actionCategory: 'SUBJECT_MAPPED',
        activityDescription: `Updated subject mapping for ${subj.code} (${subj.name}) in ${subj.departmentCode}.`,
        departmentCode: subj.departmentCode,
        status: 'Completed',
      });

      return { ...subj };
    });
  },
};
