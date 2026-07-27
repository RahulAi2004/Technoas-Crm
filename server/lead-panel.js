// ============================================================
// Lead Details panel — AI chat se fields extract karta hai; agent
// har field ke "Validate" par click kare TABHI wo field DB me save hoti hai.
// 5 sections: Lead / Customer / Product & Artwork / Shipping & Delivery / Quote.
//   leads · customers · lead_requirements · lead_shipping_details · quotes
// Row na ho to pehli validate par apne aap ban jaati hai.
// ============================================================
import { query as dbQuery, getAll, findById } from './db.js'
import { chatJSON } from './ai.js'

// ---- Field whitelist: panel SIRF yahi fields save kar sakta hai (SQL injection safe) ----
//   t: table | c: column | j: key inside <table>.extra JSON | jsonCol: apna JSON column
//   num: numeric | bool: boolean | date: date (khaali -> NULL)
export const FIELD_MAP = {
  // LEAD -> app.leads
  stage:            { t: 'leads', c: 'lead_stage' },
  lead_status:      { t: 'leads', c: 'lead_status' },
  qualification:    { t: 'leads', j: 'qualification' },
  purchase_intent:  { t: 'leads', j: 'purchase_intent' },
  priority:         { t: 'leads', c: 'priority' },
  lead_summary:     { t: 'leads', c: 'lead_summary' },
  internal_notes:   { t: 'leads', c: 'internal_notes' },   // agent likhta hai (ai_observations = AI, alag)
  lost_reason:      { t: 'leads', c: 'lost_reason' },
  estimated_value:  { t: 'leads', c: 'estimated_value', num: true },
  // CUSTOMER -> app.customers
  email:            { t: 'customers', c: 'email' },
  phone:            { t: 'customers', c: 'phone' },
  segment:          { t: 'customers', c: 'customer_segment' },
  cust_status:      { t: 'customers', c: 'status' },
  business_name:    { t: 'customers', c: 'company' },
  preferred_channel:{ t: 'customers', j: 'preferred_channel' },
  tax_exempt:       { t: 'customers', j: 'tax_exempt' },
  customer_notes:   { t: 'customers', j: 'customer_notes' },
  shipping_address: { t: 'customers', j: 'shipping_address' },
  billing_address:  { t: 'customers', j: 'billing_address' },
  // PRODUCT & ARTWORK -> app.lead_requirements
  product_type:     { t: 'lead_requirements', c: 'product_type' },
  garment_source:   { t: 'lead_requirements', c: 'garment_source' },
  brand_style:      { t: 'lead_requirements', c: 'brand_style' },
  garment_color:    { t: 'lead_requirements', c: 'garment_color' },
  total_quantity:   { t: 'lead_requirements', c: 'total_quantity', num: true },
  size_breakdown:   { t: 'lead_requirements', jsonCol: 'size_breakdown' },
  print_method:     { t: 'lead_requirements', c: 'print_method' },
  print_locations:  { t: 'lead_requirements', jsonCol: 'print_locations' },
  front_print_size: { t: 'lead_requirements', c: 'front_print_size' },
  back_print_size:  { t: 'lead_requirements', c: 'back_print_size' },
  special_instructions: { t: 'lead_requirements', c: 'special_instructions' },
  designer_notes:   { t: 'lead_requirements', c: 'designer_notes' },
  artwork_required: { t: 'lead_requirements', c: 'artwork_required', bool: true },
  artwork_status:   { t: 'lead_requirements', c: 'artwork_status' },
  artwork_instructions: { t: 'lead_requirements', c: 'artwork_instructions' },
  // SHIPPING & DELIVERY -> app.lead_shipping_details
  shipping_postcode:      { t: 'lead_shipping_details', c: 'shipping_postcode' },
  shipping_city:          { t: 'lead_shipping_details', c: 'shipping_city' },
  shipping_state:         { t: 'lead_shipping_details', c: 'shipping_state' },
  shipping_country:       { t: 'lead_shipping_details', c: 'shipping_country' },
  shipping_method:        { t: 'lead_shipping_details', c: 'shipping_method' },
  is_rush_order:          { t: 'lead_shipping_details', c: 'is_rush_order', bool: true },
  required_delivery_date: { t: 'lead_shipping_details', c: 'required_delivery_date', date: true },
  event_date:             { t: 'lead_shipping_details', c: 'event_date', date: true },
  delivery_instructions:  { t: 'lead_shipping_details', c: 'delivery_instructions' },
  estimated_shipping_cost:{ t: 'lead_shipping_details', c: 'estimated_shipping_cost', num: true },
  // QUOTE -> app.quotes (lead ka latest quote; na ho to ban jaata hai)
  line_items:       { t: 'quotes', jsonCol: 'line_items' },
  quote_notes:      { t: 'quotes', c: 'quote_notes' },
  quote_status:     { t: 'quotes', c: 'status' },
  valid_until:      { t: 'quotes', c: 'valid_until', date: true },
  currency:         { t: 'quotes', c: 'currency' },
  discount:         { t: 'quotes', c: 'discount', num: true },
  subtotal:         { t: 'quotes', c: 'subtotal', num: true },
  shipping_charges: { t: 'quotes', c: 'shipping_cost', num: true },
  grand_total:      { t: 'quotes', c: 'total_amount', num: true },
}

