// ============================================================================
// DineroYa — Utilidades de formato
// ============================================================================
import { AppSettings } from '../types';

export const DEFAULT_SETTINGS: AppSettings = {
  currency: '$',
  defaultInterestRate: 15,  companyName: 'DineroYa',
  moraRate: 5,
};
export const fmtMoney = (v: number, currency = '$') =>
  `${currency}${(v ?? 0).toLocaleString('es', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** Lo que escribe el usuario → valor crudo (solo dígitos y un punto decimal). */
export const parseMoneyInput = (raw: string): string => {
  // Los puntos son separadores de miles; la coma es el separador decimal.
  const onlyDigitsAndCommas = raw.replace(/[^\d,]/g, '');
  const [intPart, ...rest] = onlyDigitsAndCommas.split(',');
  const digits = intPart.replace(/^0+(?=\d)/, '');
  const decimals = rest.join('').replace(/\D/g, '').slice(0, 2);
  if (rest.length > 0 && decimals === '') return `${digits}.`;
  return decimals ? `${digits}.${decimals}` : digits;
};

/** Valor crudo → texto con puntos de miles mientras se escribe (1500000 → "1.500.000"). */
export const formatMoneyInput = (value: string): string => {
  if (!value) return '';
  const [intPart, decimals] = value.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return decimals === undefined ? grouped : `${grouped},${decimals}`;
};

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

/** Nombre libre → slug del método de pago: "Nequi / Daviplata" → "nequi_daviplata". */
export const paymentMethodSlug = (name: string): string => {
  const slug = name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || `metodo_${Date.now()}`;
};

export const waLink = (phone: string, text?: string) => {
  const clean = phone.replace(/[^\d]/g, '');
  return `https://wa.me/${clean}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
};
