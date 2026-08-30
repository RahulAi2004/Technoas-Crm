import { useEffect, useState, useCallback, useMemo } from 'react'
import SidebarCrm from '../components/SidebarCrm.jsx'
import TopBarUser from '../components/TopBarUser.jsx'
import BackButton from '../components/BackButton.jsx'
import { api } from '../lib/api.js'
import { useToast } from '../components/ToastContext.jsx'

// ---- option lists (from the AI-mapping spec) ----
const INTENTS = ['payment_sent','payment_received','price_offered','price_requested','discount_request','request_proof','payment_detail','order_intent','question','acknowledge','thanks_closing','complaint','follow_up','other']
const PURCHASE = ['payment_intent','high_intent','medium_intent','low_intent','no_intent']
const SIGNALS = ['','price_requested','price_quoted','discount_requested','discount_offered','discount_accepted','quote_sent','quote_accepted','order_intent','payment_sent','payment_received','refund_requested']
const CURRENCY = ['USD','EUR','GBP','CAD','AUD','PKR','INR']
const PAYMETHOD = ['','Bank Transfer','Zelle','PayPal','Cash App','Card','Cash','Crypto','Other']
const STAGES = ['New','Negotiation','Payment Pending','Paid','In Production','Shipped','Completed','Lost']
const SENTIMENT = ['positive','neutral','negative']
const URGENCY = ['low','medium','high']
const ACTIONS = ['','Verify Payment (Await Confirmation)','Send Quote','Request Artwork','Request Payment Proof','Follow Up','Provide Pricing','Escalate to Human','No Action']

const STATUS_BADGE = {
  reviewed: { t: 'Reviewed', c: 'bg-emerald-50 text-emerald-700' },
  needs_review: { t: 'Needs Review', c: 'bg-amber-50 text-amber-700' },
  pending: { t: 'Pending', c: 'bg-slate-100 text-slate-500' },
}