// conversation (in-memory id / DB uuid / legacy_id) -> DB conversation row
async function resolveIds(conversationId) {
  const r = await dbQuery(
    `SELECT conversation_id, legacy_id, customer_id
       FROM app.conversations
      WHERE conversation_id::text = $1 OR legacy_id = $1
      LIMIT 1`, [String(conversationId)])
  return r.rows[0] || null
}

async function findLead(convId) {
  const r = await dbQuery(
    `SELECT * FROM app.leads
      WHERE conversation_id = $1 OR conversation_primary_id = $1
      ORDER BY created_at DESC LIMIT 1`, [convId])
  return r.rows[0] || null
}

async function ensureLead(co) {
  const found = await findLead(co.conversation_id)
  if (found) return found.lead_id
  const ins = await dbQuery(
    `INSERT INTO app.leads (conversation_id, customer_id, created_at, updated_at)
     VALUES ($1, $2, now(), now()) RETURNING lead_id`, [co.conversation_id, co.customer_id || null])
  return ins.rows[0].lead_id
}

async function ensureCustomer(co, convName) {
  if (co.customer_id) return co.customer_id
  const ins = await dbQuery(
    `INSERT INTO app.customers (full_name, created_at, updated_at)
     VALUES ($1, now(), now()) RETURNING customer_id`, [convName || 'Unknown'])
  const custId = ins.rows[0].customer_id
  await dbQuery(`UPDATE app.conversations SET customer_id = $1 WHERE conversation_id = $2`, [custId, co.conversation_id])
  co.customer_id = custId
  return custId
}

async function ensureQuote(co, convName) {
  const leadId = await ensureLead(co)
  const custId = co.customer_id || await ensureCustomer(co, convName)
  const r = await dbQuery(`SELECT quote_id FROM app.quotes WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1`, [leadId])
  if (r.rows[0]) return r.rows[0].quote_id
  const ins = await dbQuery(
    `INSERT INTO app.quotes (lead_id, customer_id, created_at, updated_at)
     VALUES ($1, $2, now(), now()) RETURNING quote_id`, [leadId, custId])
  return ins.rows[0].quote_id
}

// 1:1 extension rows (product/shipping) — lead_id UNIQUE, na ho to bana do.
async function ensureExtRow(table, leadId) {
  await dbQuery(`INSERT INTO app.${table} (lead_id) VALUES ($1) ON CONFLICT (lead_id) DO NOTHING`, [leadId])
  return leadId
}

