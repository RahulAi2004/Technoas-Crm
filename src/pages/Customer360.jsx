import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import SidebarCrm from '../components/SidebarCrm.jsx'
import BackButton from '../components/BackButton.jsx'
import TopBarUser from '../components/TopBarUser.jsx'
import { CUSTOMER_HEADER_LOOKUP } from '../data/customers.js'

const TABS = [
  { id: 'overview',      label: 'Overview' },
  { id: 'conversations', label: 'Conversations', badge: 128 },
  { id: 'orders',        label: 'Orders', badge: 48 },
  { id: 'artwork',       label: 'Artwork', badge: 24 },
  { id: 'notes',         label: 'Notes', badge: 14 },
  { id: 'payments',      label: 'Payments' },
  { id: 'followups',     label: 'Follow-Ups', badge: 7 },
  { id: 'files',         label: 'Files', badge: 36 },
]

export default function Customer360() {
  const [params] = useSearchParams()
  const id = params.get('id')
  const cust = (id && CUSTOMER_HEADER_LOOKUP[id]) || { name: 'Springfield High School', initials: 'SH', avatar: 'bg-slate-900 text-white' }
  const [active, setActive] = useState('overview')

  return (
    <div className="h-screen overflow-hidden grid" style={{ gridTemplateColumns: '240px 1fr' }}>
      <SidebarCrm active="customer-360" />
      <div className="flex h-screen flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
          <nav className="flex items-center gap-2 text-sm">
            <BackButton />
            <Link to="/customers" className="text-slate-500 hover:text-slate-700">Customers</Link>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-300"><path d="m9 18 6-6-6-6"/></svg>
            <span className="font-semibold text-brand-600">Customer 360</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-300"><path d="m9 18 6-6-6-6"/></svg>
            <span className="font-semibold">{cust.name}</span>
          </nav>
          <div className="flex items-center gap-3">
            <input type="search" placeholder="Search anything..." className="w-72 rounded-lg border border-slate-200 bg-slate-50 py-2 px-3 text-sm outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20" />
            <button className="relative grid h-10 w-10 place-items-center rounded-full hover:bg-slate-100" aria-label="Notifications">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
              <span className="absolute -top-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full bg-rose-500 text-[10px] font-bold text-white">6</span>
            </button>
            <TopBarUser />
          </div>
        </header>

        <main className="nice-scroll flex-1 overflow-y-auto px-6 py-5">
          {/* Customer header card */}
          <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="relative">
                  <span className={`grid h-20 w-20 place-items-center rounded-full ${cust.avatar} text-2xl font-bold`}>{cust.initials}</span>
                  <button className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full bg-brand-600 text-white shadow-md ring-2 ring-white" aria-label="Edit avatar"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></button>
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-extrabold tracking-tight">{cust.name}</h1>
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">★ Gold Customer</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-600">
                    <span className="inline-flex items-center gap-1.5"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg> +1 (217) 555-0198</span>
                    <span className="inline-flex items-center gap-1.5"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-10 5L2 7"/></svg> info@springfieldhs.edu</span>
                    <span className="inline-flex items-center gap-1.5"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> Springfield, IL, USA</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">School</span>
                    <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Repeat Customer</span>
                    <span className="rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">DTF &amp; Apparel</span>
                    <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Athletics</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3 md:grid-cols-5">
                <div><div className="text-[11px] uppercase tracking-wide text-slate-400">Account Owner</div><div className="font-semibold">Mike Johnson</div></div>
                <div><div className="text-[11px] uppercase tracking-wide text-slate-400">Customer Since</div><div className="font-semibold">May 10, 2024</div></div>
                <div><div className="text-[11px] uppercase tracking-wide text-slate-400">Total Orders</div><div className="font-semibold">48</div></div>
                <div><div className="text-[11px] uppercase tracking-wide text-slate-400">Lifetime Spend</div><div className="font-semibold text-emerald-600">$28,450.00</div></div>
                <div><div className="text-[11px] uppercase tracking-wide text-slate-400">Last Order</div><div className="font-semibold">May 2, 2024</div></div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg> Send Message</button>
                <button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/></svg> More Actions <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg></button>
                <button className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg> New Quote</button>
              </div>
            </div>
          </section>

          {/* Tabs */}
          <nav className="mb-5 flex items-center gap-2 overflow-x-auto border-b border-slate-200 px-1">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setActive(t.id)}
                className={`whitespace-nowrap border-b-2 px-2 py-2.5 text-sm ${active === t.id ? 'border-brand-500 text-brand-600 font-semibold' : 'border-transparent text-slate-500 font-medium hover:text-slate-700'}`}>
                {t.label} {t.badge !== undefined && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">{t.badge}</span>}
              </button>
            ))}
          </nav>

          {active === 'overview'   && <OverviewTab />}
          {active === 'orders'     && <OrdersTab />}
          {active === 'notes'      && <NotesTab />}
          {active === 'payments'   && <PaymentsTab />}
          {active === 'conversations' && <StubTab icon="💬" title="Conversations tab" text={<>Full conversation list and chat thread — coming in the next iteration. For now, click <Link to="/dashboard" className="font-semibold text-brand-600">Inbox</Link> in the sidebar to chat with this customer.</>} />}
          {active === 'artwork'    && <StubTab icon="🎨" title="Artwork tab" text="24 artworks linked to this customer (logos, mockups, gang sheets) — full gallery + preview coming next." />}
          {active === 'followups'  && <StubTab icon="⏰" title="Follow-Ups tab" text="7 scheduled follow-ups — calendar + reminders view coming next." />}
          {active === 'files'      && <StubTab icon="📁" title="Files tab" text="36 files — full document/asset manager coming next." />}
        </main>
      </div>
    </div>
  )
}

