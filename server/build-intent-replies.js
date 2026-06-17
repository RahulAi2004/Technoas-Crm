// For each intent: find the REAL agent reply from the chats (Qdrant: closest customer
// message → the agent's reply after it) + generate an AI-recommended reply.
// Output: ../intents-replies.json
import { getAll } from './db.js'
import { embed, chatJSON } from './ai.js'
import { QdrantClient } from './qdrant.js'
import fs from 'fs'
import path from 'path'

const BIZ = 'Decoinks, a custom apparel print shop (hoodies, t-shirts, jerseys, DTF transfers, embroidery, custom designs)'
async function pMap(items, fn, limit) {
  const ret = []; let i = 0
  await Promise.all(Array.from({ length: limit }, async () => {
    while (i < items.length) { const idx = i++; try { ret[idx] = await fn(items[idx], idx) } catch { ret[idx] = null } }
  }))
  return ret
}

const intents = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), '..', 'intents.json'), 'utf8')).intents
console.log('intents:', intents.length)

// index messages by conversation, in chat (array) order
const byConv = {}
for (const m of getAll('messages')) { (byConv[m.conversation_id] ||= []).push(m) }

const q = new QdrantClient()
const REPLY_SYS = `You are a senior customer-support agent at ${BIZ}. Write the BEST ready-to-send reply for the customer's question. If a real agent reply is given as reference, stay consistent with its facts (prices, turnaround, policies). Friendly, clear, concise. Use [brackets] for unknown specifics. Respond with ONLY JSON: { "reply": string }`

const out = await pMap(intents, async (it) => {
  // 1) REAL reply: closest customer message in the chats → the agent's reply right after it
  let realReply = ''
  try {
    const [vec] = await embed(it.question)
    const hits = await q.search('crm_messages', vec, { limit: 15 })
    for (const h of (hits?.result || [])) {
      if (h.payload?.dir !== 'in') continue
      const conv = byConv[h.payload.conversation_id] || []
      const idx = conv.findIndex((m) => String(m.id) === String(h.payload.message_id))
      if (idx < 0) continue
      const next = conv.slice(idx + 1).find((m) => m.dir === 'out' && m.text && m.text.trim() && m.text !== '[attachment]')
      if (next) { realReply = next.text.trim(); break }
    }
  } catch {}
  // 2) AI recommended reply (grounded in the real reply when available)
  let aiReply = ''
  try {
    const r = await chatJSON(REPLY_SYS, `Question: ${it.question}${realReply ? `\n\nReal agent reply (reference): ${realReply}` : ''}`)
    aiReply = r.reply || ''
  } catch (e) { aiReply = '[could not generate]' }
  return { ...it, realReply, aiReply }
}, 4)

const result = out.filter(Boolean)
const withReal = result.filter((r) => r.realReply).length
fs.writeFileSync(path.resolve(process.cwd(), '..', 'intents-replies.json'), JSON.stringify({ total: result.length, withRealReply: withReal, intents: result }, null, 2))
console.log(`\nDONE. ${result.length} intents · ${withReal} with a real agent reply found`)
process.exit(0)
