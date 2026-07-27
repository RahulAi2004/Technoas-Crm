import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'

// ============================================================
// Lead Details — right-side panel (AI Supervisor jaisa). Chat se AI fields
// extract karta hai; agent edit kare aur har field ke "Validate" par click kare
// TABHI wo field database me save hoti hai (validate = save).
// ============================================================

const INPUT = 'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800 outline-none focus:border-brand-400'

const OPTIONS = {
  stage:        ['Qualification', 'Contacted', 'Proposal', 'Negotiation', 'Won', 'Lost'],
  lead_status:  ['Active', 'Inactive', 'Won', 'Lost'],
  qualification:['Qualified', 'Unqualified', 'Pending'],
  temperature:  ['Cold', 'Warm', 'Hot'],
  priority:     ['Low', 'Medium', 'High'],
  purchase_intent: ['Researching', 'Browsing', 'Price Comparing', 'Interested', 'Ready to Buy', 'Waiting Payment', 'Returning Customer'],
  segment:      ['Event Customer', 'Reseller', 'Wholesale', 'Individual', 'Business'],
  cust_status:  ['Active', 'Inactive', 'Lead'],
}

const LEAD_FIELDS = [
  ['stage', 'Stage', 'select'], ['lead_status', 'Lead Status', 'select'],
  ['purchase_intent', 'Purchase Intent', 'select'], ['qualification', 'Qualification', 'select'],
  ['product_intent', 'Product Intent', 'text'], ['priority', 'Priority', 'select'],
  ['lead_summary', 'Lead Summary', 'textarea'], ['internal_notes', 'Internal Notes', 'textarea'],
]

// Qualification band -> rang (Tailwind static classes; dynamic class-name safe nahi hota).
const BAND = {
  'Sales Ready': { bar: 'bg-blue-500',    chip: 'bg-blue-50 text-blue-700 ring-blue-200',       dot: '🔵' },
  'Qualified':   { bar: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: '🟢' },
  'Warm':        { bar: 'bg-amber-500',   chip: 'bg-amber-50 text-amber-700 ring-amber-200',     dot: '🟡' },
  'Cold':        { bar: 'bg-rose-500',    chip: 'bg-rose-50 text-rose-700 ring-rose-200',         dot: '🔴' },
}
const TEMP_CHIP = { Hot: 'bg-rose-50 text-rose-700 ring-rose-200', Warm: 'bg-amber-50 text-amber-700 ring-amber-200', Cold: 'bg-sky-50 text-sky-700 ring-sky-200' }
// Temperature = f(score, intent) — backend jaisa hi (auto).
const deriveTemp = (score, intent) => {
  const HOT = ['Ready to Buy', 'Waiting Payment', 'Returning Customer']
  const LOW = ['Researching', 'Browsing']
  if (score > 70 && HOT.includes(intent)) return 'Hot'
  if (score < 40 || LOW.includes(intent)) return 'Cold'
  return 'Warm'
}

