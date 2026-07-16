// Auto-capture CUSTOMER-SENT (source) artworks → PostgreSQL.
// Har inbound image: SRC-ART-<YY>-<NNNN> number (DB trigger), asli bytes app.customer_artwork.image_data
// mein (Meta CDN links expire hote hain — PG hi source of truth hai), plus lead ke naam ka folder
// disk par bhi (best-effort; Docker mein volume mount karein to persist hoga).
// Agent ke bheje mockups capture NAHI hote (sirf direction='in').
import pg from 'pg'
import fs from 'fs'
import path from 'path'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 20000, query_timeout: 60000 })
const ARTWORK_DIR = process.env.ARTWORK_DIR || path.resolve('./artworks')

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
  const folder = safeName(`${ctx?.lead_no || 'NO-LEAD'} ${ctx?.full_name || 'Unknown'}`)
  const buf = await fetchBytes(url)                       // null bhi chalega — record phir bhi banta hai
  const ext = extOf(url, name)
  const ins = await pool.query(
    `INSERT INTO app.customer_artwork
       (lead_id, customer_id, conversation_id, message_ref, folder, file_name, file_type, file_size_bytes, source_url, image_data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (message_ref) DO NOTHING
     RETURNING artwork_no`,
    [ctx?.lead_id || null, ctx?.customer_id || null, ctx?.conversation_id || null, ref, folder,
     safeName(name) || null, ext, buf ? buf.length : null, url, buf])
  const no = ins.rows[0]?.artwork_no || null
  // disk copy (best-effort) — folder = lead ka naam
  if (no && buf) {
    try {
      const dir = path.join(ARTWORK_DIR, folder)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, `${no}.${ext}`), buf)
    } catch { /* disk optional — PG is the source of truth */ }
  }
  return no
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
            (image_data IS NOT NULL) AS has_image, lead_id, customer_id, created_at
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
