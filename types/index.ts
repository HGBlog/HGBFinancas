export type AccountType = 
  | 'CHECKING'    // Conta Corrente
  | 'SAVINGS'     // Poupança
  | 'CREDIT_CARD' // Cartão de Crédito
  | 'CASH'        // Dinheiro / Carteira
  | 'INVESTMENT'; // Investimentos

export interface Account {
  id: number;
  name: string;
  type: AccountType;
  initial_balance: number;
  current_balance: number;
  color: string;
  icon: string;
  closing_day?: number | null; // Dia de fechamento da fatura (Cartão)
  due_day?: number | null;     // Dia de vencimento da fatura (Cartão)
  credit_limit?: number | null;// Limite total de crédito (Cartão)
  is_archived: number;
  created_at: string;
}

export type TransactionType = 'EXPENSE' | 'INCOME' | 'TRANSFER';

export type ExpenseRecurrenceType = 'UNICO' | 'MENSAL' | 'ANUAL' | 'PERSONALIZAR';

export type RecurrenceEditScope = 'CURRENT' | 'ALL' | 'FUTURE';

export type TransactionStatus = 
  | 'CLEARED'    // Compensado (C) / Pago
  | 'RECONCILED' // Conciliado (R)
  | 'UNCLEARED'; // Não compensado / Pendente (P)

export interface TransactionSplit {
  id?: number;
  transaction_id?: number;
  category_id: number;
  amount: number;
  memo?: string;
  category_name?: string;
  category_color?: string;
}

export interface Transaction {
  id: number;
  account_id: number;
  destination_account_id?: number | null;
  category_id?: number | null;
  payee_id?: number | null;
  amount: number;
  type: TransactionType;
  date: string; // YYYY-MM-DD
  status: TransactionStatus;
  notes?: string | null;
  check_number?: string | null;
  is_split?: number; // 0 ou 1
  expense_type?: ExpenseRecurrenceType;
  start_month?: string | null;
  end_month?: string | null;
  due_day?: number | null;
  recurrence_id?: number | null;
  paid_month?: string | null;
  created_at: string;
  
  // Joined fields for display
  account_name?: string;
  destination_account_name?: string;
  category_name?: string;
  category_color?: string;
  category_icon?: string;
  payee_name?: string;
  splits?: TransactionSplit[];
}

export interface Category {
  id: number;
  name: string;
  parent_id?: number | null;
  type: 'EXPENSE' | 'INCOME';
  color: string;
  icon: string;
  parent_name?: string;
  subcategories?: Category[];
}

export interface Payee {
  id: number;
  name: string;
}

export interface Budget {
  id: number;
  category_id: number;
  month: string; // YYYY-MM
  amount: number;
  category_name?: string;
  category_color?: string;
  spent_amount?: number;
}

export type FrequencyType = 'MONTHLY' | 'WEEKLY' | 'YEARLY' | 'ONCE';

export interface ScheduledBill {
  id: number;
  account_id: number;
  category_id?: number | null;
  payee_id?: number | null;
  amount: number;
  type: TransactionType;
  due_day: number;
  frequency: FrequencyType;
  auto_record: number; // 0 or 1
  is_active: number; // 0 or 1
  next_due_date: string; // YYYY-MM-DD
  notes?: string | null;
  account_name?: string;
  category_name?: string;
  payee_name?: string;
}

export interface FinancialSummary {
  totalBalance: number;
  totalIncomeMonth: number;
  totalExpenseMonth: number;
  monthlyNet: number;
  unclearedTotal: number;
}
