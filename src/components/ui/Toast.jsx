import { useState, useCallback, useEffect } from 'react'

export function useToast() {
  const [toast, setToast] = useState(null)

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 2800)
  }, [])

  return { toast, showToast }
}

export function Toast({ toast }) {
  if (!toast) return null
  return (
    <div style={{
      position: 'fixed', bottom: 'calc(80px + env(safe-area-inset-bottom))',
      left: '50%', transform: 'translateX(-50%)',
      background: toast.type === 'error' ? '#FF453A' : '#1e1e1e',
      color: '#fff', padding: '12px 20px', borderRadius: 14,
      boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
      zIndex: 9999, display: 'flex', alignItems: 'center', gap: 8,
      fontWeight: 'bold', fontSize: 14, whiteSpace: 'nowrap',
      border: toast.type === 'error' ? 'none' : '1px solid #333',
      animation: 'fadeIn 0.2s ease',
    }}>
      {toast.type === 'error' ? '❌' : '✅'} {toast.message}
    </div>
  )
}
