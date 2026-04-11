import { useState, useMemo } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, Cell
} from 'recharts'
import PeriodBar from './ui/PeriodBar.jsx'
import StatCard from './ui/StatCard.jsx'
import { filterByPeriod, filterByRange, computeStats, fmt, todayStr } from '../utils/helpers.js'
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

// ─── MAIN EXPORT ───────────────────────────────────────────────────────────────
const SUB_TABS = [
  { key: 'trend', label: '📈 แนวโน้ม' },
  { key: 'peak',  label: '⏰ ช่วงเวลา' },
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

      {sub === 'trend' && <TrendTab allOrders={allOrders} />}
      {sub === 'peak'  && <PeakTab  allOrders={allOrders} />}
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