const Field = ({ label, req, hint, children }) => (
  <div>
    <label className="mb-1 block text-xs font-semibold text-slate-600">{label}{req && <span className="text-rose-500"> *</span>}{hint && <span className="ml-1 font-normal text-slate-400">{hint}</span>}</label>
    {children}
  </div>
)
const inputCls = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-violet-400 focus:outline-none'
const Sel = ({ value, onChange, opts }) => (
  <select value={value ?? ''} onChange={e => onChange(e.target.value)} className={inputCls}>
    {opts.map(o => <option key={o} value={o}>{o === '' ? '— Select —' : o.replace(/_/g, ' ')}</option>)}
  </select>
)
const Stat = ({ label, value, sub, accent }) => (
  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
    <div className="text-[11px] font-medium text-slate-500">{label}</div>
    <div className={`mt-1 text-2xl font-extrabold ${accent || ''}`}>{value}</div>
    {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
  </div>
)

const emptyForm = () => ({
  primary_intent: '', secondary_intent: '', purchase_intent: '', purchase_intent_score: '',
  commercial_signal: '', amount: '', currency: 'USD', payment_method: '',
  stage_from: '', stage_to: '', no_stage_change: false, qualification_impact: '',
  sentiment: 'neutral', urgency: 'medium', action_required: '', validation_status: 'correct',
  correction_reason: '', supervisor_notes: '',
})

export default function AiMapping() {
  const toast = useToast()
  const [stats, setStats] = useState(null)
  const [tab, setTab] = useState('all')          // all | in_review | completed
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('oldest')
  const [list, setList] = useState([])
  const [counts, setCounts] = useState({})
  const [selId, setSelId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const loadStats = useCallback(() => { api.get('/api/ai-mapping/stats').then(setStats).catch(() => {}) }, [])
  const loadList = useCallback(() => {
    const p = new URLSearchParams({ status: tab, q, sort, limit: '40' })
    api.get(`/api/ai-mapping/messages?${p}`).then(r => { setList(r.messages || []); setCounts(r.counts || {}) }).catch(() => {})
  }, [tab, q, sort])
  useEffect(() => { loadStats() }, [loadStats])
  useEffect(() => { const t = setTimeout(loadList, 250); return () => clearTimeout(t) }, [loadList])

  // auto-select first when list loads and nothing selected
  useEffect(() => { if (!selId && list.length) setSelId(list[0].message_id) }, [list, selId])

  // load detail + prefill form
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
    } catch (e) { toast(`Save failed: ${e.message}`, 'error') }
    finally { setBusy(false) }
  }
  const aiGenerate = async () => {
    if (!selId) return
    setBusy(true)
    try {
      const { prediction: p } = await api.post(`/api/ai-mapping/message/${selId}/ai-generate`, {})
      if (p) setForm(f => ({ ...f,
        primary_intent: p.primary_intent || f.primary_intent, secondary_intent: p.secondary_intent || f.secondary_intent,
        purchase_intent: p.purchase_intent || f.purchase_intent, purchase_intent_score: p.purchase_intent_score ?? f.purchase_intent_score,
        commercial_signal: p.commercial_signal || f.commercial_signal, amount: p.amount ?? f.amount, currency: p.currency || f.currency,
        payment_method: p.payment_method || f.payment_method, sentiment: p.sentiment || f.sentiment, urgency: p.urgency || f.urgency,
        action_required: p.recommended_action || f.action_required }))
      toast('AI prediction filled', 'success')
    } catch (e) { toast(`AI generate failed: ${e.message}`, 'error') }
    finally { setBusy(false) }
  }

  // keyboard shortcuts
  useEffect(() => {
    const h = (e) => {
      if (e.target.matches('input,textarea,select')) return
      if (e.key === 'n' || e.key === 'N') goNext()
      else if (e.key === 'p' || e.key === 'P') goPrev()
      else if (e.key === 's' || e.key === 'S') save('draft')
      else if (e.key === 'a' || e.key === 'A') save('approve')
    }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [idx, list, form, selId]) // eslint-disable-line

  const m = detail?.message
  const fmtTime = (ts) => ts ? new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

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

        {/* stats bar */}
        <div className="grid shrink-0 grid-cols-2 gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 md:grid-cols-4">
          <Stat label="Total messages" value={stats?.total_messages ?? '—'} />
          <Stat label="Mapped (AI)" value={stats?.mapped ?? '—'} sub={`${stats?.reviewed_total ?? 0} reviewed`} />
          <Stat label="Approved" value={stats?.approved ?? '—'} accent="text-emerald-600" />
          <Stat label="Accuracy" value={stats?.accuracy != null ? `${stats.accuracy}%` : '—'} accent="text-violet-600" sub={`Today: ${stats?.reviewed_today ?? 0}`} />
        </div>

        <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: '340px 1fr' }}>
          {/* navigator */}
          <aside className="flex min-h-0 flex-col border-r border-slate-200 bg-white">
            <div className="border-b border-slate-100 p-3">
              <div className="mb-2 flex gap-1 text-xs font-semibold">
                {[['all', `All ${counts.all ?? ''}`], ['in_review', `In Review ${counts.in_review ?? ''}`], ['completed', `Completed ${counts.completed ?? ''}`]].map(([k, t]) => (
                  <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-2.5 py-1.5 ${tab === k ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{t}</button>
                ))}
              </div>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search messages…" className={inputCls + ' mb-2'} />
              <select value={sort} onChange={e => setSort(e.target.value)} className={inputCls}>
                <option value="oldest">Oldest First</option><option value="newest">Newest First</option>
              </select>
            </div>
            <div className="nice-scroll min-h-0 flex-1 overflow-y-auto">
              {list.length === 0 && <div className="p-6 text-center text-sm text-slate-400">No messages</div>}
              {list.map((msg, i) => {
                const b = STATUS_BADGE[msg.review_status] || STATUS_BADGE.pending
                const isSel = msg.message_id === selId
                return (
                  <button key={msg.message_id} onClick={() => setSelId(msg.message_id)}
                    className={`block w-full border-b border-slate-100 px-3 py-2.5 text-left ${isSel ? 'bg-violet-50' : 'hover:bg-slate-50'}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700">{i + 1}. {msg.direction === 'in' ? (msg.customer_name || 'Customer') : 'Agent'}</span>
                      <span className="text-[10px] text-slate-400">{fmtTime(msg.ts).split(',')[1] || ''}</span>
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-xs text-slate-600">{msg.body}</div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-[10px] font-medium text-violet-600">{msg.primary_intent ? `AI: ${msg.primary_intent.replace(/_/g, ' ')}` : 'no AI'}</span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${b.c}`}>{b.t}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </aside>

          {/* reviewing + form */}
          <main className="nice-scroll min-h-0 overflow-y-auto p-5">
            {!m ? <div className="grid h-full place-items-center text-slate-400">Select a message to review</div> : (
              <>
                <div className="mb-4 flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4">
                  <div className="min-w-0">
                    <div className="text-xs text-slate-500">{m.customer_name || 'Customer'} — {m.channel || ''} · {fmtTime(m.ts)}</div>
                    <div className="mt-1 text-lg font-semibold text-slate-800">{m.body}</div>
                  </div>
                  <div className="shrink-0 rounded-lg border border-violet-100 bg-violet-50/60 p-3 text-xs">
                    <div className="mb-1 font-bold text-violet-700">AI Prediction</div>
                    <div className="text-slate-600">Intent: <b>{detail.annotation?.primary_intent || '—'}</b></div>
                    <div className="text-slate-600">Purchase: <b>{detail.annotation?.purchase_intent || '—'}</b></div>
                    <div className="text-slate-600">Confidence: <b>{detail.annotation?.ai_confidence != null ? Math.round(detail.annotation.ai_confidence * 100) + '%' : '—'}</b></div>
                    <button onClick={aiGenerate} disabled={busy} className="mt-2 w-full rounded-md bg-violet-600 px-2 py-1 font-semibold text-white hover:bg-violet-700 disabled:opacity-50">✨ Generate AI</button>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <h3 className="mb-3 border-b border-slate-100 pb-2 text-sm font-bold text-slate-700">Annotation &amp; Validation</h3>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <Field label="1. Primary Intent" req><Sel value={form.primary_intent} onChange={v => set('primary_intent', v)} opts={['', ...INTENTS]} /></Field>
                    <Field label="2. Secondary Intent"><Sel value={form.secondary_intent} onChange={v => set('secondary_intent', v)} opts={['', ...INTENTS]} /></Field>
                    <Field label="3. Purchase Intent" req><Sel value={form.purchase_intent} onChange={v => set('purchase_intent', v)} opts={['', ...PURCHASE]} /></Field>
                    <Field label="4. Score (0-100)" req><input type="number" min={0} max={100} value={form.purchase_intent_score} onChange={e => set('purchase_intent_score', e.target.value)} className={inputCls} /></Field>
                    <Field label="5. Commercial Signal"><Sel value={form.commercial_signal} onChange={v => set('commercial_signal', v)} opts={SIGNALS} /></Field>
                    <Field label="6. Amount Detected"><input type="number" step="any" value={form.amount} onChange={e => set('amount', e.target.value)} className={inputCls} /></Field>
                    <Field label="7. Currency"><Sel value={form.currency} onChange={v => set('currency', v)} opts={CURRENCY} /></Field>
                    <Field label="8. Payment Method"><Sel value={form.payment_method} onChange={v => set('payment_method', v)} opts={PAYMETHOD} /></Field>
                    <Field label="9. Stage From"><Sel value={form.stage_from} onChange={v => set('stage_from', v)} opts={['', ...STAGES]} /></Field>
                    <Field label="→ Stage To"><Sel value={form.stage_to} onChange={v => set('stage_to', v)} opts={['', ...STAGES]} /></Field>
                    <Field label="10. Qualification Impact"><input value={form.qualification_impact} onChange={e => set('qualification_impact', e.target.value)} className={inputCls} placeholder="e.g. Payment: info added" /></Field>
                    <Field label="No Stage Change"><label className="flex h-[38px] items-center gap-2 text-sm"><input type="checkbox" checked={form.no_stage_change} onChange={e => set('no_stage_change', e.target.checked)} /> No change</label></Field>
                    <Field label="11. Sentiment"><Sel value={form.sentiment} onChange={v => set('sentiment', v)} opts={SENTIMENT} /></Field>
                    <Field label="12. Urgency"><Sel value={form.urgency} onChange={v => set('urgency', v)} opts={URGENCY} /></Field>
                    <Field label="13. Action Required"><Sel value={form.action_required} onChange={v => set('action_required', v)} opts={ACTIONS} /></Field>
                    <Field label="14. Human Validation" req>
                      <div className="flex h-[38px] items-center gap-3 text-sm">
                        {['correct', 'partially', 'incorrect'].map(v => (
                          <label key={v} className="flex items-center gap-1"><input type="radio" name="val" checked={form.validation_status === v} onChange={() => set('validation_status', v)} /> {v}</label>
                        ))}
                      </div>
                    </Field>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Field label="Correction Reason (if incorrect)"><input value={form.correction_reason} onChange={e => set('correction_reason', e.target.value)} className={inputCls} placeholder="Why the AI was wrong…" /></Field>
                    <Field label="Supervisor Notes"><textarea value={form.supervisor_notes} onChange={e => set('supervisor_notes', e.target.value)} rows={2} className={inputCls} /></Field>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                    <button onClick={() => save('draft')} disabled={busy} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Save Draft</button>
                    <div className="flex gap-2">
                      <button onClick={goNext} disabled={busy} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Skip</button>
                      <button onClick={() => save('approve')} disabled={busy} className="rounded-lg bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">Approve &amp; Next →</button>
                    </div>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-400">Shortcuts: <b>N</b> Next · <b>P</b> Previous · <b>S</b> Save Draft · <b>A</b> Approve &amp; Next</div>
                </div>
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}
