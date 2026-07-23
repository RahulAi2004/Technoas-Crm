import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SidebarCrm from '../components/SidebarCrm.jsx'
import TopBarUser from '../components/TopBarUser.jsx'
import { useToast } from '../components/ToastContext.jsx'
import { CUSTOMERS as FALLBACK, tierClass, typeClass, healthClass, fmt$ } from '../data/customers.js'
import { api } from '../lib/api.js'
import { FlagBadges, FlagChip, ManageFlagsModal } from '../components/CustomerFlags.jsx'

const channelChip = (channel) => {
  if (channel === 'WhatsApp')
    return <span className="grid h-4 w-4 place-items-center rounded-full bg-emerald-500 text-white"><svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24z"/></svg></span>
  if (channel === 'Instagram')
    return <span className="grid h-4 w-4 place-items-center rounded-md bg-gradient-to-br from-amber-400 via-rose-500 to-fuchsia-600 text-white"><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/></svg></span>
  if (channel === 'Facebook')
    return <span className="grid h-4 w-4 place-items-center rounded-full bg-blue-600 text-white"><svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.99 22 12z"/></svg></span>
  if (channel === 'Email')
    return <span className="grid h-4 w-4 place-items-center rounded-full bg-slate-700 text-white"><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-10 5L2 7"/></svg></span>
  return null
}

