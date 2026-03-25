import { useState, useEffect, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { Account } from '../types/database';
import { Plus, X, Wallet, Edit2 } from 'lucide-react';

const formatMoney = (amount: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(amount);

const accountTypeLabels: Record<string, string> = {
  bank: 'Banco',
  cash: 'Efectivo',
  digital_wallet: 'Billetera Digital',
  investment: 'Inversión',
  store_credit: 'Cuenta Corriente / Comercio',
};

const accountTypeIcons: Record<string, string> = {
  bank: '🏦',
  cash: '💵',
  digital_wallet: '📱',
  investment: '📈',
  store_credit: '🏪',
};

export function Accounts() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    account_type: 'bank' as Account['account_type'],
    institution: '',
    currency: 'ARS',
    initial_balance: '',
    color: '#3B82F6',
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => { if (user) loadAccounts(); }, [user]);

  async function loadAccounts() {
    setLoading(true);
    const { data } = await supabase.from('accounts').select('*').neq('account_type', 'credit_card').order('created_at');
    if (data) setAccounts(data);
    setLoading(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorStatus(null);
    const balance = parseFloat(form.initial_balance) || 0;
    
    if (editingId) {
      const { error } = await supabase.from('accounts').update({
        name: form.name,
        account_type: form.account_type === 'store_credit' ? 'digital_wallet' : form.account_type,
        institution: form.institution || null,
        currency: form.currency,
        icon: accountTypeIcons[form.account_type] || '🏦',
        color: form.color,
      }).eq('id', editingId);

      if (error) {
        setErrorStatus({ type: 'error', text: error.message });
      } else {
        setEditingId(null);
        setShowForm(false);
        setForm({ name: '', account_type: 'bank', institution: '', currency: 'ARS', initial_balance: '', color: '#3B82F6' });
        loadAccounts();
      }
    } else {
      const { error } = await supabase.from('accounts').insert({
        user_id: user!.id,
        name: form.name,
        account_type: form.account_type === 'store_credit' ? 'digital_wallet' : form.account_type,
        institution: form.institution || null,
        currency: form.currency,
        initial_balance: balance,
        current_balance: balance,
        icon: accountTypeIcons[form.account_type] || '🏦',
        color: form.color,
        status: 'active',
        include_in_total: true
      });
      
      if (error) {
        setErrorStatus({ type: 'error', text: error.message });
      } else {
        setShowForm(false);
        setForm({ name: '', account_type: 'bank', institution: '', currency: 'ARS', initial_balance: '', color: '#3B82F6' });
        loadAccounts();
      }
    }
    setLoading(false);
  }

  function startEdit(account: Account) {
    setForm({
      name: account.name,
      account_type: account.icon === '🏪' ? 'store_credit' : account.account_type,
      institution: account.institution || '',
      currency: account.currency,
      initial_balance: account.initial_balance.toString(),
      color: account.color || '#3B82F6',
    });
    setEditingId(account.id);
    setShowForm(true);
  }

  async function deleteAccount(id: string) {
    if (!confirm('¿Eliminar esta cuenta? Se borrarán las transacciones asociadas.')) return;
    await supabase.from('accounts').delete().eq('id', id);
    loadAccounts();
  }

  if (loading) return <div className="spinner" />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Cuentas</h1>
          <p className="page-subtitle">{accounts.length} cuenta{accounts.length !== 1 ? 's' : ''} activa{accounts.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          <Plus size={18} /> Nueva
        </button>
      </div>

      {accounts.length === 0 ? (
        <div className="empty-state">
          <Wallet size={64} />
          <h3>Sin cuentas</h3>
          <p>Agregá tu primera cuenta bancaria, efectivo o billetera digital</p>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowForm(true)}>
            <Plus size={18} /> Agregar Cuenta
          </button>
        </div>
      ) : (
        <div className="accounts-grid">
          {accounts.map(account => (
            <div key={account.id} className="account-card" style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="account-icon-wrapper" style={{ background: account.color + '22', margin: 0 }}>
                    {account.icon}
                  </div>
                  <div className="account-info">
                    <div className="account-name">{account.name}</div>
                    <div className="account-institution">{account.institution || accountTypeLabels[account.icon === '🏪' ? 'store_credit' : account.account_type]}</div>
                  </div>
                </div>
                <div className="account-balance" style={{ margin: 0, color: Number(account.current_balance) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {formatMoney(Number(account.current_balance))}
                </div>
              </div>
              <div style={{ position: 'absolute', bottom: 4, right: 4, display: 'flex', gap: 4 }}>
                <button onClick={(e) => { e.stopPropagation(); startEdit(account); }} className="btn btn-ghost" style={{ padding: 4, minHeight: 'auto', opacity: 0.5 }}>
                  <Edit2 size={12} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); deleteAccount(account.id); }} className="btn btn-ghost" style={{ padding: 4, minHeight: 'auto', color: 'var(--danger)', opacity: 0.5 }}>
                  <X size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Account Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-header">
              <h2 className="modal-title">{editingId ? 'Editar Cuenta' : 'Nueva Cuenta'}</h2>
              <button className="modal-close" onClick={() => { setShowForm(false); setEditingId(null); setForm({ name: '', account_type: 'bank', institution: '', currency: 'ARS', initial_balance: '', color: '#3B82F6' }); }}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              {errorStatus && (
                <div style={{ 
                  padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13,
                  background: errorStatus.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                  color: errorStatus.type === 'success' ? 'var(--success)' : 'var(--danger)',
                  border: `1px solid ${errorStatus.type === 'success' ? 'var(--success)' : 'var(--danger)'}`
                }}>
                  {errorStatus.text}
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Nombre</label>
                <input className="form-input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Ej: Cuenta Santander" required />
              </div>
              <div className="form-group">
                <label className="form-label">Tipo</label>
                <select className="form-select" value={form.account_type} onChange={e => setForm({...form, account_type: e.target.value as any})}>
                  <option value="bank">Cuenta Bancaria</option>
                  <option value="cash">Efectivo</option>
                  <option value="digital_wallet">Billetera Digital</option>
                  <option value="investment">Inversión</option>
                  <option value="store_credit">Cuenta Corriente (Comercio)</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Institución</label>
                <input className="form-input" value={form.institution} onChange={e => setForm({...form, institution: e.target.value})} placeholder="Ej: Banco Santander" />
              </div>
              <div className="form-group">
                <label className="form-label">Moneda</label>
                <select className="form-select" value={form.currency} onChange={e => setForm({...form, currency: e.target.value})}>
                  <option value="ARS">ARS - Peso Argentino</option>
                  <option value="USD">USD - Dólar</option>
                  <option value="EUR">EUR - Euro</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Saldo Inicial</label>
                <input className="form-input" type="number" inputMode="decimal" step="0.01" value={form.initial_balance} onChange={e => setForm({...form, initial_balance: e.target.value})} placeholder="0" />
              </div>
              <div className="form-group">
                <label className="form-label">Color</label>
                <input type="color" value={form.color} onChange={e => setForm({...form, color: e.target.value})} style={{ width: 60, height: 40, border: 'none', background: 'none', cursor: 'pointer' }} />
              </div>
              <button type="submit" className="btn btn-primary btn-block btn-lg">
                {editingId ? 'Guardar Cambios' : 'Crear Cuenta'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
