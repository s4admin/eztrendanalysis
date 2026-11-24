import { useState, FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
export default function ResetPassword() {
  const [params] = useSearchParams(); const token = params.get('token') ?? ''
  const navigate = useNavigate()
  const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(''); const [loading, setLoading] = useState(false)
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setError(''); setLoading(true)
    try { await api.post('/auth/reset-password', { token, password }); navigate('/login?reset=1') }
    catch (err: unknown) { setError(err instanceof Error ? err.message : 'Invalid or expired link.') }
    finally { setLoading(false) }
  }
  if (!token) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="text-center space-y-2"><p className="text-slate-600">Invalid reset link.</p>
        <Link to="/forgot-password" className="text-sky-600 hover:underline text-sm">Request a new one</Link></div>
    </div>
  )
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8"><div className="text-4xl mb-3">✈</div><h1 className="text-2xl font-bold text-slate-900">Choose a new password</h1></div>
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}
          <div><label className="block text-sm font-medium text-slate-700 mb-1">New password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={8} required className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" /></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1">Confirm password</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" /></div>
          <button type="submit" disabled={loading} className="w-full bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-medium py-2 rounded-lg text-sm transition-colors">{loading ? 'Saving…' : 'Set new password'}</button>
        </form>
      </div>
    </div>
  )
}
