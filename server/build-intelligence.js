// Lead Intelligence engine: AI-score every conversation/customer and fill the
// blueprint's STRUCTURED fields (intent, temperature, sentiment, segment, language,
// industry, health, churn...) + AI summaries. Reads chats from app.*, writes columns.
// Run on the SERVER after deploy:  docker exec technocas_backend node build-intelligence.js
import pg from 'pg'
import { chatJSON } from './ai.js'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 40000, query_timeout: 120000, statement_timeout: 120000, idleTimeoutMillis: 10000 })
async function pMap(items, fn, limit) {
  const ret = []; let i = 0
  await Promise.all(Array.from({ length: limit }, async () => { while (i < items.length) { const idx = i++; try { ret[idx] = await fn(items[idx], idx) } catch { ret[idx] = null } } }))
  return ret
}

const SYS = `You are a sales/lead-intelligence analyst for Decoinks (custom apparel + DTF transfer print shop). Read the conversation (and the order history given) and score this lead/customer for the sales team. Use the chat evidence; if unknown, make a reasonable estimate. Respond with ONLY JSON:
{
 "language": "English"|"Spanish"|"Bilingual"|"Other",
 "customer_type": "print_shop"|"apparel_brand"|"church"|"school"|"sports_team"|"event_organizer"|"business_owner"|"hobbyist"|"influencer"|"other",
 "industry": "short industry or '' if unknown",
 "business_potential": "A+"|"A"|"B"|"C"|"D",
 "est_monthly_dtf_ft": 0,
 "intent_score": 0,
 "purchase_probability": 0,
 "temperature": "hot"|"warm"|"cold",
 "reseller_likelihood": 0,
 "customer_segment": "one_time"|"repeat"|"reseller"|"wholesale"|"strategic",
 "sentiment_score": 0,
 "health_score": 0,
 "churn_risk": 0,
 "reorder_probability": 0,
 "lead_summary": "2-3 sentences a sales agent should read before replying",
 "customer_summary": "who they are + what they need",
 "customer_preferences": "products/styles/colors they like, '' if none",
 "ai_observations": "one key sales insight e.g. 'price sensitive but highly engaged'",
 "email": "the CUSTOMER's OWN email, ONLY if the customer themselves shared it, else ''",
 "phone": "the CUSTOMER's OWN phone/WhatsApp, ONLY if the customer themselves shared it, else ''",
 "company": "customer's company/organization name if mentioned, else ''",
 "city": "customer's city if mentioned, else ''",
 "primary_product": "the ONE main product, short: 'DTF Transfers'|'Hoodies'|'T-Shirts'|'Embroidery'|'Jerseys'|'Stickers'|'Other'|'' if unclear",
 "estimated_value": 0,
 "next_action": "the single best next step for the agent, short e.g. 'Send pricing estimate' / 'Confirm shirt color' / 'Follow up on quote'",
 "qualification": {
  "sizes_received": false,
  "artwork_received": false,
  "delivery_date_confirmed": false,
  "shipping_address_confirmed": false,
  "budget_confirmed": false
 }
}
All *_score / *_likelihood / *_probability / churn fields are 0-100 integers.
estimated_value = USD value of the deal/quote discussed (a number, 0 if none).
qualification.* = true ONLY if the chat clearly shows it (sizes given, artwork/design file sent, delivery date agreed, shipping address given, budget/price agreed); otherwise false.
For email/phone/company/city: extract ONLY what the customer actually wrote about THEMSELVES — never guess or invent.
CRITICAL: The shop is "Decoinks". NEVER extract Decoinks' own / the agent's own email, phone, or company as the customer's — e.g. anything ending in "@decoinks", a Decoinks number, or "Decoinks" itself. Those are the shop, not the customer. If only the shop's contact appears, return ''.`

const clamp = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)))
const str = (v, n = 4000) => (v == null ? '' : String(v)).slice(0, n)

