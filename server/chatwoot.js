// Chatwoot integration — SHADOW MODE pehle (Meta integration ko koi haath nahi).
//
// Testing ke waqt:
//   Facebook ──→ Direct Meta Integration ──→ CRM screen   (jaisa abhi hai, waisa hi)
//           └──→ Chatwoot ──→ webhook ──→ shadow table    (agent ko nahi dikhta)
//
// .env flags (sab default OFF/safe — kuch set na ho to poora module no-op):
//   CHATWOOT_INTEGRATION_ENABLED=true    webhook messages ko shadow table mein save karo
//   CHATWOOT_SHADOW_MODE=true            true = sirf shadow save, production inbox ko mat chhuo
//   CHATWOOT_SEND_ENABLED=false          true hone par hi Chatwoot se message bhejna mumkin
//   CHATWOOT_BASE_URL=https://app.chatwoot.com
//   CHATWOOT_ACCOUNT_ID=176928
//   CHATWOOT_FACEBOOK_INBOX_ID=123537
//   CHATWOOT_API_ACCESS_TOKEN=<secret — sirf backend .env mein>
//   CHATWOOT_WEBHOOK_SECRET=<optional — set ho to webhook URL mein ?t=<secret> match hona chahiye>
import pg from 'pg'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 20000, query_timeout: 60000 })

const flag = (v) => ['1', 'true', 'yes', 'on'].includes(String(v || '').toLowerCase())
export const cwEnabled = () => flag(process.env.CHATWOOT_INTEGRATION_ENABLED)
export const cwShadowMode = () => process.env.CHATWOOT_SHADOW_MODE === undefined ? true : flag(process.env.CHATWOOT_SHADOW_MODE)
export const cwSendEnabled = () => flag(process.env.CHATWOOT_SEND_ENABLED)

const BASE = (process.env.CHATWOOT_BASE_URL || 'https://app.chatwoot.com').replace(/\/+$/, '')
const ACCOUNT = process.env.CHATWOOT_ACCOUNT_ID || ''
const TOKEN = process.env.CHATWOOT_API_ACCESS_TOKEN || ''

// ---- shadow table (public schema — decoinks ke paas app schema mein CREATE nahi hai) ----
let tableReady = false
export async function cwEnsureTable() {
  if (tableReady) return
  await pool.query(`CREATE TABLE IF NOT EXISTS public.chatwoot_shadow_messages (
    id BIGSERIAL PRIMARY KEY,
    chatwoot_message_id BIGINT NOT NULL UNIQUE,       -- duplicate prevention (Phase 8)
    chatwoot_conversation_id BIGINT,
    chatwoot_inbox_id BIGINT,
    direction TEXT,                                    -- 'in' | 'out'
    content TEXT,
    attachments JSONB DEFAULT '[]'::jsonb,
    customer_name TEXT,
    chatwoot_created_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ DEFAULT now(),
    raw_payload JSONB,
    matched_meta_message_id TEXT                       -- compare tool (Phase 4) bharta hai
  )`)
  // source_id = Facebook/IG ka asli message id (m_...) — Meta se pukhta match ke liye.
  await pool.query(`ALTER TABLE public.chatwoot_shadow_messages ADD COLUMN IF NOT EXISTS source_id TEXT`)
  await pool.query(`CREATE INDEX IF NOT EXISTS ix_cw_shadow_source ON public.chatwoot_shadow_messages(source_id)`)
  // PSID (Facebook user id) -> Chatwoot conversation id. Send routing isse conversation dhoondhta hai.
  // psid = contact ke contact_inboxes[].source_id; reconcile ise ek-ek baar bharta hai.
  await pool.query(`CREATE TABLE IF NOT EXISTS public.chatwoot_conv_contact (
    chatwoot_conversation_id BIGINT PRIMARY KEY,
    psid TEXT,
    inbox_id BIGINT,
    last_activity BIGINT,
    updated_at TIMESTAMPTZ DEFAULT now()
  )`)
  await pool.query(`CREATE INDEX IF NOT EXISTS ix_cw_conv_psid ON public.chatwoot_conv_contact(psid)`)
  tableReady = true
}

// PSID -> sabse recent Chatwoot conversation id (send routing ke liye)
export async function cwConvForPsid(psid) {
  if (!psid) return null
  await cwEnsureTable()
  const r = await pool.query(
    `SELECT chatwoot_conversation_id FROM public.chatwoot_conv_contact
      WHERE psid = $1 ORDER BY last_activity DESC NULLS LAST LIMIT 1`, [String(psid)])
  return r.rows[0]?.chatwoot_conversation_id || null
}

