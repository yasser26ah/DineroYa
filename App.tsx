
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, Wallet, PlusCircle, History, ArrowDownLeft, MessageSquare,
  TrendingUp, Search, ChevronDown, ChevronUp, AlertTriangle, 
  Layers, BellRing, Send, CalendarClock, Download, FileText,
  Filter, CheckCircle2, PieChart, Activity, ExternalLink, UserPlus,
  Settings, Menu, X, CreditCard, Landmark, Database, Trash2
} from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, AreaChart, Area
} from 'recharts';
import { Client, Loan, Payment, AppSettings } from './types';
import { generatePaymentMessage, generateOverdueMessage, generateReminderMessage } from './services/gemini';

// --- ENGINE: Lógica de Negocio Centralizada ---
class PortfolioEngine {
  static calculateTotalDue(principal: number, rate: number): number {
    return Number((principal * (1 + rate / 100)).toFixed(2));
  }

  static getNextInstallmentNumber(loanId: string, payments: Payment[]): number {
    const loanPayments = payments.filter(p => p.loanId === loanId);
    return loanPayments.length + 1;
  }

  static calculateRiskScore(clientId: string, loans: Loan[]): number {
    const clientLoans = loans.filter(l => l.clientId === clientId);
    if (clientLoans.length === 0) return 50;

    let score = 50;
    clientLoans.forEach(loan => {
      if (loan.status === 'paid') score += 15;
      if (loan.status === 'overdue') score -= 40;
    });
    return Math.min(100, Math.max(1, score));
  }
}

