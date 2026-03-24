import { useState, useEffect, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { Account, InstallmentPlan } from '../types/database';
import { Plus, X, CreditCard, Edit2 } from 'lucide-react';

const formatMoney = (amount: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(amount);

export function CreditCards() {
  const { user } = useAuth();
  const [cards, setCards] = useState<Account[]>([]);
  const [plans, setPlans] = useState<InstallmentPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedCard, setSelectedCard] = useState<Account | null>(null);
  const [bankAccounts, setBankAccounts] = useState<Account[]>([]);
  const [form, setForm] = useState({
    name: '', institution: '', last_four_digits: '', credit_limit: '',
    billing_close_day: '25', payment_due_day: '10', interest_rate: '',
    linked_account_id: '', color: '#8B5CF6',
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => { if (user) loadData(); }, [user]);

  async function loadData() {
    setLoading(true);
    const [cardsRes, plansRes, banksRes] = await Promise.all([
      supabase.from('accounts').select('*').eq('account_type', 'credit_card').eq('status', 'active').order('created_at'),
      supabase.from('installment_plans').select('*, installments(*)').eq('status', 'active').order('created_at', { ascending: false }),
      supabase.from('accounts').select('*').neq('account_type', 'credit_card').eq('status', 'active'),
    ]);
    if (cardsRes.data) setCards(cardsRes.data);
    if (plansRes.data) setPlans(plansRes.data as any);
    if (banksRes.data) setBankAccounts(banksRes.data);
    setLoading(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const limit = parseFloat(form.credit_limit) || 0;
    
    const payload = {
      name: form.name,
      institution: form.institution || null,
      credit_limit: limit,
      billing_close_day: parseInt(form.billing_close_day) || 25,
      payment_due_day: parseInt(form.payment_due_day) || 10,
      interest_rate: parseFloat(form.interest_rate) || null,
      linked_account_id: form.linked_account_id || null,
      last_four_digits: form.last_four_digits || null,
      color: form.color,
    };

    if (editingId) {
      const { error } = await supabase.from('accounts').update(payload).eq('id', editingId);
      if (!error) {
        setEditingId(null);
        setShowForm(false);
        setForm({ name: '', institution: '', last_four_digits: '', credit_limit: '', billing_close_day: '25', payment_due_day: '10', interest_rate: '', linked_account_id: '', color: '#8B5CF6' });
        loadData();
      }
    } else {
      const { error } = await supabase.from('accounts').insert({
        ...payload,
        user_id: user!.id,
        account_type: 'credit_card',
        currency: 'ARS',
        initial_balance: limit,
        current_balance: limit,
        icon: '💳',
        include_in_total: false,
      });
      if (!error) {
        setShowForm(false);
        setForm({ name: '', institution: '', last_four_digits: '', credit_limit: '', billing_close_day: '25', payment_due_day: '10', interest_rate: '', linked_account_id: '', color: '#8B5CF6' });
        loadData();
      }
    }
  }

  function startEdit(card: Account) {
    setForm({
      name: card.name,
      institution: card.institution || '',
      last_four_digits: card.last_four_digits || '',
      credit_limit: card.credit_limit?.toString() || '',
      billing_close_day: card.billing_close_day?.toString() || '25',
      payment_due_day: card.payment_due_day?.toString() || '10',
      interest_rate: card.interest_rate?.toString() || '',
      linked_account_id: card.linked_account_id || '',
      color: card.color || '#8B5CF6',
    });
    setEditingId(card.id);
    setShowForm(true);
  }

  async function deleteCard(id: string) {
    if (!confirm('¿Eliminar esta tarjeta? Se borrarán los planes de cuotas asociados.')) return;
    await supabase.from('accounts').delete().eq('id', id);
    loadData();
  }

  if (loading) return <div className="spinner" />;

  function getCardUtilization(card: Account) {
    const limit = Number(card.credit_limit) || 0;
    const available = Number(card.current_balance);
    const used = limit - available;
    const pct = limit ? Math.round((used / limit) * 100) : 0;
    return { limit, available, used, pct };
  }

  function getNextDate(day: number) {
    const now = new Date();
    const date = new Date(now.getFullYear(), now.getMonth(), day);
    if (date <= now) date.setMonth(date.getMonth() + 1);
    const diff = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return { date, diff };
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Tarjetas de Crédito</h1>
          <p className="page-subtitle">{cards.length} tarjeta{cards.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          <Plus size={18} /> Nueva
        </button>
      </div>

      {cards.length === 0 ? (
        <div className="empty-state">
          <CreditCard size={64} />
          <h3>Sin tarjetas</h3>
          <p>Agregá tu primera tarjeta de crédito para gestionar cuotas y límites</p>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowForm(true)}>
            <Plus size={18} /> Agregar Tarjeta
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {cards.map(card => {
            const { limit, available, used, pct } = getCardUtilization(card);
            const utilClass = pct > 80 ? 'high' : pct > 50 ? 'medium' : 'low';
            const close = card.billing_close_day ? getNextDate(card.billing_close_day) : null;
            const due = card.payment_due_day ? getNextDate(card.payment_due_day) : null;
            const cardPlans = plans.filter(p => p.credit_card_id === card.id);

            return (
              <div key={card.id} onClick={() => setSelectedCard(selectedCard?.id === card.id ? null : card)} style={{ cursor: 'pointer' }}>
                {/* Credit Card Visual */}
                <div className="credit-card-visual" style={{ background: `linear-gradient(135deg, ${card.color}33, ${card.color}11, var(--bg-card))`, border: `1px solid ${card.color}44` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>{card.institution || 'Tarjeta'}</div>
                      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{card.name}</div>
                    </div>
                    <div className="card-chip" />
                  </div>
                  {card.last_four_digits && (
                    <div className="card-number">•••• •••• •••• {card.last_four_digits}</div>
                  )}
                  <div className="card-bottom">
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>DISPONIBLE</div>
                      <div style={{ fontSize: 20, fontWeight: 700 }}>{formatMoney(available)}</div>
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>💳</div>
                  </div>
                </div>

                {/* Utilization Bar */}
                <div className="card" style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0, marginTop: -1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Utilización: {pct}%</span>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{formatMoney(used)} / {formatMoney(limit)}</span>
                  </div>
                  <div className="utilization-bar">
                    <div className={`utilization-fill ${utilClass}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>

                  {/* Dates */}
                  <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
                    {close && (
                      <div style={{ flex: 1, padding: 12, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Cierre</div>
                        <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>Día {card.billing_close_day}</div>
                        <div style={{ fontSize: 12, color: close.diff <= 3 ? 'var(--warning)' : 'var(--text-muted)' }}>
                          {close.diff === 0 ? 'Hoy' : close.diff === 1 ? 'Mañana' : `En ${close.diff} días`}
                        </div>
                      </div>
                    )}
                    {due && (
                      <div style={{ flex: 1, padding: 12, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Vencimiento</div>
                        <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>Día {card.payment_due_day}</div>
                        <div style={{ fontSize: 12, color: due.diff <= 3 ? 'var(--danger)' : 'var(--text-muted)' }}>
                          {due.diff === 0 ? '¡Hoy!' : due.diff === 1 ? 'Mañana' : `En ${due.diff} días`}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Active Plans */}
                  {selectedCard?.id === card.id && cardPlans.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>Planes de Cuotas Activos</h4>
                      {cardPlans.map(plan => {
                        const paidCount = plan.installments?.filter(i => i.status === 'paid').length || 0;
                        return (
                          <div key={plan.id} style={{ padding: 12, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', marginBottom: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <div style={{ fontWeight: 600, fontSize: 14 }}>{plan.description || 'Compra en cuotas'}</div>
                              <div style={{ fontWeight: 700, fontSize: 14 }}>{formatMoney(plan.installment_amount)}/mes</div>
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                              Cuota {paidCount + 1} de {plan.installment_count} · Total: {formatMoney(plan.total_amount)}
                            </div>
                            <div className="progress-bar" style={{ marginTop: 8, height: 4 }}>
                              <div className="progress-bar-fill green" style={{ width: `${(paidCount / plan.installment_count) * 100}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 12 }}>
                    <button onClick={(e) => { e.stopPropagation(); startEdit(card); }} className="btn btn-ghost btn-sm" style={{ padding: 4 }}>
                      <Edit2 size={16} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); deleteCard(card.id); }} className="btn btn-ghost btn-sm" style={{ padding: 4, color: 'var(--danger)' }}>
                      <X size={16} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Card Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-header">
              <h2 className="modal-title">{editingId ? 'Editar Tarjeta' : 'Nueva Tarjeta'}</h2>
              <button className="modal-close" onClick={() => { setShowForm(false); setEditingId(null); setForm({ name: '', institution: '', last_four_digits: '', credit_limit: '', billing_close_day: '25', payment_due_day: '10', interest_rate: '', linked_account_id: '', color: '#8B5CF6' }); }}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Nombre</label>
                <input className="form-input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Ej: Visa Gold" required />
              </div>
              <div className="form-group">
                <label className="form-label">Banco Emisor</label>
                <input className="form-input" value={form.institution} onChange={e => setForm({...form, institution: e.target.value})} placeholder="Ej: Santander" />
              </div>
              <div className="form-group">
                <label className="form-label">Últimos 4 dígitos</label>
                <input className="form-input" value={form.last_four_digits} onChange={e => setForm({...form, last_four_digits: e.target.value})} placeholder="1234" maxLength={4} />
              </div>
              <div className="form-group">
                <label className="form-label">Límite de Crédito</label>
                <input className="form-input" type="number" inputMode="numeric" value={form.credit_limit} onChange={e => setForm({...form, credit_limit: e.target.value})} placeholder="500000" required />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Día de Cierre</label>
                  <input className="form-input" type="number" min="1" max="31" value={form.billing_close_day} onChange={e => setForm({...form, billing_close_day: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Día de Vencimiento</label>
                  <input className="form-input" type="number" min="1" max="31" value={form.payment_due_day} onChange={e => setForm({...form, payment_due_day: e.target.value})} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Tasa de Interés Anual (%)</label>
                <input className="form-input" type="number" step="0.1" value={form.interest_rate} onChange={e => setForm({...form, interest_rate: e.target.value})} placeholder="Opcional" />
              </div>
              {bankAccounts.length > 0 && (
                <div className="form-group">
                  <label className="form-label">Cuenta para Débito Automático</label>
                  <select className="form-select" value={form.linked_account_id} onChange={e => setForm({...form, linked_account_id: e.target.value})}>
                    <option value="">Sin vincular</option>
                    {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Color</label>
                <input type="color" value={form.color} onChange={e => setForm({...form, color: e.target.value})} style={{ width: 60, height: 40, border: 'none', background: 'none', cursor: 'pointer' }} />
              </div>
              <button type="submit" className="btn btn-primary btn-block btn-lg">
                {editingId ? 'Guardar Cambios' : 'Crear Tarjeta'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
