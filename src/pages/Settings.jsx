import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import SidebarCrm from '../components/SidebarCrm.jsx'
import TopBarUser from '../components/TopBarUser.jsx'
import { useToast } from '../components/ToastContext.jsx'
import BackButton from '../components/BackButton.jsx'
import { api } from '../lib/api.js'
import { currentUser, signOut } from '../lib/auth.js'

const Dot = ({ on }) => <span className={`inline-block h-2 w-2 rounded-full ${on ? 'bg-emerald-500' : 'bg-slate-300'}`} />

export default function Settings() {
  const toast = useToast()
  const navigate = useNavigate()
  const me = currentUser() || {}

  const [name, setName] = useState(me.name || '')
  const [role, setRole] = useState(me.role || 'admin')
  const [savingName, setSavingName] = useState(false)
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [savingPw, setSavingPw] = useState(false)
  const [conn, setConn] = useState({ meta: null, ai: null, qdrant: null })
  const [settings, setSettings] = useState(null)
  const [savingBiz, setSavingBiz] = useState(false)
  const [qa, setQa] = useState(null)          // quick actions (Responses tab panels)
  const [savingQa, setSavingQa] = useState(false)

  useEffect(() => {
    api.get('/api/meta/status').then((d) => setConn((c) => ({ ...c, meta: d }))).catch(() => {})
    api.get('/api/ai/status').then((d) => setConn((c) => ({ ...c, ai: d }))).catch(() => {})
    api.get('/api/qdrant/status').then((d) => setConn((c) => ({ ...c, qdrant: d }))).catch(() => {})
    api.get('/api/settings').then(setSettings).catch(() => {})
    api.get('/api/quick-actions').then(setQa).catch(() => {})
  }, [])

  const qaUpdate = (group, i, key, val) => setQa((q) => ({ ...q, [group]: q[group].map((it, j) => j === i ? { ...it, [key]: val } : it) }))
  const qaAdd = (group) => setQa((q) => ({ ...q, [group]: [...(q[group] || []), { label: '', msg: '' }] }))
  const qaRemove = (group, i) => setQa((q) => ({ ...q, [group]: q[group].filter((_, j) => j !== i) }))
  const saveQa = async () => {
    setSavingQa(true)
    try { const saved = await api.put('/api/quick-actions', qa); setQa(saved); toast('Quick actions saved', 'success') }
    catch (ex) { toast(ex.message || 'Save failed', 'error') }
    finally { setSavingQa(false) }
  }

  const setBiz = (k, v) => setSettings((s) => ({ ...s, business: { ...s.business, [k]: v } }))
  const toggleNotif = (k) => setSettings((s) => ({ ...s, notifications: { ...s.notifications, [k]: !s.notifications[k] } }))
  const saveSettings = async () => {
    setSavingBiz(true)
    try { const saved = await api.put('/api/settings', settings); setSettings(saved); toast('Settings saved', 'success') }
    catch (ex) { toast(ex.message || 'Save failed', 'error') }
    finally { setSavingBiz(false) }
  }

  const saveName = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSavingName(true)
    try {
      const u = await api.patch('/api/auth/me', { name: name.trim(), role })
      const store = localStorage.getItem('tcToken') ? localStorage : sessionStorage
      store.setItem('tcUser', JSON.stringify(u))
      window.dispatchEvent(new Event('tc:user'))  // update top-bar live
      toast('Profile updated', 'success')
    } catch (ex) { toast(ex.message || 'Update failed', 'error') }
    finally { setSavingName(false) }
  }

  const savePw = async (e) => {
    e.preventDefault()
    if (pw.next !== pw.confirm) { toast('New passwords do not match', 'error'); return }
    setSavingPw(true)
    try {
      await api.post('/api/auth/password', { currentPassword: pw.current, newPassword: pw.next })
      toast('Password changed', 'success')
      setPw({ current: '', next: '', confirm: '' })
    } catch (ex) { toast(ex.message || 'Change failed', 'error') }
    finally { setSavingPw(false) }
  }

  const field = 'w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20'
  const card = 'rounded-2xl border border-slate-200 bg-white p-5'

  const connections = [
    { key: 'pg', name: 'PostgreSQL Database', on: true, desc: 'decoinks_db — structured data', to: null },
    { key: 'meta', name: 'Meta (Messenger & Instagram)', on: conn.meta?.connected, desc: conn.meta?.connected ? `Page: ${conn.meta.pageName || '—'}` : 'Not connected', to: '/connect-meta' },
    { key: 'ai', name: 'OpenAI (AI Supervisor)', on: conn.ai?.configured, desc: conn.ai?.configured ? `Model: ${conn.ai.models?.chat}` : 'API key not set', to: null },
    { key: 'qdrant', name: 'Qdrant (Vector DB / RAG)', on: conn.qdrant?.connected, desc: conn.qdrant?.connected ? `${(conn.qdrant.collections || []).length} collections` : 'Not connected', to: null },
  ]

  return (
    <div className="crm-shell h-screen overflow-hidden grid">
      <SidebarCrm active="settings" />
      <div className="flex h-screen flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 sm:px-6">
          <div className="flex min-w-0 shrink items-center gap-3 text-slate-700">
            <BackButton />
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-600">⚙️</span>
            <div><h1 className="truncate text-lg font-bold leading-tight">Settings</h1><p className="hidden truncate text-[11px] text-slate-500 sm:block">Profile, security &amp; connections.</p></div>
          </div>
          <TopBarUser />
        </header>

        <main className="nice-scroll flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-3xl space-y-5">
            {/* Profile */}
            <section className={card}>
              <h2 className="text-sm font-bold">Profile</h2>
              <form onSubmit={saveName} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div><label className="mb-1 block text-xs font-semibold text-slate-600">Full Name</label><input value={name} onChange={(e) => setName(e.target.value)} className={field} /></div>
                <div><label className="mb-1 block text-xs font-semibold text-slate-600">Email</label><input value={me.email || ''} disabled className={`${field} opacity-60`} /></div>
                <div><label className="mb-1 block text-xs font-semibold text-slate-600">Role</label>
                  <select value={role} onChange={(e) => setRole(e.target.value)} className={field}>
                    <option value="admin">Admin</option>
                    <option value="manager">Account Manager</option>
                    <option value="agent">Agent</option>
                  </select>
                </div>
                <div className="flex items-end"><button type="submit" disabled={savingName} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">{savingName ? 'Saving…' : 'Save Profile'}</button></div>
              </form>
            </section>

            {/* Password */}
            <section className={card}>
              <h2 className="text-sm font-bold">Change Password</h2>
              <form onSubmit={savePw} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div><label className="mb-1 block text-xs font-semibold text-slate-600">Current</label><input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} className={field} /></div>
                <div><label className="mb-1 block text-xs font-semibold text-slate-600">New</label><input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} className={field} /></div>
                <div><label className="mb-1 block text-xs font-semibold text-slate-600">Confirm New</label><input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} className={field} /></div>
                <div className="sm:col-span-3"><button type="submit" disabled={savingPw} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">{savingPw ? 'Changing…' : 'Change Password'}</button></div>
              </form>
            </section>

            {/* Business Information */}
            <section className={card}>
              <h2 className="text-sm font-bold">Business Information</h2>
              {!settings ? <p className="mt-2 text-xs text-slate-400">Loading…</p> : (
                <>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div><label className="mb-1 block text-xs font-semibold text-slate-600">Business Name</label><input value={settings.business.name} onChange={(e) => setBiz('name', e.target.value)} className={field} /></div>
                    <div><label className="mb-1 block text-xs font-semibold text-slate-600">Business Email</label><input value={settings.business.email} onChange={(e) => setBiz('email', e.target.value)} className={field} /></div>
                    <div><label className="mb-1 block text-xs font-semibold text-slate-600">Phone</label><input value={settings.business.phone} onChange={(e) => setBiz('phone', e.target.value)} className={field} /></div>
                    <div><label className="mb-1 block text-xs font-semibold text-slate-600">Currency</label>
                      <select value={settings.business.currency} onChange={(e) => setBiz('currency', e.target.value)} className={field}>
                        {['USD', 'EUR', 'GBP', 'PKR', 'INR', 'CAD', 'AUD'].map((x) => <option key={x}>{x}</option>)}
                      </select>
                    </div>
                    <div className="sm:col-span-2"><label className="mb-1 block text-xs font-semibold text-slate-600">Address</label><input value={settings.business.address} onChange={(e) => setBiz('address', e.target.value)} className={field} /></div>
                    <div><label className="mb-1 block text-xs font-semibold text-slate-600">Timezone</label><input value={settings.business.timezone} onChange={(e) => setBiz('timezone', e.target.value)} className={field} /></div>
                  </div>
                  <button onClick={saveSettings} disabled={savingBiz} className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">{savingBiz ? 'Saving…' : 'Save Settings'}</button>
                </>
              )}
            </section>

            {/* Notifications */}
            {settings && (
              <section className={card}>
                <h2 className="text-sm font-bold">Notifications</h2>
                <div className="mt-3 divide-y divide-slate-100">
                  {[['newMessage', 'New message received'], ['newLead', 'New lead created'], ['paymentReceived', 'Payment received'], ['dailySummary', 'Daily summary email']].map(([k, label]) => (
                    <label key={k} className="flex cursor-pointer items-center justify-between py-2.5">
                      <span className="text-sm text-slate-700">{label}</span>
                      <button type="button" onClick={() => toggleNotif(k)} className={`relative h-6 w-11 rounded-full transition ${settings.notifications[k] ? 'bg-brand-600' : 'bg-slate-300'}`}>
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${settings.notifications[k] ? 'left-[22px]' : 'left-0.5'}`} />
                      </button>
                    </label>
                  ))}
                </div>
                <button onClick={saveSettings} disabled={savingBiz} className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">Save Notifications</button>
              </section>
            )}

            {/* Quick Reply Actions (Responses tab panels) */}
            {qa && (
              <section className={card}>
                <h2 className="text-sm font-bold">Quick Reply Actions</h2>
                <p className="mt-0.5 text-xs text-slate-500">Edit the Communication, Payment &amp; Document buttons that appear in the AI Supervisor → Responses tab.</p>
                {[['communication', 'Communication Actions'], ['payment', 'Payment Methods'], ['document', 'Document']].map(([group, label]) => (
                  <div key={group} className="mt-4">
                    <div className="mb-1.5 flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</h3>
                      <button onClick={() => qaAdd(group)} className="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-brand-600 hover:bg-brand-50">+ Add</button>
                    </div>
                    <div className="space-y-1.5">
                      {(qa[group] || []).map((it, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input value={it.label} onChange={(e) => qaUpdate(group, i, 'label', e.target.value)} placeholder="Button label" className={`${field} sm:w-1/3`} />
                          <input value={it.msg} onChange={(e) => qaUpdate(group, i, 'msg', e.target.value)} placeholder="Message sent to chat" className={field} />
                          <button onClick={() => qaRemove(group, i)} className="shrink-0 rounded-md p-1.5 text-rose-500 hover:bg-rose-50" title="Remove">🗑</button>
                        </div>
                      ))}
                      {(qa[group] || []).length === 0 && <p className="text-[11px] text-slate-400">No items — click “+ Add”.</p>}
                    </div>
                  </div>
                ))}
                <button onClick={saveQa} disabled={savingQa} className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">{savingQa ? 'Saving…' : 'Save Quick Actions'}</button>
              </section>
            )}

            {/* Connections */}
            <section className={card}>
              <h2 className="text-sm font-bold">Connections</h2>
              <div className="mt-3 divide-y divide-slate-100">
                {connections.map((c) => (
                  <div key={c.key} className="flex items-center justify-between gap-3 py-3">
                    <div className="flex items-center gap-3">
                      <Dot on={c.on} />
                      <div><div className="text-sm font-semibold">{c.name}</div><div className="text-xs text-slate-500">{c.desc}</div></div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${c.on ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{c.on ? 'Connected' : 'Not connected'}</span>
                      {c.to && <Link to={c.to} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold hover:bg-slate-50">Manage</Link>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <Link to="/connect-meta" className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">Connect Meta</Link>
                <Link to="/integrations" className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">Integrations</Link>
              </div>
            </section>

            {/* Danger / session */}
            <section className={card}>
              <h2 className="text-sm font-bold">Session</h2>
              <p className="mt-1 text-xs text-slate-500">Sign out of this device.</p>
              <button onClick={() => { signOut(); navigate('/', { replace: true }) }} className="mt-3 rounded-lg border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">Log out</button>
            </section>
          </div>
        </main>
      </div>
    </div>
  )
}
