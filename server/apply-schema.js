// Apply app.* normalized schema + migrate data from the current public.* JSONB tables.
// Safe: additive (own "app" schema), idempotent (ON CONFLICT legacy_id). public.* untouched.
import pg from 'pg'
import fs from 'fs'
import path from 'path'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 15000, query_timeout: 90000, statement_timeout: 90000 })
const jget = async (t) => (await pool.query(`SELECT doc FROM ${t}`)).rows.map((r) => r.doc)
const ts = (v) => v || new Date().toISOString()

async function batchInsert(table, cols, rows, conflictCol, returning) {
  const out = []
  for (let i = 0; i < rows.length; i += 200) {
    const slice = rows.slice(i, i + 200)
    const vals = [], params = []
    slice.forEach((row, ri) => { vals.push('(' + row.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(',') + ')'); params.push(...row) })
    const setCols = cols.filter((c) => c !== conflictCol).map((c) => `${c}=EXCLUDED.${c}`).join(',')
    const q = `INSERT INTO ${table} (${cols.join(',')}) VALUES ${vals.join(',')} ON CONFLICT (${conflictCol}) DO UPDATE SET ${setCols}${returning ? ' RETURNING ' + returning : ''}`
    const r = await pool.query(q, params)
    if (returning) out.push(...r.rows)
  }
  return out
}

// 1) schema
await pool.query(fs.readFileSync(path.resolve(process.cwd(), 'schema.sql'), 'utf8'))
console.log('✓ schema applied (app.*)')

// 2) agents (from users)
const users = await jget('users')
const agentRows = users.map((u) => [String(u.id), u.name || 'Agent', (u.email || '').toLowerCase(), u.password_hash || null, u.role || 'agent', ts(u.created_at)])
const aRet = await batchInsert('app.agents', ['legacy_id', 'name', 'email', 'password_hash', 'role', 'created_at'], agentRows, 'legacy_id', 'legacy_id, agent_id')
const agentByLegacy = Object.fromEntries(aRet.map((r) => [r.legacy_id, r.agent_id]))
console.log(`✓ agents: ${aRet.length}`)

// 3) customers
const customers = await jget('customers')
const custRows = customers.map((c) => [String(c.id), c.name || 'Unknown', c.email || null, c.phone || null, c.company || null, (c.channel || '').toLowerCase() || null, c.tier || 'lead', c.spend || 0, c.orders || 0, c.payment_status || null, c.products || null, c.avatar || null, ts(c.created_at)])
const cRet = await batchInsert('app.customers', ['legacy_id', 'full_name', 'email', 'phone', 'company', 'platform_primary', 'tier', 'total_spent', 'total_orders', 'payment_status', 'products', 'avatar', 'created_at'], custRows, 'legacy_id', 'legacy_id, customer_id')
const custByLegacy = Object.fromEntries(cRet.map((r) => [r.legacy_id, r.customer_id]))
const custByConv = {}
for (const c of customers) if (c.conversation_id) custByConv[c.conversation_id] = custByLegacy[String(c.id)]
console.log(`✓ customers: ${cRet.length}`)

// 4) conversations
const convs = await jget('conversations')
const convRows = convs.map((c) => [String(c.id), c.meta_recipient_id || null, custByConv[c.id] || null, c.channel || null, c.status || 'open', c.unread || 0, !!c.bookmarked, c.name || null, c.list_preview || null, c.last_ts ? new Date(c.last_ts).toISOString() : ts(c.created_at), ts(c.created_at)])
const convRet = await batchInsert('app.conversations', ['legacy_id', 'meta_sender_id', 'customer_id', 'channel', 'status', 'unread', 'bookmarked', 'intent_primary', 'summary_preview', 'last_message_at', 'created_at'].filter((x) => x !== 'summary_preview'), convRows.map((r) => { const x = [...r]; x.splice(8, 1); return x }), 'legacy_id', 'legacy_id, conversation_id')
const convByLegacy = Object.fromEntries(convRet.map((r) => [r.legacy_id, r.conversation_id]))
console.log(`✓ conversations: ${convRet.length}`)

// 4b) orphan conversations — message threads that never got a conversation row (deep-sync)
const msgs = await jget('messages')
const orphan = [...new Set(msgs.map((m) => m.conversation_id).filter((cid) => cid && !convByLegacy[cid]))]
if (orphan.length) {
  const orphanRows = orphan.map((cid) => [String(cid), custByConv[cid] || null, cid.startsWith('ig:') ? 'Instagram' : cid.startsWith('fb:') ? 'Facebook' : 'Meta', 'open', ts()])
  const oRet = await batchInsert('app.conversations', ['legacy_id', 'customer_id', 'channel', 'status', 'created_at'], orphanRows, 'legacy_id', 'legacy_id, conversation_id')
  oRet.forEach((r) => { convByLegacy[r.legacy_id] = r.conversation_id })
  console.log(`✓ orphan conversations created: ${oRet.length}`)
}

