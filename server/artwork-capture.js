// Auto-capture chat artworks → PostgreSQL → NextCloud.
// Har image ka number DB trigger deta hai; asli bytes app.customer_artwork.image_data mein
// jate hain (Meta CDN links expire hote hain — PG hi source of truth hai).
// NextCloud mein customer ke bheje files `references/` mein, hamare bheje mockups `sent/` mein.
// Local disk par koi copy nahi.
import pg from 'pg'
import { ncConfigured, ncUploadAndShare, ncShareLink, ncRemotePath, ncEnsureCustomerFolders, ncEnsureFolder, ncGet, ncPut, ncMove, NC_ROOT } from './nextcloud.js'

// Client ke bheje (SRC) images ka NextCloud auto-upload DEFAULT band hai — pehle sab
// apne-aap references/ me chale jate the (stickers/junk bhi), jise agent ab Files tab se
// khud SRC/REF/DOCS/TRASH me route karta hai. Hamare bheje mockups (OUT/combo) waise hi
// jate rahenge. Purana behaviour wapas chahiye to env AUTO_NC_PUSH=1 kar do.
const AUTO_NC_PUSH = process.env.AUTO_NC_PUSH === '1'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 20000, query_timeout: 60000 })
const SRC_SUBFOLDER = 'references'   // customer ke bheje files (source/reference material)
const OUT_SUBFOLDER = 'sent'         // HUM ne bheje files (mockups, proofs, gang sheets)
const COMBO_SUBFOLDER = 'Combos'     // combined/final combo artwork

// Dono taraf ki files ek hi table mein hain; kis taraf ki hai ye message_ref ke prefix se
// pata chalta hai ('out:' = hamari bheji, 'combo:' = combo). Isse alag column ki zaroorat nahi.
const OUT_REF = 'out:'
const COMBO_REF = 'combo:'
const isOut = (ref) => String(ref || '').startsWith(OUT_REF)
const isCombo = (ref) => String(ref || '').startsWith(COMBO_REF)
export const subfolderForRef = (ref) => isCombo(ref) ? COMBO_SUBFOLDER : isOut(ref) ? OUT_SUBFOLDER : SRC_SUBFOLDER
const kindForRef = (ref) => isCombo(ref) ? 'CMB' : isOut(ref) ? 'OUT' : 'SRC'

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

// har folder ka dhaancha ek hi baar banana hai — process ke andar yaad rakho
const foldersReady = new Set()

// ek artwork NextCloud par chadhao + shareable link save karo (best-effort; fail -> pending rehta hai)
export async function pushToNextcloud(row) {
  if (!ncConfigured()) return false
  try {
    const b = row.image_data || (await pool.query(`SELECT image_data FROM app.customer_artwork WHERE artwork_id = $1`, [row.artwork_id])).rows[0]?.image_data
    if (!b) return false
    // pehli baar is customer ka folder chhuo to poora dhaancha bana do
    if (row.folder && !foldersReady.has(row.folder)) {
      await ncEnsureCustomerFolders(row.folder)
      foldersReady.add(row.folder)
    }
    // sirf upload (tez) — share-link alag worker banata hai (rate-limit se bachne ke liye)
    const res = await ncUploadAndShare({ folder: row.folder, subfolder: subfolderForRef(row.message_ref), fileName: `${row.artwork_no}.${row.file_type || 'jpg'}`, bytes: b, share: false })
    if (!res) return false
    // NextCloud pe chala gaya -> PG se bytes HATA do (storage bachane ko). Chat isse ab NextCloud
    // se serve karega (getArtworkFileByName -> ncFetchBytes). nextcloud_url share-worker set karega.
    await pool.query(`UPDATE app.customer_artwork SET upload_status = 'nextcloud_ok', image_data = NULL WHERE artwork_id = $1`, [row.artwork_id])
    if (b && row.artwork_no) ncCacheSet(row.artwork_no, b)   // abhi ke liye cache mein (turant serve ho jaye)
    return true
  } catch (e) { console.warn('[nextcloud] push failed:', e.message); return false }
}

