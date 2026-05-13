import { useState, useMemo } from 'react'
import { supabase } from '../../supabase.js'
import { todayStr } from '../../utils/helpers.js'
import { INPUT, Field } from './shared.jsx'

const REASONS = ['หยุดประจำ', 'ธุระส่วนตัว', 'ซ่อมร้าน', 'วันหยุดนักขัตฤกษ์', 'อื่นๆ']

export default function ClosedDays({ closedDays, setClosedDays, notify, confirm }) {
  const [date, setDate]     = useState(todayStr)
  const [reason, setReason] = useState('หยุดประจำ')
  const [note, setNote]     = useState('')
  const [saving, setSaving] = useState(false)

  // นับวันหยุดเดือนนี้
  const thisMonth = new Date().toISOString().slice(0, 7)
  const thisMonthCount = useMemo(
    () => closedDays.filter(d => d.date?.slice(0, 7) === thisMonth).length,
    [closedDays, thisMonth]
  )

  // group by month เพื่อแสดง
  const grouped = useMemo(() => {
    const map = {}
    closedDays.forEach(d => {
      const m = d.date?.slice(0, 7) || 'unknown'
      if (!map[m]) map[m] = []
      map[m].push(d)
    })
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]))
  }, [closedDays])

  const handleSave = async () => {
    if (!date) return notify('กรุณาเลือกวันที่', 'warning')

    // เช็คซ้ำ
    if (closedDays.some(d => d.date === date)) {
      return notify('วันนี้บันทึกไว้แล้ว', 'warning')
    }

    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('closed_days')
        .insert({ date, reason, note: note.trim() || null })
        .select()
        .single()
      if (error) throw error

      setClosedDays(prev => [data, ...prev])
      setNote('')
      notify(`บันทึกวันหยุด ${date} เรียบร้อย`)
    } catch (e) {
      notify('บันทึกไม่สำเร็จ: ' + e.message, 'error')
    }
    setSaving(false)
  }

  const handleDelete = async (id, dateStr) => {
    const ok = await confirm(`ลบวันหยุด ${dateStr}?`)
    if (!ok) return
    const { error } = await supabase.from('closed_days').delete().eq('id', id)
    if (error) return notify('ลบไม่สำเร็จ: ' + error.message, 'error')
    setClosedDays(prev => prev.filter(d => d.id !== id))
    notify('ลบเรียบร้อย')
  }

  const monthLabel = (m) => {
    const [y, mo] = m.split('-')
    return new Date(+y, +mo - 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })
  }

  const reasonColor = (r) => ({
    'หยุดประจำ':         '#8E8E93',
    'ธุระส่วนตัว':       '#FF9F0A',
    'ซ่อมร้าน':          '#FF453A',
    'วันหยุดนักขัตฤกษ์': '#32D74B',
    'อื่นๆ':             '#0A84FF',
  })[r] || '#555'

  return (
    <div style={{ paddingBottom: 20 }}>

      {/* Summary card */}
      <div style={{
        background: 'linear-gradient(135deg,#1a1a0a,#1a0a0a)',
        border: '1px solid #FF9F0A33',
        borderRadius: 16, padding: '14px 16px', marginBottom: 14,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 4 }}>เดือนนี้หยุดไปแล้ว</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#FF9F0A', fontFamily: "'Inter',sans-serif" }}>
            {thisMonthCount} <span style={{ fontSize: 14, fontWeight: 400 }}>วัน</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 4 }}>รวมทั้งหมด</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--dim)', fontFamily: "'Inter',sans-serif" }}>
            {closedDays.length} วัน
          </div>
        </div>
      </div>

      {/* Form */}
      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 14, marginBottom: 14, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>📅 บันทึกวันหยุด</div>

        <Field label="วันที่หยุด">
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={INPUT}
          />
        </Field>

        <Field label="เหตุผล">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {REASONS.map(r => (
              <button key={r} onClick={() => setReason(r)} style={{
                padding: '7px 12px', borderRadius: 10, cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 12,
                border: `1px solid ${reason === r ? reasonColor(r) : 'var(--border2)'}`,
                background: reason === r ? reasonColor(r) + '22' : 'var(--surface2)',
                color: reason === r ? reasonColor(r) : 'var(--dim)',
                fontWeight: reason === r ? 700 : 400,
              }}>
                {r}
              </button>
            ))}
          </div>
        </Field>

        <Field label="หมายเหตุ (optional)">
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="เช่น ไปงานแต่ง, ช่างมาซ่อมแอร์..."
            style={INPUT}
          />
        </Field>

        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            width: '100%', background: saving ? '#333' : 'var(--primary)',
            color: saving ? '#666' : '#000', border: 'none',
            borderRadius: 12, padding: 14, fontSize: 15,
            fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit', opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? '⏳ กำลังบันทึก...' : '+ บันทึกวันหยุด'}
        </button>
      </div>

      {/* List grouped by month */}
      {grouped.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--dim)', padding: '30px 0', fontSize: 13 }}>
          ยังไม่มีวันหยุดที่บันทึก
        </div>
      ) : (
        grouped.map(([month, days]) => (
          <div key={month} style={{ marginBottom: 14 }}>
            {/* Month header */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 8,
            }}>
              <div style={{ fontSize: 12, color: 'var(--dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {monthLabel(month)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 700 }}>
                {days.length} วัน
              </div>
            </div>

            {/* Days list */}
            <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
              {days.map((d, i) => {
                const color = reasonColor(d.reason)
                const dateObj = new Date(d.date + 'T00:00:00')
                const dayName = dateObj.toLocaleDateString('th-TH', { weekday: 'long' })
                const dateDisplay = dateObj.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
                return (
                  <div key={d.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 14px',
                    borderBottom: i < days.length - 1 ? '1px solid var(--border2)' : 'none',
                    borderLeft: `4px solid ${color}`,
                  }}>
                    {/* Date */}
                    <div style={{ minWidth: 60 }}>
                      <div style={{ fontWeight: 800, fontSize: 14, fontFamily: "'Inter',sans-serif" }}>
                        {dateDisplay}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--dim)' }}>{dayName}</div>
                    </div>

                    {/* Reason + note */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700,
                        color, background: color + '22',
                        padding: '2px 8px', borderRadius: 6,
                      }}>
                        {d.reason || 'ไม่ระบุ'}
                      </span>
                      {d.note && (
                        <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {d.note}
                        </div>
                      )}
                    </div>

                    {/* Delete */}
                    <button
                      onClick={() => handleDelete(d.id, d.date)}
                      style={{
                        background: 'none', border: 'none',
                        color: '#555', cursor: 'pointer',
                        fontSize: 18, padding: '0 4px', lineHeight: 1,
                        flexShrink: 0,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
