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
    const y = new Date(now); y.setDate(y.getDate() - 1)
    return closedDays.filter(d => d.date === y.toLocaleDateString('en-CA'))
  }
  if (period === '7d') {
    const d = new Date(now); d.setDate(d.getDate() - 7)
    const cutoff = d.toLocaleDateString('en-CA')
    return closedDays.filter(d => d.date >= cutoff)
  }
  if (period === '30d') {
    const d = new Date(now); d.setDate(d.getDate() - 30)
    const cutoff = d.toLocaleDateString('en-CA')
    return closedDays.filter(d => d.date >= cutoff)
  }
  if (period === '1y') {
    const d = new Date(now); d.setFullYear(d.getFullYear() - 1)
    const cutoff = d.toLocaleDateString('en-CA')
    return closedDays.filter(d => d.date >= cutoff)
  }
  return closedDays
}

export default function Overview({ allOrders, closedDays = [], expenses = [] }) {
  const [period, setPeriod] = useState('today')
  const [from, setFrom] = useState(todayStr)
  const [to, setTo]     = useState(todayStr)

  const [showGpConfig, setShowGpConfig] = useState(false)
  const [gpRates, setGpRates] = useState({
    grab: 33.70,          
    lineman: 32.10,       
    shopee: 32.10,
    pos: 0.00,
    govSubsidy: 9.63      
  })

  const handleRateChange = (key, val) => {
    setGpRates(prev => ({ ...prev, [key]: Number(val) || 0 }))
  }

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

  const dailyAvg = s.dailyAvg

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

  const topMenu = Object.entries(s.menuCount)
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([name, qty]) => ({ name: name.length > 12 ? name.slice(0, 12) + '…' : name, qty, rev: s.menuRev[name] || 0 }))

  const { adsByPlatform, gpByPlatform } = useMemo(() => {
    const ads = {}
    const gp = {}

    const filteredExpenses =
      period === 'custom'
        ? filterByRange(expenses, from, to)
        : filterByPeriod(expenses, period)

    for (const e of filteredExpenses) {
      const cat = (e.category || '').toLowerCase().trim()
      let platform = (e.platform || 'pos').toLowerCase().trim()

      if (platform.includes('grab')) platform = 'grab'
      else if (platform.includes('line')) platform = 'lineman'
      else if (platform.includes('shopee')) platform = 'shopee'
      else platform = 'pos'

      if (cat.includes('ads')) {
        ads[platform] = (ads[platform] || 0) + (e.amount || 0)
      }
      if (cat.includes('gp')) {
        gp[platform] = (gp[platform] || 0) + (e.amount || 0)
      }
    }

    return { adsByPlatform: ads, gpByPlatform: gp }
  }, [expenses, period, from, to])

  const platforms = useMemo(() => {
    return ['pos', 'grab', 'lineman', 'shopee']
      .filter(k => (s.platformRev?.[k] || 0) > 0)
      .map(k => {
        const rev = s.platformRev?.[k] || 0
        const ads = adsByPlatform[k] || 0
        const gp  = gpByPlatform[k] || 0

        // 1. ดึงยอดโครงการรัฐ (🏛️) แยกตามแต่ละช่องทาง k ให้ชัดเจนในวันนั้นๆ
        // โดยตรวจสอบทั้งจาก subsidy และ transfer เผื่อระบบบันทึกต่างกัน
        const govSales = k === 'pos' ? 0 : (s.platformTransfer?.[k] || s.platformSubsidy?.[k] || 0)

        // 2. ป้องกันบั๊กข้ามวัน: ถ้ายอดโครงการรัฐโผล่มาเกินยอดขายรวมในวันนั้น ให้ปัดลงเท่ากับยอดขายรวม
        const finalGovSales = Math.min(rev, govSales)

        // 3. ยอดขายปกติที่ต้องคิดเรตแพลตฟอร์ม (เช่น 33.7% หรือ 32.1%)
        const normalSales = Math.max(0, rev - finalGovSales)

        // 4. ดึงเรต GP จาก State
        const normalGpRate = gpRates[k] || 0
        const govGpRate = gpRates.govSubsidy || 0

        // 5. คำนวณแยกส่วนขาดจากกันชัดเจน
        const gpOnNormal = Math.round(normalSales * (normalGpRate / 100))
        const gpOnGov    = Math.round(finalGovSales * (govGpRate / 100))

        // 6. รวมผลลัพธ์ Est.GP และ Est.Net
        const simulatedGpAmount = gpOnNormal + gpOnGov
        const simulatedNet = rev - ads - simulatedGpAmount

        return {
          key: k,
          rev,
          ads,
          gp,
          net: rev - ads - gp,
          simulatedGpAmount, // ค่า Est.GP ที่ถูกต้องตามป๊อปอัพวันที่จริง
          simulatedNet,      // ค่า Est.Net
          cnt: s.platformCnt?.[k] || 0,
          transfer: s.platformTransfer?.[k] || 0,
          subsidy: s.platformSubsidy?.[k] || 0,
          cash: k === 'pos' ? (s.posPayment?.cash || 0) : 0,
        }
      })
  }, [s, adsByPlatform, gpByPlatform, gpRates])

  const dailyRows = Object.entries(s.dailyMap)
    .sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14)

  const closedSet = new Set(filteredClosedDays.map(d => d.date))

  return (
    <div style={S.page}>
      <PeriodBar
        period={period} onChange={setPeriod}
        options={STANDARD_PERIODS}
        from={from} to={to}
        onFromChange={setFrom} onToChange={setTo}
      />

      <div style={S.grid4}>
        <StatCard icon="💰" label="ยอดรับจริง" value={`฿${fmt(total)}`} color="var(--primary)" />
        <StatCard icon="🧾" label="ออเดอร์" value={fmt(orders.length)} unit="บิล" />
        <StatCard icon="📊" label="เฉลี่ย/บิล" value={avg ? `฿${fmt(avg)}` : '—'} />
        <StatCard icon="📅" label="วันนี้" value={`฿${fmt(todayTotal)}`} color="var(--success)" />
        <StatCard icon="📦" label="รายการทั้งหมด" value={fmt(totalItems)} unit="ชิ้น" />
        <StatCard icon="📈" label="เฉลี่ย/วันเปิด" value={dailyAvg ? `฿${fmt(dailyAvg)}` : '—'} color="var(--primary)" />
      </div>

      {(s.operatingDaysCount > 0 || s.closedInPeriodCount > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
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

      {/* Platform Section */}
      <div style={S.section}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={S.secTitleNoMargin}>📡 Platform</div>
          <button 
            onClick={() => setShowGpConfig(!showGpConfig)} 
            style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
          >
            {showGpConfig ? '✖ ปิดตั้งค่า' : '⚙️ ตั้งค่า GP จำลอง'}
          </button>
        </div>

        {showGpConfig && (
          <div style={{ background: '#121212', borderRadius: 8, padding: 10, marginBottom: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, border: '1px solid #222' }}>
            {['grab', 'lineman', 'shopee'].map(k => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase' }}>{k} GP %:</span>
                <input 
                  type="number" 
                  step="0.01"
                  value={gpRates[k]} 
                  onChange={(e) => handleRateChange(k, e.target.value)}
                  style={{ width: 55, background: '#1a1a1a', border: '1px solid #333', borderRadius: 4, color: '#fff', fontSize: 11, textAlign: 'center', padding: '2px 0' }}
                />
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gridColumn: 'span 2', borderTop: '1px solid #222', paddingTop: 6, marginTop: 2 }}>
              <span style={{ fontSize: 11, color: '#FF9F0A' }}>ไทยช่วยไทยพลัส GP %:</span>
              <input 
                type="number" 
                step="0.01"
                value={gpRates.govSubsidy} 
                onChange={(e) => handleRateChange('govSubsidy', e.target.value)}
                style={{ width: 55, background: '#1a1a1a', border: '1px solid #333', borderRadius: 4, color: '#FF9F0A', fontSize: 11, textAlign: 'center', padding: '2px 0', fontWeight: 'bold' }}
              />
            </div>
          </div>
        )}

        {platforms.map(p => {
          const color = CH_COLOR[p.key] || '#888'
          const pct = total > 0 ? Math.round(p.rev / total * 100) : 0
          
          return (
            <div key={p.key} style={S.platformRow}>
              
              <div style={{ width: 68, color, fontWeight: 800, fontSize: 13, flexShrink: 0 }}>
                <div>{p.key.toUpperCase()}</div>
                <div style={{ fontSize: 10, color: 'var(--dim)', fontWeight: 400 }}>{p.cnt} บิล</div>
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ height: 5, background: '#1a1a1a', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.5s' }} />
                </div>
                <div style={{ marginTop: 5, fontSize: 10, color: 'var(--dim)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {p.cash > 0 && <span>💵 {fmt(p.cash)}</span>}
                  {p.transfer > 0 && <span>📱 {fmt(p.transfer)}</span>}
                  {p.subsidy > 0 && <span>🏛️ {fmt(p.subsidy)}</span>}
                </div>
              </div>

              <div style={{ textAlign: 'right', minWidth: 115 }}>
                <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 800, fontSize: 14, color }}>
                  ฿{fmt(p.rev)}
                </div>
                
                {/* 1. Ads จริง */}
                {p.ads > 0 && <div style={{ fontSize: 10, color: '#FF453A' }}>Ads จริง -{fmt(p.ads)}</div>}

                {/* 2. GP จริง */}
                {p.gp > 0 && <div style={{ fontSize: 10, color: '#FF9F0A' }}>GP จริง -{fmt(p.gp)}</div>}
                
                {/* 3. Gp est */}
                {p.key !== 'pos' && (
                  <div style={{ fontSize: 9, color: 'var(--dim)', fontStyle: 'italic' }}>
                    Est.GP -{fmt(p.simulatedGpAmount)}
                  </div>
                )}
                
                {/* 4. Est.Net / Net (สำหรับ POS) */}
                <div style={{ fontSize: 11, fontWeight: 800, color: p.key !== 'pos' ? 'var(--primary)' : '#FFFFFF', marginTop: 2 }}>
                  {p.key !== 'pos' ? `Est.Net ${fmt(p.simulatedNet)}` : `Net ${fmt(p.net)}`}
                </div>

                {/* 5. Net จริง */}
                {p.key !== 'pos' && p.gp > 0 && (
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#66BB6A', marginTop: 1 }}>
                    Net จริง {fmt(p.net)}
                  </div>
                )}
              </div>

            </div>
          )
        })}
        {platforms.length === 0 && <div style={S.empty}>ยังไม่มีข้อมูล</div>}
      </div>

      {/* ส่วนอื่นๆ คงเดิม */}
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
                  <span style={{ fontSize: 10, color: '#FF453A', background: 'rgba(255,69,58,0.1)', padding: '1px 6px', borderRadius: 6, border: '1px solid rgba(255,69,58,0.2)' }}>
                    {closedInfo?.reason || 'หยุด'}
                  </span>
                )}
              </span>
              <span style={{ color: isClosed ? 'var(--dim)' : 'var(--success)', fontWeight: 700, fontFamily: "'Inter',sans-serif" }}>
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
  miniCard:    { background: 'var(--surface)', borderRadius: 14, padding: '12px 10px', border: '1px solid var(--border)', textAlign: 'center' },
  section:     { background: 'var(--surface)', borderRadius: 18, padding: '14px 16px', marginBottom: 12, border: '1px solid var(--border)' },
  secTitle:    { fontSize: 12, color: 'var(--dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  secTitleNoMargin: { fontSize: 12, color: 'var(--dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 },
  platformRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border2)' },
  empty:       { textAlign: 'center', color: 'var(--dim)', padding: '16px 0', fontSize: 13 },
                         }
    