// conversation (uuid ya legacy id) → customer + latest lead
async function resolveContext(convRef) {
  const r = await pool.query(
    `SELECT co.conversation_id, co.customer_id, co.legacy_id, c.full_name, c.client_code, l.lead_id, l.lead_no
       FROM app.conversations co
       LEFT JOIN app.customers c ON c.customer_id = co.customer_id
       LEFT JOIN LATERAL (
         SELECT lead_id, lead_no FROM app.leads
          WHERE conversation_id = co.conversation_id OR conversation_primary_id = co.conversation_id
          ORDER BY created_at DESC LIMIT 1
       ) l ON true
      WHERE co.conversation_id::text = $1 OR co.legacy_id = $1
      LIMIT 1`, [String(convRef)])
  const ctx = r.rows[0] || null

  // Naya customer aur uski pehli image ek saath aate hain, aur customer link write-queue se
  // thodi der baad likha jata hai. Us race mein customer_id abhi NULL hota hai aur file
  // "YYMMDD_Unknown" folder mein chali jati hai. customers.legacy_id hamesha
  // 'cust:' + conversation ki legacy_id hoti hai — usi se seedha customer nikal lo.
  if (ctx && !ctx.customer_id && ctx.legacy_id) {
    const c = await pool.query(
      `SELECT customer_id, full_name, client_code FROM app.customers WHERE legacy_id = $1 LIMIT 1`,
      [`cust:${ctx.legacy_id}`])
    if (c.rows[0]) Object.assign(ctx, c.rows[0])
  }
  return ctx
}

// Artwork number yahin bana lo — DB trigger sab ko '-SRC' de deta hai aur customer ki
// series ka number kharch kar deta hai, jis se references/ mein gaps ban jate hain.
// Trigger sirf tab lagta hai jab artwork_no NULL ho, isliye bhar kar bhejna hi kaafi hai.
//   customer ki file -> AW-<CLIENT>-NNNN-SRC   (series: AW-<CLIENT>)
//   hamari bheji     -> AW-<CLIENT>-NNNN-OUT   (series: AWOUT-<CLIENT>, alag counter)
//   combo/final      -> AW-<CLIENT>-NNNN-CMB   (series: AWCMB-<CLIENT>, alag counter)
async function nextArtworkNo(clientCode, kind = 'SRC') {
  const code = clientCode || 'UNK00'
  const prefix = kind === 'OUT' ? 'AWOUT' : kind === 'CMB' ? 'AWCMB' : 'AW'
  const r = await pool.query(`SELECT app.next_series($1) AS n`, [`${prefix}-${code}`])
  return `AW-${code}-${String(r.rows[0].n).padStart(4, '0')}-${kind}`
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
  const artworkNo = await nextArtworkNo(ctx?.client_code, kindForRef(ref))
  // Client-sent (SRC) file: auto-push default OFF -> 'held' (bytes PG me rehte hain preview ke
  // liye; retry-worker 'held' ko chhuta nahi). Hamare bheje (OUT/combo) -> 'pending' -> upload.
  const holdSrc = !isOut(ref) && !isCombo(ref) && !AUTO_NC_PUSH
  const status = holdSrc ? 'held' : 'pending'
  const ins = await pool.query(
    `INSERT INTO app.customer_artwork
       (lead_id, customer_id, conversation_id, message_ref, folder, file_name, file_type, file_size_bytes, source_url, image_data, artwork_no, upload_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (message_ref) DO NOTHING
     RETURNING artwork_id, artwork_no`,
    [ctx?.lead_id || null, ctx?.customer_id || null, ctx?.conversation_id || null, ref, folder,
     safeName(name) || null, ext, buf ? buf.length : null, url, buf, artworkNo, status])
  const rec = ins.rows[0]
  if (!rec) return null
  // OUT/combo (hamare bheje mockups/proofs) hamesha NextCloud pe (sent/ subfolder). Client SRC
  // sirf tab jab AUTO_NC_PUSH on ho; warna Files tab se agent manually route karega.
  if (buf && !holdSrc) {
    pushToNextcloud({ artwork_id: rec.artwork_id, artwork_no: rec.artwork_no, folder, file_type: ext, message_ref: ref, image_data: buf }).catch(() => {})
  }
  return rec.artwork_no
}

