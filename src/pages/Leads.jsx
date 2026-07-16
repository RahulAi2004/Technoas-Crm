import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SidebarCrm from '../components/SidebarCrm.jsx'
import TopBarUser from '../components/TopBarUser.jsx'
import { useToast } from '../components/ToastContext.jsx'
import { LEADS as FALLBACK_LEADS, PIPELINE_STAGES, SCORE_CLS } from '../data/leads.js'
import { fmt$ } from '../data/customers.js'
import { api } from '../lib/api.js'
import { currentUser } from '../lib/auth.js'

const stat = (label, value, color, icon) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4">
    <div className="flex items-center gap-2 text-xs text-slate-500">
      <span className={`grid h-7 w-7 place-items-center rounded-lg ${color}`}>{icon}</span>
      {label}
    </div>
    <div className="mt-2 text-xl font-extrabold">{value}</div>
  </div>
)

const QUOTE_STAGES = ['Quotation', 'Artwork Approval', 'Payment Pending', 'Order Confirmed', 'Completed']
const ORDER_STAGES = ['Order Confirmed', 'Completed']

export default function Leads() {
  const toast = useToast()
  const navigate = useNavigate()
  const [view, setView] = useState('list') // list | kanban
  const [tab, setTab] = useState('all')
  const [query, setQuery] = useState('')
  const [data, setData] = useState(null)

  useEffect(() => {
    let cancelled = false
    api.get('/api/leads')
      .then((rows) => { if (!cancelled) setData(rows) })
      .catch(() => { if (!cancelled) { setData(FALLBACK_LEADS); toast('Using offline leads data', 'info') } })
    return () => { cancelled = true }
  }, [])

  const source = data || []
  const rows = useMemo(() => {
    let r = source
    if (tab === 'my') r = r.filter((l) => l.agent === currentUser()?.name)
    else if (tab === 'archived') r = r.filter((l) => l.archived)
    const q = query.trim().toLowerCase()
    if (q) r = r.filter((l) =>
      (l.name || '').toLowerCase().includes(q) || (l.company || '').toLowerCase().includes(q) || (l.source || '').toLowerCase().includes(q))
    return r
  }, [query, source, tab])

  // Real stats computed from the actual leads in the DB
  const s = useMemo(() => {
    const won = source.filter((l) => l.status === 'Won')
    return {
      total: source.length,
      new: source.filter((l) => l.status === 'New').length,
      hot: source.filter((l) => l.badge === 'Hot').length,
      quotes: source.filter((l) => QUOTE_STAGES.includes(l.pipeline)).length,
      orders: source.filter((l) => ORDER_STAGES.includes(l.pipeline)).length,
      revenue: won.reduce((a, l) => a + (l.value || 0), 0),
      conversion: source.length ? Math.round((won.length / source.length) * 1000) / 10 : 0,
      mine: source.filter((l) => l.agent === currentUser()?.name).length,
    }
  }, [source])

  return (
    <div className="crm-shell h-screen overflow-hidden grid">
      <SidebarCrm active="leads" />
      <div className="flex h-screen flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 sm:px-6">
          <nav className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">CRM</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-300"><path d="m9 18 6-6-6-6"/></svg>
            <span className="font-semibold">{view === 'list' ? 'Leads' : 'Lead Board'}</span>
          </nav>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-4">
            <div className="relative min-w-0 flex-1 sm:flex-none">
              <span className="pointer-events-none absolute inset-y-0 left-0 grid place-items-center pl-3 text-slate-400">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              </span>
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search leads..." className="w-full sm:w-72 rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-12 text-sm outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20" />
              <kbd className="pointer-events-none absolute inset-y-0 right-2 my-auto grid h-6 place-items-center rounded border border-slate-200 bg-white px-1.5 text-[10px] font-semibold text-slate-500">⌘K</kbd>
            </div>
            <button className="relative grid h-10 w-10 place-items-center rounded-full hover:bg-slate-100">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
              <span className="absolute -top-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full bg-rose-500 text-[10px] font-bold text-white">6</span>
            </button>
            <TopBarUser role="Admin" />
          </div>
        </header>

        <main className="nice-scroll flex-1 overflow-y-auto px-6 py-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">{view === 'list' ? 'Leads' : 'Lead Board'}</h1>
              <p className="text-sm text-slate-500">Manage all incoming leads and track your sales pipeline</p>
            </div>
            <div className="flex items-center gap-2">
              <button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                Import Leads
              </button>
              <button onClick={() => toast('Add Lead — coming next', 'info')} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>
                Add Lead
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
              </button>
            </div>
          </div>

          {/* Stat cards */}
          {view === 'list' ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
              {stat('Total Leads', s.total, 'bg-violet-50 text-violet-600', '👥')}
              {stat('New Leads', s.new, 'bg-sky-50 text-sky-600', '✨')}
              {stat('Hot Leads', s.hot, 'bg-rose-50 text-rose-600', '🔥')}
              {stat('Quotes Sent', s.quotes, 'bg-amber-50 text-amber-600', '📨')}
              {stat('Orders Confirmed', s.orders, 'bg-emerald-50 text-emerald-600', '✓')}
              {stat('Revenue (Won)', fmt$(s.revenue), 'bg-emerald-50 text-emerald-600', '$')}
              {stat('Conversion Rate', `${s.conversion}%`, 'bg-pink-50 text-pink-600', '🎯')}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              {stat('Total Leads', s.total, 'bg-violet-50 text-violet-600', '👥')}
              {stat('Quotes Sent', s.quotes, 'bg-amber-50 text-amber-600', '📨')}
              {stat('Orders Confirmed', s.orders, 'bg-emerald-50 text-emerald-600', '✓')}
              {stat('Revenue (Won)', fmt$(s.revenue), 'bg-emerald-50 text-emerald-600', '$')}
              {stat('Conversion Rate', `${s.conversion}%`, 'bg-pink-50 text-pink-600', '🎯')}
            </div>
          )}

          {view === 'list' && (
            <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px]">
                  <span className="pointer-events-none absolute inset-y-0 left-0 grid place-items-center pl-3 text-slate-400"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg></span>
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search leads by name, email, phone..." className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:bg-white" />
                </div>
                {['All Pipelines','All Sources','All Agents','All Tags','All Products'].map((s, i) => (
                  <select key={i} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option>{s}</option></select>
                ))}
                <button className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                  Filters <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold text-brand-700">1</span>
                </button>
                <button className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700">✕ Clear All</button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 text-xs md:grid-cols-3 lg:grid-cols-7">
                {['Date Range','Pipeline','Source','Agent','Tag','Product','Lead Score'].map((l, i) => (
                  <div key={i}><label className="mb-1 block font-semibold text-slate-600">{l}</label><select className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">{l === 'Date Range' ? <option>May 1, 2024 – May 31, 2024</option> : <option>All {l}s</option>}</select></div>
                ))}
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">Reset</button>
                <button className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">Apply Filters</button>
              </div>
            </div>
          )}

          {/* Tabs row */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              {[['all','All Leads',s.total],['my','My Leads',s.mine],['archived','Archived',source.filter((l)=>l.archived).length]].map(([id, lbl, n]) => (
                <button key={id} onClick={() => setTab(id)} className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm ${tab === id ? 'border-brand-500 text-brand-600 font-semibold' : 'border-transparent text-slate-500 font-medium hover:text-slate-700'}`}>{lbl} <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${tab === id ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600'}`}>{n}</span></button>
              ))}
            </div>
            <div className="flex items-center gap-2 pb-2">
              <div className="flex overflow-hidden rounded-lg border border-slate-200">
                <button onClick={() => setView('kanban')} className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold ${view === 'kanban' ? 'bg-brand-600 text-white' : 'hover:bg-slate-50'}`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="18"/><rect x="14" y="3" width="7" height="11"/></svg>
                  Kanban View
                </button>
                <button onClick={() => setView('list')} className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold ${view === 'list' ? 'bg-brand-600 text-white' : 'hover:bg-slate-50'}`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/></svg>
                  List View
                </button>
              </div>
              <button className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold">Sort By: Last Activity <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg></button>
            </div>
          </div>

          {view === 'list' ? <LeadsTable rows={rows} onOpen={(id) => navigate(`/leads/${id}`)} /> : <LeadsKanban leads={source} onOpen={(id) => navigate(`/leads/${id}`)} />}
        </main>
      </div>
    </div>
  )
}

