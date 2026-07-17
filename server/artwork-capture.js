// Auto-capture CUSTOMER-SENT (source) artworks → PostgreSQL.
// Har inbound image: SRC-ART-<YY>-<NNNN> number (DB trigger), asli bytes app.customer_artwork.image_data
// mein (Meta CDN links expire hote hain — PG hi source of truth hai), plus lead ke naam ka folder
// disk par bhi (best-effort; Docker mein volume mount karein to persist hoga).
// Agent ke bheje mockups capture NAHI hote (sirf direction='in').
import pg from 'pg'
import { ncConfigured, ncUploadAndShare, ncShareLink, ncRemotePath } from './nextcloud.js'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 20000, query_timeout: 60000 })
const SRC_SUBFOLDER = 'references'   // customer ke bheje files (source/reference material)

async function fetchBytes(url, timeoutMs = 8000) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch { return null }
}

const safeName = (s) => String(s || '').replace(/[^\w\- .]/g, '').replace(/\s+/g, ' ').trim().slice(0, 90)
const extOf = (url, name) => {
  const m = /\.(png|jpe?g|webp|gif)(\?|$)/i.exec(name || '') || /\.(png|jpe?g|webp|gif)(\?|$)/i.exec(url || '')
  return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg'
}

// full_name → { first, last } (folder-safe, underscores)
const partSafe = (s) => String(s || '').normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30)
function splitName(full) {
  const parts = String(full || 'Unknown').trim().split(/\s+/).filter(Boolean)
  const first = partSafe(parts[0]) || 'Unknown'
  const last = partSafe(parts.slice(1).join(' '))
  return { first, last }
}

// customer ka STABLE folder: YYMMDD_Firstname_Lastname (YYMMDD = uske pehle message ki date).
// Ek baar bana ke customers.folder par cache; collision -> _2, _3. Kabhi change nahi.
async function folderForCustomer(customerId, fullName) {
  if (!customerId) {
    const { first, last } = splitName(fullName)
    const ymd = new Date().toISOString().slice(2, 10).replace(/-/g, '')
    return `${ymd}_${first}${last ? '_' + last : ''}`
  }
  const ex = await pool.query(`SELECT folder, full_name FROM app.customers WHERE customer_id = $1`, [customerId])
  if (ex.rows[0]?.folder) return ex.rows[0].folder
  const nm = fullName || ex.rows[0]?.full_name
  const d = await pool.query(
    `SELECT to_char(min(m.created_at), 'YYMMDD') ymd
       FROM app.messages m JOIN app.conversations co ON co.conversation_id = m.conversation_id
      WHERE co.customer_id = $1 AND m.direction = 'in'`, [customerId])
  const ymd = d.rows[0]?.ymd || new Date().toISOString().slice(2, 10).replace(/-/g, '')
  const { first, last } = splitName(nm)
  const base = `${ymd}_${first}${last ? '_' + last : ''}`
  let folder = base, n = 1
  while (true) {                                            // collision -> _2, _3
    const clash = await pool.query(`SELECT 1 FROM app.customers WHERE folder = $1 AND customer_id <> $2`, [folder, customerId])
    if (!clash.rowCount) break
    n++; folder = `${base}_${n}`
  }
  await pool.query(`UPDATE app.customers SET folder = $1 WHERE customer_id = $2 AND folder IS NULL`, [folder, customerId])
  const after = await pool.query(`SELECT folder FROM app.customers WHERE customer_id = $1`, [customerId])
  return after.rows[0]?.folder || folder
}

// ek artwork NextCloud par chadhao + shareable link save karo (best-effort; fail -> pending rehta hai)
export async function pushToNextcloud(row) {
  if (!ncConfigured()) return false
  try {
    const b = row.image_data || (await pool.query(`SELECT image_data FROM app.customer_artwork WHERE artwork_id = $1`, [row.artwork_id])).rows[0]?.image_data
    if (!b) return false
    // sirf upload (tez) — share-link alag worker banata hai (rate-limit se bachne ke liye)
    const res = await ncUploadAndShare({ folder: row.folder, subfolder: SRC_SUBFOLDER, fileName: `${row.artwork_no}.${row.file_type || 'jpg'}`, bytes: b, share: false })
    if (!res) return false
    await pool.query(`UPDATE app.customer_artwork SET upload_status = 'nextcloud_ok' WHERE artwork_id = $1 AND upload_status = 'pending'`, [row.artwork_id])
    return true
  } catch (e) { console.warn('[nextcloud] push failed:', e.message); return false }
}

