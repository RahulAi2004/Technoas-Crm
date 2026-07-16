// Pull 5 customers who completed an order cycle + their COMPLETE chat (first -> last message).
import pg from 'pg'
import fs from 'fs'
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 30000, query_timeout: 180000, statement_timeout: 180000 })
async function q(sql, params, tries = 6) {
  for (let i = 0; i < tries; i++) { try { return await pool.query(sql, params) } catch (e) { console.log(`retry ${i + 1}: ${e.message}`); await new Promise(r => setTimeout(r, 2500)) } }
  throw new Error('query failed')
}

// candidates: real buyers (spent > 0) with a profile + a full conversation, richest first
const cand = (await q(`
  SELECT co.conversation_id cid,
    coalesce(nullif(co.extra->>'name',''), cu.full_name) name,
    cu.total_spent spend, cu.total_orders orders, cu.payment_status pstatus,
    co.extra->'ai_profile'->>'products'       products,
    co.extra->'ai_profile'->>'orderTotal'     order_total,
    co.extra->'ai_profile'->>'leadStage'      stage,
    co.extra->'ai_profile'->>'paymentStatus'  pay,
    co.extra->'ai_profile'->>'summary'        summary,
    co.extra->'ai_profile'->>'nextStep'       next_step,
    (SELECT count(*) FROM app.messages m WHERE m.conversation_id=co.conversation_id AND m.body<>'' AND m.direction IN ('in','out')) msgs
  FROM app.conversations co
  JOIN app.customers cu ON cu.customer_id = co.customer_id
  WHERE cu.total_spent > 0 AND co.extra ? 'ai_profile'
  ORDER BY cu.total_spent DESC
  LIMIT 10`)).rows.filter(r => Number(r.msgs) >= 8).slice(0, 5)

const out = []
for (const c of cand) {
  const msgs = (await q(`SELECT direction dir, body, to_char(created_at,'YYYY-MM-DD HH24:MI') ts
    FROM app.messages WHERE conversation_id=$1 AND body<>'' AND direction IN ('in','out')
    ORDER BY created_at ASC`, [c.cid])).rows
  out.push({ ...c, messages: msgs })
  console.log(`  ${c.name}: ${msgs.length} messages, spend $${c.spend}`)
}
fs.writeFileSync('cycles.json', JSON.stringify(out, null, 2))
console.log('saved cycles.json —', out.length, 'customers')
await pool.end(); process.exit(0)
