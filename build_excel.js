import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

const supabaseUrl = 'https://xyjuhopcaclxmgorfbwx.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5anVob3BjYWNseG1nb3JmYnd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNzQ3NTksImV4cCI6MjA4OTg1MDc1OX0.kVLUMqZ3EeWpWlZ8FdhFrGh64ErzzZ_UJikkyxfZLQM';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function exportToExcel() {
  console.log('Fetching data from Supabase...');

  // 1. Transactions
  const { data: rawTransactions, error: txErr } = await supabase
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

  if (txErr) console.error('Tx Error:', txErr);

  const formattedTransactions = (rawTransactions || []).map(t => ({
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
  const formattedAccounts = (rawAccounts || []).map(a => ({
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
  const formattedCategories = (rawCategories || []).map(c => ({
    'Nombre': c.name,
    'Tipo': c.type === 'expense' ? 'Gasto' : c.type === 'income' ? 'Ingreso' : 'Ambos',
    'Ícono': c.icon || '',
    'Color': c.color || ''
  }));

  // 4. Presupuestos
  const { data: rawBudgets } = await supabase.from('budgets').select('*, categories(name)');
  const formattedBudgets = (rawBudgets || []).map(b => ({
    'Año': b.year,
    'Mes': b.month,
    'Categoría': b.categories?.name || 'General',
    'Monto Presupuestado': parseFloat(b.amount || 0),
    'Gastado': parseFloat(b.spent || 0),
    'Diferencia': parseFloat(b.amount || 0) - parseFloat(b.spent || 0)
  }));

  // 5. Planes de Cuotas
  const { data: rawInstallments } = await supabase.from('installment_plans').select('*, accounts!credit_card_id(name), categories(name)');
  const formattedInstallments = (rawInstallments || []).map(i => ({
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
  const formattedSavings = (rawSavings || []).map(s => ({
    'Meta': s.name,
    'Monto Objetivo': parseFloat(s.target_amount || 0),
    'Monto Actual': parseFloat(s.current_amount || 0),
    'Progreso (%)': ((parseFloat(s.current_amount || 0) / parseFloat(s.target_amount || 1)) * 100).toFixed(1) + '%',
    'Fecha Límite': s.deadline || 'Sin fecha',
    'Estado': s.status
  }));

  // Build Workbook
  const wb = XLSX.utils.book_new();

  const wsTx = XLSX.utils.json_to_sheet(formattedTransactions);
  XLSX.utils.book_append_sheet(wb, wsTx, 'Transacciones');

  const wsAcc = XLSX.utils.json_to_sheet(formattedAccounts);
  XLSX.utils.book_append_sheet(wb, wsAcc, 'Cuentas');

  const wsCat = XLSX.utils.json_to_sheet(formattedCategories);
  XLSX.utils.book_append_sheet(wb, wsCat, 'Categorías');

  const wsBud = XLSX.utils.json_to_sheet(formattedBudgets);
  XLSX.utils.book_append_sheet(wb, wsBud, 'Presupuestos');

  const wsInst = XLSX.utils.json_to_sheet(formattedInstallments);
  XLSX.utils.book_append_sheet(wb, wsInst, 'Cuotas y Tarjetas');

  const wsSav = XLSX.utils.json_to_sheet(formattedSavings);
  XLSX.utils.book_append_sheet(wb, wsSav, 'Metas de Ahorro');

  const outputPath = path.resolve('c:/Users/acer/OneDrive/5. Servicios BI/6. Antigravity/App finanzas personales/MoneyFlow_Finanzas_Personales.xlsx');
  XLSX.writeFile(wb, outputPath);

  console.log('SUCCESS: Excel file created at', outputPath);
}

exportToExcel().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