function QualCard({ q, temp }) {
  if (!q) return null
  const b = BAND[q.band] || BAND.Cold
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="text-xs font-bold text-slate-700">Qualification Score</h4>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${b.chip}`}>{b.dot} {q.band}</span>
        </div>
        <div className="text-sm font-extrabold text-slate-800">{q.score}<span className="text-[11px] font-medium text-slate-400">/100</span></div>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-2 rounded-full ${b.bar} transition-all`} style={{ width: `${q.score}%` }} />
      </div>
      {temp && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px]">
          <span className="text-slate-500">Temperature (auto):</span>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-bold ring-1 ${TEMP_CHIP[temp] || ''}`}>{temp}</span>
        </div>
      )}
      <ul className="mt-2 grid grid-cols-1 gap-0.5">
        {q.breakdown.map((c) => (
          <li key={c.key} className={`flex items-center gap-1.5 text-[11px] ${c.got ? 'text-slate-700' : 'text-slate-400'}`}>
            <span>{c.got ? '✓' : '☐'}</span>
            <span className="flex-1">{c.label}</span>
            <span className="tabular-nums text-[10px] text-slate-400">+{c.points}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
const CUST_FIELDS = [
  ['email', 'Email', 'text'], ['phone', 'Phone', 'text'],
  ['segment', 'Segment', 'select'], ['cust_status', 'Status', 'select'],
]

// DB bundle (nested lead/customer/quote) -> ek flat object (field keys unique hain).
const flatten = (b) => ({ ...(b?.lead || {}), ...(b?.customer || {}), ...(b?.quote || {}) })
const hasVal = (v) =>
  v != null && v !== '' &&
  !(Array.isArray(v) && v.length === 0) &&
  !(typeof v === 'object' && !Array.isArray(v) && !Object.values(v).some((x) => x))

function ValidateBtn({ state, onClick, label = 'Validate' }) {
  const ok = state === 'ok', saving = state === 'saving', err = state === 'err'
  return (
    <button onClick={onClick} disabled={saving} title="Save this field to the database"
      className={`shrink-0 inline-flex items-center gap-1 rounded-lg border px-2.5 py-2 text-xs font-semibold ${ok ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : err ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
      {saving ? '…' : ok ? 'Saved' : err ? 'Retry' : label}
    </button>
  )
}

function Field({ label, k, type, val, aiFilled, state, onChange, onValidate }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <label className="text-xs font-semibold text-slate-600">{label}</label>
        {aiFilled && <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[9px] font-bold text-violet-600">✨ AI</span>}
      </div>
      <div className="mt-1 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {type === 'select' ? (
            <select value={val || ''} onChange={(e) => onChange(e.target.value)} className={INPUT}>
              <option value="">—</option>
              {(OPTIONS[k] || []).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : type === 'textarea' ? (
            <textarea value={val || ''} onChange={(e) => onChange(e.target.value)} rows={2} className={INPUT} />
          ) : (
            <input type={type === 'number' ? 'number' : 'text'} value={val ?? ''} onChange={(e) => onChange(e.target.value)} className={INPUT} />
          )}
        </div>
        <ValidateBtn state={state} onClick={onValidate} />
      </div>
    </div>
  )
}

function AddressBlock({ title, addr, aiFilled, state, onChange, onValidate }) {
  const a = addr || {}
  const set = (k, v) => onChange({ ...a, [k]: v })
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">{title}{aiFilled && <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[9px] font-bold text-violet-600">✨ AI</span>}</h4>
        <ValidateBtn state={state} onClick={onValidate} label="Validate Address" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input placeholder="Address Line 1" value={a.line1 || ''} onChange={(e) => set('line1', e.target.value)} className={INPUT} />
        <input placeholder="Address Line 2" value={a.line2 || ''} onChange={(e) => set('line2', e.target.value)} className={INPUT} />
        <input placeholder="City" value={a.city || ''} onChange={(e) => set('city', e.target.value)} className={INPUT} />
        <input placeholder="State" value={a.state || ''} onChange={(e) => set('state', e.target.value)} className={INPUT} />
        <input placeholder="ZIP Code" value={a.zip || ''} onChange={(e) => set('zip', e.target.value)} className={INPUT} />
        <input placeholder="Country" value={a.country || ''} onChange={(e) => set('country', e.target.value)} className={INPUT} />
      </div>
    </div>
  )
}

