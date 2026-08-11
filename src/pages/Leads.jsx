import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SidebarCrm from '../components/SidebarCrm.jsx'
import TopBarUser from '../components/TopBarUser.jsx'
import { useToast } from '../components/ToastContext.jsx'
import { FlagChip, FLAG_COLORS, ManageFlagsModal } from '../components/CustomerFlags.jsx'
import { api } from '../lib/api.js'
import { can } from '../lib/auth.js'

// --- helpers ---
const fmt$ = (n) => (n == null || n === '' || Number(n) === 0) ? '—' : `$${Number(n).toLocaleString()}`
const fmtDateTime = (ts) => ts ? new Date(Number(ts)).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'
// "kitni der pehle" — pending/elapsed duration since a timestamp (ms)
const agoStr = (ts) => {
  if (!ts) return '—'
  let s = Math.max(0, Math.floor((Date.now() - Number(ts)) / 1000))
  const d = Math.floor(s / 86400); s -= d * 86400
  const h = Math.floor(s / 3600); s -= h * 3600
  const m = Math.floor(s / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}
const leadNo = (id) => { const d = String(id || '').replace(/\D/g, ''); return 'LD-' + (d.slice(-6) || '000000') }
const QUOTE_STAGES = ['Quotation', 'Quoted', 'Quote Sent', 'Proposal', 'Artwork Approval', 'Payment Pending']
const ORDER_STAGES = ['Order Confirmed', 'Ready to Order', 'Completed', 'In Production']
const AVATAR_BG = ['bg-brand-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-sky-500', 'bg-violet-500', 'bg-teal-500', 'bg-pink-500']
const avatarFor = (name, id) => { const s = String(id || name || ''); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return AVATAR_BG[h % AVATAR_BG.length] }
const initialsOf = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?'
const scoreCls = (s) => s >= 70 ? 'bg-emerald-500' : s >= 40 ? 'bg-amber-500' : 'bg-slate-300'
const FSEL = 'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 outline-none focus:border-brand-400'

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
  { key: 'tags', header: 'Tags', always: true },
  { key: 'assign', header: 'Assign', has: () => can('cap:assign_chats') },   // admin: chat kis agent ko
  { key: 'source', header: 'Source', has: (l) => !!l._source },
  { key: 'stage', header: 'Stage', has: (l) => !!l._stage },
  { key: 'status', header: 'Lead Status', has: (l) => !!l._status },
  // Chat / last-message columns (real data from app.messages)
  { key: 'lastBy', header: 'Last Msg By', has: (l) => !!l._lastBy },
  { key: 'lastName', header: 'Sender', has: (l) => !!l._lastBy },
  { key: 'messages', header: 'Message', has: (l) => !!l._lastBy },
  { key: 'lastTime', header: 'Last Msg Time', has: (l) => !!l._lastAt },
  { key: 'pending', header: 'Pending Since', has: (l) => !!l._lastAt },
  { key: 'actions', header: 'Actions', always: true, right: true },
]

