// Bucket real customer questions by WRITING STYLE (how they write), keeping the text EXACT.
// Output: writestyles.json  { persona: [raw question, ...20] }
import pg from 'pg'
import fs from 'fs'
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 30000, query_timeout: 180000, statement_timeout: 180000 })
async function q(sql, tries = 6) {
  for (let i = 0; i < tries; i++) { try { return await pool.query(sql) } catch (e) { console.log(`retry ${i + 1}: ${e.message}`); await new Promise(r => setTimeout(r, 2500)) } }
  throw new Error('query failed')
}
const norm = (t) => (t || '').toLowerCase().replace(/\s+/g, ' ').trim().replace(/[?.!,]+$/, '').trim()

const rows = (await q(`SELECT body FROM app.messages WHERE direction='in' AND message_type='text' AND body<>''`)).rows
console.log('customer text messages:', rows.length)

const Q_START = /^(how|what|when|where|why|which|who|can|could|do|does|did|is|are|will|would|should|any|whats|what's|price|cost|u |you |cu[aá]nto|c[oó]mo|qu[eé]|cu[aá]l|cu[aá]ndo|d[oó]nde|tienen|hacen|puedo|necesito)/i
const SKIP = /^(hi+|hello+|hey+|thanks|thank you|thankyou|ok+|okay|yes|no|sure|great|perfect|got it|good (morning|evening|afternoon))\s*$/i
const ES = /[ñ¿]|[áéíóú]|\b(que|qu[eé]|como|c[oó]mo|cuanto|cu[aá]nto|cu[aá]l|para|tienen|precio|gracias|hola|env[ií]o|camis|l[aá]minas|hacer|pedido|tama[ñn]o|colores|quiero|necesito|d[oó]nde|est[aá]n|disculpe)\b/i
const EMOJI = /\p{Extended_Pictographic}/u

// keep genuine question-like customer messages, dedupe (keep raw), reasonable length
const seen = new Set(), items = []
for (const r of rows) {
  const b = (r.body || '').replace(/\s+/g, ' ').trim()
  if (b.length < 3 || b.length > 260) continue
  if (SKIP.test(b)) continue
  if (!(b.includes('?') || Q_START.test(b) || ES.test(b))) continue
  const k = norm(b); if (!k || seen.has(k)) continue
  seen.add(k); items.push(b)
}
console.log('distinct question-like messages:', items.length)

const wc = (b) => b.trim().split(/\s+/).length
const upperRatio = (b) => { const L = b.replace(/[^a-zA-Z]/g, ''); if (L.length < 5) return 0; return (L.replace(/[^A-Z]/g, '').length) / L.length }

const DET = {
 'The One-Liner (blunt & fast)': (b) => wc(b) <= 4 && b.length <= 30 && !EMOJI.test(b),
 'The All-Caps Shouter': (b) => upperRatio(b) > 0.7 && /\s/.test(b),
 'The No-Punctuation Rambler': (b) => b.length >= 22 && wc(b) >= 6 && !/[.?!]/.test(b),
 'The Spanish Speaker': (b) => ES.test(b),
 'The Emoji-Casual': (b) => EMOJI.test(b),
 'The Texter / Slang (u, ur, wanna)': (b) => /(^|\s)(u|ur|r|wanna|gonna|y'?all|bro|plz|pls|thx|cuz|tho|imma|gimme|lemme|yea+h?|nah)(\s|\?|$)/i.test(b),
 'The Polite & Detailed': (b) => wc(b) >= 18 && /\b(hello|hi there|good (morning|evening|afternoon)|please|thank you|kindly|appreciate|hope)\b/i.test(b),
 'The Impatient (?? / asap / hello?)': (b) => /\?\?|asap|hello\s*\?|u\s*there|you\s*there|any(one|body)\s*(there|home)|!{2,}|\?{3,}/i.test(b),
 'The Multi-Question Stacker': (b) => (b.match(/\?/g) || []).length >= 2,
 'The Bulk / Business buyer': (b) => /\b(bulk|wholesale|reseller|resell|\b(50|75|100|150|200|250|300|500|1000)\b|quote for|per (piece|unit|shirt|transfer)|monthly|order of)\b/i.test(b),
}

const out = {}
for (const [name, det] of Object.entries(DET)) {
  const picks = []
  for (const b of items) { if (det(b)) picks.push(b); if (picks.length >= 20) break }
  out[name] = picks
}
fs.writeFileSync('writestyles.json', JSON.stringify(out, null, 2))
for (const [k, v] of Object.entries(out)) console.log(`  ${k}: ${v.length}`)
console.log('saved writestyles.json')
await pool.end(); process.exit(0)
