// ============================================================
// Lead Details panel — AI chat se fields extract karta hai; agent
// har field ke "Validate" par click kare TABHI wo field DB me save hoti hai.
// Fields real columns me jaati hain jahan hain; baaki `extra` JSON me.
// Lead / customer / quote row na ho to pehli validate par bana di jaati hai.
// ============================================================
import { query as dbQuery, getAll, findById } from './db.js'
import { chatJSON } from './ai.js'

// ---- Field whitelist: panel SIRF yahi fields save kar sakta hai (SQL injection safe) ----
//   t: table | c: direct column | j: key inside <table>.extra JSON | jsonCol: apna JSON column | num: numeric
export const FIELD_MAP = {
  // LEAD tab -> app.leads
  stage:            { t: 'leads', c: 'lead_stage' },
  lead_status:      { t: 'leads', c: 'lead_status' },
  qualification:    { t: 'leads', j: 'qualification' },
  temperature:      { t: 'leads', c: 'temperature' },
  purchase_intent:  { t: 'leads', j: 'purchase_intent' },
  product_intent:   { t: 'leads', c: 'primary_product' },
  priority:         { t: 'leads', c: 'priority' },
  lead_summary:     { t: 'leads', c: 'lead_summary' },
  internal_notes:   { t: 'leads', c: 'ai_observations' },
  estimated_value:  { t: 'leads', c: 'estimated_value', num: true },
  // CUSTOMER tab -> app.customers
  email:            { t: 'customers', c: 'email' },
  phone:            { t: 'customers', c: 'phone' },
  segment:          { t: 'customers', c: 'customer_segment' },
  cust_status:      { t: 'customers', c: 'status' },
  shipping_address: { t: 'customers', j: 'shipping_address' },
  billing_address:  { t: 'customers', j: 'billing_address' },
  // QUOTE tab -> app.quotes (lead ka latest quote; na ho to ban jaata hai)
  line_items:       { t: 'quotes', jsonCol: 'line_items' },
  quote_notes:      { t: 'quotes', c: 'quote_notes' },
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
    const v = map.num ? (value === '' || value == null ? null : Number(value)) : (value ?? '')
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
  }
  return { ok: true, field }
}

// Panel kholte hi: DB me jo pehle se saved hai wo values (agent ko dikhane ko).
export async function getLeadBundle(conversationId) {
  const out = { lead: {}, customer: {}, quote: {}, has: { lead: false, customer: false, quote: false } }
  const co = await resolveIds(conversationId)
  if (!co) return out

  const lead = await findLead(co.conversation_id)
  if (lead) {
    out.has.lead = true
    out.lead = {
      stage: lead.lead_stage || lead.stage || '',
      lead_status: lead.lead_status || lead.status || '',
      qualification: lead.extra?.qualification || '',
      temperature: lead.temperature || '',
      purchase_intent: lead.extra?.purchase_intent || '',
      product_intent: lead.primary_product || '',
      priority: lead.priority || '',
      lead_summary: lead.lead_summary || '',
      internal_notes: lead.ai_observations || '',
      estimated_value: lead.estimated_value ?? '',
    }
  }
  if (co.customer_id) {
    const cr = await dbQuery(`SELECT * FROM app.customers WHERE customer_id = $1`, [co.customer_id])
    const c = cr.rows[0]
    if (c) {
      out.has.customer = true
      out.customer = {
        email: c.email || '', phone: c.phone || '',
        segment: c.customer_segment || '', cust_status: c.status || '',
        shipping_address: c.extra?.shipping_address || {},
        billing_address: c.extra?.billing_address || {},
      }
    }
  }
  if (lead) {
    const qr = await dbQuery(`SELECT * FROM app.quotes WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1`, [lead.lead_id])
    const q = qr.rows[0]
    if (q) {
      out.has.quote = true
      out.quote = {
        line_items: Array.isArray(q.line_items) ? q.line_items : [],
        quote_notes: q.quote_notes || '',
        subtotal: q.subtotal ?? '', shipping_charges: q.shipping_cost ?? '', grand_total: q.total_amount ?? '',
      }
    }
  }
  return out
}

