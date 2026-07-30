// ============================================================
// Lead Details panel — AI chat se fields extract karta hai; agent
// har field ke "Validate" par click kare TABHI wo field DB me save hoti hai.
// 5 sections: Lead / Customer / Product & Artwork / Shipping & Delivery / Quote.
//   leads · customers · lead_requirements · lead_shipping_details · quotes
// Row na ho to pehli validate par apne aap ban jaati hai.
// ============================================================
import { query as dbQuery, getClient, getAll, findById } from './db.js'
import { chatJSON } from './ai.js'
import { createHash } from 'node:crypto'

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
  // CUSTOMER -> app.customers (POS Decoinks profile ke fields; typed col ya extra JSON)
  first_name:       { t: 'customers', j: 'first_name' },
  last_name:        { t: 'customers', j: 'last_name' },
  business_name:    { t: 'customers', c: 'company' },
  email:            { t: 'customers', c: 'email' },
  company_phone:    { t: 'customers', j: 'company_phone' },
  mobile_number:    { t: 'customers', c: 'phone' },       // primary phone (typed)
  phone:            { t: 'customers', c: 'phone' },        // legacy alias (UI mobile_number use karta hai)
  whatsapp:         { t: 'customers', j: 'whatsapp' },
  preferred_language:{ t: 'customers', c: 'language_preference' },
  preferred_channel:{ t: 'customers', j: 'preferred_channel' },
  segment:          { t: 'customers', c: 'customer_segment' },
  loyalty_tier:     { t: 'customers', c: 'tier' },
  cust_status:      { t: 'customers', c: 'status' },
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
  // SALES ORDER -> app.orders (1 order per lead/conversation). Keys prefixed to avoid
  // collisions (currency/status/special_instructions already used above).
  order_products:      { t: 'orders', c: 'products' },
  order_items_count:   { t: 'orders', c: 'items_count', num: true },
  order_total:         { t: 'orders', c: 'total_amount', num: true },
  order_currency:      { t: 'orders', c: 'currency' },
  order_status:        { t: 'orders', c: 'order_status' },
  payment_status:      { t: 'orders', c: 'payment_status' },
  order_deadline:      { t: 'orders', c: 'deadline', date: true },
  production_partner:  { t: 'orders', c: 'production_partner' },
  order_summary:       { t: 'orders', c: 'order_summary' },
  order_instructions:  { t: 'orders', c: 'special_instructions' },
  order_lines:         { t: 'orders', childTable: 'order_lines' },   // app.order_lines rows
  // INVOICE -> app.leads.extra (invoice_* JSON keys). DB role app schema me nayi table
  // CREATE nahi kar sakta, isliye invoice billing lead ke extra JSON me store hoti hai.
  // Sales Order se PEHLE ka billing capture (Decoinks New Invoice ke most-needed fields).
  invoice_number:   { t: 'leads', j: 'invoice_number' },
  invoice_status:   { t: 'leads', j: 'invoice_status' },
  invoice_date:     { t: 'leads', j: 'invoice_date', date: true },
  invoice_due_date: { t: 'leads', j: 'invoice_due_date', date: true },
  payment_terms:    { t: 'leads', j: 'payment_terms' },
  payment_method:   { t: 'leads', j: 'payment_method' },
  invoice_currency: { t: 'leads', j: 'invoice_currency' },
  invoice_subtotal: { t: 'leads', j: 'invoice_subtotal', num: true },
  invoice_discount: { t: 'leads', j: 'invoice_discount', num: true },
  invoice_tax:      { t: 'leads', j: 'invoice_tax', num: true },
  invoice_shipping: { t: 'leads', j: 'invoice_shipping', num: true },
  invoice_total:    { t: 'leads', j: 'invoice_total', num: true },
  amount_paid:      { t: 'leads', j: 'amount_paid', num: true },
  balance_due:      { t: 'leads', j: 'balance_due', num: true },
  invoice_notes:    { t: 'leads', j: 'invoice_notes' },
  invoice_lines:    { t: 'leads', j: 'invoice_lines' },   // array of {description, qty, unit_price}
}

// Allowed values for select fields — validate par galat value reject hoti hai.
const FIELD_OPTS = {
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
}

