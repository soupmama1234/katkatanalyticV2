import { useState, useMemo } from 'react'
import { supabase } from '../supabase.js'
import { fmt } from '../utils/helpers.js'
import { useNotify, Toast, ConfirmDialog } from './ui/Toast.jsx'

const INPUT = {
  background: 'var(--surface2)', border: '1px solid var(--border2)',
  color: '#fff', borderRadius: 10, padding: '10px 12px',
  fontSize: 13, outline: 'none', width: '100%',
  fontFamily: 'inherit', boxSizing: 'border-box',
}

const TABS = ['สูตรอาหาร', 'วิเคราะห์ Margin']

export default function Recipe({ recipes, setRecipes, products, expenses }) {
  const [tab, setTab] = useState('สูตรอาหาร')
  const { toast, dialog, notify, confirm, handleConfirm } = useNotify()

  return (
    <div style={{ padding: '0 0 20px' }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '7px 14px', borderRadius: 20, border: 'none',
            background: tab === t ? 'var(--primary)' : 'var(--surface2)',
            color: tab === t ? '#000' : 'var(--dim)',
            fontWeight: tab === t ? 700 : 400, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
          }}>{t}</button>
        ))}
      </div>
      {tab === 'สูตรอาหาร'     && <RecipeList recipes={recipes} setRecipes={setRecipes} products={products} expenses={expenses} notify={notify} confirm={confirm} />}
      {tab === 'วิเคราะห์ Margin' && <MarginAnalysis recipes={recipes} products={products} expenses={expenses} />}
      <Toast toast={toast} />
      <ConfirmDialog dialog={dialog} onConfirm={handleConfirm} />
    </div>
  )
}

// ─── helpers ──────────────────────────────────────────────────────────────────
function getIngredientPPU(ingredient, expenses) {
  const matches = expenses.filter(e =>
    e.item && e.item.toLowerCase().includes((ingredient || '').toLowerCase()) && e.quantity && e.amount
  )
  if (!matches.length) return null
  const e = matches[0]
  return { ppu: e.amount / e.quantity, unit: e.unit || '', date: e.date }
}

function calcRecipeCost(ings, expenses) {
  let total = 0; let hasUnknown = false
  ings.forEach(ing => {
    const info = getIngredientPPU(ing.ingredient, expenses)
    if (info) total += info.ppu * ing.quantity
    else if (ing.ingredient) hasUnknown = true
  })
  return { total, hasUnknown }
}