// 5) messages
const msgRows = msgs.filter((m) => convByLegacy[m.conversation_id]).map((m) => [String(m.id), convByLegacy[m.conversation_id], m.dir === 'note' ? 'note' : m.dir === 'out' ? 'out' : 'in', m.dir === 'in' ? 'customer' : m.dir === 'out' ? 'agent' : 'system', m.text || '', (m.attachments && m.attachments.length) ? 'image' : 'text', JSON.stringify(m.attachments || []), m.category || null, m.time ? null : null, ts(m.created_at)])
await batchInsert('app.messages', ['legacy_id', 'conversation_id', 'direction', 'sender_type', 'body', 'message_type', 'attachments', 'category', 'intent', 'created_at'], msgRows, 'legacy_id')
console.log(`✓ messages: ${msgRows.length}`)

// 6) leads
const leads = await jget('leads')
const leadRows = leads.map((l) => [String(l.id), l.id ? `LD-${String(l.id).slice(-8)}` : null, custByConv[l.conversation_id] || null, convByLegacy[l.conversation_id] || null, l.pipeline || 'new_inquiry', l.status || 'New', l.source || null, l.score || 0, l.value || 0, agentByLegacy[String(l.agent)] || null, ts(l.created_at)])
await batchInsert('app.leads', ['legacy_id', 'lead_number', 'customer_id', 'conversation_id', 'stage', 'status', 'source', 'score_total', 'estimated_value', 'assigned_agent_id', 'created_at'], leadRows, 'legacy_id')
console.log(`✓ leads: ${leadRows.length}`)

// 7) orders
const orders = await jget('orders')
const ordRet = await batchInsert('app.orders', ['legacy_id', 'order_number', 'customer_id', 'conversation_id', 'products', 'items_count', 'total_amount', 'order_status', 'payment_status', 'created_at'],
  orders.map((o) => [String(o.id), o.order_no || null, custByConv[o.conversation_id] || null, convByLegacy[o.conversation_id] || null, o.products || null, o.items || 0, o.total || 0, (o.status || 'pending').toLowerCase(), o.status === 'Paid' ? 'paid' : 'pending', ts(o.created_at)]), 'legacy_id', 'legacy_id, order_id')
const orderByLegacy = Object.fromEntries(ordRet.map((r) => [r.legacy_id, r.order_id]))
console.log(`✓ orders: ${ordRet.length}`)

// 8) payments
const payments = await jget('payments')
const payRows = payments.map((p) => {
  const convId = String(p.id || '').startsWith('pay:') ? String(p.id).slice(4) : null
  return [String(p.id), p.invoice_no || null, convId ? orderByLegacy[`o:${convId}`] || null : null, convId ? custByConv[convId] || null : null, p.amount || 0, p.method || null, (p.status || 'completed').toLowerCase(), ts(p.created_at)]
})
await batchInsert('app.payments', ['legacy_id', 'invoice_number', 'order_id', 'customer_id', 'amount', 'method', 'status', 'created_at'], payRows, 'legacy_id')
console.log(`✓ payments: ${payRows.length}`)

// 9) notes (public.notes table)
const notes = await jget('notes')
if (notes.length) {
  await batchInsert('app.notes', ['legacy_id', 'related_type', 'customer_id', 'title', 'body', 'category', 'author', 'pinned', 'created_at'],
    notes.map((n) => [String(n.id), 'customer', custByLegacy[String(n.customer_id)] || null, n.title || null, n.body || '', n.category || 'internal', n.author || null, !!n.pinned, ts(n.created_at)]), 'legacy_id')
}
console.log(`✓ notes: ${notes.length}`)

// 10) artwork
const arts = await jget('artworks')
if (arts.length) {
  await batchInsert('app.artwork', ['legacy_id', 'design_name', 'artwork_type', 'status', 'created_at'],
    arts.map((a) => [String(a.id), a.name || null, a.type || null, 'draft', ts(a.created_at)]), 'legacy_id')
}
console.log(`✓ artwork: ${arts.length}`)

// 11) ai_chats
const chats = await jget('ai_chats')
if (chats.length) {
  await batchInsert('app.ai_chats', ['legacy_id', 'agent_id', 'title', 'messages', 'created_at', 'updated_at'],
    chats.map((c) => [String(c.id), agentByLegacy[String(c.user_id)] || null, c.title || 'Chat', JSON.stringify(c.messages || []), ts(c.created_at), ts(c.updated_at)]), 'legacy_id')
}
console.log(`✓ ai_chats: ${chats.length}`)

// summary
const counts = {}
for (const t of ['organizations', 'agents', 'customers', 'customer_channels', 'conversations', 'messages', 'leads', 'orders', 'payments', 'notes', 'artwork', 'ai_chats']) {
  counts[t] = (await pool.query(`SELECT count(*)::int n FROM app.${t}`)).rows[0].n
}
console.log('\nDONE. app.* row counts:', JSON.stringify(counts))
await pool.end(); process.exit(0)
