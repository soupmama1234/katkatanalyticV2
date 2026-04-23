// ── Shared constants & helpers สำหรับ expenses components ──────────────────
import { useState } from 'react'

export const INPUT = {
  background: 'var(--surface2)', border: '1px solid var(--border2)',
  color: '#fff', borderRadius: 10, padding: '11px 13px',
  fontSize: 14, outline: 'none', width: '100%',
  fontFamily: 'inherit', boxSizing: 'border-box',
}

export const MINI_CARD = {
  background: 'var(--surface)', borderRadius: 12,
  padding: '12px 14px', border: '1px solid var(--border)', textAlign: 'center',
}

export function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

// fuzzy score — ยิ่งสูงยิ่งตรง
function fuzzyScore(name, kw) {
  const n = name.toLowerCase().replace(/\s+/g, '')
  const k = kw.toLowerCase().replace(/\s+/g, '')
  if (!k) return 0
  if (n === k) return 100
  if (n.startsWith(k)) return 90
  if (n.includes(k)) return 80
  if (k.includes(n)) return 70
  // char overlap score
  const overlap = [...k].filter(c => n.includes(c)).length
  return Math.round(overlap / k.length * 60)
}

export function AutoComplete({ value, onChange, suggestions, placeholder }) {
  const [open, setOpen] = useState(false)
  const kw = (value || '').trim()
  const matches = kw.length === 0
    ? []
    : (suggestions || [])
        .map(s => ({ s, score: fuzzyScore(s, kw) }))
        .filter(({ score }) => score >= 40)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map(({ s }) => s)
  return (
    <div style={{ position: 'relative' }}>
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        style={INPUT}
      />
      {open && matches.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          background: '#1e1e1e', border: '1px solid #333',
          borderRadius: 10, zIndex: 100, maxHeight: 160, overflowY: 'auto', marginTop: 4,
        }}>
          {matches.map(m => (
            <div
              key={m}
              onMouseDown={() => onChange(m)}
              style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #2a2a2a' }}
            >
              {m}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
