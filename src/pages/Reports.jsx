import { useEffect, useMemo, useState } from 'react'
import SidebarCrm from '../components/SidebarCrm.jsx'
import TopBarUser from '../components/TopBarUser.jsx'
import BackButton from '../components/BackButton.jsx'
import { fmt$ } from '../data/customers.js'
import { api } from '../lib/api.js'

const Card = ({ label, value, icon, color, sub }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4">
    <div className="flex items-center justify-between">
      <span className={`grid h-9 w-9 place-items-center rounded-lg ${color}`}>{icon}</span>
      <span className="text-[11px] text-slate-500">{label}</span>
    </div>
    <div className="mt-3 text-2xl font-extrabold">{value}</div>
    {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
  </div>
)

const Bar = ({ label, value, max, color }) => (
  <div>
    <div className="mb-1 flex justify-between text-xs"><span className="text-slate-600">{label}</span><span className="font-semibold">{value}</span></div>
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${color}`} style={{ width: `${max ? Math.round((value / max) * 100) : 0}%` }} /></div>
  </div>
)

export default function Reports() {
  const [customers, setCustomers] = useState([])
  const [leads, setLeads] = useState([])
  const [receipts, setReceipts] = useState([])

  useEffect(() => {
    api.get('/api/customers').then(setCustomers).catch(() => {})
    api.get('/api/leads').then(setLeads).catch(() => {})
    api.get('/api/receipts').then(setReceipts).catch(() => {})
  }, [])

  const r = useMemo(() => {
    const revenue = receipts.reduce((a, x) => a + (x.amount || 0), 0)
    const won = leads.filter((l) => l.status === 'Won')
    const bySource = {}; leads.forEach((l) => { bySource[l.source || '—'] = (bySource[l.source || '—'] || 0) + 1 })
    const byMethod = {}; receipts.forEach((x) => { byMethod[x.method || '—'] = (byMethod[x.method || '—'] || 0) + (x.amount || 0) })
    const topCustomers = [...customers].sort((a, b) => (b.spend || 0) - (a.spend || 0)).slice(0, 5)
    return {
      revenue, won: won.length,
      conversion: leads.length ? Math.round((won.length / leads.length) * 1000) / 10 : 0,
      avgOrder: receipts.length ? revenue / receipts.length : 0,
      bySource: Object.entries(bySource).sort((a, b) => b[1] - a[1]),
      byMethod: Object.entries(byMethod).sort((a, b) => b[1] - a[1]),
      topCustomers,
    }
  }, [customers, leads, receipts])

  const maxSource = Math.max(1, ...r.bySource.map((x) => x[1]))
  const maxMethod = Math.max(1, ...r.byMethod.map((x) => x[1]))

  return (
    <div className="crm-shell h-screen overflow-hidden grid">
      <SidebarCrm active="reports" />
      <div className="flex h-screen flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 sm:px-6">
          <div className="flex min-w-0 shrink items-center gap-3 text-slate-700">
            <BackButton />
            <span className="hidden h-9 w-9 place-items-center rounded-lg bg-violet-50 text-violet-600 sm:grid">📊</span>
            <div><h1 className="truncate text-lg font-bold leading-tight">Reports</h1><p className="hidden truncate text-[11px] text-slate-500 sm:block">Live analytics from your CRM data.</p></div>
          </div>
          <TopBarUser />
        </header>

        <main className="nice-scroll flex-1 overflow-y-auto px-6 py-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Card label="Customers" value={customers.length} icon="👥" color="bg-violet-50 text-violet-600" />
            <Card label="Leads" value={leads.length} icon="🎯" color="bg-sky-50 text-sky-600" />
            <Card label="Won Leads" value={r.won} icon="🏆" color="bg-emerald-50 text-emerald-600" />
            <Card label="Conversion" value={`${r.conversion}%`} icon="📈" color="bg-pink-50 text-pink-600" />
            <Card label="Receipts" value={receipts.length} icon="📄" color="bg-amber-50 text-amber-600" />
            <Card label="Revenue" value={fmt$(r.revenue)} icon="💵" color="bg-emerald-50 text-emerald-600" sub={`Avg ${fmt$(r.avgOrder)}`} />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="mb-4 text-sm font-bold">Leads by Source</h3>
              <div className="space-y-3">
                {r.bySource.length === 0 ? <p className="text-sm text-slate-400">No lead data.</p> :
                  r.bySource.map(([k, v]) => <Bar key={k} label={k} value={v} max={maxSource} color="bg-sky-500" />)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="mb-4 text-sm font-bold">Revenue by Payment Method</h3>
              <div className="space-y-3">
                {r.byMethod.length === 0 ? <p className="text-sm text-slate-400">No receipt data.</p> :
                  r.byMethod.map(([k, v]) => <Bar key={k} label={k} value={Math.round(v)} max={maxMethod} color="bg-emerald-500" />)}
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="mb-3 text-sm font-bold">Top Customers by Lifetime Spend</h3>
            {r.topCustomers.length === 0 ? <p className="text-sm text-slate-400">No customer data.</p> : (
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-2 text-left">Customer</th><th className="py-2 text-left">Type</th><th className="py-2 text-left">Orders</th><th className="py-2 text-right">Spend</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {r.topCustomers.map((c) => (
                    <tr key={c.id}><td className="py-2.5 font-semibold">{c.name}</td><td className="py-2.5 text-slate-600">{c.type || '—'}</td><td className="py-2.5">{c.orders ?? '—'}</td><td className="py-2.5 text-right font-semibold">{fmt$(c.spend || 0)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
