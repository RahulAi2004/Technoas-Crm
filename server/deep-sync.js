// Deep sync (robust): pull the FULL message history of EVERY Meta conversation
// (paginating both the thread list AND each thread's messages), and write them to
// Postgres in batched, sequential upserts using a dedicated pool (no write-storm).
import pg from 'pg'
import { MetaClient } from './meta.js'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3, connectionTimeoutMillis: 15000, query_timeout: 30000, statement_timeout: 30000,
})
const setting = async (k) => (await pool.query('SELECT value FROM settings WHERE key=$1', [k])).rows[0]?.value

const nowTime = () => new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
const fmtTime = (iso) => { try { return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) } catch { return nowTime() } }
const metaAttachments = (att) => {
  const list = Array.isArray(att) ? att : (att?.data || [])
  return list.map((a) => {
    const url = a.image_data?.url || a.image_data?.preview_url || a.video_data?.url || a.file_url || null
    const type = a.video_data ? 'video' : a.image_data ? 'image' : 'file'
    return url ? { type, url, name: a.name || '' } : null
  }).filter(Boolean)
}

async function upsertBatch(rows) {
  if (!rows.length) return
  const vals = [], params = []
  rows.forEach((r, i) => { params.push(String(r.id), JSON.stringify(r)); vals.push(`($${i * 2 + 1}, $${i * 2 + 2}::jsonb)`) })
  await pool.query(
    `INSERT INTO messages (id, doc) VALUES ${vals.join(',')} ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()`,
    params,
  )
}

const token = await setting('meta_page_token')
if (!token) { console.error('Meta not connected.'); process.exit(1) }
const pageId = String((await setting('meta_page_id')) || '')
const ig = (await setting('meta_ig')) || {}
const igId = String(ig?.id || '')
const client = new MetaClient(token)

// Enumerate ALL threads for a platform (follow paging.next).
async function listAllThreads(platform) {
  const out = []
  let res = await client.getConversations(platform)
  let guard = 0
  while (res && guard++ < 50) {
    out.push(...(res.data || []))
    const next = res.paging?.next
    if (!next) break
    const r = await fetch(next)
    res = await r.json().catch(() => null)
    if (!res || res.error) break
  }
  return out
}

let threadCount = 0, seen = 0, stored = 0
const buffer = []
const flushBuffer = async () => { if (buffer.length) { await upsertBatch(buffer.splice(0, buffer.length)) } }

for (const [platform, prefix] of [['messenger', 'fb'], ['instagram', 'ig']]) {
  if (platform === 'instagram' && !igId) continue
  let threads = []
  try { threads = await listAllThreads(platform) } catch (e) { console.warn(`[${platform}] list err: ${e.message}`); continue }
  console.log(`\n[${platform}] ${threads.length} threads`)

  for (const c of threads) {
    const parts = c.participants?.data || []
    const other = parts.find((p) => String(p.id) !== pageId && String(p.id) !== igId) || parts[0]
    if (!other) continue
    const convId = `${prefix}:${other.id}`
    threadCount++
    let after, page = 0, tNew = 0
    do {
      let res
      try { res = await client.getThreadMessages(c.id, after) }
      catch (e) { console.warn(`  ${convId} page err: ${e.message}`); break }
      for (const m of (res?.data || [])) {
        seen++; tNew++
        const fromId = String(m.from?.id || '')
        buffer.push({
          id: m.id,
          conversation_id: convId,
          dir: (fromId === pageId || fromId === igId) ? 'out' : 'in',
          text: m.message || '',
          attachments: metaAttachments(m.attachments),
          time: fmtTime(m.created_time),
          via: 'meta',
          created_at: m.created_time || new Date().toISOString(),
        })
      }
      if (buffer.length >= 150) { stored += buffer.length; await flushBuffer() }
      after = res?.paging?.cursors?.after
      if (!res?.paging?.next) after = null
      page++
    } while (after && page < 100)
    process.stdout.write(`\r  ${threadCount} threads · ${other.name || convId}: ${tNew} msgs · seen ${seen}   `)
  }
}
stored += buffer.length
await flushBuffer()

const total = (await pool.query('SELECT count(*)::int n FROM messages')).rows[0].n
console.log(`\n\nDeep sync done. Threads: ${threadCount} | messages seen: ${seen} | total messages in DB: ${total}`)
await pool.end()
process.exit(0)
