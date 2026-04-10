import { useState, useMemo, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '../supabase.js'
import {
  filterExpByPeriod, filterExpByRange, filterByPeriod, filterByRange,
  fmt, todayStr, guessExpCategory, exportCSV
} from '../utils/helpers.js'
import { EXP_CATS, UNIT_PRESETS, VENDORS, GEMINI_MODEL, ACTION_CAT_LABEL, ACTION_CAT_COLOR } from '../utils/constants.js'
import PeriodBar from './ui/PeriodBar.jsx'

const PERIOD_OPTIONS = [
  { key: 'today', label: 'วันนี้' },
  { key: '7d',    label: '7 วัน' },
  { key: '30d',   label: 'เดือนนี้' },
  { key: 'all',   label: 'ทั้งหมด' },
]

const TABS = ['บันทึก', 'รายการ', 'วิเคราะห์', 'Action', 'Backup']

const INPUT = {
  background: 'var(--surface2)', border: '1px solid var(--border2)',
  color: '#fff', borderRadius: 10, padding: '11px 13px',
  fontSize: 14, outline: 'none', width: '100%',
  fontFamily: 'inherit', boxSizing: 'border-box',
}

export default function Expenses({ expenses, setExpenses, allOrders, actionNotes, setActionNotes }) {
  const [tab, setTab] = useState('บันทึก')

  return (
    <div style={{ padding: '0 0 20px' }}>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '7px 14px', borderRadius: 20, border: 'none',
            background: tab === t ? 'var(--primary)' : 'var(--surface2)',
            color: tab === t ? '#000' : 'var(--dim)',
            fontWeight: tab === t ? 700 : 400,
            fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
          }}>{t}</button>
        ))}
      </div>

      {tab === 'บันทึก'  && <ExpenseForm expenses={expenses} setExpenses={setExpenses} />}
      {tab === 'รายการ'  && <ExpenseList expenses={expenses} setExpenses={setExpenses} />}
      {tab === 'วิเคราะห์' && <ExpenseAnalysis expenses={expenses} allOrders={allOrders} />}
      {tab === 'Action'  && <ActionNotes actionNotes={actionNotes} setActionNotes={setActionNotes} />}
      {tab === 'Backup'  && <Backup allOrders={allOrders} />}
    </div>
  )
}

