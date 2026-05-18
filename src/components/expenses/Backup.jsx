// src/components/expenses/Backup.jsx
// ── Session 3: Backup UI ──────────────────────────────────────────────────────

import { useState, useCallback } from 'react'
import { fetchBackupData }              from '../../utils/backupFetcher'
import { exportJSON, exportCSV, exportTXT, exportAll } from '../../utils/backupExporter'

const TODAY = new Date().toLocaleDateString('en-CA')
const FIRST_OF_MONTH = new Date(
  new Date().getFullYear(), new Date().getMonth(), 1
).toLocaleDateString('en-CA')

// ─── Quick Range Presets ──────────────────────────────────────────────────────
const PRESETS = [
  { label: 'วันนี้',       from: TODAY,           to: TODAY },
  {
    label: 'เดือนนี้',
    from: FIRST_OF_MONTH,
    to: TODAY,
  },
  {
    label: 'เดือนที่แล้ว',
    from: (() => {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1)
      return d.toLocaleDateString('en-CA')
    })(),
    to: (() => {
      const d = new Date(); d.setDate(0)  // วันสุดท้ายของเดือนที่แล้ว
      return d.toLocaleDateString('en-CA')
    })(),
  },
  { label: 'ทั้งหมด', from: null, to: null },
]

// ─── Table selector ───────────────────────────────────────────────────────────
const TABLE_OPTIONS = [
  { key: 'orders',         label: '📋 ออเดอร์',        default: true  },
  { key: 'expenses',       label: '💸 ต้นทุน',          default: true  },
  { key: 'other_income',   label: '💚 รายได้อื่น',      default: true  },
  { key: 'members',        label: '👥 สมาชิก',          default: true  },
  { key: 'point_history',  label: '⭐ ประวัติแต้ม',     default: true  },
  { key: 'products',       label: '🍱 เมนู',             default: true  },
  { key: 'categories',     label: '📂 หมวดหมู่',        default: false },
  { key: 'modifiers',      label: '⚙️ ตัวเลือกเสริม',   default: false },
  { key: 'rewards',        label: '🎁 Rewards',         default: true  },
  { key: 'recipes',        label: '🍳 สูตรอาหาร',       default: true  },
  { key: 'business_notes', label: '📝 Action Notes',   default: false },
  { key: 'staff',          label: '👤 พนักงาน',         default: false },
]

// ─── Size helpers ─────────────────────────────────────────────────────────────
/**
 * derive ขนาดไฟล์จาก backupData ที่ fetch มาแล้ว
 * ไม่ต้อง query Supabase เพิ่ม — ข้อมูลอยู่ใน memory อยู่แล้ว
 *
 * JSON ≈ raw JSON bytes
 * CSV  ≈ JSON * 0.7   (ไม่มี key ซ้ำ จึงเล็กกว่า)
 * TXT  ≈ JSON * 1.2   (มี label + formatting เพิ่ม)
 * All  = JSON + CSV + TXT
 */
