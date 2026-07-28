import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SidebarCrm from '../components/SidebarCrm.jsx'
import TopBarUser from '../components/TopBarUser.jsx'
import { useToast } from '../components/ToastContext.jsx'
import { api } from '../lib/api.js'

// --- helpers ---
const fmt$ = (n) => (n == null || n === '' || Number(n) === 0) ? '—' : `$${Number(n).toLocaleString()}`
const fmtDateTime = (ts) => ts ? new Date(Number(ts)).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'
const leadNo = (id) => { const d = String(id || '').replace(/\D/g, ''); return 'LD-' + (d.slice(-6) || '000000') }
const QUOTE_STAGES = ['Quotation', 'Quoted', 'Quote Sent', 'Proposal', 'Artwork Approval', 'Payment Pending']
const ORDER_STAGES = ['Order Confirmed', 'Ready to Order', 'Completed', 'In Production']
const AVATAR_BG = ['bg-brand-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-sky-500', 'bg-violet-500', 'bg-teal-500', 'bg-pink-500']
const avatarFor = (name, id) => { const s = String(id || name || ''); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return AVATAR_BG[h % AVATAR_BG.length] }
const initialsOf = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?'
const scoreCls = (s) => s >= 70 ? 'bg-emerald-500' : s >= 40 ? 'bg-amber-500' : 'bg-slate-300'

// Time-period → {from,to} ms. Rolling/calendar windows over the lead's start date.
function periodRange(period, customFrom, customTo) {
  const d = new Date(); const sod = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  if (period === 'today') return { from: sod(d), to: Infinity }
  if (period === 'week') { const m = new Date(d); m.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return { from: sod(m), to: Infinity } }
  if (period === 'month') return { from: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), to: Infinity }
  if (period === 'quarter') return { from: new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1).getTime(), to: Infinity }
  if (period === 'year') return { from: new Date(d.getFullYear(), 0, 1).getTime(), to: Infinity }
  if (period === 'custom') return { from: customFrom ? Date.parse(customFrom + 'T00:00:00') : 0, to: customTo ? Date.parse(customTo + 'T23:59:59') : Infinity }
  return { from: 0, to: Infinity }
}
const PERIODS = [['today', 'Today'], ['week', 'This Week'], ['month', 'This Month'], ['quarter', 'This Quarter'], ['year', 'This Year'], ['custom', 'Custom'], ['all', 'All Time']]

// Column definitions. `always` = hamesha dikhe; baaki tabhi dikhein jab kisi lead me data ho
// (dynamic — khaali "—" wale columns apne aap gayab). `has(l)` = is lead me is field ka data hai?
const LEAD_COLUMNS = [
  { key: 'leadNo', header: 'Lead No', always: true },
  { key: 'date', header: 'Lead Date & Time', always: true },
  { key: 'name', header: 'Customer Name', always: true },
  { key: 'source', header: 'Source', has: (l) => !!l._source },
  { key: 'stage', header: 'Stage', has: (l) => !!l._stage },
  { key: 'status', header: 'Lead Status', has: (l) => !!l._status },
  { key: 'qual', header: 'Qualification', has: (l) => l._score > 0 },
  { key: 'temp', header: 'Temperature', has: (l) => !!l._temp },
  { key: 'intent', header: 'Purchase Intent', has: (l) => l._intent != null },
  { key: 'product', header: 'Product', has: (l) => !!l._product },
  { key: 'value', header: 'Est. Value', has: (l) => l._value > 0 },
  { key: 'actions', header: 'Actions', always: true, right: true },
]

