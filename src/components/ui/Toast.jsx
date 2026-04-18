import { useState, useCallback } from 'react'

// ── useNotify: รวม toast + confirm ในที่เดียว ────────────────────────────────
export function useNotify() {
  const [toast, setToast]     = useState(null)
  const [dialog, setDialog]   = useState(null) // { message, resolve }

  // toast — แสดงแล้วหายเอง
  const notify = useCallback((message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  // confirm — return Promise<boolean>
  const confirm = useCallback((message) => {
    return new Promise((resolve) => {
      setDialog({ message, resolve })
    })
  }, [])

  const handleConfirm = (result) => {
    dialog?.resolve(result)
    setDialog(null)
  }

  return { toast, dialog, notify, confirm, handleConfirm }
}

// ── Toast component ───────────────────────────────────────────────────────────
export function Toast({ toast }) {
  if (!toast) return null

  const icon = {
    success: '✅',
    error:   '❌',
    warning: '⚠️',
    info:    'ℹ️',
  }[toast.type] || '✅'

  const bg = {
    success: '#1e1e1e',
    error:   '#FF453A',
    warning: '#FF9F0A',
    info:    '#0A84FF',
  }[toast.type] || '#1e1e1e'

  return (
    <div style={{
      position: 'fixed',
      bottom: 'calc(88px + env(safe-area-inset-bottom))',
      left: '50%', transform: 'translateX(-50%)',
      background: bg, color: toast.type === 'warning' ? '#000' : '#fff',
      padding: '12px 20px', borderRadius: 14,
      boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
      zIndex: 9999, display: 'flex', alignItems: 'center', gap: 8,
      fontWeight: 600, fontSize: 14,
      border: toast.type === 'success' ? '1px solid #333' : 'none',
      animation: 'fadeIn 0.2s ease',
      maxWidth: 'calc(100vw - 40px)',
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    }}>
      {icon} {toast.message}
    </div>
  )
}

// ── ConfirmDialog component ───────────────────────────────────────────────────
export function ConfirmDialog({ dialog, onConfirm }) {
  if (!dialog) return null
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: '#1a1a1a', border: '1px solid var(--border2)',
        borderRadius: 20, padding: '24px 20px',
        width: '100%', maxWidth: 320, textAlign: 'center',
        animation: 'fadeIn 0.15s ease',
      }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🗑️</div>
        <div style={{ fontSize: 15, color: '#fff', lineHeight: 1.5, marginBottom: 20 }}>
          {dialog.message}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => onConfirm(false)}
            style={{
              flex: 1, padding: '12px', borderRadius: 12,
              border: '1px solid var(--border2)', background: 'transparent',
              color: 'var(--dim)', fontFamily: 'inherit', fontSize: 14, cursor: 'pointer',
            }}
          >
            ยกเลิก
          </button>
          <button
            onClick={() => onConfirm(true)}
            style={{
              flex: 1, padding: '12px', borderRadius: 12,
              border: 'none', background: '#FF453A',
              color: '#fff', fontFamily: 'inherit', fontSize: 14,
              fontWeight: 700, cursor: 'pointer',
            }}
          >
            ยืนยัน
          </button>
        </div>
      </div>
    </div>
  )
}

// ── backward compat: useToast ─────────────────────────────────────────────────
export function useToast() {
  const { toast, notify } = useNotify()
  return { toast, showToast: notify }
}