// ---- AI extraction: chat padh kar teeno tabs ke fields suggest karta hai (save NAHI karta) ----
const EXTRACT_SYSTEM = `You extract CRM lead/customer/quote fields from a print-shop (custom apparel / DTF transfers) chat between a Customer and the shop's Agent.

Return ONLY a JSON object with EXACTLY these keys (use "" or [] when unknown — never guess):
{
  "lead": {
    "stage": one of ["Qualification","Contacted","Proposal","Negotiation","Won","Lost"] or "",
    "lead_status": one of ["Active","Inactive","Won","Lost"] or "",
    "qualification": one of ["Qualified","Unqualified","Pending"] or "",
    "temperature": one of ["Cold","Warm","Hot"] or "",
    "purchase_intent": one of ["Researching","Browsing","Price Comparing","Interested","Ready to Buy","Waiting Payment","Returning Customer"] or "",
    "product_intent": short product name the customer wants (e.g. "Bulk DTF Transfers") or "",
    "priority": one of ["Low","Medium","High"] or "",
    "lead_summary": one short sentence describing what the lead needs or "",
    "internal_notes": one short internal note for the agent or "",
    "estimated_value": number (USD, no symbol) or ""
  },
  "customer": {
    "email": customer's OWN email or "",
    "phone": customer's OWN phone or "",
    "segment": one of ["Event Customer","Reseller","Wholesale","Individual","Business"] or "",
    "cust_status": one of ["Active","Inactive","Lead"] or "",
    "shipping_address": { "line1":"", "line2":"", "city":"", "state":"", "zip":"", "country":"" },
    "billing_address": { "line1":"", "line2":"", "city":"", "state":"", "zip":"", "country":"" }
  },
  "quote": {
    "line_items": [ { "item":"", "qty":0, "item_charge":0, "shipping_charge":0 } ],
    "quote_notes": "",
    "subtotal": number or "",
    "shipping_charges": number or "",
    "grand_total": number or ""
  }
}

Rules:
- Extract ONLY the CUSTOMER's own details. NEVER extract the shop's/agent's own email, phone, or address.
- temperature: Hot = ready to buy / urgent; Warm = interested, comparing; Cold = just asking.
- Numbers: digits only, no "$" or commas.
- If the chat has no quote/pricing, return "line_items": [] and "" for the totals.
- Output valid JSON only, no commentary.`

export async function extractFields(conversationId) {
  const conv = findById('conversations', conversationId)
  const msgs = getAll('messages').filter((m) => m.conversation_id === conversationId)
  if (!msgs.length) return { empty: true }
  const transcript = msgs.map((m) =>
    `${m.dir === 'in' ? 'Customer' : m.dir === 'out' ? 'Agent' : 'System'}: ${m.text || (m.attachments?.length ? '[sent an attachment]' : '')}`
  ).join('\n').slice(-9000)
  const user = `Customer name: ${conv?.name || 'Unknown'}\nChannel: ${conv?.channel || ''}\n\nConversation transcript (oldest to newest):\n${transcript}`
  const fields = await chatJSON(EXTRACT_SYSTEM, user)
  return { ok: true, fields }
}

// ============================================================
// Qualification Score (0-100) — DETERMINISTIC, chat + collected data se (AI nahi).
// Purchase Intent AI se (extract). Temperature = f(score, intent) auto-derive.
// ============================================================
const QUAL_CRITERIA = [
  { key: 'replied',  label: 'Customer replied after auto-response', pts: 10 },
  { key: 'human',    label: 'Human agent engaged',                  pts: 5 },
  { key: 'product',  label: 'Product identified',                   pts: 10 },
  { key: 'artwork',  label: 'Artwork uploaded',                     pts: 20 },
  { key: 'quantity', label: 'Quantity discussed',                   pts: 10 },
  { key: 'garment',  label: 'Garment type identified',              pts: 5 },
  { key: 'print',    label: 'Print locations known',                pts: 5 },
  { key: 'shipping', label: 'Shipping ZIP/Address received',        pts: 10 },
  { key: 'quote',    label: 'Quote requested',                      pts: 10 },
  { key: 'mockup',   label: 'Mockup requested',                     pts: 10 },
  { key: 'budget',   label: 'Budget discussed',                     pts: 5 },
  { key: 'timeline', label: 'Timeline discussed',                   pts: 5 },
]

const bandOf = (score) =>
  score >= 81 ? 'Sales Ready' : score >= 61 ? 'Qualified' : score >= 31 ? 'Warm' : 'Cold'

export function deriveTemperature(score, intent) {
  const HOT = ['Ready to Buy', 'Waiting Payment', 'Returning Customer']
  const LOW = ['Researching', 'Browsing']
  if (score > 70 && HOT.includes(intent)) return 'Hot'
  if (score < 40 || LOW.includes(intent)) return 'Cold'
  return 'Warm'
}

