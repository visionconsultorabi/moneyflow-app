import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { Account, Transaction, MonthlyInstallment, SavingsGoal } from '../types/database';
import { Plus, ArrowRightLeft, CreditCard, AlertTriangle } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

function formatMoney(amount: number, currency = 'ARS') {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

export function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [monthlyInstallments, setMonthlyInstallments] = useState<MonthlyInstallment[]>([]);
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const { privacyMode } = useTheme();
  const showBalances = privacyMode;

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  async function loadData() {
    setLoading(true);
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const [accountsRes, transactionsRes, installmentsRes, savingsRes] = await Promise.all([
      supabase.from('accounts').select('*').eq('status', 'active').order('created_at'),
      supabase.from('transactions').select('*, category:category_id(*), account:account_id(*)').order('transaction_date', { ascending: false }).limit(10),
      supabase.rpc('get_monthly_installments', { p_user_id: user!.id, p_month: month, p_year: year }),
      supabase.from('savings_goals').select('*').limit(3),
    ]);

    if (accountsRes.data) setAccounts(accountsRes.data);
    if (transactionsRes.data) setTransactions(transactionsRes.data as any);
    if (installmentsRes.data) setMonthlyInstallments(installmentsRes.data as any);
    if (savingsRes.data) setSavingsGoals(savingsRes.data);
    
    // Check recurring transactions
    await checkRecurringTransactions();
    
    setLoading(false);
  }

  async function checkRecurringTransactions() {
    const today = new Date().toISOString().split('T')[0];
    const { data: pending } = await supabase
      .from('recurring_transactions')
      .select('*')
      .eq('status', 'active')
      .lte('next_occurrence', today);

    if (pending && pending.length > 0) {
      for (const rec of pending) {
        // Create actual transaction
        await supabase.from('transactions').insert({
          user_id: user!.id,
          account_id: rec.account_id,
          type: rec.type,
          amount: rec.amount,
          category_id: rec.category_id,
          description: rec.description,
          transaction_date: rec.next_occurrence,
          is_recurring: true,
          recurring_id: rec.id
        });

        // Calculate next occurrence
        const nextDate = new Date(rec.next_occurrence);
        if (rec.frequency === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
        else if (rec.frequency === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
        else if (rec.frequency === 'yearly') nextDate.setFullYear(nextDate.getFullYear() + 1);
        else if (rec.frequency === 'daily') nextDate.setDate(nextDate.getDate() + 1);

        await supabase.from('recurring_transactions')
          .update({ next_occurrence: nextDate.toISOString().split('T')[0] })
          .eq('id', rec.id);
      }
      // Re-load data to show new transactions
      loadData();
    }
  }

  const bankAccounts = accounts.filter(a => a.account_type !== 'credit_card' && a.account_type !== 'store_credit');
  const creditCards = accounts.filter(a => a.account_type === 'credit_card');
  const storeCredits = accounts.filter(a => a.account_type === 'store_credit');

  // Calculate totals per currency
  const totalsByCurrency = bankAccounts.filter(a => a.include_in_total).reduce((acc, a) => {
    acc[a.currency] = (acc[a.currency] || 0) + Number(a.current_balance);
    return acc;
  }, {} as Record<string, number>);

  const totalInstallmentsThisMonth = monthlyInstallments.filter(i => i.status === 'pending').reduce((sum, i) => sum + Number(i.amount), 0);
  // (Assuming installments are in primary currency ARS for simplicity in real-available calculation)
  const primaryCurrency = 'ARS';

  const monthExpenses = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + Number(t.amount), 0);
  const monthIncome = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + Number(t.amount), 0);

  // Generate Alerts
  const todayDate = new Date().getDate();
  const alerts: { title: string, description: string, type: 'warning' | 'danger' }[] = [];

  creditCards.forEach(card => {
    if (card.payment_due_day) {
      const diff = card.payment_due_day - todayDate;
      if (diff >= 0 && diff <= 3) {
        alerts.push({ title: card.name, description: `Vencimiento de pago en ${diff} días (${card.payment_due_day} del mes)`, type: 'danger' });
      } else if (diff === 0) {
        alerts.push({ title: card.name, description: `¡El pago vence HOY!`, type: 'danger' });
      }
    }
    if (card.billing_close_day) {
      const diff = card.billing_close_day - todayDate;
      if (diff > 0 && diff <= 3) {
        alerts.push({ title: card.name, description: `Cierre de mes en ${diff} días`, type: 'warning' });
      }
    }
    const limit = Number(card.credit_limit) || 0;
    const pct = limit ? Math.round(((limit - Number(card.current_balance)) / limit) * 100) : 0;
    if (pct > 90) {
      alerts.push({ title: card.name, description: `Límite de crédito superado al ${pct}%`, type: 'danger' });
    }
  });

  if (loading) return <div className="spinner" />;

  return (
    <div>
      <div className="page-header desktop-only">
        <div>
          <h1 className="page-title">MoneyFlow</h1>
          <p className="page-subtitle">Gestión de finanzas</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={() => navigate('/new-transaction')}>
            <Plus size={18} /> Nuevo
          </button>
        </div>
      </div>



      {/* Alerts Section */}
      {alerts.length > 0 && (
        <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {alerts.map((alert, i) => (
            <div key={i} style={{ 
              background: alert.type === 'danger' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
              border: `1px solid ${alert.type === 'danger' ? 'var(--danger)' : 'var(--warning)'}`,
              padding: '12px 16px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: 12
            }}>
              <AlertTriangle size={20} color={alert.type === 'danger' ? 'var(--danger)' : 'var(--warning)'} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{alert.title}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{alert.description}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Balance Card Section */}
      <div className="balance-card" style={{ marginBottom: 24 }}>
        <div>
          <div className="label">Balance Total</div>
          {Object.entries(totalsByCurrency).map(([curr, amount]) => (
            <div key={curr} className="amount" style={{ fontSize: Object.keys(totalsByCurrency).length > 1 ? 28 : 36 }}>
              {showBalances ? formatMoney(amount, curr) : '****'}
            </div>
          ))}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Ingresos</div>
          <div className="stat-value positive">{showBalances ? formatMoney(monthIncome) : '****'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Gastos</div>
          <div className="stat-value negative">{showBalances ? formatMoney(monthExpenses) : '****'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Tarjetas</div>
          <div className="stat-value">{creditCards.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Cuotas Mes</div>
          <div className="stat-value negative">{showBalances ? formatMoney(totalInstallmentsThisMonth) : '****'}</div>
        </div>
      </div>

      {/* Credit Cards Summary */}
      {creditCards.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div className="section-header">
            <div>
              <h2 className="section-title">Tarjetas de Crédito</h2>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/cards')}>Ver todas</button>
          </div>
          <div className="accounts-grid">
            {creditCards.map(card => {
              const limit = Number(card.credit_limit) || 0;
              const used = limit - Number(card.current_balance);
              const pct = limit ? Math.round((used / limit) * 100) : 0;
              const utilClass = pct > 80 ? 'high' : pct > 50 ? 'medium' : 'low';
              return (
                <div key={card.id} className="card" onClick={() => navigate('/cards')} style={{ cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <div className="account-icon-wrapper" style={{ background: card.color + '22' }}>
                      <CreditCard size={22} color={card.color} />
                    </div>
                    <div>
                      <div className="account-name">{card.name}</div>
                      <div className="account-institution">{card.institution || 'Tarjeta'}</div>
                    </div>
                  </div>
                  <div className="utilization-bar">
                    <div className={`utilization-fill ${utilClass}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-muted)' }}>
                    <span>Disponible: {showBalances ? formatMoney(Number(card.current_balance), card.currency) : '****'}</span>
                    <span>{pct}% usado</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Monthly Installments */}
      {monthlyInstallments.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div className="section-header">
            <h2 className="section-title">Cuotas del Mes</h2>
          </div>
          {monthlyInstallments.map(inst => (
            <div key={inst.installment_id} className="transaction-item">
              <div className="transaction-icon" style={{ background: 'rgba(139, 92, 246, 0.15)' }}>
                💳
              </div>
              <div className="transaction-info">
                <div className="transaction-desc">{inst.description || 'Cuota'}</div>
                <div className="transaction-category">{inst.card_name} · Cuota {inst.installment_number}/{inst.total_installments}</div>
              </div>
              <div className="transaction-amount expense">{showBalances ? formatMoney(Number(inst.amount), primaryCurrency) : '****'}</div>
            </div>
          ))}
        </div>
      )}

      {/* Recent Transactions */}
      <div>
        <div className="section-header">
          <h2 className="section-title">Últimas Transacciones</h2>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/transactions')}>Ver todas</button>
        </div>
        {transactions.length === 0 ? (
          <div className="empty-state">
            <ArrowRightLeft />
            <h3>Sin transacciones</h3>
            <p>Empezá registrando tu primer ingreso o gasto</p>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/new-transaction')}>
              <Plus size={18} /> Nueva Transacción
            </button>
          </div>
        ) : (
          <div className="transaction-list">
            {transactions.map(tx => (
              <div key={tx.id} className="transaction-item">
                <div className="transaction-icon" style={{ background: tx.category?.color ? tx.category.color + '22' : 'var(--bg-elevated)' }}>
                  {tx.category?.icon || (tx.type === 'income' ? '💰' : tx.type === 'transfer' ? '🔄' : '💸')}
                </div>
                <div className="transaction-info">
                  <div className="transaction-desc">{tx.description || tx.category?.name || 'Transacción'}</div>
                  <div className="transaction-category">
                    {tx.category?.name || tx.type} · {new Date(tx.transaction_date).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                  </div>
                  {tx.is_installment_purchase && (
                    <div className="transaction-installment-badge">💳 Cuotas</div>
                  )}
                </div>
                <div className={`transaction-amount ${tx.type}`}>
                  {showBalances ? (tx.type === 'expense' ? `-${formatMoney(tx.amount || 0, (tx as any).account?.currency)}` : formatMoney(tx.amount || 0, (tx as any).account?.currency)) : '****'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Accounts List */}
      <div style={{ marginTop: 24 }}>
        <div className="section-header">
          <h2 className="section-title">Mis Cuentas</h2>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/accounts')}>Administrar</button>
        </div>
        {bankAccounts.length === 0 ? (
          <div className="empty-state">
            <AlertTriangle />
            <h3>Sin cuentas</h3>
            <p>Agregá tu primera cuenta para empezar</p>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/accounts')}>
              <Plus size={18} /> Agregar Cuenta
            </button>
          </div>
        ) : (
          <div className="accounts-grid">
            {bankAccounts.map(account => (
              <div key={account.id} className="account-card" onClick={() => navigate('/accounts')}>
                <div className="account-icon-wrapper" style={{ background: account.color + '22' }}>
                  {account.icon}
                </div>
                <div className="account-info">
                  <div className="account-name">{account.name}</div>
                  <div className="account-institution">{account.institution || account.account_type}</div>
                </div>
                <div className="account-balance" style={{ color: Number(account.current_balance) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {showBalances ? formatMoney(Number(account.current_balance), account.currency) : '****'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Savings Goals Summary */}
      {savingsGoals.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div className="section-header">
            <h2 className="section-title">Metas de Ahorro</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/savings')}>Ver todas</button>
          </div>
          <div className="accounts-grid">
            {savingsGoals.map(goal => {
              const pct = Math.min(Math.round((Number(goal.current_amount) / Number(goal.target_amount)) * 100), 100);
              return (
                <div key={goal.id} className="card" onClick={() => navigate('/savings')} style={{ cursor: 'pointer', padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontWeight: 600 }}>{goal.name}</span>
                    <span style={{ color: goal.color, fontWeight: 700 }}>{pct}%</span>
                  </div>
                  <div className="utilization-bar" style={{ height: 6, marginBottom: 8 }}>
                    <div className="utilization-fill" style={{ width: `${pct}%`, background: goal.color }} />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {showBalances ? `${formatMoney(Number(goal.current_amount), primaryCurrency)} de ${formatMoney(Number(goal.target_amount), primaryCurrency)}` : '**** de ****'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Store Credit List */}
      {storeCredits.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div className="section-header">
            <h2 className="section-title">Saldos a Favor (Comercios)</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/accounts')}>Ver todos</button>
          </div>
          <div className="accounts-grid">
            {storeCredits.map(account => (
              <div key={account.id} className="account-card" onClick={() => navigate('/accounts')}>
                <div className="account-icon-wrapper" style={{ background: account.color + '22' }}>
                  {account.icon}
                </div>
                <div className="account-info">
                  <div className="account-name">{account.name}</div>
                  <div className="account-institution">Saldo a favor</div>
                </div>
                <div className="account-balance" style={{ color: 'var(--success)' }}>
                  {showBalances ? formatMoney(Number(account.current_balance), account.currency) : '****'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
