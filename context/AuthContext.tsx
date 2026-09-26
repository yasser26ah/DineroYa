// ============================================================================
// DineroYa — Contexto de autenticación (roles por adaptador)
// ============================================================================
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getAdapter, isSupabaseConfigured, AuthUser } from '../services/dataAdapter';

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  mode: 'local' | 'supabase';
  isSupabase: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const adapter = getAdapter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const session = await adapter.getSession();
    setUser(session);
  }, [adapter]);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    const u = await adapter.signIn(email, password);
    setUser(u);
  }, [adapter]);

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    await adapter.signUp(email, password, fullName);
  }, [adapter]);

  const resetPassword = useCallback(async (email: string) => {
    await adapter.resetPassword(email);
  }, [adapter]);

  const updatePassword = useCallback(async (newPassword: string) => {
    await adapter.updatePassword(newPassword);
  }, [adapter]);

  const signOut = useCallback(async () => {
    await adapter.signOut();
    setUser(null);
  }, [adapter]);

  return (
    <AuthContext.Provider value={{ user, loading, mode: adapter.mode, isSupabase: isSupabaseConfigured, signIn, signUp, resetPassword, updatePassword, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthState => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
};
