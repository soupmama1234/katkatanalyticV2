import { useState } from 'react'
import { supabase } from '../../supabase.js'
import { todayStr } from '../../utils/helpers.js'
import { ACTION_CAT_LABEL, ACTION_CAT_COLOR } from '../../utils/constants.js'
import { INPUT, Field } from './shared.jsx'

export default function ActionNotes({ actionNotes, setActionNotes, notify, confirm }) {
  const [form, setForm]         = useState({ date: todayStr, category: 'general', content: '' })
  const [editId, setEditId]     = useState(null)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving]     = useState(false)

  const CATS = Object.entries(ACTION_CAT_LABEL)

  const handleSave = async () => {
    if (!form.content.trim()) return notify('กรุณาใส่รายละเอียด', 'warning')
    setSaving(true)
    const { data, error } = await supabase.from('business_notes').insert({
      note_date: form.date, content: form.content.trim(), category: form.category,
    }).select().single()
    if (error) { notify('บันทึกไม่สำเร็จ: ' + error.message, 'error'); setSaving(false); return }
    setActionNotes(prev => [data, ...prev])
    setForm(f => ({ ...f, content: '' }))
    setSaving(false)
  }

  const handleDelete = async (id) => {
    const note = actionNotes.find(n => n.id === id)
    const preview = (note?.content || '').slice(0, 40)
    const ok = await confirm(`ลบ Action Note "${preview}${preview.length < (note?.content?.length || 0) ? '...' : ''}"?`)
    if (!ok) return
    const { error } = await supabase.from('business_notes').delete().eq('id', id)
    if (error) return notify('ลบไม่สำเร็จ: ' + error.message, 'error')
    setActionNotes(prev => prev.filter(n => n.id !== id))
    notify('ลบรายการเรียบร้อย')
  }

  const handleEditSave = async (id) => {
    const { error } = await supabase.from('business_notes').update({ content: editContent }).eq('id', id)
    if (error) return notify('บันทึกไม่สำเร็จ: ' + error.message, 'error')
    setActionNotes(prev => prev.map(n => n.id === id ? { ...n, content: editContent } : n))
    setEditId(null)
    notify('บันทึกเรียบร้อย')
  }

  return (
    <div>
      {/* Form */}
      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 14, marginBottom: 14, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>📝 บันทึก Action / กิจกรรม</div>

        <Field label="วันที่">
          <input type="date" value={form.date}
            onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
            style={INPUT} />
        </Field>

        <Field label="หมวดหมู่">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {CATS.map(([key, label]) => (
              <button key={key} onClick={() => setForm(f => ({ ...f, category: key }))} style={{
                padding: '7px 12px', borderRadius: 10,
                border: `1px solid ${form.category === key ? ACTION_CAT_COLOR[key] : 'var(--border2)'}`,
                background: form.category === key ? ACTION_CAT_COLOR[key] + '22' : 'var(--surface2)',
                color: form.category === key ? ACTION_CAT_COLOR[key] : 'var(--dim)',
                fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
              }}>{label}</button>
            ))}
          </div>
        </Field>

        <Field label="รายละเอียด">
          <textarea
            value={form.content}
            onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
            rows={3}
            placeholder="เช่น ยิงโฆษณา Facebook ฿500, ปรับลดต้นทุน..."
            style={{ ...INPUT, resize: 'vertical' }}
          />
        </Field>

        <button onClick={handleSave} disabled={saving} style={{
          width: '100%', background: 'var(--primary)', color: '#000',
          border: 'none', borderRadius: 12, padding: 13,
          fontSize: 14, fontWeight: 800,
          cursor: saving ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit', opacity: saving ? 0.6 : 1,
        }}>
          {saving ? '⏳ กำลังบันทึก...' : '+ บันทึก Action'}
        </button>
      </div>

      {/* List */}
      {actionNotes.map(n => {
        const col = ACTION_CAT_COLOR[n.category] || '#666'
        const lbl = ACTION_CAT_LABEL[n.category] || n.category
        return (
          <div key={n.id} style={{
            background: 'var(--surface)', borderRadius: 14, padding: 14,
            marginBottom: 10, border: `1px solid ${col}33`, borderLeft: `4px solid ${col}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 800, fontSize: 14 }}>{n.note_date}</span>
                <span style={{ fontSize: 11, background: col + '22', color: col, padding: '2px 8px', borderRadius: 20, fontWeight: 700 }}>
                  {lbl}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => { setEditId(n.id); setEditContent(n.content) }}
                  style={{ background: 'none', border: 'none', color: 'var(--dim)', cursor: 'pointer', fontSize: 14 }}>✏️</button>
                <button onClick={() => handleDelete(n.id)}
                  style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 14 }}>🗑</button>
              </div>
            </div>

            {editId === n.id ? (
              <div>
                <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
                  rows={3} style={{ ...INPUT, resize: 'vertical', marginBottom: 8 }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setEditId(null)} style={{
                    flex: 1, background: 'var(--surface2)', border: '1px solid var(--border2)',
                    color: 'var(--dim)', borderRadius: 10, padding: 10, cursor: 'pointer', fontFamily: 'inherit',
                  }}>ยกเลิก</button>
                  <button onClick={() => handleEditSave(n.id)} style={{
                    flex: 2, background: 'var(--primary)', border: 'none',
                    color: '#000', borderRadius: 10, padding: 10,
                    fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
                  }}>💾 บันทึก</button>
                </div>
              </div>
            ) : (
              <div style={{ color: 'var(--text)', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {n.content}
              </div>
            )}
          </div>
        )
      })}

      {actionNotes.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--dim)', padding: '30px 0' }}>
          ยังไม่มี Action — บันทึกด้านบนได้เลย
        </div>
      )}
    </div>
  )
}
