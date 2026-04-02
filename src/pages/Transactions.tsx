import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { Transaction, Account, Category } from '../types/database';
import { Plus, Search, ArrowRightLeft, Trash2, X, Edit2 } from 'lucide-react';

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

  // Editing state
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    amount: '',
    description: '',
    transaction_date: '',
    account_id: '',
    category_id: '',
  });

  useEffect(() => { 
    if (user) {
      loadTransactions();
      loadMetadata();
    }
  }, [user, accountFilter]);

  async function loadMetadata() {
    const [accsRes, catsRes] = await Promise.all([
      supabase.from('accounts').select('*').eq('status', 'active').order('name'),
      supabase.from('categories').select('*').order('name'),
    ]);
    if (accsRes.data) setAccounts(accsRes.data);
    if (catsRes.data) setCategories(catsRes.data);
  }

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

  function startEdit(tx: Transaction) {
    setEditForm({
      amount: tx.amount.toString(),
      description: tx.description || '',
      transaction_date: tx.transaction_date,
      account_id: tx.account_id,
      category_id: tx.category_id || '',
    });
    setEditingTx(tx);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingTx) return;
    setSavingEdit(true);

    const { error } = await supabase.from('transactions').update({
      amount: parseFloat(editForm.amount),
      description: editForm.description,
      transaction_date: editForm.transaction_date,
      account_id: editForm.account_id,
      category_id: editForm.category_id || null,
    }).eq('id', editingTx.id);

    setSavingEdit(false);
    
    if (error) {
      alert('Error al guardar: ' + error.message);
    } else {
      setEditingTx(null);
      loadTransactions();
    }
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

  if (loading && transactions.length === 0) return <div className="spinner" />;

  // Filter categories for the edit modal based on the transaction type
  const modalCategories = categories.filter(c => 
    editingTx ? (c.type === editingTx.type || c.type === 'both') : true
  );

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
                  <div className="transaction-info">
                    <div className="transaction-desc" style={{ fontWeight: 400 }}>{tx.description || tx.category?.name || 'Transacción'}</div>
                    <div className="transaction-category">
                      {tx.category?.name || tx.type} · {tx.account?.name || ''}
                      {' · '}
                      {new Date(tx.transaction_date).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
                      {tx.payment_method === 'credit' && ' · Crédito'}
                    </div>
                    {tx.is_installment_purchase && (
                      <div className="transaction-installment-badge">💳 Cuotas</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <div className={`transaction-amount ${tx.type}`} style={{ fontWeight: 500 }}>
                      {tx.type === 'income' ? '+' : '-'}{formatMoney(Number(tx.amount))}
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => startEdit(tx)} className="btn btn-ghost" style={{ padding: 4, minHeight: 'auto' }}>
                        <Edit2 size={14} color="var(--text-muted)" />
                      </button>
                      <button onClick={() => deleteTransaction(tx.id)} className="btn btn-ghost" style={{ padding: 4, minHeight: 'auto' }}>
                        <Trash2 size={14} color="var(--text-muted)" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Edit Modal */}
      {editingTx && (
        <div className="modal-overlay" onClick={() => setEditingTx(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-header">
              <h2 className="modal-title">Editar Transacción</h2>
              <button className="modal-close" onClick={() => setEditingTx(null)}><X size={18} /></button>
            </div>
            
            <form onSubmit={saveEdit}>
              <div className="form-group">
                <label className="form-label">Monto</label>
                <input 
                  className="form-input" 
                  type="number" 
                  step="0.01" 
                  value={editForm.amount} 
                  onChange={e => setEditForm({...editForm, amount: e.target.value})} 
                  required 
                />
              </div>
              
              <div className="form-group">
                <label className="form-label">Descripción</label>
                <input 
                  className="form-input" 
                  type="text" 
                  value={editForm.description} 
                  onChange={e => setEditForm({...editForm, description: e.target.value})} 
                />
              </div>
              
              <div className="form-group">
                <label className="form-label">Fecha</label>
                <input 
                  className="form-input" 
                  type="date" 
                  value={editForm.transaction_date} 
                  onChange={e => setEditForm({...editForm, transaction_date: e.target.value})} 
                  required 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Cuenta</label>
                <select 
                  className="form-select" 
                  value={editForm.account_id} 
                  onChange={e => setEditForm({...editForm, account_id: e.target.value})} 
                  required
                >
                  <option value="">Seleccionar cuenta</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              {editingTx.type !== 'transfer' && (
                <div className="form-group">
                  <label className="form-label">Categoría</label>
                  <select 
                    className="form-select" 
                    value={editForm.category_id} 
                    onChange={e => setEditForm({...editForm, category_id: e.target.value})}
                  >
                    <option value="">Sin categoría</option>
                    {modalCategories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={savingEdit}>
                {savingEdit ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
