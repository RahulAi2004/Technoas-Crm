// ============================================================
// Quotation / Invoice / Sales Order — Lead Panel se hi "generate" karo.
//
// NUMBERING bilkul Decoinks jaisa hai: wahi shared `public.counters` table + advisory lock
// (Decoinks ke backend/src/utils/counter.js ka same algorithm), isliye Technocas ka diya number
// Decoinks ke number se kabhi clash nahi karega.
//   Quotation   -> QT-YYYY-NNNN
//   Sales Order -> ORD-YYYY-NNNN
//   Invoice     -> CUSTOMERNAME-NNNN   (Decoinks getNextInvoiceNumber jaisa)
//
// STORAGE: document Technocas ke apne panel-store me hi save hota hai — numbers/totals normal
// panel fields ki tarah saveField() se jaate hain, isliye VALIDATION_MODE on ho ya off, values
// wahin jaati hain jahan panel ka baaki data ja raha hai. Decoinks ki tables ko koi write nahi.
// ============================================================
import { getClient } from './db.js'
import { getLeadBundle, saveField, quoteRowToInvoiceRow } from './lead-panel.js'

const num = (v) => {
  if (v === '' || v == null) return 0
  const n = Number(String(v).replace(/[$,\s]/g, ''))
  return Number.isNaN(n) ? 0 : n
}
const has = (v) => v != null && v !== ''
const money = (n) => Math.round(n * 100) / 100
const todayISO = () => new Date().toISOString().slice(0, 10)
const plusDays = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10)
const lineAmount = (r) => has(r.amount) ? num(r.amount) : Math.max(num(r.qty ?? r.quantity) * num(r.unit_price) - num(r.discount), 0)

// ---- Decoinks counter (public.counters high-water mark) ----------------------
async function claimNext(client, scope, seed) {
  await client.query(`INSERT INTO public.counters (scope) VALUES ($1) ON CONFLICT (scope) DO NOTHING`, [scope])
  const { rows } = await client.query(
    `UPDATE public.counters SET last_value = GREATEST(last_value, $2) + 1, updated_at = now()
      WHERE scope = $1 RETURNING last_value`, [scope, seed])
  return Number(rows[0].last_value)
}

// Seed guard: jo number pehle se maujood hain (Decoinks ki table + hamari apni), unse aage se shuru.
async function seedFrom(client, seeds, pattern) {
  let seed = 0
  for (const sql of seeds) {
    try {
      const r = await client.query(sql, [pattern])
      seed = Math.max(seed, Number(r.rows[0]?.max_seq) || 0)
    } catch (e) { console.warn('[documents] seed skipped:', e.message) }
  }
  return seed
}

// PREFIX-YYYY-NNNN (QT / ORD)
async function nextSeriesNumber(prefix, seeds) {
  const scope = `${prefix}-${new Date().getFullYear()}`
  const client = await getClient()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [scope])
    const seed = await seedFrom(client, seeds, `^${scope}-[0-9]+$`)
    const next = await claimNext(client, scope, seed)
    await client.query('COMMIT')
    return `${scope}-${String(next).padStart(4, '0')}`
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e }
  finally { client.release() }
}

// Decoinks buildInvoicePrefix ka same behaviour: "John Smith" -> JOHNSMITH
function invoicePrefix(customerName) {
  const cleaned = String(customerName || '').trim().toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9 ]/g, '')
    .split(/\s+/).filter(Boolean).slice(0, 2).join('').slice(0, 12)
  return cleaned || 'CUST'
}

// CUSTOMERNAME-NNNN
async function nextInvoiceNumber(customerName) {
  const prefix = invoicePrefix(customerName)
  const scope = `INV:${prefix}`
  const client = await getClient()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [scope])
    const seed = await seedFrom(client, [
      `SELECT COALESCE(MAX(CAST(SPLIT_PART(invoice_number, '-', 2) AS INTEGER)), 0) AS max_seq
         FROM public.invoices WHERE invoice_number ~ $1`,
      `SELECT COALESCE(MAX(CAST(SPLIT_PART(extra->>'invoice_number', '-', 2) AS INTEGER)), 0) AS max_seq
         FROM app.leads WHERE extra->>'invoice_number' ~ $1`,
    ], `^${prefix}-[0-9]+$`)
    const next = await claimNext(client, scope, seed)
    await client.query('COMMIT')
    return `${prefix}-${String(next).padStart(4, '0')}`
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e }
  finally { client.release() }
}

export const nextQuoteNumber = () => nextSeriesNumber('QT', [
  `SELECT COALESCE(MAX(CAST(SPLIT_PART(quote_number, '-', 3) AS INTEGER)), 0) AS max_seq FROM public.quotations WHERE quote_number ~ $1`,
  `SELECT COALESCE(MAX(CAST(SPLIT_PART(quote_number, '-', 3) AS INTEGER)), 0) AS max_seq FROM app.quotes WHERE quote_number ~ $1`,
])
export const nextOrderNumber = () => nextSeriesNumber('ORD', [
  `SELECT COALESCE(MAX(CAST(SPLIT_PART(order_number, '-', 3) AS INTEGER)), 0) AS max_seq FROM public.orders WHERE order_number ~ $1`,
  `SELECT COALESCE(MAX(CAST(SPLIT_PART(order_number, '-', 3) AS INTEGER)), 0) AS max_seq FROM app.orders WHERE order_number ~ $1`,
])

// ---- Generate -----------------------------------------------------------------
const KINDS = { quotation: 'Quotation', invoice: 'Invoice', order: 'Sales Order' }

