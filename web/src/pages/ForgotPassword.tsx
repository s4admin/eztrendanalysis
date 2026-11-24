import { useState, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
export default function ForgotPassword() {
  const [email, setEmail] = useState(''); const [sent, setSent] = useState(false)
  const [error, setError] = useState(''); const [loading, setLoading] = useState(false)
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true)
    try { await api.post('/auth/forgot-password', { email }); setSent(true) }
    catch { setError('Something went wrong. Please try again.') }
    finally { setLoading(false) }
  }
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8"><div className="text-4xl mb-3">✈</div><h1 className="text-2xl font-bold text-slate-900">Reset your password</h1></div>
        {sent ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 text-center space-y-3">
            <div className="text-4xl">📧</div>
            <p className="text-slate-700 text-sm">If an account exists for <strong>{email}</strong>, you'll receive a reset link shortly.</p>
            <Link to="/login" className="text-sky-600 hover:underline text-sm block">Back to sign in</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
            {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}
            <p className="text-sm text-slate-500">Enter your email and we'll send you a reset link.</p>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" /></div>
            <button type="submit" disabled={loading} className="w-full bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-medium py-2 rounded-lg text-sm transition-colors">{loading ? 'Sending…' : 'Send reset link'}</button>
            <p className="text-center text-sm text-slate-500"><Link to="/login" className="text-sky-600 hover:underline">Back to sign in</Link></p>
          </form>
        )}
      </div>
    </div>
  )
}