async function writeCol(table, idCol, idVal, map, value) {
  if (map.j) {
    await dbQuery(
      `UPDATE ${table} SET extra = COALESCE(extra, '{}'::jsonb) || $1::jsonb, updated_at = now() WHERE ${idCol} = $2`,
      [JSON.stringify({ [map.j]: value }), idVal])
  } else if (map.jsonCol) {
    await dbQuery(
      `UPDATE ${table} SET ${map.jsonCol} = $1::jsonb, updated_at = now() WHERE ${idCol} = $2`,
      [JSON.stringify(value ?? null), idVal])
  } else {
    let v = value ?? ''
    if (map.num) v = (v === '' || v == null ? null : Number(v))
    else if (map.bool) v = (v === true || v === 'true' || v === 'Yes' || v === 'yes' || v === 1 || v === '1')
    else if (map.date) v = (v === '' || v == null ? null : v)
    await dbQuery(`UPDATE ${table} SET ${map.c} = $1, updated_at = now() WHERE ${idCol} = $2`, [v, idVal])
  }
}

// Ek validated field ko DB me save karo (agent ne Validate dabaya).
export async function saveField({ conversationId, field, value, convName }) {
  const map = FIELD_MAP[field]
  if (!map) { const e = new Error('Unknown field: ' + field); e.status = 400; throw e }
  const co = await resolveIds(conversationId)
  if (!co) { const e = new Error('Conversation not found in DB'); e.status = 404; throw e }

  if (map.t === 'leads') {
    const id = await ensureLead(co); await writeCol('app.leads', 'lead_id', id, map, value)
  } else if (map.t === 'customers') {
    const id = await ensureCustomer(co, convName); await writeCol('app.customers', 'customer_id', id, map, value)
  } else if (map.t === 'quotes') {
    const id = await ensureQuote(co, convName); await writeCol('app.quotes', 'quote_id', id, map, value)
  } else if (map.t === 'lead_requirements' || map.t === 'lead_shipping_details') {
    const lid = await ensureLead(co); await ensureExtRow(map.t, lid)
    await writeCol('app.' + map.t, 'lead_id', lid, map, value)
  }
  return { ok: true, field }
}

const dstr = (d) => { try { return d ? new Date(d).toISOString().slice(0, 10) : '' } catch { return '' } }

// Panel kholte hi: DB me jo pehle se saved hai wo values (agent ko dikhane ko).
export async function getLeadBundle(conversationId) {
  const out = {
    lead: {}, customer: {}, product: {}, shipping: {}, quote: {},
    has: { lead: false, customer: false, product: false, shipping: false, quote: false },
    customerName: '',
  }
  const co = await resolveIds(conversationId)
  if (!co) return out

  const lead = await findLead(co.conversation_id)
  if (lead) {
    out.has.lead = true
    out.lead = {
      stage: lead.lead_stage || lead.stage || '',
      lead_status: lead.lead_status || lead.status || '',
      qualification: lead.extra?.qualification || '',
      purchase_intent: lead.extra?.purchase_intent || '',
      priority: lead.priority || '',
      lead_summary: lead.lead_summary || '',
      internal_notes: lead.internal_notes || '',
      ai_summary: lead.ai_observations || '',      // read-only (AI)
      lost_reason: lead.lost_reason || '',
      estimated_value: lead.estimated_value ?? '',
    }
  }
  if (co.customer_id) {
    const cr = await dbQuery(`SELECT * FROM app.customers WHERE customer_id = $1`, [co.customer_id])
    const c = cr.rows[0]
    if (c) {
      out.has.customer = true
      out.customerName = c.full_name || ''
      out.customer = {
        email: c.email || '', phone: c.phone || '',
        segment: c.customer_segment || '', cust_status: c.status || '',
        business_name: c.company || '',
        preferred_channel: c.extra?.preferred_channel || '',
        tax_exempt: c.extra?.tax_exempt ?? false,
        customer_notes: c.extra?.customer_notes || '',
        shipping_address: c.extra?.shipping_address || {},
        billing_address: c.extra?.billing_address || {},
      }
    }
  }
  if (lead) {
    const pr = await dbQuery(`SELECT * FROM app.lead_requirements WHERE lead_id = $1`, [lead.lead_id])
    const p = pr.rows[0]
    if (p) {
      out.has.product = true
      out.product = {
        product_type: p.product_type || '', garment_source: p.garment_source || '',
        brand_style: p.brand_style || '', garment_color: p.garment_color || '',
        total_quantity: p.total_quantity ?? '',
        size_breakdown: Array.isArray(p.size_breakdown) ? p.size_breakdown : [],
        print_method: p.print_method || '',
        print_locations: Array.isArray(p.print_locations) ? p.print_locations : [],
        front_print_size: p.front_print_size || '', back_print_size: p.back_print_size || '',
        special_instructions: p.special_instructions || '', designer_notes: p.designer_notes || '',
        artwork_required: p.artwork_required ?? true, artwork_status: p.artwork_status || '',
        artwork_instructions: p.artwork_instructions || '',
      }
    }
    const sr = await dbQuery(`SELECT * FROM app.lead_shipping_details WHERE lead_id = $1`, [lead.lead_id])
    const s = sr.rows[0]
    if (s) {
      out.has.shipping = true
      out.shipping = {
        shipping_postcode: s.shipping_postcode || '', shipping_city: s.shipping_city || '',
        shipping_state: s.shipping_state || '', shipping_country: s.shipping_country || '',
        shipping_method: s.shipping_method || '', is_rush_order: s.is_rush_order ?? false,
        required_delivery_date: dstr(s.required_delivery_date), event_date: dstr(s.event_date),
        delivery_instructions: s.delivery_instructions || '',
        estimated_shipping_cost: s.estimated_shipping_cost ?? '',
      }
    }
    const qr = await dbQuery(`SELECT * FROM app.quotes WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1`, [lead.lead_id])
    const q = qr.rows[0]
    if (q) {
      out.has.quote = true
      out.quote = {
        line_items: Array.isArray(q.line_items) ? q.line_items : [],
        quote_notes: q.quote_notes || '', quote_status: q.status || '',
        valid_until: dstr(q.valid_until), currency: q.currency || 'USD',
        discount: q.discount ?? '', subtotal: q.subtotal ?? '',
        shipping_charges: q.shipping_cost ?? '', grand_total: q.total_amount ?? '',
      }
    }
  }
  return out
}

