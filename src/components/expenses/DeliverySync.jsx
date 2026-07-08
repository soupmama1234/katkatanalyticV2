import { useState } from 'react'
import { supabase } from '../../supabase.js'
import { todayStr } from '../../utils/helpers.js'
import { INPUT, Field } from './shared.jsx'

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('en-CA')
}

export default function DeliverySync({ setExpenses, notify }) {
  const [from, setFrom] = useState(daysAgo(3))
  const [to, setTo] = useState(todayStr)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null) // { newRows, alreadySyncedRows, needsReview }
  const [checked, setChecked] = useState([]) // indices ของ newRows ที่เลือกไว้
  const [saving, setSaving] = useState(false)

  const handleFetch = async () => {
    setLoading(true)
    setResult(null)
    try {
      const resp = await fetch(`/api/gmail-sync?from=${from}&to=${to}`)
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'sync ไม่สำเร็จ')

      const keys = (data.rows || []).map(r => r.sync_key)
      const { data: existing, error } = await supabase
        .from('expenses')
        .select('sync_key')
        .in('sync_key', keys.length ? keys : [''])
      if (error) throw error
      const existingSet = new Set((existing || []).map(e => e.sync_key))

      const newRows = (data.rows || []).filter(r => !existingSet.has(r.sync_key))
      const alreadySyncedRows = (data.rows || []).filter(r => existingSet.has(r.sync_key))

      setResult({ newRows, alreadySyncedRows, needsReview: data.needsReview || [] })
      setChecked(newRows.map((_, i) => i))
    } catch (e) {
      notify('ดึงข้อมูลไม่สำเร็จ: ' + e.message, 'error')
    }
    setLoading(false)
  }

  const toggleCheck = (i) => {
    setChecked(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])
  }

  const selectAll = () => setChecked(result.newRows.map((_, i) => i))
  const deselectAll = () => setChecked([])

  const handleConfirm = async () => {
    if (!result) return
    const toInsert = result.newRows
      .filter((_, i) => checked.includes(i))
      .map(r => ({
        date: r.date,
        item: r.item,
        category: r.category,
        platform: r.platform,
        amount: r.amount,
        report_period_start: r.report_period_start || null,
        report_period_end: r.report_period_end || null,
        statement_status: 'ok',
        sync_key: r.sync_key,
        note: 'gmail-sync',
      }))
    if (!toInsert.length) return notify('ไม่มีรายการที่เลือก', 'warning')

    setSaving(true)
    const { data, error } = await supabase.from('expenses').insert(toInsert).select()
    if (error) { notify('บันทึกไม่สำเร็จ: ' + error.message, 'error'); setSaving(false); return }

    setExpenses(prev => [...(data || []), ...prev])
    notify(`บันทึก ${toInsert.length} รายการเรียบร้อย`)
    setResult(prev => ({ ...prev, newRows: prev.newRows.filter((_, i) => !checked.includes(i)) }))
    setChecked([])
    setSaving(false)
  }

  return (
    <div>
      {/* Date range + fetch button */}
      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 14, marginBottom: 14, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>📧 Sync ค่า GP/Ads จาก Gmail</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <Field label="จากวันที่">
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={INPUT} />
          </Field>
          <Field label="ถึงวันที่">
            <input type="date" value={to} onChange={e => setTo(e.target.value)} style={INPUT} />
          </Field>
        </div>
        <button onClick={handleFetch} disabled={loading} style={{
          width: '100%', background: 'var(--primary)', color: '#000', border: 'none',
          borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 800,
          cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: loading ? 0.6 : 1,
        }}>
          {loading ? '⏳ กำลังดึงอีเมล...' : '🔄 ดึงข้อมูลจาก Gmail'}
        </button>
      </div>

      {result && (
        <>
          {/* สรุปตัวเลข 3 กลุ่ม */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
            <div style={{ background: 'var(--surface)', borderRadius: 12, padding: '10px 12px', border: '1px solid var(--border)', textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--success)' }}>{result.newRows.length}</div>
              <div style={{ fontSize: 10, color: 'var(--dim)' }}>✅ พร้อม sync</div>
            </div>
            <div style={{ background: 'var(--surface)', borderRadius: 12, padding: '10px 12px', border: '1px solid var(--border)', textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--dim)' }}>{result.alreadySyncedRows.length}</div>
              <div style={{ fontSize: 10, color: 'var(--dim)' }}>⏭️ ลงแล้ว</div>
            </div>
            <div style={{ background: 'var(--surface)', borderRadius: 12, padding: '10px 12px', border: '1px solid var(--border)', textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--danger)' }}>{result.needsReview.length}</div>
              <div style={{ fontSize: 10, color: 'var(--dim)' }}>⚠️ ต้องตรวจสอบ</div>
            </div>
          </div>

          {/* รายการพร้อม sync */}
          {result.newRows.length > 0 && (
            <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 14, marginBottom: 14, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>✅ รายการที่พร้อม sync</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={selectAll} style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '4px 10px', color: 'var(--primary)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>เลือกทั้งหมด</button>
                  <button onClick={deselectAll} style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '4px 10px', color: 'var(--dim)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>ไม่เลือกเลย</button>
                </div>
              </div>
              {result.newRows.map((r, i) => (
                <div key={r.sync_key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border2)' }}>
                  <input type="checkbox" checked={checked.includes(i)} onChange={() => toggleCheck(i)} style={{ width: 18, height: 18, cursor: 'pointer' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{r.item}</div>
                    <div style={{ fontSize: 11, color: 'var(--dim)' }}>{r.date} · {r.platform}</div>
                  </div>
                  <div style={{ color: 'var(--danger)', fontWeight: 700 }}>-฿{r.amount}</div>
                </div>
              ))}
              <button onClick={handleConfirm} disabled={saving || checked.length === 0} style={{
                width: '100%', marginTop: 12, background: 'var(--success)', color: '#000', border: 'none',
                borderRadius: 12, padding: 13, fontSize: 14, fontWeight: 800,
                cursor: (saving || checked.length === 0) ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', opacity: (saving || checked.length === 0) ? 0.6 : 1,
              }}>
                {saving ? '⏳ กำลังบันทึก...' : `💾 ยืนยัน sync (${checked.length} รายการ)`}
              </button>
            </div>
          )}

          {/* รายการที่ลงแล้ว — พับเก็บไว้ กดดูได้ */}
          {result.alreadySyncedRows.length > 0 && (
            <details style={{ background: 'var(--surface)', borderRadius: 16, padding: 14, marginBottom: 14, border: '1px solid var(--border)' }}>
              <summary style={{ fontSize: 13, fontWeight: 700, color: 'var(--dim)', cursor: 'pointer' }}>
                ⏭️ ดูรายการที่ลงแล้ว ({result.alreadySyncedRows.length})
              </summary>
              <div style={{ marginTop: 10 }}>
                {result.alreadySyncedRows.map(r => (
                  <div key={r.sync_key} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border2)' }}>
                    <div style={{ fontSize: 12, color: 'var(--dim)' }}>{r.item}</div>
                    <div style={{ fontSize: 11, color: 'var(--dim)' }}>{r.date}</div>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* รายการที่ต้องตรวจสอบเอง */}
          {result.needsReview.length > 0 && (
            <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 14, border: '1px solid rgba(255,69,58,0.3)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: 'var(--danger)' }}>⚠️ ต้องตรวจสอบเอง</div>
              {result.needsReview.map((r, i) => (
                <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid var(--border2)' }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{r.subject}</div>
                  <div style={{ fontSize: 11, color: 'var(--danger)' }}>{r.error}</div>
                </div>
              ))}
            </div>
          )}

          {result.newRows.length === 0 && result.needsReview.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--dim)', padding: '20px 0' }}>
              ไม่มีรายการใหม่ในช่วงที่เลือก
            </div>
          )}
        </>
      )}
    </div>
  )
}