// conversation (in-memory id / DB uuid / legacy_id) -> DB conversation row
async function resolveIds(conversationId) {
  const r = await dbQuery(
    `SELECT conversation_id, legacy_id, customer_id, channel
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

// SALES ORDER — ek order per conversation. Na ho to bana do (customer + latest quote se linked).
async function findOrder(co) {
  const r = await dbQuery(`SELECT * FROM app.orders WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1`, [co.conversation_id])
  return r.rows[0] || null
}
async function ensureOrder(co, convName) {
  const found = await findOrder(co)
  if (found) return found.order_id
  const custId = co.customer_id || await ensureCustomer(co, convName)
  const leadId = await ensureLead(co)
  const q = await dbQuery(`SELECT quote_id FROM app.quotes WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1`, [leadId])
  const ins = await dbQuery(
    `INSERT INTO app.orders (conversation_id, customer_id, quote_id, order_status, payment_status, currency, created_at, updated_at)
     VALUES ($1, $2, $3, 'pending', 'pending', 'USD', now(), now()) RETURNING order_id`,
    [co.conversation_id, custId, q.rows[0]?.quote_id || null])
  const oid = ins.rows[0].order_id
  await dbQuery(`UPDATE app.orders SET order_number = $1 WHERE order_id = $2 AND (order_number IS NULL OR order_number = '')`,
    ['ORD-' + String(oid).replace(/-/g, '').slice(-6).toUpperCase(), oid])
  return oid
}
// order_lines child-table sync — poore set ko replace karo (validate par).
async function saveOrderLines(orderId, lines) {
  await dbQuery(`DELETE FROM app.order_lines WHERE order_id = $1`, [orderId])
  for (const ln of (Array.isArray(lines) ? lines : [])) {
    const qty = Number(ln.qty) || 0, up = Number(ln.unit_price) || 0
    if (!ln.product && !ln.sku && !qty) continue
    await dbQuery(
      `INSERT INTO app.order_lines (order_id, sku, product, qty, unit_price, total) VALUES ($1,$2,$3,$4,$5,$6)`,
      [orderId, ln.sku || '', ln.product || '', qty || null, up || null, (qty * up) || null])
  }
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

const _isEmpty = (v) =>
  v == null || v === '' ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === 'object' && !Array.isArray(v) && !Object.values(v).some((x) => x))

// Ek validated field ko DB me save karo (agent ne Validate dabaya).
export async function saveField({ conversationId, field, value, convName }) {
  const map = FIELD_MAP[field]
  if (!map) { const e = new Error('Unknown field: ' + field); e.status = 400; throw e }
  // VALIDATION: khaali value save mat karo — empty field "confirm"/save nahi hona chahiye,
  // aur na hi khaali ke liye lead/customer/quote row banao. (toggle ka false valid hai.)
  if (map.bool !== true && _isEmpty(value)) return { ok: true, saved: false, reason: 'empty' }
  const bad = (msg) => { const e = new Error(msg); e.status = 400; throw e }
  const sval = String(value == null ? '' : value).trim()

  // 1) Email format
  if (field === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(sval)) bad('Invalid email address')
  // 2) Phone fields — kam se kam 7 digits
  if (['phone', 'mobile_number', 'company_phone', 'whatsapp'].includes(field) && sval && sval.replace(/\D/g, '').length < 7) bad('Phone number looks too short')
  // 3) Select fields — value allowed options me se honi chahiye
  if (FIELD_OPTS[field] && sval && !FIELD_OPTS[field].includes(sval)) bad(`Invalid ${field}. Allowed: ${FIELD_OPTS[field].join(', ')}`)
  // 4) Numbers — valid + 0 ya zyada
  if (map.num && sval !== '') {
    const n = Number(value)
    if (isNaN(n)) bad('Must be a number')
    if (n < 0) bad('Must be 0 or more')
  }
  // 5) Dates — sirf valid date honi chahiye (past/future dono OK — optional, block nahi).
  if (map.date && sval) {
    const d = new Date(sval)
    if (isNaN(d.getTime())) bad('Invalid date')
  }
  // 6) Order line items — har row me product/sku ho aur qty/price valid (>=0)
  if (field === 'order_lines' && Array.isArray(value)) {
    for (const ln of value) {
      if (!String(ln.product || ln.sku || '').trim()) bad('Each order line needs a product or SKU')
      if (ln.qty != null && ln.qty !== '' && (isNaN(Number(ln.qty)) || Number(ln.qty) < 0)) bad('Line qty must be a number ≥ 0')
      if (ln.unit_price != null && ln.unit_price !== '' && (isNaN(Number(ln.unit_price)) || Number(ln.unit_price) < 0)) bad('Line unit price must be ≥ 0')
    }
  }
  const co = await resolveIds(conversationId)
  if (!co) { const e = new Error('Conversation not found in DB'); e.status = 404; throw e }

  if (map.t === 'leads') {
    const id = await ensureLead(co); await writeCol('app.leads', 'lead_id', id, map, value)
  } else if (map.t === 'customers') {
    const id = await ensureCustomer(co, convName); await writeCol('app.customers', 'customer_id', id, map, value)
  } else if (map.t === 'quotes') {
    const id = await ensureQuote(co, convName); await writeCol('app.quotes', 'quote_id', id, map, value)
  } else if (map.t === 'orders') {
    const oid = await ensureOrder(co, convName)
    if (map.childTable === 'order_lines') await saveOrderLines(oid, value)
    else await writeCol('app.orders', 'order_id', oid, map, value)
  } else if (map.t === 'lead_requirements' || map.t === 'lead_shipping_details') {
    const lid = await ensureLead(co); await ensureExtRow(map.t, lid)
    await writeCol('app.' + map.t, 'lead_id', lid, map, value)
  }
  return { ok: true, saved: true, field }
}

const dstr = (d) => { try { return d ? new Date(d).toISOString().slice(0, 10) : '' } catch { return '' } }

// Panel kholte hi: DB me jo pehle se saved hai wo values (agent ko dikhane ko).
export async function getLeadBundle(conversationId) {
  const out = {
    lead: {}, customer: {}, product: {}, shipping: {}, quote: {}, invoice: {}, order: {},
    has: { lead: false, customer: false, product: false, shipping: false, quote: false, invoice: false, order: false },
    customerName: '',
  }
  const co = await resolveIds(conversationId)
  if (!co) return out
  const memConv = findById('conversations', conversationId)   // meta_first/meta_last (Meta se EXACT)
  const metaFirst = memConv?.meta_first || ''
  const metaLast = memConv?.meta_last || ''

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
    // AI-enriched read-only insights (wahi fields jo Leads dashboard me dikhte hain).
    out.ai = {
      intent_score: lead.intent_score ?? null,
      purchase_probability: lead.purchase_probability ?? null,
      temperature: lead.temperature || '',
      business_potential: lead.business_potential || '',
      customer_type: lead.customer_type || '',
      primary_product: lead.primary_product || '',
      estimated_value: lead.estimated_value ?? null,
      reseller_likelihood: lead.reseller_likelihood ?? null,
      industry: lead.industry || '',
      lead_summary: lead.lead_summary || '',
      ai_observations: lead.ai_observations || '',
    }
    // INVOICE — lead.extra me namespaced invoice_* keys (billing before Sales Order).
    const ix = lead.extra || {}
    const invoiceKeys = ['invoice_number', 'invoice_status', 'invoice_date', 'invoice_due_date', 'payment_terms', 'payment_method', 'invoice_currency', 'invoice_subtotal', 'invoice_discount', 'invoice_tax', 'invoice_shipping', 'invoice_total', 'amount_paid', 'balance_due', 'invoice_notes', 'invoice_lines']
    out.has.invoice = invoiceKeys.some((k) => ix[k] != null && ix[k] !== '')
    out.invoice = {
      invoice_number: ix.invoice_number || '',
      invoice_status: ix.invoice_status || '',
      invoice_date: ix.invoice_date || '',
      invoice_due_date: ix.invoice_due_date || '',
      payment_terms: ix.payment_terms || '',
      payment_method: ix.payment_method || '',
      invoice_currency: ix.invoice_currency || 'USD',
      invoice_subtotal: ix.invoice_subtotal ?? '',
      invoice_discount: ix.invoice_discount ?? '',
      invoice_tax: ix.invoice_tax ?? '',
      invoice_shipping: ix.invoice_shipping ?? '',
      invoice_total: ix.invoice_total ?? '',
      amount_paid: ix.amount_paid ?? '',
      balance_due: ix.balance_due ?? '',
      invoice_notes: ix.invoice_notes || '',
      invoice_lines: Array.isArray(ix.invoice_lines) ? ix.invoice_lines : [],
    }
  }
  if (co.customer_id) {
    const cr = await dbQuery(`SELECT * FROM app.customers WHERE customer_id = $1`, [co.customer_id])
    const c = cr.rows[0]
    if (c) {
      out.has.customer = true
      out.customerName = c.full_name || ''
      const _np = String(c.full_name || '').trim().split(/\s+/).filter(Boolean)
      out.customer = {
        // priority: agent-override -> Meta exact -> full_name split
        first_name: c.extra?.first_name || metaFirst || _np[0] || '',
        last_name: c.extra?.last_name || metaLast || _np.slice(1).join(' ') || '',
        business_name: c.company || '', email: c.email || '',
        company_phone: c.extra?.company_phone || '',
        mobile_number: c.phone || '', phone: c.phone || '',
        whatsapp: c.extra?.whatsapp || '',
        preferred_language: c.language_preference || '',
        preferred_channel: c.extra?.preferred_channel || '',
        segment: c.customer_segment || '', loyalty_tier: c.tier || '',
        cust_status: c.status || '',
        tax_exempt: c.extra?.tax_exempt ?? false,
        customer_notes: c.extra?.customer_notes || '',
        shipping_address: c.extra?.shipping_address || {},
        billing_address: c.extra?.billing_address || {},
      }
    }
  }
  // Customer row abhi na bhi ho to bhi naam Meta/conversation se dikhao (exact).
  if (!out.customer.first_name) {
    const parts = String(memConv?.name || '').trim().split(/\s+/).filter(Boolean)
    out.customer.first_name = metaFirst || parts[0] || ''
    out.customer.last_name = out.customer.last_name || metaLast || parts.slice(1).join(' ') || ''
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
  // SALES ORDER (by conversation) — fields + order_lines rows.
  {
    const or = await findOrder(co)
    if (or) {
      out.has.order = true
      const lr = await dbQuery(`SELECT sku, product, qty, unit_price, total FROM app.order_lines WHERE order_id = $1 ORDER BY line_id`, [or.order_id])
      out.order = {
        order_number: or.order_number || '',
        order_products: or.products || '',
        order_items_count: or.items_count ?? '',
        order_total: or.total_amount ?? '',
        order_currency: or.currency || 'USD',
        order_status: or.order_status || '',
        payment_status: or.payment_status || '',
        order_deadline: dstr(or.deadline),
        production_partner: or.production_partner || '',
        order_summary: or.order_summary || '',
        order_instructions: or.special_instructions || '',
        order_lines: lr.rows.map((x) => ({ sku: x.sku || '', product: x.product || '', qty: x.qty ?? '', unit_price: x.unit_price ?? '', total: x.total ?? '' })),
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
    "lead_summary": one short sentence describing what the lead needs or "",
    "estimated_value": order/deal value in numbers if any price was discussed, else ""
  },
  "customer": {
    "business_name": customer's company/brand name or "",
    "email": customer's OWN email or "",
    "company_phone": customer's business/office phone or "",
    "mobile_number": customer's mobile/cell phone or "",
    "whatsapp": customer's WhatsApp number or "",
    "preferred_language": one of ["English","Spanish","French","Arabic","Urdu","Portuguese","Other"] or "",
    "preferred_channel": one of ["WhatsApp","Facebook","Instagram","Email","Phone"] or "",
    "segment": one of ["Event Customer","Reseller","Wholesale","Individual","Business"] or "",
    "tax_exempt": true only if the customer explicitly says they are tax exempt, else false,
    "shipping_address": { "line1":"", "line2":"", "city":"", "state":"", "zip":"", "country":"" },
    "billing_address": { "line1":"", "line2":"", "city":"", "state":"", "zip":"", "country":"" }
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
    "special_instructions": "",
    "artwork_required": true if the customer needs a design made / doesn't have print-ready art, false if they already have/sent artwork, else false,
    "artwork_status": one of ["Missing","Received","In Review","Changes Required","Approved"] or "",
    "artwork_instructions": customer's design/artwork wishes in their words or ""
  },
  "shipping": {
    "shipping_method": one of ["Standard","Express","Pickup"] or "",
    "is_rush_order": true or false,
    "required_delivery_date": "YYYY-MM-DD" or "",
    "event_date": "YYYY-MM-DD" or "",
    "delivery_instructions": "",
    "estimated_shipping_cost": number if a shipping cost was quoted/agreed, else ""
  },
  "quote": {
    "line_items": [ { "item_type":"garment|printing|shipping", "item_name":"", "quantity":0, "unit_price":0, "amount":0 } ],
    "quote_notes": "",
    "currency": one of ["USD","PKR","EUR","GBP"] or "",
    "discount": number if a discount was given, else "",
    "subtotal": number or "", "shipping_charges": number or "", "grand_total": number or ""
  },
  "order": {
    "order_products": short text of what was ordered or "",
    "order_items_count": total units ordered as a number or "",
    "order_total": final agreed order total in numbers or "",
    "order_currency": one of ["USD","PKR","EUR","GBP"] or "",
    "payment_status": one of ["pending","partial","paid"] or "",
    "order_deadline": "YYYY-MM-DD" required completion/delivery date or "",
    "order_summary": one short sentence summarising the confirmed order or "",
    "order_instructions": any special order instructions or "",
    "order_lines": [ { "sku":"", "product":"", "qty":0, "unit_price":0 } ]
  }
}

Rules:
- Extract ONLY the CUSTOMER's own details. NEVER extract the shop's/agent's own email/phone/address.
- Sum of size_breakdown quantities should equal total_quantity when both are known.
- required_delivery_date: only if the customer states an actual delivery deadline. If they only mention an EVENT date, fill event_date and leave required_delivery_date "".
- Dates: use "Today's date" above as reference to resolve relative terms ("this Friday", "next week") to a real YYYY-MM-DD. If a date cannot be resolved, leave it "".
- The customer's shipping address goes ONLY in customer.shipping_address; billing_address ONLY if it clearly differs from shipping (else leave it all "").
- ORDER section: fill it ONLY if the customer has CONFIRMED / placed an order (agreed to buy). If it is still just an inquiry or a quote-in-progress, return "" / [] / no order fields. payment_status "paid"/"partial" only if payment was actually confirmed.
- currency: infer "USD" from a "$" sign if a currency is implied but not named.
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
  const today = new Date().toISOString().slice(0, 10)
  const user = `Today's date: ${today}\nCustomer name: ${conv?.name || 'Unknown'}\nChannel: ${conv?.channel || ''}\n\nConversation transcript (oldest to newest):\n${transcript}`
  const fields = await chatJSON(EXTRACT_SYSTEM, user)   // gpt-4o-mini: fast + reliable; structured extraction ke liye accurate enough
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
    customer_responded: msgs.some((m) => m.direction === 'in' || m.dir === 'in'),
    human_engaged: msgs.some((m) => m.direction === 'out' || m.dir === 'out'),
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
    mockup_requested: /mockup/i.test([P.artwork_status, P.special_instructions, P.designer_notes].filter(Boolean).join(' ')),
  }
  let score = 0
  const breakdown = QUAL_CRITERIA.map((c) => { const g = !!got[c.key]; if (g) score += c.pts; return { key: c.key, label: c.label, points: c.pts, got: g } })
  score = Math.min(100, score)
  return { score, band: scoreBand(score), breakdown, facts: got }
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

const stableUuidFromText = (text) => {
  const h = createHash('md5').update(String(text)).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

const publicSource = (channel) => ({
  Facebook: 'Facebook Messenger',
  Instagram: 'Instagram',
  WhatsApp: 'WhatsApp',
  Email: 'Email',
  Phone: 'Phone',
}[channel] || 'Facebook Messenger')

const publicStage = (stage) => ({
  Qualification: 'initiated',
  Contacted: 'initiated',
  Proposal: 'quotation',
  Negotiation: 'payment',
  Won: 'confirmed',
  Lost: 'initiated',
}[stage] || 'initiated')

const addressText = (address) => {
  if (!address || typeof address !== 'object') return address || null
  const parts = [
    address.street || address.address || address.line1,
    address.line2,
    address.city,
    address.state,
    address.zip || address.postcode,
    address.country,
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

// Submit / Complete: copy the reviewed CRM bundle into the Decoinks lead workspace.
// All three writes are one PostgreSQL statement, so the dashboard never sees a
// half-synced lead. The deterministic IDs make retries and later edits idempotent.
export async function completeLead(conversationId) {
  const co = await resolveIds(conversationId)
  if (!co) { const e = new Error('Conversation not found in DB'); e.status = 404; throw e }

  const bundle = await getLeadBundle(conversationId)
  const score = computeQualification(conversationId, bundle)
  const lead = bundle.lead || {}
  const customer = bundle.customer || {}
  const product = bundle.product || {}
  const shipping = bundle.shipping || {}
  const conv = findById('conversations', conversationId)
  const legacyId = co.legacy_id || String(conversationId)
  const leadId = stableUuidFromText(`crm:${legacyId}`)
  const productId = stableUuidFromText(`crm-product:${legacyId}`)
  const customerId = stableUuidFromText(`crm-customer:${co.customer_id || legacyId}`)
  const customerNumber = `CUST-CRM-${createHash('md5').update(String(co.customer_id || legacyId)).digest('hex').slice(0, 10).toUpperCase()}`
  const leadNumber = `CRM-${String(legacyId).replace(/[^a-zA-Z0-9]/g, '-').slice(0, 24)}`
  const intentScore = Math.max(0, Math.min(100, Number(bundle.ai?.intent_score ?? score.score) || 0))
  const temperature = bundle.ai?.temperature || deriveTemperature(intentScore, lead.purchase_intent || '')
  const sizes = Array.isArray(product.size_breakdown)
    ? product.size_breakdown.map((x) => [x.size, x.qty ?? x.quantity].filter((v) => v !== undefined && v !== '').join(': ')).filter(Boolean).join(', ')
    : null
  const colors = [product.garment_color, product.brand_style].filter(Boolean).join(', ') || null
  const artworkReceived = /received|review|approved|changes/i.test(product.artwork_status || '')
  const shippingAddress = addressText(customer.shipping_address)
  const billingAddress = addressText(customer.billing_address)
  const customerName = bundle.customerName || [customer.first_name, customer.last_name].filter(Boolean).join(' ') || conv?.name || 'Unknown'
  const customerStatus = ['prospect', 'active', 'inactive', 'blocked', 'archived'].includes(String(customer.cust_status || '').toLowerCase())
    ? String(customer.cust_status).toLowerCase()
    : 'prospect'

  const client = await getClient()
  let rows
  try {
    await client.query('BEGIN')
    ;({ rows } = await client.query(
    `WITH synced_lead AS (
       INSERT INTO public.leads (
         id, lead_number, display_number, source, description, stage, status, customer_name,
         supplier_name, company_name, email, phone, communication_channel,
         country, state, city, zip, shipping_address, billing_address, buyer_type,
         conversion_score, estimated_value, urgency, customer_intent, internal_notes,
         product_interest, has_artwork, delivery_date, priority,
         conversation_primary_id, last_message, message_count, created_at, updated_at
       ) VALUES (
         $1::uuid,$2,('CRM-' || left(replace($1::text,'-',''),12)),$3,$4,$5,'New',$6,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
         $18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,now(),now()
       )
       ON CONFLICT (id) DO UPDATE SET
         source=EXCLUDED.source,
         description=COALESCE(NULLIF(EXCLUDED.description,''),public.leads.description),
         stage=EXCLUDED.stage,
         customer_name=COALESCE(NULLIF(EXCLUDED.customer_name,''),public.leads.customer_name),
         supplier_name=COALESCE(NULLIF(EXCLUDED.supplier_name,''),public.leads.supplier_name),
         company_name=COALESCE(NULLIF(EXCLUDED.company_name,''),public.leads.company_name),
         email=COALESCE(NULLIF(EXCLUDED.email,''),public.leads.email),
         phone=COALESCE(NULLIF(EXCLUDED.phone,''),public.leads.phone),
         communication_channel=EXCLUDED.communication_channel,
         country=COALESCE(NULLIF(EXCLUDED.country,''),public.leads.country),
         state=COALESCE(NULLIF(EXCLUDED.state,''),public.leads.state),
         city=COALESCE(NULLIF(EXCLUDED.city,''),public.leads.city),
         zip=COALESCE(NULLIF(EXCLUDED.zip,''),public.leads.zip),
         shipping_address=COALESCE(NULLIF(EXCLUDED.shipping_address,''),public.leads.shipping_address),
         billing_address=COALESCE(NULLIF(EXCLUDED.billing_address,''),public.leads.billing_address),
         buyer_type=COALESCE(NULLIF(EXCLUDED.buyer_type,''),public.leads.buyer_type),
         conversion_score=EXCLUDED.conversion_score,
         estimated_value=COALESCE(EXCLUDED.estimated_value,public.leads.estimated_value),
         urgency=EXCLUDED.urgency,
         customer_intent=COALESCE(NULLIF(EXCLUDED.customer_intent,''),public.leads.customer_intent),
         internal_notes=COALESCE(NULLIF(EXCLUDED.internal_notes,''),public.leads.internal_notes),
         product_interest=COALESCE(NULLIF(EXCLUDED.product_interest,''),public.leads.product_interest),
         has_artwork=EXCLUDED.has_artwork,
         delivery_date=COALESCE(EXCLUDED.delivery_date,public.leads.delivery_date),
         priority=COALESCE(NULLIF(EXCLUDED.priority,''),public.leads.priority),
         conversation_primary_id=EXCLUDED.conversation_primary_id,
         last_message=COALESCE(NULLIF(EXCLUDED.last_message,''),public.leads.last_message),
         message_count=EXCLUDED.message_count,
         updated_at=now()
       RETURNING id
     ), customer_target AS (
       SELECT c.id
         FROM public.customers c
         JOIN synced_lead sl ON true
        WHERE c.deleted_at IS NULL
          AND (
            c.lead_id = sl.id
            OR c.id = (SELECT customer_id FROM public.leads WHERE id = sl.id)
            OR ($51::text IS NOT NULL AND lower(c.email) = lower($51::text))
          )
        ORDER BY (c.lead_id = sl.id) DESC, c.created_at
        LIMIT 1
     ), updated_customer AS (
       UPDATE public.customers c SET
         lead_id=sl.id,
         name=COALESCE(NULLIF($48,''),c.name),
         first_name=COALESCE(NULLIF($49,''),c.first_name),
         last_name=COALESCE(NULLIF($50,''),c.last_name),
         company=COALESCE(NULLIF($52,''),c.company),
         company_name=COALESCE(NULLIF($52,''),c.company_name),
         email=CASE
           WHEN NULLIF($51,'') IS NULL THEN c.email
           WHEN EXISTS (
             SELECT 1 FROM public.customers other
              WHERE other.id<>c.id AND other.deleted_at IS NULL
                AND lower(other.email)=lower($51)
           ) THEN c.email
           ELSE $51
         END,
         company_phone_number=COALESCE(NULLIF($53,''),c.company_phone_number),
         mobile_number=COALESCE(NULLIF($54,''),c.mobile_number),
         phone=COALESCE(NULLIF($54,''),c.phone),
         whatsapp=COALESCE(NULLIF($55,''),c.whatsapp),
         preferred_language=COALESCE(NULLIF($56,''),c.preferred_language),
         customer_segment=COALESCE(NULLIF($57,''),c.customer_segment),
         tier=COALESCE(NULLIF($58,''),c.tier),
         status=$59,
         internal_notes=COALESCE(NULLIF($60,''),c.internal_notes),
         address_line1=COALESCE(NULLIF($61,''),c.address_line1),
         billing_address=COALESCE(NULLIF($62,''),c.billing_address),
         source='Technocas CRM',
         updated_at=now()
       FROM synced_lead sl
       WHERE c.id=(SELECT id FROM customer_target)
       RETURNING c.id
     ), inserted_customer AS (
       INSERT INTO public.customers
         (id,customer_number,lead_id,name,first_name,last_name,company,company_name,email,
          company_phone_number,mobile_number,phone,whatsapp,preferred_language,
          customer_segment,tier,status,internal_notes,address_line1,billing_address,source)
       SELECT $46,$47,sl.id,$48,NULLIF($49,''),NULLIF($50,''),NULLIF($52,''),NULLIF($52,''),
              NULLIF($51,''),NULLIF($53,''),NULLIF($54,''),NULLIF($54,''),NULLIF($55,''),
              COALESCE(NULLIF($56,''),'en'),NULLIF($57,''),NULLIF($58,''),$59,
              NULLIF($60,''),NULLIF($61,''),NULLIF($62,''),'Technocas CRM'
         FROM synced_lead sl
        WHERE NOT EXISTS (SELECT 1 FROM customer_target)
       ON CONFLICT (id) DO UPDATE SET
         lead_id=EXCLUDED.lead_id,
         name=COALESCE(NULLIF(EXCLUDED.name,''),public.customers.name),
         first_name=COALESCE(EXCLUDED.first_name,public.customers.first_name),
         last_name=COALESCE(EXCLUDED.last_name,public.customers.last_name),
         company=COALESCE(EXCLUDED.company,public.customers.company),
         company_name=COALESCE(EXCLUDED.company_name,public.customers.company_name),
         email=COALESCE(EXCLUDED.email,public.customers.email),
         company_phone_number=COALESCE(EXCLUDED.company_phone_number,public.customers.company_phone_number),
         mobile_number=COALESCE(EXCLUDED.mobile_number,public.customers.mobile_number),
         phone=COALESCE(EXCLUDED.phone,public.customers.phone),
         whatsapp=COALESCE(EXCLUDED.whatsapp,public.customers.whatsapp),
         preferred_language=COALESCE(EXCLUDED.preferred_language,public.customers.preferred_language),
         customer_segment=COALESCE(EXCLUDED.customer_segment,public.customers.customer_segment),
         tier=COALESCE(EXCLUDED.tier,public.customers.tier),
         status=EXCLUDED.status,
         internal_notes=COALESCE(EXCLUDED.internal_notes,public.customers.internal_notes),
         address_line1=COALESCE(EXCLUDED.address_line1,public.customers.address_line1),
         billing_address=COALESCE(EXCLUDED.billing_address,public.customers.billing_address),
         source='Technocas CRM',
         updated_at=now()
       RETURNING id
     ), synced_customer AS (
       SELECT id FROM updated_customer
       UNION ALL
       SELECT id FROM inserted_customer
     ), synced_product AS (
       INSERT INTO public.lead_product_interest
         (id,lead_id,product_type,qty,sizes,colors,artwork_count,notes,sort_order)
       SELECT $30,id,$23,$31,$32,$33,$34,$35,0 FROM synced_lead
       ON CONFLICT (id) DO UPDATE SET
         product_type=EXCLUDED.product_type,qty=EXCLUDED.qty,sizes=EXCLUDED.sizes,
         colors=EXCLUDED.colors,artwork_count=EXCLUDED.artwork_count,notes=EXCLUDED.notes
     )
     , synced_qualification AS (
     INSERT INTO public.lead_qualifications
       (lead_id,sizes_received,artwork_received,delivery_date_confirmed,
        shipping_address_confirmed,budget_confirmed,payment_method_pref,info_completeness_score,
        customer_responded,human_engaged,product_identified,quantity_discussed,
        quote_requested,mockup_requested)
     SELECT id,$36,$24,$37,$38,$39,NULL,$18,$40,$41,$42,$43,$44,$45 FROM synced_lead
     ON CONFLICT (lead_id) DO UPDATE SET
       sizes_received=EXCLUDED.sizes_received,artwork_received=EXCLUDED.artwork_received,
       delivery_date_confirmed=EXCLUDED.delivery_date_confirmed,
       shipping_address_confirmed=EXCLUDED.shipping_address_confirmed,
       budget_confirmed=EXCLUDED.budget_confirmed,
       info_completeness_score=EXCLUDED.info_completeness_score,
       customer_responded=EXCLUDED.customer_responded,human_engaged=EXCLUDED.human_engaged,
       product_identified=EXCLUDED.product_identified,quantity_discussed=EXCLUDED.quantity_discussed,
       quote_requested=EXCLUDED.quote_requested,mockup_requested=EXCLUDED.mockup_requested,
       updated_at=now()
     RETURNING lead_id
     )
     SELECT sq.lead_id, sc.id AS customer_id
       FROM synced_customer sc, synced_qualification sq`,
    [
      leadId, leadNumber, publicSource(co.channel || conv?.channel), lead.lead_summary || '',
      publicStage(lead.stage), bundle.customerName || conv?.name || 'Unknown',
      customer.business_name || null, customer.email || null, customer.phone || null,
      co.channel || conv?.channel || 'CRM', shipping.shipping_country || null,
      shipping.shipping_state || null, shipping.shipping_city || null,
      shipping.shipping_postcode || null, shippingAddress, billingAddress,
      customer.segment || null, intentScore, lead.estimated_value || null, temperature,
      lead.purchase_intent || null, lead.internal_notes || null, product.product_type || null,
      artworkReceived, shipping.required_delivery_date || null,
      String(lead.priority || 'medium').toLowerCase(), co.conversation_id,
      conv?.list_preview || '', Number(conv?.message_count || conv?.total_messages || 0),
      productId, product.total_quantity || null, sizes, colors,
      artworkReceived ? 1 : 0,
      [product.print_method, product.print_locations?.join?.(', '), product.special_instructions].filter(Boolean).join(' · ') || null,
      Array.isArray(product.size_breakdown) && product.size_breakdown.length > 0,
      !!(shipping.required_delivery_date || shipping.event_date),
      !!(shippingAddress || shipping.shipping_postcode),
      nonEmpty(bundle.quote?.grand_total),
      !!score.facts.customer_responded, !!score.facts.human_engaged,
      !!score.facts.product, !!score.facts.quantity, !!score.facts.quote,
      !!score.facts.mockup_requested,
      customerId, customerNumber, customerName,
      customer.first_name || null, customer.last_name || null, customer.email || null,
      customer.business_name || null, customer.company_phone || null,
      customer.mobile_number || customer.phone || null, customer.whatsapp || null,
      customer.preferred_language || null, customer.segment || null,
      customer.loyalty_tier || null, customerStatus, customer.customer_notes || null,
      shippingAddress, billingAddress,
    ]))
    if (!rows[0]) throw new Error('Customer sync produced no linked record')
    await client.query(
      `UPDATE public.leads SET customer_id=$1, updated_at=now() WHERE id=$2`,
      [rows[0].customer_id, rows[0].lead_id]
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }

  return { ok: true, completed: true, lead_id: rows[0]?.lead_id || leadId, qualification: score, intent_score: intentScore, temperature }
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
