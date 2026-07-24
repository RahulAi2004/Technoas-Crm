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
