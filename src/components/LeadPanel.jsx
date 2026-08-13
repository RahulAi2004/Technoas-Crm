import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import { can, currentUser } from '../lib/auth.js'
import { buildDocHtml } from '../lib/quoteDoc.js'

// Field audit tag — kis user ne KAB validate/update kiya.
const fmtAudit = (at) => { try { return new Date(at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) } catch { return '' } }
function AuditTag({ info }) {
  if (!info?.at) return null
  return <span className="truncate text-[9px] text-slate-400" title={`Updated by ${info.by || '?'}${info.byId != null ? ` (id ${info.byId})` : ''}`}>✓ {info.by || '—'} · {fmtAudit(info.at)}</span>
}

// ============================================================
// Lead Details — 5 tabs (Lead/Customer/Product&Artwork/Shipping/Quote).
// Dense fields + status badge (Confirmed / Needs Confirmation / Not Discussed).
// Har field ke Validate par TURANT DB me save. Neeche Save Draft + Submit.
// Side panel; ⤢ se wide full-view (mockups jaisa).
// ============================================================

const INPUT = 'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100'

const OPT = {
  stage: ['Qualification', 'Contacted', 'Proposal', 'Negotiation', 'Won', 'Lost'],
  lead_status: ['Active', 'Inactive', 'Won', 'Lost'],
  qualification: ['Qualified', 'Unqualified', 'Pending'],
  purchase_intent: ['Researching', 'Browsing', 'Price Comparing', 'Interested', 'Ready to Buy', 'Waiting Payment', 'Returning Customer'],
  priority: ['Low', 'Medium', 'High'],
  segment: ['Event Customer', 'Reseller', 'Wholesale', 'Individual', 'Business'],
  cust_status: ['Active', 'Inactive', 'Lead'],
  preferred_channel: ['WhatsApp', 'Facebook', 'Instagram', 'Email', 'Phone'],
  preferred_language: ['English', 'Spanish', 'French', 'Arabic', 'Urdu', 'Portuguese', 'Other'],
  loyalty_tier: ['Standard', 'Silver', 'Gold', 'Platinum', 'VIP'],
  product_type: ['T-Shirt', 'Hoodie', 'Polo', 'Sweatshirt', 'DTF Transfer', 'Gang Sheet', 'Other'],
  garment_source: ['Decoinks Supply', 'Customer Supplied'],
  print_method: ['DTF', 'Screen Print', 'Embroidery', 'Other'],
  artwork_status: ['Missing', 'Received', 'In Review', 'Changes Required', 'Approved'],
  shipping_method: ['Standard', 'Express', 'Pickup'],
  quote_status: ['Draft', 'Sent', 'Viewed', 'Accepted', 'Rejected', 'Expired'],
  currency: ['USD', 'PKR', 'EUR', 'GBP'],
  order_currency: ['USD', 'PKR', 'EUR', 'GBP'],
  order_status: ['pending', 'in_production', 'shipped', 'delivered', 'cancelled'],
  payment_status: ['pending', 'partial', 'paid'],
  invoice_status: ['Draft', 'Sent', 'Paid', 'Partially Paid', 'Overdue', 'Cancelled'],
  payment_terms: ['Due on Receipt', 'Net 15', 'Net 30', 'Net 60', 'Paid'],
  payment_method: ['Cashapp', 'Zelle', 'PayPal', 'Bank Transfer', 'Cash', 'Other'],
  invoice_currency: ['USD', 'PKR', 'EUR', 'GBP', 'CAD'],
  // Decoinks parity — added fields
  lead_source: ['Facebook Messenger', 'WhatsApp', 'Instagram', 'Email', 'Walk-in', 'Phone', 'Referral', 'Other'],
  customer_source: ['Facebook Messenger', 'WhatsApp', 'Instagram', 'Email', 'Walk-in', 'Phone', 'Referral', 'Other'],
  production_time: ['1 - 2 Business Days', '2 - 3 Business Days', '3 - 5 Business Days', '1 Week', '2 Weeks'],
  pay_method: ['Bank Transfer', 'Cash', 'Card', 'PayPal', 'Zelle', 'Cheque', 'Other'],
  pay_status: ['Completed', 'Pending', 'Failed', 'Refunded'],
  pay_received_into: ['Bank of America — Decoinks LLC', 'PayPal — info@decoinks.com', 'Zelle — DECOINKS, LLC'],
  sheet_size: ['22" x 60"', '22" x 120"', '24" x 60"', '30" x 60"'],   // combo
  carrier: ['UPS', 'FedEx', 'USPS', 'DHL'],                            // combo
  // combo (dropdown + custom typeable) — variable values, isliye strict select nahi.
  garment_color: ['Black', 'White', 'Navy', 'Royal Blue', 'Red', 'Sport Grey', 'Charcoal', 'Maroon', 'Forest Green', 'Purple', 'Pink', 'Gold', 'Orange', 'Heather Grey'],
  brand_style: ['Gildan 5000', 'Gildan 18500', 'Gildan 64000', 'Bella+Canvas 3001', 'Next Level 3600', 'Hanes 5250', 'Comfort Colors 1717', 'Champion S700', 'Independent Trading', 'Port & Company'],
  front_print_size: ['Left Chest ~4in', 'Full Front ~11in', 'Full Front ~12in', 'Pocket ~3.5in', 'A4', 'A3'],
  back_print_size: ['Full Back ~11in', 'Full Back ~12in', 'Upper Back ~4in', 'A3'],
}
const PRINT_LOCATIONS = ['Front', 'Back', 'Left Chest', 'Right Chest', 'Sleeves']

// section -> [ [key, label, type] ]  (type: text|number|select|textarea|date|toggle)
const LEAD_FIELDS = [
  ['stage', 'Stage', 'select'], ['lead_status', 'Lead Status', 'select'],
  ['lead_source', 'Lead Source', 'select'], ['source_campaign', 'Source Campaign', 'text'],
  ['purchase_intent', 'Purchase Intent', 'select'], ['qualification', 'Qualification', 'select'],
  ['priority', 'Priority', 'select'], ['next_followup_date', 'Next Follow-up', 'date'],
  ['pending_questions', 'Pending Questions', 'textarea'],
  ['lead_summary', 'Lead Summary', 'textarea'], ['internal_notes', 'Internal Notes (agent)', 'textarea'],
]
const CUST_FIELDS = [
  ['first_name', 'First Name', 'text'], ['last_name', 'Last Name', 'text'],
  ['business_name', 'Company Name', 'text'], ['email', 'Email', 'text'],
  ['company_phone', 'Company Phone', 'text'], ['mobile_number', 'Mobile Number', 'text'],
  ['whatsapp', 'WhatsApp Number', 'text'],
  ['preferred_language', 'Preferred Language', 'select'], ['preferred_channel', 'Preferred Channel', 'select'],
  ['segment', 'Customer Segment', 'select'], ['loyalty_tier', 'Loyalty Tier', 'select'],
  ['cust_status', 'Status', 'select'], ['customer_source', 'Source Channel', 'select'],
  ['website', 'Website', 'text'], ['facebook_id', 'Facebook ID', 'text'],
  ['instagram_id', 'Instagram ID', 'text'], ['wechat', 'WeChat ID', 'text'],
  ['tax_exempt', 'Tax Exempt', 'toggle'], ['tax_number', 'Tax / VAT Number', 'text'],
  ['customer_notes', 'Customer Notes', 'textarea'],
]
const PROD_FIELDS = [
  ['product_type', 'Product Type', 'select'], ['garment_source', 'Garment Source', 'select'],
  ['brand_style', 'Brand / Style', 'combo'], ['garment_color', 'Color', 'combo'],
  ['total_quantity', 'Total Quantity', 'number'], ['print_method', 'Print Method', 'select'],
  ['front_print_size', 'Front Print Size', 'combo'], ['back_print_size', 'Back Print Size', 'combo'],
  ['artwork_count', 'No. of Artworks/Designs', 'number'], ['sheet_size', 'Gangsheet / Transfer Size', 'combo'],
]
const ART_FIELDS = [
  ['artwork_required', 'Artwork Required', 'toggle'], ['artwork_status', 'Artwork Status', 'select'],
  ['artwork_instructions', 'Artwork Instructions', 'textarea'], ['designer_notes', 'Designer Notes (internal)', 'textarea'],
]
// Address (street/city/state/zip) upar AddressBlock me — yahan sirf delivery/logistics fields.
const SHIP_FIELDS = [
  ['shipping_method', 'Shipping Method', 'select'], ['is_rush_order', 'Rush Order', 'toggle'],
  ['production_time', 'Production Lead Time', 'select'],
  ['required_delivery_date', 'Required Delivery Date', 'date'], ['event_date', 'Event Date', 'date'],
  ['estimated_delivery', 'Estimated Delivery Date', 'date'],
  ['carrier', 'Carrier', 'combo'], ['tracking_number', 'Tracking Number', 'text'],
  ['estimated_shipping_cost', 'Est. Shipping Cost', 'number'], ['package_weight_lbs', 'Package Weight (lbs)', 'number'],
  ['delivery_instructions', 'Delivery Instructions', 'textarea'],
]
const QUOTE_FIELDS = [
  ['quote_status', 'Quote Status', 'select'], ['quote_date', 'Quote Date', 'date'],
  ['valid_until', 'Valid Until', 'date'], ['currency', 'Currency', 'select'],
  ['estimated_value', 'Estimated Value', 'number'], ['discount', 'Discount', 'number'],
  ['subtotal', 'Subtotal', 'number'], ['quote_rush_services', 'Rush Services', 'number'],
  ['shipping_charges', 'Shipping Charges', 'number'],
  ['quote_tax_pct', 'Tax %', 'number'], ['quote_tax', 'Tax Amount', 'number'],
  ['grand_total', 'Grand Total', 'number'],
  ['customer_requirement_summary', 'Customer Requirement Summary', 'textarea'],
]
// INVOICE (Sales Order se pehle) — Decoinks New Invoice ke most-needed fields.
const INVOICE_FIELDS = [
  ['invoice_number', 'Invoice #', 'text'], ['invoice_status', 'Invoice Status', 'select'],
  ['invoice_date', 'Invoice Date', 'date'], ['invoice_due_date', 'Due Date', 'date'],
  ['payment_terms', 'Payment Terms', 'select'], ['payment_method', 'Payment Method', 'select'],
  ['invoice_currency', 'Currency', 'select'],
  ['invoice_subtotal', 'Subtotal', 'number'], ['invoice_discount', 'Discount', 'number'],
  ['invoice_tax', 'Tax', 'number'], ['invoice_shipping', 'Shipping', 'number'],
  ['invoice_total', 'Grand Total', 'number'],
  ['amount_paid', 'Amount Paid', 'number'], ['balance_due', 'Balance Due', 'number'],
]
// PAYMENT (Invoice ke baad) — customer payment record ke agent-validatable fields.
const PAY_FIELDS = [
  ['pay_date', 'Payment Date', 'date'], ['pay_amount', 'Amount', 'number'],
  ['pay_fee', 'Processor Fee', 'number'], ['pay_method', 'Payment Method', 'select'],
  ['pay_status', 'Payment Status', 'select'], ['pay_txn_id', 'Transaction ID', 'text'],
  ['pay_reference', 'Reference No', 'text'], ['pay_received_from', 'Received From', 'text'],
  ['pay_received_into', 'Received Into (our account)', 'select'],
  ['pay_sender_bank', 'Sender Bank', 'text'], ['pay_account_name', 'Sender Account Name', 'text'],
  ['pay_account_last4', 'Account (last 4)', 'text'], ['pay_sender_ref', 'Sender Reference', 'text'],
]
const ORDER_FIELDS = [
  ['order_status', 'Order Status', 'select'], ['payment_status', 'Payment Status', 'select'],
  ['order_currency', 'Currency', 'select'], ['order_items_count', 'Items Count', 'number'],
  ['order_total', 'Total Amount', 'number'], ['order_deadline', 'Deadline', 'date'],
  ['production_partner', 'Production Partner', 'text'], ['order_products', 'Products', 'text'],
  ['order_summary', 'Order Summary', 'textarea'], ['order_instructions', 'Special Instructions', 'textarea'],
]