function estimateSizes(backupData) {
  if (!backupData) return null
  try {
    const jsonBytes = new Blob([JSON.stringify(backupData)]).size
    return {
      json: jsonBytes,
      csv:  Math.round(jsonBytes * 0.7),
      txt:  Math.round(jsonBytes * 1.2),
      all:  Math.round(jsonBytes + jsonBytes * 0.7 + jsonBytes * 1.2),
    }
  } catch {
    return null
  }
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  if (bytes < 1024)           return `${bytes} B`
  if (bytes < 1024 * 1024)    return `~${(bytes / 1024).toFixed(0)} KB`
  return `~${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function sizeColor(bytes) {
  const mb = bytes / (1024 * 1024)
  if (mb > 5)  return '#FF9F0A'   // ใหญ่ — เตือน
  if (mb > 1)  return '#4D96FF'   // กลาง
  return '#32D74B'                 // เล็ก — ok
}

// ─── SizeTag component ────────────────────────────────────────────────────────
function SizeTag({ bytes }) {
  if (!bytes) return null
  const color = sizeColor(bytes)
  return (
    <span style={{
      fontSize: 10, color,
      background: color + '18',
      border: `1px solid ${color}44`,
      borderRadius: 6, padding: '2px 7px',
      fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      {formatBytes(bytes)}
    </span>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  card: {
    background: 'var(--surface)', borderRadius: 16,
    padding: '16px', marginBottom: 14,
    border: '1px solid var(--border)',
  },
  sectionTitle: {
    fontSize: 11, color: 'var(--dim)', fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12,
  },
  dateInput: {
    background: 'var(--surface2)', border: '1px solid var(--border2)',
    color: '#fff', borderRadius: 10, padding: '10px 12px',
    fontSize: 14, outline: 'none', width: '100%',
    fontFamily: 'inherit', boxSizing: 'border-box',
  },
  presetBtn: (active) => ({
    padding: '7px 14px', borderRadius: 20, border: 'none',
    background: active ? 'var(--primary)' : 'var(--surface2)',
    color: active ? '#000' : 'var(--dim)',
    fontWeight: active ? 700 : 400,
    fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  }),
  tableChip: (checked) => ({
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '7px 12px', borderRadius: 10,
    border: `1px solid ${checked ? 'var(--primary)' : 'var(--border2)'}`,
    background: checked ? 'rgba(255,159,10,0.1)' : 'var(--surface2)',
    color: checked ? 'var(--primary)' : 'var(--dim)',
    fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
    fontWeight: checked ? 700 : 400,
  }),
  progressRow: (isError) => ({
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '7px 0', borderBottom: '1px solid var(--border2)',
    color: isError ? 'var(--danger)' : '#fff',
    fontSize: 13,
  }),
  exportBtn: (color, disabled) => ({
    flex: 1, padding: '14px 8px',
    borderRadius: 12, border: 'none',
    background: disabled ? '#2a2a2a' : color,
    color: disabled ? '#555' : '#000',
    fontWeight: 800, fontSize: 13,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit', opacity: disabled ? 0.6 : 1,
    transition: 'all 0.15s',
  }),
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Backup({ allOrders, notify }) {
  // Date range
  const [fromDate, setFromDate]         = useState(FIRST_OF_MONTH)
  const [toDate, setToDate]             = useState(TODAY)
  const [activePreset, setActivePreset] = useState(1) // เดือนนี้

  // Table selection
  const [selectedTables, setSelectedTables] = useState(
    new Set(TABLE_OPTIONS.filter(t => t.default).map(t => t.key))
  )

  // Options
  const [maskPhones, setMaskPhones] = useState(false)

  // Fetch state
  const [fetching, setFetching]       = useState(false)
  const [progress, setProgress]       = useState([])   // array of { label, count, error }
  const [backupData, setBackupData]   = useState(null)
  const [fetchError, setFetchError]   = useState(null)

  // ── Preset handler ──
  const applyPreset = (idx) => {
    const p = PRESETS[idx]
    setFromDate(p.from || '')
    setToDate(p.to || '')
    setActivePreset(idx)
  }

  // ── Table toggle ──
  const toggleTable = (key) => {
    setSelectedTables(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const selectAll  = () => setSelectedTables(new Set(TABLE_OPTIONS.map(t => t.key)))
  const selectCore = () => setSelectedTables(new Set(TABLE_OPTIONS.filter(t => t.default).map(t => t.key)))

  // ── Fetch ──
  const handleFetch = useCallback(async () => {
    if (fetching) return
    setFetching(true)
    setProgress([])
    setBackupData(null)
    setFetchError(null)

    try {
      const data = await fetchBackupData({
        fromDate:   fromDate || null,
        toDate:     toDate   || null,
        maskPhones,
        tables:     selectedTables.size === TABLE_OPTIONS.length
          ? 'all'
          : [...selectedTables],
        onProgress: (p) => {
          setProgress(prev => {
            const last = prev[prev.length - 1]
            if (last && last.step === p.step && last.count === null) {
              return [...prev.slice(0, -1), p]
            }
            return [...prev, p]
          })
        },
      })
      setBackupData(data)
      notify(`✅ ดึงข้อมูลสำเร็จ — ${Object.values(data.meta.summary).reduce((s, n) => s + n, 0).toLocaleString()} rows`, 'success')
    } catch (err) {
      setFetchError(err.message)
      notify('❌ ดึงข้อมูลไม่สำเร็จ: ' + err.message, 'error')
    }

    setFetching(false)
  }, [fromDate, toDate, maskPhones, selectedTables, fetching, notify])

  // ── Export handlers ──
  const handleExportJSON = () => {
    if (!backupData) return
    exportJSON(backupData)
    notify('📥 ดาวน์โหลด JSON เรียบร้อย')
  }

  const handleExportCSV = () => {
    if (!backupData) return
    const count = exportCSV(backupData)
    notify(`📥 ดาวน์โหลด ${count} ไฟล์ CSV เรียบร้อย`)
  }

  const handleExportTXT = () => {
    if (!backupData) return
    exportTXT(backupData)
    notify('📥 ดาวน์โหลด TXT (NotebookLM) เรียบร้อย')
  }

  const handleExportAll = () => {
    if (!backupData) return
    exportAll(backupData)
    notify('📥 ดาวน์โหลดทุกรูปแบบเรียบร้อย')
  }

  // ── Derived values ──
  const hasData     = !!backupData
  const totalRows   = hasData
    ? Object.values(backupData.meta.summary).reduce((s, n) => s + n, 0)
    : 0
  const hasErrors   = hasData && backupData.meta.errors
  const progressPct = progress.length > 0
    ? Math.round((progress.filter(p => p.count !== null).length / (selectedTables.size || 1)) * 100)
    : 0

  // derive ขนาดไฟล์จาก backupData — ไม่ต้อง useEffect เพราะ compute จาก state โดยตรง
  const fileSizes = estimateSizes(backupData)

  return (
    <div style={{ paddingBottom: 20 }}>

      {/* ── 1. Date Range ── */}
      <div style={S.card}>
        <div style={S.sectionTitle}>📅 ช่วงเวลา</div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {PRESETS.map((p, i) => (
            <button key={i} onClick={() => applyPreset(i)} style={S.presetBtn(activePreset === i)}>
              {p.label}
            </button>
          ))}
        </div>

        {activePreset !== 3 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--dim)', marginBottom: 4 }}>จากวันที่</div>
              <input
                type="date" value={fromDate}
                onChange={e => { setFromDate(e.target.value); setActivePreset(-1) }}
                style={S.dateInput}
              />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--dim)', marginBottom: 4 }}>ถึงวันที่</div>
              <input
                type="date" value={toDate}
                onChange={e => { setToDate(e.target.value); setActivePreset(-1) }}
                style={S.dateInput}
              />
            </div>
          </div>
        )}

        {activePreset === 3 && (
          <div style={{ padding: '10px 14px', background: 'rgba(255,159,10,0.1)', borderRadius: 10, fontSize: 13, color: 'var(--primary)', fontWeight: 700 }}>
            ⚠️ Full dump — ดึงข้อมูลทั้งหมด อาจใช้เวลานาน
          </div>
        )}
      </div>

      {/* ── 2. Table Selection ── */}
      <div style={S.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={S.sectionTitle}>📦 เลือก Data</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={selectCore} style={{ ...S.presetBtn(false), fontSize: 11 }}>Core</button>
            <button onClick={selectAll}  style={{ ...S.presetBtn(false), fontSize: 11 }}>ทั้งหมด</button>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {TABLE_OPTIONS.map(t => (
            <button key={t.key} onClick={() => toggleTable(t.key)} style={S.tableChip(selectedTables.has(t.key))}>
              {selectedTables.has(t.key) ? '✓' : '○'} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 3. Options ── */}
      <div style={S.card}>
        <div style={S.sectionTitle}>⚙️ ตัวเลือก</div>
        <div
          onClick={() => setMaskPhones(p => !p)}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 14px', borderRadius: 12,
            background: maskPhones ? 'rgba(255,159,10,0.1)' : 'var(--surface2)',
            border: `1px solid ${maskPhones ? 'var(--primary)' : 'var(--border2)'}`,
            cursor: 'pointer',
          }}
        >
          <div style={{
            width: 22, height: 22, borderRadius: 6,
            background: maskPhones ? 'var(--primary)' : 'var(--surface)',
            border: `2px solid ${maskPhones ? 'var(--primary)' : 'var(--border2)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            {maskPhones && <span style={{ color: '#000', fontSize: 14, fontWeight: 900 }}>✓</span>}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: maskPhones ? 700 : 400, color: maskPhones ? 'var(--primary)' : '#fff' }}>
              🔒 Mask เบอร์โทร
            </div>
            <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 2 }}>
              081-234-XXXX — แนะนำถ้าจะ upload NotebookLM
            </div>
          </div>
        </div>
      </div>

      {/* ── 4. Fetch Button ── */}
      <button
        onClick={handleFetch}
        disabled={fetching || selectedTables.size === 0}
        style={{
          width: '100%', padding: 16, borderRadius: 14, border: 'none',
          background: fetching ? 'var(--surface2)' : 'linear-gradient(135deg, #FF9F0A, #FF6B0A)',
          color: fetching ? 'var(--dim)' : '#000',
          fontWeight: 800, fontSize: 15, cursor: fetching ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit', marginBottom: 14,
          opacity: selectedTables.size === 0 ? 0.4 : 1,
        }}
      >
        {fetching ? '⏳ กำลังดึงข้อมูล...' : '🚀 ดึงข้อมูล'}
      </button>

      {/* ── 5. Progress ── */}
      {progress.length > 0 && (
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={S.sectionTitle}>ความคืบหน้า</div>
            {fetching && (
              <div style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 700 }}>
                {progressPct}%
              </div>
            )}
          </div>

          {fetching && (
            <div style={{ height: 4, background: 'var(--surface2)', borderRadius: 2, overflow: 'hidden', marginBottom: 12 }}>
              <div style={{
                height: '100%', borderRadius: 2,
                background: 'linear-gradient(90deg, var(--primary), #FF6B0A)',
                width: `${progressPct}%`,
                transition: 'width 0.3s ease',
              }} />
            </div>
          )}

          {progress.map((p, i) => (
            <div key={i} style={S.progressRow(p.error)}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>
                {p.error ? '❌' : p.count !== null ? '✅' : '⏳'}
              </span>
              <span style={{ flex: 1 }}>{p.label}</span>
              {p.count !== null && !p.error && (
                <span style={{ fontSize: 11, color: 'var(--dim)', flexShrink: 0 }}>
                  {p.count.toLocaleString()} rows
                </span>
              )}
            </div>
          ))}

          {/* Summary + size indicator */}
          {hasData && (
            <div style={{
              marginTop: 12, padding: '10px 14px',
              background: hasErrors ? 'rgba(255,69,58,0.08)' : 'rgba(50,215,75,0.08)',
              borderRadius: 10,
              border: `1px solid ${hasErrors ? 'rgba(255,69,58,0.2)' : 'rgba(50,215,75,0.2)'}`,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: hasErrors ? 'var(--danger)' : 'var(--success)' }}>
                {hasErrors ? '⚠️ เสร็จสิ้น (มีบาง table ไม่สำเร็จ)' : '✅ ดึงข้อมูลครบถ้วน'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 4 }}>
                รวม {totalRows.toLocaleString()} rows จาก {Object.keys(backupData.meta.summary).length} tables
              </div>

              {/* ── SIZE INDICATOR ── แสดงหลัง fetch สำเร็จ */}
              {fileSizes && (
                <div style={{
                  marginTop: 10, paddingTop: 10,
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <div style={{ fontSize: 10, color: 'var(--dim)', marginBottom: 6 }}>
                    ขนาดไฟล์ที่จะ download (ประมาณการ)
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {[
                      { label: '📄 JSON',     bytes: fileSizes.json },
                      { label: '📊 CSV',      bytes: fileSizes.csv  },
                      { label: '📝 TXT',      bytes: fileSizes.txt  },
                      { label: '📦 ทั้งหมด',  bytes: fileSizes.all  },
                    ].map(({ label, bytes }) => (
                      <div key={label} style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        background: 'var(--surface2)', borderRadius: 8,
                        padding: '5px 10px',
                      }}>
                        <span style={{ fontSize: 11, color: 'var(--dim)' }}>{label}</span>
                        <SizeTag bytes={bytes} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {hasErrors && (
                <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 8 }}>
                  Error: {Object.entries(backupData.meta.errors).map(([k, v]) => `${k}: ${v}`).join(', ')}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── 6. Export Buttons ── */}
      {hasData && (
        <div style={S.card}>
          <div style={S.sectionTitle}>📥 ดาวน์โหลด</div>

          {/* Main export buttons พร้อม size tag ใต้แต่ละปุ่ม */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
            {[
              { label: 'JSON', icon: '📄', sub: 'restore ได้',   color: '#4D96FF', handler: handleExportJSON, sizeKey: 'json' },
              { label: 'CSV',  icon: '📊', sub: 'Excel / Sheets', color: '#32D74B', handler: handleExportCSV,  sizeKey: 'csv'  },
              { label: 'TXT',  icon: '📝', sub: 'NotebookLM',    color: '#FF9F0A', handler: handleExportTXT,  sizeKey: 'txt'  },
            ].map(({ label, icon, sub, color, handler, sizeKey }) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                <button onClick={handler} style={{ ...S.exportBtn(color, false), width: '100%' }}>
                  <div style={{ fontSize: 18, marginBottom: 4 }}>{icon}</div>
                  <div>{label}</div>
                  <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>{sub}</div>
                </button>
                {fileSizes && <SizeTag bytes={fileSizes[sizeKey]} />}
              </div>
            ))}
          </div>

          {/* Export All */}
          <button
            onClick={handleExportAll}
            style={{
              width: '100%', padding: 14, borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg, #4D96FF, #32D74B)',
              color: '#000', fontWeight: 800, fontSize: 14,
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <span>📦 ดาวน์โหลดทุกรูปแบบ (JSON + CSV + TXT)</span>
            {fileSizes && <SizeTag bytes={fileSizes.all} />}
          </button>

          {/* File info */}
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--dim)', lineHeight: 1.8 }}>
            📄 JSON = 1 ไฟล์ ครบทุก table{'\n'}
            📊 CSV = {Object.keys(backupData.meta.summary).length} ไฟล์ แยกตาม table{'\n'}
            📝 TXT = 4 ไฟล์ สำหรับ upload NotebookLM
            {maskPhones && <span style={{ color: 'var(--primary)' }}> · เบอร์โทรถูก mask แล้ว</span>}
          </div>
        </div>
      )}
    </div>
  )
}
