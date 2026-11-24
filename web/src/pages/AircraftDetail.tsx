import { useState, useRef, DragEvent, ChangeEvent } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer
} from 'recharts'
import { api } from '../api/client'
import { useSortable, SortTh, SortGetters } from '../components/SortableTable'

interface Aircraft { id: number; tail_number: string; make_model: string; engine_type: string; engine_serial: string; year: number }
interface CruiseRecord { id: number; flight_date: string; flight_time: string | null; altitude: number; oat: number; tas: number; torque: number; np: number; ng: number; itt: number; fuel_flow: number; corrected_itt: number; corrected_ff: number }
interface EngineSecond { flight_date: string; flight_time: string; altitude: number; ias: number; tas: number; itt: number; ng: number; torque: number; fuel_flow: number }
interface NavPoint { flight_date: string; flight_time: string; lat: number; lon: number; altitude: number; tas: number; ias: number; oat: number }
interface Exceedance { id: number; flight_date: string; flight_time: string; parameter: string; value: number; limit_value: number; duration_seconds: number }
interface TrendParam { slope: number; mean: number; stdDev: number; trending: string; anomalyIndices: number[]; rSquared: number; isAnomaly: boolean }
interface TrendData { status: string; parameters: Record<string, TrendParam> }
interface Upload { id: number; filename: string; record_count: number; engine_seconds_count: number; nav_seconds_count: number; uploaded_at: string; engine_id: string }
interface UploadResult { uploadId: number; aircraftId: number; tailNumber: string; cruiseRecords: number; engineSeconds: number; navSeconds: number; exceedances: number; filename: string }
interface FaultSummaryItem { system_id: number; fault_code: number; total_events: number; active_events: number; first_seen: string; last_seen: string; system_name: string | null; description: string | null }
interface FaultSummaryData { summary: FaultSummaryItem[]; recent: unknown[]; legs: unknown[] }

const UPLOAD_SORT: SortGetters<Upload> = {
  file: u => u.filename.split('/').pop(), engine: u => u.engine_id, cruise: u => u.record_count,
  engSec: u => u.engine_seconds_count, nav: u => u.nav_seconds_count, uploaded: u => u.uploaded_at,
}
const CRUISE_SORT: SortGetters<CruiseRecord> = {
  date: r => [String(r.flight_date).slice(0, 10), r.flight_time], time: r => r.flight_time,
  altitude: r => r.altitude, oat: r => r.oat, tas: r => r.tas, torque: r => r.torque, np: r => r.np, ng: r => r.ng,
  itt: r => r.itt, ff: r => r.fuel_flow, citt: r => r.corrected_itt, cff: r => r.corrected_ff,
}
const CRUISE_COLUMNS = [
  ['Date', 'date'], ['Time', 'time'], ['Alt ft', 'altitude'], ['OAT °C', 'oat'], ['TAS kts', 'tas'], ['TRQ %', 'torque'],
  ['Np', 'np'], ['Ng %', 'ng'], ['ITT °C', 'itt'], ['FF lbs/hr', 'ff'], ['C.ITT', 'citt'], ['C.FF', 'cff'],
]
const FAULT_SORT: SortGetters<FaultSummaryItem> = {
  sys: f => [f.system_id, f.fault_code], code: f => [f.fault_code, f.system_id], system: f => f.system_name,
  description: f => f.description, events: f => f.total_events, active: f => f.active_events,
  first: f => f.first_seen, last: f => f.last_seen,
}
const GFORCE_SORT: SortGetters<Exceedance> = {
  date: e => [String(e.flight_date).slice(0, 10), e.flight_time], time: e => e.flight_time, peak: e => e.value, limit: e => e.limit_value,
}

function linReg(vals: number[]) {
  const n = vals.length; if (n < 2) return { slope: 0, intercept: vals[0] ?? 0 }
  const sumX = vals.map((_, i) => i).reduce((a, b) => a + b, 0)
  const sumY = vals.reduce((a, b) => a + b, 0)
  const sumXY = vals.map((v, i) => i * v).reduce((a, b) => a + b, 0)
  const sumXX = vals.map((_, i) => i * i).reduce((a, b) => a + b, 0)
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
  return { slope, intercept: (sumY - slope * sumX) / n }
}

