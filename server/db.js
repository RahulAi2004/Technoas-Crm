// PostgreSQL store with the SAME synchronous API the app uses (in-memory cache +
// write-through). Phase 2: data now lives in the NORMALIZED `app.*` schema; each app
// table keeps the full app doc in an `extra` JSONB (lossless) PLUS typed columns for
// analytics. The app reads/writes the `extra` doc, so behaviour is identical.
//
// Rollback: set DB_SOURCE=public in server/.env to use the old public.* JSONB tables.
import pg from 'pg'
import fs from 'fs'
import path from 'path'

const { Pool } = pg
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set. Add server/.env and run node with --env-file=.env')

const USE_APP = process.env.DB_SOURCE !== 'public'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 15000,
  query_timeout: 90000,
  statement_timeout: 90000,
  idleTimeoutMillis: 30000,
  max: 50,                       // 12→30→50: peak-hour load (leads 7s refresh + inbox SSE + reconcile + meta sync + AI + artwork) saturated the pool → connection timeouts. DB max_connections=100 (~43 used), so 50 is safe headroom.
  keepAlive: true,              // TCP keepalive so the socat proxy (technocas_postgres_proxy) doesn't silently drop idle connections mid-flight
  keepAliveInitialDelayMillis: 10000,
})
pool.on('error', (e) => console.error('[db] idle client error:', e.message))

const ROW_TABLES = ['users', 'customers', 'leads', 'conversations', 'messages',
  'notes', 'orders', 'payments', 'receipts', 'artworks', 'webhook_events', 'ai_chats']

// logical table -> app schema table (only these are normalized; rest stay in public.*)
const APP_NAME = { users: 'agents', customers: 'customers', leads: 'leads', conversations: 'conversations', messages: 'messages', notes: 'notes', orders: 'orders', payments: 'payments', artworks: 'artwork', ai_chats: 'ai_chats' }
const PUBLIC_ONLY = new Set(['receipts', 'webhook_events'])
const loc = (t) => (USE_APP && APP_NAME[t] && !PUBLIC_ONLY.has(t))
  ? { schema: 'app', name: APP_NAME[t], col: 'extra', app: true }
  : { schema: 'public', name: t, col: 'doc', app: false }

