import { useState, useMemo } from 'react'
import { supabase } from '../supabase.js'
import { filterExpByPeriod, filterExpByRange, fmt, todayStr } from '../utils/helpers.js'
import { INC_CATS, UNIT_PRESETS, EXP_PERIODS } from '../utils/constants.js'
import PeriodBar from './ui/PeriodBar.jsx'

const INPUT = {
  background: 'var(--surface2)', border: '1px solid var(--border2)',
  color: '#fff', borderRadius: 10, padding: '11px 13px',
  fontSize: 14, outline: 'none', width: '100%',
  fontFamily: 'inherit', boxSizing: 'border-box',
}

const TABS = ['บันทึก', 'รายการ']

export default function Income({ income, setIncome }) {
  const [tab, setTab] = useState('บันทึก')

  return (
    <div style={{ padding: '0 0 20px' }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '7px 14px', borderRadius: 20, border: 'none',
            background: tab === t ? 'var(--success)' : 'var(--surface2)',
            color: tab === t ? '#000' : 'var(--dim)',
            fontWeight: tab === t ? 700 : 400,
            fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
          }}>{t}</button>
        ))}
      </div>
      {tab === 'บันทึก' && <IncomeForm income={income} setIncome={setIncome} />}
      {tab === 'รายการ' && <IncomeList income={income} setIncome={setIncome} />}
    </div>
  )
}

function IncomeForm({ income, setIncome }) {
  const emptyForm = { date: todayStr, item: '', category: '', quantity: '', unit: '', pricePerUnit: '', amount: '', source: '', note: '' }
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const calcAmount = (qty, ppu) => {
    const q = parseFloat(qty) || 0
    const p = parseFloat(ppu) || 0
    if (q > 0 && p > 0) set('amount', (q * p).toFixed(2))
  }

  const itemHistory = useMemo(() => [...new Set(income.map(i => i.item).filter(Boolean))], [income])
  const sourceHistory = useMemo(() => [...new Set(income.map(i => i.source).filter(Boolean))], [income])

  const handleSubmit = async () => {
    if (!form.item.trim()) return alert('กรุณาใส่ชื่อรายการ')
    if (!parseFloat(form.amount)) return alert('กรุณาใส่ยอดเงิน')
    setSaving(true)
    try {
      const { data, error } = await supabase.from('other_income').insert({
        date: form.date || todayStr,
        item: form.item.trim(),
        category: form.category || 'รายได้อื่น',
        quantity: parseFloat(form.quantity) || null,
        unit: form.unit || null,
        price_per_unit: parseFloat(form.pricePerUnit) || null,
        amount: parseFloat(form.amount),
        source: form.source.trim() || null,
        note: form.note.trim() || null,
      }).select().single()
      if (error) throw error
      setIncome(prev => [data, ...prev])
      setForm(emptyForm)
    } catch (e) { alert('❌ ' + e.message) }
    setSaving(false)
  }

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 14, border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>💚 บันทึกรายได้อื่น</div>

      <Field label="วันที่">
        <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={INPUT} />
      </Field>

      <Field label="หมวดหมู่">
        <div style={{ display: 'flex', gap: 6 }}>
          {INC_CATS.map(c => (
            <button key={c} onClick={() => set('category', c)} style={{
              padding: '7px 14px', borderRadius: 10, border: `1px solid ${form.category === c ? 'var(--success)' : 'var(--border2)'}`,
              background: form.category === c ? 'var(--success)' : 'var(--surface2)',
              color: form.category === c ? '#000' : 'var(--dim)',
              fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: form.category === c ? 700 : 400,
            }}>{c}</button>
          ))}
        </div>
      </Field>

      <Field label="รายการ">
        <AutoSuggest value={form.item} onChange={v => set('item', v)} suggestions={itemHistory} placeholder="เช่น ขายน้ำมันทอด" />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Field label="จำนวน">
          <input type="number" inputMode="decimal" value={form.quantity}
            onChange={e => { set('quantity', e.target.value); calcAmount(e.target.value, form.pricePerUnit) }}
            style={INPUT} placeholder="0" />
        </Field>
        <Field label="หน่วย">
          <input value={form.unit} onChange={e => set('unit', e.target.value)} style={INPUT} placeholder="ลิตร, kg..." />
        </Field>
      </div>

      <Field label="ราคา/หน่วย ฿">
        <input type="number" inputMode="decimal" value={form.pricePerUnit}
          onChange={e => { set('pricePerUnit', e.target.value); calcAmount(form.quantity, e.target.value) }}
          style={INPUT} placeholder="0" />
      </Field>

      <Field label="ยอดรวม ฿">
        <div style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 10, padding: '14px', textAlign: 'center', fontFamily: "'Inter',sans-serif", fontSize: 22, fontWeight: 800, color: 'var(--success)' }}>
          ฿{fmt(parseFloat(form.amount) || 0)}
        </div>
        <input type="number" inputMode="decimal" value={form.amount} onChange={e => set('amount', e.target.value)}
          style={{ ...INPUT, marginTop: 6, fontSize: 14, color: 'var(--success)' }} placeholder="หรือกรอกยอดตรงนี้" />
      </Field>

      <Field label="แหล่งที่มา">
        <AutoSuggest value={form.source} onChange={v => set('source', v)} suggestions={sourceHistory} placeholder="เช่น คนรับซื้อน้ำมัน" />
      </Field>

      <Field label="หมายเหตุ">
        <input value={form.note} onChange={e => set('note', e.target.value)} style={INPUT} placeholder="ไม่บังคับ" />
      </Field>

      <button onClick={handleSubmit} disabled={saving} style={{
        width: '100%', background: 'var(--success)', color: '#000', border: 'none',
        borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 800,
        cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1, marginTop: 4,
      }}>
        {saving ? '⏳ กำลังบันทึก...' : '💾 บันทึก'}
      </button>
    </div>
  )
}

