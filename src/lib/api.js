// Tiny fetch wrapper that includes the JWT and parses JSON.
const TOKEN_KEY = 'tcToken'

export const getToken = () => sessionStorage.getItem(TOKEN_KEY)
export const setToken = (t) => sessionStorage.setItem(TOKEN_KEY, t)
export const clearToken = () => sessionStorage.removeItem(TOKEN_KEY)

async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const token = getToken()
  const res = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) {
    // Build a message that includes ManyChat's nested detail object if present
    let msg = data?.error || res.statusText
    if (data?.body?.details) {
      const det = Object.entries(data.body.details).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' | ')
      if (det) msg = det
    } else if (data?.body?.message && data.body.message !== data?.error) {
      msg = `${msg} — ${data.body.message}`
    }
    if (data?.hint) msg = `${msg} (${data.hint})`
    throw Object.assign(new Error(msg), { status: res.status, data })
  }
  return data
}

export const api = {
  get:   (p)       => request(p),
  post:  (p, body) => request(p, { method: 'POST',  body }),
  put:   (p, body) => request(p, { method: 'PUT',   body }),
  patch: (p, body) => request(p, { method: 'PATCH', body }),
  del:   (p)       => request(p, { method: 'DELETE' }),
}