export default function Customers() {
  const [query, setQuery] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [flags, setFlags] = useState([])            // flag definitions
  const [flagFilter, setFlagFilter] = useState('')  // '' = sab; warna flag id
  const [manageOpen, setManageOpen] = useState(false)
  const toast = useToast()
  const navigate = useNavigate()

  const loadFlags = () => api.get('/api/flags').then(setFlags).catch(() => setFlags([]))

  useEffect(() => {
    let cancelled = false
    api.get('/api/customers')
      .then((rows) => { if (!cancelled) setData(rows) })
      .catch((e) => {
        console.warn('API unavailable, using static fallback:', e.message)
        if (!cancelled) { setData(FALLBACK); toast('Using offline data — backend not reachable', 'info') }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    loadFlags()
    return () => { cancelled = true }
  }, [])

  // Kisi customer par flags set/unset — foran UI update + backend save.
  const setCustomerFlags = (id, next) => {
    setData((prev) => (prev || []).map((c) => String(c.id) === String(id) ? { ...c, flags: next } : c))
    api.patch(`/api/customers/${id}`, { flags: next }).catch(() => toast('Flag save nahi hua — dobara koshish karein', 'error'))
  }

  const source = data || []
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return source.filter(c => {
      if (flagFilter && !(Array.isArray(c.flags) && c.flags.includes(flagFilter))) return false
      if (!q) return true
      return (c.name || '').toLowerCase().includes(q) ||
        (c.company || '').toLowerCase().includes(q) ||
        (c.loc || '').toLowerCase().includes(q) ||
        (c.owner || '').toLowerCase().includes(q)
    })
  }, [query, source, flagFilter])

  return (
    <div className="crm-shell h-screen overflow-hidden grid">
      <SidebarCrm active="customers" />
      <div className="flex h-screen flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 sm:px-6">
          <div className="flex min-w-0 shrink items-center gap-3 text-slate-700">
            <h1 className="text-2xl font-extrabold tracking-tight">Customers</h1>
            <span className="rounded-lg bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-600">360</span>
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-4">
            <div className="relative min-w-0 flex-1 sm:flex-none">
              <span className="pointer-events-none absolute inset-y-0 left-0 grid place-items-center pl-3 text-slate-400">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              </span>
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search customers, orders, notes..." className="w-full sm:w-80 rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-12 text-sm outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20" />
              <kbd className="pointer-events-none absolute inset-y-0 right-2 my-auto grid h-6 place-items-center rounded border border-slate-200 bg-white px-1.5 text-[10px] font-semibold text-slate-500">⌘K</kbd>
            </div>
            <button className="relative grid h-10 w-10 place-items-center rounded-full hover:bg-slate-100" aria-label="Notifications">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
              <span className="absolute -top-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full bg-rose-500 text-[10px] font-bold text-white">6</span>
            </button>
            <TopBarUser />
          </div>
        </header>

        <main className="nice-scroll flex-1 overflow-y-auto px-6 py-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <p className="text-sm text-slate-500">Manage and grow your long-term customer relationships.</p>
            <div className="flex items-center gap-2">
              <button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                Import Customers
              </button>
              <button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                Export
              </button>
              <button onClick={() => toast('Add Customer flow — coming in the next iteration', 'info')} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>
                Add Customer
              </button>
            </div>
          </div>

          <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
              <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                <select className="w-full bg-transparent text-sm outline-none"><option>All Customers</option><option>Active</option><option>At Risk</option><option>Churned</option></select>
              </div>
              <div><label className="mb-1 block text-[11px] font-semibold text-slate-500">Customer Type</label><select className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"><option>All Types</option><option>School</option><option>Church</option><option>Brand</option><option>Sports</option></select></div>
              <div><label className="mb-1 block text-[11px] font-semibold text-slate-500">Product Interest</label><select className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"><option>All Products</option><option>Hoodies</option><option>T-Shirts</option><option>DTF Transfers</option><option>Jerseys</option></select></div>
              <div><label className="mb-1 block text-[11px] font-semibold text-slate-500">Health Status</label><select className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"><option>All Status</option><option>Excellent</option><option>Good</option><option>At Risk</option></select></div>
              <div><label className="mb-1 block text-[11px] font-semibold text-slate-500">Revenue Tier</label><select className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"><option>All Tiers</option><option>Gold</option><option>Silver</option><option>Bronze</option></select></div>
              <div><label className="mb-1 block text-[11px] font-semibold text-slate-500">Assigned To</label><select className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"><option>All Managers</option><option>Mike Johnson</option><option>Sarah Williams</option><option>David Lee</option><option>Emily Davis</option></select></div>
            </div>
          </div>

          {/* Flags: filter chips + manage */}
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
            <span className="text-xs font-semibold text-slate-500">Flags:</span>
            <button onClick={() => setFlagFilter('')} className={`rounded-md px-2 py-1 text-xs font-semibold ${flagFilter === '' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>All</button>
            {flags.map((f) => {
              const active = flagFilter === f.id
              return (
                <button key={f.id} onClick={() => setFlagFilter(active ? '' : f.id)} className={active ? 'ring-2 ring-brand-500 rounded-md' : ''}>
                  <FlagChip flag={f} />
                </button>
              )
            })}
            <button onClick={() => setManageOpen(true)} className="ml-auto inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-50">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>
              Manage Flags
            </button>
          </div>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm"><span className="font-semibold">{rows.length} customer{rows.length===1?'':'s'} found</span>{flagFilter && <span className="ml-2 text-xs text-slate-500">· filtered by flag</span>}</div>
            <div className="flex items-center gap-2">
              <button className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-50">Sort by: Last Activity <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg></button>
              <div className="flex overflow-hidden rounded-lg border border-slate-200">
                <button className="grid h-8 w-8 place-items-center hover:bg-slate-50" aria-label="Grid view"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg></button>
                <button className="grid h-8 w-8 place-items-center bg-brand-600 text-white" aria-label="List view"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg></button>
              </div>
              <span className="text-xs text-slate-500">1–12 of 124</span>
              <button className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 hover:bg-slate-50"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg></button>
              <button className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 hover:bg-slate-50"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg></button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3 text-left"><input type="checkbox" className="accent-brand-600" /></th>
                  <th className="px-3 py-3 text-left">Customer</th>
                  <th className="px-3 py-3 text-left">Company</th>
                  <th className="px-3 py-3 text-left">Type</th>
                  <th className="px-3 py-3 text-left">Total Orders</th>
                  <th className="px-3 py-3 text-left">Lifetime Spend</th>
                  <th className="px-3 py-3 text-left">Last Order</th>
                  <th className="px-3 py-3 text-left">Last Activity</th>
                  <th className="px-3 py-3 text-left">Health</th>
                  <th className="px-3 py-3 text-left">Assigned To</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((c) => (
                  <tr key={c.id} onClick={() => navigate(`/customer-360?id=${c.id}`)} className="cursor-pointer hover:bg-slate-50">
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}><input type="checkbox" className="accent-brand-600" /></td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${c.avatar} text-xs font-bold`}>{c.initials}</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <div className="truncate font-semibold">{c.name}</div>
                            <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${tierClass(c.tier)}`}>{c.tier}</span>
                          </div>
                          <div className="text-xs text-slate-500">{c.loc}</div>
                          <div className="mt-1"><FlagBadges allFlags={flags} value={c.flags || []} onChange={(next) => setCustomerFlags(c.id, next)} /></div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-sm text-slate-700">{c.company}</td>
                    <td className="px-3 py-3"><span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${typeClass(c.type)}`}>{c.type}</span></td>
                    <td className="px-3 py-3 text-sm font-semibold">{c.orders}</td>
                    <td className="px-3 py-3 text-sm font-semibold">{fmt$(c.spend)}</td>
                    <td className="px-3 py-3 text-sm">{c.lastOrder}<div className="text-xs text-slate-500">{c.activityDaysAgo}</div></td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5 text-xs"><span>{c.activityAgo}</span></div>
                      <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">{channelChip(c.channel)} {c.channel}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className={`text-base font-bold ${healthClass(c.healthLabel).split(' ')[0]}`}>{c.health}</div>
                      <span className={`inline-block rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${healthClass(c.healthLabel)}`}>{c.healthLabel}</span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <img alt="" src={`https://i.pravatar.cc/24?u=${encodeURIComponent(c.owner)}`} className="h-6 w-6 rounded-full" />
                        <div className="text-xs leading-tight"><div className="font-semibold">{c.owner}</div><div className="text-slate-500">{c.role}</div></div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <button className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="More"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>Show</span>
              <select className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"><option>20</option><option>50</option><option>100</option></select>
              <span>per page</span>
            </div>
            <div className="flex items-center gap-1">
              <button className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 hover:bg-slate-50"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg></button>
              {[1,2,3,4,5].map(n => (
                <button key={n} className={`grid h-8 w-8 place-items-center rounded-lg text-sm font-semibold ${n===1 ? 'bg-brand-600 text-white' : 'border border-slate-200 hover:bg-slate-50'}`}>{n}</button>
              ))}
              <span className="px-1 text-slate-400">…</span>
              <button className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-sm font-semibold hover:bg-slate-50">7</button>
              <button className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 hover:bg-slate-50"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg></button>
            </div>
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <span>Go to</span>
              <input type="number" min="1" max="7" defaultValue={1} className="w-12 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs" />
              <span>of 7 pages</span>
            </div>
          </div>
        </main>
      </div>
      {manageOpen && (
        <ManageFlagsModal flags={flags} onClose={() => setManageOpen(false)} onChanged={loadFlags} />
      )}
    </div>
  )
}
