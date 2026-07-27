import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.js'

// ============================================================
// Lead Details — 5 tabs (Lead/Customer/Product&Artwork/Shipping/Quote).
// Dense fields + status badge (Confirmed / Needs Confirmation / Not Discussed).
// Har field ke Validate par TURANT DB me save. Neeche Save Draft + Submit.
// Side panel; ⤢ se wide full-view (mockups jaisa).
// ============================================================

const INPUT = 'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-brand-400'

const OPT = {
  stage: ['Qualification', 'Contacted', 'Proposal', 'Negotiation', 'Won', 'Lost'],
  lead_status: ['Active', 'Inactive', 'Won', 'Lost'],
  qualification: ['Qualified', 'Unqualified', 'Pending'],
  purchase_intent: ['Researching', 'Browsing', 'Price Comparing', 'Interested', 'Ready to Buy', 'Waiting Payment', 'Returning Customer'],
  priority: ['Low', 'Medium', 'High'],
  segment: ['Event Customer', 'Reseller', 'Wholesale', 'Individual', 'Business'],
  cust_status: ['Active', 'Inactive', 'Lead'],
  preferred_channel: ['WhatsApp', 'Facebook', 'Instagram', 'Email', 'Phone'],
  product_type: ['T-Shirt', 'Hoodie', 'Polo', 'Sweatshirt', 'DTF Transfer', 'Gang Sheet', 'Other'],
  garment_source: ['Decoinks Supply', 'Customer Supplied'],
  print_method: ['DTF', 'Screen Print', 'Embroidery', 'Other'],
  artwork_status: ['Missing', 'Received', 'In Review', 'Changes Required', 'Approved'],
  shipping_method: ['Standard', 'Express', 'Pickup'],
  quote_status: ['Draft', 'Sent', 'Viewed', 'Accepted', 'Rejected', 'Expired'],
  currency: ['USD', 'PKR', 'EUR', 'GBP'],
}
const PRINT_LOCATIONS = ['Front', 'Back', 'Left Chest', 'Right Chest', 'Sleeves']

// section -> [ [key, label, type] ]  (type: text|number|select|textarea|date|toggle)
const LEAD_FIELDS = [
  ['stage', 'Stage', 'select'], ['lead_status', 'Lead Status', 'select'],
  ['purchase_intent', 'Purchase Intent', 'select'], ['qualification', 'Qualification', 'select'],
  ['priority', 'Priority', 'select'],
  ['lead_summary', 'Lead Summary', 'textarea'], ['internal_notes', 'Internal Notes (agent)', 'textarea'],
]
const CUST_FIELDS = [
  ['email', 'Email', 'text'], ['phone', 'Phone', 'text'],
  ['business_name', 'Business / Brand', 'text'], ['segment', 'Segment', 'select'],
  ['cust_status', 'Status', 'select'], ['preferred_channel', 'Preferred Channel', 'select'],
  ['tax_exempt', 'Tax Exempt', 'toggle'], ['customer_notes', 'Customer Notes', 'textarea'],
]
const PROD_FIELDS = [
  ['product_type', 'Product Type', 'select'], ['garment_source', 'Garment Source', 'select'],
  ['brand_style', 'Brand / Style', 'text'], ['garment_color', 'Color', 'text'],
  ['total_quantity', 'Total Quantity', 'number'], ['print_method', 'Print Method', 'select'],
  ['front_print_size', 'Front Print Size', 'text'], ['back_print_size', 'Back Print Size', 'text'],
]
const ART_FIELDS = [
  ['artwork_required', 'Artwork Required', 'toggle'], ['artwork_status', 'Artwork Status', 'select'],
  ['artwork_instructions', 'Artwork Instructions', 'textarea'], ['designer_notes', 'Designer Notes (internal)', 'textarea'],
]
const SHIP_FIELDS = [
  ['shipping_postcode', 'Shipping ZIP', 'text'], ['shipping_city', 'City', 'text'],
  ['shipping_state', 'State', 'text'], ['shipping_country', 'Country', 'text'],
  ['shipping_method', 'Shipping Method', 'select'], ['is_rush_order', 'Rush Order', 'toggle'],
  ['required_delivery_date', 'Required Delivery Date', 'date'], ['event_date', 'Event Date', 'date'],
  ['estimated_shipping_cost', 'Est. Shipping Cost', 'number'], ['delivery_instructions', 'Delivery Instructions', 'textarea'],
]
const QUOTE_FIELDS = [
  ['quote_status', 'Quote Status', 'select'], ['valid_until', 'Valid Until', 'date'],
  ['currency', 'Currency', 'select'], ['estimated_value', 'Estimated Value', 'number'],
  ['discount', 'Discount', 'number'], ['subtotal', 'Subtotal', 'number'],
  ['shipping_charges', 'Shipping Charges', 'number'], ['grand_total', 'Grand Total', 'number'],
]

