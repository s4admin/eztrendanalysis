import { useState, useRef, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'

// Maps JS API is loaded at runtime from a script tag (no @types/google.maps)
declare global { interface Window { google: any } }

interface Aircraft { id: number; tail_number: string; make_model: string }
interface Flight {
  id: number
  aircraft_id: number
  flight_date: string
  depart_time: string
  arrive_time: string
  duration_minutes: number
  max_altitude: number
  avg_altitude: number
  fuel_used_lbs: number
  avg_fuel_flow_lbs_hr: number
  max_itt: number
  avg_itt: number
  max_tas: number
  avg_tas: number
  distance_nm: number
  depart_lat: number
  depart_lon: number
  arrive_lat: number
  arrive_lon: number
}

function fmt(v: number | null, dec = 1, unit = '') {
  if (v == null) return '—'
  return parseFloat(String(v)).toFixed(dec) + (unit ? ' ' + unit : '')
}

function duration(mins: number) {
  if (!mins) return '—'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function FlightLog() {
  const { id } = useParams<{ id: string }>()
  const aircraftId = Number(id)
  const qc = useQueryClient()
  const [selected, setSelected] = useState<Flight | null>(null)

  const { data: aircraft } = useQuery({
    queryKey: ['aircraft', aircraftId],
    queryFn: () => api.get<Aircraft>('/aircraft/' + aircraftId)
  })
  const { data: flights = [], isLoading } = useQuery({
    queryKey: ['flights', aircraftId],
    queryFn: () => api.get<Flight[]>('/flightlog/aircraft/' + aircraftId + '/flights')
  })
  const detectMutation = useMutation({
    mutationFn: () => api.post('/flightlog/aircraft/' + aircraftId + '/flights/detect', {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['flights', aircraftId] })
  })

  const { data: engineData = [] } = useQuery({
    queryKey: ['flight-engine', selected?.id],
    queryFn: () => api.get<Record<string,unknown>[]>('/flightlog/flights/' + selected!.id + '/engine'),
    enabled: !!selected
  })
  const { data: trackData = [] } = useQuery({
    queryKey: ['flight-track', selected?.id],
    queryFn: () => api.get<{lat:number;lon:number;altitude:number;flight_time:string}[]>('/flightlog/flights/' + selected!.id + '/track'),
    enabled: !!selected
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-400 mb-1">
            <Link to={'/aircraft/' + aircraftId} className="hover:text-sky-600">← {aircraft?.tail_number}</Link>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Flight Log</h1>
          <p className="text-slate-400 text-sm">{flights.length} flights detected from uploaded data</p>
        </div>
        <button
          onClick={() => detectMutation.mutate()}
          disabled={detectMutation.isPending}
          className="text-sm bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 font-medium px-4 py-2 rounded-lg"
        >
          {detectMutation.isPending ? 'Detecting…' : '⟳ Re-detect Flights'}
        </button>
      </div>

      {selected && (
        <FlightDetail
          flight={selected}
          engineData={engineData}
          trackData={trackData}
          onClose={() => setSelected(null)}
        />
      )}

      {isLoading ? (
        <div className="text-slate-400 text-sm">Loading…</div>
      ) : flights.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <p className="text-slate-500 mb-3">No flights detected yet.</p>
          <p className="text-slate-400 text-sm">Upload ACMS data files to detect flights automatically.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Date','Depart','Arrive','Flight Time','Max Alt','Avg Alt','Fuel Used','Fuel/hr','Max ITT','Avg ITT','Max TAS','Distance'].map(h => (
                  <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {flights.map(f => (
                <tr
                  key={f.id}
                  onClick={() => setSelected(selected?.id === f.id ? null : f)}
                  className={`cursor-pointer hover:bg-sky-50 transition-colors ${selected?.id === f.id ? 'bg-sky-50 border-l-2 border-sky-500' : ''}`}
                >
                  <td className="px-3 py-3 font-medium text-slate-900">{String(f.flight_date).slice(0,10)}</td>
                  <td className="px-3 py-3 font-mono text-slate-600">{f.depart_time?.slice(0,5)}</td>
                  <td className="px-3 py-3 font-mono text-slate-600">{f.arrive_time?.slice(0,5)}</td>
                  <td className="px-3 py-3 text-slate-700">{duration(f.duration_minutes)}</td>
                  <td className="px-3 py-3 text-slate-700">{fmt(f.max_altitude, 0)} ft</td>
                  <td className="px-3 py-3 text-slate-500">{fmt(f.avg_altitude, 0)} ft</td>
                  <td className="px-3 py-3 text-slate-700">{fmt(f.fuel_used_lbs, 0)} lbs</td>
                  <td className="px-3 py-3 text-slate-500">{fmt(f.avg_fuel_flow_lbs_hr, 0)} lbs/hr</td>
                  <td className={`px-3 py-3 font-semibold ${f.max_itt > 800 ? 'text-red-600' : f.max_itt > 780 ? 'text-amber-600' : 'text-slate-700'}`}>{fmt(f.max_itt, 0)} °C</td>
                  <td className="px-3 py-3 text-slate-500">{fmt(f.avg_itt, 0)} °C</td>
                  <td className="px-3 py-3 text-slate-500">{fmt(f.max_tas, 0)} kts</td>
                  <td className="px-3 py-3 text-slate-500">{fmt(f.distance_nm, 1)} nm</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function FlightDetail({ flight, engineData, trackData, onClose }: {
  flight: Flight
  engineData: Record<string,unknown>[]
  trackData: {lat:number;lon:number;altitude:number;flight_time:string}[]
  onClose: () => void
}) {
  return (
    <div className="bg-white rounded-xl border border-sky-200 shadow-md p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="font-bold text-slate-900 text-lg">{String(flight.flight_date).slice(0,10)}</div>
          <div className="text-slate-500 text-sm">
            {flight.depart_time?.slice(0,5)} → {flight.arrive_time?.slice(0,5)} · {duration(flight.duration_minutes)} · {fmt(flight.max_altitude, 0)} ft max · {fmt(flight.distance_nm, 1)} nm
          </div>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg font-semibold px-2">✕</button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Flight Track */}
        <div>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Flight Track</div>
          <GoogleMapTrack navPoints={trackData} />
        </div>

        {/* ITT Chart */}
        <div>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">ITT — Inter-Turbine Temperature</div>
          <IttChart data={engineData} />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-6 gap-3 mt-4">
        {[
          ['Max ITT', fmt(flight.max_itt, 0) + ' °C'],
          ['Avg ITT', fmt(flight.avg_itt, 0) + ' °C'],
          ['Fuel Used', fmt(flight.fuel_used_lbs, 0) + ' lbs'],
          ['Fuel/hr', fmt(flight.avg_fuel_flow_lbs_hr, 0) + ' lbs/hr'],
          ['Max TAS', fmt(flight.max_tas, 0) + ' kts'],
          ['Distance', fmt(flight.distance_nm, 1) + ' nm'],
        ].map(([label, value]) => (
          <div key={label} className="bg-slate-50 rounded-lg p-3">
            <div className="text-xs text-slate-400 uppercase tracking-wide">{label}</div>
            <div className="font-semibold text-slate-900 mt-0.5">{value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SvgTrackFallback({ navPoints }: { navPoints: {lat:number;lon:number}[] }) {
  if (navPoints.length < 2) return null
  const lats = navPoints.map(p => p.lat), lons = navPoints.map(p => p.lon)
  const W = 400, H = 240, P = 16
  const sx = (lon: number) => P + ((lon - Math.min(...lons)) / (Math.max(...lons) - Math.min(...lons) || 1)) * (W - 2*P)
  const sy = (lat: number) => H - P - ((lat - Math.min(...lats)) / (Math.max(...lats) - Math.min(...lats) || 1)) * (H - 2*P)
  const d = navPoints.map((p,i) => (i===0?'M':'L') + sx(p.lon).toFixed(1) + ',' + sy(p.lat).toFixed(1)).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg bg-slate-700">
      <path d={d} fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/>
      <circle cx={sx(navPoints[0].lon)} cy={sy(navPoints[0].lat)} r={5} fill="#22c55e"/>
      <circle cx={sx(navPoints[navPoints.length-1].lon)} cy={sy(navPoints[navPoints.length-1].lat)} r={5} fill="#ef4444"/>
    </svg>
  )
}

function GoogleMapTrack({ navPoints }: { navPoints: {lat:number;lon:number;altitude:number;flight_time:string}[] }) {
  const mapRef = useRef<HTMLDivElement>(null)
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

  useEffect(() => {
    if (!navPoints.length || !mapRef.current || !apiKey) return
    const initMap = () => {
      if (!mapRef.current) return
      const mid = navPoints[Math.floor(navPoints.length / 2)]
      const map = new window.google.maps.Map(mapRef.current, {
        center: { lat: mid.lat, lng: mid.lon },
        zoom: 7,
        mapTypeId: 'terrain',
        mapTypeControl: false,
        streetViewControl: false,
      })
      const path = navPoints.map(p => ({ lat: p.lat, lng: p.lon }))
      new window.google.maps.Polyline({ path, geodesic: true, strokeColor: '#ef4444', strokeWeight: 2.5 }).setMap(map)
      new window.google.maps.Marker({ position: path[0], map, title: 'Departure', label: { text: '▶', color: '#22c55e', fontSize: '12px' } })
      new window.google.maps.Marker({ position: path[path.length-1], map, title: 'Arrival', label: { text: '■', color: '#ef4444', fontSize: '12px' } })
      const bounds = new window.google.maps.LatLngBounds()
      path.forEach(p => bounds.extend(p))
      map.fitBounds(bounds, 40)
    }
    if (window.google?.maps) { initMap(); return }
    if (document.querySelector(`script[src*="maps.googleapis.com"]`)) {
      const check = setInterval(() => { if (window.google?.maps) { clearInterval(check); initMap() } }, 100)
      return () => clearInterval(check)
    }
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`
    script.async = true; script.onload = initMap
    document.head.appendChild(script)
  }, [navPoints, apiKey])

  if (navPoints.length < 2) return <div className="bg-slate-100 rounded-xl h-48 flex items-center justify-center text-slate-400 text-sm">No track data</div>
  if (!apiKey) return <div className="bg-slate-800 rounded-xl p-3"><SvgTrackFallback navPoints={navPoints} /></div>
  return <div ref={mapRef} style={{ height: 280, borderRadius: 12 }} />
}

function IttChart({ data }: { data: Record<string,unknown>[] }) {
  if (!data.length) return <div className="bg-slate-100 rounded-lg h-48 flex items-center justify-center text-slate-400 text-sm">No engine data</div>
  const itts = data.map(r => Number(r.itt)).filter(v => v > 50)
  if (!itts.length) return <div className="bg-slate-100 rounded-lg h-48 flex items-center justify-center text-slate-400 text-sm">No ITT data</div>
  const minV = Math.min(...itts) - 20, maxV = Math.max(...itts, 820) + 20
  const W = 400, H = 200, PAD = { t: 8, r: 8, b: 24, l: 40 }
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b
  const sx = (i: number) => PAD.l + (i / (data.length - 1)) * iw
  const sy = (v: number) => PAD.t + (1 - (v - minV) / (maxV - minV)) * ih
  const path = data.map((r, i) => {
    const v = Number(r.itt)
    if (v < 50) return null
    return (i === 0 ? 'M' : 'L') + sx(i).toFixed(1) + ',' + sy(v).toFixed(1)
  }).filter(Boolean).join(' ')
  const limitY = sy(820)
  // X-axis labels (first, middle, last time)
  const times = [data[0], data[Math.floor(data.length/2)], data[data.length-1]].map(r => String(r.flight_time || '').slice(0,5))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg bg-white border border-slate-100">
      {/* Grid */}
      {[200,400,600,800].map(v => (
        <g key={v}>
          <line x1={PAD.l} x2={W-PAD.r} y1={sy(v)} y2={sy(v)} stroke="#f1f5f9" strokeWidth="1" />
          <text x={PAD.l-4} y={sy(v)+4} textAnchor="end" fontSize="9" fill="#94a3b8">{v}</text>
        </g>
      ))}
      {/* Limit line */}
      <line x1={PAD.l} x2={W-PAD.r} y1={limitY} y2={limitY} stroke="#f59e0b" strokeWidth="1" strokeDasharray="4 2" />
      <text x={W-PAD.r+2} y={limitY+4} fontSize="9" fill="#f59e0b">820</text>
      {/* ITT line */}
      <path d={path} fill="none" stroke="#3b82f6" strokeWidth="1.5" />
      {/* X labels */}
      {times.map((t, i) => (
        <text key={i} x={sx(i === 0 ? 0 : i === 1 ? Math.floor(data.length/2) : data.length-1)} y={H-6} textAnchor="middle" fontSize="9" fill="#94a3b8">{t}</text>
      ))}
    </svg>
  )
}
