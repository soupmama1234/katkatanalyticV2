import { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react'
import { supabase } from '../supabase.js'
import { fmt } from '../utils/helpers.js'
import { useNotify, Toast, ConfirmDialog } from './ui/Toast.jsx'

const INPUT = {
  background: 'var(--surface2)', border: '1px solid var(--border2)',
  color: '#fff', borderRadius: 10, padding: '10px 12px',
  fontSize: 13, outline: 'none', width: '100%',
  fontFamily: 'inherit', boxSizing: 'border-box',
}

const TABS = ['สูตรอาหาร', 'วิเคราะห์ Margin', 'วัตถุดิบ']

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
      {tab === 'วัตถุดิบ'      && <IngredientManager notify={notify} confirm={confirm} />}
      <Toast toast={toast} />
      <ConfirmDialog dialog={dialog} onConfirm={handleConfirm} />
    </div>
  )
}

// ─── helpers ──────────────────────────────────────────────────────────────────

// ราคาต่อหน่วยสต็อกของแต่ละ ingredient — ดึงจาก expense ล่าสุดที่ผูก ingredient_id นั้น
function buildIngredientPriceMap(expenses) {
  const map = {}
  const sorted = [...expenses]
    .filter(e => e.ingredient_id && e.quantity && e.amount && e.stock_qty_per_purchase)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  sorted.forEach(e => {
    if (map[e.ingredient_id]) return // เจอแรก = ล่าสุด (sort desc แล้ว)
    const totalStockUnits = e.quantity * e.stock_qty_per_purchase
    if (totalStockUnits > 0) {
      map[e.ingredient_id] = { ppu: e.amount / totalStockUnits, date: e.date }
    }
  })
  return map
}

function calcRecipeCost(ings, priceMap) {
  let total = 0; let hasUnknown = false
  ings.forEach(ing => {
    const info = priceMap[ing.ingredient_id]
    if (info) total += info.ppu * ing.quantity
    else if (ing.ingredient_id) hasUnknown = true
  })
  return { total, hasUnknown }
}
// ─── IngredientPicker: dropdown เลือกจาก ingredients master table ───────────
function IngredientPicker({ value, onChange, ingredients }) {
  return (
    <select
      value={value || ''}
      onChange={e => onChange(e.target.value ? Number(e.target.value) : '')}
      style={{
        flex: 1, appearance: 'none', WebkitAppearance: 'none',
        background: `var(--surface2) url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'><polyline points='6 9 12 15 18 9'/></svg>") no-repeat right 10px center`,
        border: '1px solid var(--border2)', borderRadius: 10, padding: '9px 30px 9px 12px',
        color: value ? '#fff' : 'var(--dim)', fontSize: 14, outline: 'none', fontFamily: 'inherit',
      }}
    >
      <option value="">— เลือกวัตถุดิบ —</option>
      {ingredients.map(i => (
        <option key={i.id} value={i.id}>{i.name} ({i.stock_unit})</option>
      ))}
    </select>
  )
}

