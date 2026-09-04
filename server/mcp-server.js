#!/usr/bin/env node
// Decoinks CRM — MCP server (read-only).
// Lets ChatGPT / Claude / Cursor ask real questions about your CRM: which customers came in,
// how many ordered, what a customer wants, etc. — answered from your live PostgreSQL.
//
// TWO MODES (same tools):
//   stdio  → local apps (Claude Desktop, Cursor). No HTTPS needed.
//              node --env-file=.env mcp-server.js
//   http   → remote connector (ChatGPT). Needs a public HTTPS URL + token.
//              MCP_MODE=http MCP_TOKEN=<long-random> node --env-file=.env mcp-server.js
//
// SAFETY: every tool is READ-ONLY. safeSelect() rejects anything that is not a single SELECT,
// so a connected model can never insert/update/delete/drop.
import express from 'express'
import pg from 'pg'
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 20000, query_timeout: 60000, statement_timeout: 60000 })
const q = (sql, params) => pool.query(sql, params)

// ---------------- read-only guard (same rules as the CRM API) ----------------
function safeSelect(sql) {
  let s = String(sql || '').trim().replace(/;+\s*$/, '')
  if (!/^select\b/i.test(s)) return null
  if (/\b(insert|update|delete|drop|alter|truncate|grant|revoke|create|copy)\b/i.test(s) || s.includes(';')) return null
  if (!/\blimit\b/i.test(s)) s += ' LIMIT 200'
  return s
}
const text = (t) => ({ content: [{ type: 'text', text: typeof t === 'string' ? t : JSON.stringify(t, null, 1) }] })
const err = (m) => ({ content: [{ type: 'text', text: `Error: ${m}` }], isError: true })

// ---------------- live schema (introspected, never hard-coded) ----------------
let SCHEMA = null
async function schemaText() {
  if (SCHEMA) return SCHEMA
  const r = await q(`SELECT table_name, column_name FROM information_schema.columns
                     WHERE table_schema='app' ORDER BY table_name, ordinal_position`)
  const byTable = {}
  for (const row of r.rows) (byTable[row.table_name] ||= []).push(row.column_name)
  SCHEMA = `PostgreSQL schema "app" — READ-ONLY. Every table also has an "extra" JSONB column with the raw record.
${Object.entries(byTable).map(([t, c]) => `- app.${t}(${c.join(', ')})`).join('\n')}

Key joins:
  app.messages.conversation_id = app.conversations.conversation_id
  app.conversations.customer_id = app.customers.customer_id
  app.leads/orders/payments.customer_id = app.customers.customer_id

Notes:
  app.messages holds ALL chat messages. direction: 'in' = customer, 'out' = agent, 'note' = internal.
  body = message text. message_type: 'text' | 'image'.
  A paying customer = app.customers.total_spent > 0.
  Use ILIKE for text search. Always add a LIMIT.`
  return SCHEMA
}

// ---------------- server + tools ----------------
const server = new McpServer({ name: 'decoinks-crm', version: '1.0.0' })

server.tool('crm_overview', 'Headline CRM numbers: total customers, how many ordered, leads, messages, revenue. Use this first for "how many / overview" questions.',
  {}, async () => {
    const r = await q(`SELECT
        (SELECT count(*) FROM app.customers)                          AS customers,
        (SELECT count(*) FROM app.customers WHERE total_spent > 0)    AS paying_customers,
        (SELECT count(*) FROM app.customers WHERE coalesce(total_spent,0) = 0) AS never_ordered,
        (SELECT coalesce(sum(total_spent),0) FROM app.customers)      AS total_revenue,
        (SELECT count(*) FROM app.conversations)                      AS conversations,
        (SELECT count(*) FROM app.messages)                           AS messages,
        (SELECT count(*) FROM app.messages WHERE direction='in')      AS customer_messages,
        (SELECT count(*) FROM app.messages WHERE direction='out')     AS agent_messages,
        (SELECT count(*) FROM app.leads)                              AS leads,
        (SELECT count(*) FROM app.orders)                             AS orders`)
    const o = r.rows[0]
    o.conversion_rate = `${((o.paying_customers / Math.max(o.customers, 1)) * 100).toFixed(1)}%`
    return text(o)
  })

server.tool('get_schema', 'The live database schema (all tables + columns). Read this before writing SQL with run_sql.',
  {}, async () => text(await schemaText()))

