// Direction bug ki wajah se hamare bheje mockups customer ke `references/` folder mein
// chale gaye the. Ye script unhe `sent/` mein shift karta hai (NextCloud par MOVE) aur
// message_ref par 'out:' prefix laga deta hai taaki aage se worker sahi path bana sake.
// Default DRY-RUN — likhne ke liye: node --env-file=.env move-sent-artworks.mjs --apply
import pg from 'pg'
import { ncEnsureFolder, ncRemotePath, NC_ROOT, ncConfigured } from './nextcloud.js'

const APPLY = process.argv.includes('--apply')
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 30000, query_timeout: 180000 })

const B = (process.env.NEXTCLOUD_URL || '').replace(/\/+$/, '')
const U = process.env.NEXTCLOUD_USER || ''
const AUTH = 'Basic ' + Buffer.from(`${U}:${process.env.NEXTCLOUD_PASS || ''}`).toString('base64')
const dav = (p) => `${B}/remote.php/dav/files/${U}/${p.split('/').map(encodeURIComponent).join('/')}`

if (!ncConfigured()) { console.error('NextCloud configured nahi hai — .env dekhein'); process.exit(1) }

// Artworks jinka message ab 'out' hai (yaani hamne bheja tha) par ref par prefix nahi hai
const rows = (await pool.query(
  `SELECT a.artwork_id, a.artwork_no, a.folder, a.file_type, a.message_ref, a.upload_status
     FROM app.customer_artwork a
    WHERE a.message_ref NOT LIKE 'out:%'
      AND EXISTS (SELECT 1 FROM app.messages m
                   WHERE m.extra->>'id' = split_part(a.message_ref, '#', 1)
                     AND m.direction = 'out')
    ORDER BY a.created_at`)).rows

console.log(`hamare bheje artworks jo customer ke references/ mein hain: ${rows.length}`)
if (!rows.length) { await pool.end(); process.exit(0) }
console.log('sample:')
rows.slice(0, 3).forEach((r) => console.log(`   ${r.folder}/references/${r.artwork_no}.${r.file_type}  ->  ${r.folder}/sent/${r.artwork_no}.${r.file_type}`))

if (!APPLY) {
  console.log('\nDRY RUN — kuch nahi badla. Apply: node --env-file=.env move-sent-artworks.mjs --apply')
  await pool.end(); process.exit(0)
}

let moved = 0, missing = 0, failed = 0
const madeDirs = new Set()
for (const r of rows) {
  const file = `${r.artwork_no}.${r.file_type || 'jpg'}`
  const from = ncRemotePath(r.folder, 'references', file)
  const to = ncRemotePath(r.folder, 'sent', file)
  try {
    const dir = [...NC_ROOT.split('/').filter(Boolean), r.folder, 'sent']
    const key = dir.join('/')
    if (!madeDirs.has(key)) { await ncEnsureFolder(dir); madeDirs.add(key) }
    const res = await fetch(dav(from), {
      method: 'MOVE',
      headers: { Authorization: AUTH, Destination: dav(to), Overwrite: 'T' },
      signal: AbortSignal.timeout(60000),
    })
    if (res.ok || res.status === 201 || res.status === 204) moved++
    else if (res.status === 404) missing++          // upload hua hi nahi tha — sirf ref theek karo
    else { failed++; if (failed < 4) console.log('  MOVE fail', res.status, from) }
  } catch (e) { failed++; if (failed < 4) console.log('  ERR', e.message) }

  // ref par prefix + share-link reset (purana link ab galat path par hai)
  await pool.query(
    `UPDATE app.customer_artwork SET message_ref = 'out:' || message_ref, nextcloud_url = NULL
      WHERE artwork_id = $1`, [r.artwork_id])
}
console.log(`\n✅ moved ${moved} | NextCloud par nahi tha ${missing} | fail ${failed}`)
await pool.end()
process.exit(0)
