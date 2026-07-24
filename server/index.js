import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { getAll, findById, insert, update, remove, getSetting, setSetting, deleteSetting, flush, query as dbQuery } from './db.js'
import pdfParse from 'pdf-parse'
import mammoth from 'mammoth'
import { spawn } from 'node:child_process'
import { ManyChatClient } from './manychat.js'
import { MetaClient } from './meta.js'
import { QdrantClient, qdrantConfigured } from './qdrant.js'
import { aiConfigured, anthropicConfigured, aiModels, chatModels, providerOf, embed, chatJSON, chatText, chatMessages } from './ai.js'
import { profileFromTranscript } from './build-profiles.js'
import { captureSourceArtworks, storeArtworkBytes, listArtworks, getArtworkFile, getArtworkFileByName, startUploadWorker, startShareWorker } from './artwork-capture.js'
import { cwEnabled, cwShadowMode, cwSendEnabled, cwStoreShadow, cwSendMessage, cwSendToPsid, cwSendFileToPsid, cwConvForPsid, cwShadowStats, cwReconcile, startChatwootReconcile } from './chatwoot.js'
import { randomUUID, createHash } from 'node:crypto'

const PORT = process.env.PORT || 3001
const JWT_SECRET = process.env.JWT_SECRET || 'technocas-dev-secret-change-in-prod'

const app = express()
app.use(cors())
app.use(express.json({ limit: '25mb' }))   // large enough for base64 file uploads in the AI assistant

function authRequired(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Missing token' })
  try { req.user = jwt.verify(token, JWT_SECRET); next() }
  catch { return res.status(401).json({ error: 'Invalid token' }) }
}

// Same as authRequired, but also accepts the token as ?t= — a browser <img> tag
// cannot send an Authorization header. Only used for read-only image endpoints.
function authImg(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.query.t || null)
  if (!token) return res.status(401).json({ error: 'Missing token' })
  try { req.user = jwt.verify(String(token), JWT_SECRET); next() }
  catch { return res.status(401).json({ error: 'Invalid token' }) }
}

// Display name of the logged-in agent (for stamping who sent a reply).
function agentName(req) {
  const u = getAll('users').find(x => x.id === req.user?.id)
  return u?.name || req.user?.email || 'Agent'
}

// ============================================================
// Real-time push (Server-Sent Events)
// The inbox subscribes to /api/stream and gets messages the instant
// they arrive (incoming webhook) or are sent — no polling delay.
// ============================================================
const sseClients = new Set()

function broadcast(event) {
  const payload = `data: ${JSON.stringify(event)}\n\n`
  for (const res of sseClients) {
    try { res.write(payload) } catch { /* client gone; cleaned up on close */ }
  }
}

app.get('/api/stream', (req, res) => {
  // EventSource can't send Authorization headers, so accept the JWT as a query param.
  const token = req.query.token
  try { jwt.verify(token, JWT_SECRET) }
  catch { return res.status(401).json({ error: 'Invalid token' }) }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
  })
  res.write('retry: 3000\n\n')
  res.write(`data: ${JSON.stringify({ type: 'hello', time: Date.now() })}\n\n`)
  sseClients.add(res)

  // Heartbeat keeps proxies/tunnels from closing an idle connection.
  const ping = setInterval(() => { try { res.write(': ping\n\n') } catch {} }, 25000)
  req.on('close', () => { clearInterval(ping); sseClients.delete(res) })
})

// ============================================================
// AUTH
// ============================================================
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' })
  const user = getAll('users').find(u => u.email === String(email).toLowerCase())
  if (!user) return res.status(401).json({ error: 'Invalid email or password' })
  if (!bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Invalid email or password' })
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' })
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } })
})

// Public sign-up — create a new AGENT account (role is forced to 'agent' for safety;
// managers/admins are created/promoted from the authenticated Team page).
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body || {}
  if (!name?.trim() || !email?.trim() || !password) return res.status(400).json({ error: 'Name, email and password are required' })
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' })
  const em = email.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return res.status(400).json({ error: 'Enter a valid email' })
  if (getAll('users').some((u) => u.email === em)) return res.status(400).json({ error: 'An account with this email already exists' })
  const maxId = Math.max(0, ...getAll('users').map((u) => Number(u.id) || 0))
  const user = insert('users', { id: maxId + 1, name: name.trim(), email: em, role: 'agent', password_hash: bcrypt.hashSync(password, 10) })
  await flush()
  // auto-login so the new agent can start immediately
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' })
  res.status(201).json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } })
})

app.get('/api/auth/me', authRequired, (req, res) => {
  const user = getAll('users').find(u => u.id === req.user.id)
  if (!user) return res.status(404).json({ error: 'User not found' })
  res.json({ id: user.id, email: user.email, name: user.name, role: user.role })
})

// Update own profile (name and/or role)
app.patch('/api/auth/me', authRequired, async (req, res) => {
  const { name, role } = req.body || {}
  const patch = {}
  if (name && name.trim()) patch.name = name.trim()
  if (role && ['admin', 'manager', 'agent'].includes(role)) patch.role = role
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to update' })
  const updated = update('users', req.user.id, patch)
  if (!updated) return res.status(404).json({ error: 'User not found' })
  await flush()
  res.json({ id: updated.id, email: updated.email, name: updated.name, role: updated.role })
})

// Change own password
app.post('/api/auth/password', authRequired, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {}
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password required' })
  if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' })
  const user = getAll('users').find(u => u.id === req.user.id)
  if (!user) return res.status(404).json({ error: 'User not found' })
  if (!bcrypt.compareSync(currentPassword, user.password_hash)) return res.status(400).json({ error: 'Current password is incorrect' })
  update('users', req.user.id, { password_hash: bcrypt.hashSync(newPassword, 10) })
  await flush()
  res.json({ ok: true })
})

// ============================================================
// Team / Users management
// ============================================================
const publicUser = (u) => u && ({ id: u.id, name: u.name, email: u.email, role: u.role, created_at: u.created_at })

app.get('/api/users', authRequired, (req, res) => {
  res.json(getAll('users').map(publicUser))
})

app.post('/api/users', authRequired, async (req, res) => {
  const { name, email, password, role = 'agent' } = req.body || {}
  if (!name?.trim() || !email?.trim() || !password) return res.status(400).json({ error: 'name, email and password are required' })
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' })
  const em = email.trim().toLowerCase()
  if (getAll('users').some((u) => u.email === em)) return res.status(400).json({ error: 'A user with this email already exists' })
  const maxId = Math.max(0, ...getAll('users').map((u) => Number(u.id) || 0))
  const user = insert('users', { id: maxId + 1, name: name.trim(), email: em, role, password_hash: bcrypt.hashSync(password, 10) })
  await flush()
  res.status(201).json(publicUser(user))
})

app.patch('/api/users/:id', authRequired, async (req, res) => {
  const { name, role, password } = req.body || {}
  const patch = {}
  if (name?.trim()) patch.name = name.trim()
  if (role && ['admin', 'manager', 'agent'].includes(role)) patch.role = role
  if (password) { if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' }); patch.password_hash = bcrypt.hashSync(password, 10) }
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to update' })
  const u = update('users', req.params.id, patch)
  if (!u) return res.status(404).json({ error: 'User not found' })
  await flush()
  res.json(publicUser(u))
})

app.delete('/api/users/:id', authRequired, async (req, res) => {
  if (String(req.params.id) === String(req.user.id)) return res.status(400).json({ error: "You can't remove your own account" })
  const ok = remove('users', req.params.id)
  if (!ok) return res.status(404).json({ error: 'User not found' })
  await flush()
  res.json({ ok: true })
})

// ============================================================
// Generic CRUD
// ============================================================
function crud(resource, table, { searchFields = [] } = {}) {
  app.get(`/api/${resource}`, authRequired, (req, res) => {
    const { search, ...filters } = req.query
    let rows = getAll(table)
    Object.entries(filters).forEach(([k, v]) => {
      rows = rows.filter(r => String(r[k]) === String(v))
    })
    if (search && searchFields.length) {
      const q = String(search).toLowerCase()
      rows = rows.filter(r => searchFields.some(f => String(r[f] || '').toLowerCase().includes(q)))
    }
    res.json(rows)
  })

  app.get(`/api/${resource}/:id`, authRequired, (req, res) => {
    const row = findById(table, req.params.id)
    if (!row) return res.status(404).json({ error: `${resource} not found` })
    res.json(row)
  })

  app.post(`/api/${resource}`, authRequired, (req, res) => {
    try {
      const row = insert(table, req.body || {})
      res.status(201).json(row)
    } catch (e) { res.status(400).json({ error: e.message }) }
  })

  app.patch(`/api/${resource}/:id`, authRequired, (req, res) => {
    const row = update(table, req.params.id, req.body || {})
    if (!row) return res.status(404).json({ error: `${resource} not found` })
    res.json(row)
  })

  app.delete(`/api/${resource}/:id`, authRequired, (req, res) => {
    const ok = remove(table, req.params.id)
    if (!ok) return res.status(404).json({ error: `${resource} not found` })
    res.json({ ok: true })
  })
}

crud('customers',     'customers',     { searchFields: ['name','company','loc','owner','email'] })
crud('leads',         'leads',         { searchFields: ['name','company','source','agent'] })
crud('notes',         'notes',         { searchFields: ['title','body','category','author'] })
crud('orders',        'orders',        { searchFields: ['order_no','products'] })
crud('payments',      'payments',      { searchFields: ['invoice_no','order_no','description'] })
crud('receipts',      'receipts',      { searchFields: ['receipt_no','order_no','customer','note2'] })
crud('artworks',      'artworks',      { searchFields: ['name','type','product'] })
crud('conversations', 'conversations', { searchFields: ['name','company','list_preview'] })

// ============================================================
// Customer FLAGS — user-defined labels (koi bhi naam + rang), customer par lagte hain.
// Definitions settings mein (koi nayi table nahi — DB role app schema mein CREATE nahi kar sakta).
// Kis customer par kaunse flag lage — wo customer ke apne doc mein `flags: [id,...]` array hai
// (PATCH /api/customers/:id se save hota hai, isliye alag assign endpoint ki zaroorat nahi).
// ============================================================
const slug = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
const getFlags = () => getSetting('customer_flags') || []

app.get('/api/flags', authRequired, (req, res) => res.json(getFlags()))

app.post('/api/flags', authRequired, (req, res) => {
  const name = String(req.body?.name || '').trim()
  const color = String(req.body?.color || 'slate').trim()
  if (!name) return res.status(400).json({ error: 'name required' })
  const flags = getFlags()
  let id = slug(name) || `flag-${flags.length + 1}`
  if (flags.some((f) => f.id === id)) id = `${id}-${Date.now().toString(36).slice(-4)}`  // naam takraye to unique
  const flag = { id, name, color, created_at: new Date().toISOString() }
  setSetting('customer_flags', [...flags, flag])
  res.status(201).json(flag)
})

app.patch('/api/flags/:id', authRequired, (req, res) => {
  const flags = getFlags()
  const i = flags.findIndex((f) => f.id === req.params.id)
  if (i < 0) return res.status(404).json({ error: 'flag not found' })
  if (req.body?.name != null) flags[i].name = String(req.body.name).trim() || flags[i].name
  if (req.body?.color != null) flags[i].color = String(req.body.color).trim() || flags[i].color
  setSetting('customer_flags', flags)
  res.json(flags[i])
})

app.delete('/api/flags/:id', authRequired, (req, res) => {
  const flags = getFlags()
  if (!flags.some((f) => f.id === req.params.id)) return res.status(404).json({ error: 'flag not found' })
  setSetting('customer_flags', flags.filter((f) => f.id !== req.params.id))
  // har customer se ye flag hata do taaki koi orphan id na bache
  let cleaned = 0
  for (const c of getAll('customers')) {
    if (Array.isArray(c.flags) && c.flags.includes(req.params.id)) {
      update('customers', c.id, { flags: c.flags.filter((x) => x !== req.params.id) }); cleaned++
    }
  }
  res.json({ ok: true, removed_from_customers: cleaned })
})

// ============================================================
// Messages nested under a conversation
// ============================================================
app.get('/api/conversations/:id/messages', authRequired, (req, res) => {
  const msgs = getAll('messages').filter(m => m.conversation_id === req.params.id)
  res.json(msgs)
})

app.post('/api/conversations/:id/messages', authRequired, (req, res) => {
  const { dir, text, time, category } = req.body || {}
  if (!dir || !text) return res.status(400).json({ error: 'dir and text required' })
  const msg = saveMessage({
    conversation_id: req.params.id,
    dir,
    text,
    ...(category ? { category } : {}),   // note category (internal/call/meeting/followup)
    time: time || new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    agent: agentName(req),             // who sent this reply / note
  })
  broadcast({ type: 'message', conversationId: req.params.id, message: msg })
  res.status(201).json(msg)
})

// ============================================================
// Dashboard stats
// ============================================================
app.get('/api/stats/dashboard', authRequired, (req, res) => {
  const customers = getAll('customers')
  const leads = getAll('leads')
  const receipts = getAll('receipts')
  res.json({
    customers: customers.length,
    leads: leads.length,
    totalSpend: customers.reduce((s, c) => s + (c.spend || 0), 0),
    receipts: receipts.length,
    monthlyRevenue: receipts.reduce((s, r) => s + (r.amount || 0), 0),
    hotLeads: leads.filter(l => l.badge === 'Hot').length,
  })
})

// ============================================================
// ManyChat integration
// ============================================================
function manychat() {
  const key = getSetting('manychat_api_key')
  if (!key) { const e = new Error('ManyChat not connected'); e.status = 400; throw e }
  return new ManyChatClient(key)
}

// Connection status (does not return the key itself)
app.get('/api/manychat/status', authRequired, (req, res) => {
  const key = getSetting('manychat_api_key')
  const page = getSetting('manychat_page')
  res.json({
    connected: !!key,
    keyMasked: key ? `••••${key.slice(-4)}` : null,
    page: page || null,
    connectedAt: getSetting('manychat_connected_at') || null,
  })
})

// Save key + verify it by calling getPageInfo
app.post('/api/manychat/connect', authRequired, async (req, res) => {
  const { apiKey } = req.body || {}
  if (!apiKey) return res.status(400).json({ error: 'apiKey required' })
  try {
    const client = new ManyChatClient(apiKey)
    const info = await client.getPageInfo()
    if (info?.status !== 'success') return res.status(400).json({ error: 'ManyChat rejected the key', body: info })
    setSetting('manychat_api_key', apiKey)
    setSetting('manychat_page', info.data || {})
    setSetting('manychat_connected_at', new Date().toISOString())
    res.json({ ok: true, page: info.data })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, body: e.body })
  }
})

app.post('/api/manychat/disconnect', authRequired, (req, res) => {
  deleteSetting('manychat_api_key')
  deleteSetting('manychat_page')
  deleteSetting('manychat_connected_at')
  res.json({ ok: true })
})

// Get page info (also useful for refreshing the cached page object)
app.get('/api/manychat/page', authRequired, async (req, res) => {
  try { res.json(await manychat().getPageInfo()) }
  catch (e) { res.status(e.status || 500).json({ error: e.message, body: e.body }) }
})

// Look up a subscriber by id
app.get('/api/manychat/subscribers/:id', authRequired, async (req, res) => {
  try { res.json(await manychat().getSubscriberById(req.params.id)) }
  catch (e) { res.status(e.status || 500).json({ error: e.message, body: e.body }) }
})

// Send a text message to a ManyChat subscriber
app.post('/api/manychat/send', authRequired, async (req, res) => {
  const { subscriberId, text, messageTag } = req.body || {}
  if (!subscriberId || !text) return res.status(400).json({ error: 'subscriberId and text required' })
  try {
    const result = await manychat().sendText(subscriberId, text, { messageTag })
    // Save a copy locally as an outgoing message
    saveMessage({
      conversation_id: `mc:${subscriberId}`,
      dir: 'out',
      text,
      time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      via: 'manychat',
    })
    res.json(result)
  } catch (e) {
    // Surface the full ManyChat error so the agent knows what to fix
    res.status(e.status || 500).json({ error: e.message, body: e.body, hint:
      'If this says the 24h window is closed, the customer needs to message you first (or send a WhatsApp template via ManyChat). If it says subscriber not found, check the ID.' })
  }
})

