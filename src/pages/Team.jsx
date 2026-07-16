import { useEffect, useMemo, useState } from 'react'
import SidebarCrm from '../components/SidebarCrm.jsx'
import TopBarUser from '../components/TopBarUser.jsx'
import BackButton from '../components/BackButton.jsx'
import { useToast } from '../components/ToastContext.jsx'
import { api } from '../lib/api.js'
import { currentUser } from '../lib/auth.js'

const ROLES = [['admin', 'Admin'], ['manager', 'Account Manager'], ['agent', 'Agent']]
const ROLE_LABEL = Object.fromEntries(ROLES)
const ROLE_CLS = { admin: 'bg-indigo-50 text-indigo-700', manager: 'bg-sky-50 text-sky-700', agent: 'bg-slate-100 text-slate-600' }
const initials = (n) => (n || 'U').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()

export default function Team() {
  const toast = useToast()
  const meId = currentUser()?.id
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'agent' })
  const [busy, setBusy] = useState(false)

  const load = () => api.get('/api/users').then(setUsers).catch(() => {}).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  const counts = useMemo(() => ({
    total: users.length,
    admin: users.filter((u) => u.role === 'admin').length,
    manager: users.filter((u) => u.role === 'manager').length,
    agent: users.filter((u) => u.role === 'agent').length,
  }), [users])

  const addMember = async (e) => {
    e.preventDefault()
    if (!form.name.trim() || !form.email.trim() || !form.password) { toast('Name, email aur password zaroori hain', 'error'); return }
    setBusy(true)
    try {
      await api.post('/api/users', form)
      toast(`${form.name} added`, 'success')
      setForm({ name: '', email: '', password: '', role: 'agent' }); setShowAdd(false)
      load()
    } catch (ex) { toast(ex.message || 'Failed to add', 'error') }
    finally { setBusy(false) }
  }

  const changeRole = async (u, role) => {
    setUsers((xs) => xs.map((x) => x.id === u.id ? { ...x, role } : x))
    try { await api.patch(`/api/users/${u.id}`, { role }); toast(`${u.name} → ${ROLE_LABEL[role]}`, 'success') }
    catch (ex) { toast(ex.message || 'Update failed', 'error'); load() }
  }

  const removeMember = async (u) => {
    if (!confirm(`Remove ${u.name}? Ye undo nahi hoga.`)) return
    try { await api.del(`/api/users/${u.id}`); toast(`${u.name} removed`, 'info'); load() }
    catch (ex) { toast(ex.message || 'Remove failed', 'error') }
  }

  const field = 'w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:bg-white'

  return (
    <div className="crm-shell h-screen overflow-hidden grid">
      <SidebarCrm active="team" />
      <div className="flex h-screen flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 sm:px-6">
          <div className="flex min-w-0 shrink items-center gap-3 text-slate-700">
            <BackButton />
            <span className="hidden h-9 w-9 place-items-center rounded-lg bg-indigo-50 text-indigo-600 sm:grid">👥</span>
            <div><h1 className="truncate text-lg font-bold leading-tight">Team</h1><p className="hidden truncate text-[11px] text-slate-500 sm:block">Manage agents &amp; their access.</p></div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowAdd((s) => !s)} className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700">+ Add Member</button>
            <TopBarUser />
          </div>
        </header>

        <main className="nice-scroll flex-1 overflow-y-auto px-6 py-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs text-slate-500">Total Members</div><div className="mt-1 text-2xl font-extrabold">{counts.total}</div></div>
            <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs text-slate-500">Admins</div><div className="mt-1 text-2xl font-extrabold">{counts.admin}</div></div>
            <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs text-slate-500">Managers</div><div className="mt-1 text-2xl font-extrabold">{counts.manager}</div></div>
            <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs text-slate-500">Agents</div><div className="mt-1 text-2xl font-extrabold">{counts.agent}</div></div>
          </div>

          {showAdd && (
            <form onSubmit={addMember} className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="mb-3 text-sm font-bold">Add Team Member</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" className={field} />
                <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" className={field} />
                <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Password (min 6)" className={field} />
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={field}>
                  {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="mt-3 flex gap-2">
                <button type="submit" disabled={busy} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">{busy ? 'Adding…' : 'Add Member'}</button>
                <button type="button" onClick={() => setShowAdd(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Cancel</button>
              </div>
            </form>
          )}

          <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>
                <th className="px-3 py-3 text-left">Member</th><th className="px-3 py-3 text-left">Email</th><th className="px-3 py-3 text-left">Role</th><th className="px-3 py-3 text-left">Joined</th><th className="px-3 py-3 text-right">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {users.length === 0 && <tr><td colSpan="5" className="px-3 py-10 text-center text-sm text-slate-400">{loading ? 'Loading…' : 'No members yet'}</td></tr>}
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-600 text-xs font-bold text-white">{initials(u.name)}</span>
                        <span className="font-semibold">{u.name}{String(u.id) === String(meId) && <span className="ml-1 text-[10px] font-normal text-slate-400">(you)</span>}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{u.email}</td>
                    <td className="px-3 py-3">
                      <select value={u.role} onChange={(e) => changeRole(u, e.target.value)} className={`rounded-md px-2 py-1 text-xs font-semibold ${ROLE_CLS[u.role] || 'bg-slate-100'}`}>
                        {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-3 text-slate-500">{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                    <td className="px-3 py-3 text-right">
                      <button onClick={() => removeMember(u)} disabled={String(u.id) === String(meId)} title={String(u.id) === String(meId) ? "Can't remove yourself" : 'Remove'}
                        className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40">Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  )
}