function StubTab({ icon, title, text }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
      <div className="text-3xl">{icon}</div>
      <h3 className="mt-2 text-lg font-bold">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{text}</p>
    </div>
  )
}

function OverviewTab() {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center gap-2 text-xs text-slate-500"><span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-50 text-emerald-600">💰</span> Lifetime Revenue</div><div className="mt-2 text-xl font-extrabold">$28,450.00</div><div className="text-[11px] font-semibold text-emerald-600">↑18.6% vs last 12 months</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center gap-2 text-xs text-slate-500"><span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-50 text-brand-600">🛒</span> Total Orders</div><div className="mt-2 text-xl font-extrabold">48</div><div className="text-[11px] font-semibold text-emerald-600">12 vs last 12 months</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center gap-2 text-xs text-slate-500"><span className="grid h-7 w-7 place-items-center rounded-lg bg-violet-50 text-violet-600">📈</span> Avg Order Value</div><div className="mt-2 text-xl font-extrabold">$592.71</div><div className="text-[11px] font-semibold text-emerald-600">↑6.4% vs last 12 months</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center gap-2 text-xs text-slate-500"><span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-50 text-amber-600">📅</span> Last Order</div><div className="mt-2 text-xl font-extrabold">May 2, 2024</div><div className="text-[11px] text-slate-500">12 days ago</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center gap-2 text-xs text-slate-500"><span className="grid h-7 w-7 place-items-center rounded-lg bg-sky-50 text-sky-600">🔁</span> Repeat Frequency</div><div className="mt-2 text-xl font-extrabold">Every 45d</div><div className="text-[11px] text-slate-500">Regular Customer</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center gap-2 text-xs text-slate-500"><span className="grid h-7 w-7 place-items-center rounded-lg bg-rose-50 text-rose-600">❤</span> Customer Health</div><div className="mt-2 text-xl font-extrabold text-emerald-600">92 <span className="text-sm text-slate-400">/100</span></div><div className="text-[11px] font-semibold text-emerald-600">Excellent</div></div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-bold">Revenue Trend</h3><button className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold">Last 12 Months <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg></button></div>
          <svg viewBox="0 0 320 160" className="w-full">
            <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4f46e5" stopOpacity="0.35"/><stop offset="100%" stopColor="#4f46e5" stopOpacity="0"/></linearGradient></defs>
            <polyline fill="url(#g1)" stroke="none" points="20,120 50,100 80,110 110,85 140,90 170,70 200,55 230,75 260,60 290,45 290,150 20,150"/>
            <polyline fill="none" stroke="#4f46e5" strokeWidth="2.5" points="20,120 50,100 80,110 110,85 140,90 170,70 200,55 230,75 260,60 290,45"/>
            <g fill="#4f46e5"><circle cx="20" cy="120" r="3"/><circle cx="50" cy="100" r="3"/><circle cx="80" cy="110" r="3"/><circle cx="110" cy="85" r="3"/><circle cx="140" cy="90" r="3"/><circle cx="170" cy="70" r="3"/><circle cx="200" cy="55" r="3"/><circle cx="230" cy="75" r="3"/><circle cx="260" cy="60" r="3"/><circle cx="290" cy="45" r="3"/></g>
          </svg>
          <div className="mt-1 grid grid-cols-12 gap-1 text-center text-[9px] text-slate-400">
            <span>Jun</span><span>Jul</span><span>Aug</span><span>Sep</span><span>Oct</span><span>Nov</span><span>Dec</span><span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-bold">Top Products</h3>
          <div className="flex items-center gap-4">
            <svg viewBox="0 0 100 100" className="h-32 w-32 -rotate-90">
              <circle cx="50" cy="50" r="40" fill="none" stroke="#e2e8f0" strokeWidth="14"/>
              <circle cx="50" cy="50" r="40" fill="none" stroke="#4f46e5" strokeWidth="14" strokeDasharray="105.5 251" strokeDashoffset="0"/>
              <circle cx="50" cy="50" r="40" fill="none" stroke="#22c55e" strokeWidth="14" strokeDasharray="62.7 251" strokeDashoffset="-105.5"/>
              <circle cx="50" cy="50" r="40" fill="none" stroke="#f59e0b" strokeWidth="14" strokeDasharray="45.2 251" strokeDashoffset="-168.2"/>
              <circle cx="50" cy="50" r="40" fill="none" stroke="#ec4899" strokeWidth="14" strokeDasharray="20.1 251" strokeDashoffset="-213.4"/>
              <circle cx="50" cy="50" r="40" fill="none" stroke="#94a3b8" strokeWidth="14" strokeDasharray="17.6 251" strokeDashoffset="-233.5"/>
            </svg>
            <ul className="flex-1 space-y-1.5 text-xs">
              <li className="flex items-center justify-between"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand-500"></span>Hoodies</span><span className="font-semibold">42%</span></li>
              <li className="flex items-center justify-between"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500"></span>T-Shirts</span><span className="font-semibold">25%</span></li>
              <li className="flex items-center justify-between"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500"></span>DTF Transfers</span><span className="font-semibold">18%</span></li>
              <li className="flex items-center justify-between"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-pink-500"></span>Crewnecks</span><span className="font-semibold">8%</span></li>
              <li className="flex items-center justify-between"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-400"></span>Other</span><span className="font-semibold">7%</span></li>
            </ul>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-bold">Reorder Prediction</h3><button className="text-[11px] font-semibold text-brand-600 hover:text-brand-700">View all</button></div>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-900 text-white text-[10px] font-bold">HOODIE</span><div className="flex-1"><div className="font-semibold">Graduation Hoodies</div><div className="text-[11px] text-slate-500">Likely reorder April 2025</div></div><span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">High</span></li>
            <li className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-800 text-white text-[10px] font-bold">TEE</span><div className="flex-1"><div className="font-semibold">Football Jerseys</div><div className="text-[11px] text-slate-500">Likely reorder Aug 2025</div></div><span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Medium</span></li>
            <li className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-700 text-white text-[10px] font-bold">CREW</span><div className="flex-1"><div className="font-semibold">Staff Crewnecks</div><div className="text-[11px] text-slate-500">Likely reorder Dec 2025</div></div><span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Low</span></li>
          </ul>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-bold">Preferences</h3><a className="text-[11px] font-semibold text-brand-600">View all preferences →</a></div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <div className="mb-2 text-xs font-semibold text-slate-500">Communication</div>
              <ul className="space-y-1.5 text-xs">
                <li className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1.5"><span className="grid h-4 w-4 place-items-center rounded-full bg-emerald-500 text-white text-[8px]">W</span>WhatsApp</span><span className="w-20"><span className="block h-1.5 rounded-full bg-slate-100"><span className="block h-1.5 w-[70%] rounded-full bg-emerald-500"></span></span></span><span className="text-slate-500 w-7 text-right">70%</span></li>
                <li className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1.5"><span className="grid h-4 w-4 place-items-center rounded-full bg-slate-700 text-white text-[8px]">E</span>Email</span><span className="w-20"><span className="block h-1.5 rounded-full bg-slate-100"><span className="block h-1.5 w-[20%] rounded-full bg-slate-500"></span></span></span><span className="text-slate-500 w-7 text-right">20%</span></li>
                <li className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1.5"><span className="grid h-4 w-4 place-items-center rounded-full bg-blue-500 text-white text-[8px]">P</span>Phone</span><span className="w-20"><span className="block h-1.5 rounded-full bg-slate-100"><span className="block h-1.5 w-[10%] rounded-full bg-blue-500"></span></span></span><span className="text-slate-500 w-7 text-right">10%</span></li>
              </ul>
            </div>
            <div>
              <div className="mb-2 text-xs font-semibold text-slate-500">Payment</div>
              <ul className="space-y-1.5 text-xs">
                <li className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1.5"><span className="grid h-4 w-4 place-items-center rounded-full bg-violet-600 text-white text-[8px]">Z</span>Zelle</span><span className="text-slate-500">60%</span></li>
                <li className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1.5"><span className="grid h-4 w-4 place-items-center rounded-full bg-slate-700 text-white text-[8px]">B</span>Bank Transfer</span><span className="text-slate-500">30%</span></li>
                <li className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1.5"><span className="grid h-4 w-4 place-items-center rounded-full bg-blue-500 text-white text-[8px]">C</span>Credit Card</span><span className="text-slate-500">10%</span></li>
              </ul>
            </div>
            <div>
              <div className="mb-2 text-xs font-semibold text-slate-500">Quick Notes (Pinned)</div>
              <ul className="space-y-1.5 text-xs text-slate-700">
                <li>📌 Prefers oversized back print</li>
                <li>📌 Orders before major school events</li>
                <li>📌 Needs rush turnaround during season</li>
                <li>📌 Pays via Zelle after invoice</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between"><h3 className="inline-flex items-center gap-1.5 text-sm font-bold"><span className="grid h-5 w-5 place-items-center rounded-md bg-violet-100 text-violet-600">✨</span>AI Summary</h3><button className="text-[11px] font-semibold text-brand-600">View all</button></div>
          <p className="text-xs leading-relaxed text-slate-600">Springfield High School is a high-value repeat customer. They typically place bulk orders for athletic events and school functions. Preferred products are hoodies and t-shirts with oversized back prints. They respond fastest on WhatsApp and prefer Zelle payments.</p>
          <button className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> Ask AI anything</button>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-bold">Recent Activity</h3><a className="text-[11px] font-semibold text-brand-600">View all activity →</a></div>
        <ul className="space-y-3 text-sm">
          <li className="flex gap-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-100 text-emerald-700">✓</span><div><div className="font-semibold">Order #ORD-1042 Completed</div><div className="text-xs text-slate-500">May 2, 2024 · $2,450.00</div></div></li>
          <li className="flex gap-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-brand-50 text-brand-600">💬</span><div><div className="font-semibold">New conversation on WhatsApp</div><div className="text-xs text-slate-500">Apr 29, 2024</div></div></li>
          <li className="flex gap-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-violet-100 text-violet-600">🎨</span><div><div className="font-semibold">Artwork approved — Graduation Hoodie Design</div><div className="text-xs text-slate-500">Apr 30, 2024</div></div></li>
          <li className="flex gap-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-amber-100 text-amber-600">💰</span><div><div className="font-semibold">Payment received via Zelle</div><div className="text-xs text-slate-500">Apr 29, 2024 · $2,450.00</div></div></li>
          <li className="flex gap-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-sky-100 text-sky-600">📝</span><div><div className="font-semibold">Quote #Q-1024 sent</div><div className="text-xs text-slate-500">Apr 28, 2024 · $1,890.00</div></div></li>
        </ul>
      </div>
    </>
  )
}

