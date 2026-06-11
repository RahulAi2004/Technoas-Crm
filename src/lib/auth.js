import { api, setToken, clearToken, getToken } from './api.js'

export const isAuthed = () => !!getToken()

export async function signIn(email, password) {
  const { token, user } = await api.post('/api/auth/login', { email, password })
  setToken(token)
  sessionStorage.setItem('tcUser', JSON.stringify(user))
  return user
}

export function signOut() {
  clearToken()
  sessionStorage.removeItem('tcUser')
}

export function currentUser() {
  try { return JSON.parse(sessionStorage.getItem('tcUser') || 'null') } catch { return null }
}
