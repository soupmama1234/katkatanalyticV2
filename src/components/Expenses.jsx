import { useState, useMemo, useCallback } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { supabase } from '../supabase.js'
import {
  filterExpByPeriod, filterExpByRange, filterByPeriod, filterByRange,
  fmt, todayStr, guessExpCategory, exportCSV, CHART_TIP} from '../utils/helpers.js'
import { EXP_CATS, UNIT_PRESETS, VENDORS, GEMINI_MODEL, ACTION_CAT_LABEL, ACTION_CAT_COLOR, EXP_PERIODS } from '../utils/constants.js'
import PeriodBar from './ui/PeriodBar.jsx'
import { useNotify, Toast, ConfirmDialog } from './ui/Toast.jsx'

const TABS = ['บันทึก', 'รายการ', 'วิเคราะห์', 'Forecast', 'Action', 'Backup']

const INPUT = {
  background: 'var(--surface2)', border: '1px solid var(--border2)',
  color: '#fff', borderRadius: 10, padding: '11px 13px',
  fontSize: 14, outline: 'none', width: '100%',
  fontFamily: 'inherit', boxSizing: 'border-box',
}

export default function Expenses({ expenses, setExpenses, allOrders, actionNotes, setActionNotes }) {
  const [tab, setTab] = useState('บันทึก')
  const { toast, dialog, notify, confirm, handleConfirm } = useNotify()

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

      {tab === 'บันทึก'    && <ExpenseForm    expenses={expenses} setExpenses={setExpenses} notify={notify} />}
      {tab === 'รายการ'    && <ExpenseList    expenses={expenses} setExpenses={setExpenses} notify={notify} confirm={confirm} />}
      {tab === 'วิเคราะห์' && <ExpenseAnalysis expenses={expenses} allOrders={allOrders} />}
      {tab === 'Forecast'  && <Forecast        expenses={expenses} />}
      {tab === 'Action'    && <ActionNotes     actionNotes={actionNotes} setActionNotes={setActionNotes} notify={notify} confirm={confirm} />}
      {tab === 'Backup'    && <Backup          allOrders={allOrders} notify={notify} />}

      <Toast toast={toast} />
      <ConfirmDialog dialog={dialog} onConfirm={handleConfirm} />
    </div>
  )
}

