import { useEffect, useState, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useToast } from '../components/ToastContext.jsx'

// ---- option lists (AI-mapping spec) ----
const INTENTS = ['payment_sent','payment_received','price_offered','price_requested','discount_request','request_proof','payment_detail','order_intent','question','acknowledge','thanks_closing','complaint','follow_up','other']
const PURCHASE = ['payment_intent','high_intent','medium_intent','low_intent','no_intent']
const SIGNALS = ['','price_requested','price_quoted','discount_requested','discount_offered','discount_accepted','quote_sent','quote_accepted','order_intent','payment_sent','payment_received','refund_requested']
const CURRENCY = ['USD','EUR','GBP','CAD','AUD','PKR','INR']
const PAYMETHOD = ['','Bank Transfer','Zelle','PayPal','Cash App','Card','Cash','Crypto','Other']
const STAGES = ['New','Negotiation','Payment Pending','Paid','In Production','Shipped','Completed','Lost']
const SENTIMENT = ['positive','neutral','negative']
const URGENCY = ['low','medium','high']
const ACTIONS = ['','Verify Payment (Await Confirmation)','Send Quote','Request Artwork','Request Payment Proof','Follow Up','Provide Pricing','Escalate to Human','No Action']
const PAGE = 24

const STATUS_BADGE = {
  reviewed: { t: 'Reviewed', c: 'bg-emerald-50 text-emerald-700' },
  needs_review: { t: 'Needs Review', c: 'bg-amber-50 text-amber-700' },
  pending: { t: 'Pending', c: 'bg-slate-100 text-slate-500' },
}
const titleCase = (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
const inputCls = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-violet-400 focus:outline-none'
const Field = ({ n, label, req, children }) => (
  <div>
    <label className="mb-1 block text-xs font-semibold text-slate-600">{n ? `${n}. ` : ''}{label}{req && <span className="text-rose-500"> *</span>}</label>
    {children}
  </div>
)
const Sel = ({ value, onChange, opts }) => (
  <select value={value ?? ''} onChange={e => onChange(e.target.value)} className={inputCls}>
    {opts.map(o => <option key={o} value={o}>{o === '' ? '— Select —' : titleCase(o)}</option>)}
  </select>
)

const emptyForm = () => ({
  primary_intent: '', secondary_intent: '', purchase_intent: '', purchase_intent_score: '',
  commercial_signal: '', amount: '', currency: 'USD', payment_method: '',
  stage_from: '', stage_to: '', no_stage_change: false, qualification_impact: '',
  sentiment: 'neutral', urgency: 'medium', action_required: '', validation_status: 'correct',
  correction_reason: '', supervisor_notes: '',
})

// ---- sidebar nav item ----
const NavItem = ({ icon, label, active, badge, onClick }) => (
  <button onClick={onClick} className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium ${active ? 'bg-violet-600 text-white' : 'text-slate-300 hover:bg-white/5'}`}>
    <span className="flex items-center gap-3">{icon}{label}</span>
    {badge != null && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${active ? 'bg-white/20' : 'bg-white/10 text-slate-300'}`}>{badge}</span>}
  </button>
)
const ic = (d) => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>