function QuoteItems({ items, aiFilled, state, onChange, onValidate }) {
  const list = Array.isArray(items) ? items : []
  const set = (i, k, v) => { const next = list.map((r, j) => (j === i ? { ...r, [k]: v } : r)); onChange(next) }
  const add = () => onChange([...list, { item: '', qty: 1, item_charge: 0, shipping_charge: 0 }])
  const del = (i) => onChange(list.filter((_, j) => j !== i))
  const rowTotal = (r) => (Number(r.qty) || 0) * (Number(r.item_charge) || 0) + (Number(r.shipping_charge) || 0)
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">Quote Items{aiFilled && <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[9px] font-bold text-violet-600">✨ AI</span>}</h4>
        <ValidateBtn state={state} onClick={onValidate} label="Validate Items" />
      </div>
      <div className="space-y-2">
        {list.map((r, i) => (
          <div key={i} className="rounded-lg border border-slate-200 p-2">
            <div className="flex items-center gap-2">
              <input placeholder="Item" value={r.item || ''} onChange={(e) => set(i, 'item', e.target.value)} className={`${INPUT} flex-1`} />
              <button onClick={() => del(i)} title="Remove" className="grid h-6 w-6 shrink-0 place-items-center rounded text-rose-500 hover:bg-rose-50">✕</button>
            </div>
            <div className="mt-1 grid grid-cols-3 gap-1">
              <input type="number" placeholder="Qty" value={r.qty ?? ''} onChange={(e) => set(i, 'qty', e.target.value)} className={INPUT} />
              <input type="number" placeholder="Item $" value={r.item_charge ?? ''} onChange={(e) => set(i, 'item_charge', e.target.value)} className={INPUT} />
              <input type="number" placeholder="Ship $" value={r.shipping_charge ?? ''} onChange={(e) => set(i, 'shipping_charge', e.target.value)} className={INPUT} />
            </div>
            <div className="mt-1 text-right text-[11px] text-slate-500">Total: ${rowTotal(r).toFixed(2)}</div>
          </div>
        ))}
        {!list.length && <div className="rounded-lg border border-dashed border-slate-200 py-3 text-center text-[11px] text-slate-400">No items yet</div>}
      </div>
      <button onClick={add} className="mt-2 w-full rounded-lg border border-dashed border-slate-300 py-1.5 text-xs font-semibold text-brand-600 hover:bg-slate-50">+ Add Item</button>
    </div>
  )
}

