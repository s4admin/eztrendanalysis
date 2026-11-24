import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
interface AdminUser { id: number; name: string; email: string; created_at: string; last_login_at: string | null; flight_count: number; aircraft_count: number; upload_count: number }
const fmt = (s: string | null) => s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Never'
const fmtDt = (s: string | null) => s ? new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Never'
export default function Admin() {
  const { user } = useAuth(); const qc = useQueryClient(); const [search, setSearch] = useState('')
  const { data: users = [], isLoading, error } = useQuery({ queryKey: ['admin-users'], queryFn: () => api.get<AdminUser[]>('/admin/users') })
  const del = useMutation({ mutationFn: (id: number) => api.delete('/admin/users/' + id), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }) })
  if ((error as {status?: number})?.status === 403) return <div className="text-center py-20 text-slate-400">Access denied.</div>
  const filtered = users.filter(u => !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()))
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold text-slate-900">Admin</h1><p className="text-slate-400 text-sm">{users.length} registered users</p></div>
        <input className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 w-56" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      {isLoading ? <div className="text-slate-400 text-sm">Loading…</div> : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>{['User','Signed Up','Last Login','Aircraft','Uploads','Flights',''].map(h => <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(u => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3"><div className="font-medium text-slate-900">{u.name}</div><div className="text-xs text-slate-400">{u.email}</div></td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmt(u.created_at)}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDt(u.last_login_at)}</td>
                  <td className="px-4 py-3 text-slate-700">{u.aircraft_count}</td>
                  <td className="px-4 py-3 text-slate-700">{u.upload_count}</td>
                  <td className="px-4 py-3 text-slate-700">{u.flight_count}</td>
                  <td className="px-4 py-3 text-right">{u.email !== user?.email && <button onClick={() => { if (confirm('Delete ' + u.name + '?')) del.mutate(u.id) }} className="text-xs text-red-400 hover:text-red-600">Delete</button>}</td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-sm">No users found.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
