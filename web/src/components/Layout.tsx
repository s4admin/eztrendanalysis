import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const loc = useLocation()
  const handleLogout = () => { logout(); navigate('/login') }
  if (!user) return <div className="min-h-screen bg-slate-50"><Outlet /></div>
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-8">
          <Link to="/" className="text-lg font-bold text-sky-700 tracking-tight">✈ EZ Trend Analysis</Link>
          <nav className="flex gap-4">
            <Link to="/dashboard" className={"text-sm font-medium px-3 py-1.5 rounded-lg " + (loc.pathname === '/dashboard' ? 'bg-sky-50 text-sky-700' : 'text-slate-600 hover:text-slate-900')}>Dashboard</Link>
            <Link to="/aircraft" className={"text-sm font-medium px-3 py-1.5 rounded-lg " + (loc.pathname.startsWith('/aircraft') ? 'bg-sky-50 text-sky-700' : 'text-slate-600 hover:text-slate-900')}>Aircraft</Link>
            {user.email === 'adam@pilotica.com' && <Link to="/admin" className={"text-sm font-medium px-3 py-1.5 rounded-lg " + (loc.pathname.startsWith('/admin') ? 'bg-sky-50 text-sky-700' : 'text-slate-600 hover:text-slate-900')}>Admin</Link>}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">{user.name}</span>
          <button onClick={handleLogout} className="text-sm text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100">Sign out</button>
        </div>
      </header>
      <main className="flex-1 px-6 py-8 max-w-7xl mx-auto w-full"><Outlet /></main>
    </div>
  )
}
