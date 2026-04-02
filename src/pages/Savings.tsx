import { useState, useEffect, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { SavingsGoal } from '../types/database';
import { Plus, Target, X, TrendingUp } from 'lucide-react';

const formatMoney = (amount: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(amount);

export function Savings() {
  const { user } = useAuth();
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    target_amount: '',
    current_amount: '',
    deadline: '',
    color: '#10B981',
    icon: '🎯'
  });

  useEffect(() => { if (user) loadGoals(); }, [user]);

  async function loadGoals() {
    setLoading(true);
    const { data } = await supabase.from('savings_goals').select('*').order('created_at');
    if (data) setGoals(data);
    setLoading(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from('savings_goals').insert({
      user_id: user!.id,
      name: form.name,
      target_amount: parseFloat(form.target_amount),
      current_amount: parseFloat(form.current_amount) || 0,
      deadline: form.deadline || null,
      color: form.color,
      icon: form.icon,
      status: 'active'
    });
    if (!error) {
      setShowForm(false);
      setForm({ name: '', target_amount: '', current_amount: '', deadline: '', color: '#10B981', icon: '🎯' });
      loadGoals();
    }
  }

  async function updateProgress(goal: SavingsGoal, amount: number) {
    const newAmount = Number(goal.current_amount) + amount;
    const { error } = await supabase.from('savings_goals')
      .update({ current_amount: newAmount, status: newAmount >= goal.target_amount ? 'completed' : 'active' })
      .eq('id', goal.id);
    if (!error) loadGoals();
  }

  if (loading) return <div className="spinner" />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Metas de Ahorro</h1>
          <p className="page-subtitle">Alcanzá tus sueños paso a paso</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          <Plus size={18} /> Nueva Meta
        </button>
      </div>

      {goals.length === 0 ? (
        <div className="empty-state">
          <Target size={64} />
          <h3>No tenés metas aún</h3>
          <p>¿Qué querés lograr? ¿Un viaje? ¿Un auto? Empezá hoy.</p>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowForm(true)}>
            Crear mi primera meta
          </button>
        </div>
      ) : (
        <div className="accounts-grid">
          {goals.map(goal => {
            const pct = Math.min(Math.round((Number(goal.current_amount) / Number(goal.target_amount)) * 100), 100);
            return (
              <div key={goal.id} className="card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>{goal.name}</h3>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        Meta: {formatMoney(Number(goal.target_amount))}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 18, fontWeight: 600, color: goal.color }}>{pct}%</div>
                  </div>
                </div>

                <div className="utilization-bar" style={{ height: 8, marginBottom: 8 }}>
                  <div className="utilization-fill" style={{ width: `${pct}%`, background: goal.color }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 20 }}>
                  <span>{formatMoney(Number(goal.current_amount))} ahorrados</span>
                  <span style={{ color: 'var(--text-muted)' }}>Faltan {formatMoney(Number(goal.target_amount) - Number(goal.current_amount))}</span>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => {
                    const amt = prompt('¿Cuánto querés sumar?');
                    if (amt) updateProgress(goal, parseFloat(amt));
                  }}>
                    <TrendingUp size={14} /> Sumar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-header">
              <h2 className="modal-title">Nueva Meta</h2>
              <button className="modal-close" onClick={() => setShowForm(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Nombre de la meta</label>
                <input className="form-input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Ej: Viaje a Japón" required />
              </div>
              <div className="form-group">
                <label className="form-label">Monto objetivo</label>
                <input className="form-input" type="number" value={form.target_amount} onChange={e => setForm({...form, target_amount: e.target.value})} placeholder="0" required />
              </div>
              <div className="form-group">
                <label className="form-label">Ahorro inicial (opcional)</label>
                <input className="form-input" type="number" value={form.current_amount} onChange={e => setForm({...form, current_amount: e.target.value})} placeholder="0" />
              </div>
              <div className="form-group">
                <label className="form-label">Fecha límite (opcional)</label>
                <input className="form-input" type="date" value={form.deadline} onChange={e => setForm({...form, deadline: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Color</label>
                <input type="color" value={form.color} onChange={e => setForm({...form, color: e.target.value})} style={{ width: '100%', height: 40, border: 'none', background: 'none' }} />
              </div>
              <button type="submit" className="btn btn-primary btn-block btn-lg">Empezar a ahorrar</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
