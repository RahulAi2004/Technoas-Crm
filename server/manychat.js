// Thin wrapper over the ManyChat public API.
// Docs: https://api.manychat.com (Bearer token = Bot API Key from Settings → API)

const BASE = 'https://api.manychat.com'

export class ManyChatClient {
  constructor(apiKey) {
    if (!apiKey) throw new Error('ManyChat API key required')
    this.apiKey = apiKey
  }

  async request(path, { method = 'GET', body, query } = {}) {
    const url = new URL(BASE + path)
    if (query) Object.entries(query).forEach(([k, v]) => v != null && url.searchParams.set(k, v))
    const res = await fetch(url.toString(), {
      method,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    let data = null
    try { data = text ? JSON.parse(text) : null } catch { data = text }
    if (!res.ok || data?.status === 'error') {
      // Surface the real reason ManyChat gave us, including details object
      const detail = data?.details
        ? Object.entries(data.details).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' | ')
        : (data?.message || `HTTP ${res.status}`)
      const err = new Error(detail)
      err.status = res.status
      err.body = data
      throw err
    }
    return data
  }

  // Page-level
  getPageInfo()          { return this.request('/fb/page/getInfo') }
  getCustomFields()      { return this.request('/fb/page/getCustomFields') }
  getTags()              { return this.request('/fb/page/getTags') }

  // Subscribers (FB Messenger / Instagram / WhatsApp via Meta)
  findBySystemField(name, value) {
    return this.request('/fb/subscriber/findBySystemField', { query: { field_name: name, field_value: value } })
  }
  getSubscriberById(id)  { return this.request('/fb/subscriber/getInfo', { query: { subscriber_id: id } }) }
  findByCustomField(field_id, field_value) {
    return this.request('/fb/subscriber/findByCustomField', { query: { field_id, field_value } })
  }

  // Send a text message to a subscriber via ManyChat.
  // ManyChat requires subscriber_id to be a NUMBER, not string.
  // message_tag is only used for Facebook Messenger outside 24h window — omit for WhatsApp/IG.
  sendText(subscriberId, text, { messageTag } = {}) {
    const body = {
      subscriber_id: Number(subscriberId),
      data: { version: 'v2', content: { messages: [{ type: 'text', text }] } },
    }
    if (messageTag) body.message_tag = messageTag
    return this.request('/fb/sending/sendContent', { method: 'POST', body })
  }

  // Send a Flow (named saved automation in ManyChat) to a subscriber
  sendFlow(subscriberId, flow_ns) {
    return this.request('/fb/sending/sendFlow', { method: 'POST', body: { subscriber_id: subscriberId, flow_ns } })
  }
}