export default function AiMapping() {
  const toast = useToast()
  const [section, setSection] = useState('review')
  const [stats, setStats] = useState(null)
  const [tab, setTab] = useState('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('oldest')
  const [page, setPage] = useState(0)
  const [list, setList] = useState([])
  const [counts, setCounts] = useState({})
  const [selId, setSelId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const me = useMemo(() => { try { return JSON.parse(atob((localStorage.getItem('tcToken') || sessionStorage.getItem('tcToken') || '..').split('.')[1] || '')) } catch { return {} } }, [])

  const loadStats = useCallback(() => { api.get('/api/ai-mapping/stats').then(setStats).catch(() => {}) }, [])
  const loadList = useCallback(() => {
    const p = new URLSearchParams({ status: tab, q, sort, limit: String(PAGE), offset: String(page * PAGE) })
    api.get(`/api/ai-mapping/messages?${p}`).then(r => { setList(r.messages || []); setCounts(r.counts || {}) }).catch(() => {})
  }, [tab, q, sort, page])
  useEffect(() => { loadStats() }, [loadStats])
  useEffect(() => { const t = setTimeout(loadList, 250); return () => clearTimeout(t) }, [loadList])
  useEffect(() => { setPage(0) }, [tab, q, sort])
  useEffect(() => { if (!selId && list.length) setSelId(list[0].message_id) }, [list, selId])

  useEffect(() => {
    if (!selId) { setDetail(null); return }
    api.get(`/api/ai-mapping/message/${selId}`).then(d => {
      setDetail(d)
      const a = d.annotation || {}, s = d.signal || {}, st = d.state || {}, fb = d.feedback || {}
      setForm({
        primary_intent: a.primary_intent || '', secondary_intent: a.secondary_intent || '',
        purchase_intent: a.purchase_intent || '', purchase_intent_score: a.purchase_intent_score ?? '',
        commercial_signal: s.signal_type || '', amount: s.amount ?? '', currency: s.currency || 'USD', payment_method: s.payment_method || '',
        stage_from: st.value_before || '', stage_to: st.value_after || '', no_stage_change: !d.state,
        qualification_impact: (d.qualification && d.qualification.new_value) || '',
        sentiment: a.sentiment || 'neutral', urgency: a.urgency || 'medium',
        action_required: a.recommended_action || '', validation_status: fb.validation_status || 'correct',
        correction_reason: fb.correction_reason || '', supervisor_notes: (fb.human_output && fb.human_output.supervisor_notes) || '',
      })
    }).catch(() => {})
  }, [selId])

  const idx = useMemo(() => list.findIndex(m => m.message_id === selId), [list, selId])
  const goNext = () => { if (idx >= 0 && idx < list.length - 1) setSelId(list[idx + 1].message_id) }
  const goPrev = () => { if (idx > 0) setSelId(list[idx - 1].message_id) }

  const save = async (mode) => {
    if (!selId) return
    setBusy(true)
    try {
      await api.post(`/api/ai-mapping/message/${selId}/save`, { ...form, mode })
      toast(mode === 'approve' ? 'Approved & saved' : 'Draft saved', 'success')
      loadStats(); loadList()
      if (mode === 'approve') goNext()
    } catch (e) { toast(`Save failed: ${e.message}`, 'error') } finally { setBusy(false) }
  }
  const aiGenerate = async () => {
    if (!selId) return
    setBusy(true)
    try {
      const { prediction: p } = await api.post(`/api/ai-mapping/message/${selId}/ai-generate`, {})
      if (p) setForm(f => ({ ...f, primary_intent: p.primary_intent || f.primary_intent, secondary_intent: p.secondary_intent || f.secondary_intent,
        purchase_intent: p.purchase_intent || f.purchase_intent, purchase_intent_score: p.purchase_intent_score ?? f.purchase_intent_score,
        commercial_signal: p.commercial_signal || f.commercial_signal, amount: p.amount ?? f.amount, currency: p.currency || f.currency,
        payment_method: p.payment_method || f.payment_method, sentiment: p.sentiment || f.sentiment, urgency: p.urgency || f.urgency,
        action_required: p.recommended_action || f.action_required }))
      toast('AI prediction filled', 'success')
    } catch (e) { toast(`AI generate failed: ${e.message}`, 'error') } finally { setBusy(false) }
  }

  useEffect(() => {
    const h = (e) => {
      if (e.target.matches('input,textarea,select')) return
      const k = e.key.toLowerCase()
      if (k === 'n') goNext(); else if (k === 'p') goPrev(); else if (k === 's') save('draft'); else if (k === 'a') save('approve')
      else if (e.key === '/') { e.preventDefault(); document.getElementById('sup-notes')?.focus() }
    }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }) // eslint-disable-line

  const m = detail?.message
  const ann = detail?.annotation
  const fmt = (ts) => ts ? new Date(ts).toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'
  const total = counts.all || 0
  const assigned = Math.max(0, (counts.all || 0) - (counts.completed || 0))
  const ringPct = stats?.total_messages ? Math.round((stats.mapped / stats.total_messages) * 100) : 0
  const msgNo = idx >= 0 ? page * PAGE + idx + 1 : '—'
  const notesLen = (form.supervisor_notes || '').length

  const StatPill = ({ label, value, sub, up }) => (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 min-w-[120px]">
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className="mt-0.5 text-xl font-extrabold text-slate-800">{value}{up && <span className="ml-1 text-xs font-semibold text-emerald-500">↑ {up}</span>}</div>
      {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
    </div>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-800">
      {/* ---- supervisor sidebar ---- */}
      <aside className="flex w-64 shrink-0 flex-col bg-[#0b1020] text-slate-200">
        <div className="flex items-center gap-2 px-4 py-4">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-violet-600 text-white">🧠</span>
          <div className="min-w-0"><div className="truncate text-sm font-bold text-white">Decoinks AI Mapping</div><div className="text-[10px] text-slate-400">Human Review &amp; Assignment</div></div>
          <Link to="/dashboard" title="Back to CRM" className="ml-auto grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-white/10">‹</Link>
        </div>
        <div className="nice-scroll flex-1 overflow-y-auto px-3">
          <p className="mb-1 mt-2 px-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">Supervisor</p>
          <div className="space-y-1">
            <NavItem icon={ic(<><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></>)} label="Overview Dashboard" active={section === 'overview'} onClick={() => setSection('overview')} />
            <NavItem icon={ic(<><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></>)} label="Message Review" active={section === 'review'} badge={counts.in_review ?? ''} onClick={() => setSection('review')} />
            <NavItem icon={ic(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></>)} label="Conversations" active={section === 'conversations'} badge={total} onClick={() => setSection('conversations')} />
            <NavItem icon={ic(<><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></>)} label="Training Batches" active={section === 'batches'} onClick={() => setSection('batches')} />
            <NavItem icon={ic(<><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></>)} label="Annotation Rules" active={section === 'rules'} onClick={() => setSection('rules')} />
            <NavItem icon={ic(<><circle cx="12" cy="12" r="3"/><path d="M12 1v6M12 17v6M4.2 4.2l4.3 4.3M15.5 15.5l4.3 4.3"/></>)} label="Mappings" active={section === 'mappings'} onClick={() => setSection('mappings')} />
            <NavItem icon={ic(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></>)} label="Reports" active={section === 'reports'} onClick={() => setSection('reports')} />
            <NavItem icon={ic(<><path d="M3 3v18h18"/><path d="M7 14l3-3 3 3 4-5"/></>)} label="Performance" active={section === 'performance'} onClick={() => setSection('performance')} />
          </div>
          <p className="mb-1 mt-4 px-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">Admin</p>
          <div className="space-y-1">
            <NavItem icon={ic(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></>)} label="Users" active={section === 'users'} onClick={() => setSection('users')} />
            <NavItem icon={ic(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></>)} label="Teams" active={section === 'teams'} onClick={() => setSection('teams')} />
            <NavItem icon={ic(<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9z"/></>)} label="Settings" active={section === 'settings'} onClick={() => setSection('settings')} />
          </div>

          {/* Mapping Progress ring */}
          <div className="mt-5 rounded-xl bg-white/5 p-4">
            <div className="mb-3 text-xs font-bold text-slate-300">Mapping Progress</div>
            <div className="flex items-center gap-4">
              <div className="relative grid h-16 w-16 place-items-center rounded-full" style={{ background: `conic-gradient(#7c3aed ${ringPct * 3.6}deg, rgba(255,255,255,.1) 0)` }}>
                <div className="grid h-12 w-12 place-items-center rounded-full bg-[#0b1020] text-sm font-bold text-white">{ringPct}%</div>
              </div>
              <div className="flex-1 space-y-0.5 text-[11px]">
                <div className="flex justify-between"><span className="text-slate-400">Total</span><b className="text-slate-200">{stats?.total_messages ?? '—'}</b></div>
                <div className="flex justify-between"><span className="text-slate-400">Mapped</span><b className="text-slate-200">{stats?.mapped ?? '—'}</b></div>
                <div className="flex justify-between"><span className="text-slate-400">Approved</span><b className="text-slate-200">{stats?.approved ?? '—'}</b></div>
                <div className="flex justify-between"><span className="text-slate-400">Accuracy</span><b className="text-emerald-400">{stats?.accuracy != null ? stats.accuracy + '%' : '—'}</b></div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-white/10 px-4 py-3">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-violet-600 text-xs font-bold text-white">{(me.name || me.email || 'U').slice(0, 1).toUpperCase()}</span>
          <div className="min-w-0"><div className="truncate text-xs font-semibold text-white">{me.name || me.email || 'Supervisor'}</div><div className="text-[10px] text-slate-400">{titleCase(me.role || 'Supervisor')}</div></div>
        </div>
      </aside>

      {/* ---- main ---- */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* top bar */}
        <header className="flex shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-6 py-3">
          <h1 className="text-lg font-bold text-slate-800">Message Investigation &amp; Assignment</h1>
          <div className="ml-auto flex items-center gap-3">
            <StatPill label="Assigned to me" value={assigned} />
            <StatPill label="In Review" value={counts.in_review ?? 0} />
            <StatPill label="Reviewed Today" value={stats?.reviewed_today ?? 0} />
            <StatPill label="Accuracy (Today)" value={stats?.accuracy != null ? stats.accuracy + '%' : '—'} />
          </div>
        </header>

        {section !== 'review' ? (
          <div className="grid flex-1 place-items-center text-slate-400">
            <div className="text-center"><div className="text-4xl">🚧</div><div className="mt-2 font-semibold">{titleCase(section)}</div><div className="text-sm">Coming soon</div></div>
          </div>
        ) : (
        <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: '360px 1fr' }}>
          {/* navigator */}
          <aside className="flex min-h-0 flex-col border-r border-slate-200 bg-white">
            <div className="border-b border-slate-100 p-4">
              <h2 className="mb-3 text-base font-bold text-slate-800">Message Navigator</h2>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                {[['all', 'All', counts.all], ['in_review', 'In Review', counts.in_review], ['completed', 'Completed', counts.completed]].map(([k, t, c]) => (
                  <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-2.5 py-1.5 ${tab === k ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{t} {c ?? ''}</button>
                ))}
              </div>
              <div className="mb-2 flex gap-2">
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search messages…" className={inputCls} />
              </div>
              <select value={sort} onChange={e => setSort(e.target.value)} className={inputCls}>
                <option value="oldest">Sort: Oldest First</option><option value="newest">Sort: Newest First</option>
              </select>
            </div>
            <div className="border-b border-slate-100 px-4 py-2 text-xs font-semibold text-slate-500">{total} Messages</div>
            <div className="nice-scroll min-h-0 flex-1 overflow-y-auto">
              {list.length === 0 && <div className="p-6 text-center text-sm text-slate-400">No messages</div>}
              {list.map((msg, i) => {
                const b = STATUS_BADGE[msg.review_status] || STATUS_BADGE.pending
                const sel = msg.message_id === selId
                const who = msg.direction === 'in' ? (msg.customer_name || 'Customer') : 'Agent'
                return (
                  <button key={msg.message_id} onClick={() => setSelId(msg.message_id)}
                    className={`block w-full border-b border-slate-100 px-4 py-3 text-left ${sel ? 'bg-violet-50 ring-1 ring-inset ring-violet-200' : 'hover:bg-slate-50'}`}>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-xs font-bold text-slate-700"><span className="grid h-6 w-6 place-items-center rounded-full bg-violet-100 text-[9px] font-bold text-violet-700">{who.slice(0, 2).toUpperCase()}</span>{page * PAGE + i + 1}. {who}</span>
                      <span className="text-[10px] text-slate-400">{fmt(msg.ts)}</span>
                    </div>
                    <div className="mt-1 line-clamp-1 pl-8 text-xs text-slate-600">{msg.body}</div>
                    <div className="mt-1.5 flex items-center justify-between pl-8">
                      <span className="text-[10px] font-medium"><span className="text-slate-400">AI Intent: </span><span className="text-violet-600">{msg.primary_intent ? titleCase(msg.primary_intent) : '—'}</span></span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${b.c}`}>{b.t}</span>
                    </div>
                  </button>
                )
              })}
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-[11px] text-slate-500">
              <span>Showing {list.length ? page * PAGE + 1 : 0} to {page * PAGE + list.length} of {total}</span>
              <span className="flex gap-1">
                <button disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))} className="rounded border border-slate-200 px-2 py-0.5 disabled:opacity-40">‹</button>
                <button disabled={list.length < PAGE} onClick={() => setPage(p => p + 1)} className="rounded border border-slate-200 px-2 py-0.5 disabled:opacity-40">›</button>
              </span>
            </div>
          </aside>

          {/* reviewing + form */}
          <main className="nice-scroll min-h-0 overflow-y-auto p-5">
            {!m ? <div className="grid h-full place-items-center text-slate-400">Select a message to review</div> : (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-base font-bold text-slate-800">Reviewing Message #{msgNo} of {total} <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-500">MSG-{String(m.message_id).slice(0, 4).toUpperCase()}</span>
                    <button onClick={() => { navigator.clipboard?.writeText(m.message_id); toast('Message ID copied', 'success') }} title="Copy ID" className="ml-1 text-slate-400 hover:text-slate-600">⧉</button>
                  </div>
                  <Link to="/dashboard" className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">View Full Conversation ↗</Link>
                </div>

                <div className="mb-4 grid gap-3" style={{ gridTemplateColumns: '1fr 260px 200px' }}>
                  {/* message */}
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center gap-2">
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-violet-100 text-[10px] font-bold text-violet-700">{(m.customer_name || 'C').slice(0, 2).toUpperCase()}</span>
                      <div><div className="text-sm font-semibold text-slate-800">Customer — {m.customer_name || 'Customer'}</div><div className="text-[11px] text-slate-400">{fmt(m.ts)} · {m.channel || 'Facebook Messenger'}</div></div>
                    </div>
                    <div className="mt-3 text-base font-medium text-slate-800">{m.body}</div>
                  </div>
                  {/* AI prediction */}
                  <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-3 text-xs">
                    <div className="mb-2 font-bold text-violet-700">AI Prediction <span className="font-normal text-slate-400">(For Reference)</span></div>
                    {[['Primary Intent', ann?.primary_intent], ['Purchase Intent', ann?.purchase_intent], ['Commercial Signal', detail?.signal?.signal_type], ['Confidence Score', ann?.ai_confidence != null ? Math.round(ann.ai_confidence * 100) + '%' : null]].map(([k, v]) => (
                      <div key={k} className="flex justify-between py-0.5"><span className="text-slate-500">{k}</span><b className="text-slate-700">{v ? titleCase(v) : '—'}</b></div>
                    ))}
                    <button onClick={aiGenerate} disabled={busy} className="mt-2 w-full rounded-md bg-violet-600 px-2 py-1 font-semibold text-white hover:bg-violet-700 disabled:opacity-50">✨ Generate AI</button>
                  </div>
                  {/* status */}
                  <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs">
                    <div className="mb-2 font-bold text-slate-700">Status</div>
                    {(() => { const b = STATUS_BADGE[detail?.feedback ? 'reviewed' : ann ? 'needs_review' : 'pending']; return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${b.c}`}>{b.t}</span> })()}
                    <div className="mt-2 space-y-1">
                      <div><span className="text-slate-400">Assigned To</span><div className="font-semibold text-slate-700">{me.name || me.email || 'You'} (You)</div></div>
                      <div><span className="text-slate-400">Started At</span><div className="font-semibold text-slate-700">{ann?.created_at ? fmt(ann.created_at) : '—'}</div></div>
                      <div><span className="text-slate-400">Last Updated</span><div className="font-semibold text-slate-700">{ann?.updated_at ? fmt(ann.updated_at) : '—'}</div></div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <h3 className="mb-3 inline-block border-b-2 border-violet-600 pb-1 text-sm font-bold text-violet-700">Annotation &amp; Validation</h3>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <Field n="1" label="Primary Intent" req><Sel value={form.primary_intent} onChange={v => set('primary_intent', v)} opts={['', ...INTENTS]} /></Field>
                    <Field n="2" label="Secondary Intent"><Sel value={form.secondary_intent} onChange={v => set('secondary_intent', v)} opts={['', ...INTENTS]} /></Field>
                    <Field n="3" label="Purchase Intent" req><Sel value={form.purchase_intent} onChange={v => set('purchase_intent', v)} opts={['', ...PURCHASE]} /></Field>
                    <Field label="Score (0-100)" req><input type="number" min={0} max={100} value={form.purchase_intent_score} onChange={e => set('purchase_intent_score', e.target.value)} className={inputCls} /></Field>
                    <Field n="4" label="Commercial Signal" req><Sel value={form.commercial_signal} onChange={v => set('commercial_signal', v)} opts={SIGNALS} /></Field>
                    <Field n="5" label="Amount Detected"><input type="number" step="any" value={form.amount} onChange={e => set('amount', e.target.value)} className={inputCls} /></Field>
                    <Field n="6" label="Currency"><Sel value={form.currency} onChange={v => set('currency', v)} opts={CURRENCY} /></Field>
                    <Field n="7" label="Payment Method"><Sel value={form.payment_method} onChange={v => set('payment_method', v)} opts={PAYMETHOD} /></Field>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                    <Field n="8" label="Stage Change">
                      <div className="flex items-center gap-1">
                        <Sel value={form.stage_from} onChange={v => set('stage_from', v)} opts={['', ...STAGES]} />
                        <span className="text-slate-400">→</span>
                        <Sel value={form.stage_to} onChange={v => set('stage_to', v)} opts={['', ...STAGES]} />
                      </div>
                      <label className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500"><input type="checkbox" checked={form.no_stage_change} onChange={e => set('no_stage_change', e.target.checked)} /> No Stage Change</label>
                    </Field>
                    <Field n="9" label="Qualification Impact">
                      {form.qualification_impact
                        ? <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-2 py-1.5 text-xs font-medium text-violet-700">{form.qualification_impact}<button onClick={() => set('qualification_impact', '')} className="text-violet-400 hover:text-violet-700">✕</button></span>
                        : <input value={form.qualification_impact} onChange={e => set('qualification_impact', e.target.value)} className={inputCls} placeholder="e.g. Payment: Information Added" />}
                    </Field>
                    <Field n="10" label="Sentiment"><Sel value={form.sentiment} onChange={v => set('sentiment', v)} opts={SENTIMENT} /></Field>
                    <Field n="11" label="Urgency"><Sel value={form.urgency} onChange={v => set('urgency', v)} opts={URGENCY} /></Field>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Field n="12" label="Action Required"><Sel value={form.action_required} onChange={v => set('action_required', v)} opts={ACTIONS} /></Field>
                    <Field n="13" label="Human Validation" req>
                      <div className="flex h-[38px] items-center gap-4 text-sm">
                        {[['correct', 'Correct'], ['partially', 'Partially Correct'], ['incorrect', 'Incorrect']].map(([v, t]) => (
                          <label key={v} className="flex items-center gap-1.5"><input type="radio" name="val" checked={form.validation_status === v} onChange={() => set('validation_status', v)} /> {t}</label>
                        ))}
                      </div>
                    </Field>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Field n="14" label="Correction Reason (If Incorrect)"><input value={form.correction_reason} onChange={e => set('correction_reason', e.target.value)} className={inputCls} placeholder="Select or type reason for correction…" /></Field>
                    <Field n="15" label="Supervisor Notes">
                      <div className="relative">
                        <textarea id="sup-notes" maxLength={500} value={form.supervisor_notes} onChange={e => set('supervisor_notes', e.target.value)} rows={2} className={inputCls} />
                        <span className="absolute bottom-1.5 right-2 text-[10px] text-slate-400">{notesLen} / 500</span>
                      </div>
                    </Field>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                    <button onClick={() => save('draft')} disabled={busy} className="flex items-center gap-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">💾 Save Draft</button>
                    <div className="flex gap-2">
                      <button onClick={goNext} disabled={busy} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Skip Message</button>
                      <button onClick={() => save('approve')} disabled={busy} className="rounded-lg bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">Approve &amp; Next →</button>
                    </div>
                  </div>
                  <div className="mt-3 text-[11px] text-slate-400">Shortcuts: <b>N</b> Next · <b>P</b> Previous · <b>S</b> Save Draft · <b>A</b> Approve &amp; Next · <b>/</b> Focus Notes</div>
                </div>
              </>
            )}
          </main>
        </div>
        )}
      </div>
    </div>
  )
}