function LeadsTable({ rows, onOpen }) {
  return (
    <>
      <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-3 text-left">Created On</th>
              <th className="px-3 py-3 text-left">Lead Name</th>
              <th className="px-3 py-3 text-left">Company / School</th>
              <th className="px-3 py-3 text-left">Source</th>
              <th className="px-3 py-3 text-left">Product</th>
              <th className="px-3 py-3 text-left">Pipeline</th>
              <th className="px-3 py-3 text-left">Lead Score</th>
              <th className="px-3 py-3 text-left">Status</th>
              <th className="px-3 py-3 text-left">Estimated Value</th>
              <th className="px-3 py-3 text-left">Assigned To</th>
              <th className="px-3 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((l) => (
              <tr key={l.id} onClick={() => onOpen(l.id)} className="cursor-pointer hover:bg-slate-50">
                <td className="px-3 py-3 text-sm">{l.created}<div className="text-[10px] text-slate-400">{l.createdTime}</div></td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <span className={`grid h-8 w-8 place-items-center rounded-full ${l.av} text-xs font-bold text-white`}>{l.initials}</span>
                    <div>
                      <div className="font-semibold">{l.name}</div>
                      {l.badge && <span className="inline-flex items-center gap-0.5 rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">🔥 {l.badge}</span>}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-sm">{l.company}</td>
                <td className="px-3 py-3 text-sm">{l.source}</td>
                <td className="px-3 py-3 text-sm">{l.product}<div className="text-[10px] text-slate-500">{l.units}</div></td>
                <td className="px-3 py-3"><span className={`text-xs font-semibold ${l.pipelineCls}`}>● {l.pipeline}</span></td>
                <td className="px-3 py-3 text-sm font-semibold"><span className={SCORE_CLS(l.score)}>{l.score}</span><span className="text-slate-400">/100</span></td>
                <td className="px-3 py-3"><span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${l.statusCls}`}>{l.status}</span></td>
                <td className="px-3 py-3 text-sm font-semibold">{fmt$(l.value)}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-1.5">
                    <img alt="" src={`https://i.pravatar.cc/20?u=${encodeURIComponent(l.agent)}`} className="h-5 w-5 rounded-full" />
                    <span className="text-xs">{l.agent}</span>
                  </div>
                </td>
                <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}><button className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
        <span>Showing {rows.length === 0 ? 0 : 1} to {rows.length} of {rows.length} leads</span>
        <div className="flex items-center gap-1">
          <button className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm font-semibold text-white">1</button>
        </div>
        <div className="flex items-center gap-1"><span>Show</span><select className="rounded-md border border-slate-200 bg-white px-1.5 py-1"><option>10</option><option>20</option><option>50</option></select><span>per page</span></div>
      </div>
    </>
  )
}