// Webhook: ManyChat POSTs here when a subscriber sends a message.
// Configure in ManyChat → Automation → External Triggers → Webhooks.
// Public for now — optionally protect with ?secret=... query param.
app.post('/api/webhooks/manychat', async (req, res) => {
  const expectedSecret = getSetting('manychat_webhook_secret')
  if (expectedSecret && req.query.secret !== expectedSecret) {
    return res.status(403).json({ error: 'Bad webhook secret' })
  }
  const event = req.body || {}
  insert('webhook_events', { source: 'manychat', received_at: new Date().toISOString(), event })

  // ManyChat payloads vary by trigger. Try the common shapes.
  const sub  = event.subscriber || event.user || {}
  const subId = sub.id || sub.subscriber_id || event.subscriber_id
  const text  = event.last_input_text || event.text || event.message?.text || ''
  if (!subId) return res.json({ ok: true, ignored: 'no subscriber id' })

  const convId = `mc:${subId}`
  let conv = findById('conversations', convId)
  if (!conv) {
    // Try to fetch full subscriber info from ManyChat to populate the conversation
    let info = sub
    try {
      const key = getSetting('manychat_api_key')
      if (key) {
        const data = await new ManyChatClient(key).getSubscriberById(subId)
        if (data?.data) info = { ...info, ...data.data }
      }
    } catch { /* keep sub from webhook */ }

    const fullName = info.name || `${info.first_name || ''} ${info.last_name || ''}`.trim() || 'Unknown subscriber'
    const initials = fullName.split(/\s+/).map(w => w[0]).join('').slice(0,2).toUpperCase() || '?'
    const channel = info.channel || event.channel || 'WhatsApp'
    conv = insert('conversations', {
      id: convId,
      customer_id: null,
      name: fullName,
      initials,
      avatar_bg: 'bg-emerald-100 text-emerald-700',
      channel,
      channel_bg: channel === 'WhatsApp' ? 'bg-emerald-500'
                : channel === 'Facebook'  ? 'bg-blue-600'
                : channel === 'Instagram' ? 'bg-gradient-to-br from-amber-400 via-rose-500 to-fuchsia-600'
                                          : 'bg-slate-700',
      phone: info.phone || info.whatsapp_phone || info.subscriber_id || '',
      company: info.profile_pic ? '' : '',
      status: 'New Lead',
      status_bg: 'bg-sky-50 text-sky-700 hover:bg-sky-100',
      status_icon: '✨',
      list_preview: text,
      list_time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      unread: 1,
      source: 'manychat',
    })
  }

  if (text) {
    saveMessage({
      conversation_id: convId,
      dir: 'in',
      text,
      time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      via: 'manychat',
    })
    update('conversations', convId, {
      list_preview: text,
      list_time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      unread: (conv.unread || 0) + 1,
    })
  }
  res.json({ ok: true, conversation_id: convId })
})

// Manual: pull a subscriber from ManyChat into the inbox by ID
app.post('/api/manychat/lookup', authRequired, async (req, res) => {
  const { subscriberId } = req.body || {}
  if (!subscriberId) return res.status(400).json({ error: 'subscriberId required' })
  try {
    const result = await manychat().getSubscriberById(subscriberId)
    const info = result?.data
    if (!info) return res.status(404).json({ error: 'Subscriber not found' })
    const convId = `mc:${subscriberId}`
    let conv = findById('conversations', convId)
    const fullName = info.name || `${info.first_name || ''} ${info.last_name || ''}`.trim() || 'Subscriber'
    const initials = fullName.split(/\s+/).map(w => w[0]).join('').slice(0,2).toUpperCase()
    const channel = info.channel || 'WhatsApp'
    if (!conv) {
      conv = insert('conversations', {
        id: convId, customer_id: null, name: fullName, initials,
        avatar_bg: 'bg-emerald-100 text-emerald-700', channel,
        channel_bg: channel === 'WhatsApp' ? 'bg-emerald-500' : channel === 'Facebook' ? 'bg-blue-600' : channel === 'Instagram' ? 'bg-gradient-to-br from-amber-400 via-rose-500 to-fuchsia-600' : 'bg-slate-700',
        phone: info.phone || info.whatsapp_phone || '', company: '',
        status: 'New Lead', status_bg: 'bg-sky-50 text-sky-700 hover:bg-sky-100', status_icon: '✨',
        list_preview: '(no messages yet)', list_time: 'now', unread: 0, source: 'manychat',
      })
    }
    res.json(conv)
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, body: e.body })
  }
})

// Inspect recent webhook events (useful while wiring it up)
app.get('/api/webhooks/manychat/events', authRequired, (req, res) => {
  const events = getAll('webhook_events').filter(e => e.source === 'manychat').slice(-20).reverse()
  res.json(events)
})

// ============================================================
// Meta integration (Facebook Messenger + Instagram DM) — direct Graph API
// ============================================================
// Settings can come back double-encoded from JSONB ('"654786991062241"' instead of
// '654786991062241'). Strip the stray quotes/whitespace before ANY comparison or API call —
// a quoted page id silently broke in/out detection, marking our own replies as customer messages.
const cleanSetting = (v) => String(v == null ? '' : v).replace(/^"+|"+$/g, '').replace(/\s+/g, '').trim()

// Always coerce to a clean string token (defends against JSONB quotes / object / whitespace)
function metaToken() {
  let t = getSetting('meta_page_token')
  if (t && typeof t === 'object') t = t.access_token || t.token || ''
  return cleanSetting(t)
}
const metaPageId = () => cleanSetting(getSetting('meta_page_id'))
const metaIgId = () => cleanSetting((getSetting('meta_ig') || {}).id)
function meta() {
  const token = metaToken()
  if (!token) { const e = new Error('Meta not connected'); e.status = 400; throw e }
  return new MetaClient(token)
}

const nowTime = () => new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

// From a (long-lived) USER token, find the managed Page and store its
// permanent Page Access Token + page/Instagram info. Returns the page.
async function resolveAndStorePageToken(userToken, preferredPageId) {
  const accounts = await new MetaClient(userToken).getAccounts()
  const pages = accounts?.data || []
  if (!pages.length) { const e = new Error('This token does not manage any Page. Use a User token with pages_show_list.'); e.status = 400; throw e }
  const page = pages.find(p => String(p.id) === String(preferredPageId)) || pages[0]
  setSetting('meta_page_token', page.access_token)
  setSetting('meta_page_id', page.id)
  setSetting('meta_page_name', page.name || '')
  if (page.instagram_business_account) {
    const ig = page.instagram_business_account
    setSetting('meta_ig', { id: ig.id, username: ig.username, name: ig.name })
  }
  return page
}

// Re-derive the Page token from the stored long-lived user token + app creds.
// Called automatically when a Graph request fails with an expired-token error.
let metaRefreshing = false
async function tryRefreshMetaToken() {
  if (metaRefreshing) return false
  const userToken = getSetting('meta_user_token')
  if (!userToken) return false
  metaRefreshing = true
  try {
    await resolveAndStorePageToken(userToken, metaPageId())
    console.log('🔑 refreshed Meta page token')
    return true
  } catch (e) { console.warn('[meta refresh] ' + e.message); return false }
  finally { metaRefreshing = false }
}

// Build (and persist) a conversation for an incoming/looked-up Meta sender.
async function upsertMetaConversation(channel, senderId, profile = {}) {
  const prefix = channel === 'Instagram' ? 'ig' : 'fb'
  const convId = `${prefix}:${senderId}`
  let conv = findById('conversations', convId)
  if (conv) return conv

  const fullName = profile.name
    || `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
    || profile.username
    || (channel === 'Instagram' ? 'Instagram user' : 'Messenger user')
  const initials = fullName.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'

  conv = insert('conversations', {
    id: convId,
    customer_id: null,
    name: fullName,
    initials,
    avatar_bg: channel === 'Instagram' ? 'bg-fuchsia-100 text-fuchsia-700' : 'bg-blue-100 text-blue-700',
    channel,
    channel_bg: channel === 'Instagram'
      ? 'bg-gradient-to-br from-amber-400 via-rose-500 to-fuchsia-600'
      : 'bg-blue-600',
    phone: profile.username ? `@${profile.username}` : '',
    company: '',
    status: 'New Lead',
    status_bg: 'bg-sky-50 text-sky-700 hover:bg-sky-100',
    status_icon: '✨',
    list_preview: '(no messages yet)',
    list_time: nowTime(),
    unread: 0,
    source: 'meta',
    meta_recipient_id: String(senderId),
    profile_pic: profile.profile_pic || profile.profile_picture_url || null,
  })
  return conv
}

// Delete a lead/conversation permanently — removes conversation + messages + lead +
// customer + notes, deletes its Qdrant vectors, and tells the poller never to re-create it.
app.post('/api/conversations/:id/delete', authRequired, async (req, res) => {
  const id = req.params.id
  try {
    const msgs = getAll('messages').filter((m) => m.conversation_id === id)
    if (qdrantConfigured() && msgs.length) {
      try { await new QdrantClient().request(`/collections/${MSG_COLLECTION}/points/delete?wait=true`, { method: 'POST', body: { points: msgs.map((m) => pointId(m.id)) } }) } catch { /* best effort */ }
    }
    msgs.forEach((m) => remove('messages', m.id))
    getAll('leads').filter((l) => l.conversation_id === id).forEach((l) => remove('leads', l.id))
    getAll('customers').filter((c) => c.conversation_id === id).forEach((c) => remove('customers', c.id))
    getAll('notes').filter((n) => n.related_id === id || n.conversation_id === id).forEach((n) => remove('notes', n.id))
    remove('conversations', id)
    const del = new Set(getSetting('deleted_conversations') || []); del.add(String(id))
    setSetting('deleted_conversations', [...del])
    res.json({ ok: true, deletedMessages: msgs.length })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Connection status (never returns the raw token)
app.get('/api/meta/status', authRequired, (req, res) => {
  const token = getSetting('meta_page_token')
  res.json({
    connected: !!token,
    tokenMasked: token ? `••••${token.slice(-6)}` : null,
    pageId: metaPageId() || null,
    pageName: getSetting('meta_page_name') || null,
    instagram: getSetting('meta_ig') || null,
    verifyToken: getSetting('meta_verify_token') || null,
    connectedAt: getSetting('meta_connected_at') || null,
    permanent: !!getSetting('meta_user_token'),
    tokenExpires: getSetting('meta_token_expires') ?? null,  // 0 = never, ms epoch, or null if unknown
  })
})

// Save the Page Access Token, verify it via Graph, cache page + IG info.
app.post('/api/meta/connect', authRequired, async (req, res) => {
  const { pageToken, verifyToken } = req.body || {}
  if (!pageToken) return res.status(400).json({ error: 'pageToken required' })
  try {
    const client = new MetaClient(pageToken.trim())
    const info = await client.getPageInfo()
    setSetting('meta_page_token', pageToken.trim())
    setSetting('meta_page_id', info.id)
    setSetting('meta_page_name', info.name || '')
    if (info.instagram_business_account) {
      const ig = info.instagram_business_account
      setSetting('meta_ig', { id: ig.id, username: ig.username, name: ig.name })
    } else {
      deleteSetting('meta_ig')
    }
    // A verify token is a shared secret you also type into the Meta webhook setup.
    setSetting('meta_verify_token', (verifyToken && verifyToken.trim()) || getSetting('meta_verify_token') || 'technocas-meta-verify')
    setSetting('meta_connected_at', new Date().toISOString())
    await flush()
    // Pull existing conversations right away so the inbox fills up immediately.
    syncMetaConversations().catch(() => {})
    res.json({ ok: true, page: { id: info.id, name: info.name }, instagram: getSetting('meta_ig') || null })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, body: e.body })
  }
})

// Connect using App ID + App Secret + a fresh token. The server exchanges it
// for a long-lived token and derives a PERMANENT Page token, then keeps it
// fresh automatically — so the user never pastes an expiring token again.
app.post('/api/meta/connect-app', authRequired, async (req, res) => {
  const { appId, appSecret, token, pageId } = req.body || {}
  if (!appId || !appSecret || !token) return res.status(400).json({ error: 'appId, appSecret and token are all required' })
  try {
    setSetting('meta_app_id', String(appId).trim())
    setSetting('meta_app_secret', String(appSecret).trim())

    // 1) short-lived → long-lived (works for user tokens; harmless if already long)
    let longToken = token.trim()
    let exchangeNote = null
    try {
      const ex = await MetaClient.exchangeForLongLived(appId.trim(), appSecret.trim(), token.trim())
      if (ex?.access_token) longToken = ex.access_token
    } catch (e) { exchangeNote = e.message /* often: wrong App Secret, or token is already a Page/System token */ }
    setSetting('meta_user_token', longToken)

    // 2) derive the permanent Page token from the managed pages
    let page
    try {
      page = await resolveAndStorePageToken(longToken, pageId || metaPageId())
    } catch (e) {
      // Maybe they pasted a Page token directly (no /me/accounts). Verify + use it.
      const info = await new MetaClient(longToken).getPageInfo()
      setSetting('meta_page_token', longToken)
      setSetting('meta_page_id', info.id)
      setSetting('meta_page_name', info.name || '')
      if (info.instagram_business_account) {
        const ig = info.instagram_business_account
        setSetting('meta_ig', { id: ig.id, username: ig.username, name: ig.name })
      }
      page = { id: info.id, name: info.name }
    }

    // Verify the resulting Page token's expiry so we can warn if it's NOT permanent.
    let expiresAt = null  // ms epoch; 0 = never expires
    try {
      const dbg = await MetaClient.debugToken(appId.trim(), appSecret.trim(), getSetting('meta_page_token'))
      expiresAt = dbg?.expires_at ? dbg.expires_at * 1000 : 0
      setSetting('meta_token_expires', expiresAt)
    } catch { /* non-fatal */ }

    setSetting('meta_connected_at', new Date().toISOString())
    await flush()  // make sure the token + settings are persisted before we respond
    syncMetaConversations().catch(() => {})

    const neverExpires = expiresAt === 0
    res.json({
      ok: true,
      page: { id: page.id, name: page.name },
      instagram: getSetting('meta_ig') || null,
      neverExpires,
      expiresAt,
      warning: neverExpires ? null
        : (expiresAt
            ? `This token expires on ${new Date(expiresAt).toLocaleString()}. For a token that never expires, use a System User token (see guide).`
            : 'Could not confirm token lifetime.'),
      exchangeNote,
    })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, body: e.body })
  }
})

app.post('/api/meta/disconnect', authRequired, (req, res) => {
  ;['meta_page_token','meta_page_id','meta_page_name','meta_ig','meta_connected_at','meta_app_id','meta_app_secret','meta_user_token','meta_token_expires'].forEach(deleteSetting)
  res.json({ ok: true })
})

// Send a message and reflect it instantly in the inbox.
// Accepts either a conversationId (preferred) or an explicit recipientId+channel.
app.post('/api/meta/send', authRequired, async (req, res) => {
  let { conversationId, recipientId, channel, text } = req.body || {}
  if (!text) return res.status(400).json({ error: 'text required' })

  let conv = conversationId ? findById('conversations', conversationId) : null
  if (conv) {
    recipientId = recipientId || conv.meta_recipient_id || String(conv.id).split(':')[1]
    channel = channel || conv.channel
  }
  if (!recipientId) return res.status(400).json({ error: 'recipientId or a known conversation required' })

  // Transport routing: 'chatwoot' -> Chatwoot API (Meta app dev-mode ki pabandi se azad),
  // fail ho to Meta par fallback. 'meta' (default) -> seedha Meta. Flip karna reversible hai.
  const transport = String(getSetting('messaging_transport') || 'meta').toLowerCase()
  let result, via = 'meta'
  try {
    if (transport === 'chatwoot' && cwEnabled()) {
      try {
        result = await cwSendToPsid(recipientId, text)      // Chatwoot se
        via = 'chatwoot'
      } catch (cwErr) {
        console.warn('[send] chatwoot fail, meta par fallback:', cwErr.message)
        result = await meta().sendText(recipientId, text)   // fallback
        via = 'meta'
      }
    } else {
      result = await meta().sendText(recipientId, text)
    }
    // Chatwoot echo webhook wahi message dobara laayega — usi FB message id (mid/source_id)
    // par upsert hota hai, isliye dupe nahi banta.
    const mid = result?.message_id || (via === 'chatwoot' ? undefined : result?.message_id)
    const msg = saveMessage({
      id: mid || undefined,
      conversation_id: conv?.id || `${channel === 'Instagram' ? 'ig' : 'fb'}:${recipientId}`,
      dir: 'out',
      text,
      time: nowTime(),
      via,
      agent: agentName(req),
    })
    if (conv) update('conversations', conv.id, { list_preview: text, list_time: nowTime(), last_ts: Date.now(), last_dir: 'out' })
    broadcast({ type: 'message', conversationId: msg.conversation_id, message: msg })
    res.json({ ok: true, via, message: msg, result })
  } catch (e) {
    res.status(e.status || 500).json({
      error: e.message, body: e.body,
      hint: (e.code === 10 || e.subcode === 2018278)
        ? 'Outside the 24-hour messaging window — the customer must message you first.'
        : (e.status === 404 && transport === 'chatwoot')
        ? 'Chatwoot ne is customer ki conversation abhi map nahi ki — reconcile chalne dein ya customer ka naya message aane par dobara try karein.'
        : undefined,
    })
  }
})

// Send a FILE/IMAGE to the customer (from the chat composer's attach button).
// File base64 mein aata hai (AI-assistant jaise). Abhi Chatwoot ke raste bhejte hain.
app.post('/api/meta/send-file', authRequired, async (req, res) => {
  const { conversationId, fileName, fileType, dataBase64, text } = req.body || {}
  if (!conversationId || !dataBase64) return res.status(400).json({ error: 'conversationId and file required' })
  const conv = findById('conversations', conversationId)
  const recipientId = conv?.meta_recipient_id || String(conversationId).split(':')[1]
  if (!recipientId) return res.status(400).json({ error: 'unknown conversation' })

  const b64 = String(dataBase64).replace(/^data:[^;]+;base64,/, '')
  const buffer = Buffer.from(b64, 'base64')
  const isImg = String(fileType || '').startsWith('image/')

  const transport = String(getSetting('messaging_transport') || 'meta').toLowerCase()
  try {
    let result, via = 'meta'
    if (transport === 'chatwoot' && cwEnabled()) {
      result = await cwSendFileToPsid(recipientId, { buffer, fileName, mimeType: fileType, caption: text })
      via = 'chatwoot'
    } else {
      // File send abhi sirf Chatwoot se (Meta app dev-mode). Transport chatwoot karein.
      const e = new Error('File bhejne ke liye messaging transport Chatwoot hona chahiye'); e.status = 400; throw e
    }
    // Bheji file ki apni copy PG mein SYNC save karo (Chatwoot ka URL browser mein load nahi hota).
    // Message ka attachment `name` = artwork_no rakho — chat image ise PG se serve karega
    // (/api/artwork-file?name=<artwork_no>), taaki chat mein hamesha dikhe.
    let artworkNo = null
    try {
      artworkNo = await storeArtworkBytes({ ref: `out:file:${Date.now()}#0`, convRef: conv?.id || conversationId,
        buffer, fileName, fileType })
    } catch (capErr) { console.warn('[send-file] PG save failed:', capErr.message) }
    // url: null rakho — Chatwoot ka attachment URL browser mein load nahi hota. Chat image
    // `name` (artwork_no) se PG endpoint /api/artwork-file se serve karega (hamesha dikhega).
    const msg = saveMessage({
      conversation_id: conv?.id || conversationId, dir: 'out', text: text || '',
      attachments: [{ type: isImg ? 'image' : 'file', url: null, name: artworkNo || fileName }],
      time: nowTime(), via, agent: agentName(req),
    })
    if (conv) update('conversations', conv.id, { list_preview: isImg ? '📷 Photo' : `📎 ${fileName}`, list_time: nowTime(), last_ts: Date.now(), last_dir: 'out' })
    broadcast({ type: 'message', conversationId: msg.conversation_id, message: msg })
    res.json({ ok: true, via, message: msg })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message })
  }
})

