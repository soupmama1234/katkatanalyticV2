export const fmt = (n) => (n || 0).toLocaleString('th-TH')

export const todayStr = new Date().toLocaleDateString('en-CA')

// แปลง order row → items array รองรับทั้ง order_items (new) และ items jsonb (old)
export function getOrderItems(order) {
  const raw = order.order_items || order.items
  if (!raw) return []
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) } catch { return [] }
  }
  if (!Array.isArray(raw)) return []
  return raw.map(item => ({
    ...item,
    qty: item.qty || item.quantity || 1,
    selectedModifier: item.selectedModifier ||
      (item.modifier_name ? { name: item.modifier_name, price: item.modifier_price || 0 } : null),
  }))
}

// filter orders by period
export function filterByPeriod(orders, period) {
  const now = new Date()
  const toLocalDate = r => {
    const s = r.created_at || ''
    if (!s) return ''
    return new Date(s).toLocaleDateString('en-CA')
  }
  if (period === 'today') return orders.filter(r => toLocalDate(r) === todayStr)
  if (period === '7d') {
    const d = new Date(now); d.setDate(d.getDate() - 7); d.setHours(0, 0, 0, 0)
    return orders.filter(r => new Date(r.created_at) >= d)
  }
  if (period === '30d' || period === 'month') {
    const d = new Date(now.getFullYear(), now.getMonth(), 1)
    return orders.filter(r => new Date(r.created_at) >= d)
  }
  if (period === '6m') {
    const d = new Date(now); d.setMonth(d.getMonth() - 6); d.setHours(0, 0, 0, 0)
    return orders.filter(r => new Date(r.created_at) >= d)
  }
  if (period === '1y') {
    const d = new Date(now); d.setFullYear(d.getFullYear() - 1); d.setHours(0, 0, 0, 0)
    return orders.filter(r => new Date(r.created_at) >= d)
  }
  if (period === 'week') {
    const d = new Date(now)
    const day = d.getDay(); const diff = day === 0 ? -6 : 1 - day
    d.setDate(d.getDate() + diff); d.setHours(0, 0, 0, 0)
    return orders.filter(r => new Date(r.created_at) >= d)
  }
  return orders
}

export function filterByRange(arr, from, to) {
  const f = new Date(from + 'T00:00:00')
  const t = new Date(to + 'T23:59:59')
  return arr.filter(r => { const d = new Date(r.created_at); return d >= f && d <= t })
}

export function filterExpByPeriod(rows, period) {
  const now = new Date()
  if (period === 'today') return rows.filter(r => r.date === todayStr)
  if (period === '7d') {
    const d = new Date(now); d.setDate(d.getDate() - 7)
    return rows.filter(r => r.date && r.date >= d.toLocaleDateString('en-CA'))
  }
  if (period === '30d') {
    const d = new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString('en-CA')
    return rows.filter(r => r.date && r.date >= d)
  }
  if (period === '6m') {
    const d = new Date(now); d.setMonth(d.getMonth() - 6)
    return rows.filter(r => r.date && r.date >= d.toLocaleDateString('en-CA'))
  }
  if (period === '1y') {
    const d = new Date(now); d.setFullYear(d.getFullYear() - 1)
    return rows.filter(r => r.date && r.date >= d.toLocaleDateString('en-CA'))
  }
  return rows
}

export function filterExpByRange(arr, from, to) {
  return arr.filter(r => r.date && r.date >= from && r.date <= to)
}

export function periodLabel(p) {
  return {
    all: 'ทั้งหมด', today: 'วันนี้',
    '7d': '7 วันล่าสุด', '30d': '30 วันล่าสุด',
    week: 'สัปดาห์นี้', month: 'เดือนนี้',
  }[p] || 'ทั้งหมด'
}

