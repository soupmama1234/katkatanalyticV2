// src/utils/backupExporter.js
// ── Session 2: Export Engine ──────────────────────────────────────────────────
// รับ backupData จาก fetchBackupData() แล้ว generate 3 formats:
//   exportJSON()  → .json  (restore ได้)
//   exportCSV()   → .zip ของ CSVs (Excel/Sheets)
//   exportTXT()   → 4 .txt files สำหรับ NotebookLM

// ─── Shared Helpers ───────────────────────────────────────────────────────────

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href    = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function dateLabel(data) {
  const from = data.meta?.from_date
  const to   = data.meta?.to_date
  if (from && to && from === to) return from
  if (from && to) return `${from}_to_${to}`
  if (from) return `from_${from}`
  return new Date().toISOString().slice(0, 10)
}

function fmtDate(isoStr) {
  if (!isoStr) return '-'
  try {
    return new Date(isoStr).toLocaleString('th-TH', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return isoStr }
}

function fmtMoney(n) {
  return Number(n || 0).toLocaleString('th-TH')
}

// ─── 1. JSON Export ───────────────────────────────────────────────────────────

export function exportJSON(data) {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
  downloadBlob(blob, `katkat_backup_${dateLabel(data)}.json`)
}

// ─── 2. CSV Export ────────────────────────────────────────────────────────────

function toCSV(rows, columns) {
  if (!rows || !rows.length) return columns.join(',') + '\n'

  const escape = (v) => {
    if (v === null || v === undefined) return ''
    const str = typeof v === 'object' ? JSON.stringify(v) : String(v)
    // escape double quotes + wrap ใน quotes ถ้ามี comma/newline/quote
    if (str.includes('"') || str.includes(',') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const header = columns.join(',')
  const body   = rows.map(row =>
    columns.map(col => escape(row[col])).join(',')
  ).join('\n')

  return '\uFEFF' + header + '\n' + body  // BOM สำหรับ Excel ไทย
}

export function exportCSV(data) {
  const files = {}

  // orders (flatten items เป็นหลายแถว)
  if (data.orders?.length) {
    const rows = []
    data.orders.forEach(o => {
      if (!o.items?.length) {
        rows.push({
          order_id: o.id, created_at: fmtDate(o.created_at),
          channel: o.channel, payment: o.payment, ref_id: o.ref_id || '',
          total: o.total, actual_amount: o.actual_amount,
          has_subsidy: o.has_subsidy ? 'true' : 'false',
          member_phone: o.member_phone || '', order_type: o.order_type || '',
          table_number: o.table_number || '', customer_type: o.customer_type || '',
          status: o.status || '', note: o.note || '',
          item_name: '', item_qty: '', item_price: '',
          modifier_name: '', modifier_price: '',
        })
      } else {
        o.items.forEach((item, idx) => {
          rows.push({
            order_id:     idx === 0 ? o.id : '',
            created_at:   idx === 0 ? fmtDate(o.created_at) : '',
            channel:      idx === 0 ? o.channel : '',
            payment:      idx === 0 ? o.payment : '',
            ref_id:       idx === 0 ? (o.ref_id || '') : '',
            total:        idx === 0 ? o.total : '',
            actual_amount: idx === 0 ? o.actual_amount : '',
            has_subsidy:  idx === 0 ? (o.has_subsidy ? 'true' : 'false') : '',
            member_phone: idx === 0 ? (o.member_phone || '') : '',
            order_type:   idx === 0 ? (o.order_type || '') : '',
            table_number: idx === 0 ? (o.table_number || '') : '',
            customer_type: idx === 0 ? (o.customer_type || '') : '',
            status:       idx === 0 ? (o.status || '') : '',
            note:         idx === 0 ? (o.note || '') : '',
            item_name:    item.name,
            item_qty:     item.qty,
            item_price:   item.price,
            modifier_name:  item.modifier_name || '',
            modifier_price: item.modifier_price || '',
          })
        })
      }
    })
    files['orders'] = toCSV(rows, [
      'order_id','created_at','channel','payment','ref_id',
      'total','actual_amount','has_subsidy','member_phone','order_type',
      'table_number','customer_type','status','note',
      'item_name','item_qty','item_price','modifier_name','modifier_price',
    ])
  }

  // expenses
  if (data.expenses?.length) {
    files['expenses'] = toCSV(data.expenses, [
      'id','date','item','category','quantity','unit',
      'price_per_unit','amount','vendor','payment_method','note',
    ])
  }

  // other_income
  if (data.other_income?.length) {
    files['other_income'] = toCSV(data.other_income, [
      'id','date','item','category','quantity','unit',
      'price_per_unit','amount','source','note',
    ])
  }

  // members (redeemed_rewards เป็น JSON string)
  if (data.members?.length) {
    const memberRows = data.members.map(m => ({
      ...m,
      redeemed_rewards: JSON.stringify(m.redeemed_rewards || []),
    }))
    files['members'] = toCSV(memberRows, [
      'phone','nickname','points','tier','total_spent',
      'created_at','expires_at','last_visit','redeemed_rewards',
    ])
  }

  // point_history
  if (data.point_history?.length) {
    files['point_history'] = toCSV(data.point_history, [
      'id','member_phone','type','points','note','created_at',
    ])
  }

  // products
  if (data.products?.length) {
    files['products'] = toCSV(data.products, [
      'id','name','category','price','grab_price','lineman_price',
      'shopee_price','modifier_group_ids',
    ])
  }

  // rewards
  if (data.rewards?.length) {
    files['rewards'] = toCSV(data.rewards, [
      'id','name','points_required','type','discount_amount',
      'discount_type','description','is_active','expiry_days',
    ])
  }

  // recipes
  if (data.recipes?.length) {
    files['recipes'] = toCSV(data.recipes, [
      'id','menu_name','ingredient','quantity','unit',
    ])
  }

  // business_notes
  if (data.business_notes?.length) {
    files['business_notes'] = toCSV(data.business_notes, [
      'id','note_date','category','content',
    ])
  }

  // staff (pin_hash ไม่มีอยู่แล้ว จาก fetcher)
  if (data.staff?.length) {
    files['staff'] = toCSV(data.staff, [
      'id','name','role','is_active','created_at',
    ])
  }

  // FIX: sequential downloads with delay (browser blocks simultaneous)
  const label = dateLabel(data)
  const entries = Object.entries(files)
  entries.forEach(([name, csv], idx) => {
    setTimeout(() => {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      downloadBlob(blob, `katkat_${name}_${label}.csv`)
    }, idx * 300)  // 300ms gap ระหว่างแต่ละไฟล์
  })

  return entries.length
}

// ─── 3. TXT Export (NotebookLM-ready) ────────────────────────────────────────

// ── TXT ไฟล์ 1: Orders ──
function buildOrdersTXT(data) {
  const orders      = data.orders || []
  const members     = data.members || []
  const label       = dateLabel(data)
  const subsidyLabel = data.meta?.subsidy_label || 'โครงการรัฐ'

  const memberMap = {}
  members.forEach(m => { memberMap[m.phone] = m })

  const totalRevenue   = orders.reduce((s, o) => s + (o.actual_amount || 0), 0)
  const totalBills     = orders.length
  const avgBill        = totalBills ? Math.round(totalRevenue / totalBills) : 0
  const subsidyCount   = orders.filter(o => o.has_subsidy).length
  const subsidyRevenue = orders.filter(o => o.has_subsidy).reduce((s, o) => s + (o.actual_amount || 0), 0)

  let txt = `# KATKAT POS — ประวัติการขาย (${label})
สร้างเมื่อ: ${fmtDate(data.meta?.exported_at)}

## สรุปภาพรวม
- ยอดรวม: ฿${fmtMoney(totalRevenue)}
- จำนวนบิล: ${totalBills} บิล
- เฉลี่ย/บิล: ฿${fmtMoney(avgBill)}
- ช่องทาง: ${[...new Set(orders.map(o => o.channel))].join(', ')}\n`

  if (subsidyCount > 0) {
    txt += `- ใช้สิทธิ์${subsidyLabel}: ${subsidyCount} บิล (฿${fmtMoney(subsidyRevenue)})\n`
  }

  txt += `\n## รายการออเดอร์\n`

  orders.forEach(o => {
    const member = o.member_phone ? memberMap[o.member_phone] : null
    const memberStr = member
      ? ` | สมาชิก: ${member.nickname} (${o.member_phone})`
      : o.customer_type ? ` | ลูกค้า${o.customer_type === 'new' ? 'ใหม่' : 'ประจำ'}` : ''

    txt += `\n[${fmtDate(o.created_at)}] บิล#${String(o.id).slice(-6)} | ${o.channel?.toUpperCase()} | `
    txt += o.order_type === 'dine_in' && o.table_number ? `โต๊ะ ${o.table_number}` : o.order_type || '-'
    txt += memberStr + '\n'

    ;(o.items || []).forEach(item => {
      const mod = item.modifier_name ? ` (${item.modifier_name})` : ''
      txt += `  - ${item.name}${mod} x${item.qty} = ฿${fmtMoney(item.price * item.qty)}\n`
    })

    txt += `  ชำระ: ${o.payment || '-'}`
    if (o.has_subsidy) txt += ` | 🇹🇭 ${subsidyLabel}`
    if (o.ref_id) txt += ` | Ref: ${o.ref_id}`
    txt += ` | รวม: ฿${fmtMoney(o.actual_amount)}\n`
    if (o.note) txt += `  หมายเหตุ: ${o.note}\n`
  })

  return txt
}

// ── TXT ไฟล์ 2: Members ──
function buildMembersTXT(data) {
  const members      = data.members      || []
  const orders       = data.orders       || []
  const pointHistory = data.point_history || []
  const label        = dateLabel(data)

  // สร้าง stats จาก orders
  const statsMap = {}
  orders.forEach(o => {
    if (!o.member_phone) return
    if (!statsMap[o.member_phone]) statsMap[o.member_phone] = { visits: 0, total: 0, items: {} }
    statsMap[o.member_phone].visits++
    statsMap[o.member_phone].total += o.actual_amount || 0
    ;(o.items || []).forEach(item => {
      const n = item.name
      statsMap[o.member_phone].items[n] = (statsMap[o.member_phone].items[n] || 0) + (item.qty || 1)
    })
  })

  // สร้าง point history map
  const historyMap = {}
  pointHistory.forEach(h => {
    if (!historyMap[h.member_phone]) historyMap[h.member_phone] = []
    historyMap[h.member_phone].push(h)
  })

  let txt = `# KATKAT POS — ข้อมูลสมาชิก (${label})
สร้างเมื่อ: ${fmtDate(data.meta?.exported_at)}

## สรุป
- สมาชิกทั้งหมด: ${members.length} คน
- มีแต้มสะสม: ${members.filter(m => m.points > 0).length} คน
- แต้มรวมทั้งระบบ: ${members.reduce((s, m) => s + (m.points || 0), 0).toLocaleString()} แต้ม

## รายละเอียดสมาชิก\n`

  members.forEach(m => {
    const stats  = statsMap[m.phone] || { visits: 0, total: 0, items: {} }
    const history = historyMap[m.phone] || []
    const favMenus = Object.entries(stats.items)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, cnt]) => `${name} (${cnt} ครั้ง)`)
      .join(', ')

    const coupons = Array.isArray(m.redeemed_rewards)
      ? m.redeemed_rewards.filter(r => !r.used_at)
      : []

    txt += `\n[${m.phone}] ${m.nickname || '-'}\n`
    txt += `  - ระดับ: ${m.tier || 'Standard'}\n`
    txt += `  - แต้มสะสม: ${(m.points || 0).toLocaleString()} แต้ม\n`
    txt += `  - ยอดใช้จ่ายรวม: ฿${fmtMoney(m.total_spent || stats.total)}\n`
    txt += `  - จำนวนครั้งที่มา: ${stats.visits} ครั้ง\n`
    txt += `  - สมัครเมื่อ: ${fmtDate(m.created_at)}\n`
    if (m.expires_at) txt += `  - หมดอายุ: ${fmtDate(m.expires_at)}\n`
    if (favMenus)     txt += `  - เมนูโปรด: ${favMenus}\n`
    if (coupons.length) {
      txt += `  - คูปองที่มี: ${coupons.map(c => c.name).join(', ')}\n`
    }
    if (history.length) {
      txt += `  - ประวัติแต้มล่าสุด 5 รายการ:\n`
      history.slice(0, 5).forEach(h => {
        const sign = h.points > 0 ? '+' : ''
        txt += `    ${fmtDate(h.created_at)}: ${sign}${h.points} แต้ม (${h.note || h.type})\n`
      })
    }
  })

  return txt
}

