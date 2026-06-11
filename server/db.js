// PostgreSQL-backed store with the SAME synchronous API the app already uses.
//
// How it works (Phase 1):
//  - On boot we connect to Postgres, ensure the schema, and load every row into
//    an in-memory cache (same shape the app expects).
//  - Reads (getAll/findById/getSetting) are served from memory → instant, sync.
//  - Writes (insert/update/remove/settings) update memory immediately AND are
//    written through to Postgres on a serialized async queue (no-op writes are
//    skipped, so the 10s Meta poller doesn't hammer the DB).
//  - Each resource is a table with (id TEXT PK, doc JSONB). Phase 2 will
//    normalize these into full typed columns per the schema docs.
import pg from 'pg'

const { Pool } = pg

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL not set. Add server/.env and run node with --env-file=.env')
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,  // fail fast if the remote server is unreachable (frees the pool)
  query_timeout: 8000,            // don't let a single query hang forever
  statement_timeout: 8000,
  idleTimeoutMillis: 30000,
  max: 12,
})
pool.on('error', (e) => console.error('[db] idle client error:', e.message))

// Tables that hold a list of documents (id + JSONB doc).
const ROW_TABLES = ['users', 'customers', 'leads', 'conversations', 'messages',
  'notes', 'orders', 'payments', 'receipts', 'artworks', 'webhook_events']

function emptyDb() {
  return {
    users: [], customers: [], leads: [], conversations: [], messages: [],
    notes: [], orders: [], payments: [], receipts: [], artworks: [],
    settings: {}, webhook_events: [], _autoinc: {},
  }
}

async function ensureSchema() {
  for (const t of ROW_TABLES) {
    await pool.query(`CREATE TABLE IF NOT EXISTS "${t}" (
      id TEXT PRIMARY KEY,
      doc JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )`)
  }
  await pool.query(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value JSONB)`)
  await pool.query(`CREATE TABLE IF NOT EXISTS meta_kv (key TEXT PRIMARY KEY, value JSONB)`)
}

async function loadAll() {
  const d = emptyDb()
  for (const t of ROW_TABLES) {
    const { rows } = await pool.query(`SELECT doc FROM "${t}"`)
    d[t] = rows.map((r) => r.doc)
  }
  const s = await pool.query(`SELECT key, value FROM settings`)
  s.rows.forEach((r) => { d.settings[r.key] = r.value })
  const a = await pool.query(`SELECT value FROM meta_kv WHERE key = '_autoinc'`)
  if (a.rows[0]) d._autoinc = a.rows[0].value || {}
  return d
}

// ---- write-through queue ----
// Each write fires INDEPENDENTLY (not chained), so one stuck write to a flaky
// remote DB can't block every other write (head-of-line blocking).
const pending = new Set()
function enqueue(fn) {
  const p = Promise.resolve()
    .then(fn)
    .catch((e) => console.error('[db] write error:', e.message))
    .finally(() => pending.delete(p))
  pending.add(p)
  return p
}
// Wait for outstanding writes, but never hang the caller if the remote DB stalls.
// Short timeout keeps the UI snappy — the write still completes in the background.
export function flush(timeoutMs = 600) {
  return Promise.race([
    Promise.allSettled([...pending]),
    new Promise((res) => setTimeout(res, timeoutMs)),
  ])
}
export async function close() { await flush(); await pool.end() }

// Flush pending writes before the process exits / restarts (e.g. node --watch
// sends SIGTERM). Without this, queued async writes could be lost on restart.
let flushing = false
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, async () => {
    if (flushing) return
    flushing = true
    try { await flush() } catch { /* best effort */ }
    process.exit(0)
  })
}

// JSONB columns need valid JSON text — JSON.stringify so that plain strings
// (e.g. an access token "EAAT...") become a quoted JSON string, not raw text.
const upsertRow = (t, doc) => enqueue(() =>
  pool.query(`INSERT INTO "${t}" (id, doc) VALUES ($1, $2::jsonb)
              ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()`,
    [String(doc.id), JSON.stringify(doc)]))
const deleteRow = (t, id) => enqueue(() => pool.query(`DELETE FROM "${t}" WHERE id = $1`, [String(id)]))
const truncate  = (t) => enqueue(() => pool.query(`DELETE FROM "${t}"`))
const upsertKv  = (table, key, value) => enqueue(() =>
  pool.query(`INSERT INTO ${table} (key, value) VALUES ($1, $2::jsonb)
              ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [key, JSON.stringify(value ?? null)]))
const deleteKv  = (table, key) => enqueue(() => pool.query(`DELETE FROM ${table} WHERE key = $1`, [key]))

// ---- boot: connect, ensure schema, load cache (top-level await) ----
await ensureSchema()
let data = await loadAll()
console.log('🗄️  Postgres connected — loaded',
  ROW_TABLES.reduce((n, t) => n + data[t].length, 0), 'rows')

// ============================================================
// Public API (same signatures as before — index.js is unchanged)
// ============================================================
function nextId(table) {
  data._autoinc[table] = (data._autoinc[table] || 0) + 1
  upsertKv('meta_kv', '_autoinc', data._autoinc)
  return data._autoinc[table]
}

export function getAll(table) { return data[table] || [] }

export function findById(table, id) {
  return (data[table] || []).find((r) => String(r.id) === String(id)) || null
}

export function insert(table, row) {
  if (!data[table]) throw new Error(`Unknown table: ${table}`)
  if (row.id == null) row.id = nextId(table) // works for both numeric + string-id tables
  if (!row.created_at) row.created_at = new Date().toISOString()

  const idx = data[table].findIndex((r) => String(r.id) === String(row.id))
  const before = idx >= 0 ? JSON.stringify(data[table][idx]) : null
  const merged = idx >= 0 ? { ...data[table][idx], ...row } : row
  if (idx >= 0) data[table][idx] = merged
  else data[table].push(merged)

  // Only hit Postgres if something actually changed (keeps the poller cheap).
  if (JSON.stringify(merged) !== before) upsertRow(table, merged)
  return findById(table, row.id)
}

export function update(table, id, patch) {
  const idx = data[table].findIndex((r) => String(r.id) === String(id))
  if (idx < 0) return null
  const before = JSON.stringify(data[table][idx])
  data[table][idx] = { ...data[table][idx], ...patch }
  if (JSON.stringify(data[table][idx]) !== before) upsertRow(table, data[table][idx])
  return data[table][idx]
}

export function remove(table, id) {
  const before = data[table].length
  data[table] = data[table].filter((r) => String(r.id) !== String(id))
  if (data[table].length === before) return false
  deleteRow(table, id)
  return true
}

export function clearTable(table) {
  data[table] = []
  truncate(table)
}

export function setAutoInc(table, value) {
  data._autoinc[table] = value
  upsertKv('meta_kv', '_autoinc', data._autoinc)
}

export function resetDb() {
  data = emptyDb()
  ROW_TABLES.forEach(truncate)
  enqueue(() => pool.query('DELETE FROM settings'))
  enqueue(() => pool.query('DELETE FROM meta_kv'))
}

// ---- Settings (key/value) ----
export function getSetting(key) { return (data.settings || {})[key] }
export function setSetting(key, value) {
  if (!data.settings) data.settings = {}
  data.settings[key] = value
  upsertKv('settings', key, value)
}
export function deleteSetting(key) {
  if (data.settings) { delete data.settings[key]; deleteKv('settings', key) }
}
