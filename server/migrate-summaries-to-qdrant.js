// One-time: copy every existing AI summary from Postgres into Qdrant (`crm_summaries`).
// NON-DESTRUCTIVE: Postgres rows are only read, never modified. From now on the app
// writes summaries to Qdrant only; the old Postgres copies just become stale.
// Run: node --env-file=.env migrate-summaries-to-qdrant.js
import { createHash } from 'crypto'
import pg from 'pg'
import { embed } from './ai.js'
import { QdrantClient } from './qdrant.js'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, query_timeout: 120000 })
const q = new QdrantClient()
const COLL = 'crm_summaries'

const pointId = (id) => {
  const h = createHash('md5').update(String(id)).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}
const zeroVec = () => new Array(1536).fill(0)
async function vecFor(text) {
  try { const [v] = await embed(String(text).slice(0, 8000)); return v }
  catch (e) { console.warn('  embed failed (using zero vector):', e.message); return zeroVec() }
}

await q.ensureCollection(COLL, { size: 1536 })
try { await q.createPayloadIndex(COLL, 'conversation_id', 'keyword') } catch {}
try { await q.createPayloadIndex(COLL, 'kind', 'keyword') } catch {}

// 1) Conversation summaries cached on the conversation doc (extra.summary)
const { rows: convs } = await pool.query(`
  SELECT legacy_id, extra FROM app.conversations
  WHERE extra ? 'summary' AND extra->'summary' IS NOT NULL AND extra->>'summary' <> ''`)
console.log(`conversation summaries to migrate: ${convs.length}`)
let n = 0
for (const r of convs) {
  const d = r.extra
  const cid = d.id ?? r.legacy_id
  const s = d.summary
  const text = typeof s === 'string' ? s : [s?.overview, ...(Array.isArray(s?.keyPoints) ? s.keyPoints : []), s?.status, s?.nextStep].filter(Boolean).join('\n')
  await q.upsert(COLL, [{
    id: pointId(`summary:${cid}`),
    vector: await vecFor(text || 'empty'),
    payload: { kind: 'conversation_summary', conversation_id: String(cid), summary: s, summary_count: d.summary_count || 0, summary_at: d.summary_at || null },
  }])
  if (++n % 10 === 0) console.log(`  ${n}/${convs.length}`)
}
console.log(`✔ conversation summaries migrated: ${n}`)

// 2) After-session summary texts (app.leads + app.conversations columns + app.requirements)
const { rows: as } = await pool.query(`
  SELECT co.legacy_id cid, l.lead_summary, l.profile_summary, l.ai_observations,
         co.conversation_summary, co.conversation_insights, rq.requirement_summary
  FROM app.conversations co
  LEFT JOIN app.leads l ON l.conversation_id = co.conversation_id
  LEFT JOIN app.requirements rq ON rq.legacy_id = 'req:' || co.legacy_id
  WHERE COALESCE(l.lead_summary, l.profile_summary, l.ai_observations,
                 co.conversation_summary, co.conversation_insights, rq.requirement_summary) IS NOT NULL`)
console.log(`after-session summary rows to migrate: ${as.length}`)
let m = 0
for (const r of as) {
  const fields = {
    lead_summary: r.lead_summary, profile_summary: r.profile_summary, ai_observations: r.ai_observations,
    conversation_summary: r.conversation_summary, conversation_insights: r.conversation_insights, requirement_summary: r.requirement_summary,
  }
  await q.upsert(COLL, [{
    id: pointId(`aftersession:${r.cid}`),
    vector: await vecFor(Object.values(fields).filter(Boolean).join('\n')),
    payload: { kind: 'after_session', conversation_id: String(r.cid), ...fields, saved_at: new Date().toISOString() },
  }])
  if (++m % 10 === 0) console.log(`  ${m}/${as.length}`)
}
console.log(`✔ after-session summaries migrated: ${m}`)

const info = await q.getCollection(COLL)
console.log(`crm_summaries points total: ${info?.result?.points_count}`)
await pool.end()