// Chatwoot do jagah alag time deta hai: webhook = ISO/ms string, API = unix SECONDS.
// Dono ko sahi Date mein badlo (seconds ko pehchano taaki 1970 na ban jaye).
function toDate(v) {
  if (v == null) return new Date()
  if (typeof v === 'number') return new Date(v < 1e12 ? v * 1000 : v)
  const n = Number(v)
  if (!Number.isNaN(n) && String(v).trim() !== '') return new Date(n < 1e12 ? n * 1000 : n)
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? new Date() : d
}

// message_type: webhook 'incoming'/'outgoing', API 0/1 (2=activity,3=template ko chhod do).
function directionOf(mt) {
  const s = String(mt ?? '')
  if (s === 'incoming' || s === '0') return 'in'
  if (s === 'outgoing' || s === '1') return 'out'
  return null   // activity/template/system — skip
}

const normAtts = (arr) => Array.isArray(arr)
  ? arr.map((a) => ({ url: a.data_url || a.url || null, type: a.file_type || null, id: a.id || null })).filter((a) => a.url)
  : []

// EK message (webhook ya API shape) ko shadow table mein daalo — idempotent (UNIQUE msg id).
// Returns 'stored' | 'duplicate' | 'skipped'.
async function upsertShadow(m, { convId, inboxId, name } = {}) {
  const msgId = Number(m.id)
  if (!msgId) return 'skipped'
  const direction = directionOf(m.message_type)
  if (!direction) return 'skipped'
  await cwEnsureTable()
  const r = await pool.query(
    `INSERT INTO public.chatwoot_shadow_messages
       (chatwoot_message_id, chatwoot_conversation_id, chatwoot_inbox_id, direction, content,
        attachments, customer_name, chatwoot_created_at, source_id, raw_payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (chatwoot_message_id) DO NOTHING
     RETURNING id`,
    [msgId, convId ?? m.conversation?.id ?? m.conversation_id ?? null,
     inboxId ?? m.inbox?.id ?? m.inbox_id ?? null, direction,
     String(m.content || ''), JSON.stringify(normAtts(m.attachments)),
     name ?? m.sender?.name ?? m.conversation?.meta?.sender?.name ?? null,
     toDate(m.created_at), m.source_id || null, m])
  return r.rows[0] ? 'stored' : 'duplicate'
}

// ---- webhook payload -> shadow row (message_created event) ----
// Chatwoot payload: { event, id, content, created_at, message_type: 'incoming'|'outgoing',
//                     conversation:{id}, inbox:{id}, sender:{name}, attachments:[{data_url,...}] }
export async function cwStoreShadow(payload) {
  if (!cwEnabled()) return { ignored: true, reason: 'integration disabled' }
  if (payload?.event !== 'message_created') return { ignored: true, reason: `event ${payload?.event || 'unknown'}` }
  const res = await upsertShadow(payload)
  if (res === 'skipped') return { ignored: true, reason: 'not a chat message' }
  return { stored: res === 'stored', duplicate: res === 'duplicate' }
}

// ---- API helpers (reconcile ke liye) ----
async function cwApi(path, tries = 3) {
  if (!ACCOUNT || !TOKEN) throw new Error('Chatwoot not configured')
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${BASE}/api/v1/accounts/${ACCOUNT}${path}`, { headers: { api_access_token: TOKEN }, signal: AbortSignal.timeout(30000) })
      if (r.status === 429) { await new Promise((x) => setTimeout(x, 3000)); continue }   // rate limit
      const j = await r.json()
      if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(j).slice(0, 120)}`)
      return j
    } catch (e) { if (i === tries - 1) throw e; await new Promise((x) => setTimeout(x, 1500)) }
  }
}

