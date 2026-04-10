import { useState, useMemo } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, Cell
} from 'recharts'
import PeriodBar from './ui/PeriodBar.jsx'
import StatCard from './ui/StatCard.jsx'
import { filterByPeriod, filterByRange, computeStats, fmt, todayStr } from '../utils/helpers.js'
import { CH_COLOR } from '../utils/constants.js'

const PERIOD_OPTIONS = [
  { key: '7d',  label: '7 วัน' },
  { key: '30d', label: '1 เดือน' },
  { key: '1y',  label: '1 ปี' },
]

const TIP = {
  contentStyle: { background: '#1a1a1a', border: '1px solid #333', borderRadius: 8 },
  labelStyle: { color: '#fff' },
}

export default function Trend({ allOrders }) {
  const [period, setPeriod] = useState('7d')
  const [from, setFrom]     = useState(todayStr)
  const [to, setTo]         = useState(todayStr)

  const orders = useMemo(() => {
    return period === 'custom' ? filterByRange(allOrders, from, to) : filterByPeriod(allOrders, period)
  }, [allOrders, period, from, to])

  const s = useMemo(() => computeStats(orders), [orders])
  const total = orders.reduce((sum, r) => sum + (r.actual_amount || 0), 0)
  const avg   = orders.length ? Math.round(total / orders.length) : 0
  const maxBill = orders.length ? Math.max(...orders.map(r => r.actual_amount || 0)) : 0

  // MoM comparison
  const { prevOrders, prevLabel } = useMemo(() => {
    const now = new Date()
    if (period === '7d') {
      const d1 = new Date(now); d1.setDate(d1.getDate() - 14)
      const d2 = new Date(now); d2.setDate(d2.getDate() - 7)
      return { prevOrders: allOrders.filter(r => { const d = new Date(r.created_at); return d >= d1 && d < d2 }), prevLabel: '7 วันก่อน' }
    }
    if (period === '30d') {
      const d1 = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const d2 = new Date(now.getFullYear(), now.getMonth(), 1)
      return { prevOrders: allOrders.filter(r => { const d = new Date(r.created_at); return d >= d1 && d < d2 }), prevLabel: 'เดือนที่แล้ว' }
    }
    if (period === '1y') {
      const d1 = new Date(now.getFullYear() - 1, 0, 1)
      const d2 = new Date(now.getFullYear(), 0, 1)
      return { prevOrders: allOrders.filter(r => { const d = new Date(r.created_at); return d >= d1 && d < d2 }), prevLabel: 'ปีที่แล้ว' }
    }
    return { prevOrders: [], prevLabel: '' }
  }, [allOrders, period])

  const prevTotal = prevOrders.reduce((s, r) => s + (r.actual_amount || 0), 0)
  const prevAvg   = prevOrders.length ? Math.round(prevTotal / prevOrders.length) : 0
  const diff      = total - prevTotal
  const pct       = prevTotal > 0 ? Math.round(diff / prevTotal * 100) : 0

  // Chart data
  const chartData = useMemo(() => {
    const sorted = Object.keys(s.dailyMap).sort()
    if (period === '1y') {
      const monthly = {}
      sorted.forEach(d => { const k = d.slice(0, 7); monthly[k] = (monthly[k] || 0) + s.dailyMap[d] })
      return Object.keys(monthly).sort().slice(-12).map(k => {
        const [y, m] = k.split('-')
        return { label: new Date(+y, +m - 1).toLocaleDateString('th-TH', { month: 'short', year: '2-digit' }), value: monthly[k] }
      })
    }
    const n = period === '7d' ? 7 : 30
    return sorted.slice(-n).map(d => ({
      label: d.split('-')[2],
      value: s.dailyMap[d],
    }))
  }, [s.dailyMap, period])

  // Platform
  const platforms = ['pos', 'grab', 'lineman', 'shopee']
    .filter(k => s.platformRev[k] > 0)
    .map(k => ({ key: k, rev: s.platformRev[k], cnt: s.platformCnt[k] }))

  // Weekday
  const dayNames = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา']
  const weekdayData = s.byWeekday.map((d, i) => ({
    day: dayNames[i], avg: d.cnt ? Math.round(d.rev / d.cnt) : 0, cnt: d.cnt
  }))
  const maxWd = Math.max(...weekdayData.map(d => d.avg), 1)

  return (
    <div style={{ padding: '0 0 20px' }}>
      <PeriodBar
        period={period} onChange={setPeriod}
        options={PERIOD_OPTIONS}
        from={from} to={to}
        onFromChange={setFrom} onToChange={setTo}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <StatCard icon="💰" label="ยอดรวม" value={`฿${fmt(total)}`} color="var(--success)" />
        <StatCard icon="📊" label="เฉลี่ย/บิล" value={avg ? `฿${fmt(avg)}` : '—'} />
        <StatCard icon="🧾" label="จำนวนบิล" value={fmt(orders.length)} />
        <StatCard icon="🔝" label="บิลสูงสุด" value={maxBill ? `฿${fmt(maxBill)}` : '—'} />
      </div>

      {/* MoM */}
      {prevOrders.length > 0 && (
        <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '14px 16px', marginBottom: 12, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 8 }}>📊 เทียบกับ{prevLabel}</div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: 'var(--dim)' }}>ยอดรวม</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: diff >= 0 ? 'var(--success)' : 'var(--danger)', fontFamily: "'Inter',sans-serif" }}>
                {diff >= 0 ? '▲' : '▼'} {Math.abs(pct)}%
              </div>
              <div style={{ fontSize: 10, color: 'var(--dim)' }}>{prevLabel} ฿{fmt(prevTotal)}</div>
            </div>
            <div style={{ flex: 1, borderLeft: '1px solid var(--border2)', paddingLeft: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--dim)' }}>เฉลี่ย/บิล</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: avg >= prevAvg ? 'var(--success)' : 'var(--danger)', fontFamily: "'Inter',sans-serif" }}>
                {avg >= prevAvg ? '▲' : '▼'} {prevAvg > 0 ? Math.abs(Math.round((avg - prevAvg) / prevAvg * 100)) : 0}%
              </div>
              <div style={{ fontSize: 10, color: 'var(--dim)' }}>{prevLabel} ฿{fmt(prevAvg)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Line chart */}
      <div style={{ background: 'var(--surface)', borderRadius: 18, padding: '14px 16px', marginBottom: 12, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 10 }}>แนวโน้มยอดขาย</div>
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
      <div style={{ background: 'var(--surface)', borderRadius: 18, padding: '14px 16px', marginBottom: 12, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 10 }}>📡 Platform แยกช่วง</div>
        {platforms.map(p => {
          const color = CH_COLOR[p.key] || '#888'
          const pct = total > 0 ? Math.round(p.rev / total * 100) : 0
          return (
            <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border2)' }}>
              <div style={{ width: 64, color, fontWeight: 700, fontSize: 13 }}>{p.key.toUpperCase()}</div>
              <div style={{ flex: 1 }}>
                <div style={{ height: 4, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2 }} />
                </div>
              </div>
              <div style={{ textAlign: 'right', minWidth: 90 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color }}> ฿{fmt(p.rev)}</div>
                <div style={{ fontSize: 10, color: 'var(--dim)' }}>{p.cnt} บิล</div>
              </div>
            </div>
          )
        })}
        {platforms.length === 0 && <div style={{ textAlign: 'center', color: 'var(--dim)', padding: '16px 0', fontSize: 13 }}>ยังไม่มีข้อมูล</div>}
      </div>

      {/* Weekday */}
      <div style={{ background: 'var(--surface)', borderRadius: 18, padding: '14px 16px', marginBottom: 12, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 10 }}>📅 วันไหนขายดีสุด (เฉลี่ย)</div>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={weekdayData} margin={{ left: -10, right: 10 }}>
            <XAxis dataKey="day" tick={{ fill: '#555', fontSize: 11 }} />
            <YAxis tick={{ fill: '#555', fontSize: 9 }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
            <Tooltip {...TIP} formatter={v => [`฿${fmt(v)}`, 'เฉลี่ย/วัน']} />
            <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
              {weekdayData.map((d, i) => <Cell key={i} fill={d.avg === maxWd ? 'var(--success)' : 'rgba(50,215,75,0.25)'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
