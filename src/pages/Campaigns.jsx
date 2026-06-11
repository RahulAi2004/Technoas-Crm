import { useState } from 'react'
import SidebarCrm from '../components/SidebarCrm.jsx'
import TopBarUser from '../components/TopBarUser.jsx'
import BackButton from '../components/BackButton.jsx'
import { useToast } from '../components/ToastContext.jsx'

// Starter campaigns view. Wire to a campaigns table + sender in a later phase.
const SAMPLE = [
  { id: 1, name: 'Graduation Season Promo', channel: 'WhatsApp', status: 'Draft', audience: 'Schools', sent: 0 },
  { id: 2, name: 'Summer DTF Discount', channel: 'Instagram', status: 'Draft', audience: 'Brands', sent: 0 },
]
const STATUS_CLS = { Draft: 'bg-slate-100 text-slate-600', Active: 'bg-emerald-50 text-emerald-700', Scheduled: 'bg-sky-50 text-sky-700' }

export default function Campaigns() {
  const toast = useToast()
  const [items] = useState(SAMPLE)
  return (
    <div className="h-screen overflow-hidden grid" style={{ gridTemplateColumns: '240px 1fr' }}>
      <SidebarCrm active="campaigns" />
      <div className="flex h-screen flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
          <div className="flex items-center gap-3 text-slate-700">
            <BackButton />
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-pink-50 text-pink-600">📣</span>
            <div><h1 className="text-lg font-bold leading-tight">Campaigns</h1><p className="text-[11px] text-slate-500">Broadcast offers across your channels.</p></div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => toast('Campaign builder — coming next', 'info')} className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700">+ New Campaign</button>
            <TopBarUser />
          </div>
        </header>

        <main className="nice-scroll flex-1 overflow-y-auto px-6 py-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs text-slate-500">Total Campaigns</div><div className="mt-1 text-2xl font-extrabold">{items.length}</div></div>
            <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs text-slate-500">Active</div><div className="mt-1 text-2xl font-extrabold">{items.filter((c) => c.status === 'Active').length}</div></div>
            <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs text-slate-500">Drafts</div><div className="mt-1 text-2xl font-extrabold">{items.filter((c) => c.status === 'Draft').length}</div></div>
            <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs text-slate-500">Messages Sent</div><div className="mt-1 text-2xl font-extrabold">{items.reduce((a, c) => a + c.sent, 0)}</div></div>
          </div>

          <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>
                <th className="px-3 py-3 text-left">Campaign</th><th className="px-3 py-3 text-left">Channel</th><th className="px-3 py-3 text-left">Audience</th><th className="px-3 py-3 text-left">Status</th><th className="px-3 py-3 text-left">Sent</th><th className="px-3 py-3 text-right">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-3 py-3 font-semibold">{c.name}</td>
                    <td className="px-3 py-3">{c.channel}</td>
                    <td className="px-3 py-3">{c.audience}</td>
                    <td className="px-3 py-3"><span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${STATUS_CLS[c.status]}`}>{c.status}</span></td>
                    <td className="px-3 py-3">{c.sent}</td>
                    <td className="px-3 py-3 text-right"><button onClick={() => toast(`Edit "${c.name}" — coming next`, 'info')} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold hover:bg-slate-50">Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  )
}
