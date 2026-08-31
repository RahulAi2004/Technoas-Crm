import { useEffect, useState, useCallback } from 'react'
import SidebarCrm from '../components/SidebarCrm.jsx'
import TopBarUser from '../components/TopBarUser.jsx'
import BackButton from '../components/BackButton.jsx'
import { api } from '../lib/api.js'
import { useToast } from '../components/ToastContext.jsx'

const fmtKB = (b) => b ? (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB') : '—'
const Stat = ({ label, value, accent }) => (
  <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5">
    <div className="text-[11px] font-medium text-slate-500">{label}</div>
    <div className={`mt-0.5 text-xl font-extrabold ${accent || 'text-slate-800'}`}>{value}</div>
  </div>
)

export default function ArtworkDedup() {
  const toast = useToast()
  const [custs, setCusts] = useState([])
  const [customer, setCustomer] = useState('Jaysin Julios')
  const [stats, setStats] = useState(null)
  const [groups, setGroups] = useState([])
  const [filter, setFilter] = useState('all')   // all | undecided
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api.get(`/api/dedup/stats?customer=${encodeURIComponent(customer)}`).then(setStats).catch(() => {})
    api.get(`/api/dedup/groups?customer=${encodeURIComponent(customer)}`).then(setGroups).catch(() => {})
  }, [customer])
  useEffect(() => { api.get('/api/dedup/customers').then(setCusts).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])

  const setKeep = async (grp, keepId) => {
    setBusy(true)
    try {
      const others = grp.files.filter(f => f.id !== keepId).map(f => f.id)
      await api.post('/api/dedup/decision', { ids: [keepId], decision: 'keep' })
      if (others.length) await api.post('/api/dedup/decision', { ids: others, decision: 'remove' })
      // update local
      setGroups(gs => gs.map(g => g.dup_group !== grp.dup_group ? g : { ...g, files: g.files.map(f => ({ ...f, decision: f.id === keepId ? 'keep' : 'remove' })) }))
      api.get(`/api/dedup/stats?customer=${encodeURIComponent(customer)}`).then(setStats).catch(() => {})
    } catch (e) { toast('Save failed: ' + e.message, 'error') } finally { setBusy(false) }
  }
  const resetGroup = async (grp) => {
    setBusy(true)
    try {
      await api.post('/api/dedup/decision', { ids: grp.files.map(f => f.id), decision: null })
      setGroups(gs => gs.map(g => g.dup_group !== grp.dup_group ? g : { ...g, files: g.files.map(f => ({ ...f, decision: null })) }))
      load()
    } catch (e) { toast('Reset failed: ' + e.message, 'error') } finally { setBusy(false) }
  }
  const autoResolve = async () => {
    if (!window.confirm('Har undecided group me pehli file KEEP, baaki REMOVE mark kar dein?')) return
    setBusy(true)
    try { const r = await api.post('/api/dedup/auto-resolve', { customer }); toast(`Auto-resolved: ${r.updated} files`, 'success'); load() }
    catch (e) { toast('Auto-resolve failed: ' + e.message, 'error') } finally { setBusy(false) }
  }

  const decided = (g) => g.files.some(f => f.decision)
  const shown = groups.filter(g => filter === 'all' || !decided(g))

  return (
    <div className="crm-shell h-screen overflow-hidden grid">
      <SidebarCrm active="artwork-dedup" />
      <div className="flex h-screen flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3 text-slate-700">
            <BackButton />
            <span className="hidden h-9 w-9 place-items-center rounded-lg bg-rose-50 text-rose-600 sm:grid">🗂️</span>
            <div><h1 className="truncate text-lg font-bold leading-tight">Artwork Dedup</h1><p className="hidden truncate text-[11px] text-slate-500 sm:block">Legacy migration — review &amp; remove duplicate artworks</p></div>
          </div>
          <TopBarUser />
        </header>

        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <select value={customer} onChange={e => setCustomer(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            {custs.length === 0 && <option>{customer}</option>}
            {custs.map(c => <option key={c.customer} value={c.customer}>{c.customer} ({c.groups} groups)</option>)}
          </select>
          <Stat label="Dup groups" value={stats?.groups ?? '—'} />
          <Stat label="Files" value={stats?.files ?? '—'} />
          <Stat label="Marked remove" value={stats?.removed ?? 0} accent="text-rose-600" />
          <Stat label="Kept" value={stats?.kept ?? 0} accent="text-emerald-600" />
          <Stat label="Undecided" value={stats?.undecided ?? '—'} accent="text-amber-600" />
          <div className="ml-auto flex items-center gap-2">
            <div className="flex text-xs font-semibold">
              {['all', 'undecided'].map(k => <button key={k} onClick={() => setFilter(k)} className={`rounded-lg px-2.5 py-1.5 ${filter === k ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{k === 'all' ? 'All' : 'Undecided'}</button>)}
            </div>
            <button onClick={autoResolve} disabled={busy} className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">⚡ Auto-resolve remaining</button>
          </div>
        </div>

        <main className="nice-scroll min-h-0 flex-1 overflow-y-auto p-5">
          <p className="mb-3 text-xs text-slate-500">Har group me files <b>byte-for-byte identical</b> (same SHA256) hain — ek "Keep" chuno, baaki apne aap "Remove" mark ho jaayenge. (Mark-only — abhi Drive se delete nahi hota.)</p>
          {shown.length === 0 && <div className="grid h-40 place-items-center text-slate-400">{groups.length ? 'Sab groups decided ✅' : 'No duplicate groups'}</div>}
          <div className="space-y-3">
            {shown.map((g, gi) => (
              <div key={g.dup_group} className="flex gap-4 rounded-xl border border-slate-200 bg-white p-3">
                <div className="shrink-0">
                  {g.thumb ? <img src={g.thumb} alt="" className="h-24 w-24 rounded-lg border border-slate-200 object-cover" />
                    : <div className="grid h-24 w-24 place-items-center rounded-lg bg-slate-100 text-[10px] text-slate-400">no preview</div>}
                  <div className="mt-1 text-center text-[10px] text-slate-400">{g.files.length} copies</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-600">Group {gi + 1} · <span className="font-mono text-slate-400">{g.dup_group.slice(0, 10)}</span></span>
                    {decided(g) && <button onClick={() => resetGroup(g)} className="text-[11px] font-semibold text-slate-400 hover:text-slate-600">Reset</button>}
                  </div>
                  <div className="space-y-1">
                    {g.files.map(f => (
                      <label key={f.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${f.decision === 'keep' ? 'border-emerald-300 bg-emerald-50' : f.decision === 'remove' ? 'border-rose-200 bg-rose-50 opacity-70' : 'border-slate-200 hover:bg-slate-50'}`}>
                        <input type="radio" name={'g' + g.dup_group} checked={f.decision === 'keep'} onChange={() => setKeep(g, f.id)} disabled={busy} />
                        <span className="min-w-0 flex-1 truncate" title={f.path}>{f.name} <span className="text-slate-400">· {f.path}</span></span>
                        <span className="shrink-0 text-slate-400">{fmtKB(f.size)}</span>
                        {f.decision === 'keep' && <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 text-[10px] font-semibold text-emerald-700">KEEP</span>}
                        {f.decision === 'remove' && <span className="shrink-0 rounded-full bg-rose-100 px-1.5 text-[10px] font-semibold text-rose-700">REMOVE</span>}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  )
}
