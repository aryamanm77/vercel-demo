import { AuthUser } from '../types';
import { getMockDb, saveMockDb } from '../data/mockDatabase';
import { API_CONFIG } from './apiConfig';

const SESSION_KEY = 'mit_mysore_admin_auth_session';

export interface LoginCredentials {
  identifier: string; // username or email
  password: string;
}

export interface AuthResponse {
  user: AuthUser;
  redirectPath: string;
}

export const authService = {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    if (API_CONFIG.useMockAdapter) {
      await new Promise((r) => setTimeout(r, 320));
    }

    const identifierClean = credentials.identifier.trim().toLowerCase();
    const passwordClean = credentials.password;

    if (!identifierClean || !passwordClean) {
      throw new Error('Please enter both your institutional email/username and password.');
    }

    const db = getMockDb();
    const matched = db.users.find(
      (u) =>
        (u.email.toLowerCase() === identifierClean ||
          u.username.toLowerCase() === identifierClean ||
          u.employeeId.toLowerCase() === identifierClean) &&
        u.passwordHash === passwordClean
    );

    if (!matched) {
      throw new Error(
        'Invalid institutional credentials. Please verify your MIT Mysore email/username and password.'
      );
    }

    // Check if staff account is active for HODs
    if (matched.role === 'HOD') {
      const staffRecord = db.staffAccounts.find((s) => s.id === matched.id || s.email.toLowerCase() === matched.email.toLowerCase());
      if (staffRecord && staffRecord.status === 'Inactive') {
        throw new Error('Your HOD account has been deactivated by the Principal Office. Contact Central Administration.');
      }
    }

    const now = new Date();
    const formattedLogin = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    matched.lastLogin = formattedLogin;
    saveMockDb(db);

    const { passwordHash: _removed, ...safeUser } = matched;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(safeUser));

    const redirectPath =
      safeUser.role === 'PRINCIPAL' ? '/admin/principal/dashboard' : '/admin/hod/dashboard';

    return {
      user: safeUser,
      redirectPath,
    };
  },

  getCurrentUser(): AuthUser | null {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  },

  async updateProfile(userId: string, updates: { fullName: string; phone?: string; designation?: string }): Promise<AuthUser> {
    if (API_CONFIG.useMockAdapter) {
      await new Promise((r) => setTimeout(r, 200));
    }
    const db = getMockDb();
    const user = db.users.find((u) => u.id === userId);
    if (!user) throw new Error('User record not found.');

    user.fullName = updates.fullName.trim() || user.fullName;
    if (updates.phone !== undefined) user.phone = updates.phone.trim();
    if (updates.designation !== undefined) user.designation = updates.designation.trim();

    saveMockDb(db);
    const { passwordHash: _removed, ...safeUser } = user;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(safeUser));
    return safeUser;
  },

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    if (API_CONFIG.useMockAdapter) {
      await new Promise((r) => setTimeout(r, 250));
    }
    const db = getMockDb();
    const user = db.users.find((u) => u.id === userId);
    if (!user) throw new Error('Authenticated user record not found.');
    if (user.passwordHash !== currentPassword) {
      throw new Error('Current password verification failed.');
    }
    if (newPassword.length < 8) {
      throw new Error('New password must be at least 8 characters long.');
    }
    user.passwordHash = newPassword;
    saveMockDb(db);
  },

  logout(): void {
    sessionStorage.removeItem(SESSION_KEY);
  },
};