// Full structured-column mapping per app table, so EVERY write (live too) is saved as
// structured data — not just the `extra` doc. `scalar` = plain columns; `fk` = foreign
// keys resolved in-SQL from a related table's legacy_id -> its UUID pk.
const PK = { agents: 'agent_id', customers: 'customer_id', conversations: 'conversation_id', messages: 'message_id', leads: 'lead_id', orders: 'order_id', payments: 'payment_id', notes: 'note_id', artwork: 'artwork_id', ai_chats: 'id' }
const JSONB_COLS = new Set(['attachments', 'messages', 'sizes', 'line_items', 'files'])
// Postgres jsonb (and text) reject the NUL character - IG/Meta payloads sometimes
// contain it, which crashed every write with "invalid input syntax for type json".
// Strip it from both the serialized JSON (escaped form) and plain string params.
// Strip NUL escapes AND lone UTF-16 surrogates — PG jsonb rejects both ("invalid input
// syntax for type json"). Well-formed JSON.stringify escapes ONLY lone surrogates as
// \uXXXX (valid emoji pairs stay literal), so removing every \uD800-\uDFFF escape is safe.
const jsonSafe = (v) => JSON.stringify(v).replace(/\\u0000/g, '').replace(/\\u[dD][89a-fA-F][0-9a-fA-F]{2}/g, '')
const NUL_RE = new RegExp(String.fromCharCode(0), 'g')
const strSafe = (v) => (typeof v === 'string' ? v.replace(NUL_RE, '').replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '').replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '') : v)
const APP_MAP = {
  agents:        { scalar: (d) => ({ name: d.name || 'Agent', email: (d.email || `user${d.id}@local`).toLowerCase(), role: d.role || 'agent', password_hash: d.password_hash || null }) },
  customers:     { scalar: (d) => ({ full_name: d.name || 'Unknown', email: d.email || null, phone: d.phone || null, company: d.company || null, platform_primary: (d.channel || '').toLowerCase() || null, tier: d.tier || null, total_spent: Number(d.spend) || 0, total_orders: Number(d.orders) || 0, payment_status: d.payment_status || null, products: d.products || null, avatar: d.avatar || null }) },
  conversations: { scalar: (d) => { const lts = Number(d.last_ts || d.last_out_ts || d.last_in_ts) || 0; return { channel: d.channel || null, status: d.status || 'open', unread: Number(d.unread) || 0, bookmarked: !!d.bookmarked, meta_sender_id: d.meta_recipient_id || null, intent_primary: d.name || null, last_message_at: lts ? new Date(lts).toISOString() : null } }, fk: (d) => ({ customer_id: ['customers', d.id ? `cust:${d.id}` : null] }) },
  messages:      { scalar: (d) => { const ts = Number(d.ts) || Date.parse(d.created_at) || 0; return { direction: d.dir === 'note' ? 'note' : d.dir === 'out' ? 'out' : 'in', sender_type: d.dir === 'in' ? 'customer' : d.dir === 'out' ? 'agent' : 'system', body: d.text || '', message_type: (d.attachments && d.attachments.length) ? 'image' : 'text', attachments: JSON.stringify(d.attachments || []), category: d.category || null, meta_message_id: d.mid || null, sent_at: ts ? new Date(ts).toISOString() : null } }, fk: (d) => ({ conversation_id: ['conversations', d.conversation_id] }) },
  leads:         { scalar: (d) => ({ stage: d.pipeline || 'new_inquiry', status: d.status || 'New', source: d.source || null, score_total: Number(d.score) || 0, estimated_value: Number(d.value) || 0,
    // Updated2 format (Decoinks-Database-Tables-Updated2.xlsx `lead` table). lead_no is
    // NOT written here — the app.assign_lead_no trigger numbers new leads (LEAD-000123).
    lead_stage: d.lead_stage || d.pipeline || 'new_inquiry',
    lead_status: d.lead_status || (/won/i.test(d.status || '') ? 'Won' : /lost|closed/i.test(d.status || '') ? 'Lost' : /dormant|inactive/i.test(d.status || '') ? 'Dormant' : 'Active'),
    priority: d.priority || 'Medium',
    source_platform: d.source_platform || d.source || null,
    source_campaign: d.source_campaign || null,
    instagram_id: d.instagram_id || null,
    facebook_id: d.facebook_id || null,
    last_contact_at: d.last_contact_at || null,
    next_followup_date: d.next_followup_date || null,
  }), fk: (d) => ({ customer_id: ['customers', d.conversation_id ? `cust:${d.conversation_id}` : null], conversation_id: ['conversations', d.conversation_id], customer_name: ['customers', d.conversation_id ? `cust:${d.conversation_id}` : null], conversation_primary_id: ['conversations', d.conversation_id] }) },
  orders:        { scalar: (d) => ({ order_number: d.order_no || null, products: d.products || null, items_count: Number(d.items) || 0, total_amount: Number(d.total) || 0, order_status: (d.status || 'pending').toLowerCase(), payment_status: d.status === 'Paid' ? 'paid' : 'pending' }), fk: (d) => ({ customer_id: ['customers', d.conversation_id ? `cust:${d.conversation_id}` : null], conversation_id: ['conversations', d.conversation_id] }) },
  payments:      { scalar: (d) => ({ invoice_number: d.invoice_no || null, amount: Number(d.amount) || 0, method: d.method || null, status: (d.status || 'completed').toLowerCase() }) },
  notes:         { scalar: (d) => ({ title: d.title || null, body: d.body || '', category: d.category || 'internal', author: d.author || null, pinned: !!d.pinned }), fk: (d) => ({ customer_id: ['customers', d.customer_id] }) },
  artwork:       { scalar: (d) => ({ design_name: d.name || null, artwork_type: d.type || null }) },
  ai_chats:      { scalar: (d) => ({ title: d.title || 'Chat', messages: JSON.stringify(d.messages || []) }) },
}

function emptyDb() {
  return { users: [], customers: [], leads: [], conversations: [], messages: [],
    notes: [], orders: [], payments: [], receipts: [], artworks: [],
    settings: {}, webhook_events: [], ai_chats: [], _autoinc: {} }
}