// ---- AI extraction: chat padh kar 5 sections ke fields suggest karta hai (save NAHI karta) ----
const EXTRACT_SYSTEM = `You extract CRM fields from a print-shop (custom apparel / DTF transfers) chat between a Customer and the shop's Agent.

Return ONLY a JSON object with EXACTLY these keys (use "" or [] when unknown — NEVER guess):
{
  "lead": {
    "stage": one of ["Qualification","Contacted","Proposal","Negotiation","Won","Lost"] or "",
    "lead_status": one of ["Active","Inactive","Won","Lost"] or "",
    "qualification": one of ["Qualified","Unqualified","Pending"] or "",
    "purchase_intent": one of ["Researching","Browsing","Price Comparing","Interested","Ready to Buy","Waiting Payment","Returning Customer"] or "",
    "priority": one of ["Low","Medium","High"] or "",
    "lead_summary": one short sentence describing what the lead needs or ""
  },
  "customer": {
    "email": customer's OWN email or "",
    "phone": customer's OWN phone or "",
    "segment": one of ["Event Customer","Reseller","Wholesale","Individual","Business"] or "",
    "business_name": customer's company/brand name or "",
    "preferred_channel": one of ["WhatsApp","Facebook","Instagram","Email","Phone"] or "",
    "shipping_address": { "line1":"", "line2":"", "city":"", "state":"", "zip":"", "country":"" }
  },
  "product": {
    "product_type": one of ["T-Shirt","Hoodie","Polo","Sweatshirt","DTF Transfer","Gang Sheet","Other"] or "",
    "garment_source": one of ["Decoinks Supply","Customer Supplied"] or "",
    "brand_style": garment brand/style e.g. "Gildan 5000" or "",
    "garment_color": e.g. "Black" or "",
    "total_quantity": number or "",
    "size_breakdown": [ { "size":"", "quantity":0 } ],
    "print_method": one of ["DTF","Screen Print","Embroidery","Other"] or "",
    "print_locations": array from ["Front","Back","Left Chest","Right Chest","Sleeves"] or [],
    "front_print_size": e.g. "3.5in wide" or "",
    "back_print_size": e.g. "11in wide" or "",
    "special_instructions": ""
  },
  "shipping": {
    "shipping_postcode": customer's ZIP/postcode or "",
    "shipping_city": "", "shipping_state": "", "shipping_country": "",
    "shipping_method": one of ["Standard","Express","Pickup"] or "",
    "is_rush_order": true or false,
    "required_delivery_date": "YYYY-MM-DD" or "",
    "event_date": "YYYY-MM-DD" or "",
    "delivery_instructions": ""
  },
  "quote": {
    "line_items": [ { "item_type":"garment|printing|shipping", "item_name":"", "quantity":0, "unit_price":0, "amount":0 } ],
    "quote_notes": "",
    "subtotal": number or "", "shipping_charges": number or "", "grand_total": number or ""
  }
}

Rules:
- Extract ONLY the CUSTOMER's own details. NEVER extract the shop's/agent's own email/phone/address.
- Sum of size_breakdown quantities should equal total_quantity when both are known.
- required_delivery_date: only if the customer states an actual delivery deadline. If they only mention an EVENT date, fill event_date and leave required_delivery_date "".
- Numbers: digits only, no "$"/commas. Dates: YYYY-MM-DD.
- If no quote/pricing discussed, return "line_items": [] and "" for totals.
- Output valid JSON only, no commentary.`

