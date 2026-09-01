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
  const [summary, setSummary] = useState([])
  const [users, setUsers] = useState([])
  const [overall, setOverall] = useState(null)
  const [activity, setActivity] = useState([])
  const [fUser, setFUser] = useState('')
  const [fAction, setFAction] = useState('')
  const [loading, setLoading] = useState(false)

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

  useEffect(() => { loadSummary() }, [loadSummary])
  useEffect(() => { loadActivity() }, [loadActivity])

  // merge users-with-no-activity into the summary rows so everyone appears
  const rows = [...summary]
  const seen = new Set(summary.map(s => s.user_name))
  users.forEach(u => { if (u.name && !seen.has(u.name)) rows.push({ user_name: u.name, _role: u.role, _email: u.email }) })
  const roleOf = (name) => (users.find(u => u.name === name) || {}).role || '—'

  return (
    <div className="crm-shell h-screen overflow-hidden grid">
      <SidebarCrm active="admin" />
      <div className="flex h-screen flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3 text-slate-700">
            <BackButton />
            <span className="hidden h-9 w-9 place-items-center rounded-lg bg-indigo-50 text-indigo-600 sm:grid">🛡️</span>
            <div><h1 className="truncate text-lg font-bold leading-tight">Admin Panel</h1><p className="hidden truncate text-[11px] text-slate-500 sm:block">User activity, logins &amp; message logs</p></div>
          </div>
          <TopBarUser />
        </header>

        <main className="nice-scroll min-h-0 flex-1 overflow-y-auto p-5">
          {/* overall today */}
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Active users today" value={overall?.active_users_today ?? '—'} accent="text-indigo-600" />
            <Stat label="Logins today" value={overall?.logins_today ?? '—'} accent="text-emerald-600" />
            <Stat label="Messages sent today" value={overall?.msgs_today ?? '—'} accent="text-violet-600" />
            <Stat label="Total users" value={users.length || '—'} />
          </div>

          {/* users summary */}
          <div className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
              <h2 className="text-sm font-bold text-slate-700">Users — activity summary</h2>
              <button onClick={loadSummary} className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-50">↻ Refresh</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-semibold">User</th>
                    <th className="px-4 py-2 font-semibold">Role</th>
                    <th className="px-4 py-2 font-semibold">Last Login</th>
                    <th className="px-4 py-2 font-semibold">Last Logout</th>
                    <th className="px-4 py-2 text-right font-semibold">Logins Today</th>
                    <th className="px-4 py-2 text-right font-semibold">Msgs Today</th>
                    <th className="px-4 py-2 text-right font-semibold">Msgs Total</th>
                    <th className="px-4 py-2 font-semibold">Last Active</th>
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

          {/* activity feed */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
              <h2 className="text-sm font-bold text-slate-700">Activity log <span className="font-normal text-slate-400">— who did what, when</span></h2>
              <div className="flex items-center gap-2">
                <select value={fUser} onChange={e => setFUser(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs">
                  <option value="">All users</option>
                  {rows.map(u => <option key={u.user_name} value={u.user_name}>{u.user_name}</option>)}
                </select>
                <select value={fAction} onChange={e => setFAction(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs">
                  <option value="">All actions</option>
                  <option value="login">Login</option>
                  <option value="logout">Logout</option>
                  <option value="message_sent">Message sent</option>
                </select>
                <button onClick={loadActivity} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50">↻</button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Time</th>
                    <th className="px-4 py-2 font-semibold">User</th>
                    <th className="px-4 py-2 font-semibold">Action</th>
                    <th className="px-4 py-2 font-semibold">To / Detail</th>
                    <th className="px-4 py-2 font-semibold">IP</th>
                  </tr>
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
                        <td className="px-4 py-2 text-slate-600">
                          {a.action === 'message_sent'
                            ? <span><b className="text-slate-700">{a.customer_name || 'Customer'}</b>{a.detail?.preview ? <span className="text-slate-400"> · “{a.detail.preview}”</span> : ''}</span>
                            : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-4 py-2 font-mono text-[11px] text-slate-400">{a.ip || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
