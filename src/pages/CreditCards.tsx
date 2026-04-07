import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { Account, InstallmentPlan, CreditCardStatement } from '../types/database';
import { Plus, X, CreditCard, Edit2, ArrowRightLeft, CheckCircle } from 'lucide-react';

const formatMoney = (amount: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(amount);

export function CreditCards() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cards, setCards] = useState<Account[]>([]);
  const [plans, setPlans] = useState<InstallmentPlan[]>([]);
  const [statements, setStatements] = useState<CreditCardStatement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showStatementForm, setShowStatementForm] = useState(false);
  const [selectedCard, setSelectedCard] = useState<Account | null>(null);
  const [bankAccounts, setBankAccounts] = useState<Account[]>([]);
  const [form, setForm] = useState({
    name: '', institution: '', last_four_digits: '', credit_limit: '',
    billing_close_day: '25', payment_due_day: '10', interest_rate: '',
    linked_account_id: '', color: '#8B5CF6',
  });
  const [statementForm, setStatementForm] = useState({
    statement_month: new Date().toISOString().slice(0, 7), // YYYY-MM
    close_date: '',
    due_date: '',
    total_amount: '',
    minimum_payment: '',
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => { if (user) loadData(); }, [user]);

  async function loadData() {
    setLoading(true);
    const [cardsRes, plansRes, banksRes, statementsRes] = await Promise.all([
      supabase.from('accounts').select('*').eq('account_type', 'credit_card').eq('status', 'active').order('name'),
      supabase.from('installment_plans').select('*, installments(*)').eq('status', 'active').order('created_at', { ascending: false }),
      supabase.from('accounts').select('*').neq('account_type', 'credit_card').eq('status', 'active').order('name'),
      supabase.from('credit_card_statements').select('*').order('statement_month', { ascending: false }),
    ]);
    if (cardsRes.data) setCards(cardsRes.data);
    if (plansRes.data) setPlans(plansRes.data as any);
    if (banksRes.data) setBankAccounts(banksRes.data);
    if (statementsRes.data) setStatements(statementsRes.data);
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
        icon: '',
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

  async function handleSaveStatement(e: FormEvent) {
    e.preventDefault();
    if (!selectedCard) return;

    const { error } = await supabase.from('credit_card_statements').insert({
      credit_card_id: selectedCard.id,
      statement_month: `${statementForm.statement_month}-01`,
      close_date: statementForm.close_date,
      due_date: statementForm.due_date,
      total_amount: parseFloat(statementForm.total_amount) || 0,
      minimum_payment: parseFloat(statementForm.minimum_payment) || 0,
      status: 'open',
    });

    if (!error) {
      setShowStatementForm(false);
      setStatementForm({
        statement_month: new Date().toISOString().slice(0, 7),
        close_date: '',
        due_date: '',
        total_amount: '',
        minimum_payment: '',
      });
      loadData();
    }
  }

  async function handleRegisterPayment(statement: CreditCardStatement) {
    if (!selectedCard) return;
    const amount = prompt('Monto a pagar (ars):', statement.total_amount.toString());
    if (!amount) return;
    
    const paidAmount = parseFloat(amount);
    if (isNaN(paidAmount)) return;

    const sourceAccountId = selectedCard.linked_account_id || bankAccounts[0]?.id;
    if (!sourceAccountId) {
      alert('Debes vincular una cuenta para realizar el pago.');
      return;
    }

    setLoading(true);

    // 1. Create transfer transaction
    const { error: txError } = await supabase.from('transactions').insert({
      user_id: user!.id,
      account_id: sourceAccountId,
      to_account_id: selectedCard.id,
      type: 'transfer',
      amount: paidAmount,
      description: `Pago Tarjeta: ${selectedCard.name} (${statement.statement_month.slice(0, 7)})`,
      transaction_date: new Date().toISOString().split('T')[0],
      payment_method: 'transfer',
    });

    if (txError) {
      alert('Error al registrar el pago');
      setLoading(false);
      return;
    }

    // 2. Update statement status
    const newStatus = paidAmount >= statement.total_amount ? 'paid' : 'partial';
    await supabase.from('credit_card_statements').update({
      status: newStatus,
      paid_amount: (statement.paid_amount || 0) + paidAmount,
      paid_date: new Date().toISOString().split('T')[0],
    }).eq('id', statement.id);

    // 3. Mark installments as paid if full payment
    if (newStatus === 'paid') {
      const startOfMonth = statement.statement_month;
      // Find installments for this card and this month
      const { data: insts } = await supabase.from('installments')
        .select('id, installment_plan_id')
        .eq('due_month', startOfMonth)
        .eq('status', 'pending');
      
      if (insts && insts.length > 0) {
        // Filter those belonging to this card
        const cardPlanIds = plans.filter(p => p.credit_card_id === selectedCard.id).map(p => p.id);
        const targetInstIds = insts.filter(i => cardPlanIds.includes(i.installment_plan_id)).map(i => i.id);
        
        if (targetInstIds.length > 0) {
          await supabase.from('installments').update({ status: 'paid', paid_date: new Date().toISOString().split('T')[0] }).in('id', targetInstIds);
        }
      }
    }

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
            const cardPlans = plans.filter(p => p.credit_card_id === card.id);

            return (
              <div key={card.id} onClick={() => setSelectedCard(selectedCard?.id === card.id ? null : card)} style={{ cursor: 'pointer' }}>
                {/* Credit Card Visual */}
                <div className="credit-card-visual" style={{ background: `linear-gradient(135deg, ${card.color}33, ${card.color}11, var(--bg-card))`, border: `1px solid ${card.color}44` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>{card.institution || 'Tarjeta'}</div>
                      <div style={{ fontSize: 17, fontWeight: 500, marginTop: 4 }}>{card.name}</div>
                    </div>
                  </div>
                  {card.last_four_digits && (
                    <div className="card-number">•••• •••• •••• {card.last_four_digits}</div>
                  )}
                  <div className="card-bottom">
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>DISPONIBLE</div>
                      <div style={{ fontSize: 18, fontWeight: 500 }}>{formatMoney(available)}</div>
                    </div>
                  </div>
                </div>

                {/* Utilization Bar */}
                <div className="card" style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0, marginTop: -1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 400 }}>Utilización: {pct}%</span>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 400 }}>{formatMoney(used)} / {formatMoney(limit)}</span>
                  </div>
                  <div className="utilization-bar">
                    <div className={`utilization-fill ${utilClass}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>

                  {/* Dates */}
                  <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
                    {(() => {
                      const latestStatement = statements.filter(s => s.credit_card_id === card.id).sort((a, b) => b.statement_month.localeCompare(a.statement_month))[0];
                      
                      const closeDate = latestStatement ? new Date(latestStatement.close_date) : (card.billing_close_day ? getNextDate(card.billing_close_day).date : null);
                      const dueDate = latestStatement ? new Date(latestStatement.due_date) : (card.payment_due_day ? getNextDate(card.payment_due_day).date : null);
                      
                      const closeDiff = closeDate ? Math.ceil((closeDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null;
                      const dueDiff = dueDate ? Math.ceil((dueDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null;

                      return (
                        <>
                          <div style={{ flex: 1, padding: 12, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase' }}>Cierre</div>
                              {latestStatement && <div className={`badge ${latestStatement.status === 'paid' ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: 8 }}>{latestStatement.status}</div>}
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 600 }}>
                              {closeDate ? closeDate.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }) : 'N/A'}
                            </div>
                            {closeDiff !== null && (
                              <div style={{ fontSize: 11, color: closeDiff <= 3 && closeDiff >= 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
                                {closeDiff < 0 ? 'Cerrado' : closeDiff === 0 ? 'Hoy' : closeDiff === 1 ? 'Mañana' : `En ${closeDiff} días`}
                              </div>
                            )}
                          </div>
                          <div style={{ flex: 1, padding: 12, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase' }}>Vencimiento</div>
                              {latestStatement && latestStatement.status === 'paid' && <CheckCircle size={10} color="var(--success)" />}
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 600 }}>
                              {dueDate ? dueDate.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }) : 'N/A'}
                            </div>
                            {dueDiff !== null && (
                              <div style={{ fontSize: 11, color: dueDiff <= 3 && dueDiff >= 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                                {latestStatement?.status === 'paid' ? 'Pagado' : (dueDiff < 0 ? 'Vencido' : dueDiff === 0 ? '¡Hoy!' : dueDiff === 1 ? 'Mañana' : `En ${dueDiff} días`)}
                              </div>
                            )}
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {/* Statements & Active Plans */}
                  {selectedCard?.id === card.id && (
                    <div style={{ marginTop: 16 }}>
                      {/* Statements Section */}
                      <div style={{ marginBottom: 20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                          <h4 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', margin: 0 }}>Resúmenes Recientes</h4>
                          <button onClick={(e) => { e.stopPropagation(); setShowStatementForm(true); }} className="btn btn-ghost btn-xs" style={{ color: 'var(--primary-500)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Plus size={14} /> Nuevo
                          </button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {statements.filter(s => s.credit_card_id === card.id).slice(0, 3).map(s => (
                            <div key={s.id} style={{ padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 500 }}>{new Date(s.statement_month).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}</div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Vence: {new Date(s.due_date).toLocaleDateString('es-AR')}</div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 13, fontWeight: 600 }}>{formatMoney(s.total_amount)}</div>
                                {s.status !== 'paid' ? (
                                  <button onClick={(e) => { e.stopPropagation(); handleRegisterPayment(s); }} className="btn btn-ghost btn-xs" style={{ padding: '2px 4px', fontSize: 9, color: 'var(--primary-500)' }}>
                                    Pagar Total
                                  </button>
                                ) : (
                                  <div style={{ fontSize: 9, color: 'var(--success)', fontWeight: 600 }}>PAGADO</div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>Planes de Cuotas Activos</h4>
                      {cardPlans.map(plan => {
                        const paidCount = plan.installments?.filter(i => i.status === 'paid').length || 0;
                        return (
                          <div key={plan.id} style={{ padding: 12, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', marginBottom: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <div style={{ fontWeight: 500, fontSize: 14 }}>{plan.description || 'Compra en cuotas'}</div>
                              <div style={{ fontWeight: 600, fontSize: 14 }}>{formatMoney(plan.installment_amount)}/mes</div>
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
                    <button onClick={(e) => { e.stopPropagation(); navigate(`/transactions?account=${card.id}`); }} className="btn btn-ghost btn-sm" style={{ padding: '4px 8px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <ArrowRightLeft size={14} /> Movimientos
                    </button>
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

      {/* New Statement Modal */}
      {showStatementForm && selectedCard && (
        <div className="modal-overlay" onClick={() => setShowStatementForm(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-header">
              <h2 className="modal-title">Nuevo Resumen - {selectedCard.name}</h2>
              <button className="modal-close" onClick={() => setShowStatementForm(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSaveStatement}>
              <div className="form-group">
                <label className="form-label">Mes del Resumen</label>
                <input className="form-input" type="month" value={statementForm.statement_month} onChange={e => setStatementForm({...statementForm, statement_month: e.target.value})} required />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Fecha de Cierre</label>
                  <input className="form-input" type="date" value={statementForm.close_date} onChange={e => setStatementForm({...statementForm, close_date: e.target.value})} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Fecha de Vencimiento</label>
                  <input className="form-input" type="date" value={statementForm.due_date} onChange={e => setStatementForm({...statementForm, due_date: e.target.value})} required />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Monto Total</label>
                <input className="form-input" type="number" step="0.01" value={statementForm.total_amount} onChange={e => setStatementForm({...statementForm, total_amount: e.target.value})} placeholder="0.00" required />
              </div>
              <div className="form-group">
                <label className="form-label">Pago Mínimo</label>
                <input className="form-input" type="number" step="0.01" value={statementForm.minimum_payment} onChange={e => setStatementForm({...statementForm, minimum_payment: e.target.value})} placeholder="0.00" />
              </div>
              <button type="submit" className="btn btn-primary btn-block btn-lg">Guardar Resumen</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
