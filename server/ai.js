// OpenAI helper: embeddings (for Qdrant) + chat (for AI Supervisor analysis).
// Uses the REST API directly (no SDK). Reads OPENAI_API_KEY from env.
const KEY = process.env.OPENAI_API_KEY
const CHAT_MODEL  = process.env.OPENAI_CHAT_MODEL  || 'gpt-4o-mini'
const EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small'

export const aiConfigured = () => !!KEY
export const aiModels = () => ({ chat: CHAT_MODEL, embed: EMBED_MODEL })

async function openai(path, body) {
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
  return data
}

// input: string | string[] → returns array of vectors (number[][])
export async function embed(input) {
  const d = await openai('/embeddings', { model: EMBED_MODEL, input })
  return d.data.map((x) => x.embedding)
}

// Returns parsed JSON object from the model (forced JSON mode).
export async function chatJSON(system, user, { model = CHAT_MODEL, temperature = 0.3 } = {}) {
  const d = await openai('/chat/completions', {
    model,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    response_format: { type: 'json_object' },
    temperature,
  })
  const txt = d.choices?.[0]?.message?.content || '{}'
  return JSON.parse(txt)
}

// Plain text completion (e.g. translations, freeform replies).
export async function chatText(system, user, { model = CHAT_MODEL, temperature = 0.4 } = {}) {
  const d = await openai('/chat/completions', {
    model,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    temperature,
  })
  return d.choices?.[0]?.message?.content?.trim() || ''
}
