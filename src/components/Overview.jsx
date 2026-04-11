import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from 'recharts'
import PeriodBar from './ui/PeriodBar.jsx'
import StatCard from './ui/StatCard.jsx'
import {
  filterByPeriod, filterByRange, computeStats,
  getOrderItems, fmt, todayStr
} from '../utils/helpers.js'
import { CH_COLOR, STANDARD_PERIODS } from '../utils/constants.js'

export default function Overview({ allOrders }) {
  const [period, setPeriod] = useState('today')
  const [from, setFrom] = useState(todayStr)
  const [to, setTo]     = useState(todayStr)

  const orders = useMemo(() => {
    return period === 'custom'
      ? filterByRange(allOrders, from, to)
      : filterByPeriod(allOrders, period)
  }, [allOrders, period, from, to])

  const s = useMemo(() => computeStats(orders), [orders])

  const total = useMemo(() => orders.reduce((sum, r) => sum + (r.actual_amount || 0), 0), [orders])
  const avg   = orders.length ? Math.round(total / orders.length) : 0

  const todayTotal = useMemo(() => {
    const t = filterByPeriod(allOrders, 'today')
    return t.reduce((s, r) => s + (r.actual_amount || 0), 0)
  }, [allOrders])

  const dayCount = Object.keys(s.dailyMap).length || 1
  const dailyAvg = Math.round(total / dayCount)

  // item count
  let totalItems = 0
  const menuT = {}
  orders.forEach(r => {
    getOrderItems(r).forEach(item => {
      const n = item.name || 'ไม่ระบุ'
      const q = Number(item.qty || 1)
      totalItems += q
      if (!menuT[n]) menuT[n] = { qty: 0, mods: {} }
      menuT[n].qty += q
      const mod = item.selectedModifier?.name || item.modifier_name || null
      if (mod) menuT[n].mods[mod] = (menuT[n].mods[mod] || 0) + q
    })
  })

  // top menu for chart
  const topMenu = Object.entries(s.menuCount)
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([name, qty]) => ({ name: name.length > 12 ? name.slice(0, 12) + '…' : name, qty, rev: s.menuRev[name] || 0 }))

  // platform
  const platforms = ['pos', 'grab', 'lineman', 'shopee']
    .filter(k => s.platformRev[k] > 0)
    .map(k => ({ key: k, rev: s.platformRev[k], cnt: s.platformCnt[k] }))

  // daily history
  const dailyRows = Object.entries(s.dailyMap)
    .sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14)

  // modifier
  const modCount = {}
  orders.forEach(r => {
    getOrderItems(r).forEach(item => {
      const mod = item.selectedModifier?.name || item.modifier_name || null
      if (mod) modCount[mod] = (modCount[mod] || 0) + (Number(item.qty) || 1)
    })
  })
  const topMods = Object.entries(modCount).sort((a, b) => b[1] - a[1]).slice(0, 8)

  return (
    <div style={S.page}>
      <PeriodBar
        period={period} onChange={setPeriod}
        options={STANDARD_PERIODS}
        from={from} to={to}
        onFromChange={setFrom} onToChange={setTo}
      />

      {/* Stats */}
      <div style={S.grid4}>
        <StatCard icon="💰" label="ยอดรับจริง" value={`฿${fmt(total)}`} color="var(--primary)" />
        <StatCard icon="🧾" label="ออเดอร์" value={fmt(orders.length)} unit="บิล" />
        <StatCard icon="📊" label="เฉลี่ย/บิล" value={avg ? `฿${fmt(avg)}` : '—'} />
        <StatCard icon="📅" label="วันนี้" value={`฿${fmt(todayTotal)}`} color="var(--success)" />
        <StatCard icon="📦" label="รายการทั้งหมด" value={fmt(totalItems)} unit="ชิ้น" />
        <StatCard icon="📈" label="เฉลี่ย/วัน" value={dailyAvg ? `฿${fmt(dailyAvg)}` : '—'} />
      </div>

      {/* Platform */}
      <div style={S.section}>
        <div style={S.secTitle}>📡 Platform</div>
        {platforms.map(p => {
          const color = CH_COLOR[p.key] || '#888'
          const pct = total > 0 ? Math.round(p.rev / total * 100) : 0
          const avgBill = p.cnt > 0 ? Math.round(p.rev / p.cnt) : 0
          return (
            <div key={p.key} style={S.platformRow}>
              <div style={{ width: 64, color, fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                {p.key.toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ height: 4, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.5s' }} />
                </div>
              </div>
              <div style={{ textAlign: 'right', minWidth: 90 }}>
                <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 13, color }}>฿{fmt(p.rev)}</div>
                <div style={{ fontSize: 10, color: 'var(--dim)' }}>{p.cnt} บิล · ฿{fmt(avgBill)}/บิล</div>
              </div>
            </div>
          )
        })}
        {platforms.length === 0 && <div style={S.empty}>ยังไม่มีข้อมูล</div>}
      </div>

      {/* Top menu chart */}
      <div style={S.section}>
        <div style={S.secTitle}>🏆 เมนูขายดี Top 10</div>
        {topMenu.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={topMenu} layout="vertical" margin={{ left: 0, right: 10 }}>
              <XAxis type="number" tick={{ fill: '#555', fontSize: 10 }} tickFormatter={v => fmt(v)} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#ccc', fontSize: 11 }} width={100} />
              <Tooltip
                formatter={(v, name) => [fmt(v), name === 'qty' ? 'จำนวน' : 'รายได้']}
                contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 8 }}
                labelStyle={{ color: '#fff' }}
              />
              <Bar dataKey="qty" radius={[0, 4, 4, 0]}>
                {topMenu.map((_, i) => <Cell key={i} fill={i === 0 ? '#FF9F0A' : i < 3 ? '#FF9F0A99' : '#333'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : <div style={S.empty}>ยังไม่มีข้อมูล</div>}
      </div>

      {/* Modifier */}
      {topMods.length > 0 && (
        <div style={S.section}>
          <div style={S.secTitle}>⚙️ Add-on / Modifier ยอดนิยม</div>
          {topMods.map(([mod, cnt], i) => (
            <div key={mod} style={S.platformRow}>
              <div style={{ width: 20, color: i < 3 ? 'var(--primary)' : 'var(--dim)', fontWeight: 800, fontSize: 12 }}>{i + 1}</div>
              <div style={{ flex: 1, fontSize: 13 }}>{mod}</div>
              <div style={{ color: '#4D96FF', fontWeight: 700, fontSize: 13 }}>{fmt(cnt)} ครั้ง</div>
            </div>
          ))}
        </div>
      )}

      {/* Categories */}
      <div style={S.section}>
        <div style={S.secTitle}>📂 แยกหมวดหมู่</div>
        {Object.entries(s.catRev).sort((a, b) => b[1] - a[1]).map(([cat, rev]) => {
          const maxCat = Math.max(...Object.values(s.catRev))
          return (
            <div key={cat} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{cat}</span>
                <span style={{ color: 'var(--success)', fontWeight: 700, fontFamily: "'Inter',sans-serif" }}>฿{fmt(rev)}</span>
              </div>
              <div style={{ height: 3, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round(rev / maxCat * 100)}%`, background: 'var(--success)', borderRadius: 2 }} />
              </div>
              <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 2 }}>{s.catCnt[cat]} รายการ</div>
            </div>
          )
        })}
        {Object.keys(s.catRev).length === 0 && <div style={S.empty}>ยังไม่มีข้อมูล</div>}
      </div>

      {/* All items */}
      <div style={S.section}>
        <div style={S.secTitle}>🧾 รายการที่ขายได้</div>
        {Object.entries(menuT).sort((a, b) => b[1].qty - a[1].qty).map(([name, d]) => {
          const mods = Object.entries(d.mods).map(([m, q]) => `⚙️ ${m} ×${q}`).join('  ')
          return (
            <div key={name} style={{ padding: '10px 0', borderBottom: '1px solid var(--border2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{name}</span>
                <span style={{ color: 'var(--success)', fontWeight: 700, fontFamily: "'Inter',sans-serif" }}>×{d.qty}</span>
              </div>
              {mods && <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 2 }}>{mods}</div>}
            </div>
          )
        })}
        {Object.keys(menuT).length === 0 && <div style={S.empty}>ยังไม่มีข้อมูล</div>}
      </div>

      {/* Daily history */}
      <div style={S.section}>
        <div style={S.secTitle}>📅 ประวัติรายวัน</div>
        {dailyRows.map(([d, v]) => (
          <div key={d} style={S.platformRow}>
            <span style={{ flex: 1, fontSize: 13 }}>
              {new Date(d).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' })}
            </span>
            <span style={{ color: 'var(--success)', fontWeight: 700, fontFamily: "'Inter',sans-serif" }}>฿{fmt(v)}</span>
          </div>
        ))}
        {dailyRows.length === 0 && <div style={S.empty}>ยังไม่มีข้อมูล</div>}
      </div>
    </div>
  )
}

const S = {
  page: { padding: '0 0 20px' },
  grid4: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 },
  section: { background: 'var(--surface)', borderRadius: 18, padding: '14px 16px', marginBottom: 12, border: '1px solid var(--border)' },
  secTitle: { fontSize: 12, color: 'var(--dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  platformRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border2)' },
  empty: { textAlign: 'center', color: 'var(--dim)', padding: '16px 0', fontSize: 13 },
}
