// Extract the EXACT questions customers actually asked (verbatim from app.messages),
// count how many times each was asked, and group by intent (AI only labels the intent —
// it does NOT rewrite the questions). Writes questions.json.
import pg from 'pg'
import { chatJSON } from './ai.js'
import fs from 'fs'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 30000, query_timeout: 120000, statement_timeout: 120000 })

// Automated / system templates that got logged as inbound — never a real question
const SYS_TPL = /you can call .* within the next|^\s*(automated|auto[- ]?reply)/i
// pure thanks / confirmations / statements (skip ONLY when there is no '?')
const THANKS = /^\s*(thanks?|thank you|gracias|muchas gracias|ok+|okay|okey|yes+|yep|no+|nope|perfect|great|good|nice|cool|alright|sure|got it|sounds good|np|done|received|noted|👍|🙏)\b/i
// a genuine question starts with a question word (allowing a leading filler/emoji)
const Q_START = /^[\s\W]*(how|what|where|when|why|which|who|whose|can|could|would|will|should|shall|do|does|did|is|are|am|may|cu[aá]nto|cu[aá]ntos|c[oó]mo|qu[eé]|cu[aá]ndo|d[oó]nde|tienen?|puedo|puede|hay|necesito|kitna|kitne|kaise|kya|kahan)\b/i
const isQ = (t) => {
  if (SYS_TPL.test(t)) return false
  const hasMark = t.includes('?')
  if (!hasMark && THANKS.test(t)) return false          // statement / thanks, not a question
  return hasMark || Q_START.test(t)
}
const norm = (t) => t.toLowerCase().replace(/\s+/g, ' ').trim().replace(/[?.!,]+$/, '').trim()

const rows = (await pool.query(`SELECT body FROM app.messages WHERE direction='in' AND body <> ''`)).rows
console.log('customer messages:', rows.length)

const counts = {}, repr = {}
for (const r of rows) {
  const t = (r.body || '').trim()
  if (t.length < 4 || t.length > 180) continue          // skip junk / very long
  if (!isQ(t)) continue
  const k = norm(t)
  if (k.length < 4) continue
  counts[k] = (counts[k] || 0) + 1
  if (!repr[k] || t.length < repr[k].length) repr[k] = t // keep a clean verbatim representative
}
let distinct = Object.keys(counts).map((k) => ({ q: repr[k], n: counts[k] })).sort((a, b) => b.n - a.n)
console.log('distinct questions:', distinct.length)

// focus on the ones customers actually ask (repeated) + enough singletons for coverage
let top = distinct.filter((d) => d.n >= 2)
if (top.length < 200) top = distinct.slice(0, 300)
top = top.slice(0, 700)
console.log('categorizing:', top.length)

const SYS = `You are grouping REAL customer questions from a custom apparel + DTF transfer print shop (Decoinks) by INTENT. For each question pick ONE intent from: Pricing, Order/Quantity, Sizes, Colors, Product Info, DTF/Gangsheet, Artwork/Design, Shipping/Delivery, Turnaround/Deadline, Payment, Order Status, Location/Pickup, Returns/Issues, Samples/Mockups, Reseller/Wholesale, Catalog/Website, Greeting/Other. Do NOT rewrite or translate the questions. Respond ONLY JSON: {"intents":[string]} — one per question, SAME order.`
for (let i = 0; i < top.length; i += 50) {
  const chunk = top.slice(i, i + 50)
  try {
    const out = await chatJSON(SYS, chunk.map((d, j) => `${j + 1}. ${d.q}`).join('\n'))
    const arr = Array.isArray(out.intents) ? out.intents : []
    chunk.forEach((d, j) => { d.intent = (arr[j] || 'Greeting/Other').trim() })
  } catch { chunk.forEach((d) => { d.intent = 'Greeting/Other' }) }
  console.log(`  ${Math.min(i + 50, top.length)}/${top.length}`)
}

const groups = {}
for (const d of top) (groups[d.intent] ||= []).push(d)
const ordered = Object.entries(groups)
  .map(([intent, qs]) => ({ intent, total: qs.reduce((s, x) => s + x.n, 0), questions: qs.sort((a, b) => b.n - a.n) }))
  .sort((a, b) => b.total - a.total)

fs.writeFileSync('questions.json', JSON.stringify({ totalCustomerMessages: rows.length, distinctQuestions: distinct.length, intents: ordered }, null, 2))
console.log('\n✓ DONE — intents:', ordered.length, '→ questions.json')
await pool.end(); process.exit(0)
