import { useEffect, useState } from 'react'
import SidebarCrm from '../components/SidebarCrm.jsx'
import TopBarUser from '../components/TopBarUser.jsx'
import { api, getToken } from '../lib/api.js'

const FALLBACK_ARTWORKS = [
  { id:1, name:'Eagles Logo - Full Front', type:'Artwork', order:'#ORD-1042', customers:11, product:'T-Shirts, Hoodies', date:'May 10, 2024', fav:true,  bg:'bg-slate-900' },
  { id:2, name:'Graduation 2025 Hoodie',   type:'Artwork', order:'#ORD-1015', customers:6,  product:'Hoodies',           date:'May 10, 2024', fav:true,  bg:'bg-slate-800' },
  { id:3, name:'Football Jersey Front',    type:'Artwork', order:'#ORD-1008', customers:4,  product:'Jerseys',           date:'May 9, 2024',  fav:true,  bg:'bg-slate-900' },
  { id:4, name:'Stronger Than Yesterday',  type:'Artwork', order:'#ORD-0992', customers:3,  product:'T-Shirts',          date:'May 8, 2024',  fav:true,  bg:'bg-slate-800' },
  { id:5, name:'Hoodie Mockup - Front',    type:'Mockup',  order:'#ORD-1042', customers:6,  product:'Hoodies',           date:'May 7, 2024',  fav:true,  bg:'bg-slate-300' },
  { id:6, name:'T-Shirt Mockup - Back',    type:'Mockup',  order:'#ORD-1001', customers:7,  product:'T-Shirts',          date:'May 7, 2024',  fav:true,  bg:'bg-slate-900' },
  { id:7, name:'Gang Sheet - Eagles Set',  type:'Gang Sheet', order:'#ORD-0985', customers:5, product:'DTF Transfers',   date:'May 6, 2024',  fav:true,  bg:'bg-amber-700' },
  { id:8, name:'Gang Sheet - Graduation',  type:'Gang Sheet', order:'#ORD-0978', customers:8, product:'DTF Transfers',   date:'May 6, 2024',  fav:true,  bg:'bg-slate-700' },
]

const stat = (label, value, color) => (
  <div className="rounded-xl border border-slate-200 bg-white p-3">
    <div className="flex items-center gap-2">
      <span className={`grid h-8 w-8 place-items-center rounded-lg ${color}`}>🖼</span>
      <div><div className="text-[10px] text-slate-500">{label}</div><div className="text-base font-extrabold">{value}</div></div>
    </div>
  </div>
)

const typeCls = (t) => ({
  Artwork: 'bg-violet-50 text-violet-700',
  Mockup:  'bg-emerald-50 text-emerald-700',
  'Gang Sheet': 'bg-amber-50 text-amber-700',
}[t] || 'bg-slate-100 text-slate-700')

const fromServerArt = (a) => ({
  id: a.id,
  name: a.name,
  type: a.type,
  order: a.order_no || a.order,
  customers: a.customers ?? 0,
  product: a.product,
  date: a.date,
  fav: !!a.fav,
  bg: a.bg,
})

