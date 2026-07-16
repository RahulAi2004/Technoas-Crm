// PostgreSQL se saare artworks disk par export karo — lead/customer-naam wale folder mein,
// current artwork_no naam se (AW-<CLIENT>-<NNNN>-SRC.jpg). Purane naam (legacy_no) ki files hata deta hai.
// BATCH-WISE (remote DB par 217MB ek saath nahi khinchta). PG source of truth hai; ye sirf disk copy hai.
// Re-runnable (jo file already sahi naam se hai use chhodta hai).   Run: node --env-file=.env export-artworks.js
import pg from 'pg'
import fs from 'fs'
import path from 'path'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 30000, query_timeout: 120000 })
async function q(sql, params, tries = 5) {
  for (let i = 0; i < tries; i++) { try { return await pool.query(sql, params) } catch (e) { if (i === tries - 1) throw e; console.log(`retry ${i + 1}: ${e.message.slice(0, 60)}`); await new Promise(r => setTimeout(r, 2500)) } }
}
const ARTWORK_DIR = process.env.ARTWORK_DIR || path.resolve('./artworks')

// 1) sirf metadata (halki query)
const list = (await q(`SELECT artwork_id, artwork_no, legacy_no, folder, file_type
  FROM app.customer_artwork WHERE image_data IS NOT NULL ORDER BY folder, artwork_no`)).rows
console.log('artworks with bytes:', list.length)

let written = 0, skipped = 0, cleaned = 0, done = 0
for (const r of list) {
  const dir = path.join(ARTWORK_DIR, r.folder || 'NO-FOLDER')
  const file = path.join(dir, `${r.artwork_no}.${r.file_type || 'jpg'}`)
  // purani legacy-naam file hatao (agar hai)
  if (r.legacy_no) {
    const old = path.join(dir, `${r.legacy_no}.${r.file_type || 'jpg'}`)
    if (fs.existsSync(old)) { try { fs.unlinkSync(old); cleaned++ } catch {} }
  }
  if (fs.existsSync(file)) { skipped++ }
  else {
    // 2) bytes EK row ke liye (chhoti query — remote-safe)
    const b = (await q(`SELECT image_data FROM app.customer_artwork WHERE artwork_id = $1`, [r.artwork_id])).rows[0]
    if (b?.image_data) {
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(file, b.image_data)
      written++
    }
  }
  if (++done % 200 === 0) console.log(`[${done}/${list.length}] written=${written} skipped=${skipped} old-removed=${cleaned}`)
}
console.log(`\nDONE — written=${written}, already-there=${skipped}, old-name removed=${cleaned}`)
console.log('folder root:', ARTWORK_DIR)
await pool.end(); process.exit(0)
