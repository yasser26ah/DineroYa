// ============================================================================
// DineroYa — Reportes avanzados y exportación (contabilidad y analítica)
// ============================================================================
import React, { useMemo, useState } from 'react';
import { BarChart3, Download, FileSpreadsheet } from 'lucide-react';
import { useData } from '../context/DataContext';
import { Btn, Card, Field, PageHeader, inputCls } from '../components/ui';
import { daysBetween, fmtDate, fmtMoney, todayISO } from '../lib/format';
import { loanOutstanding } from '../lib/engine';
import { FREQUENCY_LABELS, INSTALLMENT_STATUS_LABELS, LOAN_STATUS_LABELS, paymentMethodLabel } from '../types';

type ReportId = 'resumen' | 'recaudos' | 'cartera' | 'mora' | 'desembolsos';

const REPORTS: { id: ReportId; label: string; hint: string }[] = [
  { id: 'resumen', label: 'Resumen contable', hint: 'Capital colocado, recaudo y cartera del rango' },
  { id: 'recaudos', label: 'Recaudos', hint: 'Cada pago con método y cobrador' },
  { id: 'cartera', label: 'Cartera', hint: 'Saldo por préstamo y estado' },
  { id: 'mora', label: 'Mora', hint: 'Cuotas vencidas y días de atraso' },
  { id: 'desembolsos', label: 'Préstamos otorgados', hint: 'Desembolsos del rango' },
];

const monthStart = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

