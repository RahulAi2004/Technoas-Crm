// AI helper: embeddings (for Qdrant) + chat (for AI Supervisor & assistant).
// Uses the REST APIs directly (no SDK). OpenAI + Anthropic (Claude).
const KEY = process.env.OPENAI_API_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const GROQ_KEY = process.env.GROQ_API_KEY               // Groq (OpenAI-compatible, fast + cheap)
const CHAT_MODEL  = process.env.OPENAI_CHAT_MODEL  || 'gpt-4o-mini'
const EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small'

export const aiConfigured = () => !!KEY                  // OpenAI (chat + embeddings)
export const anthropicConfigured = () => !!ANTHROPIC_KEY // Claude
export const groqConfigured = () => !!GROQ_KEY           // Groq
export const aiModels = () => ({ chat: CHAT_MODEL, embed: EMBED_MODEL })

// ---- AI usage / cost tracking ------------------------------------------------
// $ per 1M tokens: [input, output]. Prefix-matched, so 'gpt-5.5-xyz' → 'gpt-5'.
const PRICE = {
  'gpt-4o-mini': [0.15, 0.60], 'gpt-4o': [2.50, 10.00],
  'gpt-5.5': [5.00, 25.00], 'gpt-5': [5.00, 25.00],
  'text-embedding-3-small': [0.02, 0], 'text-embedding-3-large': [0.13, 0],
  // Groq (approx public rates — verify at groq.com/pricing)
  'openai/gpt-oss-120b': [0.15, 0.75], 'openai/gpt-oss-20b': [0.10, 0.50],
  'qwen/qwen3.8-27b': [0.29, 0.59], 'qwen/qwen3.6-27b': [0.29, 0.59], 'groq/compound': [0.15, 0.75],
  'llama-3.3-70b-versatile': [0.59, 0.79], 'llama-3.1-8b-instant': [0.05, 0.08], 'llama': [0.59, 0.79],
}
const priceOf = (m) => PRICE[m] || PRICE[Object.keys(PRICE).find((k) => String(m || '').startsWith(k))] || [0, 0]
// Live, in-memory usage since server start (resets on restart). Exposed via /api/ai/usage.
const _usage = { since: new Date().toISOString(), calls: 0, total: 0, byTag: {}, byModel: {} }
export const getUsageStats = () => _usage
function trackUsage(tag, model, u) {
  if (!u) return
  const [pin, pout] = priceOf(model)
  const it = u.prompt_tokens ?? u.input_tokens ?? 0
  const ot = u.completion_tokens ?? u.output_tokens ?? 0
  const cost = it / 1e6 * pin + ot / 1e6 * pout
  _usage.calls++; _usage.total += cost
  _usage.byTag[tag] = (_usage.byTag[tag] || 0) + cost
  _usage.byModel[model] = (_usage.byModel[model] || 0) + cost
  try { console.log(`[ai$] tag=${tag} model=${model} in=${it} out=${ot} $${cost.toFixed(4)} running=$${_usage.total.toFixed(3)}`) } catch {}
}

