// ============================================================================
// DineroYa — Componentes de UI reutilizables
// ============================================================================
import React from 'react';
import { Search, X } from 'lucide-react';
import { InstallmentStatus, LoanStatus } from '../types';

export const Card: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <div className={`bg-white rounded-3xl border border-slate-200 shadow-sm ${className}`}>{children}</div>
);

export const MetricCard: React.FC<{
  label: string; value: React.ReactNode; subValue?: React.ReactNode; icon: React.ElementType; alert?: boolean;
}> = ({ label, value, subValue, icon: Icon, alert }) => (
  <Card className="p-6 group">
    <div className="flex justify-between items-start mb-4">
      <div className={`p-3 rounded-2xl transition-colors ${alert ? 'bg-rose-50' : 'bg-slate-50 group-hover:bg-indigo-50'}`}>
        <Icon className={`w-6 h-6 ${alert ? 'text-rose-500' : 'text-slate-400 group-hover:text-indigo-600'}`} />
      </div>
    </div>
    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
    <h3 className="text-2xl font-black text-slate-900">{value}</h3>
    {subValue && <p className="text-xs text-slate-500 mt-1 font-medium">{subValue}</p>}
  </Card>
);

export const loanStatusStyle = (s: LoanStatus) =>
  s === 'paid' ? 'bg-emerald-100 text-emerald-700'
    : s === 'overdue' ? 'bg-rose-100 text-rose-700'
      : s === 'cancelled' ? 'bg-slate-200 text-slate-500'
        : 'bg-indigo-100 text-indigo-700';

export const installmentStatusStyle = (s: InstallmentStatus) =>
  s === 'paid' ? 'bg-emerald-100 text-emerald-700'
    : s === 'overdue' ? 'bg-rose-100 text-rose-700'
      : s === 'partial' ? 'bg-amber-100 text-amber-700'
        : s === 'waived' ? 'bg-slate-200 text-slate-500'
          : 'bg-slate-100 text-slate-600';

export const StatusBadge: React.FC<{ label: string; className: string }> = ({ label, className }) => (
  <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-lg tracking-wider ${className}`}>{label}</span>
);

export const RiskBadge: React.FC<{ score: number }> = ({ score }) => {
  const config = score >= 80
    ? { label: 'Excelente', color: 'text-emerald-600', bar: 'bg-emerald-500' }
    : score >= 40
      ? { label: 'Regular', color: 'text-amber-600', bar: 'bg-amber-500' }
      : { label: 'Crítico', color: 'text-rose-600', bar: 'bg-rose-500' };

  return (
    <div className="flex flex-col gap-1 w-full">
      <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider">
        <span className={config.color}>{config.label}</span>
        <span className="text-slate-400">{score}/100</span>
      </div>
      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full transition-all duration-700 ${config.bar}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
};

export const Modal: React.FC<{
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; wide?: boolean;
}> = ({ title, subtitle, onClose, children, wide }) => (
  <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 lg:p-6 bg-slate-900/40 backdrop-blur-md" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className={`bg-white w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} rounded-[32px] shadow-2xl p-6 lg:p-10 max-h-[92vh] overflow-y-auto`}>
      <div className="flex items-start justify-between mb-8">
        <div>
          <h3 className="text-2xl font-black text-slate-900 tracking-tight">{title}</h3>
          {subtitle && <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">{subtitle}</p>}
        </div>
        <button onClick={onClose} className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition">
          <X className="w-5 h-5" />
        </button>
      </div>
      {children}
    </div>
  </div>
);

export const Field: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({ label, children, className = '' }) => (
  <div className={`flex flex-col gap-2 ${className}`}>
    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</label>
    {children}
  </div>
);

export const inputCls =
  'bg-slate-50 border border-slate-100 rounded-2xl p-4 outline-none focus:ring-2 focus:ring-indigo-500 font-bold w-full';

export const SearchBar: React.FC<{ value: string; onChange: (v: string) => void; placeholder?: string }> = ({ value, onChange, placeholder }) => (
  <Card className="p-5 flex items-center gap-4">
    <Search className="w-5 h-5 text-slate-400 shrink-0" />
    <input
      type="text"
      placeholder={placeholder ?? 'Buscar...'}
      className="flex-1 bg-transparent border-none outline-none font-bold text-slate-700"
      value={value}
      onChange={e => onChange(e.target.value)}
    />
  </Card>
);

export const EmptyState: React.FC<{ icon: React.ElementType; title: string; hint?: string }> = ({ icon: Icon, title, hint }) => (
  <Card className="p-16 flex flex-col items-center text-center gap-4">
    <div className="p-5 bg-slate-50 rounded-3xl"><Icon className="w-10 h-10 text-slate-300" /></div>
    <p className="font-black text-slate-500">{title}</p>
    {hint && <p className="text-sm text-slate-400 max-w-sm">{hint}</p>}
  </Card>
);

export const Btn: React.FC<{
  variant?: 'primary' | 'secondary' | 'danger' | 'success'; onClick?: () => void; type?: 'button' | 'submit';
  className?: string; children: React.ReactNode; disabled?: boolean; title?: string;
}> = ({ variant = 'primary', onClick, type = 'button', className = '', children, disabled, title }) => {
  const styles = {
    primary: 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700',
    secondary: 'bg-slate-100 text-slate-600 hover:bg-slate-200',
    danger: 'bg-rose-50 text-rose-600 hover:bg-rose-100',
    success: 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-600',
  }[variant];
  return (
    <button
      type={type} onClick={onClick} disabled={disabled} title={title}
      className={`py-3 px-6 rounded-2xl font-black uppercase text-xs tracking-widest transition disabled:opacity-50 disabled:cursor-not-allowed ${styles} ${className}`}
    >
      {children}
    </button>
  );
};

export const PageHeader: React.FC<{ title: string; subtitle: string; actions?: React.ReactNode }> = ({ title, subtitle, actions }) => (
  <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
    <div>
      <h2 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight">{title}</h2>
      <p className="text-slate-500 font-medium mt-1">{subtitle}</p>
    </div>
    {actions && <div className="flex gap-3 flex-wrap">{actions}</div>}
  </header>
);
