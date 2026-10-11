import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { Transaction, Account, Category, SharedExpense, SplitType, PaidBy } from '../types/database';
import { Plus, Search, ArrowRightLeft, Trash2, X, Edit2, Download, Users } from 'lucide-react';
import { CompactSelector } from '../components/CompactSelector';
import { exportAllDataToExcel } from '../lib/exportExcel';
import {
  getSharedExpenses,
  addSharedExpense,
  updateSharedExpense,
  deleteSharedExpense,
  calculateSplitAmount,
  getDefaultPersonName,
  setDefaultPersonName,
} from '../lib/sharedExpenses';

const SPLIT_OPTIONS: { type: SplitType; label: string; desc: string }[] = [
  { type: 'half', label: '1/2 (50%)', desc: 'Dividir en 2' },
  { type: 'third', label: '1/3 (33%)', desc: 'Dividir en 3' },
  { type: 'two_thirds', label: '2/3 (67%)', desc: '2 terceras partes' },
  { type: 'full', label: '100%', desc: 'Total' },
  { type: 'custom_amount', label: 'Monto Fijo', desc: 'Monto exacto $' },
  { type: 'custom_percentage', label: '% Exacto', desc: 'Porcentaje %' },
];

const formatMoney = (amount: number, currency = 'ARS') => new Intl.NumberFormat('es-AR', { style: 'currency', currency, minimumFractionDigits: 0 }).format(amount);

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
  const [linkedShared, setLinkedShared] = useState<SharedExpense | null>(null);
  const [editForm, setEditForm] = useState({
    amount: '',
    description: '',
    transaction_date: '',
    account_id: '',
    category_id: '',
    to_account_id: '',
    // Shared / Split fields
    is_shared: false,
    shared_paid_by: 'user' as PaidBy,
    shared_person_name: getDefaultPersonName(),
    shared_split_type: 'half' as SplitType,
    shared_custom_value: '',
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
      .select('*, category:category_id(*), account:account_id(*), to_account:to_account_id(*), installment_plan:installment_plan_id(*, installments(*))')
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (accountFilter) {
      query = query.or(`account_id.eq.${accountFilter},to_account_id.eq.${accountFilter}`);
    }

    query = query.limit(100);
    const { data } = await query;
    if (data) setTransactions(data as any);
    setLoading(false);
  }

  function clearAccountFilter() {
    setSearchParams({});
  }

  async function startEdit(tx: Transaction) {
    let existingShared: SharedExpense | null = null;
    if (user) {
      try {
        const allShared = await getSharedExpenses(user.id);
        existingShared = allShared.find(s => s.transaction_id === tx.id) || null;
      } catch (err) {
        console.warn('Could not load shared expense for transaction', err);
      }
    }

    setLinkedShared(existingShared);
    setEditForm({
      amount: tx.amount.toString(),
      description: tx.description || '',
      transaction_date: tx.transaction_date,
      account_id: tx.account_id,
      category_id: tx.category_id || '',
      to_account_id: tx.to_account_id || '',
      is_shared: !!existingShared,
      shared_paid_by: existingShared ? existingShared.paid_by : 'user',
      shared_person_name: existingShared ? existingShared.person_name : getDefaultPersonName(),
      shared_split_type: existingShared ? existingShared.split_type : 'half',
      shared_custom_value: existingShared
        ? (existingShared.split_type === 'custom_percentage'
            ? (existingShared.split_ratio * 100).toString()
            : existingShared.calculated_amount.toString())
        : '',
    });
    setEditingTx(tx);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingTx || !user) return;
    setSavingEdit(true);

    const newAmount = parseFloat(editForm.amount);
    const newDescription = editForm.description;
    const numCustomShared = parseFloat(editForm.shared_custom_value) || 0;
    const splitPreview = calculateSplitAmount(newAmount, editForm.shared_split_type, numCustomShared);

    const { error } = await supabase.from('transactions').update({
      amount: newAmount,
      description: newDescription,
      transaction_date: editForm.transaction_date,
      account_id: editForm.account_id,
      category_id: editingTx.type !== 'transfer' ? (editForm.category_id || null) : null,
      to_account_id: editingTx.type === 'transfer' ? (editForm.to_account_id || null) : null,
    }).eq('id', editingTx.id);

    if (error) {
      setSavingEdit(false);
      alert('Error al guardar: ' + error.message);
      return;
    }

    // Handle Linked Shared Expense (Split)
    try {
      if (editForm.is_shared) {
        setDefaultPersonName(editForm.shared_person_name);
        const selectedCat = categories.find(c => c.id === editForm.category_id);
        const sharedPayload = {
          transaction_id: editingTx.id,
          person_name: editForm.shared_person_name || 'Pareja',
          paid_by: editForm.shared_paid_by,
          original_amount: newAmount,
          split_type: editForm.shared_split_type,
          split_ratio: splitPreview.splitRatio,
          calculated_amount: splitPreview.calculatedAmount,
          description: newDescription || 'Gasto compartido',
          date: editForm.transaction_date,
          category_name: selectedCat?.name || null,
          notes: editForm.shared_paid_by === 'other'
            ? `Pagó ${editForm.shared_person_name} · Debo devolver ${formatMoney(splitPreview.calculatedAmount)}`
            : `Pagué yo · Me debe reintegrar ${formatMoney(splitPreview.calculatedAmount)}`,
        };

        if (linkedShared) {
          await updateSharedExpense(user.id, linkedShared.id, sharedPayload);
        } else {
          await addSharedExpense(user.id, {
            ...sharedPayload,
            status: 'pending',
          });
        }
      } else if (linkedShared) {
        // User unchecked shared expense, delete it
        await deleteSharedExpense(user.id, linkedShared.id);
      }
    } catch (sharedErr) {
      console.warn('Error syncing shared expense:', sharedErr);
    }

    // If the transaction has installments, propagate amount/description changes
    if (editingTx.is_installment_purchase && editingTx.installment_plan_id) {
      const plan = editingTx.installment_plan;
      const installmentCount = plan?.installment_count || 1;
      const oldAmount = editingTx.amount;

      // Recalculate if amount or description changed
      const amountChanged = newAmount !== Number(oldAmount);
      const descChanged = newDescription !== (plan?.description ?? '');

      if (amountChanged || descChanged) {
        const newInstallmentAmount = Math.ceil(newAmount / installmentCount);
        const newFinancingCost = plan?.interest_rate && plan.interest_rate > 0
          ? newInstallmentAmount * installmentCount - newAmount
          : 0;

        // Update the installment plan
        await supabase.from('installment_plans').update({
          total_amount: newAmount,
          installment_amount: newInstallmentAmount,
          financing_cost: newFinancingCost,
          description: newDescription,
        }).eq('id', editingTx.installment_plan_id);

        // Update all individual installment amounts
        if (amountChanged) {
          await supabase.from('installments').update({
            amount: newInstallmentAmount,
          }).eq('installment_plan_id', editingTx.installment_plan_id);
        }
      }
    }

    setSavingEdit(false);
    setEditingTx(null);
    setLinkedShared(null);
    loadTransactions();
  }

  async function deleteTransaction(id: string) {
    if (!confirm('¿Eliminar esta transacción?')) return;
    if (user) {
      try {
        const allShared = await getSharedExpenses(user.id);
        const matched = allShared.find(s => s.transaction_id === id);
        if (matched) {
          await deleteSharedExpense(user.id, matched.id);
        }
      } catch (err) {
        console.warn('Could not delete linked shared expense', err);
      }
    }
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
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => exportAllDataToExcel()} title="Exportar a Excel">
            <Download size={18} /> Excel
          </button>
          <button className="btn btn-primary" onClick={() => navigate('/new-transaction')}>
            <Plus size={18} /> Nueva
          </button>
        </div>
      </div>

      {/* Account Filter Badge */}
      {accountFilter && accountName && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'var(--primary-alpha)', color: 'var(--primary)',
          padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600,
          marginBottom: 8
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
      <div style={{ position: 'relative', marginBottom: 12 }}>
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
                    <div className="transaction-desc" style={{ fontWeight: 400 }}>{tx.description || tx.category?.name || (tx.type === 'transfer' ? 'Transferencia' : 'Transacción')}</div>
                    <div className="transaction-category">
                      {tx.type === 'transfer' ? (
                        <>
                          {tx.account?.name} → {tx.to_account?.name}
                        </>
                      ) : (
                        <>
                          {tx.category?.name || tx.type} · {tx.account?.name || ''}
                        </>
                      )}
                      {' · '}
                      {new Date(tx.transaction_date).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
                      {tx.payment_method === 'credit' && ' · Crédito'}
                    </div>
                    {tx.is_installment_purchase && tx.installment_plan && (
                      <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <span className="badge badge-secondary" style={{ fontSize: 10, padding: '2px 6px' }}>
                          Cuota {tx.installment_plan.installments?.find((i: any) => i.installment_number === 1)?.due_month.slice(0, 7) || 'N/A'} (1/{tx.installment_plan.installment_count})
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                          Total: {formatMoney(tx.installment_plan.total_amount, tx.account?.currency)}
                        </span>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    {(() => {
                      const isIncomeForCurrent = tx.type === 'income' || (tx.type === 'transfer' && tx.to_account_id === accountFilter);
                      const amountType = isIncomeForCurrent ? 'income' : 'expense';
                      const sign = isIncomeForCurrent ? '+' : '-';
                      
                      return (
                        <div className={`transaction-amount ${amountType}`} style={{ fontWeight: 500 }}>
                          {sign}{formatMoney(Number(tx.amount), tx.account?.currency)}
                        </div>
                      );
                    })()}
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

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <CompactSelector
                  label="Cuenta"
                  options={accounts}
                  selectedId={editForm.account_id}
                  onChange={id => setEditForm({...editForm, account_id: id})}
                />

                {editingTx.type === 'transfer' ? (
                  <CompactSelector
                    label="Cuenta Destino"
                    options={accounts.filter(a => a.id !== editForm.account_id)}
                    selectedId={editForm.to_account_id}
                    onChange={id => setEditForm({...editForm, to_account_id: id})}
                  />
                ) : (
                  <CompactSelector
                    label="Categoría"
                    options={modalCategories}
                    selectedId={editForm.category_id}
                    onChange={id => setEditForm({...editForm, category_id: id})}
                    variant="grid"
                    placeholder="Sin categoría"
                  />
                )}
              </div>

              {/* Gasto Compartido / Dividir Gasto (gastos y transferencias) */}
              {(editingTx.type === 'expense' || editingTx.type === 'transfer') && (
                <div
                  style={{
                    marginTop: 14,
                    padding: 12,
                    borderRadius: 8,
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: 13,
                      marginBottom: editForm.is_shared ? 12 : 0,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={editForm.is_shared}
                      onChange={e => setEditForm({ ...editForm, is_shared: e.target.checked })}
                      style={{ width: 16, height: 16 }}
                    />
                    <Users size={16} color="var(--primary)" />
                    <span>¿Gasto compartido / Dividir gasto?</span>
                  </label>

                  {editForm.is_shared && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
                      {/* Quién pagó */}
                      <div>
                        <label className="form-label" style={{ fontSize: 11, marginBottom: 4 }}>
                          ¿Quién realizó el pago?
                        </label>
                        <div className="tabs" style={{ padding: 2 }}>
                          <button
                            type="button"
                            className={`tab ${editForm.shared_paid_by === 'user' ? 'active' : ''}`}
                            onClick={() => setEditForm({ ...editForm, shared_paid_by: 'user' })}
                            style={{
                              background: editForm.shared_paid_by === 'user' ? 'var(--success)' : undefined,
                              color: editForm.shared_paid_by === 'user' ? '#fff' : undefined,
                              fontSize: 11,
                              padding: '6px 8px',
                            }}
                          >
                            💳 Yo pagué (Me debe)
                          </button>
                          <button
                            type="button"
                            className={`tab ${editForm.shared_paid_by === 'other' ? 'active' : ''}`}
                            onClick={() => setEditForm({ ...editForm, shared_paid_by: 'other' })}
                            style={{
                              background: editForm.shared_paid_by === 'other' ? 'var(--danger)' : undefined,
                              color: editForm.shared_paid_by === 'other' ? '#fff' : undefined,
                              fontSize: 11,
                              padding: '6px 8px',
                            }}
                          >
                            👤 La otra persona (Debo)
                          </button>
                        </div>
                      </div>

                      {/* Persona */}
                      <div>
                        <label className="form-label" style={{ fontSize: 11, marginBottom: 4 }}>
                          Persona / Compartido con
                        </label>
                        <input
                          className="form-input"
                          type="text"
                          value={editForm.shared_person_name}
                          onChange={e => setEditForm({ ...editForm, shared_person_name: e.target.value })}
                          placeholder="Ej: Pareja, Lucas, Mamá..."
                          required={editForm.is_shared}
                        />
                      </div>

                      {/* División */}
                      <div>
                        <label className="form-label" style={{ fontSize: 11, marginBottom: 4 }}>
                          ¿Cómo se divide / reintegra?
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                          {SPLIT_OPTIONS.map(opt => (
                            <button
                              key={opt.type}
                              type="button"
                              className={`btn ${editForm.shared_split_type === opt.type ? 'btn-primary' : 'btn-secondary'}`}
                              onClick={() => setEditForm({ ...editForm, shared_split_type: opt.type })}
                              style={{ padding: '6px 4px', fontSize: 11, textAlign: 'center', justifyContent: 'center' }}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>

                        {editForm.shared_split_type === 'custom_amount' && (
                          <div style={{ marginTop: 8 }}>
                            <input
                              className="form-input"
                              type="number"
                              step="0.01"
                              value={editForm.shared_custom_value}
                              onChange={e => setEditForm({ ...editForm, shared_custom_value: e.target.value })}
                              placeholder="Monto exacto a computar ($)"
                              required
                            />
                          </div>
                        )}

                        {editForm.shared_split_type === 'custom_percentage' && (
                          <div style={{ marginTop: 8 }}>
                            <input
                              className="form-input"
                              type="number"
                              min="1"
                              max="100"
                              value={editForm.shared_custom_value}
                              onChange={e => setEditForm({ ...editForm, shared_custom_value: e.target.value })}
                              placeholder="Porcentaje exacto a computar (%)"
                              required
                            />
                          </div>
                        )}
                      </div>

                      {/* Cálculo en tiempo real */}
                      {(() => {
                        const amt = parseFloat(editForm.amount) || 0;
                        const cVal = parseFloat(editForm.shared_custom_value) || 0;
                        const preview = calculateSplitAmount(amt, editForm.shared_split_type, cVal);
                        return amt > 0 ? (
                          <div
                            style={{
                              padding: 10,
                              borderRadius: 6,
                              background: editForm.shared_paid_by === 'other' ? 'var(--danger-alpha)' : 'var(--success-alpha)',
                              border: `1px solid ${editForm.shared_paid_by === 'other' ? 'var(--danger)' : 'var(--success)'}`,
                              fontSize: 12,
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span>Monto a computar ({preview.label}):</span>
                              <strong style={{ fontSize: 14, color: editForm.shared_paid_by === 'other' ? 'var(--danger)' : 'var(--success)' }}>
                                {formatMoney(preview.calculatedAmount)}
                              </strong>
                            </div>
                            <div style={{ marginTop: 3, opacity: 0.9 }}>
                              {editForm.shared_paid_by === 'other'
                                ? `➕ Suma a lo que debes devolverle a ${editForm.shared_person_name || 'la otra persona'}.`
                                : `➖ Resta de tu deuda / a tu favor con ${editForm.shared_person_name || 'la otra persona'}.`}
                            </div>
                          </div>
                        ) : null;
                      })()}
                    </div>
                  )}
                </div>
              )}

              <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={savingEdit} style={{ marginTop: 14 }}>
                {savingEdit ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
