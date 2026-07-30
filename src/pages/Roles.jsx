import { useEffect, useMemo, useState } from 'react'
import SidebarCrm from '../components/SidebarCrm.jsx'
import TopBarUser from '../components/TopBarUser.jsx'
import BackButton from '../components/BackButton.jsx'
import { useToast } from '../components/ToastContext.jsx'
import { api } from '../lib/api.js'
import { can } from '../lib/auth.js'

const PAGE_LABEL = {
  leads: 'Leads', inbox: 'Inbox', orders: 'Orders', receipts: 'Receipts', reports: 'Reports',
  campaigns: 'Campaigns', 'follow-ups': 'Follow-Ups', 'artwork-vault': 'Artwork Vault',
  'ai-assistant': 'AI Prompting', 'after-session': 'After Session', team: 'Team',
  settings: 'Settings', 'connect-meta': 'Connect Meta', integrations: 'Integrations', roles: 'Roles & Access',
}
const CAP_LABEL = {
  manage_users: 'Manage Users', manage_roles: 'Manage Roles & Permissions',
  delete_leads: 'Delete Leads', send_messages: 'Send Messages',
}
const SECTION_LABEL = {
  lead: 'Lead', customer: 'Customer', product: 'Product & Artwork', shipping: 'Delivery',
  quote: 'Quote', invoice: 'Invoice', order: 'Sales Order',
}

export default function Roles() {
  const toast = useToast()
  const allowed = can('cap:manage_roles')

  const [roles, setRoles] = useState([])
  const [catalog, setCatalog] = useState({ pages: [], caps: [], validate: [] })
  const [selId, setSelId] = useState(null)
  const [name, setName] = useState('')
  const [perms, setPerms] = useState(new Set())
  const [dirty, setDirty] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)

  const load = () => {
    Promise.all([api.get('/api/roles'), api.get('/api/permissions/catalog')])
      .then(([r, c]) => { setRoles(r); setCatalog(c); if (!selId && r.length) selectRole(r[0]) })
      .catch(() => {})
  }
  useEffect(() => { if (allowed) load() }, [allowed]) // eslint-disable-line react-hooks/exhaustive-deps

  const selected = useMemo(() => roles.find((r) => r.id === selId) || null, [roles, selId])
  const isAdmin = selected?.id === 'admin'

  function selectRole(r) {
    setSelId(r.id); setName(r.name || '')
    setPerms(new Set(r.permissions || [])); setDirty(false)
  }

  const has = (key) => isAdmin || perms.has('*') || perms.has(key)
  const toggle = (key) => {
    if (isAdmin) return
    setPerms((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
    setDirty(true)
  }

  const save = async () => {
    if (!selected) return
    setSaving(true)
    try {
      const body = { name: name.trim() || selected.name, permissions: [...perms] }
      const updated = await api.patch(`/api/roles/${selected.id}`, body)
      setRoles((xs) => xs.map((x) => (x.id === updated.id ? updated : x)))
      setDirty(false); toast('Role saved', 'success')
    } catch (e) { toast(e.message || 'Save failed', 'error') } finally { setSaving(false) }
  }

  const createRole = async () => {
    const nm = newName.trim(); if (!nm) return
    try {
      const r = await api.post('/api/roles', { name: nm, permissions: [] })
      setNewName(''); setRoles((xs) => [...xs, r]); selectRole(r); toast(`Role "${nm}" created`, 'success')
    } catch (e) { toast(e.message || 'Create failed', 'error') }
  }

  const deleteRole = async (r) => {
    if (!window.confirm(`Delete role "${r.name}"?`)) return
    try {
      await api.del(`/api/roles/${r.id}`)
      setRoles((xs) => xs.filter((x) => x.id !== r.id))
      if (selId === r.id) setSelId(null)
      toast(`Role "${r.name}" deleted`, 'info')
    } catch (e) { toast(e.message || 'Delete failed', 'error') }
  }

  const Group = ({ title, items, prefix, labels }) => (
    <div>
      <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">{title}</h4>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {items.map((key) => {
          const perm = `${prefix}${key}`
          return (
            <label key={key} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${has(perm) ? 'border-brand-200 bg-brand-50' : 'border-slate-200 bg-white'} ${isAdmin ? 'opacity-70' : 'cursor-pointer hover:bg-slate-50'}`}>
              <input type="checkbox" checked={has(perm)} disabled={isAdmin} onChange={() => toggle(perm)} className="accent-brand-600" />
              <span className="font-medium text-slate-700">{labels[key] || key}</span>
            </label>
          )
        })}
      </div>
    </div>
  )

  return (
    <div className="crm-shell h-screen overflow-hidden grid">
      <SidebarCrm active="roles" />
      <div className="flex h-screen flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 sm:px-6">
          <nav className="flex items-center gap-2 text-sm">
            <BackButton />
            <span className="text-slate-500">Settings</span>
            <span className="text-slate-300">/</span>
            <span className="font-semibold">Roles &amp; Permissions</span>
          </nav>
          <TopBarUser />
        </header>

        <main className="nice-scroll flex-1 overflow-y-auto px-6 py-5">
          {!allowed ? (
            <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center">
              <div className="text-3xl">🔒</div>
              <h2 className="mt-2 text-lg font-bold">No access</h2>
              <p className="mt-1 text-sm text-slate-500">Aapke role ko roles &amp; permissions manage karne ki ijazat nahi hai. Admin se sampark karein.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_1fr]">
              {/* Roles list */}
              <aside className="rounded-2xl border border-slate-200 bg-white p-3">
                <h3 className="mb-2 px-1 text-sm font-bold">Roles</h3>
                <ul className="space-y-1">
                  {roles.map((r) => (
                    <li key={r.id}>
                      <button onClick={() => selectRole(r)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${selId === r.id ? 'bg-brand-600 text-white' : 'hover:bg-slate-50'}`}>
                        <span className="font-semibold">{r.name}</span>
                        <span className={`text-[10px] ${selId === r.id ? 'text-white/70' : 'text-slate-400'}`}>{r.permissions?.includes('*') ? 'Full' : `${r.permissions?.length || 0}`}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex gap-1.5 border-t border-slate-100 pt-3">
                  <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && createRole()} placeholder="New role name" className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-brand-400" />
                  <button onClick={createRole} className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700">Add</button>
                </div>
              </aside>

              {/* Permissions editor */}
              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                {!selected ? (
                  <div className="grid h-40 place-items-center text-sm text-slate-400">Ek role select karein</div>
                ) : (
                  <>
                    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Role Name</label>
                        <input value={name} onChange={(e) => { setName(e.target.value); setDirty(true) }} disabled={isAdmin} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-brand-400 disabled:bg-slate-50" />
                      </div>
                      <div className="flex items-center gap-2">
                        {!selected.builtin && <button onClick={() => deleteRole(selected)} className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50">Delete</button>}
                        <button onClick={save} disabled={isAdmin || !dirty || saving} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save changes'}</button>
                      </div>
                    </div>

                    <div className="space-y-5">
                      <Group title="Page Access" items={catalog.pages} prefix="page:" labels={PAGE_LABEL} />
                      <Group title="Capabilities" items={catalog.caps} prefix="cap:" labels={CAP_LABEL} />
                      <Group title="Validate / Fill (Lead Panel sections)" items={catalog.validate} prefix="validate:" labels={SECTION_LABEL} />
                    </div>
                  </>
                )}
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
