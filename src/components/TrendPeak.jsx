import { useState, useMemo } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, Cell
} from 'recharts'
import PeriodBar from './ui/PeriodBar.jsx'
import StatCard from './ui/StatCard.jsx'
import { filterByPeriod, filterByRange, computeStats, getOrderItems, fmt, todayStr } from '../utils/helpers.js'
import { CH_COLOR, STANDARD_PERIODS } from '../utils/constants.js'

const TIP = {
  contentStyle: { background: '#1a1a1a', border: '1px solid #333', borderRadius: 8 },
  labelStyle: { color: '#fff' },
}

const DAY_NAMES_FULL  = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์', 'อาทิตย์']
const DAY_NAMES_SHORT = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา']

function isRealOrder(r) {
  return /\.\d{3,}/.test(r.created_at || '')
}

// ─── SUB TAB: แนวโน้ม ──────────────────────────────────────────────────────────
function TrendTab({ allOrders }) {
  const [period, setPeriod] = useState('7d')
  const [from, setFrom] = useState(todayStr)
  const [to, setTo]     = useState(todayStr)

  const orders = useMemo(() =>
    period === 'custom' ? filterByRange(allOrders, from, to) : filterByPeriod(allOrders, period),
    [allOrders, period, from, to]
  )

  const s       = useMemo(() => computeStats(orders), [orders])
  const total   = orders.reduce((sum, r) => sum + (r.actual_amount || 0), 0)
  const avg     = orders.length ? Math.round(total / orders.length) : 0
  const maxBill = orders.length ? Math.max(...orders.map(r => r.actual_amount || 0)) : 0

  // เทียบกับช่วงก่อน
  const { prevOrders, prevLabel } = useMemo(() => {
    const now = new Date()
    if (period === '7d') {
      const d1 = new Date(now); d1.setDate(d1.getDate() - 14)
      const d2 = new Date(now); d2.setDate(d2.getDate() - 7)
      return {
        prevOrders: allOrders.filter(r => { const d = new Date(r.created_at); return d >= d1 && d < d2 }),
        prevLabel: '7 วันก่อน',
      }
    }
    if (period === '30d') {
      const d1 = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const d2 = new Date(now.getFullYear(), now.getMonth(), 1)
      return {
        prevOrders: allOrders.filter(r => { const d = new Date(r.created_at); return d >= d1 && d < d2 }),
        prevLabel: 'เดือนที่แล้ว',
      }
    }
    if (period === '1y') {
      const d1 = new Date(now.getFullYear() - 1, 0, 1)
      const d2 = new Date(now.getFullYear(), 0, 1)
      return {
        prevOrders: allOrders.filter(r => { const d = new Date(r.created_at); return d >= d1 && d < d2 }),
        prevLabel: 'ปีที่แล้ว',
      }
    }
    return { prevOrders: [], prevLabel: '' }
  }, [allOrders, period])

  const prevTotal = prevOrders.reduce((s, r) => s + (r.actual_amount || 0), 0)
  const prevAvg   = prevOrders.length ? Math.round(prevTotal / prevOrders.length) : 0
  const diff      = total - prevTotal
  const pct       = prevTotal > 0 ? Math.round(diff / prevTotal * 100) : 0

  const chartData = useMemo(() => {
    const sorted = Object.keys(s.dailyMap).sort()
    if (period === '1y') {
      const monthly = {}
      sorted.forEach(d => { const k = d.slice(0, 7); monthly[k] = (monthly[k] || 0) + s.dailyMap[d] })
      return Object.keys(monthly).sort().slice(-12).map(k => {
        const [y, m] = k.split('-')
        return {
          label: new Date(+y, +m - 1).toLocaleDateString('th-TH', { month: 'short', year: '2-digit' }),
          value: monthly[k],
        }
      })
    }
    const n = period === '7d' ? 7 : 30
    return sorted.slice(-n).map(d => ({ label: d.split('-')[2], value: s.dailyMap[d] }))
  }, [s.dailyMap, period])

  const platforms = ['pos', 'grab', 'lineman', 'shopee']
    .filter(k => s.platformRev[k] > 0)
    .map(k => ({ key: k, rev: s.platformRev[k], cnt: s.platformCnt[k] }))

  const weekdayData = s.byWeekday.map((d, i) => ({
    day: DAY_NAMES_SHORT[i],
    avg: d.cnt ? Math.round(d.rev / d.cnt) : 0,
    cnt: d.cnt,
  }))
  const maxWd = Math.max(...weekdayData.map(d => d.avg), 1)

  return (
    <div>
      <PeriodBar period={period} onChange={setPeriod} options={STANDARD_PERIODS}
        from={from} to={to} onFromChange={setFrom} onToChange={setTo} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <StatCard icon="💰" label="ยอดรวม"   value={`฿${fmt(total)}`}  color="var(--success)" />
        <StatCard icon="📊" label="เฉลี่ย/บิล" value={avg ? `฿${fmt(avg)}` : '—'} />
        <StatCard icon="🧾" label="จำนวนบิล"  value={fmt(orders.length)} />
        <StatCard icon="🔝" label="บิลสูงสุด" value={maxBill ? `฿${fmt(maxBill)}` : '—'} />
      </div>

      {/* เทียบช่วงก่อน */}
      {prevOrders.length > 0 && (
        <div style={S.card}>
          <div style={S.cardTitle}>📊 เทียบกับ{prevLabel}</div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: 'var(--dim)' }}>ยอดรวม</div>
              <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "'Inter',sans-serif",
                color: diff >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {diff >= 0 ? '▲' : '▼'} {Math.abs(pct)}%
              </div>
              <div style={{ fontSize: 10, color: 'var(--dim)' }}>{prevLabel} ฿{fmt(prevTotal)}</div>
            </div>
            <div style={{ flex: 1, borderLeft: '1px solid var(--border2)', paddingLeft: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--dim)' }}>เฉลี่ย/บิล</div>
              <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "'Inter',sans-serif",
                color: avg >= prevAvg ? 'var(--success)' : 'var(--danger)' }}>
                {avg >= prevAvg ? '▲' : '▼'} {prevAvg > 0 ? Math.abs(Math.round((avg - prevAvg) / prevAvg * 100)) : 0}%
              </div>
              <div style={{ fontSize: 10, color: 'var(--dim)' }}>{prevLabel} ฿{fmt(prevAvg)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Line chart */}
      <div style={S.card}>
        <div style={S.cardTitle}>แนวโน้มยอดขาย</div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={chartData} margin={{ left: -10, right: 10 }}>
            <XAxis dataKey="label" tick={{ fill: '#555', fontSize: 10 }} />
            <YAxis tick={{ fill: '#555', fontSize: 9 }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v} />
            <Tooltip {...TIP} formatter={v => [`฿${fmt(v)}`, 'ยอดขาย']} />
            <Line type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2} dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Platform */}
      <div style={S.card}>
        <div style={S.cardTitle}>📡 Platform แยกช่วง</div>
        {platforms.map(p => {
          const color = CH_COLOR[p.key] || '#888'
          const pct = total > 0 ? Math.round(p.rev / total * 100) : 0
          return (
            <div key={p.key} style={S.row}>
              <div style={{ width: 64, color, fontWeight: 700, fontSize: 13 }}>{p.key.toUpperCase()}</div>
              <div style={{ flex: 1 }}>
                <div style={{ height: 4, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2 }} />
                </div>
              </div>
              <div style={{ textAlign: 'right', minWidth: 90 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color }}>฿{fmt(p.rev)}</div>
                <div style={{ fontSize: 10, color: 'var(--dim)' }}>{p.cnt} บิล</div>
              </div>
            </div>
          )
        })}
        {platforms.length === 0 && <div style={S.empty}>ยังไม่มีข้อมูล</div>}
      </div>

      {/* Weekday bar */}
      <div style={S.card}>
        <div style={S.cardTitle}>📅 วันไหนขายดีสุด (เฉลี่ย)</div>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={weekdayData} margin={{ left: -10, right: 10 }}>
            <XAxis dataKey="day" tick={{ fill: '#555', fontSize: 11 }} />
            <YAxis tick={{ fill: '#555', fontSize: 9 }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
            <Tooltip {...TIP} formatter={v => [`฿${fmt(v)}`, 'เฉลี่ย/บิล']} />
            <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
              {weekdayData.map((d, i) => (
                <Cell key={i} fill={d.avg === maxWd ? 'var(--success)' : 'rgba(50,215,75,0.25)'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ─── SUB TAB: ช่วงเวลา ─────────────────────────────────────────────────────────
function PeakTab({ allOrders }) {
  const [period, setPeriod] = useState('all')
  const [from, setFrom] = useState(todayStr)
  const [to, setTo]     = useState(todayStr)

  const realOrders   = useMemo(() => allOrders.filter(isRealOrder), [allOrders])
  const orders       = useMemo(() =>
    period === 'custom' ? filterByRange(allOrders, from, to) : filterByPeriod(allOrders, period),
    [allOrders, period, from, to]
  )
  const realFiltered = useMemo(() =>
    period === 'custom' ? filterByRange(realOrders, from, to) : filterByPeriod(realOrders, period),
    [realOrders, period, from, to]
  )

  const s     = useMemo(() => computeStats(orders), [orders])
  const sReal = useMemo(() => computeStats(realFiltered), [realFiltered])

  const maxHour   = Math.max(...sReal.byHour.map(h => h.orders), 1)
  const hourChart = sReal.byHour.map(h => ({
    label: `${String(h.hour).padStart(2, '0')}:00`,
    orders: h.orders,
    revenue: h.revenue,
  }))
  const topHours = [...sReal.byHour].filter(h => h.orders > 0)
    .sort((a, b) => b.orders - a.orders).slice(0, 5)

  const weekdayData = s.byWeekday.map((d, i) => ({
    day:     DAY_NAMES_SHORT[i],
    dayFull: DAY_NAMES_FULL[i],
    avg:     d.cnt ? Math.round(d.rev / d.cnt) : 0,
    cnt:     d.cnt,
  }))
  const maxWd = Math.max(...weekdayData.map(d => d.avg), 1)

  return (
    <div>
      <PeriodBar period={period} onChange={setPeriod} options={STANDARD_PERIODS}
        from={from} to={to} onFromChange={setFrom} onToChange={setTo} />

      {/* Hour bar chart */}
      <div style={S.card}>
        <div style={S.cardTitle}>⏰ ช่วงเวลาขายดี (ต่อชั่วโมง)</div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={hourChart} margin={{ left: -15, right: 5 }}>
            <XAxis dataKey="label" tick={{ fill: '#555', fontSize: 9 }} interval={2} />
            <YAxis tick={{ fill: '#555', fontSize: 9 }} />
            <Tooltip {...TIP} formatter={(v, name) => [
              name === 'orders' ? `${v} บิล` : `฿${fmt(v)}`,
              name === 'orders' ? 'ออเดอร์' : 'รายได้',
            ]} />
            <Bar dataKey="orders" radius={[3, 3, 0, 0]}>
              {hourChart.map((h, i) => (
                <Cell key={i} fill={h.orders === maxHour ? 'var(--primary)' : 'rgba(255,159,10,0.2)'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Top hours ranked */}
      <div style={S.card}>
        <div style={S.cardTitle}>🏆 อันดับชั่วโมง</div>
        {topHours.length > 0 ? topHours.map((h, i) => (
          <div key={h.hour} style={S.row}>
            <div style={{
              width: 20, fontWeight: 800, fontSize: 12,
              color: i === 0 ? '#FFD60A' : i === 1 ? '#8E8E93' : i === 2 ? '#CD7F32' : 'var(--dim)',
            }}>{i + 1}</div>
            <div style={{ width: 55, fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 13, color: 'var(--dim)' }}>
              {String(h.hour).padStart(2, '0')}:00
            </div>
            <div style={{ flex: 1, height: 4, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.round(h.orders / maxHour * 100)}%`, background: 'var(--primary)', borderRadius: 2 }} />
            </div>
            <div style={{ textAlign: 'right', minWidth: 80 }}>
              <div style={{ color: 'var(--primary)', fontWeight: 700, fontSize: 13 }}>{h.orders} บิล</div>
              <div style={{ fontSize: 10, color: 'var(--dim)' }}>฿{fmt(h.revenue)}</div>
            </div>
          </div>
        )) : <div style={S.empty}>ยังไม่มีข้อมูล</div>}
      </div>

      {/* Weekday bar chart */}
      <div style={S.card}>
        <div style={S.cardTitle}>📆 วันในสัปดาห์ (เฉลี่ย/บิล)</div>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={weekdayData} margin={{ left: -15, right: 5 }}>
            <XAxis dataKey="day" tick={{ fill: '#555', fontSize: 11 }} />
            <YAxis tick={{ fill: '#555', fontSize: 9 }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
            <Tooltip {...TIP} formatter={(v, name, props) => [`฿${fmt(v)} (${props.payload.cnt} วัน)`, 'เฉลี่ย/บิล']} />
            <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
              {weekdayData.map((d, i) => (
                <Cell key={i} fill={d.avg === maxWd ? 'var(--success)' : 'rgba(50,215,75,0.25)'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Weekday list */}
      <div style={S.card}>
        {weekdayData.map((d, i) => (
          <div key={i} style={S.row}>
            <div style={{ width: 52, fontSize: 13, fontWeight: 600 }}>{d.dayFull}</div>
            <div style={{ flex: 1, height: 4, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.round(d.avg / maxWd * 100)}%`, background: 'var(--primary)', borderRadius: 2 }} />
            </div>
            <div style={{ textAlign: 'right', minWidth: 90 }}>
              <div style={{ color: 'var(--primary)', fontWeight: 700, fontFamily: "'Inter',sans-serif", fontSize: 12 }}>฿{fmt(d.avg)}</div>
              <div style={{ fontSize: 10, color: 'var(--dim)' }}>{d.cnt} วัน</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── SUB TAB: เปรียบเทียบ ──────────────────────────────────────────────────────
const QUICK_PAIRS = [
  { key: 'week',    a: '7d',              b: 'prev7d'           },
  { key: 'month',   a: 'thisMonth',       b: 'lastMonth'        },
  { key: 'yoy',     a: 'thisMonth',       b: 'sameMonthLastYear' },
  { key: 'quarter', a: 'thisQ',           b: 'lastQ'            },
  { key: 'year',    a: 'thisYear',        b: 'lastYear'         },
  { key: 'today',   a: 'today',           b: 'yesterday'        },
]


// แปลง period key → label ภาษาไทยพร้อมปี เช่น "มีนาคม 2568"
function getPeriodLabel(period, fromDate, toDate) {
  const now = new Date()
  const thLocale = 'th-TH'
  const opts = { month: 'long', year: 'numeric' }

  if (period === 'today') {
    return now.toLocaleDateString(thLocale, { day: 'numeric', month: 'short', year: 'numeric' })
  }
  if (period === 'yesterday') {
    const y = new Date(now); y.setDate(y.getDate() - 1)
    return y.toLocaleDateString(thLocale, { day: 'numeric', month: 'short', year: 'numeric' })
  }
  if (period === '7d') {
    const d = new Date(now); d.setDate(d.getDate() - 7)
    return `${d.toLocaleDateString(thLocale, { day: 'numeric', month: 'short' })} – ${now.toLocaleDateString(thLocale, { day: 'numeric', month: 'short', year: 'numeric' })}`
  }
  if (period === 'prev7d') {
    const d2 = new Date(now); d2.setDate(d2.getDate() - 7)
    const d1 = new Date(now); d1.setDate(d1.getDate() - 14)
    return `${d1.toLocaleDateString(thLocale, { day: 'numeric', month: 'short' })} – ${d2.toLocaleDateString(thLocale, { day: 'numeric', month: 'short', year: 'numeric' })}`
  }
  if (period === '30d') {
    const d = new Date(now); d.setDate(d.getDate() - 30)
    return `${d.toLocaleDateString(thLocale, { day: 'numeric', month: 'short' })} – ${now.toLocaleDateString(thLocale, { day: 'numeric', month: 'short', year: 'numeric' })}`
  }
  if (period === 'prev30d') {
    const d2 = new Date(now); d2.setDate(d2.getDate() - 30)
    const d1 = new Date(now); d1.setDate(d1.getDate() - 60)
    return `${d1.toLocaleDateString(thLocale, { day: 'numeric', month: 'short' })} – ${d2.toLocaleDateString(thLocale, { day: 'numeric', month: 'short', year: 'numeric' })}`
  }
  if (period === 'thisMonth') {
    return new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString(thLocale, opts)
  }
  if (period === 'lastMonth') {
    return new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleDateString(thLocale, opts)
  }
  if (period === 'sameMonthLastYear') {
    return new Date(now.getFullYear() - 1, now.getMonth(), 1).toLocaleDateString(thLocale, opts)
  }
  if (period === 'thisQ') {
    const q = Math.floor(now.getMonth() / 3)
    return `ไตรมาส ${q + 1}/${now.getFullYear() + 543}`
  }
  if (period === 'lastQ') {
    const q = Math.floor(now.getMonth() / 3)
    const lq = q === 0 ? 3 : q
    const yr = q === 0 ? now.getFullYear() - 1 : now.getFullYear()
    return `ไตรมาส ${lq}/${yr + 543}`
  }
  if (period === 'thisYear') return `ปี ${now.getFullYear() + 543}`
  if (period === 'lastYear') return `ปี ${now.getFullYear() - 1 + 543}`
  if (period === 'custom' && fromDate && toDate) {
    const f = new Date(fromDate).toLocaleDateString(thLocale, { day: 'numeric', month: 'short', year: 'numeric' })
    const t = new Date(toDate).toLocaleDateString(thLocale, { day: 'numeric', month: 'short', year: 'numeric' })
    return fromDate === toDate ? f : `${f} – ${t}`
  }
  return period
}

// เพิ่ม period keys ใหม่ใน getCompareOrders
function getCompareOrders(allOrders, period) {
  const now = new Date()
  const toLocal = r => new Date(r.created_at).toLocaleDateString('en-CA')
  const todayStr = now.toLocaleDateString('en-CA')

  if (period === 'today')     return allOrders.filter(r => toLocal(r) === todayStr)
  if (period === 'yesterday') {
    const y = new Date(now); y.setDate(y.getDate() - 1)
    return allOrders.filter(r => toLocal(r) === y.toLocaleDateString('en-CA'))
  }
  if (period === '7d') {
    const d = new Date(now); d.setDate(d.getDate() - 7); d.setHours(0,0,0,0)
    return allOrders.filter(r => new Date(r.created_at) >= d)
  }
  if (period === 'prev7d') {
    const d1 = new Date(now); d1.setDate(d1.getDate() - 14); d1.setHours(0,0,0,0)
    const d2 = new Date(now); d2.setDate(d2.getDate() - 7);  d2.setHours(0,0,0,0)
    return allOrders.filter(r => { const d = new Date(r.created_at); return d >= d1 && d < d2 })
  }
  if (period === '30d') {
    const d = new Date(now); d.setDate(d.getDate() - 30); d.setHours(0,0,0,0)
    return allOrders.filter(r => new Date(r.created_at) >= d)
  }
  if (period === 'prev30d') {
    const d1 = new Date(now); d1.setDate(d1.getDate() - 60); d1.setHours(0,0,0,0)
    const d2 = new Date(now); d2.setDate(d2.getDate() - 30); d2.setHours(0,0,0,0)
    return allOrders.filter(r => { const d = new Date(r.created_at); return d >= d1 && d < d2 })
  }
  if (period === 'thisMonth') {
    const d = new Date(now.getFullYear(), now.getMonth(), 1)
    return allOrders.filter(r => new Date(r.created_at) >= d)
  }
  if (period === 'lastMonth') {
    const d1 = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const d2 = new Date(now.getFullYear(), now.getMonth(), 1)
    return allOrders.filter(r => { const d = new Date(r.created_at); return d >= d1 && d < d2 })
  }
  if (period === 'sameMonthLastYear') {
    const d1 = new Date(now.getFullYear() - 1, now.getMonth(), 1)
    const d2 = new Date(now.getFullYear() - 1, now.getMonth() + 1, 1)
    return allOrders.filter(r => { const d = new Date(r.created_at); return d >= d1 && d < d2 })
  }
  if (period === 'thisQ') {
    const q = Math.floor(now.getMonth() / 3)
    const d = new Date(now.getFullYear(), q * 3, 1)
    return allOrders.filter(r => new Date(r.created_at) >= d)
  }
  if (period === 'lastQ') {
    const q  = Math.floor(now.getMonth() / 3)
    const d1 = new Date(now.getFullYear(), (q - 1) * 3, 1)
    const d2 = new Date(now.getFullYear(), q * 3, 1)
    return allOrders.filter(r => { const d = new Date(r.created_at); return d >= d1 && d < d2 })
  }
  if (period === 'thisYear') {
    const d = new Date(now.getFullYear(), 0, 1)
    return allOrders.filter(r => new Date(r.created_at) >= d)
  }
  if (period === 'lastYear') {
    const d1 = new Date(now.getFullYear() - 1, 0, 1)
    const d2 = new Date(now.getFullYear(), 0, 1)
    return allOrders.filter(r => { const d = new Date(r.created_at); return d >= d1 && d < d2 })
  }
  if (period === 'custom') return []
  return allOrders
}

function CompareMetric({ label, valA, valB, format = v => v, labelA = 'A', labelB = 'B' }) {
  const diff = valA - valB
  const pct  = valB > 0 ? Math.round(diff / valB * 100) : null
  const up   = diff >= 0
  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border2)' }}>
      <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: 'var(--primary)', fontWeight: 700, marginBottom: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{labelA}</div>
          <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 800, fontSize: 20, color: '#fff' }}>{format(valA)}</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: '#888', fontWeight: 700, marginBottom: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{labelB}</div>
          <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 800, fontSize: 20, color: 'var(--dim)' }}>{format(valB)}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {pct !== null ? (
            <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 800, fontSize: 18,
              color: up ? 'var(--success)' : 'var(--danger)' }}>
              {up ? '▲' : '▼'} {Math.abs(pct)}%
            </div>
          ) : (
            <div style={{ color: 'var(--dim)', fontSize: 13 }}>—</div>
          )}
        </div>
      </div>
      {/* bar comparison */}
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[['A', valA, 'var(--primary)'], ['B', valB, '#444']].map(([lbl, val, color]) => {
          const max = Math.max(valA, valB, 1)
          return (
            <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 12, fontSize: 9, color: 'var(--dim)' }}>{lbl}</div>
              <div style={{ flex: 1, height: 4, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round(val / max * 100)}%`,
                  background: color, borderRadius: 2, transition: 'width 0.4s' }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TopMenuCompare({ ordersA, ordersB, labelA, labelB }) {
  const countMenu = (orders) => {
    const map = {}
    orders.forEach(o => {
      getOrderItems(o).forEach(item => {
        const n = item.name || '?'
        map[n] = (map[n] || 0) + (Number(item.qty) || 1)
      })
    })
    return map
  }
  const mapA = countMenu(ordersA)
  const mapB = countMenu(ordersB)
  const allMenus = [...new Set([...Object.keys(mapA), ...Object.keys(mapB)])]
    .sort((a, b) => ((mapA[b] || 0) + (mapB[b] || 0)) - ((mapA[a] || 0) + (mapB[a] || 0)))
    .slice(0, 8)

  if (!allMenus.length) return <div style={{ color: 'var(--dim)', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>ยังไม่มีข้อมูล</div>

  const maxVal = Math.max(...allMenus.map(m => Math.max(mapA[m] || 0, mapB[m] || 0)), 1)

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--primary)' }} />
          <span style={{ fontSize: 11, color: 'var(--dim)' }}>{labelA}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: '#444' }} />
          <span style={{ fontSize: 11, color: 'var(--dim)' }}>{labelB}</span>
        </div>
      </div>
      {allMenus.map(menu => {
        const a = mapA[menu] || 0
        const b = mapB[menu] || 0
        return (
          <div key={menu} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{menu}</span>
              <span style={{ fontSize: 11, color: 'var(--dim)' }}>{a} / {b}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {[[a, 'var(--primary)'], [b, '#444']].map(([val, color], i) => (
                <div key={i} style={{ height: 5, background: '#1a1a1a', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.round(val / maxVal * 100)}%`,
                    background: color, borderRadius: 3, transition: 'width 0.4s' }} />
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CompareTab({ allOrders }) {
  const [quickPair, setQuickPair] = useState(0)
  const [modeA, setModeA] = useState('7d')
  const [modeB, setModeB] = useState('prev7d')
  const [fromA, setFromA] = useState(todayStr)
  const [toA, setToA]     = useState(todayStr)
  const [fromB, setFromB] = useState(todayStr)
  const [toB, setToB]     = useState(todayStr)
  const [useCustom, setUseCustom] = useState(false)

  const ordersA = useMemo(() => useCustom
    ? filterByRange(allOrders, fromA, toA)
    : getCompareOrders(allOrders, modeA),
    [allOrders, useCustom, modeA, fromA, toA]
  )
  const ordersB = useMemo(() => useCustom
    ? filterByRange(allOrders, fromB, toB)
    : getCompareOrders(allOrders, modeB),
    [allOrders, useCustom, modeB, fromB, toB]
  )

  const statsA = useMemo(() => {
    const total = ordersA.reduce((s, r) => s + (r.actual_amount || 0), 0)
    const avg   = ordersA.length ? Math.round(total / ordersA.length) : 0
    return { total, avg, count: ordersA.length }
  }, [ordersA])

  const statsB = useMemo(() => {
    const total = ordersB.reduce((s, r) => s + (r.actual_amount || 0), 0)
    const avg   = ordersB.length ? Math.round(total / ordersB.length) : 0
    return { total, avg, count: ordersB.length }
  }, [ordersB])

  const labelA = useCustom ? getPeriodLabel('custom', fromA, toA) : getPeriodLabel(modeA)
  const labelB = useCustom ? getPeriodLabel('custom', fromB, toB) : getPeriodLabel(modeB)

  const handleQuickPair = (i) => {
    setQuickPair(i)
    setModeA(QUICK_PAIRS[i].a)
    setModeB(QUICK_PAIRS[i].b)
    setUseCustom(false)
  }

  const DATE_INPUT = {
    background: 'var(--surface2)', border: '1px solid var(--border2)',
    color: '#fff', borderRadius: 8, padding: '7px 10px',
    fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box',
  }

  return (
    <div>
      {/* Quick pairs */}
      <div style={S.card}>
        <div style={S.cardTitle}>⚡ เปรียบเทียบด่วน</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {QUICK_PAIRS.map((p, i) => (
            <button key={i} onClick={() => handleQuickPair(i)} style={{
              padding: '10px 14px', borderRadius: 10, border: 'none', textAlign: 'left',
              background: !useCustom && quickPair === i ? 'var(--primary)' : 'var(--surface2)',
              color: !useCustom && quickPair === i ? '#000' : 'var(--dim)',
              fontWeight: !useCustom && quickPair === i ? 700 : 400,
              fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <span style={{ fontWeight: 700 }}>{getPeriodLabel(p.a)}</span>
              <span style={{ opacity: 0.5, margin: '0 6px' }}>vs</span>
              <span>{getPeriodLabel(p.b)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Custom range */}
      <div style={S.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={S.cardTitle}>📅 กำหนดช่วงเอง</div>
          <button onClick={() => setUseCustom(true)} style={{
            background: useCustom ? 'var(--primary)' : 'var(--surface2)',
            color: useCustom ? '#000' : 'var(--dim)',
            border: 'none', borderRadius: 8, padding: '5px 12px',
            fontSize: 12, fontWeight: useCustom ? 700 : 400, cursor: 'pointer', fontFamily: 'inherit',
          }}>ใช้ช่วงนี้</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 700, marginBottom: 6 }}>🟠 ช่วง A</div>
            <input type="date" value={fromA} onChange={e => setFromA(e.target.value)} style={DATE_INPUT} />
            <div style={{ textAlign: 'center', color: 'var(--dim)', fontSize: 10, margin: '4px 0' }}>ถึง</div>
            <input type="date" value={toA} onChange={e => setToA(e.target.value)} style={DATE_INPUT} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#888', fontWeight: 700, marginBottom: 6 }}>⚪ ช่วง B</div>
            <input type="date" value={fromB} onChange={e => setFromB(e.target.value)} style={DATE_INPUT} />
            <div style={{ textAlign: 'center', color: 'var(--dim)', fontSize: 10, margin: '4px 0' }}>ถึง</div>
            <input type="date" value={toB} onChange={e => setToB(e.target.value)} style={DATE_INPUT} />
          </div>
        </div>
      </div>

      {/* Metrics comparison */}
      <div style={S.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--primary)', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 700 }}>{labelA}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: '#888', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#888', fontWeight: 700 }}>{labelB}</span>
            </div>
          </div>
        </div>
        <CompareMetric label="ยอดขายรวม" valA={statsA.total} valB={statsB.total}
          format={v => `฿${fmt(v)}`} labelA={labelA} labelB={labelB} />
        <CompareMetric label="จำนวนบิล" valA={statsA.count} valB={statsB.count}
          format={v => `${fmt(v)} บิล`} labelA={labelA} labelB={labelB} />
        <CompareMetric label="เฉลี่ย/บิล" valA={statsA.avg} valB={statsB.avg}
          format={v => `฿${fmt(v)}`} labelA={labelA} labelB={labelB} />
      </div>

      {/* Top menu compare */}
      <div style={S.card}>
        <div style={S.cardTitle}>🏆 เมนูขายดี เปรียบเทียบ</div>
        <TopMenuCompare ordersA={ordersA} ordersB={ordersB} labelA={labelA} labelB={labelB} />
      </div>
    </div>
  )
}


// ─── MAIN EXPORT ───────────────────────────────────────────────────────────────
const SUB_TABS = [
  { key: 'trend',   label: '📈 แนวโน้ม'     },
  { key: 'peak',    label: '⏰ ช่วงเวลา'   },
  { key: 'compare', label: '⚖️ เปรียบเทียบ' },
]

export default function TrendPeak({ allOrders }) {
  const [sub, setSub] = useState('trend')

  return (
    <div style={{ padding: '0 0 20px' }}>
      {/* Sub tab selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {SUB_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setSub(t.key)}
            style={{
              flex: 1, padding: '10px', borderRadius: 12, border: 'none',
              background: sub === t.key ? 'var(--primary)' : 'var(--surface2)',
              color: sub === t.key ? '#000' : 'var(--dim)',
              fontWeight: sub === t.key ? 700 : 400,
              fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {sub === 'trend'   && <TrendTab   allOrders={allOrders} />}
      {sub === 'peak'    && <PeakTab    allOrders={allOrders} />}
      {sub === 'compare' && <CompareTab allOrders={allOrders} />}
    </div>
  )
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const S = {
  card:      { background: 'var(--surface)', borderRadius: 18, padding: '14px 16px', marginBottom: 12, border: '1px solid var(--border)' },
  cardTitle: { fontSize: 12, color: 'var(--dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  row:       { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border2)' },
  empty:     { textAlign: 'center', color: 'var(--dim)', padding: '16px 0', fontSize: 13 },
}
