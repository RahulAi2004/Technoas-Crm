// Extract EVERY customer question from all chats, then group by INTENT (same intent =
// one entry). Output: ../intents.json — a chatbot-ready list of distinct intents with
// a canonical question, category, and example phrasings.
import { getAll } from './db.js'
import { chatJSON } from './ai.js'

const BIZ = 'Decoinks, a custom apparel print shop (hoodies, t-shirts, jerseys, DTF transfers, embroidery, custom designs)'

async function pMap(items, fn, limit) {
  const ret = []; let i = 0
  await Promise.all(Array.from({ length: limit }, async () => {
    while (i < items.length) { const idx = i++; try { ret[idx] = await fn(items[idx], idx) } catch { ret[idx] = null } }
  }))
  return ret
}

// 1) all customer messages, deduped
const inMsgs = getAll('messages').filter((m) => m.dir === 'in' && m.text && m.text.trim() && m.text !== '[attachment]')
const seen = new Set(); const texts = []
for (const m of inMsgs) { const k = m.text.trim().toLowerCase(); if (!seen.has(k)) { seen.add(k); texts.push(m.text.trim()) } }
console.log(`Customer messages: ${inMsgs.length} → unique: ${texts.length}`)

// 2) extract questions/requests (concurrent)
const EXTRACT_SYS = `You are analyzing real customer messages for ${BIZ}. Extract every DISTINCT question or request a customer is making, each rephrased as a clear, generic, FAQ-style question in English. Ignore greetings, thanks, confirmations and non-questions. Respond with ONLY JSON: { "questions": [string] }`
const B = 120
const batches = []
for (let i = 0; i < texts.length; i += B) batches.push(texts.slice(i, i + B))
console.log(`Extracting in ${batches.length} batches...`)
const raw = (await pMap(batches, async (b) => {
  const out = await chatJSON(EXTRACT_SYS, b.map((t, j) => `${j + 1}. ${t}`).join('\n'))
  return Array.isArray(out.questions) ? out.questions : []
}, 6)).filter(Boolean).flat()
const seenQ = new Set(); const uniqRaw = []
for (const q of raw) { const k = (q || '').trim().toLowerCase(); if (k && !seenQ.has(k)) { seenQ.add(k); uniqRaw.push(q.trim()) } }
console.log(`Raw questions: ${raw.length} → unique: ${uniqRaw.length}`)

// 3) group by INTENT — chunked so output never truncates, then a final merge
const CAT = 'Pricing, Delivery & Shipping, Products & Materials, Design & Artwork, Orders & Payment, Returns & Issues, General'
const GROUP_SYS = `These are customer questions for ${BIZ}. Group them by INTENT — questions that mean the same thing are ONE intent. For each distinct intent return: a short intent name (snake_case), one clear canonical question, a category (${CAT}), and 1-2 example phrasings from the list. Keep ALL genuinely distinct intents from THIS list (do not over-merge unrelated ones). Respond with ONLY JSON: { "intents": [ { "intent": string, "question": string, "category": string, "examples": [string] } ] }`
const CH = 200
const chunks = []
for (let i = 0; i < uniqRaw.length; i += CH) chunks.push(uniqRaw.slice(i, i + CH))
console.log(`Grouping into intents (${chunks.length} chunks)...`)
const subs = (await pMap(chunks, async (c) => {
  const out = await chatJSON(GROUP_SYS, c.map((q, i) => `${i + 1}. ${q}`).join('\n'))
  return Array.isArray(out.intents) ? out.intents : []
}, 4)).filter(Boolean).flat()
console.log(`After chunk grouping: ${subs.length} → merging per category...`)

// Merge within each category (small calls, parallel, fallback) — avoids one huge slow call.
const byCat = {}
for (const s of subs) { const c = s.category || 'General'; (byCat[c] ||= []).push(s) }
const catNames = Object.keys(byCat)
const PER_CAT_SYS = `These are customer intents within ONE category for ${BIZ}. Merge intents that mean the same thing into ONE; keep ALL genuinely distinct intents. For each return: short intent name (snake_case), a clear canonical question, and up to 3 example phrasings. Respond with ONLY JSON: { "intents": [ { "intent": string, "question": string, "examples": [string] } ] }`
const mergedByCat = await pMap(catNames, async (c) => {
  try {
    const out = await chatJSON(PER_CAT_SYS, byCat[c].map((s, i) => `${i + 1}. (${s.intent || ''}) ${s.question}${s.examples?.length ? ' | ex: ' + s.examples.join(' / ') : ''}`).join('\n'))
    const arr = Array.isArray(out.intents) ? out.intents : byCat[c]
    return arr.map((x) => ({ intent: x.intent || '', question: x.question || '', examples: x.examples || [], category: c }))
  } catch { return byCat[c] }   // fallback: keep this category's intents as-is
}, 4)
const intents = mergedByCat.filter(Boolean).flat()
console.log(`Distinct intents: ${intents.length}`)

const fs = await import('fs'); const path = await import('path')
const outPath = path.resolve(process.cwd(), '..', 'intents.json')
fs.writeFileSync(outPath, JSON.stringify({ source: { conversations: getAll('conversations').length, customerMessages: inMsgs.length, uniqueMessages: texts.length, rawQuestions: raw.length }, intents }, null, 2))
console.log(`\nDONE → ${outPath} (${intents.length} intents)`)
process.exit(0)
