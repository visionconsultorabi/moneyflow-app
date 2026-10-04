import { useState, useEffect, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import type { SharedExpense, SplitType, PaidBy, Category, Account } from '../types/database';
import {
  getSharedExpenses,
  addSharedExpense,
  updateSharedExpense,
  deleteSharedExpense,
  settleAllPending,
  calculateBalances,
  calculateSplitAmount,
  getDefaultPersonName,
  setDefaultPersonName,
} from '../lib/sharedExpenses';
import {
  Users,
  Plus,
  CheckCircle2,
  Trash2,
  Edit2,
  X,
  ArrowDownRight,
  ArrowUpRight,
  Scale,
} from 'lucide-react';

const formatMoney = (amount: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(amount);

const SPLIT_OPTIONS: { type: SplitType; label: string; desc: string }[] = [
  { type: 'half', label: '1/2 (50%)', desc: 'Dividir en 2 (Mitad y mitad)' },
  { type: 'third', label: '1/3 (33%)', desc: 'Dividir en 3 (Una tercera parte)' },
  { type: 'two_thirds', label: '2/3 (67%)', desc: 'Dos terceras partes' },
  { type: 'full', label: '100%', desc: 'Total (El 100% corresponde reintegrar)' },
  { type: 'custom_amount', label: 'Monto Fijo', desc: 'Especificar monto exacto en $' },
  { type: 'custom_percentage', label: '% Personalizado', desc: 'Especificar porcentaje exacto' },
];

export function SharedExpenses() {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<SharedExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'pending' | 'settled' | 'all'>('pending');
  const [selectedPerson, setSelectedPerson] = useState<string>('all');
  
  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [editingItem, setEditingItem] = useState<SharedExpense | null>(null);

  // Accounts & Categories for optional transaction linking
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  // Add / Edit Form State
  const [formData, setFormData] = useState({
    person_name: getDefaultPersonName(),
    paid_by: 'other' as PaidBy,
    description: '',
    original_amount: '',
    split_type: 'half' as SplitType,
    custom_value: '',
    date: new Date().toISOString().split('T')[0],
    category_name: '',
    notes: '',
    create_transaction: false,
    account_id: '',
    category_id: '',
  });

  // Settle Form State
  const [settleNotes, setSettleNotes] = useState('');
  const [isSettling, setIsSettling] = useState(false);

  useEffect(() => {
    if (user) {
      loadData();
      loadMetadata();
    }

    const handleUpdate = () => {
      if (user) loadData();
    };
    window.addEventListener('shared_expenses_updated', handleUpdate);
    return () => window.removeEventListener('shared_expenses_updated', handleUpdate);
  }, [user]);

  async function loadMetadata() {
    try {
      const [accsRes, catsRes] = await Promise.all([
        supabase.from('accounts').select('*').eq('status', 'active').order('name'),
        supabase.from('categories').select('*').order('name'),
      ]);
      if (accsRes.data) setAccounts(accsRes.data);
      if (catsRes.data) setCategories(catsRes.data);
    } catch (e) {
      console.warn('Metadata load skipped', e);
    }
  }

  async function loadData() {
    if (!user) return;
    setLoading(true);
    const data = await getSharedExpenses(user.id);
    setExpenses(data);
    setLoading(false);
  }

  // Get unique person names
  const personNames = Array.from(new Set(expenses.map(e => e.person_name).filter(Boolean)));
  if (personNames.length === 0) {
    personNames.push(getDefaultPersonName());
  }

  const activePerson = selectedPerson === 'all' ? undefined : selectedPerson;
  const balances = calculateBalances(expenses, activePerson);

  // Filter list
  const filteredList = expenses.filter(item => {
    if (selectedPerson !== 'all' && item.person_name.toLowerCase() !== selectedPerson.toLowerCase()) {
      return false;
    }
    if (tab === 'pending') return item.status === 'pending';
    if (tab === 'settled') return item.status === 'settled';
    return true;
  });

  // Handle Split Calculation for form preview
  const numOriginalAmount = parseFloat(formData.original_amount) || 0;
  const numCustomValue = parseFloat(formData.custom_value) || 0;
  const splitPreview = calculateSplitAmount(numOriginalAmount, formData.split_type, numCustomValue);

  function openAddModal(defaultPaidBy: PaidBy = 'other') {
    setFormData({
      person_name: selectedPerson !== 'all' ? selectedPerson : getDefaultPersonName(),
      paid_by: defaultPaidBy,
      description: '',
      original_amount: '',
      split_type: 'half',
      custom_value: '',
      date: new Date().toISOString().split('T')[0],
      category_name: '',
      notes: '',
      create_transaction: false,
      account_id: accounts[0]?.id || '',
      category_id: '',
    });
    setEditingItem(null);
    setShowAddModal(true);
  }

  function openEditModal(item: SharedExpense) {
    setEditingItem(item);
    setFormData({
      person_name: item.person_name,
      paid_by: item.paid_by,
      description: item.description,
      original_amount: item.original_amount.toString(),
      split_type: item.split_type,
      custom_value: (item.split_type === 'custom_percentage' ? item.split_ratio * 100 : item.calculated_amount).toString(),
      date: item.date,
      category_name: item.category_name || '',
      notes: item.notes || '',
      create_transaction: false,
      account_id: accounts[0]?.id || '',
      category_id: '',
    });
    setShowAddModal(true);
  }

  async function handleSaveExpense(e: FormEvent) {
    e.preventDefault();
    if (!user || !numOriginalAmount) return;

    setDefaultPersonName(formData.person_name);

    if (editingItem) {
      await updateSharedExpense(user.id, editingItem.id, {
        person_name: formData.person_name,
        paid_by: formData.paid_by,
        original_amount: numOriginalAmount,
        split_type: formData.split_type,
        split_ratio: splitPreview.splitRatio,
        calculated_amount: splitPreview.calculatedAmount,
        description: formData.description || 'Gasto compartido',
        date: formData.date,
        category_name: formData.category_name || null,
        notes: formData.notes || null,
      });
    } else {
      let linkedTxId: string | null = null;

      // If user paid and requested to create standard transaction
      if (formData.paid_by === 'user' && formData.create_transaction && formData.account_id) {
        try {
          const { data: txData } = await supabase.from('transactions').insert({
            user_id: user.id,
            account_id: formData.account_id,
            type: 'expense',
            amount: numOriginalAmount,
            category_id: formData.category_id || null,
            description: `${formData.description || 'Gasto compartido'} (Compartido con ${formData.person_name})`,
            transaction_date: formData.date,
            payment_method: 'debit',
            notes: `Compartido: Reintegro de ${formatMoney(splitPreview.calculatedAmount)} a favor`,
          }).select().single();

          if (txData) linkedTxId = txData.id;
        } catch (txErr) {
          console.warn('Could not create linked transaction', txErr);
        }
      }

      await addSharedExpense(user.id, {
        transaction_id: linkedTxId,
        person_name: formData.person_name,
        paid_by: formData.paid_by,
        original_amount: numOriginalAmount,
        split_type: formData.split_type,
        split_ratio: splitPreview.splitRatio,
        calculated_amount: splitPreview.calculatedAmount,
        description: formData.description || 'Gasto compartido',
        date: formData.date,
        category_name: formData.category_name || null,
        status: 'pending',
        notes: formData.notes || null,
      });
    }

    setShowAddModal(false);
    setEditingItem(null);
    loadData();
  }

  async function handleToggleStatus(item: SharedExpense) {
    if (!user) return;
    const newStatus = item.status === 'pending' ? 'settled' : 'pending';
    await updateSharedExpense(user.id, item.id, {
      status: newStatus,
      settled_at: newStatus === 'settled' ? new Date().toISOString() : null,
    });
    loadData();
  }

  async function handleDelete(id: string) {
    if (!user) return;
    if (!confirm('¿Eliminar este registro de cuenta compartida?')) return;
    await deleteSharedExpense(user.id, id);
    loadData();
  }

  async function handleSettleAll() {
    if (!user) return;
    setIsSettling(true);
    await settleAllPending(user.id, activePerson, settleNotes);
    setIsSettling(false);
    setShowSettleModal(false);
    setSettleNotes('');
    loadData();
  }

  if (loading && expenses.length === 0) return <div className="spinner" />;

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', paddingBottom: 40 }}>
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users className="text-primary" size={26} />
            <h1 className="page-title">Cuentas Compartidas</h1>
          </div>
          <p className="page-subtitle">
            División de gastos, cuentas a devolver y reintegros con otra persona
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {balances.pendingCount > 0 && (
            <button className="btn btn-secondary" onClick={() => setShowSettleModal(true)}>
              <CheckCircle2 size={18} /> Saldar Cuenta
            </button>
          )}
          <button className="btn btn-primary" onClick={() => openAddModal('other')}>
            <Plus size={18} /> Agregar Cuenta
          </button>
        </div>
      </div>

      {/* Person Filter Selector if multiple */}
      {personNames.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>
            Filtrar por:
          </span>
          <button
            className={`tab ${selectedPerson === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedPerson('all')}
            style={{ padding: '6px 14px', borderRadius: 20 }}
          >
            Todas las personas
          </button>
          {personNames.map(p => (
            <button
              key={p}
              className={`tab ${selectedPerson === p ? 'active' : ''}`}
              onClick={() => setSelectedPerson(p)}
              style={{ padding: '6px 14px', borderRadius: 20 }}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Balance Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginBottom: 20 }}>
        {/* Debo devolver */}
        <div className="card" style={{ padding: 18, borderLeft: '4px solid var(--danger)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
                🔴 LO QUE PAGA POR MÍ (DEBO DEVOLVER)
              </span>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--danger)', marginTop: 4 }}>
                {formatMoney(balances.total_i_owe)}
              </div>
            </div>
            <div style={{ padding: 8, background: 'var(--danger-alpha)', borderRadius: '50%', color: 'var(--danger)' }}>
              <ArrowDownRight size={22} />
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            Suma de cuentas que pagó la otra persona y te corresponde reintegrar
          </div>
        </div>

        {/* Me deben devolver */}
        <div className="card" style={{ padding: 18, borderLeft: '4px solid var(--success)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
                🟢 LO QUE YO PAGO (ME DEBE DEVOLVER)
              </span>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--success)', marginTop: 4 }}>
                {formatMoney(balances.total_they_owe)}
              </div>
            </div>
            <div style={{ padding: 8, background: 'var(--success-alpha)', borderRadius: '50%', color: 'var(--success)' }}>
              <ArrowUpRight size={22} />
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            Suma de pagos que hiciste tú y la otra persona te debe reintegrar
          </div>
        </div>

        {/* Saldo Neto Final */}
        <div
          className="card"
          style={{
            padding: 18,
            gridColumn: '1 / -1',
            background: balances.net_balance > 0
              ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.12), rgba(239, 68, 68, 0.04))'
              : balances.net_balance < 0
              ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(16, 185, 129, 0.04))'
              : 'var(--bg-card)',
            border: balances.net_balance !== 0
              ? `1.5px solid ${balances.net_balance > 0 ? 'var(--danger)' : 'var(--success)'}`
              : '1px solid var(--border-default)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                <Scale size={18} />
                <span>ESTADO DE CUENTA NETO {activePerson ? `CON ${activePerson.toUpperCase()}` : ''}</span>
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4 }}>
                {balances.net_balance > 0 ? (
                  <span style={{ color: 'var(--danger)' }}>
                    Debes reintegrar {formatMoney(balances.net_balance)}
                  </span>
                ) : balances.net_balance < 0 ? (
                  <span style={{ color: 'var(--success)' }}>
                    Te deben reintegrar {formatMoney(Math.abs(balances.net_balance))}
                  </span>
                ) : (
                  <span style={{ color: 'var(--primary)' }}>
                    ✨ Cuentas al día ($0 pendientes)
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                Cálculo: {formatMoney(balances.total_i_owe)} (a devolver) − {formatMoney(balances.total_they_owe)} (a tu favor) ={' '}
                <strong>{balances.net_balance >= 0 ? '+' : ''}{formatMoney(balances.net_balance)}</strong>
              </div>
            </div>

            {balances.pendingCount > 0 && (
              <button
                className="btn btn-primary"
                onClick={() => setShowSettleModal(true)}
                style={{ padding: '10px 20px', fontWeight: 600 }}
              >
                <CheckCircle2 size={18} /> Saldar Saldo ({formatMoney(Math.abs(balances.net_balance))})
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Fast Action Buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
        <button
          className="btn btn-secondary"
          onClick={() => openAddModal('other')}
          style={{ justifyContent: 'center', padding: '12px 16px', background: 'var(--danger-alpha)', color: 'var(--danger)', borderColor: 'transparent' }}
        >
          <Plus size={18} /> Cargar cuenta que pagó por mí
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => openAddModal('user')}
          style={{ justifyContent: 'center', padding: '12px 16px', background: 'var(--success-alpha)', color: 'var(--success)', borderColor: 'transparent' }}
        >
          <Plus size={18} /> Cargar pago que hice yo
        </button>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 14 }}>
        <button className={`tab ${tab === 'pending' ? 'active' : ''}`} onClick={() => setTab('pending')}>
          Pendientes ({expenses.filter(e => e.status === 'pending' && (selectedPerson === 'all' || e.person_name === selectedPerson)).length})
        </button>
        <button className={`tab ${tab === 'settled' ? 'active' : ''}`} onClick={() => setTab('settled')}>
          Historial Saldados ({expenses.filter(e => e.status === 'settled' && (selectedPerson === 'all' || e.person_name === selectedPerson)).length})
        </button>
        <button className={`tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>
          Todos ({filteredList.length})
        </button>
      </div>

      {/* Expense List */}
      {filteredList.length === 0 ? (
        <div className="empty-state">
          <Users size={56} style={{ opacity: 0.5, marginBottom: 12 }} />
          <h3>No hay movimientos {tab === 'pending' ? 'pendientes' : ''}</h3>
          <p>
            {tab === 'pending'
              ? 'No tienes cuentas pendientes de saldar. ¡Todo al día!'
              : 'Empieza cargando los gastos que compartes o te reintegran.'}
          </p>
          <button className="btn btn-primary" onClick={() => openAddModal('other')} style={{ marginTop: 12 }}>
            <Plus size={18} /> Cargar Primer Gasto
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filteredList.map(item => {
            const isOwedToOther = item.paid_by === 'other';
            return (
              <div
                key={item.id}
                className="card"
                style={{
                  padding: '14px 16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  opacity: item.status === 'settled' ? 0.75 : 1,
                  borderLeft: `4px solid ${isOwedToOther ? 'var(--danger)' : 'var(--success)'}`,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 12,
                        background: isOwedToOther ? 'var(--danger-alpha)' : 'var(--success-alpha)',
                        color: isOwedToOther ? 'var(--danger)' : 'var(--success)',
                        textTransform: 'uppercase',
                      }}
                    >
                      {isOwedToOther ? `🔴 Pagó ${item.person_name} (Debo devolver)` : `🟢 Pagaste tú (Te debe ${item.person_name})`}
                    </span>

                    {item.status === 'settled' && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: 12,
                          background: 'var(--bg-elevated)',
                          color: 'var(--text-muted)',
                        }}
                      >
                        ✓ Saldado
                      </span>
                    )}

                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {new Date(item.date + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  </div>

                  <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>
                    {item.description}
                  </div>

                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                    Gasto total: <strong>{formatMoney(item.original_amount)}</strong> · División:{' '}
                    <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                      {SPLIT_OPTIONS.find(o => o.type === item.split_type)?.label || item.split_type}
                    </span>
                    {item.notes && <span> · <em>{item.notes}</em></span>}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <div
                    style={{
                      fontSize: 17,
                      fontWeight: 700,
                      color: isOwedToOther ? 'var(--danger)' : 'var(--success)',
                    }}
                  >
                    {isOwedToOther ? '+' : '-'}{formatMoney(item.calculated_amount)}
                  </div>

                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      onClick={() => handleToggleStatus(item)}
                      className="btn btn-ghost"
                      style={{ padding: 6, minHeight: 'auto' }}
                      title={item.status === 'pending' ? 'Marcar como saldado' : 'Reabrir como pendiente'}
                    >
                      <CheckCircle2
                        size={16}
                        color={item.status === 'settled' ? 'var(--success)' : 'var(--text-muted)'}
                      />
                    </button>
                    <button
                      onClick={() => openEditModal(item)}
                      className="btn btn-ghost"
                      style={{ padding: 6, minHeight: 'auto' }}
                      title="Editar"
                    >
                      <Edit2 size={16} color="var(--text-muted)" />
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="btn btn-ghost"
                      style={{ padding: 6, minHeight: 'auto' }}
                      title="Eliminar"
                    >
                      <Trash2 size={16} color="var(--text-muted)" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 540 }}>
            <div className="modal-handle" />
            <div className="modal-header">
              <h2 className="modal-title">
                {editingItem ? 'Editar Gasto Compartido' : 'Registrar Gasto Compartido / Cuenta'}
              </h2>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveExpense}>
              {/* Quién pagó */}
              <div className="form-group">
                <label className="form-label">¿Quién realizó el pago?</label>
                <div className="tabs" style={{ padding: 2 }}>
                  <button
                    type="button"
                    className={`tab ${formData.paid_by === 'other' ? 'active' : ''}`}
                    onClick={() => setFormData({ ...formData, paid_by: 'other' })}
                    style={{
                      background: formData.paid_by === 'other' ? 'var(--danger)' : undefined,
                      color: formData.paid_by === 'other' ? '#fff' : undefined,
                    }}
                  >
                    👤 La otra persona pagó (Debo devolver)
                  </button>
                  <button
                    type="button"
                    className={`tab ${formData.paid_by === 'user' ? 'active' : ''}`}
                    onClick={() => setFormData({ ...formData, paid_by: 'user' })}
                    style={{
                      background: formData.paid_by === 'user' ? 'var(--success)' : undefined,
                      color: formData.paid_by === 'user' ? '#fff' : undefined,
                    }}
                  >
                    💳 Yo pagué (Me debe devolver)
                  </button>
                </div>
              </div>

              {/* Nombre de la persona */}
              <div className="form-group">
                <label className="form-label">Persona / Compartido con</label>
                <input
                  className="form-input"
                  type="text"
                  value={formData.person_name}
                  onChange={e => setFormData({ ...formData, person_name: e.target.value })}
                  placeholder="Ej: Pareja, Lucas, Mamá..."
                  required
                />
              </div>

              {/* Concepto / Descripción */}
              <div className="form-group">
                <label className="form-label">Concepto / Cuenta</label>
                <input
                  className="form-input"
                  type="text"
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Ej: Luz, Supermercado, Alquiler, Cena..."
                  required
                />
              </div>

              {/* Monto Total */}
              <div className="form-group">
                <label className="form-label">Monto Total de la Factura / Gasto ($)</label>
                <input
                  className="form-input"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={formData.original_amount}
                  onChange={e => setFormData({ ...formData, original_amount: e.target.value })}
                  placeholder="0"
                  required
                  autoFocus
                />
              </div>

              {/* Cómo se divide */}
              <div className="form-group">
                <label className="form-label">¿Cómo se divide / reintegra?</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 8 }}>
                  {SPLIT_OPTIONS.map(opt => (
                    <button
                      key={opt.type}
                      type="button"
                      className={`btn ${formData.split_type === opt.type ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setFormData({ ...formData, split_type: opt.type })}
                      style={{ padding: '8px 6px', fontSize: 12, textAlign: 'center', justifyContent: 'center' }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* Custom Value Input */}
                {formData.split_type === 'custom_amount' && (
                  <div style={{ marginTop: 8 }}>
                    <label className="form-label" style={{ fontSize: 12 }}>
                      Monto exacto a reintegrar ($)
                    </label>
                    <input
                      className="form-input"
                      type="number"
                      step="0.01"
                      value={formData.custom_value}
                      onChange={e => setFormData({ ...formData, custom_value: e.target.value })}
                      placeholder="Monto exacto"
                      required
                    />
                  </div>
                )}

                {formData.split_type === 'custom_percentage' && (
                  <div style={{ marginTop: 8 }}>
                    <label className="form-label" style={{ fontSize: 12 }}>
                      Porcentaje a reintegrar (%)
                    </label>
                    <input
                      className="form-input"
                      type="number"
                      min="1"
                      max="100"
                      value={formData.custom_value}
                      onChange={e => setFormData({ ...formData, custom_value: e.target.value })}
                      placeholder="Ej: 40 para el 40%"
                      required
                    />
                  </div>
                )}
              </div>

              {/* Real-time preview calculation card */}
              {numOriginalAmount > 0 && (
                <div
                  style={{
                    padding: 14,
                    borderRadius: 8,
                    background: formData.paid_by === 'other' ? 'var(--danger-alpha)' : 'var(--success-alpha)',
                    border: `1px solid ${formData.paid_by === 'other' ? 'var(--danger)' : 'var(--success)'}`,
                    marginBottom: 16,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>
                      Monto a computar ({splitPreview.label}):
                    </span>
                    <span
                      style={{
                        fontSize: 18,
                        fontWeight: 800,
                        color: formData.paid_by === 'other' ? 'var(--danger)' : 'var(--success)',
                      }}
                    >
                      {formatMoney(splitPreview.calculatedAmount)}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, marginTop: 4, color: 'var(--text-secondary)' }}>
                    {formData.paid_by === 'other' ? (
                      <>➕ <strong>Se suma</strong> a lo que debes reintegrarle a {formData.person_name || 'la otra persona'}.</>
                    ) : (
                      <>➖ <strong>Se resta</strong> de tu deuda / queda a tu favor con {formData.person_name || 'la otra persona'}.</>
                    )}
                  </div>
                </div>
              )}

              {/* Fecha */}
              <div className="form-group">
                <label className="form-label">Fecha</label>
                <input
                  className="form-input"
                  type="date"
                  value={formData.date}
                  onChange={e => setFormData({ ...formData, date: e.target.value })}
                  required
                />
              </div>

              {/* Notas opcionales */}
              <div className="form-group">
                <label className="form-label">Notas adicionales (opcional)</label>
                <input
                  className="form-input"
                  type="text"
                  value={formData.notes}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Ej: Pagado con tarjeta Visa / Factura mes de Mayo"
                />
              </div>

              {/* Optional: Create regular expense if user paid */}
              {!editingItem && formData.paid_by === 'user' && accounts.length > 0 && (
                <div style={{ padding: 12, background: 'var(--bg-elevated)', borderRadius: 8, marginBottom: 16 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={formData.create_transaction}
                      onChange={e => setFormData({ ...formData, create_transaction: e.target.checked })}
                    />
                    <span>¿Registrar también en mis transacciones bancarias generales?</span>
                  </label>

                  {formData.create_transaction && (
                    <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label className="form-label" style={{ fontSize: 11 }}>Cuenta de pago</label>
                        <select
                          className="form-select"
                          value={formData.account_id}
                          onChange={e => setFormData({ ...formData, account_id: e.target.value })}
                        >
                          {accounts.map(a => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: 11 }}>Categoría</label>
                        <select
                          className="form-select"
                          value={formData.category_id}
                          onChange={e => setFormData({ ...formData, category_id: e.target.value })}
                        >
                          <option value="">Sin categoría</option>
                          {categories.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={!numOriginalAmount}>
                {editingItem ? 'Guardar Cambios' : 'Registrar Gasto'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Settle Modal */}
      {showSettleModal && (
        <div className="modal-overlay" onClick={() => setShowSettleModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-handle" />
            <div className="modal-header">
              <h2 className="modal-title">Saldar Cuentas</h2>
              <button className="modal-close" onClick={() => setShowSettleModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  padding: 16,
                  borderRadius: 8,
                  background: 'var(--bg-elevated)',
                  textAlign: 'center',
                  marginBottom: 16,
                }}
              >
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Saldo neto pendiente a liquidar:</div>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 800,
                    marginTop: 4,
                    color: balances.net_balance > 0 ? 'var(--danger)' : balances.net_balance < 0 ? 'var(--success)' : 'var(--primary)',
                  }}
                >
                  {formatMoney(Math.abs(balances.net_balance))}
                </div>
                <div style={{ fontSize: 13, marginTop: 4 }}>
                  {balances.net_balance > 0 ? (
                    <>Monto que debes transferir a {activePerson || 'la otra persona'}.</>
                  ) : balances.net_balance < 0 ? (
                    <>Monto que {activePerson || 'la otra persona'} te debe transferir.</>
                  ) : (
                    <>El balance está equilibrado.</>
                  )}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Nota o comprobante de liquidación (opcional)</label>
                <input
                  className="form-input"
                  type="text"
                  value={settleNotes}
                  onChange={e => setSettleNotes(e.target.value)}
                  placeholder="Ej: Transferencia bancaria / Pago efectivo"
                />
              </div>

              <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                ℹ️ Al saldar la cuenta, todos los movimientos pendientes {activePerson ? `con ${activePerson}` : ''} quedarán marcados como <strong>Saldados</strong> y el saldo neto volverá a $0. Podrás consultar el historial completo en la pestaña de saldados.
              </p>
            </div>

            <button
              className="btn btn-primary btn-block btn-lg"
              onClick={handleSettleAll}
              disabled={isSettling}
            >
              {isSettling ? 'Saldando...' : 'Confirmar y Saldar Cuenta'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