function IncomeList({ income, setIncome }) {
  const [period, setPeriod] = useState('30d')
  const [from, setFrom]     = useState(todayStr)
  const [to, setTo]         = useState(todayStr)

  const filtered = useMemo(() =>
    period === 'custom' ? filterExpByRange(income, from, to) : filterExpByPeriod(income, period),
    [income, period, from, to]
  )

  const total = filtered.reduce((s, i) => s + (i.amount || 0), 0)

  const handleDelete = async (id) => {
    if (!confirm('ลบรายการนี้?')) return
    const { error } = await supabase.from('other_income').delete().eq('id', id)
    if (error) return alert('❌ ' + error.message)
    setIncome(prev => prev.filter(i => i.id !== id))
  }

  return (
    <div>
      <PeriodBar period={period} onChange={setPeriod} options={EXP_PERIODS} from={from} to={to} onFromChange={setFrom} onToChange={setTo} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <div style={MINI}><div style={{ fontSize: 10, color: 'var(--dim)' }}>รายได้อื่นรวม</div><div style={{ color: 'var(--success)', fontWeight: 800, fontFamily: "'Inter',sans-serif" }}>฿{fmt(total)}</div></div>
        <div style={MINI}><div style={{ fontSize: 10, color: 'var(--dim)' }}>รายการ</div><div style={{ fontWeight: 800 }}>{filtered.length}</div></div>
      </div>

      {filtered.map(i => (
        <div key={i.id} style={{ background: 'var(--surface)', borderRadius: 14, padding: '12px 14px', marginBottom: 8, border: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 3 }}>{i.item}</div>
            <div style={{ fontSize: 11, color: 'var(--dim)' }}>
              {[i.source, i.quantity ? `${i.quantity}${i.unit || ''}` : null, i.date].filter(Boolean).join(' · ')}
              {i.note && <span> · {i.note}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <div style={{ color: 'var(--success)', fontWeight: 800, fontFamily: "'Inter',sans-serif" }}>+฿{fmt(i.amount)}</div>
            <button onClick={() => handleDelete(i.id)} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 14 }}>🗑</button>
          </div>
        </div>
      ))}
      {filtered.length === 0 && <div style={{ textAlign: 'center', color: 'var(--dim)', padding: '30px 0' }}>ยังไม่มีรายการ</div>}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  )
}

function AutoSuggest({ value, onChange, suggestions, placeholder }) {
  const [open, setOpen] = useState(false)
  const matches = (suggestions || []).filter(s => s.toLowerCase().includes((value || '').toLowerCase())).slice(0, 6)
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

const MINI = { background: 'var(--surface)', borderRadius: 12, padding: '12px 14px', border: '1px solid var(--border)', textAlign: 'center' }
