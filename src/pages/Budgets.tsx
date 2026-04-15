import { useState, useEffect, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { Budget, Category } from '../types/database';
import { Plus, X, PieChart, Settings, Edit2, Trash2, RefreshCw } from 'lucide-react';
import { CompactSelector } from '../components/CompactSelector';

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
  const [allMonthTransactions, setAllMonthTransactions] = useState<any[]>([]);
  const [selectedCategoryDetail, setSelectedCategoryDetail] = useState<{ id: string | null; name: string } | null>(null);
  const [expandedBudgets, setExpandedBudgets] = useState<Set<string>>(new Set());
  const [conceptLines, setConceptLines] = useState<{ concept: string; amount: string }[]>([]);

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
      supabase.from('transactions').select('*, category:categories(*)').gte('transaction_date', startOfMonth).lte('transaction_date', endOfMonth + 'T23:59:59'),
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
        const pTxs = (prevTxsRes.data || []).filter(t => !t.is_installment_purchase);
        const pInsts = prevInstsRes.data || [];
        
        const prevEnriched = prevBudgetsRes.data.map((b: any) => {
          let spent = 0;
          const isIncome = b.category?.type === 'income';
          if (isIncome) {
            spent = pTxs.filter(t => t.type === 'income' && t.category_id === b.category_id).reduce((s, t) => s + Number(t.amount), 0);
          } else {
            spent = pTxs.filter(t => t.type === 'expense' && !t.is_installment_purchase && (b.category_id ? t.category_id === b.category_id : true)).reduce((s, t) => s + Number(t.amount), 0);
            const pCatInsts = pInsts.filter(i => {
              const plan = Array.isArray(i.plan) ? i.plan[0] : i.plan;
              return plan?.category_id === b.category_id;
            });
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
      const txs = (txsRes.data || []).filter(t => !t.is_installment_purchase) as any[];
      setAllMonthTransactions(txs);
      const budgetMap = new Map((budgetsRes.data || []).map(b => [b.category_id, b]));
      
      // Categories from transactions + installments
      const txCategoryIds = new Set(txs.map(t => t.category_id));
      currentInsts.forEach(i => {
        const plan = Array.isArray(i.plan) ? i.plan[0] : i.plan;
        if (plan?.category_id) txCategoryIds.add(plan.category_id);
      });

      // Combine real budgets with "synthetic" ones for unbudgeted transactions
      const allBudgetEntries = [...(budgetsRes.data || [])];
      
      txCategoryIds.forEach(catId => {
        if (!budgetMap.has(catId) && catId) {
          const category = catsRes.data?.find(c => c.id === catId);
          if (category) {
            allBudgetEntries.push({
              id: `synthetic-${catId}`,
              category_id: catId,
              amount: 0,
              spent: 0,
              month,
              year,
              details: [],
              category: category as any,
              is_synthetic: true // flag for UI
            });
          }
        }
      });

      const enrichedBudgets = allBudgetEntries.map((b: any) => {
        let dynamicSpent = 0;
        const isIncome = b.category?.type === 'income';

        if (isIncome) {
          dynamicSpent += txs
            .filter(t => t.type === 'income' && t.category_id === b.category_id)
            .reduce((sum, t) => sum + Number(t.amount), 0);
        } else {
          dynamicSpent += txs
            .filter(t => t.type === 'expense' && !t.is_installment_purchase && (b.category_id ? t.category_id === b.category_id : true))
            .reduce((sum, t) => sum + Number(t.amount), 0);
          
          const categoryInsts = currentInsts.filter(i => {
            const plan = Array.isArray(i.plan) ? i.plan[0] : i.plan;
            return plan?.category_id === b.category_id;
          });
          dynamicSpent += categoryInsts.reduce((sum, i) => sum + Number(i.amount), 0);
        }
        return { ...b, spent: dynamicSpent };
      });

      const sortedBudgets = (enrichedBudgets as any[]).sort((a, b) => {
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
    const totalAmount = conceptLines.reduce((sum, line) => sum + (parseFloat(line.amount) || 0), 0) || parseFloat(form.amount) || 0;
    
    const { error } = await supabase.from('budgets').insert({
      user_id: user!.id,
      category_id: form.category_id || null,
      month,
      year,
      amount: totalAmount,
      details: conceptLines.filter(l => l.concept && l.amount) as any
    });
    if (!error) {
      setShowForm(false);
      setForm({ category_id: '', amount: '' });
      setConceptLines([]);
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
    const totalAmount = conceptLines.length > 0 
      ? conceptLines.reduce((sum, line) => sum + (parseFloat(line.amount) || 0), 0)
      : parseFloat(editingBudgetAmount);

    if (isNaN(totalAmount) || totalAmount < 0) return;
    
    const { error } = await supabase.from('budgets').update({ 
      amount: totalAmount,
      details: conceptLines.filter(l => l.concept && l.amount) as any
    }).eq('id', id);
    
    if (!error) {
      setEditingBudgetId(null);
      setEditingBudgetAmount('');
      setConceptLines([]);
      loadData();
    }
  }

  function startEditBudget(budget: Budget) {
    setEditingBudgetId(budget.id);
    setEditingBudgetAmount(String(budget.amount));
    setConceptLines(budget.details?.map(d => ({ concept: d.concept, amount: String(d.amount) })) || []);
    setShowForm(true); // Open the same modal for editing too for concept management
    setForm({ category_id: budget.category_id || '', amount: String(budget.amount) });
  }

  function cancelEditBudget() {
    setEditingBudgetId(null);
    setEditingBudgetAmount('');
    setConceptLines([]);
    setForm({ category_id: '', amount: '' });
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
      <div className="page-header" style={{ marginBottom: 10, marginTop: -4, display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="desktop-only">
          <h1 className="page-title">Presupuestos</h1>
          <p className="page-subtitle">{monthNames[month - 1]} {year}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flex: 1, justifyContent: 'flex-end', minWidth: 200 }}>
          <button className="btn btn-secondary btn-sm" style={{ height: 32, padding: '0 10px', flex: 1, maxWidth: 120, fontSize: 12 }} onClick={() => setShowCategoryManager(true)}>
            <Settings size={14} /> <span>Categorías</span>
          </button>
          <button className="btn btn-primary btn-sm" style={{ height: 32, padding: '0 10px', flex: 1, maxWidth: 120, fontSize: 12 }} onClick={() => setShowForm(true)}>
            <Plus size={14} /> <span>Nuevo</span>
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
                  const isExpanded = expandedBudgets.has(budget.id);
                  const hasDetails = budget.details && budget.details.length > 0;
                  
                  return (
                    <div key={budget.id} style={{ borderBottom: idx === arr.length - 1 ? 'none' : '1px solid var(--border-subtle)' }}>
                      <div 
                        className={`budget-table-row ${budget.is_synthetic ? 'synthetic' : ''}`} 
                        style={{ gridTemplateColumns: '1fr 100px 100px 60px 70px', cursor: 'pointer' }}
                        onClick={() => setSelectedCategoryDetail({ id: budget.category_id, name: budget.category?.name || 'General' })}
                      >
                        <div className="budget-row-main" style={{ position: 'relative' }}>
                          <div style={{ fontWeight: 500, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                            {hasDetails && (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const next = new Set(expandedBudgets);
                                  if (next.has(budget.id)) next.delete(budget.id);
                                  else next.add(budget.id);
                                  setExpandedBudgets(next);
                                }}
                                className="btn btn-ghost"
                                style={{ padding: 0, width: 20, height: 20, minHeight: 'auto' }}
                              >
                                {isExpanded ? '▼' : '▶'}
                              </button>
                            )}
                            <span>{budget.category?.icon || '💰'}</span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: budget.is_synthetic ? 'italic' : 'normal', opacity: budget.is_synthetic ? 0.7 : 1 }}>
                              {budget.category?.name}
                            </span>
                          </div>
                          <div className="mobile-only" style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                            {!budget.is_synthetic && (
                              <>
                                <button onClick={() => startEditBudget(budget)} className="btn btn-ghost" style={{ padding: 4, minHeight: 'auto' }}>
                                  <Edit2 size={13} color="var(--text-muted)" />
                                </button>
                                <button onClick={() => deleteBudget(budget.id)} className="btn btn-ghost" style={{ padding: 4, minHeight: 'auto' }}>
                                  <X size={13} color="var(--text-muted)" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        
                        <div className="budget-row-details">
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{formatMoney(Number(budget.amount))}</span>
                          </div>

                          <div style={{ textAlign: 'right', fontSize: 13, color: 'var(--success)', fontWeight: 600 }}>
                            {formatMoney(Number(budget.spent))}
                          </div>

                          <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: statusColor }}>
                            {Math.round(pct * 100)}%
                          </div>

                          <div className="desktop-only" style={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }} onClick={e => e.stopPropagation()}>
                            {!budget.is_synthetic && (
                              <>
                                <button onClick={() => startEditBudget(budget)} className="btn btn-ghost" style={{ padding: 4, minHeight: 'auto' }}>
                                  <Edit2 size={13} color="var(--text-muted)" />
                                </button>
                                <button onClick={() => deleteBudget(budget.id)} className="btn btn-ghost" style={{ padding: 4, minHeight: 'auto' }}>
                                  <X size={13} color="var(--text-muted)" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        <div style={{ height: 2, background: 'var(--bg-elevated)', borderRadius: 1, marginTop: 4, gridColumn: '1 / -1', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.min(pct * 100, 100)}%`, background: statusColor }} />
                        </div>
                      </div>

                      {/* Detail expansion */}
                      {isExpanded && hasDetails && (
                        <div style={{ background: 'var(--bg-elevated)', padding: '4px 12px 8px 36px', borderBottom: '1px solid var(--border-subtle)' }}>
                          {budget.details?.map((detail, dIdx) => (
                            <div key={dIdx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)', padding: '4px 0', borderBottom: dIdx === (budget.details?.length || 0) -1 ? 'none' : '1px dashed var(--border-subtle)' }}>
                              <span>{detail.concept}</span>
                              <span style={{ fontWeight: 600 }}>{formatMoney(detail.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
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
                  const isExpanded = expandedBudgets.has(budget.id);
                  const hasDetails = budget.details && budget.details.length > 0;
                  
                  return (
                    <div key={budget.id} style={{ borderBottom: idx === arr.length - 1 ? 'none' : '1px solid var(--border-subtle)' }}>
                      <div 
                        className={`budget-table-row ${budget.is_synthetic ? 'synthetic' : ''}`} 
                        style={{ gridTemplateColumns: '1fr 100px 100px 60px 70px', cursor: 'pointer' }}
                        onClick={() => setSelectedCategoryDetail({ id: budget.category_id, name: budget.category?.name || 'General' })}
                      >
                        <div className="budget-row-main">
                          <div style={{ fontWeight: 500, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                            {hasDetails && (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const next = new Set(expandedBudgets);
                                  if (next.has(budget.id)) next.delete(budget.id);
                                  else next.add(budget.id);
                                  setExpandedBudgets(next);
                                }}
                                className="btn btn-ghost"
                                style={{ padding: 0, width: 20, height: 20, minHeight: 'auto' }}
                              >
                                {isExpanded ? '▼' : '▶'}
                              </button>
                            )}
                            <span>{budget.category?.icon || '📦'}</span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: budget.is_synthetic ? 'italic' : 'normal', opacity: budget.is_synthetic ? 0.7 : 1 }}>
                              {budget.category?.name || 'General'}
                            </span>
                          </div>
                          <div className="mobile-only" style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                            {!budget.is_synthetic && (
                              <>
                                <button onClick={() => startEditBudget(budget)} className="btn btn-ghost" style={{ padding: 4, minHeight: 'auto' }}>
                                  <Edit2 size={13} color="var(--text-muted)" />
                                </button>
                                <button onClick={() => deleteBudget(budget.id)} className="btn btn-ghost" style={{ padding: 4, minHeight: 'auto' }}>
                                  <X size={13} color="var(--text-muted)" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        
                        <div className="budget-row-details">
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{formatMoney(Number(budget.amount))}</span>
                          </div>

                          <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 600, color: pct > 1 ? 'var(--danger)' : 'var(--text-primary)' }}>
                            {formatMoney(Number(budget.spent))}
                          </div>

                          <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: statusColor }}>
                            {Math.round(pct * 100)}%
                          </div>

                          <div className="desktop-only" style={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }} onClick={e => e.stopPropagation()}>
                            {!budget.is_synthetic && (
                              <>
                                <button onClick={() => startEditBudget(budget)} className="btn btn-ghost" style={{ padding: 4, minHeight: 'auto' }}>
                                  <Edit2 size={13} color="var(--text-muted)" />
                                </button>
                                <button onClick={() => deleteBudget(budget.id)} className="btn btn-ghost" style={{ padding: 4, minHeight: 'auto' }}>
                                  <X size={13} color="var(--text-muted)" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        <div style={{ height: 2, background: 'var(--bg-elevated)', borderRadius: 1, marginTop: 4, gridColumn: '1 / -1', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.min(pct * 100, 100)}%`, background: statusColor }} />
                        </div>
                      </div>

                      {isExpanded && hasDetails && (
                        <div style={{ background: 'var(--bg-elevated)', padding: '4px 12px 8px 36px', borderBottom: '1px solid var(--border-subtle)' }}>
                          {budget.details?.map((detail, dIdx) => (
                            <div key={dIdx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)', padding: '4px 0', borderBottom: dIdx === (budget.details?.length || 0) - 1 ? 'none' : '1px dashed var(--border-subtle)' }}>
                              <span>{detail.concept}</span>
                              <span style={{ fontWeight: 600 }}>{formatMoney(detail.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* New/Edit Budget Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => { setShowForm(false); cancelEditBudget(); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-header">
              <h2 className="modal-title">{editingBudgetId ? 'Editar' : 'Nuevo'} Presupuesto</h2>
              <button className="modal-close" onClick={() => { setShowForm(false); cancelEditBudget(); }}><X size={18} /></button>
            </div>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 16 }}>
              {monthNames[month - 1]} {year}
            </p>
            <form onSubmit={editingBudgetId ? (e) => { e.preventDefault(); handleUpdateBudget(editingBudgetId); } : handleSubmit}>
              <div style={{ marginBottom: 12 }}>
                <CompactSelector
                  label="Categoría"
                  options={categories}
                  selectedId={form.category_id}
                  onChange={id => setForm({ ...form, category_id: id })}
                  placeholder="Presupuesto General"
                  variant="grid"
                  disabled={!!editingBudgetId}
                />
              </div>
              
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>Desglose de Conceptos (Opcional)</label>
                  <button type="button" className="btn btn-ghost" style={{ padding: '0 8px', fontSize: 12, height: 24 }} onClick={() => setConceptLines([...conceptLines, { concept: '', amount: '' }])}>
                    + Agregar ítem
                  </button>
                </div>
                
                {conceptLines.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {conceptLines.map((line, idx) => (
                      <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 32px', gap: 8, alignItems: 'center' }}>
                        <input
                          className="form-input"
                          style={{ height: 32, fontSize: 13 }}
                          placeholder="Ej: Internet"
                          value={line.concept}
                          onChange={e => {
                            const newLines = [...conceptLines];
                            newLines[idx].concept = e.target.value;
                            setConceptLines(newLines);
                          }}
                        />
                        <input
                          className="form-input"
                          style={{ height: 32, fontSize: 13, textAlign: 'right' }}
                          type="number"
                          placeholder="0"
                          value={line.amount}
                          onChange={e => {
                            const newLines = [...conceptLines];
                            newLines[idx].amount = e.target.value;
                            setConceptLines(newLines);
                          }}
                        />
                        <button type="button" onClick={() => setConceptLines(conceptLines.filter((_, i) => i !== idx))} className="btn btn-ghost" style={{ color: 'var(--danger)', padding: 0, height: 32 }}>
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    <div style={{ textAlign: 'right', marginTop: 8, fontSize: 14, fontWeight: 700, color: 'var(--primary-500)' }}>
                      Total: {formatMoney(conceptLines.reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0))}
                    </div>
                  </div>
                ) : (
                  <div className="form-group">
                    <label className="form-label">Monto Global</label>
                    <input className="form-input" type="number" inputMode="numeric" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="50000" required={conceptLines.length === 0} />
                  </div>
                )}
              </div>
              
              <button type="submit" className="btn btn-primary btn-block btn-lg">
                {editingBudgetId ? 'Guardar Cambios' : 'Crear Presupuesto'}
              </button>
              {editingBudgetId && (
                <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 8, color: 'var(--danger)' }} onClick={() => { deleteBudget(editingBudgetId); setShowForm(false); }}>
                  Eliminar Presupuesto
                </button>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Transaction Detail Modal */}
      {selectedCategoryDetail && (
        <div className="modal-overlay" onClick={() => setSelectedCategoryDetail(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-handle" />
            <div className="modal-header">
              <h2 className="modal-title">Movimientos: {selectedCategoryDetail.name}</h2>
              <button className="modal-close" onClick={() => setSelectedCategoryDetail(null)}><X size={18} /></button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
              {(() => {
                const txs = allMonthTransactions.filter(t => t.category_id === selectedCategoryDetail.id);
                const insts = monthInstallments.filter(i => {
                  const plan = Array.isArray(i.plan) ? i.plan[0] : i.plan;
                  return plan?.category_id === selectedCategoryDetail.id;
                });
                
                if (txs.length === 0 && insts.length === 0) {
                  return <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Sin movimientos en este período</div>;
                }

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {[...txs, ...insts]
                      .sort((a, b) => {
                        const dateA = a.transaction_date || a.due_month;
                        const dateB = b.transaction_date || b.due_month;
                        return dateB.localeCompare(dateA);
                      })
                      .map((item, idx) => {
                        const isInst = !!item.due_month;
                        const description = isInst ? (item.plan?.description || 'Cuota de tarjeta') : (item.description || 'Sin descripción');
                        const date = isInst ? item.due_month : item.transaction_date;
                        const amount = Number(item.amount);
                        const type = isInst ? 'expense' : item.type;
                        
                        return (
                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <div style={{ fontSize: 13, fontWeight: 500 }}>{description}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                {new Date(date + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                                {isInst && ` · Cuota ${item.installment_number}/${item.plan?.installment_count}`}
                                {!isInst && item.account && ` · ${item.account.name}`}
                              </div>
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: type === 'income' ? 'var(--success)' : 'var(--danger)' }}>
                              {type === 'income' ? '+' : '-'}{formatMoney(amount)}
                            </div>
                          </div>
                        );
                      })
                    }
                  </div>
                );
              })()}
            </div>
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {categories.map(c => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16 }}>{c.icon}</span>
                    <span style={{ fontWeight: 500, fontSize: 13 }}>{c.name}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => { setEditingCategory(c); setCategoryForm({ name: c.name, icon: c.icon, type: (c.type as 'income' | 'expense') || 'expense' }); }} className="btn btn-ghost" style={{ padding: 4, minHeight: 'auto' }}>
                      <Edit2 size={14} />
                    </button>
                    {!c.is_default && (
                      <button onClick={() => deleteCategory(c.id)} className="btn btn-ghost" style={{ padding: 4, minHeight: 'auto', color: 'var(--danger)' }}>
                        <Trash2 size={14} />
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
