import { supabase } from './supabase';
import type { SharedExpense, SplitType, SharedStatus } from '../types/database';

const LOCAL_STORAGE_KEY = 'moneyflow_shared_expenses';
const DEFAULT_PERSON_KEY = 'moneyflow_default_person_name';

export function getDefaultPersonName(): string {
  return localStorage.getItem(DEFAULT_PERSON_KEY) || 'Pareja';
}

export function setDefaultPersonName(name: string): void {
  if (name.trim()) {
    localStorage.setItem(DEFAULT_PERSON_KEY, name.trim());
  }
}

/**
 * Calcula el monto correspondiente según el tipo de división seleccionado
 */
export function calculateSplitAmount(
  originalAmount: number,
  splitType: SplitType,
  customValue: number = 0
): { calculatedAmount: number; splitRatio: number; label: string } {
  if (!originalAmount || originalAmount <= 0) {
    return { calculatedAmount: 0, splitRatio: 1, label: '100% (Total)' };
  }

  switch (splitType) {
    case 'full':
      return {
        calculatedAmount: originalAmount,
        splitRatio: 1,
        label: '100% (Total)',
      };
    case 'half':
      return {
        calculatedAmount: Math.round((originalAmount / 2) * 100) / 100,
        splitRatio: 0.5,
        label: 'Dividir en 2 (50%)',
      };
    case 'third':
      return {
        calculatedAmount: Math.round((originalAmount / 3) * 100) / 100,
        splitRatio: 1 / 3,
        label: 'Dividir en 3 (33.3%)',
      };
    case 'two_thirds':
      return {
        calculatedAmount: Math.round(((originalAmount * 2) / 3) * 100) / 100,
        splitRatio: 2 / 3,
        label: 'Dividir en 3 (2/3 - 66.7%)',
      };
    case 'custom_percentage': {
      const pct = Math.max(0, Math.min(100, customValue || 50));
      return {
        calculatedAmount: Math.round(((originalAmount * pct) / 100) * 100) / 100,
        splitRatio: pct / 100,
        label: `${pct}% personalizado`,
      };
    }
    case 'custom_amount': {
      const fixed = Math.max(0, customValue || 0);
      return {
        calculatedAmount: fixed,
        splitRatio: originalAmount > 0 ? fixed / originalAmount : 1,
        label: `Monto fijo ($${fixed.toLocaleString('es-AR')})`,
      };
    }
    default:
      return {
        calculatedAmount: originalAmount,
        splitRatio: 1,
        label: '100% (Total)',
      };
  }
}

/**
 * Calcula totales y saldo neto
 * - total_i_owe: lo que la otra persona pagó y yo le debo
 * - total_they_owe: lo que yo pagué y la otra persona me debe
 * - net_balance = total_i_owe - total_they_owe
 *   (positivo: debo reintegrar | negativo: me deben reintegrar)
 */
export function calculateBalances(expenses: SharedExpense[], personName?: string) {
  const filtered = expenses.filter(e => 
    e.status === 'pending' && (!personName || e.person_name.toLowerCase() === personName.toLowerCase())
  );

  let total_i_owe = 0;
  let total_they_owe = 0;

  for (const item of filtered) {
    if (item.paid_by === 'other') {
      total_i_owe += Number(item.calculated_amount) || 0;
    } else {
      total_they_owe += Number(item.calculated_amount) || 0;
    }
  }

  total_i_owe = Math.round(total_i_owe * 100) / 100;
  total_they_owe = Math.round(total_they_owe * 100) / 100;
  const net_balance = Math.round((total_i_owe - total_they_owe) * 100) / 100;

  return {
    total_i_owe,
    total_they_owe,
    net_balance,
    pendingCount: filtered.length,
  };
}

// LocalStorage helpers
function getLocalExpenses(userId: string): SharedExpense[] {
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY}_${userId}`);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Error reading shared expenses from localStorage', e);
    return [];
  }
}

function saveLocalExpenses(userId: string, expenses: SharedExpense[]): void {
  try {
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_${userId}`, JSON.stringify(expenses));
    window.dispatchEvent(new CustomEvent('shared_expenses_updated'));
  } catch (e) {
    console.error('Error saving shared expenses to localStorage', e);
  }
}

/**
 * Obtener todos los gastos compartidos del usuario
 */
