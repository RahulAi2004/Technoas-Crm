// Re-ingest ALL messages into Qdrant (so intent real-reply search covers full history).
import { getAll } from './db.js'
import { embed } from './ai.js'
import { QdrantClient } from './qdrant.js'
import { createHash } from 'node:crypto'

const pid = (id) => { const h = createHash('md5').update(String(id)).digest('hex'); return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}` }
const q = new QdrantClient(); const C = 'crm_messages'
await q.ensureCollection(C, { size: 1536 })
try { await q.createPayloadIndex(C, 'conversation_id', 'keyword') } catch {}
try { await q.createPayloadIndex(C, 'dir', 'keyword') } catch {}

const all = getAll('messages').filter((m) => m.text && m.text.trim() && m.text !== '[attachment]')
console.log('messages to ingest:', all.length)
let done = 0; const B = 100
for (let i = 0; i < all.length; i += B) {
  const s = all.slice(i, i + B)
  try {
    const vecs = await embed(s.map((m) => m.text))
    await q.upsert(C, s.map((m, j) => ({ id: pid(m.id), vector: vecs[j], payload: { message_id: String(m.id), conversation_id: m.conversation_id, dir: m.dir, text: m.text } })))
    done += s.length
  } catch (e) { console.log('batch err @', i, e.message) }
  process.stdout.write(`\r  ${done}/${all.length}`)
}
const info = await q.getCollection(C)
console.log(`\nDONE. points in ${C}:`, info?.result?.points_count)
process.exit(0)
