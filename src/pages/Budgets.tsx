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
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryForm, setCategoryForm] = useState<{name: string, icon: string, type: 'income' | 'expense'}>({ name: '', icon: '📦', type: 'expense' });
  const [initialBalance, setInitialBalance] = useState(0);
  const [scheduledCardPayments, setScheduledCardPayments] = useState(0);

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

    const [budgetsRes, catsRes, txsRes, instsRes, prevBudgetsRes, prevTxsRes, prevInstsRes] = await Promise.all([
      supabase.from('budgets').select('*, category:categories(*)').eq('month', month).eq('year', year),
      supabase.from('categories').select('*').order('name'),
      supabase.from('transactions').select('amount, type, category_id').gte('transaction_date', startOfMonth).lte('transaction_date', endOfMonth + 'T23:59:59'),
      supabase.from('installments').select('amount, plan:installment_plans(category_id)').gte('due_month', startOfMonth).lte('due_month', endOfMonth),
      // Prev month data
      supabase.from('budgets').select('*, category:categories(*)').eq('month', prevMonth).eq('year', prevYear),
      supabase.from('transactions').select('amount, type, category_id').gte('transaction_date', prevStart).lte('transaction_date', prevEnd + 'T23:59:59'),
      supabase.from('installments').select('amount, plan:installment_plans(category_id)').gte('due_month', prevStart).lte('due_month', prevEnd)
    ]);
    
    if (catsRes.data) setCategories(catsRes.data);
    
    // Calculate CC projected for current month
    const currentInsts = instsRes.data || [];
    setScheduledCardPayments(currentInsts.reduce((sum, i) => sum + Number(i.amount), 0));

    // Calculate Initial Balance from previous month
    if (prevBudgetsRes.data) {
      const pTxs = prevTxsRes.data || [];
      const pInsts = prevInstsRes.data || [];
      
      const prevEnriched = prevBudgetsRes.data.map((b: any) => {
        let spent = 0;
        const isIncome = b.category?.type === 'income';
        if (isIncome) {
          spent = pTxs.filter(t => t.type === 'income' && t.category_id === b.category_id).reduce((s, t) => s + Number(t.amount), 0);
        } else {
          spent = pTxs.filter(t => t.type === 'expense' && (b.category_id ? t.category_id === b.category_id : true)).reduce((s, t) => s + Number(t.amount), 0);
          spent += pInsts.filter(i => {
              const planCatId = (i.plan as any)?.category_id || null;
              return b.category_id ? planCatId === b.category_id : true;
            }).reduce((s, i) => s + Number(i.amount), 0);
        }
        return { isIncome, spent };
      });

      const prevInc = prevEnriched.filter(e => e.isIncome).reduce((s, e) => s + e.spent, 0);
      const prevExp = prevEnriched.filter(e => !e.isIncome).reduce((s, e) => s + e.spent, 0);
      setInitialBalance(prevInc - prevExp);
    } else {
      setInitialBalance(0);
    }

    if (budgetsRes.data) {
      const txs = txsRes.data || [];
      const insts = currentInsts;
      
      const enrichedBudgets = budgetsRes.data.map((b: any) => {
        let dynamicSpent = 0;
        const isIncome = b.category?.type === 'income';

        if (isIncome) {
          // Sum income transactions for this category
          dynamicSpent += txs
            .filter(t => t.type === 'income' && t.category_id === b.category_id)
            .reduce((sum, t) => sum + Number(t.amount), 0);
        } else {
          // Sum expense transactions
          dynamicSpent += txs
            .filter(t => t.type === 'expense' && (b.category_id ? t.category_id === b.category_id : true))
            .reduce((sum, t) => sum + Number(t.amount), 0);
            
          // Sum installments
          dynamicSpent += insts
            .filter(i => {
              const planCatId = (i.plan as any)?.category_id || null;
              return b.category_id ? planCatId === b.category_id : true;
            })
            .reduce((sum, i) => sum + Number(i.amount), 0);
        }
          
        return { ...b, spent: dynamicSpent };
      });
      setBudgets(enrichedBudgets as Budget[]);
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
    const payload = {
      user_id: user!.id,
      name: categoryForm.name,
      icon: categoryForm.icon,
      type: categoryForm.type,
    };

    if (editingCategory) {
      const { error } = await supabase.from('categories').update(payload).eq('id', editingCategory.id);
      if (!error) {
        setEditingCategory(null);
        setCategoryForm({ name: '', icon: '📦', type: 'expense' });
        loadData();
      }
    } else {
      const { error } = await supabase.from('categories').insert(payload);
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
  const totalExpenseBudget = budgets.filter(b => b.category?.type !== 'income').reduce((s, b) => s + Number(b.amount), 0);
  
  const totalIncomeActual = budgets.filter(b => b.category?.type === 'income').reduce((s, b) => s + Number(b.spent), 0);
  const totalExpenseActual = budgets.filter(b => b.category?.type !== 'income').reduce((s, b) => s + Number(b.spent), 0);

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
      {budgets.length > 0 && (
        <div className="card" style={{ marginBottom: 24, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
             <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Saldo Inicial</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: initialBalance >= 0 ? 'var(--text-primary)' : 'var(--danger)' }}>{formatMoney(initialBalance)}</div>
             </div>
             <button className="btn btn-secondary btn-sm" onClick={handleCopyToNextMonth}>
               <RefreshCw size={14} /> <span className="desktop-only">Copiar al próximo mes</span><span className="mobile-only">Copiar</span>
             </button>
          </div>

          <div className="budget-summary-grid" style={{ display: 'grid', gap: 16, marginBottom: 20, borderTop: '1px solid var(--border-subtle)', paddingTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Ingresos (+{formatMoney(initialBalance)})</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--success)', marginTop: 2 }}>{formatMoney(totalIncomeBudget + initialBalance)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Gastos Presupuestados</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--danger)', marginTop: 2 }}>{formatMoney(totalExpenseBudget)}</div>
              </div>
            </div>
            
            <div style={{ padding: '12px 16px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Balance Proyectado</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: projectedBalance >= 0 ? 'var(--primary-500)' : 'var(--danger)', marginTop: 2 }}>{formatMoney(projectedBalance)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Balance Real</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: actualBalance >= 0 ? 'var(--text-primary)' : 'var(--danger)', marginTop: 2 }}>{formatMoney(actualBalance)}</div>
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
                className={`progress-bar-fill ${totalExpenseActual / totalExpenseBudget > 1 ? 'red' : totalExpenseActual / totalExpenseBudget > 0.8 ? 'yellow' : 'green'}`}
                style={{ width: `${Math.min((totalExpenseActual / totalExpenseBudget) * 100, 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Budget List */}
      {budgets.length === 0 ? (
        <div className="empty-state">
          <PieChart size={64} />
          <h3>Sin presupuestos</h3>
          <p>Creá presupuestos para controlar tus gastos por categoría</p>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowForm(true)}>
            <Plus size={18} /> Crear Presupuesto
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Income Section */}
          {budgets.some(b => b.category?.type === 'income') && (
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12, letterSpacing: 0.5 }}>Ingresos Proyectados</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {budgets.filter(b => b.category?.type === 'income').map(budget => (
                  <div key={budget.id} className="card" style={{ borderLeft: '4px solid var(--success)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 22 }}>{budget.category?.icon || '💰'}</span>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{budget.category?.name}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            Recibido: {formatMoney(Number(budget.spent))} / Proyectado: {formatMoney(Number(budget.amount))}
                          </div>
                        </div>
                      </div>
                      <button onClick={() => deleteBudget(budget.id)} className="btn btn-ghost" style={{ padding: 4, minHeight: 'auto' }}>
                        <X size={14} color="var(--text-muted)" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Expense Section */}
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12, letterSpacing: 0.5 }}>Gastos Presupuestados</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Automated Credit Card Row */}
              {scheduledCardPayments > 0 && (
                <div className="card" style={{ borderLeft: '4px solid var(--warning)', background: 'rgba(245, 158, 11, 0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 22 }}>💳</span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>Cuotas de Tarjeta (Previsto)</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          Total comprometido en cuotas para este mes
                        </div>
                      </div>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 16 }}>{formatMoney(scheduledCardPayments)}</div>
                  </div>
                </div>
              )}

              {budgets.filter(b => b.category?.type !== 'income').map(budget => {
                const pct = budget.amount ? Number(budget.spent) / Number(budget.amount) : 0;
                  const colorClass = pct > 1 ? 'red' : pct > 0.8 ? 'yellow' : 'green';
                  return (
                    <div key={budget.id} className="card">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 22 }}>{budget.category?.icon || '📦'}</span>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{budget.category?.name || 'General'}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                              {formatMoney(Number(budget.spent))} / {formatMoney(Number(budget.amount))}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 700, fontSize: 14, color: pct > 1 ? 'var(--danger)' : pct > 0.8 ? 'var(--warning)' : 'var(--success)' }}>
                            {Math.round(pct * 100)}%
                          </span>
                          <button onClick={() => deleteBudget(budget.id)} className="btn btn-ghost" style={{ padding: 4, minHeight: 'auto' }}>
                            <X size={14} color="var(--text-muted)" />
                          </button>
                        </div>
                      </div>
                      <div className="progress-bar">
                        <div className={`progress-bar-fill ${colorClass}`} style={{ width: `${Math.min(pct * 100, 100)}%` }} />
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
                    <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
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
                    <span style={{ fontSize: 20 }}>{c.icon}</span>
                    <span style={{ fontWeight: 500 }}>{c.name}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { setEditingCategory(c); setCategoryForm({ name: c.name, icon: c.icon, type: (c.type as 'income' | 'expense') || 'expense' }); }} className="btn btn-ghost" style={{ padding: 4, minHeight: 'auto' }}>
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
