import { appendAuditLog, getMockDb } from '../data/mockDatabase';
import { AuditLogEntry } from '../types';
import { withAdapterDelay } from './apiConfig';

export const auditService = {
  async getAuditLogs(filters?: {
    departmentCode?: string;
    actionCategory?: string;
    role?: string;
    searchQuery?: string;
  }) {
    return withAdapterDelay<AuditLogEntry[]>(() => {
      let logs = [...getMockDb().auditLogs];
      if (filters?.departmentCode && filters.departmentCode !== 'ALL') {
        logs = logs.filter(
          (l) => l.departmentCode === filters.departmentCode || l.departmentCode === 'ALL'
        );
      }
      if (filters?.actionCategory && filters.actionCategory !== 'ALL') {
        logs = logs.filter((l) => l.actionCategory === filters.actionCategory);
      }
      if (filters?.role && filters.role !== 'ALL') {
        logs = logs.filter((l) => l.actorRole === filters.role);
      }
      if (filters?.searchQuery?.trim()) {
        const q = filters.searchQuery.trim().toLowerCase();
        logs = logs.filter(
          (l) =>
            l.activityDescription.toLowerCase().includes(q) ||
            l.actorName.toLowerCase().includes(q) ||
            l.actorEmployeeId.toLowerCase().includes(q) ||
            l.departmentCode.toLowerCase().includes(q)
        );
      }
      return logs;
    });
  },

  async recordReportAccess(actorName: string, actorEmployeeId: string, reportTitle: string) {
    return withAdapterDelay<AuditLogEntry>(() => {
      return appendAuditLog({
        actorName,
        actorEmployeeId,
        actorRole: 'PRINCIPAL',
        actionCategory: 'REPORT_ACCESSED',
        activityDescription: `Accessed and exported ${reportTitle}.`,
        departmentCode: 'ALL',
        status: 'Verified',
      });
    });
  },
};
