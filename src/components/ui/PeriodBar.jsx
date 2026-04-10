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

export default function PeriodBar({ period, onChange, options, from, to, onFromChange, onToChange }) {
  const showCustom = period === 'custom'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {options.map(o => (
          <button key={o.key} style={PILL(period === o.key)} onClick={() => onChange(o.key)}>
            {o.label}
          </button>
        ))}
        <button style={PILL(period === 'custom')} onClick={() => onChange('custom')}>📅</button>
      </div>
      {showCustom && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" value={from} onChange={e => onFromChange(e.target.value)} style={DATE_INPUT} />
          <span style={{ color: 'var(--dim)', flexShrink: 0 }}>—</span>
          <input type="date" value={to} onChange={e => onToChange(e.target.value)} style={DATE_INPUT} />
        </div>
      )}
    </div>
  )
}
