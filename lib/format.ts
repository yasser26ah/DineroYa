// ============================================================================
// DineroYa — Utilidades de formato
// ============================================================================
import { AppSettings } from '../types';

export const DEFAULT_SETTINGS: AppSettings = {
  currency: '$',
  defaultInterestRate: 15,
  companyName: 'FinanzaPro',
  moraRate: 5,
};

export const fmtMoney = (v: number, currency = '$') =>
  `${currency}${(v ?? 0).toLocaleString('es', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export const fmtDate = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const fmtDateTime = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('es', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
};

// Fecha local (no UTC) para evitar desfases en zonas horarias negativas
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const daysBetween = (a: string, b: string) =>
  Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86400000);

export const initials = (name: string) =>
  name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('');

export const waLink = (phone: string, text?: string) => {
  const clean = phone.replace(/[^\d]/g, '');
  return `https://wa.me/${clean}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
};