// ========================================================================
// RECONCILE (data-loss ka bandh) — Chatwoot API se conversations + messages
// kheench kar wo bhar do jo LIVE webhook chhoot gaya (server down / network).
// Idempotent: har message UNIQUE(chatwoot_message_id) par upsert, dobara chalana safe.
// sinceHours: sirf itne ghante ke andar activity wali conversations dekho (tez).
// ========================================================================
export async function cwReconcile({ sinceHours = 6, maxPages = 40 } = {}) {
  if (!cwEnabled()) return { skipped: 'integration disabled' }
  await cwEnsureTable()
  const cutoff = Date.now() - sinceHours * 3600 * 1000
  // pehle se mapped conversation ids — inka PSID dobara fetch nahi karna
  const mapped = new Set((await pool.query(`SELECT chatwoot_conversation_id FROM public.chatwoot_conv_contact`)).rows.map((r) => String(r.chatwoot_conversation_id)))
  let scanned = 0, inserted = 0, dup = 0, convs = 0, maps = 0, page = 1
  outer: for (; page <= maxPages; page++) {
    const j = await cwApi(`/conversations?status=all&sort_by=last_activity_at&page=${page}`)
    const list = j?.data?.payload || j?.payload || []
    if (!list.length) break
    for (const c of list) {
      const la = (c.last_activity_at || c.timestamp || 0) * 1000
      if (la && la < cutoff) break outer   // sorted desc -> aur peeche jana bekaar
      convs++
      const name = c.meta?.sender?.name || null
      // PSID mapping — sirf naye conversations ke liye contact fetch (ek baar)
      if (!mapped.has(String(c.id)) && c.meta?.sender?.id) {
        try {
          const cj = await cwApi(`/contacts/${c.meta.sender.id}`)
          const psid = (cj?.payload || cj)?.contact_inboxes?.find((ci) => String(ci.inbox?.id) === String(c.inbox_id))?.source_id
            || (cj?.payload || cj)?.contact_inboxes?.[0]?.source_id || null
          await pool.query(
            `INSERT INTO public.chatwoot_conv_contact (chatwoot_conversation_id, psid, inbox_id, last_activity, updated_at)
             VALUES ($1,$2,$3,$4, now())
             ON CONFLICT (chatwoot_conversation_id) DO UPDATE SET psid=EXCLUDED.psid, last_activity=EXCLUDED.last_activity, updated_at=now()`,
            [c.id, psid, c.inbox_id, c.last_activity_at || null])
          mapped.add(String(c.id)); if (psid) maps++
        } catch { /* contact fetch fail -> agli baar */ }
      }
      const mj = await cwApi(`/conversations/${c.id}/messages`)
      const msgs = mj?.payload || mj?.data || []
      for (const m of msgs) {
        scanned++
        const res = await upsertShadow(m, { convId: c.id, inboxId: c.inbox_id, name })
        if (res === 'stored') inserted++; else if (res === 'duplicate') dup++
      }
      await new Promise((x) => setTimeout(x, 250))   // gentle rate
    }
  }
  const out = { convs, scanned, inserted, dup, newMaps: maps, pages: page - 1 }
  console.log(`[chatwoot] reconcile: ${JSON.stringify(out)}`)
  return out
}

// Background worker — har N min reconcile (webhook ke upar safety net).
let reconcileOn = false
export function startChatwootReconcile(intervalMin = 15) {
  if (reconcileOn || !cwEnabled() || !TOKEN) return
  reconcileOn = true
  const tick = () => cwReconcile({ sinceHours: 6 }).catch((e) => console.warn('[chatwoot] reconcile error:', e.message))
  setInterval(tick, intervalMin * 60 * 1000)
  setTimeout(tick, 45000)   // boot ke 45s baad pehla pass
  console.log(`🔁 Chatwoot reconcile worker started (har ${intervalMin} min)`)
}

// ---- Instagram: shadow ke IG conversations (CRM inhe ig: convs me promote karta hai) ----
// IG Chatwoot pe connected hai (CRM ka Meta app IG DM nahi pull kar pata). Reconcile IG messages
// shadow me daalta hai; IG message ids base64 me 'aWdf...' se shuru hote hain (IGMessage), jabki
// FB 'm_...'. Har chatwoot conversation ka igsid (reply routing) conv_contact.psid se milta hai.
export async function cwInstagramConversations({ limit = 500 } = {}) {
  if (!cwEnabled()) return []
  await cwEnsureTable()
  const r = await pool.query(
    `SELECT s.chatwoot_conversation_id AS cwid, cc.psid AS igsid,
            max(s.customer_name) FILTER (WHERE s.customer_name IS NOT NULL) AS name,
            json_agg(json_build_object(
              'mid', s.chatwoot_message_id, 'dir', s.direction,
              'text', s.content, 'atts', s.attachments, 'ts', s.chatwoot_created_at
            ) ORDER BY s.chatwoot_created_at) AS messages
       FROM public.chatwoot_shadow_messages s
       LEFT JOIN public.chatwoot_conv_contact cc ON cc.chatwoot_conversation_id = s.chatwoot_conversation_id
      WHERE s.source_id LIKE 'aWdf%'
      GROUP BY s.chatwoot_conversation_id, cc.psid
      LIMIT $1`, [limit])
  return r.rows
}

