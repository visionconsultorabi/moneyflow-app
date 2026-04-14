import { useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, CreditCard, Plus, PieChart, BarChart2, Settings, LogOut, Wallet, Target, RefreshCw, Menu, X, Sun, Moon, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export function Layout() {
  const { signOut } = useAuth();
  const { theme, toggleTheme, privacyMode, togglePrivacyMode } = useTheme();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();

  const getPageTitle = () => {
    switch(location.pathname) {
      case '/': return 'MoneyFlow';
      case '/accounts': return 'Cuentas';
      case '/cards': return 'Tarjetas';
      case '/transactions': return 'Transacciones';
      case '/reports': return 'Reportes';
      case '/budgets': return 'Presupuestos';
      case '/savings': return 'Ahorros';
      case '/recurring': return 'Recurrentes';
      case '/settings': return 'Configuración';
      case '/new-transaction': return 'Nueva Transacción';
      default: return 'MoneyFlow';
    }
  };

  return (
    <div className="app-layout">
      {/* Desktop Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span style={{ fontSize: 28 }}>💰</span>
          <h1>MoneyFlow</h1>
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/" end className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <LayoutDashboard size={20} />
            Dashboard
          </NavLink>
          <NavLink to="/accounts" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <Wallet size={20} />
            Cuentas
          </NavLink>
          <NavLink to="/cards" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <CreditCard size={20} />
            Tarjetas
          </NavLink>
          <NavLink to="/transactions" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <PieChart size={20} />
            Transacciones
          </NavLink>
          <NavLink to="/budgets" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <PieChart size={20} />
            Presupuestos
          </NavLink>
          <NavLink to="/reports" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <BarChart2 size={20} />
            Reportes
          </NavLink>
          <NavLink to="/savings" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <Target size={20} />
            Ahorros
          </NavLink>
          <NavLink to="/recurring" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <RefreshCw size={20} />
            Recurrentes
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <Settings size={20} />
            Configuración
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          <button onClick={togglePrivacyMode} className="sidebar-link" style={{ width: '100%', marginBottom: '4px' }}>
            {privacyMode ? <EyeOff size={20} /> : <Eye size={20} />}
            {privacyMode ? 'Mostrar Saldos' : 'Ocultar Saldos'}
          </button>
          <button onClick={toggleTheme} className="sidebar-link" style={{ width: '100%', marginBottom: '4px' }}>
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            {theme === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}
          </button>
          <button onClick={signOut} className="sidebar-link" style={{ width: '100%' }}>
            <LogOut size={20} />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Mobile Top Bar */}
      <header className="mobile-header">
        <div className="mobile-logo">
          {location.pathname === '/' && <span>💰</span>}
          <h1>{getPageTitle()}</h1>
        </div>
        <div className="mobile-actions">
          <button onClick={togglePrivacyMode} className="btn-icon">
            {privacyMode ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          <button onClick={toggleTheme} className="btn-icon">
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button onClick={() => setIsMenuOpen(true)} className="btn-icon">
            <Menu size={16} />
          </button>
        </div>
      </header>

      {/* Mobile Menu Drawer */}
      {isMenuOpen && (
        <div className="menu-overlay" onClick={() => setIsMenuOpen(false)}>
          <div className="menu-drawer" onClick={e => e.stopPropagation()}>
            <div className="menu-header">
              <h2>Menú</h2>
              <button onClick={() => setIsMenuOpen(false)} className="btn-icon">
                <X size={20} />
              </button>
            </div>
            <nav className="menu-nav">
              <NavLink to="/transactions" onClick={() => setIsMenuOpen(false)} className="menu-link">
                <PieChart size={20} /> Transacciones
              </NavLink>
              <NavLink to="/reports" onClick={() => setIsMenuOpen(false)} className="menu-link">
                <BarChart2 size={20} /> Reportes
              </NavLink>
              <NavLink to="/savings" onClick={() => setIsMenuOpen(false)} className="menu-link">
                <Target size={20} /> Ahorros
              </NavLink>
              <NavLink to="/recurring" onClick={() => setIsMenuOpen(false)} className="menu-link">
                <RefreshCw size={20} /> Recurrentes
              </NavLink>
              <NavLink to="/settings" onClick={() => setIsMenuOpen(false)} className="menu-link">
                <Settings size={20} /> Configuración
              </NavLink>
              <button onClick={() => { signOut(); setIsMenuOpen(false); }} className="menu-link" style={{ color: 'var(--danger)', marginTop: 'auto' }}>
                <LogOut size={20} /> Cerrar Sesión
              </button>
            </nav>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="main-content">
        <Outlet />
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="bottom-nav">
        <NavLink to="/" end className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}>
          <LayoutDashboard />
          <span>Inicio</span>
        </NavLink>
        <NavLink to="/accounts" className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}>
          <Wallet />
          <span>Cuentas</span>
        </NavLink>
        <NavLink to="/new-transaction" className="bottom-nav-add">
          <Plus />
        </NavLink>
        <NavLink to="/cards" className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}>
          <CreditCard />
          <span>Tarjetas</span>
        </NavLink>
        <NavLink to="/budgets" className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}>
          <PieChart />
          <span>Presupuestos</span>
        </NavLink>
      </nav>
    </div>
  );
}
