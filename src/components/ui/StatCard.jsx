export default function StatCard({ icon, label, value, unit, color = '#fff', sub }) {
  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 18,
      padding: '16px 14px', border: '1px solid var(--border)',
      textAlign: 'center', minWidth: 0,
    }}>
      {icon && <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>}
      <div style={{ color, fontWeight: 800, fontSize: 18, fontFamily: "'Inter', sans-serif", marginBottom: 2 }}>
        {value}{unit && <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 2 }}>{unit}</span>}
      </div>
      <div style={{ fontSize: 11, color: 'var(--dim)' }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}