// conversation (uuid ya legacy id) → customer + latest lead
async function resolveContext(convRef) {
  const r = await pool.query(
    `SELECT co.conversation_id, co.customer_id, c.full_name, l.lead_id, l.lead_no
       FROM app.conversations co
       LEFT JOIN app.customers c ON c.customer_id = co.customer_id
       LEFT JOIN LATERAL (
         SELECT lead_id, lead_no FROM app.leads
          WHERE conversation_id = co.conversation_id OR conversation_primary_id = co.conversation_id
          ORDER BY created_at DESC LIMIT 1
       ) l ON true
      WHERE co.conversation_id::text = $1 OR co.legacy_id = $1
      LIMIT 1`, [String(convRef)])
  return r.rows[0] || null
}

// Ek artwork store karo (dedupe by message_ref). Returns artwork_no ya null.
export async function storeArtwork({ ref, convRef, url, name }) {
  if (!url || !ref) return null
  const dupe = await pool.query(`SELECT 1 FROM app.customer_artwork WHERE message_ref = $1`, [ref])
  if (dupe.rowCount) return null
  const ctx = await resolveContext(convRef)
  const folder = await folderForCustomer(ctx?.customer_id, ctx?.full_name)   // YYMMDD_First_Last
  const buf = await fetchBytes(url)                       // null bhi chalega — record phir bhi banta hai
  const ext = extOf(url, name)
  const ins = await pool.query(
    `INSERT INTO app.customer_artwork
       (lead_id, customer_id, conversation_id, message_ref, folder, file_name, file_type, file_size_bytes, source_url, image_data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (message_ref) DO NOTHING
     RETURNING artwork_id, artwork_no`,
    [ctx?.lead_id || null, ctx?.customer_id || null, ctx?.conversation_id || null, ref, folder,
     safeName(name) || null, ext, buf ? buf.length : null, url, buf])
  const rec = ins.rows[0]
  if (!rec) return null
  // Sirf 2 jagah: bytes PostgreSQL mein (upar ho chuka) + NextCloud pe upload.
  // Local disk pe koi copy NAHI (user ki pref) — PG hi source of truth.
  if (buf) {
    pushToNextcloud({ artwork_id: rec.artwork_id, artwork_no: rec.artwork_no, folder, file_type: ext, image_data: buf }).catch(() => {})
  }
  return rec.artwork_no
}

// RETRY WORKER — pending/nextcloud-less artworks ko NextCloud par chadhata hai (har N min).
// Boot par index.js se ek baar start hota hai; NextCloud configured na ho to kuch nahi karta.
let workerOn = false, workerBusy = false
export function startUploadWorker(intervalMs = 60 * 1000) {
  if (workerOn || !ncConfigured()) return
  workerOn = true
  const drain = async () => {
    if (workerBusy) return
    workerBusy = true
    try {
      let total = 0
      while (true) {
        // select by upload_status (NOT nextcloud_url) — file uploaded but share-link-null bhi 'nextcloud_ok'
        const rows = (await pool.query(
          `SELECT artwork_id, artwork_no, folder, file_type FROM app.customer_artwork
            WHERE image_data IS NOT NULL AND upload_status = 'pending'
            ORDER BY created_at DESC LIMIT 20`)).rows
        if (!rows.length) break
        let i = 0
        const oks = await Promise.all(Array.from({ length: 5 }, async () => {   // 5 concurrent
          let ok = 0
          while (i < rows.length) { const r = rows[i++]; if (await pushToNextcloud(r)) ok++ }
          return ok
        }))
        const batchOk = oks.reduce((a, b) => a + b, 0)
        total += batchOk
        console.log(`[nextcloud] uploaded ${batchOk}/${rows.length} (session total ${total})`)
        if (batchOk === 0) break   // pura batch fail -> NextCloud down/creds -> ruk jao (loop se bacho)
        await new Promise((r) => setTimeout(r, 400))   // CRM/poller ko saans lene do (backend responsive rahe)
      }
    } catch (e) { console.warn('[nextcloud] worker error:', e.message) }
    finally { workerBusy = false }
  }
  setInterval(drain, intervalMs)
  setTimeout(drain, 8000)
  console.log('🗂️  NextCloud upload worker started')
}

