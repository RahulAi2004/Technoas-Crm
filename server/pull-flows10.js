// Pull 10 COMPLETE order journeys (inquiry -> price -> design -> confirm -> quote -> approve -> pay -> ship),
// each from a customer with a DIFFERENT writing style (Spanish, broken English, all-caps, slang, etc.).
// Keeps text EXACT. Output: flows10.json   Run:  node --env-file=.env pull-flows10.js
import pg from 'pg'
import fs from 'fs'
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 30000, query_timeout: 180000, statement_timeout: 180000 })
async function q(sql, params, tries = 6) {
  for (let i = 0; i < tries; i++) { try { return await pool.query(sql, params) } catch (e) { console.log(`retry ${i + 1}: ${e.message}`); await new Promise(r => setTimeout(r, 2500)) } }
  throw new Error('query failed')
}

// ---------- writing-style detectors (operate on a customer's inbound messages) ----------
const EMOJI = /\p{Extended_Pictographic}/u
const ES = /[ñ¿]|[áéíóú]|\b(que|qu[eé]|como|c[oó]mo|cuanto|cu[aá]nto|cu[aá]l|para|tienen|precio|gracias|hola|env[ií]o|camis|l[aá]minas|hacer|pedido|tama[ñn]o|colores|quiero|necesito|d[oó]nde|est[aá]n|disculpe|cu[aá]ndo|puedo|hacen)\b/i
const SLANG = /(^|\s)(u|ur|r|wanna|gonna|y'?all|bro|plz|pls|thx|cuz|tho|imma|gimme|lemme|yea+h?|nah|dm|hmu)(\s|\?|$|,|\.)/i
const upperRatio = (b) => { const L = b.replace(/[^a-zA-Z]/g, ''); if (L.length < 5) return 0; return (L.replace(/[^A-Z]/g, '').length) / L.length }
const wc = (b) => b.trim().split(/\s+/).filter(Boolean).length
// broken / ESL English heuristics (common non-native patterns)
const BROKEN = /\b(how much (it|is|for|the)|i want (make|to know|order|buy)|can you make me|you have|how i can|i need know|do you have make|price how much|how to order|it cost|much cost|i interested|please tell me price|can do|you do this|me want|how much money)\b/i

function styleScores(msgs) {
  // msgs: array of inbound text strings
  const n = msgs.length || 1
  let caps = 0, emoji = 0, slang = 0, es = 0, broken = 0, oneLiner = 0, noPunct = 0, multiQ = 0, polite = 0, impatient = 0, bulk = 0
  for (const b of msgs) {
    if (!b) continue
    if (upperRatio(b) > 0.6 && wc(b) >= 2) caps++
    if (EMOJI.test(b)) emoji++
    if (SLANG.test(b)) slang++
    if (ES.test(b)) es++
    if (BROKEN.test(b)) broken++
    if (wc(b) <= 4 && b.length <= 30) oneLiner++
    if (b.length >= 22 && wc(b) >= 6 && !/[.?!]/.test(b)) noPunct++
    if ((b.match(/\?/g) || []).length >= 2) multiQ++
    if (wc(b) >= 14 && /\b(hello|hi there|good (morning|evening|afternoon)|please|thank you|kindly|appreciate|hope|would like)\b/i.test(b)) polite++
    if (/\?\?|asap|hello\s*\?|u\s*there|you\s*there|any(one|body)\s*(there|home)|!{2,}|\?{3,}|still (there|waiting)|any update|when (will|can)|how long|waiting|hurry|urgent|need (it|this|them) (today|tomorrow|now|by)/i.test(b)) impatient++
    if (/\b(bulk|wholesale|reseller|resell|per (piece|unit|shirt|transfer)|monthly|order of|\b(50|75|100|150|200|250|300|500|1000)\b)\b/i.test(b)) bulk++
  }
  return {
    'Spanish speaker': es / n * 3,
    'Broken / simple English (ESL)': broken / n * 3,
    'The One-Liner (blunt & fast)': oneLiner / n,
    'Emoji-casual': emoji / n * 2,
    'Texter / slang (u, ur, plz)': slang / n * 2,
    'ALL-CAPS writer': caps / n * 3,
    'No-punctuation rambler': noPunct / n * 1.5,
    'Polite & detailed': polite / n * 2,
    'Impatient (?? / asap)': impatient / n * 2,
    'Bulk / business buyer': bulk / n,
    'Multi-question stacker': multiQ / n * 2,
  }
}
const TARGET_STYLES = ['Spanish speaker', 'Broken / simple English (ESL)', 'The One-Liner (blunt & fast)', 'Emoji-casual',
  'Texter / slang (u, ur, plz)', 'No-punctuation rambler', 'Polite & detailed', 'Impatient (?? / asap)',
  'Bulk / business buyer', 'Multi-question stacker']

// ---------- candidates: customers who ORDERED (complete journey) ----------
const meta = `co.conversation_id cid, coalesce(nullif(co.extra->>'name',''),cu.full_name) name, cu.total_spent spend,
  co.extra->'ai_profile'->>'products' products, co.extra->'ai_profile'->>'leadStage' stage,
  co.extra->'ai_profile'->>'paymentStatus' pay, co.extra->'ai_profile'->>'orderTotal' order_total,
  co.extra->'ai_profile'->>'summary' summary,
  (SELECT count(*) FROM app.messages m WHERE m.conversation_id=co.conversation_id AND m.direction IN ('in','out') AND (m.body<>'' OR m.message_type='image')) msgs,
  (SELECT count(*) FROM app.messages m WHERE m.conversation_id=co.conversation_id AND m.message_type='image') imgs`

const cand = (await q(`SELECT ${meta}
  FROM app.conversations co JOIN app.customers cu ON cu.customer_id=co.customer_id
  WHERE cu.total_spent > 0 AND co.extra ? 'ai_profile'`)).rows
  .filter(r => Number(r.msgs) >= 10 && Number(r.msgs) <= 70)
console.log('ordered candidates (10-70 msgs):', cand.length)

// classify each candidate by its inbound writing style
for (const c of cand) {
  const ins = (await q(`SELECT body FROM app.messages WHERE conversation_id=$1 AND direction='in' AND message_type='text' AND body<>''`, [c.cid])).rows.map(r => r.body)
  c.inCount = ins.length
  c.scores = styleScores(ins)
}

// greedy assignment: for each target style, pick the highest-scoring unused candidate (score must be > 0)
const used = new Set(), picked = []
for (const style of TARGET_STYLES) {
  let best = null
  for (const c of cand) {
    if (used.has(c.cid)) continue
    const s = c.scores[style] || 0
    if (s <= 0) continue
    // prefer strong style + a fuller journey (more messages) + shared artwork
    const rank = s * 100 + Math.min(Number(c.msgs), 40) / 40 * 3 + (Number(c.imgs) > 0 ? 1 : 0)
    if (!best || rank > best.rank) best = { c, rank, style }
  }
  if (best) { used.add(best.c.cid); picked.push({ ...best.c, style }) }
  else console.log(`  ! no match for style: ${style}`)
}
// fill any missing slots with the fullest remaining journeys (label = best of their own scores)
if (picked.length < 10) {
  const rest = cand.filter(c => !used.has(c.cid)).sort((a, b) => Number(b.msgs) - Number(a.msgs))
  for (const c of rest) {
    if (picked.length >= 10) break
    const best = Object.entries(c.scores).sort((a, b) => b[1] - a[1])[0]
    used.add(c.cid); picked.push({ ...c, style: best[0] + ' (closest)' })
  }
}
console.log('picked', picked.length, 'flows')

// pull full transcript for each
const out = []
for (const c of picked) {
  const msgs = (await q(`SELECT direction dir, message_type mt, body,
      extra->'attachments'->0->>'url' img, to_char(created_at,'YYYY-MM-DD HH24:MI') ts
    FROM app.messages WHERE conversation_id=$1 AND direction IN ('in','out') AND (body<>'' OR message_type='image')
    ORDER BY created_at ASC`, [c.cid])).rows
  out.push({ cid: c.cid, name: c.name, style: c.style, spend: c.spend, products: c.products,
    stage: c.stage, pay: c.pay, order_total: c.order_total, summary: c.summary, imgs: c.imgs, messages: msgs })
  console.log(`  ${c.style}  ·  ${c.name}: ${msgs.length} msgs, ${c.imgs} imgs, $${c.spend}`)
}
fs.writeFileSync('flows10.json', JSON.stringify(out, null, 2))
console.log('saved flows10.json —', out.length, 'flows')
await pool.end(); process.exit(0)
