// Build a company knowledge base STRICTLY from real chat data in PostgreSQL.
// Analyzes actual AGENT replies (what Decoinks really told customers), deduped by frequency,
// and extracts only facts that are explicitly stated — each with a verbatim evidence quote.
// Output: knowledge.json  (source of truth = chats, NOT the field master).
import pg from 'pg'
import { chatJSON } from './ai.js'
import fs from 'fs'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 30000, query_timeout: 180000, statement_timeout: 180000 })
const norm = (t) => (t || '').toLowerCase().replace(/\s+/g, ' ').trim().replace(/[?.!,]+$/, '').trim()

async function queryRetry(sql, tries = 6) {
  for (let i = 0; i < tries; i++) {
    try { return await pool.query(sql) }
    catch (e) { console.log(`  query retry ${i + 1}/${tries}: ${e.message}`); await new Promise((r) => setTimeout(r, 2500)) }
  }
  throw new Error('query failed after retries')
}

// 1) pull every real agent reply
const r = await queryRetry(`SELECT body FROM app.messages WHERE direction='out' AND body <> ''`)
console.log('agent replies pulled:', r.rows.length)

// 2) dedupe by normalized text + count how often each was sent
const counts = {}
for (const row of r.rows) {
  const b = (row.body || '').trim()
  if (b.length < 12 || b.length > 700) continue
  const k = norm(b); if (!k) continue
  ;(counts[k] ||= { n: 0, sample: b }).n++
}
const SKIP = /^(hi|hii+|hello|hey|thanks|thank you|thankyou|ok|okay|yes|no|sure|great|perfect|got it|alright|welcome|you.?re welcome|good morning|good evening|good afternoon|np|👍|😊)\b[\s!😊👍]*$/i
let distinct = Object.values(counts).filter((d) => !SKIP.test(d.sample.trim())).sort((a, b) => b.n - a.n)
console.log('distinct informative agent replies:', distinct.length)
const top = distinct.slice(0, 500)   // covers the vast majority of what agents actually say
const covered = top.reduce((s, d) => s + d.n, 0)
console.log(`analyzing top ${top.length} distinct replies (cover ${covered} sends)`)

// 3) extract grounded facts per batch
const CATS = 'products_services, not_offered, pricing, offers_deals, minimum_order, turnaround_production, shipping, payment_methods, location_contact, artwork_files, samples_mockups, sizing, other_policies'
const SYS = `You are building a company knowledge base for Decoinks (a custom apparel + DTF transfer print shop) STRICTLY from what its own sales agents actually wrote to customers.
Below are REAL agent replies, deduplicated ("Nx" = how many times that reply was sent).
Rules:
- Extract ONLY concrete facts that are EXPLICITLY stated in these replies. Do NOT add, assume, generalize, or use outside knowledge.
- If the agents say Decoinks does NOT do something, put it under not_offered.
- Prefer facts backed by higher counts.
- For each fact, include a short verbatim snippet from a reply as evidence.
Categories: ${CATS}.
Respond ONLY JSON: {"facts": {"<category>": [{"fact": string, "evidence": string}]}}`

const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o }
const batches = chunk(top, 70)
const all = {}
let bi = 0
for (const b of batches) {
  const user = b.map((d) => `(${d.n}x) ${d.sample}`).join('\n')
  try {
    const out = await chatJSON(SYS, user)
    for (const [cat, arr] of Object.entries(out?.facts || {})) (all[cat] ||= []).push(...(Array.isArray(arr) ? arr : []))
  } catch (e) { console.log('  extract error:', e.message) }
  console.log(`  batch ${++bi}/${batches.length} done`)
}

// 4) dedupe facts in code, then AI-consolidate into a clean, non-duplicated KB
for (const cat of Object.keys(all)) {
  const seen = new Set(), out = []
  for (const f of all[cat]) { const k = norm(f?.fact || ''); if (!k || seen.has(k)) continue; seen.add(k); out.push(f) }
  all[cat] = out
}
const CONS = `You are finalizing Decoinks' chat-derived knowledge base. Merge overlapping/duplicate facts, keep only clear well-supported facts, and write each fact concisely and accurately to its evidence. Keep the SAME categories. Do NOT invent anything or add facts without evidence. Respond ONLY JSON: {"facts": {"<category>": [{"fact": string, "evidence": string}]}}`
let final = { facts: all }
try { final = await chatJSON(CONS, JSON.stringify({ facts: all })) } catch (e) { console.log('consolidate error:', e.message) }

final.meta = { agentRepliesAnalyzed: r.rows.length, distinctAnalyzed: top.length, coveredSends: covered, generatedFrom: 'app.messages (direction=out) — real agent replies' }
fs.writeFileSync('knowledge.json', JSON.stringify(final, null, 2))
const nFacts = Object.values(final.facts || {}).reduce((s, a) => s + (Array.isArray(a) ? a.length : 0), 0)
console.log(`\n✓ saved knowledge.json — ${Object.keys(final.facts || {}).length} categories, ${nFacts} grounded facts`)
await pool.end(); process.exit(0)