async function ensureSchema() {
  // public JSONB tables (fallback + the public-only ones: receipts, webhook_events)
  for (const t of ROW_TABLES) {
    await pool.query(`CREATE TABLE IF NOT EXISTS "${t}" (id TEXT PRIMARY KEY, doc JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now())`)
  }
  await pool.query(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value JSONB)`)
  await pool.query(`CREATE TABLE IF NOT EXISTS meta_kv (key TEXT PRIMARY KEY, value JSONB)`)
  if (USE_APP) {
    // ensure the normalized app.* schema exists + has the extra columns
    try { await pool.query(fs.readFileSync(path.resolve(process.cwd(), 'schema.sql'), 'utf8')) }
    catch (e) { console.warn('[db] app schema ensure skipped:', e.message) }
    for (const a of new Set(Object.values(APP_NAME))) {
      try { await pool.query(`ALTER TABLE app."${a}" ADD COLUMN IF NOT EXISTS extra JSONB DEFAULT '{}'::jsonb`) } catch { /* ok */ }
    }
  }
}

// settings.value is JSONB on some deployments and TEXT on others (the remote DB has TEXT).
// From a TEXT column pg hands back the raw JSON, unparsed — so '"654..."' arrived with its
// quotes and every page-id comparison failed silently. Decode once, on the way in.
function decodeKv(v) {
  if (typeof v !== 'string') return v
  try { return JSON.parse(v) } catch { return v }
}

async function loadAll() {
  const d = emptyDb()
  for (const t of ROW_TABLES) {
    const L = loc(t)
    const where = L.app ? `WHERE ${L.col} <> '{}'::jsonb` : ''
    const { rows } = await pool.query(`SELECT ${L.col} AS doc FROM ${L.schema}."${L.name}" ${where}`)
    d[t] = rows.map((r) => r.doc)
  }
  const s = await pool.query(`SELECT key, value FROM settings`)
  s.rows.forEach((r) => { d.settings[r.key] = decodeKv(r.value) })
  const a = await pool.query(`SELECT value FROM meta_kv WHERE key = '_autoinc'`)
  if (a.rows[0]) d._autoinc = decodeKv(a.rows[0].value) || {}
  return d
}

// ---- write-through queue (independent writes; never block the caller) ----
const pending = new Set()
function enqueue(fn, label = '') {
  const p = Promise.resolve().then(fn).catch((e) => console.error(`[db] write error${label ? ` (${label})` : ''}:`, e.message, e.detail || '')).finally(() => pending.delete(p))
  pending.add(p); return p
}
export function flush(timeoutMs = 600) {
  return Promise.race([Promise.allSettled([...pending]), new Promise((res) => setTimeout(res, timeoutMs))])
}
export async function close() { await flush(); await pool.end() }
let flushing = false
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, async () => { if (flushing) return; flushing = true; try { await flush() } catch {} process.exit(0) })
}

const upsertRow = (t, doc) => enqueue(() => {
  const L = loc(t)
  if (!L.app) {
    return pool.query(`INSERT INTO "${L.name}" (id, doc) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()`, [String(doc.id), jsonSafe(doc)])
  }
  const map = APP_MAP[L.name] || {}
  const scalar = map.scalar ? map.scalar(doc) : {}
  const fks = map.fk ? map.fk(doc) : {}
  const cols = ['legacy_id', 'extra'], ph = ['$1', '$2::jsonb'], params = [String(doc.id), jsonSafe(doc)]
  let i = 3
  for (const [k, v] of Object.entries(scalar)) {
    cols.push(k)
    if (JSONB_COLS.has(k)) { params.push(String(v).replace(/\\u0000/g, '').replace(/\\u[dD][89a-fA-F][0-9a-fA-F]{2}/g, '')); ph.push(`$${i}::jsonb`) }
    else { params.push(strSafe(v)); ph.push(`$${i}`) }
    i++
  }
  for (const [k, [refTable, legacyVal]] of Object.entries(fks)) {
    cols.push(k)
    if (legacyVal == null) { ph.push('NULL') }
    else { params.push(String(legacyVal)); ph.push(`(SELECT ${PK[refTable]} FROM app.${refTable} WHERE legacy_id = $${i})`); i++ }
  }
  const setClause = [...cols.filter((c) => c !== 'legacy_id').map((c) => `${c} = EXCLUDED.${c}`), 'updated_at = now()'].join(', ')
  return pool.query(`INSERT INTO app."${L.name}" (${cols.join(',')}) VALUES (${ph.join(',')}) ON CONFLICT (legacy_id) DO UPDATE SET ${setClause}`, params)
}, `app.${APP_NAME[t] || t}`)
const deleteRow = (t, id) => enqueue(() => {
  const L = loc(t)
  return L.app ? pool.query(`DELETE FROM app."${L.name}" WHERE legacy_id = $1`, [String(id)])
               : pool.query(`DELETE FROM "${L.name}" WHERE id = $1`, [String(id)])
})
const truncate = (t) => enqueue(() => {
  const L = loc(t)
  return L.app ? pool.query(`DELETE FROM app."${L.name}"`) : pool.query(`DELETE FROM "${L.name}"`)
})
const upsertKv = (table, key, value) => enqueue(() => pool.query(`INSERT INTO ${table} (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [key, jsonSafe(value ?? null)]), `${table}:${key}`)
const deleteKv = (table, key) => enqueue(() => pool.query(`DELETE FROM ${table} WHERE key = $1`, [key]))

