import { Link } from 'react-router-dom'
export default function Landing() {
  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b border-slate-100 px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-2"><span className="text-2xl">✈</span><span className="font-bold text-slate-900 text-lg">EZ Trend Analysis</span></div>
        <div className="flex items-center gap-3">
          <Link to="/login" className="text-sm text-slate-600 hover:text-slate-900 font-medium">Sign in</Link>
          <Link to="/register" className="text-sm bg-sky-600 hover:bg-sky-700 text-white font-medium px-4 py-2 rounded-lg transition-colors">Get started</Link>
        </div>
      </nav>
      <section className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-sky-50 text-sky-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">PC-12 NG · Honeywell Primus Apex · MyCMC</div>
        <h1 className="text-5xl font-extrabold text-slate-900 leading-tight mb-6">Engine Trend Monitoring<br/>for the Pilatus PC-12 NG</h1>
        <p className="text-xl text-slate-500 mb-8 max-w-2xl mx-auto">Upload your ACMS data files from the Honeywell MyCMC app and instantly see engine health trends, exceedances, fault history, and flight tracks — all in one place.</p>
        <div className="flex items-center justify-center gap-4">
          <Link to="/register" className="bg-sky-600 hover:bg-sky-700 text-white font-semibold px-6 py-3 rounded-xl text-base transition-colors">Start analyzing free</Link>
          <Link to="/login" className="text-slate-600 hover:text-slate-900 font-medium text-base">Sign in →</Link>
        </div>
      </section>
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-slate-900 text-center mb-12">Everything your maintenance team needs</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            { icon: '📈', title: 'Engine Trend Monitoring', desc: 'Track ITT, Ng, Torque, and Fuel Flow across stable cruise snapshots. Linear regression and ISA correction reveal real trends before they become problems.' },
            { icon: '⚠️', title: 'Exceedance Detection', desc: 'Automatically flags ITT over 820°C for more than 5 minutes, Ng over 104%, and load factor beyond structural limits from every flight — with duration tracking and per-flight detail.' },
            { icon: '🗺️', title: 'Flight Track & Profile', desc: 'Google Maps flight tracks with altitude and engine parameter charts for every detected flight. See exactly what happened during each leg.' },
            { icon: '🔍', title: 'CMC Fault History', desc: 'Upload your FHDB ZIP from the MyCMC app. 60+ fault codes decoded from plain English from the Primus Apex CMC documentation.' },
            { icon: '✈️', title: 'Multi-Aircraft Support', desc: 'Manage multiple aircraft under one account. Aircraft are auto-detected from the tail number in your ACMS data files.' },
            { icon: '📊', title: 'Historical Analysis', desc: 'Build a complete engine health record over time. Spot gradual ITT rise, fuel flow trends, and corrected parameter changes across hundreds of flights.' },
          ].map(f => (
            <div key={f.title} className="bg-slate-50 rounded-2xl p-6">
              <div className="text-3xl mb-4">{f.icon}</div>
              <h3 className="font-bold text-slate-900 mb-2">{f.title}</h3>
              <p className="text-slate-500 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="bg-slate-900 py-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-12">How it works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: '1', title: 'Download from MyCMC', desc: 'Use the Honeywell MyCMC app with your Aspen Wireless Gateway to download ACMS data files from your PC-12 NG.' },
              { step: '2', title: 'Upload the ZIP', desc: 'Drop the ACMS ZIP (or individual .txt files) into EZ Trend Analysis. Aircraft tail number is detected automatically.' },
              { step: '3', title: 'Review your data', desc: 'See trend charts, flight history, fault codes, exceedances, and flight tracks — ready to share with your maintenance team.' },
            ].map(s => (
              <div key={s.step} className="text-center">
                <div className="w-12 h-12 rounded-full bg-sky-600 text-white font-bold text-lg flex items-center justify-center mx-auto mb-4">{s.step}</div>
                <h3 className="font-bold text-white mb-2">{s.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="max-w-4xl mx-auto px-6 py-20 text-center">
        <h2 className="text-3xl font-bold text-slate-900 mb-4">Ready to monitor your engine?</h2>
        <p className="text-slate-500 mb-8">Join pilots and maintenance teams already using EZ Trend Analysis to keep their PC-12 NG flying safely.</p>
        <Link to="/register" className="bg-sky-600 hover:bg-sky-700 text-white font-semibold px-8 py-4 rounded-xl text-lg transition-colors inline-block">Create your free account</Link>
      </section>
      <footer className="border-t border-slate-100 px-6 py-8 text-center text-sm text-slate-400">
        <p>© 2026 EZ Trend Analysis · Built for Pilatus PC-12 NG operators</p>
      </footer>
    </div>
  )
}
