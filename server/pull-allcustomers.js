// PREP STEP: dump every customer + all their chats (with artwork URLs) to allcustomers.json.
// Two queries only (customers, then all messages grouped in JS). Run: node --env-file=.env pull-allcustomers.js
import pg from 'pg'
import fs from 'fs'
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 30000, query_timeout: 240000, statement_timeout: 240000 })
async function q(sql, tries = 8) {
  for (let i = 0; i < tries; i++) { try { return await pool.query(sql) } catch (e) { console.log(`retry ${i + 1}: ${e.message}`); await new Promise(r => setTimeout(r, 2500)) } }
  throw new Error('query failed')
}

// 1) all customers (SELECT * so we keep whatever columns exist)
const custs = (await q(`SELECT * FROM app.customers`)).rows
console.log('customers:', custs.length)

// 2) all messages with their owning customer (one shot), ordered
const msgs = (await q(`
  SELECT co.customer_id cid, m.conversation_id conv, m.direction dir, m.message_type mt,
         m.body, m.extra->'attachments'->0->>'url' img, to_char(m.created_at,'YYYY-MM-DD HH24:MI') ts
  FROM app.messages m JOIN app.conversations co ON co.conversation_id = m.conversation_id
  WHERE m.direction IN ('in','out') AND (m.body <> '' OR m.message_type = 'image')
  ORDER BY co.customer_id, m.conversation_id, m.created_at ASC`)).rows
console.log('messages:', msgs.length)

// group messages by customer -> conversation
const byCust = new Map()
for (const m of msgs) {
  if (!byCust.has(m.cid)) byCust.set(m.cid, new Map())
  const cm = byCust.get(m.cid)
  if (!cm.has(m.conv)) cm.set(m.conv, [])
  cm.get(m.conv).push({ dir: m.dir, mt: m.mt, body: m.body, img: m.img, ts: m.ts })
}

const pick = (o, keys) => { for (const k of keys) if (o[k] != null && o[k] !== '') return o[k]; return null }
const out = []
for (const c of custs) {
  const cid = c.customer_id
  const convs = byCust.get(cid)
  const conversations = convs ? [...convs.values()] : []
  const msgCount = conversations.reduce((a, x) => a + x.length, 0)
  out.push({
    customer_id: cid,
    customer_no: pick(c, ['customer_no', 'human_code', 'code']),
    name: pick(c, ['full_name', 'name']) || 'Unknown',
    company: pick(c, ['company_name', 'company']),
    email: pick(c, ['email']),
    phone: pick(c, ['company_phone_number', 'phone', 'phone_number']),
    whatsapp: pick(c, ['whatsapp_number', 'whatsapp']),
    segment: pick(c, ['customer_segment', 'segment']),
    tier: pick(c, ['tier']),
    status: pick(c, ['status']),
    language: pick(c, ['preferred_language', 'language']),
    total_orders: c.total_orders ?? null,
    total_spent: c.total_spent ?? c.lifetime_value ?? 0,
    last_order_at: c.last_order_at ? String(c.last_order_at).slice(0, 10) : null,
    created_at: c.created_at ? String(c.created_at).slice(0, 10) : null,
    msg_count: msgCount,
    conversations,
  })
}
// order: paying first (by spend desc), then by message count desc
out.sort((a, b) => (Number(b.total_spent) - Number(a.total_spent)) || (b.msg_count - a.msg_count))
fs.writeFileSync('allcustomers.json', JSON.stringify(out, null, 1))
const withChat = out.filter(x => x.msg_count > 0).length
console.log(`saved allcustomers.json — ${out.length} customers (${withChat} with chats)`)
await pool.end(); process.exit(0)
