import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { Account, Category } from '../types/database';
import { ArrowLeft, CreditCard } from 'lucide-react';

const formatMoney = (amount: number, currency = 'ARS') => new Intl.NumberFormat('es-AR', { style: 'currency', currency, minimumFractionDigits: 0 }).format(amount);

const INSTALLMENT_OPTIONS = [1, 3, 6, 12, 18, 24];

export function NewTransaction() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [creditCards, setCreditCards] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    type: 'expense' as 'expense' | 'income' | 'transfer',
    amount: '',
    account_id: '',
    category_id: '',
    description: '',
    transaction_date: new Date().toISOString().split('T')[0],
    payment_method: 'debit' as 'cash' | 'debit' | 'credit' | 'transfer',
    to_account_id: '',
    // Installment fields
    credit_card_id: '',
    installment_count: 1,
    has_interest: false,
    interest_rate: '',
  });

  useEffect(() => { if (user) loadData(); }, [user]);

  async function loadData() {
    setLoading(true);
    const [accsRes, catsRes] = await Promise.all([
      supabase.from('accounts').select('*').eq('status', 'active').order('created_at'),
      supabase.from('categories').select('*').order('name'),
    ]);
    if (accsRes.data) {
      const all = accsRes.data as Account[];
      setAccounts(all.filter(a => a.account_type !== 'credit_card'));
      setCreditCards(all.filter(a => a.account_type === 'credit_card'));
      // Auto-select first account (prefer bank/cash for source)
      const firstSource = all.find(a => a.account_type !== 'credit_card') || all[0];
      if (firstSource) setForm(f => ({ ...f, account_id: firstSource.id }));
    }
    if (catsRes.data) setCategories(catsRes.data);
    setLoading(false);
  }

  const filteredCategories = categories.filter(c =>
    form.type === 'transfer' ? false : c.type === form.type || c.type === 'both'
  );

  const isCreditCard = form.payment_method === 'credit';
  const selectedCard = creditCards.find(c => c.id === form.credit_card_id);
  const selectedAccount = accounts.find(a => a.id === form.account_id) || selectedCard;
  const currency = selectedAccount?.currency || 'ARS';
  const amount = parseFloat(form.amount) || 0;
  const rate = parseFloat(form.interest_rate) || 0;

  // Calculate installment preview
  let installmentAmount = 0;
  let financingCost = 0;
  if (isCreditCard && amount > 0 && form.installment_count > 0) {
    if (form.has_interest && rate > 0) {
      const monthlyRate = rate / 100 / 12;
      const totalWithInterest = amount * Math.pow(1 + monthlyRate, form.installment_count);
      installmentAmount = Math.ceil(totalWithInterest / form.installment_count);
      financingCost = installmentAmount * form.installment_count - amount;
    } else {
      installmentAmount = Math.ceil(amount / form.installment_count);
      financingCost = 0;
    }
  }

  function getFirstInstallmentMonth() {
    const now = new Date();
    if (selectedCard?.billing_close_day) {
      const closeDay = selectedCard.billing_close_day;
      const txDay = new Date(form.transaction_date).getDate();
      if (txDay > closeDay) {
        // After close: first installment is month+2
        return new Date(now.getFullYear(), now.getMonth() + 2, 1);
      }
    }
    // Before close: first installment is next month
    return new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!amount || !form.account_id) return;
    setSaving(true);

    try {
      const accountId = isCreditCard ? form.credit_card_id : form.account_id;

      if (isCreditCard && form.installment_count > 1) {
        // Create installment purchase
        const firstMonth = getFirstInstallmentMonth();

        // 1. Create installment plan first (without transaction_id)
        const { data: planData, error: planError } = await supabase.from('installment_plans').insert({
          user_id: user!.id,
          credit_card_id: form.credit_card_id,
          total_amount: amount,
          installment_count: form.installment_count,
          installment_amount: installmentAmount,
          interest_rate: form.has_interest ? rate : 0,
          financing_cost: financingCost,
          first_installment_month: firstMonth.toISOString().split('T')[0],
          description: form.description,
          category_id: form.category_id || null,
          status: 'active',
        }).select().single();

        if (planError) throw planError;

        // 2. Create N individual installments
        const installments = [];
        for (let i = 0; i < form.installment_count; i++) {
          const dueMonth = new Date(firstMonth.getFullYear(), firstMonth.getMonth() + i, 1);
          installments.push({
            installment_plan_id: planData.id,
            installment_number: i + 1,
            amount: installmentAmount,
            due_month: dueMonth.toISOString().split('T')[0],
            status: 'pending',
          });
        }

        const { error: instError } = await supabase.from('installments').insert(installments);
        if (instError) throw instError;

        // 3. Create main transaction
        const { data: txData, error: txError } = await supabase.from('transactions').insert({
          user_id: user!.id,
          account_id: accountId,
          type: 'expense',
          amount: amount,
          category_id: form.category_id || null,
          description: form.description,
          transaction_date: form.transaction_date,
          payment_method: 'credit',
          is_installment_purchase: true,
          installment_plan_id: planData.id,
        }).select().single();

        if (txError) throw txError;

        // 4. Link transaction to plan
        await supabase.from('installment_plans').update({ transaction_id: txData.id }).eq('id', planData.id);

        // 5. Update credit card available credit
        await supabase.from('accounts').update({
          current_balance: Number(selectedCard!.current_balance) - amount,
        }).eq('id', form.credit_card_id);

      } else {
        // Simple transaction (no installments)
        const { error } = await supabase.from('transactions').insert({
          user_id: user!.id,
          account_id: accountId,
          type: form.type,
          amount: amount,
          category_id: form.type !== 'transfer' ? (form.category_id || null) : null,
          description: form.description,
          transaction_date: form.transaction_date,
          payment_method: form.type === 'transfer' ? 'transfer' : form.payment_method,
          to_account_id: form.type === 'transfer' ? form.to_account_id || null : null,
          is_installment_purchase: false,
        });
        if (error) throw error;
      }

      navigate(-1);
    } catch (err) {
      console.error('Error creating transaction:', err);
      alert('Error al crear la transacción');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="spinner" />;

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost" onClick={() => navigate(-1)} style={{ padding: 8, minHeight: 'auto' }}>
            <ArrowLeft size={22} />
          </button>
          <h1 className="page-title">Nueva Transacción</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Type selector */}
        <div className="tabs" style={{ marginBottom: 24 }}>
          <button type="button" className={`tab ${form.type === 'expense' ? 'active' : ''}`} onClick={() => setForm({ ...form, type: 'expense', payment_method: 'debit' })}>
            Gasto
          </button>
          <button type="button" className={`tab ${form.type === 'income' ? 'active' : ''}`} onClick={() => setForm({ ...form, type: 'income', payment_method: 'debit' })}>
            Ingreso
          </button>
          <button type="button" className={`tab ${form.type === 'transfer' ? 'active' : ''}`} onClick={() => setForm({ ...form, type: 'transfer', payment_method: 'transfer' })}>
            Transferencia
          </button>
        </div>

        {/* Amount */}
        <div className="form-group" style={{ marginBottom: 24 }}>
          <label className="form-label">Monto</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)', fontSize: 20, fontWeight: 500, color: 'var(--text-muted)' }}>
                {new Intl.NumberFormat('es-AR', { style: 'currency', currency, minimumFractionDigits: 0 }).format(0).replace(/\d/g, '').trim()}
              </span>
              <input
                className="form-input"
                type="number"
                inputMode="decimal"
                step="0.01"
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
                placeholder="0"
                required
                autoFocus
                style={{ fontSize: 20, fontWeight: 500, padding: '16px 20px 16px 45px', textAlign: 'left' }}
              />
            </div>
        </div>

        {/* Payment Method */}
        {form.type === 'expense' && (
          <div className="form-group">
            <label className="form-label">Método de Pago</label>
            <div className="tabs">
              <button type="button" className={`tab ${form.payment_method === 'cash' ? 'active' : ''}`} onClick={() => setForm({ ...form, payment_method: 'cash' })}>
                💵 Efectivo
              </button>
              <button type="button" className={`tab ${form.payment_method === 'debit' ? 'active' : ''}`} onClick={() => setForm({ ...form, payment_method: 'debit' })}>
                Débito
              </button>
              <button type="button" className={`tab ${form.payment_method === 'credit' ? 'active' : ''}`} onClick={() => setForm({ ...form, payment_method: 'credit' })}>
                Crédito
              </button>
            </div>
          </div>
        )}

        {/* Account Selector */}
        {!isCreditCard && (
          <div className="form-group">
            <label className="form-label">Cuenta</label>
            <select className="form-select" value={form.account_id} onChange={e => setForm({ ...form, account_id: e.target.value })} required>
              <option value="">Seleccionar cuenta</option>
              {form.type === 'transfer' ? (
                // For transfers, can include CC as source (for paying merchants in advance)
                [...accounts, ...creditCards].map(a => (
                  <option key={a.id} value={a.id}>{a.name} ({formatMoney(Number(a.current_balance))})</option>
                ))
              ) : (
                accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name} ({formatMoney(Number(a.current_balance), a.currency)})</option>
                ))
              )}
            </select>
          </div>
        )}

        {/* Transfer destination */}
        {form.type === 'transfer' && (
          <div className="form-group">
            <label className="form-label">Cuenta Destino</label>
            <select className="form-select" value={form.to_account_id} onChange={e => setForm({ ...form, to_account_id: e.target.value })} required>
              <option value="">Seleccionar destino</option>
              {([...accounts, ...creditCards]).filter(a => a.id !== form.account_id).map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Credit Card Section */}
        {isCreditCard && (
          <>
            <div className="form-group">
              <label className="form-label">Tarjeta de Crédito</label>
              {creditCards.length === 0 ? (
                <div className="auth-error">No tenés tarjetas de crédito registradas. Creá una primero.</div>
              ) : (
                <select className="form-select" value={form.credit_card_id} onChange={e => setForm({ ...form, credit_card_id: e.target.value })} required>
                  <option value="">Seleccionar tarjeta</option>
                  {creditCards.map(c => (
                    <option key={c.id} value={c.id}>💳 {c.name} (Disp: {formatMoney(Number(c.current_balance), c.currency)})</option>
                  ))}
                </select>
              )}
            </div>

            {/* Installment Count */}
            <div className="form-group">
              <label className="form-label">Cuotas</label>
              <div className="installment-options">
                {INSTALLMENT_OPTIONS.map(n => (
                  <button
                    key={n}
                    type="button"
                    className={`installment-option ${form.installment_count === n ? 'selected' : ''}`}
                    onClick={() => setForm({ ...form, installment_count: n })}
                  >
                    {n === 1 ? '1 pago' : `${n} cuotas`}
                  </button>
                ))}
              </div>
            </div>

            {/* Interest toggle */}
            {form.installment_count > 1 && (
              <div className="form-group">
                <div className="tabs" style={{ maxWidth: 300 }}>
                  <button type="button" className={`tab ${!form.has_interest ? 'active' : ''}`} onClick={() => setForm({ ...form, has_interest: false })}>
                    Sin Interés
                  </button>
                  <button type="button" className={`tab ${form.has_interest ? 'active' : ''}`} onClick={() => setForm({ ...form, has_interest: true })}>
                    Con Interés
                  </button>
                </div>
              </div>
            )}

            {/* Interest Rate */}
            {form.has_interest && form.installment_count > 1 && (
              <div className="form-group">
                <label className="form-label">Tasa de Interés Anual (%)</label>
                <input
                  className="form-input"
                  type="number"
                  step="0.1"
                  value={form.interest_rate}
                  onChange={e => setForm({ ...form, interest_rate: e.target.value })}
                  placeholder="Ej: 120"
                />
              </div>
            )}

            {/* Installment Preview */}
            {amount > 0 && form.installment_count > 1 && form.credit_card_id && (
              <div className="installment-preview">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <CreditCard size={18} color="var(--primary-400)" />
                  <span style={{ fontWeight: 700, fontSize: 15 }}>Detalle de Cuotas</span>
                </div>
                <div className="installment-preview-row">
                  <span className="label">Total de la compra</span>
                  <span className="value">{formatMoney(amount)}</span>
                </div>
                <div className="installment-preview-row">
                  <span className="label">{form.installment_count} cuotas de</span>
                  <span className="value" style={{ color: 'var(--primary-400)', fontSize: 18 }}>{formatMoney(installmentAmount)}</span>
                </div>
                {financingCost > 0 && (
                  <div className="installment-preview-row">
                    <span className="label">Costo financiero</span>
                    <span className="value" style={{ color: 'var(--warning)' }}>{formatMoney(financingCost)}</span>
                  </div>
                )}
                <div className="installment-preview-row" style={{ borderTop: '1px solid var(--border-subtle)', marginTop: 8, paddingTop: 8 }}>
                  <span className="label">Primer cuota</span>
                  <span className="value">{getFirstInstallmentMonth().toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}</span>
                </div>
                <div className="installment-preview-row">
                  <span className="label">Última cuota</span>
                  <span className="value">
                    {(() => {
                      const first = getFirstInstallmentMonth();
                      const last = new Date(first.getFullYear(), first.getMonth() + form.installment_count - 1, 1);
                      return last.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
                    })()}
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        {/* Category */}
        {form.type !== 'transfer' && (
          <div className="form-group">
            <label className="form-label">Categoría</label>
            <select className="form-select" value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}>
              <option value="">Sin categoría</option>
              {filteredCategories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Description */}
        <div className="form-group">
          <label className="form-label">Descripción</label>
          <input className="form-input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="¿En qué gastaste?" />
        </div>

        {/* Date */}
        <div className="form-group">
          <label className="form-label">Fecha</label>
          <input className="form-input" type="date" value={form.transaction_date} onChange={e => setForm({ ...form, transaction_date: e.target.value })} />
        </div>

        {/* Submit */}
        <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={saving || !amount} style={{ marginTop: 16 }}>
          {saving ? 'Guardando...' : form.type === 'income' ? 'Registrar Ingreso' : form.type === 'transfer' ? 'Registrar Transferencia' : 'Registrar Gasto'}
        </button>
      </form>
    </div>
  );
}
