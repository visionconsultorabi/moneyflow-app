import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { Transaction } from '../types/database';
import { Plus, Search, ArrowRightLeft, Trash2, X } from 'lucide-react';

const formatMoney = (amount: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(amount);

export function Transactions() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const accountFilter = searchParams.get('account');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accountName, setAccountName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'expense' | 'income' | 'transfer'>('all');
  const [search, setSearch] = useState('');

  useEffect(() => { if (user) loadTransactions(); }, [user, accountFilter]);

  async function loadTransactions() {
    setLoading(true);

    // Load account name if filtering by account
    if (accountFilter) {
      const { data: accData } = await supabase.from('accounts').select('name').eq('id', accountFilter).single();
      if (accData) setAccountName(accData.name);
    } else {
      setAccountName('');
    }

    let query = supabase
      .from('transactions')
      .select('*, category:category_id(*), account:account_id(*)')
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (accountFilter) {
      query = query.eq('account_id', accountFilter);
    }

    query = query.limit(100);
    const { data } = await query;
    if (data) setTransactions(data as any);
    setLoading(false);
  }

  function clearAccountFilter() {
    setSearchParams({});
  }

  async function deleteTransaction(id: string) {
    if (!confirm('¿Eliminar esta transacción?')) return;
    await supabase.from('transactions').delete().eq('id', id);
    loadTransactions();
  }

  const filtered = transactions.filter(tx => {
    if (filter !== 'all' && tx.type !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      const desc = (tx.description || '').toLowerCase();
      const catName = (tx.category?.name || '').toLowerCase();
      return desc.includes(s) || catName.includes(s);
    }
    return true;
  });

  // Group by date
  const groups: Record<string, Transaction[]> = {};
  filtered.forEach(tx => {
    const date = tx.transaction_date;
    if (!groups[date]) groups[date] = [];
    groups[date].push(tx);
  });

  if (loading) return <div className="spinner" />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Transacciones</h1>
          <p className="page-subtitle">{filtered.length} movimientos</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/new-transaction')}>
          <Plus size={18} /> Nueva
        </button>
      </div>

      {/* Account Filter Badge */}
      {accountFilter && accountName && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'var(--primary-alpha)', color: 'var(--primary)',
          padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600,
          marginBottom: 16
        }}>
          📋 Movimientos de: {accountName}
          <button onClick={clearAccountFilter} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 2,
            display: 'flex', alignItems: 'center', color: 'var(--primary)'
          }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <Search size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input
          type="search"
          className="form-input"
          style={{ paddingLeft: 42 }}
          placeholder="Buscar transacciones..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>Todas</button>
        <button className={`tab ${filter === 'expense' ? 'active' : ''}`} onClick={() => setFilter('expense')}>Gastos</button>
        <button className={`tab ${filter === 'income' ? 'active' : ''}`} onClick={() => setFilter('income')}>Ingresos</button>
        <button className={`tab ${filter === 'transfer' ? 'active' : ''}`} onClick={() => setFilter('transfer')}>Transfer</button>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <ArrowRightLeft size={64} />
          <h3>Sin transacciones</h3>
          <p>{search || accountFilter ? 'No se encontraron resultados' : 'Empezá registrando tu primer movimiento'}</p>
          {accountFilter && (
            <button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={clearAccountFilter}>
              Ver todas las transacciones
            </button>
          )}
        </div>
      ) : (
        <div className="transaction-list">
          {Object.entries(groups).map(([date, txs]) => (
            <div key={date} className="transaction-date-group">
              <div className="transaction-date-label">
                {new Date(date + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
              {txs.map(tx => (
                <div key={tx.id} className="transaction-item">
                  <div className="transaction-icon" style={{ background: tx.category?.color ? tx.category.color + '22' : 'var(--bg-elevated)' }}>
                    {tx.category?.icon || (tx.type === 'income' ? '💰' : tx.type === 'transfer' ? '🔄' : '💸')}
                  </div>
                  <div className="transaction-info">
                    <div className="transaction-desc">{tx.description || tx.category?.name || 'Transacción'}</div>
                    <div className="transaction-category">
                      {tx.category?.name || tx.type} · {tx.account?.name || ''}
                      {tx.payment_method === 'credit' && ' · Crédito'}
                    </div>
                    {tx.is_installment_purchase && (
                      <div className="transaction-installment-badge">💳 Cuotas</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <div className={`transaction-amount ${tx.type}`}>
                      {tx.type === 'income' ? '+' : '-'}{formatMoney(Number(tx.amount))}
                    </div>
                    <button onClick={() => deleteTransaction(tx.id)} className="btn btn-ghost" style={{ padding: 4, minHeight: 'auto' }}>
                      <Trash2 size={14} color="var(--text-muted)" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