// Models offered in the AI Assistant's model picker. Edit this list to add/remove models.
// provider is inferred from the id ('claude-*' → anthropic, else → openai).
export const CHAT_MODELS = [
  { id: 'gpt-4o-mini',      label: 'GPT-4o mini',       provider: 'openai' },
  { id: 'gpt-4o',           label: 'GPT-4o',            provider: 'openai' },
  { id: 'gpt-5.5',          label: 'GPT-5.5',           provider: 'openai' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'anthropic' },
  { id: 'claude-opus-4-8',   label: 'Claude Opus 4.8',   provider: 'anthropic' },
  { id: 'groq/openai/gpt-oss-120b', label: 'Groq GPT-OSS 120B', provider: 'groq' },
  { id: 'groq/openai/gpt-oss-20b',  label: 'Groq GPT-OSS 20B (faster)', provider: 'groq' },
  { id: 'groq/qwen/qwen3.8-27b',    label: 'Groq Qwen3 27B', provider: 'groq' },
]
export const providerOf = (model) => {
  const m = String(model || '')
  if (m.startsWith('claude')) return 'anthropic'
  if (m.startsWith('groq/')) return 'groq'
  return 'openai'
}
const stripGroq = (m) => String(m).replace(/^groq\//, '')

// The model list with a `ready` flag (is the provider's API key configured?).
export const chatModels = () => CHAT_MODELS.map((m) => ({
  ...m,
  ready: m.provider === 'anthropic' ? anthropicConfigured() : m.provider === 'groq' ? groqConfigured() : aiConfigured(),
}))

async function openai(path, body, tag = 'other') {
  if (!KEY) { const e = new Error('OPENAI_API_KEY not set'); e.status = 400; throw e }
  const res = await fetch('https://api.openai.com/v1' + path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || data?.error) {
    const err = new Error(data?.error?.message || `OpenAI HTTP ${res.status}`)
    err.status = res.status
    err.code = data?.error?.code
    err.hint = (err.code === 'insufficient_quota' || res.status === 429)
      ? 'Add credits to your OpenAI account (platform.openai.com → Billing).'
      : undefined
    throw err
  }
  trackUsage(tag, data?.model || body?.model, data?.usage)
  return data
}

// Anthropic (Claude) Messages API helper. Reads ANTHROPIC_API_KEY from env.
async function anthropic(path, body) {
  if (!ANTHROPIC_KEY) { const e = new Error('Claude is not configured — set ANTHROPIC_API_KEY to use Claude models'); e.status = 400; throw e }
  const res = await fetch('https://api.anthropic.com/v1' + path, {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || data?.error) {
    const err = new Error(data?.error?.message || `Anthropic HTTP ${res.status}`)
    err.status = res.status
    err.code = data?.error?.type
    throw err
  }
  return data
}

// Groq — OpenAI-compatible chat completions (fast + cheap). Model passed with 'groq/' prefix.
async function groq(path, body, tag = 'other') {
  if (!GROQ_KEY) { const e = new Error('GROQ_API_KEY not set'); e.status = 400; throw e }
  const res = await fetch('https://api.groq.com/openai/v1' + path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || data?.error) {
    const err = new Error(data?.error?.message || `Groq HTTP ${res.status}`)
    err.status = res.status; err.code = data?.error?.code
    err.hint = res.status === 429 ? 'Groq rate limit / out of credits — check console.groq.com.' : undefined
    throw err
  }
  trackUsage(tag, data?.model || stripGroq(body?.model), data?.usage)
  return data
}

// Convert OpenAI-style messages ([{role, content}], content = string | [{type,...}])
// into Anthropic's shape: a top-level `system` string + user/assistant messages with
// content blocks. Handles vision images passed as data: URLs.
function toAnthropic(messages) {
  const system = messages.filter((m) => m.role === 'system' && typeof m.content === 'string').map((m) => m.content).join('\n\n')
  const conv = []
  for (const m of messages) {
    if (m.role === 'system') continue
    const role = m.role === 'assistant' ? 'assistant' : 'user'
    let content
    if (Array.isArray(m.content)) {
      content = m.content.map((part) => {
        if (part?.type === 'image_url') {
          const url = part.image_url?.url || ''
          const mm = /^data:([^;]+);base64,(.*)$/s.exec(url)
          if (mm) return { type: 'image', source: { type: 'base64', media_type: mm[1], data: mm[2] } }
          return { type: 'image', source: { type: 'url', url } }
        }
        return { type: 'text', text: String(part?.text ?? '') }
      })
    } else content = String(m.content ?? '')
    conv.push({ role, content })
  }
  while (conv.length && conv[0].role === 'assistant') conv.shift() // Anthropic requires the first message to be 'user'
  return { system, messages: conv }
}

// Multi-turn chat via Claude. Note: no temperature (sampling params are rejected on Opus 4.8 / 4.7).
async function anthropicChat(messages, { model }) {
  const { system, messages: msgs } = toAnthropic(messages)
  const d = await anthropic('/messages', { model, max_tokens: 4096, ...(system ? { system } : {}), messages: msgs })
  return (d.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim()
}

// input: string | string[] → returns array of vectors (number[][])
export async function embed(input, { tag = 'embed' } = {}) {
  const d = await openai('/embeddings', { model: EMBED_MODEL, input }, tag)
  return d.data.map((x) => x.embedding)
}

const stripFences = (t) => String(t || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
// GPT-5 family rejects custom temperature (only default=1) and uses max_completion_tokens.
const isGpt5 = (m) => /^gpt-5/i.test(String(m || ''))

// Returns parsed JSON object from the model (forced JSON mode). Routes OpenAI/Anthropic by model.
export async function chatJSON(system, user, { model = CHAT_MODEL, temperature = 0.3, tag = 'chatJSON' } = {}) {
  if (providerOf(model) === 'anthropic') {
    const txt = await anthropicChat(
      [{ role: 'system', content: system + '\n\nReply with ONLY a valid JSON object — no markdown, no code fences, no extra text.' }, { role: 'user', content: user }],
      { model })
    return JSON.parse(stripFences(txt) || '{}')
  }
  if (providerOf(model) === 'groq') {
    const d = await groq('/chat/completions', {
      model: stripGroq(model),
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      response_format: { type: 'json_object' }, temperature,
    }, tag)
    return JSON.parse(d.choices?.[0]?.message?.content || '{}')
  }
  const d = await openai('/chat/completions', {
    model,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    response_format: { type: 'json_object' },
    ...(isGpt5(model) ? {} : { temperature }),
  }, tag)
  const txt = d.choices?.[0]?.message?.content || '{}'
  return JSON.parse(txt)
}

// Full multi-turn chat (pass an array of {role, content}) — for the AI assistant.
// Routes to OpenAI or Anthropic based on the model id.
export async function chatMessages(messages, { model = CHAT_MODEL, temperature = 0.4, tag = 'assistant' } = {}) {
  if (providerOf(model) === 'anthropic') return anthropicChat(messages, { model })
  if (providerOf(model) === 'groq') {
    const d = await groq('/chat/completions', { model: stripGroq(model), messages, temperature }, tag)
    return d.choices?.[0]?.message?.content?.trim() || ''
  }
  const d = await openai('/chat/completions', { model, messages, ...(isGpt5(model) ? {} : { temperature }) }, tag)
  return d.choices?.[0]?.message?.content?.trim() || ''
}

// Plain text completion (e.g. translations, freeform replies).
export async function chatText(system, user, { model = CHAT_MODEL, temperature = 0.4, tag = 'chatText' } = {}) {
  if (providerOf(model) === 'groq') {
    const d = await groq('/chat/completions', { model: stripGroq(model), messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature }, tag)
    return d.choices?.[0]?.message?.content?.trim() || ''
  }
  const d = await openai('/chat/completions', {
    model,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    ...(isGpt5(model) ? {} : { temperature }),
  }, tag)
  return d.choices?.[0]?.message?.content?.trim() || ''
}
