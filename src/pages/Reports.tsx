import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { PieChart as RechartsPieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { BarChart2, Download } from 'lucide-react';

const formatMoney = (amount: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(amount);

export function Reports() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [expenseData, setExpenseData] = useState<{name: string, value: number, color: string}[]>([]);
  const [cashflowData, setCashflowData] = useState<{month: string, income: number, expense: number}[]>([]);
  
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const fullMonthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  useEffect(() => { if (user) loadData(); }, [user, month, year]);

  async function loadData() {
    setLoading(true);

    // 1. Load current month expenses by category
    const startOfMonth = new Date(year, month - 1, 1).toISOString();
    const endOfMonth = new Date(year, month, 0, 23, 59, 59).toISOString();

    const { data: monthTxs } = await supabase
      .from('transactions')
      .select('amount, type, category:categories(name, color)')
      .eq('type', 'expense')
      .gte('transaction_date', startOfMonth)
      .lte('transaction_date', endOfMonth);

    if (monthTxs) {
      const filteredMonthTxs = (monthTxs || []).filter((t: any) => !t.is_installment_purchase);
      const grouped: Record<string, { value: number, color: string }> = {};
      filteredMonthTxs.forEach(tx => {
        const cat: any = Array.isArray(tx.category) ? tx.category[0] : tx.category;
        const catName = cat?.name || 'Sin categoría';
        const color = cat?.color || '#9ca3af';
        if (!grouped[catName]) grouped[catName] = { value: 0, color };
        grouped[catName].value += Number(tx.amount);
      });
      const chartData: {name: string, value: number, color: string}[] = Object.entries(grouped)
        .map(([name, data]) => ({ name, value: data.value, color: data.color }))
        .sort((a, b) => b.value - a.value);
      setExpenseData(chartData);
    }

    // 2. Load last 6 months cashflow (income vs expense)
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    
    // Fetch normal transactions
    const { data: flowTxs } = await supabase
      .from('transactions')
      .select('amount, type, transaction_date')
      .in('type', ['expense', 'income'])
      .gte('transaction_date', sixMonthsAgo.toISOString());

    // Fetch installments for the last 6 months
    const { data: flowInsts } = await supabase
      .from('installments')
      .select('amount, due_month')
      .gte('due_month', sixMonthsAgo.toISOString().split('T')[0]);

    if (flowTxs) {
      const filteredFlowTxs = (flowTxs || []).filter((t: any) => !t.is_installment_purchase);
      const monthlyData: Record<string, { income: number, expense: number }> = {};
      
      // Initialize last 6 months
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthlyData[key] = { income: 0, expense: 0 };
      }

      filteredFlowTxs.forEach(tx => {
        const d = new Date(tx.transaction_date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (monthlyData[key]) {
          if (tx.type === 'income') monthlyData[key].income += Number(tx.amount);
          if (tx.type === 'expense') monthlyData[key].expense += Number(tx.amount);
        }
      });

      if (flowInsts) {
        flowInsts.forEach(inst => {
          const d = new Date(inst.due_month);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          if (monthlyData[key]) {
             // Installments are expenses
             monthlyData[key].expense += Number(inst.amount);
          }
        });
      }

      const flowChartData = Object.entries(monthlyData)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, data]) => {
          const [, m] = key.split('-');
          return {
            month: `${monthNames[parseInt(m) - 1]}`,
            income: data.income,
            expense: data.expense
          };
        });
      
      setCashflowData(flowChartData);
    }

    setLoading(false);
  }

  function exportToCSV() {
    if (expenseData.length === 0) return;
    const headers = ['Categoría', 'Monto', 'Color'];
    const rows = expenseData.map(d => [d.name, d.value, d.color]);
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `MoneyFlow_Reporte_${monthNames[month-1]}_${year}.csv`);
    document.body.appendChild(link);
    link.click();
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', padding: '8px 12px', borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
          <div style={{ fontWeight: 500, marginBottom: 4 }}>{payload[0].name || payload[0].payload.month}</div>
          {payload.map((p: any, i: number) => (
            <div key={i} style={{ color: p.fill || p.color }}>
              {p.dataKey === 'income' ? 'Ingresos: ' : p.dataKey === 'expense' ? 'Gastos: ' : ''}
              {formatMoney(p.value)}
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  if (loading) return <div className="spinner" />;

  const totalExpense = expenseData.reduce((s, d) => s + d.value, 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Reportes</h1>
          <p className="page-subtitle">Análisis de tus finanzas</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={exportToCSV} title="Exportar CSV">
            <Download size={20} /> <span className="hide-mobile" style={{ marginLeft: 8 }}>Exportar CSV</span>
          </button>
        </div>
      </div>

      {/* Cashflow Bar Chart (Last 6 Months) */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h2 className="section-title" style={{ marginBottom: 16 }}>Flujo de Caja (6 meses)</h2>
        <div style={{ height: 300, width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={cashflowData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-subtle)" />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} tickFormatter={(val) => `$${val/1000}k`} />
              <Tooltip cursor={{ fill: 'var(--bg-card)', opacity: 0.5 }} content={<CustomTooltip />} />
              <Bar dataKey="income" name="Ingresos" fill="var(--success)" radius={[4, 4, 0, 0]} maxBarSize={40} />
              <Bar dataKey="expense" name="Gastos" fill="var(--danger)" radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Category Expense Pie Chart */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 className="section-title" style={{ margin: 0 }}>Distribución de Gastos</h2>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => { if (month === 1) { setMonth(12); setYear(year - 1); } else setMonth(month - 1); }}>←</button>
            <span style={{ fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', margin: '0 8px' }}>
              {monthNames[month - 1]} {year}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => { if (month === 12) { setMonth(1); setYear(year + 1); } else setMonth(month + 1); }}>→</button>
          </div>
        </div>

        {expenseData.length === 0 ? (
          <div className="empty-state" style={{ padding: '32px 0' }}>
            <BarChart2 size={48} color="var(--text-muted)" />
            <p>No hay gastos registrados en {fullMonthNames[month - 1]}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ height: 250, width: '100%', position: 'relative' }}>
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie
                    data={expenseData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                  >
                    {expenseData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </RechartsPieChart>
              </ResponsiveContainer>
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Total Gastado</div>
                <div style={{ fontSize: 20, fontWeight: 600 }}>{formatMoney(totalExpense)}</div>
              </div>
            </div>

            {/* Legend */}
            <div style={{ width: '100%', marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
              {expenseData.map((d, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: d.color }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatMoney(d.value)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