export default function LeadPanel({ conv, onClose }) {
  const [tab, setTab] = useState('lead')
  const [vals, setVals] = useState({})
  const [aiFilled, setAiFilled] = useState({})   // fieldKey -> true (AI ne bhara, abhi tak save nahi)
  const [fs, setFs] = useState({})               // fieldKey -> 'idle'|'saving'|'ok'|'err'
  const [score, setScore] = useState(null)       // { score, band, breakdown } — qualification
  const [extracting, setExtracting] = useState(false)
  const [err, setErr] = useState('')

  const cid = conv?.id

  const runExtract = () => {
    if (!cid) return
    setExtracting(true); setErr('')
    api.get(`/api/leads/extract/${encodeURIComponent(cid)}`)
      .then((r) => {
        if (!r?.fields) return
        const ai = flatten(r.fields)
        setVals((cur) => {
          const next = { ...cur }; const filled = {}
          for (const [k, v] of Object.entries(ai)) {
            if (!hasVal(cur[k]) && hasVal(v)) { next[k] = v; filled[k] = true }
          }
          setAiFilled((a) => ({ ...a, ...filled }))
          return next
        })
      })
      .catch((e) => setErr(e?.message || 'AI extract failed'))
      .finally(() => setExtracting(false))
  }

  // Conversation badalne par: pehle DB ke saved values, phir AI se khaali fields bhar do.
  useEffect(() => {
    if (!cid) return
    let cancelled = false
    setVals({}); setAiFilled({}); setFs({}); setErr(''); setScore(null)
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

  const setVal = (k, v) => {
    setVals((c) => ({ ...c, [k]: v }))
    setAiFilled((a) => ({ ...a, [k]: false }))
    setFs((s) => ({ ...s, [k]: 'idle' }))
  }
  const validate = (k) => async () => {
    if (!cid) return
    setFs((s) => ({ ...s, [k]: 'saving' }))
    try {
      await api.post(`/api/leads/field/${encodeURIComponent(cid)}`, { field: k, value: vals[k] ?? '' })
      setFs((s) => ({ ...s, [k]: 'ok' }))
      setAiFilled((a) => ({ ...a, [k]: false }))
    } catch {
      setFs((s) => ({ ...s, [k]: 'err' }))
    }
  }

  const TABS = [['lead', 'Lead'], ['customer', 'Customer'], ['quote', 'Quote']]

  return (
    <aside id="ai-panel" className="flex h-full flex-col overflow-hidden border-l border-slate-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 text-white">📋</span>
          <h3 className="text-sm font-bold">Lead Details</h3>
          <span className="rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">AI</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={runExtract} disabled={extracting || !cid} title="Re-extract fields from the chat"
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50">
            {extracting ? 'Extracting…' : '✨ Extract from chat'}
          </button>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-slate-100" aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      </div>

      {/* Contact strip */}
      <div className="border-b border-slate-200 px-5 py-2.5 text-xs text-slate-600">
        <div className="font-semibold text-slate-800">{conv?.name || 'Unknown'}</div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
          {conv?.phone && <span>📞 {conv.phone}</span>}
          {vals.email && <span>✉️ {vals.email}</span>}
          {conv?.channel && <span>{conv.channel}</span>}
        </div>
      </div>

      {err && <div className="border-b border-rose-100 bg-rose-50 px-5 py-2 text-xs text-rose-700">{err}</div>}

      {/* Tabs */}
      <nav className="flex items-center gap-5 border-b border-slate-200 px-5 text-sm">
        {TABS.map(([id, lbl]) => (
          <button key={id} onClick={() => setTab(id)} className={`shrink-0 border-b-2 py-3 ${tab === id ? 'border-brand-500 text-brand-600 font-semibold' : 'border-transparent text-slate-500 font-medium hover:text-slate-700'}`}>{lbl}</button>
        ))}
      </nav>

      {/* Body */}
      <div className="nice-scroll flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {tab === 'lead' && (<>
          <QualCard q={score} temp={score ? deriveTemp(score.score, vals.purchase_intent) : null} />
          {LEAD_FIELDS.map(([k, lbl, type]) => (
            <Field key={k} k={k} label={lbl} type={type} val={vals[k]} aiFilled={aiFilled[k]} state={fs[k]}
              onChange={(v) => setVal(k, v)} onValidate={validate(k)} />
          ))}
        </>)}

        {tab === 'customer' && (<>
          {CUST_FIELDS.map(([k, lbl, type]) => (
            <Field key={k} k={k} label={lbl} type={type} val={vals[k]} aiFilled={aiFilled[k]} state={fs[k]}
              onChange={(v) => setVal(k, v)} onValidate={validate(k)} />
          ))}
          <AddressBlock title="Shipping Address" addr={vals.shipping_address} aiFilled={aiFilled.shipping_address} state={fs.shipping_address}
            onChange={(v) => setVal('shipping_address', v)} onValidate={validate('shipping_address')} />
          <AddressBlock title="Billing Address" addr={vals.billing_address} aiFilled={aiFilled.billing_address} state={fs.billing_address}
            onChange={(v) => setVal('billing_address', v)} onValidate={validate('billing_address')} />
        </>)}

        {tab === 'quote' && (<>
          <QuoteItems items={vals.line_items} aiFilled={aiFilled.line_items} state={fs.line_items}
            onChange={(v) => setVal('line_items', v)} onValidate={validate('line_items')} />
          <div>
            <label className="text-xs font-semibold text-slate-600">Notes</label>
            <div className="mt-1 flex items-start gap-2">
              <textarea value={vals.quote_notes || ''} onChange={(e) => setVal('quote_notes', e.target.value)} rows={2} className={INPUT} />
              <ValidateBtn state={fs.quote_notes} onClick={validate('quote_notes')} />
            </div>
          </div>
          {[['estimated_value', 'Estimated Value'], ['subtotal', 'Subtotal'], ['shipping_charges', 'Shipping Charges'], ['grand_total', 'Grand Total']].map(([k, lbl]) => (
            <Field key={k} k={k} label={lbl} type="number" val={vals[k]} aiFilled={aiFilled[k]} state={fs[k]}
              onChange={(v) => setVal(k, v)} onValidate={validate(k)} />
          ))}
        </>)}

        <p className="pt-1 text-center text-[10px] text-slate-400">✨ AI ne bhare fields review karo, phir har field ke ✓ Validate par click karke DB me save karo.</p>
      </div>
    </aside>
  )
}