if (process.argv[1].endsWith('build-intelligence.js')) {
  const convs = (await pool.query(`SELECT extra FROM app.conversations WHERE extra <> '{}'::jsonb`)).rows.map((r) => r.extra)
  const mrows = (await pool.query(`SELECT c.legacy_id cid, m.direction dir, m.body txt FROM app.messages m JOIN app.conversations c ON m.conversation_id = c.conversation_id WHERE m.body <> ''`)).rows
  const byConv = {}; for (const m of mrows) (byConv[m.cid] ||= []).push(m)
  // lifetime revenue per customer (legacy id)
  const rev = {}; for (const r of (await pool.query(`SELECT c.legacy_id clid, COALESCE(SUM(o.total_amount),0) tot FROM app.orders o JOIN app.customers c ON o.customer_id = c.customer_id GROUP BY 1`)).rows) rev[r.clid] = Number(r.tot) || 0

  // stale-aware: re-score when a conversation has MORE messages than when last scored (new chats too).
  // --force = sabhi dobara score karo (naye fields backfill karne ke liye — OpenAI cost lagegi).
  // --limit N = sirf pehle N (test/backfill control ke liye).
  const FORCE = process.argv.includes('--force')
  const li = process.argv.indexOf('--limit'); const LIMIT = li > -1 ? Number(process.argv[li + 1]) || 0 : 0
  let todo = convs.filter((c) => { const n = (byConv[c.id] || []).length; return n > 0 && (FORCE || (c.intelligence_msg_count || 0) < n) })
  if (LIMIT) todo = todo.slice(0, LIMIT)
  console.log(`conversations: ${convs.length}, to score: ${todo.length}${FORCE ? ' (--force)' : ''}${LIMIT ? ` (limited ${LIMIT})` : ''}`)

  const results = await pMap(todo, async (conv) => {
    const cm = (byConv[conv.id] || []).filter((m) => m.dir === 'in' || m.dir === 'out')
    const transcript = cm.map((m) => `${m.dir === 'in' ? 'Customer' : 'Agent'}: ${m.txt}`).join('\n').slice(0, 9000)
    const ltv = rev[`cust:${conv.id}`] || 0
    const out = await chatJSON(SYS, `Order history total: $${ltv}\n\nConversation:\n${transcript}`)
    return { conv, out, ltv, count: (byConv[conv.id] || []).length }
  }, 5)

  let saved = 0
  for (const r of results.filter(Boolean)) {
    const { conv, out, ltv, count } = r
    const cLid = `cust:${conv.id}`
    try {
      // contact fields — sirf tab likho jab AI ne chat se sach me nikala (khaali se overwrite mat karo)
      const email = str(out.email, 120).trim(), phone = str(out.phone, 40).trim()
      const company = str(out.company, 120).trim(), city = str(out.city, 80).trim()
      const q = out.qualification || {}
      const qual = ['sizes_received', 'artwork_received', 'delivery_date_confirmed', 'shipping_address_confirmed', 'budget_confirmed'].map((k) => q[k] === true)
      const complete = Math.round((qual.filter(Boolean).length / 5) * 100)
      // FB/IG id conversation se (AI se nahi) — legacy_id 'fb:<psid>' / 'ig:<igsid>'
      const isIg = String(conv.channel || '').toLowerCase() === 'instagram' || String(conv.id).startsWith('ig:')
      const psid = conv.meta_recipient_id || String(conv.id).split(':')[1] || null

      // 1) customer — email/phone/company/city sirf non-empty par (CASE se purana na mite)
      await pool.query(
        `UPDATE app.customers SET language=$2, industry=$3, customer_segment=$4, reseller_potential=$5, wholesale_potential=$6,
         lifetime_revenue=$7, customer_summary=$8, customer_preferences=$9,
         email=CASE WHEN $10<>'' THEN $10 ELSE email END, phone=CASE WHEN $11<>'' THEN $11 ELSE phone END,
         company=CASE WHEN $12<>'' THEN $12 ELSE company END, city=CASE WHEN $13<>'' THEN $13 ELSE city END,
         updated_at=now() WHERE legacy_id=$1`,
        [cLid, str(out.language, 20), str(out.industry, 60), str(out.customer_segment, 30), clamp(out.reseller_likelihood),
          out.customer_segment === 'wholesale' ? clamp(out.reseller_likelihood) : clamp(out.reseller_likelihood) > 60 ? 60 : clamp(out.reseller_likelihood),
          ltv, str(out.customer_summary), str(out.customer_preferences), email, phone, company, city])
      // 2) lead — intel + product + est value + FB/IG id + next_action (extra mein)
      await pool.query(
        `UPDATE app.leads SET intent_score=$2, purchase_probability=$3, temperature=$4, customer_type=$5, industry=$6,
         language=$7, business_potential=$8, est_monthly_dtf_ft=$9, reseller_likelihood=$10, lead_summary=$11, ai_observations=$12,
         source_platform=COALESCE(source_platform,$13),
         primary_product=CASE WHEN $14<>'' THEN $14 ELSE primary_product END,
         estimated_value=CASE WHEN $15>0 THEN $15 ELSE estimated_value END,
         facebook_id=CASE WHEN $16<>'' AND NOT $17 THEN $16 ELSE facebook_id END,
         instagram_id=CASE WHEN $16<>'' AND $17 THEN $16 ELSE instagram_id END,
         extra = COALESCE(extra,'{}'::jsonb) || jsonb_build_object('next_action', $18::text),
         updated_at=now()
         WHERE conversation_id = (SELECT conversation_id FROM app.conversations WHERE legacy_id=$1)`,
        [conv.id, clamp(out.intent_score), clamp(out.purchase_probability), str(out.temperature, 10), str(out.customer_type, 50),
          str(out.industry, 60), str(out.language, 20), str(out.business_potential, 4), Math.max(0, Math.round(Number(out.est_monthly_dtf_ft) || 0)),
          clamp(out.reseller_likelihood), str(out.lead_summary), str(out.ai_observations), conv.channel || null,
          str(out.primary_product, 40).trim(), Math.max(0, Math.round(Number(out.estimated_value) || 0)),
          String(psid || ''), isIg, str(out.next_action, 120)])
      // 2b) lead_qualification — 5 checkboxes + completeness
      await pool.query(
        `INSERT INTO app.lead_qualification (lead_id, sizes_received, artwork_received, delivery_date_confirmed, shipping_address_confirmed, budget_confirmed, info_completeness_score, updated_at)
         SELECT lead_id, $2,$3,$4,$5,$6,$7, now() FROM app.leads
          WHERE conversation_id = (SELECT conversation_id FROM app.conversations WHERE legacy_id=$1) LIMIT 1
         ON CONFLICT (lead_id) DO UPDATE SET sizes_received=EXCLUDED.sizes_received, artwork_received=EXCLUDED.artwork_received,
           delivery_date_confirmed=EXCLUDED.delivery_date_confirmed, shipping_address_confirmed=EXCLUDED.shipping_address_confirmed,
           budget_confirmed=EXCLUDED.budget_confirmed, info_completeness_score=EXCLUDED.info_completeness_score, updated_at=now()`,
        [conv.id, qual[0], qual[1], qual[2], qual[3], qual[4], complete])
      // 3) conversation (sentiment + summary + mark done)
      await pool.query(
        `UPDATE app.conversations SET sentiment_score=$2, conversation_summary=$3,
         extra = extra || jsonb_build_object('intelligence_at', now()::text, 'intelligence_msg_count', $4::int) WHERE legacy_id=$1`,
        [conv.id, clamp(out.sentiment_score), str(out.lead_summary), count])
      // 4) customer_health (upsert keyed by customer_id)
      await pool.query(
        `INSERT INTO app.customer_health (customer_id, health_score, clv, reorder_probability, churn_risk, segment, customer_analysis, updated_at)
         SELECT customer_id, $2, $3, $4, $5, $6, $7, now() FROM app.customers WHERE legacy_id=$1
         ON CONFLICT (customer_id) DO UPDATE SET health_score=EXCLUDED.health_score, clv=EXCLUDED.clv,
           reorder_probability=EXCLUDED.reorder_probability, churn_risk=EXCLUDED.churn_risk, segment=EXCLUDED.segment,
           customer_analysis=EXCLUDED.customer_analysis, updated_at=now()`,
        [cLid, clamp(out.health_score), ltv, clamp(out.reorder_probability), clamp(out.churn_risk), str(out.customer_segment, 30), str(out.ai_observations)])
      saved++
      if (saved % 25 === 0) console.log(`  scored ${saved}/${todo.length}`)
    } catch (e) { /* skip this one */ }
  }
  console.log(`\n✓ DONE — ${saved} leads/customers scored (intent, temperature, sentiment, segment, language, health…)`)
  await pool.end(); process.exit(0)
}
