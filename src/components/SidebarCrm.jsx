import { Link, useNavigate } from 'react-router-dom'
import { useToast } from './ToastContext.jsx'
import MobileNav, { closeNav } from './MobileNav.jsx'

export default function SidebarCrm({ active }) {
  const toast = useToast()
  const navigate = useNavigate()
  const coming = (e, label) => { e.preventDefault(); toast(`${label} page is coming in the next iteration`, 'info') }

  const itemCls = (key) =>
    active === key
      ? 'flex items-center gap-3 rounded-lg bg-brand-600 px-3 py-2.5 text-sm font-semibold text-white'
      : 'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-white/5'

  return (
    <>
    <MobileNav />
    <aside className="crm-sidebar flex flex-col bg-ink-900 text-slate-300">
      <div className="flex h-16 items-center justify-between pr-2">
        <Link to="/dashboard" className="flex h-16 items-center gap-2 px-5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-indigo-400 to-indigo-600">
            <span className="text-sm font-black text-white">D</span>
          </div>
          <img src="/logo.jpg" alt="Decoinks" className="h-7 rounded bg-white px-1.5" />
        </Link>
        {/* close drawer — mobile only */}
        <button type="button" onClick={closeNav} aria-label="Close menu"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-white/10 lg:hidden">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <nav className="sidebar-scroll flex-1 overflow-y-auto px-3 pb-6">
        <ul className="space-y-1">
          <li>
            <Link to="/leads" className={active === 'leads'
              ? 'flex items-center justify-between rounded-lg bg-brand-600 px-3 py-2.5 text-white'
              : 'flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-white/5'}>
              <span className="flex items-center gap-3 text-sm font-medium">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>
                Leads
              </span>
            </Link>
          </li>
          <li>
            <Link to="/dashboard" className={active === 'inbox'
              ? 'flex items-center justify-between rounded-lg bg-brand-600 px-3 py-2.5 text-white'
              : 'flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-white/5'}>
              <span className="flex items-center gap-3 text-sm font-medium">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/></svg>
                Inbox
              </span>
            </Link>
          </li>
          <li>
            <Link to="/dashboard?view=mentions" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-white/5">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/></svg>
              Mentions
            </Link>
          </li>
          <li>
            <Link to="/dashboard?view=unassigned" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-white/5">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              Unassigned
            </Link>
          </li>
          <li>
            <Link to="/dashboard?view=bookmarks" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-white/5">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
              Bookmarks
            </Link>
          </li>
          <li>
            <Link to="/ai-assistant" className={active === 'ai-assistant'
              ? 'flex items-center gap-3 rounded-lg bg-brand-600 px-3 py-2.5 text-sm font-semibold text-white'
              : 'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-violet-300 hover:bg-white/5'}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
              AI Prompting
            </Link>
          </li>
          <li>
            <Link to="/after-session" className={active === 'after-session'
              ? 'flex items-center gap-3 rounded-lg bg-brand-600 px-3 py-2.5 text-sm font-semibold text-white'
              : 'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-violet-300 hover:bg-white/5'}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              After Session
            </Link>
          </li>
        </ul>

        {/* CRM 360 — hidden for now. To show again, change false → true */}
        {false && (<>
        <p className="mt-6 mb-2 px-3 text-[11px] font-bold uppercase tracking-widest text-slate-500">CRM 360</p>
        <ul className="space-y-1">
          <li><Link to="/customers" className={itemCls('customers')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            Customers
          </Link></li>
          <li><Link to="/customer-360" className={itemCls('customer-360')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>
            Customer 360
          </Link></li>
          <li><Link to="/leads" className={itemCls('leads')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>
            Leads
          </Link></li>
          <li><Link to="/orders" className={itemCls('orders')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
            Orders
          </Link></li>
          <li><Link to="/artwork-vault" className={itemCls('artwork-vault')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
            Artwork Vault
          </Link></li>
          <li><Link to="/follow-ups" className={itemCls('follow-ups')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
            Follow-Ups
          </Link></li>
          <li><Link to="/campaigns" className={itemCls('campaigns')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 11 18-5v12L3 14v-3z"/></svg>
            Campaigns
          </Link></li>
          <li><Link to="/reports" className={itemCls('reports')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/></svg>
            Reports
          </Link></li>
          <li><Link to="/receipts" className={itemCls('receipts')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Receipts
          </Link></li>
        </ul>
        </>)}

        <p className="mt-6 mb-2 px-3 text-[11px] font-bold uppercase tracking-widest text-slate-500">Settings</p>
        <ul className="space-y-1">
          <li><Link to="/team" className={itemCls('team')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>
            Team
          </Link></li>
          <li><Link to="/connect-meta" className={itemCls('connect-meta')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.99 22 12z"/></svg>
            Connect Meta
          </Link></li>
          <li><Link to="/integrations" className={itemCls('integrations')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/></svg>
            Integrations
          </Link></li>
          <li><Link to="/settings" className={itemCls('settings')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            Settings
          </Link></li>
        </ul>
      </nav>
    </aside>
    </>
  )
}