// ── TXT ไฟล์ 3: Expenses ──
function buildExpensesTXT(data) {
  const expenses    = data.expenses     || []
  const otherIncome = data.other_income || []
  const orders      = data.orders       || []
  const label       = dateLabel(data)

  const totalExp    = expenses.reduce((s, e) => s + (e.amount || 0), 0)
  const totalIncome = otherIncome.reduce((s, i) => s + (i.amount || 0), 0)
  const totalRev    = orders.reduce((s, o) => s + (o.actual_amount || 0), 0)
  const grossProfit = totalRev - totalExp
  const margin      = totalRev > 0 ? Math.round(grossProfit / totalRev * 100) : 0

  // สรุปแยกหมวด
  const byCat = {}
  expenses.forEach(e => {
    byCat[e.category || 'อื่นๆ'] = (byCat[e.category || 'อื่นๆ'] || 0) + (e.amount || 0)
  })

  let txt = `# KATKAT POS — ต้นทุนและรายได้ (${label})
สร้างเมื่อ: ${fmtDate(data.meta?.exported_at)}

## สรุปการเงิน
- รายรับจากการขาย: ฿${fmtMoney(totalRev)}
- ต้นทุนรวม: ฿${fmtMoney(totalExp)}
- กำไรขั้นต้น: ฿${fmtMoney(grossProfit)}
- Gross Margin: ${margin}%
- รายได้อื่นๆ: ฿${fmtMoney(totalIncome)}

## ต้นทุนแยกหมวด\n`

  Object.entries(byCat)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, amt]) => {
      const pct = totalExp > 0 ? Math.round(amt / totalExp * 100) : 0
      txt += `  - ${cat}: ฿${fmtMoney(amt)} (${pct}%)\n`
    })

  txt += `\n## รายการต้นทุน\n`
  expenses.forEach(e => {
    txt += `[${e.date}] ${e.item} | ${e.category || '-'}`
    if (e.quantity) txt += ` | ${e.quantity}${e.unit || ''}`
    if (e.price_per_unit) txt += ` | ฿${e.price_per_unit}/${e.unit || 'หน่วย'}`
    txt += ` | รวม: ฿${fmtMoney(e.amount)}`
    if (e.vendor) txt += ` | ${e.vendor}`
    txt += '\n'
  })

  if (otherIncome.length) {
    txt += `\n## รายได้อื่นๆ\n`
    otherIncome.forEach(i => {
      txt += `[${i.date}] ${i.item} | ${i.category || '-'} | ฿${fmtMoney(i.amount)}`
      if (i.source) txt += ` | ${i.source}`
      txt += '\n'
    })
  }

  return txt
}

