// Extract customer contact info: name (DB) + phone/email mined from the customer's OWN messages
// (direction='in' only, so we never pick up Decoinks' own contact details) + company/industry hints.
// Output: contacts.json    Run: node --env-file=.env pull-contacts.js
import pg from 'pg'
import fs from 'fs'
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 30000, query_timeout: 240000, statement_timeout: 240000 })
async function q(sql, tries = 8) {
  for (let i = 0; i < tries; i++) { try { return await pool.query(sql) } catch (e) { console.log(`retry ${i + 1}: ${e.message}`); await new Promise(r => setTimeout(r, 2500)) } }
  throw new Error('query failed')
}

// ---------- extractors ----------
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
// US-style: optional +1, area code 2-9, not part of a longer digit run
const PHONE_RE = /(?<!\d)(?:\+?1[\s.\-]?)?\(?([2-9]\d{2})\)?[\s.\-]?(\d{3})[\s.\-]?(\d{4})(?!\d)/g
// light company hints written by the customer
const COMPANY_RE = /\b(?:my|our)\s+(?:company|business|shop|store|brand)\s+(?:is|name is|called)\s+([A-Z][\w&'.\- ]{2,40})|\b(?:company|business|brand)\s+name\s+is\s+([A-Z][\w&'.\- ]{2,40})/gi

const clean = (s) => (s || '').replace(/\s+/g, ' ').trim()

const custs = (await q(`SELECT customer_id, full_name, industry, total_orders, total_spent FROM app.customers`)).rows
console.log('customers:', custs.length)

// customer's own text messages
const msgs = (await q(`
  SELECT co.customer_id cid, m.body
  FROM app.messages m JOIN app.conversations co ON co.conversation_id = m.conversation_id
  WHERE m.direction='in' AND m.message_type='text' AND m.body <> ''`)).rows
console.log('customer text messages:', msgs.length)

// AI profile hints (shipping address / key notes) per customer
const prof = (await q(`
  SELECT customer_id cid,
         extra->'ai_profile'->>'shippingAddress' addr,
         extra->'ai_profile'->>'keyNotes' notes
  FROM app.conversations WHERE extra ? 'ai_profile'`)).rows
const profBy = new Map()
for (const p of prof) {
  if (!profBy.has(p.cid)) profBy.set(p.cid, { addr: null, notes: null })
  const x = profBy.get(p.cid)
  if (!x.addr && clean(p.addr)) x.addr = clean(p.addr)
  if (!x.notes && clean(p.notes)) x.notes = clean(p.notes)
}

const byCust = new Map()
for (const m of msgs) {
  if (!byCust.has(m.cid)) byCust.set(m.cid, [])
  byCust.get(m.cid).push(m.body)
}

const out = []
let nEmail = 0, nPhone = 0, nBoth = 0, nCompany = 0
for (const c of custs) {
  const bodies = byCust.get(c.customer_id) || []
  const emails = new Set(), phones = new Set(), companies = new Set()
  let emailSrc = null, phoneSrc = null
  for (const b of bodies) {
    const t = clean(b)
    for (const e of t.match(EMAIL_RE) || []) {
      emails.add(e.toLowerCase()); if (!emailSrc) emailSrc = t.slice(0, 140)
    }
    PHONE_RE.lastIndex = 0
    let mm
    while ((mm = PHONE_RE.exec(t)) !== null) {
      const p = `${mm[1]}${mm[2]}${mm[3]}`
      if (/^(\d)\1{9}$/.test(p)) continue          // 1111111111 etc
      phones.add(`(${mm[1]}) ${mm[2]}-${mm[3]}`); if (!phoneSrc) phoneSrc = t.slice(0, 140)
    }
    COMPANY_RE.lastIndex = 0
    let cm
    while ((cm = COMPANY_RE.exec(t)) !== null) {
      const name = clean(cm[1] || cm[2]); if (name) companies.add(name)
    }
  }
  const p = profBy.get(c.customer_id) || {}
  const rec = {
    name: c.full_name || 'Unknown',
    phone: [...phones].join(' | '),
    email: [...emails].join(' | '),
    company: [...companies].join(' | '),
    industry: clean(c.industry),
    address: p.addr || '',
    orders: c.total_orders ?? 0,
    spend: Number(c.total_spent || 0),
    msgs: bodies.length,
    email_src: emailSrc || '',
    phone_src: phoneSrc || '',
  }
  if (rec.email) nEmail++
  if (rec.phone) nPhone++
  if (rec.email && rec.phone) nBoth++
  if (rec.company || rec.industry) nCompany++
  out.push(rec)
}
// contacts first (those with any info), then by spend
out.sort((a, b) => ((b.email || b.phone ? 1 : 0) - (a.email || a.phone ? 1 : 0)) || (b.spend - a.spend))
fs.writeFileSync('contacts.json', JSON.stringify(out, null, 1))
console.log(`\n=== EXTRACTED FROM CHATS ===`)
console.log(`  total customers   : ${out.length}`)
console.log(`  with EMAIL        : ${nEmail}`)
console.log(`  with PHONE        : ${nPhone}`)
console.log(`  with BOTH         : ${nBoth}`)
console.log(`  with company/industry: ${nCompany}`)
console.log('saved contacts.json')
await pool.end(); process.exit(0)
