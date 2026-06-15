// Thin wrapper over the Meta Graph API (Messenger Platform + Instagram messaging).
// Uses a Page Access Token. Same /me/messages endpoint serves both Facebook
// Messenger (recipient = PSID) and Instagram DMs (recipient = IGSID), as long as
// the IG account is linked to the Page and the token has the right permissions.
// Docs: https://developers.facebook.com/docs/messenger-platform

const GRAPH = 'https://graph.facebook.com/v21.0'

export class MetaClient {
  constructor(pageToken) {
    if (!pageToken) throw new Error('Meta Page Access Token required')
    this.token = pageToken
  }

  // Exchange a short-lived token for a long-lived one (valid ~60 days).
  // Page tokens derived from a long-lived USER token never expire.
  static async exchangeForLongLived(appId, appSecret, shortToken) {
    const url = new URL(GRAPH + '/oauth/access_token')
    url.searchParams.set('grant_type', 'fb_exchange_token')
    url.searchParams.set('client_id', appId)
    url.searchParams.set('client_secret', appSecret)
    url.searchParams.set('fb_exchange_token', shortToken)
    const res = await fetch(url.toString())
    const data = await res.json().catch(() => null)
    if (!res.ok || data?.error) {
      const err = new Error(data?.error?.message || `Exchange failed (HTTP ${res.status})`)
      err.status = res.status; err.body = data; err.code = data?.error?.code
      throw err
    }
    return data // { access_token, token_type, expires_in }
  }

  // Inspect a token: validity + expiry. expires_at === 0 means it never expires.
  static async debugToken(appId, appSecret, inputToken) {
    const url = new URL(GRAPH + '/debug_token')
    url.searchParams.set('input_token', inputToken)
    url.searchParams.set('access_token', `${appId}|${appSecret}`)
    const res = await fetch(url.toString())
    const data = await res.json().catch(() => null)
    if (!res.ok || data?.error) {
      const err = new Error(data?.error?.message || `debug_token failed (HTTP ${res.status})`)
      err.body = data; throw err
    }
    return data?.data || {}
  }

  // List the Pages this (user) token manages, with their permanent Page tokens.
  // The instagram_business_account field needs the instagram_basic permission; if
  // the token lacks it, Graph throws "(#100) nonexisting field" — so we retry
  // without IG and connect the Page anyway (Messenger works; IG stays unlinked).
  async getAccounts() {
    try {
      return await this.request('/me/accounts', {
        query: { fields: 'id,name,access_token,instagram_business_account{id,username,name}' },
      })
    } catch (e) {
      if (e.code === 100 || /instagram_business_account/i.test(e.message || '')) {
        return this.request('/me/accounts', { query: { fields: 'id,name,access_token' } })
      }
      throw e
    }
  }

  async request(path, { method = 'GET', query, body } = {}) {
    const url = new URL(GRAPH + path)
    if (query) Object.entries(query).forEach(([k, v]) => v != null && url.searchParams.set(k, v))
    url.searchParams.set('access_token', this.token)

    const res = await fetch(url.toString(), {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    let data = null
    try { data = text ? JSON.parse(text) : null } catch { data = text }

    if (!res.ok || data?.error) {
      const e = data?.error
      const err = new Error(e?.message || `Graph HTTP ${res.status}`)
      err.status = res.status
      err.body = data
      // Meta gives a numeric code/subcode that explains *why* (e.g. 24h window)
      err.code = e?.code
      err.subcode = e?.error_subcode
      throw err
    }
    return data
  }

  // Page + linked Instagram account info. Used to verify the token on connect.
  // IG field needs instagram_basic; retry without it so a Page token still verifies.
  async getPageInfo() {
    try {
      return await this.request('/me', {
        query: { fields: 'id,name,instagram_business_account{id,username,name,profile_picture_url}' },
      })
    } catch (e) {
      if (e.code === 100 || /instagram_business_account/i.test(e.message || '')) {
        return this.request('/me', { query: { fields: 'id,name' } })
      }
      throw e
    }
  }

  // Pull conversations (with recent messages embedded) for a platform.
  // platform: 'messenger' (Facebook) | 'instagram'
  getConversations(platform) {
    return this.request('/me/conversations', {
      query: {
        platform,
        fields: 'id,updated_time,participants,messages.limit(25){id,message,from,created_time}',
        limit: 50,
      },
    })
  }

  // Public profile of a Messenger user (PSID). Requires the conversation to exist.
  getMessengerProfile(psid) {
    return this.request(`/${psid}`, { query: { fields: 'first_name,last_name,profile_pic' } })
  }

  // Public profile of an Instagram user (IGSID).
  getInstagramProfile(igsid) {
    return this.request(`/${igsid}`, { query: { fields: 'name,username,profile_pic' } })
  }

  // Send a text message. Works for both Messenger (PSID) and Instagram (IGSID).
  // messaging_type RESPONSE is valid within the standard 24h messaging window.
  sendText(recipientId, text) {
    return this.request('/me/messages', {
      method: 'POST',
      body: {
        recipient: { id: String(recipientId) },
        messaging_type: 'RESPONSE',
        message: { text },
      },
    })
  }
}
