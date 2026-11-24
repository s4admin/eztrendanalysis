import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../api/client'

interface Aircraft { id: number; tail_number: string; make_model: string; engine_type: string; engine_serial: string; year: number; notes: string }

function EditRow({ aircraft, onDone }: { aircraft: Aircraft; onDone: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    tail_number: aircraft.tail_number || '',
    make_model: aircraft.make_model || '',
    engine_type: aircraft.engine_type || '',
    engine_serial: aircraft.engine_serial || '',
    year: aircraft.year ? String(aircraft.year) : '',
    notes: aircraft.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const save = async () => {
    setSaving(true)
    try {
      await api.put('/aircraft/' + aircraft.id, { ...form, year: form.year ? Number(form.year) : undefined })
      qc.invalidateQueries({ queryKey: ['aircraft'] })
      onDone()
    } finally { setSaving(false) }
  }
  const fields: [string, string, string][] = [
    ['tail_number', 'Tail', 'text'],
    ['make_model', 'Make / Model', 'text'],
    ['engine_type', 'Engine Type', 'text'],
    ['engine_serial', 'Engine Serial', 'text'],
    ['year', 'Year', 'number'],
  ]
  return (
    <tr className="bg-sky-50">
      <td colSpan={6} className="px-4 py-4">
        <div className="grid grid-cols-5 gap-3 mb-3">
          {fields.map(([key, label, type]) => (
            <div key={key}>
              <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
              <input
                type={type}
                value={(form as Record<string, string>)[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          ))}
        </div>
        <div className="mb-3">
          <label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
          <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
        </div>
        <div className="flex gap-2">
          <button onClick={save} disabled={saving} className="bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-medium px-4 py-1.5 rounded-lg transition-colors">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={onDone} className="text-xs text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100">Cancel</button>
        </div>
      </td>
    </tr>
  )
}

export default function AircraftList() {
  const qc = useQueryClient()
  const { data: aircraft = [], isLoading } = useQuery({ queryKey: ['aircraft'], queryFn: () => api.get<Aircraft[]>('/aircraft') })
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState({ tailNumber: '', makeModel: '', engineType: '', engineSerial: '', year: '', notes: '' })
  const [error, setError] = useState('')

  const addMutation = useMutation({
    mutationFn: () => api.post('/aircraft', { ...form, year: form.year ? Number(form.year) : undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['aircraft'] }); setShowForm(false); setForm({ tailNumber: '', makeModel: '', engineType: '', engineSerial: '', year: '', notes: '' }); setError('') },
    onError: (err: Error) => setError(err.message)
  })
  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete('/aircraft/' + id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['aircraft'] })
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Aircraft</h1>
        <button onClick={() => setShowForm(true)} className="bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">+ Add Aircraft</button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
          <h2 className="font-semibold text-slate-900 mb-4">New Aircraft</h2>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">{error}</div>}
          <div className="grid grid-cols-2 gap-4">
            {([['tailNumber','Tail Number *'],['makeModel','Make/Model'],['engineType','Engine Type'],['engineSerial','Engine Serial'],['year','Year']] as [string,string][]).map(([k,l]) => (
              <div key={k}><label className="block text-sm font-medium text-slate-700 mb-1">{l}</label><input value={(form as Record<string,string>)[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" /></div>
            ))}
            <div className="col-span-2"><label className="block text-sm font-medium text-slate-700 mb-1">Notes</label><textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" /></div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={() => addMutation.mutate()} disabled={addMutation.isPending || !form.tailNumber} className="bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">{addMutation.isPending ? 'Saving…' : 'Save'}</button>
            <button onClick={() => setShowForm(false)} className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-100">Cancel</button>
          </div>
        </div>
      )}

      {isLoading ? <div className="text-slate-400 text-sm">Loading…</div> : aircraft.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center"><p className="text-slate-500">No aircraft yet. Add your first one above.</p></div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>{['Tail','Make/Model','Engine Type','Engine Serial','Year',''].map(h => <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {aircraft.map(a => (
                editingId === a.id
                  ? <EditRow key={a.id} aircraft={a} onDone={() => setEditingId(null)} />
                  : (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-slate-900"><Link to={'/aircraft/'+a.id} className="hover:text-sky-600">{a.tail_number}</Link></td>
                      <td className="px-4 py-3 text-slate-600">{a.make_model || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{a.engine_type || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{a.engine_serial || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{a.year || '—'}</td>
                      <td className="px-4 py-3 text-right space-x-3">
                        <Link to={'/aircraft/'+a.id} className="text-sky-600 hover:underline text-xs">View</Link>
                        <button onClick={() => setEditingId(a.id)} className="text-slate-500 hover:text-slate-700 hover:underline text-xs">Edit</button>
                        <button onClick={() => { if (confirm('Delete this aircraft and all its data?')) deleteMutation.mutate(a.id) }} className="text-red-500 hover:underline text-xs">Delete</button>
                      </td>
                    </tr>
                  )
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