// ---- boot (resilient: retry so a brief remote-DB blip doesn't crash the backend) ----
async function bootLoad(retries = 8) {
  for (let a = 1; a <= retries; a++) {
    try {
      // ensureSchema sirf fresh DB par zaroori hai; established DB par CREATE fail (e.g. PG15
      // "permission denied for schema public") ko non-fatal rakho — loadAll sirf SELECT karta hai.
      try { await ensureSchema() } catch (e) { console.warn(`[db] ensureSchema skipped (non-fatal): ${e.message}`) }
      return await loadAll()
    } catch (e) {
      console.error(`[db] boot attempt ${a}/${retries} failed: ${e.message}`)
      if (a === retries) throw e
      await new Promise((r) => setTimeout(r, 5000))
    }
  }
}
let data = await bootLoad()
console.log(`🗄️  Postgres connected (${USE_APP ? 'app.* normalized' : 'public.* JSONB'}) — loaded`,
  ROW_TABLES.reduce((n, t) => n + data[t].length, 0), 'rows')

// ============================================================
// Public API (unchanged signatures — index.js untouched)
// ============================================================
function nextId(table) {
  data._autoinc[table] = (data._autoinc[table] || 0) + 1
  upsertKv('meta_kv', '_autoinc', data._autoinc)
  return data._autoinc[table]
}
export function getAll(table) { return data[table] || [] }
export function findById(table, id) { return (data[table] || []).find((r) => String(r.id) === String(id)) || null }
export function insert(table, row) {
  if (!data[table]) throw new Error(`Unknown table: ${table}`)
  if (row.id == null) row.id = nextId(table)
  if (!row.created_at) row.created_at = new Date().toISOString()
  const idx = data[table].findIndex((r) => String(r.id) === String(row.id))
  const before = idx >= 0 ? JSON.stringify(data[table][idx]) : null
  const merged = idx >= 0 ? { ...data[table][idx], ...row } : row
  if (idx >= 0) data[table][idx] = merged; else data[table].push(merged)
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
  deleteRow(table, id); return true
}
export function clearTable(table) { data[table] = []; truncate(table) }
export function setAutoInc(table, value) { data._autoinc[table] = value; upsertKv('meta_kv', '_autoinc', data._autoinc) }
export function resetDb() {
  data = emptyDb(); ROW_TABLES.forEach(truncate)
  enqueue(() => pool.query('DELETE FROM settings')); enqueue(() => pool.query('DELETE FROM meta_kv'))
}
// Raw read-only query (for the AI assistant's text-to-SQL). index.js validates it's a SELECT.
export function query(sql, params) { return pool.query(sql, params) }
export function getClient() { return pool.connect() }
export function getSetting(key) { return (data.settings || {})[key] }
export function setSetting(key, value) { if (!data.settings) data.settings = {}; data.settings[key] = value; upsertKv('settings', key, value) }
export function deleteSetting(key) { if (data.settings) { delete data.settings[key]; deleteKv('settings', key) } }