function LeadsKanban({ leads = [], onOpen }) {
  const cardsByStage = PIPELINE_STAGES.reduce((acc, s) => {
    acc[s.key] = leads.filter((l) => l.pipeline === s.key)
    return acc
  }, {})
  return (
    <div className="mt-5 grid grid-flow-col gap-4 overflow-x-auto pb-4" style={{ gridAutoColumns: 'minmax(260px, 1fr)' }}>
      {PIPELINE_STAGES.map((stage) => {
        const cards = cardsByStage[stage.key]
        const est = cards.reduce((a, l) => a + (l.value || 0), 0)
        return (
        <div key={stage.key} className="rounded-xl bg-slate-50/60 p-3">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold"><span className={`h-2.5 w-2.5 rounded-full ${stage.dot}`}></span>{stage.key}</div>
            <span className="text-xs font-bold text-slate-500">{cards.length}</span>
          </div>
          <div className="mb-3 text-[11px] text-slate-500">Est. Value: {fmt$(est)}</div>
          <div className="space-y-2">
            {cardsByStage[stage.key].map((l) => (
              <div key={l.id} onClick={() => onOpen(l.id)} className="cursor-pointer rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm hover:shadow-md">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`grid h-7 w-7 place-items-center rounded-full ${l.av} text-[10px] font-bold text-white`}>{l.initials}</span>
                    <div>
                      <div className="text-sm font-semibold">{l.name}</div>
                      <div className="text-[10px] text-slate-500">{l.company}</div>
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-[11px] text-slate-500">+ {l.units}</div>
                <div className="mt-2 flex items-center justify-between">
                  {l.badge ? <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">🔥 Hot Lead</span>
                    : <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Warm Lead</span>}
                  <span className="text-sm font-bold">{fmt$(l.value)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                  <span>Source: {l.source}</span><span>2m ago</span>
                </div>
                <div className="mt-2 flex gap-1">
                  <button className="flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold hover:bg-slate-50">Open</button>
                  <button className="flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-50">Quote</button>
                </div>
              </div>
            ))}
            <button className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 py-2 text-xs font-semibold text-brand-600 hover:bg-white">+ Add Lead</button>
          </div>
        </div>
        )
      })}
    </div>
  )
}