// ─── FORM ────────────────────────────────────────────────────────────────────
function ExpenseForm({ expenses, setExpenses, notify }) {
  const emptyForm = { date: todayStr, item: '', category: '', quantity: '', unit: '', pricePerUnit: '', amount: '', discount: '', vendor: '', payment: '', note: '' }
  const [form, setForm]         = useState(emptyForm)
  const [saving, setSaving]     = useState(false)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrItems, setOcrItems] = useState([])
  const [ocrChecked, setOcrChecked] = useState([])
  const [suggOpen, setSuggOpen] = useState(null) // index ของ row ที่เปิด dropdown
  const [userSetCat, setUserSetCat] = useState(false) // true = user เลือกหมวดเองแล้ว ไม่ auto-override

  const itemHistory   = useMemo(() => [...new Set(expenses.map(e => e.item).filter(Boolean))], [expenses])
  const vendorHistory = useMemo(() => [...new Set([...VENDORS, ...expenses.map(e => e.vendor).filter(Boolean)])], [expenses])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // 2-way calculation
  // direction: 'ppu' = qty+amount→ppu, 'amount' = qty+ppu→amount
  const calcAuto = (qty, ppu, amount, disc, direction) => {
    const q = parseFloat(qty) || 0
    const p = parseFloat(ppu) || 0
    const a = parseFloat(amount) || 0
    const d = parseFloat(disc) || 0
    if (direction === 'amount' && q > 0 && p > 0) {
      // qty + ppu → amount
      set('amount', Math.max(0, q * p - d).toFixed(2))
    } else if (direction === 'ppu' && q > 0 && a > 0) {
      // qty + amount → ppu
      set('pricePerUnit', ((a + d) / q).toFixed(2))
    }
  }

  const handleSubmit = async () => {
    if (!form.item.trim())     return notify('กรุณาใส่ชื่อรายการ', 'warning')
    if (!form.category)        return notify('กรุณาเลือกหมวดหมู่', 'warning')
    if (!parseFloat(form.amount)) return notify('กรุณาใส่ยอดเงิน', 'warning')
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
      setUserSetCat(false)
    } catch (e) { notify('บันทึกไม่สำเร็จ: ' + e.message, 'error') }
    setSaving(false)
  }

  // OCR
  const handleOCR = async (file) => {
    if (!file) return
    setOcrLoading(true)
    setOcrItems([])
    try {
      const b64 = await new Promise((res, rej) => {
        const reader = new FileReader()
        reader.onload = () => {
          const img = new Image()
          img.onload = () => {
            // ลด size ลงเพื่อความเร็ว — OCR ไม่ต้องการความละเอียดสูง
            const MAX = 1600
            let w = img.width, h = img.height
            if (w > MAX || h > MAX) {
              if (w > h) { h = Math.round(h * MAX / w); w = MAX }
              else { w = Math.round(w * MAX / h); h = MAX }
            }
            const canvas = document.createElement('canvas')
            canvas.width = w; canvas.height = h
            const ctx = canvas.getContext('2d')
            ctx.filter = 'contrast(1.2) brightness(1.05)'
            ctx.drawImage(img, 0, 0, w, h)
            res(canvas.toDataURL('image/jpeg', 0.80).split(',')[1])
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
format: [{"item":"ชื่อสินค้า","quantity":จำนวน,"unit":"หน่วย","amount":ราคารวมก่อนหักส่วนลด,"discount":ส่วนลดเป็นตัวเลข,"vendor":"ชื่อร้าน","date":"YYYY-MM-DD"}]
กฎ: item ตรงหรือใกล้เคียงรายการในระบบให้ใช้ชื่อนั้น, quantity/amount/discount เป็นตัวเลขไม่มีสัญลักษณ์, discount=0 ถ้าไม่มี, date YYYY-MM-DD หรือ null`

      const resp = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: GEMINI_MODEL,
          contents: [{ parts: [{ inline_data: { mime_type: 'image/jpeg', data: b64 } }, { text: prompt }] }],
          generationConfig: { temperature: 0.1 },
        }),
      })
      const result = await resp.json()
      if (!resp.ok) throw new Error(result.error || 'API error')
      const raw = result.candidates?.[0]?.content?.parts?.[0]?.text || '[]'
      const items = JSON.parse(raw.replace(/```json|```/g, '').trim())
      if (!items.length) return notify('ไม่พบรายการในรูปนี้', 'warning')
      setOcrItems(items.map((it, i) => ({
        ...it,
        id: i,
        category: guessExpCategory(it.item || ''),
        discount: it.discount || 0,
        ppu: it.quantity && it.amount ? Math.round(it.amount / it.quantity * 100) / 100 : '',
      })))
      setOcrChecked(items.map((_, i) => i))
    } catch (e) { notify('OCR Error: ' + e.message, 'error') }
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
        amount: Math.max(0, (parseFloat(it.amount) || 0) - (parseFloat(it.discount) || 0)),
        vendor: it.vendor || null,
        note: 'ocr',
      })).filter(it => it.amount > 0)
    if (!toSave.length) return notify('ไม่มีรายการที่เลือก', 'warning')
    const { data, error } = await supabase.from('expenses').insert(toSave).select()
    if (error) return notify('บันทึกไม่สำเร็จ: ' + error.message, 'error')
    setExpenses(prev => [...(data || []), ...prev])
    setOcrItems([])
    setOcrChecked([])
    notify(`บันทึก ${toSave.length} รายการเรียบร้อย`)
  }

  // fuzzy match — หา suggestions จาก itemHistory ตาม keyword
  const getSuggestions = (keyword) => {
    if (!keyword || keyword.length < 1) return []
    const kw = keyword.toLowerCase().replace(/\s+/g, '')
    return itemHistory
      .filter(name => {
        const n = name.toLowerCase().replace(/\s+/g, '')
        // exact substring หรือ character overlap สูง
        return n.includes(kw) || kw.includes(n) ||
          [...kw].filter(c => n.includes(c)).length >= Math.ceil(kw.length * 0.6)
      })
      .slice(0, 6)
  }

  return (
    <div>

      {/* OCR — 2 ปุ่ม: ถ่ายตอนนี้ + เลือกจากคลัง */}
      <div style={{ marginBottom: 14 }}>
        {ocrLoading ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: '#1a1a2e', border: '1px solid #4D96FF44', borderRadius: 14, padding: '14px',
            color: '#888', fontWeight: 700, fontSize: 14,
          }}>
            ⏳ กำลังอ่านใบเสร็จ...
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {/* ปุ่ม 1: เปิดกล้องโดยตรง */}
            <label style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              background: 'linear-gradient(135deg,#1a2e1a,#162e16)', border: '1px solid #4caf5044',
              borderRadius: 14, padding: '14px', color: '#4caf50', fontWeight: 700, fontSize: 13,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              📷 ถ่ายเลย
              <input type="file" accept="image/*" capture="environment"
                style={{ display: 'none' }} onChange={e => handleOCR(e.target.files[0])} />
            </label>
            {/* ปุ่ม 2: เลือกจากคลังรูป */}
            <label style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              background: 'linear-gradient(135deg,#1a1a2e,#16213e)', border: '1px solid #4D96FF44',
              borderRadius: 14, padding: '14px', color: '#4D96FF', fontWeight: 700, fontSize: 13,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              🖼️ คลังรูป
              <input type="file" accept="image/*"
                style={{ display: 'none' }} onChange={e => handleOCR(e.target.files[0])} />
            </label>
          </div>
        )}
      </div>

      {/* OCR results */}
      {ocrItems.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid #4D96FF33', borderRadius: 16, padding: 14, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#4D96FF' }}>✨ พบ {ocrItems.length} รายการ</div>
            <button onClick={() => { setOcrItems([]); setOcrChecked([]) }}
              style={{ background: 'none', border: '1px solid #ff453a44', borderRadius: 8, padding: '4px 10px', color: '#FF453A', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
              ✕ ยกเลิก
            </button>
          </div>
          {ocrItems.map((it, i) => (
            <div key={i} style={{ borderBottom: '1px solid var(--border2)', paddingBottom: 10, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <input type="checkbox" checked={ocrChecked.includes(i)}
                  onChange={e => setOcrChecked(prev => e.target.checked ? [...prev, i] : prev.filter(x => x !== i))}
                  style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#4D96FF' }} />
                <div style={{ flex: 1, position: 'relative' }}>
                  <input
                    value={it.editItem ?? it.item}
                    onChange={e => {
                      setOcrItems(prev => prev.map((x, j) => j === i ? { ...x, editItem: e.target.value } : x))
                      setSuggOpen(i)
                    }}
                    onFocus={() => setSuggOpen(i)}
                    onBlur={() => setTimeout(() => setSuggOpen(null), 150)}
                    style={{ ...INPUT, width: '100%', fontSize: 13, fontWeight: 700, padding: '6px 10px' }}
                  />
                  {/* Suggestion dropdown */}
                  {suggOpen === i && (() => {
                    const suggs = getSuggestions(it.editItem ?? it.item)
                    if (!suggs.length) return null
                    return (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                        background: '#1e1e1e', border: '1px solid #4D96FF44',
                        borderRadius: 10, marginTop: 4, overflow: 'hidden',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                      }}>
                        <div style={{ padding: '6px 10px', fontSize: 9, color: '#4D96FF', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--border2)' }}>
                          📌 รายการในระบบ
                        </div>
                        {suggs.map((name, si) => (
                          <div
                            key={si}
                            onMouseDown={() => {
                              setOcrItems(prev => prev.map((x, j) => j === i ? { ...x, editItem: name, category: guessExpCategory(name) } : x))
                              setSuggOpen(null)
                            }}
                            style={{
                              padding: '9px 12px', fontSize: 13, cursor: 'pointer',
                              color: '#fff', borderBottom: '1px solid var(--border2)',
                              display: 'flex', alignItems: 'center', gap: 8,
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = '#2a2a2a'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <span style={{ fontSize: 14 }}>📌</span>
                            <span style={{ flex: 1 }}>{name}</span>
                            {name !== (it.editItem ?? it.item) && (
                              <span style={{ fontSize: 10, color: 'var(--dim)' }}>แทนที่</span>
                            )}
                          </div>
                        ))}
                        <div
                          onMouseDown={() => setSuggOpen(null)}
                          style={{
                            padding: '8px 12px', fontSize: 12, cursor: 'pointer',
                            color: '#4D96FF', display: 'flex', alignItems: 'center', gap: 6,
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = '#1a1a2e'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <span>✏️</span>
                          <span>ใช้ "{it.editItem ?? it.item}"</span>
                        </div>
                      </div>
                    )
                  })()}
                </div>
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
                <span style={{ fontSize: 10, color: 'var(--dim)' }}>ยอด ฿</span>
                <input type="number" value={it.amount ?? ''} onChange={e => setOcrItems(prev => prev.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))}
                  style={{ ...INPUT, flex: 1, fontSize: 14, fontWeight: 800, color: 'var(--success)', padding: '6px 8px' }} />
                <span style={{ fontSize: 10, color: 'var(--dim)' }}>ลด ฿</span>
                <input type="number" value={it.discount ?? 0} onChange={e => setOcrItems(prev => prev.map((x, j) => j === i ? { ...x, discount: e.target.value } : x))}
                  style={{ ...INPUT, width: 60, fontSize: 13, fontWeight: 700, color: '#FF9F0A', padding: '6px 8px', textAlign: 'center' }} />
                {it.vendor && <span style={{ fontSize: 10, color: 'var(--dim)', flexShrink: 0 }}>{it.vendor}</span>}
              </div>
              {/* net amount preview */}
              {(parseFloat(it.discount) > 0) && (
                <div style={{ paddingLeft: 26, marginTop: 4, fontSize: 11, color: 'var(--success)' }}>
                  สุทธิ ฿{Math.max(0, (parseFloat(it.amount) || 0) - (parseFloat(it.discount) || 0)).toFixed(2)}
                </div>
              )}
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
              <button key={c.key} onClick={() => { set('category', c.key); setUserSetCat(true) }} style={{
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
            value={form.item}
            onChange={v => {
              set('item', v)
              // auto-suggest category ถ้า user ยังไม่ได้เลือกเอง
              if (!userSetCat && v.length >= 2) {
                const guessed = guessExpCategory(v)
                if (guessed) set('category', guessed)
              }
            }}
            suggestions={itemHistory} placeholder="เช่น หมูสันนอก"
          />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="จำนวน">
            <input type="number" inputMode="decimal" value={form.quantity}
              onChange={e => { set('quantity', e.target.value); calcAuto(e.target.value, form.pricePerUnit, form.amount, form.discount, form.pricePerUnit ? 'amount' : 'ppu') }}
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
            onChange={e => { set('pricePerUnit', e.target.value); calcAuto(form.quantity, e.target.value, form.amount, form.discount, 'amount') }}
            style={{ ...INPUT, color: 'var(--primary)', fontWeight: 700, fontSize: 16 }} placeholder="0" />
        </Field>

        <Field label="ยอดรวม ฿">
          <input type="number" inputMode="decimal" value={form.amount}
            onChange={e => {
              set('amount', e.target.value)
              // ถ้ามี qty แต่ยังไม่มี ppu → คำนวณ ppu ให้
              if (form.quantity && !form.pricePerUnit) {
                calcAuto(form.quantity, form.pricePerUnit, e.target.value, form.discount, 'ppu')
              }
            }}
            style={{ ...INPUT, color: 'var(--success)', fontWeight: 800, fontSize: 18 }} placeholder="0" />
        </Field>

        <Field label="ส่วนลดท้ายบิล">
          <input type="number" inputMode="decimal" value={form.discount}
            onChange={e => { set('discount', e.target.value); calcAuto(form.quantity, form.pricePerUnit, form.amount, e.target.value, 'amount') }}
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
function ExpenseList({ expenses, setExpenses, notify, confirm }) {
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
    const item = filtered.find(e => e.id === id)
    const ok = await confirm(`ลบ "${item?.item || 'รายการนี้'}" ออกจากบันทึกต้นทุน?`)
    if (!ok) return
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) return notify('ลบไม่สำเร็จ: ' + error.message, 'error')
    setExpenses(prev => prev.filter(e => e.id !== id))
    notify('ลบรายการเรียบร้อย')
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
    if (error) return notify('บันทึกไม่สำเร็จ: ' + error.message, 'error')
    setExpenses(prev => prev.map(e => e.id === editId ? { ...e, ...editData, amount: parseFloat(editData.amount), quantity: parseFloat(editData.quantity) || null } : e))
    setEditId(null)
  }

  return (
    <div>
      <PeriodBar period={period} onChange={setPeriod} options={EXP_PERIODS} from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
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

  // expenses ใช้ date field (YYYY-MM-DD)
  const expFiltered = useMemo(() =>
    period === 'custom' ? filterExpByRange(expenses, from, to) : filterExpByPeriod(expenses, period),
    [expenses, period, from, to]
  )

  // orders ใช้ created_at — แปลง period ให้ตรงกัน
  const ordFiltered = useMemo(() =>
    period === 'custom' ? filterByRange(allOrders, from, to) : filterByPeriod(allOrders, period),
    [allOrders, period, from, to]
  )

  const totalRev = ordFiltered.reduce((s, r) => s + (r.actual_amount || 0), 0)
  const totalExp = expFiltered.filter(e => e.category !== 'ส่วนลด').reduce((s, e) => s + (e.amount || 0), 0)
  const profit   = totalRev - totalExp
  const margin   = totalRev > 0 ? Math.round(profit / totalRev * 100) : 0
  const expCount = expFiltered.length
  const avgExp   = expCount ? Math.round(totalExp / expCount) : 0

  // category breakdown
  const catMap = {}
  expFiltered.forEach(e => {
    const c = e.category || 'อื่นๆ'
    catMap[c] = (catMap[c] || 0) + (e.amount || 0)
  })
  const cats   = Object.entries(catMap).sort((a, b) => b[1] - a[1])
  const maxCat = cats[0]?.[1] || 1

  // monthly chart — รวม months จากทั้ง orders และ expenses
  const monthlyRev = {}, monthlyExp = {}
  ordFiltered.forEach(r => {
    const m = (r.created_at || '').slice(0, 7)
    if (m) monthlyRev[m] = (monthlyRev[m] || 0) + (r.actual_amount || 0)
  })
  expFiltered.filter(e => e.category !== 'ส่วนลด').forEach(e => {
    const m = (e.date || '').slice(0, 7)
    if (m) monthlyExp[m] = (monthlyExp[m] || 0) + (e.amount || 0)
  })
  const months = [...new Set([...Object.keys(monthlyRev), ...Object.keys(monthlyExp)])].sort().slice(-12)
  const chartData = months.map(m => ({
    label: new Date(+m.split('-')[0], +m.split('-')[1] - 1)
      .toLocaleDateString('th-TH', { month: 'short', year: '2-digit' }),
    rev:    Math.round(monthlyRev[m] || 0),
    exp:    Math.round(monthlyExp[m] || 0),
    profit: Math.round((monthlyRev[m] || 0) - (monthlyExp[m] || 0)),
  }))

  // vendor breakdown
  const vendorMap = {}
  expFiltered.forEach(e => {
    if (!e.vendor) return
    if (!vendorMap[e.vendor]) vendorMap[e.vendor] = { cnt: 0, total: 0 }
    vendorMap[e.vendor].cnt++
    vendorMap[e.vendor].total += e.amount || 0
  })
  const vendors   = Object.entries(vendorMap).sort((a, b) => b[1].total - a[1].total).slice(0, 6)
  const maxVendor = vendors[0]?.[1].total || 1

  return (
    <div>
      <PeriodBar period={period} onChange={setPeriod} options={EXP_PERIODS}
        from={from} to={to} onFromChange={setFrom} onToChange={setTo} />

      {/* Summary stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        {[
          { icon: '💸', label: 'ต้นทุนรวม',    val: `฿${fmt(totalExp)}`,   color: 'var(--danger)'  },
          { icon: '💰', label: 'รายรับรวม',    val: `฿${fmt(totalRev)}`,   color: 'var(--success)' },
          { icon: '📈', label: 'กำไรประมาณการ', val: `฿${fmt(Math.abs(profit))}`, color: profit >= 0 ? 'var(--success)' : 'var(--danger)' },
          { icon: '🎯', label: 'Margin',        val: totalRev > 0 ? `${margin}%` : '—', color: margin >= 30 ? 'var(--success)' : margin >= 0 ? 'var(--primary)' : 'var(--danger)' },
        ].map(({ icon, label, val, color }) => (
          <div key={label} style={{
            background: 'var(--surface)', borderRadius: 14, padding: '14px',
            border: '1px solid var(--border)', textAlign: 'center',
          }}>
            <div style={{ fontSize: 18, marginBottom: 4 }}>{icon}</div>
            <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 800, fontSize: 18, color, marginBottom: 2 }}>{val}</div>
            <div style={{ fontSize: 11, color: 'var(--dim)' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Monthly chart */}
      {chartData.length > 0 && (
        <div style={{ background: 'var(--surface)', borderRadius: 18, padding: '14px 16px', marginBottom: 12, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
            📊 รายรับ vs ต้นทุน รายเดือน
          </div>
          {/* Legend */}
          <div style={{ display: 'flex', gap: 14, marginBottom: 10 }}>
            {[['rgba(50,215,75,0.8)', 'รายรับ'], ['rgba(255,69,58,0.8)', 'ต้นทุน']].map(([color, label]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
                <span style={{ fontSize: 11, color: 'var(--dim)' }}>{label}</span>
              </div>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} margin={{ left: -10, right: 5 }}>
              <XAxis dataKey="label" tick={{ fill: '#555', fontSize: 9 }} />
              <YAxis tick={{ fill: '#555', fontSize: 9 }} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
              <Tooltip {...CHART_TIP} formatter={(v, n) => [`฿${fmt(v)}`, n === 'rev' ? 'รายรับ' : n === 'exp' ? 'ต้นทุน' : 'กำไร']} />
              <Bar dataKey="rev" fill="rgba(50,215,75,0.8)"  radius={[3,3,0,0]} name="rev" />
              <Bar dataKey="exp" fill="rgba(255,69,58,0.8)"  radius={[3,3,0,0]} name="exp" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Category breakdown */}
      <div style={{ background: 'var(--surface)', borderRadius: 18, padding: '14px 16px', marginBottom: 12, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, color: 'var(--dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
          📂 ต้นทุนแยกหมวด
        </div>
        {cats.length === 0 && <div style={{ color: 'var(--dim)', textAlign: 'center', padding: '16px 0', fontSize: 13 }}>ยังไม่มีข้อมูล</div>}
        {cats.map(([cat, val]) => {
          const c   = EXP_CATS.find(x => x.key === cat)
          const pct = totalExp > 0 ? Math.round(val / totalExp * 100) : 0
          const cnt = expFiltered.filter(e => e.category === cat).length
          return (
            <div key={cat} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 16 }}>{c?.icon || '📦'}</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{cat}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ color: 'var(--danger)', fontWeight: 700, fontFamily: "'Inter',sans-serif", fontSize: 14 }}>
                    ฿{fmt(Math.round(val))}
                  </span>
                  <span style={{ color: 'var(--dim)', fontSize: 11, marginLeft: 6 }}>{pct}%</span>
                </div>
              </div>
              <div style={{ height: 6, background: '#1a1a1a', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round(val / maxCat * 100)}%`,
                  background: c?.color || '#888', borderRadius: 3, transition: 'width 0.4s' }} />
              </div>
              <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 3 }}>{cnt} รายการ</div>
            </div>
          )
        })}
      </div>

      {/* Vendor */}
      {vendors.length > 0 && (
        <div style={{ background: 'var(--surface)', borderRadius: 18, padding: '14px 16px', marginBottom: 12, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
            🏪 Vendor ที่ใช้จ่ายมากสุด
          </div>
          {vendors.map(([v, d]) => (
            <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border2)' }}>
              <div style={{ flex: 1, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</div>
              <div style={{ flex: 1 }}>
                <div style={{ height: 4, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.round(d.total / maxVendor * 100)}%`,
                    background: 'var(--primary)', borderRadius: 2 }} />
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
function ActionNotes({ actionNotes, setActionNotes, notify, confirm }) {
  const [form, setForm]     = useState({ date: todayStr, category: 'general', content: '' })
  const [editId, setEditId] = useState(null)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)

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
    const ok = await confirm(`ลบ Action Note นี้?\n"${note?.content?.slice(0, 40) || ''}${(note?.content?.length || 0) > 40 ? '...' : ''}"'`)
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
// ─── FORECAST ─────────────────────────────────────────────────────────────────
function Forecast({ expenses }) {
  // ดึงเฉพาะ 3 เดือนล่าสุด (ไม่รวมเดือนปัจจุบัน)
  const now = new Date()
  const [showAll, setShowAll] = useState(false)

  const data = useMemo(() => {
    // สร้าง map รายเดือน: { 'YYYY-MM': { total, byCategory, byItem } }
    const monthMap = {}

    expenses.forEach(e => {
      if (!e.date || !e.amount) return
      const month = e.date.slice(0, 7)
      if (!monthMap[month]) monthMap[month] = { total: 0, byCategory: {}, byItem: {} }
      const amt = parseFloat(e.amount) || 0
      monthMap[month].total += amt

      const cat = e.category || 'อื่นๆ'
      monthMap[month].byCategory[cat] = (monthMap[month].byCategory[cat] || 0) + amt

      const item = e.item || 'ไม่ระบุ'
      const qty  = parseFloat(e.quantity) || 0
      const unit = e.unit || ''
      if (!monthMap[month].byItem[item]) monthMap[month].byItem[item] = { total: 0, count: 0, qty: 0, unit: '' }
      monthMap[month].byItem[item].total += amt
      monthMap[month].byItem[item].count += 1
      monthMap[month].byItem[item].qty   += qty
      if (unit && !monthMap[month].byItem[item].unit) monthMap[month].byItem[item].unit = unit
    })

    // เรียง months และเอา 6 เดือนล่าสุด
    const sortedMonths = Object.keys(monthMap).sort()
    const last6 = sortedMonths.slice(-6)
    const last3 = sortedMonths.slice(-3)

    // คำนวณ average รายหมวดจาก 3 เดือนล่าสุด
    const catForecast = {}
    last3.forEach(m => {
      Object.entries(monthMap[m].byCategory).forEach(([cat, amt]) => {
        if (!catForecast[cat]) catForecast[cat] = []
        catForecast[cat].push(amt)
      })
    })

    // forecast รายหมวด = weighted average (เดือนล่าสุดหนักกว่า)
    const catPrediction = {}
    Object.entries(catForecast).forEach(([cat, vals]) => {
      if (vals.length === 1) catPrediction[cat] = vals[0]
      else if (vals.length === 2) catPrediction[cat] = vals[0] * 0.4 + vals[1] * 0.6
      else catPrediction[cat] = vals[0] * 0.2 + vals[1] * 0.35 + vals[2] * 0.45
    })

    // trend รายหมวด: เปรียบเทียบ เดือนล่าสุด vs เฉลี่ย 3 เดือน
    const catTrend = {}
    const lastMonth = last3[last3.length - 1]
    if (lastMonth) {
      Object.entries(catPrediction).forEach(([cat, pred]) => {
        const last = monthMap[lastMonth]?.byCategory[cat] || 0
        catTrend[cat] = pred > 0 ? Math.round((last - pred) / pred * 100) : 0
      })
    }

    // all items forecast พร้อม qty + unit
    const itemForecast = {}
    last3.forEach(m => {
      Object.entries(monthMap[m].byItem).forEach(([item, d]) => {
        if (!itemForecast[item]) itemForecast[item] = { amounts: [], qtys: [], unit: d.unit || '' }
        itemForecast[item].amounts.push(d.total)
        itemForecast[item].qtys.push(d.qty)
        if (d.unit && !itemForecast[item].unit) itemForecast[item].unit = d.unit
      })
    })

    const weightedAvg = (vals) => {
      if (vals.length === 0) return 0
      if (vals.length === 1) return vals[0]
      if (vals.length === 2) return vals[0] * 0.4 + vals[1] * 0.6
      return vals[0] * 0.2 + vals[1] * 0.35 + vals[2] * 0.45
    }

    const allItemPrediction = Object.entries(itemForecast)
      .map(([item, d]) => {
        const pred    = weightedAvg(d.amounts)
        const predQty = weightedAvg(d.qtys.filter(q => q > 0))
        const trend   = d.amounts.length >= 2
          ? Math.round((d.amounts[d.amounts.length - 1] - d.amounts[0]) / (d.amounts[0] || 1) * 100)
          : 0
        const qtyTrend = d.qtys.length >= 2 && d.qtys[0] > 0
          ? Math.round((d.qtys[d.qtys.length - 1] - d.qtys[0]) / d.qtys[0] * 100)
          : 0
        return { item, pred, predQty, unit: d.unit, trend, qtyTrend, months: d.amounts.length }
      })
      .sort((a, b) => b.pred - a.pred)

    // total forecast
    const totalForecast = Object.values(catPrediction).reduce((s, v) => s + v, 0)

    // chart data: monthly total 6 เดือน + forecast
    const chartData = last6.map(m => ({
      label: new Date(m + '-01').toLocaleDateString('th-TH', { month: 'short', year: '2-digit' }),
      actual: Math.round(monthMap[m].total),
    }))

    // เดือนถัดไป
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const nextLabel = nextMonth.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' })
    chartData.push({ label: nextLabel, forecast: Math.round(totalForecast) })

    // เดือนปัจจุบัน (ยังไม่จบ)
    const currentMonth = now.toISOString().slice(0, 7)
    const currentTotal = monthMap[currentMonth]?.total || 0
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const daysPassed = now.getDate()
    const currentProjected = daysPassed > 0 ? Math.round(currentTotal / daysPassed * daysInMonth) : 0

    return {
      catPrediction, catTrend, allItemPrediction,
      totalForecast: Math.round(totalForecast),
      chartData, currentTotal, currentProjected,
      lastMonth, monthMap, last3,
    }
  }, [expenses, now])


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
    <div style={{ padding: '0 0 20px' }}>

      {/* Hero forecast card */}
      <div style={{
        background: 'linear-gradient(135deg, #1a1a0a, #2a2000)',
        border: '1px solid var(--primary)44',
        borderRadius: 20, padding: '20px', marginBottom: 14, textAlign: 'center',
      }}>
        <div style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
          🔮 Forecast — {nextMonthName}
        </div>
        <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 36, fontWeight: 900, color: 'var(--primary)' }}>
          ฿{fmt(data.totalForecast)}
        </div>
        <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 6 }}>
          คาดการณ์ต้นทุนรวมเดือนหน้า
        </div>

        {/* เดือนปัจจุบัน */}
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

      {/* Trend chart */}
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
          {[['var(--primary)', 'จริง'], ['#4D96FF', 'Forecast (ประมาณการ)']].map(([color, label]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 16, height: 2, background: color, borderRadius: 1 }} />
              <span style={{ fontSize: 11, color: 'var(--dim)' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Forecast รายหมวด */}
      <div style={{ background: 'var(--surface)', borderRadius: 18, padding: '14px 16px', marginBottom: 12, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 12, color: 'var(--dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
          📂 Forecast แยกหมวดหมู่
        </div>
        {Object.entries(data.catPrediction)
          .sort((a, b) => b[1] - a[1])
          .map(([cat, pred]) => {
            const trend = data.catTrend[cat] || 0
            const catInfo = EXP_CATS.find(c => c.key === cat)
            const maxPred = Math.max(...Object.values(data.catPrediction))
            const pct = maxPred > 0 ? Math.round(pred / maxPred * 100) : 0
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
                    ฿{fmt(Math.round(pred))}
                  </span>
                </div>
                <div style={{ height: 4, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: catInfo?.color || 'var(--primary)', borderRadius: 2, transition: 'width 0.4s' }} />
                </div>
              </div>
            )
          })}
      </div>

      {/* All items forecast */}
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

        {/* Header row */}
        <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto auto', gap: 8,
          padding: '4px 0 8px', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
          <div />
          <div style={{ fontSize: 10, color: 'var(--dim)', fontWeight: 700 }}>รายการ</div>
          <div style={{ fontSize: 10, color: 'var(--dim)', fontWeight: 700, textAlign: 'right' }}>ปริมาณ</div>
          <div style={{ fontSize: 10, color: 'var(--dim)', fontWeight: 700, textAlign: 'right', minWidth: 70 }}>฿ Forecast</div>
        </div>

        {(showAll ? data.allItemPrediction : data.allItemPrediction.slice(0, 10)).map((d, i) => (
          <div key={d.item} style={{
            display: 'grid', gridTemplateColumns: '24px 1fr auto auto',
            gap: 8, alignItems: 'center',
            padding: '9px 0', borderBottom: '1px solid var(--border2)',
          }}>
            {/* rank */}
            <div style={{ fontWeight: 800, fontSize: 11, textAlign: 'center',
              color: i === 0 ? '#FFD60A' : i === 1 ? '#8E8E93' : i === 2 ? '#CD7F32' : 'var(--dim)' }}>
              {i + 1}
            </div>

            {/* item name + meta */}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.item}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 9, color: 'var(--dim)' }}>{d.months} เดือน</span>
                {d.trend !== 0 && d.months >= 2 && (
                  <span style={{ fontSize: 9, fontWeight: 700,
                    color: d.trend > 0 ? 'var(--danger)' : 'var(--success)' }}>
                    ฿{d.trend > 0 ? '▲' : '▼'}{Math.abs(d.trend)}%
                  </span>
                )}
              </div>
            </div>

            {/* qty forecast */}
            <div style={{ textAlign: 'right', minWidth: 64 }}>
              {d.predQty > 0 ? (
                <>
                  <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 13, color: '#4D96FF' }}>
                    {d.predQty % 1 === 0 ? d.predQty : d.predQty.toFixed(1)}
                    <span style={{ fontSize: 10, fontWeight: 400, marginLeft: 2 }}>{d.unit}</span>
                  </div>
                  {d.qtyTrend !== 0 && d.months >= 2 && (
                    <div style={{ fontSize: 9, color: d.qtyTrend > 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 700 }}>
                      {d.qtyTrend > 0 ? '▲' : '▼'}{Math.abs(d.qtyTrend)}%
                    </div>
                  )}
                </>
              ) : (
                <span style={{ fontSize: 10, color: 'var(--dim)' }}>—</span>
              )}
            </div>

            {/* amount forecast */}
            <div style={{ textAlign: 'right', minWidth: 70 }}>
              <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 14, color: 'var(--primary)' }}>
                ฿{fmt(Math.round(d.pred))}
              </div>
            </div>
          </div>
        ))}

        {/* show more indicator */}
        {!showAll && data.allItemPrediction.length > 10 && (
          <div style={{ textAlign: 'center', padding: '12px 0 4px', color: 'var(--dim)', fontSize: 12 }}>
            + อีก {data.allItemPrediction.length - 10} รายการ
          </div>
        )}
      </div>

      {/* หมายเหตุ */}
      <div style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid var(--border2)' }}>
        <div style={{ fontSize: 11, color: 'var(--dim)', lineHeight: 1.6 }}>
          💡 Forecast คำนวณจากข้อมูลย้อนหลัง 3 เดือน โดยให้น้ำหนักเดือนล่าสุดมากกว่า (45% : 35% : 20%)
          · % แสดง trend เทียบกับค่าเฉลี่ย · ▲ สีแดง = แนวโน้มใช้เพิ่มขึ้น · ▼ สีเขียว = แนวโน้มลดลง
        </div>
      </div>
    </div>
  )
}


function Backup({ allOrders, notify }) {
  const handleExportOrders = async () => {
    const { data: orders, error } = await supabase.from('orders').select('*, order_items(*)').order('created_at', { ascending: false })
    if (error || !orders?.length) return notify('ไม่มีข้อมูลให้ export', 'warning')
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