function TrendChart({ records, param, label, unit, limitValue, color }: {
  records: CruiseRecord[]; param: keyof CruiseRecord; label: string; unit: string; limitValue?: number; color: string
}) {
  const data = records.map((r, i) => ({ i, value: parseFloat(String(r[param])), date: r.flight_date }))
  if (data.length < 2) return <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-center text-slate-400 text-sm h-44">Not enough data</div>
  const vals = data.map(d => d.value)
  const { slope, intercept } = linReg(vals)
  const chartData = data.map(d => ({ ...d, trend: parseFloat((slope * d.i + intercept).toFixed(2)) }))
  const minY = Math.min(...vals) - 5; const maxY = Math.max(...vals, limitValue ?? 0) + 10
  const dir = Math.abs(slope * (vals.length - 1)) > 2 ? (slope > 0 ? '↗' : '↘') : '→'
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold text-slate-900 text-sm">{label}</div>
        <div className="text-xs text-slate-400 font-mono">{dir} {slope >= 0 ? '+' : ''}{slope.toFixed(2)} {unit}/snapshot</div>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} />
          <YAxis domain={[minY, maxY]} tick={{ fontSize: 10 }} tickLine={false} width={42} />
          <Tooltip formatter={(v: number) => [v.toFixed(1) + ' ' + unit, '']} />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={{ r: 4, fill: color }} name={label} />
          <Line type="monotone" dataKey="trend" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="6 3" dot={false} name="Trend" />
          {limitValue && <ReferenceLine y={limitValue} stroke="#f59e0b" strokeDasharray="4 2" label={{ value: 'LIMIT', position: 'insideTopRight', fontSize: 9, fill: '#f59e0b' }} />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function FlightProfileChart({ data, xKey, yKey, xLabel, yLabel, color, limitValue, extraLimits }: {
  data: Record<string, unknown>[]; xKey: string; yKey: string; xLabel: string; yLabel: string; color: string; limitValue?: number; extraLimits?: { value: number; label: string; color: string }[]
}) {
  if (!data.length) return null
  return (
    <div>
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{yLabel} vs {xLabel}</div>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey={xKey} tick={{ fontSize: 9 }} tickLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 9 }} tickLine={false} width={42} />
          <Tooltip />
          <Line type="monotone" dataKey={yKey} stroke={color} strokeWidth={1.5} dot={false} />
          {limitValue && <ReferenceLine y={limitValue} stroke="#f59e0b" strokeDasharray="3 2" label={{ value: String(limitValue), position: 'insideTopRight', fontSize: 9, fill: '#f59e0b' }} />}
          {extraLimits?.map(l => <ReferenceLine key={l.value} y={l.value} stroke={l.color} strokeDasharray="2 2" label={{ value: l.label, position: 'insideTopRight', fontSize: 9, fill: l.color }} />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function FlightTrackMap({ navPoints }: { navPoints: NavPoint[] }) {
  if (navPoints.length < 2) return null
  const lats = navPoints.map(p => p.lat); const lons = navPoints.map(p => p.lon)
  const minLat = Math.min(...lats); const maxLat = Math.max(...lats)
  const minLon = Math.min(...lons); const maxLon = Math.max(...lons)
  const W = 500, H = 300, PAD = 20
  const scaleX = (lon: number) => PAD + ((lon - minLon) / (maxLon - minLon || 1)) * (W - 2 * PAD)
  const scaleY = (lat: number) => H - PAD - ((lat - minLat) / (maxLat - minLat || 1)) * (H - 2 * PAD)
  const pathD = navPoints.map((p, i) => (i === 0 ? 'M' : 'L') + scaleX(p.lon).toFixed(1) + ',' + scaleY(p.lat).toFixed(1)).join(' ')
  const start = navPoints[0]; const end = navPoints[navPoints.length - 1]
  return (
    <div className="bg-slate-900 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Flight Track</div>
        <div className="text-xs text-slate-500">{navPoints.length} points</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg bg-slate-800">
        <path d={pathD} fill="none" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx={scaleX(start.lon)} cy={scaleY(start.lat)} r={5} fill="#22c55e" />
        <circle cx={scaleX(end.lon)} cy={scaleY(end.lat)} r={5} fill="#ef4444" />
        <text x={scaleX(start.lon) + 8} y={scaleY(start.lat) + 4} fill="#22c55e" fontSize="10">Start</text>
        <text x={scaleX(end.lon) + 8} y={scaleY(end.lat) + 4} fill="#ef4444" fontSize="10">End</text>
      </svg>
      <div className="flex justify-between mt-2 text-xs text-slate-500">
        <span>Max alt: {Math.max(...navPoints.map(p => p.altitude ?? 0)).toLocaleString()} ft</span>
        <span>Max TAS: {Math.max(...navPoints.map(p => p.tas ?? 0)).toFixed(0)} kts</span>
      </div>
    </div>
  )
}

function FhdbUpload({ aircraftId, onComplete }: { aircraftId: number; onComplete: () => void }) {
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState('')
  const ref = useRef<HTMLInputElement>(null)

  const doUpload = async (file: File) => {
    setUploading(true); setMsg('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('aircraftId', String(aircraftId))
      const r = await api.uploadFile<{ legs: number; faults: number }>('/faults/upload', fd)
      setMsg(`✓ ${r.legs} legs · ${r.faults.toLocaleString()} fault events loaded`)
      onComplete()
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : 'Upload failed')
    } finally { setUploading(false) }
  }

  return (
    <div className="flex items-center gap-3">
      {msg && <span className={`text-xs ${msg.startsWith('✓') ? 'text-emerald-600' : 'text-red-600'}`}>{msg}</span>}
      <button
        onClick={() => ref.current?.click()}
        disabled={uploading}
        className="text-xs bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 font-medium px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
      >
        {uploading ? 'Uploading…' : '↑ Upload FHDB ZIP'}
      </button>
      <input ref={ref} type="file" accept=".zip" onChange={e => { const f = e.target.files?.[0]; if (f) doUpload(f); e.target.value = '' }} className="hidden" />
    </div>
  )
}

export default function AircraftDetail() {
  const { id } = useParams<{ id: string }>()
  const aircraftId = Number(id)
  const qc = useQueryClient()
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [uploadSuccess, setUploadSuccess] = useState<UploadResult | null>(null)
  const [selectedUpload, setSelectedUpload] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: aircraft } = useQuery({ queryKey: ['aircraft', aircraftId], queryFn: () => api.get<Aircraft>('/aircraft/' + aircraftId) })
  const { data: records = [] } = useQuery({ queryKey: ['records', aircraftId], queryFn: () => api.get<CruiseRecord[]>('/aircraft/' + aircraftId + '/records') })
  const { data: trend } = useQuery({ queryKey: ['trend', aircraftId], queryFn: () => api.get<TrendData>('/aircraft/' + aircraftId + '/trend') })
  const { data: uploads = [] } = useQuery({ queryKey: ['uploads', aircraftId], queryFn: () => api.get<Upload[]>('/aircraft/' + aircraftId + '/uploads') })
  const { data: exceedances = [] } = useQuery({ queryKey: ['exceedances', aircraftId], queryFn: () => api.get<Exceedance[]>('/aircraft/' + aircraftId + '/exceedances') })
  const { data: faultData } = useQuery({
    queryKey: ['faults', aircraftId],
    queryFn: () => api.get<FaultSummaryData>('/faults/aircraft/' + aircraftId + '/summary')
  })

  // Per-upload detailed data
  const activeUpload = selectedUpload ?? uploads[0]?.id
  const { data: engineSeconds = [] } = useQuery({
    queryKey: ['engine-seconds', activeUpload],
    queryFn: () => api.get<EngineSecond[]>('/uploads/' + activeUpload + '/engine-seconds?sample=15'),
    enabled: !!activeUpload
  })
  const { data: navTrack = [] } = useQuery({
    queryKey: ['nav-track', activeUpload],
    queryFn: () => api.get<NavPoint[]>('/uploads/' + activeUpload + '/nav-track?sample=5'),
    enabled: !!activeUpload
  })

  const [uploadProgress, setUploadProgress] = useState('')

  const doUploadFiles = async (rawFiles: FileList | File[]) => {
    const files = Array.from(rawFiles)
    if (!files.length) return
    setUploading(true); setUploadError(''); setUploadSuccess(null); setUploadProgress('')
    const sorted = [
      ...files.filter(f => !f.name.toLowerCase().includes('stable_cruise')),
      ...files.filter(f => f.name.toLowerCase().includes('stable_cruise')),
    ]
    let lastResult: UploadResult | null = null
    let resolvedAircraftId: number = aircraftId
    try {
      for (let i = 0; i < sorted.length; i++) {
        const file = sorted[i]
        setUploadProgress(`${file.name} (${i + 1}/${sorted.length})`)
        const fd = new FormData()
        fd.append('file', file)
        fd.append('aircraftId', String(resolvedAircraftId))
        lastResult = await api.uploadFile<UploadResult>('/uploads', fd)
        if (lastResult.aircraftId) resolvedAircraftId = lastResult.aircraftId
      }
      if (lastResult) {
        setUploadSuccess(lastResult)
        qc.invalidateQueries({ queryKey: ['records', aircraftId] })
        qc.invalidateQueries({ queryKey: ['trend', aircraftId] })
        qc.invalidateQueries({ queryKey: ['uploads', aircraftId] })
        qc.invalidateQueries({ queryKey: ['exceedances', aircraftId] })
      }
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally { setUploading(false); setUploadProgress('') }
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setDragging(false)
    if (e.dataTransfer.files.length) doUploadFiles(e.dataTransfer.files)
  }
  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) doUploadFiles(e.target.files)
    e.target.value = ''
  }

  const uploadTable = useSortable(uploads, UPLOAD_SORT, { key: 'uploaded', dir: 'desc' })
  const cruiseTable = useSortable(records, CRUISE_SORT, { key: 'date', dir: 'desc' })
  const faultTable = useSortable(faultData?.summary ?? [], FAULT_SORT, { key: 'sys', dir: 'asc' })
  const gForceTable = useSortable(exceedances.filter(e => e.parameter === 'G-Force'), GFORCE_SORT, { key: 'date', dir: 'desc' })

  if (!aircraft) return <div className="text-slate-400 text-sm">Loading…</div>

  // Prepare engine seconds data for charts
  const engTime = engineSeconds.map(r => ({ t: r.flight_time?.slice(0, 5) ?? '', ...r }))

  // Separate g-force events from engine parameter exceedances
  const engineExceedances = exceedances.filter(e => e.parameter !== 'G-Force')
  const gForceExceedances = exceedances.filter(e => e.parameter === 'G-Force')

  // Summary panel stats
  const engineId = uploads[0]?.engine_id || aircraft.engine_serial || '—'
  const dateMin = records.length ? String(records[0].flight_date).slice(0, 10) : null
  const dateMax = records.length ? String(records[records.length - 1].flight_date).slice(0, 10) : null
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const latest = records[records.length - 1]
  const tp = trend?.parameters ?? {}

  return (
    <div className="space-y-6">
      {/* ── Dark instrument panel header ── */}
      <div className="rounded-xl overflow-hidden" style={{ background: '#0d1117', border: '1px solid #1e2a3a' }}>
        <div className="flex items-center gap-8 px-6 py-4 flex-wrap">
          <div style={{ fontFamily: 'monospace', fontSize: 28, fontWeight: 800, color: '#00e5c8', letterSpacing: 2 }}>{aircraft.tail_number}</div>
          <div className="flex gap-6 flex-wrap text-xs" style={{ fontFamily: 'monospace' }}>
            {[
              ['ENGINE ID', engineId],
              ['FLIGHT HOURS', uploads[0] ? '—' : '—'],
              ['DATE RANGE', dateMin && dateMax ? `${fmtDate(dateMin)} – ${fmtDate(dateMax)}` : '—'],
              ['SNAPSHOTS', records.length ? `${records.length} pts` : '—'],
            ].map(([label, val]) => (
              <div key={label}>
                <div style={{ color: '#4a6070', letterSpacing: '0.1em', marginBottom: 2 }}>{label}</div>
                <div style={{ color: '#c8d8e8', fontWeight: 600 }}>{val}</div>
              </div>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-3">
            {trend?.status === 'NORMAL' && (
              <div style={{ border: '1.5px solid #00c87a', color: '#00c87a', borderRadius: 8, padding: '6px 16px', fontFamily: 'monospace', fontWeight: 700, fontSize: 13, letterSpacing: '0.12em', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#00c87a', display: 'inline-block', boxShadow: '0 0 6px #00c87a' }} />
                TREND NORMAL
              </div>
            )}
            {trend?.status === 'ANOMALY' && (
              <div style={{ border: '1.5px solid #ff4444', color: '#ff4444', borderRadius: 8, padding: '6px 16px', fontFamily: 'monospace', fontWeight: 700, fontSize: 13, letterSpacing: '0.12em', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff4444', display: 'inline-block' }} />
                TREND ANOMALY
              </div>
            )}
            <Link to={`/aircraft/${aircraftId}/flights`} className="text-xs text-sky-400 hover:text-sky-300 font-medium border border-sky-700 px-3 py-1.5 rounded-lg" style={{fontFamily:'monospace',letterSpacing:'0.08em'}}>✈ FLIGHT LOG</Link>
          </div>
        </div>

        {/* ── Parameter summary cards ── */}
        {latest && (
          <div style={{ borderTop: '1px solid #1e2a3a' }}>
            <div style={{ padding: '8px 24px 4px', fontFamily: 'monospace', fontSize: 11, color: '#4a6070', letterSpacing: '0.12em' }}>PARAMETER SUMMARY</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: '#1e2a3a' }}>
              {([
                { key: 'itt', label: 'ITT', val: latest.itt, unit: '°C', limitVal: 820, limitLabel: '820 °C', tpKey: 'itt' },
                { key: 'ng', label: 'NG', val: latest.ng, unit: '%', limitVal: 104, limitLabel: '104 %', tpKey: 'ng' },
                { key: 'torque', label: 'TORQUE', val: latest.torque, unit: '%', limitVal: null, limitLabel: null, tpKey: 'torque' },
                { key: 'fuel_flow', label: 'FUEL FLOW', val: latest.fuel_flow, unit: 'lbs/hr', limitVal: null, limitLabel: null, tpKey: 'fuel_flow' },
              ] as { key: string; label: string; val: number; unit: string; limitVal: number | null; limitLabel: string | null; tpKey: string }[]).map(card => {
                const p = tp[card.tpKey]
                const vals = records.map(r => parseFloat(String((r as unknown as Record<string, unknown>)[card.key])))
                const minV = Math.min(...vals), maxV = Math.max(...vals)
                const pct = card.limitVal ? Math.min(100, (card.val / card.limitVal) * 100) : null
                const slope = p?.slope ?? 0
                const slopeStr = (slope >= 0 ? '+' : '') + slope.toFixed(2)
                return (
                  <div key={card.key} style={{ background: '#0d1117', padding: '16px 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#4a6070', letterSpacing: '0.12em' }}>{card.label}</div>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: p?.isAnomaly ? '#ff4444' : '#f5a623' }} />
                    </div>
                    <div style={{ fontFamily: 'monospace', fontSize: 32, fontWeight: 700, color: '#c8d8e8', lineHeight: 1 }}>{parseFloat(String(card.val)).toFixed(1)}</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#4a6070', marginBottom: 10 }}>{card.unit} (latest)</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 16px', fontFamily: 'monospace', fontSize: 11, marginBottom: 10 }}>
                      {[['Mean', (p?.mean ?? 0).toFixed(1)], ['Min', minV.toFixed(1)], ['Max', maxV.toFixed(1)], ['σ', (p?.stdDev ?? 0).toFixed(2)], ['Slope', slopeStr], ['R²', (p?.rSquared ?? 0).toFixed(3)]].map(([l, v]) => (
                        <div key={l} style={{ display: 'flex', justifyContent: 'space-between', color: '#4a7090' }}>
                          <span>{l}</span><span style={{ color: '#8aa8c0' }}>{v}</span>
                        </div>
                      ))}
                    </div>
                    {pct !== null && (
                      <>
                        <div style={{ height: 4, background: '#1e2a3a', borderRadius: 2, marginBottom: 4 }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: pct > 95 ? '#ff4444' : '#f5a623', borderRadius: 2, transition: 'width 0.4s' }} />
                        </div>
                        <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#4a6070' }}>{pct.toFixed(1)}% of limit ({card.limitLabel})</div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>


      {/* Engine parameter exceedances — these affect airworthiness */}
      {engineExceedances.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="font-semibold text-red-800 mb-2">⚠ Engine Parameter Exceedances</div>
          <div className="space-y-1">
            {engineExceedances.map(e => (
              <div key={e.id} className="flex items-center gap-4 text-sm">
                <span className="font-mono text-red-700 font-semibold">{e.parameter}</span>
                <span className="text-red-600">{parseFloat(String(e.value)).toFixed(1)} (limit {e.limit_value})</span>
                <span className="text-red-400">{String(e.flight_date).slice(0, 10)} {e.flight_time}</span>
                {e.duration_seconds > 1 && <span className="text-red-400">for {e.duration_seconds}s</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload zone */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900 mb-3">Upload ACMS Data</h2>
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${dragging ? 'border-sky-400 bg-sky-50' : 'border-slate-200 hover:border-sky-300 hover:bg-slate-50'} ${uploading ? 'pointer-events-none opacity-60' : ''}`}
        >
          <div className="text-3xl mb-2">{uploading ? '⏳' : '📁'}</div>
          <div className="text-sm font-medium text-slate-700">{uploadProgress ? `Uploading ${uploadProgress}` : uploading ? 'Processing…' : 'Drop ACMS files here'}</div>
          <div className="text-xs text-slate-400 mt-1">Drop all 4 TXT files at once, or the ZIP · up to 50MB</div>
        </div>
        <input ref={fileRef} type="file" accept=".zip,.txt" multiple onChange={onFileChange} className="hidden" />
        {uploadError && <div className="mt-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{uploadError}</div>}
        {uploadSuccess && (
          <div className="mt-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg p-3">
            <div className="font-semibold mb-1">✓ Upload complete: {uploadSuccess.filename}</div>
            <div className="flex gap-4 text-xs text-emerald-700">
              <span>{uploadSuccess.cruiseRecords} cruise snapshots</span>
              <span>{uploadSuccess.engineSeconds.toLocaleString()} engine seconds</span>
              <span>{uploadSuccess.navSeconds.toLocaleString()} nav points</span>
              {uploadSuccess.exceedances > 0 && <span className="text-red-600 font-semibold">⚠ {uploadSuccess.exceedances} exceedances</span>}
            </div>
          </div>
        )}
      </div>

      {/* Upload selector (if multiple uploads) */}
      {uploads.length > 1 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">View flight data for</div>
          <div className="flex flex-wrap gap-2">
            {uploads.map(u => (
              <button key={u.id} onClick={() => setSelectedUpload(u.id)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${(selectedUpload ?? uploads[0]?.id) === u.id ? 'bg-sky-600 text-white border-sky-600' : 'border-slate-200 text-slate-600 hover:border-sky-400'}`}>
                {u.filename.split('/').pop()} · {new Date(u.uploaded_at).toLocaleDateString()}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Flight Track Map */}
      {navTrack.length > 2 && <FlightTrackMap navPoints={navTrack} />}

      {/* Per-second engine charts */}
      {engineSeconds.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-1">Flight Engine Data <span className="text-xs font-normal text-slate-400">(per-second recording, sampled)</span></h2>
          <div className="text-xs text-slate-400 mb-4">Full engine parameter log from acms_engine_data_log_file — shows complete flight profile including takeoff, climb, cruise, and descent</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FlightProfileChart data={engTime} xKey="t" yKey="itt" xLabel="Time" yLabel="ITT (°C)" color="#ef4444" limitValue={820}
              extraLimits={[
                { value: 870, label: '870 Transient', color: '#f97316' },
                { value: 850, label: '850 T/O 5min', color: '#eab308' },
              ]} />
            <FlightProfileChart data={engTime} xKey="t" yKey="ng" xLabel="Time" yLabel="Ng (%)" color="#f97316" limitValue={104} />
            <FlightProfileChart data={engTime} xKey="t" yKey="torque" xLabel="Time" yLabel="Torque (%)" color="#3b82f6" />
            <FlightProfileChart data={engTime} xKey="t" yKey="fuel_flow" xLabel="Time" yLabel="Fuel Flow (lbs/hr)" color="#8b5cf6" />
            <FlightProfileChart data={engTime} xKey="t" yKey="altitude" xLabel="Time" yLabel="Altitude (ft)" color="#06b6d4" />
            <FlightProfileChart data={engTime} xKey="t" yKey="tas" xLabel="Time" yLabel="TAS (kts)" color="#10b981" />
          </div>
        </div>
      )}

      {/* Trend charts (stable cruise snapshots) */}
      {records.length >= 2 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-1">Long-Term Trend <span className="text-xs font-normal text-slate-400">({records.length} stable cruise snapshots)</span></h2>
          <div className="text-xs text-slate-400 mb-4">Stable cruise snapshots are normalized for altitude/OAT comparison — best indicator of engine health trend over time</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TrendChart records={records} param="itt" label="ITT" unit="°C" limitValue={820} color="#ef4444" />
            <TrendChart records={records} param="ng" label="Ng (%)" unit="%" limitValue={104} color="#f97316" />
            <TrendChart records={records} param="torque" label="Torque (%)" unit="%" color="#3b82f6" />
            <TrendChart records={records} param="fuel_flow" label="Fuel Flow (lbs/hr)" unit="lbs/hr" color="#8b5cf6" />
          </div>
          <div className="mt-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">ISA-Corrected (θ-normalized)</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TrendChart records={records} param="corrected_itt" label="Corrected ITT" unit="°C" color="#dc2626" />
              <TrendChart records={records} param="corrected_ff" label="Corrected Fuel Flow" unit="lbs/hr" color="#7c3aed" />
            </div>
          </div>
        </div>
      )}

      {/* Parameter summary cards */}
      {trend && trend.status !== 'INSUFFICIENT_DATA' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-3">Trend Summary</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(trend.parameters).filter(([k]) => !k.startsWith('corrected')).map(([key, p]) => (
              <div key={key} className={`rounded-lg border p-3 ${p.isAnomaly ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-slate-50'}`}>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{key.replace('_', ' ')}</div>
                <div className="text-lg font-bold text-slate-900">{p.mean.toFixed(1)}</div>
                <div className={`text-xs font-medium mt-0.5 ${p.trending === 'RISING' ? 'text-red-600' : p.trending === 'DECLINING' ? 'text-amber-600' : 'text-emerald-600'}`}>{p.trending === 'RISING' ? '↗' : p.trending === 'DECLINING' ? '↘' : '→'} {p.trending}</div>
                <div className="text-xs text-slate-400 mt-0.5">σ {p.stdDev.toFixed(2)} · R² {p.rSquared.toFixed(3)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload history */}
      {uploads.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-3">Upload History</h2>
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100">
              <tr>{[['File', 'file'], ['Engine ID', 'engine'], ['Cruise Pts', 'cruise'], ['Eng Seconds', 'engSec'], ['Nav Points', 'nav'], ['Uploaded', 'uploaded'], ['', '']].map(([h, k]) => <SortTh key={h} label={h} sortKey={k} sort={uploadTable.sort} onSort={uploadTable.toggle} className="text-left pb-2 text-xs font-semibold text-slate-500 uppercase tracking-wide pr-4" />)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {uploadTable.sorted.map(u => (
                <tr key={u.id} className={`cursor-pointer hover:bg-slate-50 ${(selectedUpload ?? uploads[0]?.id) === u.id ? 'bg-sky-50' : ''}`} onClick={() => setSelectedUpload(u.id)}>
                  <td className="py-2 pr-4 text-slate-700 font-mono text-xs max-w-xs truncate">{u.filename.split('/').pop()}</td>
                  <td className="py-2 pr-4 text-slate-500 text-xs">{u.engine_id || '—'}</td>
                  <td className="py-2 pr-4 text-slate-700">{u.record_count}</td>
                  <td className="py-2 pr-4 text-slate-700">{(u.engine_seconds_count ?? 0).toLocaleString()}</td>
                  <td className="py-2 pr-4 text-slate-700">{(u.nav_seconds_count ?? 0).toLocaleString()}</td>
                  <td className="py-2 pr-4 text-slate-400 text-xs">{new Date(u.uploaded_at).toLocaleString()}</td>
                  <td className="py-2" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={async () => {
                        if (!confirm('Delete this upload and all its data?')) return
                        await api.delete(`/uploads/${u.id}`)
                        qc.invalidateQueries({ queryKey: ['uploads', aircraftId] })
                        qc.invalidateQueries({ queryKey: ['records', aircraftId] })
                        qc.invalidateQueries({ queryKey: ['exceedances', aircraftId] })
                        qc.invalidateQueries({ queryKey: ['trend', aircraftId] })
                        qc.invalidateQueries({ queryKey: ['engine-seconds', u.id] })
                        qc.invalidateQueries({ queryKey: ['nav-track', u.id] })
                        if (selectedUpload === u.id) setSelectedUpload(null)
                      }}
                      className="text-xs text-red-400 hover:text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Raw cruise records */}
      {records.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-3">Stable Cruise Snapshots <span className="text-xs text-slate-400 font-normal">{records.length} total</span></h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead className="border-b border-slate-100">
                <tr>{CRUISE_COLUMNS.map(([h, k]) => <SortTh key={h} label={h} sortKey={k} sort={cruiseTable.sort} onSort={cruiseTable.toggle} className="text-right first:text-left pb-2 pr-3 text-xs font-semibold text-slate-500 whitespace-nowrap" />)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {cruiseTable.sorted.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="py-1.5 pr-3 text-slate-700">{String(r.flight_date).slice(0, 10)}</td>
                    <td className="py-1.5 pr-3 text-right text-slate-600">{r.flight_time ?? '—'}</td>
                    {[r.altitude, r.oat, r.tas, r.torque, r.np, r.ng].map((v, i) => <td key={i} className="py-1.5 pr-3 text-right text-slate-600">{v}</td>)}
                    <td className={`py-1.5 pr-3 text-right font-semibold ${r.itt > 800 ? 'text-red-600' : r.itt > 780 ? 'text-amber-600' : 'text-slate-700'}`}>{r.itt}</td>
                    {[r.fuel_flow, typeof r.corrected_itt === 'number' ? r.corrected_itt.toFixed(1) : r.corrected_itt, typeof r.corrected_ff === 'number' ? r.corrected_ff.toFixed(1) : r.corrected_ff].map((v, i) => <td key={i} className="py-1.5 pr-3 text-right text-slate-500">{v}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Fault History (FHDB) */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-semibold text-slate-900">Fault History</h2>
            {!!faultData?.legs?.length && (
              <span className="text-xs text-slate-400">{faultData.legs.length} flight legs · {faultData.summary?.reduce((s: number, f: FaultSummaryItem) => s + f.total_events, 0).toLocaleString()} fault events</span>
            )}
          </div>
          <FhdbUpload aircraftId={aircraftId} onComplete={() => qc.invalidateQueries({ queryKey: ['faults', aircraftId] })} />
        </div>
        {!faultData || !faultData.summary?.length ? (
          <p className="text-sm text-slate-400 mt-2">No fault history — upload the FHDB ZIP downloaded from the Honeywell MyCMC app to add fault data.</p>
        ) : (
          <>
            <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3 mb-4 text-xs text-amber-800">
              <strong>About these codes:</strong> Raw Primus Apex CMC engineering-level data from the MyCMC app. High event counts are normal — each bus packet dropout logs separately. A code with hundreds of "Active Events" is typically background bus chatter from cold starts or GPU plug-ins, <em>not</em> a failure requiring maintenance. Only act on codes that accompany a persistent amber/red CAS message in the cockpit.
            </div>
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100">
                <tr>{[['Sys', 'sys'], ['Code', 'code'], ['System', 'system'], ['Description', 'description'], ['Events', 'events'], ['Active', 'active'], ['First Seen', 'first'], ['Last Seen', 'last']].map(([h, k]) => <SortTh key={h} label={h} sortKey={k} sort={faultTable.sort} onSort={faultTable.toggle} className="text-left pb-2 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap" />)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {faultTable.sorted.map(f => (
                  <tr key={f.system_id + '-' + f.fault_code} className="hover:bg-slate-50">
                    <td className="py-2 pr-3 font-mono text-xs text-slate-500">{f.system_id}</td>
                    <td className="py-2 pr-3 font-mono text-xs font-semibold text-slate-700">{f.fault_code}</td>
                    <td className="py-2 pr-3 text-xs text-slate-500 whitespace-nowrap">{f.system_name ?? <span className="text-slate-300">—</span>}</td>
                    <td className="py-2 pr-4 text-xs text-slate-700 max-w-xs">{f.description ?? <span className="text-slate-300 italic">Unknown fault code</span>}</td>
                    <td className="py-2 pr-3 text-slate-700 font-medium">{f.total_events.toLocaleString()}</td>
                    <td className={`py-2 pr-3 font-semibold text-xs ${f.active_events > 0 ? 'text-amber-600' : 'text-slate-300'}`}>{f.active_events > 0 ? f.active_events : '—'}</td>
                    <td className="py-2 pr-3 text-xs text-slate-400 whitespace-nowrap">{String(f.first_seen).slice(0, 10)}</td>
                    <td className="py-2 text-xs text-slate-400 whitespace-nowrap">{String(f.last_seen).slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* G-Force events — informational only, not part of trend status */}
      {gForceExceedances.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-1">
            G-Force Events
            <span className="text-xs font-normal text-slate-400 ml-2">{gForceExceedances.length} events above +3.4g structural limit</span>
          </h2>
          <p className="text-xs text-slate-400 mb-4">Informational only — not included in trend status. Events above +3.4g should be reviewed per the PC-12 NG Flight Manual. Verify sensor calibration before any maintenance action.</p>
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100">
              <tr>{[['Date', 'date'], ['Time', 'time'], ['Peak G', 'peak'], ['Limit', 'limit']].map(([h, k]) => <SortTh key={h} label={h} sortKey={k} sort={gForceTable.sort} onSort={gForceTable.toggle} className="text-left pb-2 pr-6 text-xs font-semibold text-slate-500 uppercase tracking-wide" />)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {gForceTable.sorted.map(e => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <td className="py-2 pr-6 text-slate-700">{String(e.flight_date).slice(0, 10)}</td>
                  <td className="py-2 pr-6 font-mono text-slate-600">{e.flight_time}</td>
                  <td className="py-2 pr-6 font-mono font-semibold" style={{ color: parseFloat(String(e.value)) >= 4.0 ? '#dc2626' : '#ea580c' }}>+{parseFloat(String(e.value)).toFixed(1)}g</td>
                  <td className="py-2 text-slate-400 text-xs">+{parseFloat(String(e.limit_value)).toFixed(1)}g</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