// คำนวณ stats จาก orders array
export function computeStats(orders) {
  const dailyMap = {}, menuCount = {}, menuRev = {}, catRev = {}, catCnt = {}
  const platformRev = {}, platformCnt = {}
  const byHour = Array.from({ length: 24 }, (_, i) => ({ hour: i, orders: 0, revenue: 0 }))
  const byWeekday = Array(7).fill(null).map(() => ({ rev: 0, cnt: 0 }))
  const posPayment = { cash: 0, transfer: 0, card: 0, qr: 0, other: 0 }

  orders.forEach(r => {
    const actual = r.actual_amount || 0
    const localDate = r.created_at ? new Date(r.created_at).toLocaleDateString('en-CA') : ''
    if (localDate) dailyMap[localDate] = (dailyMap[localDate] || 0) + actual

    const ch = (r.channel || 'pos').toLowerCase()
    platformRev[ch] = (platformRev[ch] || 0) + actual
    platformCnt[ch] = (platformCnt[ch] || 0) + 1

    if (ch === 'pos' && actual > 0) {
      const pm = (r.payment || '').toLowerCase()
      if (pm.includes('โอน') || pm.includes('transfer')) posPayment.transfer += actual
      else if (pm.includes('บัตร') || pm.includes('card') || pm.includes('credit')) posPayment.card += actual
      else if (pm.includes('qr') || pm.includes('promptpay')) posPayment.qr += actual
      else if (pm.includes('เงินสด') || pm.includes('cash')) posPayment.cash += actual
      else posPayment.other += actual
    }

    if (r.created_at) {
      const d = new Date(r.created_at)
      const h = d.getHours(); byHour[h].orders++; byHour[h].revenue += actual
      const wd = d.getDay(); const idx = wd === 0 ? 6 : wd - 1
      byWeekday[idx].rev += actual; byWeekday[idx].cnt++
    }

    getOrderItems(r).forEach(item => {
      const n = item.name || 'ไม่ระบุ'
      const q = Number(item.qty || item.quantity || 1)
      const p = Number(item.price || 0)
      const cat = item.category || 'ทั่วไป'
      menuCount[n] = (menuCount[n] || 0) + q
      menuRev[n] = (menuRev[n] || 0) + p * q
      catRev[cat] = (catRev[cat] || 0) + p * q
      catCnt[cat] = (catCnt[cat] || 0) + q
    })
  })

  return { dailyMap, menuCount, menuRev, catRev, catCnt, platformRev, platformCnt, byHour, byWeekday, posPayment }
}

export function guessExpCategory(item) {
  const il = (item || '').toLowerCase()
  if (['หมู', 'ไก่', 'เนื้อ', 'กุ้ง', 'ไข่', 'นม', 'ชีส', 'เนย', 'กะหล่ำ', 'แครอท', 'กระเทียม', 'ข้าว', 'สันนอก', 'สันใน'].some(k => il.includes(k))) return 'วัตถุดิบสด'
  if (['น้ำมัน', 'ซอส', 'แป้ง', 'เกลือ', 'น้ำตาล', 'มายอง', 'มิริน', 'โชยุ', 'เกล็ด', 'เครื่องปรุง'].some(k => il.includes(k))) return 'ของแห้ง/เครื่องปรุง'
  if (['ถุง', 'กล่อง', 'ถ้วย', 'ช้อน', 'ส้อม', 'ชาม', 'แก้ว'].some(k => il.includes(k))) return 'เครื่องดื่ม/บรรจุภัณฑ์'
  if (['แก๊ส', 'ไฟ', 'น้ำประปา', 'gas'].some(k => il.includes(k))) return 'สาธารณูปโภค'
  if (['ค่าเช่า', 'เช่า', 'rent'].some(k => il.includes(k))) return 'ค่าเช่า'
  return 'วัตถุดิบสด'
}

export async function exportCSV(supabase, table) {
  const { data, error } = await supabase.from(table).select('*').order('created_at', { ascending: false })
  if (error || !data?.length) return false
  const headers = Object.keys(data[0])
  const csv = [headers.join(','), ...data.map(r =>
    headers.map(h => { const v = r[h]; return v == null ? '' : `"${String(v).replace(/"/g, '""')}"` }).join(',')
  )].join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url
  a.download = `${table}_${new Date().toLocaleDateString('en-CA')}.csv`
  a.click(); URL.revokeObjectURL(url)
  return true
}