// ─── IngredientInput: input + autocomplete dropdown ──────────────────────────
function IngredientInput({ value, onChange, suggestions }) {
  const [open, setOpen] = useState(false)

  const matches = useMemo(() => {
    const kw = (value || '').trim().toLowerCase()
    if (!kw) return []
    return suggestions
      .filter(s => s.toLowerCase().includes(kw))
      .slice(0, 6)
  }, [value, suggestions])

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="ชื่อวัตถุดิบ"
        style={{ ...INPUT, padding: '7px 10px' }}
      />
      {open && matches.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: '#1e1e1e', border: '1px solid #4D96FF44',
          borderRadius: 10, marginTop: 4,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '5px 10px', fontSize: 9, color: '#4D96FF', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--border2)' }}>
            📌 จาก expenses
          </div>
          {matches.map(m => (
            <div
              key={m}
              onMouseDown={() => { onChange(m); setOpen(false) }}
              style={{
                padding: '9px 12px', fontSize: 13, cursor: 'pointer',
                color: '#fff', borderBottom: '1px solid #2a2a2a',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#2a2a2a'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {m}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Recipe List ──────────────────────────────────────────────────────────────
function RecipeList({ recipes, setRecipes, products, expenses, notify, confirm }) {
  const [showModal, setShowModal]   = useState(false)
  const [editMenu, setEditMenu]     = useState('')
  const [ingredients, setIngredients] = useState([{ ingredient: '', quantity: '', unit: '' }])
  const [saving, setSaving]         = useState(false)

  // รายชื่อวัตถุดิบทั้งหมดจาก expenses (unique)
  const ingredientSuggestions = useMemo(() =>
    [...new Set(expenses.map(e => e.item).filter(Boolean))],
    [expenses]
  )

  const byMenu = useMemo(() => {
    const map = {}
    recipes.forEach(r => { if (!map[r.menu_name]) map[r.menu_name] = []; map[r.menu_name].push(r) })
    return map
  }, [recipes])

  const covered = useMemo(() =>
    Object.keys(byMenu).filter(name => products.some(p => p.name === name)).length,
    [byMenu, products]
  )

  const openEdit = (menuName) => {
    setEditMenu(menuName)
    const existing = byMenu[menuName] || []
    setIngredients(existing.length > 0
      ? existing.map(r => ({ ingredient: r.ingredient, quantity: r.quantity, unit: r.unit || '' }))
      : [{ ingredient: '', quantity: '', unit: '' }]
    )
    setShowModal(true)
  }

  const addRow = () => setIngredients(prev => [...prev, { ingredient: '', quantity: '', unit: '' }])
  const removeRow = (i) => setIngredients(prev => prev.filter((_, j) => j !== i))
  const updateRow = (i, key, val) => setIngredients(prev => prev.map((r, j) => j === i ? { ...r, [key]: val } : r))

  const handleSave = async () => {
    if (!editMenu) return notify('กรุณาเลือกเมนู', 'warning')
    const rows = ingredients.filter(r => r.ingredient.trim() && parseFloat(r.quantity) > 0)
    if (!rows.length) return notify('กรุณาเพิ่มวัตถุดิบอย่างน้อย 1 อย่าง', 'warning')
    setSaving(true)
    try {
      await supabase.from('recipes').delete().eq('menu_name', editMenu)
      const { data, error } = await supabase.from('recipes').insert(
        rows.map(r => ({ menu_name: editMenu, ingredient: r.ingredient.trim(), quantity: parseFloat(r.quantity), unit: r.unit || null, is_modifier: false, extra_price: 0 }))
      ).select()
      if (error) throw error
      setRecipes(prev => [...prev.filter(r => r.menu_name !== editMenu), ...(data || [])])
      setShowModal(false)
    } catch (e) { notify('บันทึกไม่สำเร็จ: ' + e.message, 'error') }
    setSaving(false)
  }

  const previewCost = useMemo(() => {
    let total = 0; let hasUnknown = false
    ingredients.forEach(row => {
      if (!row.ingredient || !parseFloat(row.quantity)) return
      const info = getIngredientPPU(row.ingredient, expenses)
      if (info) total += info.ppu * parseFloat(row.quantity)
      else hasUnknown = true
    })
    return { total, hasUnknown }
  }, [ingredients, expenses])

  const selectedProduct = products.find(p => p.name === editMenu)
  const sellPrice = selectedProduct?.price || 0
  const previewMargin = sellPrice && previewCost.total > 0 ? Math.round((sellPrice - previewCost.total) / sellPrice * 100) : null

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: 'var(--dim)' }}>มีสูตรแล้ว {covered}/{products.length} เมนู</div>
        <button onClick={() => { setEditMenu(''); setIngredients([{ ingredient: '', quantity: '', unit: '' }]); setShowModal(true) }}
          style={{ background: 'var(--primary)', color: '#000', border: 'none', borderRadius: 12, padding: '8px 16px', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          + เพิ่มสูตร
        </button>
      </div>

      {products.map(p => {
        const ings = byMenu[p.name] || []
        const { total: cost, hasUnknown } = calcRecipeCost(ings, expenses)
        const margin = p.price && cost > 0 ? Math.round((p.price - cost) / p.price * 100) : null
        const mgColor = margin === null ? 'var(--dim)' : margin >= 60 ? 'var(--success)' : margin >= 40 ? 'var(--primary)' : 'var(--danger)'
        return (
          <div key={p.id} style={{ background: 'var(--surface)', borderRadius: 14, padding: '12px 14px', marginBottom: 8, border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {p.price && <span style={{ fontSize: 11, color: 'var(--dim)' }}>฿{p.price}</span>}
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: ings.length > 0 ? 'rgba(50,215,75,0.15)' : 'var(--surface2)', color: ings.length > 0 ? 'var(--success)' : 'var(--dim)' }}>
                  {ings.length > 0 ? `${ings.length} วัตถุดิบ` : 'ยังไม่มีสูตร'}
                </span>
              </div>
            </div>
            {ings.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--dim)' }}>ต้นทุน: <span style={{ color: 'var(--danger)', fontWeight: 700 }}>฿{cost.toFixed(2)}{hasUnknown ? ' ⚠️' : ''}</span></span>
                {margin !== null && <span style={{ fontSize: 13, fontWeight: 700, color: mgColor }}>Margin {margin}%</span>}
              </div>
            )}
            <button onClick={() => openEdit(p.name)} style={{
              width: '100%', background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 10,
              padding: '8px', color: ings.length > 0 ? 'var(--dim)' : 'var(--primary)',
              fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>
              {ings.length > 0 ? '✏️ แก้ไขสูตร' : '+ เพิ่มสูตร'}
            </button>
          </div>
        )
      })}

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div style={{ background: 'var(--surface)', borderRadius: '20px 20px 0 0', padding: '20px', width: '100%', maxWidth: 500, maxHeight: '85vh', overflowY: 'auto', border: '1px solid var(--border2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{editMenu ? `สูตร: ${editMenu}` : 'เพิ่มสูตรอาหาร'}</div>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'var(--dim)', fontSize: 22, cursor: 'pointer' }}>✕</button>
            </div>

            {!editMenu && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 6 }}>เลือกเมนู</div>
                <select value={editMenu} onChange={e => setEditMenu(e.target.value)} style={{ ...INPUT }}>
                  <option value="">เลือกเมนู...</option>
                  {products.map(p => <option key={p.id} value={p.name}>{p.name} (฿{p.price})</option>)}
                </select>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>🥩 วัตถุดิบ</div>
              <button onClick={addRow} style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '5px 12px', color: 'var(--primary)', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>+ เพิ่ม</button>
            </div>

            {ingredients.map((row, i) => {
              const info = row.ingredient ? getIngredientPPU(row.ingredient, expenses) : null
              const qty = parseFloat(row.quantity) || 0
              const rowCost = info && qty ? info.ppu * qty : null
              return (
                <div key={i} style={{ background: 'var(--surface2)', borderRadius: 10, padding: '10px 12px', marginBottom: 8, border: '1px solid var(--border2)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 28px', gap: 6, marginBottom: 4 }}>
                    {/* ── IngredientInput แทน plain input ── */}
                    <IngredientInput
                      value={row.ingredient}
                      onChange={val => updateRow(i, 'ingredient', val)}
                      suggestions={ingredientSuggestions}
                    />
                    <input type="number" value={row.quantity} onChange={e => updateRow(i, 'quantity', e.target.value)}
                      placeholder="0" style={{ ...INPUT, padding: '7px 8px', textAlign: 'center' }} />
                    <button onClick={() => removeRow(i)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 18 }}>✕</button>
                  </div>
                  <div style={{ fontSize: 11, color: info ? 'var(--success)' : 'var(--dim)' }}>
                    {info
                      ? `฿${info.ppu.toFixed(2)}/${info.unit || 'หน่วย'}${rowCost ? ` → ฿${rowCost.toFixed(2)}` : ''}`
                      : row.ingredient ? '⚠️ ไม่พบราคาใน expenses' : 'กรอกชื่อวัตถุดิบ'
                    }
                  </div>
                </div>
              )
            })}

            <div style={{ background: 'var(--surface2)', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 4 }}>ต้นทุนรวมต่อจาน</div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 24, fontWeight: 800, color: 'var(--danger)' }}>
                ฿{previewCost.total.toFixed(2)}{previewCost.hasUnknown ? ' ⚠️' : ''}
              </div>
              {previewMargin !== null && (
                <div style={{ fontSize: 13, color: previewMargin >= 60 ? 'var(--success)' : previewMargin >= 40 ? 'var(--primary)' : 'var(--danger)', fontWeight: 700, marginTop: 4 }}>
                  Margin {previewMargin}% · กำไร ฿{(sellPrice - previewCost.total).toFixed(2)}
                </div>
              )}
            </div>

            <button onClick={handleSave} disabled={saving} style={{
              width: '100%', background: 'var(--primary)', color: '#000', border: 'none',
              borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 800,
              cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1,
            }}>
              {saving ? '⏳ กำลังบันทึก...' : '💾 บันทึกสูตร'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Margin Analysis ──────────────────────────────────────────────────────────
function MarginAnalysis({ recipes, products, expenses }) {
  const byMenu = useMemo(() => {
    const map = {}
    recipes.forEach(r => { if (!map[r.menu_name]) map[r.menu_name] = []; map[r.menu_name].push(r) })
    return map
  }, [recipes])

  const covered = useMemo(() =>
    Object.keys(byMenu).filter(name => products.some(p => p.name === name)).length,
    [byMenu, products]
  )
  const missing = products.length - covered

  const items = Object.entries(byMenu)
    .filter(([menu]) => products.some(p => p.name === menu))
    .map(([menu, ings]) => {
      const { total: cost, hasUnknown } = calcRecipeCost(ings, expenses)
      const p = products.find(x => x.name === menu)
      const sellPrice = p?.price || 0
      const margin = sellPrice && cost > 0 ? (sellPrice - cost) / sellPrice * 100 : null
      return { menu, cost, sellPrice, margin, hasUnknown }
    }).sort((a, b) => (a.margin ?? 999) - (b.margin ?? 999))

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <div style={MINI}><div style={{ fontSize: 10, color: 'var(--dim)' }}>มีสูตรแล้ว</div><div style={{ fontWeight: 800, color: 'var(--success)' }}>{covered} เมนู</div></div>
        <div style={MINI}><div style={{ fontSize: 10, color: 'var(--dim)' }}>ยังไม่มีสูตร</div><div style={{ fontWeight: 800, color: 'var(--dim)' }}>{missing} เมนู</div></div>
      </div>

      {items.map(item => {
        const mg = item.margin
        const color = mg === null ? 'var(--dim)' : mg >= 60 ? 'var(--success)' : mg >= 40 ? 'var(--primary)' : 'var(--danger)'
        const borderColor = mg === null ? 'var(--border)' : mg >= 60 ? 'rgba(50,215,75,0.3)' : mg >= 40 ? 'rgba(255,159,10,0.3)' : 'rgba(255,69,58,0.3)'
        return (
          <div key={item.menu} style={{ background: 'var(--surface)', borderRadius: 14, padding: '12px 14px', marginBottom: 8, border: `1px solid ${borderColor}`, borderLeft: `4px solid ${color}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{item.menu}</div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 800, color }}>{mg !== null ? `${mg.toFixed(0)}%` : '—'}</div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <span>ขาย ฿{fmt(item.sellPrice)}</span>
              <span>ต้นทุน ฿{item.cost.toFixed(2)}</span>
              <span>กำไร ฿{(item.sellPrice - item.cost).toFixed(2)}</span>
            </div>
            {mg !== null && (
              <div style={{ height: 4, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden', marginTop: 8 }}>
                <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, mg))}%`, background: color, borderRadius: 2, transition: 'width 0.4s' }} />
              </div>
            )}
            {item.hasUnknown && <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 4 }}>⚠️ บางวัตถุดิบยังไม่มีราคา</div>}
          </div>
        )
      })}
      {items.length === 0 && <div style={{ textAlign: 'center', color: 'var(--dim)', padding: '30px 0' }}>ยังไม่มีสูตรอาหาร</div>}
    </div>
  )
}

const MINI = { background: 'var(--surface)', borderRadius: 12, padding: '12px 14px', border: '1px solid var(--border)', textAlign: 'center' }
