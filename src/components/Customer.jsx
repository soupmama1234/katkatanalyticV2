import { useState, useMemo } from 'react'
import { PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import PeriodBar from './ui/PeriodBar.jsx'
import { filterByPeriod, filterByRange, fmt, todayStr } from '../utils/helpers.js'
import { STANDARD_PERIODS } from '../utils/constants.js'

const CUST_TABS = ['ภาพรวม', 'ลูกค้าใหม่', 'ลูกค้าประจำ']
const TIP = { contentStyle: { background: '#1a1a1a', border: '1px solid #333', borderRadius: 8 }, labelStyle: { color: '#fff' } }
const DAY_NAMES = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์', 'อาทิตย์']

function getCustomerOrders(orders) {
  const posOrders = orders.filter(o => o.channel === 'pos')
  const member    = posOrders.filter(o => o.member_phone)
  const nonMember = posOrders.filter(o => !o.member_phone)
  const newOrders    = nonMember.filter(o => o.customer_type === 'new')
  const repeatOrders = nonMember.filter(o => o.customer_type === 'repeat')
  const unknown      = nonMember.filter(o => !o.customer_type)
  return { posOrders, member, newOrders, repeatOrders, unknown }
}

export default function Customer({ allOrders }) {
  const [period, setPeriod] = useState('today')
  const [from, setFrom]     = useState(todayStr)
  const [to, setTo]         = useState(todayStr)
  const [custTab, setCustTab] = useState('ภาพรวม')

  const orders = useMemo(() =>
    period === 'custom' ? filterByRange(allOrders, from, to) : filterByPeriod(allOrders, period),
    [allOrders, period, from, to]
  )

  const { posOrders, member, newOrders, repeatOrders, unknown } = useMemo(() => getCustomerOrders(orders), [orders])

  return (
    <div style={{ padding: '0 0 20px' }}>
      <PeriodBar period={period} onChange={setPeriod} options={STANDARD_PERIODS} from={from} to={to} onFromChange={setFrom} onToChange={setTo} />

      {/* sub tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {CUST_TABS.map(t => (
          <button key={t} onClick={() => setCustTab(t)} style={{
            padding: '7px 14px', borderRadius: 20, border: 'none',
            background: custTab === t ? 'var(--primary)' : 'var(--surface2)',
            color: custTab === t ? '#000' : 'var(--dim)',
            fontWeight: custTab === t ? 700 : 400, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
          }}>{t}</button>
        ))}
      </div>

      {custTab === 'ภาพรวม'      && <CustOverview orders={posOrders} member={member} newOrders={newOrders} repeatOrders={repeatOrders} unknown={unknown} />}
      {custTab === 'ลูกค้าใหม่'   && <CustNew newOrders={newOrders} />}
      {custTab === 'ลูกค้าประจำ'  && <CustRepeat repeatOrders={repeatOrders} />}
    </div>
  )
}

// ─── Overview ─────────────────────────────────────────────────────────────────
function CustOverview({ orders, member, newOrders, repeatOrders, unknown }) {
  const COLORS = ['#FF9F0A', '#32D74B', '#4D96FF', '#3a3a3a']
  const pieData = [
    { name: 'Member',     value: member.length },
    { name: 'ลูกค้าใหม่',  value: newOrders.length },
    { name: 'ลูกค้าประจำ', value: repeatOrders.length },
    { name: 'ไม่ระบุ',     value: unknown.length },
  ].filter(d => d.value > 0)

  const avgOf = arr => arr.length ? Math.round(arr.reduce((s, o) => s + (o.actual_amount || 0), 0) / arr.length) : 0

  const rows = [
    { label: '👤 Member',    color: '#FF9F0A', cnt: member.length,    avg: avgOf(member)    },
    { label: '🆕 ลูกค้าใหม่', color: '#32D74B', cnt: newOrders.length,    avg: avgOf(newOrders)    },
    { label: '🔄 ลูกค้าประจำ', color: '#4D96FF', cnt: repeatOrders.length, avg: avgOf(repeatOrders) },
    { label: '❓ ไม่ระบุ',   color: '#555',    cnt: unknown.length,  avg: avgOf(unknown)  },
  ]
  const maxAvg = Math.max(...rows.map(r => r.avg), 1)

  // daily breakdown
  const days = {}
  orders.forEach(o => {
    const d = new Date(o.created_at).toLocaleDateString('en-CA')
    if (!days[d]) days[d] = { member: 0, new: 0, repeat: 0, unknown: 0 }
    if (o.member_phone) days[d].member++
    else if (o.customer_type === 'new') days[d].new++
    else if (o.customer_type === 'repeat') days[d].repeat++
    else days[d].unknown++
  })
  const dailyData = Object.keys(days).sort().slice(-30).map(d => ({ day: d.slice(5), ...days[d] }))

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        {[['👥', 'Member', member.length, 'var(--primary)'], ['🚶', 'Non-Member', orders.length - member.length, 'var(--dim)'],
          ['🆕', 'ใหม่', newOrders.length, 'var(--success)'], ['🔄', 'ประจำ', repeatOrders.length, '#4D96FF']].map(([icon, label, val, color]) => (
          <div key={label} style={{ background: 'var(--surface)', borderRadius: 14, padding: '12px', border: '1px solid var(--border)', textAlign: 'center' }}>
            <div style={{ fontSize: 18 }}>{icon}</div>
            <div style={{ fontWeight: 800, fontSize: 18, color, fontFamily: "'Inter',sans-serif" }}>{val}</div>
            <div style={{ fontSize: 11, color: 'var(--dim)' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Pie */}
      {pieData.length > 0 && (
        <div style={{ background: 'var(--surface)', borderRadius: 18, padding: '14px 16px', marginBottom: 12, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 10 }}>สัดส่วนลูกค้า</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <PieChart width={120} height={120}>
              <Pie data={pieData} cx={55} cy={55} innerRadius={35} outerRadius={55} dataKey="value" paddingAngle={2}>
                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Pie>
            </PieChart>
            <div style={{ flex: 1 }}>
              {pieData.map((d, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: COLORS[i], flexShrink: 0 }} />
                  <span style={{ fontSize: 12, flex: 1 }}>{d.name}</span>
                  <span style={{ fontWeight: 700, fontSize: 12, color: COLORS[i] }}>{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Daily stacked */}
      {dailyData.length > 1 && (
        <div style={{ background: 'var(--surface)', borderRadius: 18, padding: '14px 16px', marginBottom: 12, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 10 }}>รายวัน</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={dailyData} margin={{ left: -15, right: 5 }}>
              <XAxis dataKey="day" tick={{ fill: '#555', fontSize: 9 }} />
              <YAxis tick={{ fill: '#555', fontSize: 9 }} />
              <Tooltip {...TIP} />
              <Bar dataKey="member"  stackId="a" fill="#FF9F0A" name="Member"     />
              <Bar dataKey="new"     stackId="a" fill="#32D74B" name="ใหม่"       />
              <Bar dataKey="repeat"  stackId="a" fill="#4D96FF" name="ประจำ" radius={[3, 3, 0, 0]} />
              <Bar dataKey="unknown" stackId="a" fill="#3a3a3a" name="ไม่ระบุ"   />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Avg per type */}
      <div style={{ background: 'var(--surface)', borderRadius: 18, padding: '14px 16px', marginBottom: 12, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 10 }}>💰 ยอดเฉลี่ย/บิล แยกประเภท</div>
        {rows.map(r => (
          <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border2)' }}>
            <div style={{ width: 80, fontSize: 12, fontWeight: 700, color: r.color, flexShrink: 0 }}>{r.label}</div>
            <div style={{ flex: 1 }}>
              <div style={{ height: 4, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round(r.avg / maxAvg * 100)}%`, background: r.color, borderRadius: 2 }} />
              </div>
            </div>
            <div style={{ textAlign: 'right', minWidth: 70 }}>
              <div style={{ fontWeight: 700, fontSize: 13, fontFamily: "'Inter',sans-serif" }}>฿{fmt(r.avg)}</div>
              <div style={{ fontSize: 10, color: 'var(--dim)' }}>{r.cnt} บิล</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── New Customers ────────────────────────────────────────────────────────────
function CustNew({ newOrders }) {
  const cnt = newOrders.length
  const avg = cnt ? Math.round(newOrders.reduce((s, o) => s + (o.actual_amount || 0), 0) / cnt) : 0

  const byDay = {}
  newOrders.forEach(o => { const d = new Date(o.created_at).toLocaleDateString('en-CA'); byDay[d] = (byDay[d] || 0) + 1 })
  const trendData = Object.keys(byDay).sort().slice(-30).map(d => ({ day: d.slice(5), cnt: byDay[d] }))

  const byHour = Array(24).fill(0)
  newOrders.forEach(o => { if (o.created_at) byHour[new Date(o.created_at).getHours()]++ })
  const maxH = Math.max(...byHour, 1)
  const hourData = byHour.map((v, i) => ({ hour: `${String(i).padStart(2, '0')}`, cnt: v }))

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <div style={MINI}><div style={{ fontSize: 10, color: 'var(--dim)' }}>บิลทั้งหมด</div><div style={{ color: 'var(--success)', fontWeight: 800, fontFamily: "'Inter',sans-serif" }}>{cnt}</div></div>
        <div style={MINI}><div style={{ fontSize: 10, color: 'var(--dim)' }}>เฉลี่ย/บิล</div><div style={{ fontWeight: 800 }}>฿{fmt(avg)}</div></div>
      </div>
      {trendData.length > 1 && (
        <div style={{ background: 'var(--surface)', borderRadius: 18, padding: '14px 16px', marginBottom: 12, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 10 }}>แนวโน้มรายวัน</div>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={trendData} margin={{ left: -15, right: 5 }}>
              <XAxis dataKey="day" tick={{ fill: '#555', fontSize: 9 }} />
              <YAxis tick={{ fill: '#555', fontSize: 9 }} />
              <Tooltip {...TIP} formatter={v => [v, 'ลูกค้าใหม่']} />
              <Line type="monotone" dataKey="cnt" stroke="var(--success)" strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <HourChart hourData={hourData} maxH={maxH} color="var(--success)" />
      <RecentOrders orders={newOrders.slice(0, 10)} color="var(--success)" />
    </div>
  )
}

// ─── Repeat Customers ─────────────────────────────────────────────────────────
function CustRepeat({ repeatOrders }) {
  const cnt = repeatOrders.length
  const avg = cnt ? Math.round(repeatOrders.reduce((s, o) => s + (o.actual_amount || 0), 0) / cnt) : 0

  const byHour = Array(24).fill(0)
  repeatOrders.forEach(o => { if (o.created_at) byHour[new Date(o.created_at).getHours()]++ })
  const maxH = Math.max(...byHour, 1)
  const hourData = byHour.map((v, i) => ({ hour: `${String(i).padStart(2, '0')}`, cnt: v }))

  const byWd = Array(7).fill(0)
  repeatOrders.forEach(o => { if (o.created_at) { const d = new Date(o.created_at).getDay(); byWd[d === 0 ? 6 : d - 1]++ } })
  const maxWd = Math.max(...byWd, 1)

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <div style={MINI}><div style={{ fontSize: 10, color: 'var(--dim)' }}>บิลทั้งหมด</div><div style={{ color: '#4D96FF', fontWeight: 800, fontFamily: "'Inter',sans-serif" }}>{cnt}</div></div>
        <div style={MINI}><div style={{ fontSize: 10, color: 'var(--dim)' }}>เฉลี่ย/บิล</div><div style={{ fontWeight: 800 }}>฿{fmt(avg)}</div></div>
      </div>
      <HourChart hourData={hourData} maxH={maxH} color="#4D96FF" />
      <div style={{ background: 'var(--surface)', borderRadius: 18, padding: '14px 16px', marginBottom: 12, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 10 }}>วันในสัปดาห์</div>
        {byWd.map((v, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border2)' }}>
            <div style={{ width: 48, fontSize: 12, fontWeight: 600 }}>{DAY_NAMES[i]}</div>
            <div style={{ flex: 1 }}>
              <div style={{ height: 4, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round(v / maxWd * 100)}%`, background: '#4D96FF', borderRadius: 2 }} />
              </div>
            </div>
            <div style={{ color: '#4D96FF', fontWeight: 700, fontSize: 12, minWidth: 40, textAlign: 'right' }}>{v} บิล</div>
          </div>
        ))}
      </div>
      <RecentOrders orders={repeatOrders.slice(0, 10)} color="#4D96FF" />
    </div>
  )
}

// ─── Shared sub-components ────────────────────────────────────────────────────
function HourChart({ hourData, maxH, color }) {
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 18, padding: '14px 16px', marginBottom: 12, border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 10 }}>ช่วงเวลาที่มา</div>
      <ResponsiveContainer width="100%" height={130}>
        <BarChart data={hourData} margin={{ left: -15, right: 5 }}>
          <XAxis dataKey="hour" tick={{ fill: '#555', fontSize: 9 }} interval={3} />
          <YAxis tick={{ fill: '#555', fontSize: 9 }} />
          <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 8 }} labelFormatter={l => `${l}:00 น.`} />
          <Bar dataKey="cnt" radius={[3, 3, 0, 0]}>
            {hourData.map((d, i) => <Cell key={i} fill={d.cnt === maxH && d.cnt > 0 ? color : `${color}33`} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function RecentOrders({ orders, color }) {
  if (!orders.length) return null
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 18, padding: '14px 16px', marginBottom: 12, border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 10 }}>บิลล่าสุด</div>
      {orders.map(o => (
        <div key={o.id} style={{ display: 'flex', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border2)' }}>
          <div style={{ flex: 1, fontSize: 12, color: 'var(--dim)' }}>
            {new Date(o.created_at).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            {o.table_number ? ` · โต๊ะ ${o.table_number}` : ''}
          </div>
          <div style={{ fontWeight: 700, fontSize: 13, color, fontFamily: "'Inter',sans-serif" }}>฿{fmt(o.actual_amount || 0)}</div>
        </div>
      ))}
    </div>
  )
}

const MINI = { background: 'var(--surface)', borderRadius: 12, padding: '12px 14px', border: '1px solid var(--border)', textAlign: 'center' }