// ─── Recipe List ──────────────────────────────────────────────────────────────
function RecipeList({ recipes, setRecipes, products, expenses, notify, confirm }) {
  const [ingredients, setIngredients] = useState([])
  const [showModal, setShowModal]   = useState(false)
  const [editProduct, setEditProduct] = useState(null)
  const [rows, setRows] = useState([{ ingredient_id: '', quantity: '' }])
  const [saving, setSaving]         = useState(false)

  useEffect(() => {
    supabase.from('ingredients').select('*').order('name').then(({ data }) => setIngredients(data || []))
  }, [])

  const ingredientsMap = useMemo(() => {
    const map = {}
    ingredients.forEach(i => { map[i.id] = i })
    return map
  }, [ingredients])

  const priceMap = useMemo(() => buildIngredientPriceMap(expenses), [expenses])

  // group recipes ตาม product_id (เฉพาะที่ผูก product_id แล้ว)
  const byProduct = useMemo(() => {
    const map = {}
    recipes.forEach(r => {
      if (!r.product_id) return
      if (!map[r.product_id]) map[r.product_id] = []
      map[r.product_id].push(r)
    })
    return map
  }, [recipes])

  const covered = useMemo(() =>
    products.filter(p => (byProduct[p.id] || []).length > 0).length,
    [byProduct, products]
  )

  const openEdit = (product) => {
    setEditProduct(product)
    const existing = byProduct[product.id] || []
    setRows(existing.length > 0
      ? existing.map(r => ({ ingredient_id: r.ingredient_id, quantity: r.quantity }))
      : [{ ingredient_id: '', quantity: '' }]
    )
    setShowModal(true)
  }

  const addRow = useCallback(() => setRows(prev => [...prev, { ingredient_id: '', quantity: '' }]), [])
  const removeRow = useCallback((i) => setRows(prev => prev.filter((_, j) => j !== i)), [])
  const updateRow = useCallback((i, key, val) => setRows(prev => prev.map((r, j) => j === i ? { ...r, [key]: val } : r)), [])

  const handleSave = async () => {
    if (!editProduct) return notify('เกิดข้อผิดพลาด: ไม่พบเมนู', 'error')
    const valid = rows.filter(r => r.ingredient_id && parseFloat(r.quantity) > 0)
    if (!valid.length) return notify('กรุณาเพิ่มวัตถุดิบอย่างน้อย 1 อย่าง', 'warning')
    setSaving(true)
    try {
      await supabase.from('recipes').delete().eq('product_id', editProduct.id)
      const { data, error } = await supabase.from('recipes').insert(
        valid.map(r => {
          const ing = ingredientsMap[r.ingredient_id]
          return {
            product_id: editProduct.id,
            ingredient_id: r.ingredient_id,
            quantity: parseFloat(r.quantity),
            unit: ing?.stock_unit || null,
            menu_name: editProduct.name,      // snapshot สำรอง
            ingredient: ing?.name || '',       // snapshot สำรอง
            is_modifier: false,
            extra_price: 0,
          }
        })
      ).select()
      if (error) throw error
      setRecipes(prev => [...prev.filter(r => r.product_id !== editProduct.id), ...(data || [])])
      setShowModal(false)
      notify(`✅ บันทึกสูตร "${editProduct.name}" แล้ว`)
    } catch (e) { notify('บันทึกไม่สำเร็จ: ' + e.message, 'error') }
    setSaving(false)
  }

  const previewCost = useMemo(() => {
    let total = 0; let hasUnknown = false
    rows.forEach(row => {
      if (!row.ingredient_id || !parseFloat(row.quantity)) return
      const info = priceMap[row.ingredient_id]
      if (info) total += info.ppu * parseFloat(row.quantity)
      else hasUnknown = true
    })
    return { total, hasUnknown }
  }, [rows, priceMap])

  const sellPrice = editProduct?.price || 0
  const previewMargin = sellPrice && previewCost.total > 0 ? Math.round((sellPrice - previewCost.total) / sellPrice * 100) : null

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: 'var(--dim)' }}>มีสูตรแล้ว {covered}/{products.length} เมนู</div>
      </div>

      {ingredients.length === 0 && (
        <div style={{ background: 'rgba(255,159,10,0.08)', border: '1px solid rgba(255,159,10,0.25)', borderRadius: 12, padding: '12px 14px', marginBottom: 14, fontSize: 12, color: 'var(--primary)' }}>
          ⚠️ ยังไม่มีวัตถุดิบในระบบ — ไปสร้างที่แท็บ "วัตถุดิบ" ก่อน แล้วค่อยกลับมาทำสูตร
        </div>
      )}

      {products.map(p => {
        const ings = byProduct[p.id] || []
        const { total: cost, hasUnknown } = calcRecipeCost(ings, priceMap)
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
            <button onClick={() => openEdit(p)} style={{
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
      {showModal && editProduct && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div style={{ background: 'var(--surface)', borderRadius: '20px 20px 0 0', padding: '20px', width: '100%', maxWidth: 500, maxHeight: '85vh', overflowY: 'auto', border: '1px solid var(--border2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>สูตร: {editProduct.name}</div>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'var(--dim)', fontSize: 22, cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>🥩 วัตถุดิบ</div>
              <button onClick={addRow} style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '5px 12px', color: 'var(--primary)', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>+ เพิ่ม</button>
            </div>

            {rows.map((row, i) => {
              const info = row.ingredient_id ? priceMap[row.ingredient_id] : null
              const ing = row.ingredient_id ? ingredientsMap[row.ingredient_id] : null
              const qty = parseFloat(row.quantity) || 0
              const rowCost = info && qty ? info.ppu * qty : null
              return (
                <div key={i} style={{ background: 'var(--surface2)', borderRadius: 10, padding: '10px 12px', marginBottom: 8, border: '1px solid var(--border2)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 28px', gap: 6, marginBottom: 4 }}>
                    <IngredientPicker
                      value={row.ingredient_id}
                      onChange={val => updateRow(i, 'ingredient_id', val)}
                      ingredients={ingredients}
                    />
                    <input type="number" value={row.quantity} onChange={e => updateRow(i, 'quantity', e.target.value)}
                      placeholder="0" style={{ ...INPUT, padding: '7px 8px', textAlign: 'center' }} />
                    <button onClick={() => removeRow(i)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 18 }}>✕</button>
                  </div>
                  <div style={{ fontSize: 11, color: info ? 'var(--success)' : 'var(--dim)' }}>
                    {info
                      ? `฿${info.ppu.toFixed(2)}/${ing?.stock_unit || 'หน่วย'}${rowCost ? ` → ฿${rowCost.toFixed(2)}` : ''}`
                      : row.ingredient_id ? '⚠️ ยังไม่มีราคา — ไปบันทึกต้นทุนที่ผูกวัตถุดิบนี้ก่อน' : 'เลือกวัตถุดิบ'
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
  const priceMap = useMemo(() => buildIngredientPriceMap(expenses), [expenses])

  const byProduct = useMemo(() => {
    const map = {}
    recipes.forEach(r => {
      if (!r.product_id) return
      if (!map[r.product_id]) map[r.product_id] = []
      map[r.product_id].push(r)
    })
    return map
  }, [recipes])

  const covered = useMemo(() =>
    products.filter(p => (byProduct[p.id] || []).length > 0).length,
    [byProduct, products]
  )
  const missing = products.length - covered

  const items = useMemo(() =>
    products
      .filter(p => (byProduct[p.id] || []).length > 0)
      .map(p => {
        const ings = byProduct[p.id]
        const { total: cost, hasUnknown } = calcRecipeCost(ings, priceMap)
        const sellPrice = p.price || 0
        const margin = sellPrice && cost > 0 ? (sellPrice - cost) / sellPrice * 100 : null
        return { menu: p.name, cost, sellPrice, margin, hasUnknown }
      }).sort((a, b) => (a.margin ?? 999) - (b.margin ?? 999)),
    [byProduct, priceMap, products]
  )

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

// ─── Ingredient Manager ────────────────────────────────────────────────────
const STOCK_UNIT_PRESETS = ['ชิ้น', 'ฟอง', 'ขวด', 'กระป๋อง', 'กก.', 'g', 'ลิตร', 'แพ็ค']

function IngredientManager({ notify, confirm }) {
  const [ingredients, setIngredients] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', stock_unit: '', stock_qty: '' })
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editQty, setEditQty] = useState('')

  const fetchIngredients = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('ingredients').select('*').order('name')
    if (error) notify('โหลดวัตถุดิบไม่สำเร็จ: ' + error.message, 'error')
    setIngredients(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchIngredients() }, []) // run once on mount via lazy init pattern below
  // (replaced by useEffect below in actual file)

  const handleAdd = async () => {
    if (!form.name.trim()) return notify('กรุณาใส่ชื่อวัตถุดิบ', 'warning')
    if (!form.stock_unit.trim()) return notify('กรุณาใส่หน่วยนับสต็อก', 'warning')
    setSaving(true)
    try {
      const { data, error } = await supabase.from('ingredients').insert({
        name: form.name.trim(),
        stock_unit: form.stock_unit.trim(),
        stock_qty: parseFloat(form.stock_qty) || 0,
        track_stock: false,
      }).select().single()
      if (error) throw error
      setIngredients(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name, 'th')))
      setForm({ name: '', stock_unit: '', stock_qty: '' })
      notify(`✅ เพิ่ม "${data.name}" เรียบร้อย`)
    } catch (e) {
      notify('เพิ่มไม่สำเร็จ: ' + e.message, 'error')
    }
    setSaving(false)
  }

  const toggleTrackStock = async (ing) => {
    const next = !ing.track_stock
    setIngredients(prev => prev.map(i => i.id === ing.id ? { ...i, track_stock: next } : i))
    try {
      const { error } = await supabase.from('ingredients').update({ track_stock: next }).eq('id', ing.id)
      if (error) throw error
      notify(`${next ? '✅ เปิด' : '⏸️ ปิด'} การหักสต็อก "${ing.name}" แล้ว`)
    } catch (e) {
      setIngredients(prev => prev.map(i => i.id === ing.id ? { ...i, track_stock: ing.track_stock } : i))
      notify('เปลี่ยนสถานะไม่สำเร็จ: ' + e.message, 'error')
    }
  }

  const startEditQty = (ing) => {
    setEditingId(ing.id)
    setEditQty(String(ing.stock_qty ?? 0))
  }

  const saveEditQty = async (ing) => {
    const val = parseFloat(editQty)
    if (isNaN(val)) return notify('กรุณาใส่ตัวเลข', 'warning')
    try {
      const { error } = await supabase.from('ingredients').update({ stock_qty: val }).eq('id', ing.id)
      if (error) throw error
      setIngredients(prev => prev.map(i => i.id === ing.id ? { ...i, stock_qty: val } : i))
      setEditingId(null)
      notify('ปรับสต็อกเรียบร้อย')
    } catch (e) {
      notify('บันทึกไม่สำเร็จ: ' + e.message, 'error')
    }
  }

  const handleDelete = async (ing) => {
    const ok = await confirm(`ลบวัตถุดิบ "${ing.name}"?\n(หากมีสูตรอาหารผูกอยู่ อาจกระทบการคำนวณต้นทุน)`)
    if (!ok) return
    try {
      const { error } = await supabase.from('ingredients').delete().eq('id', ing.id)
      if (error) throw error
      setIngredients(prev => prev.filter(i => i.id !== ing.id))
      notify(`🗑️ ลบ "${ing.name}" แล้ว`)
    } catch (e) {
      notify('ลบไม่สำเร็จ: ' + e.message, 'error')
    }
  }

  if (loading) return <div style={{ textAlign: 'center', color: 'var(--dim)', padding: '30px 0' }}>⏳ กำลังโหลด...</div>

  return (
    <div>
      {/* Add form */}
      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 14, marginBottom: 14, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>🥩 เพิ่มวัตถุดิบใหม่</div>

        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 6 }}>ชื่อวัตถุดิบ</div>
          <input
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="เช่น ไข่ไก่"
            style={INPUT}
          />
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 6 }}>
            หน่วยนับสต็อก <span style={{ color: 'var(--dim)', fontWeight: 400 }}>(หน่วยที่ใช้จริงตอนขาย เช่น ฟอง, ชิ้น — ไม่ใช่หน่วยที่ซื้อ)</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {STOCK_UNIT_PRESETS.map(u => (
              <button key={u} onClick={() => setForm(f => ({ ...f, stock_unit: u }))} style={{
                padding: '5px 12px', borderRadius: 8, border: `1px solid ${form.stock_unit === u ? 'var(--primary)' : 'var(--border2)'}`,
                background: form.stock_unit === u ? 'rgba(255,159,10,0.15)' : 'var(--surface2)',
                color: form.stock_unit === u ? 'var(--primary)' : 'var(--dim)',
                fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
              }}>{u}</button>
            ))}
          </div>
          <input
            value={form.stock_unit}
            onChange={e => setForm(f => ({ ...f, stock_unit: e.target.value }))}
            placeholder="หรือพิมพ์หน่วยเอง"
            style={INPUT}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 6 }}>จำนวนคงเหลือเริ่มต้น (ไม่บังคับ)</div>
          <input
            type="number" inputMode="decimal"
            value={form.stock_qty}
            onChange={e => setForm(f => ({ ...f, stock_qty: e.target.value }))}
            placeholder="0"
            style={INPUT}
          />
        </div>

        <button onClick={handleAdd} disabled={saving} style={{
          width: '100%', background: 'var(--primary)', color: '#000', border: 'none',
          borderRadius: 12, padding: 13, fontSize: 14, fontWeight: 800,
          cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1,
        }}>
          {saving ? '⏳ กำลังบันทึก...' : '+ เพิ่มวัตถุดิบ'}
        </button>
      </div>

      {/* List */}
      <div style={{ fontSize: 13, color: 'var(--dim)', marginBottom: 10 }}>วัตถุดิบทั้งหมด ({ingredients.length})</div>
      {ingredients.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--dim)', padding: '30px 0' }}>ยังไม่มีวัตถุดิบ — เพิ่มด้านบนได้เลย</div>
      ) : ingredients.map(ing => (
        <div key={ing.id} style={{ background: 'var(--surface)', borderRadius: 14, padding: '12px 14px', marginBottom: 8, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{ing.name}</div>
              {editingId === ing.id ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="number" inputMode="decimal"
                    value={editQty}
                    onChange={e => setEditQty(e.target.value)}
                    autoFocus
                    style={{ ...INPUT, width: 90, padding: '6px 10px', fontSize: 13 }}
                  />
                  <span style={{ fontSize: 12, color: 'var(--dim)' }}>{ing.stock_unit}</span>
                  <button onClick={() => saveEditQty(ing)} style={{ background: 'var(--success)', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', color: '#000' }}>✓</button>
                  <button onClick={() => setEditingId(null)} style={{ background: 'var(--surface2)', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer', color: 'var(--dim)' }}>✕</button>
                </div>
              ) : (
                <div onClick={() => startEditQty(ing)} style={{ fontSize: 13, color: (ing.stock_qty ?? 0) <= 0 ? 'var(--danger)' : 'var(--dim)', cursor: 'pointer' }}>
                  คงเหลือ: <span style={{ fontWeight: 700 }}>{ing.stock_qty ?? 0}</span> {ing.stock_unit} <span style={{ fontSize: 11, color: 'var(--primary)' }}>✏️ แก้ไข</span>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
              <button onClick={() => toggleTrackStock(ing)} style={{
                fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8, cursor: 'pointer',
                border: `1px solid ${ing.track_stock ? 'var(--success)' : 'var(--border2)'}`,
                background: ing.track_stock ? 'rgba(50,215,75,0.15)' : 'var(--surface2)',
                color: ing.track_stock ? 'var(--success)' : 'var(--dim)',
              }}>
                {ing.track_stock ? '✅ หักสต็อก' : '⏸️ ไม่หัก'}
              </button>
              <button onClick={() => handleDelete(ing)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 12 }}>ลบ</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

const MINI = { background: 'var(--surface)', borderRadius: 12, padding: '12px 14px', border: '1px solid var(--border)', textAlign: 'center' }