export async function extractFields(conversationId) {
  const conv = findById('conversations', conversationId)
  const msgs = getAll('messages').filter((m) => m.conversation_id === conversationId)
  if (!msgs.length) return { empty: true }
  const transcript = msgs.map((m) =>
    `${m.dir === 'in' ? 'Customer' : m.dir === 'out' ? 'Agent' : 'System'}: ${m.text || (m.attachments?.length ? '[sent an attachment/image]' : '')}`
  ).join('\n').slice(-9000)
  const user = `Customer name: ${conv?.name || 'Unknown'}\nChannel: ${conv?.channel || ''}\n\nConversation transcript (oldest to newest):\n${transcript}`
  const fields = await chatJSON(EXTRACT_SYSTEM, user)
  return { ok: true, fields }
}

// ============================================================
// Qualification Score (0-100) — DETERMINISTIC, collected data + chat se.
// Temperature = f(score, intent). Score data structured tables se aata hai.
// ============================================================
const QUAL_CRITERIA = [
  { key: 'contact',  label: 'Customer name/contact available', pts: 5 },
  { key: 'product',  label: 'Product type identified',         pts: 10 },
  { key: 'quantity', label: 'Quantity available',              pts: 15 },
  { key: 'sizes',    label: 'Size breakdown available',        pts: 10 },
  { key: 'garment',  label: 'Garment color/style available',   pts: 5 },
  { key: 'print',    label: 'Print locations available',       pts: 10 },
  { key: 'artwork',  label: 'Artwork received',                pts: 20 },
  { key: 'delivery', label: 'Delivery date available',         pts: 10 },
  { key: 'zip',      label: 'Shipping ZIP available',          pts: 5 },
  { key: 'quote',    label: 'Quote created',                   pts: 10 },
]

const isEmpty = (v) =>
  v == null || v === '' ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === 'object' && !Array.isArray(v) && !Object.values(v).some((x) => x))
const nonEmpty = (v) => !isEmpty(v)

const scoreBand = (s) => s >= 70 ? 'Qualified' : s >= 40 ? 'Partially Qualified' : 'Unqualified'

// Temperature: Cold 0-39, Warm 40-69, Hot 70-100 AND intent Interested-or-higher.
export function deriveTemperature(score, intent) {
  const HOT_INTENT = ['Interested', 'Ready to Buy', 'Waiting Payment', 'Returning Customer']
  if (score >= 70 && HOT_INTENT.includes(intent)) return 'Hot'
  if (score >= 40) return 'Warm'
  return 'Cold'
}

