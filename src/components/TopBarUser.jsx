import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signOut, currentUser } from '../lib/auth.js'

export const ROLE_LABEL = { admin: 'Admin', manager: 'Account Manager', agent: 'Agent' }
export const initialsOf = (name) => (name || 'U').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()

export default function TopBarUser() {
  const navigate = useNavigate()
  const [user, setUser] = useState(currentUser() || {})
  useEffect(() => {
    const refresh = () => setUser(currentUser() || {})
    window.addEventListener('tc:user', refresh)   // fired after a profile save
    window.addEventListener('focus', refresh)
    return () => { window.removeEventListener('tc:user', refresh); window.removeEventListener('focus', refresh) }
  }, [])

  const name = user.name || 'User'
  const role = ROLE_LABEL[user.role] || user.role || ''

  return (
    <div className="flex items-center gap-3 border-l border-slate-200 pl-4">
      <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-600 text-xs font-bold text-white">{initialsOf(name)}</span>
      <div className="text-xs leading-tight">
        <div className="font-semibold">{name}</div>
        <div className="text-slate-500">{role}</div>
      </div>
      <button
        onClick={() => { signOut(); navigate('/', { replace: true }) }}
        className="ml-2 grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600"
        aria-label="Log out" title="Log out"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
      </button>
    </div>
  )
}
