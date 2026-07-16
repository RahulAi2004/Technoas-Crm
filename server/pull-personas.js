// Go through the whole DB, pull real customer questions, and bucket them by PERSONA.
// Output: personas.json  { persona: [{q, n}] }  (grounded in real chats).
import pg from 'pg'
import fs from 'fs'
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 30000, query_timeout: 180000, statement_timeout: 180000 })
async function q(sql, tries = 6) {
  for (let i = 0; i < tries; i++) { try { return await pool.query(sql) } catch (e) { console.log(`retry ${i + 1}: ${e.message}`); await new Promise(r => setTimeout(r, 2500)) } }
  throw new Error('query failed')
}
const norm = (t) => (t || '').toLowerCase().replace(/\s+/g, ' ').trim().replace(/[?.!,]+$/, '').trim()

// pull all customer messages
const rows = (await q(`SELECT body FROM app.messages WHERE direction='in' AND body<>''`)).rows
console.log('customer messages:', rows.length)

// keep genuine questions, dedupe with counts
const Q_START = /^(how|what|when|where|why|which|who|can|could|do|does|did|is|are|will|would|should|any|whats|what's|price|cost|cu[aá]nto|c[oó]mo|qu[eé]|cu[aá]l|cu[aá]ndo|d[oó]nde|tienen|hacen|puedo|necesito)\b/i
const SKIP = /^(hi|hii+|hello|hey|thanks|thank you|ok|okay|yes|no|sure|great|perfect|got it)\b/i
const counts = {}
for (const r of rows) {
  const b = (r.body || '').trim()
  if (b.length < 6 || b.length > 300) continue
  if (SKIP.test(b)) continue
  if (!(b.includes('?') || Q_START.test(b))) continue
  const k = norm(b); if (!k) continue
  ;(counts[k] ||= { n: 0, sample: b }).n++
}
const distinct = Object.values(counts).sort((a, b) => b.n - a.n)
console.log('distinct questions:', distinct.length)

const ES = /[ñ¿]|[áéíóú]|\b(que|qu[eé]|como|c[oó]mo|cuanto|cu[aá]nto|cu[aá]l|para|tienen|precio|gracias|hola|env[ií]o|camis|l[aá]minas|hacer|pedido|tama[ñn]o|colores|quiero|necesito|d[oó]nde|est[aá]n)\b/i

const P = {
 'Rush / Deadline (urgent order)': /\b(rush|urgent|asap|as soon as possible|how fast|how soon|how quick|by (mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|next|the \d|end of)|before (fri|mon|the|next|this)|deadline|in hand|same day|need (it|them|these) (by|today|tomorrow|asap|soon)|today|tomorrow|this week|overnight|how long.*(take|get|receive))\b/i,
 'Price Shopper (how much)': /\b(how much|what.*(price|cost)|price|cost|cheap|cheaper|discount|deal|afford|budget|expensive|per (piece|unit|shirt|transfer))\b/i,
 'Bulk / Reseller (large order)': /\b(bulk|wholesale|reseller|resell|\b(100|150|200|250|300|500|1000)\b.*(shirt|pcs|piece|transfer|hat|inch|feet|ft)|monthly|large order|in bulk|volume|restock)\b/i,
 'Sample / Mockup seeker': /\b(sample|mock ?up|preview|proof|layout|see (it|how|the)|show me)\b/i,
 'Artwork / Design help': /\b(png|jpe?g|design|artwork|file|vector|logo|resolution|background|where.*(send|upload).*(image|design|file)|do you (make|do) (design|artwork))\b/i,
 'Shipping-focused': /\b(ship|shipping|delivery|deliver|how long.*(ship|deliver|arrive|get)|arrive|track|tracking|when will|do you ship)\b/i,
 'Comparison Shopper': /\b(cheaper|someone (else|quoted)|another (shop|company|place|vendor)|quoted me|beat.*price|match.*price|competitor|better price)\b/i,
 'Complaint / Issue': /\b(wrong|refund|not happy|issue|problem|peel|peeled|fad(e|ed|ing)|quality (issue|problem)|damaged|mistake|complain|missing|never (got|received))\b/i,
 'Church / Team / Event': /\b(church|team|school|event|reunion|fundraiser|group|tournament|game|club|graduation|birthday|wedding)\b/i,
 'Payment questions': /\b(how (do|to|can) (i )?pay|payment|zelle|paypal|venmo|cash ?app|invoice|deposit|pay (you|for)|accept)\b/i,
 'Product / Info seeker': /\b(what (do|is)|do you (offer|have|do|make)|type|kind of|difference|material|what.*(product|service))\b/i,
}

const out = {}
for (const [name, re] of Object.entries(P)) {
  out[name] = distinct.filter((d) => re.test(d.sample)).slice(0, 15).map((d) => ({ q: d.sample, n: d.n }))
}
// Spanish persona
out['Spanish-speaking customer'] = distinct.filter((d) => ES.test(d.sample)).slice(0, 15).map((d) => ({ q: d.sample, n: d.n }))

fs.writeFileSync('personas.json', JSON.stringify(out, null, 2))
for (const [k, v] of Object.entries(out)) console.log(`  ${k}: ${v.length} questions`)
console.log('saved personas.json')
await pool.end(); process.exit(0)