// ── TXT ไฟล์ 4: Menu & Config ──
function buildMenuConfigTXT(data) {
  const products  = data.products  || []
  const modifiers = data.modifiers || []
  const rewards   = data.rewards   || []
  const recipes   = data.recipes   || []
  const expenses  = data.expenses  || []

  // สร้าง recipe map
  const recipeMap = {}
  recipes.forEach(r => {
    if (!recipeMap[r.menu_name]) recipeMap[r.menu_name] = []
    recipeMap[r.menu_name].push(r)
  })

  // สร้าง lastPrice map จาก expenses สำหรับคำนวณ cost
  const lastPriceMap = {}
  ;[...expenses].sort((a, b) => (b.date || '').localeCompare(a.date || '')).forEach(e => {
    if (e.item && e.price_per_unit && !lastPriceMap[e.item]) {
      lastPriceMap[e.item] = { ppu: e.price_per_unit, unit: e.unit || '' }
    }
  })

  let txt = `# KATKAT POS — เมนูและการตั้งค่า
สร้างเมื่อ: ${new Date().toLocaleString('th-TH')}

## เมนูทั้งหมด (${products.length} รายการ)\n`

  products.forEach(p => {
    const mods = modifiers.filter(g =>
      (p.modifier_group_ids || p.modifierGroups || []).includes(g.id)
    )

    // คำนวณ cost จาก recipe + lastPriceMap
    const ings  = recipeMap[p.name] || []
    let cost = 0
    let hasUnknown = false
    ings.forEach(ing => {
      const info = lastPriceMap[ing.ingredient]
      if (info) cost += info.ppu * (ing.quantity || 0)
      else hasUnknown = true
    })

    const margin = p.price && cost > 0
      ? Math.round((p.price - cost) / p.price * 100)
      : null

    txt += `\n[${p.name}]\n`
    txt += `  - หมวด: ${p.category || '-'}\n`
    txt += `  - ราคาหน้าร้าน: ฿${p.price}\n`
    if (p.grab_price)    txt += `  - ราคา Grab: ฿${p.grab_price}\n`
    if (p.lineman_price) txt += `  - ราคา Lineman: ฿${p.lineman_price}\n`
    if (p.shopee_price)  txt += `  - ราคา Shopee: ฿${p.shopee_price}\n`

    if (ings.length) {
      txt += `  - ต้นทุน/จาน: ฿${cost.toFixed(2)}${hasUnknown ? ' (ประมาณ)' : ''}\n`
      if (margin !== null) txt += `  - Margin: ${margin}%\n`
      txt += `  - วัตถุดิบ:\n`
      ings.forEach(ing => {
        txt += `    • ${ing.ingredient} ${ing.quantity || ''}${ing.unit || ''}\n`
      })
    }

    if (mods.length) {
      txt += `  - ตัวเลือกเสริม:\n`
      mods.forEach(g => {
        txt += `    • ${g.name}: ${g.options.map(o => `${o.name}(+฿${o.price})`).join(', ')}\n`
      })
    }
  })

  if (rewards.length) {
    txt += `\n## Rewards / คูปอง\n`
    rewards.forEach(r => {
      txt += `[${r.name}] | ${r.points_required} แต้ม | ${r.type === 'discount' ? `ลด ${r.discount_amount}${r.discount_type === 'percent' ? '%' : '฿'}` : 'สินค้าฟรี'}`
      if (!r.is_active) txt += ` | (ปิดใช้งาน)`
      if (r.expiry_days) txt += ` | หมดอายุใน ${r.expiry_days} วัน`
      txt += '\n'
    })
  }

  return txt
}

// ── Main TXT Exporter ──
export function exportTXT(data) {
  const label = dateLabel(data)
  const files = [
    { name: `katkat_orders_${label}.txt`,      content: buildOrdersTXT(data)     },
    { name: `katkat_members_${label}.txt`,     content: buildMembersTXT(data)    },
    { name: `katkat_expenses_${label}.txt`,    content: buildExpensesTXT(data)   },
    { name: `katkat_menu_config_${label}.txt`, content: buildMenuConfigTXT(data) },
  ]

  // FIX: sequential downloads with delay
  files.forEach(({ name, content }, idx) => {
    setTimeout(() => {
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
      downloadBlob(blob, name)
    }, idx * 300)
  })

  return files.length
}

// ─── Export All (convenience) ─────────────────────────────────────────────────

export function exportAll(data) {
  exportJSON(data)
  exportCSV(data)
  exportTXT(data)
}