// Manual lookup: pull a sender into the inbox by PSID/IGSID
app.post('/api/meta/lookup', authRequired, async (req, res) => {
  const { recipientId, channel } = req.body || {}
  if (!recipientId) return res.status(400).json({ error: 'recipientId required' })
  try {
    const client = meta()
    let profile = {}
    try {
      profile = channel === 'Instagram'
        ? await client.getInstagramProfile(recipientId)
        : await client.getMessengerProfile(recipientId)
    } catch { /* profile may be unavailable; create with fallback name */ }
    const conv = await upsertMetaConversation(channel || 'Facebook', recipientId, profile)
    broadcast({ type: 'conversation', conversation: conv })
    res.json(conv)
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, body: e.body })
  }
})

// ------------------------------------------------------------
// API polling (no webhook needed): every 10s pull conversations +
// messages from the Graph API, store new ones, and push them to the
// inbox over SSE. Good for testing without a public webhook URL.
// ------------------------------------------------------------
const fmtTimeFromISO = (iso) => {
  try { return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) }
  catch { return nowTime() }
}

// Auto lead-capture: every conversation becomes a lead in the sales pipeline.
const LEAD_CHANNEL_AV = {
  Facebook:  'bg-blue-600',
  Instagram: 'bg-gradient-to-br from-amber-400 via-rose-500 to-fuchsia-600',
  WhatsApp:  'bg-emerald-500',
  Email:     'bg-slate-700',
}
function ensureLeadForConversation(conv) {
  if (!conv || findById('leads', conv.id)) return false  // idempotent — one lead per conversation
  const d = conv.created_at ? new Date(conv.created_at) : new Date()
  insert('leads', {
    id: conv.id,
    name: conv.name,
    initials: conv.initials,
    av: LEAD_CHANNEL_AV[conv.channel] || 'bg-brand-600',
    badge: null,
    company: conv.company || '',
    source: conv.channel || 'Meta',
    product: '',
    units: '',
    pipeline: 'New Lead',
    pipelineCls: 'text-violet-700',
    score: 50,
    status: 'New',
    statusCls: 'bg-sky-50 text-sky-700',
    value: 0,
    agent: conv.assigned_to || '',
    created: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    createdTime: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    conversation_id: conv.id,
    source_type: 'meta',
    // Updated2 format (Decoinks-Database-Tables-Updated2.xlsx `lead` table)
    lead_stage: 'New Lead',
    lead_status: 'Active',
    priority: 'Medium',
    source_platform: conv.channel || 'Meta',
    instagram_id: /insta/i.test(conv.channel || '') ? (conv.meta_recipient_id || null) : null,
    facebook_id: /face/i.test(conv.channel || '') ? (conv.meta_recipient_id || null) : null,
    last_contact_at: conv.last_ts || conv.created_at || new Date().toISOString(),
  })
  return true
}

// Backfill: convert every existing conversation into a lead (one-time / on demand).
app.post('/api/leads/backfill', authRequired, async (req, res) => {
  let created = 0
  for (const conv of getAll('conversations')) if (ensureLeadForConversation(conv)) created++
  await flush()
  res.json({ ok: true, created, totalLeads: getAll('leads').length })
})

// Create a customer record for a conversation (idempotent — one per conversation).
function ensureCustomerForConversation(conv) {
  const id = `cust:${conv.id}`
  if (!conv || findById('customers', id)) return false
  const d = conv.created_at ? new Date(conv.created_at) : new Date()
  insert('customers', {
    id,
    name: conv.name || 'Unknown',
    company: conv.company || '',
    channel: conv.channel || 'Meta',
    phone: conv.phone || '',
    email: '',
    initials: conv.initials || (conv.name || '?').slice(0, 2).toUpperCase(),
    avatar: conv.avatar_bg || 'bg-brand-100 text-brand-700',
    tier: 'Bronze',
    type: 'Lead',
    orders: 0,
    spend: 0,
    health: 100,
    healthLabel: 'New',
    owner: conv.assigned_to || '',
    role: conv.assigned_to ? 'Agent' : '',
    loc: '',
    lastOrder: '—',
    activityAgo: conv.list_time || '',
    activityDaysAgo: '',
    created: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    conversation_id: conv.id,
    customer_id: conv.customer_id || '',
    source_type: 'meta',
  })
  return true
}

// Backfill customers from conversations + remove old demo/seed customers (not from Meta).
app.post('/api/customers/backfill', authRequired, async (req, res) => {
  // 1) delete demo/seed customers (anything not created from a Meta conversation)
  let removed = 0
  for (const c of [...getAll('customers')]) {
    if (c.source_type !== 'meta') { remove('customers', c.id); removed++ }
  }
  // 2) create a real customer for each conversation
  let created = 0
  for (const conv of getAll('conversations')) if (ensureCustomerForConversation(conv)) created++
  await flush()
  res.json({ ok: true, removed, created, totalCustomers: getAll('customers').length })
})

// Normalize Meta attachments → [{ type:'image'|'video'|'file', url, name }].
// Conversations API: attachments.data[{ image_data:{url,preview_url}, video_data, file_url }]
// Webhook: attachments[{ type, payload:{ url } }]
function metaAttachments(att) {
  const list = Array.isArray(att) ? att : (att?.data || [])
  return list.map((a) => {
    if (a.payload || a.type) {            // webhook shape
      return a.payload?.url ? { type: a.type || 'file', url: a.payload.url, name: '' } : null
    }
    const url = a.image_data?.url || a.image_data?.preview_url || a.video_data?.url || a.file_url || null
    const type = a.video_data ? 'video' : a.image_data ? 'image' : 'file'
    return url ? { type, url, name: a.name || '' } : null
  }).filter(Boolean)
}
const attachPreview = (atts) => atts?.length ? (atts[0].type === 'image' ? '📷 Photo' : atts[0].type === 'video' ? '🎥 Video' : '📎 Attachment') : ''

let metaSyncRunning = false
async function syncMetaConversations() {
  const token = metaToken()
  if (!token || metaSyncRunning) return { skipped: true }
  metaSyncRunning = true
  const pageId = metaPageId()
  const igId = metaIgId()
  let client = new MetaClient(token)
  const platforms = [['messenger', 'Facebook', 'fb'], ['instagram', 'Instagram', 'ig']]
  let newMessages = 0

  // Fetch with one automatic token-refresh + retry on an expired/invalid token.
  const fetchConvos = async (platform) => {
    try { return await client.getConversations(platform) }
    catch (e) {
      if (e.code === 190 && await tryRefreshMetaToken()) {
        client = new MetaClient(metaToken())
        return await client.getConversations(platform)
      }
      throw e
    }
  }

  try {
    for (const [platform, channel, prefix] of platforms) {
      if (platform === 'instagram' && !igId) continue
      let data
      try { data = await fetchConvos(platform) }
      catch (e) { console.warn(`[meta sync ${platform}] ${e.message}`); continue }

      for (const c of (data?.data || [])) {
        const parts = c.participants?.data || []
        const other = parts.find(p => String(p.id) !== pageId && String(p.id) !== igId) || parts[0]
        if (!other) continue
        const convId = `${prefix}:${other.id}`
        if ((getSetting('deleted_conversations') || []).includes(convId)) continue  // user deleted this lead — don't re-create

        let conv = findById('conversations', convId)
        if (!conv) {
          conv = await upsertMetaConversation(channel, other.id, { name: other.name })
          broadcast({ type: 'conversation', conversation: conv })
        }
        ensureLeadForConversation(conv)  // auto lead-capture (idempotent)
        ensureCustomerForConversation(conv)  // auto customer-capture (idempotent)

        const msgs = (c.messages?.data || []).slice().reverse() // oldest → newest
        let lastText = conv.list_preview, lastTime = conv.list_time, lastDir = conv.last_dir, added = false
        for (const m of msgs) {
          const exists = findById('messages', m.id)
          const fromId = String(m.from?.id || '')
          const dir = (fromId === pageId || fromId === igId) ? 'out' : 'in'
          // DEDUP: agar ye outgoing message CRM ne abhi Chatwoot se bheja tha (numeric id,
          // FB mid nahi), to poller ki copy mat banao — warna duplicate + "gayab-wapas" hota hai.
          if (!exists && dir === 'out') {
            const body = (m.message || '').trim()
            const placeholder = getAll('messages').find((x) =>
              x.conversation_id === convId && (x.dir === 'out' || x.direction === 'out') &&
              !String(x.id).startsWith('m_') && (x.text || x.body || '').trim() === body &&
              Date.now() - (Date.parse(x.created_at) || 0) < 15 * 60 * 1000)
            if (placeholder) {
              // placeholder ko asli FB mid de do (taaki aage ke polls bhi ise pehchaanein)
              update('messages', placeholder.id, { mid: m.id })
              continue
            }
          }
          const atts = metaAttachments(m.attachments)
          const stored = saveMessage({
            id: m.id,
            conversation_id: convId,
            dir,
            text: m.message || '',
            attachments: atts,
            time: fmtTimeFromISO(m.created_time),
            via: 'meta',
          })
          if (!exists) {
            added = true; newMessages++
            lastText = stored.text || attachPreview(atts); lastTime = stored.time; lastDir = dir
            broadcast({ type: 'message', conversationId: convId, message: stored })
          }
        }
        // Track last-activity timestamp so the inbox can sort newest-first.
        const lastTs = c.updated_time ? Date.parse(c.updated_time) : (conv.last_ts || null)
        const patch = { last_ts: lastTs }
        if (added) { patch.list_preview = lastText; patch.list_time = lastTime; patch.last_dir = lastDir }
        const updated = update('conversations', convId, patch)
        if (updated && (added || updated.last_ts !== conv.last_ts)) {
          broadcast({ type: 'conversation', conversation: updated })
        }
      }
    }
  } finally { metaSyncRunning = false }
  return { newMessages }
}

let metaPollTimer = null
function startMetaPolling() {
  if (metaPollTimer) clearInterval(metaPollTimer)
  metaPollTimer = setInterval(() => { syncMetaConversations().catch(() => {}) }, 10000)
  console.log('🔄 Meta API polling every 10s (pull mode)')
}

// Manual trigger (also used right after connecting)
app.post('/api/meta/sync', authRequired, async (req, res) => {
  try { res.json(await syncMetaConversations()) }
  catch (e) { res.status(e.status || 500).json({ error: e.message, body: e.body }) }
})

// Webhook verification (Meta calls this once with a challenge when you save the URL)
app.get('/api/webhooks/meta', (req, res) => {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']
  const expected = getSetting('meta_verify_token') || 'technocas-meta-verify'
  if (mode === 'subscribe' && token === expected) return res.status(200).send(challenge)
  return res.sendStatus(403)
})

