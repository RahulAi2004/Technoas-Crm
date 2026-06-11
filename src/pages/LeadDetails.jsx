import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import SidebarCrm from '../components/SidebarCrm.jsx'
import BackButton from '../components/BackButton.jsx'
import TopBarUser from '../components/TopBarUser.jsx'
import { LEADS as FALLBACK_LEADS, SCORE_CLS } from '../data/leads.js'
import { fmt$ } from '../data/customers.js'
import { api } from '../lib/api.js'

const TABS = [
  ['conversation', 'Conversation'],
  ['quotations',   'Quotations',  2],
  ['artworks',     'Artworks',    1],
  ['orders',       'Orders',      1],
  ['tasks',        'Tasks',       2],
  ['notes',        'Notes'],
  ['files',        'Files'],
  ['activity',     'Activity'],
]

export default function LeadDetails() {
  const { id } = useParams()
  const [lead, setLead] = useState(() => FALLBACK_LEADS.find(l => l.id === id) || FALLBACK_LEADS[0])
  const [tab, setTab] = useState('conversation')

  useEffect(() => {
    if (!id) return
    api.get(`/api/leads/${id}`)
      .then((row) => setLead(row))
      .catch(() => { /* keep fallback */ })
  }, [id])

  return (
    <div className="h-screen overflow-hidden grid" style={{ gridTemplateColumns: '240px 1fr' }}>
      <SidebarCrm active="leads" />
      <div className="flex h-screen flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
          <nav className="flex items-center gap-2 text-sm">
            <BackButton />
            <span className="text-slate-500">CRM</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-300"><path d="m9 18 6-6-6-6"/></svg>
            <Link to="/leads" className="text-slate-500 hover:text-slate-700">Leads</Link>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-300"><path d="m9 18 6-6-6-6"/></svg>
            <span className="font-semibold">Lead Details</span>
          </nav>
          <div className="flex items-center gap-3">
            <input type="search" placeholder="Search leads, orders..." className="w-72 rounded-lg border border-slate-200 bg-slate-50 py-2 px-3 text-sm" />
            <button className="relative grid h-10 w-10 place-items-center rounded-full hover:bg-slate-100"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg><span className="absolute -top-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full bg-rose-500 text-[10px] font-bold text-white">6</span></button>
            <TopBarUser role="Admin" />
          </div>
        </header>

        <main className="nice-scroll flex-1 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
            <div>
              {/* Lead header */}
              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-4">
                    <div className="relative">
                      <span className={`grid h-20 w-20 place-items-center rounded-full ${lead.av} text-2xl font-bold text-white`}>{lead.initials}</span>
                      <span className="absolute -top-1 -right-1 text-lg">⭐</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2"><h1 className="text-2xl font-extrabold">{lead.name}</h1>{lead.badge && <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">🔥 Hot Lead</span>}</div>
                      <div className="text-sm text-slate-500">{lead.company} <span className="ml-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">Team Order</span></div>
                      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-600">
                        <span className="inline-flex items-center gap-1.5"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg> (312) 555-0192</span>
                        <span className="inline-flex items-center gap-1.5"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-10 5L2 7"/></svg> john.carter@springfieldhs.edu</span>
                        <span className="inline-flex items-center gap-1.5"><span className="grid h-4 w-4 place-items-center rounded-full bg-emerald-500 text-white"><svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24z"/></svg></span> (312) 555-0192</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50">✎ Edit Lead</button>
                    <button className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700">📞 Follow Up <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg></button>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-4 text-xs sm:grid-cols-5">
                  <div><div className="text-[11px] uppercase tracking-wide text-slate-400">Lead Source</div><div className="font-semibold">{lead.source}</div></div>
                  <div><div className="text-[11px] uppercase tracking-wide text-slate-400">Lead Created</div><div className="font-semibold">{lead.created} · {lead.createdTime}</div></div>
                  <div><div className="text-[11px] uppercase tracking-wide text-slate-400">Sales Agent</div><div className="flex items-center gap-1.5 font-semibold"><img alt="" src={`https://i.pravatar.cc/16?u=${encodeURIComponent(lead.agent)}`} className="h-4 w-4 rounded-full"/>{lead.agent}</div></div>
                  <div><div className="text-[11px] uppercase tracking-wide text-slate-400">Location</div><div className="font-semibold">Springfield, IL, USA</div></div>
                  <div><div className="text-[11px] uppercase tracking-wide text-slate-400">Estimated Value</div><div className="font-semibold text-emerald-600">{fmt$(lead.value)}</div></div>
                </div>
              </section>

              {/* Tabs */}
              <nav className="mt-5 flex items-center gap-2 overflow-x-auto border-b border-slate-200 px-1">
                {TABS.map(([id, lbl, n]) => (
                  <button key={id} onClick={() => setTab(id)} className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm ${tab === id ? 'border-brand-500 text-brand-600 font-semibold' : 'border-transparent text-slate-500 font-medium hover:text-slate-700'}`}>{lbl}{n !== undefined && <span className="ml-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">{n}</span>}</button>
                ))}
              </nav>

              {tab === 'conversation' && (
                <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="mb-3 flex items-center gap-2"><h3 className="text-sm font-bold">Conversation</h3></div>
                    <div className="mb-3 flex flex-wrap gap-1 text-xs">
                      {['💬 All','🟢','📨','📷','📧','⋯'].map((c, i) => <button key={i} className={`rounded-md px-2 py-1 ${i===0 ? 'bg-brand-50 text-brand-700 font-semibold' : 'bg-slate-100 text-slate-600'}`}>{c}</button>)}
                    </div>
                    <div className="space-y-3 text-sm">
                      <div className="text-center text-[11px] text-slate-500">May 12, 2024</div>
                      <div className="flex items-start gap-2"><span className={`grid h-7 w-7 place-items-center rounded-full ${lead.av} text-[10px] font-bold text-white`}>{lead.initials}</span><div className="max-w-md rounded-2xl rounded-tl-md bg-slate-50 px-3 py-2 text-xs">Hi, we need 50 hoodies for our school event. Can you send me a quote?<div className="mt-1 text-[10px] text-slate-400">10:24 AM</div></div></div>
                      <div className="flex items-start justify-end gap-2"><div className="max-w-md rounded-2xl rounded-tr-md bg-brand-50 px-3 py-2 text-xs"><strong>Hello John!</strong> Sure, I'd be happy to help. Could you please share the design and sizes needed?<div className="mt-1 text-right text-[10px] text-slate-500">10:26 AM ✓✓</div></div><img alt="" src="https://i.pravatar.cc/24?img=12" className="h-7 w-7 rounded-full"/></div>
                      <div className="flex items-start gap-2"><span className={`grid h-7 w-7 place-items-center rounded-full ${lead.av} text-[10px] font-bold text-white`}>{lead.initials}</span><div className="max-w-md space-y-1"><div className="rounded-2xl rounded-tl-md bg-slate-50 px-3 py-2 text-xs">Here is the design. We need sizes S-2XL.<div className="mt-1 text-[10px] text-slate-400">10:28 AM</div></div><div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 text-xs"><span className="grid h-7 w-7 place-items-center rounded bg-rose-50 text-rose-500">📄</span><div className="flex-1"><div className="font-semibold">springfield_event.png</div><div className="text-[10px] text-slate-500">2.4 MB · PNG</div></div></div></div></div>
                      <div className="flex items-start justify-end gap-2"><div className="max-w-md rounded-2xl rounded-tr-md bg-brand-50 px-3 py-2 text-xs">Thanks! I'll prepare the quote and send it shortly.<div className="mt-1 text-right text-[10px] text-slate-500">10:30 AM ✓✓</div></div><img alt="" src="https://i.pravatar.cc/24?img=12" className="h-7 w-7 rounded-full"/></div>
                      <div className="text-center text-[11px] text-slate-500">May 12, 2024</div>
                      <div className="flex items-center justify-center gap-1.5 text-[11px] text-emerald-600">✓ Quote #Q-1023 sent <span className="ml-1 text-slate-400">10:35 AM</span></div>
                    </div>
                    <div className="mt-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                      <input placeholder="Type a message..." className="flex-1 bg-transparent text-xs outline-none" />
                      <button className="text-slate-400">📎</button><button className="text-slate-400">😀</button>
                      <button className="rounded-lg bg-brand-600 px-3 py-1 text-xs font-semibold text-white">Send</button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-bold">Activity Timeline</h3><button className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold">Filter <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg></button></div>
                    <ul className="space-y-4 text-sm">
                      <li className="flex gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700">💬</span><div className="flex-1"><div className="flex justify-between"><div className="font-semibold">Chat started</div><span className="text-[11px] text-slate-400">May 12, 10:24 AM</span></div><div className="text-xs text-slate-500">Lead started conversation via WhatsApp</div></div></li>
                      <li className="flex gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-violet-100 text-violet-700">📄</span><div className="flex-1"><div className="flex justify-between"><div className="font-semibold">Quotation sent</div><span className="text-[11px] text-slate-400">May 12, 10:35 AM</span></div><div className="text-xs text-slate-500">Quote #Q-1023 sent for $1,250.00</div><span className="mt-1 inline-block rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Viewed</span><span className="ml-1 text-[10px] text-slate-400">May 12, 11:02 AM</span></div></li>
                      <li className="flex gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700">🎨</span><div className="flex-1"><div className="flex justify-between"><div className="font-semibold">Artwork sent</div><span className="text-[11px] text-slate-400">May 12, 02:15 PM</span></div><div className="text-xs text-slate-500">Design mockup sent for approval</div><span className="mt-1 inline-block rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Pending Approval</span></div></li>
                      <li className="flex gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sky-100 text-sky-700">📅</span><div className="flex-1"><div className="flex justify-between"><div className="font-semibold">Follow-up scheduled</div><span className="text-[11px] text-slate-400">May 14, 10:00 AM</span></div><div className="text-xs text-slate-500">Follow up on quote</div><span className="mt-1 inline-block rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">Upcoming</span></div></li>
                      <li className="flex gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-700">📝</span><div className="flex-1"><div className="flex justify-between"><div className="font-semibold">Note added</div><span className="text-[11px] text-slate-400">May 12, 02:20 PM</span></div><div className="text-xs text-slate-500">Customer prefers Gildan 18500 hoodie.</div><div className="text-[10px] text-slate-400">by Mike Johnson</div></div></li>
                    </ul>
                    <button className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 py-2 text-xs font-semibold text-brand-600 hover:bg-slate-50">+ Add Note</button>
                  </div>
                </div>
              )}

              {tab !== 'conversation' && (
                <div className="mt-4 rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                  Content for the <strong>{TABS.find(t => t[0] === tab)?.[1]}</strong> tab — coming in the next iteration.
                </div>
              )}

              {/* Lead Summary */}
              <section className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="mb-3 text-sm font-bold">Lead Summary</h3>
                <div className="grid grid-cols-2 gap-4 text-xs md:grid-cols-5">
                  <div><div className="text-[11px] text-slate-500">Products Interested</div><div className="mt-1 flex flex-wrap gap-1"><span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-semibold">Hoodies</span><span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-semibold">T-Shirts</span></div></div>
                  <div><div className="text-[11px] text-slate-500">Quantity</div><div className="mt-1 font-semibold">50 Pcs</div></div>
                  <div><div className="text-[11px] text-slate-500">Budget Range</div><div className="mt-1 font-semibold">$1,000 - $1,500</div></div>
                  <div><div className="text-[11px] text-slate-500">Preferred Date</div><div className="mt-1 font-semibold">May 25, 2024</div></div>
                  <div><div className="text-[11px] text-slate-500">Tags</div><div className="mt-1 flex flex-wrap gap-1"><span className="rounded-md bg-sky-50 px-1.5 py-0.5 font-semibold text-sky-700">School</span><span className="rounded-md bg-violet-50 px-1.5 py-0.5 font-semibold text-violet-700">Team Order</span><span className="rounded-md bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-700">Repeat Potential</span></div></div>
                </div>
              </section>
            </div>

            {/* Right rail */}
            <aside className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-2 flex items-center justify-between text-xs"><span className="font-semibold text-slate-500">Lead Score ⓘ</span></div>
                <div className="text-3xl font-extrabold"><span className={SCORE_CLS(lead.score)}>{lead.score}</span><span className="text-base text-slate-400">/100</span></div>
                <span className="mt-1 inline-block rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">⚡ High Potential</span>
                <div className="mt-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between"><span>Interest</span><span className="h-1.5 w-24 rounded-full bg-slate-100"><span className="block h-1.5 w-[85%] rounded-full bg-emerald-500"></span></span></div>
                  <div className="flex items-center justify-between"><span>Budget</span><span className="h-1.5 w-24 rounded-full bg-slate-100"><span className="block h-1.5 w-[70%] rounded-full bg-emerald-500"></span></span></div>
                  <div className="flex items-center justify-between"><span>Urgency</span><span className="h-1.5 w-24 rounded-full bg-slate-100"><span className="block h-1.5 w-[55%] rounded-full bg-amber-500"></span></span></div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-2 flex items-center justify-between"><h4 className="inline-flex items-center gap-1.5 text-sm font-bold"><span className="grid h-5 w-5 place-items-center rounded-md bg-violet-100 text-violet-600">✨</span>AI Lead Assistant<span className="rounded-md bg-violet-50 px-1 text-[9px] font-bold text-violet-700">Beta</span></h4></div>
                <div className="rounded-lg bg-rose-50 px-2 py-2 text-xs text-rose-700">🔥 This is a hot lead! High chance to convert.</div>
                <div className="mt-3">
                  <div className="text-xs font-semibold">Missing Information</div>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-slate-600">
                    <li>Shipping Address / ZIP Code</li>
                    <li>Exact Delivery Date</li>
                    <li>Payment Terms Preference</li>
                  </ul>
                </div>
                <div className="mt-3">
                  <div className="text-xs font-semibold">Suggested Next Actions</div>
                  <div className="mt-1 space-y-1">
                    <button className="flex w-full items-center justify-center gap-1.5 rounded-md border border-brand-200 bg-brand-50 px-2 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100">📤 Send Follow-up Message</button>
                    <button className="flex w-full items-center justify-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100">❓ Ask for Missing Info</button>
                    <button className="flex w-full items-center justify-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">+ Create New Quote</button>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <h4 className="mb-2 text-sm font-bold">Quick Actions</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button className="rounded-md border border-slate-200 bg-white px-2 py-2 font-semibold hover:bg-slate-50">📝 Create Quote</button>
                  <button className="rounded-md border border-slate-200 bg-white px-2 py-2 font-semibold hover:bg-slate-50">🎨 Send Artwork</button>
                  <button className="rounded-md border border-slate-200 bg-white px-2 py-2 font-semibold hover:bg-slate-50">📦 Create Order</button>
                  <button className="rounded-md border border-slate-200 bg-white px-2 py-2 font-semibold hover:bg-slate-50">📞 Schedule Call</button>
                </div>
                <button className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-100">👥 Convert to Customer</button>
              </div>
            </aside>
          </div>
        </main>
      </div>
    </div>
  )
}
