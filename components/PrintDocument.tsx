// ============================================================================
// DineroYa — Documentos imprimibles
// El navegador imprime el área marcada (.print-area) y la app oculta el resto.
// Imprimir → "Guardar como PDF" produce el comprobante o el estado de cuenta.
// ============================================================================
import React from 'react';
import { Printer, X } from 'lucide-react';
import { Btn } from './ui';

export const PrintDocument: React.FC<{
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
    <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full my-8">
      <div className="flex items-center justify-between gap-3 p-5 border-b border-slate-100 no-print">
        <h3 className="font-black text-slate-900">{title}</h3>
        <div className="flex items-center gap-2">
          <Btn onClick={() => window.print()} className="flex items-center gap-2">
            <Printer className="w-4 h-4" /> Imprimir / Guardar PDF
          </Btn>
          <button onClick={onClose} aria-label="Cerrar" className="p-2 rounded-xl hover:bg-slate-100">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
      </div>
      <div className="print-area p-8 text-slate-800">{children}</div>
    </div>
  </div>
);

/** Encabezado común de los documentos con los datos de la financiera. */
export const DocumentHeader: React.FC<{
  company: string;
  title: string;
  subtitle?: string;
}> = ({ company, title, subtitle }) => (
  <div className="flex items-start justify-between gap-4 pb-4 border-b-2 border-slate-800">
    <div>
      <p className="text-xl font-black tracking-tight">{company}</p>
      <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Cartera de préstamos</p>
    </div>
    <div className="text-right">
      <p className="font-black text-sm uppercase tracking-widest">{title}</p>
      {subtitle && <p className="text-[11px] font-bold text-slate-500">{subtitle}</p>}
    </div>
  </div>
);
