
import { GoogleGenAI } from "@google/genai";
import { Client, Loan, Payment } from "../types";

export const generatePaymentMessage = async (
  client: Client,
  payment: Payment,
  loan: Loan
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    Eres un asistente de cobros de una empresa de préstamos personales profesional y cortés.
    Genera un mensaje corto para WhatsApp confirmando un pago recibido.
    
    Detalles:
    Cliente: ${client.name}
    Monto Pagado: $${payment.amount.toLocaleString()}
    Cuota Pagada: ${payment.installmentNumber} de ${loan.installmentsCount}
    Saldo Pendiente del Préstamo: $${loan.remainingBalance.toLocaleString()}
    Fecha de Pago: ${payment.date}
    
    El mensaje debe ser profesional, agradecer el pago e informar específicamente que se ha aplicado a la cuota número ${payment.installmentNumber} de su acuerdo total de ${loan.installmentsCount}.
    No uses más de 50 palabras.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || `Pago de cuota ${payment.installmentNumber}/${loan.installmentsCount} registrado. Saldo: $${loan.remainingBalance}.`;
  } catch (error) {
    console.error("Gemini Error:", error);
    return `Hola ${client.name}, hemos recibido tu pago de $${payment.amount} (Cuota ${payment.installmentNumber}/${loan.installmentsCount}). Tu saldo actual es $${loan.remainingBalance}. ¡Gracias!`;
  }
};

export const generateOverdueMessage = async (
  client: Client,
  loan: Loan
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const commitmentDate = new Date();
  commitmentDate.setDate(commitmentDate.getDate() + 2);
  const formattedDate = commitmentDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });

  const prompt = `
    Eres un gestor de cobranzas firme pero muy respetuoso. 
    Genera un mensaje de WhatsApp para un cliente cuyo préstamo está en MORA (atrasado).
    
    Detalles:
    Cliente: ${client.name}
    Monto Atrasado (Saldo Total): $${loan.remainingBalance.toLocaleString()}
    Fecha de vencimiento original: ${loan.dueDate}
    Nueva fecha límite sugerida: ${formattedDate}
    
    Instrucciones:
    1. Menciona que el préstamo presenta un retraso.
    2. Indica el monto total pendiente: $${loan.remainingBalance.toLocaleString()}.
    3. Propón el ${formattedDate} como nueva fecha límite para regularizar sin cargos adicionales.
    4. Sé profesional, evita sonar agresivo pero mantén la urgencia.
    5. No uses más de 60 palabras.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || `Estimado ${client.name}, le informamos que su crédito presenta un atraso de $${loan.remainingBalance.toLocaleString()}. Por favor regularice antes del ${formattedDate}.`;
  } catch (error) {
    console.error("Gemini Error:", error);
    return `Hola ${client.name}, notamos un retraso en tu pago. El saldo pendiente es de $${loan.remainingBalance}. Por favor, realiza el pago antes del ${formattedDate} para evitar inconvenientes.`;
  }
};

export const generateReminderMessage = async (
  client: Client,
  loan: Loan
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    Eres un asistente de atención al cliente amable de una financiera.
    Genera un recordatorio preventivo de pago para WhatsApp. El pago vence en 3 días.
    
    Detalles:
    Cliente: ${client.name}
    Monto Próximo a Vencer: $${loan.remainingBalance.toLocaleString()}
    Fecha de Vencimiento: ${loan.dueDate}
    
    Instrucciones:
    1. Saluda cordialmente.
    2. Recuerda amablemente que su pago vence el ${loan.dueDate} (en 3 días).
    3. Menciona el monto pendiente de $${loan.remainingBalance.toLocaleString()}.
    4. Desea un excelente día y queda a disposición para dudas.
    5. Sé muy amable y servicial, no debe sonar como un cobro agresivo.
    6. Máximo 50 palabras.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || `Hola ${client.name}, te recordamos amablemente que tu pago de $${loan.remainingBalance.toLocaleString()} vence el ${loan.dueDate}. ¡Que tengas un gran día!`;
  } catch (error) {
    console.error("Gemini Error:", error);
    return `Hola ${client.name}, recordatorio amigable: tu pago de $${loan.remainingBalance} vence el ${loan.dueDate}. Saludos.`;
  }
};
