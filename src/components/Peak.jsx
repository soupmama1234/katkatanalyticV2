import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell
} from 'recharts'
import PeriodBar from './ui/PeriodBar.jsx'
import { filterByPeriod, filterByRange, computeStats, fmt, todayStr } from '../utils/helpers.js'

const PERIOD_OPTIONS = [
  { key: 'all',   label: 'ทั้งหมด' },
  { key: 'today', label: 'วันนี้' },
  { key: 'week',  label: 'สัปดาห์นี้' },
  { key: '30d',   label: 'เดือนนี้' },
]

const DAY_NAMES_FULL = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์', 'อาทิตย์']
const DAY_NAMES_SHORT = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา']

const TIP = {
  contentStyle: { background: '#1a1a1a', border: '1px solid #333', borderRadius: 8 },
  labelStyle: { color: '#fff' },
}

// กรอง historical placeholder ออก (ดู microseconds)
function isRealOrder(r) {
  const ca = r.created_at || ''
  return /\.\d{3,}/.test(ca)
}

export default function Peak({ allOrders }) {
  const [period, setPeriod] = useState('all')
  const [from, setFrom]     = useState(todayStr)
  const [to, setTo]         = useState(todayStr)

  // hour chart ใช้เฉพาะ real orders (ไม่งั้นจะได้ 00:00 เยอะผิดปกติ)
  const realOrders = useMemo(() => allOrders.filter(isRealOrder), [allOrders])

  const orders = useMemo(() =>
    period === 'custom' ? filterByRange(allOrders, from, to) : filterByPeriod(allOrders, period),
    [allOrders, period, from, to]
  )
  const realFiltered = useMemo(() =>
    period === 'custom' ? filterByRange(realOrders, from, to) : filterByPeriod(realOrders, period),
    [realOrders, period, from, to]
  )

  const s      = useMemo(() => computeStats(orders), [orders])
  const sReal  = useMemo(() => computeStats(realFiltered), [realFiltered])

  // Hour data
  const hourData = sReal.byHour.filter(h => h.orders > 0)
  const maxHour  = Math.max(...sReal.byHour.map(h => h.orders), 1)
  const hourChart = sReal.byHour.map(h => ({ label: `${String(h.hour).padStart(2, '0')}:00`, orders: h.orders, revenue: h.revenue }))

  // Weekday
  const weekdayData = s.byWeekday.map((d, i) => ({
    day: DAY_NAMES_SHORT[i],
    avg: d.cnt ? Math.round(d.rev / d.cnt) : 0,
    cnt: d.cnt,
    dayFull: DAY_NAMES_FULL[i],
  }))
  const maxWd = Math.max(...weekdayData.map(d => d.avg), 1)

  // top 5 hours sorted
  const topHours = [...hourData].sort((a, b) => b.orders - a.orders).slice(0, 5)

  return (
    <div style={{ padding: '0 0 20px' }}>
      <PeriodBar
        period={period} onChange={setPeriod}
        options={PERIOD_OPTIONS}
        from={from} to={to}
        onFromChange={setFrom} onToChange={setTo}
      />

      {/* Hour chart */}
      <div style={S.section}>
        <div style={S.secTitle}>⏰ ช่วงเวลาขายดี (ต่อชั่วโมง)</div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={hourChart} margin={{ left: -15, right: 5 }}>
            <XAxis dataKey="label" tick={{ fill: '#555', fontSize: 9 }} interval={2} />
            <YAxis tick={{ fill: '#555', fontSize: 9 }} />
            <Tooltip
              {...TIP}
              formatter={(v, name) => [
                name === 'orders' ? `${v} บิล` : `฿${fmt(v)}`,
                name === 'orders' ? 'ออเดอร์' : 'รายได้',
              ]}
            />
            <Bar dataKey="orders" radius={[3, 3, 0, 0]}>
              {hourChart.map((h, i) => (
                <Cell key={i} fill={h.orders === maxHour ? 'var(--primary)' : 'rgba(255,159,10,0.2)'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Top hours ranked */}
      <div style={S.section}>
        <div style={S.secTitle}>🏆 อันดับชั่วโมง</div>
        {topHours.length > 0 ? topHours.map((h, i) => (
          <div key={h.label} style={S.row}>
            <div style={{ width: 20, color: i === 0 ? '#FFD60A' : i === 1 ? '#8E8E93' : i === 2 ? '#CD7F32' : 'var(--dim)', fontWeight: 800, fontSize: 12 }}>
              {i + 1}
            </div>
            <div style={{ width: 50, fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 13, color: 'var(--dim)' }}>
              {h.label}
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

      {/* Weekday chart */}
      <div style={S.section}>
        <div style={S.secTitle}>📆 วันในสัปดาห์ (เฉลี่ย/บิล)</div>
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
      <div style={S.section}>
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

const S = {
  section: { background: 'var(--surface)', borderRadius: 18, padding: '14px 16px', marginBottom: 12, border: '1px solid var(--border)' },
  secTitle: { fontSize: 12, color: 'var(--dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  row: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border2)' },
  empty: { textAlign: 'center', color: 'var(--dim)', padding: '16px 0', fontSize: 13 },
}