server.tool('run_sql', 'Run a READ-ONLY SELECT against the CRM database and get exact numbers. Call get_schema first. Anything that is not a single SELECT is rejected.',
  { sql: z.string().describe('A single SELECT statement. No semicolons, no writes.') },
  async ({ sql }) => {
    const safe = safeSelect(sql)
    if (!safe) return err('Only a single read-only SELECT is allowed (no writes, no semicolons).')
    try {
      const r = await q(safe)
      return text({ rowCount: r.rowCount, sql: safe, rows: r.rows })
    } catch (e) { return err(`${e.message}\nSQL was: ${safe}`) }
  })

server.tool('search_customers', 'Find customers by name (partial match). Returns their order/spend/message stats.',
  { query: z.string().describe('Full or partial customer name'), limit: z.number().optional().default(20) },
  async ({ query, limit }) => {
    const r = await q(`SELECT c.full_name, c.industry, c.tier, c.status, c.total_orders,
              c.total_spent, c.payment_status, c.customer_segment,
              (SELECT count(*) FROM app.messages m JOIN app.conversations co ON co.conversation_id=m.conversation_id
                WHERE co.customer_id=c.customer_id) AS messages
       FROM app.customers c WHERE c.full_name ILIKE $1
       ORDER BY c.total_spent DESC NULLS LAST LIMIT $2`, [`%${query}%`, Math.min(limit || 20, 100)])
    return r.rowCount ? text(r.rows) : text(`No customer matching "${query}".`)
  })

server.tool('get_customer', 'Everything known about ONE customer: stats plus the AI digest (summary, products, quantity, order total, payment status, stage, key notes, next step). Use this instead of dumping the whole chat.',
  { name: z.string().describe('Customer name (partial ok)') },
  async ({ name }) => {
    const c = (await q(`SELECT * FROM app.customers WHERE full_name ILIKE $1 ORDER BY total_spent DESC NULLS LAST LIMIT 1`, [`%${name}%`])).rows[0]
    if (!c) return text(`No customer matching "${name}".`)
    const prof = (await q(`SELECT extra->'ai_profile' p, extra->'ai_intel' i FROM app.conversations
                           WHERE customer_id=$1 AND (extra ? 'ai_profile' OR extra ? 'ai_intel') LIMIT 1`, [c.customer_id])).rows[0]
    const m = (await q(`SELECT count(*) n, count(*) FILTER (WHERE direction='in') cust,
              min(created_at)::date first, max(created_at)::date last
       FROM app.messages WHERE conversation_id IN (SELECT conversation_id FROM app.conversations WHERE customer_id=$1)`, [c.customer_id])).rows[0]
    return text({
      name: c.full_name, industry: c.industry, tier: c.tier, status: c.status,
      segment: c.customer_segment, platform: c.platform_primary,
      total_orders: c.total_orders, total_spent: c.total_spent, payment_status: c.payment_status,
      products: c.products, customer_summary: c.customer_summary, preferences: c.customer_preferences,
      wholesale_potential: c.wholesale_potential, reseller_potential: c.reseller_potential,
      messages: m.n, customer_messages: m.cust, first_contact: m.first, last_contact: m.last,
      ai_profile: prof?.p || null, ai_intel: prof?.i || null,
    })
  })

server.tool('get_chat', 'The FULL chat transcript with a customer (exact words), oldest→newest. By default returns the whole conversation.',
  { name: z.string().describe('Customer name (partial ok)'), limit: z.number().optional().default(500).describe('Max messages to return (default 500 = usually the whole chat)') },
  async ({ name, limit }) => {
    const c = (await q(`SELECT customer_id, full_name FROM app.customers WHERE full_name ILIKE $1 ORDER BY total_spent DESC NULLS LAST LIMIT 1`, [`%${name}%`])).rows[0]
    if (!c) return text(`No customer matching "${name}".`)
    // order by real send time (sent_at), falling back to insert time for old/backfilled rows,
    // and default to the WHOLE conversation so summaries never miss the latest updates.
    const r = await q(`SELECT direction, message_type, body, to_char(COALESCE(sent_at, created_at),'YYYY-MM-DD HH24:MI') ts
       FROM app.messages WHERE conversation_id IN (SELECT conversation_id FROM app.conversations WHERE customer_id=$1)
         AND direction IN ('in','out') AND (body <> '' OR message_type='image')
       ORDER BY COALESCE(sent_at, created_at) DESC LIMIT $2`, [c.customer_id, Math.min(limit || 500, 3000)])
    const lines = r.rows.reverse().map((m) => m.message_type === 'image'
      ? `[${m.ts}] ${m.direction === 'in' ? 'Customer' : 'Agent'}: (shared an image)`
      : `[${m.ts}] ${m.direction === 'in' ? 'Customer' : 'Agent'}: ${m.body}`)
    return text(`Chat with ${c.full_name} — last ${lines.length} messages:\n\n${lines.join('\n')}`)
  })

