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
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  const navigateMonth = (direction: number) => {
    let nextMonth = currentMonth + direction;
    let nextYear = currentYear;
    if (nextMonth > 12) { nextMonth = 1; nextYear++; }
    if (nextMonth < 1) { nextMonth = 12; nextYear--; }
    setCurrentMonth(nextMonth);
    setCurrentYear(nextYear);
  };

  useEffect(() => { if (user) loadData(); }, [user]);

  async function loadData() {
    setLoading(true);
    const [cardsRes, plansRes, banksRes, statementsRes] = await Promise.all([
      supabase.from('accounts').select('*').eq('account_type', 'credit_card').eq('status', 'active').order('name'),
      supabase.from('installment_plans').select('*, installments(*)').order('created_at', { ascending: false }),
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

  const openStatementForm = (card: Account) => {
    setStatementForm(prev => ({
      ...prev,
      statement_month: `${currentYear}-${currentMonth.toString().padStart(2, '0')}`
    }));
    setSelectedCard(card);
    setShowStatementForm(true);
  };

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 12 }}>
        <div>
          <h1 className="page-title">Tarjetas de Crédito</h1>
          <p className="page-subtitle">{cards.length} tarjeta{cards.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          <Plus size={18} /> Nueva
        </button>
      </div>

      {/* Month Navigator */}
      <div className="card" style={{ padding: '8px 16px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button className="btn btn-ghost btn-icon" onClick={() => navigateMonth(-1)} style={{ width: 32, height: 32 }}>
          <Edit2 size={16} style={{ transform: 'rotate(180deg)' }} />
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 700, textTransform: 'capitalize' }}>
            {new Date(currentYear, currentMonth - 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}
          </div>
        </div>
        <button className="btn btn-ghost btn-icon" onClick={() => navigateMonth(1)} style={{ width: 32, height: 32 }}>
          <Edit2 size={16} />
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {cards.map(card => {
            const { limit, available, used, pct } = getCardUtilization(card);
            const utilClass = pct > 80 ? 'high' : pct > 50 ? 'medium' : 'low';
            
            // Filter installments for the selected month
            const selectedMonthStr = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-01`;
            const cardInstallments = plans
              .filter(p => p.credit_card_id === card.id)
              .flatMap(p => (p.installments || []).filter(i => i.due_month === selectedMonthStr))
              .sort((a, b) => a.installment_number - b.installment_number);
            
            const cardMonthlyTotal = cardInstallments.reduce((sum, i) => sum + Number(i.amount), 0);
            
            // Find statement for selected month
            const statement = statements.find(s => s.credit_card_id === card.id && s.statement_month === selectedMonthStr);

            return (
              <div key={card.id} className="card" style={{ padding: 12 }}>
                {/* Compact Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 20, borderRadius: 3, background: `linear-gradient(135deg, ${card.color}, ${card.color}dd)`, border: '1px solid rgba(255,255,255,0.1)' }} />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{card.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{card.institution}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{formatMoney(available)}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>DISPONIBLE</div>
                  </div>
                </div>

                {/* Dates & Statements */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                  <div style={{ padding: '6px 10px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600 }}>CIERRE</div>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>
                      {statement ? new Date(statement.close_date).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }) : '---'}
                    </div>
                  </div>
                  <div style={{ padding: '6px 10px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600 }}>VENCIMIENTO</div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: statement && statement.status !== 'paid' ? 'var(--danger)' : 'inherit' }}>
                      {statement ? new Date(statement.due_date).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }) : '---'}
                    </div>
                  </div>
                </div>

                {!statement && (
                  <button onClick={(e) => { e.stopPropagation(); openStatementForm(card); }} className="btn btn-ghost btn-block" style={{ height: 32, minHeight: 32, fontSize: 11, marginBottom: 12, border: '1px dashed var(--border-strong)' }}>
                    <Plus size={12} /> Configurar fechas del mes
                  </button>
                )}

                {/* Installment List (Compact) */}
                {cardInstallments.length > 0 ? (
                  <div style={{ background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', padding: 8, marginTop: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', borderBottom: '1px solid var(--border-subtle)', marginBottom: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>CUOTAS DEL MES</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>MONTO</span>
                    </div>
                    {cardInstallments.map(inst => {
                      const plan = plans.find(p => p.id === inst.installment_plan_id);
                      return (
                        <div key={inst.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', fontSize: 12.5 }}>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: 450 }}>{plan?.description}</span>
                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Cuota {inst.installment_number} de {plan?.installment_count}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontWeight: 600 }}>{formatMoney(Number(inst.amount))}</span>
                            {inst.status === 'paid' && <CheckCircle size={12} color="var(--success)" />}
                          </div>
                        </div>
                      );
                    })}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 8px 4px', borderTop: '1px solid var(--border-subtle)', marginTop: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 700 }}>SUBTOTAL TARJETA</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary-500)' }}>{formatMoney(cardMonthlyTotal)}</span>
                    </div>
                    {statement && statement.status !== 'paid' && (
                      <button onClick={(e) => { e.stopPropagation(); setSelectedCard(card); handleRegisterPayment(statement); }} className="btn btn-primary btn-block" style={{ height: 32, minHeight: 32, fontSize: 12, marginTop: 8 }}>
                        Pagar Resumen
                      </button>
                    )}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '12px', fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)' }}>
                    No hay cuotas para este mes
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 12 }}>
                  <button onClick={(e) => { e.stopPropagation(); navigate(`/transactions?account=${card.id}`); }} className="btn btn-ghost btn-xs" style={{ fontSize: 11 }}>
                    Movimientos
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); startEdit(card); }} className="btn btn-ghost btn-xs">
                    <Edit2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}

          {/* Monthly Grand Total */}
          <div className="card" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--primary-500)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>TOTAL CUOTAS DEL MES</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--primary-400)' }}>
                  {formatMoney(cards.reduce((sum, card) => {
                    const selectedMonthStr = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-01`;
                    return sum + plans
                      .filter(p => p.credit_card_id === card.id)
                      .flatMap(p => (p.installments || []).filter(i => i.due_month === selectedMonthStr))
                      .reduce((s, i) => s + Number(i.amount), 0);
                  }, 0))}
                </div>
              </div>
              <CreditCard size={32} color="var(--primary-500)" style={{ opacity: 0.5 }} />
            </div>
          </div>
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
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, padding: '0 4px' }}>
               Configurá los valores base. Podrás ajustar las fechas exactas de cada mes usando el botón "Configurar fechas" en la vista principal.
            </p>
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
              <h2 className="modal-title">Configurar Fechas - {selectedCard.name}</h2>
              <button className="modal-close" onClick={() => setShowStatementForm(false)}><X size={18} /></button>
            </div>
            <div style={{ padding: '0 4px 16px', fontSize: 12, color: 'var(--text-secondary)' }}>
              Estás configurando el ciclo para <b>{new Date(currentYear, currentMonth - 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}</b>.
            </div>
            <form onSubmit={handleSaveStatement}>
              <div className="form-group" style={{ display: 'none' }}>
                <label className="form-label">Mes del Resumen</label>
                <input className="form-input" type="month" value={statementForm.statement_month} readOnly />
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
