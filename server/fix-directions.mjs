// Meta ka page id JSONB me quotes ke saath saved tha ("654..." bajaye 654...), isliye
// 17 July ke baad hamare apne replies galti se 'in' (customer) mark ho gaye.
// Ye script Graph API se har message ka asli sender poochh kar direction theek karta hai.
// Default DRY-RUN hai — likhne ke liye: node --env-file=.env fix-directions.mjs --apply
import pg from 'pg'

const APPLY = process.argv.includes('--apply')
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 30000, query_timeout: 180000 })
const clean = (v) => String(v == null ? '' : v).replace(/^"+|"+$/g, '').replace(/\s+/g, '').trim()

const setting = async (k) => (await pool.query('SELECT value FROM public.settings WHERE key = $1', [k])).rows[0]?.value
const token = clean(await setting('meta_page_token'))
const pageId = clean(await setting('meta_page_id'))
const igId = clean((await setting('meta_ig'))?.id)
console.log(`pageId=${pageId} igId=${igId || '(none)'} token=${token.length} chars`)

async function graph(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30000) })
      const j = await r.json()
      if (j.error) throw new Error(`${j.error.code}: ${j.error.message}`)
      return j
    } catch (e) { if (i === tries - 1) throw e; await new Promise((r) => setTimeout(r, 2000)) }
  }
}

// Har conversation ke aakhri 50 messages ka asli sender nikalo
const ours = new Set()
let page = `https://graph.facebook.com/v21.0/${pageId}/conversations?fields=messages.limit(50){from}&limit=50&access_token=${token}`
let convs = 0, seen = 0
while (page) {
  const j = await graph(page)
  for (const c of j.data || []) {
    convs++
    for (const m of c.messages?.data || []) {
      seen++
      const from = String(m.from?.id || '')
      if (from === pageId || (igId && from === igId)) ours.add(String(m.id))
    }
  }
  page = j.paging?.next || null
  if (convs % 200 === 0) console.log(`  scanned ${convs} conversations, ${seen} messages, ${ours.size} ours`)
}
console.log(`\nGraph API: ${convs} conversations, ${seen} messages, ${ours.size} hamare (out)`)

// Kaunse DB me galat 'in' pade hain
const ids = [...ours]
const wrong = (await pool.query(
  `SELECT count(*) n FROM app.messages WHERE direction = 'in' AND extra->>'id' = ANY($1)`, [ids])).rows[0].n
console.log(`DB me galat 'in' mark hue hamare messages: ${wrong}`)

if (!APPLY) {
  console.log('\nDRY RUN — kuch nahi badla. Apply karne ke liye: node --env-file=.env fix-directions.mjs --apply')
} else {
  const r = await pool.query(
    `UPDATE app.messages SET direction = 'out', sender_type = 'agent'
      WHERE direction = 'in' AND extra->>'id' = ANY($1)`, [ids])
  console.log(`\n✅ ${r.rowCount} messages 'out' kar diye`)
  const s = await pool.query(`SELECT direction, count(*) n, max(created_at) last FROM app.messages GROUP BY 1 ORDER BY n DESC`)
  console.table(s.rows)
}
await pool.end()
process.exit(0)
