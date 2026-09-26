// ============================================================================
// DineroYa — Contexto de datos (estado global sobre el adaptador activo)
// ============================================================================
import React, { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AppSettings, AuditEvent, Client, CollectionActivity, CustomRole, Installment, Loan, Payment, Profile, UserRole,
} from '../types';
import {
  DataAdapter, getAdapter, CreateLoanInput, PayInput, ActivityInput, NewClientInput,
} from '../services/dataAdapter';
import { buildDashboardStats, DashboardStatsLike } from '../lib/engine';

interface DataState {
  loading: boolean;
  error: string | null;
  clients: Client[];
  loans: Loan[];
  installments: Installment[];
  payments: Payment[];
  activities: CollectionActivity[];
  auditEvents: AuditEvent[];
  profiles: Profile[];
  roles: CustomRole[];
  saveRole: (role: CustomRole) => Promise<void>;
  deleteRole: (roleId: string) => Promise<void>;
  settings: AppSettings;
  stats: DashboardStatsLike;
  // acciones
  createClient: (input: NewClientInput) => Promise<Client>;
  updateClient: (id: string, patch: Partial<NewClientInput> & { active?: boolean }) => Promise<void>;
  createLoan: (input: CreateLoanInput) => Promise<Loan>;
  cancelLoan: (id: string, reason: string) => Promise<void>;
  assignLoan: (id: string, userId: string | null) => Promise<void>;
  registerPayment: (input: PayInput) => Promise<Payment>;
  voidPayment: (paymentId: string, reason: string) => Promise<void>;
  logActivity: (input: ActivityInput) => Promise<CollectionActivity>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>;
  updateProfileRole: (userId: string, role: UserRole) => Promise<void>;
  toggleProfileActive: (userId: string, active: boolean) => Promise<void>;
  refresh: () => Promise<void>;
}

const DataContext = createContext<DataState | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const adapter: DataAdapter = getAdapter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [activities, setActivities] = useState<CollectionActivity[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    currency: '$', defaultInterestRate: 15, companyName: 'FinanzaPro',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, l, i, p, a, ev, pr, s] = await Promise.all([
        adapter.listClients(), adapter.listLoans(), adapter.listInstallments(),
        adapter.listPayments(), adapter.listActivities(), adapter.listAuditEvents(),
        adapter.listProfiles().catch(() => [] as Profile[]), adapter.getSettings(),
      ]);
      const rs = await adapter.listRoles().catch(() => [] as CustomRole[]);
      setClients(c); setLoans(l); setInstallments(i); setPayments(p);
      setActivities(a); setAuditEvents(ev); setProfiles(pr); setSettings(s); setRoles(rs);
    } catch (e: any) {
      setError(e?.message ?? 'Error cargando datos');
    } finally {
      setLoading(false);
    }
  }, [adapter]);

  useEffect(() => { load(); }, [load]);

  // Refresco de perfiles tras cada login (nombre/rol del usuario actual)
  useEffect(() => {
    if (!loading) {
      adapter.listProfiles().then(setProfiles).catch(() => {});
    }
  }, [adapter, loading]);

  // --- Acciones (mutación + refresco) ----------------------------------------

  const wrap = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    setError(null);
    try {
      const result = await fn();
      await load();
      return result;
    } catch (e: any) {
      const msg = e?.message ?? 'Error inesperado';
      setError(msg);
      throw new Error(msg);
    }
  }, [load]);

  const createClient = useCallback((input: NewClientInput) => wrap(() => adapter.createClient(input)), [adapter, wrap]);
  const updateClient = useCallback((id: string, patch: Partial<NewClientInput> & { active?: boolean }) => wrap(() => adapter.updateClient(id, patch)), [adapter, wrap]);
  const createLoan = useCallback((input: CreateLoanInput) => wrap(() => adapter.createLoan(input)), [adapter, wrap]);
  const cancelLoan = useCallback((id: string, reason: string) => wrap(() => adapter.cancelLoan(id, reason)), [adapter, wrap]);
  const assignLoan = useCallback((id: string, userId: string | null) => wrap(() => adapter.assignLoan(id, userId)), [adapter, wrap]);
  const registerPayment = useCallback((input: PayInput) => wrap(() => adapter.registerPayment(input)), [adapter, wrap]);
  const voidPayment = useCallback((paymentId: string, reason: string) => wrap(() => adapter.voidPayment(paymentId, reason)), [adapter, wrap]);
  const logActivity = useCallback((input: ActivityInput) => wrap(() => adapter.logActivity(input)), [adapter, wrap]);
  const updateSettings = useCallback((patch: Partial<AppSettings>) => wrap(() => adapter.updateSettings(patch)), [adapter, wrap]);
  const updateProfileRole = useCallback((userId: string, role: UserRole) => wrap(() => adapter.updateProfileRole(userId, role)), [adapter, wrap]);

  const saveRole = useCallback(async (role: CustomRole) => {
    await wrap(() => adapter.saveRole(role));
    const rs = await adapter.listRoles().catch(() => [] as CustomRole[]);
    setRoles(rs);
  }, [adapter, wrap]);

  const deleteRole = useCallback(async (roleId: string) => {
    await wrap(() => adapter.deleteRole(roleId));
    const rs = await adapter.listRoles().catch(() => [] as CustomRole[]);
    setRoles(rs);
  }, [adapter, wrap]);
  const toggleProfileActive = useCallback((userId: string, active: boolean) => wrap(() => adapter.toggleProfileActive(userId, active)), [adapter, wrap]);

  // --- Estadísticas derivadas ---------------------------------------------------

  const stats = useMemo(
    () => buildDashboardStats(loans, clients, installments, payments, activities, settings),
    [loans, clients, installments, payments, activities, settings]
  );

  return (
    <DataContext.Provider value={{
      loading, error, clients, loans, installments, payments, activities,
      auditEvents, profiles, roles, settings, stats,
      createClient, updateClient, createLoan, cancelLoan, assignLoan,
      registerPayment, voidPayment, logActivity, updateSettings,
      updateProfileRole, toggleProfileActive, saveRole, deleteRole, refresh: load,
    }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = (): DataState => {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData debe usarse dentro de DataProvider');
  return ctx;
};
