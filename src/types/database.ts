export type AccountType = 'bank' | 'credit_card' | 'cash' | 'digital_wallet' | 'investment' | 'store_credit';
export type TransactionType = 'expense' | 'income' | 'transfer';
export type PaymentMethod = 'cash' | 'debit' | 'credit' | 'transfer';
export type InstallmentStatus = 'pending' | 'paid' | 'cancelled';
export type PlanStatus = 'active' | 'paid_off' | 'cancelled';

export interface Category {
  id: string;
  user_id: string | null;
  name: string;
  type: 'expense' | 'income' | 'both';
  icon: string;
  color: string;
  is_default: boolean;
  parent_id: string | null;
  created_at: string;
}

export interface Account {
  id: string;
  user_id: string;
  name: string;
  account_type: AccountType;
  institution: string | null;
  currency: string;
  initial_balance: number;
  current_balance: number;
  credit_limit: number | null;
  billing_close_day: number | null;
  payment_due_day: number | null;
  interest_rate: number | null;
  linked_account_id: string | null;
  color: string;
  icon: string;
  last_four_digits: string | null;
  status: 'active' | 'inactive' | 'archived';
  include_in_total: boolean;
  created_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  account_id: string;
  type: TransactionType;
  amount: number;
  category_id: string | null;
  description: string | null;
  transaction_date: string;
  payment_method: PaymentMethod;
  is_recurring: boolean;
  recurring_id: string | null;
  to_account_id: string | null;
  is_installment_purchase: boolean;
  installment_plan_id: string | null;
  receipt_url: string | null;
  tags: string[] | null;
  notes: string | null;
  created_at: string;
  // Joined fields
  category?: Category;
  account?: Account;
  to_account?: Account;
}

export interface InstallmentPlan {
  id: string;
  user_id: string;
  credit_card_id: string;
  transaction_id: string | null;
  total_amount: number;
  installment_count: number;
  installment_amount: number;
  interest_rate: number;
  financing_cost: number;
  first_installment_month: string;
  description: string | null;
  category_id: string | null;
  status: PlanStatus;
  created_at: string;
  // Joined
  credit_card?: Account;
  installments?: Installment[];
}

export interface Installment {
  id: string;
  installment_plan_id: string;
  installment_number: number;
  amount: number;
  due_month: string;
  status: InstallmentStatus;
  paid_date: string | null;
  created_at: string;
  // Joined
  plan?: InstallmentPlan;
}

export interface Budget {
  id: string;
  user_id: string;
  category_id: string | null;
  month: number;
  year: number;
  amount: number;
  spent: number;
  include_installments: boolean;
  created_at: string;
  category?: Category;
}

export interface SavingsGoal {
  id: string;
  user_id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline: string | null;
  icon: string;
  color: string;
  status: 'active' | 'completed' | 'cancelled';
  created_at: string;
}

export interface RecurringTransaction {
  id: string;
  user_id: string;
  account_id: string;
  type: TransactionType;
  amount: number;
  category_id: string | null;
  description: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  start_date: string;
  next_occurrence: string;
  end_date: string | null;
  status: 'active' | 'paused' | 'completed';
  created_at: string;
  // Joined
  category?: Category;
  account?: Account;
}

// Helper types
export interface MonthlyInstallment {
  installment_id: string;
  plan_id: string;
  description: string;
  card_name: string;
  installment_number: number;
  total_installments: number;
  amount: number;
  due_month: string;
  status: string;
}
