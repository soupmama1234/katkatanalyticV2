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
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState(null)
  const [error, setError] = useState(null)

  const fetchRecentOrders = useCallback(async (dayStartISO) => {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .gte('created_at', dayStartISO)
      .order('created_at', { ascending: false })
      .range(0, 999)

    if (error) throw error
    return data || []
  }, [])

  // Load older orders separately so today's dashboard can appear first.
  const fetchOlderOrders = useCallback(async (dayStartISO) => {
    const PAGE_SIZE = 1000
    const PARALLEL_PAGES = 4
    const fetchPage = async (from, to) => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .lt('created_at', dayStartISO)
        .order('created_at', { ascending: false })
        .range(from, to)
      if (error) throw error
      return data || []
    }

    const first = await fetchPage(0, PAGE_SIZE - 1)
    const all = [...first]
    if (first.length < PAGE_SIZE) return all

    let from = PAGE_SIZE
    while (true) {
      const starts = Array.from({ length: PARALLEL_PAGES }, (_, i) => from + i * PAGE_SIZE)
      const pages = await Promise.all(starts.map(start => fetchPage(start, start + PAGE_SIZE - 1)))
      for (const page of pages) all.push(...page)
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
    setHistoryLoading(false)
    setHistoryError(null)
    setError(null)

    const dayStart = new Date()
    dayStart.setHours(0, 0, 0, 0)
    const dayStartISO = dayStart.toISOString()

    try {
      const [todayOrders, pR, eR, iR, rR, aN, cdR] = await Promise.all([
        fetchRecentOrders(dayStartISO),
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

      // Render the app with today's orders first; history is fetched in the background.
      setAllOrders(todayOrders)
      setProducts(pR.data || [])
      setExpenses(eR.data || [])
      setIncome(iR.data || [])
      setRecipes(rR.data || [])
      setActionNotes(aN.data || [])
      setClosedDays(cdR.data || [])
      setLoading(false)

      setHistoryLoading(true)
      fetchOlderOrders(dayStartISO)
        .then(olderOrders => {
          const completeOrders = [...todayOrders, ...olderOrders]
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          setAllOrders(completeOrders)
          syncStockDeductions(completeOrders)
        })
        .catch(e => {
          console.error('Historical orders failed to load:', e)
          setHistoryError(e.message || 'โหลดประวัติย้อนหลังไม่สำเร็จ')
        })
        .finally(() => setHistoryLoading(false))
    } catch (e) {
      setError(e.message || 'โหลดข้อมูลไม่สำเร็จ')
      setLoading(false)
    }
  }, [fetchRecentOrders, fetchOlderOrders, syncStockDeductions])

  useEffect(() => { fetchAll() }, [fetchAll])

  return {
    allOrders, setAllOrders,
    products, setProducts,
    expenses, setExpenses,
    income, setIncome,
    recipes, setRecipes,
    actionNotes, setActionNotes,
    closedDays, setClosedDays,
    loading, historyLoading, historyError, error,
    refetch: fetchAll,
  }
}
