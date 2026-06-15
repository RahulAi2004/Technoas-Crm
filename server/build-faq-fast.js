// FAST FAQ builder over the FULL history: dedupe customer messages, extract questions
// with concurrency, canonicalize, then batch-generate replies grounded in a reference
// block of real agent answers (no slow per-question Qdrant search).
import { getAll } from './db.js'
import { chatJSON } from './ai.js'

const BIZ = 'Decoinks, a custom apparel print shop (hoodies, t-shirts, jerseys, DTF transfers, embroidery, custom designs)'

async function pMap(items, fn, limit) {
  const ret = []; let i = 0
  await Promise.all(Array.from({ length: limit }, async () => {
    while (i < items.length) { const idx = i++; try { ret[idx] = await fn(items[idx], idx) } catch (e) { ret[idx] = null } }
  }))
  return ret
}

// 1) Gather + dedupe customer messages
const inMsgsRaw = getAll('messages').filter((m) => m.dir === 'in' && m.text && m.text.trim() && m.text !== '[attachment]')
const seenT = new Set(); const texts = []
for (const m of inMsgsRaw) { const k = m.text.trim().toLowerCase(); if (!seenT.has(k)) { seenT.add(k); texts.push(m.text.trim()) } }
console.log(`Customer messages: ${inMsgsRaw.length} → unique: ${texts.length}`)

// Reference block: informative real agent replies (longest English-ish, deduped)
const outMsgs = getAll('messages').filter((m) => m.dir === 'out' && m.text && m.text.trim().length > 40)
const seenO = new Set(); const refs = []
for (const m of outMsgs.sort((a, b) => b.text.length - a.text.length)) {
  const k = m.text.trim().slice(0, 60).toLowerCase()
  if (!seenO.has(k)) { seenO.add(k); refs.push(m.text.trim()) }
  if (refs.length >= 60) break
}
const refBlock = refs.join('\n---\n')

// 2) Extract questions — concurrent, big batches
const EXTRACT_SYS = `You are analyzing real customer messages for ${BIZ}. Extract every DISTINCT question or request, each rephrased as a clear, generic, FAQ-style question in English. Ignore greetings, thanks, confirmations and non-questions. Respond with ONLY JSON: { "questions": [string] }`
const B = 120
const batches = []
for (let i = 0; i < texts.length; i += B) batches.push(texts.slice(i, i + B))
console.log(`Extracting in ${batches.length} batches (concurrency 6)...`)
const parts = await pMap(batches, async (batch) => {
  const out = await chatJSON(EXTRACT_SYS, batch.map((t, j) => `${j + 1}. ${t}`).join('\n'))
  return Array.isArray(out.questions) ? out.questions : []
}, 6)
const raw = parts.filter(Boolean).flat()
console.log(`Raw questions: ${raw.length}`)

// 3) Canonicalize / dedupe — CHUNKED to avoid truncated output on huge inputs
const seenQ = new Set(); const uniqRaw = []
for (const q of raw) { const k = (q || '').trim().toLowerCase(); if (k && !seenQ.has(k)) { seenQ.add(k); uniqRaw.push(q.trim()) } }
console.log(`Unique raw questions: ${uniqRaw.length}`)

const CAT = 'Pricing, Delivery & Shipping, Products & Materials, Design & Artwork, Orders & Payment, Returns, General'
const CANON_SYS = `These are customer questions for ${BIZ} (many duplicates). Merge into a DEDUPLICATED list of UNIQUE, canonical FAQ questions — keep only genuinely distinct ones, return AT MOST 40 from THIS list. Group by a short category (${CAT}). Respond with ONLY JSON: { "faqs": [ { "category": string, "question": string } ] }`
const CH = 250
const chunks = []
for (let i = 0; i < uniqRaw.length; i += CH) chunks.push(uniqRaw.slice(i, i + CH))
console.log(`Canonicalizing in ${chunks.length} chunks...`)
const subLists = await pMap(chunks, async (chunk) => {
  const out = await chatJSON(CANON_SYS, chunk.map((q, i) => `${i + 1}. ${q}`).join('\n'))
  return Array.isArray(out.faqs) ? out.faqs : []
}, 4)
const merged = subLists.filter(Boolean).flat()
console.log(`After chunk-canonicalize: ${merged.length} → final merge...`)

const MERGE_SYS = `Here are FAQ questions (with categories) for ${BIZ}, possibly duplicated across groups. Merge into a FINAL deduplicated list of the most important, genuinely distinct FAQs (aim 70–100). Keep a category (${CAT}). Order by importance. Respond with ONLY JSON: { "faqs": [ { "category": string, "question": string } ] }`
const finalCanon = await chatJSON(MERGE_SYS, merged.map((f, i) => `${i + 1}. [${f.category || 'General'}] ${f.question}`).join('\n'))
const faqs = (Array.isArray(finalCanon.faqs) && finalCanon.faqs.length) ? finalCanon.faqs : merged
console.log(`Unique FAQ questions: ${faqs.length}`)

// 4) Generate replies — batched + concurrent, grounded in the reference block
const REPLY_SYS = `You are a senior customer-support agent at ${BIZ}. For EACH question, write the BEST ready-to-send reply. Ground it in the REFERENCE answers (real replies our agents gave — reuse their facts: location, turnaround, policies, prices). Be friendly, clear, concise. If an exact value is unknown, use a clear [bracketed] placeholder. Respond with ONLY JSON: { "answers": [ { "question": string, "reply": string } ] }`
const RB = 12
const rbatches = []
for (let i = 0; i < faqs.length; i += RB) rbatches.push(faqs.slice(i, i + RB))
console.log(`Generating replies in ${rbatches.length} batches (concurrency 4)...`)
const answered = await pMap(rbatches, async (batch) => {
  const out = await chatJSON(REPLY_SYS, `REFERENCE (real agent answers, may be in Spanish):\n${refBlock}\n\nQUESTIONS:\n${batch.map((f, i) => `${i + 1}. ${f.question}`).join('\n')}`)
  const ans = Array.isArray(out.answers) ? out.answers : []
  return batch.map((f, i) => ({ category: f.category || 'General', question: f.question, reply: ans[i]?.reply || ans.find((a) => a.question === f.question)?.reply || '[no reply generated]' }))
}, 4)
const result = answered.filter(Boolean).flat()

const fs = await import('fs'); const path = await import('path')
const outPath = path.resolve(process.cwd(), '..', 'faq.json')
fs.writeFileSync(outPath, JSON.stringify({ generatedFrom: { conversations: getAll('conversations').length, messages: inMsgsRaw.length, uniqueMessages: texts.length }, faqs: result }, null, 2))
console.log(`\nDONE → ${outPath}  (${result.length} FAQs)`)
process.exit(0)