const flatten = (b) => ({ ...(b?.lead || {}), ...(b?.customer || {}), ...(b?.product || {}), ...(b?.shipping || {}), ...(b?.quote || {}) })
const hasVal = (v) =>
  v != null && v !== '' && v !== false &&
  !(Array.isArray(v) && v.length === 0) &&
  !(typeof v === 'object' && !Array.isArray(v) && !Object.values(v).some((x) => x))

// Band colors for qualification bar
const SCORE_COLOR = (s) => s >= 70 ? 'bg-emerald-500' : s >= 40 ? 'bg-amber-500' : 'bg-rose-500'
const TEMP_CHIP = { Hot: 'bg-rose-50 text-rose-700 ring-rose-200', Warm: 'bg-amber-50 text-amber-700 ring-amber-200', Cold: 'bg-sky-50 text-sky-700 ring-sky-200' }

// Compact validate control — chhota check button, rang se state pata chale (space bachta hai).
//   🟢 green = Confirmed (saved) · 🟡 amber = Validate (value hai, dabao) · grey = empty · rose = retry
function Validate({ state, filled, val, onClick }) {
  const confirmed = state === 'ok', saving = state === 'saving', err = state === 'err', empty = !hasVal(val)
  let cls, title, icon = '✓'
  if (confirmed) { cls = 'border-emerald-400 bg-emerald-500 text-white'; title = 'Confirmed — saved to database' }
  else if (saving) { cls = 'border-slate-200 bg-white text-slate-400'; title = 'Saving…'; icon = '…' }
  else if (err) { cls = 'border-rose-300 bg-rose-50 text-rose-600'; title = 'Failed — click to retry'; icon = '↻' }
  else if (empty) { cls = 'border-slate-200 bg-slate-50 text-slate-300'; title = 'Not discussed' }
  else { cls = filled ? 'border-violet-300 bg-violet-50 text-violet-600' : 'border-amber-300 bg-amber-50 text-amber-600'; title = filled ? 'AI-filled — click to Validate (save)' : 'Validate — save to database' }
  return (
    <button onClick={onClick} disabled={saving || empty} title={title}
      className={`grid h-[30px] w-[30px] shrink-0 place-items-center rounded-md border text-xs font-bold ${cls} ${empty ? 'cursor-default' : 'hover:brightness-95'}`}>
      {icon}
    </button>
  )
}

