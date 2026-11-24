import { useState, FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
export default function Register() {
  const { register } = useAuth(); const navigate = useNavigate()
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('')
  const [error, setError] = useState(''); const [loading, setLoading] = useState(false)
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true)
    try { await register(name, email, password); navigate('/') } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Registration failed') } finally { setLoading(false) }
  }
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8"><div className="text-4xl mb-3">✈</div><h1 className="text-2xl font-bold text-slate-900">Create Account</h1></div>
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}
          <div><label className="block text-sm font-medium text-slate-700 mb-1">Name</label><input value={name} onChange={e => setName(e.target.value)} required className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" /></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1">Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" /></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1">Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={8} required className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" /></div>
          <button type="submit" disabled={loading} className="w-full bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-medium py-2 rounded-lg text-sm transition-colors">{loading ? 'Creating account…' : 'Create account'}</button>
        </form>
        <p className="text-center text-sm text-slate-500 mt-4">Already have an account? <Link to="/login" className="text-sky-600 hover:underline font-medium">Sign in</Link></p>
      </div>
    </div>
  )
}
