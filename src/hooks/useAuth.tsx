import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { qbankApi, setStaffToken } from '../services/qbankApi';
import type { AuthMode, UserView } from '../types';

interface AuthContextValue {
  loading: boolean;
  serverError: string | null;
  authMode: AuthMode;
  setupRequired: boolean;
  user: UserView | null;
  refreshInfo: () => Promise<void>;
  setupAdmin: (username: string, displayName: string, password: string) => Promise<void>;
  login: (username: string, password: string) => Promise<UserView>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loading, setLoading] = useState(true);
  const [serverError, setServerError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>('standalone');
  const [setupRequired, setSetupRequired] = useState(false);
  const [user, setUser] = useState<UserView | null>(null);

  const refreshInfo = useCallback(async () => {
    setLoading(true);
    setServerError(null);
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const info = await qbankApi.auth.info();
        setAuthMode(info.authMode);
        setSetupRequired(Boolean(info.setupRequired));
        setUser(info.user ?? null);
        setLoading(false);
        return;
      } catch (err) {
        lastError = err;
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 1200));
        }
      }
    }
    setServerError(
      lastError instanceof Error ? lastError.message : 'Unable to reach QBank server'
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void refreshInfo();
  }, [refreshInfo]);

  const setupAdmin = useCallback(
    async (username: string, displayName: string, password: string) => {
      await qbankApi.auth.setupAdmin({ username, displayName, password });
      setSetupRequired(false);
      await refreshInfo();
    },
    [refreshInfo]
  );

  const login = useCallback(async (username: string, password: string) => {
    const res = await qbankApi.auth.login({ username, password });
    setStaffToken(res.token);
    setUser(res.user);
    setSetupRequired(false);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await qbankApi.auth.logout();
    } catch {
      // ignore network error on logout
    }
    setStaffToken(null);
    setUser(null);
    await refreshInfo();
  }, [refreshInfo]);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    await qbankApi.auth.changePassword({ currentPassword, newPassword });
    setUser((prev) => (prev ? { ...prev, mustChangePassword: false } : prev));
  }, []);

  return (
    <AuthContext.Provider
      value={{
        loading,
        serverError,
        authMode,
        setupRequired,
        user,
        refreshInfo,
        setupAdmin,
        login,
        logout,
        changePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
