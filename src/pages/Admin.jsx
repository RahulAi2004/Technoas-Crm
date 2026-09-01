import { useEffect, useState, useCallback } from 'react'
import SidebarCrm from '../components/SidebarCrm.jsx'
import TopBarUser from '../components/TopBarUser.jsx'
import BackButton from '../components/BackButton.jsx'
import { api } from '../lib/api.js'
import { useToast } from '../components/ToastContext.jsx'

const fmt = (ts) => ts ? new Date(ts).toLocaleString('en-US', { month: 'short', day: '2-digit', hour: 'numeric', minute: '2-digit' }) : '—'
const fmtFull = (ts) => ts ? new Date(ts).toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '—'

const Stat = ({ label, value, accent }) => (
  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
    <div className="text-[11px] font-medium text-slate-500">{label}</div>
    <div className={`mt-0.5 text-2xl font-extrabold ${accent || 'text-slate-800'}`}>{value}</div>
  </div>
)
const ACTION_BADGE = {
  login: { t: 'Login', c: 'bg-emerald-50 text-emerald-700' },
  logout: { t: 'Logout', c: 'bg-slate-100 text-slate-500' },
  message_sent: { t: 'Message', c: 'bg-violet-50 text-violet-700' },
}

export default function Admin() {
  const toast = useToast()
  const [tab, setTab] = useState('overview')   // 'overview' | 'replies'
  const [summary, setSummary] = useState([])
  const [users, setUsers] = useState([])
  const [overall, setOverall] = useState(null)
  const [activity, setActivity] = useState([])
  const [fUser, setFUser] = useState('')
  const [fAction, setFAction] = useState('')
  const [loading, setLoading] = useState(false)
  // reply log
  const [msgs, setMsgs] = useState([])
  const [mUser, setMUser] = useState('')
  const [mQ, setMQ] = useState('')
  const [mDate, setMDate] = useState('')
  const [mLoading, setMLoading] = useState(false)

  const loadSummary = useCallback(() => {
    api.get('/api/admin/summary').then(r => { setSummary(r.summary || []); setUsers(r.users || []); setOverall(r.overall || null) }).catch(e => toast('Summary failed: ' + e.message, 'error'))
  }, [toast])
  const loadActivity = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams({ limit: '200' })
    if (fUser) p.set('user', fUser)
    if (fAction) p.set('action', fAction)
    api.get(`/api/admin/activity?${p}`).then(r => setActivity(r.activity || [])).catch(e => toast('Activity failed: ' + e.message, 'error')).finally(() => setLoading(false))
  }, [fUser, fAction, toast])
  const loadMessages = useCallback(() => {
    setMLoading(true)
    const p = new URLSearchParams({ limit: '300' })
    if (mUser) p.set('user', mUser)
    if (mQ) p.set('q', mQ)
    if (mDate) p.set('date', mDate)
    api.get(`/api/admin/messages?${p}`).then(r => setMsgs(r.messages || [])).catch(e => toast('Reply log failed: ' + e.message, 'error')).finally(() => setMLoading(false))
  }, [mUser, mQ, mDate, toast])

  useEffect(() => { loadSummary() }, [loadSummary])
  useEffect(() => { if (tab === 'overview') loadActivity() }, [tab, loadActivity])
  useEffect(() => { if (tab === 'replies') { const t = setTimeout(loadMessages, 250); return () => clearTimeout(t) } }, [tab, loadMessages])

  const rows = [...summary]
  const seen = new Set(summary.map(s => s.user_name))
  users.forEach(u => { if (u.name && !seen.has(u.name)) rows.push({ user_name: u.name }) })
  const roleOf = (name) => (users.find(u => u.name === name) || {}).role || '—'

  const TabBtn = ({ k, label }) => (
    <button onClick={() => setTab(k)} className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold ${tab === k ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{label}</button>
  )

  return (
    <div className="crm-shell h-screen overflow-hidden grid">
      <SidebarCrm active="admin" />
      <div className="flex h-screen flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3 text-slate-700">
            <BackButton />
            <span className="hidden h-9 w-9 place-items-center rounded-lg bg-indigo-50 text-indigo-600 sm:grid">🛡️</span>
            <div><h1 className="truncate text-lg font-bold leading-tight">Admin Panel</h1><p className="hidden truncate text-[11px] text-slate-500 sm:block">User activity, logins &amp; reply logs</p></div>
          </div>
          <TopBarUser />
        </header>

        <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
          <TabBtn k="overview" label="Overview" />
          <TabBtn k="replies" label="Reply Log" />
          <span className="ml-auto text-[11px] text-slate-400">Times shown in your local timezone</span>
        </div>

        <main className="nice-scroll min-h-0 flex-1 overflow-y-auto p-5">
          {tab === 'overview' && <>
            <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Active users today" value={overall?.active_users_today ?? '—'} accent="text-indigo-600" />
              <Stat label="Logins today" value={overall?.logins_today ?? '—'} accent="text-emerald-600" />
              <Stat label="Messages sent today" value={overall?.msgs_today ?? '—'} accent="text-violet-600" />
              <Stat label="Total users" value={users.length || '—'} />
            </div>

            <div className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
                <h2 className="text-sm font-bold text-slate-700">Users — activity summary</h2>
                <button onClick={loadSummary} className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-50">↻ Refresh</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2 font-semibold">User</th><th className="px-4 py-2 font-semibold">Role</th>
                      <th className="px-4 py-2 font-semibold">Last Login</th><th className="px-4 py-2 font-semibold">Last Logout</th>
                      <th className="px-4 py-2 text-right font-semibold">Logins Today</th><th className="px-4 py-2 text-right font-semibold">Msgs Today</th>
                      <th className="px-4 py-2 text-right font-semibold">Msgs Total</th><th className="px-4 py-2 font-semibold">Last Active</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-400">No users</td></tr>}
                    {rows.map((u) => (
                      <tr key={u.user_name} className="hover:bg-slate-50/60">
                        <td className="px-4 py-2.5 font-semibold text-slate-800">{u.user_name}</td>
                        <td className="px-4 py-2.5"><span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">{roleOf(u.user_name)}</span></td>
                        <td className="px-4 py-2.5 text-slate-600">{fmt(u.last_login)}</td>
                        <td className="px-4 py-2.5 text-slate-600">{fmt(u.last_logout)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{u.logins_today ?? 0}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-violet-700">{u.msgs_today ?? 0}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{u.msgs_total ?? 0}</td>
                        <td className="px-4 py-2.5 text-slate-500">{fmt(u.last_activity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
                <h2 className="text-sm font-bold text-slate-700">Activity log <span className="font-normal text-slate-400">— logins, logouts &amp; messages</span></h2>
                <div className="flex items-center gap-2">
                  <select value={fUser} onChange={e => setFUser(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs">
                    <option value="">All users</option>{rows.map(u => <option key={u.user_name} value={u.user_name}>{u.user_name}</option>)}
                  </select>
                  <select value={fAction} onChange={e => setFAction(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs">
                    <option value="">All actions</option><option value="login">Login</option><option value="logout">Logout</option><option value="message_sent">Message sent</option>
                  </select>
                  <button onClick={loadActivity} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50">↻</button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                    <tr><th className="px-4 py-2 font-semibold">Time</th><th className="px-4 py-2 font-semibold">User</th><th className="px-4 py-2 font-semibold">Action</th><th className="px-4 py-2 font-semibold">To / Detail</th><th className="px-4 py-2 font-semibold">IP</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Loading…</td></tr>}
                    {!loading && activity.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">No activity yet</td></tr>}
                    {!loading && activity.map((a) => {
                      const b = ACTION_BADGE[a.action] || { t: a.action, c: 'bg-slate-100 text-slate-500' }
                      return (
                        <tr key={a.id} className="hover:bg-slate-50/60">
                          <td className="whitespace-nowrap px-4 py-2 text-slate-500">{fmtFull(a.created_at)}</td>
                          <td className="px-4 py-2 font-semibold text-slate-800">{a.user_name}</td>
                          <td className="px-4 py-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${b.c}`}>{b.t}</span></td>
                          <td className="px-4 py-2 text-slate-600">{a.action === 'message_sent'
                            ? <span><b className="text-slate-700">{a.customer_name || 'Customer'}</b>{a.detail?.text ? <span className="text-slate-400"> · “{String(a.detail.text).slice(0, 80)}”</span> : ''}</span>
                            : <span className="text-slate-400">—</span>}</td>
                          <td className="px-4 py-2 font-mono text-[11px] text-slate-400">{a.ip || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>}

          {tab === 'replies' && <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <select value={mUser} onChange={e => setMUser(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm">
                <option value="">👤 All agents</option>{rows.map(u => <option key={u.user_name} value={u.user_name}>{u.user_name}</option>)}
              </select>
              <input value={mQ} onChange={e => setMQ(e.target.value)} placeholder="Search message or customer…" className="min-w-[220px] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
              <input type="date" value={mDate} onChange={e => setMDate(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm" />
              {mDate && <button onClick={() => setMDate('')} className="text-xs font-semibold text-slate-400 hover:text-slate-600">clear date</button>}
              <button onClick={loadMessages} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50">↻ Refresh</button>
              <span className="ml-auto text-xs text-slate-400">{msgs.length} replies</span>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2 font-semibold">Time</th>
                      <th className="px-4 py-2 font-semibold">Agent (who)</th>
                      <th className="px-4 py-2 font-semibold">Customer (to whom)</th>
                      <th className="px-4 py-2 font-semibold">Channel</th>
                      <th className="px-4 py-2 font-semibold">Message (what)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {mLoading && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Loading…</td></tr>}
                    {!mLoading && msgs.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">No replies logged yet</td></tr>}
                    {!mLoading && msgs.map((m) => (
                      <tr key={m.id} className="align-top hover:bg-slate-50/60">
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{fmtFull(m.created_at)}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 font-semibold text-indigo-700">{m.user_name}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-700">{m.customer_name || '—'}</td>
                        <td className="whitespace-nowrap px-4 py-2.5"><span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{m.channel || '—'}</span></td>
                        <td className="px-4 py-2.5 text-slate-700"><div className="max-w-xl whitespace-pre-wrap break-words">{m.has_attachment && <span className="mr-1 text-slate-400">📎</span>}{m.text || <span className="text-slate-400">(no text)</span>}</div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>}
        </main>
      </div>
    </div>
  )
}
