import { useEffect, useMemo, useRef, useState } from 'react'
import SidebarCrm from '../components/SidebarCrm.jsx'
import TopBarUser from '../components/TopBarUser.jsx'
import { useToast } from '../components/ToastContext.jsx'
import { api } from '../lib/api.js'

// ---- helpers ----
const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'
const fmtDate = (d) => { if (!d) return '—'; const t = new Date(d); return isNaN(t) ? '—' : t.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
const fmtDateTime = (d) => { if (!d) return '—'; const t = new Date(d); return isNaN(t) ? '—' : t.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) }
function durationStr(from, to = Date.now()) {
  if (!from) return ''
  let s = Math.max(0, Math.floor((to - new Date(from).getTime()) / 1000))
  const d = Math.floor(s / 86400); s -= d * 86400
  const h = Math.floor(s / 3600); s -= h * 3600
  const m = Math.floor(s / 60)
  if (d) return `${d}d ${h}h`
  if (h) return `${h}h ${m}m`
  return `${m}m`
}
const STATUS_STYLE = {
  'Pending': 'bg-slate-100 text-slate-600', 'Assigned': 'bg-slate-100 text-slate-700',
  'Accepted': 'bg-sky-50 text-sky-700', 'In Progress': 'bg-indigo-50 text-indigo-700',
  'On Hold': 'bg-amber-50 text-amber-700', 'Waiting': 'bg-amber-50 text-amber-700',
  'Submitted': 'bg-violet-50 text-violet-700', 'Completed': 'bg-emerald-50 text-emerald-700',
  'Rejected': 'bg-rose-50 text-rose-700', 'Cancelled': 'bg-slate-100 text-slate-400 line-through',
  'Reopened': 'bg-orange-50 text-orange-700',
}
const PRIO_STYLE = { Urgent: 'bg-rose-100 text-rose-700', High: 'bg-orange-100 text-orange-700', Medium: 'bg-amber-100 text-amber-700', Low: 'bg-slate-100 text-slate-500' }
const asArray = (r) => Array.isArray(r) ? r : (r?.tasks || r?.users || r?.data || [])

function StatCard({ label, value, tint, active, onClick }) {
  return (
    <button onClick={onClick} className={`rounded-xl border p-3 text-left transition ${active ? 'border-brand-500 ring-1 ring-brand-300' : 'border-slate-200 hover:border-slate-300'} bg-white`}>
      <div className={`text-[11px] font-semibold uppercase tracking-wide ${tint || 'text-slate-500'}`}>{label}</div>
      <div className="mt-1 text-2xl font-extrabold text-slate-800">{value ?? 0}</div>
    </button>
  )
}

// NOTE: module level pe — NewTaskModal ke ANDAR define karne se har keystroke pe naya component
// banta tha aur input remount ho ke focus kho deta tha (ek word ke baad cursor hat jaata tha).
const Fld = ({ label, children }) => (<label className="block"><div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>{children}</label>)

function NewTaskModal({ users, onClose, onCreated }) {
  const toast = useToast()
  const [f, setF] = useState({ title: '', description: '', assignedUserId: users[0]?.id || '', priority: 'Medium', taskType: 'General', entityType: 'Lead', entityId: '', dueAt: '' })
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const submit = async () => {
    if (!f.title.trim()) return toast('Title required', 'error')
    if (!f.assignedUserId) return toast('Pick an assignee', 'error')
    setBusy(true)
    try {
      const body = {
        title: f.title.trim(), description: f.description.trim() || undefined,
        assignedUserId: f.assignedUserId, priority: f.priority, taskType: f.taskType.trim() || 'General',
        entityType: f.entityType, entityId: f.entityId.trim() || 'GENERAL',
        dueAt: f.dueAt ? new Date(f.dueAt + 'T17:00:00').toISOString() : undefined,
      }
      await api.post('/api/taskmgmt/tasks', body)
      toast('Task created & assigned', 'success'); onCreated(); onClose()
    } catch (e) { toast(e.message || 'Create failed', 'error') } finally { setBusy(false) }
  }
  const inp = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none'
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 text-lg font-bold">New Task</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Fld label="Title"><input className={inp} value={f.title} onChange={set('title')} placeholder="e.g. Prepare artwork proof" /></Fld></div>
          <div className="col-span-2"><Fld label="Description"><textarea className={inp} rows={2} value={f.description} onChange={set('description')} /></Fld></div>
          <Fld label="Assign to"><select className={inp} value={f.assignedUserId} onChange={set('assignedUserId')}>{users.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.role}</option>)}</select></Fld>
          <Fld label="Priority"><select className={inp} value={f.priority} onChange={set('priority')}>{['Urgent', 'High', 'Medium', 'Low'].map((p) => <option key={p}>{p}</option>)}</select></Fld>
          <Fld label="Task type"><input className={inp} value={f.taskType} onChange={set('taskType')} placeholder="Design / Follow up / Bug…" /></Fld>
          <Fld label="Due date"><input type="date" className={inp} value={f.dueAt} onChange={set('dueAt')} /></Fld>
          <Fld label="Entity type"><select className={inp} value={f.entityType} onChange={set('entityType')}>{['Lead', 'Artwork', 'Sales Order', 'System'].map((t) => <option key={t}>{t}</option>)}</select></Fld>
          <Fld label="Entity ID (optional)"><input className={inp} value={f.entityId} onChange={set('entityId')} placeholder="LD-1025 / AW-…" /></Fld>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={submit} disabled={busy} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">{busy ? 'Creating…' : 'Create & Assign'}</button>
        </div>
      </div>
    </div>
  )
}

