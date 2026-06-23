import { useEffect, useMemo, useState } from 'react'
import SidebarCrm from '../components/SidebarCrm.jsx'
import TopBarUser from '../components/TopBarUser.jsx'
import { fmt$ } from '../data/customers.js'
import { api } from '../lib/api.js'

const FALLBACK_RECEIPTS = [
  { no:'RCT-2024-1258', order:'#ORD-1042', customer:'John Smith',    orders:1, date:'May 15, 2024', time:'10:30 AM', method:'Bank Transfer', methodIcon:'🏦', amount:1250, status:'Paid', note:'Payment for', note2:'Eagles Logo - Full Front' },
  { no:'RCT-2024-1257', order:'#ORD-1041', customer:'Sarah Williams', orders:2, date:'May 14, 2024', time:'03:15 PM', method:'Credit Card',   methodIcon:'💳', amount:980,  status:'Paid', note:'Payment for', note2:'Graduation 2025 Hoodie' },
  { no:'RCT-2024-1256', order:'#ORD-1040', customer:'Michael Brown',  orders:1, date:'May 13, 2024', time:'11:20 AM', method:'PayPal',        methodIcon:'P',  amount:750,  status:'Paid', note:'Payment for', note2:'Football Jersey Front' },
  { no:'RCT-2024-1255', order:'#ORD-1039', customer:'Emily Davis',    orders:3, date:'May 12, 2024', time:'02:45 PM', method:'Bank Transfer', methodIcon:'🏦', amount:2100, status:'Paid', note:'Bulk order payment', note2:'' },
  { no:'RCT-2024-1254', order:'#ORD-1038', customer:'David Wilson',   orders:1, date:'May 11, 2024', time:'09:10 AM', method:'Credit Card',   methodIcon:'💳', amount:420,  status:'Paid', note:'Payment for', note2:'T-Shirt Mockup' },
  { no:'RCT-2024-1253', order:'#ORD-1037', customer:'Lisa Anderson',  orders:2, date:'May 10, 2024', time:'01:05 PM', method:'Debit Card',    methodIcon:'💳', amount:1850, status:'Paid', note:'Payment for', note2:'Gang Sheet Order' },
  { no:'RCT-2024-1252', order:'#ORD-1036', customer:'Chris Taylor',   orders:1, date:'May 9, 2024',  time:'04:30 PM', method:'Bank Transfer', methodIcon:'🏦', amount:625,  status:'Paid', note:'Rush order payment', note2:'' },
  { no:'RCT-2024-1251', order:'#ORD-1035', customer:'Jessica Martinez', orders:2, date:'May 8, 2024', time:'10:15 AM', method:'PayPal',      methodIcon:'P',  amount:1320, status:'Paid', note:'Payment for', note2:'Hoodie Mockup' },
]

const stat = (label, value, sub, icon, color) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4">
    <div className="flex items-center justify-between">
      <span className={`grid h-9 w-9 place-items-center rounded-lg ${color}`}>{icon}</span>
      <span className="text-[11px] text-slate-500">{label}</span>
    </div>
    <div className="mt-3 text-xl font-extrabold">{value}</div>
    <div className="text-[11px] text-slate-500">{sub}</div>
  </div>
)

// Map server (snake_case) → JSX (camelCase short)
const fromServer = (r) => ({
  no:         r.receipt_no || r.no,
  order:      r.order_no   || r.order,
  customer:   r.customer,
  orders:     r.customer_orders ?? r.orders ?? 1,
  date:       r.date,
  time:       r.time,
  method:     r.method,
  methodIcon: r.method_icon || r.methodIcon,
  amount:     r.amount,
  status:     r.status,
  note:       r.note,
  note2:      r.note2,
})

