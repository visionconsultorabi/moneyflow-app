import { useState, useEffect, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { RecurringTransaction, Category, Account } from '../types/database';
import { Plus, RefreshCw, X, Trash2 } from 'lucide-react';

const formatMoney = (amount: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(amount);

export function Recurring() {
  const { user } = useAuth();
  const [recurrings, setRecurrings] = useState<RecurringTransaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    description: '',
    amount: '',
    type: 'expense' as 'expense' | 'income',
    category_id: '',
    account_id: '',
    frequency: 'monthly' as any,
    start_date: new Date().toISOString().split('T')[0]
  });

  useEffect(() => { if (user) loadData(); }, [user]);

  async function loadData() {
    setLoading(true);
    const [recRes, catRes, accRes] = await Promise.all([
      supabase.from('recurring_transactions').select('*, category:categories(*), account:accounts(*)').order('created_at'),
      supabase.from('categories').select('*').order('name'),
      supabase.from('accounts').select('*').neq('account_type', 'credit_card').order('name')
    ]);
    if (recRes.data) setRecurrings(recRes.data);
    if (catRes.data) setCategories(catRes.data);
    if (accRes.data) setAccounts(accRes.data);
    setLoading(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from('recurring_transactions').insert({
      user_id: user!.id,
      description: form.description,
      amount: parseFloat(form.amount),
      type: form.type,
      category_id: form.category_id || null,
      account_id: form.account_id,
      frequency: form.frequency,
      start_date: form.start_date,
      next_occurrence: form.start_date,
      status: 'active'
    });
    if (!error) {
      setShowForm(false);
      loadData();
    }
  }

  async function deleteRecurring(id: string) {
    if (!confirm('¿Eliminar esta automatización?')) return;
    await supabase.from('recurring_transactions').delete().eq('id', id);
    loadData();
  }

  if (loading) return <div className="spinner" />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Pagos Recurrentes</h1>
          <p className="page-subtitle">Automatizá tus gastos fijos</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          <Plus size={18} /> Nuevo
        </button>
      </div>

      {recurrings.length === 0 ? (
        <div className="empty-state">
          <RefreshCw size={64} />
          <h3>Sin pagos recurrentes</h3>
          <p>Agregá el alquiler, internet o suscripciones para no olvidarte.</p>
        </div>
      ) : (
        <div className="transaction-list">
          {recurrings.map(rec => (
            <div key={rec.id} className="transaction-item">
              <div className="transaction-icon" style={{ background: 'var(--primary-400)22' }}>
                <RefreshCw size={20} color="var(--primary-400)" />
              </div>
              <div className="transaction-info">
                <div className="transaction-desc">{rec.description}</div>
                <div className="transaction-category">
                  {rec.frequency === 'monthly' ? 'Mensual' : 'Semanal'} · {rec.account?.name}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className={`transaction-amount ${rec.type}`}>
                  {formatMoney(Number(rec.amount))}
                </div>
                <button onClick={() => deleteRecurring(rec.id)} className="btn btn-ghost" style={{ padding: 4 }}>
                  <Trash2 size={16} color="var(--text-muted)" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-header">
              <h2 className="modal-title">Nueva Automatización</h2>
              <button className="modal-close" onClick={() => setShowForm(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Descripción</label>
                <input className="form-input" value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Ej: Alquiler" required />
              </div>
              <div className="form-group">
                <label className="form-label">Monto</label>
                <input className="form-input" type="number" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} placeholder="0" required />
              </div>
              <div className="form-group">
                <label className="form-label">Frecuencia</label>
                <select className="form-select" value={form.frequency} onChange={e => setForm({...form, frequency: e.target.value})}>
                  <option value="weekly">Semanal</option>
                  <option value="monthly">Mensual</option>
                  <option value="yearly">Anual</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Categoría</label>
                <select className="form-select" value={form.category_id} onChange={e => setForm({...form, category_id: e.target.value})}>
                  <option value="">Sin categoría</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Cuenta de débito</label>
                <select className="form-select" value={form.account_id} onChange={e => setForm({...form, account_id: e.target.value})} required>
                  <option value="">Seleccionar cuenta</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Próximo cobro</label>
                <input className="form-input" type="date" value={form.start_date} onChange={e => setForm({...form, start_date: e.target.value})} required />
              </div>
              <button type="submit" className="btn btn-primary btn-block btn-lg">Activar Automatización</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
