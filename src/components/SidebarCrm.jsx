import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useToast } from './ToastContext.jsx'
import MobileNav, { closeNav } from './MobileNav.jsx'
import { can } from '../lib/auth.js'
import { api } from '../lib/api.js'

export default function SidebarCrm({ active }) {
  const toast = useToast()
  const navigate = useNavigate()
  const coming = (e, label) => { e.preventDefault(); toast(`${label} page is coming in the next iteration`, 'info') }

  // Desktop sidebar collapse — shared preference key with the Dashboard's own sidebar.
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === '1')
  const toggle = () => setCollapsed((v) => { const n = !v; localStorage.setItem('sidebarCollapsed', n ? '1' : '0'); return n })
  // CRM 360 badge — kitne converted customers ne naya (unread) message bheja
  const [crm360, setCrm360] = useState(0)
  useEffect(() => {
    let on = true
    const load = () => api.get('/api/inbox/stats').then((s) => { if (on) setCrm360(s?.convertedUnread || 0) }).catch(() => {})
    load(); const t = setInterval(load, 30000); return () => { on = false; clearInterval(t) }
  }, [])

  const itemCls = (key) =>
    active === key
      ? 'flex items-center gap-3 rounded-lg bg-brand-600 px-3 py-2.5 text-sm font-semibold text-white'
      : 'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-white/5'

  return (
    <>
    <MobileNav />
    <aside data-collapsed={collapsed || undefined} className="crm-sidebar flex flex-col bg-ink-900 text-slate-300">
      <div className="sb-brand flex h-16 items-center gap-2 px-5">
        <Link to="/dashboard" className="flex min-w-0 items-center gap-2">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-indigo-400 to-indigo-600">
            <span className="text-sm font-black text-white">D</span>
          </div>
          <img src="/logo.jpg" alt="Decoinks" className="sb-txt h-7 rounded bg-white px-1.5" />
        </Link>
        {/* collapse — desktop only */}
        <button type="button" onClick={toggle} aria-label="Collapse sidebar" title="Collapse sidebar"
          className="sb-txt ml-auto hidden h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white lg:grid">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        {/* close drawer — mobile only */}
        <button type="button" onClick={closeNav} aria-label="Close menu"
          className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-white/10 lg:hidden">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      {/* expand — desktop only, shown when collapsed */}
      {collapsed && (
        <button type="button" onClick={toggle} aria-label="Expand sidebar" title="Expand sidebar"
          className="mx-auto mt-1 hidden h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white lg:grid">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </button>
      )}

      <nav className="sidebar-scroll flex-1 overflow-y-auto px-3 pb-6">
        <ul className="space-y-1">
          {can('page:leads') && (
          <li>
            <Link to="/leads" title="Leads" className={active === 'leads'
              ? 'flex items-center justify-between rounded-lg bg-brand-600 px-3 py-2.5 text-white'
              : 'flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-white/5'}>
              <span className="flex items-center gap-3 text-sm font-medium">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>
                <span className="sb-txt">Leads</span>
              </span>
            </Link>
          </li>
          )}
          <li>
            <Link to="/dashboard" title="Inbox" className={active === 'inbox'
              ? 'flex items-center justify-between rounded-lg bg-brand-600 px-3 py-2.5 text-white'
              : 'flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-white/5'}>
              <span className="flex items-center gap-3 text-sm font-medium">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/></svg>
                <span className="sb-txt">Inbox</span>
              </span>
            </Link>
          </li>
          {can('page:tasks') && (
          <li>
            <Link to="/tasks" title="Tasks" className={active === 'tasks'
              ? 'flex items-center justify-between rounded-lg bg-brand-600 px-3 py-2.5 text-white'
              : 'flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-white/5'}>
              <span className="flex items-center gap-3 text-sm font-medium">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6"/><path d="M9 12l2 2 4-4"/><path d="M16 3l5 5-5 5"/></svg>
                <span className="sb-txt">Tasks</span>
              </span>
            </Link>
          </li>
          )}
          <li>
            <Link to="/dashboard?view=mentions" title="Mentions" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-white/5">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/></svg>
              <span className="sb-txt">Mentions</span>
            </Link>
          </li>
          <li>
            <Link to="/dashboard?view=unassigned" title="Unassigned" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-white/5">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              <span className="sb-txt">Unassigned</span>
            </Link>
          </li>
          <li>
            <Link to="/dashboard?view=bookmarks" title="Bookmarks" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-white/5">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
              <span className="sb-txt">Bookmarks</span>
            </Link>
          </li>
          {can('page:ai-assistant') && (
          <li>
            <Link to="/ai-assistant" title="AI Prompting" className={active === 'ai-assistant'
              ? 'flex items-center gap-3 rounded-lg bg-brand-600 px-3 py-2.5 text-sm font-semibold text-white'
              : 'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-violet-300 hover:bg-white/5'}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
              <span className="sb-txt">AI Prompting</span>
            </Link>
          </li>
          )}
          {can('page:after-session') && (
          <li>
            <Link to="/after-session" title="After Session" className={active === 'after-session'
              ? 'flex items-center gap-3 rounded-lg bg-brand-600 px-3 py-2.5 text-sm font-semibold text-white'
              : 'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-violet-300 hover:bg-white/5'}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              <span className="sb-txt">After Session</span>
            </Link>
          </li>
          )}
          <li>
            <Link to="/ai-training" title="AI Training" className={active === 'ai-training'
              ? 'flex items-center gap-3 rounded-lg bg-brand-600 px-3 py-2.5 text-sm font-semibold text-white'
              : 'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-violet-300 hover:bg-white/5'}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
              <span className="sb-txt">AI Training</span>
            </Link>
          </li>
        </ul>

        {/* CRM 360 — converted customers (Inbox se hate); red badge = naye message wale */}
        <p className="sb-txt mt-6 mb-2 px-3 text-[11px] font-bold uppercase tracking-widest text-slate-500">CRM 360</p>
        <ul className="space-y-1">
          <li><Link to="/dashboard?view=converted" title="CRM 360 — converted customers" className={itemCls('crm360') + ' justify-between'}>
            <span className="flex items-center gap-3">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/></svg>
              <span className="sb-txt">CRM 360</span>
            </span>
            {crm360 > 0 && <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-semibold text-white">{crm360}</span>}
          </Link></li>
        </ul>

        <p className="sb-txt mt-6 mb-2 px-3 text-[11px] font-bold uppercase tracking-widest text-slate-500">Settings</p>
        <ul className="space-y-1">
          {can('page:team') && <li><Link to="/team" title="Users" className={itemCls('team')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>
            <span className="sb-txt">Users</span>
          </Link></li>}
          {can('cap:manage_roles') && <li><Link to="/roles" title="Roles & Access" className={itemCls('roles')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 4 5v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V5z"/><path d="m9 12 2 2 4-4"/></svg>
            <span className="sb-txt">Roles &amp; Access</span>
          </Link></li>}
          {can('page:connect-meta') && <li><Link to="/connect-meta" title="Connect Meta" className={itemCls('connect-meta')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.99 22 12z"/></svg>
            <span className="sb-txt">Connect Meta</span>
          </Link></li>}
          {can('page:integrations') && <li><Link to="/integrations" title="Integrations" className={itemCls('integrations')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/></svg>
            <span className="sb-txt">Integrations</span>
          </Link></li>}
          {can('page:settings') && <li><Link to="/settings" title="Settings" className={itemCls('settings')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            <span className="sb-txt">Settings</span>
          </Link></li>}
        </ul>
      </nav>
    </aside>
    </>
  )
}
