import * as XLSX from 'xlsx';
import { supabase } from './supabase';

export async function exportAllDataToExcel() {
  // 1. Transactions
  const { data: rawTransactions } = await supabase
    .from('transactions')
    .select(`
      id,
      transaction_date,
      type,
      amount,
      description,
      payment_method,
      is_recurring,
      is_installment_purchase,
      notes,
      categories ( name ),
      account:accounts!account_id ( name ),
      to_account:accounts!to_account_id ( name )
    `)
    .order('transaction_date', { ascending: false });

  const formattedTransactions = (rawTransactions || []).map((t: any) => ({
    'Fecha': t.transaction_date,
    'Tipo': t.type === 'expense' ? 'Gasto' : t.type === 'income' ? 'Ingreso' : 'Transferencia',
    'Descripción': t.description || '',
    'Monto ($)': parseFloat(t.amount || 0),
    'Categoría': t.categories?.name || 'Sin categoría',
    'Cuenta Origen': t.account?.name || '',
    'Cuenta Destino': t.to_account?.name || '',
    'Método de Pago': t.payment_method || '',
    'Es Recurrente': t.is_recurring ? 'Sí' : 'No',
    'En Cuotas': t.is_installment_purchase ? 'Sí' : 'No',
    'Notas': t.notes || ''
  }));

  // 2. Cuentas
  const { data: rawAccounts } = await supabase.from('accounts').select('*').order('name');
  const formattedAccounts = (rawAccounts || []).map((a: any) => ({
    'Nombre': a.name,
    'Tipo': a.account_type,
    'Institución': a.institution || '',
    'Moneda': a.currency,
    'Saldo Inicial': parseFloat(a.initial_balance || 0),
    'Saldo Actual': parseFloat(a.current_balance || 0),
    'Límite de Crédito': a.credit_limit ? parseFloat(a.credit_limit) : '-',
    'Día Cierre': a.billing_close_day || '-',
    'Día Vencimiento': a.payment_due_day || '-',
    'Estado': a.status
  }));

  // 3. Categorías
  const { data: rawCategories } = await supabase.from('categories').select('*').order('name');
  const formattedCategories = (rawCategories || []).map((c: any) => ({
    'Nombre': c.name,
    'Tipo': c.type === 'expense' ? 'Gasto' : c.type === 'income' ? 'Ingreso' : 'Ambos',
    'Ícono': c.icon || '',
    'Color': c.color || ''
  }));

  // 4. Presupuestos
  const { data: rawBudgets } = await supabase.from('budgets').select('*, categories(name)');
  const formattedBudgets = (rawBudgets || []).map((b: any) => ({
    'Año': b.year,
    'Mes': b.month,
    'Categoría': b.categories?.name || 'General',
    'Monto Presupuestado': parseFloat(b.amount || 0),
    'Gastado': parseFloat(b.spent || 0),
    'Diferencia': parseFloat(b.amount || 0) - parseFloat(b.spent || 0)
  }));

  // 5. Planes de Cuotas
  const { data: rawInstallments } = await supabase.from('installment_plans').select('*, accounts!credit_card_id(name), categories(name)');
  const formattedInstallments = (rawInstallments || []).map((i: any) => ({
    'Descripción': i.description || '',
    'Tarjeta': i.accounts?.name || '',
    'Categoría': i.categories?.name || '',
    'Monto Total': parseFloat(i.total_amount || 0),
    'Cantidad Cuotas': i.installment_count,
    'Monto por Cuota': parseFloat(i.installment_amount || 0),
    'Primer Mes': i.first_installment_month,
    'Estado': i.status
  }));

  // 6. Metas de Ahorro
  const { data: rawSavings } = await supabase.from('savings_goals').select('*');
  const formattedSavings = (rawSavings || []).map((s: any) => ({
    'Meta': s.name,
    'Monto Objetivo': parseFloat(s.target_amount || 0),
    'Monto Actual': parseFloat(s.current_amount || 0),
    'Progreso (%)': ((parseFloat(s.current_amount || 0) / parseFloat(s.target_amount || 1)) * 100).toFixed(1) + '%',
    'Fecha Límite': s.deadline || 'Sin fecha',
    'Estado': s.status
  }));

  // Workbook
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(formattedTransactions), 'Transacciones');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(formattedAccounts), 'Cuentas');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(formattedCategories), 'Categorías');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(formattedBudgets), 'Presupuestos');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(formattedInstallments), 'Cuotas y Tarjetas');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(formattedSavings), 'Metas de Ahorro');

  const now = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `MoneyFlow_Finanzas_${now}.xlsx`);
}