export default function Tasks() {
  const toast = useToast()
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [tasks, setTasks] = useState([])
  const [err, setErr] = useState(null)
  const [loading, setLoading] = useState(true)
  const [statusF, setStatusF] = useState('')       // '' = all
  const [assigneeF, setAssigneeF] = useState('')
  const [q, setQ] = useState('')
  const [newOpen, setNewOpen] = useState(false)
  const [now, setNow] = useState(Date.now())
  const busyRef = useRef(false)

  const load = async () => {
    if (busyRef.current) return
    busyRef.current = true
    try {
      const [st, us, tk] = await Promise.all([
        api.get('/api/taskmgmt/stats').catch((e) => { throw e }),
        api.get('/api/taskmgmt/users').catch(() => []),
        api.get('/api/taskmgmt/tasks?limit=500').catch(() => ({ tasks: [] })),
      ])
      setStats(st?.stats || st); setUsers(asArray(us)); setTasks(asArray(tk)); setErr(null)
    } catch (e) { setErr(e.message || 'Task Management not reachable') }
    finally { setLoading(false); busyRef.current = false }
  }
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t) }, [])
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t) }, [])

  const act = async (id, event, label) => {
    try { await api.post(`/api/taskmgmt/task/${id}/transition`, { event }); toast(label + ' ✓', 'success'); load() }
    catch (e) { toast(e.data?.error || e.message || (label + ' failed'), 'error') }
  }

  const shown = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return tasks.filter((t) => {
      if (statusF === '__overdue') { if (!(t.dueAt && new Date(t.dueAt) < new Date() && !['Completed', 'Cancelled', 'Submitted'].includes(t.status))) return false }
      else if (statusF && t.status !== statusF) return false
      if (assigneeF && t.assignedUser?.id !== assigneeF) return false
      if (ql && !(`${t.title} ${t.taskNo} ${t.entityId} ${t.taskType} ${t.assignedUser?.name || ''}`.toLowerCase().includes(ql))) return false
      return true
    })
  }, [tasks, statusF, assigneeF, q])

  const s = stats || {}
  const isOverdue = (t) => t.dueAt && new Date(t.dueAt) < new Date() && !['Completed', 'Cancelled', 'Submitted'].includes(t.status)

  return (
    <div className="flex min-h-screen bg-slate-50">
      <SidebarCrm active="tasks" />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div>
            <h1 className="text-lg font-bold leading-tight">Tasks</h1>
            <p className="text-[11px] text-slate-500">Team task queue — assign, track &amp; approve. Synced with Decoinks Task Management.</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setNewOpen(true)} className="rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700">+ New Task</button>
            <TopBarUser role="Admin" />
          </div>
        </header>

        <main className="nice-scroll flex-1 overflow-y-auto px-6 py-5">
          {err && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">⚠️ {err} <button onClick={load} className="ml-2 font-semibold underline">Retry</button></div>}

          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            <StatCard label="Total" value={s.total} active={statusF === ''} onClick={() => setStatusF('')} />
            <StatCard label="Assigned" value={s.assigned} tint="text-slate-500" active={statusF === 'Assigned'} onClick={() => setStatusF('Assigned')} />
            <StatCard label="In Progress" value={s.inProgress} tint="text-indigo-600" active={statusF === 'In Progress'} onClick={() => setStatusF('In Progress')} />
            <StatCard label="Waiting" value={s.waiting} tint="text-amber-600" active={statusF === 'Waiting'} onClick={() => setStatusF('Waiting')} />
            <StatCard label="Needs approval" value={s.submitted} tint="text-violet-600" active={statusF === 'Submitted'} onClick={() => setStatusF('Submitted')} />
            <StatCard label="Overdue" value={s.overdue} tint="text-rose-600" active={statusF === '__overdue'} onClick={() => setStatusF('__overdue')} />
            <StatCard label="Done today" value={s.completedToday} tint="text-emerald-600" active={false} onClick={() => setStatusF('Completed')} />
          </div>

          {/* Team workload */}
          <div className="mt-5">
            <div className="mb-2 text-sm font-bold text-slate-700">Team workload — who has how many</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {users.length === 0 ? <div className="text-xs text-slate-400">No users.</div> : users.map((u) => (
                <button key={u.id} onClick={() => setAssigneeF(assigneeF === u.id ? '' : u.id)}
                  className={`flex items-center gap-3 rounded-xl border bg-white p-3 text-left transition ${assigneeF === u.id ? 'border-brand-500 ring-1 ring-brand-300' : 'border-slate-200 hover:border-slate-300'}`}>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white" style={{ background: u.color || '#64748b' }}>{initials(u.name)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-800">{u.name}</div>
                    <div className="text-[11px] text-slate-500">{u.title || u.role}</div>
                  </div>
                  <div className="flex gap-3 text-center">
                    <div><div className="text-sm font-bold text-slate-800">{u.openTasks ?? 0}</div><div className="text-[9px] uppercase text-slate-400">Open</div></div>
                    <div><div className="text-sm font-bold text-amber-600">{u.dueToday ?? 0}</div><div className="text-[9px] uppercase text-slate-400">Today</div></div>
                    <div><div className="text-sm font-bold text-rose-600">{u.overdue ?? 0}</div><div className="text-[9px] uppercase text-slate-400">Late</div></div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks…" className="w-56 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-brand-400 focus:outline-none" />
            <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
              <option value="">All statuses</option>
              {['Assigned', 'Accepted', 'In Progress', 'On Hold', 'Waiting', 'Submitted', 'Completed', 'Rejected', 'Cancelled'].map((x) => <option key={x} value={x}>{x}</option>)}
              <option value="__overdue">Overdue</option>
            </select>
            {assigneeF && <button onClick={() => setAssigneeF('')} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Clear person ✕</button>}
            <span className="ml-auto text-xs text-slate-500">{shown.length} of {tasks.length} tasks</span>
          </div>

          {/* Task table */}
          <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-semibold">Task</th>
                  <th className="px-3 py-2 font-semibold">Assignee</th>
                  <th className="px-3 py-2 font-semibold">Priority</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Working</th>
                  <th className="px-3 py-2 font-semibold">Due</th>
                  <th className="px-3 py-2 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={7} className="px-3 py-10 text-center text-sm text-slate-400">Loading tasks…</td></tr>
                ) : shown.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-10 text-center text-sm text-slate-400">No tasks. Click <b>+ New Task</b> to assign one.</td></tr>
                ) : shown.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-slate-800">{t.title}</div>
                      <div className="text-[11px] text-slate-400">{t.taskNo} · {t.taskType} · {t.entityType}{t.entityId && t.entityId !== 'GENERAL' ? ` ${t.entityId}` : ''}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      {t.assignedUser ? (
                        <div className="flex items-center gap-2">
                          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: t.assignedUser.color || '#64748b' }}>{initials(t.assignedUser.name)}</span>
                          <span className="whitespace-nowrap text-slate-700">{t.assignedUser.name}</span>
                        </div>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5"><span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${PRIO_STYLE[t.priority] || 'bg-slate-100 text-slate-500'}`}>{t.priority}</span></td>
                    <td className="px-3 py-2.5"><span className={`whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[t.status] || 'bg-slate-100 text-slate-600'}`}>{t.status}</span></td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">
                      {t.status === 'In Progress' && t.startedAt ? <span className="font-semibold text-indigo-600" title={`Started ${fmtDateTime(t.startedAt)}`}>⏱ {durationStr(t.startedAt, now)}</span>
                        : t.status === 'Completed' && t.completedAt ? <span className="text-emerald-600">✓ {fmtDate(t.completedAt)}</span>
                        : t.status === 'Submitted' && t.submittedAt ? <span className="text-violet-600">await review</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap"><span className={isOverdue(t) ? 'font-semibold text-rose-600' : 'text-slate-500'}>{fmtDate(t.dueAt)}{isOverdue(t) ? ' ⚠' : ''}</span></td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1">
                        {t.status === 'Submitted' && (<>
                          <button onClick={() => act(t.id, 'approve', 'Approved')} className="rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700">Approve</button>
                          <button onClick={() => act(t.id, 'reject', 'Rejected')} className="rounded-md border border-rose-200 px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50">Reject</button>
                        </>)}
                        {t.status === 'Rejected' && <button onClick={() => act(t.id, 'reopen', 'Reopened')} className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50">Reopen</button>}
                        {!['Completed', 'Cancelled'].includes(t.status) && <button onClick={() => act(t.id, 'cancel', 'Cancelled')} className="rounded-md px-2 py-1 text-[11px] font-semibold text-slate-400 hover:bg-slate-100 hover:text-rose-600">Cancel</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>
      {newOpen && <NewTaskModal users={users} onClose={() => setNewOpen(false)} onCreated={load} />}
    </div>
  )
}
