import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from 'recharts'
import PeriodBar from './ui/PeriodBar.jsx'
import StatCard from './ui/StatCard.jsx'
import {
  filterByPeriod, filterByRange, computeStats,
  getOrderItems, fmt, todayStr, CHART_TIP
} from '../utils/helpers.js'
import { CH_COLOR, STANDARD_PERIODS } from '../utils/constants.js'

// ── filter closedDays ให้อยู่ในช่วง period เดียวกับ orders ──────────────────
function filterClosedDays(closedDays, period, from, to) {
  if (!closedDays?.length) return []
  if (period === 'custom') {
    return closedDays.filter(d => d.date >= from && d.date <= to)
  }
  const now = new Date()
  if (period === 'today') {
    return closedDays.filter(d => d.date === todayStr)
  }
  if (period === 'yesterday') {
    const y = new Date(now);
    y.setDate(y.getDate() - 1)
    return closedDays.filter(d => d.date === y.toLocaleDateString('en-CA'))
  }
  if (period === '7d') {
    const d = new Date(now);
    d.setDate(d.getDate() - 7)
    const cutoff = d.toLocaleDateString('en-CA')
    return closedDays.filter(d => d.date >= cutoff)
  }
  if (period === '30d') {
    const d = new Date(now);
    d.setDate(d.getDate() - 30)
    const cutoff = d.toLocaleDateString('en-CA')
    return closedDays.filter(d => d.date >= cutoff)
  }
  if (period === '1y') {
    const d = new Date(now);
    d.setFullYear(d.getFullYear() - 1)
    const cutoff = d.toLocaleDateString('en-CA')
    return closedDays.filter(d => d.date >= cutoff)
  }
  return closedDays
}

