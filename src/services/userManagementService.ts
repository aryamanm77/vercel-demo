import { appendAuditLog, getMockDb, saveMockDb } from '../data/mockDatabase';
import { AccountStatus, StaffAccount, StaffRole } from '../types';
import { withAdapterDelay } from './apiConfig';

export interface CreateStaffAccountPayload {
  fullName: string;
  employeeId: string;
  email: string;
  designation: string;
  departmentId: string;
  assignedRole: StaffRole;
}

export const userManagementService = {
  async getStaffAccounts(filters?: { role?: StaffRole; departmentId?: string; status?: AccountStatus }) {
    return withAdapterDelay<StaffAccount[]>(() => {
      let list = [...getMockDb().staffAccounts];
      if (filters?.role) {
        list = list.filter((s) => s.assignedRole === filters.role);
      }
      if (filters?.departmentId) {
        list = list.filter((s) => s.departmentId === filters.departmentId);
      }
      if (filters?.status) {
        list = list.filter((s) => s.status === filters.status);
      }
      return list;
    });
  },

  async createStaffAccount(
    payload: CreateStaffAccountPayload,
    actorName: string,
    actorEmployeeId: string
  ) {
    return withAdapterDelay<StaffAccount>(() => {
      const db = getMockDb();
      const dept = db.departments.find((d) => d.id === payload.departmentId);
      if (!dept) {
        throw new Error('Every HOD or staff account must be associated with an authorized department.');
      }

      const empIdClean = payload.employeeId.trim().toUpperCase();
      const emailClean = payload.email.trim().toLowerCase();

      if (db.staffAccounts.some((s) => s.employeeId.toUpperCase() === empIdClean)) {
        throw new Error(`Employee ID "${empIdClean}" is already registered.`);
      }
      if (db.staffAccounts.some((s) => s.email.toLowerCase() === emailClean)) {
        throw new Error(`Institutional email "${emailClean}" is already registered.`);
      }

      const newId = `staff-${dept.code.toLowerCase()}-${Date.now()}`;
      const newStaff: StaffAccount = {
        id: newId,
        employeeId: empIdClean,
        fullName: payload.fullName.trim(),
        email: emailClean,
        designation: payload.designation.trim(),
        departmentId: dept.id,
        departmentCode: dept.code,
        departmentName: dept.name,
        assignedRole: payload.assignedRole,
        status: 'Active',
        assignedAt: new Date().toISOString().split('T')[0],
      };

      // If creating a new HOD for a department that already has an HOD, preserve history and demote previous HOD to Academic Staff
      if (payload.assignedRole === 'HOD') {
        const existingHod = db.staffAccounts.find(
          (s) => s.departmentId === dept.id && s.assignedRole === 'HOD' && s.status === 'Active'
        );
        if (existingHod) {
          existingHod.assignedRole = 'ACADEMIC_STAFF';
          existingHod.previousHodHistory = [
            ...(existingHod.previousHodHistory || []),
            {
              departmentCode: dept.code,
              fromDate: existingHod.assignedAt,
              toDate: new Date().toISOString().split('T')[0],
            },
          ];
        }
        dept.hodUserId = newStaff.id;
        dept.hodName = newStaff.fullName;
        dept.hodEmail = newStaff.email;

        // Also register in users table for login capability
        db.users.push({
          id: newStaff.id,
          employeeId: newStaff.employeeId,
          fullName: newStaff.fullName,
          email: newStaff.email,
          username: newStaff.email.split('@')[0],
          passwordHash: 'MitMysore@2026',
          role: 'HOD',
          designation: newStaff.designation,
          departmentId: dept.id,
          departmentCode: dept.code,
          departmentName: dept.name,
          lastLogin: 'Never (Provisioned)',
        });
      }

      db.staffAccounts.unshift(newStaff);
      dept.totalStaff += 1;
      saveMockDb(db);

      appendAuditLog({
        actorName,
        actorEmployeeId,
        actorRole: 'PRINCIPAL',
        actionCategory: payload.assignedRole === 'HOD' ? 'HOD_ASSIGNED' : 'STAFF_ACCOUNT_CREATED',
        activityDescription: `Provisioned ${payload.assignedRole} account for ${newStaff.fullName} (${newStaff.employeeId}) in ${dept.code}.`,
        departmentCode: dept.code,
        status: 'Verified',
      });

      return newStaff;
    });
  },

  async updateStaffAccount(
    staffId: string,
    updates: {
      fullName?: string;
      designation?: string;
      departmentId?: string;
      assignedRole?: StaffRole;
      status?: AccountStatus;
    },
    actorName: string,
    actorEmployeeId: string
  ) {
    return withAdapterDelay<StaffAccount>(() => {
      const db = getMockDb();
      const staff = db.staffAccounts.find((s) => s.id === staffId);
      if (!staff) throw new Error('Account not found.');

      if (updates.fullName) staff.fullName = updates.fullName.trim();
      if (updates.designation) staff.designation = updates.designation.trim();
      if (updates.status) staff.status = updates.status;

      if (updates.departmentId && updates.departmentId !== staff.departmentId) {
        const nextDept = db.departments.find((d) => d.id === updates.departmentId);
        if (!nextDept) throw new Error('Target department not found.');
        staff.departmentId = nextDept.id;
        staff.departmentCode = nextDept.code;
        staff.departmentName = nextDept.name;
      }

      if (updates.assignedRole && updates.assignedRole !== staff.assignedRole) {
        staff.assignedRole = updates.assignedRole;
        if (updates.assignedRole === 'HOD') {
          const dept = db.departments.find((d) => d.id === staff.departmentId);
          if (dept) {
            dept.hodUserId = staff.id;
            dept.hodName = staff.fullName;
            dept.hodEmail = staff.email;
          }
        }
      }

      saveMockDb(db);

      appendAuditLog({
        actorName,
        actorEmployeeId,
        actorRole: 'PRINCIPAL',
        actionCategory: 'STAFF_ACCOUNT_CREATED',
        activityDescription: `Updated account details/status (${staff.status}) for ${staff.fullName} (${staff.employeeId}).`,
        departmentCode: staff.departmentCode,
        status: 'Completed',
      });

      return { ...staff };
    });
  },

  async triggerAuthorizedAccessReset(staffId: string, actorName: string, actorEmployeeId: string) {
    return withAdapterDelay<{ referenceCode: string; message: string }>(() => {
      const db = getMockDb();
      const staff = db.staffAccounts.find((s) => s.id === staffId);
      if (!staff) throw new Error('Staff account not found.');

      staff.status = 'Reset Pending';
      saveMockDb(db);

      const referenceCode = `RST-${staff.departmentCode}-${Math.floor(100000 + Math.random() * 900000)}`;

      appendAuditLog({
        actorName,
        actorEmployeeId,
        actorRole: 'PRINCIPAL',
        actionCategory: 'STAFF_ACCOUNT_CREATED',
        activityDescription: `Initiated authorized credential reset dispatch [${referenceCode}] for ${staff.fullName} (${staff.email}).`,
        departmentCode: staff.departmentCode,
        status: 'Verified',
      });

      return {
        referenceCode,
        message: `Authorized access reset link dispatched to ${staff.email} (Audit Ref: ${referenceCode}).`,
      };
    });
  },
};