export default function Receipts() {
  const [data, setData] = useState(FALLBACK_RECEIPTS)
  const [active, setActive] = useState(FALLBACK_RECEIPTS[0])
  const [query, setQuery] = useState('')

  useEffect(() => {
    api.get('/api/receipts')
      .then((rows) => {
        const mapped = rows.map(fromServer)
        setData(mapped)
        if (mapped.length) setActive(mapped[0])
      })
      .catch(() => { /* keep fallback */ })
  }, [])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return data
    return data.filter((r) =>
      (r.no || '').toLowerCase().includes(q) ||
      (r.customer || '').toLowerCase().includes(q) ||
      (r.order || '').toLowerCase().includes(q)
    )
  }, [query, data])

  return (
    <div className="h-screen overflow-hidden grid" style={{ gridTemplateColumns: '240px 1fr' }}>
      <SidebarCrm active="receipts" />
      <div className="flex h-screen flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
          <div className="flex items-center gap-3 text-slate-700">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-violet-50 text-violet-600">📄</span>
            <div>
              <h1 className="text-lg font-bold leading-tight">Receipts</h1>
              <p className="text-[11px] text-slate-500">View and manage all payment receipts.</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative"><span className="pointer-events-none absolute inset-y-0 left-0 grid place-items-center pl-3 text-slate-400"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg></span><input type="search" placeholder="Search receipts by receipt no., order no., c..." className="w-80 rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-12 text-sm" /><kbd className="pointer-events-none absolute inset-y-0 right-2 my-auto grid h-6 place-items-center rounded border border-slate-200 bg-white px-1.5 text-[10px] font-semibold text-slate-500">⌘K</kbd></div>
            <button className="relative grid h-10 w-10 place-items-center rounded-full hover:bg-slate-100"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg></button>
            <TopBarUser />
          </div>
        </header>

        <main className="nice-scroll flex-1 overflow-y-auto px-6 py-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {stat('All time', '1,258', 'Total Receipts', '📄', 'bg-violet-50 text-violet-600')}
            {stat('All time', '$187,420.50', 'Total Amount Received', '💵', 'bg-emerald-50 text-emerald-600')}
            {stat('May 1 – May 31, 2024', '$22,540.00', 'This Month', '📅', 'bg-sky-50 text-sky-600')}
            {stat('May 15, 2024', '$1,250.00', 'Today', '📊', 'bg-amber-50 text-amber-600')}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
            <div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                  <div className="md:col-span-2"><label className="mb-1 block text-[11px] font-semibold text-slate-500">Search Receipt</label><div className="relative"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by receipt no., order no., customer..." className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 px-3 text-sm" /><span className="pointer-events-none absolute inset-y-0 right-2 grid place-items-center text-slate-400"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg></span></div></div>
                  <div><label className="mb-1 block text-[11px] font-semibold text-slate-500">Date Range</label><select className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm"><option>May 1 – May 31, 2024</option></select></div>
                  <div><label className="mb-1 block text-[11px] font-semibold text-slate-500">Payment Method</label><select className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm"><option>All Methods</option></select></div>
                  <div><label className="mb-1 block text-[11px] font-semibold text-slate-500">Customer</label><select className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm"><option>All Customers</option></select></div>
                  <div><label className="mb-1 block text-[11px] font-semibold text-slate-500">Status</label><select className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm"><option>All Status</option></select></div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-b border-slate-200">
                <div className="flex gap-4">
                  <button className="border-b-2 border-brand-500 px-2 py-2.5 text-sm font-semibold text-brand-600">All Receipts</button>
                  <button className="border-b-2 border-transparent px-2 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-700">Refund Receipts <span className="ml-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">18</span></button>
                </div>
                <div className="flex items-center gap-2 pb-2">
                  <button className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg> Export</button>
                  <div className="flex overflow-hidden rounded-lg border border-slate-200"><button className="grid h-8 w-8 place-items-center bg-brand-600 text-white"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg></button><button className="grid h-8 w-8 place-items-center hover:bg-slate-50"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/></svg></button></div>
                </div>
              </div>

              <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr><th className="px-3 py-2 text-left"><input type="checkbox"/></th><th className="px-3 py-2 text-left">Receipt No.</th><th className="px-3 py-2 text-left">Order No.</th><th className="px-3 py-2 text-left">Customer</th><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Payment Method</th><th className="px-3 py-2 text-left">Amount</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-left">Notes</th><th className="px-3 py-2 text-right">Actions</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r) => (
                      <tr key={r.no} onClick={() => setActive(r)} className={`cursor-pointer hover:bg-slate-50 ${active.no === r.no ? 'bg-brand-50/40' : ''}`}>
                        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}><input type="checkbox"/></td>
                        <td className="px-3 py-2.5"><span className="inline-flex items-center gap-1.5 font-semibold text-brand-600"><span className="text-violet-500">📄</span>{r.no}</span></td>
                        <td className="px-3 py-2.5 text-sm">{r.order}</td>
                        <td className="px-3 py-2.5"><div className="font-semibold">{r.customer}</div><div className="text-[10px] text-slate-500">({r.orders} Order{r.orders > 1 ? 's' : ''})</div></td>
                        <td className="px-3 py-2.5 text-sm">{r.date}<div className="text-[10px] text-slate-400">{r.time}</div></td>
                        <td className="px-3 py-2.5"><span className="inline-flex items-center gap-1.5 text-xs">{r.methodIcon} {r.method}</span></td>
                        <td className="px-3 py-2.5 font-semibold text-emerald-600">{fmt$(r.amount)}</td>
                        <td className="px-3 py-2.5"><span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">● Paid</span></td>
                        <td className="px-3 py-2.5 text-xs">{r.note}<div className="font-semibold">{r.note2}</div></td>
                        <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}><button className="grid h-7 w-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                <span>Showing 1 to 8 of 1,258 receipts</span>
                <div className="flex items-center gap-1">
                  <button className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg></button>
                  {[1,2,3].map(n => <button key={n} className={`grid h-8 w-8 place-items-center rounded-lg text-sm font-semibold ${n === 1 ? 'bg-brand-600 text-white' : 'border border-slate-200 hover:bg-slate-50'}`}>{n}</button>)}
                  <span>…</span>
                  <button className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-sm font-semibold">158</button>
                  <button className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg></button>
                </div>
                <div className="flex items-center gap-1"><span>Show</span><select className="rounded-md border border-slate-200 bg-white px-1.5 py-1"><option>10</option></select><span>per page</span></div>
              </div>
            </div>

            {/* Receipt Preview */}
            <aside className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-bold">Receipt Preview</h3><button className="grid h-7 w-7 place-items-center rounded-md hover:bg-slate-100">✕</button></div>
              <div className="mb-3 flex items-center justify-between"><div className="text-xs"><div className="text-slate-500">Receipt No.</div><div className="font-semibold">{active.no}</div></div><span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">● Paid</span></div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="mb-3 inline-flex items-center gap-1.5 text-sm font-bold"><span className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-indigo-400 to-indigo-600 text-white text-xs font-black">D</span>Decoinks</div>
                <h4 className="mb-3 text-base font-extrabold">Receipt</h4>
                <dl className="space-y-1.5 text-xs">
                  <div className="flex justify-between"><dt className="text-slate-500">Receipt No.</dt><dd className="font-semibold">{active.no}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Date</dt><dd className="font-semibold">{active.date}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Payment Method</dt><dd className="font-semibold">{active.method}</dd></div>
                </dl>
                <hr className="my-3 border-slate-200"/>
                <dl className="space-y-1.5 text-xs">
                  <div className="flex justify-between"><dt className="text-slate-500">Customer</dt><dd className="font-semibold">{active.customer}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Order No.</dt><dd className="font-semibold text-brand-600">{active.order}</dd></div>
                </dl>
                <hr className="my-3 border-slate-200"/>
                <div className="text-xs"><div className="text-slate-500">Description</div><div className="font-semibold">{active.note2 || active.note}</div></div>
                <div className="mt-3 flex justify-between text-xs"><dt className="text-slate-500">Amount</dt><dd className="font-semibold">{fmt$(active.amount)}</dd></div>
                <div className="mt-3 flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 text-emerald-700"><span className="text-sm font-bold">Total Paid</span><span className="text-base font-extrabold">{fmt$(active.amount)}</span></div>
              </div>
              <button className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-100">⬇ Download Receipt</button>
            </aside>
          </div>
        </main>
      </div>
    </div>
  )
}
