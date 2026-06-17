// One-time: read every conversation, extract order amount + payment status + products
// via AI, and populate customers.spend/orders/payment_status + orders + payments tables.
import pg from 'pg'
import { chatJSON } from './ai.js'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 15000, query_timeout: 30000, statement_timeout: 30000 })
async function pMap(items, fn, limit) {
  const ret = []; let i = 0
  await Promise.all(Array.from({ length: limit }, async () => {
    while (i < items.length) { const idx = i++; try { ret[idx] = await fn(items[idx], idx) } catch { ret[idx] = null } }
  }))
  return ret
}
async function upsert(table, rows) {
  for (let i = 0; i < rows.length; i += 50) {
    const slice = rows.slice(i, i + 50)
    const vals = [], params = []
    slice.forEach((r, j) => { params.push(String(r.id), JSON.stringify(r)); vals.push(`($${j * 2 + 1}, $${j * 2 + 2}::jsonb)`) })
    await pool.query(`INSERT INTO "${table}" (id, doc) VALUES ${vals.join(',')} ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()`, params)
  }
}

const convs = (await pool.query('SELECT doc FROM conversations')).rows.map((r) => r.doc)
const msgs = (await pool.query('SELECT doc FROM messages')).rows.map((r) => r.doc)
const custs = (await pool.query('SELECT doc FROM customers')).rows.map((r) => r.doc)
const byConv = {}; for (const m of msgs) (byConv[m.conversation_id] ||= []).push(m)
const custByConv = {}; for (const c of custs) if (c.conversation_id) custByConv[c.conversation_id] = c
console.log(`conversations: ${convs.length}, messages: ${msgs.length}, customers: ${custs.length}`)

const SYS = `From this custom apparel print-shop conversation, extract ORDER & PAYMENT info. Use the actual numbers mentioned in the chat. Respond with ONLY JSON:
{
 "orderTotal": number,            // total agreed/quoted price in USD (0 if no price was discussed)
 "paymentStatus": "paid"|"pending"|"none",   // paid = customer confirmed/sent payment; pending = price agreed but not paid; none = no order/price
 "products": string,              // short description of what they want/ordered (e.g. "50 DTF transfers")
 "itemsCount": number             // total quantity of items (0 if unknown)
}`

console.log('Extracting from each conversation (AI)…')
const results = await pMap(convs, async (conv) => {
  const cm = (byConv[conv.id] || []).filter((m) => m.dir === 'in' || m.dir === 'out' && m.text)
  if (!cm.length) return null
  const transcript = cm.map((m) => `${m.dir === 'in' ? 'Customer' : 'Agent'}: ${m.text}`).join('\n').slice(0, 8000)
  try { const out = await chatJSON(SYS, transcript); return { conv, out } } catch { return null }
}, 6)

let seq = 0, withOrder = 0, paid = 0
const customerUpserts = [], orderUpserts = [], paymentUpserts = []
const now = new Date()
const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
for (const r of results.filter(Boolean)) {
  const { conv, out } = r
  const total = Math.max(0, Math.round(Number(out.orderTotal) || 0))
  const pay = ['paid', 'pending', 'none'].includes(out.paymentStatus) ? out.paymentStatus : 'none'
  const existing = custByConv[conv.id] || { id: `cust:${conv.id}`, conversation_id: conv.id, name: conv.name, company: conv.company || '', channel: conv.channel || 'Meta', initials: conv.initials || '', avatar: conv.avatar_bg || 'bg-brand-100 text-brand-700', tier: 'Bronze', type: 'Lead', owner: '', role: '', loc: '', source_type: 'meta', created_at: conv.created_at }
  customerUpserts.push({ ...existing, spend: total, orders: total > 0 ? 1 : 0, payment_status: pay, products: out.products || '', tier: total >= 200 ? 'Gold' : total >= 100 ? 'Silver' : 'Bronze' })
  if (total > 0) {
    seq++; withOrder++
    orderUpserts.push({ id: `o:${conv.id}`, order_no: `ORD-${String(seq).padStart(4, '0')}`, customer: conv.name, conversation_id: conv.id, products: out.products || '', items: out.itemsCount || 0, total, status: pay === 'paid' ? 'Paid' : 'Pending', date: dateStr, created_at: now.toISOString() })
    if (pay === 'paid') { paid++; paymentUpserts.push({ id: `pay:${conv.id}`, invoice_no: `INV-${String(seq).padStart(4, '0')}`, order_no: `ORD-${String(seq).padStart(4, '0')}`, customer: conv.name, amount: total, status: 'Paid', date: dateStr, created_at: now.toISOString() }) }
  }
}

console.log(`Writing: ${customerUpserts.length} customers, ${orderUpserts.length} orders, ${paymentUpserts.length} payments…`)
await upsert('customers', customerUpserts)
await upsert('orders', orderUpserts)
await upsert('payments', paymentUpserts)
const totalSpend = customerUpserts.reduce((s, c) => s + (c.spend || 0), 0)
console.log(`\nDONE. ${withOrder} customers with an order · ${paid} paid · total spend $${totalSpend}`)
await pool.end(); process.exit(0)
