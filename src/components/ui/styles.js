// ── Shared UI constants ───────────────────────────────────────────────────────
// import ที่เดียว ใช้ได้ทุก component

export const INPUT = {
  background: 'var(--surface2)',
  border: '1px solid var(--border2)',
  color: '#fff',
  borderRadius: 10,
  padding: '11px 13px',
  fontSize: 14,
  outline: 'none',
  width: '100%',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}

export const CARD = {
  background: 'var(--surface)',
  borderRadius: 18,
  padding: '14px 16px',
  marginBottom: 12,
  border: '1px solid var(--border)',
}

export const CARD_TITLE = {
  fontSize: 12,
  color: 'var(--dim)',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  marginBottom: 12,
}

export const ROW = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 0',
  borderBottom: '1px solid var(--border2)',
}

export const EMPTY = {
  textAlign: 'center',
  color: 'var(--dim)',
  padding: '16px 0',
  fontSize: 13,
}

// Recharts tooltip style — ใช้ร่วมกันทุก chart
export const CHART_TIP = {
  contentStyle: { background: '#1a1a1a', border: '1px solid #333', borderRadius: 8 },
  labelStyle: { color: '#fff' },
}

// Bar ปุ่มตัวเลือก
export const PILL_BTN = (active, color = 'var(--primary)') => ({
  padding: '6px 14px',
  borderRadius: 20,
  border: 'none',
  background: active ? color : 'var(--surface2)',
  color: active ? '#000' : 'var(--dim)',
  fontWeight: active ? 700 : 400,
  fontSize: 12,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  fontFamily: 'inherit',
})