// Webhook receiver: Messenger (object "page") + Instagram (object "instagram").
app.post('/api/webhooks/meta', async (req, res) => {
  // Meta expects a fast 200; do the work but don't block on profile fetches failing.
  res.sendStatus(200)
  const body = req.body || {}
  insert('webhook_events', { source: 'meta', received_at: new Date().toISOString(), event: body })

  const channel = body.object === 'instagram' ? 'Instagram' : 'Facebook'
  const entries = Array.isArray(body.entry) ? body.entry : []

  for (const entry of entries) {
    const events = entry.messaging || entry.standby || []
    for (const ev of events) {
      const msg = ev.message
      if (!msg) continue
      const isEcho = !!msg.is_echo
      // For inbound, the other party is sender. For echoes (sent from the page /
      // Meta inbox), the other party is the recipient.
      const senderId = isEcho ? ev.recipient?.id : ev.sender?.id
      if (!senderId) continue
      const atts = metaAttachments(msg.attachments)
      const text = msg.text || ''
      if (!text && !atts.length) continue

      let conv = findById('conversations', `${channel === 'Instagram' ? 'ig' : 'fb'}:${senderId}`)
      if (!conv) {
        let profile = {}
        try {
          const client = meta()
          profile = channel === 'Instagram'
            ? await client.getInstagramProfile(senderId)
            : await client.getMessengerProfile(senderId)
        } catch { /* fallback name */ }
        conv = await upsertMetaConversation(channel, senderId, profile)
        broadcast({ type: 'conversation', conversation: conv })
        ensureLeadForConversation(conv)  // auto lead-capture
        ensureCustomerForConversation(conv)  // auto customer-capture
      }

      const stored = saveMessage({
        id: msg.mid || undefined,      // dedupe by Meta message id
        conversation_id: conv.id,
        dir: isEcho ? 'out' : 'in',
        text,
        attachments: atts,
        time: nowTime(),
        via: 'meta',
      })
      const patch = { list_preview: text || attachPreview(atts), list_time: nowTime(), last_ts: Date.now(), last_dir: isEcho ? 'out' : 'in' }
      if (!isEcho) patch.unread = (conv.unread || 0) + 1
      const updated = update('conversations', conv.id, patch)
      broadcast({ type: 'message', conversationId: conv.id, message: stored })
      broadcast({ type: 'conversation', conversation: updated })
    }
  }
})

// Mark a conversation as read (clears the unread badge)
app.post('/api/conversations/:id/read', authRequired, (req, res) => {
  const conv = update('conversations', req.params.id, { unread: 0 })
  if (!conv) return res.status(404).json({ error: 'conversation not found' })
  broadcast({ type: 'conversation', conversation: conv })
  res.json(conv)
})

// ============================================================
// Chatwoot integration — SHADOW MODE (Phase 2)
// Meta integration ko koi haath nahi lagta. Chatwoot ka message_created webhook
// yahan aata hai aur sirf public.chatwoot_shadow_messages mein save hota hai —
// production inbox/agents ko kuch nahi dikhta. Dono copies baad mein compare
// hoti hain (chatwoot-compare.mjs). Flags ke liye dekhein server/chatwoot.js.
// ============================================================
app.post('/api/integrations/chatwoot/webhook', async (req, res) => {
  try {
    // optional shared secret: set ho to Chatwoot webhook URL mein ?t=<secret> zaroori
    const secret = process.env.CHATWOOT_WEBHOOK_SECRET || ''
    if (secret && String(req.query.t || '') !== secret) return res.status(403).json({ error: 'bad secret' })
    const out = await cwStoreShadow(req.body || {})
    res.json({ ok: true, ...out })                    // Chatwoot ko hamesha jaldi 200 do
  } catch (e) {
    console.warn('[chatwoot] webhook error:', e.message)
    res.json({ ok: false })                            // 200 hi do — warna Chatwoot retry-spam karega
  }
})

// shadow table ka hisaab (testing ke dauran nazar rakhne ke liye)
app.get('/api/integrations/chatwoot/status', authRequired, async (req, res) => {
  try {
    res.json({ enabled: cwEnabled(), shadow_mode: cwShadowMode(), send_enabled: cwSendEnabled(), stats: await cwShadowStats() })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Manual reconcile trigger — API se chhoote messages abhi bhar do (server-down ke baad).
app.post('/api/integrations/chatwoot/reconcile', authRequired, async (req, res) => {
  try {
    const hours = Number(req.body?.hours) || 12
    res.json({ ok: true, result: await cwReconcile({ sinceHours: hours }) })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Messaging transport dekho / badlo — 'meta' | 'chatwoot'. Rollback bas isko wapas 'meta' karna.
app.get('/api/integrations/messaging-transport', authRequired, (req, res) => {
  res.json({ transport: String(getSetting('messaging_transport') || 'meta').toLowerCase() })
})
app.post('/api/integrations/messaging-transport', authRequired, (req, res) => {
  const t = String(req.body?.transport || '').toLowerCase()
  if (!['meta', 'chatwoot'].includes(t)) return res.status(400).json({ error: "transport 'meta' ya 'chatwoot' hona chahiye" })
  setSetting('messaging_transport', t)
  console.log(`[send] messaging transport -> ${t}`)
  res.json({ ok: true, transport: t })
})

// Phase 5 pilot: sirf tab chalta hai jab CHATWOOT_SEND_ENABLED=true ho.
// Normal Send button Meta hi use karta rahega — ye alag developer/test route hai.
app.post('/api/integrations/chatwoot/send', authRequired, async (req, res) => {
  try {
    const { conversation_id, content } = req.body || {}
    if (!conversation_id || !content) return res.status(400).json({ error: 'conversation_id and content required' })
    res.json({ ok: true, message: await cwSendMessage(conversation_id, content) })
  } catch (e) { res.status(e.status || 500).json({ error: e.message }) }
})

// ============================================================
// Translation helper (free MyMemory API — no key needed for testing).
// Swap to Google/DeepL/Claude later for higher quality + volume.
// ============================================================
const LANG_NAME = { es: 'Spanish', en: 'English', fr: 'French', pt: 'Portuguese', ar: 'Arabic', hi: 'Hindi', ur: 'Urdu', de: 'German', it: 'Italian', zh: 'Chinese', ru: 'Russian', tr: 'Turkish', nl: 'Dutch' }

app.post('/api/translate', authRequired, async (req, res) => {
  const { text, from = 'es', to = 'en' } = req.body || {}
  if (!text || !text.trim()) return res.status(400).json({ error: 'text required' })
  if (from === to) return res.json({ translated: text })

  // Prefer OpenAI — reliable, high quality, no length limits.
  if (aiConfigured()) {
    try {
      const sys = `You are a professional translator. Translate the user's message into ${LANG_NAME[to] || to}. Output ONLY the translation — no quotes, no explanations, keep the tone natural.`
      const out = await chatText(sys, text)
      if (out) return res.json({ translated: out, via: 'openai' })
    } catch (e) { /* fall back to free service */ }
  }

  // Fallback: free MyMemory (length-limited)
  try {
    const url = new URL('https://api.mymemory.translated.net/get')
    url.searchParams.set('q', text.slice(0, 480))
    url.searchParams.set('langpair', `${from}|${to}`)
    const r = await fetch(url.toString())
    const data = await r.json()
    const translated = data?.responseData?.translatedText
    if (!translated) return res.status(502).json({ error: 'Translation service unavailable', body: data })
    res.json({ translated, via: 'mymemory' })
  } catch (e) {
    res.status(500).json({ error: `Translation failed: ${e.message}` })
  }
})

// ============================================================
// Qdrant (vector DB) — connection status + collections
// ============================================================
app.get('/api/qdrant/status', authRequired, async (req, res) => {
  if (!qdrantConfigured()) return res.json({ configured: false })
  try {
    const q = new QdrantClient()
    await q.health()
    const cols = await q.listCollections()
    res.json({
      configured: true,
      connected: true,
      url: process.env.QDRANT_URL,
      collections: (cols?.result?.collections || []).map((c) => c.name),
    })
  } catch (e) {
    res.status(e.status || 500).json({ configured: true, connected: false, error: e.message })
  }
})

// ============================================================
// AI Supervisor — real analysis (OpenAI) with Qdrant RAG
// ============================================================
app.get('/api/ai/status', authRequired, (req, res) => {
  res.json({ configured: aiConfigured(), anthropic: anthropicConfigured(), models: aiModels(), chatModels: chatModels(), qdrant: qdrantConfigured() })
})

// ============================================================
// Message memory in Qdrant — every message is embedded + stored so it's
// semantically searchable and can power conversation memory / RAG.
// ============================================================
const MSG_COLLECTION = 'crm_messages'
let msgCollectionReady = false
async function ensureMsgCollection(q) {
  if (msgCollectionReady) return
  await q.ensureCollection(MSG_COLLECTION, { size: 1536 })   // text-embedding-3-small
  try { await q.createPayloadIndex(MSG_COLLECTION, 'conversation_id', 'keyword') } catch { /* already indexed */ }
  msgCollectionReady = true
}
// Stable UUID from a message id, so re-ingesting the same message updates (no dupes).
function pointId(id) {
  const h = createHash('md5').update(String(id)).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}
// Fire-and-forget: embed one message → upsert into Qdrant. Never blocks the caller.
function ingestMessage(msg) {
  if (!msg || !msg.text || !msg.text.trim() || msg.text === '[attachment]') return
  if (!aiConfigured() || !qdrantConfigured()) return
  ;(async () => {
    try {
      const q = new QdrantClient()
      await ensureMsgCollection(q)
      const [vec] = await embed(msg.text)
      await q.upsert(MSG_COLLECTION, [{
        id: pointId(msg.id),
        vector: vec,
        payload: {
          message_id: String(msg.id),
          conversation_id: msg.conversation_id,
          dir: msg.dir, via: msg.via || '', time: msg.time || '',
          text: msg.text, created_at: msg.created_at || '',
        },
      }])
    } catch { /* best effort — message is already saved in Postgres */ }
  })()
}
// Save a message to Postgres AND push it to Qdrant (used by every insert path).
function saveMessage(row) {
  const m = insert('messages', row)
  ingestMessage(m)
  // customer ke bheje artworks auto-capture → app.customer_artwork (SRC-ART-YY-NNNN), fire-and-forget
  captureSourceArtworks(m).catch(() => {})
  return m
}

// Pull relevant Knowledge Base snippets from Qdrant for a query (RAG).
async function ragContext(query) {
  if (!qdrantConfigured()) return ''
  try {
    const [vec] = await embed(query)
    const hits = await new QdrantClient().search('documents', vec, { limit: 4 })
    return (hits?.result || []).map((h) => h.payload?.text).filter(Boolean).join('\n---\n')
  } catch { return '' }
}

const ANALYZE_SYSTEM = `You are an AI sales supervisor for a custom apparel print shop (hoodies, t-shirts, jerseys, DTF transfers, embroidery).
Analyze the conversation and respond with ONLY a JSON object in EXACTLY this shape:
{
 "intent": { "primary": string, "confidence": number, "summary": string },
 "insights": string[],
 "sentiment": { "label": "Positive"|"Neutral"|"Negative", "score": number },
 "missingInfo": string[],
 "suggestedActions": [ { "title": string, "reason": string, "priority": "High"|"Medium"|"Low" } ],
 "recommendedReply": string,
 "customerInsights": { "productInterest": string, "designTheme": string, "buyerType": string, "buyingSignals": string, "urgency": string, "budgetSensitivity": string, "decisionMaker": string, "engagement": string, "repeatCustomer": string },
 "agentScore": { "score": number, "label": string },
 "agentMetrics": {
   "firstResponseTime":   { "value": string, "rating": "Excellent"|"Good"|"Needs Improve"|"Pending" },
   "avgResponseTime":     { "value": string, "rating": "Excellent"|"Good"|"Needs Improve"|"Pending" },
   "resolutionRate":      { "value": string, "rating": "Excellent"|"Good"|"Needs Improve"|"Pending" },
   "conversationControl": { "value": string, "rating": "Excellent"|"Good"|"Needs Improve"|"Pending" },
   "informationCollection":{ "value": string, "rating": "Excellent"|"Good"|"Needs Improve"|"Pending" },
   "ctaEffectiveness":    { "value": string, "rating": "Excellent"|"Good"|"Needs Improve"|"Pending" },
   "objectionHandling":   { "value": string, "rating": "Excellent"|"Good"|"Needs Improve"|"Pending" },
   "followupDiscipline":  { "value": string, "rating": "Excellent"|"Good"|"Needs Improve"|"Pending" }
 },
 "objections": string[],
 "leadPrediction": { "conversionProbability": number }
}
Numbers 0-100. agentMetrics values are short (e.g. "1m 42s", "92%", "High", "Good"). objections = concerns/blockers slowing the deal. leadPrediction.conversionProbability 0-100. Be concise, practical and specific to this conversation. The recommendedReply must be a ready-to-send message in the customer's language.`

app.get('/api/ai/analyze/:id', authRequired, async (req, res) => {
  if (!aiConfigured()) return res.status(400).json({ error: 'OpenAI not configured — set OPENAI_API_KEY in server/.env' })
  const conv = findById('conversations', req.params.id)
  if (!conv) return res.status(404).json({ error: 'conversation not found' })
  const msgs = getAll('messages').filter((m) => m.conversation_id === req.params.id)
  if (!msgs.length) return res.json({ empty: true })

  const transcript = msgs.map((m) =>
    `${m.dir === 'in' ? 'Customer' : m.dir === 'out' ? 'Agent' : 'System'}: ${m.text}`).join('\n')
  const lastIn = [...msgs].reverse().find((m) => m.dir === 'in')?.text || transcript.slice(-500)

  try {
    const kb = await ragContext(lastIn)
    const user = `${kb ? `Knowledge base (use if relevant):\n${kb}\n\n` : ''}Customer: ${conv.name} · Channel: ${conv.channel}\n\nConversation:\n${transcript}`
    const result = await chatJSON(ANALYZE_SYSTEM, user)
    res.json({ ok: true, model: aiModels().chat, usedRag: !!kb, analysis: result })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, code: e.code, hint: e.hint })
  }
})

// Add a document to the Knowledge Base (embed → Qdrant `documents`).
app.post('/api/ai/ingest', authRequired, async (req, res) => {
  const { title, text, category = 'general', language = 'en', author = '', access_level = 'public' } = req.body || {}
  if (!text || !text.trim()) return res.status(400).json({ error: 'text required' })
  if (!aiConfigured()) return res.status(400).json({ error: 'OpenAI not configured' })
  if (!qdrantConfigured()) return res.status(400).json({ error: 'Qdrant not configured' })
  try {
    const [vec] = await embed(text)
    const id = randomUUID()
    await new QdrantClient().upsert('documents', [{
      id, vector: vec,
      payload: { text, title: title || '', category, language, author, access_level, doc_id: id, token_count: Math.round(text.length / 4) },
    }])
    res.json({ ok: true, id })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, code: e.code, hint: e.hint })
  }
})

// Backfill: embed ALL existing messages into Qdrant (one-time / on demand).
app.post('/api/ai/ingest-messages', authRequired, async (req, res) => {
  if (!aiConfigured()) return res.status(400).json({ error: 'OpenAI not configured' })
  if (!qdrantConfigured()) return res.status(400).json({ error: 'Qdrant not configured' })
  const all = getAll('messages').filter((m) => m.text && m.text.trim() && m.text !== '[attachment]')
  try {
    const q = new QdrantClient()
    await ensureMsgCollection(q)
    let done = 0
    const BATCH = 100
    for (let i = 0; i < all.length; i += BATCH) {
      const slice = all.slice(i, i + BATCH)
      const vecs = await embed(slice.map((m) => m.text))
      const points = slice.map((m, j) => ({
        id: pointId(m.id),
        vector: vecs[j],
        payload: {
          message_id: String(m.id), conversation_id: m.conversation_id,
          dir: m.dir, via: m.via || '', time: m.time || '',
          text: m.text, created_at: m.created_at || '',
        },
      }))
      await q.upsert(MSG_COLLECTION, points)
      done += slice.length
    }
    res.json({ ok: true, total: all.length, ingested: done, collection: MSG_COLLECTION })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, code: e.code, hint: e.hint })
  }
})

