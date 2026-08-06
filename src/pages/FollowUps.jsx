import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SidebarCrm from '../components/SidebarCrm.jsx'
import TopBarUser from '../components/TopBarUser.jsx'
import BackButton from '../components/BackButton.jsx'
import { fmt$ } from '../data/customers.js'
import { api } from '../lib/api.js'

// Until a dedicated follow-ups table exists, surface open leads that need a
// next touch (anything not Won/Lost) as actionable follow-ups.
const OPEN = ['New', 'Contacted', 'In Progress', 'Pending']

export default function FollowUps() {
  const navigate = useNavigate()
  const [leads, setLeads] = useState([])

  useEffect(() => { api.get('/api/leads').then(setLeads).catch(() => {}) }, [])

  const items = useMemo(() => leads.filter((l) => OPEN.includes(l.status)), [leads])

  return (
    <div className="crm-shell h-screen overflow-hidden grid">
      <SidebarCrm active="follow-ups" />
      <div className="flex h-screen flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 sm:px-6">
          <div className="flex min-w-0 shrink items-center gap-3 text-slate-700">
            <BackButton />
            <span className="hidden h-9 w-9 place-items-center rounded-lg bg-amber-50 text-amber-600 sm:grid">⏰</span>
            <div><h1 className="truncate text-lg font-bold leading-tight">Follow-Ups</h1><p className="hidden truncate text-[11px] text-slate-500 sm:block">Leads waiting for your next touch.</p></div>
          </div>
          <TopBarUser />
        </header>

        <main className="nice-scroll flex-1 overflow-y-auto px-6 py-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs text-slate-500">Open Follow-Ups</div><div className="mt-1 text-2xl font-extrabold">{items.length}</div></div>
            <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs text-slate-500">Hot</div><div className="mt-1 text-2xl font-extrabold text-rose-600">{items.filter((l) => l.badge === 'Hot').length}</div></div>
            <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs text-slate-500">Pending Payment</div><div className="mt-1 text-2xl font-extrabold">{items.filter((l) => l.pipeline === 'Payment Pending').length}</div></div>
            <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs text-slate-500">Potential Value</div><div className="mt-1 text-2xl font-extrabold">{fmt$(items.reduce((a, l) => a + (l.value || 0), 0))}</div></div>
          </div>

          <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {items.length === 0 ? (
              <div className="px-6 py-16 text-center"><div className="text-3xl">⏰</div><p className="mt-2 text-sm font-semibold text-slate-700">No open follow-ups 🎉</p><p className="mt-1 text-xs text-slate-500">All leads are handled.</p></div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map((l) => (
                  <li key={l.id} onClick={() => navigate(`/leads/${l.id}`)} className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-slate-50">
                    <span className={`grid h-9 w-9 place-items-center rounded-full ${l.av} text-xs font-bold text-white`}>{l.initials}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2"><span className="font-semibold">{l.name}</span>{l.badge && <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">🔥 {l.badge}</span>}</div>
                      <div className="text-xs text-slate-500">{l.company} · {l.pipeline}</div>
                    </div>
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${l.statusCls}`}>{l.status}</span>
                    <span className="w-24 text-right text-sm font-semibold">{fmt$(l.value || 0)}</span>
                    <span className="text-xs text-slate-500">{l.agent}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
