// src/utils/backupFetcher.js
// ── Session 1: Core Backup Fetcher (fixed) ───────────────────────────────────

import { supabase as sb } from '../supabase'

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function fetchAllRows(table, opts = {}) {
  const {
    select   = '*',
    filters  = [],
    orderCol = 'created_at',
    orderAsc = false,
  } = opts

  const PAGE = 1000
  let all  = []
  let from = 0

  while (true) {
    let query = sb.from(table).select(select)
    filters.forEach(f => { query = query[f.method](...f.args) })

    const { data, error } = await query
      .order(orderCol, { ascending: orderAsc })
      .range(from, from + PAGE - 1)

    if (error) throw new Error(`[${table}] ${error.message}`)

    all  = [...all, ...(data || [])]
    if (!data || data.length < PAGE) break
    from += PAGE
  }

  return all
}

function toThaiISO(dateStr, type) {
  if (!dateStr) return null
  return dateStr + (type === 'start' ? 'T00:00:00+07:00' : 'T23:59:59+07:00')
}

function maskPhone(phone) {
  if (!phone || phone.length < 9) return phone
  return `${phone.slice(0, 3)}-${phone.slice(3, 6)}-XXXX`
}

// ─── Individual Fetchers ──────────────────────────────────────────────────────

async function fetchOrders(fromDate, toDate) {
  const filters = []
  if (fromDate) filters.push({ method: 'gte', args: ['created_at', toThaiISO(fromDate, 'start')] })
  if (toDate)   filters.push({ method: 'lte', args: ['created_at', toThaiISO(toDate,   'end')]   })

  const orders = await fetchAllRows('orders', { filters, orderCol: 'created_at' })
  if (!orders.length) return []

  const orderIds = orders.map(o => o.id)
  const BATCH = 500
  let allItems = []
  for (let i = 0; i < orderIds.length; i += BATCH) {
    const chunk = orderIds.slice(i, i + BATCH)
    const { data, error } = await sb
      .from('order_items')
      .select('*')
      .in('order_id', chunk)
    if (error) throw new Error(`[order_items] ${error.message}`)
    allItems = [...allItems, ...(data || [])]
  }

  const itemsByOrder = {}
  allItems.forEach(item => {
    if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = []
    itemsByOrder[item.order_id].push({
      name:           item.name,
      qty:            item.qty,
      price:          item.price,
      category:       item.category       || null,
      modifier_name:  item.modifier_name  || null,
      modifier_price: item.modifier_price || null,
    })
  })

  return orders.map(o => ({
    id:            o.id,
    created_at:    o.created_at,
    channel:       o.channel,
    payment:       o.payment,
    ref_id:        o.ref_id        || null,
    total:         o.total,
    actual_amount: o.actual_amount || 0,
    is_settled:    o.is_settled,
    has_subsidy:   o.has_subsidy   || false,
    member_phone:  o.member_phone  || null,
    order_type:    o.order_type    || null,
    table_number:  o.table_number  || null,
    customer_type: o.customer_type || null,
    status:        o.status        || null,
    note:          o.note          || null,
    items:         itemsByOrder[o.id] || [],
  }))
}

async function fetchExpenses(fromDate, toDate) {
  const filters = []
  if (fromDate) filters.push({ method: 'gte', args: ['date', fromDate] })
  if (toDate)   filters.push({ method: 'lte', args: ['date', toDate]   })
  return fetchAllRows('expenses', { filters, orderCol: 'date' })
}

async function fetchOtherIncome(fromDate, toDate) {
  const filters = []
  if (fromDate) filters.push({ method: 'gte', args: ['date', fromDate] })
  if (toDate)   filters.push({ method: 'lte', args: ['date', toDate]   })
  return fetchAllRows('other_income', { filters, orderCol: 'date' })
}

async function fetchMembers() {
  // full dump เสมอ ไม่ filter date (ต้องการข้อมูล member ครบทุกคน)
  return fetchAllRows('members', { orderCol: 'created_at', orderAsc: true })
}

async function fetchPointHistory(fromDate, toDate) {
  const filters = []
  if (fromDate) filters.push({ method: 'gte', args: ['created_at', toThaiISO(fromDate, 'start')] })
  if (toDate)   filters.push({ method: 'lte', args: ['created_at', toThaiISO(toDate,   'end')]   })
  return fetchAllRows('point_history', { filters, orderCol: 'created_at' })
}

async function fetchProducts() {
  return fetchAllRows('products', { orderCol: 'name', orderAsc: true })
}

async function fetchCategories() {
  const { data, error } = await sb.from('categories').select('*').order('sort_order')
  if (error) throw new Error(`[categories] ${error.message}`)
  return data || []
}

async function fetchModifiers() {
  // FIX: modifier_options ใช้ id แทน created_at เพราะอาจไม่มี created_at column
  const [groups, options] = await Promise.all([
    fetchAllRows('modifier_groups',  { orderCol: 'created_at', orderAsc: true }),
    fetchAllRows('modifier_options', { orderCol: 'id',         orderAsc: true }),
  ])

  return groups.map(g => ({
    id:      g.id,
    name:    g.name,
    options: options
      .filter(o => o.group_id === g.id)
      .map(o => ({ id: o.id, name: o.name, price: o.price })),
  }))
}

async function fetchRewards() {
  return fetchAllRows('rewards', { orderCol: 'points_required', orderAsc: true })
}

