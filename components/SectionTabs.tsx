// ============================================================================
// DineroYa — Pestañas de sección
// Navegación interna de Cobranza y Configuración, con contadores opcionales.
// ============================================================================
import React from 'react';
import { animate, spring } from 'animejs';
import { prefersReducedMotion, SPRINGS } from '../lib/motion';

export interface SectionTab<T extends string> {
  id: T;
  label: string;
  count?: number;
}

export interface SectionTabsProps<T extends string> {
  tabs: SectionTab<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
  /** Etiqueta accesible del grupo de pestañas. */
  label?: string;
}

export function SectionTabs<T extends string>({
  tabs, value, onChange, className = '', label,
}: SectionTabsProps<T>) {
  const press = (el: HTMLButtonElement) => {
    if (prefersReducedMotion()) return;
    animate(el, { scale: [1, 0.94, 1], duration: 280, ease: spring(SPRINGS.pop) });
  };

  return (
    <div role="tablist" aria-label={label} className={`flex flex-wrap items-center gap-2 ${className}`}>
      {tabs.map(tab => {
        const isActive = tab.id === value;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={event => {
              press(event.currentTarget);
              onChange(tab.id);
            }}
            className={`px-4 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-colors ${
              isActive
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {tab.label}
            {typeof tab.count === 'number' && tab.count > 0 && (
              <span
                className={`ml-2 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] ${
                  isActive ? 'bg-white/25 text-white' : 'bg-rose-100 text-rose-600'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
