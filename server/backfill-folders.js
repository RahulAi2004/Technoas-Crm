// BACKFILL: har customer ka folder = YYMMDD_Firstname_Lastname (YYMMDD = uske pehle message ki date),
// phir uske saare artworks ka folder isi se sync. Upload_status='pending' -> retry-worker NextCloud par chadhata hai.
// Re-runnable (jinke folder set hai unhe chhodta hai).   Run: node --env-file=.env backfill-folders.js
import pg from 'pg'
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 30000, query_timeout: 300000 })
async function q(sql, params, tries = 6) {
  for (let i = 0; i < tries; i++) { try { return await pool.query(sql, params) } catch (e) { if (i === tries - 1) throw e; console.log(`retry ${i + 1}: ${e.message.slice(0, 60)}`); await new Promise(r => setTimeout(r, 2500)) } }
}
const partSafe = (s) => String(s || '').normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30)
function splitName(full) {
  const p = String(full || 'Unknown').trim().split(/\s+/).filter(Boolean)
  return { first: partSafe(p[0]) || 'Unknown', last: partSafe(p.slice(1).join(' ')) }
}

// customers ko unke PEHLE message ki date ke order se lo (jiska pehle aaya use base naam, baad wale ko _2)
const custs = (await q(`
  SELECT c.customer_id, c.full_name, c.folder,
         to_char((SELECT min(m.created_at) FROM app.messages m
                    JOIN app.conversations co ON co.conversation_id = m.conversation_id
                   WHERE co.customer_id = c.customer_id AND m.direction='in'), 'YYMMDD') ymd,
         (SELECT min(m.created_at) FROM app.messages m
            JOIN app.conversations co ON co.conversation_id = m.conversation_id
           WHERE co.customer_id = c.customer_id AND m.direction='in') first_at
    FROM app.customers c
   ORDER BY first_at NULLS LAST, c.created_at, c.customer_id`)).rows
console.log('customers:', custs.length)

const used = new Set((await q(`SELECT folder FROM app.customers WHERE folder IS NOT NULL`)).rows.map(r => r.folder))
let set = 0, kept = 0
for (const c of custs) {
  if (c.folder) { kept++; continue }
  const ymd = c.ymd || '000000'
  const { first, last } = splitName(c.full_name)
  const base = `${ymd}_${first}${last ? '_' + last : ''}`
  let folder = base, n = 1
  while (used.has(folder)) { n++; folder = `${base}_${n}` }
  used.add(folder)
  await q(`UPDATE app.customers SET folder = $1 WHERE customer_id = $2`, [folder, c.customer_id])
  set++
  if (set % 100 === 0) console.log(`  set ${set} folders…`)
}
console.log(`folders: set=${set}, already-had=${kept}`)

// artworks ka folder customer se sync + upload_status pending (jinke NextCloud link nahi)
const up = await q(`
  UPDATE app.customer_artwork ca
     SET folder = c.folder
    FROM app.customers c
   WHERE ca.customer_id = c.customer_id AND c.folder IS NOT NULL AND ca.folder IS DISTINCT FROM c.folder`)
console.log('artworks re-foldered:', up.rowCount)
await q(`UPDATE app.customer_artwork SET upload_status='pending' WHERE nextcloud_url IS NULL AND image_data IS NOT NULL AND upload_status <> 'pending'`)

const s = (await q(`SELECT count(*) n, count(nextcloud_url) uploaded FROM app.customer_artwork`)).rows[0]
console.log(`\nDONE — customer_artwork: ${s.n} rows, ${s.uploaded} on NextCloud. Baaki retry-worker chadhayega (NextCloud creds lagne ke baad).`)
await pool.end(); process.exit(0)