function OrdersTab() {
  const orders = [
    ['#ORD-1042','May 2, 2024','12 days ago','Graduation Hoodies 2025','Puff Print · Navy','50 pcs','$3,450.00','Completed','emerald','Paid','via Zelle','Delivered','emerald','May 8, 2024',''],
    ['#ORD-0981','Apr 28, 2024','16 days ago','Football Jerseys','Sublimated · Full Color','36 pcs','$4,120.00','Completed','emerald','Paid','via Zelle','Delivered','emerald','May 5, 2024',''],
    ['#ORD-0930','Apr 15, 2024','29 days ago','Staff Crewnecks','Embroidery · Navy','24 pcs','$1,890.00','Completed','emerald','Paid','via Bank Transfer','Delivered','emerald','Apr 22, 2024',''],
    ['#ORD-0872','Mar 30, 2024','45 days ago','DTF Gang Sheet','12" × 22" · Full Color','3 sheets','$420.00','Completed','emerald','Paid','via Zelle','Delivered','emerald','Apr 2, 2024',''],
    ['#ORD-0811','Mar 10, 2024','65 days ago','Homecoming T-Shirts','Screen Print · Black','60 pcs','$2,160.00','Completed','emerald','Paid','via Zelle','Delivered','emerald','Mar 16, 2024',''],
    ['#ORD-0742','Feb 20, 2024','84 days ago','Practice Hoodies','Puff Print · Gray','20 pcs','$1,480.00','Processing','amber','Partial','$740 / $1,480.00','In Production','sky','Est. May 27, 2024',''],
    ['#ORD-0690','Feb 5, 2024','99 days ago','Basketball Warmup Shirts','Dri-Fit · White','30 pcs','$960.00','Processing','amber','Paid','via Credit Card','In Production','sky','Est. May 25, 2024',''],
    ['#ORD-0612','Jan 18, 2024','117 days ago','DTF Gang Sheet','11" × 17" · Full Color','2 sheets','$320.00','Cancelled','rose','Refunded','via Zelle','—','slate','',''],
  ]
  const cls = (c) => `rounded bg-${c}-50 px-1.5 py-0.5 text-[10px] font-semibold text-${c}-700`
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
      <div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
          <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-50 text-brand-600">🛒</span><div className="text-[11px] text-slate-500">Total Orders</div></div><div className="mt-1 text-xl font-extrabold">48</div><a className="text-[10px] font-semibold text-brand-600 hover:text-brand-700">View all orders →</a></div>
          <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-50 text-emerald-600">✓</span><div className="text-[11px] text-slate-500">Completed Orders</div></div><div className="mt-1 text-xl font-extrabold text-emerald-600">42</div><div className="text-[10px] text-slate-500">87.5% of total</div></div>
          <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-50 text-amber-600">📅</span><div className="text-[11px] text-slate-500">Total Spend</div></div><div className="mt-1 text-xl font-extrabold">$28,450.00</div><a className="text-[10px] font-semibold text-brand-600 hover:text-brand-700">View spending →</a></div>
          <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-violet-50 text-violet-600">📈</span><div className="text-[11px] text-slate-500">Average Order Value</div></div><div className="mt-1 text-xl font-extrabold">$592.71</div><a className="text-[10px] font-semibold text-brand-600 hover:text-brand-700">View analytics →</a></div>
          <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-sky-50 text-sky-600">📦</span><div className="text-[11px] text-slate-500">Open Orders</div></div><div className="mt-1 text-xl font-extrabold text-brand-600">2</div><div className="text-[10px] text-slate-500">$1,890.00</div></div>
          <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-rose-50 text-rose-600">✗</span><div className="text-[11px] text-slate-500">Cancelled/Refunded</div></div><div className="mt-1 text-xl font-extrabold text-rose-600">4</div><div className="text-[10px] text-slate-500">$890.00</div></div>
        </div>

        {/* Filter row */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <span className="pointer-events-none absolute inset-y-0 left-0 grid place-items-center pl-3 text-slate-400"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg></span>
            <input placeholder="Search orders by #, product, status..." className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm" />
          </div>
          <select className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option>All Statuses</option></select>
          <select className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option>All Products</option></select>
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            <input type="text" defaultValue="01/01/2024" className="w-20 bg-transparent outline-none" />
            <span className="text-slate-400">→</span>
            <input type="text" defaultValue="05/24/2024" className="w-20 bg-transparent outline-none" />
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </div>
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">More Filters</button>
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
            Export <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
          </button>
        </div>
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-3 py-2 text-left">Order # ⇅</th><th className="px-3 py-2 text-left">Order Date</th><th className="px-3 py-2 text-left">Products</th><th className="px-3 py-2 text-left">Quantity</th><th className="px-3 py-2 text-left">Amount</th><th className="px-3 py-2 text-left">Status ⇅</th><th className="px-3 py-2 text-left">Payment Status ⇅</th><th className="px-3 py-2 text-left">Delivery</th><th className="px-3 py-2 text-right">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((o, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 font-semibold text-brand-600">{o[0]}</td>
                  <td className="px-3 py-2.5">{o[1]}{o[2] && <div className="text-[10px] text-slate-400">{o[2]}</div>}</td>
                  <td className="px-3 py-2.5"><div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded bg-slate-100 text-[8px] font-bold">IMG</span><div><div className="font-medium">{o[3]}</div><div className="text-[10px] text-slate-500">{o[4]}</div></div></div></td>
                  <td className="px-3 py-2.5">{o[5]}</td>
                  <td className="px-3 py-2.5 font-semibold">{o[6]}</td>
                  <td className="px-3 py-2.5"><span className={cls(o[8])}>{o[7]}</span></td>
                  <td className="px-3 py-2.5"><span className={cls(o[8])}>✓ {o[9]}</span>{o[10] && <div className="text-[10px] text-slate-500">{o[10]}</div>}</td>
                  <td className="px-3 py-2.5"><span className={cls(o[12])}>{o[11]}</span>{o[13] && <div className="text-[10px] text-slate-500">{o[13]}</div>}</td>
                  <td className="px-3 py-2.5 text-right"><div className="inline-flex items-center gap-1"><button className="grid h-7 w-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100" aria-label="View"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button><button className="grid h-7 w-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100" aria-label="More"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
          <span>Showing 1 to 8 of 48 orders</span>
          <div className="flex items-center gap-1.5"><span>per page</span><select className="rounded-md border border-slate-200 bg-white px-1.5 py-1"><option>20</option></select></div>
          <div className="flex items-center gap-1">
            <button className="grid h-7 w-7 place-items-center rounded-md border border-slate-200"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg></button>
            {[1,2,3].map(n => <button key={n} className={`grid h-7 w-7 place-items-center rounded-md text-xs font-semibold ${n === 1 ? 'bg-brand-600 text-white' : 'border border-slate-200'}`}>{n}</button>)}
            <button className="grid h-7 w-7 place-items-center rounded-md border border-slate-200"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg></button>
          </div>
        </div>
      </div>
      <aside className="space-y-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between"><h4 className="text-sm font-bold">Order Insights</h4><a className="text-[10px] font-semibold text-brand-600">View all</a></div>
          <div className="mb-3 text-xs font-semibold text-slate-500">Most Ordered Product</div>
          <div className="flex items-center gap-2"><span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-900 text-white text-[10px] font-bold">HOODIE</span><div><div className="text-sm font-semibold">Graduation Hoodies</div><div className="text-[10px] text-slate-500">16 orders</div></div></div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="mb-2 text-xs font-semibold text-slate-500">Highest Order Value</div><div className="flex items-center gap-2"><span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-800 text-white text-[10px] font-bold">TEE</span><div><div className="text-sm font-semibold text-emerald-600">$4,120.00</div><div className="text-[10px] text-slate-500">Football Jerseys</div></div></div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-500"><span className="grid h-7 w-7 place-items-center rounded-md bg-violet-50 text-violet-600">📅</span> Average Reorder Time</div><div className="text-sm font-semibold">42 days</div><div className="text-[10px] text-slate-500">Based on last 6 orders</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold text-slate-500">Reorder Prediction</span><span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">High</span></div><div className="text-sm font-bold">Likely to reorder in</div><div className="text-xl font-extrabold text-emerald-600">14 days</div><div className="mt-1 text-[10px] text-slate-500">Based on their ordering pattern.</div><div className="mt-2 h-1.5 w-full rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-emerald-500" style={{ width: '70%' }}></div></div><button className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100">+ Create Reorder Quote</button></div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between"><h4 className="text-sm font-bold">Upcoming Reorders</h4><a className="text-[10px] font-semibold text-brand-600">View all</a></div>
          <ul className="space-y-2 text-xs">
            <li className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-900 text-white text-[8px] font-bold">HOODIE</span><div className="flex-1"><div className="font-semibold">Graduation Hoodies</div><div className="text-[10px] text-slate-500">Est. Jun 10, 2024</div></div></li>
            <li className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-800 text-white text-[8px] font-bold">CREW</span><div className="flex-1"><div className="font-semibold">Staff Crewnecks</div><div className="text-[10px] text-slate-500">Est. May 30, 2024</div></div></li>
            <li className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-700 text-white text-[8px] font-bold">JERSEY</span><div className="flex-1"><div className="font-semibold">Football Jerseys</div><div className="text-[10px] text-slate-500">Est. Aug 15, 2024</div></div></li>
          </ul>
        </div>
      </aside>
    </div>
  )
}

