import React, { createContext, useContext, useState } from 'react';
import { AuthUser } from '../types';
import { authService, LoginCredentials, AuthResponse } from '../services/authService';

interface AuthContextValue {
  user: AuthUser | null;
  login: (credentials: LoginCredentials) => Promise<AuthResponse>;
  logout: () => void;
  refreshUser: (updated: AuthUser) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(() => authService.getCurrentUser());

  const login = async (credentials: LoginCredentials) => {
    const res = await authService.login(credentials);
    setUser(res.user);
    return res;
  };

  const logout = () => {
    authService.logout();
    setUser(null);
  };

  const refreshUser = (updated: AuthUser) => {
    setUser(updated);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
