// Phase 4 — Meta vs Chatwoot shadow comparison report.
// Har shadow message ko Meta wale (app.messages) se match karta hai:
//   text same + direction same + timestamp 10 min ke andar
// Match milne par matched_meta_message_id bhar deta hai (re-run safe).
// Run:  node --env-file=.env chatwoot-compare.mjs [--days 2]
import pg from 'pg'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 30000, query_timeout: 120000 })
const daysArg = process.argv.indexOf('--days')
const DAYS = daysArg > -1 ? Number(process.argv[daysArg + 1]) || 2 : 2

const shadow = (await pool.query(
  `SELECT id, chatwoot_message_id, direction, content, attachments, customer_name, chatwoot_created_at, matched_meta_message_id
     FROM public.chatwoot_shadow_messages
    WHERE received_at > now() - ($1 || ' days')::interval
    ORDER BY chatwoot_created_at`, [DAYS])).rows

console.log(`pichhle ${DAYS} din ke Chatwoot shadow messages: ${shadow.length}`)
if (!shadow.length) { console.log('abhi kuch nahi aaya — Chatwoot webhook lagne ke baad dobara chalayen.'); await pool.end(); process.exit(0) }

let matched = 0, already = 0, unmatched = []
for (const s of shadow) {
  if (s.matched_meta_message_id) { already++; matched++; continue }
  // wahi text, wahi direction, 10 min ke andar
  const m = (await pool.query(
    `SELECT m.extra->>'id' mid, m.body, m.created_at, c.full_name
       FROM app.messages m
       JOIN app.conversations co ON co.conversation_id = m.conversation_id
       LEFT JOIN app.customers c ON c.customer_id = co.customer_id
      WHERE m.direction = $1
        AND trim(m.body) = trim($2)
        AND abs(extract(epoch FROM (m.created_at - $3::timestamptz))) < 600
      ORDER BY abs(extract(epoch FROM (m.created_at - $3::timestamptz)))
      LIMIT 1`, [s.direction, String(s.content || ''), s.chatwoot_created_at])).rows[0]
  if (m) {
    matched++
    await pool.query(`UPDATE public.chatwoot_shadow_messages SET matched_meta_message_id = $1 WHERE id = $2`, [m.mid, s.id])
  } else {
    unmatched.push(s)
  }
}

const metaCount = (await pool.query(
  `SELECT count(*) n FROM app.messages WHERE created_at > now() - ($1 || ' days')::interval AND direction IN ('in','out')`, [DAYS])).rows[0].n

console.log('\n===== COMPARISON REPORT =====')
console.log(`Meta messages received     : ${metaCount}`)
console.log(`Chatwoot messages received : ${shadow.length}`)
console.log(`Successfully matched       : ${matched}${already ? ` (${already} pehle se)` : ''}`)
console.log(`Unmatched                  : ${unmatched.length}`)
console.log(`Duplicates shown to agents : 0  (shadow mode — UI ko kuch nahi bheja jata)`)
if (unmatched.length) {
  console.log('\nunmatched samples:')
  unmatched.slice(0, 5).forEach((s) =>
    console.log(`   [${s.direction}] ${String(s.chatwoot_created_at).slice(0, 19)} | ${(s.customer_name || '?').slice(0, 20)} | ${String(s.content || '(attachment only)').slice(0, 50)}`))
}
await pool.end()
process.exit(0)