export async function getSharedExpenses(userId: string): Promise<SharedExpense[]> {
  try {
    // Intentar leer de Supabase
    const { data, error } = await supabase
      .from('shared_expenses')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false });

    if (!error && data) {
      // Ensure split fields exist for each expense
      const migrated = (data as SharedExpense[]).map((exp) => {
        if (!exp.split_type) {
          const defaultSplit: SplitType = 'half';
          const { calculatedAmount, splitRatio } = calculateSplitAmount(exp.original_amount, defaultSplit);
          exp.split_type = defaultSplit;
          exp.split_ratio = splitRatio;
          exp.calculated_amount = calculatedAmount;
        }
        return exp;
      });
      // Sync local cache with migrated data
      saveLocalExpenses(userId, migrated);
      return migrated;
    }
  } catch (err) {
    console.warn('Supabase shared_expenses table not available, using local cache:', err);
  }

  // Fallback a LocalStorage and ensure migration there as well
  const local = getLocalExpenses(userId);
  const migratedLocal = local.map((exp) => {
    if (!exp.split_type) {
      const defaultSplit: SplitType = 'half';
      const { calculatedAmount, splitRatio } = calculateSplitAmount(exp.original_amount, defaultSplit);
      exp.split_type = defaultSplit;
      exp.split_ratio = splitRatio;
      exp.calculated_amount = calculatedAmount;
    }
    return exp;
  });
  saveLocalExpenses(userId, migratedLocal);
  return migratedLocal;
}

/**
 * Agregar un nuevo gasto compartido
 */
export async function addSharedExpense(
  userId: string,
  expense: Omit<SharedExpense, 'id' | 'user_id' | 'created_at'>
): Promise<SharedExpense> {
  const newExpense: SharedExpense = {
    ...expense,
    id: 'se_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
    user_id: userId,
    created_at: new Date().toISOString(),
  };

  // Guardar en cache local inmediatamente
  const current = getLocalExpenses(userId);
  const updated = [newExpense, ...current];
  saveLocalExpenses(userId, updated);

  // Intentar persistir en Supabase
  try {
    const { data, error } = await supabase
      .from('shared_expenses')
      .insert({
        id: newExpense.id,
        user_id: userId,
        transaction_id: newExpense.transaction_id || null,
        person_name: newExpense.person_name,
        paid_by: newExpense.paid_by,
        original_amount: newExpense.original_amount,
        split_type: newExpense.split_type,
        split_ratio: newExpense.split_ratio,
        calculated_amount: newExpense.calculated_amount,
        description: newExpense.description,
        date: newExpense.date,
        category_name: newExpense.category_name || null,
        status: newExpense.status,
        notes: newExpense.notes || null,
      })
      .select()
      .single();

    if (!error && data) {
      return data as SharedExpense;
    }
  } catch (err) {
    console.warn('Supabase insert failed, preserved locally:', err);
  }

  return newExpense;
}

/**
 * Actualizar un gasto compartido
 */
export async function updateSharedExpense(
  userId: string,
  id: string,
  updates: Partial<SharedExpense>
): Promise<void> {
  const current = getLocalExpenses(userId);
  const updated = current.map(item => item.id === id ? { ...item, ...updates } : item);
  saveLocalExpenses(userId, updated);

  try {
    await supabase.from('shared_expenses').update(updates).eq('id', id);
  } catch (err) {
    console.warn('Supabase update failed, updated locally:', err);
  }
}

/**
 * Eliminar un gasto compartido
 */
export async function deleteSharedExpense(userId: string, id: string): Promise<void> {
  const current = getLocalExpenses(userId);
  const updated = current.filter(item => item.id !== id);
  saveLocalExpenses(userId, updated);

  try {
    await supabase.from('shared_expenses').delete().eq('id', id);
  } catch (err) {
    console.warn('Supabase delete failed, deleted locally:', err);
  }
}

/**
 * Saldar todas las cuentas pendientes para una persona o en general
 */
export async function settleAllPending(
  userId: string,
  personName?: string,
  settlementNotes?: string
): Promise<{ settledCount: number; amountSettled: number }> {
  const current = getLocalExpenses(userId);
  const now = new Date().toISOString();
  let settledCount = 0;
  let amountSettled = 0;

  const updated = current.map(item => {
    const matchesPerson = !personName || item.person_name.toLowerCase() === personName.toLowerCase();
    if (item.status === 'pending' && matchesPerson) {
      settledCount++;
      amountSettled += item.calculated_amount;
      return {
        ...item,
        status: 'settled' as SharedStatus,
        settled_at: now,
        notes: settlementNotes ? (item.notes ? `${item.notes} | ${settlementNotes}` : settlementNotes) : item.notes,
      };
    }
    return item;
  });

  saveLocalExpenses(userId, updated);

  try {
    let query = supabase
      .from('shared_expenses')
      .update({
        status: 'settled',
        settled_at: now,
      })
      .eq('user_id', userId)
      .eq('status', 'pending');

    if (personName) {
      query = query.eq('person_name', personName);
    }
    await query;
  } catch (err) {
    console.warn('Supabase batch settle failed, settled locally:', err);
  }

  return { settledCount, amountSettled };
}
