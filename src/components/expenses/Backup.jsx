import { supabase } from '../../supabase.js'
import { exportCSV } from '../../utils/helpers.js'

export default function Backup({ allOrders, notify }) {
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
        rows.push([dt.toLocaleDateString('th-TH'), dt.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'}),
          o.id, o.channel||'', o.table_number||'', o.member_phone||'', '','','','','', o.total||0, o.actual_amount||0, o.status||''].map(escape).join(','))
      } else {
        items.forEach((item, i) => {
          const itemTotal = (item.price + (item.modifier_price || 0)) * item.qty
          rows.push([
            i===0 ? dt.toLocaleDateString('th-TH') : '',
            i===0 ? dt.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'}) : '',
            i===0 ? o.id : '', i===0 ? (o.channel||'') : '',
            i===0 ? (o.table_number||'') : '', i===0 ? (o.member_phone||'') : '',
            item.name||'', item.modifier_name||'', item.qty||1, item.price||0, itemTotal,
            i===0 ? (o.total||0) : '', i===0 ? (o.actual_amount||0) : '', i===0 ? (o.status||'') : '',
          ].map(escape).join(','))
        })
      }
    }

    const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `orders_${new Date().toLocaleDateString('en-CA')}.csv`
    a.click(); URL.revokeObjectURL(url)
    notify('Export เรียบร้อย ✅')
  }

  const btnStyle = {
    width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)',
    color: '#fff', borderRadius: 14, padding: 14, fontSize: 13,
    fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 10,
  }

  return (
    <div>
      <button style={btnStyle} onClick={() => exportCSV(supabase, 'expenses')}>📥 Export ค่าใช้จ่าย CSV</button>
      <button style={btnStyle} onClick={() => exportCSV(supabase, 'other_income')}>📥 Export รายได้อื่น CSV</button>
      <button style={btnStyle} onClick={() => exportCSV(supabase, 'orders')}>📥 Export ออเดอร์ CSV</button>
      <button style={{ ...btnStyle, background: 'var(--primary)', color: '#000', border: 'none', fontWeight: 800 }}
        onClick={handleExportOrders}>📊 Export รายการละเอียด (per item)</button>
    </div>
  )
}
