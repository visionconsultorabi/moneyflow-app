import { useState, useEffect, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { Budget, Category } from '../types/database';
import { Plus, X, PieChart, Settings, Edit2, Trash2 } from 'lucide-react';

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
  const [categoryForm, setCategoryForm] = useState({ name: '', icon: '📦' });

  useEffect(() => { if (user) loadData(); }, [user, month, year]);

  async function loadData() {
    const startOfMonth = new Date(year, month - 1, 1).toISOString().split('T')[0];
    const endOfMonth = new Date(year, month, 0).toISOString().split('T')[0];

    const [budgetsRes, catsRes, txsRes, instsRes] = await Promise.all([
      supabase.from('budgets').select('*, category:categories(*)').eq('month', month).eq('year', year),
      supabase.from('categories').select('*').in('type', ['expense', 'both']).order('name'),
      supabase.from('transactions').select('amount, category_id').eq('type', 'expense').gte('transaction_date', startOfMonth).lte('transaction_date', endOfMonth + 'T23:59:59'),
      supabase.from('installments').select('amount, plan:installment_plans(category_id)').gte('due_month', startOfMonth).lte('due_month', endOfMonth)
    ]);
    
    if (catsRes.data) setCategories(catsRes.data);
    
    if (budgetsRes.data) {
      const txs = txsRes.data || [];
      const insts = instsRes.data || [];
      
      const enrichedBudgets = budgetsRes.data.map((b: any) => {
        let dynamicSpent = 0;
        // Sum regular expenses
        dynamicSpent += txs
          .filter(t => b.category_id ? t.category_id === b.category_id : true)
          .reduce((sum, t) => sum + Number(t.amount), 0);
          
        // Sum installments
        dynamicSpent += insts
          .filter(i => {
            const planCatId = (i.plan as any)?.category_id || null;
            return b.category_id ? planCatId === b.category_id : true;
          })
          .reduce((sum, i) => sum + Number(i.amount), 0);
          
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

  async function handleSaveCategory(e: FormEvent) {
    e.preventDefault();
    const payload = {
      user_id: user!.id,
      name: categoryForm.name,
      icon: categoryForm.icon,
      type: 'expense' as const,
    };

    if (editingCategory) {
      const { error } = await supabase.from('categories').update(payload).eq('id', editingCategory.id);
      if (!error) {
        setEditingCategory(null);
        setCategoryForm({ name: '', icon: '📦' });
        loadData();
      }
    } else {
      const { error } = await supabase.from('categories').insert(payload);
      if (!error) {
        setCategoryForm({ name: '', icon: '📦' });
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

  const totalBudget = budgets.reduce((s, b) => s + Number(b.amount), 0);
  const totalSpent = budgets.reduce((s, b) => s + Number(b.spent), 0);

  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  if (loading) return <div className="spinner" />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Presupuestos</h1>
          <p className="page-subtitle">{monthNames[month - 1]} {year}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => setShowCategoryManager(true)}>
            <Settings size={18} /> Categorías
          </button>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Plus size={18} /> Nuevo
          </button>
        </div>
      </div>

      {/* Month selector */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 20 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => { if (month === 1) { setMonth(12); setYear(year - 1); } else setMonth(month - 1); }}>←</button>
        <span style={{ flex: 1, textAlign: 'center', fontWeight: 600 }}>{monthNames[month - 1]} {year}</span>
        <button className="btn btn-secondary btn-sm" onClick={() => { if (month === 12) { setMonth(1); setYear(year + 1); } else setMonth(month + 1); }}>→</button>
      </div>

      {/* Summary */}
      {budgets.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Gastado</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: totalSpent > totalBudget ? 'var(--danger)' : 'var(--text-primary)' }}>{formatMoney(totalSpent)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Presupuesto</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{formatMoney(totalBudget)}</div>
            </div>
          </div>
          <div className="progress-bar" style={{ height: 10 }}>
            <div
              className={`progress-bar-fill ${totalSpent / totalBudget > 1 ? 'red' : totalSpent / totalBudget > 0.8 ? 'yellow' : 'green'}`}
              style={{ width: `${Math.min((totalSpent / totalBudget) * 100, 100)}%` }}
            />
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8, textAlign: 'center' }}>
            {totalBudget - totalSpent > 0
              ? `Quedan ${formatMoney(totalBudget - totalSpent)} disponibles`
              : `Excedido por ${formatMoney(totalSpent - totalBudget)}`}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {budgets.map(budget => {
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
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 12, marginBottom: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Ícono</label>
                  <input className="form-input" value={categoryForm.icon} onChange={e => setCategoryForm({ ...categoryForm, icon: e.target.value })} placeholder="📦" style={{ textAlign: 'center' }} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Nombre</label>
                  <input className="form-input" value={categoryForm.name} onChange={e => setCategoryForm({ ...categoryForm, name: e.target.value })} placeholder="Ej: Supermercado" required />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {editingCategory && (
                  <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setEditingCategory(null); setCategoryForm({ name: '', icon: '📦' }); }}>Cancelar</button>
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
                    <button onClick={() => { setEditingCategory(c); setCategoryForm({ name: c.name, icon: c.icon }); }} className="btn btn-ghost" style={{ padding: 4, minHeight: 'auto' }}>
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
