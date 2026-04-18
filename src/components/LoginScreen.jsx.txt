import { useState } from 'react'
import { supabase } from '../supabase.js'

const BRAND = '#FF9F0A'

export default function LoginScreen({ onLogin }) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const handleLogin = async () => {
    if (!email.trim() || !password) { setError('กรุณากรอกอีเมลและรหัสผ่าน'); return }
    setLoading(true)
    setError('')
    const { data, error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setLoading(false)
    if (err) { setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง'); return }
    onLogin(data.session)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#000',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: '#111', border: '1px solid #222',
        borderRadius: 24, padding: '36px 24px',
        width: '100%', maxWidth: 360,
        display: 'flex', flexDirection: 'column', gap: 20,
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 26, fontWeight: 900, color: BRAND, letterSpacing: 4 }}>KATKAT</div>
          <div style={{ color: '#444', fontSize: 11, letterSpacing: 2, marginTop: 2 }}>Analytics</div>
        </div>

        {/* Email */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={S.label}>อีเมล</label>
          <input
            type="email" inputMode="email"
            placeholder="your@email.com"
            value={email}
            onChange={e => { setEmail(e.target.value); setError('') }}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            style={S.input}
            autoComplete="email"
          />
        </div>

        {/* Password */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={S.label}>รหัสผ่าน</label>
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={e => { setPassword(e.target.value); setError('') }}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            style={S.input}
            autoComplete="current-password"
          />
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: 'rgba(255,69,58,0.1)', border: '1px solid rgba(255,69,58,0.3)',
            borderRadius: 10, padding: '10px 14px',
            color: '#FF453A', fontSize: 13, textAlign: 'center',
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            background: loading ? '#333' : BRAND,
            color: loading ? '#666' : '#000',
            border: 'none', borderRadius: 14, padding: 16,
            fontSize: 15, fontWeight: 800,
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit', transition: 'all 0.2s',
          }}
        >
          {loading ? '⏳ กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
        </button>
      </div>
    </div>
  )
}

const S = {
  label: {
    color: '#666', fontSize: 11, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  input: {
    background: '#1a1a1a', border: '1px solid #2a2a2a',
    borderRadius: 12, padding: '13px 14px',
    color: '#fff', fontSize: 15,
    outline: 'none', fontFamily: 'inherit',
    width: '100%', boxSizing: 'border-box',
  },
}
