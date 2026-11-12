import { getMockDb } from '../data/mockDatabase';
import { withAdapterDelay } from './apiConfig';

export interface PrincipalDashboardMetrics {
  totalDepartments: number;
  activeDepartments: number;
  totalHods: number;
  totalStaffAccounts: number;
  totalAcademicSemesters: number;
  activeSemesters: number;
  totalSubjects: number;
  totalRegisteredStudents: number;
  activeExamCycles: number;
  upcomingExams: number;
  completedExams: number;
  currentAcademicYear: string;
  departmentSummary: {
    id: string;
    code: string;
    name: string;
    hodName: string;
    status: string;
    students: number;
    subjects: number;
    finalizedQuestionBanks: number;
    totalQuestionBanks: number;
  }[];
  semesterSummary: {
    semesterNumber: number;
    semesterName: string;
    cycle: string;
    status: string;
    totalSubjects: number;
    totalSections: number;
    enrolledStudents: number;
  }[];
}

export const principalService = {
  async getDashboardOverview() {
    return withAdapterDelay<PrincipalDashboardMetrics>(() => {
      const db = getMockDb();
      const currentAy = db.academicYears.find((a) => a.isCurrent)?.label || '2026–2027';
      const totalRegisteredStudents = db.departments.reduce((acc, d) => acc + d.totalStudents, 0);
      const totalHods = db.staffAccounts.filter((s) => s.assignedRole === 'HOD' && s.status === 'Active').length;
      const upcomingExams = db.examSchedules.filter((e) => e.examCompletionStatus === 'Upcoming').length;
      const completedExams = db.examSchedules.filter((e) => e.examCompletionStatus === 'Completed').length;

      const departmentSummary = db.departments.map((d) => {
        const deptSubjects = db.subjects.filter((s) => s.departmentId === d.id);
        const finalizedCount = deptSubjects.filter((s) => s.questionBankStatus === 'Finalized').length;
        return {
          id: d.id,
          code: d.code,
          name: d.name,
          hodName: d.hodName || 'Unassigned',
          status: d.status,
          students: d.totalStudents,
          subjects: deptSubjects.length || d.totalSubjects,
          finalizedQuestionBanks: finalizedCount,
          totalQuestionBanks: deptSubjects.length || 1,
        };
      });

      const semesterSummary = db.semesters.map((sem) => {
        const semSubjects = db.subjects.filter((s) => s.semesterNumber === sem.number);
        const semSections = db.sections.filter((sec) => sec.semesterNumber === sem.number);
        const enrolled = semSections.reduce((sum, sec) => sum + sec.enrolledCount, 0);
        return {
          semesterNumber: sem.number,
          semesterName: sem.name,
          cycle: sem.cycle,
          status: sem.status,
          totalSubjects: semSubjects.length,
          totalSections: semSections.length,
          enrolledStudents: enrolled,
        };
      });

      return {
        totalDepartments: db.departments.length,
        activeDepartments: db.departments.filter((d) => d.status === 'Active').length,
        totalHods,
        totalStaffAccounts: db.staffAccounts.length,
        totalAcademicSemesters: db.semesters.length,
        activeSemesters: db.semesters.filter((s) => s.status === 'Active').length,
        totalSubjects: db.subjects.length,
        totalRegisteredStudents,
        activeExamCycles: 1,
        upcomingExams,
        completedExams,
        currentAcademicYear: currentAy,
        departmentSummary,
        semesterSummary,
      };
    });
  },
};
