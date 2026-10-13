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
    const PARALLEL_PAGES = 4

    // Fetch the first page, then fetch the next four pages concurrently.
    // Stop as soon as a page is short; do not request more empty pages.
    const { data: firstPage, error: firstError } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .order('created_at', { ascending: false })
      .range(0, PAGE_SIZE - 1)

    if (firstError) throw firstError
    const all = firstPage || []
    if (all.length < PAGE_SIZE) return all

    let from = PAGE_SIZE
    while (true) {
      const starts = Array.from(
        { length: PARALLEL_PAGES },
        (_, i) => from + i * PAGE_SIZE
      )
      const pages = await Promise.all(starts.map(async (start) => {
        const { data, error } = await supabase
          .from('orders')
          .select('*, order_items(*)')
          .order('created_at', { ascending: false })
          .range(start, start + PAGE_SIZE - 1)
        if (error) throw error
        return data || []
      }))

      for (const page of pages) all.push(...page)

      // If any page is short, all later pages in this batch are empty.
      if (pages.some(page => page.length < PAGE_SIZE)) break
      from += PARALLEL_PAGES * PAGE_SIZE
    }

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

      // Keep inventory catch-up behavior unchanged.
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