const csvCell = (value: string | number) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const downloadCsv = (filename: string, headers: string[], rows: (string | number)[][]) => {
  const csv = [headers.map(csvCell).join(';'), ...rows.map(r => r.map(csvCell).join(';'))].join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

export const ReportsPage: React.FC = () => {
  const { payments, loans, installments, clients, profiles, settings, paymentMethods } = useData();
  const cur = settings.currency;

  const [report, setReport] = useState<ReportId>('resumen');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayISO());

  const clientName = (id: string) => clients.find(c => c.id === id)?.name ?? '—';
  const collectorName = (id?: string | null) => (id ? profiles.find(p => p.id === id)?.fullName ?? '—' : 'Sin cobrador');
  const inRange = (date: string) => (!from || date >= from) && (!to || date <= to);
  const money = (v: number) => fmtMoney(v, cur);
  const num = (v: number) => v.toLocaleString('es');

  const { headers, rows, totals } = useMemo(() => {
    if (report === 'recaudos') {
      const list = payments
        .filter(p => inRange(p.paymentDate))
        .sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));
      const total = list.filter(p => !p.notes?.includes('ANULADO')).reduce((a, p) => a + p.amount, 0);
      return {
        headers: ['Fecha', 'Cliente', 'Método', 'Cobrador', 'Monto', 'Estado'],
        rows: list.map(p => [
          p.paymentDate, clientName(p.clientId), paymentMethodLabel(p.method, paymentMethods),
          collectorName(p.receivedBy), p.amount, p.notes?.includes('ANULADO') ? 'Anulado' : 'Vigente',
        ]),
        totals: [['Total recaudado', money(total)] as (string | number)[]],
      };
    }

    if (report === 'cartera') {
      const list = loans.filter(l => l.status !== 'cancelled');
      const total = list.reduce((a, l) => a + loanOutstanding(l.id, installments), 0);
      return {
        headers: ['Cliente', 'Estado', 'Desembolso', 'Saldo pendiente', 'Cuotas pendientes', 'Próxima cuota'],
        rows: list.map(l => {
          const pending = installments
            .filter(i => i.loanId === l.id && i.status !== 'paid' && i.status !== 'waived')
            .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
          return [
            clientName(l.clientId), LOAN_STATUS_LABELS[l.status], l.principal,
            loanOutstanding(l.id, installments), pending.length, pending[0]?.dueDate ?? '—',
          ];
        }),
        totals: [['Total en calle', money(total)] as (string | number)[]],
      };
    }

    if (report === 'mora') {
      const today = todayISO();
      const list = installments
        .filter(i => i.status !== 'paid' && i.status !== 'waived' && i.dueDate < today)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      const total = list.reduce((a, i) => a + (i.amountDue - i.amountPaid), 0);
      return {
        headers: ['Cliente', 'Cuota', 'Vence', 'Días de mora', 'Estado', 'Saldo vencido'],
        rows: list.map(i => {
          const loan = loans.find(l => l.id === i.loanId);
          return [
            loan ? clientName(loan.clientId) : '—', `#${i.installmentNumber}`, i.dueDate,
            daysBetween(i.dueDate, today), INSTALLMENT_STATUS_LABELS[i.status], i.amountDue - i.amountPaid,
          ];
        }),
        totals: [['Total vencido', money(total)] as (string | number)[]],
      };
    }

    if (report === 'desembolsos') {
      const list = loans.filter(l => inRange(l.createdAt.slice(0, 10)) && l.status !== 'cancelled');
      const principal = list.reduce((a, l) => a + l.principal, 0);
      const interest = list.reduce((a, l) => a + l.totalInterest, 0);
      return {
        headers: ['Fecha', 'Cliente', 'Monto', 'Interés', 'Total a pagar', 'Cuotas', 'Frecuencia'],
        rows: list.map(l => [
          l.createdAt.slice(0, 10), clientName(l.clientId), l.principal, l.totalInterest,
          l.totalDue, l.installmentsCount, FREQUENCY_LABELS[l.frequency],
        ]),
        totals: [['Total colocado', money(principal)], ['Interés proyectado', money(interest)]] as (string | number)[][],
      };
    }

    // Resumen contable
    const live = payments.filter(p => !p.notes?.includes('ANULADO'));
    const collected = live.filter(p => inRange(p.paymentDate)).reduce((a, p) => a + p.amount, 0);
    const placed = loans.filter(l => inRange(l.createdAt.slice(0, 10)) && l.status !== 'cancelled');
    const principal = placed.reduce((a, l) => a + l.principal, 0);
    const interest = placed.reduce((a, l) => a + l.totalInterest, 0);
    const outstanding = loans
      .filter(l => l.status !== 'cancelled')
      .reduce((a, l) => a + loanOutstanding(l.id, installments), 0);
    const overdue = installments
      .filter(i => i.status !== 'paid' && i.status !== 'waived' && i.dueDate < todayISO())
      .reduce((a, i) => a + (i.amountDue - i.amountPaid), 0);
    return {
      headers: ['Concepto', 'Valor'],
      rows: [
        ['Capital colocado en el rango', money(principal)],
        ['Interés proyectado en el rango', money(interest)],
        ['Recaudado en el rango', money(collected)],
        ['Saldo en calle (hoy)', money(outstanding)],
        ['Cartera vencida (hoy)', money(overdue)],
        ['Préstamos desembolsados', num(placed.length)],
        ['Pagos registrados en el rango', num(live.filter(p => inRange(p.paymentDate)).length)],
      ],
      totals: [] as (string | number)[][],
    };
  }, [report, from, to, payments, loans, installments, clients, profiles, paymentMethods]);

  const active = REPORTS.find(r => r.id === report)!;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Reportes"
        subtitle="Cifras del negocio listas para contabilidad, con exportación a Excel"
        actions={
          <Btn
            onClick={() => downloadCsv(`dineroya_${report}_${from}_${to}.csv`, headers, rows)}
            className="flex items-center gap-2"
          >
            <Download className="w-4 h-4" /> Exportar CSV
          </Btn>
        }
      />

      <Card className="p-6 lg:p-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Field label="Reporte">
            <select value={report} onChange={e => setReport(e.target.value as ReportId)} className={inputCls}>
              {REPORTS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </Field>
          <Field label="Desde">
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Hasta">
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls} />
          </Field>
          <div className="flex items-end">
            <p className="text-[11px] font-bold text-slate-400 leading-relaxed">{active.hint}</p>
          </div>
        </div>
      </Card>

      <Card className="p-2 lg:p-4 overflow-x-auto">
        <div className="flex items-center gap-3 px-4 py-3">
          <BarChart3 className="w-4 h-4 text-indigo-500" />
          <p className="font-black text-slate-900 text-sm">{active.label}</p>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-auto">
            {fmtDate(from)} — {fmtDate(to)} · {rows.length} fila(s)
          </p>
        </div>
        <table className="w-full min-w-[700px]">
          <thead>
            <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">
              {headers.map(h => <th key={h} className="px-4 py-3">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} className="border-t border-slate-100 text-sm font-bold text-slate-700">
                {row.map((cell, i) => (
                  <td key={i} className={`px-4 py-2.5 ${typeof cell === 'number' ? 'text-right whitespace-nowrap' : ''}`}>
                    {typeof cell === 'number' ? money(cell) : cell}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={headers.length} className="px-4 py-10 text-center text-sm font-bold text-slate-400">
                  No hay datos en ese rango.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {totals.length > 0 && (
          <div className="flex flex-wrap gap-6 px-4 py-4 border-t border-slate-100">
            {totals.map(([label, value]) => (
              <div key={String(label)}>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
                <p className="font-black text-slate-900">{value}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <p className="text-[11px] font-bold text-slate-400 flex items-center gap-2">
        <FileSpreadsheet className="w-4 h-4" /> El CSV se abre directamente en Excel (separador ; y codificación UTF-8).
      </p>
    </div>
  );
};
