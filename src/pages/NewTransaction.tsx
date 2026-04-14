import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { Account, Category, CreditCardStatement } from '../types/database';
import { ArrowLeft, CreditCard, Calendar, MessageSquare, ChevronDown } from 'lucide-react';
import { CompactSelector } from '../components/CompactSelector';

const formatMoney = (amount: number, currency = 'ARS') => new Intl.NumberFormat('es-AR', { style: 'currency', currency, minimumFractionDigits: 0 }).format(amount);

const INSTALLMENT_OPTIONS = [1, 2, 3, 5, 6, 9, 12, 18, 24];

export function NewTransaction() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [creditCards, setCreditCards] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [statements, setStatements] = useState<CreditCardStatement[]>([]);
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

  // Synchronize credit_card_id for transfers from credit cards
  useEffect(() => {
    if (form.type === 'transfer') {
      const isCC = creditCards.some(c => c.id === form.account_id);
      if (isCC) {
        setForm(f => ({ ...f, credit_card_id: f.account_id }));
      } else {
        setForm(f => ({ ...f, credit_card_id: '' }));
      }
    }
  }, [form.account_id, form.type, creditCards]);

  async function loadData() {
    setLoading(true);
    const [accsRes, catsRes, statementsRes] = await Promise.all([
      supabase.from('accounts').select('*').eq('status', 'active').order('created_at'),
      supabase.from('categories').select('*').order('name'),
      supabase.from('credit_card_statements').select('*').order('statement_month', { ascending: false }),
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
    if (statementsRes.data) setStatements(statementsRes.data);
    setLoading(false);
  }

  const filteredCategories = categories.filter(c =>
    form.type === 'transfer' ? false : c.type === form.type || c.type === 'both'
  );

  const isCreditCard = form.payment_method === 'credit' || (form.type === 'transfer' && creditCards.some(c => c.id === form.account_id));
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
    const txDate = new Date(form.transaction_date);
    
    // Check if we have a statement for this card
    const cardStatements = statements.filter(s => s.credit_card_id === form.credit_card_id);
    
    // Find the statement that covers this transaction date or is the next one
    const activeStatement = cardStatements
      .sort((a, b) => a.close_date.localeCompare(b.close_date))
      .find(s => new Date(s.close_date) >= txDate);

    if (activeStatement) {
      // Use the statement_month as the first installment month
      const [y, m] = activeStatement.statement_month.split('-').map(Number);
      return new Date(y, m - 1, 1);
    }

    // Fallback to legacy logic
    if (selectedCard?.billing_close_day) {
      const closeDay = selectedCard.billing_close_day;
      const txDay = txDate.getDate();
      if (txDay > closeDay) {
        return new Date(txDate.getFullYear(), txDate.getMonth() + 2, 1);
      }
    }
    return new Date(txDate.getFullYear(), txDate.getMonth() + 1, 1);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!amount || !form.account_id) return;
    setSaving(true);

    try {
      const accountId = isCreditCard ? form.credit_card_id : form.account_id;

      if (isCreditCard) {
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
          type: form.type,
          amount: amount,
          category_id: form.type !== 'transfer' ? (form.category_id || null) : null,
          description: form.description,
          transaction_date: form.transaction_date,
          payment_method: form.type === 'transfer' ? 'transfer' : 'credit',
          to_account_id: form.type === 'transfer' ? form.to_account_id : null,
          is_installment_purchase: true,
          installment_plan_id: planData.id,
        }).select().single();

        if (txError) throw txError;

        // 4. Link transaction to plan
        await supabase.from('installment_plans').update({ transaction_id: txData.id }).eq('id', planData.id);

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
        <div className="tabs" style={{ marginBottom: 12 }}>
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Amount */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Monto</label>
            <div style={{ position: 'relative' }}>
              <span className="amount-currency">
                {new Intl.NumberFormat('es-AR', { style: 'currency', currency, minimumFractionDigits: 0 }).format(0).replace(/\d/g, '').trim()}
              </span>
              <input
                className="form-input amount-input"
                type="number"
                inputMode="decimal"
                step="0.01"
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
                placeholder="0"
                required
                autoFocus
              />
            </div>
          </div>

          {/* Payment Method Selector for Expenses */}
          {form.type === 'expense' && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Método de Pago</label>
              <div className="tabs" style={{ padding: 2 }}>
                <button type="button" className={`tab ${form.payment_method === 'cash' ? 'active' : ''}`} onClick={() => setForm({ ...form, payment_method: 'cash' })}>
                  Efectivo
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

          {/* Account / Card Selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {form.type === 'transfer' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <CompactSelector
                  label="Desde"
                  options={[...accounts, ...creditCards]}
                  selectedId={form.account_id}
                  onChange={id => setForm({ ...form, account_id: id })}
                />
                <CompactSelector
                  label="Hacia"
                  options={([...accounts, ...creditCards]).filter(a => a.id !== form.account_id)}
                  selectedId={form.to_account_id}
                  onChange={id => setForm({ ...form, to_account_id: id })}
                />
              </div>
            ) : isCreditCard ? (
              <CompactSelector
                label="Tarjeta de Crédito"
                options={creditCards}
                selectedId={form.credit_card_id}
                onChange={id => setForm({ ...form, credit_card_id: id })}
                placeholder="Seleccionar tarjeta..."
              />
            ) : (
              <CompactSelector
                label={form.type === 'income' ? 'Cuenta de Destino' : 'Cuenta'}
                options={accounts}
                selectedId={form.account_id}
                onChange={id => setForm({ ...form, account_id: id })}
                placeholder="Seleccionar cuenta..."
              />
            )}
          </div>

          {/* Credit Card Installments */}
          {isCreditCard && (
            <div style={{ marginTop: -4 }}>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label">Cuotas</label>
                <div className="installment-options">
                  {INSTALLMENT_OPTIONS.map(n => (
                    <button
                      key={n}
                      type="button"
                      className={`installment-option ${form.installment_count === n ? 'selected' : ''}`}
                      onClick={() => setForm({ ...form, installment_count: n })}
                    >
                      {n === 1 ? '1' : n}
                    </button>
                  ))}
                </div>
              </div>

              {form.installment_count > 1 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'end' }}>
                  <div className="form-group">
                    <label className="form-label">Interés</label>
                    <div className="tabs" style={{ padding: 2 }}>
                      <button type="button" className={`tab ${!form.has_interest ? 'active' : ''}`} onClick={() => setForm({ ...form, has_interest: false })}>
                        Sin
                      </button>
                      <button type="button" className={`tab ${form.has_interest ? 'active' : ''}`} onClick={() => setForm({ ...form, has_interest: true })}>
                        Con
                      </button>
                    </div>
                  </div>
                  {form.has_interest && (
                    <div className="form-group">
                      <label className="form-label">TNA %</label>
                      <input
                        className="form-input"
                        type="number"
                        step="0.1"
                        value={form.interest_rate}
                        onChange={e => setForm({ ...form, interest_rate: e.target.value })}
                        placeholder="120"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Category Selector */}
          {form.type !== 'transfer' && (
            <CompactSelector
              label="Categoría"
              options={filteredCategories}
              selectedId={form.category_id}
              onChange={id => setForm({ ...form, category_id: id })}
              placeholder="Sin categoría"
              variant="grid"
            />
          )}
        </div>

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
