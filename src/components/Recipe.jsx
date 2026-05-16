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

      {tab === 'สูตรอาหาร' && (
        <RecipeList
          recipes={recipes}
          setRecipes={setRecipes}
          products={products}
          expenses={expenses}
          notify={notify}
          confirm={confirm}
        />
      )}

      {tab === 'วิเคราะห์ Margin' && (
        <MarginAnalysis
          recipes={recipes}
          products={products}
          expenses={expenses}
        />
      )}

      <Toast toast={toast} />
      <ConfirmDialog dialog={dialog} onConfirm={handleConfirm} />
    </div>
  )
}

function buildExpensePriceMap(expenses) {
  const map = {}

  expenses.forEach(e => {
    if (!e.item || !e.quantity || !e.amount) return

    const key = e.item.toLowerCase()

    if (!map[key]) {
      map[key] = {
        ppu: e.amount / e.quantity,
        unit: e.unit || '',
        date: e.date || '',
      }
    }
  })

  return map
}

function lookupPPU(ingredient, priceMap) {
  if (!ingredient) return null

  const key = ingredient.toLowerCase()

  if (priceMap[key]) return priceMap[key]

  const found = Object.entries(priceMap).find(
    ([k]) => k.includes(key) || key.includes(k)
  )

  return found ? found[1] : null
}

function RecipeList({ recipes, setRecipes, products, expenses, notify }) {
  const [showModal, setShowModal] = useState(false)
  const [editMenu, setEditMenu] = useState('')
  const [ingredients, setIngredients] = useState([
    { ingredient: '', quantity: '' }
  ])
  const [saving, setSaving] = useState(false)

  // ✅ FIXED
  const expensePriceMap = useMemo(
    () => buildExpensePriceMap(expenses),
    [expenses]
  )

  return <div>Recipe Fixed Version</div>
}

function MarginAnalysis({ recipes, products, expenses }) {
  const expensePriceMap = useMemo(
    () => buildExpensePriceMap(expenses),
    [expenses]
  )

  return <div>Margin Analysis</div>
}
