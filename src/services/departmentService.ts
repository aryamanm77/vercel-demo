import { appendAuditLog, getMockDb, saveMockDb } from '../data/mockDatabase';
import { Department, DepartmentStatus } from '../types';
import { withAdapterDelay } from './apiConfig';

export interface CreateDepartmentPayload {
  name: string;
  code: string;
  identificationNumber: string;
  contactEmail: string;
  contactPhone: string;
  buildingBlock: string;
  hodUserId?: string;
}

export const departmentService = {
  async getAllDepartments() {
    return withAdapterDelay<Department[]>(() => {
      return [...getMockDb().departments];
    });
  },

  async getDepartmentById(departmentId: string) {
    return withAdapterDelay<Department>(() => {
      const dept = getMockDb().departments.find((d) => d.id === departmentId);
      if (!dept) throw new Error('Department not found.');
      return { ...dept };
    });
  },

  async createDepartment(payload: CreateDepartmentPayload, actorName: string, actorEmployeeId: string) {
    return withAdapterDelay<Department>(() => {
      const db = getMockDb();
      const normalizedCode = payload.code.trim().toUpperCase();

      if (!normalizedCode || !payload.name.trim()) {
        throw new Error('Department Name and Department Code are required.');
      }

      const duplicateCode = db.departments.some(
        (d) => d.code.toUpperCase() === normalizedCode
      );
      if (duplicateCode) {
        throw new Error(`Duplicate Department Code "${normalizedCode}" detected. Each department must have a unique code.`);
      }

      const duplicateIdNum = db.departments.some(
        (d) => d.identificationNumber.toUpperCase() === payload.identificationNumber.trim().toUpperCase()
      );
      if (duplicateIdNum) {
        throw new Error(`Department Identification Number "${payload.identificationNumber}" is already assigned.`);
      }

      const assignedStaff = payload.hodUserId
        ? db.staffAccounts.find((s) => s.id === payload.hodUserId)
        : undefined;

      const newDept: Department = {
        id: `dept-${normalizedCode.toLowerCase()}-${Date.now()}`,
        code: normalizedCode,
        name: payload.name.trim(),
        identificationNumber: payload.identificationNumber.trim().toUpperCase(),
        hodUserId: assignedStaff?.id,
        hodName: assignedStaff?.fullName,
        hodEmail: assignedStaff?.email,
        contactEmail: payload.contactEmail.trim(),
        contactPhone: payload.contactPhone.trim(),
        buildingBlock: payload.buildingBlock.trim() || 'Main Academic Block',
        status: 'Active',
        createdAt: new Date().toISOString().split('T')[0],
        totalSubjects: 0,
        totalStudents: 0,
        totalStaff: assignedStaff ? 1 : 0,
        hasExamRecords: false,
      };

      db.departments.push(newDept);
      saveMockDb(db);

      appendAuditLog({
        actorName,
        actorEmployeeId,
        actorRole: 'PRINCIPAL',
        actionCategory: 'DEPARTMENT_CREATED',
        activityDescription: `Created department "${newDept.name}" (${newDept.code}) with ID ${newDept.identificationNumber}.`,
        departmentCode: newDept.code,
        status: 'Completed',
      });

      return newDept;
    });
  },

  async updateDepartment(
    departmentId: string,
    updates: Partial<CreateDepartmentPayload>,
    actorName: string,
    actorEmployeeId: string
  ) {
    return withAdapterDelay<Department>(() => {
      const db = getMockDb();
      const dept = db.departments.find((d) => d.id === departmentId);
      if (!dept) throw new Error('Department record not found.');

      if (updates.code) {
        const nextCode = updates.code.trim().toUpperCase();
        const duplicate = db.departments.some(
          (d) => d.id !== departmentId && d.code.toUpperCase() === nextCode
        );
        if (duplicate) {
          throw new Error(`Department Code "${nextCode}" is already used by another department.`);
        }
        dept.code = nextCode;
      }

      if (updates.name) dept.name = updates.name.trim();
      if (updates.identificationNumber) dept.identificationNumber = updates.identificationNumber.trim().toUpperCase();
      if (updates.contactEmail) dept.contactEmail = updates.contactEmail.trim();
      if (updates.contactPhone) dept.contactPhone = updates.contactPhone.trim();
      if (updates.buildingBlock) dept.buildingBlock = updates.buildingBlock.trim();

      saveMockDb(db);

      appendAuditLog({
        actorName,
        actorEmployeeId,
        actorRole: 'PRINCIPAL',
        actionCategory: 'DEPARTMENT_STATUS_CHANGED',
        activityDescription: `Updated administrative metadata for department ${dept.name} (${dept.code}).`,
        departmentCode: dept.code,
        status: 'Completed',
      });

      return { ...dept };
    });
  },

  async toggleDepartmentStatus(
    departmentId: string,
    nextStatus: DepartmentStatus,
    actorName: string,
    actorEmployeeId: string
  ) {
    return withAdapterDelay<Department>(() => {
      const db = getMockDb();
      const dept = db.departments.find((d) => d.id === departmentId);
      if (!dept) throw new Error('Department not found.');

      dept.status = nextStatus;
      saveMockDb(db);

      appendAuditLog({
        actorName,
        actorEmployeeId,
        actorRole: 'PRINCIPAL',
        actionCategory: 'DEPARTMENT_STATUS_CHANGED',
        activityDescription: `Changed status of department ${dept.name} (${dept.code}) to ${nextStatus}.`,
        departmentCode: dept.code,
        status: 'Completed',
      });

      return { ...dept };
    });
  },

  async assignHodToDepartment(
    departmentId: string,
    staffId: string,
    actorName: string,
    actorEmployeeId: string
  ) {
    return withAdapterDelay<Department>(() => {
      const db = getMockDb();
      const dept = db.departments.find((d) => d.id === departmentId);
      if (!dept) throw new Error('Department not found.');

      const staff = db.staffAccounts.find((s) => s.id === staffId);
      if (!staff) throw new Error('Selected staff account not found.');

      const previousHodName = dept.hodName;
      dept.hodUserId = staff.id;
      dept.hodName = staff.fullName;
      dept.hodEmail = staff.email;

      // Update staff account role & department assignment while preserving history
      staff.assignedRole = 'HOD';
      staff.departmentId = dept.id;
      staff.departmentCode = dept.code;
      staff.departmentName = dept.name;

      // Also sync AuthUser if exists
      const authUser = db.users.find((u) => u.id === staff.id || u.email.toLowerCase() === staff.email.toLowerCase());
      if (authUser) {
        authUser.departmentId = dept.id;
        authUser.departmentCode = dept.code;
        authUser.departmentName = dept.name;
      }

      saveMockDb(db);

      appendAuditLog({
        actorName,
        actorEmployeeId,
        actorRole: 'PRINCIPAL',
        actionCategory: 'HOD_ASSIGNED',
        activityDescription: `Assigned ${staff.fullName} (${staff.employeeId}) as HOD of ${dept.code}${previousHodName ? ` (replacing ${previousHodName}, historical exam records preserved)` : ''}.`,
        departmentCode: dept.code,
        status: 'Verified',
      });

      return { ...dept };
    });
  },

  async deleteDepartment(departmentId: string) {
    return withAdapterDelay<void>(() => {
      const db = getMockDb();
      const dept = db.departments.find((d) => d.id === departmentId);
      if (!dept) throw new Error('Department not found.');

      const hasSubjects = db.subjects.some((s) => s.departmentId === departmentId);
      const hasQuestionBanks = db.questionBanks.some((q) => q.departmentId === departmentId);
      if (dept.hasExamRecords || hasSubjects || hasQuestionBanks) {
        throw new Error(
          `Cannot delete department "${dept.code}" because it has linked academic subjects or examination records. Please use Deactivate instead.`
        );
      }

      db.departments = db.departments.filter((d) => d.id !== departmentId);
      saveMockDb(db);
    });
  },
};
