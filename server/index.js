import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { getAll, findById, insert, update, remove, getSetting, setSetting, deleteSetting, flush } from './db.js'
import { ManyChatClient } from './manychat.js'
import { MetaClient } from './meta.js'
import { QdrantClient, qdrantConfigured } from './qdrant.js'
import { aiConfigured, aiModels, embed, chatJSON, chatText } from './ai.js'
import { randomUUID, createHash } from 'node:crypto'

const PORT = process.env.PORT || 3001
const JWT_SECRET = process.env.JWT_SECRET || 'technocas-dev-secret-change-in-prod'

const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))

function authRequired(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Missing token' })
  try { req.user = jwt.verify(token, JWT_SECRET); next() }
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
// Messages nested under a conversation
// ============================================================
app.get('/api/conversations/:id/messages', authRequired, (req, res) => {
  const msgs = getAll('messages').filter(m => m.conversation_id === req.params.id)
  res.json(msgs)
})

app.post('/api/conversations/:id/messages', authRequired, (req, res) => {
  const { dir, text, time } = req.body || {}
  if (!dir || !text) return res.status(400).json({ error: 'dir and text required' })
  const msg = saveMessage({
    conversation_id: req.params.id,
    dir,
    text,
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
function meta() {
  const token = getSetting('meta_page_token')
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
    await resolveAndStorePageToken(userToken, getSetting('meta_page_id'))
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

// Connection status (never returns the raw token)
app.get('/api/meta/status', authRequired, (req, res) => {
  const token = getSetting('meta_page_token')
  res.json({
    connected: !!token,
    tokenMasked: token ? `••••${token.slice(-6)}` : null,
    pageId: getSetting('meta_page_id') || null,
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
      page = await resolveAndStorePageToken(longToken, pageId || getSetting('meta_page_id'))
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

  try {
    const result = await meta().sendText(recipientId, text)
    const mid = result?.message_id
    const msg = saveMessage({
      id: mid || undefined,            // use Meta's mid so the echo webhook upserts (no dupes)
      conversation_id: conv?.id || `${channel === 'Instagram' ? 'ig' : 'fb'}:${recipientId}`,
      dir: 'out',
      text,
      time: nowTime(),
      via: 'meta',
      agent: agentName(req),           // who (which CRM agent) sent this reply
    })
    if (conv) update('conversations', conv.id, { list_preview: text, list_time: nowTime(), last_ts: Date.now() })
    broadcast({ type: 'message', conversationId: msg.conversation_id, message: msg })
    res.json({ ok: true, message: msg, result })
  } catch (e) {
    res.status(e.status || 500).json({
      error: e.message, body: e.body,
      hint: (e.code === 10 || e.subcode === 2018278)
        ? 'Outside the 24-hour messaging window — the customer must message you first.'
        : undefined,
    })
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
  const token = getSetting('meta_page_token')
  if (!token || metaSyncRunning) return { skipped: true }
  metaSyncRunning = true
  const pageId = String(getSetting('meta_page_id') || '')
  const ig = getSetting('meta_ig') || {}
  const igId = String(ig.id || '')
  let client = new MetaClient(token)
  const platforms = [['messenger', 'Facebook', 'fb'], ['instagram', 'Instagram', 'ig']]
  let newMessages = 0

  // Fetch with one automatic token-refresh + retry on an expired/invalid token.
  const fetchConvos = async (platform) => {
    try { return await client.getConversations(platform) }
    catch (e) {
      if (e.code === 190 && await tryRefreshMetaToken()) {
        client = new MetaClient(getSetting('meta_page_token'))
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

        let conv = findById('conversations', convId)
        if (!conv) {
          conv = await upsertMetaConversation(channel, other.id, { name: other.name })
          broadcast({ type: 'conversation', conversation: conv })
        }
        ensureLeadForConversation(conv)  // auto lead-capture (idempotent)

        const msgs = (c.messages?.data || []).slice().reverse() // oldest → newest
        let lastText = conv.list_preview, lastTime = conv.list_time, added = false
        for (const m of msgs) {
          const exists = findById('messages', m.id)
          const fromId = String(m.from?.id || '')
          const dir = (fromId === pageId || fromId === igId) ? 'out' : 'in'
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
            lastText = stored.text || attachPreview(atts); lastTime = stored.time
            broadcast({ type: 'message', conversationId: convId, message: stored })
          }
        }
        // Track last-activity timestamp so the inbox can sort newest-first.
        const lastTs = c.updated_time ? Date.parse(c.updated_time) : (conv.last_ts || null)
        const patch = { last_ts: lastTs }
        if (added) { patch.list_preview = lastText; patch.list_time = lastTime }
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
      const patch = { list_preview: text || attachPreview(atts), list_time: nowTime(), last_ts: Date.now() }
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
  res.json({ configured: aiConfigured(), models: aiModels(), qdrant: qdrantConfigured() })
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

// Conversation summary — generated on demand, CACHED on the conversation doc, and
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

// GET → return the CACHED summary (does NOT call the model). Reports how many new messages exist.
app.get('/api/ai/summary/:id', authRequired, (req, res) => {
  const conv = findById('conversations', req.params.id)
  if (!conv) return res.status(404).json({ error: 'conversation not found' })
  const total = sortedConvMsgs(req.params.id).length
  if (!total) return res.json({ empty: true })
  const covered = conv.summary_count || 0
  res.json({
    ok: true,
    cached: !!conv.summary,
    summary: conv.summary || null,
    summaryAt: conv.summary_at || null,
    coveredCount: covered,
    totalCount: total,
    newCount: Math.max(0, total - covered),
    stale: !!conv.summary && total > covered,
  })
})

// POST → generate (first time, full) or update (incremental — only new messages) + SAVE to the conversation.
app.post('/api/ai/summary/:id', authRequired, async (req, res) => {
  if (!aiConfigured()) return res.status(400).json({ error: 'OpenAI not configured — set OPENAI_API_KEY' })
  const conv = findById('conversations', req.params.id)
  if (!conv) return res.status(404).json({ error: 'conversation not found' })
  const msgs = sortedConvMsgs(req.params.id)
  if (!msgs.length) return res.json({ empty: true })

  const covered = conv.summary_count || 0
  const hasCache = !!conv.summary
  try {
    let summary, mode
    if (hasCache && msgs.length <= covered) {
      summary = conv.summary; mode = 'unchanged'                 // nothing new
    } else if (hasCache && covered > 0) {
      const fresh = msgs.slice(covered).map(fmtMsg).join('\n')   // only the NEW messages
      summary = await chatJSON(SUMMARY_UPDATE, `EXISTING SUMMARY:\n${JSON.stringify(conv.summary)}\n\nNEW MESSAGES:\n${fresh}`)
      mode = 'incremental'
    } else {
      summary = await chatJSON(SUMMARY_FULL, msgs.map(fmtMsg).join('\n'))  // first time, full
      mode = 'full'
    }
    const summaryAt = new Date().toISOString()
    update('conversations', conv.id, { summary, summary_count: msgs.length, summary_at: summaryAt })
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

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }))

app.use((req, res) => res.status(404).json({ error: 'Not found', path: req.path }))
app.use((err, req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: err.message })
})

app.listen(PORT, () => {
  console.log(`✅ Technocas CRM API running on http://localhost:${PORT}`)
  startMetaPolling()
})
