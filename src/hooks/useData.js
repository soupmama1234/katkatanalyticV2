import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'

export function useData() {
  const [allOrders, setAllOrders] = useState([])
  const [products, setProducts] = useState([])
  const [expenses, setExpenses] = useState([])
  const [income, setIncome] = useState([])
  const [recipes, setRecipes] = useState([])
  const [actionNotes, setActionNotes] = useState([])
  const [closedDays, setClosedDays] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchOrders = useCallback(async () => {
    const PAGE_SIZE = 1000

    // Get the exact row count with the first page, then fetch only the
    // pages that actually exist. This avoids requesting three empty pages
    // when the total is not a multiple of PAGE_SIZE.
    const { data: firstPage, error: firstError, count } = await supabase
      .from('orders')
      .select('*, order_items(*)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(0, PAGE_SIZE - 1)

    if (firstError) throw firstError
    const all = firstPage || []
    const total = count ?? all.length

    if (total <= PAGE_SIZE) return all

    const pageStarts = []
    for (let from = PAGE_SIZE; from < total; from += PAGE_SIZE) {
      pageStarts.push(from)
    }

    const pages = await Promise.all(pageStarts.map(async (from) => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .order('created_at', { ascending: false })
        .range(from, Math.min(from + PAGE_SIZE - 1, total - 1))
      if (error) throw error
      return data || []
    }))

    for (const page of pages) all.push(...page)
    return all
  }, [])

  const syncStockDeductions = useCallback(async (ordersData) => {
    const pending = ordersData.filter(o =>
      !o.stock_deducted &&
      (o.status === 'settled' || o.status === 'accepted')
    )
    for (const order of pending) {
      const { error } = await supabase.rpc('deduct_stock_for_order', { p_order_id: order.id })
      if (error) console.warn('stock sync failed for order', order.id, error)
    }
  }, [])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [ordersData, pR, eR, iR, rR, aN, cdR] = await Promise.all([
        fetchOrders(),
        supabase.from('products').select('id,name,category,price').order('name'),
        supabase.from('expenses').select('*').order('date', { ascending: false }),
        supabase.from('other_income').select('*').order('date', { ascending: false }),
        supabase.from('recipes').select('*').order('menu_name'),
        supabase.from('business_notes').select('*').order('note_date', { ascending: false }),
        supabase.from('closed_days').select('*').order('date', { ascending: false }),
      ])
      for (const result of [pR, eR, iR, rR, aN, cdR]) {
        if (result.error) throw result.error
      }

      setAllOrders(ordersData)
      setProducts(pR.data || [])
      setExpenses(eR.data || [])
      setIncome(iR.data || [])
      setRecipes(rR.data || [])
      setActionNotes(aN.data || [])
      setClosedDays(cdR.data || [])

      // Keep the existing inventory catch-up behavior unchanged.
      syncStockDeductions(ordersData)
    } catch (e) {
      setError(e.message || 'โหลดข้อมูลไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [fetchOrders, syncStockDeductions])

  useEffect(() => { fetchAll() }, [fetchAll])

  return {
    allOrders, setAllOrders,
    products, setProducts,
    expenses, setExpenses,
    income, setIncome,
    recipes, setRecipes,
    actionNotes, setActionNotes,
    closedDays, setClosedDays,
    loading, error,
    refetch: fetchAll,
  }
}
