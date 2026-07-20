import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'

export function useData() {
  const [allOrders, setAllOrders]   = useState([])
  const [products, setProducts]     = useState([])
  const [expenses, setExpenses]     = useState([])
  const [income, setIncome]         = useState([])
  const [recipes, setRecipes]       = useState([])
  const [actionNotes, setActionNotes] = useState([])
  const [closedDays, setClosedDays] = useState([])  // ← เพิ่ม
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)

  const fetchOrders = useCallback(async () => {
    const PAGE = 1000; let all = [], from = 0
    while (true) {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1)
      if (error) throw error
      all = [...all, ...(data || [])]
      if (!data || data.length < PAGE) break
      from += PAGE
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
      if (error) {
        console.warn('stock sync failed for order', order.id, error)
      }
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
      setAllOrders(ordersData)
      setProducts(pR.data || [])
      setExpenses(eR.data || [])
      setIncome(iR.data || [])
      setRecipes(rR.data || [])
      setActionNotes(aN.data || [])
      setClosedDays(cdR.data || [])

      // catch-up: หัก stock ให้ order ที่ยังไม่ได้หัก (ทำหลัง set state เสร็จ ไม่ block UI)
      syncStockDeductions(ordersData)
    } catch (e) {
      setError(e.message)
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
    closedDays, setClosedDays,  // ← เพิ่ม
    loading, error,
    refetch: fetchAll,
  }
}
