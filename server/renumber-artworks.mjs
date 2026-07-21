// references/ mein ek saaf, continuous series banao.
// - Customer ki files : AW-<CLIENT>-0001-SRC, 0002, 0003 … koi gap nahi
// - Hamari bheji files: apni alag series AW-<CLIENT>-0001-OUT (SRC ke numbers nahi khaati)
// NextCloud par file rename (MOVE) bhi hota hai. Purane naam mapping file mein save hote hain.
// Default DRY-RUN — likhne ke liye: node --env-file=.env renumber-artworks.mjs --apply
import fs from 'node:fs'
import pg from 'pg'
import { ncRemotePath, ncConfigured } from './nextcloud.js'

const APPLY = process.argv.includes('--apply')
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 30000, query_timeout: 300000 })

const B = (process.env.NEXTCLOUD_URL || '').replace(/\/+$/, '')
const U = process.env.NEXTCLOUD_USER || ''
const AUTH = 'Basic ' + Buffer.from(`${U}:${process.env.NEXTCLOUD_PASS || ''}`).toString('base64')
const dav = (p) => `${B}/remote.php/dav/files/${U}/${p.split('/').map(encodeURIComponent).join('/')}`

if (!ncConfigured()) { console.error('NextCloud configured nahi — .env dekhein'); process.exit(1) }

// Sab artworks, customer ke hisaab se, purane se naye tak
const rows = (await pool.query(
  `SELECT a.artwork_id, a.artwork_no, a.folder, a.file_type, a.upload_status,
          (a.message_ref LIKE 'out:%') AS is_out, c.client_code
     FROM app.customer_artwork a
     JOIN app.customers c ON c.customer_id = a.customer_id
    WHERE c.client_code IS NOT NULL
    ORDER BY c.client_code, a.created_at, a.artwork_id`)).rows

// Do alag counter: SRC (customer ki) aur OUT (hamari)
const seq = {}
const plan = []
for (const r of rows) {
  const kind = r.is_out ? 'OUT' : 'SRC'
  const key = `${r.client_code}|${kind}`
  seq[key] = (seq[key] || 0) + 1
  const newNo = `AW-${r.client_code}-${String(seq[key]).padStart(4, '0')}-${kind}`
  if (newNo !== r.artwork_no) plan.push({ ...r, newNo })
}

console.log(`kul artworks: ${rows.length} | rename hone wale: ${plan.length}`)
const onNc = plan.filter((p) => p.upload_status === 'nextcloud_ok' && !p.is_out)
console.log(`NextCloud par file rename hogi: ${onNc.length}`)
console.log('\nmisal (David Farrar):')
plan.filter((p) => p.client_code === 'DFA01').slice(0, 8)
  .forEach((p) => console.log(`   ${p.artwork_no}  ->  ${p.newNo}${p.is_out ? '   (hamari bheji)' : ''}`))

if (!APPLY) {
  console.log('\nDRY RUN — kuch nahi badla. Apply: node --env-file=.env renumber-artworks.mjs --apply')
  await pool.end(); process.exit(0)
}

fs.writeFileSync('renumber-map.json', JSON.stringify(plan.map((p) => ({ id: p.artwork_id, old: p.artwork_no, new: p.newNo, folder: p.folder })), null, 1))
console.log('\npurane naam renumber-map.json mein save (wapas laane ke liye)')

// 1) NextCloud par rename. Ascending order mein target slot hamesha khaali hota hai.
let moved = 0, missing = 0, failed = 0
for (const p of onNc) {
  const ext = p.file_type || 'jpg'
  const from = ncRemotePath(p.folder, 'references', `${p.artwork_no}.${ext}`)
  const to = ncRemotePath(p.folder, 'references', `${p.newNo}.${ext}`)
  try {
    const res = await fetch(dav(from), { method: 'MOVE', headers: { Authorization: AUTH, Destination: dav(to) }, signal: AbortSignal.timeout(60000) })
    if (res.ok || res.status === 201 || res.status === 204) moved++
    else if (res.status === 404) missing++
    else { failed++; if (failed < 4) console.log('  MOVE fail', res.status, from) }
  } catch (e) { failed++; if (failed < 4) console.log('  ERR', e.message) }
  if ((moved + missing + failed) % 200 === 0) console.log(`   ${moved + missing + failed}/${onNc.length}`)
}
console.log(`NextCloud: moved ${moved} | nahi mili ${missing} | fail ${failed}`)

// 2) DB rename — do phase, warna UNIQUE(artwork_no) beech mein takra jayega
const client = await pool.connect()
try {
  await client.query('BEGIN')
  // temp naam chhota rakho — artwork_no varchar(30) hai
  for (let i = 0; i < plan.length; i++) await client.query(`UPDATE app.customer_artwork SET artwork_no = $1 WHERE artwork_id = $2`, [`TMP-${String(i).padStart(6, '0')}`, plan[i].artwork_id])
  for (const p of plan) await client.query(`UPDATE app.customer_artwork SET artwork_no = $1, nextcloud_url = NULL WHERE artwork_id = $2`, [p.newNo, p.artwork_id])
  await client.query('COMMIT')
  console.log(`DB: ${plan.length} numbers update`)
} catch (e) { await client.query('ROLLBACK'); console.error('DB rollback:', e.message); process.exit(1) }
finally { client.release() }

// 3) counters ko asli max par set karo taaki naye artworks wahin se chalein
for (const [key, n] of Object.entries(seq)) {
  const [code, kind] = key.split('|')
  await pool.query(
    `INSERT INTO app.series_counters(key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [kind === 'OUT' ? `AWOUT-${code}` : `AW-${code}`, n])
}
console.log('counters reset ✅')
await pool.end()
process.exit(0)