function computeQualification(conversationId, bundle) {
  const P = bundle?.product || {}, S = bundle?.shipping || {}, C = bundle?.customer || {}, Q = bundle?.quote || {}
  const msgs = getAll('messages').filter((m) => m.conversation_id === conversationId)
  const hasImg = msgs.some((m) => (m.attachments || []).some((a) => a?.type === 'image'))
  const got = {
    contact:  nonEmpty(C.email) || nonEmpty(C.phone),
    product:  nonEmpty(P.product_type),
    quantity: nonEmpty(P.total_quantity),
    sizes:    Array.isArray(P.size_breakdown) && P.size_breakdown.length > 0,
    garment:  nonEmpty(P.garment_color) || nonEmpty(P.brand_style),
    print:    Array.isArray(P.print_locations) && P.print_locations.length > 0,
    artwork:  hasImg || /received|review|approved|changes/i.test(P.artwork_status || ''),
    delivery: nonEmpty(S.required_delivery_date) || nonEmpty(S.event_date),
    zip:      nonEmpty(S.shipping_postcode) || nonEmpty(C.shipping_address?.zip),
    quote:    !!bundle?.has?.quote && (nonEmpty(Q.grand_total) || (Array.isArray(Q.line_items) && Q.line_items.length > 0)),
  }
  let score = 0
  const breakdown = QUAL_CRITERIA.map((c) => { const g = !!got[c.key]; if (g) score += c.pts; return { key: c.key, label: c.label, points: c.pts, got: g } })
  score = Math.min(100, score)
  return { score, band: scoreBand(score), breakdown }
}

// Panel/grid ke liye: qualification (deterministic) + stored purchase intent + auto temperature.
export async function getLeadScore(conversationId) {
  const bundle = await getLeadBundle(conversationId)
  const qualification = computeQualification(conversationId, bundle)
  const purchase_intent = bundle.lead?.purchase_intent || ''
  const temperature = deriveTemperature(qualification.score, purchase_intent)
  const co = await resolveIds(conversationId)
  if (co) {
    const lead = await findLead(co.conversation_id)
    if (lead) await dbQuery(
      `UPDATE app.leads SET score_total = $1, temperature = $2, updated_at = now() WHERE lead_id = $3`,
      [qualification.score, temperature, lead.lead_id]).catch(() => {})
  }
  return { qualification, purchase_intent, temperature }
}

// ---- BULK: jin conversations me order hua hai, unki fields AI se nikaal kar DB me bhar do ----
export async function backfillOrderConversations({ limit = 0, force = false } = {}) {
  const q = await dbQuery(
    `SELECT DISTINCT c.legacy_id AS cid
       FROM app.orders o JOIN app.conversations c ON o.conversation_id = c.conversation_id
      WHERE c.legacy_id IS NOT NULL`)
  let cids = q.rows.map((r) => r.cid)
  if (limit > 0) cids = cids.slice(0, limit)
  const summary = { orders_conversations: cids.length, processed: 0, fields_saved: 0, skipped_filled: 0, no_chat: 0, errors: 0 }

  const CONC = 4
  let i = 0
  async function worker() {
    while (i < cids.length) {
      const cid = cids[i++]
      try {
        const ex = await extractFields(cid)
        if (ex?.empty || !ex?.fields) { summary.no_chat++; summary.processed++; continue }
        const saved = force ? {} : await getLeadBundle(cid)
        const existing = { ...saved.lead, ...saved.customer, ...saved.product, ...saved.shipping, ...saved.quote }
        const f = ex.fields
        const flat = { ...(f.lead || {}), ...(f.customer || {}), ...(f.product || {}), ...(f.shipping || {}), ...(f.quote || {}) }
        for (const [field, value] of Object.entries(flat)) {
          if (!FIELD_MAP[field]) continue
          if (isEmpty(value)) continue
          if (!force && !isEmpty(existing[field])) { summary.skipped_filled++; continue }
          try { await saveField({ conversationId: cid, field, value }); summary.fields_saved++ }
          catch { summary.errors++ }
        }
        summary.processed++
        if (summary.processed % 10 === 0) console.log(`[backfill-orders] ${summary.processed}/${cids.length} done, ${summary.fields_saved} saved`)
      } catch (e) { summary.errors++; summary.processed++; console.warn('[backfill-orders]', cid, e.message) }
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker))
  console.log(`[backfill-orders] DONE:`, JSON.stringify(summary))
  return summary
}