// Translation assist: understand the last customer message + suggest a reply.
app.post('/api/ai/translate-assist', authRequired, async (req, res) => {
  const { text } = req.body || {}
  if (!text || !text.trim()) return res.status(400).json({ error: 'text required' })
  if (!aiConfigured()) return res.status(400).json({ error: 'OpenAI not configured — set OPENAI_API_KEY' })
  const sys = `You help a customer-support agent at a custom apparel print shop. The customer's last message may be in broken English, Spanish, or another language. Respond with ONLY a JSON object:
{
 "detectedLanguage": string,        // e.g. "English", "Spanish"
 "explanation": string,             // what the customer means, in SIMPLE clear English (1-3 sentences)
 "replyEn": string,                 // a helpful, professional suggested reply IN ENGLISH
 "replyNative": string              // replyEn translated into the customer's language; if the customer's language is English, return ""
}`
  try {
    const out = await chatJSON(sys, text.trim())
    res.json(out)
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, code: e.code, hint: e.hint })
  }
})

// Verify a translation: back-translate text WORD BY WORD to English so the agent can
// confirm the translation is accurate.
app.post('/api/ai/verify-translation', authRequired, async (req, res) => {
  const { text } = req.body || {}
  if (!text || !text.trim()) return res.status(400).json({ error: 'text required' })
  if (!aiConfigured()) return res.status(400).json({ error: 'OpenAI not configured — set OPENAI_API_KEY' })
  const sys = `The agent wants to verify a reply written in another language. Back-translate it to English so they can check it is correct. Respond with ONLY a JSON object:
{
 "literal": string,                          // a faithful, fairly literal English translation of the whole text
 "pairs": [ { "src": string, "en": string } ] // word-by-word (or short phrase) mapping: each source word/phrase → its English meaning, in order
}`
  try {
    const out = await chatJSON(sys, text.trim())
    res.json({ ok: true, literal: out.literal || '', pairs: Array.isArray(out.pairs) ? out.pairs : [] })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, code: e.code, hint: e.hint })
  }
})

// Conversation summary — generated on demand, saved ONLY in Qdrant (`crm_summaries`
// collection — the single store for AI summaries; Postgres no longer caches them), and
// updated INCREMENTALLY: only the NEW messages (since the saved summary) are sent
// to the model, which merges them into the existing detailed summary.
// Messages in the SAME order the chat shows them (array/insertion order). The bulk
// import gave historical messages near-identical created_at, so sorting by it would
// scramble order — array order is the source of truth the agent actually sees.
const sortedConvMsgs = (cid) => getAll('messages').filter((m) => m.conversation_id === cid)
const fmtMsg = (m) => `${m.dir === 'in' ? 'Customer' : m.dir === 'out' ? 'Agent' : 'System'}: ${m.text}`

const SUMMARY_FULL = `Summarize this customer conversation for an agent who is taking over, so they instantly understand what happened WITHOUT reading the whole chat. Be detailed and specific. Respond with ONLY a JSON object:
{
 "overview": string,        // 3-5 sentence plain-English overview from first to last message
 "keyPoints": string[],     // detailed bullet facts: what the customer wants, products, quantities, sizes, colors, prices/quotes, decisions, dates
 "status": string,          // current stage (e.g. "Awaiting quote approval")
 "nextStep": string         // what the agent should do next
}`
const SUMMARY_UPDATE = `You maintain a running, DETAILED summary of a customer-support conversation so an agent taking over understands everything WITHOUT reading the whole chat. You are given the EXISTING summary (JSON) and ONLY the NEW messages since it was written. Merge the new messages into the summary: keep all still-relevant key points, ADD the new information, and update status and nextStep. Do not drop earlier facts that still matter. Respond with ONLY a JSON object: { "overview": string, "keyPoints": string[], "status": string, "nextStep": string }`

// ---- Summary store: Qdrant ONLY (collection `crm_summaries`) ----
const SUMMARY_COLLECTION = 'crm_summaries'
let summaryCollectionReady = false
async function ensureSummaryCollection(q) {
  if (summaryCollectionReady) return
  await q.ensureCollection(SUMMARY_COLLECTION, { size: 1536 })
  try { await q.createPayloadIndex(SUMMARY_COLLECTION, 'conversation_id', 'keyword') } catch { /* already indexed */ }
  try { await q.createPayloadIndex(SUMMARY_COLLECTION, 'kind', 'keyword') } catch { /* already indexed */ }
  summaryCollectionReady = true
}
const summaryText = (s) => [s?.overview, ...(Array.isArray(s?.keyPoints) ? s.keyPoints : []), s?.status, s?.nextStep].filter(Boolean).join('\n')
// Read the saved summary point for a conversation from Qdrant (null if none / unreachable).
async function getSummaryPoint(convId) {
  if (!qdrantConfigured()) return null
  try {
    const q = new QdrantClient()
    await ensureSummaryCollection(q)
    const [pt] = await q.retrieve(SUMMARY_COLLECTION, [pointId(`summary:${convId}`)])
    return pt?.payload || null
  } catch { return null }
}
// Save the summary to Qdrant (embedded so summaries are semantically searchable too).
async function saveSummaryPoint(convId, summary, count, at) {
  const q = new QdrantClient()
  await ensureSummaryCollection(q)
  let vec
  try { [vec] = await embed(summaryText(summary).slice(0, 8000) || 'empty summary') }
  catch { vec = new Array(1536).fill(0) }   // never lose the summary because embedding failed
  await q.upsert(SUMMARY_COLLECTION, [{
    id: pointId(`summary:${convId}`),
    vector: vec,
    payload: { kind: 'conversation_summary', conversation_id: String(convId), summary, summary_count: count, summary_at: at },
  }])
}

// GET → return the saved summary from Qdrant (does NOT call the model). Reports how many new messages exist.
app.get('/api/ai/summary/:id', authRequired, async (req, res) => {
  const conv = findById('conversations', req.params.id)
  if (!conv) return res.status(404).json({ error: 'conversation not found' })
  const total = sortedConvMsgs(req.params.id).length
  if (!total) return res.json({ empty: true })
  const saved = await getSummaryPoint(conv.id)
  const covered = saved?.summary_count || 0
  res.json({
    ok: true,
    cached: !!saved?.summary,
    summary: saved?.summary || null,
    summaryAt: saved?.summary_at || null,
    coveredCount: covered,
    totalCount: total,
    newCount: Math.max(0, total - covered),
    stale: !!saved?.summary && total > covered,
  })
})

// POST → generate (first time, full) or update (incremental — only new messages) + SAVE to Qdrant only.
app.post('/api/ai/summary/:id', authRequired, async (req, res) => {
  if (!aiConfigured()) return res.status(400).json({ error: 'OpenAI not configured — set OPENAI_API_KEY' })
  if (!qdrantConfigured()) return res.status(400).json({ error: 'Qdrant not configured — summaries are stored in Qdrant (set QDRANT_URL)' })
  const conv = findById('conversations', req.params.id)
  if (!conv) return res.status(404).json({ error: 'conversation not found' })
  const msgs = sortedConvMsgs(req.params.id)
  if (!msgs.length) return res.json({ empty: true })

  const saved = await getSummaryPoint(conv.id)
  const covered = saved?.summary_count || 0
  const hasCache = !!saved?.summary
  try {
    let summary, mode
    if (hasCache && msgs.length <= covered) {
      summary = saved.summary; mode = 'unchanged'                // nothing new
    } else if (hasCache && covered > 0) {
      const fresh = msgs.slice(covered).map(fmtMsg).join('\n')   // only the NEW messages
      summary = await chatJSON(SUMMARY_UPDATE, `EXISTING SUMMARY:\n${JSON.stringify(saved.summary)}\n\nNEW MESSAGES:\n${fresh}`)
      mode = 'incremental'
    } else {
      summary = await chatJSON(SUMMARY_FULL, msgs.map(fmtMsg).join('\n'))  // first time, full
      mode = 'full'
    }
    const summaryAt = new Date().toISOString()
    await saveSummaryPoint(conv.id, summary, msgs.length, summaryAt)
    res.json({ ok: true, mode, summary, coveredCount: msgs.length, totalCount: msgs.length, newCount: 0, summaryAt })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, code: e.code, hint: e.hint })
  }
})

// AI Recommended Reply — replies to the customer messages that arrived AFTER the
// agent's last reply (the UNANSWERED ones). Cheap when nothing is pending (no AI call).
app.post('/api/ai/recommend-reply/:id', authRequired, async (req, res) => {
  if (!aiConfigured()) return res.status(400).json({ error: 'OpenAI not configured — set OPENAI_API_KEY' })
  const conv = findById('conversations', req.params.id)
  if (!conv) return res.status(404).json({ error: 'conversation not found' })
  const msgs = sortedConvMsgs(req.params.id)
  if (!msgs.length) return res.json({ empty: true })

  // Index of the agent's last outgoing message; customer messages after it are "pending".
  let lastOut = -1
  for (let i = msgs.length - 1; i >= 0; i--) { if (msgs[i].dir === 'out') { lastOut = i; break } }
  const pendingMsgs = msgs.slice(lastOut + 1).filter((m) => m.dir === 'in')
  const force = !!req.body?.force

  // Nothing new to answer and not forced → tell the UI, skip the AI call.
  if (!pendingMsgs.length && !force) return res.json({ ok: true, pending: false, pendingCount: 0 })

  // What to reply to: the unanswered messages (or, if forced with none pending, the last customer message).
  const targets = pendingMsgs.length ? pendingMsgs : msgs.filter((m) => m.dir === 'in').slice(-1)
  if (!targets.length) return res.json({ ok: true, pending: false, pendingCount: 0 })
  const targetText = targets.map((m) => m.text).join('\n')

  try {
    const kb = await ragContext(targetText)
    const sys = `You are an AI sales assistant for a custom apparel print shop (hoodies, t-shirts, jerseys, DTF transfers, embroidery). Write the agent's NEXT reply.

LANGUAGE RULE (critical): Detect the language of the UNANSWERED customer message(s) ONLY — ignore the language of earlier messages. Write your reply in EXACTLY that language. If the unanswered message(s) are in English, reply in English. If they are in Spanish, reply in Spanish. If the language is unclear, mixed, or just an emoji/number, default to English. NEVER reply in a different language than the customer's latest unanswered message(s).

COVERAGE RULE: The customer may have sent SEVERAL unanswered messages or questions. Address ALL of them in a single reply — do not answer only the last one. Cover every question/request they raised.

Be professional, helpful and concise. Use the full conversation only as background context.
Respond with ONLY a JSON object: { "detectedLanguage": string, "reply": string }`
    const user = `${kb ? `Knowledge base (use if relevant):\n${kb}\n\n` : ''}Customer: ${conv.name} · Channel: ${conv.channel}\n\nFull conversation (BACKGROUND CONTEXT ONLY — do not copy its language):\n${msgs.map(fmtMsg).join('\n')}\n\n>>> UNANSWERED customer message(s) you must reply to (detect THEIR language, answer ALL of them):\n${targetText}`
    const out = await chatJSON(sys, user)
    res.json({
      ok: true,
      pending: pendingMsgs.length > 0,
      pendingCount: pendingMsgs.length,
      pendingMessages: pendingMsgs.map((m) => m.text),
      detectedLanguage: out.detectedLanguage || '',
      reply: out.reply || '',
    })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, code: e.code, hint: e.hint })
  }
})

// Designer Jobs — AI extracts the design/artwork tasks from the conversation,
// then persists them on the conversation doc (designer_jobs). The frontend can
// edit/add/remove and save via PATCH /api/conversations/:id.
app.post('/api/ai/designer-jobs/:id', authRequired, async (req, res) => {
  if (!aiConfigured()) return res.status(400).json({ error: 'OpenAI not configured — set OPENAI_API_KEY' })
  const conv = findById('conversations', req.params.id)
  if (!conv) return res.status(404).json({ error: 'conversation not found' })
  const msgs = sortedConvMsgs(req.params.id)
  if (!msgs.length) return res.json({ empty: true })
  const sys = `You are an assistant for a custom apparel print shop (hoodies, t-shirts, jerseys, DTF transfers, embroidery). From the conversation, extract the concrete DESIGN / ARTWORK tasks the design team must produce — e.g. logo placement, text on front/back, mockups, color variations, size labels, embroidery, DTF transfers. Only include real design work the customer actually requested or that is clearly implied. If there is no design work yet, return an empty array. Respond with ONLY a JSON object:
{ "jobs": [ { "title": string, "instructions": string, "priority": "High"|"Medium"|"Low" } ] }`
  try {
    const out = await chatJSON(sys, msgs.map(fmtMsg).join('\n'))
    const yr = new Date().getFullYear()
    const jobs = (Array.isArray(out.jobs) ? out.jobs : []).map((j, i) => ({
      id: i + 1,
      code: `AW-${yr}-${String(i + 1).padStart(3, '0')}`,
      title: j.title || '',
      instructions: j.instructions || '',
      priority: ['High', 'Medium', 'Low'].includes(j.priority) ? j.priority : 'Medium',
      assignee: '',
      checked: true,
    }))
    update('conversations', conv.id, { designer_jobs: jobs })
    res.json({ ok: true, jobs })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, code: e.code, hint: e.hint })
  }
})

// AI Notes — analyze the conversation and produce concise internal notes for the team.
app.post('/api/ai/notes/:id', authRequired, async (req, res) => {
  if (!aiConfigured()) return res.status(400).json({ error: 'OpenAI not configured — set OPENAI_API_KEY' })
  const conv = findById('conversations', req.params.id)
  if (!conv) return res.status(404).json({ error: 'conversation not found' })
  const msgs = sortedConvMsgs(req.params.id)
  if (!msgs.length) return res.json({ empty: true })
  const sys = `You are an assistant for a custom apparel print shop (hoodies, t-shirts, jerseys, DTF transfers, embroidery). Read the conversation and write ONLY the genuinely IMPORTANT internal notes the team must know — e.g. what the customer wants (products, quantities, sizes), agreed prices/quotes, shipping address, key decisions, problems/complaints, and any required follow-up. SKIP greetings, small talk, thanks, and anything trivial or obvious. Each note is ONE short, specific sentence. Return only the essential notes (max 5; fewer is better). Pick the best fitting category. Respond with ONLY a JSON object:
{ "notes": [ { "text": string, "category": "internal"|"call"|"meeting"|"followup" } ] }`
  try {
    const out = await chatJSON(sys, msgs.map(fmtMsg).join('\n'))
    const valid = ['internal', 'call', 'meeting', 'followup']
    const notes = (Array.isArray(out.notes) ? out.notes : [])
      .map((n) => ({ text: String(n?.text || '').trim(), category: valid.includes(n?.category) ? n.category : 'internal' }))
      .filter((n) => n.text)
    res.json({ ok: true, notes })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, code: e.code, hint: e.hint })
  }
})

// AI Assistant — chat with the whole CRM (DB + chats + semantic search over messages).
// ---- AI assistant: file attachments (image/PDF/Word/text) + text-to-SQL over the DB ----
// Extract usable content from uploaded files. Returns { texts:[{name,text}], images:[dataUrl] }.
async function extractFiles(files) {
  const texts = [], images = []
  for (const f of (Array.isArray(files) ? files : []).slice(0, 6)) {
    const name = f?.name || 'file', type = f?.type || ''
    try {
      const b64 = String(f?.data || '').replace(/^data:[^;]+;base64,/, '')
      if (!b64) continue
      if (type.startsWith('image/')) { images.push(`data:${type || 'image/png'};base64,${b64}`); continue }
      const buf = Buffer.from(b64, 'base64')
      if (type === 'application/pdf' || /\.pdf$/i.test(name)) {
        const d = await pdfParse(buf); texts.push({ name, text: (d.text || '').slice(0, 12000) })
      } else if (/\.docx$/i.test(name) || type.includes('officedocument.wordprocessingml')) {
        const d = await mammoth.extractRawText({ buffer: buf }); texts.push({ name, text: (d.value || '').slice(0, 12000) })
      } else if (type.startsWith('text/') || /\.(txt|csv|md|json)$/i.test(name)) {
        texts.push({ name, text: buf.toString('utf8').slice(0, 12000) })
      } else {
        texts.push({ name, text: '(unsupported file type — could not read it)' })
      }
    } catch (e) { texts.push({ name, text: `(could not read file: ${e.message})` }) }
  }
  return { texts, images }
}

