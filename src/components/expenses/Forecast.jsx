import { useState, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { fmt, CHART_TIP } from '../../utils/helpers.js'
import { EXP_CATS } from '../../utils/constants.js'

// ── Weighted average พร้อม fallback ──────────────────────────────────────────
function weightedAvg(vals) {
  if (!vals.length) return 0
  if (vals.length === 1) return vals[0]
  if (vals.length === 2) return vals[0] * 0.4 + vals[1] * 0.6
  return vals[0] * 0.2 + vals[1] * 0.35 + vals[2] * 0.45
}

// ── Seasonality: ดึงยอดเดือนเดียวกันปีที่แล้ว ────────────────────────────────
function getSeasonalityFactor(monthMap, targetMonth) {
  // targetMonth = 'YYYY-MM' เดือนที่จะ forecast
  const [year, mon] = targetMonth.split('-').map(Number)
  const sameMonthLastYear = `${year - 1}-${String(mon).padStart(2, '0')}`
  const twoYearsAgo       = `${year - 2}-${String(mon).padStart(2, '0')}`

  const lastYear = monthMap[sameMonthLastYear]?.total || 0
  const twoAgo   = monthMap[twoYearsAgo]?.total || 0

  // ถ้าไม่มีข้อมูลปีที่แล้วเลย → factor = 1 (ไม่ adjust)
  if (!lastYear) return 1

  // เฉลี่ย 3 เดือนรอบๆ เดือนนั้นปีที่แล้ว เพื่อ smooth spike
  const prevMon  = mon === 1  ? `${year-1}-12` : `${year-1}-${String(mon-1).padStart(2,'0')}`
  const nextMon  = mon === 12 ? `${year}-01`   : `${year-1}-${String(mon+1).padStart(2,'0')}`
  const neighbors = [monthMap[prevMon]?.total || 0, lastYear, monthMap[nextMon]?.total || 0].filter(v => v > 0)
  const avgNeighbor = neighbors.reduce((s,v) => s+v, 0) / neighbors.length

  // factor = ยอดเดือนนั้นปีที่แล้ว / ค่าเฉลี่ยของ neighbors → ถ้า > 1 แปลว่าเดือนนี้มักสูงกว่าปกติ
  const factor = avgNeighbor > 0 ? lastYear / avgNeighbor : 1
  // cap factor ไม่เกิน ±30% เพื่อไม่ให้ distort มากเกิน
  return Math.min(1.3, Math.max(0.7, factor))
}

// ── Price Alert: เทียบราคาล่าสุดกับ median 3 เดือนล่าสุด ────────────────────
function median(arr) {
  if (!arr.length) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function detectPriceAlerts(expenses, threshold = 10) {
  const now = new Date()
  // เอาแค่ 3 เดือนล่าสุดสำหรับ baseline
  const cutoff3m = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().slice(0, 10)
  // เดือนปัจจุบัน
  const currentMonth = now.toISOString().slice(0, 7)

  const byItem = {}
  expenses.forEach(e => {
    if (!e.item || !e.price_per_unit) return
    const ppu = parseFloat(e.price_per_unit)
    if (!ppu || ppu <= 0) return
    if (!byItem[e.item]) byItem[e.item] = { baseline: [], recent: null }

    const isCurrentMonth = (e.date || '').slice(0, 7) === currentMonth
    const isIn3m = (e.date || '') >= cutoff3m && !isCurrentMonth

    if (isIn3m) byItem[e.item].baseline.push({ ppu, date: e.date || '', unit: e.unit || '' })
    else if (isCurrentMonth) {
      // เก็บซื้อล่าสุดของเดือนนี้
      if (!byItem[e.item].recent || (e.date || '') > byItem[e.item].recent.date) {
        byItem[e.item].recent = { ppu, date: e.date || '', unit: e.unit || '' }
      }
    }
  })

  const alerts = []
  Object.entries(byItem).forEach(([item, d]) => {
    if (!d.recent || d.baseline.length < 2) return
    const basePpu = median(d.baseline.map(r => r.ppu))
    if (basePpu <= 0) return
    const pct = ((d.recent.ppu - basePpu) / basePpu) * 100
    if (Math.abs(pct) >= threshold) {
      alerts.push({
        item,
        prevPpu:    basePpu,
        currentPpu: d.recent.ppu,
        pct:        Math.round(pct),
        unit:       d.recent.unit,
        date:       d.recent.date,
        baseCount:  d.baseline.length,
      })
    }
  })

  return alerts.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
}

export default function Forecast({ expenses }) {
  const [showAll, setShowAll] = useState(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => new Date(), [])

  // ── Build month map ───────────────────────────────────────────────────────
  const { monthMap, sortedMonths } = useMemo(() => {
    const map = {}
    expenses.forEach(e => {
      if (!e.date || !e.amount) return
      const month = e.date.slice(0, 7)
      if (!map[month]) map[month] = { total: 0, byCategory: {}, byItem: {} }
      const amt = parseFloat(e.amount) || 0
      map[month].total += amt

      const cat  = e.category || 'อื่นๆ'
      map[month].byCategory[cat] = (map[month].byCategory[cat] || 0) + amt

      const item = e.item || 'ไม่ระบุ'
      const qty  = parseFloat(e.quantity) || 0
      if (!map[month].byItem[item]) map[month].byItem[item] = { total: 0, qty: 0, unit: '' }
      map[month].byItem[item].total += amt
      map[month].byItem[item].qty   += qty
      if (e.unit && !map[month].byItem[item].unit) map[month].byItem[item].unit = e.unit
    })
    return { monthMap: map, sortedMonths: Object.keys(map).sort() }
  }, [expenses])

  // ── Forecast data ─────────────────────────────────────────────────────────
  const data = useMemo(() => {
    const currentMonth = now.toISOString().slice(0, 7)
    const last3 = sortedMonths.filter(m => m < currentMonth).slice(-3)
    const last6 = sortedMonths.filter(m => m < currentMonth).slice(-6)

    // next month string
    const nextDate  = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const nextMonth = nextDate.toISOString().slice(0, 7)

    // seasonality factor สำหรับเดือนหน้า
    const seasonFactor = getSeasonalityFactor(monthMap, nextMonth)

    // forecast รายหมวด พร้อม seasonality
    const catForecast = {}
    last3.forEach(m => {
      Object.entries(monthMap[m].byCategory || {}).forEach(([cat, amt]) => {
        if (!catForecast[cat]) catForecast[cat] = []
        catForecast[cat].push(amt)
      })
    })

    const catPrediction = {}
    const catTrend = {}
    const lastMonthKey = last3[last3.length - 1]

    Object.entries(catForecast).forEach(([cat, vals]) => {
      const base = weightedAvg(vals)
      catPrediction[cat] = Math.round(base * seasonFactor)
      const last = monthMap[lastMonthKey]?.byCategory[cat] || 0
      catTrend[cat] = base > 0 ? Math.round((last - base) / base * 100) : 0
    })

    const totalForecast = Object.values(catPrediction).reduce((s, v) => s + v, 0)

    // forecast รายสินค้า
    const itemForecast = {}
    last3.forEach(m => {
      Object.entries(monthMap[m].byItem || {}).forEach(([item, d]) => {
        if (!itemForecast[item]) itemForecast[item] = { amounts: [], qtys: [], unit: '' }
        itemForecast[item].amounts.push(d.total)
        itemForecast[item].qtys.push(d.qty)
        if (d.unit && !itemForecast[item].unit) itemForecast[item].unit = d.unit
      })
    })

    const allItemPrediction = Object.entries(itemForecast).map(([item, d]) => {
      const pred    = weightedAvg(d.amounts) * seasonFactor
      const predQty = weightedAvg(d.qtys.filter(q => q > 0))
      const trend   = d.amounts.length >= 2
        ? Math.round((d.amounts[d.amounts.length-1] - d.amounts[0]) / (d.amounts[0]||1) * 100) : 0
      return { item, pred: Math.round(pred), predQty, unit: d.unit, trend, months: d.amounts.length }
    }).sort((a, b) => b.pred - a.pred)

    // chart data (6mo actual + forecast bar)
    const chartData = last6.map(m => ({
      label:  new Date(m + '-01').toLocaleDateString('th-TH', { month: 'short', year: '2-digit' }),
      actual: Math.round(monthMap[m].total),
    }))
    const nextLabel = nextDate.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' })
    chartData.push({ label: nextLabel, forecast: totalForecast })

    // เดือนปัจจุบัน projected
    const currentTotal = monthMap[currentMonth]?.total || 0
    const daysInMonth  = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const daysPassed   = now.getDate()
    const currentProjected = daysPassed > 0 ? Math.round(currentTotal / daysPassed * daysInMonth) : 0

    return {
      catPrediction, catTrend, allItemPrediction,
      totalForecast, chartData,
      currentTotal, currentProjected,
      seasonFactor, nextMonth,
    }
  }, [monthMap, sortedMonths, now])

  // ── Price Alerts ──────────────────────────────────────────────────────────
  const priceAlerts = useMemo(() => detectPriceAlerts(expenses, 10), [expenses])

  const nextMonthName = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    .toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })

  if (expenses.length < 10) return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--dim)' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
      <div style={{ fontSize: 14 }}>ต้องการข้อมูลอย่างน้อย 1 เดือนเพื่อทำ Forecast</div>
      <div style={{ fontSize: 12, marginTop: 8 }}>กรอกต้นทุนในแท็บ "บันทึก" ก่อนนะครับ</div>
    </div>
  )

  return (
    <div style={{ paddingBottom: 20 }}>

      {/* ── Price Alert ── */}
      {priceAlerts.length > 0 && (
        <div style={{
          background: 'rgba(255,69,58,0.08)', border: '1px solid rgba(255,69,58,0.25)',
          borderRadius: 16, padding: '14px 16px', marginBottom: 14,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--danger)', marginBottom: 10 }}>
            🚨 ราคาเปลี่ยนจาก median 3 เดือน (≥10%)
          </div>
          {priceAlerts.slice(0, 5).map(a => (
            <div key={a.item} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 0', borderBottom: '1px solid rgba(255,69,58,0.1)',
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{a.item}</div>
                <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 2 }}>
                  median ฿{a.prevPpu.toFixed(2)} → ล่าสุด ฿{a.currentPpu.toFixed(2)}/{a.unit || 'หน่วย'}
                  <span style={{ color: '#666', marginLeft: 6 }}>{a.date} · อ้างอิง {a.baseCount} ครั้ง</span>
                </div>
              </div>
              <div style={{
                fontSize: 14, fontWeight: 800,
                color: a.pct > 0 ? 'var(--danger)' : 'var(--success)',
                background: a.pct > 0 ? 'rgba(255,69,58,0.15)' : 'rgba(50,215,75,0.15)',
                padding: '4px 10px', borderRadius: 8,
              }}>
                {a.pct > 0 ? '▲' : '▼'} {Math.abs(a.pct)}%
              </div>
            </div>
          ))}
          {priceAlerts.length > 5 && (
            <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 8, textAlign: 'center' }}>
              + อีก {priceAlerts.length - 5} รายการ
            </div>
          )}
        </div>
      )}

      {/* ── Hero forecast ── */}
      <div style={{
        background: 'linear-gradient(135deg,#1a1a0a,#2a2000)',
        border: '1px solid var(--primary)44',
        borderRadius: 20, padding: '20px', marginBottom: 14, textAlign: 'center',
      }}>
        <div style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
          🔮 Forecast — {nextMonthName}
        </div>
        <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 36, fontWeight: 900, color: 'var(--primary)' }}>
          ฿{fmt(data.totalForecast)}
        </div>

        {/* seasonality badge */}
        {Math.abs(data.seasonFactor - 1) > 0.03 && (
          <div style={{
            display: 'inline-block', marginTop: 8,
            fontSize: 11, fontWeight: 700,
            color: data.seasonFactor > 1 ? 'var(--danger)' : 'var(--success)',
            background: data.seasonFactor > 1 ? 'rgba(255,69,58,0.12)' : 'rgba(50,215,75,0.12)',
            padding: '3px 10px', borderRadius: 8,
          }}>
            📅 Seasonality {data.seasonFactor > 1 ? '▲' : '▼'} {Math.round(Math.abs(data.seasonFactor - 1) * 100)}%
            (จากข้อมูลปีที่แล้ว)
          </div>
        )}

        {data.currentProjected > 0 && (
          <div style={{
            marginTop: 14, padding: '10px 16px',
            background: 'rgba(255,255,255,0.05)', borderRadius: 12,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ fontSize: 12, color: 'var(--dim)' }}>เดือนนี้ (ประมาณการเต็มเดือน)</div>
            <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 800, color: '#fff' }}>
              ฿{fmt(data.currentProjected)}
              <span style={{ fontSize: 10, color: 'var(--dim)', marginLeft: 6 }}>
                (บันทึกแล้ว ฿{fmt(data.currentTotal)})
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Trend chart ── */}
      <div style={{ background: 'var(--surface)', borderRadius: 18, padding: '14px 16px', marginBottom: 12, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 12, color: 'var(--dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
          📈 แนวโน้มต้นทุน 6 เดือน + Forecast
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data.chartData} margin={{ left: -10, right: 10 }}>
            <XAxis dataKey="label" tick={{ fill: '#555', fontSize: 10 }} />
            <YAxis tick={{ fill: '#555', fontSize: 9 }} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
            <Tooltip {...CHART_TIP} formatter={(v, n) => [`฿${fmt(v)}`, n === 'actual' ? 'จริง' : 'Forecast']} />
            <Line type="monotone" dataKey="actual" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            <Line type="monotone" dataKey="forecast" stroke="#4D96FF" strokeWidth={2}
              strokeDasharray="5 4" dot={{ r: 5, fill: '#4D96FF' }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8 }}>
          {[['var(--primary)', 'จริง'], ['#4D96FF', 'Forecast']].map(([color, label]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 16, height: 2, background: color, borderRadius: 1 }} />
              <span style={{ fontSize: 11, color: 'var(--dim)' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Forecast รายหมวด ── */}
      <div style={{ background: 'var(--surface)', borderRadius: 18, padding: '14px 16px', marginBottom: 12, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 12, color: 'var(--dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
          📂 Forecast แยกหมวดหมู่
        </div>
        {Object.entries(data.catPrediction).sort((a, b) => b[1] - a[1]).map(([cat, pred]) => {
          const trend   = data.catTrend[cat] || 0
          const catInfo = EXP_CATS.find(c => c.key === cat)
          const maxPred = Math.max(...Object.values(data.catPrediction))
          const pct     = maxPred > 0 ? Math.round(pred / maxPred * 100) : 0
          return (
            <div key={cat} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>{catInfo?.icon || '📦'}</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{cat}</span>
                  {trend !== 0 && (
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      color: trend > 0 ? 'var(--danger)' : 'var(--success)',
                      background: trend > 0 ? 'rgba(255,69,58,0.1)' : 'rgba(50,215,75,0.1)',
                      padding: '1px 6px', borderRadius: 6,
                    }}>
                      {trend > 0 ? '▲' : '▼'} {Math.abs(trend)}%
                    </span>
                  )}
                </div>
                <span style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, color: catInfo?.color || '#fff' }}>
                  ฿{fmt(pred)}
                </span>
              </div>
              <div style={{ height: 4, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: catInfo?.color || 'var(--primary)', borderRadius: 2, transition: 'width 0.4s' }} />
              </div>
            </div>
          )
        })}
      </div>

      {/* ── All items forecast ── */}
      <div style={{ background: 'var(--surface)', borderRadius: 18, padding: '14px 16px', marginBottom: 12, border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            🛒 รายการทั้งหมด ({data.allItemPrediction.length})
          </div>
          {data.allItemPrediction.length > 10 && (
            <button onClick={() => setShowAll(p => !p)} style={{
              background: 'none', border: '1px solid var(--border2)', borderRadius: 8,
              padding: '4px 10px', color: 'var(--primary)', fontSize: 11,
              cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
            }}>
              {showAll ? 'ย่อ' : `ดูทั้งหมด ${data.allItemPrediction.length} รายการ`}
            </button>
          )}
        </div>

        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto auto', gap: 8, padding: '4px 0 8px', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
          <div /><div style={{ fontSize: 10, color: 'var(--dim)', fontWeight: 700 }}>รายการ</div>
          <div style={{ fontSize: 10, color: 'var(--dim)', fontWeight: 700, textAlign: 'right' }}>ปริมาณ</div>
          <div style={{ fontSize: 10, color: 'var(--dim)', fontWeight: 700, textAlign: 'right', minWidth: 70 }}>฿ Forecast</div>
        </div>

        {(showAll ? data.allItemPrediction : data.allItemPrediction.slice(0, 10)).map((d, i) => (
          <div key={d.item} style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto auto', gap: 8, alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border2)' }}>
            <div style={{ fontWeight: 800, fontSize: 11, textAlign: 'center', color: i===0?'#FFD60A':i===1?'#8E8E93':i===2?'#CD7F32':'var(--dim)' }}>
              {i + 1}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.item}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                <span style={{ fontSize: 9, color: 'var(--dim)' }}>{d.months} เดือน</span>
                {d.trend !== 0 && d.months >= 2 && (
                  <span style={{ fontSize: 9, fontWeight: 700, color: d.trend > 0 ? 'var(--danger)' : 'var(--success)' }}>
                    {d.trend > 0 ? '▲' : '▼'}{Math.abs(d.trend)}%
                  </span>
                )}
              </div>
            </div>
            <div style={{ textAlign: 'right', minWidth: 64 }}>
              {d.predQty > 0 ? (
                <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 13, color: '#4D96FF' }}>
                  {d.predQty % 1 === 0 ? d.predQty : d.predQty.toFixed(1)}
                  <span style={{ fontSize: 10, fontWeight: 400, marginLeft: 2 }}>{d.unit}</span>
                </div>
              ) : <span style={{ fontSize: 10, color: 'var(--dim)' }}>—</span>}
            </div>
            <div style={{ textAlign: 'right', minWidth: 70 }}>
              <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 14, color: 'var(--primary)' }}>
                ฿{fmt(d.pred)}
              </div>
            </div>
          </div>
        ))}

        {!showAll && data.allItemPrediction.length > 10 && (
          <div style={{ textAlign: 'center', padding: '12px 0 4px', color: 'var(--dim)', fontSize: 12 }}>
            + อีก {data.allItemPrediction.length - 10} รายการ
          </div>
        )}
      </div>

      {/* ── หมายเหตุ ── */}
      <div style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid var(--border2)' }}>
        <div style={{ fontSize: 11, color: 'var(--dim)', lineHeight: 1.8 }}>
          💡 Forecast ใช้ weighted average 3 เดือนล่าสุด (45:35:20) + Seasonality จากปีที่แล้ว<br />
          🚨 Price Alert แจ้งเตือนเมื่อราคา/หน่วยเปลี่ยนเกิน 10% เทียบซื้อล่าสุด<br />
          ▲ สีแดง = แนวโน้มสูงขึ้น · ▼ สีเขียว = แนวโน้มลดลง
        </div>
      </div>
    </div>
  )
}
