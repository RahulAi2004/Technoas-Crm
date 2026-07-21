// Har maujooda customer folder mein standard dhaancha bana do:
//   references / Artworks / Mockups / Gangsheets / Documents
// Sirf un folders par chalta hai jo NextCloud par PEHLE SE hain (khali folders nahi banata).
// Naye customers ka dhaancha artwork-capture khud bana leta hai.
// Default DRY-RUN — banane ke liye: node --env-file=.env ensure-folders.mjs --apply
import pg from 'pg'
import { ncConfigured, ncEnsureCustomerFolders, CUSTOMER_SUBFOLDERS, NC_ROOT } from './nextcloud.js'

const APPLY = process.argv.includes('--apply')
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 30000, query_timeout: 180000 })

const B = (process.env.NEXTCLOUD_URL || '').replace(/\/+$/, '')
const U = process.env.NEXTCLOUD_USER || ''
const AUTH = 'Basic ' + Buffer.from(`${U}:${process.env.NEXTCLOUD_PASS || ''}`).toString('base64')
const enc = (p) => p.split('/').map(encodeURIComponent).join('/')
const exists = async (p) => {
  try { return (await fetch(`${B}/remote.php/dav/files/${U}/${enc(p)}`, { method: 'HEAD', headers: { Authorization: AUTH }, signal: AbortSignal.timeout(20000) })).status < 400 }
  catch { return false }
}

if (!ncConfigured()) { console.error('NextCloud configured nahi — .env dekhein'); process.exit(1) }
console.log('subfolders:', CUSTOMER_SUBFOLDERS.join(' / '))

const all = (await pool.query(`SELECT DISTINCT folder FROM app.customers WHERE folder IS NOT NULL ORDER BY folder`)).rows.map((r) => r.folder)
console.log(`DB me folder assigned: ${all.length} — dekh rahe hain kaunse NextCloud par sach me hain...`)

// sirf wahi folders jo NextCloud par maujood hain
const present = []
let i = 0
await Promise.all(Array.from({ length: 10 }, async () => {
  while (i < all.length) { const f = all[i++]; if (await exists(`${NC_ROOT}/${f}`)) present.push(f) }
}))
console.log(`NextCloud par maujood: ${present.length}`)

if (!APPLY) {
  console.log('\nmisal:')
  present.slice(0, 3).forEach((f) => CUSTOMER_SUBFOLDERS.forEach((s) => console.log(`   ${NC_ROOT}/${f}/${s}`)))
  console.log(`\nDRY RUN — kuch nahi bana. Apply: node --env-file=.env ensure-folders.mjs --apply`)
  await pool.end(); process.exit(0)
}

let done = 0
let j = 0
await Promise.all(Array.from({ length: 5 }, async () => {
  while (j < present.length) {
    const f = present[j++]
    try { await ncEnsureCustomerFolders(f); done++ } catch (e) { console.log('  fail', f, e.message) }
    if (done % 50 === 0) console.log(`   ${done}/${present.length}`)
  }
}))
console.log(`\n✅ ${done}/${present.length} folders mein dhaancha bana diya`)
await pool.end()
process.exit(0)