// SHARE-LINK WORKER — uploaded files ke liye NextCloud shareable link banata hai, DHEERE
// (OCS share-API rate-limit karta hai). Adaptive: 429 aaye to ruk jao, warna ~1.2s gap.
let shareOn = false
export function startShareWorker() {
  if (shareOn || !ncConfigured()) return
  shareOn = true
  const tick = async () => {
    try {
      const rows = (await pool.query(
        `SELECT artwork_id, artwork_no, folder, file_type FROM app.customer_artwork
          WHERE upload_status = 'nextcloud_ok' AND nextcloud_url IS NULL
          ORDER BY created_at DESC LIMIT 30`)).rows
      let made = 0, throttled = false
      for (const r of rows) {
        const remote = ncRemotePath(r.folder, SRC_SUBFOLDER, `${r.artwork_no}.${r.file_type || 'jpg'}`)
        let url = null
        try { url = await ncShareLink(remote) } catch { /* skip */ }
        if (url) {
          await pool.query(`UPDATE app.customer_artwork SET nextcloud_url = $1 WHERE artwork_id = $2`, [url, r.artwork_id])
          made++
          await new Promise((res) => setTimeout(res, 1200))   // gentle rate
        } else {
          throttled = true
          await new Promise((res) => setTimeout(res, 8000))    // rate-limited -> back off
        }
      }
      if (made || throttled) console.log(`[nextcloud] share-links made ${made}${throttled ? ' (some throttled, will retry)' : ''}`)
    } catch (e) { console.warn('[nextcloud] share worker error:', e.message) }
  }
  setInterval(tick, 45 * 1000)   // har 45s ek pass
  setTimeout(tick, 20000)        // upload worker ko pehle chalne do
  console.log('🔗 NextCloud share-link worker started')
}

// LIVE HOOK — saveMessage se har naye message par (fire-and-forget)
export async function captureSourceArtworks(m) {
  const dir = m.dir || m.direction
  if (dir !== 'in') return                                 // sirf CUSTOMER ke bheje
  const atts = (m.attachments || m.extra?.attachments || []).filter((a) => a && a.type === 'image' && a.url)
  for (let i = 0; i < atts.length; i++) {
    try { await storeArtwork({ ref: `${m.id}#${i}`, convRef: m.conversation_id, url: atts[i].url, name: atts[i].name }) }
    catch (e) { console.warn('[artwork] capture failed:', e.message) }
  }
}

// ---- API helpers ----
export async function listArtworks({ lead_id, customer_id, conversation_id, folder, limit = 100 }) {
  const conds = [], vals = []
  if (lead_id) { vals.push(lead_id); conds.push(`lead_id = $${vals.length}`) }
  if (customer_id) { vals.push(customer_id); conds.push(`customer_id = $${vals.length}`) }
  if (conversation_id) { vals.push(conversation_id); conds.push(`conversation_id = $${vals.length}`) }
  if (folder) { vals.push('%' + folder + '%'); conds.push(`folder ILIKE $${vals.length}`) }
  vals.push(Math.min(Number(limit) || 100, 500))
  const r = await pool.query(
    `SELECT artwork_id, artwork_no, folder, file_type, file_size_bytes,
            (image_data IS NOT NULL) AS has_image, nextcloud_url, gdrive_url, upload_status,
            lead_id, customer_id, created_at
       FROM app.customer_artwork
      ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}
      ORDER BY created_at DESC LIMIT $${vals.length}`, vals)
  return r.rows
}

export async function getArtworkFile(idOrNo) {
  const r = await pool.query(
    `SELECT artwork_no, file_type, image_data FROM app.customer_artwork
      WHERE artwork_id::text = $1 OR artwork_no = $1 LIMIT 1`, [String(idOrNo)])
  return r.rows[0] || null
}