// Har tab ke saare field keys — "Confirm all" + unsaved-count ke liye.
const TAB_KEYS = {
  lead: [...LEAD_FIELDS.map((f) => f[0]), 'lost_reason'],
  customer: [...CUST_FIELDS.map((f) => f[0]), 'shipping_address', 'billing_address'],
  product: [...PROD_FIELDS.map((f) => f[0]), 'size_breakdown', 'print_locations', 'special_instructions', ...ART_FIELDS.map((f) => f[0])],
  shipping: [...SHIP_FIELDS.map((f) => f[0])],
  quote: [...QUOTE_FIELDS.map((f) => f[0]), 'line_items', 'quote_notes'],
  invoice: [...INVOICE_FIELDS.map((f) => f[0]), 'invoice_lines', 'invoice_notes'],
  payment: [...PAY_FIELDS.map((f) => f[0]), 'pay_notes'],
  order: [...ORDER_FIELDS.map((f) => f[0])],   // order_lines UI hata diya — items ab Invoice se
}

const flatten = (b) => ({ ...(b?.lead || {}), ...(b?.customer || {}), ...(b?.product || {}), ...(b?.shipping || {}), ...(b?.quote || {}), ...(b?.invoice || {}), ...(b?.payment || {}), ...(b?.order || {}) })

// Saare field keys (Pending list ke liye — har tab ke).
const ALL_FIELD_KEYS = [...new Set(Object.values(TAB_KEYS).flat())]

// field key -> human label + kis tab me hai (Submit error me batane ke liye).
const FIELD_LABELS = Object.fromEntries([...LEAD_FIELDS, ...CUST_FIELDS, ...PROD_FIELDS, ...ART_FIELDS, ...SHIP_FIELDS, ...QUOTE_FIELDS, ...INVOICE_FIELDS, ...PAY_FIELDS, ...ORDER_FIELDS].map((f) => [f[0], f[1]]))
Object.assign(FIELD_LABELS, { lost_reason: 'Lost Reason', shipping_address: 'Shipping Address', billing_address: 'Billing Address', size_breakdown: 'Size Breakdown', print_locations: 'Print Locations', special_instructions: 'Special Instructions', line_items: 'Quote Items', quote_notes: 'Quote Notes', invoice_lines: 'Invoice Items', invoice_notes: 'Invoice Notes', pay_notes: 'Payment Notes', order_lines: 'Order Line Items' })
const labelOf = (k) => FIELD_LABELS[k] || k
const tabOfKey = (k) => Object.keys(TAB_KEYS).find((t) => TAB_KEYS[t].includes(k)) || null
const hasVal = (v) =>
  v != null && v !== '' && v !== false &&
  !(Array.isArray(v) && v.length === 0) &&
  !(typeof v === 'object' && !Array.isArray(v) && !Object.values(v).some((x) => x))

// Band colors for qualification bar
const SCORE_COLOR = (s) => s >= 70 ? 'bg-emerald-500' : s >= 40 ? 'bg-amber-500' : 'bg-rose-500'
const TEMP_CHIP = { Hot: 'bg-rose-50 text-rose-700 ring-rose-200', Warm: 'bg-amber-50 text-amber-700 ring-amber-200', Cold: 'bg-sky-50 text-sky-700 ring-sky-200' }