// Bheji hui file — bytes seedhe (URL se download nahi). PG mein pg_only. Returns artwork_no.
// Chat composer se bheji image/file isi se save hoti hai taaki hum use PG se serve kar sakein.
export async function storeArtworkBytes({ ref, convRef, buffer, fileName, fileType }) {
  if (!buffer || !ref) return null
  const dupe = await pool.query(`SELECT artwork_no FROM app.customer_artwork WHERE message_ref = $1`, [ref])
  if (dupe.rows[0]) return dupe.rows[0].artwork_no
  const ctx = await resolveContext(convRef)
  const folder = await folderForCustomer(ctx?.customer_id, ctx?.full_name)
  const ext = (fileType || '').split('/')[1]?.replace('jpeg', 'jpg') || extOf('', fileName)
  const artworkNo = await nextArtworkNo(ctx?.client_code, kindForRef(ref))
  const ins = await pool.query(
    `INSERT INTO app.customer_artwork
       (lead_id, customer_id, conversation_id, message_ref, folder, file_name, file_type, file_size_bytes, image_data, artwork_no, upload_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending')
     ON CONFLICT (message_ref) DO NOTHING
     RETURNING artwork_id, artwork_no`,
    [ctx?.lead_id || null, ctx?.customer_id || null, ctx?.conversation_id || null, ref, folder,
     safeName(fileName) || null, ext, buffer.length, buffer, artworkNo])
  const rec = ins.rows[0]
  // Bheji file ab NextCloud pe bhi jaati hai (upload hote hi PG se bytes hat jate hain).
  if (rec) pushToNextcloud({ artwork_id: rec.artwork_id, artwork_no: rec.artwork_no, folder, file_type: ext, message_ref: ref, image_data: buffer }).catch(() => {})
  return rec?.artwork_no || artworkNo
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
          `SELECT artwork_id, artwork_no, folder, file_type, message_ref FROM app.customer_artwork
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

// SHARE-LINK WORKER — uploaded files ke liye NextCloud shareable link banata hai, DHEERE.
// shareBusy guard: ek waqt me sirf EK tick (warna ticks overlap ho kar NextCloud ko hammer
// karte the aur backend ko dabate the). Throttle (429) aate hi tick ROK do — agli baar retry.
let shareOn = false, shareBusy = false
export function startShareWorker() {
  if (shareOn || !ncConfigured()) return
  shareOn = true
  const tick = async () => {
    if (shareBusy) return               // pichhla tick abhi chal raha -> skip (overlap band)
    shareBusy = true
    try {
      const rows = (await pool.query(
        `SELECT artwork_id, artwork_no, folder, file_type, message_ref FROM app.customer_artwork
          WHERE upload_status = 'nextcloud_ok' AND nextcloud_url IS NULL
          ORDER BY created_at DESC LIMIT 15`)).rows
      let made = 0
      for (const r of rows) {
        const remote = ncRemotePath(r.folder, subfolderForRef(r.message_ref), `${r.artwork_no}.${r.file_type || 'jpg'}`)
        let url = null
        try { url = await ncShareLink(remote) } catch { /* skip */ }
        if (url) {
          await pool.query(`UPDATE app.customer_artwork SET nextcloud_url = $1 WHERE artwork_id = $2`, [url, r.artwork_id])
          made++
          await new Promise((res) => setTimeout(res, 1500))   // gentle rate
        } else {
          break   // throttle/fail -> is tick ko yahin rok do, agla tick 2 min baad retry karega
        }
      }
      if (made) console.log(`[nextcloud] share-links made ${made}`)
    } catch (e) { console.warn('[nextcloud] share worker error:', e.message) }
    finally { shareBusy = false }
  }
  setInterval(tick, 120 * 1000)   // har 2 min ek pass (share-link zaroori nahi, dheere theek)
  setTimeout(tick, 30000)
  console.log('🔗 NextCloud share-link worker started')
}

// SELF-HEAL — capture ke waqt fetchBytes fail ho to row bina bytes ke ban jaati hai
// (image_data NULL). Aisi rows chat mein "broken image" dikhati hain (/api/artwork-file 404).
// Ye worker un rows ko source_url se dobara download karke image_data bhar deta hai — bina
// send/dedup logic ko chhue. Meta CDN link 2-3 hafte mein expire hota hai, isliye backfill
// jitni jaldi ho utni behtar; expire ho chuki links skip ho jati hain (koi harm nahi).
let backfillOn = false, backfillBusy = false
// Ek row ka source_url download karo. { buf } = mil gaya; { gone:true } = link permanently
// expire (Meta CDN 403/404/410) -> dobara mat try karo; kuch nahi = transient, agli baar retry.
async function fetchForBackfill(url, timeoutMs = 8000) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, signal: AbortSignal.timeout(timeoutMs) })
    if (res.ok) return { buf: Buffer.from(await res.arrayBuffer()) }
    if ([400, 401, 403, 404, 410].includes(res.status)) return { gone: true }   // link mar chuka
    return {}                                                                     // 5xx/timeout -> transient
  } catch { return {} }
}
export async function backfillMissingBytes(limit = 40) {
  // 'bytes_lost' = source_url expire ho chuka, bytes recover nahi ho sakte -> skip (worker spin na kare)
  const rows = (await pool.query(
    `SELECT artwork_id, source_url FROM app.customer_artwork
      WHERE image_data IS NULL AND source_url IS NOT NULL AND upload_status NOT IN ('bytes_lost', 'nextcloud_ok')
      ORDER BY created_at DESC LIMIT $1`, [limit])).rows
  if (!rows.length) return { seen: 0, fixed: 0, lost: 0 }
  let fixed = 0, lost = 0, i = 0
  await Promise.all(Array.from({ length: 6 }, async () => {   // 6 concurrent downloads
    while (i < rows.length) {
      const r = rows[i++]
      const { buf, gone } = await fetchForBackfill(r.source_url)
      try {
        if (buf && buf.length) {
          await pool.query(
            `UPDATE app.customer_artwork SET image_data = $1, file_size_bytes = $2 WHERE artwork_id = $3`,
            [buf, buf.length, r.artwork_id])
          fixed++
        } else if (gone) {
          await pool.query(`UPDATE app.customer_artwork SET upload_status = 'bytes_lost' WHERE artwork_id = $1`, [r.artwork_id])
          lost++
        }   // transient: kuch mat karo, agli tick retry karegi
      } catch { /* next tick retry karega */ }
    }
  }))
  return { seen: rows.length, fixed, lost }
}
export function startBackfillWorker(intervalMs = 3 * 60 * 1000) {
  if (backfillOn) return
  backfillOn = true
  const tick = async () => {
    if (backfillBusy) return
    backfillBusy = true
    try {
      const { seen, fixed, lost } = await backfillMissingBytes(40)
      if (fixed || lost) console.log(`🖼️  backfill: recovered ${fixed}, gave up on ${lost} (batch ${seen})`)
    } catch (e) { console.warn('[backfill] error:', e.message) }
    finally { backfillBusy = false }
  }
  setTimeout(tick, 15000)
  setInterval(tick, intervalMs)
  console.log('🩹 artwork byte-backfill worker started')
}

// LIVE HOOK — saveMessage se har naye message par (fire-and-forget).
// Dono taraf ki images save hoti hain: customer ki -> references/, hamari -> sent/.
// Meta ke CDN links kuch hafton mein expire ho jate hain, isliye hamare bheje mockups
// ki apni copy bhi rakhni zaroori hai — warna proof-of-design kho jata hai.
export async function captureSourceArtworks(m) {
  const dir = m.dir || m.direction
  if (dir !== 'in' && dir !== 'out') return                 // notes waghera skip
  const atts = (m.attachments || m.extra?.attachments || []).filter((a) => a && a.type === 'image' && a.url)
  const prefix = dir === 'out' ? OUT_REF : ''
  for (let i = 0; i < atts.length; i++) {
    try { await storeArtwork({ ref: `${prefix}${m.id}#${i}`, convRef: m.conversation_id, url: atts[i].url, name: atts[i].name }) }
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

// NextCloud pe upload hone ke baad bytes PG se hata dete hain (storage bachane ko). Serve karte
// waqt agar image_data NULL ho par row NextCloud pe ho, to WebDAV se bytes laa kar dete hain.
// Chhota in-memory cache taaki baar-baar wahi image NextCloud se na kheenchni pade.
const ncCache = new Map()   // artwork_no -> { buf, at }
const NC_CACHE_MAX = 150, NC_CACHE_TTL = 10 * 60 * 1000
function ncCacheGet(key) {
  const e = ncCache.get(key)
  if (e && Date.now() - e.at < NC_CACHE_TTL) { ncCache.delete(key); ncCache.set(key, e); return e.buf }  // LRU touch
  if (e) ncCache.delete(key)
  return null
}
function ncCacheSet(key, buf) {
  ncCache.set(key, { buf, at: Date.now() })
  while (ncCache.size > NC_CACHE_MAX) ncCache.delete(ncCache.keys().next().value)
}
// Row (folder, message_ref, artwork_no, file_type) se NextCloud path banao aur bytes laao.
async function ncFetchBytes(row) {
  if (!ncConfigured() || !row?.folder || !row?.artwork_no) return null
  const cached = ncCacheGet(row.artwork_no)
  if (cached) return cached
  // routed_sub = manual routing ke baad ka asli subfolder (Artworks/references/Documents);
  // na ho to message_ref se default (references/ ya sent/).
  const remote = ncRemotePath(row.folder, row.routed_sub || subfolderForRef(row.message_ref), `${row.artwork_no}.${row.file_type || 'jpg'}`)
  const buf = await ncGet(remote)
  if (buf) ncCacheSet(row.artwork_no, buf)
  return buf
}
// image_data ho to seedhe do; na ho par NextCloud pe ho to wahan se laa ke do.
async function withBytes(row) {
  if (!row) return null
  if (row.image_data) return { artwork_no: row.artwork_no, file_type: row.file_type, image_data: row.image_data }
  const buf = await ncFetchBytes(row)
  return buf ? { artwork_no: row.artwork_no, file_type: row.file_type, image_data: buf } : null
}

export async function getArtworkFile(idOrNo) {
  const r = await pool.query(
    `SELECT artwork_no, file_type, image_data, folder, message_ref, routed_sub FROM app.customer_artwork
      WHERE artwork_id::text = $1 OR artwork_no = $1 LIMIT 1`, [String(idOrNo)])
  return withBytes(r.rows[0])
}

// Chat attachment ka `name` (jaise "image-1793950308252607") se stored bytes dhoondo.
// Facebook ke CDN link 2-3 hafte mein expire ho jate hain — tab chat apni copy maangta hai.
export async function getArtworkFileByName(fileName) {
  // file_name (customer ki bheji, jaise "image-123") YA artwork_no (hamari bheji, "AW-...-OUT") dono match.
  // image_data hone wali row ko pehle (DESC), warna NextCloud-wali row (bytes wahan se aayenge).
  const r = await pool.query(
    `SELECT artwork_no, file_type, image_data, folder, message_ref, routed_sub FROM app.customer_artwork
      WHERE (file_name = $1 OR artwork_no = $1)
        AND (image_data IS NOT NULL OR upload_status = 'nextcloud_ok')
      ORDER BY (image_data IS NOT NULL) DESC, created_at DESC LIMIT 1`, [String(fileName)])
  return withBytes(r.rows[0])
}

// ── Files tab: client-sent files review + manual routing ───────────────────
// Agent har client-bheji file ka preview dekh kar dropdown se decide karta hai ki wo
// NextCloud me kahan jaye. Dropdown -> asli NextCloud subfolder ka mapping:
const BUCKET_SUB = { SRC: 'Artworks', REF: 'references', DOCS: 'Documents' }
const BUCKETS = ['SRC', 'REF', 'DOCS', 'TRASH']

// conv.id (uuid ya legacy) -> asli conversation uuid
async function resolveConvId(convRef) {
  if (!convRef) return null
  const c = await pool.query(
    `SELECT conversation_id FROM app.conversations WHERE conversation_id::text = $1 OR legacy_id = $1 LIMIT 1`,
    [String(convRef)])
  return c.rows[0]?.conversation_id || null
}

// Ek conversation ki CLIENT-bheji files jo abhi FILE karni hain — sirf 'held' (auto-push OFF
// ke baad aayi nayi images jinhe agent ne abhi tak route nahi kiya). Purani already-filed
// files (nextcloud_ok, disconnect se pehle wali) yahan NAHI dikhtin; route karte hi file
// 'nextcloud_ok'/'trashed' ho kar list se hat jaati hai. (Hamare bheje OUT/combo bhi nahi.)
export async function listClientFiles(convRef) {
  const cid = await resolveConvId(convRef)
  if (!cid) return []
  const r = await pool.query(
    `SELECT artwork_no, file_name, file_type, created_at, routed_bucket
       FROM app.customer_artwork
      WHERE conversation_id = $1
        AND message_ref NOT LIKE 'out:%' AND message_ref NOT LIKE 'combo:%'
        AND upload_status = 'held'
      ORDER BY created_at DESC LIMIT 300`, [cid])
  return r.rows.map((x) => ({
    artwork_no: x.artwork_no,
    name: x.file_name || x.artwork_no,   // preview key
    type: 'image',
    ext: x.file_type || 'jpg',
    time: x.created_at,
    bucket: x.routed_bucket || null,
  }))
}

// Ek file ko chune gaye bucket me NextCloud pe bhejo. Bytes PG me ho to seedhe upload; warna
// (purani references/-wali file) NextCloud ke andar hi MOVE. Phir routing DB me record.
export async function routeFile({ artworkNo, name, bucket, by }) {
  bucket = String(bucket || '').toUpperCase()
  if (!BUCKETS.includes(bucket)) throw new Error('invalid bucket')
  if (!ncConfigured()) throw new Error('NextCloud not configured')
  const key = String(artworkNo || name || '').trim()
  if (!key) throw new Error('file id required')
  const r = await pool.query(
    `SELECT artwork_id, artwork_no, folder, file_type, message_ref, routed_sub,
            image_data, (image_data IS NOT NULL) AS has_bytes
       FROM app.customer_artwork
      WHERE artwork_no = $1 OR file_name = $1
      ORDER BY (image_data IS NOT NULL) DESC, created_at DESC LIMIT 1`, [key])
  const row = r.rows[0]
  if (!row) throw new Error('file not found')
  if (!row.folder) throw new Error('file has no client folder')

  const ext = row.file_type || 'jpg'
  const fileName = `${row.artwork_no}.${ext}`
  const curSub = row.routed_sub || subfolderForRef(row.message_ref)
  const curPath = ncRemotePath(row.folder, curSub, fileName)   // NC_ROOT/<folder>/<sub>/<file>
  const rootParts = NC_ROOT.split('/').filter(Boolean)

  // TRASH -> top-level `trash/` folder (Leads 2.0 ke bahar), file naam client-prefixed.
  if (bucket === 'TRASH') {
    await ncEnsureFolder(['trash'])
    const target = `trash/${row.folder}__${fileName}`
    const ok = row.has_bytes ? await ncPut(target, row.image_data) : await ncMove(curPath, target)
    if (!ok) throw new Error('trash move failed')
    await pool.query(
      `UPDATE app.customer_artwork SET routed_bucket='TRASH', routed_sub=NULL, routed_at=now(),
              routed_by=$2, upload_status='trashed', image_data=NULL WHERE artwork_id=$1`,
      [row.artwork_id, by || null])
    ncCache.delete(row.artwork_no)
    return { ok: true, bucket, remote: target }
  }

  // SRC/REF/DOCS -> Leads 2.0/<folder>/<Artworks|references|Documents>/<file>
  const sub = BUCKET_SUB[bucket]
  await ncEnsureFolder([...rootParts, row.folder, sub])
  const target = ncRemotePath(row.folder, sub, fileName)
  if (row.has_bytes) {
    if (!(await ncPut(target, row.image_data))) throw new Error('upload failed')
  } else if (curPath !== target) {
    if (!(await ncMove(curPath, target))) throw new Error('move failed')
  }
  await pool.query(
    `UPDATE app.customer_artwork SET routed_bucket=$2, routed_sub=$3, routed_at=now(),
            routed_by=$4, upload_status='nextcloud_ok', image_data=NULL WHERE artwork_id=$1`,
    [row.artwork_id, bucket, sub, by || null])
  ncCache.delete(row.artwork_no)
  return { ok: true, bucket, remote: target }
}