/**
 * Ek document generate karta hai: number claim + derived totals/dates, sab panel fields ki
 * tarah save. Idempotent — number pehle se hai to wahi wapas (dobara claim nahi hota).
 * Sirf KHAALI fields bhare jaate hain; agent ne jo khud set kiya wo kabhi overwrite nahi hota.
 */
export async function generateDocument({ conversationId, kind, convName, actor = '' }) {
  if (!KINDS[kind]) { const e = new Error('Unknown document type: ' + kind); e.status = 400; throw e }
  const bundle = await getLeadBundle(conversationId)
  const Q = bundle.quote || {}, I = bundle.invoice || {}, O = bundle.order || {}, C = bundle.customer || {}
  const custName = bundle.customerName
    || [C.first_name, C.last_name].filter(Boolean).join(' ')
    || C.business_name || convName || ''

  const fields = {}   // field -> value (sirf yahi save honge)
  const put = (k, v, cur) => { if (has(v) && !has(cur)) fields[k] = v }
  let number = ''

  if (kind === 'quotation') {
    const items = Array.isArray(Q.line_items) ? Q.line_items : []
    if (!items.length) { const e = new Error('Add at least one Quote Item before generating the quotation'); e.status = 400; throw e }
    const subtotal = money(items.reduce((s, r) => s + lineAmount(r), 0))
    const total = money(subtotal + num(Q.shipping_charges) + num(Q.quote_tax) + num(Q.quote_rush_services) - num(Q.discount))
    number = has(Q.quote_number) ? Q.quote_number : await nextQuoteNumber()
    put('quote_number', number, Q.quote_number)
    put('quote_date', todayISO(), Q.quote_date)
    put('valid_until', plusDays(7), Q.valid_until)     // Decoinks new-quotation default: 7 days validity
    put('quote_status', 'Draft', Q.quote_status)
    put('currency', 'USD', Q.currency)
    put('subtotal', subtotal, Q.subtotal)
    put('grand_total', total, Q.grand_total)
    put('sales_agent', actor, Q.sales_agent)          // Decoinks quote header ka SALES AGENT
  }

  if (kind === 'invoice') {
    const items = Array.isArray(I.invoice_lines) ? I.invoice_lines : []
    if (!items.length) { const e = new Error('Add at least one Invoice Item before generating the invoice'); e.status = 400; throw e }
    const subtotal = money(items.reduce((s, r) => s + lineAmount(r), 0))
    const total = money(subtotal + num(I.invoice_shipping) + num(I.invoice_tax) - num(I.invoice_discount))
    number = has(I.invoice_number) ? I.invoice_number : await nextInvoiceNumber(custName)
    put('invoice_number', number, I.invoice_number)
    put('invoice_date', todayISO(), I.invoice_date)
    put('invoice_status', 'Draft', I.invoice_status)
    put('invoice_currency', 'USD', I.invoice_currency)
    put('invoice_subtotal', subtotal, I.invoice_subtotal)
    put('invoice_total', total, I.invoice_total)
    put('balance_due', money(Math.max(total - num(I.amount_paid), 0)), I.balance_due)
  }

  if (kind === 'order') {
    // Sales order apni alag items maintain nahi karta — Invoice ki rows (ya seedha Quote ki
    // rows) hi order lines ban jaati hain, isliye kuch dobara type nahi karna padta.
    const src = [O.order_lines, I.invoice_lines, Q.line_items].find((a) => Array.isArray(a) && a.length) || []
    if (!src.length) { const e = new Error('Add Invoice (or Quote) items first — the sales order takes its lines from there'); e.status = 400; throw e }
    const lines = src.map(quoteRowToInvoiceRow)
    const total = money(lines.reduce((s, r) => s + lineAmount(r), 0))
    const count = lines.reduce((s, r) => s + num(r.qty ?? r.quantity), 0)
    const orderType = lines.find((r) => r.order_type)?.order_type || 'apparel'
    const products = [...new Set(lines.map((r) => r.product || r.description).filter(Boolean))].join(', ').slice(0, 250)
    // ORD-XXXXXX (purana random format) ko bhi naye series number se replace karo.
    const proper = /^ORD-\d{4}-\d{4}$/.test(String(O.order_number || ''))
    number = proper ? O.order_number : await nextOrderNumber()
    if (!proper) fields.order_number = number
    if (!(Array.isArray(O.order_lines) && O.order_lines.length)) fields.order_lines = lines
    put('order_type', orderType, O.order_type)         // Decoinks orders.order_type (NOT NULL)
    put('order_products', products, O.order_products)
    put('order_status', 'pending', O.order_status)
    put('payment_status', 'pending', O.payment_status)
    put('order_currency', I.invoice_currency || Q.currency || 'USD', O.order_currency)
    put('order_items_count', count, O.order_items_count)
    put('order_total', total, O.order_total)
  }

  const saved = {}
  const failed = []
  for (const [field, value] of Object.entries(fields)) {
    try {
      const r = await saveField({ conversationId, field, value, convName })
      if (r?.saved) saved[field] = value
    } catch (e) { failed.push(`${field}: ${e.message}`) }
  }
  return { ok: true, kind, label: KINDS[kind], number, fields: saved, failed }
}

// Kaunse documents pehle se bane hue hain (panel ke header chips ke liye).
export async function documentStatus(conversationId) {
  const b = await getLeadBundle(conversationId)
  return {
    quotation: b.quote?.quote_number || '',
    invoice: b.invoice?.invoice_number || '',
    order: b.order?.order_number || '',
  }
}
