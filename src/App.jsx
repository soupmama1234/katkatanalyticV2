import { useState } from 'react'
import { useData } from './hooks/useData.js'
import { Toast, useToast } from './components/ui/Toast.jsx'
import Overview  from './components/Overview.jsx'
import TrendPeak from './components/TrendPeak.jsx'
import Expenses  from './components/Expenses.jsx'
import Income    from './components/Income.jsx'
import Recipe    from './components/Recipe.jsx'
import Customer  from './components/Customer.jsx'

// ─── Error Boundary ───────────────────────────────────────────────────────────
import { Component } from 'react'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, info) {
    console.error('KATKAT Analytics error:', error, info)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#000', padding: 24, gap: 16, textAlign: 'center',
        }}>
          <div style={{ fontSize: 48 }}>⚠️</div>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>เกิดข้อผิดพลาด</div>
          <div style={{ color: '#666', fontSize: 12, maxWidth: 280, lineHeight: 1.6 }}>
            {this.state.error?.message || 'Unknown error'}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              background: 'var(--primary)', color: '#000', border: 'none',
              borderRadius: 12, padding: '12px 24px',
              fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            ลองใหม่
          </button>
        </div>
      )
    }
    return this.props.children
  }
}



const TABS = [
  { key: 'overview',   icon: '📊', label: 'ภาพรวม'   },
  { key: 'trendpeak',  icon: '📈', label: 'แนวโน้ม'  },
  { key: 'expenses',   icon: '💸', label: 'ต้นทุน'   },
  { key: 'recipe',     icon: '🍳', label: 'สูตร'      },
  { key: 'income',     icon: '💚', label: 'รายได้อื่น' },
  { key: 'customer',   icon: '👥', label: 'ลูกค้า'   },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('overview')
  const { toast, showToast } = useToast()
  const {
    allOrders, products,
    expenses,    setExpenses,
    income,      setIncome,
    recipes,     setRecipes,
    actionNotes, setActionNotes,
    loading, error, refetch,
  } = useData()

  if (loading) return (
    <div style={FULL_CENTER}>
      <div style={SPINNER} />
      <div style={{ color: 'var(--primary)', fontSize: 12, letterSpacing: 3, marginTop: 16 }}>
        KATKAT ANALYTICS
      </div>
    </div>
  )

  if (error) return (
    <div style={{ ...FULL_CENTER, padding: 24, gap: 16 }}>
      <div style={{ fontSize: 40 }}>⚠️</div>
      <div style={{ color: 'var(--danger)', fontSize: 14, textAlign: 'center' }}>{error}</div>
      <button onClick={refetch} style={BTN_PRIMARY}>ลองใหม่</button>
    </div>
  )

  const renderPage = () => {
    switch (activeTab) {
      case 'overview':  return <Overview  allOrders={allOrders} />
      case 'trendpeak': return <TrendPeak allOrders={allOrders} />
      case 'expenses':  return <Expenses  expenses={expenses} setExpenses={setExpenses} allOrders={allOrders} actionNotes={actionNotes} setActionNotes={setActionNotes} />
      case 'income':    return <Income    income={income} setIncome={setIncome} />
      case 'recipe':    return <Recipe    recipes={recipes} setRecipes={setRecipes} products={products} expenses={expenses} />
      case 'customer':  return <Customer  allOrders={allOrders} />
      default:          return null
    }
  }

  const activeTabData = TABS.find(t => t.key === activeTab)

  return (
    <div style={SHELL}>
      <div style={TOPBAR}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--primary)', letterSpacing: 2 }}>KATKAT</div>
          <div style={{ fontSize: 10, color: 'var(--dim)', letterSpacing: 1 }}>Analytics</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>{activeTabData?.icon}</span>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{activeTabData?.label}</span>
        </div>
        <button onClick={refetch} style={{ background: 'none', border: 'none', color: 'var(--dim)', cursor: 'pointer', fontSize: 18, padding: 4 }} title="รีโหลด">
          🔄
        </button>
      </div>

      <div style={CONTENT} key={activeTab} className="fade-in">
        {renderPage()}
      </div>

      <nav style={BOTTOM_NAV}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} style={NAV_BTN(activeTab === t.key)}>
            <span style={{ fontSize: 20, lineHeight: 1 }}>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      <Toast toast={toast} />
    </div>
  )
}

const SHELL = {
  position: 'fixed', inset: 0,
  display: 'flex', flexDirection: 'column',
  background: 'var(--bg)',
  maxWidth: 500, margin: '0 auto', width: '100%',
}

const TOPBAR = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '12px 16px',
  paddingTop: 'calc(12px + env(safe-area-inset-top))',
  background: 'var(--surface)', borderBottom: '1px solid var(--border2)',
  flexShrink: 0,
}

const CONTENT = {
  flex: 1, overflowY: 'auto', overflowX: 'hidden',
  padding: '14px 16px',
  WebkitOverflowScrolling: 'touch',
  overscrollBehavior: 'contain',
}

const BOTTOM_NAV = {
  display: 'flex',
  background: 'rgba(18,18,18,0.97)',
  backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
  borderTop: '1px solid var(--border)',
  paddingBottom: 'env(safe-area-inset-bottom)',
  flexShrink: 0, overflowX: 'auto', scrollbarWidth: 'none',
}

const NAV_BTN = (active) => ({
  flex: '0 0 auto', minWidth: 64,
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
  background: 'none', border: 'none',
  color: active ? 'var(--primary)' : 'var(--dim)',
  fontFamily: 'inherit', fontSize: 9, fontWeight: active ? 700 : 500,
  padding: '8px 6px', cursor: 'pointer', transition: 'color 0.2s',
})

const FULL_CENTER = {
  position: 'fixed', inset: 0,
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  background: '#000',
}

const SPINNER = {
  width: 32, height: 32,
  border: '3px solid #222', borderTopColor: 'var(--primary)',
  borderRadius: '50%', animation: 'spin 1s linear infinite',
}

const BTN_PRIMARY = {
  background: 'var(--primary)', color: '#000', border: 'none',
  borderRadius: 12, padding: '12px 24px',
  fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
}
