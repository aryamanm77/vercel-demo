import { getMockDb } from '../data/mockDatabase';
import { ExaminationScheduleItem, StudentExamResult } from '../types';
import { withAdapterDelay } from './apiConfig';

export const resultsService = {
  async getDepartmentExamSchedules(departmentId: string) {
    return withAdapterDelay<ExaminationScheduleItem[]>(() => {
      const db = getMockDb();
      return db.examSchedules
        .filter((e) => e.departmentId === departmentId)
        .map((e) => ({ ...e }));
    });
  },

  async getAllInstitutionExamSchedules() {
    return withAdapterDelay<ExaminationScheduleItem[]>(() => {
      return [...getMockDb().examSchedules];
    });
  },

  /**
   * Strictly returns ONLY results that have been approved and released by the COE.
   * For HOD role, enforces strict department boundary.
   */
  async getReleasedResults(filters: {
    requesterRole: 'PRINCIPAL' | 'HOD';
    requesterDepartmentId?: string;
    departmentId?: string;
    academicYearId?: string;
    semesterNumber?: number;
    section?: string;
    subjectId?: string;
  }) {
    return withAdapterDelay<{
      releasedResults: StudentExamResult[];
      withheldExamsCount: number;
      withheldSubjects: { subjectCode: string; subjectName: string; section: string; status: string }[];
    }>(() => {
      const db = getMockDb();

      // Security boundary: HOD can NEVER query another department
      const effectiveDeptId =
        filters.requesterRole === 'HOD'
          ? filters.requesterDepartmentId
          : filters.departmentId;

      if (filters.requesterRole === 'HOD' && !effectiveDeptId) {
        throw new Error('Unauthorized: HOD account has no assigned department.');
      }

      let allMatching = db.examResults.filter((r) => {
        if (effectiveDeptId && r.departmentId !== effectiveDeptId) return false;
        if (filters.academicYearId && r.academicYearId !== filters.academicYearId) return false;
        if (filters.semesterNumber && r.semesterNumber !== filters.semesterNumber) return false;
        if (filters.section && r.section !== filters.section) return false;
        if (filters.subjectId && r.subjectId !== filters.subjectId) return false;
        return true;
      });

      // Strictly separate COE-Approved vs Pending Approval
      const releasedResults = allMatching.filter(
        (r) => r.coeApprovalStatus === 'Approved / Released'
      );

      // Identify withheld sessions without leaking student marks
      const pendingSchedules = db.examSchedules.filter((s) => {
        if (effectiveDeptId && s.departmentId !== effectiveDeptId) return false;
        if (filters.semesterNumber && s.semesterNumber !== filters.semesterNumber) return false;
        if (filters.section && s.section !== filters.section) return false;
        if (filters.subjectId && s.subjectId !== filters.subjectId) return false;
        return s.resultPublicationStatus !== 'Approved / Released';
      });

      return {
        releasedResults,
        withheldExamsCount: pendingSchedules.length,
        withheldSubjects: pendingSchedules.map((s) => ({
          subjectCode: s.subjectCode,
          subjectName: s.subjectName,
          section: s.section,
          status: `${s.resultProcessingStatus} — Awaiting COE Approval`,
        })),
      };
    });
  },
};
