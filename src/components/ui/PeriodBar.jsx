import { useState } from 'react'

const PILL = (active) => ({
  padding: '6px 14px', borderRadius: 20, border: 'none',
  background: active ? 'var(--primary)' : 'var(--surface2)',
  color: active ? '#000' : 'var(--dim)',
  fontWeight: active ? 700 : 400,
  fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
  fontFamily: 'inherit',
})

const DATE_INPUT = {
  background: 'var(--surface2)', border: '1px solid var(--border2)',
  color: '#fff', borderRadius: 8, padding: '6px 8px', fontSize: 13,
  fontFamily: 'inherit', outline: 'none', flex: 1,
}

// Quick shortcuts สำหรับ custom range — กดครั้งเดียว
const SHORTCUTS = [
  {
    label: 'สัปดาห์นี้',
    get: () => {
      const now = new Date()
      const day = now.getDay(); const diff = day === 0 ? -6 : 1 - day
      const mon = new Date(now); mon.setDate(now.getDate() + diff)
      return { from: mon.toLocaleDateString('en-CA'), to: now.toLocaleDateString('en-CA') }
    }
  },
  {
    label: 'เดือนนี้',
    get: () => {
      const now = new Date()
      const first = new Date(now.getFullYear(), now.getMonth(), 1)
      return { from: first.toLocaleDateString('en-CA'), to: now.toLocaleDateString('en-CA') }
    }
  },
  {
    label: 'เดือนที่แล้ว',
    get: () => {
      const now = new Date()
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const last  = new Date(now.getFullYear(), now.getMonth(), 0)
      return { from: first.toLocaleDateString('en-CA'), to: last.toLocaleDateString('en-CA') }
    }
  },
  {
    label: 'ปีนี้',
    get: () => {
      const now = new Date()
      const first = new Date(now.getFullYear(), 0, 1)
      return { from: first.toLocaleDateString('en-CA'), to: now.toLocaleDateString('en-CA') }
    }
  },
  {
    label: 'ปีที่แล้ว',
    get: () => {
      const now = new Date()
      const first = new Date(now.getFullYear() - 1, 0, 1)
      const last  = new Date(now.getFullYear() - 1, 11, 31)
      return { from: first.toLocaleDateString('en-CA'), to: last.toLocaleDateString('en-CA') }
    }
  },
  {
    label: 'ไตรมาสนี้',
    get: () => {
      const now = new Date()
      const q = Math.floor(now.getMonth() / 3)
      const first = new Date(now.getFullYear(), q * 3, 1)
      return { from: first.toLocaleDateString('en-CA'), to: now.toLocaleDateString('en-CA') }
    }
  },
]

export default function PeriodBar({ period, onChange, options, from, to, onFromChange, onToChange }) {
  const showCustom = period === 'custom'
  const [showShortcuts, setShowShortcuts] = useState(false)

  const handleShortcut = (s) => {
    const { from: f, to: t } = s.get()
    onFromChange(f)
    onToChange(t)
    setShowShortcuts(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {options.map(o => (
          <button key={o.key} style={PILL(period === o.key)} onClick={() => onChange(o.key)}>
            {o.label}
          </button>
        ))}
        <button style={PILL(period === 'custom')} onClick={() => { onChange('custom'); setShowShortcuts(true) }}>📅</button>
      </div>

      {showCustom && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Date inputs */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="date" value={from} onChange={e => onFromChange(e.target.value)} style={DATE_INPUT} />
            <span style={{ color: 'var(--dim)', flexShrink: 0 }}>—</span>
            <input type="date" value={to} onChange={e => onToChange(e.target.value)} style={DATE_INPUT} />
          </div>

          {/* Shortcuts toggle */}
          <div>
            <button
              onClick={() => setShowShortcuts(p => !p)}
              style={{
                background: 'none', border: '1px solid var(--border2)',
                borderRadius: 8, padding: '4px 10px',
                color: 'var(--primary)', fontSize: 11, cursor: 'pointer',
                fontFamily: 'inherit', fontWeight: 600,
              }}
            >
              ⚡ ช่วงยอดนิยม {showShortcuts ? '▲' : '▼'}
            </button>

            {showShortcuts && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                {SHORTCUTS.map(s => (
                  <button
                    key={s.label}
                    onClick={() => handleShortcut(s)}
                    style={{
                      padding: '5px 12px', borderRadius: 20, border: 'none',
                      background: 'var(--surface2)', color: 'var(--dim)',
                      fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                    onMouseEnter={e => { e.target.style.background = 'var(--primary)'; e.target.style.color = '#000' }}
                    onMouseLeave={e => { e.target.style.background = 'var(--surface2)'; e.target.style.color = 'var(--dim)' }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
