// Kuch artworks "YYMMDD_Unknown" folder mein phans gaye — capture ke waqt customer link
// abhi likha nahi gaya tha (write-queue race). Ye script unhe asli customer se jodta hai:
// customer_id + sahi folder + sahi AW-<CLIENT>-NNNN-SRC number, aur NextCloud par file ko
// purane "Unknown" folder se asli customer ke folder mein MOVE karta hai.
// Default DRY-RUN — likhne ke liye: node --env-file=.env fix-unknown-artworks.mjs --apply
import pg from 'pg'
import { ncRemotePath, ncEnsureCustomerFolders, ncConfigured } from './nextcloud.js'

const APPLY = process.argv.includes('--apply')
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 30000, query_timeout: 180000 })

const B = (process.env.NEXTCLOUD_URL || '').replace(/\/+$/, '')
const U = process.env.NEXTCLOUD_USER || ''
const AUTH = 'Basic ' + Buffer.from(`${U}:${process.env.NEXTCLOUD_PASS || ''}`).toString('base64')
const dav = (p) => `${B}/remote.php/dav/files/${U}/${p.split('/').map(encodeURIComponent).join('/')}`

if (!ncConfigured()) { console.error('NextCloud configured nahi — .env dekhein'); process.exit(1) }

// folder naam wahi rule jo artwork-capture use karta hai
const partSafe = (s) => String(s || '').normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30)

const rows = (await pool.query(
  `SELECT a.artwork_id, a.artwork_no, a.folder AS old_folder, a.file_type, a.upload_status,
          (a.message_ref LIKE 'out:%') AS is_out,
          coalesce(co.customer_id, c2.customer_id) AS real_customer_id
     FROM app.customer_artwork a
     JOIN app.conversations co ON co.conversation_id = a.conversation_id
     LEFT JOIN app.customers c2 ON c2.legacy_id = 'cust:' || co.legacy_id
    WHERE a.customer_id IS NULL
      AND coalesce(co.customer_id, c2.customer_id) IS NOT NULL
    ORDER BY a.created_at`)).rows

console.log(`"Unknown" mein phanse artworks jo theek ho sakte hain: ${rows.length}`)
if (!rows.length) { await pool.end(); process.exit(0) }

const plan = []
for (const r of rows) {
  const c = (await pool.query(
    `SELECT customer_id, full_name, client_code, folder FROM app.customers WHERE customer_id = $1`, [r.real_customer_id])).rows[0]
  if (!c) continue
  let newFolder = c.folder
  if (!newFolder) {
    const d = await pool.query(
      `SELECT to_char(min(m.created_at), 'YYMMDD') ymd FROM app.messages m
         JOIN app.conversations co ON co.conversation_id = m.conversation_id
        WHERE co.customer_id = $1 AND m.direction = 'in'`, [c.customer_id])
    const ymd = d.rows[0]?.ymd || '000000'
    const parts = String(c.full_name || 'Unknown').trim().split(/\s+/).filter(Boolean).map(partSafe).filter(Boolean)
    newFolder = `${ymd}_${parts.join('_') || 'Unknown'}`
  }
  plan.push({ ...r, cust: c, newFolder })
}

console.log('misal:')
plan.slice(0, 5).forEach((p) =>
  console.log(`   ${p.old_folder}/${p.artwork_no}  ->  ${p.newFolder}  (${p.cust.full_name} / ${p.cust.client_code})`))

if (!APPLY) {
  console.log(`\nDRY RUN — kuch nahi badla. Apply: node --env-file=.env fix-unknown-artworks.mjs --apply`)
  await pool.end(); process.exit(0)
}

let moved = 0, missing = 0, failed = 0
for (const p of plan) {
  const code = p.cust.client_code || 'UNK00'
  const n = (await pool.query(`SELECT app.next_series($1) AS n`, [`${p.is_out ? 'AWOUT' : 'AW'}-${code}`])).rows[0].n
  const newNo = `AW-${code}-${String(n).padStart(4, '0')}-${p.is_out ? 'OUT' : 'SRC'}`
  const sub = p.is_out ? 'sent' : 'references'
  const ext = p.file_type || 'jpg'

  if (p.upload_status === 'nextcloud_ok' && !p.is_out) {
    try {
      await ncEnsureCustomerFolders(p.newFolder)
      const from = ncRemotePath(p.old_folder, sub, `${p.artwork_no}.${ext}`)
      const to = ncRemotePath(p.newFolder, sub, `${newNo}.${ext}`)
      const mv = await fetch(dav(from), { method: 'MOVE', headers: { Authorization: AUTH, Destination: dav(to), Overwrite: 'T' }, signal: AbortSignal.timeout(60000) })
      if (mv.ok || mv.status === 201 || mv.status === 204) moved++
      else if (mv.status === 404) missing++
      else { failed++; if (failed < 4) console.log('  MOVE fail', mv.status, from) }
    } catch (e) { failed++; if (failed < 4) console.log('  ERR', e.message) }
  }

  await pool.query(
    `UPDATE app.customer_artwork SET customer_id = $1, folder = $2, artwork_no = $3, nextcloud_url = NULL
      WHERE artwork_id = $4`, [p.cust.customer_id, p.newFolder, newNo, p.artwork_id])
  await pool.query(`UPDATE app.customers SET folder = $1 WHERE customer_id = $2 AND folder IS NULL`, [p.newFolder, p.cust.customer_id])
}
console.log(`\n✅ ${plan.length} artworks jode gaye | NextCloud moved ${moved} | nahi mili ${missing} | fail ${failed}`)
await pool.end()
process.exit(0)
