
export type RiskLevel = 'low' | 'medium' | 'high' | 'unrated';

export interface Client {
  id: string;
  name: string;
  phone: string;
  email: string;
  address?: string;
  notes?: string;
  registrationDate: string;
  riskScore: number; // 0 to 100
}

export interface Loan {
  id: string;
  clientId: string;
  principal: number;
  interestRate: number;
  totalInterest: number;
  totalDue: number;
  remainingBalance: number;
  startDate: string;
  dueDate: string;
  status: 'active' | 'paid' | 'overdue';
  installmentsCount: number;
}

export interface Payment {
  id: string;
  loanId: string;
  clientId: string;
  amount: number;
  date: string;
  balanceAfter: number;
  installmentNumber: number;
  messageDrafted?: string;
}

export interface AppSettings {
  currency: string;
  defaultInterestRate: number;
  companyName: string;
  theme: 'light' | 'dark';
}