function NotesTab() {
  const notes = [
    { icon:'📝', iconBg:'bg-violet-100 text-violet-600', title:'Oversized back print preference', cat:'Design', catCls:'bg-violet-50 text-violet-700', pinned:true, body:'Customer prefers oversized back prints on all hoodies. Usually 12"–13" wide.', author:'Mike Johnson', date:'Apr 28, 2024 · 10:25 AM' },
    { icon:'💰', iconBg:'bg-amber-100 text-amber-600', title:'Prefers Zelle payment', cat:'Payment', catCls:'bg-amber-50 text-amber-700', pinned:true, body:'Always prefers payment via Zelle. Send payment request to timary.zoiae@springfieldhs.edu', author:'Sarah Williams', date:'Apr 25, 2024 · 02:15 PM' },
    { icon:'🚚', iconBg:'bg-emerald-100 text-emerald-600', title:'Rush delivery before event', cat:'Shipping', catCls:'bg-emerald-50 text-emerald-700', body:'Needs all orders before major school events. Usually 2-3 weeks in advance.', author:'Mike Johnson', date:'Apr 20, 2024 · 11:40 AM' },
    { icon:'ℹ', iconBg:'bg-sky-100 text-sky-600', title:'Homecoming 2024 details', cat:'General', catCls:'bg-slate-100 text-slate-700', body:'Homecoming on Oct 4, 2024. Expect orders for hoodies, tees and crewnecks.', author:'Timary Zoiaor', date:'Apr 15, 2024 · 09:30 AM' },
    { icon:'⚠', iconBg:'bg-rose-100 text-rose-600', title:'Late approval caused delay', cat:'Complaint', catCls:'bg-rose-50 text-rose-700', body:'Artwork approval was delayed from customer side. Need earlier follow up next time.', author:'Sarah Williams', date:'Mar 30, 2024 · 04:22 PM' },
  ]
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div><h3 className="text-base font-bold">Notes</h3><p className="text-xs text-slate-500">All important notes and information about this customer.</p></div>
          <div className="flex items-center gap-2">
            <div className="relative"><input placeholder="Search notes..." className="rounded-lg border border-slate-200 bg-slate-50 py-1.5 px-3 text-xs" /></div>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg> Filter</button>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold">Sort: Newest <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg></button>
          </div>
        </div>
        <div className="mb-3 flex flex-wrap gap-1.5 text-xs">
          <button className="rounded-md bg-brand-50 px-2 py-0.5 font-semibold text-brand-700">All Notes (14)</button>
          <button className="rounded-md bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">Internal (6)</button>
          <button className="rounded-md bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">Design (3)</button>
          <button className="rounded-md bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">Payment (2)</button>
          <button className="rounded-md bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">Shipping (1)</button>
          <button className="rounded-md bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">Complaint (1)</button>
          <button className="rounded-md bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">General (1)</button>
        </div>
        <ul className="space-y-2">
          {notes.map((n, i) => (
            <li key={i} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-start gap-3">
                <span className={`grid h-9 w-9 place-items-center rounded-lg ${n.iconBg}`}>{n.icon}</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold">{n.title}</h4>
                      <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${n.catCls}`}>{n.cat}</span>
                    </div>
                    <button className="grid h-6 w-6 place-items-center rounded text-slate-400 hover:bg-slate-100"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg></button>
                  </div>
                  <p className="text-xs text-slate-600">{n.body}</p>
                  {n.pinned && <span className="mt-0.5 inline-block text-[10px] text-rose-600">📌 Pinned</span>}
                  <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-500"><img alt="" src={`https://i.pravatar.cc/16?u=${encodeURIComponent(n.author)}`} className="h-4 w-4 rounded-full" /><span>{n.author}</span><span className="text-slate-300">·</span><span>{n.date}</span></div>
                </div>
              </div>
            </li>
          ))}
        </ul>

        {/* Pagination */}
        <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
          <span>Showing 1 to 6 of 14 notes</span>
          <div className="flex items-center gap-1">
            <button className="grid h-7 w-7 place-items-center rounded-md border border-slate-200"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg></button>
            {[1,2,3].map(n => <button key={n} className={`grid h-7 w-7 place-items-center rounded-md text-xs font-semibold ${n === 1 ? 'bg-brand-600 text-white' : 'border border-slate-200'}`}>{n}</button>)}
            <button className="grid h-7 w-7 place-items-center rounded-md border border-slate-200"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg></button>
          </div>
        </div>
      </div>
      <aside className="space-y-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-2 text-xs font-bold">Pinned Notes (2)</div>
          <ul className="space-y-2 text-xs">
            <li className="rounded-md bg-violet-50 p-2"><div className="font-semibold">Oversized back print preference</div><div className="text-slate-600">Customer prefers oversized back prints on all hoodies...</div><div className="mt-1 text-[10px] text-slate-400">Apr 28, 2024 by Mike Johnson</div></li>
            <li className="rounded-md bg-amber-50 p-2"><div className="font-semibold">Prefers Zelle payment</div><div className="text-slate-600">Always prefers payment via Zelle. Send payment...</div><div className="mt-1 text-[10px] text-slate-400">Apr 25, 2024 by Sarah Williams</div></li>
          </ul>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-3 text-xs font-bold">Note Categories</div>
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 100 100" className="h-24 w-24 -rotate-90">
              <circle cx="50" cy="50" r="40" fill="none" stroke="#e2e8f0" strokeWidth="14"/>
              <circle cx="50" cy="50" r="40" fill="none" stroke="#8b5cf6" strokeWidth="14" strokeDasharray="107.8 251" strokeDashoffset="0"/>
              <circle cx="50" cy="50" r="40" fill="none" stroke="#0ea5e9" strokeWidth="14" strokeDasharray="53.9 251" strokeDashoffset="-107.8"/>
              <circle cx="50" cy="50" r="40" fill="none" stroke="#f59e0b" strokeWidth="14" strokeDasharray="35.9 251" strokeDashoffset="-161.7"/>
              <circle cx="50" cy="50" r="40" fill="none" stroke="#10b981" strokeWidth="14" strokeDasharray="17.9 251" strokeDashoffset="-197.6"/>
              <circle cx="50" cy="50" r="40" fill="none" stroke="#f43f5e" strokeWidth="14" strokeDasharray="17.9 251" strokeDashoffset="-215.5"/>
              <circle cx="50" cy="50" r="40" fill="none" stroke="#94a3b8" strokeWidth="14" strokeDasharray="17.9 251" strokeDashoffset="-233.4"/>
            </svg>
            <ul className="flex-1 space-y-1 text-xs">
              <li className="flex items-center justify-between"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-violet-500"></span>Internal</span><span className="font-semibold">6</span></li>
              <li className="flex items-center justify-between"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-500"></span>Design</span><span className="font-semibold">3</span></li>
              <li className="flex items-center justify-between"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500"></span>Payment</span><span className="font-semibold">2</span></li>
              <li className="flex items-center justify-between"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500"></span>Shipping</span><span className="font-semibold">1</span></li>
              <li className="flex items-center justify-between"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-500"></span>Complaint</span><span className="font-semibold">1</span></li>
              <li className="flex items-center justify-between"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-400"></span>General</span><span className="font-semibold">1</span></li>
            </ul>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-start gap-2">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-50 text-brand-600">📝</span>
            <div>
              <div className="text-sm font-bold">Add New Note</div>
              <div className="text-[11px] text-slate-500">Add an important note or information about this customer.</div>
            </div>
          </div>
          <button className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700">+ Add Note</button>
        </div>
      </aside>
    </div>
  )
}