// Saaf validate control — text-wala (icon nahi), state turant samajh aaye:
//   khaali -> "—" · value hai -> amber "Validate" (dabao) · saved -> green "✓ Saved" · fail -> "Retry"
function Validate({ state, filled, val, onClick, label = 'Validate' }) {
  const confirmed = state === 'ok', saving = state === 'saving', err = state === 'err', empty = !hasVal(val)
  if (empty) return <span className="shrink-0 select-none px-1 text-[11px] text-slate-300">—</span>
  if (confirmed) return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-50 px-2 py-1.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>Saved
    </span>
  )
  return (
    <button onClick={onClick} disabled={saving} title="Save this field to the database"
      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 text-[10px] font-bold text-white ${err ? 'bg-rose-500 hover:bg-rose-600' : 'bg-amber-500 hover:bg-amber-600'} disabled:opacity-60`}>
      {saving ? 'Saving…' : err ? 'Retry' : label}
    </button>
  )
}

// Field ke aage chhota status dot: green=saved, amber=value-hai-unsaved, grey=khaali
const dotOf = (state, val) => state === 'ok' ? 'bg-emerald-500' : hasVal(val) ? 'bg-amber-400' : 'bg-slate-200'

function Field({ k, label, type, val, filled, state, onChange, onValidate, locked, auditInfo }) {
  const dis = locked ? INPUT + ' cursor-not-allowed bg-slate-50 text-slate-400' : INPUT
  return (
    <div id={`fld-${k}`} className={`min-w-0 scroll-mt-4 ${type === 'textarea' ? 'col-span-full' : ''}`}>
      <div className="mb-1 flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotOf(state, val)}`} />
        <label className="truncate text-[11px] font-semibold text-slate-700">{label}</label>
        {filled && <span className="rounded bg-violet-100 px-1 text-[8px] font-bold text-violet-700">AI</span>}
      </div>
      <div className="flex items-center gap-1.5">
        <div className="min-w-0 flex-1">
          {type === 'select' ? (
            <select value={val || ''} disabled={locked} onChange={(e) => onChange(e.target.value)} className={dis}>
              <option value="">—</option>
              {(OPT[k] || []).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : type === 'combo' ? (
            // dropdown suggestions + custom bhi type kar sakte hain (variable values ke liye)
            <>
              <input list={`dl-${k}`} value={val ?? ''} disabled={locked} onChange={(e) => onChange(e.target.value)} className={dis} placeholder="Select or type…" />
              <datalist id={`dl-${k}`}>{(OPT[k] || []).map((o) => <option key={o} value={o} />)}</datalist>
            </>
          ) : type === 'textarea' ? (
            <textarea value={val || ''} disabled={locked} onChange={(e) => onChange(e.target.value)} rows={2} className={dis} />
          ) : type === 'toggle' ? (
            <button disabled={locked} onClick={() => !locked && onChange(!val)} className={`inline-flex h-6 w-11 items-center rounded-full px-0.5 transition ${val ? 'bg-emerald-500' : 'bg-slate-300'} ${locked ? 'opacity-50' : ''}`}>
              <span className={`h-5 w-5 rounded-full bg-white transition ${val ? 'translate-x-5' : ''}`} />
            </button>
          ) : (
            <input type={type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'} value={val ?? ''} disabled={locked} onChange={(e) => onChange(e.target.value)} className={dis} />
          )}
        </div>
        {locked
          ? <span title="Your role doesn't have permission to validate or fill this section" className="shrink-0 select-none px-1 text-[13px] text-slate-300">🔒</span>
          : <Validate k={k} state={state} filled={filled} val={val} onClick={onValidate} />}
      </div>
      {auditInfo?.at && <div className="mt-0.5 text-right"><AuditTag info={auditInfo} /></div>}
    </div>
  )
}

function AddressBlock({ title, addr, filled, state, sameAs, onSame, onChange, onValidate, auditInfo }) {
  const a = addr || {}
  const set = (kk, v) => onChange({ ...a, [kk]: v })
  return (
    <div className="rounded-lg border border-slate-200 p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <h4 className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-700">{title}{filled && <span className="rounded bg-violet-50 px-1 text-[8px] font-bold text-violet-600">AI</span>}</h4>
        <span className="flex items-center gap-1.5">{auditInfo?.at && <AuditTag info={auditInfo} />}<Validate state={state} val={a} filled={filled} onClick={onValidate} /></span>
      </div>
      {onSame && (
        <label className="mb-1.5 flex items-center gap-1.5 text-[11px] text-slate-600">
          <input type="checkbox" checked={!!sameAs} onChange={(e) => onSame(e.target.checked)} /> Same as Shipping Address
        </label>
      )}
      {!sameAs && (
        <div className="grid grid-cols-2 gap-1.5">
          <input key="contact" placeholder="Contact Person" value={a.contact || ''} onChange={(e) => set('contact', e.target.value)} className={`${INPUT} col-span-2`} />
          {[['line1', 'Address Line 1'], ['line2', 'Address Line 2'], ['city', 'City'], ['state', 'State'], ['zip', 'ZIP'], ['country', 'Country']].map(([kk, ph]) => (
            <input key={kk} placeholder={ph} value={a[kk] || ''} onChange={(e) => set(kk, e.target.value)} className={INPUT} />
          ))}
        </div>
      )}
    </div>
  )
}

function SizeBreakdown({ rows, total, filled, state, onChange, onValidate, auditInfo }) {
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
        <span className="flex items-center gap-1.5">{auditInfo?.at && <AuditTag info={auditInfo} />}<Validate state={state} val={list} filled={filled} onClick={onValidate} /></span>
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

function PrintLocations({ value, filled, state, onChange, onValidate, auditInfo }) {
  const sel = Array.isArray(value) ? value : []
  const toggle = (loc) => onChange(sel.includes(loc) ? sel.filter((x) => x !== loc) : [...sel, loc])
  return (
    <div className="rounded-lg border border-slate-200 p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <h4 className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-700">Print Locations{filled && <span className="rounded bg-violet-50 px-1 text-[8px] font-bold text-violet-600">AI</span>}</h4>
        <span className="flex items-center gap-1.5">{auditInfo?.at && <AuditTag info={auditInfo} />}<Validate state={state} val={sel} filled={filled} onClick={onValidate} /></span>
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

// ── BlankTex Product Master picker (Decoinks parity) ─────────────────────────
// Wahi source jo Decoinks New Quotation/Invoice use karta hai — /api/catalog/styles ->
// integration.blanktex_decoinks_styles. Style select karte hi brand, style code, image,
// colors, sizes aur SKU row me apne aap aa jaate hain.
function CatalogStyleSearch({ onSelect }) {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const box = useRef(null)

  useEffect(() => {
    let dead = false
    setLoading(true)
    const t = setTimeout(() => {
      api.get(`/api/catalog/styles?limit=50${q ? `&search=${encodeURIComponent(q)}` : ''}`)
        .then((d) => { if (!dead) { setRows(Array.isArray(d) ? d : []); setError('') } })
        .catch((e) => { if (!dead) setError(e?.message || 'Catalog unavailable') })
        .finally(() => { if (!dead) setLoading(false) })
    }, 250)
    return () => { dead = true; clearTimeout(t) }
  }, [q])

  useEffect(() => {
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const choose = async (style) => {
    setBusyId(style.id)
    try {
      onSelect(await api.get(`/api/catalog/styles/${encodeURIComponent(style.id)}`))
      setQ(''); setOpen(false)
    } catch (e) { setError(e?.message || 'Could not load style colors and sizes') }
    finally { setBusyId('') }
  }

  return (
    <div ref={box} className="relative mb-1.5">
      <input value={q} onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true) }}
        placeholder="🔍 Search style by name, brand, style code or SKU…" className={QI} />
      {open && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-pop">
          <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-slate-50 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-slate-400">
            <span>Available product styles ({rows.length})</span>{loading && <span className="normal-case text-slate-400">loading…</span>}
          </div>
          {error && <div className="px-2 py-2 text-[11px] text-rose-600">{error}</div>}
          {!error && !loading && !rows.length && <div className="px-2 py-3 text-center text-[11px] text-slate-400">No styles found</div>}
          {rows.map((s) => (
            <button key={s.id} type="button" disabled={!!busyId} onClick={() => choose(s)}
              className="flex w-full items-center gap-2 border-b border-slate-50 px-2 py-1.5 text-left hover:bg-slate-50 disabled:opacity-60">
              <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded bg-slate-100 text-[12px]">
                {s.image_url ? <img src={s.image_url} alt="" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} /> : '📦'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-bold text-slate-800">{s.name}</span>
                <span className="block truncate text-[9px] text-slate-500">{s.brand || '—'} · Style {s.sku}</span>
              </span>
              <span className="shrink-0 text-[9px] text-slate-400">
                {busyId === s.id ? 'loading…' : `${s.total_colors || 0} colors · ${s.total_sizes || 0} sizes · ${s.total_skus || 0} SKUs`}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Row me sirf style_id/naam store hote hain (JSON halka rehta hai) — colors/sizes/SKU yahan cache hote hain.
function useStyleDetails(ids) {
  const key = [...new Set(ids.filter(Boolean))].sort().join(',')
  const [map, setMap] = useState({})
  useEffect(() => {
    const missing = (key ? key.split(',') : []).filter((id) => !map[id])
    if (!missing.length) return
    let dead = false
    Promise.all(missing.map((id) => api.get(`/api/catalog/styles/${encodeURIComponent(id)}`).then((d) => [id, d]).catch(() => null)))
      .then((pairs) => { if (!dead) setMap((m) => ({ ...m, ...Object.fromEntries(pairs.filter(Boolean)) })) })
    return () => { dead = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return map
}

const skuOf = (style, colorId, sizeId) =>
  style?.variants?.find((v) => String(v.color_id) === String(colorId) && String(v.size_id) === String(sizeId))?.sku || ''

// Catalog se aayi row ka product cell — image + naam + brand/style (Decoinks jaisa).
function QiProduct({ row, nameKey, onDetach }) {
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-1">
      <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded bg-white text-[12px]">
        {row.product_image
          ? <img src={row.product_image} alt="" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />
          : '📦'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] font-bold text-slate-800">{row[nameKey] || 'Catalog style'}</span>
        <span className="block truncate text-[9px] text-slate-500">{row.brand || '—'} · Style {row.style_code || '—'}</span>
      </span>
      <button onClick={onDetach} title="Detach from the catalog (type manually)" className="shrink-0 px-1 text-slate-400 hover:text-rose-600">✕</button>
    </div>
  )
}

// Catalog style -> nayi row ke common fields (quote aur invoice dono ke liye).
const catalogRowFields = (style, nameKey) => ({
  category: style.garment_category || 'T-Shirt',
  [nameKey]: style.name || '',
  brand_style: [style.brand, style.sku].filter(Boolean).join(' '),
  style_id: style.id, style_code: style.sku || '', brand: style.brand || '',
  product_image: style.image_url || '', style_description: style.description || '',
  color_id: '', size_id: '', color: '', size: '', sku: '',
})

// ── Quote Items — Decoinks "New Quotation" parity ────────────────────────────
// Pehle Quote Type chuno (Apparel / DTF Transfers / Gangsheet) — phir usi type ke apne
// fields + dropdowns khulte hain. Sab kuch line_items JSON me hi jata hai: har row par
// quote_type + type-specific keys, aur item_type/item_name/quantity/unit_price/amount
// hamesha bharte hain taake backend + AI extraction ka purana shape na toote.
const QUOTE_TYPES = [
  { key: 'apparel', icon: '👕', label: 'Custom Printed Apparel', desc: 'T-Shirts, Hoodies, Caps with DTF / screen prints', on: 'border-sky-400 bg-sky-50 ring-1 ring-sky-200', chip: 'bg-sky-100 text-sky-700' },
  { key: 'dtf', icon: '🖨️', label: 'DTF Transfers', desc: 'Gang-sheet cut heat transfers quoted by size & qty', on: 'border-orange-400 bg-orange-50 ring-1 ring-orange-200', chip: 'bg-orange-100 text-orange-700' },
  { key: 'gangsheet', icon: '📐', label: 'Gangsheet', desc: 'Full gang sheets with multiple artwork designs', on: 'border-violet-400 bg-violet-50 ring-1 ring-violet-200', chip: 'bg-violet-100 text-violet-700' },
]
const APPAREL_CATEGORIES = ['T-Shirt', 'Hoodie', 'Sweatshirt', 'Polo Shirt', 'Tank Top', 'Long Sleeve', 'Jacket', 'Cap / Hat', 'Kids Apparel', 'Other']
const APPAREL_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', 'Youth S', 'Youth M', 'Youth L']
const GANGSHEET_SIZES = ['22" x 60"', '22" x 120"', '24" x 60"', '30" x 60"']
const ITEM_TYPE_OF = { apparel: 'garment', dtf: 'printing', gangsheet: 'printing' }
// row cards ke andar chhote inputs (INPUT se thoda dense).
const QI = 'w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100'

const blankItem = (type) =>
  type === 'dtf' ? { quote_type: 'dtf', item_type: 'printing', artwork_no: '', width: '', height: '', quantity: 1, unit_price: 0, amount: 0 }
  : type === 'gangsheet' ? { quote_type: 'gangsheet', item_type: 'printing', sheet_size: GANGSHEET_SIZES[0], artwork_count: 1, quantity: 1, unit_price: 0, amount: 0 }
  : { quote_type: 'apparel', item_type: 'garment', category: 'T-Shirt', item_name: '', brand_style: '', color: '', size: '', print_method: 'DTF', print_location: '', quantity: 1, unit_price: 0, amount: 0 }

// DTF/Gangsheet rows me naam ka field nahi hota — PDF/AI ke liye item_name khud bana dete hain.
const autoItemName = (r) =>
  r.quote_type === 'dtf'
    ? ['DTF Transfer', r.artwork_no, (r.width && r.height) ? `${r.width}" x ${r.height}"` : ''].filter(Boolean).join(' · ')
    : ['Gangsheet', r.sheet_size, Number(r.artwork_count) ? `${r.artwork_count} artwork${Number(r.artwork_count) > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ')

function QiCell({ label, className = '', children }) {
  return (
    <label className={`min-w-0 ${className}`}>
      <span className="mb-0.5 block truncate text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  )
}

// Brand/Color/Size ki suggestions — Quote aur Invoice dono sections ke combo inputs isi ko point karte hain.
// (ek waqt me ek hi tab render hota hai, isliye id clash nahi hota.)
function QiDataLists() {
  return (
    <>
      <datalist id="dl-qi-brand">{OPT.brand_style.map((o) => <option key={o} value={o} />)}</datalist>
      <datalist id="dl-qi-color">{OPT.garment_color.map((o) => <option key={o} value={o} />)}</datalist>
      <datalist id="dl-qi-size">{APPAREL_SIZES.map((o) => <option key={o} value={o} />)}</datalist>
    </>
  )
}

function QuoteItems({ items, filled, state, onChange, onValidate, auditInfo }) {
  const list = Array.isArray(items) ? items : []
  const detected = list.find((r) => r.quote_type)?.quote_type || null
  const [pick, setPick] = useState('apparel')
  useEffect(() => { if (detected && detected !== pick) setPick(detected) }, [detected])  // eslint-disable-line react-hooks/exhaustive-deps
  const type = detected || pick
  const typeLocked = list.length > 0   // Decoinks jaisa — ek quote = ek type. Switch karne ke liye pehle rows hatao.

  const patch = (i, p) => onChange(list.map((r, j) => {
    if (j !== i) return r
    const next = { ...r, ...p, quote_type: r.quote_type || type }
    // purani (AI-extracted) rows ka apna item_type chhedte nahi — sirf naye/typed rows par derive.
    next.item_type = r.quote_type ? ITEM_TYPE_OF[next.quote_type] : (r.item_type || ITEM_TYPE_OF[next.quote_type])
    if (next.quote_type !== 'apparel') next.item_name = autoItemName(next)
    next.amount = +(((Number(next.quantity) || 0) * (Number(next.unit_price) || 0)).toFixed(2))
    return next
  }))
  const add = () => onChange([...list, blankItem(type)])
  const addCatalogStyle = (style) => onChange([...list, { ...blankItem('apparel'), ...catalogRowFields(style, 'item_name') }])
  const del = (i) => onChange(list.filter((_, j) => j !== i))
  const styles = useStyleDetails(list.map((r) => r.style_id))
  const amt = (r) => (Number(r.quantity) || 0) * (Number(r.unit_price) || 0)
  const totalQty = list.reduce((n, r) => n + (Number(r.quantity) || 0), 0)
  const totalAmt = list.reduce((n, r) => n + amt(r), 0)
  const artworks = type === 'gangsheet' ? list.reduce((n, r) => n + (Number(r.artwork_count) || 0), 0) : list.length
  const active = QUOTE_TYPES.find((t) => t.key === type) || QUOTE_TYPES[0]

  return (
    <div className="rounded-lg border border-slate-200 p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <h4 className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-700">Quote Items{filled && <span className="rounded bg-violet-50 px-1 text-[8px] font-bold text-violet-600">AI</span>}</h4>
        <span className="flex items-center gap-1.5">{auditInfo?.at && <AuditTag info={auditInfo} />}<Validate state={state} val={list} filled={filled} onClick={onValidate} /></span>
      </div>

      {/* Quote Type — ek hi type select hota hai, uske hisaab se neeche ke fields badalte hain */}
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Quote Type</span>
        <span className="truncate text-[9px] text-slate-400">{typeLocked ? 'Remove all rows to switch type' : 'Select ONE — each type has its own fields'}</span>
      </div>
      <div className="mb-2 grid grid-cols-3 gap-1.5">
        {QUOTE_TYPES.map((t) => {
          const on = t.key === type
          return (
            <button key={t.key} type="button" disabled={typeLocked && !on} onClick={() => setPick(t.key)}
              title={typeLocked && !on ? 'Remove the existing rows first to change the quote type' : t.desc}
              className={`rounded-lg border p-1.5 text-left transition ${on ? t.on : 'border-slate-200 bg-white hover:border-slate-300'} ${typeLocked && !on ? 'cursor-not-allowed opacity-50' : ''}`}>
              <div className="flex items-center gap-1">
                <span className="text-[13px] leading-none">{t.icon}</span>
                <span className="min-w-0 flex-1 truncate text-[10px] font-bold text-slate-800">{t.label}</span>
                {on && <span className="shrink-0 text-[9px] font-bold text-emerald-600">✓</span>}
              </div>
              <p className="mt-0.5 line-clamp-2 text-[9px] leading-tight text-slate-500">{t.desc}</p>
            </button>
          )
        })}
      </div>

      <div className={`mb-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${active.chip}`}>{active.icon} {active.label}</div>

      {type === 'apparel' && (<>
        <p className="mb-1 text-[9px] text-slate-400">Select a BlankTex Product Master style — colors, sizes and SKU fill automatically. Ya neeche row add karke manually likho.</p>
        <CatalogStyleSearch onSelect={addCatalogStyle} />
      </>)}

      <div className="space-y-1.5">
        {list.map((r, i) => {
          const style = r.style_id ? styles[r.style_id] : null
          return (
          <div key={i} className="rounded-md border border-slate-200 p-1.5">
            <div className="mb-1 flex items-center justify-between">
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">#{i + 1}</span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-700">${amt(r).toFixed(2)}</span>
                <button onClick={() => del(i)} title="Remove row" className="text-rose-400 hover:text-rose-600">✕</button>
              </div>
            </div>

            {type === 'apparel' && (
              <div className="grid grid-cols-2 gap-1 md:grid-cols-3">
                <QiCell label="Category">
                  <select value={r.category || ''} onChange={(e) => patch(i, { category: e.target.value })} className={QI}>
                    <option value="">—</option>{APPAREL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </QiCell>
                <QiCell label="Product / Description" className="col-span-2">
                  {r.style_id
                    ? <QiProduct row={r} nameKey="item_name" onDetach={() => patch(i, { style_id: '', style_code: '', product_image: '', color_id: '', size_id: '' })} />
                    : <input placeholder="e.g. 260G Crewneck Sweatshirt" value={r.item_name || ''} onChange={(e) => patch(i, { item_name: e.target.value })} className={QI} />}
                </QiCell>
                <QiCell label="Brand / Style">
                  <input list="dl-qi-brand" placeholder="Select or type…" value={r.brand_style || ''} disabled={!!r.style_id} onChange={(e) => patch(i, { brand_style: e.target.value })} className={r.style_id ? `${QI} bg-slate-50 text-slate-500` : QI} />
                </QiCell>
                <QiCell label="Color">
                  {style ? (
                    <select value={r.color_id || ''} className={QI}
                      onChange={(e) => { const c = style.colors.find((x) => String(x.id) === e.target.value); patch(i, { color_id: c?.id || '', color: c?.name || '', sku: skuOf(style, c?.id, r.size_id) }) }}>
                      <option value="">Select color</option>
                      {style.colors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  ) : (
                    <input list="dl-qi-color" placeholder="Select or type…" value={r.color || ''} onChange={(e) => patch(i, { color: e.target.value })} className={QI} />
                  )}
                </QiCell>
                <QiCell label="Size">
                  {style ? (
                    <select value={r.size_id || ''} className={QI}
                      onChange={(e) => { const s = style.sizes.find((x) => String(x.id) === e.target.value); patch(i, { size_id: s?.id || '', size: s?.name || '', sku: skuOf(style, r.color_id, s?.id) }) }}>
                      <option value="">Select size</option>
                      {style.sizes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  ) : (
                    <input list="dl-qi-size" placeholder="Select or type…" value={r.size || ''} onChange={(e) => patch(i, { size: e.target.value })} className={QI} />
                  )}
                </QiCell>
                <QiCell label="SKU">
                  {r.style_id
                    ? <div className="grid h-[30px] place-items-center overflow-hidden rounded-md bg-slate-50 px-1 text-[10px] font-semibold text-slate-600">{r.sku || (r.color_id && r.size_id ? 'No SKU' : 'Select color + size')}</div>
                    : <input placeholder="SKU" value={r.sku || ''} onChange={(e) => patch(i, { sku: e.target.value })} className={QI} />}
                </QiCell>
                <QiCell label="Print Method">
                  <select value={r.print_method || ''} onChange={(e) => patch(i, { print_method: e.target.value })} className={QI}>
                    <option value="">—</option>{OPT.print_method.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </QiCell>
                <QiCell label="Print Location">
                  <select value={r.print_location || ''} onChange={(e) => patch(i, { print_location: e.target.value })} className={QI}>
                    <option value="">—</option>{PRINT_LOCATIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </QiCell>
                <QiCell label="Qty (pcs)">
                  <input type="number" min={0} value={r.quantity ?? ''} onChange={(e) => patch(i, { quantity: e.target.value })} className={QI} />
                </QiCell>
                <QiCell label="Unit Price ($)">
                  <input type="number" min={0} step="any" value={r.unit_price ?? ''} onChange={(e) => patch(i, { unit_price: e.target.value })} className={QI} />
                </QiCell>
                <QiCell label="Amount ($)">
                  <div className="grid h-[30px] place-items-center rounded-md bg-slate-50 text-[11px] font-semibold text-slate-600">${amt(r).toFixed(2)}</div>
                </QiCell>
              </div>
            )}

            {type === 'dtf' && (
              <div className="grid grid-cols-2 gap-1 md:grid-cols-3">
                <QiCell label="Artwork No" className="col-span-2 md:col-span-1">
                  <input placeholder={`AW-${String(i + 1).padStart(4, '0')}`} value={r.artwork_no || ''} onChange={(e) => patch(i, { artwork_no: e.target.value })} className={QI} />
                </QiCell>
                <QiCell label="Width (in)">
                  <input type="number" min={0} step="any" placeholder="Width" value={r.width ?? ''} onChange={(e) => patch(i, { width: e.target.value })} className={QI} />
                </QiCell>
                <QiCell label="Height (in)">
                  <input type="number" min={0} step="any" placeholder="Height" value={r.height ?? ''} onChange={(e) => patch(i, { height: e.target.value })} className={QI} />
                </QiCell>
                <QiCell label="Qty (pcs)">
                  <input type="number" min={0} value={r.quantity ?? ''} onChange={(e) => patch(i, { quantity: e.target.value })} className={QI} />
                </QiCell>
                <QiCell label="Rate ($)">
                  <input type="number" min={0} step="any" value={r.unit_price ?? ''} onChange={(e) => patch(i, { unit_price: e.target.value })} className={QI} />
                </QiCell>
                <QiCell label="Amount ($)">
                  <div className="grid h-[30px] place-items-center rounded-md bg-slate-50 text-[11px] font-semibold text-slate-600">${amt(r).toFixed(2)}</div>
                </QiCell>
              </div>
            )}

            {type === 'gangsheet' && (
              <div className="grid grid-cols-2 gap-1 md:grid-cols-3">
                <QiCell label="Gangsheet Size" className="col-span-2 md:col-span-1">
                  {GANGSHEET_SIZES.includes(r.sheet_size) || !r.sheet_size ? (
                    <select value={r.sheet_size || ''} onChange={(e) => patch(i, { sheet_size: e.target.value === '__custom__' ? '' : e.target.value })} className={QI}>
                      <option value="">—</option>{GANGSHEET_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                      <option value="__custom__">Custom…</option>
                    </select>
                  ) : (
                    <div className="flex items-center gap-1">
                      <input placeholder='e.g. 36" x 60"' value={r.sheet_size} onChange={(e) => patch(i, { sheet_size: e.target.value })} className={QI} />
                      <button onClick={() => patch(i, { sheet_size: GANGSHEET_SIZES[0] })} title="Back to list" className="shrink-0 text-slate-400 hover:text-slate-600">✕</button>
                    </div>
                  )}
                </QiCell>
                <QiCell label="No. of Artworks">
                  <input type="number" min={0} value={r.artwork_count ?? ''} onChange={(e) => patch(i, { artwork_count: e.target.value })} className={QI} />
                </QiCell>
                <QiCell label="Qty Sheets">
                  <input type="number" min={0} value={r.quantity ?? ''} onChange={(e) => patch(i, { quantity: e.target.value })} className={QI} />
                </QiCell>
                <QiCell label="Unit Price ($)">
                  <input type="number" min={0} step="any" value={r.unit_price ?? ''} onChange={(e) => patch(i, { unit_price: e.target.value })} className={QI} />
                </QiCell>
                <QiCell label="Amount ($)">
                  <div className="grid h-[30px] place-items-center rounded-md bg-slate-50 text-[11px] font-semibold text-slate-600">${amt(r).toFixed(2)}</div>
                </QiCell>
              </div>
            )}
          </div>
          )
        })}
        {!list.length && <div className="rounded-md border border-dashed border-slate-200 py-3 text-center text-[11px] text-slate-400">No {active.label} rows yet — click "+ Add {type === 'apparel' ? 'Item' : type === 'dtf' ? 'Transfer' : 'Gangsheet'} Row" below.</div>}
      </div>

      {/* Live summary — Decoinks ke section footer jaisa */}
      {list.length > 0 && (
        <div className="mt-1.5 flex items-center justify-between rounded-md bg-slate-50 px-2 py-1.5 text-[10px]">
          <span className="font-bold uppercase tracking-wide text-slate-500">{active.label} Summary</span>
          <span className="flex items-center gap-3">
            <span className="text-slate-500">{type === 'gangsheet' ? 'Sheets' : 'Total Qty'} <b className="text-slate-700">{totalQty}</b></span>
            <span className="text-slate-500">{type === 'apparel' ? 'Rows' : 'Artworks'} <b className="text-slate-700">{artworks}</b></span>
            <span className="text-slate-500">Section Total <b className="text-emerald-700">${totalAmt.toFixed(2)}</b></span>
          </span>
        </div>
      )}

      <QiDataLists />
      <button onClick={add} className="mt-1.5 w-full rounded-md border border-dashed border-slate-300 py-1 text-[11px] font-semibold text-brand-600 hover:bg-slate-50">
        + Add {type === 'apparel' ? 'Item' : type === 'dtf' ? 'Transfer' : 'Gangsheet'} Row
      </button>
    </div>
  )
}

// Sales Order line items -> app.order_lines (SKU, Product, Qty, Unit Price, Total).
function OrderLines({ items, filled, state, onChange, onValidate, auditInfo }) {
  const list = Array.isArray(items) ? items : []
  const set = (i, kk, v) => onChange(list.map((r, j) => (j === i ? { ...r, [kk]: v } : r)))
  const add = () => onChange([...list, { sku: '', product: '', qty: 1, unit_price: 0 }])
  const del = (i) => onChange(list.filter((_, j) => j !== i))
  const amt = (r) => (Number(r.qty) || 0) * (Number(r.unit_price) || 0)
  return (
    <div className="rounded-lg border border-slate-200 p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <h4 className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-700">Order Line Items{filled && <span className="rounded bg-violet-50 px-1 text-[8px] font-bold text-violet-600">AI</span>}</h4>
        <span className="flex items-center gap-1.5">{auditInfo?.at && <AuditTag info={auditInfo} />}<Validate state={state} val={list} filled={filled} onClick={onValidate} /></span>
      </div>
      <div className="space-y-1.5">
        {list.map((r, i) => (
          <div key={i} className="rounded-md border border-slate-200 p-1.5">
            <div className="flex items-center gap-1.5">
              <input placeholder="SKU" value={r.sku || ''} onChange={(e) => set(i, 'sku', e.target.value)} className={`${INPUT} w-24`} />
              <input placeholder="Product" value={r.product || ''} onChange={(e) => set(i, 'product', e.target.value)} className={`${INPUT} flex-1`} />
              <button onClick={() => del(i)} className="text-rose-400 hover:text-rose-600">✕</button>
            </div>
            <div className="mt-1 grid grid-cols-3 gap-1">
              <input type="number" placeholder="Qty" value={r.qty ?? ''} onChange={(e) => set(i, 'qty', e.target.value)} className={INPUT} />
              <input type="number" placeholder="Unit $" value={r.unit_price ?? ''} onChange={(e) => set(i, 'unit_price', e.target.value)} className={INPUT} />
              <div className="grid place-items-center rounded-lg bg-slate-50 text-[11px] font-semibold text-slate-600">${amt(r).toFixed(2)}</div>
            </div>
          </div>
        ))}
        {!list.length && <div className="rounded-md border border-dashed border-slate-200 py-2 text-center text-[11px] text-slate-400">No line items yet</div>}
      </div>
      <button onClick={add} className="mt-1.5 w-full rounded-md border border-dashed border-slate-300 py-1 text-[11px] font-semibold text-brand-600 hover:bg-slate-50">+ Add Line</button>
    </div>
  )
}

// ── Invoice Items — Decoinks "New Invoice" parity ────────────────────────────
// Order Type (Apparel / DTF Gangsheet / DTF Transfers) chuno — phir usi type ki rows.
// Storage wahi lead.extra.invoice_lines hai: har row par order_type + type-specific keys,
// aur description/qty/unit_price/amount hamesha bhare rehte hain (purana shape safe).
// Apparel rows par line-level Discount bhi hai (Decoinks jaisa) — tax invoice-level hi rehta hai.
const INVOICE_TYPES = [
  { key: 'apparel', icon: '👕', label: 'Custom Printed Apparel', on: 'border-sky-400 bg-sky-50 text-sky-800' },
  { key: 'gangsheet', icon: '📐', label: 'DTF Gangsheet', on: 'border-violet-400 bg-violet-50 text-violet-800' },
  { key: 'dtf', icon: '🖨️', label: 'DTF Transfers', on: 'border-orange-400 bg-orange-50 text-orange-800' },
]
const blankInvoiceLine = (type) =>
  type === 'dtf' ? { order_type: 'dtf', artwork_name: '', artwork_no: '', width: '', height: '', description: '', qty: 1, unit_price: 0, amount: 0 }
  : type === 'gangsheet' ? { order_type: 'gangsheet', sheet_size: GANGSHEET_SIZES[0], artwork_count: 1, description: '', qty: 1, unit_price: 0, amount: 0 }
  : { order_type: 'apparel', category: 'T-Shirt', description: '', brand_style: '', color: '', size: '', sku: '', qty: 1, unit_price: 0, discount: 0, amount: 0 }

const sizeLabel = (w, h) => (w && h ? `${w}" x ${h}"` : '—')
// Gangsheet/DTF rows me alag naam field nahi — invoice PDF ke liye description khud banate hain.
const autoLineDesc = (r) =>
  r.order_type === 'dtf'
    ? [r.artwork_name || 'DTF Transfer', r.artwork_no, (r.width && r.height) ? sizeLabel(r.width, r.height) : ''].filter(Boolean).join(' · ')
    : ['Gangsheet', r.sheet_size, Number(r.artwork_count) ? `${r.artwork_count} artwork${Number(r.artwork_count) > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ')

function InvoiceLines({ items, filled, state, onChange, onValidate, auditInfo }) {
  const list = Array.isArray(items) ? items : []
  const detected = list.find((r) => r.order_type)?.order_type || null
  const [pick, setPick] = useState('apparel')
  useEffect(() => { if (detected && detected !== pick) setPick(detected) }, [detected])  // eslint-disable-line react-hooks/exhaustive-deps
  const type = detected || pick
  const typeLocked = list.length > 0   // ek invoice = ek order type (PDF layout usi hisaab se banta hai)

  const amt = (r) => Math.max((Number(r.qty) || 0) * (Number(r.unit_price) || 0) - (Number(r.discount) || 0), 0)
  const patch = (i, p) => onChange(list.map((r, j) => {
    if (j !== i) return r
    const next = { ...r, ...p, order_type: r.order_type || type }
    if (next.order_type !== 'apparel') next.description = autoLineDesc(next)
    next.amount = +(amt(next).toFixed(2))
    return next
  }))
  const add = () => onChange([...list, blankInvoiceLine(type)])
  const addCatalogStyle = (style) => onChange([...list, { ...blankInvoiceLine('apparel'), ...catalogRowFields(style, 'description') }])
  const del = (i) => onChange(list.filter((_, j) => j !== i))
  const styles = useStyleDetails(list.map((r) => r.style_id))
  const totalQty = list.reduce((n, r) => n + (Number(r.qty) || 0), 0)
  const artworks = type === 'gangsheet' ? list.reduce((n, r) => n + (Number(r.artwork_count) || 0), 0) : list.length
  const total = list.reduce((n, r) => n + amt(r), 0)
  const active = INVOICE_TYPES.find((t) => t.key === type) || INVOICE_TYPES[0]

  return (
    <div className="rounded-lg border border-slate-200 p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <h4 className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-700">Invoice Items{filled && <span className="rounded bg-violet-50 px-1 text-[8px] font-bold text-violet-600">AI</span>}</h4>
        <span className="flex items-center gap-1.5">{auditInfo?.at && <AuditTag info={auditInfo} />}<Validate state={state} val={list} filled={filled} onClick={onValidate} /></span>
      </div>

      {/* Order Type pills — Decoinks New Invoice jaisa */}
      <div className="mb-2 flex items-center gap-1.5">
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-400">Order Type</span>
        <div className="flex min-w-0 flex-1 gap-1">
          {INVOICE_TYPES.map((t) => {
            const on = t.key === type
            return (
              <button key={t.key} type="button" disabled={typeLocked && !on} onClick={() => setPick(t.key)}
                title={typeLocked && !on ? 'Remove the existing rows first to change the order type' : t.label}
                className={`min-w-0 flex-1 truncate rounded-full border px-2 py-1 text-[10px] font-bold transition ${on ? t.on : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'} ${typeLocked && !on ? 'cursor-not-allowed opacity-50' : ''}`}>
                {t.icon} {t.label}
              </button>
            )
          })}
        </div>
      </div>
      {typeLocked && <p className="mb-1.5 text-[9px] text-slate-400">Remove all rows to switch the order type.</p>}

      {type === 'apparel' && (<>
        <p className="mb-1 text-[9px] text-slate-400">Select a BlankTex Product Master style — colors, sizes and SKU fill automatically. Ya neeche row add karke manually likho.</p>
        <CatalogStyleSearch onSelect={addCatalogStyle} />
      </>)}

      <div className="space-y-1.5">
        {list.map((r, i) => {
          const style = r.style_id ? styles[r.style_id] : null
          return (
          <div key={i} className="rounded-md border border-slate-200 p-1.5">
            <div className="mb-1 flex items-center justify-between">
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">#{i + 1}</span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-700">${amt(r).toFixed(2)}</span>
                <button onClick={() => del(i)} title="Remove row" className="text-rose-400 hover:text-rose-600">✕</button>
              </div>
            </div>

            {type === 'apparel' && (
              <div className="grid grid-cols-2 gap-1 md:grid-cols-3">
                <QiCell label="Category">
                  <select value={r.category || ''} onChange={(e) => patch(i, { category: e.target.value })} className={QI}>
                    <option value="">—</option>{APPAREL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </QiCell>
                <QiCell label="Product / Description" className="col-span-2">
                  {r.style_id
                    ? <QiProduct row={r} nameKey="description" onDetach={() => patch(i, { style_id: '', style_code: '', product_image: '', color_id: '', size_id: '' })} />
                    : <input placeholder="e.g. 260G Crewneck Sweatshirt" value={r.description || ''} onChange={(e) => patch(i, { description: e.target.value })} className={QI} />}
                </QiCell>
                <QiCell label="Brand / Style">
                  <input list="dl-qi-brand" placeholder="Select or type…" value={r.brand_style || ''} disabled={!!r.style_id} onChange={(e) => patch(i, { brand_style: e.target.value })} className={r.style_id ? `${QI} bg-slate-50 text-slate-500` : QI} />
                </QiCell>
                <QiCell label="Color">
                  {style ? (
                    <select value={r.color_id || ''} className={QI}
                      onChange={(e) => { const c = style.colors.find((x) => String(x.id) === e.target.value); patch(i, { color_id: c?.id || '', color: c?.name || '', sku: skuOf(style, c?.id, r.size_id) }) }}>
                      <option value="">Select color</option>
                      {style.colors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  ) : (
                    <input list="dl-qi-color" placeholder="Select or type…" value={r.color || ''} onChange={(e) => patch(i, { color: e.target.value })} className={QI} />
                  )}
                </QiCell>
                <QiCell label="Size">
                  {style ? (
                    <select value={r.size_id || ''} className={QI}
                      onChange={(e) => { const s = style.sizes.find((x) => String(x.id) === e.target.value); patch(i, { size_id: s?.id || '', size: s?.name || '', sku: skuOf(style, r.color_id, s?.id) }) }}>
                      <option value="">Select size</option>
                      {style.sizes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  ) : (
                    <input list="dl-qi-size" placeholder="Select or type…" value={r.size || ''} onChange={(e) => patch(i, { size: e.target.value })} className={QI} />
                  )}
                </QiCell>
                <QiCell label="SKU">
                  {r.style_id
                    ? <div className="grid h-[30px] place-items-center overflow-hidden rounded-md bg-slate-50 px-1 text-[10px] font-semibold text-slate-600">{r.sku || (r.color_id && r.size_id ? 'No SKU' : 'Select color + size')}</div>
                    : <input placeholder="SKU" value={r.sku || ''} onChange={(e) => patch(i, { sku: e.target.value })} className={QI} />}
                </QiCell>
                <QiCell label="Qty (pcs)">
                  <input type="number" min={0} value={r.qty ?? ''} onChange={(e) => patch(i, { qty: e.target.value })} className={QI} />
                </QiCell>
                <QiCell label="Unit Price ($)">
                  <input type="number" min={0} step="any" value={r.unit_price ?? ''} onChange={(e) => patch(i, { unit_price: e.target.value })} className={QI} />
                </QiCell>
                <QiCell label="Line Discount ($)">
                  <input type="number" min={0} step="any" value={r.discount ?? ''} onChange={(e) => patch(i, { discount: e.target.value })} className={QI} />
                </QiCell>
                <QiCell label="Amount ($)">
                  <div className="grid h-[30px] place-items-center rounded-md bg-slate-50 text-[11px] font-semibold text-slate-600">${amt(r).toFixed(2)}</div>
                </QiCell>
              </div>
            )}

            {type === 'gangsheet' && (
              <div className="grid grid-cols-2 gap-1 md:grid-cols-3">
                <QiCell label="Gangsheet Size" className="col-span-2 md:col-span-1">
                  {GANGSHEET_SIZES.includes(r.sheet_size) || !r.sheet_size ? (
                    <select value={r.sheet_size || ''} onChange={(e) => patch(i, { sheet_size: e.target.value === '__custom__' ? '' : e.target.value })} className={QI}>
                      <option value="">—</option>{GANGSHEET_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                      <option value="__custom__">Custom…</option>
                    </select>
                  ) : (
                    <div className="flex items-center gap-1">
                      <input placeholder='e.g. 36" x 60"' value={r.sheet_size} onChange={(e) => patch(i, { sheet_size: e.target.value })} className={QI} />
                      <button onClick={() => patch(i, { sheet_size: GANGSHEET_SIZES[0] })} title="Back to list" className="shrink-0 text-slate-400 hover:text-slate-600">✕</button>
                    </div>
                  )}
                </QiCell>
                <QiCell label="No. Artworks">
                  <input type="number" min={0} value={r.artwork_count ?? ''} onChange={(e) => patch(i, { artwork_count: e.target.value })} className={QI} />
                </QiCell>
                <QiCell label="Qty Sheets">
                  <input type="number" min={0} value={r.qty ?? ''} onChange={(e) => patch(i, { qty: e.target.value })} className={QI} />
                </QiCell>
                <QiCell label="Price / Sheet ($)">
                  <input type="number" min={0} step="any" value={r.unit_price ?? ''} onChange={(e) => patch(i, { unit_price: e.target.value })} className={QI} />
                </QiCell>
                <QiCell label="Amount ($)">
                  <div className="grid h-[30px] place-items-center rounded-md bg-slate-50 text-[11px] font-semibold text-slate-600">${amt(r).toFixed(2)}</div>
                </QiCell>
              </div>
            )}

            {type === 'dtf' && (
              <div className="grid grid-cols-2 gap-1 md:grid-cols-3">
                <QiCell label="Artwork Name" className="col-span-2 md:col-span-1">
                  <input placeholder="Artwork name" value={r.artwork_name || ''} onChange={(e) => patch(i, { artwork_name: e.target.value })} className={QI} />
                </QiCell>
                <QiCell label="Artwork No">
                  <input placeholder={`AW-TF-${String(i + 1).padStart(3, '0')}`} value={r.artwork_no || ''} onChange={(e) => patch(i, { artwork_no: e.target.value })} className={QI} />
                </QiCell>
                <QiCell label="Width (in)">
                  <input type="number" min={0} step="any" placeholder="W" value={r.width ?? ''} onChange={(e) => patch(i, { width: e.target.value })} className={QI} />
                </QiCell>
                <QiCell label="Height (in)">
                  <input type="number" min={0} step="any" placeholder="H" value={r.height ?? ''} onChange={(e) => patch(i, { height: e.target.value })} className={QI} />
                </QiCell>
                <QiCell label="Size">
                  <div className="grid h-[30px] place-items-center rounded-md bg-slate-50 text-[11px] font-semibold text-slate-600">{sizeLabel(r.width, r.height)}</div>
                </QiCell>
                <QiCell label="Qty (pcs)">
                  <input type="number" min={0} value={r.qty ?? ''} onChange={(e) => patch(i, { qty: e.target.value })} className={QI} />
                </QiCell>
                <QiCell label="Unit Price ($)">
                  <input type="number" min={0} step="any" value={r.unit_price ?? ''} onChange={(e) => patch(i, { unit_price: e.target.value })} className={QI} />
                </QiCell>
                <QiCell label="Amount ($)">
                  <div className="grid h-[30px] place-items-center rounded-md bg-slate-50 text-[11px] font-semibold text-slate-600">${amt(r).toFixed(2)}</div>
                </QiCell>
              </div>
            )}
          </div>
          )
        })}
        {!list.length && <div className="rounded-md border border-dashed border-slate-200 py-3 text-center text-[11px] text-slate-400">No {active.label} rows yet — click "+ Add Item" below.</div>}
      </div>

      {/* Live summary — Decoinks ke section footer jaisa */}
      {list.length > 0 && (
        <div className="mt-1.5 flex items-center justify-between rounded-md bg-slate-50 px-2 py-1.5 text-[10px]">
          <span className="font-bold uppercase tracking-wide text-slate-500">{active.label} Summary</span>
          <span className="flex items-center gap-3">
            <span className="text-slate-500">{type === 'gangsheet' ? 'Sheets' : 'Total Qty'} <b className="text-slate-700">{totalQty}</b></span>
            <span className="text-slate-500">{type === 'apparel' ? 'Rows' : 'Artworks'} <b className="text-slate-700">{artworks}</b></span>
            <span className="text-slate-500">Items Total <b className="text-emerald-700">${total.toFixed(2)}</b></span>
          </span>
        </div>
      )}

      <QiDataLists />
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

// AI-enriched read-only insights — panel ke baaki fields ki tarah (label + value box).
function AIInsights({ ai, grid }) {
  if (!ai) return null
  const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1)
  const fields = [
    ['Purchase Intent', ai.intent_score != null ? `${ai.intent_score}/100` : ''],
    ['Buy Probability', ai.purchase_probability != null ? `${Math.round(Number(ai.purchase_probability))}%` : ''],
    ['Temperature', ai.temperature ? cap(ai.temperature) : ''],
    ['Business Potential', ai.business_potential || ''],
    ['Customer Type', ai.customer_type ? ai.customer_type.replace(/_/g, ' ') : ''],
    ['Primary Product', ai.primary_product || ''],
    ['Est. Value', (ai.estimated_value != null && Number(ai.estimated_value) > 0) ? `$${Number(ai.estimated_value).toLocaleString()}` : ''],
    ['Reseller Likelihood', ai.reseller_likelihood != null ? `${ai.reseller_likelihood}%` : ''],
    ['Industry', ai.industry || ''],
  ].filter(([, v]) => v)
  if (!fields.length && !ai.ai_observations && !ai.lead_summary) return null
  const box = 'rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1.5 text-slate-800'
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-violet-500">✨ AI Insights <span className="rounded bg-violet-100 px-1 text-[9px] normal-case text-violet-600">auto · read-only</span></div>
      <div className={grid}>
        {fields.map(([label, value]) => (
          <div key={label}>
            <label className="mb-0.5 block text-[11px] font-medium text-slate-500">{label}</label>
            <div className={`${box} text-[13px] font-semibold capitalize`}>{value}</div>
          </div>
        ))}
      </div>
      {ai.lead_summary && (
        <div>
          <label className="mb-0.5 block text-[11px] font-medium text-slate-500">AI Summary</label>
          <div className={`${box} text-[12px] leading-relaxed`}>{ai.lead_summary}</div>
        </div>
      )}
      {ai.ai_observations && (
        <div>
          <label className="mb-0.5 block text-[11px] font-medium text-slate-500">AI Observations</label>
          <div className={`${box} text-[12px] leading-relaxed`}>{ai.ai_observations}</div>
        </div>
      )}
    </div>
  )
}

// ── Document generate bar (Quotation / Invoice / Sales Order) ────────────────
// Number Decoinks ke SAME shared counter se aata hai (QT-YYYY-NNNN, ORD-YYYY-NNNN,
// CUSTOMERNAME-NNNN), isliye Decoinks ke numbers se kabhi takrayega nahi. Record hamare
// apne panel-store me hi save hota hai — Decoinks ki tables ko koi write nahi.
function DocBar({ label, number, busy, msg, onGenerate, onPreview }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{label} No</div>
          <div className="truncate text-[12px] font-extrabold text-slate-800">
            {number || <span className="font-semibold text-slate-400">Not generated yet</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {onPreview && (
            <button onClick={onPreview} title="Preview the document and print / save as PDF"
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50">
              👁 Preview
            </button>
          )}
          <button onClick={onGenerate} disabled={busy}
            className="rounded-md bg-brand-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-brand-700 disabled:opacity-60">
            {busy ? 'Generating…' : number ? 'Refresh totals' : `⚡ Generate ${label}`}
          </button>
        </div>
      </div>
      {msg && <div className="mt-1 text-[10px] font-semibold text-emerald-700">{msg}</div>}
      {!number && <div className="mt-1 text-[9px] text-slate-400">Items add karke Generate dabao — number, dates aur totals apne aap bhar jayenge (Decoinks jaisi numbering). Preview bina generate kiye bhi dekh sakte hain.</div>}
    </div>
  )
}

// Preview modal — document ek iframe me render hota hai (popup blocker se bacha rehta hai);
// "Print / Save PDF" browser ke print dialog se A4 PDF bana deta hai.
function DocPreview({ html, title, onClose }) {
  const frame = useRef(null)
  const print = () => { const w = frame.current?.contentWindow; if (w) { w.focus(); w.print() } }
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/60 p-3" onClick={onClose}>
      <div className="mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-pop" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
          <h3 className="truncate text-[12px] font-bold text-slate-800">{title}</h3>
          <div className="flex shrink-0 items-center gap-1.5">
            <button onClick={print} className="rounded-md bg-brand-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-brand-700">🖨 Print / Save PDF</button>
            <button onClick={onClose} className="rounded-md border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50">Close</button>
          </div>
        </div>
        <iframe ref={frame} title={title} srcDoc={html} className="w-full flex-1 bg-slate-100" />
      </div>
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
  if (!hasVal(vals.shipping_address?.zip)) items.push({ label: 'Shipping ZIP', level: 'warn' })
  if (!hasVal(vals.required_delivery_date) && !hasVal(vals.event_date)) items.push({ label: 'Delivery date', level: 'warn' })
  if (!hasQuote) items.push({ label: 'Quote', level: 'warn' })
  return items
}

export default function LeadPanel({ conv, onClose }) {
  const [tab, setTab] = useState('pending')
  const [vals, setVals] = useState({})
  const [filled, setFilled] = useState({})   // AI-filled, unvalidated
  const [fs, setFs] = useState({})            // per-field: idle|saving|ok|err
  const [score, setScore] = useState(null)
  const [wide, setWide] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [savingAll, setSavingAll] = useState(false)
  const [err, setErr] = useState('')
  const [completed, setCompleted] = useState(false)
  const [sameBilling, setSameBilling] = useState(false)
  const [genBusy, setGenBusy] = useState('')    // kaunsa document generate ho raha hai
  const [genMsg, setGenMsg] = useState('')
  const [preview, setPreview] = useState(null)  // { kind, title, html } — quote/invoice preview modal
  const [ai, setAi] = useState(null)            // AI-enriched read-only insights (Leads dashboard wale fields)
  const [audit, setAudit] = useState({})        // field -> { by, byId, at }  (kaun-kab validate)

  const cid = conv?.id

  // gpt-4o extract 10-40s lamba hota hai; is dauran network blip / backend-restart se browser
  // "Failed to fetch" de sakta hai. Aise transient fail par apne aap 2 baar retry (thoda ruk ke).
  const runExtract = (attempt = 0) => {
    if (!cid) return
    setExtracting(true); if (attempt === 0) setErr('')
    api.get(`/api/leads/extract/${encodeURIComponent(cid)}`)
      .then((r) => {
        if (r?.fields) {
          const ai = flatten(r.fields)
          setVals((cur) => {
            const next = { ...cur }; const f = {}; const changed = {}
            for (const [k, v] of Object.entries(ai)) {
              if (!hasVal(cur[k]) && hasVal(v)) {
                // khaali field ko AI ne bhara -> pending (validate karo)
                next[k] = v; f[k] = true
              } else if (
                hasVal(cur[k]) && hasVal(v) &&
                typeof v !== 'object' && typeof cur[k] !== 'object' &&
                String(cur[k]).trim() !== String(v).trim()
              ) {
                // AI ek alag value suggest kar raha hai (jaise stage badal gaya) -> pending review
                next[k] = v; f[k] = true; changed[k] = 'idle'
              }
            }
            setFilled((p) => ({ ...p, ...f }))
            // pehle se "Saved" fields jinki value AI ne badli -> unhe wapas pending (idle) karo
            if (Object.keys(changed).length) setFs((s) => ({ ...s, ...changed }))
            return next
          })
        }
        setExtracting(false)
      })
      .catch((e) => {
        const msg = e?.message || 'AI extract failed'
        if (/failed to fetch|network|load failed|aborted|fetch/i.test(msg) && attempt < 2) {
          setErr(`Network issue — retrying (${attempt + 1}/2)…`)
          setTimeout(() => runExtract(attempt + 1), 2000)   // transient -> retry
        } else {
          setErr(msg); setExtracting(false)
        }
      })
  }

  useEffect(() => {
    if (!cid) return
    let cancelled = false
    setVals({}); setFilled({}); setFs({}); setErr(''); setCompleted(false); setScore(null); setSameBilling(false); setTab('pending'); setAi(null); setAudit({})
    api.get(`/api/leads/panel/${encodeURIComponent(cid)}`)
      .then((b) => {
        if (cancelled) return
        const flat = flatten(b)
        setVals(flat); setAi(b?.ai || null); setAudit(b?.field_audit || {})
        // DB me jo fields pehle se saved hain unhe turant "✓ Saved" (green) dikhao — taaki agent
        // ko pata rahe kya ho chuka; wo baaki/naye fields incrementally validate karta rahe.
        const savedFs = {}
        for (const [k, v] of Object.entries(flat)) if (hasVal(v)) savedFs[k] = 'ok'
        setFs(savedFs)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) runExtract() })
    api.get(`/api/leads/score/${encodeURIComponent(cid)}`)
      .then((s) => { if (!cancelled && s?.qualification) setScore(s.qualification) })
      .catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid])

  const setVal = (k, v) => { setCompleted(false); setVals((c) => ({ ...c, [k]: v })); setFilled((a) => ({ ...a, [k]: false })); setFs((s) => ({ ...s, [k]: 'idle' })) }

  const saveErrs = useRef({})   // field key -> error message (Submit me batane ke liye)
  const saveOne = async (k, valueOverride) => {
    if (!cid) return false
    const v = valueOverride !== undefined ? valueOverride : (vals[k] ?? '')
    if (!hasVal(v)) return false   // khaali value validate/save mat karo
    setFs((s) => ({ ...s, [k]: 'saving' }))
    try {
      const r = await api.post(`/api/leads/field/${encodeURIComponent(cid)}`, { field: k, value: v })
      if (r && r.saved === false) { setFs((s) => ({ ...s, [k]: 'idle' })); return false }  // backend ne empty skip kiya (error nahi)
      if (r?.sync?.qualification) setScore(r.sync.qualification)
      setFs((s) => ({ ...s, [k]: 'ok' })); setFilled((a) => ({ ...a, [k]: false })); delete saveErrs.current[k]
      const _me = currentUser(); setAudit((a) => ({ ...a, [k]: { by: _me?.name || _me?.email || 'You', byId: _me?.id ?? null, at: new Date().toISOString() } }))
      return true
    } catch (ex) { setFs((s) => ({ ...s, [k]: 'err' })); saveErrs.current[k] = ex?.message || 'save failed'; return false }
  }
  const validate = (k) => () => saveOne(k)

  // Save Draft = jitne fields me value hai (aur confirmed nahi), sab save kar do.
  // Return: sirf UNKI list jo ASLI me fail hui (validation error) — empty-skip failure nahi.
  const saveAll = async () => {
    setSavingAll(true)
    saveErrs.current = {}
    const keys = Object.keys(vals).filter((k) => hasVal(vals[k]) && fs[k] !== 'ok' && FIELD_KEYS.has(k))
    for (const k of keys) await saveOne(k)
    setSavingAll(false)
    api.get(`/api/leads/score/${encodeURIComponent(cid)}`).then((s) => s?.qualification && setScore(s.qualification)).catch(() => {})
    return Object.keys(saveErrs.current)   // sirf real errors
  }

  // Preview — abhi panel me jo values hain (saved + unsaved) unse hi document banta hai,
  // isliye generate se pehle bhi dekha ja sakta hai.
  const openPreview = (kind) => setPreview({
    kind,
    title: `${kind === 'invoice' ? 'Invoice' : 'Quotation'} preview${(kind === 'invoice' ? vals.invoice_number : vals.quote_number) ? ` — ${kind === 'invoice' ? vals.invoice_number : vals.quote_number}` : ' (draft)'}`,
    html: buildDocHtml({ kind, vals, customerName: conv?.name || '' }),
  })

  // Quotation / Invoice / Sales Order generate — pehle jo unsaved hai wo save, phir backend
  // number claim karke totals/dates bhar deta hai (idempotent: number ek hi baar banta hai).
  const NUM_KEY = { quotation: 'quote_number', invoice: 'invoice_number', order: 'order_number' }
  const generateDoc = async (kind) => {
    if (!cid) return
    setGenBusy(kind); setGenMsg(''); setErr('')
    try {
      await saveAll()
      const r = await api.post(`/api/leads/documents/${encodeURIComponent(cid)}/${kind}`, {})
      const patch = { ...(r.fields || {}) }
      if (r.number) patch[NUM_KEY[kind]] = r.number
      setVals((c) => ({ ...c, ...patch }))
      setFs((s) => { const n = { ...s }; for (const k of Object.keys(patch)) n[k] = 'ok'; return n })
      setFilled((a) => { const n = { ...a }; for (const k of Object.keys(patch)) n[k] = false; return n })
      setGenMsg(`${r.label} ${r.number} ready`)
      if (r.failed?.length) setErr(r.failed.join(' · '))
    } catch (e) {
      setErr(e?.message || 'Document could not be generated')
    } finally { setGenBusy('') }
  }

  const submitComplete = async () => {
    setErr(''); setCompleted(false)
    const failed = await saveAll()
    if (failed.length) {
      const t = tabOfKey(failed[0]); if (t) setTab(t)   // pehle fail field wale tab pe le jao
      setErr('These fields did not save — fix them and Submit again: ' + failed.map((k) => `${labelOf(k)}${saveErrs.current[k] ? ` (${saveErrs.current[k]})` : ''}`).join(' · '))
      return
    }
    setSavingAll(true)
    try {
      const result = await api.post(`/api/leads/complete/${encodeURIComponent(cid)}`, {})
      if (result?.qualification) setScore(result.qualification)
      setCompleted(true)
    } catch (e) {
      setErr(e?.message || 'Lead could not be submitted to Decoinks')
    } finally {
      setSavingAll(false)
    }
  }

  const autoTemp = useMemo(() => {
    if (!score) return null
    const HOT = ['Interested', 'Ready to Buy', 'Waiting Payment', 'Returning Customer']
    if (score.score >= 70 && HOT.includes(vals.purchase_intent)) return 'Hot'
    if (score.score >= 40) return 'Warm'
    return 'Cold'
  }, [score, vals.purchase_intent])

  const missing = useMemo(() => computeMissing(vals, hasVal(vals.grand_total) || (Array.isArray(vals.line_items) && vals.line_items.length > 0)), [vals])

  const canValidate = (section) => can('validate:' + section)   // role permission per Lead Panel section
  // PENDING — woh fields jinme value hai par abhi tak "Saved" nahi (validate baaki), AUR jinhe
  // ye user validate kar sakta hai (uske role ki us section pe permission ho).
  const pendings = ALL_FIELD_KEYS.filter((k) => hasVal(vals[k]) && fs[k] !== 'ok' && canValidate(tabOfKey(k)))

  // Pending section pe click -> us tab pe jao aur us section ke SAARE pending fields
  // ek saath highlight karo (pehle wale par scroll + focus).
  const goToSection = (tabId, keys) => {
    setTab(tabId)
    setTimeout(() => {
      let first = null
      keys.forEach((k) => {
        const el = document.getElementById(`fld-${k}`)
        if (!el) return
        if (!first) first = el
        el.classList.add('ring-2', 'ring-amber-400', 'ring-offset-1', 'rounded-lg')
        setTimeout(() => el.classList.remove('ring-2', 'ring-amber-400', 'ring-offset-1'), 2600)
      })
      if (first) {
        first.scrollIntoView({ behavior: 'smooth', block: 'center' })
        first.querySelector('input, select, textarea, button')?.focus()
      }
    }, 180)
  }

  // Is tab me kitne fields bhare hain par save nahi hue + ek click me sab confirm.
  const unsavedKeys = (TAB_KEYS[tab] || []).filter((k) => hasVal(vals[k]) && fs[k] !== 'ok')
  // Confirm ke baad panel dobara laao aur AAGE ke sections ke KHAALI fields cascade se bhar do
  // (user ke bhare/edit kiye fields ko haath nahi lagata) — "ek section fill karo, aage update ho jaye".
  const refreshCascade = async () => {
    try {
      const b = await api.get(`/api/leads/panel/${encodeURIComponent(cid)}`)
      const flat = flatten(b)
      setVals((cur) => {
        const next = { ...cur }
        for (const [k, v] of Object.entries(flat)) if (!hasVal(cur[k]) && hasVal(v)) next[k] = v
        return next
      })
      setAudit(b?.field_audit || {})
    } catch { /* keep current */ }
  }
  const confirmTab = async () => {
    setSavingAll(true)
    for (const k of unsavedKeys) await saveOne(k)
    setSavingAll(false)
    await refreshCascade()   // section save hote hi aage ke sections (Invoice→Payment→Sales Order) update
    api.get(`/api/leads/score/${encodeURIComponent(cid)}`).then((s) => s?.qualification && setScore(s.qualification)).catch(() => {})
  }

  const TABS = [['pending', 'Pending'], ['lead', 'Lead'], ['customer', 'Customer'], ['product', 'Product & Artwork'], ['shipping', 'Delivery'], ['quote', 'Quote'], ['invoice', 'Invoice'], ['payment', 'Payment'], ['order', 'Sales Order']]
  // Readable columns: panel ki chaudai ke hisaab se (chhote panel me 1-2, wide me 3). Cramped nahi.
  const grid = wide
    ? 'grid gap-3 grid-cols-2 lg:grid-cols-3'
    : 'grid gap-3 grid-cols-[repeat(auto-fill,minmax(215px,1fr))]'

  const renderFields = (defs) => defs.map(([k, label, type]) => (
    <Field key={k} k={k} label={label} type={type} val={vals[k]} filled={filled[k]} state={fs[k]}
      onChange={(v) => setVal(k, v)} onValidate={validate(k)} locked={!canValidate(tabOfKey(k))} auditInfo={audit[k]} />
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
          {/^(fb|ig):/.test(String(cid || '')) && (
            <button onClick={async () => { const w = window.open('', '_blank'); try { const r = await api.get(`/api/meta/messenger-link/${encodeURIComponent(cid)}`); if (w) w.location.href = r?.url || 'https://business.facebook.com/latest/inbox/all' } catch { if (w) w.location.href = 'https://business.facebook.com/latest/inbox/all' } }}
              title="Open in Facebook Messenger" className="grid h-8 w-8 place-items-center rounded-lg text-blue-600 hover:bg-blue-50">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.14.26.35.27.57l.05 1.78c.02.57.6.94 1.12.71l1.99-.88c.17-.07.35-.09.53-.04.91.25 1.88.38 2.8.38 5.64 0 10-4.13 10-9.7C22 6.13 17.64 2 12 2zm6 7.46l-2.94 4.66c-.47.74-1.47.93-2.18.41l-2.34-1.75a.6.6 0 0 0-.72 0l-3.16 2.4c-.42.32-.97-.18-.69-.63l2.94-4.66c.47-.74 1.47-.93 2.18-.41l2.34 1.75c.21.16.51.16.72 0l3.16-2.4c.42-.32.97.18.69.63z"/></svg>
            </button>
          )}
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
      {completed && <div className="border-b border-emerald-100 bg-emerald-50 px-4 py-1.5 text-[11px] font-semibold text-emerald-700">✓ Submitted to Decoinks — dashboard data is updated.</div>}

      {/* Tabs */}
      <nav className="nice-scroll flex items-center gap-4 overflow-x-auto border-b border-slate-200 px-4 text-[13px]">
        {TABS.map(([id, lbl]) => (
          <button key={id} onClick={() => setTab(id)} className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 py-2.5 ${tab === id ? 'border-brand-500 font-semibold text-brand-600' : 'border-transparent font-medium text-slate-500 hover:text-slate-700'}`}>
            {lbl}
            {id === 'pending' && pendings.length > 0 && <span className="grid h-4 min-w-4 place-items-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">{pendings.length}</span>}
          </button>
        ))}
      </nav>

      {/* "Confirm all" bar — is tab ke saare bhare fields ek click me save */}
      {unsavedKeys.length > 0 && (
        <div className="flex items-center justify-between gap-2 border-b border-amber-100 bg-amber-50/60 px-4 py-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-800">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />{unsavedKeys.length} field{unsavedKeys.length > 1 ? 's' : ''} filled — not saved
          </span>
          <button onClick={confirmTab} disabled={savingAll}
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
            {savingAll ? 'Saving…' : `✓ Confirm & Submit (${unsavedKeys.length})`}
          </button>
        </div>
      )}

      {/* Body */}
      <div className="nice-scroll flex-1 overflow-y-auto px-4 py-3">
        {tab !== 'pending' && !canValidate(tab) && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">🔒 Your role doesn't have permission to validate or fill fields in this section — view-only.</div>
        )}
        {tab === 'pending' && (<div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Pending Validation</h3>
              <p className="text-[11px] leading-snug text-slate-500">Fields updated by the AI/agent — validate them to confirm in the database. Click any row to jump straight to that field.</p>
            </div>
            {pendings.length > 0 && (
              <button onClick={saveAll} disabled={savingAll} className="shrink-0 rounded-md bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
                {savingAll ? 'Saving…' : `✓ Validate all (${pendings.length})`}
              </button>
            )}
          </div>
          {pendings.length === 0 ? (
            <div className="rounded-lg border border-dashed border-emerald-200 bg-emerald-50/50 py-8 text-center text-[12px] font-semibold text-emerald-700">✓ All caught up — no pending fields</div>
          ) : (
            TABS.filter(([id]) => id !== 'pending').map(([id, lbl]) => {
              const rows = (TAB_KEYS[id] || []).filter((k) => pendings.includes(k))
              if (!rows.length) return null
              return (
                <button key={id} onClick={() => goToSection(id, rows)}
                  className="block w-full rounded-lg border border-slate-200 p-3 text-left transition hover:border-amber-300 hover:bg-amber-50/50">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-slate-800">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />{lbl}
                      <span className="grid h-4 min-w-4 place-items-center rounded-full bg-amber-100 px-1 text-[10px] font-bold text-amber-700">{rows.length}</span>
                    </span>
                    <span className="shrink-0 text-[11px] font-semibold text-brand-600">Open &amp; validate →</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {rows.map((k) => (
                      <span key={k} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${fs[k] === 'err' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
                        {labelOf(k)}{filled[k] && <span className="text-[8px] font-bold text-violet-600">AI</span>}
                      </span>
                    ))}
                  </div>
                </button>
              )
            })
          )}
        </div>)}

        {tab === 'lead' && (<div className="space-y-3">
          <QualCard q={score} temp={autoTemp} />
          <div className={grid}>{renderFields(LEAD_FIELDS)}</div>
          {vals.stage === 'Lost' && <div className={grid}><Field k="lost_reason" label="Lost Reason" type="text" val={vals.lost_reason} filled={filled.lost_reason} state={fs.lost_reason} onChange={(v) => setVal('lost_reason', v)} onValidate={validate('lost_reason')} locked={!canValidate('lead')} auditInfo={audit['lost_reason']} /></div>}
          {vals.ai_summary && <div className="rounded-lg bg-violet-50 p-2.5 text-[11px] text-violet-800"><b>✨ AI Summary:</b> {vals.ai_summary}</div>}
        </div>)}

        {tab === 'customer' && (<div className="space-y-3">
          <div className={grid}>{renderFields(CUST_FIELDS)}</div>
          <div id="fld-shipping_address" className="scroll-mt-4"><AddressBlock title="Shipping Address" addr={vals.shipping_address} filled={filled.shipping_address} state={fs.shipping_address} auditInfo={audit['shipping_address']}
            onChange={(v) => setVal('shipping_address', v)} onValidate={validate('shipping_address')} /></div>
          <div id="fld-billing_address" className="scroll-mt-4"><AddressBlock title="Billing Address" addr={sameBilling ? vals.shipping_address : vals.billing_address} filled={filled.billing_address} state={fs.billing_address} auditInfo={audit['billing_address']}
            sameAs={sameBilling} onSame={setSameBilling}
            onChange={(v) => setVal('billing_address', v)}
            onValidate={() => saveOne('billing_address', sameBilling ? vals.shipping_address : vals.billing_address)} /></div>
        </div>)}

        {tab === 'product' && (<div className="space-y-3">
          <div className={grid}>{renderFields(PROD_FIELDS)}</div>
          <div id="fld-size_breakdown" className="scroll-mt-4"><SizeBreakdown rows={vals.size_breakdown} total={vals.total_quantity} filled={filled.size_breakdown} state={fs.size_breakdown} auditInfo={audit['size_breakdown']}
            onChange={(v) => setVal('size_breakdown', v)} onValidate={validate('size_breakdown')} /></div>
          <div id="fld-print_locations" className="scroll-mt-4"><PrintLocations value={vals.print_locations} filled={filled.print_locations} state={fs.print_locations} auditInfo={audit['print_locations']}
            onChange={(v) => setVal('print_locations', v)} onValidate={validate('print_locations')} /></div>
          <div className={grid}><Field k="special_instructions" label="Special Instructions" type="textarea" val={vals.special_instructions} filled={filled.special_instructions} state={fs.special_instructions} onChange={(v) => setVal('special_instructions', v)} onValidate={validate('special_instructions')} locked={!canValidate('product')} auditInfo={audit['special_instructions']} /></div>
          <div className="rounded-lg bg-slate-50 p-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Artwork</div>
          <div className={grid}>{renderFields(ART_FIELDS)}</div>
          <p className="text-[10px] text-slate-400">Artwork files come from the chat (shown in the Files tab). "Received" is set automatically; the agent sets Quality/Approve.</p>
        </div>)}

        {tab === 'shipping' && (<div className="space-y-3">
          <p className="rounded-lg bg-slate-50 p-2 text-[10px] text-slate-400">The shipping address is now in the "Customer" tab. This section is delivery/logistics only.</p>
          <div className={grid}>{renderFields(SHIP_FIELDS)}</div>
        </div>)}

        {tab === 'quote' && (<div className="space-y-3">
          <DocBar label="Quotation" number={vals.quote_number} busy={genBusy === 'quotation'} msg={genBusy === '' && genMsg.startsWith('Quotation') ? genMsg : ''} onGenerate={() => generateDoc('quotation')} onPreview={() => openPreview('quotation')} />
          <div id="fld-line_items" className="scroll-mt-4"><QuoteItems items={vals.line_items} filled={filled.line_items} state={fs.line_items} auditInfo={audit['line_items']}
            onChange={(v) => setVal('line_items', v)} onValidate={validate('line_items')} /></div>
          <div className={grid}><Field k="quote_notes" label="Notes (to customer)" type="textarea" val={vals.quote_notes} filled={filled.quote_notes} state={fs.quote_notes} onChange={(v) => setVal('quote_notes', v)} onValidate={validate('quote_notes')} locked={!canValidate('quote')} auditInfo={audit['quote_notes']} /></div>
          <div className={grid}>{renderFields(QUOTE_FIELDS)}</div>
        </div>)}

        {tab === 'invoice' && (<div className="space-y-3">
          <DocBar label="Invoice" number={vals.invoice_number} busy={genBusy === 'invoice'} msg={genBusy === '' && genMsg.startsWith('Invoice') ? genMsg : ''} onGenerate={() => generateDoc('invoice')} onPreview={() => openPreview('invoice')} />
          <div id="fld-invoice_lines" className="scroll-mt-4"><InvoiceLines items={vals.invoice_lines} filled={filled.invoice_lines} state={fs.invoice_lines} auditInfo={audit['invoice_lines']}
            onChange={(v) => setVal('invoice_lines', v)} onValidate={validate('invoice_lines')} /></div>
          <div className={grid}>{renderFields(INVOICE_FIELDS)}</div>
          <div className={grid}><Field k="invoice_notes" label="Invoice Notes" type="textarea" val={vals.invoice_notes} filled={filled.invoice_notes} state={fs.invoice_notes} onChange={(v) => setVal('invoice_notes', v)} onValidate={validate('invoice_notes')} locked={!canValidate('invoice')} auditInfo={audit['invoice_notes']} /></div>
          <p className="text-[10px] text-slate-400">Capture billing before the Sales Order is created. Each field saves with the lead as soon as you validate it.</p>
        </div>)}

        {tab === 'payment' && (<div className="space-y-3">
          <div className={grid}>{renderFields(PAY_FIELDS)}</div>
          {Number(vals.pay_fee) > 0 && (
            <div className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px]"><span className="text-slate-500">Net received (after fee):</span> <span className="font-bold text-emerald-700">${Math.max(0, (Number(vals.pay_amount) || 0) - (Number(vals.pay_fee) || 0)).toFixed(2)}</span></div>
          )}
          <div className={grid}><Field k="pay_notes" label="Payment Notes" type="textarea" val={vals.pay_notes} filled={filled.pay_notes} state={fs.pay_notes} onChange={(v) => setVal('pay_notes', v)} onValidate={validate('pay_notes')} locked={!canValidate('payment')} auditInfo={audit['pay_notes']} /></div>
          <p className="text-[10px] text-slate-400">Customer payment record — AI pre-fills from the data, the agent validates each field. Only the last 4 account digits are stored (sensitive data).</p>
        </div>)}

        {tab === 'order' && (<div className="space-y-3">
          <DocBar label="Sales Order" number={vals.order_number} busy={genBusy === 'order'} msg={genBusy === '' && genMsg.startsWith('Sales Order') ? genMsg : ''} onGenerate={() => generateDoc('order')} />
          {/* Order items ab Invoice se aate hain (read-only) — alag order-lines maintain nahi karte. */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
            <div className="mb-1.5 text-[11px] font-bold text-slate-700">Order Items <span className="font-normal text-slate-400">— from the Invoice</span></div>
            {(Array.isArray(vals.invoice_lines) && vals.invoice_lines.length) ? (
              <div className="space-y-1">
                {vals.invoice_lines.map((it, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 rounded bg-white px-2 py-1 text-[11px] ring-1 ring-slate-100">
                    <span className="min-w-0 truncate text-slate-700">{it.description || it.item_name || it.product || `Item ${i + 1}`}</span>
                    <span className="whitespace-nowrap text-slate-500">{it.qty ?? it.quantity ?? ''} × ${it.unit_price ?? ''} = <b className="text-slate-700">${it.amount ?? ''}</b></span>
                  </div>
                ))}
              </div>
            ) : <div className="text-[11px] text-slate-400">No invoice items yet — fill the <b>Invoice</b> tab and they'll show here.</div>}
          </div>
          <div className={grid}>{renderFields(ORDER_FIELDS)}</div>
          <p className="text-[10px] text-slate-400">Order details flow in from the Invoice / Payment — each field saves as soon as you validate it.</p>
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
        <button onClick={submitComplete} disabled={savingAll}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
          {savingAll ? 'Saving…' : '✓ Submit / Complete'}
        </button>
      </div>

      {preview && <DocPreview html={preview.html} title={preview.title} onClose={() => setPreview(null)} />}
    </aside>
  )
}

const FIELD_KEYS = new Set([
  ...LEAD_FIELDS.map((f) => f[0]), 'lost_reason',
  ...CUST_FIELDS.map((f) => f[0]), 'shipping_address', 'billing_address',
  ...PROD_FIELDS.map((f) => f[0]), 'size_breakdown', 'print_locations', 'special_instructions',
  ...ART_FIELDS.map((f) => f[0]),
  ...SHIP_FIELDS.map((f) => f[0]),
  ...QUOTE_FIELDS.map((f) => f[0]), 'line_items', 'quote_notes', 'quote_number', 'order_number',
  ...INVOICE_FIELDS.map((f) => f[0]), 'invoice_lines', 'invoice_notes',
  ...ORDER_FIELDS.map((f) => f[0]), 'order_lines',
])
