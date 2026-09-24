// ============================================================================
// DineroYa — Resumen global
// ============================================================================
import React from 'react';
import {
  Wallet, CheckCircle2, AlertTriangle, Activity, TrendingUp, HandCoins, CalendarClock,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { useData } from '../context/DataContext';
import { MetricCard, Card, PageHeader, EmptyState } from '../components/ui';
import { bucketLabel } from '../lib/engine';
import { fmtDate, fmtMoney } from '../lib/format';
import { ACTIVITY_RESULT_LABELS } from '../types';

const BUCKET_COLORS: Record<string, string> = {
  '1-30': '#fbbf24',
  '31-60': '#fb923c',
  '61-90': '#f87171',
  '90+': '#e11d48',
};

export const DashboardPage: React.FC<{ onGoCollect: () => void }> = ({ onGoCollect }) => {
  const { stats, settings, loans, payments } = useData();
  const cur = settings.currency;

  const hasData = loans.length > 0 || payments.length > 0;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Resumen Global"
        subtitle="Métricas de rendimiento y salud de la cartera"
        actions={
          <button
            onClick={onGoCollect}
            className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-600/20 flex items-center gap-2"
          >
            <HandCoins className="w-5 h-5" /> Ir a Cobranza
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <MetricCard label="Colocación Total" value={fmtMoney(stats.totalPrincipal, cur)} icon={Wallet} />
        <MetricCard
          label="Cobrado Real"
          value={fmtMoney(stats.totalCollected, cur)}
          subValue={`${stats.recoveryRate}% de lo esperado`}
          icon={CheckCircle2}
        />
        <MetricCard label="Saldo en Calle" value={fmtMoney(stats.outstanding, cur)} icon={AlertTriangle} alert={stats.outstanding > 0} />
        <MetricCard
          label="Préstamos Vivos"
          value={stats.activeLoansCount}
          subValue={`${stats.overdueLoansCount} con mora`}
          icon={Activity}
          alert={stats.overdueLoansCount > 0}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6 lg:p-8">
          <h3 className="text-lg font-black text-slate-900 mb-6 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-500" /> Evolución de Recaudación
          </h3>
          <div className="h-72">
            {stats.portfolioByDay.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.portfolioByDay}>
                  <defs>
                    <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="date" tickFormatter={(d: string) => fmtDate(d).replace(/ de \d+$/, '')} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={50} />
                  <Tooltip
                    formatter={(v) => [fmtMoney(Number(v), cur), 'Cobrado']}
                    labelFormatter={(l) => fmtDate(String(l))}
                    contentStyle={{ borderRadius: 16, border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Area type="monotone" dataKey="cobrado" stroke="#6366f1" strokeWidth={3} fill="url(#chartGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState icon={TrendingUp} title="Sin cobros registrados todavía" hint="Los pagos que registres aparecerán aquí por día." />
            )}
          </div>
        </Card>

        <Card className="p-6 lg:p-8">
          <h3 className="text-lg font-black text-slate-900 mb-6 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-500" /> Antigüedad de Mora
          </h3>
          <div className="h-72">
            {stats.agingByBucket.some(b => b.casos > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.agingByBucket}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="bucket" tickFormatter={(b: string) => bucketLabel[b] ?? b} tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={50} />
                  <Tooltip
                    formatter={(v, _n, p) => [fmtMoney(Number(v), cur), `${(p?.payload as any)?.casos ?? 0} caso(s)`]}
                    labelFormatter={(l) => bucketLabel[String(l)] ?? String(l)}
                    contentStyle={{ borderRadius: 16, border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="monto" radius={[10, 10, 0, 0]}>
                    {stats.agingByBucket.map(b => (
                      <Cell key={b.bucket} fill={BUCKET_COLORS[b.bucket] ?? '#6366f1'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState icon={CheckCircle2} title="Cartera al día" hint="Ningún préstamo presenta cuotas vencidas." />
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 lg:p-8">
          <h3 className="text-lg font-black text-slate-900 mb-6 flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-indigo-500" /> Cobros de Hoy y Vencidos
          </h3>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {stats.dueToday.slice(0, 8).map(r => (
              <div key={r.loanId} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center">
                <div className="min-w-0">
                  <p className="font-black text-slate-800 text-sm truncate">{r.clientName}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {r.daysOverdue ? `Vencida hace ${r.daysOverdue} días` : `Vence hoy — ${fmtDate(r.nextDueDate)}`}
                  </p>
                </div>
                <p className="font-black text-slate-900 shrink-0">{fmtMoney(r.outstanding, cur)}</p>
              </div>
            ))}
            {stats.dueToday.length === 0 && <p className="text-slate-400 italic text-sm">Sin cobros pendientes para hoy. ¡Excelente!</p>}
          </div>
        </Card>

        <Card className="p-6 lg:p-8">
          <h3 className="text-lg font-black text-slate-900 mb-6 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" /> Compromisos Incumplidos
          </h3>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {stats.brokenPromises.slice(0, 8).map(r => (
              <div key={r.loanId} className="p-4 bg-amber-50/50 rounded-2xl border border-amber-100 flex justify-between items-center">
                <div className="min-w-0">
                  <p className="font-black text-slate-800 text-sm truncate">{r.clientName}</p>
                  <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">
                    Prometió el {fmtDate(r.lastPromiseDate)} — sin pago
                  </p>
                </div>
                <p className="font-black text-slate-900 shrink-0">{fmtMoney(r.outstanding, cur)}</p>
              </div>
            ))}
            {stats.brokenPromises.length === 0 && <p className="text-slate-400 italic text-sm">Sin compromisos vencidos.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
};
