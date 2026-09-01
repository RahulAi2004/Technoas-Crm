import { api, setToken, clearToken, getToken } from './api.js'

export const isAuthed = () => !!getToken()

export async function signIn(email, password, remember = true) {
  const { token, user } = await api.post('/api/auth/login', { email, password })
  setToken(token, remember)
  const target = remember ? localStorage : sessionStorage
  const other = remember ? sessionStorage : localStorage
  target.setItem('tcUser', JSON.stringify(user))
  other.removeItem('tcUser')
  return user
}

export async function signInWithSso() {
  const { token, user } = await api.post('/api/auth/sso')
  setToken(token, true)
  localStorage.setItem('tcUser', JSON.stringify(user))
  sessionStorage.removeItem('tcUser')
  return user
}

export function signOut() {
  // best-effort: record the logout on the server before clearing the token (fire-and-forget)
  try { api.post('/api/auth/logout').catch(() => {}) } catch { /* ignore */ }
  clearToken()
  localStorage.removeItem('tcUser')
  sessionStorage.removeItem('tcUser')
}

export function currentUser() {
  try {
    return JSON.parse(localStorage.getItem('tcUser') || sessionStorage.getItem('tcUser') || 'null')
  } catch {
    return null
  }
}

// ---- Permissions (app-level roles) ----
export const permissions = () => (currentUser()?.permissions || [])
// '*' = Admin (sab). Warna exact permission string chahiye (page:x · cap:x · validate:section)
export const can = (perm) => { const p = permissions(); return p.includes('*') || p.includes(perm) }
export const isAdmin = () => permissions().includes('*')

// Purane session (jisme permissions save nahi) ko refresh karo — app load par.
export async function refreshMe() {
  try {
    const me = await api.get('/api/auth/me')
    const store = sessionStorage.getItem('tcUser') != null ? sessionStorage : localStorage
    store.setItem('tcUser', JSON.stringify(me))
    return me
  } catch (e) {
    // User delete ho chuka ya token invalid -> "zombie" session clear karo (login pe redirect ho jayega)
    if (e?.status === 401 || e?.status === 404) signOut()
    return null
  }
}