export default function Overview({ allOrders, closedDays = [] }) {
  const [period, setPeriod] = useState('today')
  const [from, setFrom] = useState(todayStr)
  const [to, setTo]     = useState(todayStr)

  const orders = useMemo(() => {
    return period === 'custom'
      ? filterByRange(allOrders, from, to)
      : filterByPeriod(allOrders, period)
  }, [allOrders, period, from, to])

  const filteredClosedDays = useMemo(
    () => filterClosedDays(closedDays, period, from, to),
    [closedDays, period, from, to]
  )

  const s = useMemo(
    () => computeStats(orders, filteredClosedDays),
    [orders, filteredClosedDays]
  )

  const total = useMemo(() => orders.reduce((sum, r) => sum + (r.actual_amount || 0), 0), [orders])
  const avg   = orders.length ? Math.round(total / orders.length) : 0

  const todayTotal = useMemo(() => {
    const t = filterByPeriod(allOrders, 'today')
    return t.reduce((s, r) => s + (r.actual_amount || 0), 0)
  }, [allOrders])

  const dayCount = Object.keys(s.dailyMap).length || 1
  const dailyAvg = s.dailyAvg 

  // ── FIX LOGIC: คำนวณแยกยอด เงินสด / เงินโอน สำหรับ POS เท่านั้น ──────────────────
  const posDetails = useMemo(() => {
    // กรองเอาเฉพาะออเดอร์ที่เป็นของ POS จริงๆ (platform เป็น pos หรือไม่ระบุ)
    const posOrders = orders.filter(r => r.platform?.toLowerCase() === 'pos' || !r.platform)
    
    let cashRev = 0
    let transferRev = 0

    posOrders.forEach(r => {
      // คัดแยกประเภทเงินสด ส่วนที่เหลือในหน้าร้าน POS ให้ถือว่าเป็นเงินโอนของ POS
      if (r.payment_method?.toLowerCase() === 'cash' || r.payment_method === 'เงินสด') {
        cashRev += (r.actual_amount || 0)
      } else {
        transferRev += (r.actual_amount || 0)
      }
    })

    return { cashRev, transferRev }
  }, [orders])

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

  const closedSet = new Set(filteredClosedDays.map(d => d.date))

  return (
    <div style={S.page}>
      <PeriodBar
        period={period} onChange={setPeriod}
        options={STANDARD_PERIODS}
        from={from} to={to}
        onFromChange={setFrom} onToChange={setTo}
      />

      {/* Stats หลัก */}
      <div style={S.grid4}>
        <StatCard icon="💰" label="ยอดรับจริง" value={`฿${fmt(total)}`} color="var(--primary)" />
        <StatCard icon="🧾" label="ออเดอร์" value={fmt(orders.length)} unit="บิล" />
        <StatCard icon="📊" label="เฉลี่ย/บิล" value={avg ? `฿${fmt(avg)}` : '—'} />
        <StatCard icon="📅" label="วันนี้" value={`฿${fmt(todayTotal)}`} color="var(--success)" />
        <StatCard icon="📦" label="รายการทั้งหมด" value={fmt(totalItems)} unit="ชิ้น" />
        <StatCard icon="📈" label="เฉลี่ย/วันเปิด" value={dailyAvg ? `฿${fmt(dailyAvg)}` : '—'} color="var(--primary)" />
      </div>

      {/* Operating days summary */}
      {(s.operatingDaysCount > 0 || s.closedInPeriodCount > 0) && (
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
          gap: 8, marginBottom: 12,
        }}>
          <div style={S.miniCard}>
            <div style={{ fontSize: 10, color: 'var(--dim)', marginBottom: 4 }}>วันเปิดร้าน</div>
            <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--success)', fontFamily: "'Inter',sans-serif" }}>
              {s.operatingDaysCount}
            </div>
            <div style={{ fontSize: 10, color: 'var(--dim)' }}>วัน</div>
          </div>
          <div style={S.miniCard}>
            <div style={{ fontSize: 10, color: 'var(--dim)', marginBottom: 4 }}>วันหยุด</div>
            <div style={{ fontWeight: 800, fontSize: 18, color: '#FF453A', fontFamily: "'Inter',sans-serif" }}>
              {s.closedInPeriodCount}
            </div>
            <div style={{ fontSize: 10, color: 'var(--dim)' }}>วัน</div>
          </div>
          <div style={S.miniCard}>
            <div style={{ fontSize: 10, color: 'var(--dim)', marginBottom: 4 }}>เฉลี่ย/วันเปิด</div>
            <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--primary)', fontFamily: "'Inter',sans-serif" }}>
              {dailyAvg ? `฿${fmt(dailyAvg)}` : '—'}
            </div>
          </div>
        </div>
      )}

      {/* Platform */}
      <div style={S.section}>
        <div style={S.secTitle}>📡 Platform</div>
        {platforms.map(p => {
          const color = CH_COLOR[p.key] || '#888'
          const pct = total > 0 ? Math.round(p.rev / total * 100) : 0
          const avgBill = p.cnt > 0 ? Math.round(p.rev / p.cnt) : 0
          const isPOS = p.key.toLowerCase() === 'pos'

          return (
            <div key={p.key} style={{ borderBottom: '1px solid var(--border2)' }}>
              {/* แถวหลักของ Platform */}
              <div style={S.platformRow}>
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

              {/* แสดงยอดเงินสด/เงินโอน ย่อยลงมาเฉพาะ Platform POS */}
              {isPOS && (
                <div style={S.posBreakdown}>
                  <div style={S.posSubRow}>
                    <span>💵 เงินสด:</span>
                    <span style={S.posSubValue}>฿{fmt(posDetails.cashRev)}</span>
                  </div>
                  <div style={S.posSubRow}>
                    <span>📱 เงินโอน:</span>
                    <span style={S.posSubValue}>฿{fmt(posDetails.transferRev)}</span>
                  </div>
                </div>
              )}
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
        {dailyRows.map(([d, v]) => {
          const isClosed = closedSet.has(d)
          const closedInfo = filteredClosedDays.find(c => c.date === d)
          return (
            <div key={d} style={S.platformRow}>
              <span style={{ flex: 1, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                {new Date(d).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' })}
                {isClosed && (
                  <span style={{
                    fontSize: 10, color: '#FF453A',
                    background: 'rgba(255,69,58,0.1)',
                    padding: '1px 6px', borderRadius: 6,
                    border: '1px solid rgba(255,69,58,0.2)',
                  }}>
                    {closedInfo?.reason || 'หยุด'}
                  </span>
                )}
              </span>
              <span style={{
                color: isClosed ? 'var(--dim)' : 'var(--success)',
                fontWeight: 700,
                fontFamily: "'Inter',sans-serif",
              }}>
                ฿{fmt(v)}
              </span>
            </div>
          )
        })}
        {dailyRows.length === 0 && <div style={S.empty}>ยังไม่มีข้อมูล</div>}
      </div>
    </div>
  )
}

const S = {
  page:        { padding: '0 0 20px' },
  grid4:       { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 },
  miniCard:    {
    background: 'var(--surface)', borderRadius: 14,
    padding: '12px 10px', border: '1px solid var(--border)',
    textAlign: 'center',
  },
  section:     { background: 'var(--surface)', borderRadius: 18, padding: '14px 16px', marginBottom: 12, border: '1px solid var(--border)' },
  secTitle:    { fontSize: 12, color: 'var(--dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  platformRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }, // ดึง borderBottom ออกไปใส่ระดับ div คลุมด้านบนเพื่อให้กรุ๊ปข้อมูลสวยงาม
  empty:       { textAlign: 'center', color: 'var(--dim)', padding: '16px 0', fontSize: 13 },
  
  posBreakdown: { padding: '2px 0 10px 16px', display: 'flex', flexDirection: 'column', gap: 4 },
  posSubRow:    { display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--dim)' },
  posSubValue:  { fontWeight: 600, fontFamily: "'Inter',sans-serif" }
}