server.tool('list_leads', 'List leads, optionally filtered by stage. Good for "which customers came in / what is in the pipeline".',
  { stage: z.string().optional().describe('e.g. inquiry, qualification, quoted, payment_pending'), limit: z.number().optional().default(30) },
  async ({ stage, limit }) => {
    const r = stage
      ? await q(`SELECT l.*, c.full_name FROM app.leads l LEFT JOIN app.customers c ON c.customer_id=l.customer_id
                 WHERE l.stage ILIKE $1 ORDER BY l.created_at DESC LIMIT $2`, [`%${stage}%`, Math.min(limit || 30, 100)])
      : await q(`SELECT l.*, c.full_name FROM app.leads l LEFT JOIN app.customers c ON c.customer_id=l.customer_id
                 ORDER BY l.created_at DESC LIMIT $1`, [Math.min(limit || 30, 100)])
    return text(r.rows)
  })

// ---- ChatGPT Deep Research compatibility (needs tools literally named search + fetch) ----
server.tool('search', 'Search the CRM for customers/conversations matching a query. Returns id + title + snippet.',
  { query: z.string() },
  async ({ query }) => {
    const r = await q(`SELECT c.customer_id id, c.full_name title,
              coalesce(c.customer_summary, c.products, '') snippet
       FROM app.customers c WHERE c.full_name ILIKE $1 OR c.customer_summary ILIKE $1 OR c.products ILIKE $1
       ORDER BY c.total_spent DESC NULLS LAST LIMIT 20`, [`%${query}%`])
    return text({ results: r.rows })
  })

server.tool('fetch', 'Fetch the full record for an id returned by search.',
  { id: z.string() },
  async ({ id }) => {
    const c = (await q(`SELECT * FROM app.customers WHERE customer_id::text=$1`, [id])).rows[0]
    if (!c) return text(`No record ${id}`)
    return text({ id, title: c.full_name, text: JSON.stringify(c, null, 1), url: null })
  })

// ---------------- transports ----------------
const MODE = (process.env.MCP_MODE || 'stdio').toLowerCase()

if (MODE === 'http') {
  const TOKEN = process.env.MCP_TOKEN
  if (!TOKEN) { console.error('MCP_TOKEN is required in http mode (a long random string).'); process.exit(1) }
  const BASE = process.env.MCP_BASE_PATH || ''   // public path prefix (nginx ke peeche, e.g. /crm-mcp)
  const app = express()
  app.use(express.json({ limit: '2mb' }))
  // Token header (Authorization: Bearer ...) YA URL query (?key=... / ?token=...) — dono chalte hain,
  // taaki ChatGPT/Claude ke jis bhi auth field ho (Custom header ya sirf URL) us se juda ja sake.
  const authOk = (req) => {
    const h = req.headers.authorization || ''
    return h === `Bearer ${TOKEN}` || req.query.key === TOKEN || req.query.token === TOKEN
  }
  app.get('/health', (_q, res) => res.json({ ok: true, server: 'decoinks-crm-mcp' }))

  // ---- Streamable HTTP transport (naya MCP standard): POST /mcp ----
  app.post('/mcp', async (req, res) => {
    if (!authOk(req)) return res.status(401).json({ error: 'unauthorized' })
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    res.on('close', () => transport.close())
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
  })

  // ---- Legacy SSE transport (kai clients isko maangte hain): GET /sse + POST /messages ----
  const sseTransports = {}
  app.get('/sse', async (req, res) => {
    if (!authOk(req)) return res.status(401).json({ error: 'unauthorized' })
    const transport = new SSEServerTransport(`${BASE}/messages`, res)
    sseTransports[transport.sessionId] = transport
    res.on('close', () => { delete sseTransports[transport.sessionId] })
    await server.connect(transport)
  })
  app.post('/messages', async (req, res) => {
    const t = sseTransports[req.query.sessionId]
    if (!t) return res.status(400).json({ error: 'no active SSE session' })
    await t.handlePostMessage(req, res, req.body)
  })

  const port = Number(process.env.MCP_PORT || 8790)
  app.listen(port, () => console.error(`Decoinks CRM MCP (http) on :${port} — /mcp (streamable) + /sse (legacy), token via header ya ?key=`))
} else {
  await server.connect(new StdioServerTransport())
  console.error('Decoinks CRM MCP (stdio) ready')
}
