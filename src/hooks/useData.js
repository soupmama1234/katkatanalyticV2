import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'

export function useData() {
  const [allOrders, setAllOrders]   = useState([])
  const [products, setProducts]     = useState([])
  const [expenses, setExpenses]     = useState([])
  const [income, setIncome]         = useState([])
  const [recipes, setRecipes]       = useState([])
  const [actionNotes, setActionNotes] = useState([])
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

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [ordersData, pR, eR, iR, rR, aN] = await Promise.all([
        fetchOrders(),
        supabase.from('products').select('id,name,category,price').order('name'),
        supabase.from('expenses').select('*').order('date', { ascending: false }),
        supabase.from('other_income').select('*').order('date', { ascending: false }),
        supabase.from('recipes').select('*').order('menu_name'),
        supabase.from('business_notes').select('*').order('note_date', { ascending: false }),
      ])
      setAllOrders(ordersData)
      setProducts(pR.data || [])
      setExpenses(eR.data || [])
      setIncome(iR.data || [])
      setRecipes(rR.data || [])
      setActionNotes(aN.data || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [fetchOrders])

  useEffect(() => { fetchAll() }, [fetchAll])

  return {
    allOrders, setAllOrders,
    products, setProducts,
    expenses, setExpenses,
    income, setIncome,
    recipes, setRecipes,
    actionNotes, setActionNotes,
    loading, error,
    refetch: fetchAll,
  }
}
