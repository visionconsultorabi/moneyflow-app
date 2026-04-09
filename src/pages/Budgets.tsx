import { useState, useEffect, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { Budget, Category } from '../types/database';
import { Plus, X, PieChart, Settings, Edit2, Trash2, RefreshCw } from 'lucide-react';

const formatMoney = (amount: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(amount);

export function Budgets() {
  const { user } = useAuth();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const [form, setForm] = useState({ category_id: '', amount: '' });
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [editingBudgetAmount, setEditingBudgetAmount] = useState('');
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryForm, setCategoryForm] = useState<{name: string, icon: string, type: 'income' | 'expense'}>({ name: '', icon: '📦', type: 'expense' });
  const [initialBalance, setInitialBalance] = useState(0);
  const [scheduledCardPayments, setScheduledCardPayments] = useState(0);
  const [monthInstallments, setMonthInstallments] = useState<any[]>([]);
  const [totalIncomeActual, setTotalIncomeActual] = useState(0);
  const [totalExpenseActual, setTotalExpenseActual] = useState(0);

  // Initial balance editing
  const [editingInitialBalance, setEditingInitialBalance] = useState(false);
  const [tempInitialBalance, setTempInitialBalance] = useState('');

  useEffect(() => { if (user) loadData(); }, [user, month, year]);

  async function loadData() {
    setLoading(true);
    const startOfMonth = new Date(year, month - 1, 1).toISOString().split('T')[0];
    const endOfMonth = new Date(year, month, 0).toISOString().split('T')[0];

    // Previous month dates for Initial Balance
    const prevMonthDate = new Date(year, month - 2, 1);
    const prevMonth = prevMonthDate.getMonth() + 1;
    const prevYear = prevMonthDate.getFullYear();
    const prevStart = new Date(prevYear, prevMonth - 1, 1).toISOString().split('T')[0];
    const prevEnd = new Date(prevYear, prevMonth, 0).toISOString().split('T')[0];

    const [budgetsRes, catsRes, txsRes, instsRes, prevBudgetsRes, prevTxsRes, prevInstsRes, mbRes, prevMbRes] = await Promise.all([
      supabase.from('budgets').select('*, category:categories(*)').eq('month', month).eq('year', year),
      supabase.from('categories').select('*').order('name'),
      supabase.from('transactions').select('amount, type, category_id, is_installment_purchase').gte('transaction_date', startOfMonth).lte('transaction_date', endOfMonth + 'T23:59:59'),
      supabase.from('installments').select('*, plan:installment_plans(*, credit_card:accounts(*))').gte('due_month', startOfMonth).lte('due_month', endOfMonth),
      // Prev month data
      supabase.from('budgets').select('*, category:categories(*)').eq('month', prevMonth).eq('year', prevYear),
      supabase.from('transactions').select('amount, type, category_id, is_installment_purchase').gte('transaction_date', prevStart).lte('transaction_date', prevEnd + 'T23:59:59'),
      supabase.from('installments').select('amount, plan:installment_plans(category_id)').gte('due_month', prevStart).lte('due_month', prevEnd),
      // Overrides
      supabase.from('monthly_balances').select('balance').eq('month', month).eq('year', year).maybeSingle(),
      supabase.from('monthly_balances').select('balance').eq('month', prevMonth).eq('year', prevYear).maybeSingle()
    ]);
    
    if (catsRes.data) setCategories(catsRes.data);
    
    // Calculate CC projected for current month
    const currentInsts = instsRes.data || [];
    setScheduledCardPayments(currentInsts.reduce((sum, i) => sum + Number(i.amount), 0));
    setMonthInstallments(currentInsts);

    // Determine Initial Balance
    if (mbRes.data) {
      // Manual override for current month exists
      setInitialBalance(Number(mbRes.data.balance));
    } else {
      // Calculate from previous month
      if (prevBudgetsRes.data) {
        const pTxs = prevTxsRes.data || [];
        const pInsts = prevInstsRes.data || [];
        
        const prevEnriched = prevBudgetsRes.data.map((b: any) => {
          let spent = 0;
          const isIncome = b.category?.type === 'income';
          if (isIncome) {
            spent = pTxs.filter(t => t.type === 'income' && t.category_id === b.category_id).reduce((s, t) => s + Number(t.amount), 0);
          } else {
            spent = pTxs.filter(t => t.type === 'expense' && !t.is_installment_purchase && (b.category_id ? t.category_id === b.category_id : true)).reduce((s, t) => s + Number(t.amount), 0);
            const pCatInsts = pInsts.filter(i => i.plan?.category_id === b.category_id);
            spent += pCatInsts.reduce((s, i) => s + Number(i.amount), 0);
          }
          return { isIncome, spent };
        });

        const prevInc = prevEnriched.filter(e => e.isIncome).reduce((s, e) => s + e.spent, 0);
        const prevExp = prevEnriched.filter(e => !e.isIncome).reduce((s, e) => s + e.spent, 0) + pInsts.reduce((s, i) => s + Number(i.amount), 0);
        
        const prevStartBalance = prevMbRes.data ? Number(prevMbRes.data.balance) : 0;
        setInitialBalance(prevStartBalance + prevInc - prevExp);
      } else {
        setInitialBalance(0);
      }
    }

    if (budgetsRes.data) {
      const txs = txsRes.data || [];
      
      const enrichedBudgets = budgetsRes.data.map((b: any) => {
        let dynamicSpent = 0;
        const isIncome = b.category?.type === 'income';

        if (isIncome) {
          // Sum income transactions for this category
          dynamicSpent += txs
            .filter(t => t.type === 'income' && t.category_id === b.category_id)
            .reduce((sum, t) => sum + Number(t.amount), 0);
        } else {
          // Sum expense transactions (excluding master installment purchases)
          dynamicSpent += txs
            .filter(t => t.type === 'expense' && !t.is_installment_purchase && (b.category_id ? t.category_id === b.category_id : true))
            .reduce((sum, t) => sum + Number(t.amount), 0);
          
          // Add installments for this category
          const categoryInsts = currentInsts.filter(i => i.plan?.category_id === b.category_id);
          dynamicSpent += categoryInsts.reduce((sum, i) => sum + Number(i.amount), 0);
        }
        return { ...b, spent: dynamicSpent };
      });

      const sortedBudgets = (enrichedBudgets as Budget[]).sort((a, b) => {
        const nameA = a.category?.name || 'Z General';
        const nameB = b.category?.name || 'Z General';
        return nameA.localeCompare(nameB, 'es', { sensitivity: 'base' });
      });
      setBudgets(sortedBudgets);

      // Calculate global actual totals for the summary (including unbudgeted items)
      const incomeActualTotal = txs
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + Number(t.amount), 0);
      
      const expenseActualTotal = txs
        .filter(t => t.type === 'expense' && !t.is_installment_purchase)
        .reduce((sum, t) => sum + Number(t.amount), 0) + currentInsts.reduce((sum, i) => sum + Number(i.amount), 0);
      
      setTotalIncomeActual(incomeActualTotal);
      setTotalExpenseActual(expenseActualTotal);
    }
    setLoading(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from('budgets').insert({
      user_id: user!.id,
      category_id: form.category_id || null,
      month,
      year,
      amount: parseFloat(form.amount) || 0,
    });
    if (!error) {
      setShowForm(false);
      setForm({ category_id: '', amount: '' });
      loadData();
    }
  }

  async function deleteBudget(id: string) {
    if (!confirm('¿Eliminar este presupuesto?')) return;
    await supabase.from('budgets').delete().eq('id', id);
    loadData();
  }

  async function handleUpdateInitialBalance() {
    const newBalance = parseFloat(tempInitialBalance);
    if (isNaN(newBalance)) return;
    
    // Check if it already exists to upsert manually, or just use insert with conflict resolution if unique constraint exists
    const { data: existing } = await supabase.from('monthly_balances').select('id').eq('month', month).eq('year', year).maybeSingle();
    
    if (existing) {
      await supabase.from('monthly_balances').update({ balance: newBalance }).eq('id', existing.id);
    } else {
      await supabase.from('monthly_balances').insert({
        user_id: user!.id,
        month,
        year,
        balance: newBalance
      });
    }
    
    setEditingInitialBalance(false);
    loadData();
  }

  async function handleUpdateBudget(id: string) {
    const newAmount = parseFloat(editingBudgetAmount);
    if (isNaN(newAmount) || newAmount < 0) return;
    const { error } = await supabase.from('budgets').update({ amount: newAmount }).eq('id', id);
    if (!error) {
      setEditingBudgetId(null);
      setEditingBudgetAmount('');
      loadData();
    }
  }

  function startEditBudget(budget: Budget) {
    setEditingBudgetId(budget.id);
    setEditingBudgetAmount(String(budget.amount));
  }

  function cancelEditBudget() {
    setEditingBudgetId(null);
    setEditingBudgetAmount('');
  }

  async function handleCopyToNextMonth() {
    const nextMonthDate = new Date(year, month, 1);
    const nextM = nextMonthDate.getMonth() + 1;
    const nextY = nextMonthDate.getFullYear();

    if (!confirm(`¿Copiar el presupuesto actual a ${monthNames[nextM-1]} ${nextY}?`)) return;

    // Fetch budgets for next month to avoid duplicates
    const { data: existing } = await supabase.from('budgets').select('category_id').eq('month', nextM).eq('year', nextY);
    const existingIds = new Set(existing?.map(e => e.category_id) || []);

    const toCopy = budgets
      .filter(b => !existingIds.has(b.category_id))
      .map(b => ({
        user_id: user!.id,
        category_id: b.category_id,
        amount: b.amount,
        month: nextM,
        year: nextY
      }));

    if (toCopy.length === 0) {
      alert('Nada que copiar o el presupuesto ya existe en el mes siguiente.');
      return;
    }

    const { error } = await supabase.from('budgets').insert(toCopy);
    if (!error) {
      alert('Presupuesto copiado correctamente.');
    }
  }

  async function handleSaveCategory(e: FormEvent) {
    e.preventDefault();

    if (editingCategory) {
      const updatePayload = {
        name: categoryForm.name,
        icon: categoryForm.icon,
        type: categoryForm.type,
      };
      const { error } = await supabase.from('categories').update(updatePayload).eq('id', editingCategory.id);
      if (!error) {
        setEditingCategory(null);
        setCategoryForm({ name: '', icon: '📦', type: 'expense' });
        loadData();
      }
    } else {
      const { error } = await supabase.from('categories').insert({
        user_id: user!.id,
        name: categoryForm.name,
        icon: categoryForm.icon,
        type: categoryForm.type,
      });
      if (!error) {
        setCategoryForm({ name: '', icon: '📦', type: 'expense' });
        loadData();
      }
    }
  }

  async function deleteCategory(id: string) {
    if (!confirm('¿Eliminar esta categoría? Podría afectar a las transacciones existentes.')) return;
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) {
      alert('No se pudo eliminar la categoría. Probablemente esté en uso.');
    } else {
      loadData();
    }
  }

  const totalIncomeBudget = budgets.filter(b => b.category?.type === 'income').reduce((s, b) => s + Number(b.amount), 0);
  const baseExpenseBudget = budgets.filter(b => b.category?.type !== 'income').reduce((s, b) => s + Number(b.amount), 0);
  const totalExpenseBudget = baseExpenseBudget + scheduledCardPayments;
  
  // Totals are now handled by state calculated in loadData
  /*
  const totalIncomeActual = budgets.filter(b => b.category?.type === 'income').reduce((s, b) => s + Number(b.spent), 0);
  const baseExpenseActual = budgets.filter(b => b.category?.type !== 'income').reduce((s, b) => s + Number(b.spent), 0);
  const totalExpenseActual = baseExpenseActual + scheduledCardPayments;
  */

  const projectedBalance = initialBalance + totalIncomeBudget - totalExpenseBudget;
  const actualBalance = initialBalance + totalIncomeActual - totalExpenseActual;

  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  if (loading) return <div className="spinner" />;

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 12, marginTop: -4, display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="desktop-only">
          <h1 className="page-title">Presupuestos</h1>
          <p className="page-subtitle">{monthNames[month - 1]} {year}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flex: 1, justifyContent: 'flex-end', minWidth: 200 }}>
          <button className="btn btn-secondary btn-sm" style={{ height: 38, padding: '0 12px', flex: 1, maxWidth: 140 }} onClick={() => setShowCategoryManager(true)}>
            <Settings size={16} /> <span>Categorías</span>
          </button>
          <button className="btn btn-primary btn-sm" style={{ height: 38, padding: '0 12px', flex: 1, maxWidth: 140 }} onClick={() => setShowForm(true)}>
            <Plus size={16} /> <span>Nuevo</span>
          </button>
        </div>
      </div>

      {/* Month selector - More compact for mobile */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginBottom: 16, background: 'var(--bg-card)', padding: '6px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
        <button className="btn btn-ghost" style={{ padding: 6, minHeight: 'auto' }} onClick={() => { if (month === 1) { setMonth(12); setYear(year - 1); } else setMonth(month - 1); }}>←</button>
        <span style={{ fontSize: 14, fontWeight: 700, minWidth: 100, textAlign: 'center' }}>{monthNames[month - 1]} {year}</span>
        <button className="btn btn-ghost" style={{ padding: 6, minHeight: 'auto' }} onClick={() => { if (month === 12) { setMonth(1); setYear(year + 1); } else setMonth(month + 1); }}>→</button>
      </div>

      {/* Summary */}
      {(budgets.length > 0 || scheduledCardPayments > 0) && (
        <div className="card" style={{ marginBottom: 24, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
             <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                  Saldo Inicial
                  {!editingInitialBalance && (
                    <button onClick={() => { setTempInitialBalance(String(initialBalance)); setEditingInitialBalance(true); }} className="btn btn-ghost" style={{ padding: 2, minHeight: 'auto' }}>
                      <Edit2 size={12} />
                    </button>
                  )}
                </div>
                {editingInitialBalance ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <input
                      className="form-input"
                      type="number"
                      step="0.01"
                      value={tempInitialBalance}
                      onChange={e => setTempInitialBalance(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleUpdateInitialBalance(); if (e.key === 'Escape') setEditingInitialBalance(false); }}
                      autoFocus
                      style={{ width: 120, height: 32, fontSize: 14, padding: '4px 8px' }}
                    />
                    <button onClick={handleUpdateInitialBalance} className="btn btn-primary" style={{ padding: '4px 8px', minHeight: 'auto', fontSize: 13 }}>✓</button>
                    <button onClick={() => setEditingInitialBalance(false)} className="btn btn-ghost" style={{ padding: '4px 8px', minHeight: 'auto', fontSize: 13 }}>✗</button>
                  </div>
                ) : (
                  <div style={{ fontSize: 17, fontWeight: 800, color: initialBalance >= 0 ? 'var(--text-primary)' : 'var(--danger)' }}>{formatMoney(initialBalance)}</div>
                )}
             </div>
             <button className="btn btn-secondary btn-sm" onClick={handleCopyToNextMonth}>
               <RefreshCw size={14} /> <span className="desktop-only">Copiar al próximo mes</span><span className="mobile-only">Copiar</span>
             </button>
          </div>

          <div className="budget-summary-grid" style={{ display: 'grid', gap: 16, marginBottom: 20, borderTop: '1px solid var(--border-subtle)', paddingTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>Ingresos (+{formatMoney(initialBalance)})</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--success)', marginTop: 2 }}>{formatMoney(totalIncomeBudget + initialBalance)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>Gastos Presupuestados</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--danger)', marginTop: 2 }}>{formatMoney(totalExpenseBudget)}</div>
              </div>
            </div>
            
            <div style={{ padding: '12px 16px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase' }}>Balance Proyectado</div>
                <div style={{ fontSize: 17, fontWeight: 600, color: projectedBalance >= 0 ? 'var(--primary-500)' : 'var(--danger)', marginTop: 2 }}>{formatMoney(projectedBalance)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase' }}>Balance Real</div>
                <div style={{ fontSize: 16, fontWeight: 500, color: actualBalance >= 0 ? 'var(--text-primary)' : 'var(--danger)', marginTop: 2 }}>{formatMoney(actualBalance)}</div>
              </div>
            </div>
          </div>
          
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>Ejecución de Gastos</span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{Math.round((totalExpenseActual / totalExpenseBudget) * 100) || 0}%</span>
            </div>
            <div className="progress-bar" style={{ height: 8 }}>
              <div
                className={`progress-bar-fill ${totalExpenseBudget > 0 && totalExpenseActual / totalExpenseBudget > 1 ? 'red' : totalExpenseBudget > 0 && totalExpenseActual / totalExpenseBudget > 0.8 ? 'yellow' : 'green'}`}
                style={{ width: `${totalExpenseBudget > 0 ? Math.min((totalExpenseActual / totalExpenseBudget) * 100, 100) : 0}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Budget List */}
      {budgets.length === 0 && scheduledCardPayments === 0 ? (
        <div className="empty-state">
          <PieChart size={64} />
          <h3>Sin presupuestos ni consumos</h3>
          <p>Creá presupuestos para controlar tus gastos por categoría</p>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowForm(true)}>
            <Plus size={18} /> Crear Presupuesto
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Credit Card Section (Grouped Details) */}
          {monthInstallments.length > 0 && (
            <div>
              <h3 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10, letterSpacing: 0.5 }}>Pagos Automáticos (Cuotas)</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {Object.entries(
                  monthInstallments.reduce((acc: any, inst: any) => {
                    const cardName = inst.plan?.credit_card?.name || 'Otras Cuotas';
                    if (!acc[cardName]) acc[cardName] = { items: [], total: 0 };
                    acc[cardName].items.push(inst);
                    acc[cardName].total += Number(inst.amount);
                    return acc;
                  }, {})
                ).map(([cardName, group]: [string, any]) => (
                  <div key={cardName} className="card" style={{ padding: '0 12px', borderLeft: '4px solid var(--primary-500)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>{cardName}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--danger)' }}>Total: {formatMoney(group.total)}</span>
                    </div>
                    
                    <div className="budget-table-header" style={{ gridTemplateColumns: '1fr 70px 100px' }}>
                      <div>Descripción</div>
                      <div style={{ textAlign: 'center' }}>Cuota</div>
                      <div style={{ textAlign: 'right' }}>Monto</div>
                    </div>

                    {group.items.map((inst: any, idx: number) => (
                      <div key={inst.id} className="budget-table-row" style={{ gridTemplateColumns: '1fr 70px 100px', borderBottom: idx === group.items.length - 1 ? 'none' : '1px solid var(--border-subtle)' }}>
                        <div className="budget-row-main">
                          <div style={{ fontWeight: 500, fontSize: 13 }}>{inst.plan?.description || inst.plan?.name}</div>
                        </div>
                        <div className="budget-row-details">
                          <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)' }}>
                            {inst.installment_number}/{inst.plan?.installment_count || inst.plan?.total_installments}
                          </div>
                          <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                            {formatMoney(Number(inst.amount))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Income Section */}
          {budgets.some(b => b.category?.type === 'income') && (
            <div>
              <h3 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', color: 'var(--success)', marginBottom: 10, letterSpacing: 0.5 }}>Ingresos Proyectados</h3>
              <div className="card" style={{ padding: '0 12px' }}>
                <div className="budget-table-header" style={{ gridTemplateColumns: '1fr 100px 100px 60px 70px' }}>
                  <div>Categoría</div>
                  <div style={{ textAlign: 'right' }}>Proyectado</div>
                  <div style={{ textAlign: 'right' }}>Real</div>
                  <div style={{ textAlign: 'center' }}>%</div>
                  <div style={{ width: 55 }}></div>
                </div>
                {budgets.filter(b => b.category?.type === 'income').map((budget, idx, arr) => {
                  const pct = budget.amount ? Number(budget.spent) / Number(budget.amount) : 0;
                  const statusColor = pct >= 1 ? 'var(--success)' : pct > 0.5 ? 'var(--warning)' : 'var(--text-muted)';
                  
                  return (
                    <div key={budget.id} className="budget-table-row" style={{ gridTemplateColumns: '1fr 100px 100px 60px 70px', borderBottom: idx === arr.length - 1 ? 'none' : '1px solid var(--border-subtle)' }}>
                      <div className="budget-row-main">
                        <div style={{ fontWeight: 500, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>{budget.category?.icon || '💰'}</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{budget.category?.name}</span>
                        </div>
                        <div className="mobile-only" style={{ display: 'flex', gap: 4 }}>
                          {editingBudgetId === budget.id ? (
                            <button onClick={() => handleUpdateBudget(budget.id)} className="btn btn-ghost" style={{ padding: 4, minHeight: 'auto', color: 'var(--success)' }}>✓</button>
                          ) : (
                            <button onClick={() => startEditBudget(budget)} className="btn btn-ghost" style={{ padding: 4, minHeight: 'auto' }}>
                              <Edit2 size={13} color="var(--text-muted)" />
                            </button>
                          )}
                          <button onClick={() => deleteBudget(budget.id)} className="btn btn-ghost" style={{ padding: 4, minHeight: 'auto' }}>
                            <X size={13} color="var(--text-muted)" />
                          </button>
                        </div>
                      </div>
                      
                      <div className="budget-row-details">
                        <div style={{ textAlign: 'right' }}>
                          {editingBudgetId === budget.id ? (
                            <input
                              className="form-input"
                              type="number"
                              inputMode="numeric"
                              value={editingBudgetAmount}
                              onChange={e => setEditingBudgetAmount(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') handleUpdateBudget(budget.id); if (e.key === 'Escape') cancelEditBudget(); }}
                              autoFocus
                              style={{ width: '100%', height: 28, fontSize: 12, padding: '2px 6px', textAlign: 'right' }}
                            />
                          ) : (
                            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{formatMoney(Number(budget.amount))}</span>
                          )}
                        </div>

                        <div style={{ textAlign: 'right', fontSize: 13, color: 'var(--success)', fontWeight: 600 }}>
                          {formatMoney(Number(budget.spent))}
                        </div>

                        <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: statusColor }}>
                          {Math.round(pct * 100)}%
                        </div>

                        <div className="desktop-only" style={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
                          {editingBudgetId === budget.id ? (
                            <button onClick={() => handleUpdateBudget(budget.id)} className="btn btn-ghost" style={{ padding: 4, minHeight: 'auto', color: 'var(--success)' }}>✓</button>
                          ) : (
                            <button onClick={() => startEditBudget(budget)} className="btn btn-ghost" style={{ padding: 4, minHeight: 'auto' }}>
                              <Edit2 size={13} color="var(--text-muted)" />
                            </button>
                          )}
                          <button onClick={() => deleteBudget(budget.id)} className="btn btn-ghost" style={{ padding: 4, minHeight: 'auto' }}>
                            <X size={13} color="var(--text-muted)" />
                          </button>
                        </div>
                      </div>
                      {/* Tiny progress bar under the row */}
                      <div style={{ height: 2, background: 'var(--bg-elevated)', borderRadius: 1, marginTop: 4, gridColumn: '1 / -1', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(pct * 100, 100)}%`, background: statusColor }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Expense Section */}
          <div>
            <h3 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', color: 'var(--danger)', marginBottom: 10, letterSpacing: 0.5 }}>Gastos Presupuestados</h3>
            <div className="card" style={{ padding: '0 12px' }}>
              <div className="budget-table-header" style={{ gridTemplateColumns: '1fr 100px 100px 60px 70px' }}>
                <div>Categoría</div>
                <div style={{ textAlign: 'right' }}>Presup.</div>
                <div style={{ textAlign: 'right' }}>Real</div>
                <div style={{ textAlign: 'center' }}>%</div>
                <div style={{ width: 55 }}></div>
              </div>
              {budgets.filter(b => b.category?.type !== 'income').map((budget, idx, arr) => {
                const pct = budget.amount ? Number(budget.spent) / Number(budget.amount) : 0;
                const statusColor = pct > 1 ? 'var(--danger)' : pct > 0.8 ? 'var(--warning)' : 'var(--success)';
                
                return (
                  <div key={budget.id} className="budget-table-row" style={{ gridTemplateColumns: '1fr 100px 100px 60px 70px', borderBottom: idx === arr.length - 1 ? 'none' : '1px solid var(--border-subtle)' }}>
                    <div className="budget-row-main">
                      <div style={{ fontWeight: 500, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>{budget.category?.icon || '📦'}</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{budget.category?.name || 'General'}</span>
                      </div>
                      <div className="mobile-only" style={{ display: 'flex', gap: 4 }}>
                         {editingBudgetId === budget.id ? (
                          <button onClick={() => handleUpdateBudget(budget.id)} className="btn btn-ghost" style={{ padding: 4, minHeight: 'auto', color: 'var(--success)' }}>✓</button>
                        ) : (
                          <button onClick={() => startEditBudget(budget)} className="btn btn-ghost" style={{ padding: 4, minHeight: 'auto' }}>
                            <Edit2 size={13} color="var(--text-muted)" />
                          </button>
                        )}
                        <button onClick={() => deleteBudget(budget.id)} className="btn btn-ghost" style={{ padding: 4, minHeight: 'auto' }}>
                          <X size={13} color="var(--text-muted)" />
                        </button>
                      </div>
                    </div>
                    
                    <div className="budget-row-details">
                      <div style={{ textAlign: 'right' }}>
                        {editingBudgetId === budget.id ? (
                          <input
                            className="form-input"
                            type="number"
                            inputMode="numeric"
                            value={editingBudgetAmount}
                            onChange={e => setEditingBudgetAmount(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleUpdateBudget(budget.id); if (e.key === 'Escape') cancelEditBudget(); }}
                            autoFocus
                            style={{ width: '100%', height: 28, fontSize: 12, padding: '2px 6px', textAlign: 'right' }}
                          />
                        ) : (
                          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{formatMoney(Number(budget.amount))}</span>
                        )}
                      </div>

                      <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 600, color: pct > 1 ? 'var(--danger)' : 'var(--text-primary)' }}>
                        {formatMoney(Number(budget.spent))}
                      </div>

                      <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: statusColor }}>
                        {Math.round(pct * 100)}%
                      </div>

                      <div className="desktop-only" style={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                        {editingBudgetId === budget.id ? (
                          <button onClick={() => handleUpdateBudget(budget.id)} className="btn btn-ghost" style={{ padding: 4, minHeight: 'auto', color: 'var(--success)' }}>✓</button>
                        ) : (
                          <button onClick={() => startEditBudget(budget)} className="btn btn-ghost" style={{ padding: 4, minHeight: 'auto' }}>
                            <Edit2 size={13} color="var(--text-muted)" />
                          </button>
                        )}
                        <button onClick={() => deleteBudget(budget.id)} className="btn btn-ghost" style={{ padding: 4, minHeight: 'auto' }}>
                          <X size={13} color="var(--text-muted)" />
                        </button>
                      </div>
                    </div>
                    {/* Tiny progress bar under the row - visible on both */}
                    <div style={{ height: 2, background: 'var(--bg-elevated)', borderRadius: 1, marginTop: 4, gridColumn: '1 / -1', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(pct * 100, 100)}%`, background: statusColor }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* New Budget Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-header">
              <h2 className="modal-title">Nuevo Presupuesto</h2>
              <button className="modal-close" onClick={() => setShowForm(false)}><X size={18} /></button>
            </div>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 16 }}>
              {monthNames[month - 1]} {year}
            </p>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Categoría</label>
                <select className="form-select" value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}>
                  <option value="">Presupuesto General</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Monto Máximo</label>
                <input className="form-input" type="number" inputMode="numeric" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="50000" required />
              </div>
              <button type="submit" className="btn btn-primary btn-block btn-lg">Crear Presupuesto</button>
            </form>
          </div>
        </div>
      )}

      {/* Category Manager Modal */}
      {showCategoryManager && (
        <div className="modal-overlay" onClick={() => setShowCategoryManager(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-header">
              <h2 className="modal-title">Gestionar Categorías</h2>
              <button className="modal-close" onClick={() => setShowCategoryManager(false)}><X size={18} /></button>
            </div>

            <form onSubmit={handleSaveCategory} style={{ marginBottom: 24, padding: 16, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(60px, 80px) 1fr', gap: 12, marginBottom: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Ícono</label>
                  <input className="form-input" value={categoryForm.icon} onChange={e => setCategoryForm({ ...categoryForm, icon: e.target.value })} placeholder="📦" style={{ textAlign: 'center' }} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Nombre</label>
                  <input className="form-input" value={categoryForm.name} onChange={e => setCategoryForm({ ...categoryForm, name: e.target.value })} placeholder="Ej: Supermercado" required />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="form-label">Tipo</label>
                <select className="form-select" value={categoryForm.type} onChange={e => setCategoryForm({ ...categoryForm, type: e.target.value as 'income' | 'expense' })}>
                  <option value="expense">Gasto</option>
                  <option value="income">Ingreso</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {editingCategory && (
                  <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setEditingCategory(null); setCategoryForm({ name: '', icon: '📦', type: 'expense' }); }}>Cancelar</button>
                )}
                <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>{editingCategory ? 'Actualizar' : 'Agregar Categoría'}</button>
              </div>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {categories.map(c => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontWeight: 500 }}>{c.name}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { setEditingCategory(c); setCategoryForm({ name: c.name, icon: '', type: (c.type as 'income' | 'expense') || 'expense' }); }} className="btn btn-ghost" style={{ padding: 4, minHeight: 'auto' }}>
                      <Edit2 size={16} />
                    </button>
                    {!c.is_default && (
                      <button onClick={() => deleteCategory(c.id)} className="btn btn-ghost" style={{ padding: 4, minHeight: 'auto', color: 'var(--danger)' }}>
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