export default function ArtworkVault() {
  const [data, setData] = useState(FALLBACK_ARTWORKS)
  const [active, setActive] = useState(FALLBACK_ARTWORKS[0])

  useEffect(() => {
    let active = true
    const reload = () => api.get('/api/artworks')
      .then((rows) => {
        const mapped = rows.map(fromServerArt)
        if (active && mapped.length) { setData(mapped); setActive(mapped[0]) }
      })
      .catch(() => { /* keep fallback */ })
    reload()
    const token = getToken()
    const stream = token ? new EventSource(`/api/stream?token=${encodeURIComponent(token)}`) : null
    if (stream) stream.onmessage = (event) => {
      try { if (JSON.parse(event.data)?.type === 'artwork_vault_changed') reload() } catch { /* ignore keepalive */ }
    }
    return () => { active = false; stream?.close() }
  }, [])

  return (
    <div className="crm-shell h-screen overflow-hidden grid">
      <SidebarCrm active="artwork-vault" />
      <div className="flex h-screen flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="hidden h-9 w-9 place-items-center rounded-lg bg-violet-50 text-violet-600 sm:grid">🖼</span>
            <div><h1 className="truncate text-lg font-bold leading-tight">Artwork Vault</h1><p className="hidden truncate text-[11px] text-slate-500 sm:block">Manage and organize all artwork, mockups and gang sheets in one place.</p></div>
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-4">
            <div className="relative min-w-0 flex-1 sm:flex-none"><span className="pointer-events-none absolute inset-y-0 left-0 grid place-items-center pl-3 text-slate-400"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg></span><input type="search" placeholder="Search artwork, niche, product..." className="w-full sm:w-72 rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-12 text-sm" /><kbd className="pointer-events-none absolute inset-y-0 right-2 my-auto grid h-6 place-items-center rounded border border-slate-200 bg-white px-1.5 text-[10px] font-semibold text-slate-500">⌘K</kbd></div>
            <TopBarUser />
          </div>
        </header>

        <main className="nice-scroll flex-1 overflow-y-auto px-6 py-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {stat('Total Artworks', '2,482', 'bg-violet-50 text-violet-600')}
            {stat('Artworks', '1,842', 'bg-sky-50 text-sky-600')}
            {stat('Mockups', '412', 'bg-emerald-50 text-emerald-600')}
            {stat('Gang Sheets', '228', 'bg-amber-50 text-amber-600')}
            {stat('Favorites', '128', 'bg-pink-50 text-pink-600')}
            {stat('Most Used', '248', 'bg-yellow-50 text-yellow-600')}
            {stat('Recently Used', '156', 'bg-orange-50 text-orange-600')}
            {stat('Archived', '84', 'bg-slate-100 text-slate-600')}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
            <div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-7">
                  <div className="lg:col-span-2"><label className="mb-1 block text-[11px] font-semibold text-slate-500">Search Artwork</label><div className="relative"><input placeholder="Search by name, keyword, niche..." className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 px-3 text-sm" /><span className="pointer-events-none absolute inset-y-0 right-2 grid place-items-center text-slate-400"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg></span></div></div>
                  {['Artwork Type','Order No.','Customer','Product','Artwork Niche','Color'].map((l) => (
                    <div key={l}><label className="mb-1 block text-[11px] font-semibold text-slate-500">{l}</label><select className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm"><option>All {l.split(' ').pop()}s</option></select></div>
                  ))}
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <button className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg> Filters</button>
                  <button className="text-xs font-semibold text-slate-500 hover:text-slate-700">✕ Clear All</button>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-b border-slate-200">
                <div className="flex flex-wrap gap-2">
                  {[['All Artworks',2482,true],['Artworks',1842],['Mockups',412],['Gang Sheets',228],['Favorites',128],['Most Used',248],['Recently Used',156],['Archived',84]].map(([l, n, on], i) => (
                    <button key={i} className={`whitespace-nowrap border-b-2 px-2 py-2.5 text-xs ${on ? 'border-brand-500 font-semibold text-brand-600' : 'border-transparent font-medium text-slate-500 hover:text-slate-700'}`}>{l} <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${on ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600'}`}>{n.toLocaleString()}</span></button>
                  ))}
                </div>
                <div className="flex items-center gap-2 pb-2">
                  <button className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold">Sort by: Last Added <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg></button>
                  <div className="flex overflow-hidden rounded-lg border border-slate-200">
                    <button className="grid h-8 w-8 place-items-center bg-brand-600 text-white"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg></button>
                    <button className="grid h-8 w-8 place-items-center hover:bg-slate-50"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/></svg></button>
                  </div>
                </div>
              </div>

              <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2 text-left"><input type="checkbox"/></th><th className="px-3 py-2 text-left">Artwork</th><th className="px-3 py-2 text-left">Artwork Name</th><th className="px-3 py-2 text-left">Artwork Type</th><th className="px-3 py-2 text-left">Order No.</th><th className="px-3 py-2 text-left">Customer</th><th className="px-3 py-2 text-left">Product</th><th className="px-3 py-2 text-left">Added On</th><th className="px-3 py-2 text-right">Actions</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.map((a) => (
                      <tr key={a.id} onClick={() => setActive(a)} className={`cursor-pointer hover:bg-slate-50 ${active.id === a.id ? 'bg-brand-50/40' : ''}`}>
                        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}><input type="checkbox"/></td>
                        <td className="px-3 py-2.5"><div className={`grid h-12 w-16 place-items-center rounded-md ${a.bg} text-white text-[8px] font-bold`}>{a.name.split(' ')[0].toUpperCase()}</div></td>
                        <td className="px-3 py-2.5"><div className="font-semibold inline-flex items-center gap-1">{a.name} {a.fav && <span className="text-amber-500">⭐</span>}</div></td>
                        <td className="px-3 py-2.5"><span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${typeCls(a.type)}`}>{a.type}</span></td>
                        <td className="px-3 py-2.5 text-sm">{a.order}</td>
                        <td className="px-3 py-2.5 text-sm"><span className="inline-flex items-center gap-1">👥 {a.customers}</span></td>
                        <td className="px-3 py-2.5 text-sm">{a.product}</td>
                        <td className="px-3 py-2.5 text-sm">{a.date}</td>
                        <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}><button className="grid h-7 w-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                <span>Showing 1 to 8 of 2,482 artworks</span>
                <div className="flex items-center gap-1">
                  <button className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg></button>
                  {[1,2,3].map(n => <button key={n} className={`grid h-8 w-8 place-items-center rounded-lg text-sm font-semibold ${n === 1 ? 'bg-brand-600 text-white' : 'border border-slate-200 hover:bg-slate-50'}`}>{n}</button>)}
                  <span>…</span>
                  <button className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-sm font-semibold">311</button>
                  <button className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg></button>
                </div>
                <div className="flex items-center gap-1"><span>Show</span><select className="rounded-md border border-slate-200 bg-white px-1.5 py-1"><option>8</option></select><span>per page</span></div>
              </div>
            </div>

            <aside className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-bold">Print Preview</h3><button className="grid h-7 w-7 place-items-center rounded-md hover:bg-slate-100">✕</button></div>
              <div className="text-xs"><div className="font-semibold">{active.name}</div><div className="text-slate-500">Artwork No: {active.order}</div></div>
              <div className={`mt-3 grid h-56 place-items-center rounded-lg ${active.bg} text-white`}>
                <span className="text-2xl font-extrabold tracking-widest">{active.name.split(' ')[0].toUpperCase()}</span>
              </div>
              <div className="mt-3 flex items-center justify-center gap-2 text-slate-500">
                <button className="grid h-7 w-7 place-items-center rounded-md hover:bg-slate-100">🔍-</button>
                <span className="text-xs font-semibold">100%</span>
                <button className="grid h-7 w-7 place-items-center rounded-md hover:bg-slate-100">🔍+</button>
                <button className="grid h-7 w-7 place-items-center rounded-md hover:bg-slate-100">⛶</button>
              </div>
              <div className="mt-4 text-xs">
                <div className="mb-2 font-semibold">Artwork Details</div>
                <dl className="space-y-1.5">
                  <div className="flex justify-between"><dt className="text-slate-500">Size</dt><dd className="font-semibold">12" W × 8" H</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">File Type</dt><dd className="font-semibold">PNG</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Resolution</dt><dd className="font-semibold">300 DPI</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Added On</dt><dd className="font-semibold">{active.date}</dd></div>
                </dl>
              </div>
              <button className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-100">⬇ Download Artwork</button>
            </aside>
          </div>
        </main>
      </div>
    </div>
  )
}
