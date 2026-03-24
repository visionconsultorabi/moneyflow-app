import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { LogOut, User, Shield, Bell, ChevronLeft, Save } from 'lucide-react';

type View = 'main' | 'profile' | 'security' | 'notifications';

export function Settings() {
  const { user, signOut } = useAuth();
  const [view, setView] = useState<View>('main');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Form states
  const [displayName, setDisplayName] = useState(user?.user_metadata?.display_name || '');
  const [passwords, setPasswords] = useState({ new: '', confirm: '' });
  const [notifs, setNotifs] = useState(() => {
    const saved = localStorage.getItem('mf_notifs');
    return saved ? JSON.parse(saved) : { reminders: true, alerts: true };
  });

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.updateUser({
      data: { display_name: displayName }
    });
    if (error) setMessage({ type: 'error', text: error.message });
    else setMessage({ type: 'success', text: 'Perfil actualizado' });
    setLoading(false);
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwords.new !== passwords.confirm) {
      setMessage({ type: 'error', text: 'Las contraseñas no coinciden' });
      return;
    }
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.updateUser({ password: passwords.new });
    if (error) setMessage({ type: 'error', text: error.message });
    else {
      setMessage({ type: 'success', text: 'Contraseña actualizada' });
      setPasswords({ new: '', confirm: '' });
    }
    setLoading(false);
  };

  const saveNotifs = (newNotifs: typeof notifs) => {
    setNotifs(newNotifs);
    localStorage.setItem('mf_notifs', JSON.stringify(newNotifs));
  };

  if (view === 'profile') {
    return (
      <div>
        <div className="section-header" style={{ marginBottom: 24 }}>
          <button onClick={() => setView('main')} className="btn btn-ghost" style={{ padding: 0, minWidth: 'auto' }}>
            <ChevronLeft />
          </button>
          <h2 className="section-title">Editar Perfil</h2>
          <div style={{ width: 24 }} />
        </div>

        <form onSubmit={handleUpdateProfile} className="card">
          {message && (
            <div style={{ 
              padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 14,
              background: message.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              color: message.type === 'success' ? 'var(--success)' : 'var(--danger)',
              border: `1px solid ${message.type === 'success' ? 'var(--success)' : 'var(--danger)'}`
            }}>
              {message.text}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Email (No editable)</label>
            <input type="text" className="form-input" value={user?.email} disabled style={{ opacity: 0.6 }} />
          </div>

          <div className="form-group">
            <label className="form-label">Nombre Completo</label>
            <input 
              type="text" 
              className="form-input" 
              value={displayName} 
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Tu nombre"
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            <Save size={18} /> {loading ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        </form>
      </div>
    );
  }

  if (view === 'security') {
    return (
      <div>
        <div className="section-header" style={{ marginBottom: 24 }}>
          <button onClick={() => setView('main')} className="btn btn-ghost" style={{ padding: 0, minWidth: 'auto' }}>
            <ChevronLeft />
          </button>
          <h2 className="section-title">Seguridad</h2>
          <div style={{ width: 24 }} />
        </div>

        <form onSubmit={handleUpdatePassword} className="card">
          {message && (
            <div style={{ 
              padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 14,
              background: message.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              color: message.type === 'success' ? 'var(--success)' : 'var(--danger)',
              border: `1px solid ${message.type === 'success' ? 'var(--success)' : 'var(--danger)'}`
            }}>
              {message.text}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Nueva Contraseña</label>
            <input 
              type="password" 
              className="form-input" 
              value={passwords.new} 
              onChange={e => setPasswords({ ...passwords, new: e.target.value })}
              placeholder="Mínimo 6 caracteres"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Confirmar Contraseña</label>
            <input 
              type="password" 
              className="form-input" 
              value={passwords.confirm} 
              onChange={e => setPasswords({ ...passwords, confirm: e.target.value })}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            <Shield size={18} /> {loading ? 'Actualizando...' : 'Cambiar Contraseña'}
          </button>
        </form>
      </div>
    );
  }

  if (view === 'notifications') {
    return (
      <div>
        <div className="section-header" style={{ marginBottom: 24 }}>
          <button onClick={() => setView('main')} className="btn btn-ghost" style={{ padding: 0, minWidth: 'auto' }}>
            <ChevronLeft />
          </button>
          <h2 className="section-title">Notificaciones</h2>
          <div style={{ width: 24 }} />
        </div>

        <div className="card">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Recordatorios Diarios</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Aviso para registrar tus gastos</div>
              </div>
              <input 
                type="checkbox" 
                checked={notifs.reminders} 
                onChange={e => saveNotifs({ ...notifs, reminders: e.target.checked })}
                style={{ width: 20, height: 20 }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Alertas de Vencimiento</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Avisos de tarjetas y cuotas</div>
              </div>
              <input 
                type="checkbox" 
                checked={notifs.alerts} 
                onChange={e => saveNotifs({ ...notifs, alerts: e.target.checked })}
                style={{ width: 20, height: 20 }}
              />
            </div>
          </div>
        </div>
        
        <p style={{ marginTop: 16, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
          Las notificaciones push requieren permisos del navegador.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header desktop-only">
        <h1 className="page-title">Configuración</h1>
      </div>

      {/* Profile Card Summary */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--primary-500), var(--primary-700))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, color: 'white', fontWeight: 700
          }}>
            {displayName?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{displayName || user?.email}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {user?.email}
            </div>
          </div>
        </div>
      </div>

      {/* Settings Items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="card" onClick={() => setView('profile')} style={{ cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <User size={20} color="var(--primary-500)" />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Perfil</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Editar información personal</div>
            </div>
          </div>
        </div>

        <div className="card" onClick={() => setView('notifications')} style={{ cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Bell size={20} color="var(--primary-500)" />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Notificaciones</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Configurar alertas y recordatorios</div>
            </div>
          </div>
        </div>

        <div className="card" onClick={() => setView('security')} style={{ cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Shield size={20} color="var(--primary-500)" />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Seguridad</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Cambiar contraseña</div>
            </div>
          </div>
        </div>
      </div>

      {/* App Info */}
      <div style={{ marginTop: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>💰</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>MoneyFlow</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 24 }}>Versión 1.0.0</div>

        <button onClick={signOut} className="btn btn-danger btn-block">
          <LogOut size={18} /> Cerrar Sesión
        </button>
      </div>
    </div>
  );
}