function PaymentsTab() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
      <div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-[11px] text-slate-500">Total Paid</div><div className="text-lg font-extrabold">$25,910.00</div><div className="text-[10px] text-emerald-600 font-semibold">91.1% of lifetime spend</div></div>
          <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-[11px] text-slate-500">Outstanding</div><div className="text-lg font-extrabold text-amber-600">$2,540.00</div><div className="text-[10px] text-rose-600 font-semibold">2 invoices due</div></div>
          <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-[11px] text-slate-500">Total Invoices</div><div className="text-lg font-extrabold">18</div></div>
          <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-[11px] text-slate-500">Avg Payment Time</div><div className="text-lg font-extrabold">3.6 days</div></div>
        </div>
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Type</th><th className="px-3 py-2 text-left">Invoice / Order</th><th className="px-3 py-2 text-left">Description</th><th className="px-3 py-2 text-left">Method</th><th className="px-3 py-2 text-left">Amount</th><th className="px-3 py-2 text-left">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr><td className="px-3 py-2.5">May 2, 2024</td><td><span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Payment</span></td><td className="font-semibold text-brand-600">INV-1018<div className="text-[10px] text-slate-400">#ORD-1042</div></td><td>Payment for Graduation Hoodies 2025</td><td><span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">Zelle</span></td><td className="font-semibold">$3,450.00</td><td><span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Completed</span></td></tr>
              <tr><td className="px-3 py-2.5">Apr 25, 2024</td><td><span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Payment</span></td><td>INV-1015<div className="text-[10px] text-slate-400">#ORD-0981</div></td><td>Payment for Football Jerseys</td><td><span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">Zelle</span></td><td className="font-semibold">$4,120.00</td><td><span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Completed</span></td></tr>
              <tr><td className="px-3 py-2.5">Apr 20, 2024</td><td><span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">Invoice</span></td><td className="font-semibold text-brand-600">INV-1013<div className="text-[10px] text-slate-400">#ORD-0930</div></td><td>Staff Crewnecks Order</td><td><span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">Bank Transfer</span></td><td className="font-semibold">$1,890.00</td><td><span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Paid</span></td></tr>
              <tr><td className="px-3 py-2.5">Apr 15, 2024</td><td><span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Payment</span></td><td>INV-1010<div className="text-[10px] text-slate-400">#ORD-0872</div></td><td>Payment for DTF Gang Sheet</td><td><span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">Zelle</span></td><td className="font-semibold">$420.00</td><td><span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Completed</span></td></tr>
              <tr><td className="px-3 py-2.5">Mar 30, 2024</td><td><span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">Invoice</span></td><td className="font-semibold text-brand-600">INV-1008<div className="text-[10px] text-slate-400">#ORD-0811</div></td><td>Homecoming T-Shirts</td><td><span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">Zelle</span></td><td className="font-semibold">$2,160.00</td><td><span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Paid</span></td></tr>
              <tr><td className="px-3 py-2.5">Feb 20, 2024</td><td><span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Payment</span></td><td>INV-1001<div className="text-[10px] text-slate-400">#ORD-0612</div></td><td>Refund for Cancelled Order</td><td><span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">Zelle</span></td><td className="font-semibold text-rose-600">-$320.00</td><td><span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">Refunded</span></td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <aside className="space-y-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="mb-1 text-xs font-semibold text-slate-500">Account Balance</div><div className="text-2xl font-extrabold text-amber-600">$2,540.00</div><div className="text-[10px] text-slate-500">2 invoices pending</div><button className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">View Outstanding Invoices →</button></div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between"><span className="text-xs font-bold">Payment Methods</span><span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Preferred</span></div>
          <ul className="space-y-2 text-xs">
            <li className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-md bg-violet-100 text-violet-600 font-bold">Z</span><div className="flex-1"><div className="font-semibold">Zelle <span className="ml-1 rounded bg-emerald-50 px-1.5 py-0 text-[9px] font-semibold text-emerald-700">Primary</span></div><div className="text-[10px] text-slate-500">timary.zoiae@springfieldhs.edu</div></div></li>
            <li className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-md bg-slate-100 text-slate-700 font-bold">B</span><div className="flex-1"><div className="font-semibold">Bank Transfer</div><div className="text-[10px] text-slate-500">Chase Business · 4582</div></div></li>
            <li className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-md bg-blue-100 text-blue-700 font-bold">C</span><div className="flex-1"><div className="font-semibold">Credit Card</div><div className="text-[10px] text-slate-500">Visa · 2245 · Exp 08/26</div></div></li>
          </ul>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="mb-1 text-xs font-bold">Payment Insights</div><div className="text-[10px] text-slate-500">Payments on time</div><div className="text-lg font-extrabold text-emerald-600">94% <span className="text-[10px] font-semibold">↑12% vs last 12 mo</span></div><div className="mt-2 text-[10px] text-slate-500">Most used method: <strong>Zelle</strong> (78%)</div></div>
      </aside>
    </div>
  )
}
