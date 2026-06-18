// Build a reusable AI PROFILE for every customer ONCE (structured facts + summary),
// so the assistant reads the digest instead of re-processing 25k raw messages each time.
// Stored on the conversation doc (app.conversations.extra.ai_profile). Re-runnable.
import pg from 'pg'
import { chatJSON } from './ai.js'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 40000, query_timeout: 120000, statement_timeout: 120000, idleTimeoutMillis: 10000 })
async function pMap(items, fn, limit) {
  const ret = []; let i = 0
  await Promise.all(Array.from({ length: limit }, async () => { while (i < items.length) { const idx = i++; try { ret[idx] = await fn(items[idx], idx) } catch { ret[idx] = null } } }))
  return ret
}

export const PROFILE_SYS = `You are building a reusable CRM customer profile from a custom apparel print-shop chat (hoodies, t-shirts, DTF transfers, embroidery). Read the WHOLE conversation and extract a concise, accurate, reusable profile. Use the real details from the chat. Respond with ONLY JSON:
{
 "summary": string,            // 2-4 sentences: who they are, what they wanted, and what happened/where it stands
 "products": string,           // what they want/ordered (e.g. "50 DTF transfers 12x12")
 "quantity": string,           // quantities/sizes mentioned ("" if none)
 "orderTotal": number,         // agreed/quoted total in USD (0 if none discussed)
 "paymentStatus": "paid"|"pending"|"none",
 "shippingAddress": string,    // "" if none
 "deadline": string,           // any due date/event ("" if none)
 "leadStage": string,          // one of: inquiry, quoted, artwork, payment_pending, paid, in_production, delivered, lost
 "sentiment": "positive"|"neutral"|"negative",
 "questions": [string],        // the distinct questions the CUSTOMER asked (cleaned + deduped, max 25)
 "keyNotes": [string],         // important facts/decisions the team must know (max 8)
 "nextStep": string            // what should happen next ("" if nothing pending)
}`

export async function profileFromTranscript(transcript) {
  return chatJSON(PROFILE_SYS, transcript.slice(0, 9000))
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1].endsWith('build-profiles.js')) {
  const convs = (await pool.query(`SELECT extra FROM app.conversations WHERE extra <> '{}'::jsonb`)).rows.map((r) => r.extra)
  // use the structured columns (lighter than reading full docs) via the conversation link
  const mrows = (await pool.query(`SELECT c.legacy_id cid, m.direction dir, m.body txt FROM app.messages m JOIN app.conversations c ON m.conversation_id = c.conversation_id WHERE m.body <> ''`)).rows
  const byConv = {}; for (const m of mrows) (byConv[m.cid] ||= []).push(m)
  console.log(`conversations: ${convs.length}, messages: ${mrows.length} — building profiles…`)

  const todo = convs.filter((conv) => {
    const cm = (byConv[conv.id] || []).filter((m) => m.dir === 'in' || m.dir === 'out')
    if (!cm.length) return false
    return !(conv.ai_profile && (conv.profile_msg_count || 0) >= cm.length) // skip already-built & fresh
  })
  console.log(`to build/update: ${todo.length} (rest already done)`)

  const results = await pMap(todo, async (conv) => {
    const cm = (byConv[conv.id] || []).filter((m) => m.dir === 'in' || m.dir === 'out')
    const transcript = cm.map((m) => `${m.dir === 'in' ? 'Customer' : 'Agent'}: ${m.txt}`).join('\n')
    try {
      const profile = await profileFromTranscript(transcript)
      return { id: conv.id, profile, count: (byConv[conv.id] || []).length }
    } catch { return null }
  }, 5)

  let saved = 0
  for (const r of results.filter(Boolean)) {
    await pool.query(`UPDATE app.conversations SET extra = extra || $1::jsonb, updated_at = now() WHERE legacy_id = $2`,
      [JSON.stringify({ ai_profile: r.profile, profile_msg_count: r.count, profile_at: new Date().toISOString() }), r.id])
    saved++
  }
  console.log(`\n✓ DONE — ${saved} customer profiles built & saved (structured facts + summary).`)
  await pool.end(); process.exit(0)
}
