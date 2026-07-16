// For each customer question, find how our REAL agents replied (next outbound message in the
// same conversation), then write the BEST human-salesperson version of that reply.
import pg from 'pg'
import { chatText } from './ai.js'
import fs from 'fs'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 30000, query_timeout: 120000, statement_timeout: 120000 })
const norm = (t) => (t || '').toLowerCase().replace(/\s+/g, ' ').trim().replace(/[?.!,]+$/, '').trim()
async function pMap(items, fn, limit) { let i = 0; await Promise.all(Array.from({ length: limit }, async () => { while (i < items.length) { const x = i++; try { await fn(items[x]) } catch {} } })) }

const data = JSON.parse(fs.readFileSync('questions.json', 'utf8'))
const keyMap = {}, allQ = []
for (const g of data.intents) for (const q of g.questions) { q.replies = []; keyMap[norm(q.q)] = q; allQ.push(q) }

// pull every message ordered per conversation, pair each matched question with the agent's next reply
const rows = (await pool.query(`SELECT m.conversation_id cid, m.direction dir, m.body FROM app.messages m WHERE m.body<>'' ORDER BY m.conversation_id, m.created_at`)).rows
console.log('messages scanned:', rows.length)
const pending = {}
for (const r of rows) {
  if (r.dir === 'in') { const k = norm(r.body); pending[r.cid] = keyMap[k] ? k : null }
  else if (r.dir === 'out') {
    const k = pending[r.cid]
    if (k) { const b = (r.body || '').trim(); if (b && b.length < 400 && keyMap[k].replies.length < 6) keyMap[k].replies.push(b) }
    pending[r.cid] = null
  }
}
const withReal = allQ.filter((q) => q.replies.length).length
console.log(`questions with a real agent reply: ${withReal}/${allQ.length}`)

const SYS = `You are the Decoinks sales agent (a custom apparel + DTF transfer print shop). Write the BEST reply to the customer's question.
- Tone: warm, natural, HUMAN salesperson — friendly and helpful. NOT robotic, NOT AI-sounding, no corporate fluff.
- Base it on HOW OUR REAL AGENTS ACTUALLY REPLIED (samples given). Keep our real prices / policies / info from those samples.
- Keep it short: 1-3 sentences. Sound like a real person texting a customer.
- Reply with ONLY the message text (no quotes, no labels).`

let done = 0
await pMap(allQ, async (q) => {
  const samples = q.replies.slice(0, 5)
  const user = `Customer question: "${q.q}"\n\nHow our agents really replied (real samples from our chats):\n${samples.length ? samples.map((s) => `- ${s}`).join('\n') : '(no sample found — write a natural, on-brand reply a friendly DTF print-shop salesperson would send)'}`
  try { q.best = (await chatText(SYS, user)).trim() } catch { q.best = '' }
  if (++done % 25 === 0) console.log(`  ${done}/${allQ.length}`)
}, 6)

fs.writeFileSync('questions.json', JSON.stringify(data, null, 2))
console.log(`\n✓ DONE — best replies generated for ${allQ.length} questions (${withReal} grounded in real agent replies)`)
await pool.end(); process.exit(0)