function computeQualification(conversationId, bundle) {
  const msgs = getAll('messages').filter((m) => m.conversation_id === conversationId)
  const text = msgs.map((m) => m.text || '').join(' \n ').toLowerCase().slice(0, 20000)
  const rx = (re) => re.test(text)
  const hasIn = msgs.some((m) => m.dir === 'in')
  const hasOut = msgs.some((m) => m.dir === 'out')
  const hasImg = msgs.some((m) => (m.attachments || []).some((a) => a?.type === 'image'))
  const ship = bundle?.customer?.shipping_address
  const got = {
    replied:  hasIn && hasOut,
    human:    hasOut,
    product:  !!bundle?.lead?.product_intent || rx(/\b(dtf|transfer|screen ?print|embroider|sublimation|vinyl|htv)\b/),
    artwork:  hasImg || rx(/\b(artwork|logo|design file|\.png|\.ai|\.psd|mockup)\b/),
    quantity: rx(/\b(\d{2,})\s*(pcs|pieces|shirts|units|qty)\b/) || rx(/\b(how many|quantity|minimum order|moq)\b/),
    garment:  rx(/\b(t-?shirts?|tees?|hood(ie|y)|sweatshirt|jersey|garment|apparel|polo|tank top)\b/),
    print:    rx(/\b(front|back|left chest|right chest|sleeve|print location|placement)\b/),
    shipping: !!(ship && Object.values(ship).some((x) => x)) || rx(/\b(\d{5})\b/) || rx(/\b(zip ?code|postal|ship to|shipping address)\b/),
    quote:    !!bundle?.has?.quote || rx(/\b(quote|quotation|pricing|how much|estimate)\b/),
    mockup:   rx(/\b(mock-?up|proof|preview|sample design)\b/),
    budget:   rx(/\$\s?\d/) || rx(/\b(budget|per (piece|shirt|unit)|price range)\b/),
    timeline: rx(/\b(deadline|need (it|them|by)|turnaround|how (soon|long)|delivery date|timeline|urgent|asap|by (mon|tue|wed|thu|fri|sat|sun|next))\b/),
  }
  let score = 0
  const breakdown = QUAL_CRITERIA.map((c) => { const g = !!got[c.key]; if (g) score += c.pts; return { key: c.key, label: c.label, points: c.pts, got: g } })
  score = Math.min(100, score)
  return { score, band: bandOf(score), breakdown }
}

// Panel/grid ke liye: qualification (deterministic) + stored purchase intent + auto temperature.
export async function getLeadScore(conversationId) {
  const bundle = await getLeadBundle(conversationId)
  const qualification = computeQualification(conversationId, bundle)
  const purchase_intent = bundle.lead?.purchase_intent || ''
  const temperature = deriveTemperature(qualification.score, purchase_intent)
  // Lead pehle se ho to score/temperature persist karo (grid/filter ke liye) — naya lead mat banao.
  const co = await resolveIds(conversationId)
  if (co) {
    const lead = await findLead(co.conversation_id)
    if (lead) await dbQuery(
      `UPDATE app.leads SET score_total = $1, temperature = $2, updated_at = now() WHERE lead_id = $3`,
      [qualification.score, temperature, lead.lead_id]).catch(() => {})
  }
  return { qualification, purchase_intent, temperature }
}

const isEmpty = (v) =>
  v == null || v === '' ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === 'object' && !Array.isArray(v) && !Object.values(v).some((x) => x))

// ---- BULK: jin conversations me order hua hai, unki fields AI se nikaal kar DB me bhar do ----
// Default: sirf KHAALI fields bhare (existing data safe). force=true -> sab refresh.
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
        const saved = force ? { lead: {}, customer: {}, quote: {} } : await getLeadBundle(cid)
        const existing = { ...saved.lead, ...saved.customer, ...saved.quote }
        const flat = { ...(ex.fields.lead || {}), ...(ex.fields.customer || {}), ...(ex.fields.quote || {}) }
        for (const [field, value] of Object.entries(flat)) {
          if (!FIELD_MAP[field]) continue
          if (isEmpty(value)) continue
          if (!force && !isEmpty(existing[field])) { summary.skipped_filled++; continue }  // pehle se bhara -> chhodo
          try { await saveField({ conversationId: cid, field, value }); summary.fields_saved++ }
          catch { summary.errors++ }
        }
        summary.processed++
        if (summary.processed % 10 === 0) console.log(`[backfill-orders] ${summary.processed}/${cids.length} done, ${summary.fields_saved} fields saved`)
      } catch (e) { summary.errors++; summary.processed++; console.warn('[backfill-orders]', cid, e.message) }
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker))
  console.log(`[backfill-orders] DONE:`, JSON.stringify(summary))
  return summary
}
