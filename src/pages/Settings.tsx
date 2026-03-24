import { useAuth } from '../context/AuthContext';
import { LogOut, User, Shield, Bell } from 'lucide-react';

export function Settings() {
  const { user, signOut } = useAuth();

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Configuración</h1>
      </div>

      {/* Profile Card */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--primary-500), var(--primary-700))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, color: 'white', fontWeight: 700
          }}>
            {user?.email?.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{user?.email}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Cuenta creada el {new Date(user?.created_at || '').toLocaleDateString('es-AR')}
            </div>
          </div>
        </div>
      </div>

      {/* Settings Items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div className="card" style={{ cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <User size={20} color="var(--text-muted)" />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Perfil</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Editar información personal</div>
            </div>
          </div>
        </div>

        <div className="card" style={{ cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Bell size={20} color="var(--text-muted)" />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Notificaciones</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Configurar alertas y recordatorios</div>
            </div>
          </div>
        </div>

        <div className="card" style={{ cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Shield size={20} color="var(--text-muted)" />
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