// Compact schema so the model can write correct SQL.
const SQL_SCHEMA = `PostgreSQL schema "app" (every row's full text is also in its "extra" JSONB column):
- app.customers(customer_id, legacy_id, full_name, email, phone, company, platform_primary AS channel, tier, total_spent, total_orders, payment_status, lifetime_revenue, customer_segment[one_time/repeat/reseller/wholesale/strategic], reseller_potential, language, industry, created_at)
- app.conversations(conversation_id, legacy_id, customer_id, channel, status, sentiment_score 0-100, last_message_at, created_at)
- app.messages(message_id, legacy_id, conversation_id, direction['in'=customer,'out'=agent,'note'], sender_type, body, message_type, sentiment, sent_at, created_at)
- app.leads(lead_id, legacy_id, customer_id, conversation_id, stage, status, source, source_platform, campaign_name, intent_score 0-100, purchase_probability, temperature[hot/warm/cold], customer_type, industry, language, business_potential[A+/A/B/C/D], estimated_value, created_at)
- app.orders(order_id, legacy_id, order_number, customer_id, products, items_count, total_amount, order_status, payment_status, created_at)
- app.payments(payment_id, legacy_id, customer_id, order_id, amount, method, status, created_at)
- app.customer_health(customer_id, health_score, clv, reorder_probability, churn_risk, segment)
Joins: app.messages.conversation_id = app.conversations.conversation_id ; app.conversations.customer_id = app.customers.customer_id ; app.orders/leads/payments/customer_health.customer_id = app.customers.customer_id.`

// Read-only guard: a single SELECT only, with a row cap.
function safeSelect(sql) {
  let s = String(sql || '').trim().replace(/;+\s*$/, '')
  if (!/^select\b/i.test(s)) return null
  if (/\b(insert|update|delete|drop|alter|truncate|grant|revoke|create|copy)\b/i.test(s) || s.includes(';')) return null
  if (!/\blimit\b/i.test(s)) s += ' LIMIT 200'
  return s
}

// FULL live schema — introspected from the database so the AI can query EVERY table/column
// in "app" (not just a hand-picked few). Refreshed at boot; falls back to the compact schema.
let DB_SCHEMA_TEXT = SQL_SCHEMA
async function refreshDbSchema() {
  try {
    const r = await dbQuery(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='app' ORDER BY table_name, ordinal_position`)
    const byTable = {}
    for (const row of r.rows) (byTable[row.table_name] ||= []).push(row.column_name)
    const lines = Object.entries(byTable).map(([t, cols]) => `- app.${t}(${cols.join(', ')})`)
    if (lines.length) {
      DB_SCHEMA_TEXT = `PostgreSQL schema "app" — you have FULL read-only access to EVERY table below. Each table also has an "extra" JSONB column holding the original raw record.\n${lines.join('\n')}\n\nKey joins: app.messages.conversation_id = app.conversations.conversation_id ; app.conversations.customer_id = app.customers.customer_id ; app.leads/orders/payments/customer_health.customer_id = app.customers.customer_id.\nNotes: app.messages holds ALL chat messages (direction 'in'=customer, 'out'=agent, 'note'=internal); body = the message text. Use ILIKE for text search. To read a customer's chat, join messages -> conversations -> customers.`
      console.log(`🗂️  AI DB schema loaded: ${lines.length} tables in "app"`)
    }
  } catch (e) { console.warn('[schema] introspection failed, using compact schema:', e.message) }
}

// Give the SELECTED model live, read-only access to PostgreSQL: it can run several SELECT
// queries, see the results, and refine across a few rounds — full "check & query" power.
async function sqlAnswer(prompt, model) {
  if (DB_SCHEMA_TEXT === SQL_SCHEMA) refreshDbSchema()   // lazy load full schema on first use
  let results = ''
  for (let round = 0; round < 2; round++) {
    let plan
    try {
      plan = await chatJSON(
        `You answer questions about a CRM by querying its LIVE PostgreSQL database. You may run read-only SELECT queries, see the results, then decide whether you need more data. Use ONLY this schema. Prefer SQL whenever the question needs exact numbers, counts, lists, filters, or specific records.
Respond ONLY JSON: {"queries": string[] (0-4 read-only SELECT statements to run now), "done": boolean (true once you have enough data to answer)}.
${DB_SCHEMA_TEXT}${results ? `\n\nResults so far:${results}` : ''}`,
        prompt, { model })
    } catch (e) { results += `\n(query planning failed: ${e.message})`; break }
    const qs = Array.isArray(plan?.queries) ? plan.queries.slice(0, 4) : []
    for (const raw of qs) {
      const sql = safeSelect(raw)
      if (!sql) continue
      try { const r = await dbQuery(sql); results += `\nQuery: ${sql}\nRows (${r.rows.length}): ${JSON.stringify(r.rows.slice(0, 100))}` }
      catch (e) { results += `\nQuery: ${sql}\nERROR: ${e.message}` }
    }
    if (!qs.length || plan?.done) break
  }
  return results.trim() ? `EXACT DATA from the database (queried live — use this as the source of truth):${results}` : ''
}

// Resolve a promise but give up (→ null) after ms — keeps a flaky/slow DB from blocking the request.
const withTimeout = (p, ms) => Promise.race([Promise.resolve(p).catch(() => null), new Promise((r) => setTimeout(() => r(null), ms))])

// LIVE aggregate stats straight from PostgreSQL (source of truth, always current — not the
// boot-time in-memory snapshot). Returns formatted text, or null if the DB is unreachable.
async function dbAggregates() {
  const rows = async (s) => (await dbQuery(s)).rows
  const grp = (r, k) => r.map((x) => `${x[k] || '-'}: ${x.n}`).join(', ') || '-'
  try {
    const [tot, cPay, cTier, cSeg, cPlat, lSrc, lStat, lStage, top] = await Promise.all([
      rows(`SELECT
        (SELECT count(*) FROM app.customers) customers,
        (SELECT count(*) FROM app.leads) leads,
        (SELECT count(*) FROM app.orders) orders,
        (SELECT count(*) FROM app.payments) payments,
        (SELECT count(*) FROM app.conversations) conversations,
        (SELECT coalesce(sum(total_spent),0) FROM app.customers) total_spend,
        (SELECT coalesce(sum(estimated_value),0) FROM app.leads) lead_value,
        (SELECT coalesce(sum(total_amount),0) FROM app.orders) order_total,
        (SELECT coalesce(sum(amount),0) FROM app.payments) paid_total`),
      rows(`SELECT coalesce(payment_status,'-') payment_status, count(*) n FROM app.customers GROUP BY 1 ORDER BY 2 DESC`),
      rows(`SELECT coalesce(tier,'-') tier, count(*) n FROM app.customers GROUP BY 1 ORDER BY 2 DESC`),
      rows(`SELECT coalesce(customer_segment,'-') seg, count(*) n FROM app.customers GROUP BY 1 ORDER BY 2 DESC`),
      rows(`SELECT coalesce(platform_primary,'-') ch, count(*) n FROM app.customers GROUP BY 1 ORDER BY 2 DESC`),
      rows(`SELECT coalesce(source_platform,'-') src, count(*) n FROM app.leads GROUP BY 1 ORDER BY 2 DESC`),
      rows(`SELECT coalesce(status,'-') status, count(*) n FROM app.leads GROUP BY 1 ORDER BY 2 DESC`),
      rows(`SELECT coalesce(stage,'-') stage, count(*) n FROM app.leads GROUP BY 1 ORDER BY 2 DESC`),
      rows(`SELECT full_name, total_spent, total_orders FROM app.customers ORDER BY total_spent DESC NULLS LAST LIMIT 10`),
    ])
    const t = tot[0]
    return `(LIVE from PostgreSQL — source of truth)
CUSTOMERS: ${t.customers} | total spent $${t.total_spend} | by payment → ${grp(cPay, 'payment_status')} | by tier → ${grp(cTier, 'tier')} | by segment → ${grp(cSeg, 'seg')} | by channel → ${grp(cPlat, 'ch')}
LEADS: ${t.leads} | total est. value $${t.lead_value} | by source → ${grp(lSrc, 'src')} | by status → ${grp(lStat, 'status')} | by stage → ${grp(lStage, 'stage')}
ORDERS: ${t.orders} | total $${t.order_total} | PAYMENTS: ${t.payments} | total $${t.paid_total} | CONVERSATIONS: ${t.conversations}
TOP SPENDERS: ${top.map((c) => `${c.full_name} ($${c.total_spent}, ${c.total_orders} orders)`).join('; ')}`
  } catch { return null }
}

app.post('/api/ai/ask', authRequired, async (req, res) => {
  const { prompt = '', history = [], files = [], docs = [], model } = req.body || {}
  const hasFiles = Array.isArray(files) && files.length > 0
  if (!prompt.trim() && !hasFiles) return res.status(400).json({ error: 'prompt required' })
  // pick the model: requested one (if known) else the OpenAI default. embeddings/RAG always need OpenAI.
  const chatModel = chatModels().some((m) => m.id === model) ? model : aiModels().chat
  const useAnthropic = providerOf(chatModel) === 'anthropic'
  if (useAnthropic && !anthropicConfigured()) return res.status(400).json({ error: 'Claude is not configured — set ANTHROPIC_API_KEY to use Claude models' })
  if (!useAnthropic && !aiConfigured()) return res.status(400).json({ error: 'OpenAI not configured — set OPENAI_API_KEY' })
  try {
    // attached files (image/PDF/Word/text) + a precise DB query if the question needs exact data
    const { texts: fileTexts, images } = hasFiles ? await extractFiles(files) : { texts: [], images: [] }
    // documents stay "in context" for the whole chat: previously-uploaded (docs) + newly uploaded (fileTexts)
    const priorDocs = Array.isArray(docs) ? docs.filter((d) => d && d.text) : []
    const allDocs = [...priorDocs, ...fileTexts].slice(-6)
    const convs = getAll('conversations'), custs = getAll('customers'), leads = getAll('leads'), allMsgs = getAll('messages')
    const stats = `Conversations: ${convs.length} · Customers: ${custs.length} · Leads: ${leads.length} · Messages: ${allMsgs.length}`
    const pl = prompt.toLowerCase()

    // 1) Match conversations by name mentioned in the prompt (ignore common stop-words so
    //    "do YOU have..." doesn't falsely match a customer named "Wood You Dream").
    const STOP = new Set(['the', 'you', 'your', 'and', 'for', 'with', 'have', 'has', 'had', 'are', 'was', 'were', 'this', 'that', 'what', 'which', 'who', 'how', 'many', 'much', 'all', 'each', 'every', 'customer', 'customers', 'chat', 'chats', 'data', 'message', 'messages', 'lead', 'leads', 'order', 'orders', 'payment', 'payments', 'does', 'did', 'can', 'give', 'tell', 'show', 'about', 'from', 'their', 'them', 'our', 'total', 'number', 'complete', 'full', 'please', 'want', 'need', 'list', 'name', 'names', 'paid', 'pending', 'asked', 'ask', 'questions'])
    let matched = convs.filter((c) => c.name && c.name.length > 3 && pl.includes(c.name.toLowerCase()))
    if (!matched.length) {
      const words = pl.split(/[^a-z0-9]+/i).filter((w) => w.length > 3 && !STOP.has(w))
      if (words.length) matched = convs.filter((c) => {
        const parts = (c.name || '').toLowerCase().split(/\s+/).filter((p) => p.length > 3 && !STOP.has(p))
        return parts.some((part) => words.includes(part))
      })
    }
    matched = matched.slice(0, 3)

    // FAST PATH — "client ka chat script": if the user typed (basically) just one client's name,
    // or asked for their chat/transcript, return the full conversation straight from the structured
    // data — NO LLM call (near-zero cost). The AI never re-reads the whole chat like before.
    if (!hasFiles && matched.length === 1) {
      const c = matched[0]
      const nameInPrompt = pl.includes((c.name || '').toLowerCase())          // the FULL name was actually typed
      const nameWords = (c.name || '').toLowerCase().split(/\s+/).filter(Boolean)
      const leftover = pl.split(/[^a-z0-9]+/i).filter((w) => w && !nameWords.includes(w))
      // analytical / aggregation questions must NOT dump a transcript — send them to the SQL path
      const analytical = /\b(how many|how much|count|kitne|kitna|list|which|who|mention|search|find|average|avg|total|sum|top|compare|report|group|per|number of|questions?)\b/i.test(prompt)
      const justName = nameInPrompt && leftover.length === 0                    // only the customer's name typed
      const scriptKw = /\b(chat|chats|script|transcript|conversation|conversations|baat|baatein|baaten)\b/i.test(prompt)
      const scriptWords = new Set(['chat', 'chats', 'script', 'transcript', 'conversation', 'conversations', 'ki', 'ka', 'ke', 'dikhao', 'dikha', 'show', 'open', 'full', 'poori', 'puri', 'saari', 'sari', 'baat', 'baatein', 'baaten', 'messages', 'history', 'the', 'me', 'us'])
      const contentLeftover = leftover.filter((w) => !scriptWords.has(w))
      const scriptRequest = nameInPrompt && scriptKw && contentLeftover.length <= 1   // e.g. "<name> chat", "<name> ki poori chat"
      if (!analytical && (justName || scriptRequest)) {
        const all = allMsgs.filter((m) => m.conversation_id === c.id && (m.dir === 'in' || m.dir === 'out') && (m.text || '').trim())
        const cust = custs.find((x) => x.conversation_id === c.id) || {}
        const p = c.ai_profile
        const head = [
          `### ${c.name}${c.company ? ` — ${c.company}` : ''}`,
          `**Channel:** ${c.channel || '-'} · **Phone:** ${c.phone || '-'} · **Spend:** $${cust.spend ?? 0} · **Orders:** ${cust.orders ?? 0} · **Messages:** ${all.length}`,
          p?.summary ? `**Summary:** ${p.summary}` : '',
          p ? `**Stage:** ${p.leadStage || '-'} · **Payment:** ${p.paymentStatus || '-'} · **Products:** ${p.products || '-'}${p.quantity ? ` (${p.quantity})` : ''} · **Next step:** ${p.nextStep || '-'}` : '',
        ].filter(Boolean).join('\n\n')
        const lines = all.map((m) => `**${m.dir === 'in' ? 'Customer' : 'Agent'}:** ${m.text}`)
        const MAX = 600
        const shown = lines.length > MAX ? lines.slice(-MAX) : lines
        const note = lines.length > MAX ? `\n\n_(showing the last ${MAX} of ${lines.length} messages)_` : ''
        const answer = all.length ? `${head}\n\n---\n\n${shown.join('\n\n')}${note}` : `${head}\n\n_(no messages found for this customer)_`
        return res.json({ ok: true, answer, model: 'database (no AI)', matched: [c.name], extractedFiles: [] })
      }
    }

    // 2) Not a pure script request → run the AI pipeline. Kick off the network-bound steps in
    //    parallel (live SQL + semantic RAG + live aggregates) while we build the context below.
    const sqlP = prompt.trim() ? sqlAnswer(prompt, chatModel) : Promise.resolve('')
    const aggP = withTimeout(dbAggregates(), 8000)   // live aggregate stats from PostgreSQL (in-memory fallback)
    const ragP = (async () => {
      if (!qdrantConfigured() || !prompt.trim()) return ''
      try {
        const [vec] = await embed(prompt)
        const hits = await new QdrantClient().search('crm_messages', vec, { limit: 24 })
        return (hits?.result || []).map((h) => h.payload?.text).filter(Boolean).join('\n---\n')
      } catch { return '' }
    })()

    let entityCtx = ''
    for (const c of matched) {
      const all = allMsgs.filter((m) => m.conversation_id === c.id && (m.dir === 'in' || m.dir === 'out'))
      const inCount = all.filter((m) => m.dir === 'in').length
      const cust = custs.find((x) => x.conversation_id === c.id) || {}
      const p = c.ai_profile
      let block = `\n\n=== CUSTOMER: ${c.name} (${c.channel || '-'}) ===\nPhone: ${c.phone || '-'} | Company: ${c.company || '-'} | Spend: $${cust.spend ?? 0} | Orders: ${cust.orders ?? 0} | Total messages: ${all.length} (from customer: ${inCount})`
      if (p) {
        block += `\nPROFILE (pre-extracted digest — use this first):\nSummary: ${p.summary || '-'}\nProducts: ${p.products || '-'}${p.quantity ? ` (${p.quantity})` : ''}\nOrder total: $${p.orderTotal || 0} | Payment: ${p.paymentStatus || '-'} | Stage: ${p.leadStage || '-'} | Deadline: ${p.deadline || '-'} | Address: ${p.shippingAddress || '-'} | Sentiment: ${p.sentiment || '-'}\nQuestions the customer asked (${(p.questions || []).length}):\n${(p.questions || []).map((q, i) => `${i + 1}. ${q}`).join('\n') || '-'}\nKey notes: ${(p.keyNotes || []).join('; ') || '-'}\nNext step: ${p.nextStep || '-'}`
      }
      // Only a small RECENT slice for cost (the full chat is the no-AI fast path above). For verbatim
      // quotes the digest's pre-extracted questions usually suffice; tell the model how to get more.
      if (matched.length === 1) {
        block += `\nRECENT MESSAGES (last 60 — for the FULL chat the user can type just "${c.name}" or "${c.name} chat"):\n` + all.slice(-60).map((m) => `${m.dir === 'in' ? 'Customer' : 'Agent'}: ${m.text}`).join('\n')
      }
      entityCtx += block
    }

    // 3) Await the parallel SQL + semantic-search + live-aggregate results started above
    const [sqlCtx, ragCtx, liveAgg] = await Promise.all([sqlP, ragP, aggP])

    // 3) Aggregate stats: prefer LIVE PostgreSQL (source of truth); fall back to the in-memory
    //    snapshot only if the DB is unreachable. Exact rows/records come from the live SQL above.
    const orders = getAll('orders'), payments = getAll('payments')
    const sumBy = (arr, f) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0)
    const tally = (arr, f) => { const m = {}; for (const x of arr) { const k = (f(x) || '-'); m[k] = (m[k] || 0) + 1 } return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join(', ') || '-' }
    const topSpenders = [...custs].sort((a, b) => (b.spend || 0) - (a.spend || 0)).slice(0, 10).map((c) => `${c.name} ($${c.spend || 0}, ${c.orders || 0} orders)`).join('; ')
    const fallbackAgg = `(in-memory snapshot — DB unreachable)
CUSTOMERS: ${custs.length} | total spend $${sumBy(custs, (c) => c.spend)} | by channel → ${tally(custs, (c) => c.channel)} | by payment → ${tally(custs, (c) => c.payment_status)} | by tier → ${tally(custs, (c) => c.tier)} | by status → ${tally(custs, (c) => c.status)}
LEADS: ${leads.length} | total value $${sumBy(leads, (l) => l.value)} | by source → ${tally(leads, (l) => l.source)} | by status → ${tally(leads, (l) => l.status)} | by stage → ${tally(leads, (l) => l.pipeline)}
ORDERS: ${orders.length} | total $${sumBy(orders, (o) => o.total ?? o.amount)} | PAYMENTS: ${payments.length} | total $${sumBy(payments, (p) => p.amount)}
TOP SPENDERS: ${topSpenders}`
    const aggCtx = liveAgg || fallbackAgg

    const sys = `You are the AI assistant for the Decoinks CRM (a custom apparel print shop). You have FULL ACCESS to the company's PostgreSQL database — every customer, lead, order, payment, and all ${allMsgs.length} chat messages across ${convs.length} conversations. Treat the data below as complete and authoritative.

What you are given below:
- AGGREGATE STATS: totals and breakdowns across ALL ${custs.length} customers, ${leads.length} leads, orders & payments (counts, sums, by channel/payment/tier/status/source/stage, top spenders).
- EXACT DATA (live SQL): for questions needing specific numbers, lists, filters, or records, the system has ALREADY run read-only SQL queries against the live database and the rows are included below. This is your source of truth for anything not covered by the aggregate stats.
- FULL TRANSCRIPTS: for any customer mentioned by name in the question, their complete conversation is included verbatim.
- RELEVANT MESSAGES: the most semantically relevant messages to this question, pulled from across ALL conversations.

How to answer:
- NEVER say you "don't have the data". You have aggregate stats for everything, plus live SQL query results for the specifics of this question. If a specific number isn't in the aggregates, use the EXACT DATA (live SQL) rows.
- Use the AGGREGATE STATS for totals/breakdowns ("how many customers", "by channel", "total spend", "how many leads from Facebook"). Use the EXACT DATA rows for specific lists/records ("which customer asked the most questions", "list customers with spend over $200", "show <customer>'s orders"). Always give a concrete number (even 0).
- For a SPECIFIC customer whose full transcript is included — list/quote the actual questions they asked, what was discussed, whether they paid, what's pending, next step.
- You can also answer general questions from your own knowledge — no topic restrictions.
- Combine the stats + live data + chats, then give the best accurate answer. Reply in the user's language, mirror its structure, be clear and concise.`
    const fileCtx = allDocs.length ? `\n\nATTACHED FILES (the user uploaded these in this chat — use their content to answer, including follow-up questions):\n${allDocs.map((f) => `--- ${f.name} ---\n${f.text}`).join('\n\n')}` : ''
    const dataBlock = `CRM STATS: ${stats}\n\nAGGREGATE STATS:\n${aggCtx}${entityCtx ? `\n\nFULL TRANSCRIPT(S) for the customer(s) named in the question:${entityCtx}` : ''}\n\nRELEVANT MESSAGES (semantic search across ALL conversations):\n${ragCtx || '(none)'}${sqlCtx ? `\n\n${sqlCtx}` : ''}${fileCtx}`
    // user turn — attach images (if any) for vision
    const userText = prompt.trim() || (fileTexts.length ? `Please review the attached file(s): ${fileTexts.map((f) => f.name).join(', ')}` : 'Please review the attached image(s).')
    const userContent = images.length
      ? [{ type: 'text', text: userText }, ...images.map((url) => ({ type: 'image_url', image_url: { url } }))]
      : userText
    const messages = [
      { role: 'system', content: `${sys}\n\n--- CRM DATA ---\n${dataBlock}` },
      ...(Array.isArray(history) ? history : []).slice(-6).map((h) => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: String(h.content || '') })),
      { role: 'user', content: userContent },
    ]
    const answer = await chatMessages(messages, { model: chatModel })
    res.json({ ok: true, answer, model: chatModel, matched: matched.map((c) => c.name), extractedFiles: fileTexts })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, code: e.code, hint: e.hint })
  }
})

