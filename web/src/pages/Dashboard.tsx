import { useState, useRef, DragEvent, ChangeEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'

interface Aircraft { id: number; tail_number: string; make_model: string; engine_type: string; engine_serial: string; year: number }
interface InboundAddress { address: string; enabled: boolean }
interface UploadResult { uploadId: number; aircraftId: number; tailNumber: string; cruiseRecords: number; engineSeconds: number; navSeconds: number; exceedances: number; filename: string }

export default function Dashboard() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { data: aircraft = [], isLoading } = useQuery({ queryKey: ['aircraft'], queryFn: () => api.get<Aircraft[]>('/aircraft') })
  const { data: inbound } = useQuery({ queryKey: ['inbound-address'], queryFn: () => api.get<InboundAddress>('/inbound/address') })

  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [uploadProgress, setUploadProgress] = useState<string>('')

  const doUploadFiles = async (rawFiles: FileList | File[]) => {
    const files = Array.from(rawFiles)
    if (!files.length) return
    setUploading(true); setUploadError(''); setUploadResult(null); setUploadProgress('')

    // Process stable_cruise last so aircraft exists from the other files first
    const sorted = [
      ...files.filter(f => !f.name.toLowerCase().includes('stable_cruise')),
      ...files.filter(f => f.name.toLowerCase().includes('stable_cruise')),
    ]

    let lastResult: UploadResult | null = null
    let resolvedAircraftId: number | null = null
    try {
      for (let i = 0; i < sorted.length; i++) {
        const file = sorted[i]
        setUploadProgress(`Uploading ${file.name} (${i + 1}/${sorted.length})…`)
        const fd = new FormData()
        fd.append('file', file)
        // After the first upload resolves the aircraft, pass it explicitly for the rest
        if (resolvedAircraftId) fd.append('aircraftId', String(resolvedAircraftId))
        lastResult = await api.uploadFile<UploadResult>('/uploads', fd)
        if (!resolvedAircraftId && lastResult.aircraftId) resolvedAircraftId = lastResult.aircraftId
      }
      if (lastResult) {
        setUploadResult(lastResult)
        qc.invalidateQueries({ queryKey: ['aircraft'] })
        qc.invalidateQueries({ queryKey: ['records', lastResult.aircraftId] })
        qc.invalidateQueries({ queryKey: ['trend', lastResult.aircraftId] })
        qc.invalidateQueries({ queryKey: ['exceedances', lastResult.aircraftId] })
      }
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false); setUploadProgress('')
    }
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setDragging(false)
    if (e.dataTransfer.files.length) doUploadFiles(e.dataTransfer.files)
  }
  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) doUploadFiles(e.target.files)
    e.target.value = ''
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <div className="text-4xl mb-3">✈</div>
        <h1 className="text-2xl font-bold text-slate-900">Engine Trend Analysis</h1>
        <p className="text-slate-500 text-sm mt-1">Drop your ACMS data — aircraft detected automatically from the file</p>
      </div>

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !uploading && fileRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${dragging ? 'border-sky-400 bg-sky-50 scale-[1.01]' : 'border-slate-200 hover:border-sky-300 hover:bg-slate-50'} ${uploading ? 'pointer-events-none opacity-60' : ''}`}
      >
        <div className="text-5xl mb-4">{uploading ? '⏳' : '📁'}</div>
        <div className="text-base font-semibold text-slate-700 mb-1">
          {uploadProgress || (uploading ? 'Analyzing ACMS data…' : 'Drop ACMS files here')}
        </div>
        <div className="text-sm text-slate-400">
          {uploading
            ? 'Processing files sequentially…'
            : 'Drop all 4 TXT files at once, or the ZIP — aircraft detected automatically'}
        </div>
        {inbound?.enabled && !uploading && (
          <div className="mt-2 text-xs text-slate-400">
            Or email the files, including the FHDB ZIP, to <span className="font-medium text-slate-600 break-all">{inbound.address}</span>
          </div>
        )}
        <div className="mt-4 text-xs text-slate-400">or <span className="text-sky-600 font-medium">click to browse</span></div>
      </div>
      <input ref={fileRef} type="file" accept=".zip,.txt" multiple onChange={onFileChange} className="hidden" />

      <EmailImportCard />

      {uploadError && (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-4">{uploadError}</div>
      )}

      {uploadResult && (
        <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold text-emerald-800">✓ Upload complete — <span className="font-bold">{uploadResult.tailNumber}</span></div>
            <Link to={`/aircraft/${uploadResult.aircraftId}`} className="text-sm text-sky-600 hover:underline font-medium">View analysis →</Link>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-emerald-600">
            {uploadResult.cruiseRecords > 0 && <span className="bg-emerald-100 px-2 py-0.5 rounded-full">{uploadResult.cruiseRecords} cruise snapshots</span>}
            {uploadResult.engineSeconds > 0 && <span className="bg-emerald-100 px-2 py-0.5 rounded-full">{uploadResult.engineSeconds.toLocaleString()} engine records</span>}
            {uploadResult.navSeconds > 0 && <span className="bg-emerald-100 px-2 py-0.5 rounded-full">{uploadResult.navSeconds.toLocaleString()} nav points</span>}
            {uploadResult.exceedances > 0 && <span className="bg-red-100 text-red-600 font-semibold px-2 py-0.5 rounded-full">⚠ {uploadResult.exceedances} exceedance{uploadResult.exceedances > 1 ? 's' : ''}</span>}
          </div>
          <button
            onClick={() => navigate(`/aircraft/${uploadResult.aircraftId}`)}
            className="mt-3 w-full bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
          >
            Open Analysis
          </button>
        </div>
      )}

      {!isLoading && aircraft.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-900">Your Aircraft</h2>
            <Link to="/aircraft" className="text-xs text-slate-400 hover:text-slate-600">Manage →</Link>
          </div>
          <div className="space-y-2">
            {aircraft.map(a => <AircraftRow key={a.id} aircraft={a} />)}
          </div>
        </div>
      )}
    </div>
  )
}

function EmailImportCard() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['inbound-address'], queryFn: () => api.get<InboundAddress>('/inbound/address') })
  const [copied, setCopied] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  if (!data?.enabled) return null

  const copy = async () => {
    await navigator.clipboard.writeText(data.address)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }
  const regenerate = async () => {
    if (!confirm('Generate a new import address? The current address will stop working.')) return
    setRegenerating(true)
    try { qc.setQueryData(['inbound-address'], await api.post('/inbound/address/regenerate', {})) }
    finally { setRegenerating(false) }
  }

  return (
    <div className="mt-4 bg-white border border-slate-200 rounded-xl p-4">
      <div className="text-sm font-semibold text-slate-700 mb-1">📧 Import by email</div>
      <p className="text-xs text-slate-500 mb-3">Email the ACMS ZIP or TXT files, and the FHDB ZIP, as attachments to this address. They're imported automatically and you'll get a summary by email.</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 min-w-0 truncate bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700">{data.address}</code>
        <button onClick={copy} className="shrink-0 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors">{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <button onClick={regenerate} disabled={regenerating} className="mt-2 text-xs text-slate-400 hover:text-slate-600 disabled:opacity-50">Generate new address</button>
    </div>
  )
}

function AircraftRow({ aircraft }: { aircraft: Aircraft }) {
  const { data: trend } = useQuery({
    queryKey: ['trend', aircraft.id],
    queryFn: () => api.get<{ status: string }>('/aircraft/' + aircraft.id + '/trend')
  })
  const status = trend?.status
  return (
    <Link to={`/aircraft/${aircraft.id}`} className="flex items-center justify-between bg-white rounded-xl border border-slate-200 px-4 py-3 hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-3">
        <span className="text-lg">✈</span>
        <div>
          <div className="font-semibold text-slate-900">{aircraft.tail_number}</div>
          <div className="text-xs text-slate-400">{aircraft.make_model || aircraft.engine_type || (aircraft.engine_serial ? `Engine: ${aircraft.engine_serial}` : 'No details yet')}</div>
        </div>
      </div>
      {status && (
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${status === 'NORMAL' ? 'bg-emerald-100 text-emerald-700' : status === 'ANOMALY' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}`}>
          {status}
        </span>
      )}
    </Link>
  )
}