// ─── FORM ────────────────────────────────────────────────────────────────────
function ExpenseForm({ expenses, setExpenses }) {
  const emptyForm = { date: todayStr, item: '', category: '', quantity: '', unit: '', pricePerUnit: '', amount: '', discount: '', vendor: '', payment: '', note: '' }
  const [form, setForm]         = useState(emptyForm)
  const [saving, setSaving]     = useState(false)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrItems, setOcrItems] = useState([])
  const [ocrChecked, setOcrChecked] = useState([])
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('gemini_api_key') || '')
  const [showKeyInput, setShowKeyInput] = useState(!localStorage.getItem('gemini_api_key'))

  const itemHistory   = useMemo(() => [...new Set(expenses.map(e => e.item).filter(Boolean))], [expenses])
  const vendorHistory = useMemo(() => [...new Set([...VENDORS, ...expenses.map(e => e.vendor).filter(Boolean)])], [expenses])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const calcTotal = (qty, ppu, disc) => {
    const q = parseFloat(qty) || 0
    const p = parseFloat(ppu) || 0
    const d = parseFloat(disc) || 0
    if (q > 0 && p > 0) set('amount', Math.max(0, q * p - d).toFixed(2))
  }

  const handleSubmit = async () => {
    if (!form.item.trim())     return alert('กรุณาใส่ชื่อรายการ')
    if (!form.category)        return alert('กรุณาเลือกหมวดหมู่')
    if (!parseFloat(form.amount)) return alert('กรุณาใส่ยอดเงิน')
    setSaving(true)
    try {
      const qty = parseFloat(form.quantity) || null
      const ppu = parseFloat(form.pricePerUnit) || (qty && form.amount ? Math.round(parseFloat(form.amount) / qty * 100) / 100 : null)
      const { data, error } = await supabase.from('expenses').insert({
        date: form.date || todayStr,
        item: form.item.trim(),
        category: form.category,
        quantity: qty,
        unit: form.unit || null,
        price_per_unit: ppu,
        amount: parseFloat(form.amount),
        vendor: form.vendor.trim() || null,
        payment_method: form.payment || null,
        note: form.note.trim() || null,
      }).select().single()
      if (error) throw error
      setExpenses(prev => [data, ...prev])
      setForm(emptyForm)
    } catch (e) { alert('❌ ' + e.message) }
    setSaving(false)
  }

  // OCR
  const handleOCR = async (file) => {
    if (!file) return
    if (!geminiKey) { setShowKeyInput(true); return }
    setOcrLoading(true)
    setOcrItems([])
    try {
      const b64 = await new Promise((res, rej) => {
        const reader = new FileReader()
        reader.onload = () => {
          const img = new Image()
          img.onload = () => {
            const MAX = 2560
            let w = img.width, h = img.height
            if (w > MAX || h > MAX) { if (w > h) { h = Math.round(h * MAX / w); w = MAX } else { w = Math.round(w * MAX / h); h = MAX } }
            const canvas = document.createElement('canvas')
            canvas.width = w; canvas.height = h
            const ctx = canvas.getContext('2d')
            ctx.filter = 'contrast(1.15) brightness(1.05)'
            ctx.drawImage(img, 0, 0, w, h)
            res(canvas.toDataURL('image/jpeg', 0.92).split(',')[1])
          }
          img.onerror = rej
          img.src = reader.result
        }
        reader.onerror = rej
        reader.readAsDataURL(file)
      })
      const knownItems = itemHistory.slice(0, 40).join(', ')
      const prompt = `คุณคือระบบอ่านใบเสร็จสำหรับร้านอาหาร${knownItems ? '\nรายการที่เคยซื้อ: ' + knownItems : ''}
return JSON array เท่านั้น ห้ามมีข้อความอื่น ห้ามมี markdown
format: [{"item":"ชื่อสินค้า","quantity":จำนวน,"unit":"หน่วย","amount":ราคารวม,"vendor":"ชื่อร้าน","date":"YYYY-MM-DD"}]
กฎ: item ตรงหรือใกล้เคียงรายการในระบบให้ใช้ชื่อนั้น, quantity เป็นตัวเลข, amount เป็นตัวเลขไม่มีสัญลักษณ์, date YYYY-MM-DD หรือ null`

      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ inline_data: { mime_type: 'image/jpeg', data: b64 } }, { text: prompt }] }],
          generationConfig: { temperature: 0.1 },
        }),
      })
      const result = await resp.json()
      if (!resp.ok) throw new Error(result.error?.message || 'API error')
      const raw = result.candidates?.[0]?.content?.parts?.[0]?.text || '[]'
      const items = JSON.parse(raw.replace(/```json|```/g, '').trim())
      if (!items.length) return alert('ไม่พบรายการในรูปนี้')
      setOcrItems(items.map((it, i) => ({
        ...it,
        id: i,
        category: guessExpCategory(it.item || ''),
        ppu: it.quantity && it.amount ? Math.round(it.amount / it.quantity * 100) / 100 : '',
      })))
      setOcrChecked(items.map((_, i) => i))
    } catch (e) { alert('❌ OCR Error: ' + e.message) }
    setOcrLoading(false)
  }

  const saveOcrItems = async () => {
    const toSave = ocrItems
      .filter((_, i) => ocrChecked.includes(i))
      .map(it => ({
        date: it.date || todayStr,
        item: it.editItem || it.item,
        category: it.category,
        quantity: parseFloat(it.quantity) || null,
        unit: it.unit || null,
        price_per_unit: parseFloat(it.ppu) || null,
        amount: parseFloat(it.amount) || 0,
        vendor: it.vendor || null,
        note: 'ocr',
      })).filter(it => it.amount > 0)
    if (!toSave.length) return alert('ไม่มีรายการที่เลือก')
    const { data, error } = await supabase.from('expenses').insert(toSave).select()
    if (error) return alert('❌ ' + error.message)
    setExpenses(prev => [...(data || []), ...prev])
    setOcrItems([])
    setOcrChecked([])
    alert(`✅ บันทึก ${toSave.length} รายการแล้ว`)
  }

  return (
    <div>
      {/* API Key */}
      {showKeyInput && (
        <div style={{ background: 'rgba(255,215,0,0.08)', border: '1px solid rgba(255,215,0,0.3)', borderRadius: 14, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#FFD60A', marginBottom: 8 }}>🔑 ใส่ Gemini API Key (ครั้งแรกครั้งเดียว)</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="password" value={geminiKey} onChange={e => setGeminiKey(e.target.value)}
              placeholder="AIza..." style={{ ...INPUT, flex: 1 }} />
            <button onClick={() => { localStorage.setItem('gemini_api_key', geminiKey); setShowKeyInput(false) }}
              style={{ background: '#FFD60A', color: '#000', border: 'none', borderRadius: 10, padding: '11px 16px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
              บันทึก
            </button>
          </div>
        </div>
      )}

      {/* OCR */}
      <div style={{ marginBottom: 14 }}>
        <label style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          background: ocrLoading ? '#1a1a2e' : 'linear-gradient(135deg,#1a1a2e,#16213e)',
          border: '1px solid #4D96FF44', borderRadius: 14, padding: '14px',
          color: ocrLoading ? '#888' : '#4D96FF', fontWeight: 700, fontSize: 14,
          cursor: ocrLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
        }}>
          <span style={{ fontSize: 20 }}>📷</span>
          {ocrLoading ? '⏳ กำลังอ่านใบเสร็จ...' : 'ถ่ายรูป / เลือกรูปใบเสร็จ (OCR)'}
          {!ocrLoading && <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleOCR(e.target.files[0])} />}
        </label>
      </div>

      {/* OCR results */}
      {ocrItems.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid #4D96FF33', borderRadius: 16, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#4D96FF', marginBottom: 12 }}>✨ พบ {ocrItems.length} รายการ</div>
          {ocrItems.map((it, i) => (
            <div key={i} style={{ borderBottom: '1px solid var(--border2)', paddingBottom: 10, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <input type="checkbox" checked={ocrChecked.includes(i)}
                  onChange={e => setOcrChecked(prev => e.target.checked ? [...prev, i] : prev.filter(x => x !== i))}
                  style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#4D96FF' }} />
                <input value={it.editItem ?? it.item} onChange={e => setOcrItems(prev => prev.map((x, j) => j === i ? { ...x, editItem: e.target.value } : x))}
                  style={{ ...INPUT, flex: 1, fontSize: 13, fontWeight: 700, padding: '6px 10px' }} />
                <select value={it.category} onChange={e => setOcrItems(prev => prev.map((x, j) => j === i ? { ...x, category: e.target.value } : x))}
                  style={{ ...INPUT, width: 'auto', fontSize: 11, padding: '6px 8px' }}>
                  {EXP_CATS.map(c => <option key={c.key} value={c.key}>{c.icon} {c.key}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, paddingLeft: 26 }}>
                {[['จำนวน', 'quantity'], ['หน่วย', 'unit'], ['฿/หน่วย', 'ppu']].map(([label, key]) => (
                  <div key={key}>
                    <div style={{ fontSize: 9, color: 'var(--dim)', marginBottom: 2 }}>{label}</div>
                    <input value={it[key] ?? ''} onChange={e => setOcrItems(prev => prev.map((x, j) => j === i ? { ...x, [key]: e.target.value } : x))}
                      style={{ ...INPUT, padding: '5px 8px', fontSize: 12, textAlign: 'center' }} />
                  </div>
                ))}
              </div>
              <div style={{ paddingLeft: 26, marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--dim)' }}>ยอดรวม ฿</span>
                <input type="number" value={it.amount ?? ''} onChange={e => setOcrItems(prev => prev.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))}
                  style={{ ...INPUT, flex: 1, fontSize: 14, fontWeight: 800, color: 'var(--success)', padding: '6px 8px' }} />
                {it.vendor && <span style={{ fontSize: 10, color: 'var(--dim)' }}>{it.vendor}</span>}
              </div>
            </div>
          ))}
          <button onClick={saveOcrItems}
            style={{ width: '100%', background: '#4D96FF', color: '#000', border: 'none', borderRadius: 12, padding: 13, fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
            💾 บันทึกที่เลือก ({ocrChecked.length})
          </button>
        </div>
      )}

      {/* Manual form */}
      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 14, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>💸 บันทึกแบบกรอกมือ</div>

        <Field label="วันที่">
          <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={INPUT} />
        </Field>

        <Field label="หมวดหมู่">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {EXP_CATS.map(c => (
              <button key={c.key} onClick={() => set('category', c.key)} style={{
                padding: '6px 10px', borderRadius: 10, border: `1px solid ${form.category === c.key ? c.color : 'var(--border2)'}`,
                background: form.category === c.key ? c.color : 'var(--surface2)',
                color: form.category === c.key ? '#000' : 'var(--dim)',
                fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: form.category === c.key ? 700 : 400,
              }}>{c.icon} {c.key}</button>
            ))}
          </div>
        </Field>

        <Field label="รายการ">
          <AutoComplete
            value={form.item} onChange={v => set('item', v)}
            suggestions={itemHistory} placeholder="เช่น หมูสันนอก"
          />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="จำนวน">
            <input type="number" inputMode="decimal" value={form.quantity}
              onChange={e => { set('quantity', e.target.value); calcTotal(e.target.value, form.pricePerUnit, form.discount) }}
              style={INPUT} placeholder="0" />
          </Field>
          <Field label="หน่วย">
            <input value={form.unit} onChange={e => set('unit', e.target.value)} style={INPUT} placeholder="kg, ชิ้น..." />
          </Field>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {UNIT_PRESETS.map(u => (
            <button key={u} onClick={() => set('unit', u)} style={{
              padding: '4px 10px', borderRadius: 8, border: `1px solid ${form.unit === u ? 'var(--primary)' : 'var(--border2)'}`,
              background: form.unit === u ? 'rgba(255,159,10,0.15)' : 'var(--surface2)',
              color: form.unit === u ? 'var(--primary)' : 'var(--dim)',
              fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
            }}>{u}</button>
          ))}
        </div>

        <Field label="ราคา/หน่วย ฿">
          <input type="number" inputMode="decimal" value={form.pricePerUnit}
            onChange={e => { set('pricePerUnit', e.target.value); calcTotal(form.quantity, e.target.value, form.discount) }}
            style={{ ...INPUT, color: 'var(--primary)', fontWeight: 700, fontSize: 16 }} placeholder="0" />
        </Field>

        <Field label="ยอดรวม ฿">
          <input type="number" inputMode="decimal" value={form.amount}
            onChange={e => set('amount', e.target.value)}
            style={{ ...INPUT, color: 'var(--success)', fontWeight: 800, fontSize: 18 }} placeholder="0" />
        </Field>

        <Field label="ส่วนลดท้ายบิล">
          <input type="number" inputMode="decimal" value={form.discount}
            onChange={e => { set('discount', e.target.value); calcTotal(form.quantity, form.pricePerUnit, e.target.value) }}
            style={INPUT} placeholder="0" />
        </Field>

        <Field label="ร้าน / Vendor">
          <AutoComplete value={form.vendor} onChange={v => set('vendor', v)} suggestions={vendorHistory} placeholder="เช่น Makro" />
        </Field>

        <Field label="วิธีชำระ">
          <select value={form.payment} onChange={e => set('payment', e.target.value)} style={INPUT}>
            <option value="">เลือก...</option>
            {['เงินสด', 'โอน', 'บัตรเครดิต', 'QR Code'].map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </Field>

        <Field label="หมายเหตุ">
          <input value={form.note} onChange={e => set('note', e.target.value)} style={INPUT} placeholder="ไม่บังคับ" />
        </Field>

        <button onClick={handleSubmit} disabled={saving} style={{
          width: '100%', background: 'var(--primary)', color: '#000', border: 'none',
          borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit', opacity: saving ? 0.6 : 1, marginTop: 4,
        }}>
          {saving ? '⏳ กำลังบันทึก...' : '💾 บันทึก'}
        </button>
      </div>
    </div>
  )
}

// ─── LIST ────────────────────────────────────────────────────────────────────
function ExpenseList({ expenses, setExpenses }) {
  const [period, setPeriod] = useState('today')
  const [from, setFrom]     = useState(todayStr)
  const [to, setTo]         = useState(todayStr)
  const [search, setSearch] = useState('')
  const [editId, setEditId] = useState(null)
  const [editData, setEditData] = useState({})

  const filtered = useMemo(() => {
    let rows = period === 'custom' ? filterExpByRange(expenses, from, to) : filterExpByPeriod(expenses, period)
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(e => (e.item || '').toLowerCase().includes(q) || (e.vendor || '').toLowerCase().includes(q) || (e.category || '').toLowerCase().includes(q))
    }
    return rows
  }, [expenses, period, from, to, search])

  const total = filtered.reduce((s, e) => s + (e.amount || 0), 0)

  const handleDelete = async (id) => {
    if (!confirm('ลบรายการนี้?')) return
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) return alert('❌ ' + error.message)
    setExpenses(prev => prev.filter(e => e.id !== id))
  }

  const startEdit = (e) => {
    setEditId(e.id)
    setEditData({ item: e.item || '', amount: e.amount || '', quantity: e.quantity || '', unit: e.unit || '', date: e.date || '', vendor: e.vendor || '', price_per_unit: e.price_per_unit || '' })
  }

  const saveEdit = async () => {
    const { error } = await supabase.from('expenses').update({
      item: editData.item, amount: parseFloat(editData.amount) || 0,
      quantity: parseFloat(editData.quantity) || null, unit: editData.unit || null,
      date: editData.date || null, vendor: editData.vendor || null,
      price_per_unit: parseFloat(editData.price_per_unit) || null,
    }).eq('id', editId)
    if (error) return alert('❌ ' + error.message)
    setExpenses(prev => prev.map(e => e.id === editId ? { ...e, ...editData, amount: parseFloat(editData.amount), quantity: parseFloat(editData.quantity) || null } : e))
    setEditId(null)
  }

  return (
    <div>
      <PeriodBar period={period} onChange={setPeriod} options={PERIOD_OPTIONS} from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 ค้นหา..."
        style={{ ...INPUT, marginBottom: 12 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <div style={MINI_CARD}><div style={{ fontSize: 10, color: 'var(--dim)' }}>รวม</div><div style={{ color: 'var(--danger)', fontWeight: 800, fontFamily: "'Inter',sans-serif" }}>฿{fmt(total)}</div></div>
        <div style={MINI_CARD}><div style={{ fontSize: 10, color: 'var(--dim)' }}>รายการ</div><div style={{ fontWeight: 800 }}>{filtered.length}</div></div>
      </div>

      {filtered.map(e => {
        const cat = EXP_CATS.find(c => c.key === e.category)
        const isEdit = editId === e.id
        return (
          <div key={e.id} style={{ background: 'var(--surface)', borderRadius: 14, padding: '12px 14px', marginBottom: 8, border: '1px solid var(--border)' }}>
            {isEdit ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {[['รายการ', 'item', 'text'], ['วันที่', 'date', 'date'], ['จำนวน', 'quantity', 'number'], ['หน่วย', 'unit', 'text'], ['฿/หน่วย', 'price_per_unit', 'number'], ['ยอดรวม', 'amount', 'number'], ['ร้าน', 'vendor', 'text']].map(([label, key, type]) => (
                    <div key={key}>
                      <div style={{ fontSize: 9, color: 'var(--dim)', marginBottom: 2 }}>{label}</div>
                      <input type={type} value={editData[key]} onChange={ev => setEditData(d => ({ ...d, [key]: ev.target.value }))}
                        style={{ ...INPUT, padding: '7px 10px', fontSize: 13 }} />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setEditId(null)} style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border2)', color: 'var(--dim)', borderRadius: 10, padding: 10, cursor: 'pointer', fontFamily: 'inherit' }}>ยกเลิก</button>
                  <button onClick={saveEdit} style={{ flex: 2, background: 'var(--primary)', border: 'none', color: '#000', borderRadius: 10, padding: 10, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>💾 บันทึก</button>
                  <button onClick={() => handleDelete(e.id)} style={{ background: 'rgba(255,69,58,0.15)', border: '1px solid #FF453A44', color: 'var(--danger)', borderRadius: 10, padding: '10px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>🗑</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{e.item}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 10, color: cat?.color || '#888', background: 'var(--surface2)', padding: '2px 7px', borderRadius: 6 }}>{cat?.icon} {e.category}</span>
                    {e.vendor && <span style={{ fontSize: 10, color: 'var(--dim)' }}>{e.vendor}</span>}
                    {e.date && <span style={{ fontSize: 10, color: 'var(--dim)' }}>{e.date}</span>}
                  </div>
                  {(e.quantity || e.price_per_unit) && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      {e.quantity && <span style={{ fontSize: 11, color: 'var(--dim)' }}>{e.quantity}{e.unit}</span>}
                      {e.price_per_unit && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)' }}>฿{e.price_per_unit.toFixed(2)}/{e.unit || 'หน่วย'}</span>}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <div style={{ color: 'var(--danger)', fontWeight: 800, fontFamily: "'Inter',sans-serif" }}>-฿{fmt(e.amount)}</div>
                  <button onClick={() => startEdit(e)} style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '4px 8px', color: 'var(--dim)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>✏️</button>
                </div>
              </div>
            )}
          </div>
        )
      })}
      {filtered.length === 0 && <div style={{ textAlign: 'center', color: 'var(--dim)', padding: '30px 0' }}>ยังไม่มีรายการ</div>}
    </div>
  )
}

// ─── ANALYSIS ────────────────────────────────────────────────────────────────
function ExpenseAnalysis({ expenses, allOrders }) {
  const [period, setPeriod] = useState('30d')
  const [from, setFrom]     = useState(todayStr)
  const [to, setTo]         = useState(todayStr)

  const ANA_PERIOD_OPTIONS = [
    { key: '30d', label: 'เดือนนี้' },
    { key: '6m',  label: '6 เดือน' },
    { key: '1y',  label: '1 ปี' },
    { key: 'all', label: 'ทั้งหมด' },
  ]

  const expFiltered = useMemo(() =>
    period === 'custom' ? filterExpByRange(expenses, from, to) : filterExpByPeriod(expenses, period),
    [expenses, period, from, to]
  )
  const ordFiltered = useMemo(() => {
    const map = { '30d': '30d', '6m': '6m', '1y': '1y', 'all': 'all' }
    return period === 'custom' ? filterByRange(allOrders, from, to) : filterByPeriod(allOrders, map[period] || 'all')
  }, [allOrders, period, from, to])

  const totalRev  = ordFiltered.reduce((s, r) => s + (r.actual_amount || 0), 0)
  const totalExp  = expFiltered.filter(e => e.category !== 'ส่วนลด').reduce((s, e) => s + (e.amount || 0), 0)
  const profit    = totalRev - totalExp
  const margin    = totalRev > 0 ? Math.round(profit / totalRev * 100) : 0

  const catMap = {}
  expFiltered.forEach(e => { const c = e.category || 'อื่นๆ'; catMap[c] = (catMap[c] || 0) + (e.amount || 0) })
  const cats = Object.entries(catMap).sort((a, b) => b[1] - a[1])
  const maxCat = cats[0]?.[1] || 1

  // monthly chart
  const monthlyRev = {}, monthlyExp = {}
  ordFiltered.forEach(r => { const m = (r.created_at || '').slice(0, 7); if (m) monthlyRev[m] = (monthlyRev[m] || 0) + (r.actual_amount || 0) })
  expFiltered.filter(e => e.category !== 'ส่วนลด').forEach(e => { const m = (e.date || '').slice(0, 7); if (m) monthlyExp[m] = (monthlyExp[m] || 0) + (e.amount || 0) })
  const months = [...new Set([...Object.keys(monthlyRev), ...Object.keys(monthlyExp)])].sort().slice(-12)
  const chartData = months.map(m => ({
    label: new Date(+m.split('-')[0], +m.split('-')[1] - 1).toLocaleDateString('th-TH', { month: 'short', year: '2-digit' }),
    rev: Math.round(monthlyRev[m] || 0),
    exp: Math.round(monthlyExp[m] || 0),
  }))

  // vendor
  const vendorMap = {}
  expFiltered.forEach(e => { if (!e.vendor) return; if (!vendorMap[e.vendor]) vendorMap[e.vendor] = { cnt: 0, total: 0 }; vendorMap[e.vendor].cnt++; vendorMap[e.vendor].total += e.amount || 0 })
  const vendors = Object.entries(vendorMap).sort((a, b) => b[1].total - a[1].total).slice(0, 6)
  const maxVendor = vendors[0]?.[1].total || 1

  const TIP = { contentStyle: { background: '#1a1a1a', border: '1px solid #333', borderRadius: 8 }, labelStyle: { color: '#fff' } }

  return (
    <div>
      <PeriodBar period={period} onChange={setPeriod} options={ANA_PERIOD_OPTIONS} from={from} to={to} onFromChange={setFrom} onToChange={setTo} />

      {/* Profit card */}
      <div style={{ background: profit >= 0 ? 'rgba(50,215,75,0.1)' : 'rgba(255,69,58,0.1)', border: `1px solid ${profit >= 0 ? 'rgba(50,215,75,0.3)' : 'rgba(255,69,58,0.3)'}`, borderRadius: 18, padding: 20, marginBottom: 12, textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 1 }}>กำไรประมาณการ</div>
        <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 34, fontWeight: 800, color: profit >= 0 ? 'var(--success)' : 'var(--danger)', margin: '6px 0' }}>
          {profit < 0 ? '-' : ''}฿{fmt(Math.abs(profit))}
        </div>
        <div style={{ fontSize: 12, color: 'var(--dim)' }}>ยอดขาย ฿{fmt(totalRev)} − ต้นทุน ฿{fmt(totalExp)} · Margin {margin}%</div>
      </div>

      {/* Monthly chart */}
      <div style={{ background: 'var(--surface)', borderRadius: 18, padding: '14px 16px', marginBottom: 12, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 10 }}>📈 รายรับ vs ต้นทุน รายเดือน</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ left: -10, right: 5 }}>
            <XAxis dataKey="label" tick={{ fill: '#555', fontSize: 9 }} />
            <YAxis tick={{ fill: '#555', fontSize: 9 }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
            <Tooltip {...TIP} formatter={(v, n) => [`฿${fmt(v)}`, n === 'rev' ? 'รายรับ' : 'ต้นทุน']} />
            <Bar dataKey="rev" fill="rgba(50,215,75,0.7)" radius={[3, 3, 0, 0]} name="rev" />
            <Bar dataKey="exp" fill="rgba(255,69,58,0.7)" radius={[3, 3, 0, 0]} name="exp" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Category breakdown */}
      <div style={{ background: 'var(--surface)', borderRadius: 18, padding: '14px 16px', marginBottom: 12, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 12 }}>ต้นทุนแยกหมวด</div>
        {cats.map(([cat, val]) => {
          const c = EXP_CATS.find(x => x.key === cat)
          const pct = totalExp > 0 ? Math.round(val / totalExp * 100) : 0
          return (
            <div key={cat} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 13 }}>{c?.icon} {cat}</span>
                <span style={{ color: 'var(--danger)', fontWeight: 700, fontFamily: "'Inter',sans-serif", fontSize: 13 }}>฿{fmt(val)}</span>
              </div>
              <div style={{ height: 3, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round(val / maxCat * 100)}%`, background: c?.color || '#888', borderRadius: 2 }} />
              </div>
              <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 2 }}>{pct}% · {expFiltered.filter(e => e.category === cat).length} รายการ</div>
            </div>
          )
        })}
      </div>

      {/* Vendor */}
      {vendors.length > 0 && (
        <div style={{ background: 'var(--surface)', borderRadius: 18, padding: '14px 16px', marginBottom: 12, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 10 }}>🏪 Vendor ที่ใช้จ่ายมากสุด</div>
          {vendors.map(([v, d]) => (
            <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border2)' }}>
              <div style={{ flex: 1, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</div>
              <div style={{ flex: 1 }}>
                <div style={{ height: 4, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.round(d.total / maxVendor * 100)}%`, background: 'var(--primary)', borderRadius: 2 }} />
                </div>
              </div>
              <div style={{ textAlign: 'right', minWidth: 80 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>฿{fmt(d.total)}</div>
                <div style={{ fontSize: 10, color: 'var(--dim)' }}>{d.cnt} ครั้ง</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── ACTION NOTES ─────────────────────────────────────────────────────────────
function ActionNotes({ actionNotes, setActionNotes }) {
  const [form, setForm]     = useState({ date: todayStr, category: 'general', content: '' })
  const [editId, setEditId] = useState(null)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!form.content.trim()) return alert('กรุณาใส่รายละเอียด')
    setSaving(true)
    const { data, error } = await supabase.from('business_notes').insert({
      note_date: form.date, content: form.content.trim(), category: form.category,
    }).select().single()
    if (error) { alert('❌ ' + error.message); setSaving(false); return }
    setActionNotes(prev => [data, ...prev])
    setForm(f => ({ ...f, content: '' }))
    setSaving(false)
  }

  const handleDelete = async (id) => {
    if (!confirm('ลบรายการนี้?')) return
    const { error } = await supabase.from('business_notes').delete().eq('id', id)
    if (error) return alert('❌ ' + error.message)
    setActionNotes(prev => prev.filter(n => n.id !== id))
  }

  const handleEditSave = async (id) => {
    const { error } = await supabase.from('business_notes').update({ content: editContent }).eq('id', id)
    if (error) return alert('❌ ' + error.message)
    setActionNotes(prev => prev.map(n => n.id === id ? { ...n, content: editContent } : n))
    setEditId(null)
  }

  const CATS = Object.entries(ACTION_CAT_LABEL)

  return (
    <div>
      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 14, marginBottom: 14, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>📝 บันทึก Action / กิจกรรม</div>
        <Field label="วันที่">
          <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={INPUT} />
        </Field>
        <Field label="หมวดหมู่">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {CATS.map(([key, label]) => (
              <button key={key} onClick={() => setForm(f => ({ ...f, category: key }))} style={{
                padding: '7px 12px', borderRadius: 10, border: `1px solid ${form.category === key ? ACTION_CAT_COLOR[key] : 'var(--border2)'}`,
                background: form.category === key ? ACTION_CAT_COLOR[key] + '22' : 'var(--surface2)',
                color: form.category === key ? ACTION_CAT_COLOR[key] : 'var(--dim)',
                fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
              }}>{label}</button>
            ))}
          </div>
        </Field>
        <Field label="รายละเอียด">
          <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
            rows={3} placeholder="เช่น ยิงโฆษณา Facebook ฿500, ปรับลดต้นทุน..."
            style={{ ...INPUT, resize: 'vertical' }} />
        </Field>
        <button onClick={handleSave} disabled={saving} style={{
          width: '100%', background: 'var(--primary)', color: '#000', border: 'none', borderRadius: 12,
          padding: 13, fontSize: 14, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1,
        }}>+ บันทึก Action</button>
      </div>

      {actionNotes.map(n => {
        const col = ACTION_CAT_COLOR[n.category] || '#666'
        const lbl = ACTION_CAT_LABEL[n.category] || n.category
        return (
          <div key={n.id} style={{ background: 'var(--surface)', borderLeft: `4px solid ${col}`, borderRadius: 14, padding: 14, marginBottom: 10, border: `1px solid ${col}33`, borderLeftWidth: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 800, fontSize: 14 }}>{n.note_date}</span>
                <span style={{ fontSize: 11, background: col + '22', color: col, padding: '2px 8px', borderRadius: 20, fontWeight: 700 }}>{lbl}</span>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => { setEditId(n.id); setEditContent(n.content) }} style={{ background: 'none', border: 'none', color: 'var(--dim)', cursor: 'pointer', fontSize: 14 }}>✏️</button>
                <button onClick={() => handleDelete(n.id)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 14 }}>🗑</button>
              </div>
            </div>
            {editId === n.id ? (
              <div>
                <textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={3}
                  style={{ ...INPUT, resize: 'vertical', marginBottom: 8 }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setEditId(null)} style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border2)', color: 'var(--dim)', borderRadius: 10, padding: 10, cursor: 'pointer', fontFamily: 'inherit' }}>ยกเลิก</button>
                  <button onClick={() => handleEditSave(n.id)} style={{ flex: 2, background: 'var(--primary)', border: 'none', color: '#000', borderRadius: 10, padding: 10, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>💾 บันทึก</button>
                </div>
              </div>
            ) : (
              <div style={{ color: 'var(--text)', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{n.content}</div>
            )}
          </div>
        )
      })}
      {actionNotes.length === 0 && <div style={{ textAlign: 'center', color: 'var(--dim)', padding: '30px 0' }}>ยังไม่มี Action — บันทึกด้านบนได้เลย</div>}
    </div>
  )
}

// ─── BACKUP ──────────────────────────────────────────────────────────────────
function Backup({ allOrders }) {
  const handleExportOrders = async () => {
    const { data: orders, error } = await supabase.from('orders').select('*, order_items(*)').order('created_at', { ascending: false })
    if (error || !orders?.length) return alert('ไม่มีข้อมูล')
    const rows = []
    rows.push(['วันที่', 'เวลา', 'บิล ID', 'ช่องทาง', 'โต๊ะ', 'สมาชิก', 'รายการ', 'ตัวเลือกเสริม', 'จำนวน', 'ราคา/ชิ้น', 'รวมรายการ', 'ยอดบิล', 'ชำระ', 'สถานะ'].join(','))
    for (const o of orders) {
      const dt = new Date(o.created_at)
      const items = o.order_items || []
      if (!items.length) {
        rows.push([dt.toLocaleDateString('th-TH'), dt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }), o.id, o.channel || '', o.table_number || '', o.member_phone || '', '', '', '', '', '', o.total || 0, o.actual_amount || 0, o.status || ''].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      } else {
        items.forEach((item, i) => {
          const itemTotal = (item.price + (item.modifier_price || 0)) * item.qty
          rows.push([i === 0 ? dt.toLocaleDateString('th-TH') : '', i === 0 ? dt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '', i === 0 ? o.id : '', i === 0 ? (o.channel || '') : '', i === 0 ? (o.table_number || '') : '', i === 0 ? (o.member_phone || '') : '', item.name || '', item.modifier_name || '', item.qty || 1, item.price || 0, itemTotal, i === 0 ? (o.total || 0) : '', i === 0 ? (o.actual_amount || 0) : '', i === 0 ? (o.status || '') : ''].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
        })
      }
    }
    const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a')
    a.href = url; a.download = `orders_${new Date().toLocaleDateString('en-CA')}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  const btnStyle = { width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', color: '#fff', borderRadius: 14, padding: 14, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 10 }

  return (
    <div>
      <button style={btnStyle} onClick={() => exportCSV(supabase, 'expenses')}>📥 Export ค่าใช้จ่าย CSV</button>
      <button style={btnStyle} onClick={() => exportCSV(supabase, 'other_income')}>📥 Export รายได้อื่น CSV</button>
      <button style={btnStyle} onClick={() => exportCSV(supabase, 'orders')}>📥 Export ออเดอร์ CSV</button>
      <button style={{ ...btnStyle, background: 'var(--primary)', color: '#000', border: 'none', fontWeight: 800 }} onClick={handleExportOrders}>📊 Export รายการละเอียด</button>
    </div>
  )
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  )
}

function AutoComplete({ value, onChange, suggestions, placeholder }) {
  const [open, setOpen] = useState(false)
  const matches = suggestions.filter(s => s.toLowerCase().includes((value || '').toLowerCase())).slice(0, 6)
  return (
    <div style={{ position: 'relative' }}>
      <input value={value} onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder} style={INPUT} />
      {open && matches.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#1e1e1e', border: '1px solid #333', borderRadius: 10, zIndex: 100, maxHeight: 160, overflowY: 'auto', marginTop: 4 }}>
          {matches.map(m => (
            <div key={m} onMouseDown={() => onChange(m)} style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #2a2a2a' }}>{m}</div>
          ))}
        </div>
      )}
    </div>
  )
}

const MINI_CARD = { background: 'var(--surface)', borderRadius: 12, padding: '12px 14px', border: '1px solid var(--border)', textAlign: 'center' }