// ---- Customer AI PROFILE (digest: structured facts + summary, built once, updated incrementally) ----
// The assistant reads these compact profiles instead of re-processing raw chat each time.
async function buildProfileForConv(conv) {
  const cm = getAll('messages').filter((m) => m.conversation_id === conv.id && (m.dir === 'in' || m.dir === 'out') && m.text)
  if (!cm.length) return null
  const transcript = cm.map((m) => `${m.dir === 'in' ? 'Customer' : 'Agent'}: ${m.text}`).join('\n')
  const profile = await profileFromTranscript(transcript)
  const count = getAll('messages').filter((m) => m.conversation_id === conv.id && (m.dir === 'in' || m.dir === 'out')).length
  update('conversations', conv.id, { ai_profile: profile, profile_msg_count: count, profile_at: new Date().toISOString() })
  return { profile, count }
}

app.get('/api/ai/profile/:id', authRequired, (req, res) => {
  const conv = findById('conversations', req.params.id)
  if (!conv) return res.status(404).json({ error: 'conversation not found' })
  const msgCount = getAll('messages').filter((m) => m.conversation_id === conv.id && (m.dir === 'in' || m.dir === 'out')).length
  res.json({ profile: conv.ai_profile || null, msgCount, builtFrom: conv.profile_msg_count || 0, stale: (conv.profile_msg_count || 0) < msgCount, profile_at: conv.profile_at || null })
})

app.post('/api/ai/profile/:id', authRequired, async (req, res) => {
  if (!aiConfigured()) return res.status(400).json({ error: 'OpenAI not configured — set OPENAI_API_KEY' })
  const conv = findById('conversations', req.params.id)
  if (!conv) return res.status(404).json({ error: 'conversation not found' })
  try {
    const out = await buildProfileForConv(conv)
    if (!out) return res.json({ ok: true, profile: null, note: 'no messages' })
    res.json({ ok: true, ...out })
  } catch (e) { res.status(e.status || 500).json({ error: e.message, code: e.code, hint: e.hint }) }
})

// Bulk: build/refresh profiles for all conversations that are missing or stale (uses the server's own pool).
app.post('/api/ai/profiles/build', authRequired, async (req, res) => {
  if (!aiConfigured()) return res.status(400).json({ error: 'OpenAI not configured — set OPENAI_API_KEY' })
  const msgs = getAll('messages')
  const countFor = (cid) => msgs.filter((m) => m.conversation_id === cid && (m.dir === 'in' || m.dir === 'out')).length
  const todo = getAll('conversations').filter((c) => { const n = countFor(c.id); return n > 0 && (c.profile_msg_count || 0) < n })
  res.json({ ok: true, started: true, building: todo.length })   // respond immediately; build in background
  let done = 0, limit = 5, i = 0
  await Promise.all(Array.from({ length: limit }, async () => {
    while (i < todo.length) { const conv = todo[i++]; try { await buildProfileForConv(conv); done++; if (done % 25 === 0) console.log(`[profiles] ${done}/${todo.length}`) } catch { /* skip */ } }
  }))
  console.log(`[profiles] build complete: ${done}/${todo.length}`)
})

// ============================================================
// AFTER SESSION — end-of-day client data entry (AI recommend + validate + save to DB)
// ============================================================
const AS_NUM = new Set(['intent_score', 'purchase_probability', 'sentiment_score', 'complexity_score'])
const asNum = (v) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null }
const asTxt = (v) => (v == null || v === '' ? null : String(v).slice(0, 4000))

async function asTranscript(convLegacyId) {
  const r = await dbQuery(`SELECT m.direction dir, m.body txt FROM app.messages m JOIN app.conversations c ON m.conversation_id=c.conversation_id WHERE c.legacy_id=$1 AND m.body<>'' ORDER BY m.created_at`, [convLegacyId])
  return r.rows.map((m) => `${m.dir === 'in' ? 'Customer' : 'Agent'}: ${m.txt}`).join('\n').slice(0, 9000)
}

