// CRM ↔ Decoinks Task Management connector.
// Logs in to the Task Management API as the admin service account, caches the
// 12h JWT, and exposes small helpers so the rest of the CRM can create/read tasks.
// Config via env: TASKMGMT_URL, TASKMGMT_EMAIL, TASKMGMT_PASSWORD.
// (No flows are wired yet — this is just the connection layer.)

const TM_URL = (process.env.TASKMGMT_URL || 'http://31.97.110.197:4100').replace(/\/+$/, '')
const TM_EMAIL = process.env.TASKMGMT_EMAIL || 'info@technocas.com'
const TM_PASSWORD = process.env.TASKMGMT_PASSWORD || ''

export const tmBaseUrl = TM_URL
export function tmConfigured() { return !!(TM_URL && TM_EMAIL && TM_PASSWORD) }

let _token = null
let _exp = 0   // ms epoch when we should refresh the cached token

async function login() {
  const r = await fetch(`${TM_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TM_EMAIL, password: TM_PASSWORD }),
    signal: AbortSignal.timeout(10000),
  })
  if (!r.ok) {
    const t = await r.text().catch(() => '')
    const e = new Error(`Task Management login failed (${r.status})`); e.status = r.status; e.detail = t.slice(0, 160)
    throw e
  }
  const j = await r.json()
  _token = j.token
  _exp = Date.now() + 11 * 60 * 60 * 1000   // token lives 12h; refresh at 11h
  return _token
}

async function token() {
  if (_token && Date.now() < _exp) return _token
  return login()
}

// Authenticated call to the Task Management API. Re-logins once on a 401.
export async function tm(pathname, { method = 'GET', body, retry = true } = {}) {
  if (!tmConfigured()) { const e = new Error('Task Management not configured (set TASKMGMT_PASSWORD)'); e.status = 503; throw e }
  const t = await token()
  const r = await fetch(`${TM_URL}/api${pathname}`, {
    method,
    headers: { Authorization: `Bearer ${t}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  })
  if (r.status === 401 && retry) { _token = null; return tm(pathname, { method, body, retry: false }) }
  const txt = await r.text()
  let data; try { data = txt ? JSON.parse(txt) : null } catch { data = txt }
  if (!r.ok) { const e = new Error(`Task Management ${method} ${pathname} → ${r.status}`); e.status = r.status; e.data = data; throw e }
  return data
}

// ── Convenience helpers (unauthenticated health + authenticated reads/writes) ──
export async function tmHealth() {
  const r = await fetch(`${TM_URL}/api/health`, { signal: AbortSignal.timeout(8000) })
  if (!r.ok) throw new Error(`Task Management health ${r.status}`)
  return r.json()
}
export const tmStats = () => tm('/tasks/stats')
export const tmListTasks = (params = {}) => { const q = new URLSearchParams(params).toString(); return tm(`/tasks${q ? '?' + q : ''}`) }
export const tmCreateTask = (task) => tm('/tasks', { method: 'POST', body: task })
export const tmUsers = () => tm('/users')
export const tmTask = (id) => tm(`/tasks/${id}`)
// State-machine transition — event: 'start' | 'submit' | 'approve' | 'accept' | 'reject' | 'hold' ...
export const tmTransition = (id, body) => tm(`/tasks/${id}/transition`, { method: 'POST', body })
export const tmComment = (id, body) => tm(`/tasks/${id}/comments`, { method: 'POST', body })
export const tmRemind = (id) => tm(`/tasks/${id}/remind`, { method: 'POST', body: {} })
export const tmNotifications = () => tm('/notifications')
