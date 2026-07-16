// PostgreSQL se saare artworks disk par export karo — customer/lead-naam wale folder mein,
// current artwork_no naam se (AW-<CLIENT>-<NNNN>-SRC.jpg). Purane naam ki files hata di jati hain.
// PG hi source of truth hai — ye sirf browse karne ke liye disk copy hai. Re-runnable.
// Run:  node --env-file=.env export-artworks.js
import pg from 'pg'
import fs from 'fs'
import path from 'path'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 30000, query_timeout: 300000 })
const ARTWORK_DIR = process.env.ARTWORK_DIR || path.resolve('./artworks')

const rows = (await pool.query(
  `SELECT artwork_no, legacy_no, folder, file_type, image_data
     FROM app.customer_artwork WHERE image_data IS NOT NULL ORDER BY folder, artwork_no`)).rows
console.log('artworks with bytes:', rows.length)

let written = 0, cleaned = 0
for (const r of rows) {
  const dir = path.join(ARTWORK_DIR, r.folder || 'NO-FOLDER')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${r.artwork_no}.${r.file_type || 'jpg'}`)
  if (!fs.existsSync(file)) { fs.writeFileSync(file, r.image_data); written++ }
  // purane naam ki file (SRC-ART-…) hata do
  if (r.legacy_no) {
    const old = path.join(dir, `${r.legacy_no}.${r.file_type || 'jpg'}`)
    if (fs.existsSync(old)) { fs.unlinkSync(old); cleaned++ }
  }
}
console.log(`DONE — written=${written}, old-name files removed=${cleaned}`)
console.log('folder root:', ARTWORK_DIR)
await pool.end(); process.exit(0)
