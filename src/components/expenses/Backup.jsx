import { useState, useEffect } from 'react'
import { supabase } from '../../supabase.js'
import { exportCSV } from '../../utils/helpers.js'

// ── estimate helpers ──────────────────────────────────────────────────────────

async function estimateTableSize(tableName) {
  const { count } = await supabase
    .from(tableName)
    .select('*', { count: 'exact', head: true })
  if (!count) return { count: 0, estimatedMB: 0 }

  const { data: sample } = await supabase
    .from(tableName)
    .select('*')
    .limit(20)

  if (!sample?.length) return { count, estimatedMB: 0 }

  const avgBytes = JSON.stringify(sample).length / sample.length
  const estimatedMB = (avgBytes * count) / (1024 * 1024)
  return { count, estimatedMB }
}

async function estimateOrdersDetailSize() {
  const { count } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
  if (!count) return { count: 0, estimatedMB: 0 }

  // orders detail มี order_items nested — sample 20 rows พร้อม items
  const { data: sample } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .limit(20)

  if (!sample?.length) return { count, estimatedMB: 0 }

  const avgBytes = JSON.stringify(sample).length / sample.length
  const estimatedMB = (avgBytes * count) / (1024 * 1024)
  return { count, estimatedMB }
}

function formatSize(mb) {
  if (mb < 0.01) return '< 0.01 MB'
  if (mb < 1) return `~${(mb * 1024).toFixed(0)} KB`
  return `~${mb.toFixed(1)} MB`
}

// ── SizeTag component ─────────────────────────────────────────────────────────

function SizeTag({ count, estimatedMB, loading }) {
  if (loading) return (
    <span style={{ fontSize: 10, color: '#555' }}>กำลังประมาณ...</span>
  )
  if (count === 0) return (
    <span style={{ fontSize: 10, color: '#555' }}>ไม่มีข้อมูล</span>
  )
  const color = estimatedMB > 5 ? '#FF9F0A' : estimatedMB > 1 ? '#4D96FF' : '#32D74B'
  return (
    <span style={{
      fontSize: 10, color, background: color + '18',
      border: `1px solid ${color}44`,
      borderRadius: 6, padding: '2px 7px', fontWeight: 700,
      whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      {count.toLocaleString()} rows · {formatSize(estimatedMB)}
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Backup({ allOrders, notify }) {
  const [sizes, setSizes] = useState({})
  const [loadingSizes, setLoadingSizes] = useState(true)

  useEffect(() => {
    async function fetchSizes() {
      setLoadingSizes(true)
      try {
        const [exp, inc, ord, ordDetail] = await Promise.all([
          estimateTableSize('expenses'),
          estimateTableSize('other_income'),
          estimateTableSize('orders'),
          estimateOrdersDetailSize(),
        ])
        setSizes({
          expenses:       exp,
          other_income:   inc,
          orders:         ord,
          orders_detail:  ordDetail,
        })
      } catch (e) {
        console.warn('estimateTableSize error:', e)
      }
      setLoadingSizes(false)
    }
    fetchSizes()
  }, [])

  const handleExportOrders = async () => {
    const { data: orders, error } = await supabase
      .from('orders').select('*, order_items(*)').order('created_at', { ascending: false })
    if (error || !orders?.length) return notify('ไม่มีข้อมูลให้ export', 'warning')

    const rows = [['วันที่','เวลา','บิล ID','ช่องทาง','โต๊ะ','สมาชิก','รายการ','ตัวเลือกเสริม','จำนวน','ราคา/ชิ้น','รวมรายการ','ยอดบิล','ชำระ','สถานะ'].join(',')]
    for (const o of orders) {
      const dt = new Date(o.created_at)
      const items = o.order_items || []
      const escape = v => `"${String(v).replace(/"/g, '""')}"`
      if (!items.length) {
        rows.push([
          dt.toLocaleDateString('th-TH'),
          dt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
          o.id, o.channel || '', o.table_number || '', o.member_phone || '',
          '', '', '', '', '',
          o.total || 0, o.actual_amount || 0, o.status || '',
        ].map(escape).join(','))
      } else {
        items.forEach((item, i) => {
          const itemTotal = (item.price + (item.modifier_price || 0)) * item.qty
          rows.push([
            i === 0 ? dt.toLocaleDateString('th-TH') : '',
            i === 0 ? dt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '',
            i === 0 ? o.id : '',
            i === 0 ? (o.channel || '') : '',
            i === 0 ? (o.table_number || '') : '',
            i === 0 ? (o.member_phone || '') : '',
            item.name || '', item.modifier_name || '',
            item.qty || 1, item.price || 0, itemTotal,
            i === 0 ? (o.total || 0) : '',
            i === 0 ? (o.actual_amount || 0) : '',
            i === 0 ? (o.status || '') : '',
          ].map(escape).join(','))
        })
      }
    }

    const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `orders_${new Date().toLocaleDateString('en-CA')}.csv`
    a.click()
    URL.revokeObjectURL(url)
    notify('Export เรียบร้อย ✅')
  }

  const btnStyle = {
    width: '100%',
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    color: '#fff',
    borderRadius: 14,
    padding: '14px 16px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    marginBottom: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    textAlign: 'left',
  }

  const EXPORTS = [
    { key: 'expenses',     label: '📥 Export ค่าใช้จ่าย CSV',  action: () => exportCSV(supabase, 'expenses')     },
    { key: 'other_income', label: '📥 Export รายได้อื่น CSV',   action: () => exportCSV(supabase, 'other_income') },
    { key: 'orders',       label: '📥 Export ออเดอร์ CSV',      action: () => exportCSV(supabase, 'orders')       },
  ]

  return (
    <div>
      {EXPORTS.map(({ key, label, action }) => (
        <button key={key} style={btnStyle} onClick={action}>
          <span>{label}</span>
          <SizeTag
            count={sizes[key]?.count ?? 0}
            estimatedMB={sizes[key]?.estimatedMB ?? 0}
            loading={loadingSizes}
          />
        </button>
      ))}

      <button
        style={{ ...btnStyle, background: 'var(--primary)', color: '#000', border: 'none', fontWeight: 800 }}
        onClick={handleExportOrders}
      >
        <span>📊 Export รายการละเอียด (per item)</span>
        <SizeTag
          count={sizes['orders_detail']?.count ?? 0}
          estimatedMB={sizes['orders_detail']?.estimatedMB ?? 0}
          loading={loadingSizes}
        />
      </button>
    </div>
  )
}
