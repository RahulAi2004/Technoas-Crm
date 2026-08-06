import { useEffect, useMemo, useState } from 'react'
import SidebarCrm from '../components/SidebarCrm.jsx'
import TopBarUser from '../components/TopBarUser.jsx'
import BackButton from '../components/BackButton.jsx'
import { useToast } from '../components/ToastContext.jsx'
import { fmt$ } from '../data/customers.js'
import { api } from '../lib/api.js'

const STATUS_CLS = {
  Completed: 'bg-emerald-50 text-emerald-700',
  Processing: 'bg-sky-50 text-sky-700',
  'In Production': 'bg-amber-50 text-amber-700',
  Cancelled: 'bg-rose-50 text-rose-700',
  Pending: 'bg-slate-100 text-slate-600',
}

export default function Orders() {
  const toast = useToast()
  const [orders, setOrders] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/orders')
      .then((rows) => setOrders(rows))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return orders
    return orders.filter((o) => JSON.stringify(o).toLowerCase().includes(q))
  }, [query, orders])

  const totalValue = orders.reduce((a, o) => a + (o.amount || o.total || 0), 0)

  return (
    <div className="crm-shell h-screen overflow-hidden grid">
      <SidebarCrm active="orders" />
      <div className="flex h-screen flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 sm:px-6">
          <div className="flex min-w-0 shrink items-center gap-3 text-slate-700">
            <BackButton />
            <span className="hidden h-9 w-9 place-items-center rounded-lg bg-violet-50 text-violet-600 sm:grid">🛒</span>
            <div><h1 className="truncate text-lg font-bold leading-tight">Orders</h1><p className="hidden truncate text-[11px] text-slate-500 sm:block">All orders across customers.</p></div>
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-4">
            <div className="relative min-w-0 flex-1 sm:flex-none">
              <span className="pointer-events-none absolute inset-y-0 left-0 grid place-items-center pl-3 text-slate-400"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg></span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} type="search" placeholder="Search orders..." className="w-full sm:w-72 rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:bg-white" />
            </div>
            <TopBarUser />
          </div>
        </header>

        <main className="nice-scroll flex-1 overflow-y-auto px-6 py-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs text-slate-500">Total Orders</div><div className="mt-1 text-2xl font-extrabold">{orders.length}</div></div>
            <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs text-slate-500">Total Value</div><div className="mt-1 text-2xl font-extrabold">{fmt$(totalValue)}</div></div>
            <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs text-slate-500">Completed</div><div className="mt-1 text-2xl font-extrabold">{orders.filter((o) => o.status === 'Completed').length}</div></div>
            <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs text-slate-500">In Production</div><div className="mt-1 text-2xl font-extrabold">{orders.filter((o) => o.status === 'In Production' || o.status === 'Processing').length}</div></div>
          </div>

          <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            {rows.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <div className="text-3xl">🛒</div>
                <p className="mt-2 text-sm font-semibold text-slate-700">{loading ? 'Loading…' : 'No orders yet'}</p>
                <p className="mt-1 text-xs text-slate-500">Orders will appear here once created. You can also view them from the Customer 360 → Orders tab.</p>
                <button onClick={() => toast('New Order flow — coming next', 'info')} className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">+ New Order</button>
              </div>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>
                  <th className="px-3 py-3 text-left">Order #</th><th className="px-3 py-3 text-left">Customer</th><th className="px-3 py-3 text-left">Products</th>
                  <th className="px-3 py-3 text-left">Amount</th><th className="px-3 py-3 text-left">Status</th><th className="px-3 py-3 text-left">Date</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-50">
                      <td className="px-3 py-3 font-semibold text-brand-600">{o.order_no || o.id}</td>
                      <td className="px-3 py-3">{o.customer || o.customer_id || '—'}</td>
                      <td className="px-3 py-3">{o.products || '—'}</td>
                      <td className="px-3 py-3 font-semibold">{fmt$(o.amount || o.total || 0)}</td>
                      <td className="px-3 py-3"><span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${STATUS_CLS[o.status] || 'bg-slate-100 text-slate-600'}`}>{o.status || '—'}</span></td>
                      <td className="px-3 py-3 text-slate-600">{o.date || o.created_at?.slice(0, 10) || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
