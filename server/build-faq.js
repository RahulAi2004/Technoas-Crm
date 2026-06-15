// Go through every conversation, extract distinct customer questions, dedupe them,
// and generate the best agent reply for each (grounded in real agent replies via Qdrant).
// Output: ../faq.json  (consumed by build-faq-docx.py)
import { getAll } from './db.js'
import { embed, chatJSON } from './ai.js'
import { QdrantClient, qdrantConfigured } from './qdrant.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const BIZ = 'Decoinks, a custom apparel print shop (hoodies, t-shirts, jerseys, DTF transfers, embroidery, custom designs)'

// 1) Gather all customer messages
const convs = getAll('conversations')
const inMsgs = getAll('messages').filter((m) => m.dir === 'in' && m.text && m.text.trim() && m.text !== '[attachment]')
console.log(`Conversations: ${convs.length} | customer messages: ${inMsgs.length}`)

// 2) Extract distinct questions/requests in batches
const EXTRACT_SYS = `You are analyzing real customer messages for ${BIZ}. From the messages, extract every DISTINCT question or request a customer is making, each rephrased as a clear, generic, FAQ-style question in English. Ignore greetings, thanks, confirmations and non-questions. Respond with ONLY JSON: { "questions": [string] }`

const texts = inMsgs.map((m) => m.text.trim())
const BATCH = 50
let raw = []
for (let i = 0; i < texts.length; i += BATCH) {
  const batch = texts.slice(i, i + BATCH)
  try {
    const out = await chatJSON(EXTRACT_SYS, batch.map((t, j) => `${j + 1}. ${t}`).join('\n'))
    if (Array.isArray(out.questions)) raw.push(...out.questions)
  } catch (e) { console.log('  extract batch err:', e.message) }
  process.stdout.write(`\r  extracting ${Math.min(i + BATCH, texts.length)}/${texts.length} → ${raw.length} raw questions`)
}
console.log(`\nRaw questions: ${raw.length}`)

// 3) Canonicalize / dedupe into unique FAQ questions grouped by category
const CANON_SYS = `Here is a list of customer questions for ${BIZ} (many duplicates / near-duplicates). Merge them into a DEDUPLICATED list of UNIQUE, canonical FAQ questions a customer might ask. Keep only genuinely distinct questions. Group them by a short category (e.g. Pricing, Delivery & Shipping, Products & Materials, Design & Artwork, Orders & Payment, Returns, General). Order by how common/important they are. Respond with ONLY JSON: { "faqs": [ { "category": string, "question": string } ] }`
const canon = await chatJSON(CANON_SYS, raw.map((q, i) => `${i + 1}. ${q}`).join('\n'))
const faqs = Array.isArray(canon.faqs) ? canon.faqs : []
console.log(`Unique FAQ questions: ${faqs.length}`)

// 4) For each FAQ, pull how agents actually answered (Qdrant), then generate the best reply
const q = qdrantConfigured() ? new QdrantClient() : null
const REPLY_SYS = `You are a senior customer-support agent at ${BIZ}. Write the BEST ready-to-send reply for the FAQ question. Ground it in how the shop's agents have actually answered similar questions (provided as reference) when available; otherwise use sensible, professional defaults for a print shop. Be friendly, clear and concise. If an exact value (price, turnaround days) is needed but unknown, use a clear placeholder in [brackets] the agent can fill in. Respond with ONLY JSON: { "reply": string }`

const result = []
for (let i = 0; i < faqs.length; i++) {
  const f = faqs[i]
  let refs = []
  if (q) {
    try {
      const [vec] = await embed(f.question)
      const hits = await q.search('crm_messages', vec, { limit: 10 })
      refs = (hits?.result || [])
        .filter((h) => h.payload?.dir === 'out' && h.payload?.text)
        .map((h) => h.payload.text)
        .slice(0, 5)
    } catch { /* ignore */ }
  }
  let reply = ''
  try {
    const out = await chatJSON(REPLY_SYS, `Question: ${f.question}\n\nHow our agents have answered similar things (reference, may be in Spanish):\n${refs.join('\n---\n') || '(none found)'}`)
    reply = out.reply || ''
  } catch (e) { reply = '[Could not generate — ' + e.message + ']' }
  result.push({ category: f.category || 'General', question: f.question, reply })
  process.stdout.write(`\r  generating replies ${i + 1}/${faqs.length}`)
}
console.log('')

// 5) Write JSON
const fs = await import('fs')
const path = await import('path')
const outPath = path.resolve(process.cwd(), '..', 'faq.json')
fs.writeFileSync(outPath, JSON.stringify({ generatedFrom: { conversations: convs.length, messages: inMsgs.length }, faqs: result }, null, 2))
console.log(`\nDONE → ${outPath}  (${result.length} FAQs)`)
process.exit(0)