// 1) Clients active on a date (default today) — what the agent reviews end-of-session.
app.get('/api/after-session/clients', authRequired, async (req, res) => {
  try {
    const date = String(req.query.date || new Date().toISOString().slice(0, 10))
    const r = await dbQuery(
      `SELECT co.legacy_id id, COALESCE(NULLIF(co.extra->>'name',''), cu.full_name) name, co.channel,
        co.extra->'ai_profile'->>'products' need, co.extra->'ai_profile'->>'quantity' quantity,
        (co.extra ? 'after_session_saved') saved, co.last_message_at
       FROM app.conversations co LEFT JOIN app.customers cu ON cu.customer_id=co.customer_id
       WHERE co.extra<>'{}'::jsonb AND (co.last_message_at::date=$1 OR co.created_at::date=$1)
       ORDER BY co.last_message_at DESC NULLS LAST LIMIT 300`, [date])
    res.json({ date, clients: r.rows })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// 2) Current saved field values for one client (to prefill the form). Resilient: a single
// missing column/table won't fail the whole load — each section is fetched independently.
app.get('/api/after-session/client/:id', authRequired, async (req, res) => {
  const id = req.params.id
  const one = async (sql, params) => { try { return (await dbQuery(sql, params)).rows[0] || {} } catch (e) { console.warn('[after-session/client]', e.message); return {} } }
  const c = await one(`SELECT COALESCE(NULLIF(co.extra->>'name',''),cu.full_name) name, co.channel, co.sentiment_score, co.conversation_summary, co.conversation_insights,
      co.extra->'ai_profile'->>'products' need, co.extra->'ai_profile'->>'quantity' quantity
    FROM app.conversations co LEFT JOIN app.customers cu ON cu.customer_id=co.customer_id WHERE co.legacy_id=$1`, [id])
  const l = await one(`SELECT intent_score, purchase_probability, lead_summary, profile_summary, ai_observations FROM app.leads WHERE conversation_id=(SELECT conversation_id FROM app.conversations WHERE legacy_id=$1)`, [id])
  const rq = await one(`SELECT requirement_summary, missing_information FROM app.requirements WHERE legacy_id=$1`, ['req:' + id])
  const aw = await one(`SELECT artwork_analysis, reconstruction_notes, design_notes, complexity_score FROM app.artwork WHERE legacy_id=$1`, ['art:' + id])
  const sh = await one(`SELECT transition_reason FROM app.lead_stage_history WHERE lead_id=(SELECT lead_id FROM app.leads WHERE conversation_id=(SELECT conversation_id FROM app.conversations WHERE legacy_id=$1)) ORDER BY created_at DESC LIMIT 1`, [id])
  // AI summaries live in Qdrant now — Qdrant values win over any legacy Postgres copies.
  const qs = await getAfterSessionSummaries(id)
  const pick = (k, fb) => (qs[k] != null && qs[k] !== '' ? qs[k] : fb)
  res.json({ name: c.name || id, channel: c.channel || null, values: { need: c.need, quantity: c.quantity, ...l, sentiment_score: c.sentiment_score, conversation_summary: c.conversation_summary, conversation_insights: c.conversation_insights, ...rq, ...aw, ...sh,
    lead_summary: pick('lead_summary', l.lead_summary), profile_summary: pick('profile_summary', l.profile_summary), ai_observations: pick('ai_observations', l.ai_observations),
    conversation_summary: pick('conversation_summary', c.conversation_summary), conversation_insights: pick('conversation_insights', c.conversation_insights), requirement_summary: pick('requirement_summary', rq.requirement_summary) } })
})

const AS_FIELDS_DOC = `{
 "need": "what the customer wants (products)",
 "quantity": "quantities/sizes ('' if none)",
 "intent_score": 0, "purchase_probability": 0,
 "lead_summary": "2-3 sentences for the sales team",
 "profile_summary": "who the customer is",
 "ai_observations": "one key sales insight",
 "sentiment_score": 0,
 "conversation_summary": "what happened in the chat",
 "conversation_insights": "notable insight from the chat",
 "requirement_summary": "the concrete requirement",
 "missing_information": "info still needed to quote ('' if none)",
 "artwork_analysis": "artwork notes ('' if no artwork)",
 "reconstruction_notes": "if artwork must be recreated ('' if none)",
 "design_notes": "design instructions ('' if none)",
 "complexity_score": 0,
 "transition_reason": "why the lead moved stage / current status reason"
}`

// 3) AI recommends values for all fields from the chat.
app.post('/api/after-session/recommend/:id', authRequired, async (req, res) => {
  if (!aiConfigured()) return res.status(400).json({ error: 'OpenAI not configured' })
  try {
    const t = await asTranscript(req.params.id)
    if (!t) return res.json({ recommended: {} })
    const out = await chatJSON(`You are filling an end-of-session CRM record for Decoinks (custom apparel + DTF print shop). From the conversation, fill ALL these fields accurately. Scores (intent_score, purchase_probability, sentiment_score, complexity_score) are 0-100 integers. Respond ONLY JSON with exactly these keys:\n${AS_FIELDS_DOC}`, t)
    res.json({ recommended: out })
  } catch (e) { res.status(e.status || 500).json({ error: e.message }) }
})

// 4) AI validates the agent's filled values against the chat → per-field {ok, note}.
app.post('/api/after-session/validate/:id', authRequired, async (req, res) => {
  if (!aiConfigured()) return res.status(400).json({ error: 'OpenAI not configured' })
  try {
    const t = await asTranscript(req.params.id)
    const values = req.body?.values || {}
    const out = await chatJSON(`You validate an agent's end-of-session CRM entries against the actual conversation. For EACH field, decide if the agent's value is consistent with the chat. Respond ONLY JSON: an object where each key is the field name and the value is {"ok": boolean, "note": "short reason only if wrong, else ''"}. Be strict: if a value contradicts or is unsupported by the chat, ok=false.\nCONVERSATION:\n${t}`,
      `Agent's entered values:\n${JSON.stringify(values)}`)
    res.json({ verdicts: out })
  } catch (e) { res.status(e.status || 500).json({ error: e.message }) }
})

// Save the after-session AI summary texts to Qdrant ONLY (AI summaries live in Qdrant, not Postgres).
async function saveAfterSessionSummaries(convId, v) {
  const fields = {
    lead_summary: asTxt(v.lead_summary), profile_summary: asTxt(v.profile_summary),
    ai_observations: asTxt(v.ai_observations), conversation_summary: asTxt(v.conversation_summary),
    conversation_insights: asTxt(v.conversation_insights), requirement_summary: asTxt(v.requirement_summary),
  }
  if (!Object.values(fields).some(Boolean)) return
  const q = new QdrantClient()
  await ensureSummaryCollection(q)
  let vec
  try { [vec] = await embed(Object.values(fields).filter(Boolean).join('\n').slice(0, 8000)) }
  catch { vec = new Array(1536).fill(0) }
  await q.upsert(SUMMARY_COLLECTION, [{
    id: pointId(`aftersession:${convId}`),
    vector: vec,
    payload: { kind: 'after_session', conversation_id: String(convId), ...fields, saved_at: new Date().toISOString() },
  }])
}
// Read them back from Qdrant (null-safe).
async function getAfterSessionSummaries(convId) {
  if (!qdrantConfigured()) return {}
  try {
    const q = new QdrantClient()
    await ensureSummaryCollection(q)
    const [pt] = await q.retrieve(SUMMARY_COLLECTION, [pointId(`aftersession:${convId}`)])
    if (!pt?.payload) return {}
    const { lead_summary, profile_summary, ai_observations, conversation_summary, conversation_insights, requirement_summary } = pt.payload
    return { lead_summary, profile_summary, ai_observations, conversation_summary, conversation_insights, requirement_summary }
  } catch { return {} }
}

// 5) Save validated values into the proper structured tables.
// AI summary TEXTS go to Qdrant only; numeric scores + operational fields stay in Postgres.
app.post('/api/after-session/save/:id', authRequired, async (req, res) => {
  try {
    const id = req.params.id
    const v = req.body?.values || {}
    // AI summaries → Qdrant (single store for summaries)
    await saveAfterSessionSummaries(id, v)
    // leads (intelligence scores)
    await dbQuery(`UPDATE app.leads SET intent_score=$2, purchase_probability=$3, updated_at=now()
      WHERE conversation_id=(SELECT conversation_id FROM app.conversations WHERE legacy_id=$1)`,
      [id, asNum(v.intent_score), asNum(v.purchase_probability)])
    // conversation + mark saved
    await dbQuery(`UPDATE app.conversations SET sentiment_score=$2,
      extra = extra || jsonb_build_object('after_session_saved', now()::text) WHERE legacy_id=$1`,
      [id, asNum(v.sentiment_score)])
    // requirements (upsert by req:<conv>) — summary text lives in Qdrant
    await dbQuery(`INSERT INTO app.requirements (legacy_id, lead_id, missing_information, quantity, created_at)
      SELECT $1, (SELECT lead_id FROM app.leads WHERE conversation_id=(SELECT conversation_id FROM app.conversations WHERE legacy_id=$2)), $3, $4, now()
      ON CONFLICT (legacy_id) DO UPDATE SET missing_information=EXCLUDED.missing_information, quantity=EXCLUDED.quantity, updated_at=now()`,
      ['req:' + id, id, asTxt(v.missing_information), parseInt(v.quantity) || null])
    // artwork (upsert by art:<conv>)
    await dbQuery(`INSERT INTO app.artwork (legacy_id, artwork_analysis, reconstruction_notes, design_notes, complexity_score, created_at)
      VALUES ($1, $2, $3, $4, $5, now())
      ON CONFLICT (legacy_id) DO UPDATE SET artwork_analysis=EXCLUDED.artwork_analysis, reconstruction_notes=EXCLUDED.reconstruction_notes, design_notes=EXCLUDED.design_notes, complexity_score=EXCLUDED.complexity_score, updated_at=now()`,
      ['art:' + id, asTxt(v.artwork_analysis), asTxt(v.reconstruction_notes), asTxt(v.design_notes), asNum(v.complexity_score)])
    // lead_stage_history (append transition reason)
    if (asTxt(v.transition_reason)) {
      await dbQuery(`INSERT INTO app.lead_stage_history (lead_id, transition_reason, changed_by, created_at)
        SELECT (SELECT lead_id FROM app.leads WHERE conversation_id=(SELECT conversation_id FROM app.conversations WHERE legacy_id=$1)), $2, $3, now()`,
        [id, asTxt(v.transition_reason), agentName(req)])
    }
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Per-message intent/summary (2-4 words) for the History timeline. Cached on the conversation.
app.post('/api/ai/message-intents/:id', authRequired, async (req, res) => {
  if (!aiConfigured()) return res.status(400).json({ error: 'OpenAI not configured — set OPENAI_API_KEY' })
  const conv = findById('conversations', req.params.id)
  if (!conv) return res.status(404).json({ error: 'conversation not found' })
  const msgs = getAll('messages').filter((m) => m.conversation_id === req.params.id && (m.dir === 'in' || m.dir === 'out'))
  if (!msgs.length) return res.json({ intents: {} })
  const force = !!req.body?.force
  const labels = force ? {} : { ...(conv.message_intents || {}) }
  for (const m of msgs) {
    if (!force && labels[m.id]) continue
    if (!m.text || !m.text.trim() || m.text === '[attachment]') labels[m.id] = m.attachments?.length ? 'Shared media' : ''
  }
  const todo = msgs.filter((m) => m.text && m.text.trim() && m.text !== '[attachment]' && !labels[m.id])
  const sys = `For each customer-support chat message (custom apparel print shop), write a SHORT 5-8 word summary describing what that message is actually saying/asking (its intent + key detail) — NOT the first words of the message. Examples: "Customer asking how long delivery takes", "Agent sharing the Father's Day design", "Customer confirming order of 50 hoodies", "Customer sharing their shipping address", "Agent quoting price of $78". Respond with ONLY JSON: { "labels": [string] } — one label per message, in the SAME order.`
  try {
    const CH = 60
    for (let i = 0; i < todo.length; i += CH) {
      const chunk = todo.slice(i, i + CH)
      const out = await chatJSON(sys, chunk.map((m, j) => `${j + 1}. ${m.dir === 'in' ? 'Customer' : 'Agent'}: ${m.text}`).join('\n'))
      const arr = Array.isArray(out.labels) ? out.labels : []
      chunk.forEach((m, j) => { labels[m.id] = (arr[j] || '').trim() })
    }
    update('conversations', conv.id, { message_intents: labels })
    res.json({ ok: true, intents: labels })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, code: e.code, hint: e.hint })
  }
})

// ---- AI assistant chat history (per user, saved in DB) ----
const chatTitle = (msgs) => {
  const first = (msgs || []).find((m) => m.role === 'user')
  const t = (first?.content || 'New chat').trim().replace(/\s+/g, ' ')
  return t.length > 48 ? t.slice(0, 48) + '…' : t
}
app.get('/api/ai/chats', authRequired, (req, res) => {
  const list = getAll('ai_chats')
    .filter((c) => c.user_id === req.user.id)
    .map((c) => ({ id: c.id, title: c.title, updated_at: c.updated_at, count: (c.messages || []).length }))
    .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
  res.json(list)
})
app.get('/api/ai/chats/:id', authRequired, (req, res) => {
  const c = findById('ai_chats', req.params.id)
  if (!c || c.user_id !== req.user.id) return res.status(404).json({ error: 'chat not found' })
  res.json(c)
})
app.post('/api/ai/chats', authRequired, async (req, res) => {
  const msgs = Array.isArray(req.body?.messages) ? req.body.messages : []
  const now = new Date().toISOString()
  const c = insert('ai_chats', { user_id: req.user.id, title: chatTitle(msgs), messages: msgs, created_at: now, updated_at: now })
  res.status(201).json(c)
})
app.put('/api/ai/chats/:id', authRequired, async (req, res) => {
  const c = findById('ai_chats', req.params.id)
  if (!c || c.user_id !== req.user.id) return res.status(404).json({ error: 'chat not found' })
  const msgs = Array.isArray(req.body?.messages) ? req.body.messages : c.messages
  const updated = update('ai_chats', c.id, { messages: msgs, title: req.body?.title || chatTitle(msgs), updated_at: new Date().toISOString() })
  res.json(updated)
})
app.delete('/api/ai/chats/:id', authRequired, (req, res) => {
  const c = findById('ai_chats', req.params.id)
  if (!c || c.user_id !== req.user.id) return res.status(404).json({ error: 'chat not found' })
  remove('ai_chats', c.id)
  res.json({ ok: true })
})

// ============================================================
// App / Business settings (persisted in Postgres settings store)
// ============================================================
const DEFAULT_SETTINGS = {
  business: { name: 'Decoinks', email: '', phone: '', address: '', currency: 'USD', timezone: 'America/Los_Angeles' },
  notifications: { newMessage: true, newLead: true, paymentReceived: true, dailySummary: false },
}
const mergeSettings = (saved) => ({
  business: { ...DEFAULT_SETTINGS.business, ...(saved?.business || {}) },
  notifications: { ...DEFAULT_SETTINGS.notifications, ...(saved?.notifications || {}) },
})

app.get('/api/settings', authRequired, (req, res) => {
  res.json(mergeSettings(getSetting('app_settings')))
})

app.put('/api/settings', authRequired, async (req, res) => {
  const current = mergeSettings(getSetting('app_settings'))
  const next = {
    business: { ...current.business, ...(req.body?.business || {}) },
    notifications: { ...current.notifications, ...(req.body?.notifications || {}) },
  }
  setSetting('app_settings', next)
  await flush()
  res.json(next)
})

// ============================================================
// Quick actions (Responses tab panels) — editable in Settings, stored in DB.
// ============================================================
const DEFAULT_QUICK_ACTIONS = {
  communication: [
    { label: 'Send Website Address',      msg: '🌐 Our website: https://decoinks.com' },
    { label: 'Send Email Address',        msg: '📧 Email us: info@decoinks.com' },
    { label: 'Send Pinterest Account',    msg: '📌 Pinterest: https://pinterest.com/decoinks' },
    { label: 'Send WhatsApp Catalog',     msg: '🛍️ Our catalog: https://wa.me/c/decoinks' },
    { label: 'Send Google Maps Location', msg: '📍 Find us: https://maps.google.com/?q=Decoinks' },
    { label: 'Our Brochure (PDF)',        msg: '📄 Our brochure: https://decoinks.com/brochure.pdf' },
  ],
  payment: [
    { label: 'Zelle QR Code',          msg: '💳 Pay via Zelle: info@decoinks.com' },
    { label: 'Cash App QR Code',       msg: '💵 Cash App: $decoinks' },
    { label: 'PayPal QR Code',         msg: '🅿️ PayPal: https://paypal.me/decoinks' },
    { label: 'PayPal Invoice (Cards)', msg: '🧾 We will send a secure PayPal invoice link (cards accepted).' },
  ],
  document: [
    { label: 'Preview Quote',   msg: '🧾 Here is your quote.' },
    { label: 'Preview Invoice', msg: '🧾 Here is your invoice.' },
  ],
}
const cleanItems = (a) => (Array.isArray(a) ? a : []).map((x) => ({ label: String(x?.label || '').trim(), msg: String(x?.msg || '').trim() })).filter((x) => x.label)

// ---- Customer-sent (SOURCE) artworks — SRC-ART-YY-NNNN, stored in PostgreSQL ----
app.get('/api/artworks', authRequired, async (req, res) => {
  try {
    const rows = await listArtworks({
      lead_id: req.query.lead_id, customer_id: req.query.customer_id,
      conversation_id: req.query.conversation_id, folder: req.query.folder, limit: req.query.limit,
    })
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})
const MIME_BY_EXT = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  pdf: 'application/pdf', doc: 'application/msword', txt: 'text/plain',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  zip: 'application/zip', ai: 'application/postscript', eps: 'application/postscript', psd: 'image/vnd.adobe.photoshop',
}
function sendArtworkBytes(res, f) {
  const ext = String(f.file_type || 'jpg').toLowerCase()
  const mime = MIME_BY_EXT[ext] || (ext.length <= 4 ? `image/${ext}` : 'application/octet-stream')
  res.set('Content-Type', mime)
  res.set('Content-Disposition', `inline; filename="${f.artwork_no}.${ext}"`)
  res.set('Cache-Control', 'private, max-age=86400')
  res.send(f.image_data)
}

app.get('/api/artworks/:id/file', authImg, async (req, res) => {
  try {
    const f = await getArtworkFile(req.params.id)
    if (!f) return res.status(404).json({ error: 'not found' })
    if (!f.image_data) return res.status(410).json({ error: 'image bytes not stored (source URL had expired)' })
    sendArtworkBytes(res, f)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Chat fallback: jab Facebook ka CDN link expire ho jaye, chat isi se apni copy maangta hai.
// ?name= wahi attachment name hai jo message mein saved hai (jaise "image-1793950308252607").
app.get('/api/artwork-file', authImg, async (req, res) => {
  try {
    const name = String(req.query.name || '').trim()
    if (!name) return res.status(400).json({ error: 'name required' })
    const f = await getArtworkFileByName(name)
    if (!f) return res.status(404).json({ error: 'not stored' })
    sendArtworkBytes(res, f)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/quick-actions', authRequired, (req, res) => {
  res.json(getSetting('quick_actions') || DEFAULT_QUICK_ACTIONS)
})
app.put('/api/quick-actions', authRequired, async (req, res) => {
  const b = req.body || {}
  const next = {
    communication: cleanItems(b.communication),
    payment: cleanItems(b.payment),
    document: cleanItems(b.document),
  }
  setSetting('quick_actions', next)
  await flush()
  res.json(next)
})

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }))

app.use((req, res) => res.status(404).json({ error: 'Not found', path: req.path }))
app.use((err, req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: err.message })
})

app.listen(PORT, () => {
  console.log(`✅ Technocas CRM API running on http://localhost:${PORT}`)
  refreshDbSchema()            // give the AI assistant the full live DB schema
  startMetaPolling()
  startIntelligenceRefresh()
  startUploadWorker()          // NextCloud file upload (fast)
  startShareWorker()           // NextCloud share-links (slow, rate-limit-safe)
  startChatwootReconcile()     // Chatwoot: webhook ke gaps API se bharo (server-down safety)
})

// Auto-refresh AI profiles + lead intelligence for NEW/CHANGED chats (stale-aware scripts).
// Runs ~90s after boot, then every 20 min — so new customers/messages get scored automatically.
function startIntelligenceRefresh() {
  if (!aiConfigured()) return
  let refreshing = false
  const runScript = (file) => new Promise((resolve) => {
    const p = spawn(process.execPath, [file], { cwd: process.cwd(), stdio: 'ignore', env: process.env })
    p.on('close', () => resolve()); p.on('error', () => resolve())
  })
  const refresh = async () => {
    if (refreshing) return
    refreshing = true
    try { await runScript('build-profiles.js'); await runScript('build-intelligence.js'); console.log('🔄 AI profiles + intelligence refreshed') }
    catch { /* best effort */ } finally { refreshing = false }
  }
  setTimeout(refresh, 90_000)
  setInterval(refresh, 20 * 60_000)
}