function Field({ k, label, type, val, filled, state, onChange, onValidate }) {
  return (
    <div className={`min-w-0 ${type === 'textarea' ? 'col-span-full' : ''}`}>
      <div className="mb-0.5 flex items-center gap-1.5">
        <label className="truncate text-[11px] font-semibold text-slate-600">{label}</label>
        {filled && <span className="rounded bg-violet-50 px-1 text-[8px] font-bold text-violet-600">AI</span>}
      </div>
      <div className="flex items-start gap-1.5">
        <div className="min-w-0 flex-1">
          {type === 'select' ? (
            <select value={val || ''} onChange={(e) => onChange(e.target.value)} className={INPUT}>
              <option value="">—</option>
              {(OPT[k] || []).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : type === 'textarea' ? (
            <textarea value={val || ''} onChange={(e) => onChange(e.target.value)} rows={2} className={INPUT} />
          ) : type === 'toggle' ? (
            <button onClick={() => onChange(!val)} className={`inline-flex h-6 w-11 items-center rounded-full px-0.5 transition ${val ? 'bg-emerald-500' : 'bg-slate-300'}`}>
              <span className={`h-5 w-5 rounded-full bg-white transition ${val ? 'translate-x-5' : ''}`} />
            </button>
          ) : (
            <input type={type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'} value={val ?? ''} onChange={(e) => onChange(e.target.value)} className={INPUT} />
          )}
        </div>
        <Validate k={k} state={state} filled={filled} val={val} onClick={onValidate} />
      </div>
    </div>
  )
}

function AddressBlock({ title, addr, filled, state, sameAs, onSame, onChange, onValidate }) {
  const a = addr || {}
  const set = (kk, v) => onChange({ ...a, [kk]: v })
  return (
    <div className="rounded-lg border border-slate-200 p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <h4 className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-700">{title}{filled && <span className="rounded bg-violet-50 px-1 text-[8px] font-bold text-violet-600">AI</span>}</h4>
        <Validate state={state} val={a} filled={filled} onClick={onValidate} />
      </div>
      {onSame && (
        <label className="mb-1.5 flex items-center gap-1.5 text-[11px] text-slate-600">
          <input type="checkbox" checked={!!sameAs} onChange={(e) => onSame(e.target.checked)} /> Same as Shipping Address
        </label>
      )}
      {!sameAs && (
        <div className="grid grid-cols-2 gap-1.5">
          {[['line1', 'Address Line 1'], ['line2', 'Address Line 2'], ['city', 'City'], ['state', 'State'], ['zip', 'ZIP'], ['country', 'Country']].map(([kk, ph]) => (
            <input key={kk} placeholder={ph} value={a[kk] || ''} onChange={(e) => set(kk, e.target.value)} className={INPUT} />
          ))}
        </div>
      )}
    </div>
  )
}

function SizeBreakdown({ rows, total, filled, state, onChange, onValidate }) {
  const list = Array.isArray(rows) ? rows : []
  const sum = list.reduce((n, r) => n + (Number(r.quantity) || 0), 0)
  const set = (i, kk, v) => onChange(list.map((r, j) => (j === i ? { ...r, [kk]: v } : r)))
  const add = () => onChange([...list, { size: '', quantity: 0 }])
  const del = (i) => onChange(list.filter((_, j) => j !== i))
  const mismatch = hasVal(total) && sum !== Number(total)
  return (
    <div className="rounded-lg border border-slate-200 p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <h4 className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-700">Size Breakdown{filled && <span className="rounded bg-violet-50 px-1 text-[8px] font-bold text-violet-600">AI</span>}</h4>
        <Validate state={state} val={list} filled={filled} onClick={onValidate} />
      </div>
      <div className="space-y-1">
        {list.map((r, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input placeholder="Size" value={r.size || ''} onChange={(e) => set(i, 'size', e.target.value)} className={`${INPUT} flex-1`} />
            <input type="number" placeholder="Qty" value={r.quantity ?? ''} onChange={(e) => set(i, 'quantity', e.target.value)} className={`${INPUT} w-20`} />
            <button onClick={() => del(i)} className="text-rose-400 hover:text-rose-600">✕</button>
          </div>
        ))}
      </div>
      <div className="mt-1 flex items-center justify-between">
        <button onClick={add} className="text-[11px] font-semibold text-brand-600">+ Add size</button>
        <span className={`text-[10px] font-semibold ${mismatch ? 'text-rose-600' : 'text-slate-500'}`}>Sum {sum}{hasVal(total) ? ` / ${total}` : ''}{mismatch ? ' ⚠' : ''}</span>
      </div>
    </div>
  )
}

function PrintLocations({ value, filled, state, onChange, onValidate }) {
  const sel = Array.isArray(value) ? value : []
  const toggle = (loc) => onChange(sel.includes(loc) ? sel.filter((x) => x !== loc) : [...sel, loc])
  return (
    <div className="rounded-lg border border-slate-200 p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <h4 className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-700">Print Locations{filled && <span className="rounded bg-violet-50 px-1 text-[8px] font-bold text-violet-600">AI</span>}</h4>
        <Validate state={state} val={sel} filled={filled} onClick={onValidate} />
      </div>
      <div className="flex flex-wrap gap-1">
        {PRINT_LOCATIONS.map((loc) => (
          <button key={loc} onClick={() => toggle(loc)}
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${sel.includes(loc) ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'bg-white text-slate-500 ring-slate-200'}`}>{loc}</button>
        ))}
      </div>
    </div>
  )
}

function QuoteItems({ items, filled, state, onChange, onValidate }) {
  const list = Array.isArray(items) ? items : []
  const set = (i, kk, v) => onChange(list.map((r, j) => (j === i ? { ...r, [kk]: v } : r)))
  const add = () => onChange([...list, { item_type: 'garment', item_name: '', quantity: 1, unit_price: 0 }])
  const del = (i) => onChange(list.filter((_, j) => j !== i))
  const amt = (r) => (Number(r.quantity) || 0) * (Number(r.unit_price) || 0)
  return (
    <div className="rounded-lg border border-slate-200 p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <h4 className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-700">Quote Items{filled && <span className="rounded bg-violet-50 px-1 text-[8px] font-bold text-violet-600">AI</span>}</h4>
        <Validate state={state} val={list} filled={filled} onClick={onValidate} />
      </div>
      <div className="space-y-1.5">
        {list.map((r, i) => (
          <div key={i} className="rounded-md border border-slate-200 p-1.5">
            <div className="flex items-center gap-1.5">
              <select value={r.item_type || 'garment'} onChange={(e) => set(i, 'item_type', e.target.value)} className={`${INPUT} w-24`}>
                <option value="garment">garment</option><option value="printing">printing</option><option value="shipping">shipping</option>
              </select>
              <input placeholder="Item name" value={r.item_name || ''} onChange={(e) => set(i, 'item_name', e.target.value)} className={`${INPUT} flex-1`} />
              <button onClick={() => del(i)} className="text-rose-400 hover:text-rose-600">✕</button>
            </div>
            <div className="mt-1 grid grid-cols-3 gap-1">
              <input type="number" placeholder="Qty" value={r.quantity ?? ''} onChange={(e) => set(i, 'quantity', e.target.value)} className={INPUT} />
              <input type="number" placeholder="Unit $" value={r.unit_price ?? ''} onChange={(e) => set(i, 'unit_price', e.target.value)} className={INPUT} />
              <div className="grid place-items-center rounded-lg bg-slate-50 text-[11px] font-semibold text-slate-600">${amt(r).toFixed(2)}</div>
            </div>
          </div>
        ))}
        {!list.length && <div className="rounded-md border border-dashed border-slate-200 py-2 text-center text-[11px] text-slate-400">No items yet</div>}
      </div>
      <button onClick={add} className="mt-1.5 w-full rounded-md border border-dashed border-slate-300 py-1 text-[11px] font-semibold text-brand-600 hover:bg-slate-50">+ Add Item</button>
    </div>
  )
}

function QualCard({ q, temp }) {
  if (!q) return null
  return (
    <div className="rounded-lg border border-slate-200 p-2.5">
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="text-[11px] font-bold text-slate-700">Qualification Score</h4>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${q.score >= 70 ? 'text-emerald-600' : q.score >= 40 ? 'text-amber-600' : 'text-rose-600'}`}>{q.band}</span>
        </div>
        <div className="text-sm font-extrabold text-slate-800">{q.score}<span className="text-[10px] font-medium text-slate-400">/100</span></div>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100"><div className={`h-2 rounded-full ${SCORE_COLOR(q.score)}`} style={{ width: `${q.score}%` }} /></div>
      {temp && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[10px]">
          <span className="text-slate-500">Temperature (auto):</span>
          <span className={`rounded-full px-2 py-0.5 font-bold ring-1 ${TEMP_CHIP[temp] || ''}`}>{temp}</span>
        </div>
      )}
      <ul className="mt-1.5 grid grid-cols-1 gap-0.5 sm:grid-cols-2">
        {q.breakdown.map((c) => (
          <li key={c.key} className={`flex items-center gap-1 text-[10px] ${c.got ? 'text-slate-700' : 'text-slate-400'}`}>
            <span>{c.got ? '✓' : '☐'}</span><span className="flex-1 truncate">{c.label}</span><span className="text-slate-400">+{c.points}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// derived "missing / blocking" for the bottom strip
function computeMissing(vals, hasQuote) {
  const items = []
  if (!hasVal(vals.product_type)) items.push({ label: 'Product type', level: 'block' })
  if (!hasVal(vals.total_quantity)) items.push({ label: 'Quantity', level: 'block' })
  const arts = String(vals.artwork_status || '')
  if (!/received|review|approved|changes/i.test(arts)) items.push({ label: 'Artwork', level: 'block' })
  if (!hasVal(vals.shipping_postcode)) items.push({ label: 'Shipping ZIP', level: 'warn' })
  if (!hasVal(vals.required_delivery_date) && !hasVal(vals.event_date)) items.push({ label: 'Delivery date', level: 'warn' })
  if (!hasQuote) items.push({ label: 'Quote', level: 'warn' })
  return items
}

export default function LeadPanel({ conv, onClose }) {
  const [tab, setTab] = useState('lead')
  const [vals, setVals] = useState({})
  const [filled, setFilled] = useState({})   // AI-filled, unvalidated
  const [fs, setFs] = useState({})            // per-field: idle|saving|ok|err
  const [score, setScore] = useState(null)
  const [wide, setWide] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [savingAll, setSavingAll] = useState(false)
  const [err, setErr] = useState('')
  const [sameBilling, setSameBilling] = useState(false)

  const cid = conv?.id

  const runExtract = () => {
    if (!cid) return
    setExtracting(true); setErr('')
    api.get(`/api/leads/extract/${encodeURIComponent(cid)}`)
      .then((r) => {
        if (!r?.fields) return
        const ai = flatten(r.fields)
        setVals((cur) => {
          const next = { ...cur }; const f = {}
          for (const [k, v] of Object.entries(ai)) {
            if (!hasVal(cur[k]) && hasVal(v)) { next[k] = v; f[k] = true }
          }
          setFilled((p) => ({ ...p, ...f }))
          return next
        })
      })
      .catch((e) => setErr(e?.message || 'AI extract failed'))
      .finally(() => setExtracting(false))
  }

  useEffect(() => {
    if (!cid) return
    let cancelled = false
    setVals({}); setFilled({}); setFs({}); setErr(''); setScore(null); setSameBilling(false); setTab('lead')
    api.get(`/api/leads/panel/${encodeURIComponent(cid)}`)
      .then((b) => { if (!cancelled) setVals(flatten(b)) })
      .catch(() => {})
      .finally(() => { if (!cancelled) runExtract() })
    api.get(`/api/leads/score/${encodeURIComponent(cid)}`)
      .then((s) => { if (!cancelled && s?.qualification) setScore(s.qualification) })
      .catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid])

  const setVal = (k, v) => { setVals((c) => ({ ...c, [k]: v })); setFilled((a) => ({ ...a, [k]: false })); setFs((s) => ({ ...s, [k]: 'idle' })) }

  const saveOne = async (k, valueOverride) => {
    if (!cid) return false
    setFs((s) => ({ ...s, [k]: 'saving' }))
    try {
      await api.post(`/api/leads/field/${encodeURIComponent(cid)}`, { field: k, value: valueOverride !== undefined ? valueOverride : (vals[k] ?? '') })
      setFs((s) => ({ ...s, [k]: 'ok' })); setFilled((a) => ({ ...a, [k]: false }))
      return true
    } catch { setFs((s) => ({ ...s, [k]: 'err' })); return false }
  }
  const validate = (k) => () => saveOne(k)

  // Save Draft = jitne fields me value hai (aur confirmed nahi), sab save kar do.
  const saveAll = async () => {
    setSavingAll(true)
    const keys = Object.keys(vals).filter((k) => hasVal(vals[k]) && fs[k] !== 'ok')
    for (const k of keys) { if (FIELD_KEYS.has(k)) await saveOne(k) }  // eslint-disable-line
    setSavingAll(false)
    // refresh score
    api.get(`/api/leads/score/${encodeURIComponent(cid)}`).then((s) => s?.qualification && setScore(s.qualification)).catch(() => {})
  }

  const autoTemp = useMemo(() => {
    if (!score) return null
    const HOT = ['Interested', 'Ready to Buy', 'Waiting Payment', 'Returning Customer']
    if (score.score >= 70 && HOT.includes(vals.purchase_intent)) return 'Hot'
    if (score.score >= 40) return 'Warm'
    return 'Cold'
  }, [score, vals.purchase_intent])

  const missing = useMemo(() => computeMissing(vals, hasVal(vals.grand_total) || (Array.isArray(vals.line_items) && vals.line_items.length > 0)), [vals])

  const TABS = [['lead', 'Lead'], ['customer', 'Customer'], ['product', 'Product & Artwork'], ['shipping', 'Shipping & Delivery'], ['quote', 'Quote']]
  // Auto-columns: jitni jagah utni fields ek row me (space waste nahi). Wide me capped.
  const grid = wide
    ? 'grid gap-2.5 grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
    : 'grid gap-2.5 grid-cols-[repeat(auto-fill,minmax(185px,1fr))]'

  const renderFields = (defs) => defs.map(([k, label, type]) => (
    <Field key={k} k={k} label={label} type={type} val={vals[k]} filled={filled[k]} state={fs[k]}
      onChange={(v) => setVal(k, v)} onValidate={validate(k)} />
  ))

  const shell = wide
    ? 'fixed inset-0 z-40 flex flex-col bg-white'
    : 'flex h-full flex-col overflow-hidden border-l border-slate-200 bg-white'

  return (
    <aside id="ai-panel" className={shell}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 text-white">📋</span>
          <div>
            <h3 className="text-sm font-bold leading-4">Lead Details</h3>
            <div className="text-[10px] text-slate-500">{conv?.name || 'Unknown'} · {conv?.channel || ''}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={runExtract} disabled={extracting || !cid} title="Re-extract from chat"
            className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-sky-700 disabled:opacity-50">
            {extracting ? 'Extracting…' : '✨ Extract'}
          </button>
          <button onClick={() => setWide((w) => !w)} title={wide ? 'Collapse' : 'Expand'} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-slate-100">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{wide ? <path d="M9 9H4V4M15 9h5V4M9 15H4v5M15 15h5v5" /> : <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />}</svg>
          </button>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-slate-100" aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      </div>

      {err && <div className="border-b border-rose-100 bg-rose-50 px-4 py-1.5 text-[11px] text-rose-700">{err}</div>}

      {/* Tabs */}
      <nav className="nice-scroll flex items-center gap-4 overflow-x-auto border-b border-slate-200 px-4 text-[13px]">
        {TABS.map(([id, lbl]) => (
          <button key={id} onClick={() => setTab(id)} className={`shrink-0 whitespace-nowrap border-b-2 py-2.5 ${tab === id ? 'border-brand-500 font-semibold text-brand-600' : 'border-transparent font-medium text-slate-500 hover:text-slate-700'}`}>{lbl}</button>
        ))}
      </nav>

      {/* Body */}
      <div className="nice-scroll flex-1 overflow-y-auto px-4 py-3">
        {tab === 'lead' && (<div className="space-y-3">
          <QualCard q={score} temp={autoTemp} />
          <div className={grid}>{renderFields(LEAD_FIELDS)}</div>
          {vals.stage === 'Lost' && <div className={grid}><Field k="lost_reason" label="Lost Reason" type="text" val={vals.lost_reason} filled={filled.lost_reason} state={fs.lost_reason} onChange={(v) => setVal('lost_reason', v)} onValidate={validate('lost_reason')} /></div>}
          {vals.ai_summary && <div className="rounded-lg bg-violet-50 p-2.5 text-[11px] text-violet-800"><b>✨ AI Summary:</b> {vals.ai_summary}</div>}
        </div>)}

        {tab === 'customer' && (<div className="space-y-3">
          <div className={grid}>{renderFields(CUST_FIELDS)}</div>
          <AddressBlock title="Shipping Address" addr={vals.shipping_address} filled={filled.shipping_address} state={fs.shipping_address}
            onChange={(v) => setVal('shipping_address', v)} onValidate={validate('shipping_address')} />
          <AddressBlock title="Billing Address" addr={sameBilling ? vals.shipping_address : vals.billing_address} filled={filled.billing_address} state={fs.billing_address}
            sameAs={sameBilling} onSame={setSameBilling}
            onChange={(v) => setVal('billing_address', v)}
            onValidate={() => saveOne('billing_address', sameBilling ? vals.shipping_address : vals.billing_address)} />
        </div>)}

        {tab === 'product' && (<div className="space-y-3">
          <div className={grid}>{renderFields(PROD_FIELDS)}</div>
          <SizeBreakdown rows={vals.size_breakdown} total={vals.total_quantity} filled={filled.size_breakdown} state={fs.size_breakdown}
            onChange={(v) => setVal('size_breakdown', v)} onValidate={validate('size_breakdown')} />
          <PrintLocations value={vals.print_locations} filled={filled.print_locations} state={fs.print_locations}
            onChange={(v) => setVal('print_locations', v)} onValidate={validate('print_locations')} />
          <div className={grid}><Field k="special_instructions" label="Special Instructions" type="textarea" val={vals.special_instructions} filled={filled.special_instructions} state={fs.special_instructions} onChange={(v) => setVal('special_instructions', v)} onValidate={validate('special_instructions')} /></div>
          <div className="rounded-lg bg-slate-50 p-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Artwork</div>
          <div className={grid}>{renderFields(ART_FIELDS)}</div>
          <p className="text-[10px] text-slate-400">Artwork files chat se aati hain (Files tab me dikhti hain). "Received" auto; Quality/Approve agent set kare.</p>
        </div>)}

        {tab === 'shipping' && (<div className="space-y-3">
          <div className={grid}>{renderFields(SHIP_FIELDS)}</div>
        </div>)}

        {tab === 'quote' && (<div className="space-y-3">
          <QuoteItems items={vals.line_items} filled={filled.line_items} state={fs.line_items}
            onChange={(v) => setVal('line_items', v)} onValidate={validate('line_items')} />
          <div className={grid}><Field k="quote_notes" label="Notes (to customer)" type="textarea" val={vals.quote_notes} filled={filled.quote_notes} state={fs.quote_notes} onChange={(v) => setVal('quote_notes', v)} onValidate={validate('quote_notes')} /></div>
          <div className={grid}>{renderFields(QUOTE_FIELDS)}</div>
        </div>)}
      </div>

      {/* Missing info strip */}
      {missing.length > 0 && (
        <div className="border-t border-slate-200 bg-amber-50/50 px-4 py-1.5">
          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
            <span className="font-bold text-slate-600">Missing:</span>
            {missing.map((m) => (
              <span key={m.label} className={`rounded-full px-2 py-0.5 font-semibold ring-1 ${m.level === 'block' ? 'bg-rose-50 text-rose-700 ring-rose-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}`}>{m.label}</span>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-4 py-2.5">
        <button onClick={saveAll} disabled={savingAll} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          {savingAll ? 'Saving…' : '💾 Save Draft'}
        </button>
        <button onClick={async () => { await saveAll(); await saveOne('stage', 'Proposal') }} disabled={savingAll}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
          ✓ Submit / Complete
        </button>
      </div>
    </aside>
  )
}

const FIELD_KEYS = new Set([
  ...LEAD_FIELDS.map((f) => f[0]), 'lost_reason',
  ...CUST_FIELDS.map((f) => f[0]), 'shipping_address', 'billing_address',
  ...PROD_FIELDS.map((f) => f[0]), 'size_breakdown', 'print_locations', 'special_instructions',
  ...ART_FIELDS.map((f) => f[0]),
  ...SHIP_FIELDS.map((f) => f[0]),
  ...QUOTE_FIELDS.map((f) => f[0]), 'line_items', 'quote_notes',
])
