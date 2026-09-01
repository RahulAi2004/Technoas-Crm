import { useEffect, useState, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import SidebarCrm from '../components/SidebarCrm.jsx'
import TopBarUser from '../components/TopBarUser.jsx'
import BackButton from '../components/BackButton.jsx'
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
const SEC_IDS = ['msg', 'airef', 'intent', 'commercial', 'stage', 'action']

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
const Stat = ({ label, value, sub, accent }) => (
  <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5">
    <div className="text-[11px] font-medium text-slate-500">{label}</div>
    <div className={`mt-0.5 text-xl font-extrabold ${accent || 'text-slate-800'}`}>{value}</div>
    {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
  </div>
)

// Collapsible "window" — minimize/open, state remembered per section
function Section({ id, title, hint, defaultOpen = true, children }) {
  const key = 'aim-sec-' + id
  const [open, setOpen] = useState(() => { try { const s = localStorage.getItem(key); return s == null ? defaultOpen : s === '1' } catch { return defaultOpen } })
  const toggle = () => setOpen(o => { const n = !o; try { localStorage.setItem(key, n ? '1' : '0') } catch {} return n })
  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <button type="button" onClick={toggle} className="flex w-full items-center justify-between px-4 py-2.5 hover:bg-slate-50">
        <span className="flex items-center gap-2 text-sm font-bold text-slate-700">{title}{hint && <span className="font-normal text-[11px] text-slate-400">{hint}</span>}</span>
        <span className="flex items-center gap-1 text-[11px] font-medium text-slate-400">{open ? 'Minimize' : 'Open'}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${open ? '' : '-rotate-90'}`}><path d="m6 9 6 6 6-6" /></svg>
        </span>
      </button>
      {open && <div className="border-t border-slate-100 p-4">{children}</div>}
    </div>
  )
}

const emptyForm = () => ({
  primary_intent: '', secondary_intent: '', purchase_intent: '', purchase_intent_score: '',
  commercial_signal: '', amount: '', currency: 'USD', payment_method: '',
  stage_from: '', stage_to: '', no_stage_change: false, qualification_impact: '',
  sentiment: 'neutral', urgency: 'medium', action_required: '', validation_status: 'correct',
  correction_reason: '', supervisor_notes: '', order_no: '',
})

export default function AiMapping() {
  const toast = useToast()
  const [stats, setStats] = useState(null)
  const [tab, setTab] = useState('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('newest')
  const [page, setPage] = useState(0)
  const [customers, setCustomers] = useState([])
  const [customer, setCustomer] = useState('')   // selected customer_id ('' = all)
  const [orders, setOrders] = useState([])
  const [orderFilter, setOrderFilter] = useState('')   // navigator: filter messages by tagged order_no
  const [list, setList] = useState([])
  const [counts, setCounts] = useState({})
  const [selId, setSelId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [busy, setBusy] = useState(false)
  const [secVer, setSecVer] = useState(0)   // bump to re-mount sections after expand/collapse all
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setAllSections = (v) => { try { SEC_IDS.forEach(id => localStorage.setItem('aim-sec-' + id, v ? '1' : '0')) } catch {} ; setSecVer(x => x + 1) }
  const me = useMemo(() => { try { return JSON.parse(atob((localStorage.getItem('tcToken') || sessionStorage.getItem('tcToken') || '..').split('.')[1] || '')) } catch { return {} } }, [])

  const loadStats = useCallback(() => { api.get('/api/ai-mapping/stats').then(setStats).catch(() => {}) }, [])
  const loadList = useCallback(() => {
    // customer selected → fetch their FULL history in one page (no pagination); else 24/page
    const lim = customer ? 5000 : PAGE
    const off = customer ? 0 : page * PAGE
    const p = new URLSearchParams({ status: tab, q, sort, limit: String(lim), offset: String(off) })
    if (customer) p.set('customer', customer)
    if (orderFilter) p.set('order', orderFilter)
    api.get(`/api/ai-mapping/messages?${p}`).then(r => { setList(r.messages || []); setCounts(r.counts || {}) }).catch(() => {})
  }, [tab, q, sort, page, customer, orderFilter])
  useEffect(() => { loadStats() }, [loadStats])
  useEffect(() => { api.get('/api/ai-mapping/customers').then(r => setCustomers(r.customers || [])).catch(() => {}) }, [])
  // selected customer → load their orders + show their FULL history from the start (oldest first)
  useEffect(() => {
    setOrderFilter('')
    if (!customer) { setOrders([]); return }
    setSort('oldest')   // customer chuno to messages shuru se (connect hone se aaj tak)
    api.get(`/api/ai-mapping/orders?customer=${encodeURIComponent(customer)}`).then(r => setOrders(r.orders || [])).catch(() => setOrders([]))
  }, [customer])
  useEffect(() => { const t = setTimeout(loadList, 250); return () => clearTimeout(t) }, [loadList])
  useEffect(() => { setPage(0) }, [tab, q, sort, customer, orderFilter])
  // keep a valid selection when the list changes (customer/order/tab switch)
  useEffect(() => {
    if (list.length && !list.some(x => x.message_id === selId)) setSelId(list[0].message_id)
    if (!list.length) setSelId(null)
  }, [list]) // eslint-disable-line

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
        order_no: a.order_no || '',
      })
    }).catch(() => {})
  }, [selId])
  // if the selected customer has exactly ONE order, auto-fill Order No (unless already set)
  useEffect(() => {
    if (orders.length === 1) setForm(f => (f.order_no ? f : { ...f, order_no: orders[0].order_number }))
  }, [orders, selId])

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
  const mappedPct = stats?.total_messages ? Math.round((stats.mapped / stats.total_messages) * 100) : 0
  const msgNo = idx >= 0 ? page * PAGE + idx + 1 : '—'
  const notesLen = (form.supervisor_notes || '').length

  return (
    <div className="crm-shell h-screen overflow-hidden grid">
      <SidebarCrm active="ai-mapping" />
      <div className="flex h-screen flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3 text-slate-700">
            <BackButton />
            <span className="hidden h-9 w-9 place-items-center rounded-lg bg-violet-50 text-violet-600 sm:grid">🧠</span>
            <div><h1 className="truncate text-lg font-bold leading-tight">AI Mapping</h1><p className="hidden truncate text-[11px] text-slate-500 sm:block">Message Investigation &amp; Assignment — Human Review</p></div>
          </div>
          <TopBarUser />
        </header>

        <div className="grid shrink-0 grid-cols-2 gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 md:grid-cols-5">
          <Stat label="Total Messages" value={(stats?.total_messages ?? 0).toLocaleString()} />
          <Stat label="Mapped (AI)" value={(stats?.mapped ?? 0).toLocaleString()} sub={`${mappedPct}% of total`} accent="text-violet-600" />
          <Stat label="In Review" value={counts.in_review ?? 0} />
          <Stat label="Reviewed Today" value={stats?.reviewed_today ?? 0} />
          <Stat label="Accuracy" value={stats?.accuracy != null ? stats.accuracy + '%' : '—'} accent="text-emerald-600" />
        </div>

        <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: '340px 1fr' }}>
          {/* navigator */}
          <aside className="flex min-h-0 flex-col border-r border-slate-200 bg-white">
            <div className="border-b border-slate-100 p-4">
              <h2 className="mb-3 text-base font-bold text-slate-800">Message Navigator</h2>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                {[['all', 'All', counts.all], ['in_review', 'In Review', counts.in_review], ['completed', 'Completed', counts.completed]].map(([k, t, c]) => (
                  <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-2.5 py-1.5 ${tab === k ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{t} {c ?? ''}</button>
                ))}
              </div>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search messages…" className={inputCls + ' mb-2'} />
              <select value={sort} onChange={e => setSort(e.target.value)} className={inputCls + ' mb-2'}>
                <option value="oldest">Sort: Oldest First</option><option value="newest">Sort: Newest First</option>
              </select>
              {/* Customer filter — select a customer to see only their messages */}
              <select value={customer} onChange={e => setCustomer(e.target.value)} className={inputCls}>
                <option value="">👥 All customers</option>
                {customers.map(c => <option key={c.customer_id} value={c.customer_id}>{c.name} ({c.msg_count})</option>)}
              </select>
              {/* Order filter — appears when a customer with orders is selected */}
              {customer && orders.length > 0 && (
                <select value={orderFilter} onChange={e => setOrderFilter(e.target.value)} className={inputCls + ' mt-2'}>
                  <option value="">📦 All orders ({orders.length})</option>
                  {orders.map(o => <option key={o.order_id} value={o.order_number}>Order {o.order_number}{o.total_amount ? ` · ${o.total_amount}` : ''}</option>)}
                </select>
              )}
              {customer && orders.length === 0 && <div className="mt-2 text-[11px] text-slate-400">No orders for this customer yet</div>}
            </div>
            <div className="border-b border-slate-100 px-4 py-2 text-xs font-semibold text-slate-500">{total.toLocaleString()} Messages</div>
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
              {customer ? (
                <span>Showing all {list.length.toLocaleString()} messages (start → today)</span>
              ) : (
                <>
                  <span>Showing {list.length ? page * PAGE + 1 : 0}–{page * PAGE + list.length} of {total.toLocaleString()}</span>
                  <span className="flex gap-1">
                    <button disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))} className="rounded border border-slate-200 px-2 py-0.5 disabled:opacity-40">‹</button>
                    <button disabled={list.length < PAGE} onClick={() => setPage(p => p + 1)} className="rounded border border-slate-200 px-2 py-0.5 disabled:opacity-40">›</button>
                  </span>
                </>
              )}
            </div>
          </aside>

          {/* reviewing + form (collapsible sections) */}
          <main className="nice-scroll min-h-0 overflow-y-auto p-5">
            {!m ? <div className="grid h-full place-items-center text-slate-400">Select a message to review</div> : (
              <>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-base font-bold text-slate-800">Reviewing Message #{msgNo} of {total.toLocaleString()} <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-500">MSG-{String(m.message_id).slice(0, 4).toUpperCase()}</span>
                    <button onClick={() => { navigator.clipboard?.writeText(m.message_id); toast('Message ID copied', 'success') }} title="Copy ID" className="ml-1 text-slate-400 hover:text-slate-600">⧉</button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setAllSections(true)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-50">Expand all</button>
                    <button onClick={() => setAllSections(false)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-50">Collapse all</button>
                    <Link to="/dashboard" className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">View Full Conversation ↗</Link>
                  </div>
                </div>

                <div key={secVer}>
                  <Section id="msg" title="Message">
                    <div className="flex items-center gap-2">
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-violet-100 text-[10px] font-bold text-violet-700">{(m.customer_name || 'C').slice(0, 2).toUpperCase()}</span>
                      <div><div className="text-sm font-semibold text-slate-800">Customer — {m.customer_name || 'Customer'}</div><div className="text-[11px] text-slate-400">{fmt(m.ts)} · {m.channel || 'Facebook Messenger'}</div></div>
                    </div>
                    <div className="mt-3 rounded-lg bg-slate-50 p-3 text-base font-medium text-slate-800">{m.body}</div>
                    <div className="mt-3">
                      <label className="mb-1 block text-xs font-semibold text-slate-600">📦 Order No <span className="font-normal text-slate-400">— tag this message to an order</span></label>
                      {orders.length > 0
                        ? <select value={form.order_no} onChange={e => set('order_no', e.target.value)} className={inputCls}>
                            <option value="">— No order —</option>
                            {orders.map(o => <option key={o.order_id} value={o.order_number}>Order {o.order_number}{o.order_status ? ` · ${titleCase(o.order_status)}` : ''}{o.total_amount ? ` · ${o.total_amount}` : ''}</option>)}
                          </select>
                        : <input value={form.order_no} onChange={e => set('order_no', e.target.value)} className={inputCls} placeholder="Select a customer (left) to list orders, or type an order no…" />}
                    </div>
                  </Section>

                  <Section id="airef" title="AI Prediction & Status" hint="reference">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-lg border border-violet-100 bg-violet-50/50 p-3 text-xs">
                        <div className="mb-2 font-bold text-violet-700">AI Prediction <span className="font-normal text-slate-400">(For Reference)</span></div>
                        {[['Primary Intent', ann?.primary_intent], ['Purchase Intent', ann?.purchase_intent], ['Commercial Signal', detail?.signal?.signal_type], ['Confidence Score', ann?.ai_confidence != null ? Math.round(ann.ai_confidence * 100) + '%' : null]].map(([k, v]) => (
                          <div key={k} className="flex justify-between py-0.5"><span className="text-slate-500">{k}</span><b className="text-slate-700">{v ? titleCase(v) : '—'}</b></div>
                        ))}
                        <button onClick={aiGenerate} disabled={busy} className="mt-2 w-full rounded-md bg-violet-600 px-2 py-1 font-semibold text-white hover:bg-violet-700 disabled:opacity-50">✨ Generate AI</button>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-3 text-xs">
                        <div className="mb-2 flex items-center gap-2 font-bold text-slate-700">Status {(() => { const b = STATUS_BADGE[detail?.feedback ? 'reviewed' : ann ? 'needs_review' : 'pending']; return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${b.c}`}>{b.t}</span> })()}</div>
                        <div className="grid grid-cols-3 gap-2">
                          <div><span className="text-slate-400">Assigned To</span><div className="font-semibold text-slate-700">{me.name || me.email || 'You'}</div></div>
                          <div><span className="text-slate-400">Started</span><div className="font-semibold text-slate-700">{ann?.created_at ? fmt(ann.created_at) : '—'}</div></div>
                          <div><span className="text-slate-400">Updated</span><div className="font-semibold text-slate-700">{ann?.updated_at ? fmt(ann.updated_at) : '—'}</div></div>
                        </div>
                        {ann?.edited_by && <div className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-800">✏️ Last edited by <b>{ann.edited_by}</b>{ann.edited_at ? ` · ${fmt(ann.edited_at)}` : ''} <span className="text-amber-500">(saved separately in human_edits)</span></div>}
                      </div>
                    </div>
                  </Section>

                  <Section id="intent" title="Intent & Score" hint="1–4">
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                      <Field n="1" label="Primary Intent" req><Sel value={form.primary_intent} onChange={v => set('primary_intent', v)} opts={['', ...INTENTS]} /></Field>
                      <Field n="2" label="Secondary Intent"><Sel value={form.secondary_intent} onChange={v => set('secondary_intent', v)} opts={['', ...INTENTS]} /></Field>
                      <Field n="3" label="Purchase Intent" req><Sel value={form.purchase_intent} onChange={v => set('purchase_intent', v)} opts={['', ...PURCHASE]} /></Field>
                      <Field label="Score (0-100)" req><input type="number" min={0} max={100} value={form.purchase_intent_score} onChange={e => set('purchase_intent_score', e.target.value)} className={inputCls} /></Field>
                    </div>
                  </Section>

                  <Section id="commercial" title="Commercial Details" hint="5–8" defaultOpen={false}>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                      <Field n="4" label="Commercial Signal" req><Sel value={form.commercial_signal} onChange={v => set('commercial_signal', v)} opts={SIGNALS} /></Field>
                      <Field n="5" label="Amount Detected"><input type="number" step="any" value={form.amount} onChange={e => set('amount', e.target.value)} className={inputCls} /></Field>
                      <Field n="6" label="Currency"><Sel value={form.currency} onChange={v => set('currency', v)} opts={CURRENCY} /></Field>
                      <Field n="7" label="Payment Method"><Sel value={form.payment_method} onChange={v => set('payment_method', v)} opts={PAYMETHOD} /></Field>
                    </div>
                  </Section>

                  <Section id="stage" title="Stage & Context" hint="8–11" defaultOpen={false}>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
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
                  </Section>

                  <Section id="action" title="Action & Validation" hint="12–15">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <Field n="12" label="Action Required"><Sel value={form.action_required} onChange={v => set('action_required', v)} opts={ACTIONS} /></Field>
                      <Field n="13" label="Human Validation" req>
                        <div className="flex h-[38px] items-center gap-4 text-sm">
                          {[['correct', 'Correct'], ['partially', 'Partially Correct'], ['incorrect', 'Incorrect']].map(([v, t]) => (
                            <label key={v} className="flex items-center gap-1.5"><input type="radio" name="val" checked={form.validation_status === v} onChange={() => set('validation_status', v)} /> {t}</label>
                          ))}
                        </div>
                      </Field>
                      <Field n="14" label="Correction Reason (If Incorrect)"><input value={form.correction_reason} onChange={e => set('correction_reason', e.target.value)} className={inputCls} placeholder="Select or type reason for correction…" /></Field>
                      <Field n="15" label="Supervisor Notes">
                        <div className="relative">
                          <textarea id="sup-notes" maxLength={500} value={form.supervisor_notes} onChange={e => set('supervisor_notes', e.target.value)} rows={2} className={inputCls} />
                          <span className="absolute bottom-1.5 right-2 text-[10px] text-slate-400">{notesLen} / 500</span>
                        </div>
                      </Field>
                    </div>
                  </Section>
                </div>

                {/* action bar — always visible */}
                <div className="sticky bottom-0 -mx-5 flex items-center justify-between border-t border-slate-200 bg-white/95 px-5 py-3 backdrop-blur">
                  <button onClick={() => save('draft')} disabled={busy} className="flex items-center gap-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">💾 Save Draft</button>
                  <div className="flex gap-2">
                    <button onClick={goNext} disabled={busy} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Skip Message</button>
                    <button onClick={() => save('approve')} disabled={busy} className="rounded-lg bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">Approve &amp; Next →</button>
                  </div>
                </div>
                <div className="mt-2 text-center text-[11px] text-slate-400">Shortcuts: <b>N</b> Next · <b>P</b> Previous · <b>S</b> Save Draft · <b>A</b> Approve &amp; Next · <b>/</b> Focus Notes</div>
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}
