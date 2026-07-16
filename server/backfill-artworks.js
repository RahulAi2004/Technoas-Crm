// BACKFILL: saari purani customer-sent images → app.customer_artwork (SRC-ART-YY-NNNN).
// Sirf direction='in' (customer ke bheje). Dedupe message_id se — dobara chalana safe hai.
// Run:  node --env-file=.env backfill-artworks.js
import pg from 'pg'
import { storeArtwork } from './artwork-capture.js'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 30000, query_timeout: 180000 })
async function q(sql, tries = 6) {
  for (let i = 0; i < tries; i++) { try { return await pool.query(sql) } catch (e) { console.log(`retry ${i + 1}: ${e.message}`); await new Promise(r => setTimeout(r, 2500)) } }
  throw new Error('query failed')
}

const rows = (await q(`
  SELECT m.message_id, m.conversation_id,
         coalesce(m.extra->'attachments', m.attachments, '[]'::jsonb) atts
    FROM app.messages m
   WHERE m.direction = 'in' AND m.message_type = 'image'
   ORDER BY m.created_at ASC`)).rows
console.log('customer image messages:', rows.length)

let ok = 0, fail = 0, skip = 0, done = 0
const jobs = []
for (const r of rows) {
  const atts = (Array.isArray(r.atts) ? r.atts : []).filter((a) => a && a.url && (a.type === 'image' || !a.type))
  for (let i = 0; i < atts.length; i++) {
    jobs.push({ ref: `${r.message_id}#${i}`, convRef: r.conversation_id, url: atts[i].url, name: atts[i].name })
  }
}
console.log('attachments to process:', jobs.length)

const WORKERS = 8
let idx = 0
await Promise.all(Array.from({ length: WORKERS }, async () => {
  while (idx < jobs.length) {
    const j = jobs[idx++]
    try {
      const no = await storeArtwork(j)
      if (no) ok++; else skip++                    // skip = already stored (dedupe)
    } catch { fail++ }
    if (++done % 100 === 0) console.log(`[${done}/${jobs.length}] stored=${ok} skipped=${skip} failed=${fail}`)
  }
}))
console.log(`\nDONE — stored=${ok}, skipped(dupe)=${skip}, failed=${fail}`)
const s = (await q(`SELECT count(*) n, count(image_data) with_bytes, pg_size_pretty(sum(coalesce(file_size_bytes,0))) size FROM app.customer_artwork`)).rows[0]
console.log(`app.customer_artwork: ${s.n} rows, ${s.with_bytes} with image bytes, total ${s.size}`)
await pool.end(); process.exit(0)
