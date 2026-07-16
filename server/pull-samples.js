// Pull real customer/conversation data from PostgreSQL to seed the sample-data workbook.
import pg from 'pg'
import fs from 'fs'
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 30000, query_timeout: 120000, statement_timeout: 120000 })
async function q(sql, tries = 6) {
  for (let i = 0; i < tries; i++) { try { return await pool.query(sql) } catch (e) { console.log(`retry ${i + 1}: ${e.message}`); await new Promise(r => setTimeout(r, 2500)) } }
  throw new Error('query failed')
}
const r = await q(`
  SELECT
    coalesce(nullif(co.extra->>'name',''), cu.full_name)          AS name,
    cu.company, cu.email, cu.phone, cu.platform_primary           AS channel,
    cu.total_spent, cu.total_orders, cu.payment_status, cu.customer_segment, cu.language,
    to_char(cu.created_at,'YYYY-MM-DD') AS created,
    co.extra->'ai_profile'->>'products'        AS products,
    co.extra->'ai_profile'->>'quantity'        AS quantity,
    co.extra->'ai_profile'->>'orderTotal'      AS order_total,
    co.extra->'ai_profile'->>'paymentStatus'   AS pay_status,
    co.extra->'ai_profile'->>'leadStage'       AS lead_stage,
    co.extra->'ai_profile'->>'deadline'        AS deadline,
    co.extra->'ai_profile'->>'shippingAddress' AS shipping_address,
    co.extra->'ai_profile'->>'nextStep'        AS next_step,
    co.extra->'ai_profile'->'questions'        AS questions
  FROM app.conversations co
  JOIN app.customers cu ON cu.customer_id = co.customer_id
  WHERE co.extra ? 'ai_profile' AND coalesce(cu.full_name,'') <> ''
  ORDER BY cu.total_spent DESC NULLS LAST
  LIMIT 14`)
fs.writeFileSync('sample-source.json', JSON.stringify(r.rows, null, 2))
console.log('saved sample-source.json —', r.rows.length, 'rows')
await pool.end(); process.exit(0)
