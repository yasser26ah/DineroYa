// ============================================================================
// DineroYa — Contexto de datos (estado global sobre el adaptador activo)
// ============================================================================
import React, { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react';
import {
    AppNotification, AppSettings, AuditEvent, Client, CollectionActivity, CreditApplication,
    CreditApplicationStatus, CustomRole, Installment, Loan, NotificationStatus, NotificationTemplate, Payment,
    PaymentChannel, PaymentMethodOption, Profile, RestructureLoanInput, UserRole,
  } from '../types';

import {
  DataAdapter, getAdapter, CreateLoanInput, PayInput, ActivityInput, NewClientInput, NewCreditApplicationInput,
  NewNotificationInput, PaymentChannelInput, BackupInfo, ServerError, StateHealth,
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
  applications: CreditApplication[];
  paymentMethods: PaymentMethodOption[];
  notificationTemplates: NotificationTemplate[];
  notifications: AppNotification[];
  paymentChannels: PaymentChannel[];
  saveRole: (role: CustomRole) => Promise<void>;
  deleteRole: (roleId: string) => Promise<void>;
  settings: AppSettings;
  stats: DashboardStatsLike;
  // acciones
  createClient: (input: NewClientInput) => Promise<Client>;
  updateClient: (id: string, patch: Partial<NewClientInput> & { active?: boolean }) => Promise<void>;
  createLoan: (input: CreateLoanInput) => Promise<Loan>;
  cancelLoan: (id: string, reason: string) => Promise<void>;
  restructureLoan: (input: RestructureLoanInput) => Promise<Loan>;
  assignLoan: (id: string, userId: string | null) => Promise<void>;
  registerPayment: (input: PayInput) => Promise<Payment>;
  voidPayment: (paymentId: string, reason: string) => Promise<void>;
  logActivity: (input: ActivityInput) => Promise<CollectionActivity>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>;
  mergeClients: (keepId: string, mergeId: string) => Promise<void>;
  updateProfileRole: (userId: string, role: UserRole) => Promise<void>;
  toggleProfileActive: (userId: string, active: boolean) => Promise<void>;
  savePaymentMethod: (input: { id?: string; name: string; active?: boolean }) => Promise<PaymentMethodOption>;
  saveNotificationTemplate: (input: NotificationTemplate) => Promise<NotificationTemplate>;
  createNotification: (input: NewNotificationInput) => Promise<AppNotification>;
  setNotificationStatus: (id: string, status: NotificationStatus) => Promise<void>;
  savePaymentChannel: (input: PaymentChannelInput) => Promise<PaymentChannel>;
  createApplication: (input: NewCreditApplicationInput) => Promise<CreditApplication>;
  updateApplicationStatus: (
    id: string,
    status: CreditApplicationStatus,
    reviewNotes?: string,
    approvedAmount?: number | null,
  ) => Promise<void>;
  linkClientToProfile: (userId: string, clientId: string | null) => Promise<void>;
  importBackup: (data: Record<string, unknown>) => Promise<void>;
  listBackups: () => Promise<BackupInfo[]>;
  restoreBackup: (id: number) => Promise<void>;
  listServerErrors: () => Promise<ServerError[]>;
  getHealth: () => Promise<StateHealth | null>;
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
  const [applications, setApplications] = useState<CreditApplication[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([]);
  const [notificationTemplates, setNotificationTemplates] = useState<NotificationTemplate[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [paymentChannels, setPaymentChannels] = useState<PaymentChannel[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    currency: '$', defaultInterestRate: 15, companyName: 'DineroYa',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, l, i, p, a, ev, pr, s, apps, pm, tpl, notif, chans] = await Promise.all([
        adapter.listClients(), adapter.listLoans(), adapter.listInstallments(),
        adapter.listPayments(), adapter.listActivities(), adapter.listAuditEvents(),
        adapter.listProfiles().catch(() => [] as Profile[]), adapter.getSettings(),
        adapter.listApplications().catch(() => [] as CreditApplication[]),
        adapter.listPaymentMethods().catch(() => [] as PaymentMethodOption[]),
        adapter.listNotificationTemplates().catch(() => [] as NotificationTemplate[]),
        adapter.listNotifications().catch(() => [] as AppNotification[]),
        adapter.listPaymentChannels().catch(() => [] as PaymentChannel[]),
      ]);
      const rs = await adapter.listRoles().catch(() => [] as CustomRole[]);
      setClients(c); setLoans(l); setInstallments(i); setPayments(p);
      setActivities(a); setAuditEvents(ev); setProfiles(pr); setSettings(s); setRoles(rs);
      setApplications(apps);
      setPaymentMethods(pm);
      setNotificationTemplates(tpl); setNotifications(notif);
      setPaymentChannels(chans);
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
  const restructureLoan = useCallback((input: RestructureLoanInput) => wrap(() => adapter.restructureLoan(input)), [adapter, wrap]);
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
  const createApplication = useCallback((input: NewCreditApplicationInput) => wrap(() => adapter.createApplication(input)), [adapter, wrap]);
  const updateApplicationStatus = useCallback(
    (id: string, status: CreditApplicationStatus, reviewNotes?: string, approvedAmount?: number | null) =>
      wrap(() => adapter.updateApplicationStatus(id, status, reviewNotes, approvedAmount)),
    [adapter, wrap],
  );
  const saveNotificationTemplate = useCallback(async (input: NotificationTemplate) => {
    const saved = await wrap(() => adapter.saveNotificationTemplate(input));
    setNotificationTemplates(prev => [...prev.filter(t => t.id !== saved.id), saved]);
    return saved;
  }, [adapter, wrap]);

  const createNotification = useCallback(async (input: NewNotificationInput) => {
    const created = await wrap(() => adapter.createNotification(input));
    setNotifications(prev => [created, ...prev]);
    return created;
  }, [adapter, wrap]);

  const setNotificationStatus = useCallback(async (id: string, status: NotificationStatus) => {
    await wrap(() => adapter.setNotificationStatus(id, status));
    setNotifications(prev => prev.map(n => (n.id === id
      ? { ...n, status, sentAt: status === 'sent' ? new Date().toISOString() : n.sentAt }
      : n)));
  }, [adapter, wrap]);

  const savePaymentChannel = useCallback(async (input: PaymentChannelInput) => {
    const saved = await wrap(() => adapter.savePaymentChannel(input));
    setPaymentChannels(prev => [...prev.filter(c => c.id !== saved.id), saved].sort((a, b) => a.sortOrder - b.sortOrder));
    return saved;
  }, [adapter, wrap]);

  const savePaymentMethod = useCallback(async (input: { id?: string; name: string; active?: boolean }) => {
    const saved = await wrap(() => adapter.savePaymentMethod(input));
    setPaymentMethods(prev => [...prev.filter(m => m.id !== saved.id), saved].sort((a, b) => a.sortOrder - b.sortOrder));
    return saved;
  }, [adapter, wrap]);

  const mergeClients = useCallback(async (keepId: string, mergeId: string) => {
    await wrap(() => adapter.mergeClients(keepId, mergeId));
    await load();
  }, [adapter, wrap, load]);

  const linkClientToProfile = useCallback((userId: string, clientId: string | null) =>
    wrap(() => adapter.linkClientToProfile(userId, clientId)), [adapter, wrap]);

  const importBackup = useCallback((data: Record<string, unknown>) =>
    wrap(() => adapter.importBackup(data)), [adapter, wrap]);

  const listBackups = useCallback(() => adapter.listBackups(), [adapter]);
  const listServerErrors = useCallback(() => adapter.listServerErrors(), [adapter]);
  const getHealth = useCallback(() => adapter.getHealth(), [adapter]);
  const restoreBackup = useCallback(async (id: number) => {
    await wrap(() => adapter.restoreBackup(id));
    await load();
  }, [adapter, wrap, load]);

  // --- Estadísticas derivadas ---------------------------------------------------

  const stats = useMemo(
    () => buildDashboardStats(loans, clients, installments, payments, activities, settings),
    [loans, clients, installments, payments, activities, settings]
  );

  return (
    <DataContext.Provider value={{
      loading, error, clients, loans, installments, payments, activities,
      auditEvents, profiles, roles, applications, settings, stats, paymentMethods,
      notificationTemplates, notifications, paymentChannels,
      createClient, updateClient, mergeClients, createLoan, cancelLoan, restructureLoan, assignLoan,
      registerPayment, voidPayment, logActivity, updateSettings,
      updateProfileRole, toggleProfileActive, createApplication, updateApplicationStatus,
      savePaymentMethod, saveNotificationTemplate, createNotification, setNotificationStatus,
      savePaymentChannel,
      linkClientToProfile, importBackup, listBackups, restoreBackup, listServerErrors, getHealth,
      saveRole, deleteRole, refresh: load,
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
