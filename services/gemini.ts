// ============================================================================
// DineroYa — Redacción de mensajes con IA (Gemini)
// Si no hay API key configurada, devuelve plantillas locales listas para enviar.
// ============================================================================
import { GoogleGenAI } from '@google/genai';
import { Client, Installment, Loan } from '../types';
import { FREQUENCY_LABELS } from '../types';
import { fmtMoney, fmtDate } from '../lib/format';

const hasKey = typeof process !== 'undefined' && !!process.env?.API_KEY;
const ai = hasKey ? new GoogleGenAI({ apiKey: process.env.API_KEY! }) : null;

const withFallback = async (prompt: string, fallback: string): Promise<string> => {
  if (!ai) return fallback;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || fallback;
  } catch (error) {
    console.error('Gemini Error:', error);
    return fallback;
  }
};

const loanContext = (loan: Loan, installments: Installment[]): string => {
  const pending = installments
    .filter(i => i.status !== 'paid' && i.status !== 'waived')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const next = pending[0];
  const paid = installments.filter(i => i.status === 'paid').length;
  return [
    `Préstamo: ${loan.installmentsCount} cuotas ${FREQUENCY_LABELS[loan.frequency].toLowerCase()}.`,
    `Cuotas pagadas: ${paid} de ${loan.installmentsCount}.`,
    next
      ? `Próxima cuota: #${next.installmentNumber} por ${fmtMoney(next.amountDue - next.amountPaid)} con vencimiento ${fmtDate(next.dueDate)}.`
      : 'Sin cuotas pendientes.',
    `Saldo total pendiente: ${fmtMoney(pending.reduce((a, i) => a + (i.amountDue - i.amountPaid), 0))}.`,
  ].join('\n');
};

export const generatePaymentMessage = async (
  client: Client,
  payment: { amount: number; paymentDate: string },
  loan: Loan,
  installments: Installment[]
): Promise<string> => {
  const applied = installments
    .filter(i => i.status === 'paid')
    .sort((a, b) => b.installmentNumber - a.installmentNumber)[0];
  const outstanding = installments.reduce((a, i) => a + (i.amountDue - i.amountPaid), 0);

  const fallback = `Hola ${client.name}, recibimos tu pago de ${fmtMoney(payment.amount)}. ${
    applied ? `Quedó aplicado a la cuota ${applied.installmentNumber} de ${loan.installmentsCount}. ` : ''
  }Saldo pendiente: ${fmtMoney(outstanding)}. ¡Gracias!`;

  const prompt = `
    Eres un asistente de cobros de una empresa de préstamos personales profesional y cortés.
    Genera un mensaje corto para WhatsApp confirmando un pago recibido.

    Detalles:
    Cliente: ${client.name}
    Monto pagado: ${fmtMoney(payment.amount)}
    Fecha de pago: ${fmtDate(payment.paymentDate)}
    ${loanContext(loan, installments)}

    El mensaje debe ser profesional, agradecer el pago e indicar el saldo pendiente actual.
    No uses más de 50 palabras.
  `;
  return withFallback(prompt, fallback);
};

export const generateOverdueMessage = async (
  client: Client,
  loan: Loan,
  installments: Installment[],
  promisedDate?: string
): Promise<string> => {
  const pending = installments.filter(i => i.status !== 'paid' && i.status !== 'waived');
  const oldest = [...pending].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  const outstanding = pending.reduce((a, i) => a + (i.amountDue - i.amountPaid), 0);

  const fallback = `Hola ${client.name}, notamos un retraso en tu pago (cuota #${oldest?.installmentNumber ?? 1} con vencimiento ${fmtDate(oldest?.dueDate)}). El saldo pendiente es de ${fmtMoney(outstanding)}. Por favor regulariza${promisedDate ? ` antes del ${fmtDate(promisedDate)}` : ''} para evitar inconvenientes.`;

  const prompt = `
    Eres un gestor de cobranzas firme pero muy respetuoso.
    Genera un mensaje de WhatsApp para un cliente cuyo préstamo está en MORA (atrasado).

    Detalles:
    Cliente: ${client.name}
    ${loanContext(loan, installments)}
    Cuota más atrasada: vencía el ${fmtDate(oldest?.dueDate)}
    ${promisedDate ? `Nueva fecha límite acordada: ${fmtDate(promisedDate)}` : ''}

    Instrucciones:
    1. Menciona el retraso y el saldo pendiente.
    2. ${promisedDate ? `Propón el ${fmtDate(promisedDate)} como fecha límite para regularizar.` : 'Solicita ponerse al día a la brevedad.'}
    3. Profesional, sin sonar agresivo pero con urgencia.
    4. Máximo 60 palabras.
  `;
  return withFallback(prompt, fallback);
};

export const generateReminderMessage = async (
  client: Client,
  loan: Loan,
  installments: Installment[]
): Promise<string> => {
  const pending = installments.filter(i => i.status !== 'paid' && i.status !== 'waived');
  const next = [...pending].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

  const fallback = `Hola ${client.name}, te recordamos amablemente que tu cuota #${next?.installmentNumber ?? 1} de ${fmtMoney(next ? next.amountDue - next.amountPaid : 0)} vence el ${fmtDate(next?.dueDate)}. ¡Que tengas un gran día!`;

  const prompt = `
    Eres un asistente de atención al cliente amable de una financiera.
    Genera un recordatorio preventivo de pago para WhatsApp. El pago vence pronto.

    Detalles:
    Cliente: ${client.name}
    ${loanContext(loan, installments)}

    Instrucciones:
    1. Saluda cordialmente.
    2. Recuerda amablemente la cuota próxima con su monto y fecha de vencimiento.
    3. Sé muy amable, no debe sonar como un cobro agresivo.
    4. Máximo 50 palabras.
  `;
  return withFallback(prompt, fallback);
};