async function fetchRecipes() {
  return fetchAllRows('recipes', { orderCol: 'menu_name', orderAsc: true })
}

async function fetchBusinessNotes(fromDate, toDate) {
  const filters = []
  if (fromDate) filters.push({ method: 'gte', args: ['note_date', fromDate] })
  if (toDate)   filters.push({ method: 'lte', args: ['note_date', toDate]   })
  return fetchAllRows('business_notes', { filters, orderCol: 'note_date' })
}

async function fetchStaff() {
  // pin_hash excluded อย่างชัดเจน
  const { data, error } = await sb
    .from('staff')
    .select('id, name, role, is_active, created_at')
    .order('created_at')
  if (error) throw new Error(`[staff] ${error.message}`)
  return data || []
}

// ดึง subsidy label จาก settings table — ไม่ throw ถ้า fail (non-critical)
async function fetchSubsidyLabel() {
  try {
    const { data } = await sb.from('settings').select('value').eq('key', 'subsidy').single()
    return data?.value?.label || 'โครงการรัฐ'
  } catch {
    return 'โครงการรัฐ'
  }
}

// ─── Main Export Function ─────────────────────────────────────────────────────

/**
 * ดึงข้อมูลทั้งหมดพร้อม progress callback
 *
 * @param {object} opts
 *   fromDate     : 'YYYY-MM-DD' | null
 *   toDate       : 'YYYY-MM-DD' | null
 *   maskPhones   : boolean (default: false)
 *   tables       : string[] | 'all'
 *   onProgress   : ({ step, total, label, count, error }) => void
 *
 * @returns {object} backupData
 */
export async function fetchBackupData(opts = {}) {
  const {
    fromDate   = null,
    toDate     = null,
    maskPhones = false,
    tables     = 'all',
    onProgress = () => {},
  } = opts

  const shouldFetch = (name) =>
    tables === 'all' || tables.includes(name)

  const ALL_TASKS = [
    { name: 'orders',         label: 'ออเดอร์',       fn: () => fetchOrders(fromDate, toDate)        },
    { name: 'expenses',       label: 'ต้นทุน',         fn: () => fetchExpenses(fromDate, toDate)      },
    { name: 'other_income',   label: 'รายได้อื่น',     fn: () => fetchOtherIncome(fromDate, toDate)   },
    { name: 'members',        label: 'สมาชิก',         fn: () => fetchMembers()                       },
    { name: 'point_history',  label: 'ประวัติแต้ม',    fn: () => fetchPointHistory(fromDate, toDate)  },
    { name: 'products',       label: 'เมนู',            fn: () => fetchProducts()                      },
    { name: 'categories',     label: 'หมวดหมู่',       fn: () => fetchCategories()                    },
    { name: 'modifiers',      label: 'ตัวเลือกเสริม',  fn: () => fetchModifiers()                     },
    { name: 'rewards',        label: 'Rewards',        fn: () => fetchRewards()                       },
    { name: 'recipes',        label: 'สูตรอาหาร',      fn: () => fetchRecipes()                       },
    { name: 'business_notes', label: 'Action Notes',   fn: () => fetchBusinessNotes(fromDate, toDate) },
    { name: 'staff',          label: 'พนักงาน',        fn: () => fetchStaff()                         },
  ]

  // FIX: total คำนวณจาก tasks ที่จะรันจริงๆ เท่านั้น
  const tasks = ALL_TASKS.filter(t => shouldFetch(t.name))
  const total = tasks.length

  const result  = {}
  const summary = {}
  const errors  = {}

  for (let i = 0; i < tasks.length; i++) {
    const { name, label, fn } = tasks[i]
    const step = i + 1

    onProgress({ step, total, label: `กำลังดึง ${label}...`, count: null })

    try {
      const data    = await fn()
      result[name]  = data
      summary[name] = data.length
      onProgress({ step, total, label: `✅ ${label}`, count: data.length })
    } catch (err) {
      // FIX: ไม่ crash ทั้งหมดถ้า table เดียว fail — บันทึก error แล้วไปต่อ
      console.error(`Backup error [${name}]:`, err)
      result[name]  = []
      summary[name] = 0
      errors[name]  = err.message
      onProgress({ step, total, label: `❌ ${label}: ${err.message}`, count: 0, error: true })
    }
  }

  // mask phones ถ้าเปิด option
  if (maskPhones) {
    result.orders = (result.orders || []).map(o => ({
      ...o,
      member_phone: o.member_phone ? maskPhone(o.member_phone) : null,
    }))
    result.members = (result.members || []).map(m => ({
      ...m,
      phone:            maskPhone(m.phone),
      redeemed_rewards: Array.isArray(m.redeemed_rewards) ? m.redeemed_rewards : [],
    }))
    result.point_history = (result.point_history || []).map(h => ({
      ...h,
      member_phone: h.member_phone ? maskPhone(h.member_phone) : null,
    }))
  }

  const hasErrors = Object.keys(errors).length > 0

  // ดึง subsidy label สำหรับ TXT export (ไม่นับใน progress เพราะ non-critical)
  const subsidyLabel = await fetchSubsidyLabel()

  return {
    meta: {
      exported_at:   new Date().toISOString(),
      from_date:     fromDate,
      to_date:       toDate,
      mask_phones:   maskPhones,
      subsidy_label: subsidyLabel,
      members_note:  'members = full dump (not filtered by date range)',
      summary,
      errors: hasErrors ? errors : undefined,
    },
    ...result,
  }
}
