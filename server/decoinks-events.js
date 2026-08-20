// Decoinks → Task Management event bridge.
// Real business events live in decoinks_db (the print-shop software creates artworks, orders,
// payments). The CRM already talks to both decoinks_db and the Task Management API, so it is
// the natural bridge: this poller watches decoinks_db for NEW records and fires the matching
// business event at the Task Management automation engine (POST /api/events), which then
// creates tasks from templates. The engine is idempotent (dedups by entity), so a re-fire is safe.
import pg from 'pg'
import { getSetting, setSetting } from './db.js'
import { tmFireEvent, tmConfigured } from './taskmgmt.js'

const DEC_URL = process.env.DECOINKS_DATABASE_URL || ''
const pool = DEC_URL ? new pg.Pool({ connectionString: DEC_URL, max: 2, connectionTimeoutMillis: 15000 }) : null
const WATERMARK = 'taskmgmt_artwork_watermark'   // ISO ts of the last artwork we forwarded

// First run: seed the watermark to the CURRENT max created_at so we do NOT flood the task
// system with tasks for every pre-existing artwork — only artworks created from now on fire.
async function initWatermark() {
  if (getSetting(WATERMARK)) return
  let iso = new Date().toISOString()
  try {
    const { rows } = await pool.query('SELECT max(created_at) m FROM public.artworks')
    if (rows[0]?.m) iso = new Date(rows[0].m).toISOString()
  } catch { /* keep now() */ }
  setSetting(WATERMARK, iso)
  console.log('[taskmgmt bridge] artwork watermark initialized at', iso)
}

async function tick() {
  if (!pool || !tmConfigured()) return
  await initWatermark()
  const since = getSetting(WATERMARK)
  const { rows } = await pool.query(
    `SELECT artwork_no, created_at FROM public.artworks
      WHERE created_at > $1 AND artwork_no IS NOT NULL
      ORDER BY created_at ASC LIMIT 50`,
    [since],
  )
  let latest = since, fired = 0
  for (const r of rows) {
    try { await tmFireEvent('ARTWORK_CREATED', 'Artwork', r.artwork_no) }
    catch (e) { console.warn('[taskmgmt bridge] fireEvent failed, will retry next tick:', e.message); break }
    latest = new Date(r.created_at).toISOString(); fired++
  }
  if (latest !== since) setSetting(WATERMARK, latest)
  if (fired) console.log(`[taskmgmt bridge] fired ARTWORK_CREATED for ${fired} new artwork(s)`)
}

export function startDecoinksEventBridge() {
  if (!DEC_URL) { console.log('[taskmgmt bridge] DECOINKS_DATABASE_URL not set — bridge disabled'); return }
  setTimeout(() => tick().catch((e) => console.warn('[taskmgmt bridge]', e.message)), 20000)   // 20s after boot
  setInterval(() => tick().catch((e) => console.warn('[taskmgmt bridge]', e.message)), 120000) // every 2 min
  console.log('🔗 Decoinks → Task Management event bridge started (artworks → ARTWORK_CREATED)')
}
