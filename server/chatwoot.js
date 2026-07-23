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
  tableReady = true
}

// ---- webhook payload -> shadow row (message_created event) ----
// Chatwoot payload: { event, id, content, created_at, message_type: 'incoming'|'outgoing',
//                     conversation:{id}, inbox:{id}, sender:{name}, attachments:[{data_url,...}] }
export async function cwStoreShadow(payload) {
  if (!cwEnabled()) return { ignored: true, reason: 'integration disabled' }
  if (payload?.event !== 'message_created') return { ignored: true, reason: `event ${payload?.event || 'unknown'}` }
  const msgId = Number(payload.id)
  if (!msgId) return { ignored: true, reason: 'no message id' }

  const mt = String(payload.message_type ?? '')
  const direction = (mt === 'incoming' || mt === '0') ? 'in' : 'out'
  const atts = Array.isArray(payload.attachments)
    ? payload.attachments.map((a) => ({ url: a.data_url || a.url || null, type: a.file_type || null, id: a.id || null }))
    : []

  await cwEnsureTable()
  const r = await pool.query(
    `INSERT INTO public.chatwoot_shadow_messages
       (chatwoot_message_id, chatwoot_conversation_id, chatwoot_inbox_id, direction, content,
        attachments, customer_name, chatwoot_created_at, raw_payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (chatwoot_message_id) DO NOTHING
     RETURNING id`,
    [msgId, payload.conversation?.id || null, payload.inbox?.id || null, direction,
     String(payload.content || ''), JSON.stringify(atts),
     payload.sender?.name || payload.conversation?.meta?.sender?.name || null,
     payload.created_at ? new Date(payload.created_at) : new Date(), payload])
  return r.rows[0] ? { stored: true, id: r.rows[0].id } : { stored: false, duplicate: true }
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