// --- UI COMPONENTS ---
const RiskBadge = ({ score }: { score: number }) => {
  const config = score >= 80 
    ? { label: 'Excelente', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' }
    : score >= 40 
      ? { label: 'Regular', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' }
      : { label: 'Crítico', color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-100' };

  return (
    <div className={`flex flex-col gap-1`}>
      <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider">
        <span className={config.color}>{config.label}</span>
        <span className="text-slate-400">{score}/100</span>
      </div>
      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-50">
        <div 
          className={`h-full transition-all duration-700 ${score >= 80 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`} 
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
};

const MetricCard = ({ label, value, subValue, icon: Icon, trend }: any) => (
  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-all group">
    <div className="flex justify-between items-start mb-4">
      <div className="p-3 bg-slate-50 rounded-2xl group-hover:bg-indigo-50 transition-colors">
        <Icon className="w-6 h-6 text-slate-400 group-hover:text-indigo-600" />
      </div>
      {trend !== undefined && (
        <span className={`text-xs font-bold px-2 py-1 rounded-lg ${trend >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
          {trend >= 0 ? '+' : ''}{trend}%
        </span>
      )}
    </div>
    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
    <h3 className="text-2xl font-black text-slate-900">{value}</h3>
    {subValue && <p className="text-xs text-slate-500 mt-1 font-medium">{subValue}</p>}
  </div>
);

const App: React.FC = () => {
  // Database States
  const [clients, setClients] = useState<Client[]>(() => JSON.parse(localStorage.getItem('db_clients') || '[]'));
  const [loans, setLoans] = useState<Loan[]>(() => JSON.parse(localStorage.getItem('db_loans') || '[]'));
  const [payments, setPayments] = useState<Payment[]>(() => JSON.parse(localStorage.getItem('db_payments') || '[]'));
  const [settings, setSettings] = useState<AppSettings>(() => JSON.parse(localStorage.getItem('db_settings') || JSON.stringify({
    currency: '$',
    defaultInterestRate: 15,
    companyName: 'FinanzaPro',
    theme: 'light'
  })));

  // UI States
  const [activeTab, setActiveTab] = useState<'dashboard' | 'clients' | 'active-loans' | 'history' | 'settings'>('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState<'client' | 'loan' | 'payment' | 'client-details' | null>(null);
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isDraftOpen, setIsDraftOpen] = useState(false);
  const [draft, setDraft] = useState({ message: '', client: null as Client | null, type: '' });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Persistence
  useEffect(() => {
    localStorage.setItem('db_clients', JSON.stringify(clients));
    localStorage.setItem('db_loans', JSON.stringify(loans));
    localStorage.setItem('db_payments', JSON.stringify(payments));
    localStorage.setItem('db_settings', JSON.stringify(settings));
  }, [clients, loans, payments, settings]);

  // Real-time recalculations
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    
    setLoans(prevLoans => prevLoans.map(l => {
      if (l.status === 'active' && l.dueDate < today) return { ...l, status: 'overdue' as const };
      return l;
    }));

    setClients(prevClients => prevClients.map(c => ({
      ...c,
      riskScore: PortfolioEngine.calculateRiskScore(c.id, loans)
    })));
  }, [loans.length, payments.length]);

  // Derived Metrics
  const stats = useMemo(() => {
    const totalPrincipal = loans.reduce((acc, l) => acc + l.principal, 0);
    const totalCollected = payments.reduce((acc, p) => acc + p.amount, 0);
    const outstanding = loans.reduce((acc, l) => acc + l.remainingBalance, 0);
    const expectedInterest = loans.reduce((acc, l) => acc + l.totalInterest, 0);

    return {
      totalPrincipal,
      totalCollected,
      outstanding,
      expectedInterest,
      recoveryRate: totalPrincipal > 0 ? (totalCollected / (totalPrincipal + expectedInterest) * 100).toFixed(1) : 0,
      activeLoansCount: loans.filter(l => l.status !== 'paid').length
    };
  }, [loans, payments]);

  // HANDLERS
  const createClient = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const newClient: Client = {
      id: crypto.randomUUID(),
      name: fd.get('name') as string,
      phone: fd.get('phone') as string,
      email: fd.get('email') as string,
      address: fd.get('address') as string,
      notes: fd.get('notes') as string,
      registrationDate: new Date().toISOString().split('T')[0],
      riskScore: 50
    };
    setClients([...clients, newClient]);
    setIsModalOpen(null);
  };

  const createLoan = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const principal = Number(fd.get('amount'));
    const clientId = fd.get('clientId') as string;
    const client = clients.find(c => c.id === clientId);
    
    const rate = client ? (client.riskScore > 80 ? settings.defaultInterestRate - 5 : client.riskScore > 40 ? settings.defaultInterestRate : settings.defaultInterestRate + 10) : settings.defaultInterestRate;
    const totalDue = PortfolioEngine.calculateTotalDue(principal, rate);

    const newLoan: Loan = {
      id: crypto.randomUUID(),
      clientId,
      principal,
      interestRate: rate,
      totalInterest: totalDue - principal,
      totalDue,
      remainingBalance: totalDue,
      installmentsCount: Number(fd.get('installments')),
      startDate: new Date().toISOString().split('T')[0],
      dueDate: fd.get('dueDate') as string,
      status: 'active'
    };
    setLoans([...loans, newLoan]);
    setIsModalOpen(null);
  };

  const processPayment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedLoan) return;
    const fd = new FormData(e.currentTarget);
    const amount = Number(fd.get('amount'));
    const instNum = PortfolioEngine.getNextInstallmentNumber(selectedLoan.id, payments);

    const newPayment: Payment = {
      id: crypto.randomUUID(),
      loanId: selectedLoan.id,
      clientId: selectedLoan.clientId,
      amount,
      date: new Date().toISOString().split('T')[0],
      balanceAfter: Math.max(0, selectedLoan.remainingBalance - amount),
      installmentNumber: instNum
    };

    setPayments([...payments, newPayment]);
    setLoans(loans.map(l => l.id === selectedLoan.id ? {
      ...l,
      remainingBalance: newPayment.balanceAfter,
      status: newPayment.balanceAfter <= 0 ? 'paid' : l.status
    } : l));

    setIsModalOpen(null);

    const client = clients.find(c => c.id === selectedLoan.clientId);
    if (client) {
      const msg = await generatePaymentMessage(client, newPayment, { ...selectedLoan, remainingBalance: newPayment.balanceAfter });
      setDraft({ message: msg, client, type: 'payment' });
      setIsDraftOpen(true);
    }
  };

  // Fix: Added missing exportData function
  const exportData = () => {
    const data = { clients, loans, payments, settings };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup_${settings.companyName.replace(/\s+/g, '_').toLowerCase()}_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const clearData = () => {
    if (window.confirm('¿Está seguro de que desea eliminar todos los datos? Esta acción es irreversible.')) {
      setClients([]);
      setLoans([]);
      setPayments([]);
      localStorage.clear();
      window.location.reload();
    }
  };

  // Filtered Lists
  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.phone.includes(searchTerm)
  );

  const activeLoansList = loans.filter(l => (l.status === 'active' || l.status === 'overdue') && (
    clients.find(c => c.id === l.clientId)?.name.toLowerCase().includes(searchTerm.toLowerCase())
  ));

  const historyLoans = loans.filter(l => (filterStatus === 'all' || l.status === filterStatus) && (
    clients.find(c => c.id === l.clientId)?.name.toLowerCase().includes(searchTerm.toLowerCase())
  ));

  const NavigationItems = [
    { id: 'dashboard', label: 'Resumen Global', icon: PieChart },
    { id: 'clients', label: 'Mis Clientes', icon: Users },
    { id: 'active-loans', label: 'Préstamos Activos', icon: Wallet },
    { id: 'history', label: 'Historial / Auditoría', icon: History },
    { id: 'settings', label: 'Configuración', icon: Settings },
  ];

  return (
    <div className="min-h-screen flex bg-[#F8FAFC]">
      {/* Sidebar - Desktop */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-[#0F172A] flex flex-col p-8 text-white transition-transform duration-300 lg:translate-x-0 lg:static ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Activity className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-black tracking-tight">{settings.companyName}</h1>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden">
            <X className="w-6 h-6" />
          </button>
        </div>

        <nav className="flex flex-col gap-2">
          {NavigationItems.map(item => (
            <button
              key={item.id}
              onClick={() => { setActiveTab(item.id as any); setIsSidebarOpen(false); }}
              className={`flex items-center gap-4 px-6 py-4 rounded-2xl transition-all font-bold text-sm ${activeTab === item.id ? 'bg-indigo-600 shadow-lg shadow-indigo-600/20 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="mt-auto pt-8 border-t border-slate-800">
          <button onClick={() => { setActiveTab('settings'); setIsSidebarOpen(false); }} className="flex items-center gap-3 text-slate-400 hover:text-white transition font-bold text-xs uppercase tracking-widest mb-4">
            <Settings className="w-4 h-4" /> Ajustes del Sistema
          </button>
          <button onClick={clearData} className="flex items-center gap-3 text-rose-400 hover:text-rose-300 transition font-bold text-xs uppercase tracking-widest">
            <Trash2 className="w-4 h-4" /> Limpiar Base de Datos
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto">
        {/* Mobile Header */}
        <header className="lg:hidden sticky top-0 z-40 bg-white border-b border-slate-200 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <h1 className="font-black text-slate-900">{settings.companyName}</h1>
          </div>
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 bg-slate-100 rounded-lg">
            <Menu className="w-6 h-6 text-slate-600" />
          </button>
        </header>

        <div className="p-6 lg:p-12 max-w-7xl mx-auto">
          <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
            <div>
              <h2 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight">
                {NavigationItems.find(n => n.id === activeTab)?.label}
              </h2>
              <p className="text-slate-500 font-medium mt-1">
                {activeTab === 'dashboard' ? 'Métricas de rendimiento y salud financiera.' : 
                 activeTab === 'clients' ? 'Gestión completa de su cartera de clientes.' : 
                 activeTab === 'active-loans' ? 'Supervisión activa de cobros pendientes.' : 
                 activeTab === 'settings' ? 'Personalice su experiencia de usuario.' : 'Auditoría histórica de operaciones.'}
              </p>
            </div>
            <div className="flex gap-4">
              {activeTab !== 'settings' && (
                <>
                  <button onClick={() => setIsModalOpen('client')} className="bg-white border border-slate-200 text-slate-700 px-6 py-3 rounded-2xl font-bold hover:bg-slate-50 transition shadow-sm flex items-center gap-2">
                    <UserPlus className="w-5 h-5" /> Nuevo Cliente
                  </button>
                  <button onClick={() => setIsModalOpen('loan')} className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-600/20 flex items-center gap-2">
                    <PlusCircle className="w-5 h-5" /> Crear Préstamo
                  </button>
                </>
              )}
            </div>
          </header>

          {/* VIEW: DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div className="flex flex-col gap-10">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <MetricCard label="Colocación Total" value={`${settings.currency}${stats.totalPrincipal.toLocaleString()}`} icon={Wallet} />
                <MetricCard label="Cobrado Real" value={`${settings.currency}${stats.totalCollected.toLocaleString()}`} icon={CheckCircle2} subValue={`${stats.recoveryRate}% Recuperado`} />
                <MetricCard label="En Calle" value={`${settings.currency}${stats.outstanding.toLocaleString()}`} icon={AlertTriangle} />
                <MetricCard label="Vivos" value={stats.activeLoansCount} icon={Activity} subValue="Sin liquidar" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm">
                  <h3 className="text-xl font-black text-slate-900 mb-8">Evolución de Recaudación</h3>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={payments.slice(-15)}>
                        <defs>
                          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                        <XAxis dataKey="date" hide />
                        <YAxis hide />
                        <Tooltip contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                        <Area type="monotone" dataKey="amount" stroke="#6366f1" strokeWidth={4} fill="url(#chartGrad)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-[#0F172A] p-8 rounded-[40px] text-white flex flex-col shadow-2xl">
                  <h3 className="text-xl font-black mb-6">Próximos Cobros</h3>
                  <div className="flex-1 space-y-4 overflow-y-auto max-h-[300px] pr-2 scrollbar-hide">
                    {loans.filter(l => l.status === 'active').sort((a,b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 5).map(l => {
                      const c = clients.find(cl => cl.id === l.clientId);
                      return (
                        <div key={l.id} className="p-4 bg-slate-800/40 rounded-2xl border border-slate-700/30 flex justify-between items-center group hover:bg-indigo-900/20 transition">
                          <div>
                            <p className="font-bold text-sm truncate max-w-[120px]">{c?.name}</p>
                            <p className="text-[10px] text-indigo-400 font-black uppercase tracking-widest">{l.dueDate}</p>
                          </div>
                          <p className="font-black text-indigo-300">{settings.currency}{l.remainingBalance}</p>
                        </div>
                      );
                    })}
                    {loans.filter(l => l.status === 'active').length === 0 && <p className="text-slate-500 text-sm italic">Sin cobros pendientes.</p>}
                  </div>
                  <div className="mt-8 pt-6 border-t border-slate-800">
                    <div className="flex justify-between items-end">
                      <div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Rentabilidad</p>
                        <p className="text-3xl font-black text-emerald-400">+{((stats.expectedInterest / stats.totalPrincipal) * 100 || 0).toFixed(1)}%</p>
                      </div>
                      <PieChart className="w-10 h-10 text-slate-700" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW: CLIENTS */}
          {activeTab === 'clients' && (
            <div className="flex flex-col gap-6">
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
                <Search className="w-6 h-6 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Nombre, teléfono o email..." 
                  className="flex-1 bg-transparent border-none outline-none font-bold text-slate-700"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredClients.map(client => {
                  const clientLoans = loans.filter(l => l.clientId === client.id);
                  const activeDebt = clientLoans.filter(l => l.status !== 'paid').reduce((acc, l) => acc + l.remainingBalance, 0);
                  
                  return (
                    <div key={client.id} className="bg-white rounded-[32px] border border-slate-200 p-8 shadow-sm hover:shadow-lg transition-all group">
                      <div className="flex justify-between items-start mb-6">
                        <div className="flex items-center gap-4">
                          <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-100 group-hover:bg-indigo-50 transition">
                            <Users className="w-6 h-6 text-slate-400 group-hover:text-indigo-600" />
                          </div>
                          <div>
                            <h4 className="font-black text-slate-900 text-lg leading-tight truncate max-w-[150px]">{client.name}</h4>
                            <p className="text-slate-400 text-xs font-bold">{client.phone}</p>
                          </div>
                        </div>
                        <div className="w-20"><RiskBadge score={client.riskScore} /></div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 pt-6 border-t border-slate-100">
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Deuda</p>
                          <p className={`text-xl font-black ${activeDebt > 0 ? 'text-indigo-600' : 'text-slate-300'}`}>
                            {settings.currency}{activeDebt.toLocaleString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Créditos</p>
                          <p className="text-xl font-black text-slate-900">{clientLoans.length}</p>
                        </div>
                      </div>

                      <div className="mt-6 flex gap-2">
                        <button 
                          onClick={() => { setSelectedClient(client); setIsModalOpen('client-details'); }}
                          className="flex-1 bg-slate-900 text-white py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 transition"
                        >
                          Ver Detalles
                        </button>
                        <button 
                          onClick={() => window.open(`https://wa.me/${client.phone}`, '_blank')}
                          className="p-3 bg-slate-50 text-slate-400 rounded-2xl hover:bg-indigo-50 hover:text-indigo-600 transition border border-slate-100"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* VIEW: ACTIVE LOANS */}
          {activeTab === 'active-loans' && (
            <div className="flex flex-col gap-6">
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
                <Search className="w-6 h-6 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Filtro rápido de clientes..." 
                  className="flex-1 bg-transparent border-none outline-none font-bold text-slate-700"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {activeLoansList.map(loan => {
                  const client = clients.find(c => c.id === loan.clientId);
                  const nextPay = PortfolioEngine.getNextInstallmentNumber(loan.id, payments);
                  
                  return (
                    <div key={loan.id} className={`bg-white rounded-[40px] border-2 p-8 transition-all flex flex-col md:flex-row gap-8 ${loan.status === 'overdue' ? 'border-rose-100 bg-rose-50/20' : 'border-slate-100 hover:border-indigo-100'}`}>
                      <div className="flex-1">
                        <div className="flex justify-between items-start mb-6">
                          <div>
                            <h4 className="font-black text-xl text-slate-900">{client?.name}</h4>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-lg ${loan.status === 'overdue' ? 'bg-rose-600 text-white' : 'bg-indigo-600 text-white'}`}>
                                {loan.status === 'overdue' ? 'Mora' : 'Activo'}
                              </span>
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vence: {loan.dueDate}</span>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4 mb-6">
                          <div className="p-4 bg-white rounded-2xl border border-slate-100">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter mb-1">Capital</p>
                            <p className="font-black text-slate-900 text-sm">{settings.currency}{loan.principal.toLocaleString()}</p>
                          </div>
                          <div className="p-4 bg-white rounded-2xl border border-slate-100">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter mb-1">Interés</p>
                            <p className="font-black text-slate-900 text-sm">{loan.interestRate}%</p>
                          </div>
                          <div className="p-4 bg-white rounded-2xl border border-slate-100">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter mb-1">Pagos</p>
                            <p className="font-black text-slate-900 text-sm">{nextPay - 1}/{loan.installmentsCount}</p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                           <div>
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Pendiente</p>
                              <p className="text-3xl font-black text-slate-900">{settings.currency}{loan.remainingBalance.toLocaleString()}</p>
                           </div>
                           <div className="flex gap-2">
                              <button 
                                onClick={async () => {
                                  if (client) {
                                    const msg = loan.status === 'overdue' ? await generateOverdueMessage(client, loan) : await generateReminderMessage(client, loan);
                                    setDraft({ message: msg, client, type: loan.status });
                                    setIsDraftOpen(true);
                                  }
                                }}
                                className="p-4 bg-slate-100 text-slate-600 rounded-2xl hover:bg-slate-200 transition"
                              >
                                <MessageSquare className="w-5 h-5" />
                              </button>
                              <button 
                                onClick={() => { setSelectedLoan(loan); setIsModalOpen('payment'); }}
                                className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition"
                              >
                                Cobrar
                              </button>
                           </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* VIEW: SETTINGS */}
          {activeTab === 'settings' && (
            <div className="max-w-3xl flex flex-col gap-8">
              <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm flex flex-col gap-8">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                    <Database className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900">Personalización</h3>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Ajustes visuales y de negocio</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nombre de la Financiera</label>
                    <input 
                      value={settings.companyName} 
                      onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                      className="bg-slate-50 border-none rounded-2xl p-4 outline-none focus:ring-2 focus:ring-indigo-500 font-bold" 
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Símbolo Moneda</label>
                    <input 
                      value={settings.currency} 
                      onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
                      className="bg-slate-50 border-none rounded-2xl p-4 outline-none focus:ring-2 focus:ring-indigo-500 font-bold" 
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Interés Base (%)</label>
                    <input 
                      type="number"
                      value={settings.defaultInterestRate} 
                      onChange={(e) => setSettings({ ...settings, defaultInterestRate: Number(e.target.value) })}
                      className="bg-slate-50 border-none rounded-2xl p-4 outline-none focus:ring-2 focus:ring-indigo-500 font-bold" 
                    />
                  </div>
                </div>

                <div className="pt-8 border-t border-slate-100 flex justify-between items-center">
                   <div className="flex gap-4">
                    <button onClick={exportData} className="px-6 py-3 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-lg shadow-slate-900/10">Descargar Backup</button>
                    <button onClick={clearData} className="px-6 py-3 bg-rose-50 text-rose-600 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em]">Resetear Todo</button>
                   </div>
                </div>
              </div>

              <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm flex flex-col gap-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                    <Landmark className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900">Sobre el Sistema</h3>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Versión 2.0 Enterprise</p>
                  </div>
                </div>
                <p className="text-slate-600 font-medium leading-relaxed">
                  FinanzaPro utiliza inteligencia artificial generativa para redactar recordatorios personalizados de cobro. Toda su información se almacena de forma segura en su dispositivo.
                </p>
              </div>
            </div>
          )}

          {/* VIEW: HISTORY (REUSED TABLE) */}
          {activeTab === 'history' && (
            <div className="flex flex-col gap-6">
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
                <Search className="w-6 h-6 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Buscar en el histórico..." 
                  className="flex-1 bg-transparent border-none outline-none font-bold text-slate-700"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="bg-white rounded-[40px] border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
                <table className="w-full text-left min-w-[800px]">
                  <thead className="bg-slate-50/50 border-b border-slate-100">
                    <tr>
                      <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Titular</th>
                      <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Capital</th>
                      <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Interés</th>
                      <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Estado</th>
                      <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Restante</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {historyLoans.map(loan => {
                      const client = clients.find(c => c.id === loan.clientId);
                      return (
                        <tr key={loan.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-8 py-6">
                             <p className="font-black text-slate-900">{client?.name}</p>
                             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{loan.id.slice(0,8)}</p>
                          </td>
                          <td className="px-8 py-6 font-bold text-slate-700">{settings.currency}{loan.principal.toLocaleString()}</td>
                          <td className="px-8 py-6 text-slate-500 font-medium">{loan.interestRate}%</td>
                          <td className="px-8 py-6">
                             <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${
                               loan.status === 'paid' ? 'bg-emerald-100 text-emerald-600' : 
                               loan.status === 'overdue' ? 'bg-rose-100 text-rose-600' : 'bg-indigo-100 text-indigo-600'
                             }`}>{loan.status}</span>
                          </td>
                          <td className="px-8 py-6 font-black text-slate-900">{settings.currency}{loan.remainingBalance.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* MODALS */}
        {isModalOpen === 'client' && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-md">
            <div className="bg-white w-full max-w-lg rounded-[40px] shadow-2xl p-10 max-h-[90vh] overflow-y-auto">
              <h3 className="text-3xl font-black text-slate-900 mb-8 tracking-tight">Registro de Cliente</h3>
              <form onSubmit={createClient} className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nombre Completo</label>
                  <input name="name" required className="bg-slate-50 border-none rounded-2xl p-4 outline-none focus:ring-2 focus:ring-indigo-500 font-bold" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">WhatsApp</label>
                    <input name="phone" required className="bg-slate-50 border-none rounded-2xl p-4 outline-none focus:ring-2 focus:ring-indigo-500 font-bold" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Email</label>
                    <input name="email" type="email" className="bg-slate-50 border-none rounded-2xl p-4 outline-none focus:ring-2 focus:ring-indigo-500 font-bold" />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dirección</label>
                  <input name="address" className="bg-slate-50 border-none rounded-2xl p-4 outline-none focus:ring-2 focus:ring-indigo-500 font-bold" />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Notas Internas</label>
                  <textarea name="notes" rows={3} className="bg-slate-50 border-none rounded-2xl p-4 outline-none focus:ring-2 focus:ring-indigo-500 font-bold" />
                </div>
                <div className="flex gap-4 mt-4">
                  <button type="button" onClick={() => setIsModalOpen(null)} className="flex-1 py-4 bg-slate-100 text-slate-500 font-black rounded-2xl uppercase text-xs tracking-widest">Cerrar</button>
                  <button type="submit" className="flex-1 py-4 bg-indigo-600 text-white font-black rounded-2xl uppercase text-xs tracking-widest shadow-lg shadow-indigo-600/20">Guardar</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {isModalOpen === 'client-details' && selectedClient && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-md">
            <div className="bg-white w-full max-w-2xl rounded-[40px] shadow-2xl p-10 max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between mb-8">
                <div>
                  <h3 className="text-3xl font-black text-slate-900 tracking-tight">{selectedClient.name}</h3>
                  <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">Perfil de Cliente</p>
                </div>
                <div className="w-24"><RiskBadge score={selectedClient.riskScore} /></div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Contacto</p>
                    <p className="font-bold text-slate-700">{selectedClient.phone}</p>
                    <p className="font-bold text-slate-500">{selectedClient.email || 'Sin email'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dirección</p>
                    <p className="font-bold text-slate-700">{selectedClient.address || 'Sin dirección registrada'}</p>
                  </div>
                </div>
                <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Resumen de Cartera</p>
                   <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-medium text-slate-500">Deuda Vigente:</span>
                      <span className="font-black text-indigo-600">{settings.currency}{loans.filter(l => l.clientId === selectedClient.id && l.status !== 'paid').reduce((acc, l) => acc + l.remainingBalance, 0).toLocaleString()}</span>
                   </div>
                   <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-slate-500">Préstamos Totales:</span>
                      <span className="font-black text-slate-900">{loans.filter(l => l.clientId === selectedClient.id).length}</span>
                   </div>
                </div>
              </div>

              <div className="mb-8">
                <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4">Últimos Acuerdos</h4>
                <div className="space-y-2">
                  {loans.filter(l => l.clientId === selectedClient.id).slice(-3).map(l => (
                    <div key={l.id} className="p-4 bg-slate-50 rounded-2xl flex justify-between items-center border border-slate-100">
                      <div>
                        <p className="font-bold text-slate-700 text-sm">{settings.currency}{l.principal.toLocaleString()}</p>
                        <p className="text-[10px] font-bold text-slate-400">{l.startDate}</p>
                      </div>
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${l.status === 'paid' ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-600'}`}>{l.status}</span>
                    </div>
                  ))}
                  {loans.filter(l => l.clientId === selectedClient.id).length === 0 && <p className="text-slate-400 italic text-sm">Sin préstamos previos.</p>}
                </div>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => setIsModalOpen(null)} 
                  className="flex-1 py-4 bg-slate-100 text-slate-500 font-black rounded-2xl uppercase text-xs tracking-widest"
                >
                  Cerrar
                </button>
                <button 
                  onClick={() => { setSelectedLoan(null); setIsModalOpen('loan'); }}
                  className="flex-1 py-4 bg-indigo-600 text-white font-black rounded-2xl uppercase text-xs tracking-widest shadow-lg shadow-indigo-600/20"
                >
                  Nuevo Crédito
                </button>
              </div>
            </div>
          </div>
        )}

        {/* REUSE OTHER MODALS (Loan, Payment, AI) - Keeping original logic */}
        {isModalOpen === 'loan' && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-md">
            <div className="bg-white w-full max-w-lg rounded-[40px] shadow-2xl p-10">
              <h3 className="text-3xl font-black text-slate-900 mb-8 tracking-tight">Nuevo Financiamiento</h3>
              <form onSubmit={createLoan} className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cliente</label>
                  <select name="clientId" required className="bg-slate-50 border-none rounded-2xl p-4 outline-none focus:ring-2 focus:ring-indigo-500 font-bold appearance-none">
                    <option value="">Seleccionar...</option>
                    {clients.map(c => <option key={c.id} value={c.id} selected={selectedClient?.id === c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Monto ({settings.currency})</label>
                    <input name="amount" type="number" required className="bg-slate-50 border-none rounded-2xl p-4 outline-none focus:ring-2 focus:ring-indigo-500 font-bold" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">N° Cuotas</label>
                    <input name="installments" type="number" defaultValue="1" className="bg-slate-50 border-none rounded-2xl p-4 outline-none focus:ring-2 focus:ring-indigo-500 font-bold" />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vencimiento Final</label>
                  <input name="dueDate" type="date" required className="bg-slate-50 border-none rounded-2xl p-4 outline-none focus:ring-2 focus:ring-indigo-500 font-bold" />
                </div>
                <div className="flex gap-4 mt-4">
                  <button type="button" onClick={() => setIsModalOpen(null)} className="flex-1 py-4 bg-slate-100 text-slate-500 font-black rounded-2xl uppercase text-xs tracking-widest">Cancelar</button>
                  <button type="submit" className="flex-1 py-4 bg-indigo-600 text-white font-black rounded-2xl uppercase text-xs tracking-widest shadow-lg shadow-indigo-600/20">Aprobar</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {isModalOpen === 'payment' && selectedLoan && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-md">
            <div className="bg-white w-full max-w-lg rounded-[40px] shadow-2xl p-10">
              <h3 className="text-3xl font-black text-slate-900 mb-2 tracking-tight">Registrar Cobro</h3>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-8">Cuota #{PortfolioEngine.getNextInstallmentNumber(selectedLoan.id, payments)}</p>
              
              <div className="bg-indigo-50 p-6 rounded-3xl mb-8 flex justify-between items-center border border-indigo-100">
                <div>
                  <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Saldo Pendiente</p>
                  <p className="text-3xl font-black text-indigo-700">{settings.currency}{selectedLoan.remainingBalance.toLocaleString()}</p>
                </div>
                <div className="text-right">
                   <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Tasa Pactada</p>
                   <p className="text-xl font-black text-indigo-700">{selectedLoan.interestRate}%</p>
                </div>
              </div>

              <form onSubmit={processPayment} className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Monto Recibido ({settings.currency})</label>
                  <input 
                    name="amount" 
                    type="number" 
                    step="0.01"
                    autoFocus
                    max={selectedLoan.remainingBalance}
                    required 
                    className="bg-slate-50 border-none rounded-2xl p-6 outline-none focus:ring-2 focus:ring-indigo-500 font-black text-2xl" 
                  />
                </div>
                <div className="flex gap-4 mt-4">
                  <button type="button" onClick={() => setIsModalOpen(null)} className="flex-1 py-4 bg-slate-100 text-slate-500 font-black rounded-2xl uppercase text-xs tracking-widest">Cerrar</button>
                  <button type="submit" className="flex-1 py-4 bg-slate-900 text-white font-black rounded-2xl uppercase text-xs tracking-widest shadow-lg shadow-slate-900/20">Confirmar</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {isDraftOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-end p-6 bg-slate-900/40 backdrop-blur-sm">
            <div className="bg-white w-full max-w-md h-fit rounded-[40px] shadow-2xl p-10 animate-in slide-in-from-right duration-500">
               <div className="flex items-center gap-4 mb-8">
                 <div className={`p-3 rounded-2xl ${draft.type === 'overdue' ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>
                   <MessageSquare className="w-6 h-6" />
                 </div>
                 <div>
                   <h3 className="text-xl font-black text-slate-900">IA Mensajería</h3>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Draft Generado</p>
                 </div>
               </div>
               <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 italic font-medium text-slate-700 leading-relaxed mb-10 shadow-inner">
                 "{draft.message}"
               </div>
               <div className="flex flex-col gap-3">
                 <button 
                  onClick={() => {
                    if (draft.client) window.open(`https://wa.me/${draft.client.phone}?text=${encodeURIComponent(draft.message)}`, '_blank');
                    setIsDraftOpen(false);
                  }}
                  className="w-full py-5 bg-emerald-500 text-white font-black rounded-3xl uppercase text-sm tracking-widest shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 transition flex items-center justify-center gap-3"
                 >
                   <Send className="w-5 h-5" /> Enviar WhatsApp
                 </button>
                 <button onClick={() => setIsDraftOpen(false)} className="w-full py-4 bg-white text-slate-400 font-black rounded-3xl uppercase text-xs tracking-widest">
                   Descartar
                 </button>
               </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