// Multi-agent assign — checkbox dropdown. Ek chat ko kai agents ko assign/unassign karo.
const asArr = (v) => Array.isArray(v) ? v.map(String) : (v == null || v === '' ? [] : [String(v)])
function AssignCell({ cid, agents, value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  const ids = asArr(value)
  const toggle = (id) => {
    const sid = String(id)
    const next = ids.includes(sid) ? ids.filter((x) => x !== sid) : [...ids, sid]
    onChange(cid, next)
  }
  const chosen = ids.map((id) => agents.find((a) => String(a.id) === id)).filter(Boolean)
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)}
        className="flex w-[150px] items-center justify-between gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] hover:border-brand-300">
        <span className={`truncate ${chosen.length ? 'font-medium text-slate-700' : 'text-slate-400'}`}>
          {chosen.length === 0 ? 'Assign…' : chosen.length === 1 ? (chosen[0].name || chosen[0].email) : `${chosen.length} agents`}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 text-slate-400"><path d="m6 9 6 6 6-6"/></svg>
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-1 max-h-56 w-56 overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
          {agents.length === 0 ? (
            <div className="px-2 py-2 text-[11px] text-slate-400">No agents found</div>
          ) : (<>
            {agents.map((a) => {
              const on = ids.includes(String(a.id))
              return (
                <button key={a.id} onClick={() => toggle(a.id)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-slate-50 ${on ? 'font-semibold text-brand-700' : 'text-slate-600'}`}>
                  <span className={`grid h-4 w-4 shrink-0 place-items-center rounded border text-[10px] ${on ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-300'}`}>{on ? '✓' : ''}</span>
                  <span className="truncate">{a.name || a.email}</span>
                </button>
              )
            })}
            {ids.length > 0 && (
              <button onClick={() => onChange(cid, [])}
                className="mt-1 w-full rounded-md border-t border-slate-100 px-2 py-1.5 text-left text-[11px] font-semibold text-rose-600 hover:bg-rose-50">Clear all</button>
            )}
          </>)}
        </div>
      )}
    </div>
  )
}

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
  // Filters session me yaad — chat khol ke wapas aane par reset na ho. Default sirf pehli baar.
  const sv = (() => { try { return JSON.parse(sessionStorage.getItem('leadsFilters') || '{}') } catch { return {} } })()
  const [data, setData] = useState(null)
  const [query, setQuery] = useState(sv.query ?? '')
  const [period, setPeriod] = useState(sv.period ?? 'today')   // pehli baar: daily metrics
  const [stage, setStage] = useState(sv.stage ?? ''); const [status, setStatus] = useState(sv.status ?? ''); const [source, setSource] = useState(sv.source ?? '')
  const [from, setFrom] = useState(sv.from ?? ''); const [to, setTo] = useState(sv.to ?? '')
  const [page, setPage] = useState(sv.page ?? 1); const [perPage, setPerPage] = useState(sv.perPage ?? 10)
  const [menuId, setMenuId] = useState(null)
  const [pendingFrom, setPendingFrom] = useState(sv.pendingFrom ?? 'agent')   // pehli baar: agent to reply
  const [activeOnly, setActiveOnly] = useState(sv.activeOnly ?? false)        // sirf Active status wale leads
  const [tagFilter, setTagFilter] = useState(sv.tagFilter ?? [])              // selected tag ids
  const [untagged, setUntagged] = useState(sv.untagged ?? false)             // sirf bina-tag wale leads
  const [tagFilterOpen, setTagFilterOpen] = useState(false)
  const tagFilterRef = useRef(null)
  useEffect(() => { const h = (e) => { if (tagFilterRef.current && !tagFilterRef.current.contains(e.target)) setTagFilterOpen(false) }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h) }, [])
  // Column show/hide — user preference (localStorage). 'show'/'hide' set kare to auto-hide ko override karta hai.
  const [colPref, setColPref] = useState(() => { try { return JSON.parse(localStorage.getItem('leadsColPref') || '{}') } catch { return {} } })
  useEffect(() => { localStorage.setItem('leadsColPref', JSON.stringify(colPref)) }, [colPref])
  const [colMenuOpen, setColMenuOpen] = useState(false)
  const colMenuRef = useRef(null)
  useEffect(() => { const h = (e) => { if (colMenuRef.current && !colMenuRef.current.contains(e.target)) setColMenuOpen(false) }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h) }, [])
  const setCol = (key, show) => setColPref((p) => ({ ...p, [key]: show ? 'show' : 'hide' }))
  // Tags (inbox jaise flags) — leads page se bhi lagao/hatao
  const [flags, setFlags] = useState([])
  const [manageFlagsOpen, setManageFlagsOpen] = useState(false)
  const loadFlags = () => api.get('/api/flags').then(setFlags).catch(() => setFlags([]))
  useEffect(() => { loadFlags() }, [])
  const setLeadTags = (l, next) => {
    setData((prev) => (prev || []).map((x) => x._cid === l._cid ? { ...x, _tags: next } : x))   // optimistic
    if (l._cid) api.patch(`/api/conversations/${encodeURIComponent(l._cid)}`, { tags: next }).catch(() => {})
  }
  const [msgPopup, setMsgPopup] = useState(null)   // { cid, name } — messages popup
  const [summaryPopup, setSummaryPopup] = useState(null)   // { cid, name } — AI summary popup
  const [tagPopup, setTagPopup] = useState(null)   // lead — tag picker popup
  // Chat assignment (admin) — agents list + current { cid: userId } map
  const canAssign = can('cap:assign_chats')
  const [agents, setAgents] = useState([])
  const [assignMap, setAssignMap] = useState({})
  useEffect(() => {
    if (!canAssign) return
    Promise.all([api.get('/api/users').catch(() => []), api.get('/api/assignments').catch(() => ({}))])
      .then(([us, map]) => { setAgents(Array.isArray(us) ? us : (us?.users || [])); setAssignMap(map && typeof map === 'object' ? map : {}) })
  }, [canAssign])
  // userIds = poori list (multi-select). Ek chat kai agents ko assign ho sakta hai.
  const assignChat = async (cid, userIds) => {
    if (!cid) return
    const prev = assignMap[cid]
    setAssignMap((m) => ({ ...m, [cid]: userIds }))   // optimistic
    try {
      await api.post(`/api/conversations/${encodeURIComponent(cid)}/assign`, { userIds })
      toast(userIds.length ? `Assigned to ${userIds.length} agent${userIds.length > 1 ? 's' : ''}` : 'Unassigned', 'success')
    } catch (e) { setAssignMap((m) => ({ ...m, [cid]: prev })); toast(e.message || 'Assign failed', 'error') }
  }
  // Bulk select + bulk tag
  const [selected, setSelected] = useState(() => new Set())
  const [bulkTagOpen, setBulkTagOpen] = useState(null)   // 'add' | 'remove' | null
  const bulkRef = useRef(null)
  useEffect(() => { const h = (e) => { if (bulkRef.current && !bulkRef.current.contains(e.target)) setBulkTagOpen(null) }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h) }, [])
  const toggleRow = (cid) => setSelected((s) => { const n = new Set(s); n.has(cid) ? n.delete(cid) : n.add(cid); return n })
  const clearSel = () => setSelected(new Set())
  const applyBulkTag = (flagId, add) => {
    const cids = [...selected]
    setData((prev) => (prev || []).map((l) => {
      if (!cids.includes(l._cid)) return l
      const cur = Array.isArray(l._tags) ? l._tags : []
      const has = cur.includes(flagId)
      if (add ? has : !has) return l                                  // already in desired state
      const next = add ? [...cur, flagId] : cur.filter((x) => x !== flagId)
      api.patch(`/api/conversations/${encodeURIComponent(l._cid)}`, { tags: next }).catch(() => {})
      return { ...l, _tags: next }
    }))
    toast(`${add ? 'Tag added to' : 'Tag removed from'} ${cids.length} lead(s)`, 'success')
    setBulkTagOpen(null)
  }

  // Real enriched leads seedhe DB se (/api/leads/list): intent_score, temperature,
  // purchase_probability, estimated_value, primary_product — sab dynamic. Har 20s refetch.
  useEffect(() => {
    let cancelled = false
    const load = () => api.get('/api/leads-list').catch(() => [])
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
          _lastBy: l.last_by || '',            // 'in' = customer, 'out' = agent
          _lastAgent: l.last_agent || '',
          _lastAt: Number(l.last_at) || 0,
          _lastText: l.last_text || '',
          _tags: Array.isArray(l.tags) ? l.tags : [],
        }))
        setData(merged)
      })
    load()
    const t = setInterval(load, 7000)   // live-ish: last message / pending / who-replied auto-refresh
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
      if (pendingFrom === 'agent' && l._lastBy !== 'in') return false        // agent ko reply karna hai (customer ne last bheja)
      if (pendingFrom === 'customer' && l._lastBy !== 'out') return false     // customer ko reply karna hai (agent ne last bheja)
      if (untagged) { if (Array.isArray(l._tags) && l._tags.length) return false }         // sirf bina-tag wale
      else if (tagFilter.length && !(Array.isArray(l._tags) && l._tags.some((t) => tagFilter.includes(t)))) return false   // selected tags me se koi ek
      if (activeOnly && String(l._status || '').toLowerCase() !== 'active') return false
      if (q) { const hay = `${l.name || ''} ${l.company || ''} ${l._source} ${leadNo(l._cid)}`.toLowerCase(); if (!hay.includes(q)) return false }
      return true
    }).sort((a, b) => b._firstTs - a._firstTs)
  }, [inPeriod, stage, status, source, query, pendingFrom, tagFilter, activeOnly, untagged])

  // stat cards (over the selected period)
  const s = useMemo(() => ({
    total: inPeriod.length,
    engaged: inPeriod.filter((l) => l._lastOut > 0).length,
    qualified: inPeriod.filter((l) => l._score >= 60).length,
    hot: inPeriod.filter((l) => l._temp === 'hot' || l._score >= 80).length,
    quotes: inPeriod.filter((l) => QUOTE_STAGES.includes(l._stage)).length,
    orders: inPeriod.filter((l) => ORDER_STAGES.includes(l._stage)).length,
  }), [inPeriod])

  // filter badalne par page 1 par jao — par pehle mount (restore) par nahi.
  const firstRun = useRef(true)
  useEffect(() => { if (firstRun.current) { firstRun.current = false; return } setPage(1) }, [query, period, stage, status, source, perPage, pendingFrom, tagFilter, activeOnly, untagged])
  // Session me filters + page yaad rakho.
  useEffect(() => { sessionStorage.setItem('leadsFilters', JSON.stringify({ query, period, stage, status, source, from, to, page, perPage, pendingFrom, activeOnly, tagFilter, untagged })) }, [query, period, stage, status, source, from, to, page, perPage, pendingFrom, activeOnly, tagFilter, untagged])
  // Date fields ko top period tabs ke saath sync rakho (custom chhod ke).
  useEffect(() => {
    if (period === 'custom') return
    const r = periodRange(period)
    const s = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
    setFrom(r.from ? s(r.from) : '')                          // 'all' -> khaali
    setTo(period === 'all' ? '' : s(Date.now()))             // rolling periods -> aaj tak
  }, [period])
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const pageRows = filtered.slice((page - 1) * perPage, page * perPage)
  const pageCids = pageRows.filter((l) => l._cid).map((l) => l._cid)
  const allPageSelected = pageCids.length > 0 && pageCids.every((c) => selected.has(c))
  const toggleAllPage = () => setSelected((s) => { const n = new Set(s); if (pageCids.every((c) => n.has(c))) pageCids.forEach((c) => n.delete(c)); else pageCids.forEach((c) => n.add(c)); return n })
  const anyFilter = stage || status || source || query || pendingFrom || tagFilter.length || activeOnly || untagged
  const clearAll = () => { setStage(''); setStatus(''); setSource(''); setQuery(''); setPeriod('all'); setPendingFrom(''); setTagFilter([]); setActiveOnly(false); setUntagged(false) }

  // Chat ek hi reusable "chat tab" mein khulti hai: fixed window-name se doosri lead pe click
  // karne par naya tab nahi banta — wahi tab nayi chat pe chala jaata hai (band ho to naya khulta hai).
  const openChat = (cid) => { if (!cid) return; const w = window.open(`/dashboard?conv=${encodeURIComponent(cid)}`, 'crm_chat'); if (w) w.focus() }
  const openMessenger = async (cid) => {
    const w = window.open('', '_blank')
    try { const r = await api.get(`/api/meta/messenger-link/${encodeURIComponent(cid)}`); if (w) w.location.href = r?.url || 'https://business.facebook.com/latest/inbox/all' }
    catch { if (w) w.location.href = 'https://business.facebook.com/latest/inbox/all' }
  }

  // Sirf wahi columns dikhao jinme kam-se-kam ek lead ka data ho (dynamic).
  // Column visible? user preference (show/hide) auto-hide ko override karti hai; warna always ya jab data ho.
  const colVisible = (c) => {
    if (colPref[c.key] === 'show') return true
    if (colPref[c.key] === 'hide') return false
    return c.always || filtered.some((l) => c.has && c.has(l))
  }
  const activeCols = useMemo(() => LEAD_COLUMNS.filter(colVisible), [filtered, colPref])
  const hiddenCols = LEAD_COLUMNS.filter((c) => !colVisible(c))

  const cellFor = (key, l, rowKey) => {
    switch (key) {
      case 'leadNo': return <span className="font-semibold text-brand-700">{leadNo(l._cid)}</span>
      case 'date': return <span className="whitespace-nowrap text-slate-600">{fmtDateTime(l._firstTs)}</span>
      case 'name': return (
        <div className="flex items-center gap-2">
          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${avatarFor(l.name, l._cid)} text-xs font-bold text-white`}>{initialsOf(l.name)}</span>
          <span className="font-semibold text-slate-800">{l.name || 'Unknown'}</span>
        </div>)
      case 'assign': {
        if (!canAssign) return null
        if (!l._cid) return <span className="text-slate-300">—</span>
        return <AssignCell cid={l._cid} agents={agents} value={assignMap[l._cid]} onChange={assignChat} />
      }
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
      case 'lastBy': return l._lastBy === 'out'
        ? <span className="rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">Agent</span>
        : l._lastBy === 'in'
        ? <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Customer</span>
        : <span className="text-slate-300">—</span>
      case 'lastName': return <span className="whitespace-nowrap text-slate-700">{l._lastBy === 'in' ? (l.name || 'Customer') : l._lastBy === 'out' ? (l._lastAgent || 'Agent') : '—'}</span>
      case 'messages': return l._lastBy ? (
        <div className="flex items-center gap-1">
          <button onClick={() => setMsgPopup({ cid: l._cid, name: l.name })} title="View messages"
            className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>
          </button>
          <button onClick={() => setSummaryPopup({ cid: l._cid, name: l.name })} title="View summary"
            className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-600">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>
          </button>
        </div>
      ) : <span className="text-slate-300">—</span>
      case 'lastTime': return <span className="whitespace-nowrap text-slate-600">{fmtDateTime(l._lastAt)}</span>
      case 'pending': return l._lastAt
        ? <span className={`whitespace-nowrap font-semibold ${l._lastBy === 'in' ? 'text-rose-600' : 'text-slate-500'}`}>{agoStr(l._lastAt)}</span>
        : <span className="text-slate-300">—</span>
      case 'tags': {
        if (!l._cid) return <span className="text-slate-300">—</span>
        const chips = (Array.isArray(l._tags) ? l._tags : []).map((id) => flags.find((f) => f.id === id)).filter(Boolean)
        return (
          <div className="flex flex-wrap items-center gap-1">
            {chips.map((f) => <FlagChip key={f.id} flag={f} />)}
            <button onClick={() => setTagPopup(l)} title="Edit tags"
              className="grid h-5 w-5 place-items-center rounded-md border border-dashed border-slate-300 text-slate-400 hover:border-brand-400 hover:text-brand-600">+</button>
          </div>
        )
      }
      case 'actions': return (
        <RowMenu open={menuId === rowKey} onToggle={() => setMenuId(menuId === rowKey ? null : rowKey)}
          onChat={() => { setMenuId(null); openChat(l._cid) }}
          onDetails={() => { setMenuId(null); navigate(`/leads/${encodeURIComponent(l._cid)}`) }}
          onMessenger={/^(fb|ig):/.test(String(l._cid || '')) ? () => { setMenuId(null); openMessenger(l._cid) } : null} />)
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
            {/* Columns show/hide manager */}
            <div className="relative" ref={colMenuRef}>
              <button onClick={() => setColMenuOpen((o) => !o)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold hover:bg-slate-50">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18"/></svg>
                Columns{hiddenCols.length ? ` · ${hiddenCols.length} hidden` : ''}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
              </button>
              {colMenuOpen && (
                <div className="absolute right-0 z-30 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                  <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Show / hide columns</div>
                  <div className="max-h-72 overflow-y-auto">
                    {LEAD_COLUMNS.map((c) => {
                      const vis = colVisible(c)
                      return (
                        <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50">
                          <input type="checkbox" checked={vis} onChange={() => setCol(c.key, !vis)} />
                          <span className="flex-1 text-slate-700">{c.header}</span>
                          <span className={`text-[10px] font-semibold ${vis ? 'text-emerald-600' : 'text-slate-400'}`}>{vis ? 'shown' : 'hidden'}</span>
                        </label>
                      )
                    })}
                  </div>
                  <button onClick={() => setColPref({})} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Reset to default</button>
                </div>
              )}
            </div>
            {/* Manage Tags — same tag set as the Inbox */}
            <button onClick={() => setManageFlagsOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold hover:bg-slate-50">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1"/></svg>
              Manage Tags
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
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Total Inquiries" value={s.total.toLocaleString()} sub="in period" tint="bg-sky-50 text-sky-600" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>} />
            <StatCard label="Engaged" value={s.engaged.toLocaleString()} sub="we replied" tint="bg-violet-50 text-violet-600" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>} />
            <StatCard label="Qualified" value={s.qualified.toLocaleString()} sub="score ≥ 60" tint="bg-emerald-50 text-emerald-600" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>} />
            <StatCard label="Hot Leads" value={s.hot.toLocaleString()} sub="score ≥ 80" tint="bg-rose-50 text-rose-600" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>} />
          </div>

          {/* Filters — compact, ek saaf row (chhoti screen par neatly wrap) */}
          <div className="mt-4 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
            <div className="flex flex-wrap items-end gap-2.5">
              <div className="min-w-[140px] flex-1"><label className="mb-1 block text-[11px] font-semibold text-slate-500">Lead Stage</label>
                <select value={stage} onChange={(e) => setStage(e.target.value)} className={FSEL}><option value="">All</option>{stages.map((x) => <option key={x} value={x}>{x}</option>)}</select></div>
              <div className="min-w-[140px] flex-1"><label className="mb-1 block text-[11px] font-semibold text-slate-500">Lead Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className={FSEL}><option value="">All</option>{statuses.map((x) => <option key={x} value={x}>{x}</option>)}</select></div>
              <div className="min-w-[130px] flex-1"><label className="mb-1 block text-[11px] font-semibold text-slate-500">Source</label>
                <select value={source} onChange={(e) => setSource(e.target.value)} className={FSEL}><option value="">All</option>{sources.map((x) => <option key={x} value={x}>{x}</option>)}</select></div>
              <div className="min-w-[150px] flex-1"><label className="mb-1 block text-[11px] font-semibold text-slate-500">Waiting for?</label>
                <select value={pendingFrom} onChange={(e) => setPendingFrom(e.target.value)} className={FSEL}>
                  <option value="">All</option>
                  <option value="agent">Agent (needs to reply)</option>
                  <option value="customer">Customer (their reply)</option>
                </select></div>
              <div className="min-w-[130px] flex-1"><label className="mb-1 block text-[11px] font-semibold text-slate-500">Tags</label>
                <div className="relative" ref={tagFilterRef}>
                  <button onClick={() => setTagFilterOpen((o) => !o)} className={`${FSEL} flex items-center justify-between gap-1`}>
                    <span className="truncate text-slate-600">{untagged ? 'Untagged' : tagFilter.length ? `${tagFilter.length} selected` : 'All'}</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                  </button>
                  {tagFilterOpen && (
                    <div className="absolute left-0 top-full z-30 mt-1 max-h-60 w-56 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                      {flags.length > 0 && (
                        <div className="flex items-center gap-1 px-1 pb-1">
                          <button onClick={() => { setUntagged(false); setTagFilter(flags.map((f) => f.id)) }} className="flex-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200">Select all</button>
                          <button onClick={() => { setUntagged(false); setTagFilter([]) }} className="flex-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200">Unselect all</button>
                        </div>
                      )}
                      <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm font-semibold hover:bg-slate-50">
                        <input type="checkbox" checked={untagged} onChange={() => { setUntagged((u) => !u); if (!untagged) setTagFilter([]) }} />
                        <span className="flex-1">Untagged (no tags)</span>
                      </label>
                      <div className="my-1 border-t border-slate-100" />
                      {flags.length === 0 && <div className="px-2 py-1.5 text-xs text-slate-400">No tags yet</div>}
                      {flags.map((f) => { const on = tagFilter.includes(f.id); const c = FLAG_COLORS[f.color] || FLAG_COLORS.slate; return (
                        <label key={f.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50">
                          <input type="checkbox" checked={on} onChange={() => { setUntagged(false); setTagFilter((s) => on ? s.filter((x) => x !== f.id) : [...s, f.id]) }} />
                          <span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} /><span className="flex-1">{f.name}</span>
                        </label>
                      )})}
                    </div>
                  )}
                </div></div>
              {period === 'custom' && (
                <div className="min-w-[230px]"><label className="mb-1 block text-[11px] font-semibold text-slate-500">Date range <span className="font-normal text-slate-400">(YYYY-MM-DD)</span></label>
                  <div className="flex items-center gap-1">
                    <input type="text" inputMode="numeric" value={from} onChange={(e) => { setFrom(e.target.value); setPeriod('custom'); setPage(1) }} placeholder="From" className="w-[104px] rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-brand-400" />
                    <span className="text-slate-400">–</span>
                    <input type="text" inputMode="numeric" value={to} onChange={(e) => { setTo(e.target.value); setPeriod('custom'); setPage(1) }} placeholder="To" className="w-[104px] rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-brand-400" />
                  </div>
                </div>
              )}
              <label className={`inline-flex h-[34px] shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold ${activeOnly ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} /> Active
              </label>
              {anyFilter && <button onClick={clearAll} className="inline-flex h-[34px] shrink-0 items-center gap-1 rounded-lg px-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-100">✕ Clear</button>}
            </div>
          </div>

          {/* Bulk action bar — jab kuch rows select ho */}
          {selected.size > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5">
              <span className="text-sm font-semibold text-brand-800">{selected.size} selected</span>
              <div className="relative" ref={bulkRef}>
                <div className="flex items-center gap-2">
                  <button onClick={() => setBulkTagOpen((o) => o === 'add' ? null : 'add')} className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-white px-3 py-1.5 text-sm font-semibold text-brand-700 hover:bg-brand-100">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1"/></svg>
                    Add tag
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                  </button>
                  <button onClick={() => setBulkTagOpen((o) => o === 'remove' ? null : 'remove')} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-sm font-semibold text-rose-600 hover:bg-rose-50">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m-9 0v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V6"/></svg>
                    Remove tag
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                  </button>
                </div>
                {bulkTagOpen && (
                  <div className="absolute left-0 top-full z-30 mt-1 w-60 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                    <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">{bulkTagOpen === 'add' ? 'Add tag to selected' : 'Remove tag from selected'}</div>
                    {flags.length === 0 && <div className="px-2 py-1.5 text-xs text-slate-400">No tags. Create some with "Manage Tags".</div>}
                    {flags.map((f) => { const c = FLAG_COLORS[f.color] || FLAG_COLORS.slate; return (
                      <button key={f.id} onClick={() => applyBulkTag(f.id, bulkTagOpen === 'add')} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50">
                        <span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} /><span className="flex-1 text-left">{f.name}</span>
                        {bulkTagOpen === 'remove' && <span className="text-rose-500">✕</span>}
                      </button>
                    )})}
                    <button onClick={() => { setBulkTagOpen(null); setManageFlagsOpen(true) }} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Manage Tags</button>
                  </div>
                )}
              </div>
              <button onClick={clearSel} className="ml-auto text-sm font-semibold text-slate-500 hover:text-slate-700">Clear selection</button>
            </div>
          )}

          {/* Table — columns dynamic (khaali column apne aap chhup jaate hain) */}
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-card">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-10 px-3 py-3"><input type="checkbox" checked={allPageSelected} onChange={toggleAllPage} title="Select all on this page" /></th>
                  {activeCols.map((c) => (
                    <th key={c.key} className={`px-3 py-3 font-semibold ${c.right ? 'text-right' : 'text-left'}`}>
                      <span className={`group/th inline-flex items-center gap-1 ${c.right ? 'flex-row-reverse' : ''}`}>
                        {c.header}
                        {c.key !== 'actions' && (
                          <button onClick={() => setCol(c.key, false)} title="Hide this column" aria-label="Hide column"
                            className="text-slate-300 opacity-0 transition hover:text-rose-500 group-hover/th:opacity-100">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
                          </button>
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data === null ? (
                  <tr><td colSpan={activeCols.length + 1} className="px-3 py-10 text-center text-sm text-slate-400">Loading leads…</td></tr>
                ) : pageRows.length === 0 ? (
                  <tr><td colSpan={activeCols.length + 1} className="px-3 py-10 text-center text-sm text-slate-400">No leads found. {anyFilter && <button onClick={clearAll} className="font-semibold text-brand-600 underline">Clear filters</button>}</td></tr>
                ) : pageRows.map((l, i) => {
                  const rowKey = `${l._cid || 'nocid'}#${i}`   // per-row unique — Unknown leads share a blank _cid
                  return (
                  <tr key={rowKey} onClick={() => openChat(l._cid)} className={`cursor-pointer transition hover:bg-brand-50/40 ${l._cid && selected.has(l._cid) ? 'bg-brand-50/60' : ''}`}>
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>{l._cid ? <input type="checkbox" checked={selected.has(l._cid)} onChange={() => toggleRow(l._cid)} /> : null}</td>
                    {activeCols.map((c) => (
                      <td key={c.key} className={`px-3 py-3 ${c.right ? 'text-right' : ''}`} onClick={(c.key === 'actions' || c.key === 'tags' || c.key === 'messages' || c.key === 'assign') ? (e) => e.stopPropagation() : undefined}>{cellFor(c.key, l, rowKey)}</td>
                    ))}
                  </tr>
                )})}
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
      {manageFlagsOpen && <ManageFlagsModal flags={flags} onClose={() => setManageFlagsOpen(false)} onChanged={loadFlags} />}
      {msgPopup && <MsgPopup cid={msgPopup.cid} name={msgPopup.name} onClose={() => setMsgPopup(null)} />}
      {summaryPopup && <SummaryPopup cid={summaryPopup.cid} name={summaryPopup.name} onClose={() => setSummaryPopup(null)} />}
      {tagPopup && <TagPopup lead={tagPopup} flags={flags} onClose={() => setTagPopup(null)}
        onSave={(next) => setLeadTags(tagPopup, next)} onManage={() => { setTagPopup(null); setManageFlagsOpen(true) }} />}
    </div>
  )
}

// Messages popup — customer/agent ke messages (kaunsa customer ka, kaunsa hamra)
function MsgPopup({ cid, name, onClose }) {
  const [msgs, setMsgs] = useState(null)
  const [view, setView] = useState('normal')   // 'normal' | 'max' | 'min' — window controls
  const bottomRef = useRef(null)
  const lenRef = useRef(0)
  useEffect(() => {
    let cancel = false
    const load = () => api.get(`/api/conversations/${encodeURIComponent(cid)}/messages`)
      .then((r) => { if (!cancel) setMsgs(Array.isArray(r) ? r : []) })
      .catch(() => {})
    load()
    const t = setInterval(load, 5000)   // popup khula ho to naye messages live aayein
    return () => { cancel = true; clearInterval(t) }
  }, [cid])
  // naye message aane par hi neeche scroll (warna user upar padh raha ho to yank na ho)
  useEffect(() => { if (msgs && msgs.length !== lenRef.current) { lenRef.current = msgs.length; bottomRef.current?.scrollIntoView({ block: 'end' }) } }, [msgs])
  useEffect(() => { if (view !== 'min') bottomRef.current?.scrollIntoView({ block: 'end' }) }, [view])   // restore/maximize par neeche scroll
  // Inbox jaise `ts` se sort (stable) — recent hamesha neeche. created_at re-ingest par badalta hai.
  const list = (msgs || []).filter((m) => (m.dir || m.direction) !== 'note')
    .map((m, idx) => ({ m, idx, k: Number(m.ts) || Date.parse(m.created_at) || 0 }))
    .sort((a, b) => (a.k - b.k) || (a.idx - b.idx))
    .map(({ m }) => m)
  const maximized = view === 'max'

  // Minimized: chhota floating bar niche-right — backdrop nahi taaki peeche ki page use ho sake
  if (view === 'min') {
    return (
      <div className="fixed bottom-4 right-4 z-50 w-72 rounded-t-xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-center justify-between rounded-t-xl bg-slate-50 px-3 py-2">
          <button onClick={() => setView('normal')} title="Open" className="truncate text-sm font-bold text-slate-700 hover:text-brand-600">💬 {name || 'Customer'}</button>
          <div className="flex items-center gap-0.5">
            <button onClick={() => setView('normal')} title="Restore" className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="3" width="10" height="10" rx="1.5" /></svg>
            </button>
            <button onClick={onClose} title="Close" className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600">×</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`fixed inset-0 z-50 grid place-items-center bg-black/30 ${maximized ? 'p-2 sm:p-3' : 'p-4'}`} onClick={onClose}>
      <div className={`flex flex-col rounded-xl bg-white shadow-xl ${maximized ? 'h-[92vh] w-full max-w-none' : 'max-h-[80vh] w-full max-w-lg'}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-bold">Messages — {name || 'Customer'}</h3>
          <div className="flex items-center gap-0.5">
            <button onClick={() => setView('min')} title="Minimize" className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="4" y1="11" x2="12" y2="11" /></svg>
            </button>
            <button onClick={() => setView(maximized ? 'normal' : 'max')} title={maximized ? 'Restore' : 'Maximize'} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100">
              {maximized ? (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="5" width="8" height="8" rx="1" /><path d="M6 5V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-1" /></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="3" width="10" height="10" rx="1.5" /></svg>
              )}
            </button>
            <button onClick={onClose} title="Close" className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600">×</button>
          </div>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto bg-slate-50/60 p-4">
          {msgs === null && <div className="py-6 text-center text-sm text-slate-400">Loading…</div>}
          {msgs !== null && list.length === 0 && <div className="py-6 text-center text-sm text-slate-400">No messages.</div>}
          {list.map((m, i) => {
            const out = (m.dir || m.direction) === 'out'
            return (
              <div key={i} className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${out ? 'bg-brand-600 text-white' : 'bg-white text-slate-800 ring-1 ring-slate-200'}`}>
                  <div className={`mb-0.5 text-[10px] font-bold ${out ? 'text-white/70' : 'text-slate-400'}`}>{out ? (m.agent || 'Agent') : (name || 'Customer')}</div>
                  <div className="whitespace-pre-wrap break-words">{m.text || (Array.isArray(m.attachments) && m.attachments.length ? '📎 Attachment' : '')}</div>
                  <div className={`mt-0.5 text-[10px] ${out ? 'text-white/60' : 'text-slate-400'}`}>{m.time || ''}</div>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  )
}

// Summary popup — conversation ka AI summary (Leads se, messages popup jaisa: maximize/close).
function SummaryPopup({ cid, name, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [err, setErr] = useState('')
  const [max, setMax] = useState(false)
  const load = () => {
    setLoading(true)
    api.get(`/api/ai/summary/${encodeURIComponent(cid)}`)
      .then((r) => { setData(r); setErr('') })
      .catch((e) => setErr(e?.message || 'Summary failed'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [cid])
  const generate = () => {
    setWorking(true)
    api.post(`/api/ai/summary/${encodeURIComponent(cid)}`, {})
      .then(() => load())
      .catch((e) => setErr(e?.message || 'Generate failed'))
      .finally(() => setWorking(false))
  }
  const s = data?.summary
  return (
    <div className={`fixed inset-0 z-50 grid place-items-center bg-black/30 ${max ? 'p-2 sm:p-3' : 'p-4'}`} onClick={onClose}>
      <div className={`flex flex-col rounded-xl bg-white shadow-xl ${max ? 'h-[92vh] w-full max-w-none' : 'max-h-[80vh] w-full max-w-lg'}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-bold">Summary — {name || 'Customer'}</h3>
          <div className="flex items-center gap-0.5">
            {s && <button onClick={generate} disabled={working} title="Update summary" className="mr-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-50">{working ? '…' : '↻'}</button>}
            <button onClick={() => setMax((m) => !m)} title={max ? 'Restore' : 'Maximize'} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100">
              {max
                ? <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="5" width="8" height="8" rx="1" /><path d="M6 5V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-1" /></svg>
                : <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="3" width="10" height="10" rx="1.5" /></svg>}
            </button>
            <button onClick={onClose} title="Close" className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600">×</button>
          </div>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 p-4">
          {loading && <div className="py-6 text-center text-sm text-slate-400">Loading summary…</div>}
          {!loading && err && <div className="py-6 text-center text-sm text-rose-500">{err}</div>}
          {!loading && data?.empty && <div className="py-6 text-center text-sm text-slate-400">No messages to summarize.</div>}
          {!loading && !err && !data?.empty && (<>
            {data?.stale && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <span className="text-xs font-semibold text-amber-800">{data.newCount} new message{data.newCount > 1 ? 's' : ''} since this summary.</span>
                <button onClick={generate} disabled={working} className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50">{working ? 'Updating…' : '↻ Update'}</button>
              </div>
            )}
            {s ? (<>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-bold">📝 Conversation summary</div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{s.overview}</p>
              </div>
              {Array.isArray(s.keyPoints) && s.keyPoints.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="text-sm font-bold">Key points</div>
                  <ul className="mt-2 space-y-1.5">
                    {s.keyPoints.map((k, i) => <li key={i} className="flex gap-2 text-sm text-slate-700"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" /><span>{k}</span></li>)}
                  </ul>
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Current status</div>
                  <p className="mt-1 text-sm font-medium text-slate-800">{s.status || '—'}</p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600">Next step</div>
                  <p className="mt-1 text-sm font-medium text-emerald-900">{s.nextStep || '—'}</p>
                </div>
              </div>
              {data?.summaryAt && <div className="text-center text-[11px] text-slate-400">Saved {new Date(data.summaryAt).toLocaleString()}</div>}
            </>) : (
              <div className="rounded-xl border border-dashed border-violet-300 bg-violet-50/40 p-6 text-center">
                <div className="text-sm text-violet-700">No summary yet.</div>
                <button onClick={generate} disabled={working} className="mt-3 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">{working ? 'Generating…' : '✨ Generate summary'}</button>
              </div>
            )}
          </>)}
        </div>
      </div>
    </div>
  )
}

// Tag picker popup — table ke overflow me dropdown clip ho jaata tha, isliye modal.
function TagPopup({ lead, flags, onClose, onSave, onManage }) {
  const [sel, setSel] = useState(Array.isArray(lead._tags) ? lead._tags : [])
  const set = new Set(sel)
  const toggle = (id) => { const next = set.has(id) ? sel.filter((x) => x !== id) : [...sel, id]; setSel(next); onSave(next) }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold">Tags — {lead.name}</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100">×</button>
        </div>
        <div className="max-h-72 space-y-0.5 overflow-y-auto">
          {flags.length === 0 && <div className="py-3 text-center text-sm text-slate-400">No tags. Create some below with "Manage Tags".</div>}
          {flags.map((f) => {
            const on = set.has(f.id); const c = FLAG_COLORS[f.color] || FLAG_COLORS.slate
            return (
              <button key={f.id} onClick={() => toggle(f.id)} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-slate-50">
                <span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} />
                <span className="flex-1 text-left">{f.name}</span>
                {on && <span className="font-bold text-brand-600">✓</span>}
              </button>
            )
          })}
        </div>
        <button onClick={onManage} className="mt-2 w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Manage Tags</button>
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

function RowMenu({ open, onToggle, onChat, onDetails, onMessenger }) {
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
          {onMessenger && <button onClick={onMessenger} className="flex w-full items-center gap-2 px-3 py-2 font-medium text-blue-600 hover:bg-blue-50"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.14.26.35.27.57l.05 1.78c.02.57.6.94 1.12.71l1.99-.88c.17-.07.35-.09.53-.04.91.25 1.88.38 2.8.38 5.64 0 10-4.13 10-9.7C22 6.13 17.64 2 12 2zm6 7.46l-2.94 4.66c-.47.74-1.47.93-2.18.41l-2.34-1.75a.6.6 0 0 0-.72 0l-3.16 2.4c-.42.32-.97-.18-.69-.63l2.94-4.66c.47-.74 1.47-.93 2.18-.41l2.34 1.75c.21.16.51.16.72 0l3.16-2.4c.42-.32.97.18.69.63z"/></svg>Open in Messenger</button>}
        </div>
      )}
    </div>
  )
}