// ---- Customer DP (profile pic): Chatwoot ke paas avatars hain (sender.thumbnail) ----
// CRM ka Meta app DP fetch nahi kar sakta (permission); Chatwoot ke paas access hai. Har psid
// ka latest avatar do — CRM conv (fb:/ig:<psid>) par avatar_url set karne ke liye.
export async function cwContactAvatars({ limit = 3000 } = {}) {
  if (!cwEnabled()) return []
  await cwEnsureTable()
  const r = await pool.query(
    `SELECT DISTINCT ON (cc.psid) cc.psid AS psid,
            s.raw_payload->'sender'->>'thumbnail' AS avatar
       FROM public.chatwoot_shadow_messages s
       JOIN public.chatwoot_conv_contact cc ON cc.chatwoot_conversation_id = s.chatwoot_conversation_id
      WHERE s.raw_payload->'sender'->>'thumbnail' IS NOT NULL
        AND s.raw_payload->'sender'->>'thumbnail' <> ''
      ORDER BY cc.psid, s.chatwoot_created_at DESC
      LIMIT $1`, [limit])
  return r.rows
}

// ---- Phase 5 (pilot ke liye tayyar, CHATWOOT_SEND_ENABLED=true hone par hi chalta hai) ----
// POST /api/v1/accounts/{ACCOUNT}/conversations/{convId}/messages
export async function cwSendMessage(conversationId, content) {
  if (!cwSendEnabled()) { const e = new Error('Chatwoot send disabled (CHATWOOT_SEND_ENABLED=false)'); e.status = 403; throw e }
  if (!ACCOUNT || !TOKEN) { const e = new Error('Chatwoot not configured'); e.status = 400; throw e }
  const res = await fetch(`${BASE}/api/v1/accounts/${ACCOUNT}/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', api_access_token: TOKEN },
    body: JSON.stringify({ content, message_type: 'outgoing' }),
    signal: AbortSignal.timeout(30000),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) { const e = new Error(`Chatwoot send failed: ${res.status} ${JSON.stringify(j).slice(0, 200)}`); e.status = res.status; throw e }
  return j
}

// File/image attachment ke saath bhejo (multipart). buffer = file bytes.
export async function cwSendFile(conversationId, { buffer, fileName, mimeType, caption }) {
  if (!cwSendEnabled()) { const e = new Error('Chatwoot send disabled (CHATWOOT_SEND_ENABLED=false)'); e.status = 403; throw e }
  if (!ACCOUNT || !TOKEN) { const e = new Error('Chatwoot not configured'); e.status = 400; throw e }
  const fd = new FormData()
  fd.append('message_type', 'outgoing')
  if (caption) fd.append('content', caption)
  fd.append('attachments[]', new Blob([buffer], { type: mimeType || 'application/octet-stream' }), fileName || 'file')
  const res = await fetch(`${BASE}/api/v1/accounts/${ACCOUNT}/conversations/${conversationId}/messages`, {
    method: 'POST', headers: { api_access_token: TOKEN }, body: fd, signal: AbortSignal.timeout(60000),
  })   // Content-Type khud fetch set karta hai (multipart boundary ke saath)
  const j = await res.json().catch(() => ({}))
  if (!res.ok) { const e = new Error(`Chatwoot file send failed: ${res.status} ${JSON.stringify(j).slice(0, 200)}`); e.status = res.status; throw e }
  return j
}

// PSID se file bhejo — conversation khud resolve karta hai.
export async function cwSendFileToPsid(psid, file) {
  const convId = await cwConvForPsid(psid)
  if (!convId) { const e = new Error(`Chatwoot conversation nahi mili (psid ${psid})`); e.status = 404; throw e }
  const r = await cwSendFile(convId, file)
  return { ...r, chatwoot_conversation_id: convId }
}

// PSID (Facebook user id) se Chatwoot par bhejo — conversation khud resolve karta hai.
// Send routing (index.js) isi ko call karta hai jab transport='chatwoot' ho.
export async function cwSendToPsid(psid, content) {
  const convId = await cwConvForPsid(psid)
  if (!convId) { const e = new Error(`Chatwoot conversation nahi mili (psid ${psid}) — reconcile abhi map nahi kar paya`); e.status = 404; throw e }
  const r = await cwSendMessage(convId, content)
  return { ...r, chatwoot_conversation_id: convId }
}

// abhi kaunsa transport active hai (settings se, index.js set karta hai)
export const cwSendEnabledFor = () => cwSendEnabled()

// shadow table ka quick hisaab (status endpoint ke liye)
export async function cwShadowStats() {
  await cwEnsureTable()
  const r = await pool.query(`SELECT count(*) total,
      count(*) FILTER (WHERE direction='in') incoming,
      count(*) FILTER (WHERE direction='out') outgoing,
      count(matched_meta_message_id) matched,
      max(received_at) last_received
    FROM public.chatwoot_shadow_messages`)
  return r.rows[0]
}
