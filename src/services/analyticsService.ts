import { StudentExamResult } from '../types';

export interface DepartmentPerformanceAnalytics {
  totalEvaluated: number;
  passCount: number;
  failCount: number;
  absentCount: number;
  highestMarks: number;
  lowestMarks: number;
  averageMarks: number;
  passPercentage: number;
  failPercentage: number;
  topPerformers: StudentExamResult[];
  sectionComparison: {
    section: string;
    studentsCount: number;
    averageMarks: number;
    passPercentage: number;
    highestMarks: number;
  }[];
  subjectComparison: {
    subjectCode: string;
    subjectName: string;
    studentsCount: number;
    averageMarks: number;
    passPercentage: number;
  }[];
}

export const analyticsService = {
  computeAnalytics(releasedResults: StudentExamResult[]): DepartmentPerformanceAnalytics {
    if (releasedResults.length === 0) {
      return {
        totalEvaluated: 0,
        passCount: 0,
        failCount: 0,
        absentCount: 0,
        highestMarks: 0,
        lowestMarks: 0,
        averageMarks: 0,
        passPercentage: 0,
        failPercentage: 0,
        topPerformers: [],
        sectionComparison: [],
        subjectComparison: [],
      };
    }

    const appeared = releasedResults.filter((r) => r.resultStatus !== 'ABSENT');
    const passCount = releasedResults.filter((r) => r.resultStatus === 'PASS').length;
    const failCount = releasedResults.filter((r) => r.resultStatus === 'FAIL').length;
    const absentCount = releasedResults.filter((r) => r.resultStatus === 'ABSENT').length;

    const marksList = appeared.map((r) => r.marksObtained);
    const highestMarks = marksList.length > 0 ? Math.max(...marksList) : 0;
    const lowestMarks = marksList.length > 0 ? Math.min(...marksList) : 0;
    const averageMarks =
      marksList.length > 0
        ? Number((marksList.reduce((a, b) => a + b, 0) / marksList.length).toFixed(1))
        : 0;

    const passPercentage =
      appeared.length > 0 ? Number(((passCount / appeared.length) * 100).toFixed(1)) : 0;
    const failPercentage =
      appeared.length > 0 ? Number(((failCount / appeared.length) * 100).toFixed(1)) : 0;

    const topPerformers = [...appeared]
      .sort((a, b) => b.marksObtained - a.marksObtained)
      .slice(0, 5);

    const sections = Array.from(new Set(releasedResults.map((r) => r.section))).sort();
    const sectionComparison = sections.map((sec) => {
      const rows = releasedResults.filter((r) => r.section === sec && r.resultStatus !== 'ABSENT');
      const secPass = rows.filter((r) => r.resultStatus === 'PASS').length;
      const secMarks = rows.map((r) => r.marksObtained);
      return {
        section: sec,
        studentsCount: rows.length,
        averageMarks:
          secMarks.length > 0
            ? Number((secMarks.reduce((a, b) => a + b, 0) / secMarks.length).toFixed(1))
            : 0,
        passPercentage:
          rows.length > 0 ? Number(((secPass / rows.length) * 100).toFixed(1)) : 0,
        highestMarks: secMarks.length > 0 ? Math.max(...secMarks) : 0,
      };
    });

    const subjects = Array.from(new Set(releasedResults.map((r) => r.subjectCode)));
    const subjectComparison = subjects.map((code) => {
      const rows = releasedResults.filter(
        (r) => r.subjectCode === code && r.resultStatus !== 'ABSENT'
      );
      const subPass = rows.filter((r) => r.resultStatus === 'PASS').length;
      const subMarks = rows.map((r) => r.marksObtained);
      return {
        subjectCode: code,
        subjectName: rows[0]?.subjectName || code,
        studentsCount: rows.length,
        averageMarks:
          subMarks.length > 0
            ? Number((subMarks.reduce((a, b) => a + b, 0) / subMarks.length).toFixed(1))
            : 0,
        passPercentage:
          rows.length > 0 ? Number(((subPass / rows.length) * 100).toFixed(1)) : 0,
      };
    });

    return {
      totalEvaluated: releasedResults.length,
      passCount,
      failCount,
      absentCount,
      highestMarks,
      lowestMarks,
      averageMarks,
      passPercentage,
      failPercentage,
      topPerformers,
      sectionComparison,
      subjectComparison,
    };
  },
};