function StatCard({ label, value, icon, tint, sub }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
      <div className="flex items-center gap-2">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${tint}`}>{icon}</span>
        <span className="text-xs font-medium text-slate-500">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-extrabold tracking-tight text-slate-800">{value}</div>
      {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
    </div>
  )
}

export default function Leads() {
  const toast = useToast()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [query, setQuery] = useState('')
  const [period, setPeriod] = useState('all')
  const [stage, setStage] = useState(''); const [status, setStatus] = useState(''); const [source, setSource] = useState('')
  const [from, setFrom] = useState(''); const [to, setTo] = useState('')
  const [page, setPage] = useState(1); const [perPage, setPerPage] = useState(10)
  const [menuId, setMenuId] = useState(null)

  // Real enriched leads seedhe DB se (/api/leads/list): intent_score, temperature,
  // purchase_probability, estimated_value, primary_product — sab dynamic. Har 20s refetch.
  useEffect(() => {
    let cancelled = false
    const load = () => api.get('/api/leads/list').catch(() => [])
      .then((rows) => {
        if (cancelled) return
        const merged = (rows || []).map((l) => ({
          ...l,
          _cid: l.id,
          _firstTs: Number(l.first_ts) || (l.created_at ? Date.parse(l.created_at) : 0) || 0,
          _lastOut: Number(l.last_out_ts) || 0,
          _stage: l.lead_stage || l.stage || 'Initiated',
          _status: l.lead_status || l.status || 'New',
          _source: l.source || '',
          _score: Number(l.intent_score) || 0,                                       // real lead/intent score
          _intent: l.purchase_probability != null ? Math.round(Number(l.purchase_probability)) : null,
          _temp: String(l.temperature || '').toLowerCase(),                           // hot/warm/cold
          _value: Number(l.estimated_value) || 0,
          _product: l.primary_product || '',
          _potential: l.business_potential || '',
        }))
        setData(merged)
      })
    load()
    const t = setInterval(load, 20000)
    return () => { cancelled = true; clearInterval(t) }
  }, [])

  const src = data || []
  const range = useMemo(() => periodRange(period, from, to), [period, from, to])
  const inPeriod = useMemo(() => src.filter((l) => l._firstTs >= range.from && l._firstTs <= range.to), [src, range])

  const stages = useMemo(() => [...new Set(src.map((l) => l._stage).filter(Boolean))].sort(), [src])
  const statuses = useMemo(() => [...new Set(src.map((l) => l._status).filter(Boolean))].sort(), [src])
  const sources = useMemo(() => [...new Set(src.map((l) => l._source).filter(Boolean))].sort(), [src])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return inPeriod.filter((l) => {
      if (stage && l._stage !== stage) return false
      if (status && l._status !== status) return false
      if (source && l._source !== source) return false
      if (q) { const hay = `${l.name || ''} ${l.company || ''} ${l._source} ${leadNo(l._cid)}`.toLowerCase(); if (!hay.includes(q)) return false }
      return true
    }).sort((a, b) => b._firstTs - a._firstTs)
  }, [inPeriod, stage, status, source, query])

  // stat cards (over the selected period)
  const s = useMemo(() => ({
    total: inPeriod.length,
    engaged: inPeriod.filter((l) => l._lastOut > 0).length,
    qualified: inPeriod.filter((l) => l._score >= 60).length,
    hot: inPeriod.filter((l) => l._temp === 'hot' || l._score >= 80).length,
    quotes: inPeriod.filter((l) => QUOTE_STAGES.includes(l._stage)).length,
    orders: inPeriod.filter((l) => ORDER_STAGES.includes(l._stage)).length,
  }), [inPeriod])

  useEffect(() => { setPage(1) }, [query, period, stage, status, source, from, to, perPage])
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const pageRows = filtered.slice((page - 1) * perPage, page * perPage)
  const anyFilter = stage || status || source || from || to || query
  const clearAll = () => { setStage(''); setStatus(''); setSource(''); setFrom(''); setTo(''); setQuery(''); setPeriod('all') }

  const openChat = (cid) => navigate(`/dashboard?conv=${encodeURIComponent(cid)}`)

  // Sirf wahi columns dikhao jinme kam-se-kam ek lead ka data ho (dynamic).
  const activeCols = useMemo(() => LEAD_COLUMNS.filter((c) => c.always || filtered.some((l) => c.has(l))), [filtered])

  const cellFor = (key, l) => {
    switch (key) {
      case 'leadNo': return <span className="font-semibold text-brand-700">{leadNo(l._cid)}</span>
      case 'date': return <span className="whitespace-nowrap text-slate-600">{fmtDateTime(l._firstTs)}</span>
      case 'name': return (
        <div className="flex items-center gap-2">
          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${avatarFor(l.name, l._cid)} text-xs font-bold text-white`}>{initialsOf(l.name)}</span>
          <span className="font-semibold text-slate-800">{l.name || 'Unknown'}</span>
        </div>)
      case 'source': return <span className="whitespace-nowrap text-slate-600">{l._source || '—'}</span>
      case 'stage': return <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">{l._stage}</span>
      case 'status': return <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">{l._status}</span>
      case 'qual': return (
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-600">{l._score}<span className="text-slate-400">/100</span></span>
          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100"><span className={`block h-full ${scoreCls(l._score)}`} style={{ width: `${Math.min(100, l._score)}%` }} /></span>
        </div>)
      case 'temp': return <TempBadge t={l._temp} />
      case 'intent': return l._intent == null ? <span className="text-slate-300">—</span> : (
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-600">{l._intent}%</span>
          <span className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-100"><span className="block h-full bg-violet-500" style={{ width: `${Math.min(100, l._intent)}%` }} /></span>
        </div>)
      case 'product': return <span className="text-slate-600">{l._product || '—'}</span>
      case 'value': return <span className="whitespace-nowrap font-semibold text-slate-700">{fmt$(l._value)}</span>
      case 'actions': return (
        <RowMenu open={menuId === l._cid} onToggle={() => setMenuId(menuId === l._cid ? null : l._cid)}
          onChat={() => { setMenuId(null); openChat(l._cid) }}
          onDetails={() => { setMenuId(null); navigate(`/leads/${encodeURIComponent(l._cid)}`) }} />)
      default: return null
    }
  }

  const exportCsv = () => {
    const cols = ['Lead No', 'Lead Date', 'Customer', 'Source', 'Stage', 'Status', 'Qualification', 'Est Value', 'Product']
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [cols.join(',')]
    for (const l of filtered) lines.push([leadNo(l._cid), fmtDateTime(l._firstTs), l.name, l._source, l._stage, l._status, `${l._score}/100`, l._value || '', l._product].map(esc).join(','))
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href)
    toast(`Exported ${filtered.length} leads`, 'success')
  }

  return (
    <div className="crm-shell grid h-screen overflow-hidden">
      <SidebarCrm active="leads" />
      <div className="flex h-screen flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 sm:px-6">
          <h1 className="text-lg font-extrabold tracking-tight">Leads</h1>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-4">
            <div className="relative hidden min-w-0 flex-1 sm:block sm:flex-none">
              <span className="pointer-events-none absolute inset-y-0 left-0 grid place-items-center pl-3 text-slate-400"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg></span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search jobs, customers, products" className="w-full sm:w-80 rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:bg-white" />
            </div>
            <TopBarUser role="Admin" />
          </div>
        </header>

        <main className="nice-scroll flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {/* Search + actions */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <span className="pointer-events-none absolute inset-y-0 left-0 grid place-items-center pl-3 text-slate-400"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg></span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, email, phone, company or lead number…" className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
            </div>
            <button onClick={() => toast('Import Leads — coming soon', 'info')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold hover:bg-slate-50">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>Import Leads
            </button>
            <button onClick={exportCsv} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold hover:bg-slate-50">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>Export
            </button>
            <button onClick={() => toast('Add Lead — coming soon', 'info')} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>Add Lead
            </button>
          </div>

          {/* Period tabs */}
          <div className="mt-4 flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
            {PERIODS.map(([k, lbl]) => (
              <button key={k} onClick={() => setPeriod(k)} className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${period === k ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{lbl}</button>
            ))}
          </div>

          {/* Stat cards */}
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Total Inquiries" value={s.total.toLocaleString()} sub="in period" tint="bg-sky-50 text-sky-600" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>} />
            <StatCard label="Engaged" value={s.engaged.toLocaleString()} sub="we replied" tint="bg-violet-50 text-violet-600" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>} />
            <StatCard label="Qualified" value={s.qualified.toLocaleString()} sub="score ≥ 60" tint="bg-emerald-50 text-emerald-600" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>} />
            <StatCard label="Hot Leads" value={s.hot.toLocaleString()} sub="score ≥ 80" tint="bg-rose-50 text-rose-600" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>} />
            <StatCard label="Quotes Sent" value={s.quotes.toLocaleString()} sub="in pipeline" tint="bg-amber-50 text-amber-600" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>} />
            <StatCard label="Ready to Order" value={s.orders.toLocaleString()} sub="confirmed" tint="bg-teal-50 text-teal-600" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" x2="21" y1="6" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>} />
          </div>

          {/* Filters */}
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
              <div><label className="mb-1 block text-xs font-semibold text-slate-600">Lead Stage</label>
                <select value={stage} onChange={(e) => setStage(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm"><option value="">All</option>{stages.map((x) => <option key={x} value={x}>{x}</option>)}</select></div>
              <div><label className="mb-1 block text-xs font-semibold text-slate-600">Lead Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm"><option value="">All</option>{statuses.map((x) => <option key={x} value={x}>{x}</option>)}</select></div>
              <div><label className="mb-1 block text-xs font-semibold text-slate-600">Source</label>
                <select value={source} onChange={(e) => setSource(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm"><option value="">All</option>{sources.map((x) => <option key={x} value={x}>{x}</option>)}</select></div>
              <div><label className="mb-1 block text-xs font-semibold text-slate-600">Date from</label>
                <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPeriod('custom') }} className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-semibold text-slate-600">Date to</label>
                <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPeriod('custom') }} className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm" /></div>
              <div className="flex items-end gap-2">
                {anyFilter && <button onClick={clearAll} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">✕ Clear</button>}
              </div>
            </div>
          </div>

          {/* Table — columns dynamic (khaali column apne aap chhup jaate hain) */}
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-card">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  {activeCols.map((c) => <th key={c.key} className={`px-3 py-3 font-semibold ${c.right ? 'text-right' : 'text-left'}`}>{c.header}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data === null ? (
                  <tr><td colSpan={activeCols.length} className="px-3 py-10 text-center text-sm text-slate-400">Loading leads…</td></tr>
                ) : pageRows.length === 0 ? (
                  <tr><td colSpan={activeCols.length} className="px-3 py-10 text-center text-sm text-slate-400">Koi lead nahi mila. {anyFilter && <button onClick={clearAll} className="font-semibold text-brand-600 underline">Clear filters</button>}</td></tr>
                ) : pageRows.map((l) => (
                  <tr key={l._cid} onClick={() => openChat(l._cid)} className="cursor-pointer transition hover:bg-brand-50/40">
                    {activeCols.map((c) => (
                      <td key={c.key} className={`px-3 py-3 ${c.right ? 'text-right' : ''}`} onClick={c.key === 'actions' ? (e) => e.stopPropagation() : undefined}>{cellFor(c.key, l)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
            <span>Showing {filtered.length === 0 ? 0 : (page - 1) * perPage + 1} to {Math.min(page * perPage, filtered.length)} of {filtered.length.toLocaleString()} leads</span>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5"><span>Rows per page</span>
                <select value={perPage} onChange={(e) => setPerPage(Number(e.target.value))} className="rounded-md border border-slate-200 bg-white px-1.5 py-1">{[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(1)} disabled={page === 1} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50">«</button>
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50">‹</button>
                <span className="px-2 font-semibold text-slate-700">{page} / {totalPages}</span>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50">›</button>
                <button onClick={() => setPage(totalPages)} disabled={page >= totalPages} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50">»</button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

function TempBadge({ t }) {
  if (!t) return <span className="text-slate-300">—</span>
  const cls = t === 'hot' ? 'bg-rose-50 text-rose-700' : t === 'warm' ? 'bg-amber-50 text-amber-700' : 'bg-sky-50 text-sky-700'
  const icon = t === 'hot' ? '🔥' : t === 'warm' ? '☀️' : '❄️'
  return <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold capitalize ${cls}`}>{icon} {t}</span>
}

function RowMenu({ open, onToggle, onChat, onDetails }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onToggle() }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [open, onToggle])
  return (
    <div ref={ref} className="relative inline-block text-left">
      <button onClick={onToggle} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg></button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-left text-sm shadow-pop">
          <button onClick={onChat} className="flex w-full items-center gap-2 px-3 py-2 font-medium text-slate-700 hover:bg-slate-50"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>Open chat</button>
          <button onClick={onDetails} className="flex w-full items-center gap-2 px-3 py-2 font-medium text-slate-700 hover:bg-slate-50"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>Open lead details</button>
        </div>
      )}
    </div>
  )
}
