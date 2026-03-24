import { Outlet, NavLink } from 'react-router-dom';
import { LayoutDashboard, CreditCard, Plus, PieChart, BarChart2, Settings, LogOut, Wallet, Target, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function Layout() {
  const { signOut } = useAuth();

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
          <NavLink to="/reports" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <BarChart2 size={20} />
            Reportes
          </NavLink>
          <NavLink to="/budgets" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <PieChart size={20} />
            Presupuestos
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
          <button onClick={signOut} className="sidebar-link" style={{ width: '100%' }}>
            <LogOut size={20} />
            Cerrar Sesión
          </button>
        </div>
      </aside>

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
        <NavLink to="/cards" className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}>
          <CreditCard />
          <span>Tarjetas</span>
        </NavLink>
        <NavLink to="/new-transaction" className="bottom-nav-add">
          <Plus />
        </NavLink>
        <NavLink to="/budgets" className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}>
          <PieChart />
          <span>Presupuestos</span>
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}>
          <Settings />
          <span>Más</span>
        </NavLink>
      </nav>
    </div>
  );
}
