// Pull 25 complete real chats: a mix of ONE-TIME ORDER (completed) and ABANDONED (left without
// ordering), with image/artwork URLs kept inline. Output: chats25.json
import pg from 'pg'
import fs from 'fs'
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 30000, query_timeout: 180000, statement_timeout: 180000 })
async function q(sql, params, tries = 6) {
  for (let i = 0; i < tries; i++) { try { return await pool.query(sql, params) } catch (e) { console.log(`retry ${i + 1}: ${e.message}`); await new Promise(r => setTimeout(r, 2500)) } }
  throw new Error('query failed')
}

const meta = `coalesce(nullif(co.extra->>'name',''),cu.full_name) name, cu.total_spent spend,
  co.extra->'ai_profile'->>'products' products, co.extra->'ai_profile'->>'leadStage' stage,
  co.extra->'ai_profile'->>'paymentStatus' pay, co.extra->'ai_profile'->>'orderTotal' order_total,
  co.extra->'ai_profile'->>'summary' summary,
  (SELECT count(*) FROM app.messages m WHERE m.conversation_id=co.conversation_id AND m.direction IN ('in','out') AND (m.body<>'' OR m.message_type='image')) msgs,
  (SELECT count(*) FROM app.messages m WHERE m.conversation_id=co.conversation_id AND m.message_type='image') imgs`

// ORDERED = real buyers (spent > 0); prefer those that shared artwork, reasonable length
const ordered = (await q(`SELECT co.conversation_id cid, ${meta}
  FROM app.conversations co JOIN app.customers cu ON cu.customer_id=co.customer_id
  WHERE cu.total_spent > 0 AND co.extra ? 'ai_profile'`)).rows
  .filter(r => Number(r.msgs) >= 6 && Number(r.msgs) <= 55)
  .sort((a, b) => (Number(b.imgs) > 0) - (Number(a.imgs) > 0) || Number(a.msgs) - Number(b.msgs))
  .slice(0, 12)

// ABANDONED = never ordered (spend 0), still early stage, but had a real conversation then went cold
const abandoned = (await q(`SELECT co.conversation_id cid, ${meta}
  FROM app.conversations co JOIN app.customers cu ON cu.customer_id=co.customer_id
  WHERE coalesce(cu.total_spent,0)=0 AND co.extra ? 'ai_profile'
    AND coalesce(co.extra->'ai_profile'->>'leadStage','') IN ('inquiry','qualification','new','')`)).rows
  .filter(r => Number(r.msgs) >= 6 && Number(r.msgs) <= 45)
  .sort((a, b) => (Number(b.imgs) > 0) - (Number(a.imgs) > 0) || Number(a.msgs) - Number(b.msgs))
  .slice(0, 13)

const picked = [...ordered.map(r => ({ ...r, outcome: 'ORDERED' })), ...abandoned.map(r => ({ ...r, outcome: 'ABANDONED' }))]
console.log(`picked ${ordered.length} ordered + ${abandoned.length} abandoned = ${picked.length}`)

const out = []
for (const c of picked) {
  const msgs = (await q(`SELECT direction dir, message_type mt, body,
      extra->'attachments'->0->>'url' img, to_char(created_at,'YYYY-MM-DD HH24:MI') ts
    FROM app.messages WHERE conversation_id=$1 AND direction IN ('in','out') AND (body<>'' OR message_type='image')
    ORDER BY created_at ASC`, [c.cid])).rows
  out.push({ ...c, messages: msgs })
  console.log(`  ${c.outcome} · ${c.name}: ${msgs.length} msgs, ${c.imgs} images, $${c.spend}`)
}
fs.writeFileSync('chats25.json', JSON.stringify(out, null, 2))
console.log('saved chats25.json —', out.length, 'chats')
await pool.end(); process.exit(0)
