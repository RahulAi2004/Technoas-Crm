import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signOut, currentUser } from '../lib/auth.js'
import TopBarUser from '../components/TopBarUser.jsx'
import { useToast } from '../components/ToastContext.jsx'
import { STATUS_OPTIONS } from '../data/conversations.js'
import { api } from '../lib/api.js'

// Normalize a conversation row from the server (snake_case) to the shape the JSX expects (camelCase).
const normalizeConv = (c) => c && ({
  ...c,
  avatarBg:    c.avatar_bg   ?? c.avatarBg,
  channelBg:   c.channel_bg  ?? c.channelBg,
  statusBg:    c.status_bg   ?? c.statusBg,
  statusIcon:  c.status_icon ?? c.statusIcon,
  listPreview: c.list_preview ?? c.listPreview,
  listTime:    c.list_time   ?? c.listTime,
})

const channelIcon = (channel) => {
  if (channel === 'WhatsApp') return <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24z"/></svg>
  if (channel === 'Facebook') return <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.99 22 12z"/></svg>
  if (channel === 'Instagram') return <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/></svg>
  if (channel === 'Email') return <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-10 5L2 7"/></svg>
  return null
}

const nowTime = () => {
  const d = new Date()
  let h = d.getHours(); const m = d.getMinutes(); const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${String(m).padStart(2,'0')} ${ampm}`
}

export default function Dashboard() {
  const toast = useToast()
  const navigate = useNavigate()

  // Persistent UI state
  const [sbCollapsed, setSbCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === '1')
  const [filtersCollapsed, setFiltersCollapsed] = useState(() => localStorage.getItem('filtersCollapsed') === '1')
  const [aiOpen, setAiOpen] = useState(() => localStorage.getItem('aiOpen') !== '0')
  // Filter FORM (date/category/etc.) is independent from the conversation list.
  // Hidden by default so the list gets full height and shows many at once.
  const [showFilterForm, setShowFilterForm] = useState(() => localStorage.getItem('showFilterForm') === '1')
  useEffect(() => localStorage.setItem('sidebarCollapsed', sbCollapsed ? '1' : '0'), [sbCollapsed])
  useEffect(() => localStorage.setItem('filtersCollapsed', filtersCollapsed ? '1' : '0'), [filtersCollapsed])
  useEffect(() => localStorage.setItem('aiOpen', aiOpen ? '1' : '0'), [aiOpen])
  useEffect(() => localStorage.setItem('showFilterForm', showFilterForm ? '1' : '0'), [showFilterForm])

  // Conversation state — fetched from API
  const [conversationsRaw, setConversationsRaw] = useState([])
  // Remember the last opened conversation so a reload continues where you left off.
  const [currentId, setCurrentId] = useState(() => localStorage.getItem('currentConvId') || null)
  const [messages, setMessages] = useState([])
  const [loadingConvs, setLoadingConvs] = useState(true)
  useEffect(() => { if (currentId) localStorage.setItem('currentConvId', currentId) }, [currentId])

  const convTs = (c) => c.last_ts || (c.created_at ? Date.parse(c.created_at) : 0) || 0
  const conversations = useMemo(
    () => conversationsRaw.map(normalizeConv).sort((a, b) => convTs(b) - convTs(a)),
    [conversationsRaw])
  const currentConv = conversations.find((c) => c.id === currentId) || null
  const conv = currentConv ? { ...currentConv, messages } : null

  // Fetch conversations (with polling for new ones from webhook)
  const fetchConvs = async () => {
    try {
      const rows = await api.get('/api/conversations')
      setConversationsRaw(rows)
      // Keep the saved conversation if it still exists; otherwise fall back to the first.
      setCurrentId((cur) => (cur && rows.some((r) => r.id === cur)) ? cur : (rows[0]?.id ?? null))
    } catch { /* keep what we have */ }
    finally { setLoadingConvs(false) }
  }
  useEffect(() => { fetchConvs() }, [])
  useEffect(() => {
    const t = setInterval(fetchConvs, 5000)
    return () => clearInterval(t)
  }, [currentId])

  // Fetch messages whenever current conversation changes; also poll for new incoming
  useEffect(() => {
    if (!currentId) { setMessages([]); return }
    let cancelled = false
    const load = () => api.get(`/api/conversations/${encodeURIComponent(currentId)}/messages`)
      .then((rows) => {
        if (cancelled) return
        // Only update if something actually changed — avoids the scroll jumping
        // back every few seconds when nothing new has arrived.
        setMessages((prev) =>
          (prev.length === rows.length && prev[prev.length - 1]?.id === rows[rows.length - 1]?.id)
            ? prev : rows)
      })
      .catch(() => {})
    load()
    const t = setInterval(load, 4000)
    return () => { cancelled = true; clearInterval(t) }
  }, [currentId])

  // Search + view filter (all / unassigned / mentions / bookmarks)
  const [search, setSearch] = useState('')
  const [view, setView] = useState('all')
  const myName = currentUser()?.name
  const unassignedCount = conversations.filter((c) => !c.assigned_to).length
  const mentionCount = conversations.filter((c) => (c.listPreview || '').includes('@')).length
  const bookmarkCount = conversations.filter((c) => c.bookmarked).length
  const visibleConvs = conversations.filter((c) => {
    if (view === 'unassigned' && c.assigned_to) return false
    if (view === 'bookmarks' && !c.bookmarked) return false
    if (view === 'mentions' && !(c.listPreview || '').includes('@')) return false
    if (!search) return true
    const q = search.toLowerCase()
    return (c.name || '').toLowerCase().includes(q) || (c.listPreview || '').toLowerCase().includes(q)
  })

  // Optimistic conversation patch + persist
  const patchConv = (id, patch) => {
    setConversationsRaw((cs) => cs.map((c) => c.id === id ? { ...c, ...patch } : c))
    api.patch(`/api/conversations/${encodeURIComponent(id)}`, patch).catch(() => {})
  }
  const toggleBookmark = () => currentConv && patchConv(currentConv.id, { bookmarked: !currentConv.bookmarked })
  const assignToMe = () => currentConv && patchConv(currentConv.id, { assigned_to: myName })

  // Composer
  const [mode, setMode] = useState('reply')
  const [draft, setDraft] = useState('')
  const chatRef = useRef(null)
  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight }, [messages.length, currentId])

  const sendMessage = async (text, kind = mode) => {
    if (!text.trim() || !currentId) return
    const direction = kind === 'note' ? 'note' : 'out'
    const time = nowTime()

    // Optimistic UI
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, dir: direction, text: text.trim(), time, agent: currentUser()?.name }])
    setDraft('')

    const isMeta = currentId.startsWith('fb:') || currentId.startsWith('ig:') || currentConv?.source === 'meta'
    if (kind === 'note') {
      // Internal note — save locally only
      try { await api.post(`/api/conversations/${encodeURIComponent(currentId)}/messages`, { dir: 'note', text: text.trim(), time }); toast('Note saved', 'success') }
      catch (ex) { toast(`Save failed: ${ex.message}`, 'error') }
    } else if (currentId.startsWith('mc:')) {
      // ManyChat → Meta
      try { await api.post('/api/manychat/send', { subscriberId: currentId.slice(3), text: text.trim() }); toast('Sent via ManyChat → Meta', 'success') }
      catch (ex) { toast(`ManyChat send failed: ${ex.message}`, 'error') }
    } else if (isMeta) {
      // Direct Meta (Messenger / Instagram) — actually deliver to the customer
      try { await api.post('/api/meta/send', { conversationId: currentId, text: text.trim() }); toast('Sent via Meta', 'success') }
      catch (ex) { toast(`Meta send failed: ${ex.message}`, 'error') }
    } else {
      // Plain CRM conversation — save locally
      try { await api.post(`/api/conversations/${encodeURIComponent(currentId)}/messages`, { dir: direction, text: text.trim(), time }); toast('Message saved', 'success') }
      catch (ex) { toast(`Save failed: ${ex.message}`, 'error') }
    }
    // Re-pull messages so tmp gets replaced with persisted row
    api.get(`/api/conversations/${encodeURIComponent(currentId)}/messages`).then(setMessages).catch(() => {})
  }

  const onKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(draft) } }

  // Middle + AI tabs
  const [midTab, setMidTab] = useState('conversation')
  const [aiTab, setAiTab] = useState('responses')

  // AI Supervisor analysis (real, from OpenAI). Reset when conversation changes.
  const [ai, setAi] = useState({ loading: false, error: null, analysis: null })
  useEffect(() => { setAi({ loading: false, error: null, analysis: null }) }, [currentId])
  const analyze = async () => {
    if (!currentId) return
    setAi({ loading: true, error: null, analysis: null })
    try {
      const r = await api.get(`/api/ai/analyze/${encodeURIComponent(currentId)}`)
      if (r.empty) setAi({ loading: false, error: 'No messages to analyze yet.', analysis: null })
      else setAi({ loading: false, error: null, analysis: r.analysis })
    } catch (e) {
      setAi({ loading: false, error: (e.data?.hint ? `${e.message} — ${e.data.hint}` : e.message), analysis: null })
    }
  }

  // Status dropdown
  const [statusOpen, setStatusOpen] = useState(false)
  const setStatus = async (s) => {
    if (!currentId) return
    setStatusOpen(false)
    // Optimistic local update
    setConversationsRaw((cs) => cs.map((c) => c.id === currentId ? { ...c, status: s.label, status_bg: s.cls, status_icon: s.icon } : c))
    try {
      await api.patch(`/api/conversations/${encodeURIComponent(currentId)}`, { status: s.label, status_bg: s.cls, status_icon: s.icon })
      toast(`Status → ${s.label}`, 'success')
    } catch (ex) {
      toast(`Status update failed: ${ex.message}`, 'error')
    }
  }

  // Pull-in subscriber by ID (from ManyChat)
  const [lookupId, setLookupId] = useState('')
  const lookupSubscriber = async () => {
    if (!lookupId.trim()) return
    try {
      const conv = await api.post('/api/manychat/lookup', { subscriberId: lookupId.trim() })
      setLookupId('')
      await fetchConvs()
      setCurrentId(conv.id)
      toast(`Loaded ${conv.name}`, 'success')
    } catch (ex) {
      toast(`Lookup failed: ${ex.message}`, 'error')
    }
  }

  // Drag to resize
  const panelsRef = useRef(null)
  useEffect(() => {
    const panels = panelsRef.current
    const wf = localStorage.getItem('w-col-filters')
    const wa = localStorage.getItem('w-col-ai')
    if (wf) panels.style.setProperty('--col-filters', wf)
    if (wa) panels.style.setProperty('--col-ai', wa)
  }, [])
  const startDrag = (e, varName, minPx, maxPx, invert, key) => {
    e.preventDefault()
    const panels = panelsRef.current
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)
    handle.classList.add('dragging')
    panels.classList.add('is-resizing')
    const startX = e.clientX
    const startVal = parseFloat(getComputedStyle(panels).getPropertyValue(varName)) || 0
    const onMove = (ev) => {
      let delta = ev.clientX - startX
      if (invert) delta = -delta
      const next = Math.max(minPx, Math.min(maxPx, startVal + delta))
      panels.style.setProperty(varName, next + 'px')
    }
    const onUp = () => {
      handle.classList.remove('dragging')
      panels.classList.remove('is-resizing')
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onUp)
      localStorage.setItem(key, panels.style.getPropertyValue(varName))
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
  }
  const dblResetVar = (varName, key) => () => { panelsRef.current.style.removeProperty(varName); localStorage.removeItem(key) }

  const coming = (label) => toast(`${label} — coming in the next iteration`, 'info')

  return (
    <div id="app-shell" className="grid h-screen" data-collapsed={sbCollapsed || undefined}>
      {/* ============ SIDEBAR ============ */}
      <aside className="flex flex-col bg-ink-900 text-slate-300">
        <div className="sb-brand flex h-16 items-center gap-2 px-5">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-indigo-400 to-indigo-600">
            <span className="text-sm font-black text-white">T</span>
          </div>
          <span className="sb-brand-text text-lg font-bold text-white">Technocas</span>
          <button onClick={() => setSbCollapsed(true)} className="sb-brand-text ml-auto grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white" aria-label="Collapse sidebar">
            <svg id="sb-toggle-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'transform .25s ease' }}><path d="m15 18-6-6 6-6"/></svg>
          </button>
        </div>
        {sbCollapsed && (
          <button onClick={() => setSbCollapsed(false)} className="mx-auto mt-1 grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white" aria-label="Expand sidebar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>
        )}

        <nav className="sidebar-scroll flex-1 overflow-y-auto px-3 pb-6">
          <ul className="space-y-1">
            <li><button onClick={() => setView('all')} className={`sb-item group flex w-full items-center justify-between rounded-lg px-3 py-2.5 ${view === 'all' ? 'bg-brand-600 text-white' : 'hover:bg-white/5'}`} data-tip="Inbox">
              <span className="flex items-center gap-3 text-sm font-semibold">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/></svg>
                <span className="sb-label">Inbox</span>
              </span>
              <span className="sb-badge rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold">{conversations.length}</span>
            </button></li>
            <li><button onClick={() => setView('mentions')} className={`sb-item group flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium ${view === 'mentions' ? 'bg-brand-600 text-white' : 'hover:bg-white/5'}`} data-tip="Mentions">
              <span className="flex items-center gap-3">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/></svg>
                <span className="sb-label">Mentions</span>
              </span>
              {mentionCount > 0 && <span className="sb-badge rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-semibold text-white">{mentionCount}</span>}
            </button></li>
            <li><button onClick={() => setView('unassigned')} className={`sb-item group flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium ${view === 'unassigned' ? 'bg-brand-600 text-white' : 'hover:bg-white/5'}`} data-tip="Unassigned">
              <span className="flex items-center gap-3">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                <span className="sb-label">Unassigned</span>
              </span>
              {unassignedCount > 0 && <span className="sb-badge rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-semibold text-white">{unassignedCount}</span>}
            </button></li>
            <li><button onClick={() => setView('all')} className={`sb-item flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${view === 'all' ? 'text-white' : 'hover:bg-white/5'}`} data-tip="All Conversations">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              <span className="sb-label">All Conversations</span>
            </button></li>
            <li><button onClick={() => setView('bookmarks')} className={`sb-item flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium ${view === 'bookmarks' ? 'bg-brand-600 text-white' : 'hover:bg-white/5'}`} data-tip="Bookmarks">
              <span className="flex items-center gap-3">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                <span className="sb-label">Bookmarks</span>
              </span>
              {bookmarkCount > 0 && <span className="sb-badge rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white">{bookmarkCount}</span>}
            </button></li>
          </ul>

          <p className="sb-section mt-6 mb-2 px-3 text-[11px] font-bold uppercase tracking-widest text-slate-500">Channels</p>
          <ul className="space-y-1">
            {[
              ['WhatsApp', 'bg-emerald-500', 'whatsapp', 8],
              ['Instagram', 'bg-gradient-to-br from-amber-400 via-rose-500 to-fuchsia-600', 'ig', 3],
              ['Facebook', 'bg-blue-600', 'fb', 2],
              ['Email', 'bg-slate-700', 'email', 1],
            ].map((ch) => (
              <li key={ch[2]}><a href="#" className="sb-item flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-white/5" data-tip={ch[0]}>
                <span className="flex items-center gap-3 text-sm font-medium">
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${ch[1]} text-white`}>{channelIcon(ch[0])}</span>
                  <span className="sb-label">{ch[0]}</span>
                </span>
                <span className="sb-badge rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-semibold text-white">{ch[3]}</span>
              </a></li>
            ))}
          </ul>

          {/* CRM 360 section — hidden from the Dashboard sidebar for now. To show again, change false → true */}
          {false && (<>
          <p className="sb-section mt-6 mb-2 px-3 text-[11px] font-bold uppercase tracking-widest text-slate-500">CRM 360</p>
          <ul className="space-y-1">
            <li><Link to="/customers" className="sb-item flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-white/5" data-tip="Customers">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <span className="sb-label">Customers</span>
            </Link></li>
            <li><Link to="/customer-360" className="sb-item flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-white/5" data-tip="Customer 360">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>
              <span className="sb-label">Customer 360</span>
            </Link></li>
            <li><Link to="/leads" className="sb-item flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-white/5" data-tip="Leads">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>
              <span className="sb-label">Leads</span>
            </Link></li>
            <li><Link to="/artwork-vault" className="sb-item flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-white/5" data-tip="Artwork Vault">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
              <span className="sb-label">Artwork Vault</span>
            </Link></li>
            <li><Link to="/receipts" className="sb-item flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-white/5" data-tip="Receipts">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span className="sb-label">Receipts</span>
            </Link></li>
            {/* Tasks — hidden for now. To show again, change false → true */}
            {false && (
            <li><a href="#" onClick={(e)=>{e.preventDefault();coming('Tasks')}} className="sb-item flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-white/5" data-tip="Tasks">
              <span className="flex items-center gap-3 text-sm font-medium">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                <span className="sb-label">Tasks</span>
              </span>
              <span className="sb-badge rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-semibold text-white">6</span>
            </a></li>
            )}
            <li><Link to="/reports" className="sb-item flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-white/5" data-tip="Reports">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/></svg>
              <span className="sb-label">Reports</span>
            </Link></li>
          </ul>
          </>)}

          <p className="sb-section mt-6 mb-2 px-3 text-[11px] font-bold uppercase tracking-widest text-slate-500">Settings</p>
          <ul className="space-y-1">
            <li><Link to="/team" className="sb-item flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-white/5" data-tip="Team">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              <span className="sb-label">Team</span>
            </Link></li>
            <li><Link to="/settings" className="sb-item flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-white/5" data-tip="Settings">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/></svg>
              <span className="sb-label">Settings</span>
            </Link></li>
          </ul>
        </nav>

        <div className="sb-help mx-3 mb-4 rounded-xl bg-white/5 p-3">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-500/20 text-brand-500">?</span>
            <div className="sb-help-text text-xs"><div className="font-semibold text-white">Need Help?</div><div className="text-slate-400">Chat with support</div></div>
          </div>
        </div>
      </aside>

      {/* ============ MAIN ============ */}
      <div className="flex h-screen flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
          <div className="flex items-center gap-3 text-slate-700">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/></svg>
            <span className="text-sm font-semibold">Inbox</span>
            <span className="ml-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> Online
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-0 grid place-items-center pl-3 text-slate-400">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              </span>
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search conversations..." className="w-80 rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-12 text-sm outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20" />
              <kbd className="pointer-events-none absolute inset-y-0 right-2 my-auto grid h-6 place-items-center rounded border border-slate-200 bg-white px-1.5 text-[10px] font-semibold text-slate-500">⌘K</kbd>
            </div>
            <button className="relative grid h-10 w-10 place-items-center rounded-full hover:bg-slate-100" aria-label="Notifications">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
              <span className="absolute -top-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full bg-rose-500 text-[10px] font-bold text-white">6</span>
            </button>
            <TopBarUser />
          </div>
        </header>

        <section ref={panelsRef} id="panels" className="grid flex-1 overflow-hidden" data-filters={filtersCollapsed ? 'collapsed' : 'expanded'} data-ai={aiOpen ? 'open' : 'closed'}>
          {/* ===== Filters / List ===== */}
          <div className="flex flex-col overflow-hidden border-r border-slate-200 bg-white">
            <div id="filters-header" className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <button className="fp-only-expanded inline-flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-sm font-semibold hover:bg-slate-100">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="14" x="3" y="5" rx="2"/><circle cx="12" cy="12" r="2"/></svg>
                All Inboxes
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
              </button>
              <button className="fp-only-collapsed grid h-9 w-9 place-items-center rounded-lg bg-slate-50 hover:bg-slate-100" aria-label="All Inboxes" title="All Inboxes"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="14" x="3" y="5" rx="2"/><circle cx="12" cy="12" r="2"/></svg></button>
              <div className="flex items-center gap-1">
                <button className="fp-only-expanded grid h-8 w-8 place-items-center rounded-lg hover:bg-slate-100"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg></button>
                <button className="fp-only-expanded grid h-8 w-8 place-items-center rounded-lg hover:bg-slate-100"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg></button>
                <button onClick={() => setFiltersCollapsed((x) => !x)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Toggle filters">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'transform .25s ease', transform: filtersCollapsed ? 'rotate(180deg)' : 'none' }}><path d="m15 18-6-6 6-6"/></svg>
                </button>
              </div>
            </div>

            {/* Always-visible bar: count + Filters toggle + sort (independent of the list) */}
            <div className="fp-only-expanded flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-2">
              <span className="text-xs font-semibold text-slate-500">{visibleConvs.length} conversations</span>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setShowFilterForm((x) => !x)} className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${showFilterForm ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                  Filters
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transition: 'transform .2s ease', transform: showFilterForm ? 'rotate(180deg)' : 'none' }}><path d="m6 9 6 6 6-6"/></svg>
                </button>
                <button className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100">Latest <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg></button>
              </div>
            </div>

            {/* Collapsible filter form — hidden by default */}
            {showFilterForm && (
              <div id="filters-body" className="border-b border-slate-200 p-4">
                <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-bold">Filters</h3><button onClick={() => setShowFilterForm(false)} className="text-xs font-semibold text-brand-600 hover:text-brand-700">Hide</button></div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="col-span-2"><label className="mb-1 block font-semibold text-slate-600">Date Range</label><button className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2"><span>May 1 – May 31, 2024</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg></button></div>
                  <div className="col-span-2"><label className="mb-1 block font-semibold text-slate-600">Category</label><select className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2"><option>All Categories</option></select></div>
                  <div><label className="mb-1 block font-semibold text-slate-600">Agent</label><select className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2"><option>All Agents</option></select></div>
                  <div><label className="mb-1 block font-semibold text-slate-600">Lead Status</label><select className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2"><option>All Status</option></select></div>
                  <div><label className="mb-1 block font-semibold text-slate-600">Channel</label><select className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2"><option>All Channels</option></select></div>
                  <div><label className="mb-1 block font-semibold text-slate-600">Tags</label><select className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2"><option>All Tags</option></select></div>
                </div>
              </div>
            )}

            <div id="filters-list" className="nice-scroll flex-1 overflow-y-auto">
              {visibleConvs.length === 0 && !loadingConvs && (
                <div className="px-4 py-8 text-center">
                  <div className="text-3xl">💬</div>
                  <p className="mt-2 text-sm font-semibold text-slate-700">No conversations yet</p>
                  <p className="mt-1 text-xs text-slate-500">Waiting for ManyChat webhooks. Configure the webhook URL on the <Link to="/integrations" className="font-semibold text-brand-600">Integrations</Link> page.</p>
                  <div className="mt-4 flex gap-1 px-2">
                    <input value={lookupId} onChange={(e) => setLookupId(e.target.value)} placeholder="Or paste a Subscriber ID..." className="flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs" />
                    <button onClick={lookupSubscriber} className="rounded-md bg-brand-600 px-2 py-1 text-xs font-semibold text-white hover:bg-brand-700">Add</button>
                  </div>
                </div>
              )}
              {visibleConvs.map((c) => {
                const id = c.id; const active = id === currentId
                return (
                  <button key={id} onClick={() => setCurrentId(id)} className={`flex w-full gap-3 border-l-4 px-4 py-3 text-left ${active ? 'border-brand-500 bg-brand-50/50 hover:bg-brand-50' : 'border-transparent border-b border-slate-100 hover:bg-slate-50'}`}>
                    <div className="relative">
                      <span className={`grid h-10 w-10 place-items-center rounded-full ${c.avatarBg} font-bold text-sm`}>{c.initials}</span>
                      <span className={`absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full ${c.channelBg} ring-2 ring-white text-white`}>{channelIcon(c.channel)}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <div className="truncate text-sm font-semibold">{c.name}</div>
                        <span className="text-[11px] text-slate-500">{c.listTime}</span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <p className="truncate text-xs text-slate-600">{c.listPreview}</p>
                        {c.unread > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{c.unread}</span>}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

          </div>

          <div id="resize-filters" className="resize-handle" role="separator" aria-orientation="vertical" onPointerDown={(e) => startDrag(e, '--col-filters', 220, 480, false, 'w-col-filters')} onDoubleClick={dblResetVar('--col-filters', 'w-col-filters')}></div>

          {/* ===== Middle ===== */}
          <div className="flex h-full flex-col overflow-hidden bg-white">
            {!conv && (
              <div className="grid flex-1 place-items-center px-6 py-8">
                <div className="w-full max-w-xl text-center">
                  <div className="text-5xl">📥</div>
                  <h2 className="mt-3 text-lg font-bold">Inbox is empty</h2>
                  <p className="mt-1 text-sm text-slate-500">When a customer messages your ManyChat bot, that conversation will land here.</p>

                  <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                      <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-50 text-emerald-600">⚡</span>
                      Quick: Add a subscriber by ID
                    </div>
                    <p className="mt-1 text-xs text-slate-500">Paste a subscriber ID from ManyChat → Audience (the URL contains it). Their info is pulled live + a conversation opens here.</p>
                    <div className="mt-3 flex items-center gap-2">
                      <input value={lookupId} onChange={(e) => setLookupId(e.target.value)} placeholder="e.g. 12345678901234567" className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                      <button onClick={lookupSubscriber} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">Add</button>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/50 p-5 text-left">
                    <div className="flex items-center gap-2 text-sm font-bold text-amber-800">🔌 Webhook setup for live messages</div>
                    <p className="mt-1 text-xs text-amber-900/70">ManyChat needs a <strong>public URL</strong> for the webhook — your <code className="rounded bg-white px-1">localhost</code> URL is not reachable from the internet.</p>
                    <div className="mt-2 space-y-1 text-xs text-amber-900/80">
                      <div><strong>Option A — ngrok (5 min):</strong> Install ngrok → run <code className="rounded bg-white px-1">ngrok http 3001</code> → use the <code className="rounded bg-white px-1">https://....ngrok.io/api/webhooks/manychat</code> URL in ManyChat → Automation → External Triggers.</div>
                      <div><strong>Option B — Deploy:</strong> Push this project to Vercel and use <code className="rounded bg-white px-1">https://&lt;your-app&gt;.vercel.app/api/webhooks/manychat</code>.</div>
                    </div>
                  </div>

                  <Link to="/integrations" className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50">Configure ManyChat →</Link>
                </div>
              </div>
            )}
            {conv && (<>
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${conv.avatarBg} text-sm font-bold`}>{conv.initials}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-base font-bold">{conv.name}</h2>
                    <div className="relative">
                      <button onClick={(e) => { e.stopPropagation(); setStatusOpen((x) => !x) }} className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${conv.statusBg}`} title="Change lead status">{conv.statusIcon} {conv.status}</button>
                      {statusOpen && (
                        <div className="absolute z-[120] mt-1 w-48 rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                          {STATUS_OPTIONS.map((s) => (
                            <button key={s.label} onClick={() => setStatus(s)} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs hover:bg-slate-50">
                              <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${s.cls}`}>{s.icon}</span>
                              <span>{s.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><span className={`grid h-4 w-4 place-items-center rounded-full ${conv.channelBg} text-white`}>{channelIcon(conv.channel)}</span> {conv.channel}</span>
                    <span className="whitespace-nowrap">{conv.phone}</span>
                    <span className="inline-flex items-center gap-1 whitespace-nowrap"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> {conv.company}</span>
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button onClick={toggleBookmark} title={conv.bookmarked ? 'Remove bookmark' : 'Bookmark'} className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border ${conv.bookmarked ? 'border-amber-300 bg-amber-50 text-amber-600' : 'border-slate-200 hover:bg-slate-50 text-slate-500'}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill={conv.bookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                </button>
                <button onClick={assignToMe} title={conv.assigned_to ? `Assigned to ${conv.assigned_to}` : 'Assign to me'} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-semibold hover:bg-slate-50">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                  {conv.assigned_to && <span className="max-w-[80px] truncate text-xs">{conv.assigned_to.split(' ')[0]}</span>}
                </button>
                {!aiOpen && (
                  <button onClick={() => setAiOpen(true)} title="AI Supervisor" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                  </button>
                )}
                <button className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 hover:bg-slate-50" aria-label="More"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg></button>
              </div>
            </div>

            <nav className="flex items-center gap-8 border-b border-slate-200 px-5">
              {[['conversation','Conversation'],['customer','Customer Info'],['history','History']].map(([id, lbl]) => (
                <button key={id} onClick={() => setMidTab(id)} className={`whitespace-nowrap border-b-2 py-3 text-sm ${midTab === id ? 'border-brand-500 text-brand-600 font-semibold' : 'border-transparent text-slate-500 font-medium hover:text-slate-700'}`}>{lbl}</button>
              ))}
            </nav>

            {midTab === 'conversation' && (
              <div className="flex min-h-0 flex-1 flex-col">
                <div ref={chatRef} className="nice-scroll flex-1 overflow-y-auto bg-slate-50/40 px-6 py-5">
                  <div className="my-2 flex justify-center"><span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-500 shadow-sm">May 12, 2024</span></div>
                  {conv.messages.map((m, i) => {
                    if (m.dir === 'sys') return <div key={i} className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-500"><span>{m.time}</span>·<span>{m.text}</span></div>
                    if (m.dir === 'in') return (
                      <div key={i} className="mt-4 flex items-start gap-2">
                        <span className={`mt-1 grid h-8 w-8 place-items-center rounded-full ${conv.avatarBg} text-xs font-bold`}>{conv.initials}</span>
                        <div className="max-w-md rounded-2xl rounded-tl-md bg-white px-4 py-2.5 text-sm shadow-sm ring-1 ring-slate-100">{m.text}<div className="mt-1 text-[10px] text-slate-400">{m.time}</div></div>
                      </div>
                    )
                    if (m.dir === 'note') return (
                      <div key={i} className="mt-4 flex items-start justify-end gap-2">
                        <div className="max-w-md rounded-2xl rounded-tr-md bg-amber-50 px-4 py-2.5 text-sm text-amber-900 shadow-sm ring-1 ring-amber-200">
                          <div className="mb-1 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">📝 Internal note{m.agent ? ` · ${m.agent}` : ''}</div>
                          <div>{m.text}</div>
                          <div className="mt-1 text-right text-[10px] text-amber-700/70">{m.time}</div>
                        </div>
                      </div>
                    )
                    return (
                      <div key={i} className="mt-4 flex flex-col items-end">
                        {(m.agent || m.via === 'meta') && (
                          <div className="mb-0.5 mr-10 text-[10px] font-semibold text-slate-500">
                            {m.agent ? m.agent : 'via Meta (Business Suite)'}
                          </div>
                        )}
                        <div className="flex items-start justify-end gap-2">
                          <div className="max-w-md rounded-2xl rounded-tr-md bg-brand-50 px-4 py-2.5 text-sm text-brand-900 shadow-sm ring-1 ring-brand-100">{m.text}<div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-500">{m.time}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/><polyline points="22 11 13 20"/></svg></div></div>
                          <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-600 text-[10px] font-bold text-white" title={m.agent || 'via Meta'}>
                            {m.agent ? m.agent.split(/\s+/).map(w => w[0]).join('').slice(0,2).toUpperCase() : 'M'}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="border-t border-slate-200 bg-white px-6 py-3">
                  <div className="mb-2 flex items-center gap-4 text-sm">
                    <button onClick={() => setMode('reply')} className={`pb-1 ${mode === 'reply' ? 'border-b-2 border-brand-500 font-semibold text-brand-600' : 'border-b-2 border-transparent font-medium text-slate-500 hover:text-slate-700'}`}>Reply</button>
                    <button onClick={() => setMode('note')} className={`pb-1 ${mode === 'note' ? 'border-b-2 border-brand-500 font-semibold text-brand-600' : 'border-b-2 border-transparent font-medium text-slate-500 hover:text-slate-700'}`}>Note</button>
                  </div>
                  <textarea rows="2" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKeyDown} placeholder={mode === 'note' ? 'Write an internal note (visible to team only)...' : 'Type your message...'} className="block w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"></textarea>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-1 text-slate-500"></div>
                    <button onClick={() => sendMessage(draft)} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
                      Send
                    </button>
                  </div>
                </div>
              </div>
            )}

            {midTab === 'customer' && (
              <div className="nice-scroll min-h-0 flex-1 overflow-y-auto px-6 py-5">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-center justify-between"><h4 className="text-sm font-bold">Contact Information</h4><button className="text-xs font-semibold text-brand-600 hover:text-brand-700">Edit</button></div>
                  <dl className="space-y-2.5 text-sm">
                    <div className="flex justify-between"><dt className="text-slate-500">Full Name</dt><dd className="font-medium">{conv.name}</dd></div>
                    <div className="flex justify-between"><dt className="text-slate-500">Phone</dt><dd className="font-medium">{conv.phone}</dd></div>
                    <div className="flex justify-between"><dt className="text-slate-500">Channel</dt><dd className="font-medium">{conv.channel}</dd></div>
                    <div className="flex justify-between"><dt className="text-slate-500">Company</dt><dd className="font-medium">{conv.company}</dd></div>
                    <div className="flex justify-between"><dt className="text-slate-500">Status</dt><dd className="font-semibold">{conv.status}</dd></div>
                  </dl>
                </div>
              </div>
            )}

            {midTab === 'history' && (
              <div className="nice-scroll min-h-0 flex-1 overflow-y-auto px-6 py-5">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <h4 className="text-sm font-bold mb-3">Active Customer Activity (Stages)</h4>
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500"><th className="py-2 font-semibold">Date &amp; Time</th><th className="py-2 font-semibold">Stage</th><th className="py-2 font-semibold">Status</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr><td className="py-2.5">May 12, 2024 10:23 AM</td><td>Lead Initiation</td><td><span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Completed</span></td></tr>
                      <tr><td className="py-2.5">May 12, 2024 10:23 AM</td><td>Auto Responded</td><td><span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Completed</span></td></tr>
                      <tr><td className="py-2.5">May 12, 2024 10:26 AM</td><td>Human Responded</td><td><span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Completed</span></td></tr>
                      <tr><td className="py-2.5">May 12, 2024 10:28 AM</td><td>Design Received</td><td><span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Completed</span></td></tr>
                      <tr><td className="py-2.5">May 12, 2024 10:31 AM</td><td>Address Provided</td><td><span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">Not Yet Reached</span></td></tr>
                      <tr><td className="py-2.5">May 12, 2024 10:33 AM</td><td>Quotation Given</td><td><span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">Not Yet Reached</span></td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            </>)}
          </div>

          <div id="resize-ai" className="resize-handle" role="separator" aria-orientation="vertical" onPointerDown={(e) => startDrag(e, '--col-ai', 320, 720, true, 'w-col-ai')} onDoubleClick={dblResetVar('--col-ai', 'w-col-ai')}></div>

          {/* ===== AI Supervisor ===== */}
          <aside id="ai-panel" className="flex h-full flex-col overflow-hidden border-l border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white">✨</span>
                <h3 className="text-sm font-bold">AI Supervisor</h3>
                <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">Beta</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={analyze} disabled={ai.loading || !currentId} title="Analyze this conversation with AI"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
                  {ai.loading ? 'Analyzing…' : ai.analysis ? '↻ Re-analyze' : '✨ Analyze'}
                </button>
                <button onClick={() => setAiOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-slate-100" aria-label="Close">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>
            {ai.error && <div className="border-b border-rose-100 bg-rose-50 px-5 py-2 text-xs text-rose-700">{ai.error}</div>}

            <nav className="flex items-center gap-5 border-b border-slate-200 px-5 text-sm">
              {[['responses','Responses'],['actions','Actions'],['designer','Designer Jobs'],['intent','Intent & Insights']].map(([id, lbl]) => (
                <button key={id} onClick={() => setAiTab(id)} className={`whitespace-nowrap border-b-2 py-3 ${aiTab === id ? 'border-brand-500 text-brand-600 font-semibold' : 'border-transparent text-slate-500 font-medium hover:text-slate-700'}`}>{lbl}</button>
              ))}
            </nav>

            <div className="nice-scroll flex-1 overflow-y-auto px-5 py-4">
              {aiTab === 'responses' && <ResponsesTab onSendReply={(text) => sendMessage(text, 'reply')} lastIncoming={[...messages].reverse().find((m) => m.dir === 'in')?.text || ''} ai={ai} onAnalyze={analyze} />}
              {aiTab === 'actions' && <ActionsTab ai={ai} onAnalyze={analyze} />}
              {aiTab === 'designer' && <DesignerTab />}
              {aiTab === 'intent' && <IntentTab ai={ai} onAnalyze={analyze} />}
            </div>
          </aside>
        </section>
      </div>
    </div>
  )
}

const TRANSLATE_LANGS = [
  ['es', 'Spanish'], ['fr', 'French'], ['pt', 'Portuguese'], ['ar', 'Arabic'],
  ['hi', 'Hindi'], ['ur', 'Urdu'], ['de', 'German'], ['it', 'Italian'],
  ['zh', 'Chinese'], ['ru', 'Russian'], ['tr', 'Turkish'], ['nl', 'Dutch'],
]

function TranslationHelper({ onSendReply, lastIncoming }) {
  const toast = useToast()
  const [lang, setLang] = useState(() => localStorage.getItem('translateLang') || 'es')
  useEffect(() => localStorage.setItem('translateLang', lang), [lang])

  // Customer message → English (ALWAYS the live last customer/lead message)
  const [inResult, setInResult] = useState('')
  const [inBusy, setInBusy] = useState(false)
  useEffect(() => { setInResult('') }, [lastIncoming])  // new customer message → clear old translation

  // English reply → customer language
  const [outText, setOutText] = useState('')
  const [outResult, setOutResult] = useState('')
  const [outBusy, setOutBusy] = useState(false)

  const translate = async (text, from, to) => {
    const r = await api.post('/api/translate', { text, from, to })
    return r.translated
  }

  const doIncoming = async () => {
    if (!lastIncoming.trim()) return
    setInBusy(true)
    try { setInResult(await translate(lastIncoming.trim(), lang, 'en')) }
    catch (ex) { toast(ex.message || 'Translate failed', 'error') }
    finally { setInBusy(false) }
  }
  const doOutgoing = async () => {
    if (!outText.trim()) return
    setOutBusy(true)
    try { setOutResult(await translate(outText.trim(), 'en', lang)) }
    catch (ex) { toast(ex.message || 'Translate failed', 'error') }
    finally { setOutBusy(false) }
  }

  const langName = TRANSLATE_LANGS.find((l) => l[0] === lang)?.[1] || lang

  return (
    <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-sm font-bold text-violet-800">🌐 Translation Helper</h4>
        <select value={lang} onChange={(e) => setLang(e.target.value)} className="rounded-md border border-violet-200 bg-white px-2 py-1 text-xs font-semibold">
          {TRANSLATE_LANGS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        </select>
      </div>

      {/* Customer message -> English */}
      <div className="mt-3">
        <label className="mb-1 block text-[11px] font-semibold text-slate-600">Last customer message ({langName}) → English</label>
        <textarea rows="2" value={lastIncoming} readOnly placeholder="Abhi koi customer message nahi aaya" className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none" />
        <button onClick={doIncoming} disabled={inBusy || !lastIncoming.trim()} className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
          {inBusy ? 'Translating…' : 'Translate to English'}
        </button>
        {inResult && (
          <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2.5 text-sm text-slate-800">
            {inResult}
            <button onClick={() => { navigator.clipboard?.writeText(inResult); toast('Copied', 'success') }} className="mt-1 block text-[11px] font-semibold text-violet-600 hover:text-violet-700">Copy</button>
          </div>
        )}
      </div>

      <div className="my-3 border-t border-violet-200"></div>

      {/* English -> customer language */}
      <div>
        <label className="mb-1 block text-[11px] font-semibold text-slate-600">Your reply (English) → {langName}</label>
        <textarea rows="2" value={outText} onChange={(e) => setOutText(e.target.value)} placeholder="English mein type karo..." className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20" />
        <button onClick={doOutgoing} disabled={outBusy || !outText.trim()} className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
          {outBusy ? 'Translating…' : `Translate to ${langName}`}
        </button>
        {outResult && (
          <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2.5 text-sm text-slate-800">
            {outResult}
            <div className="mt-2 flex items-center gap-2">
              <button onClick={() => { onSendReply(outResult); toast(`Sent in ${langName}`, 'success') }} className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-700">▶ Send</button>
              <button onClick={() => { navigator.clipboard?.writeText(outResult); toast('Copied', 'success') }} className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold hover:bg-slate-50">Copy</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function AnalyzePrompt({ onAnalyze, loading, label }) {
  return (
    <div className="rounded-xl border border-dashed border-violet-300 bg-violet-50/40 p-6 text-center">
      <div className="text-2xl">✨</div>
      <p className="mt-1 text-sm font-semibold text-slate-700">{label || 'AI analysis not run yet'}</p>
      <p className="mt-0.5 text-xs text-slate-500">Is conversation ko AI se analyze karo — Intent, Insights, Reply sab real generate honge.</p>
      <button onClick={onAnalyze} disabled={loading} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
        {loading ? 'Analyzing…' : '✨ Analyze with AI'}
      </button>
    </div>
  )
}

// Full class strings (Tailwind can't see dynamically-built `text-${x}-600`).
const TONE = {
  emerald: { text: 'text-emerald-600', soft: 'bg-emerald-50 text-emerald-700', bar: 'bg-emerald-500' },
  amber:   { text: 'text-amber-600',   soft: 'bg-amber-50 text-amber-700',     bar: 'bg-amber-500' },
  rose:    { text: 'text-rose-600',    soft: 'bg-rose-50 text-rose-700',       bar: 'bg-rose-500' },
}
const scoreTone = (n) => n >= 80 ? TONE.emerald : n >= 60 ? TONE.amber : TONE.rose
const sentimentTone = (label) => label === 'Positive' ? TONE.emerald : label === 'Negative' ? TONE.rose : TONE.amber

function ResponsesTab({ onSendReply, lastIncoming, ai, onAnalyze }) {
  const toast = useToast()
  const a = ai?.analysis
  const [reply, setReply] = useState('')          // what's shown in the box
  const [orig, setOrig] = useState('')            // the customer-language version (to send)
  const [showingEn, setShowingEn] = useState(false)
  const [transBusy, setTransBusy] = useState(false)
  const lang = (typeof localStorage !== 'undefined' && localStorage.getItem('translateLang')) || 'es'
  useEffect(() => { setReply(a?.recommendedReply || ''); setOrig(a?.recommendedReply || ''); setShowingEn(false) }, [a?.recommendedReply])

  const toggleReplyLang = async () => {
    if (showingEn) { setReply(orig); setShowingEn(false); return }   // back to customer language
    setTransBusy(true)
    try {
      const cur = reply
      const r = await api.post('/api/translate', { text: cur, from: lang, to: 'en' })
      setOrig(cur)                  // remember the version we'll actually send
      setReply(r.translated)
      setShowingEn(true)
    } catch (ex) { toast(ex.message || 'Translate failed', 'error') }
    finally { setTransBusy(false) }
  }
  const sendReply = () => {
    const text = (showingEn ? orig : reply).trim()
    if (text) { onSendReply(text); toast('AI reply sent to chat', 'success') }
  }
  return (
    <>
      <TranslationHelper onSendReply={onSendReply} lastIncoming={lastIncoming} />
      {!a ? (
        <AnalyzePrompt onAnalyze={onAnalyze} loading={ai?.loading} />
      ) : (
        <>
          {a.agentScore && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-bold">Agent Professionalism Score</div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className={`text-3xl font-extrabold ${scoreTone(a.agentScore.score).text}`}>{a.agentScore.score}</span>
                <span className="text-sm text-slate-500">/100</span>
                {a.agentScore.label && <span className={`ml-2 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${scoreTone(a.agentScore.score).soft}`}>{a.agentScore.label}</span>}
              </div>
            </div>
          )}
          {Array.isArray(a.insights) && a.insights.length > 0 && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-bold">AI Interpretation</div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                {a.insights.map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </div>
          )}
          {a.recommendedReply && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-bold">AI Recommended Reply (Editable)</div>
                <button onClick={toggleReplyLang} disabled={transBusy} title="Translate to understand; sends in customer's language"
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold ${showingEn ? 'bg-violet-600 text-white' : 'border border-violet-200 text-violet-700 hover:bg-violet-50'}`}>
                  🌐 {transBusy ? '…' : showingEn ? `Back to ${lang.toUpperCase()}` : 'English'}
                </button>
              </div>
              <textarea value={reply} onChange={(e) => { setReply(e.target.value); if (!showingEn) setOrig(e.target.value) }} rows={5}
                className="mt-2 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:bg-white" />
              {showingEn && <div className="mt-1 text-[11px] text-amber-700">👁 English preview — Send karoge to customer ko <b>{lang.toUpperCase()}</b> version jaayega.</div>}
              <div className="mt-3 flex items-center gap-2">
                <button onClick={sendReply} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">▶ Send</button>
                <button onClick={() => { navigator.clipboard?.writeText(showingEn ? orig : reply); toast('Copied', 'success') }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">Copy</button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  )
}

function ActionsTab({ ai, onAnalyze }) {
  const toast = useToast()
  const a = ai?.analysis
  const [done, setDone] = useState(new Set())
  if (!a) return <AnalyzePrompt onAnalyze={onAnalyze} loading={ai?.loading} />
  const actions = a.suggestedActions || []
  const missing = a.missingInfo || []
  const pCls = (p) => p === 'High' ? 'text-emerald-600' : p === 'Medium' ? 'text-amber-600' : 'text-slate-500'
  return (
    <>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-bold">AI Suggested Actions</div>
        {actions.length === 0 ? <p className="mt-2 text-xs text-slate-500">No actions suggested.</p> : (
          <ul className="mt-3 space-y-3 text-sm">
            {actions.map((act, i) => (
              <li key={i} className="rounded-lg border border-slate-200 p-3" style={{ opacity: done.has(i) ? 0.4 : 1 }}>
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <div className="font-semibold">{act.title}</div>
                    <div className="text-xs text-slate-500">Reason: {act.reason}</div>
                    <div className={`text-xs font-semibold ${pCls(act.priority)}`}>Priority: {act.priority}</div>
                  </div>
                  <button onClick={() => { setDone((s) => new Set(s).add(i)); toast(`✓ ${act.title}`, 'success') }} className="shrink-0 rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-700">Done</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {missing.length > 0 && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-sm font-bold">Missing Information</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
            {missing.map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        </div>
      )}
    </>
  )
}

function DesignerTab() {
  const toast = useToast()
  const TEAM = [
    { name:'Jane Smith', initials:'JS', chip:'bg-fuchsia-100 text-fuchsia-600' },
    { name:'Mike Johnson', initials:'MJ', chip:'bg-indigo-100 text-indigo-600' },
    { name:'Emily Davis', initials:'ED', chip:'bg-pink-100 text-pink-600' },
    { name:'Alex Brown', initials:'AB', chip:'bg-amber-100 text-amber-700' },
  ]
  const PRIORITY_CLS = {
    High:   'bg-rose-50 text-rose-700 hover:bg-rose-100',
    Medium: 'bg-amber-50 text-amber-700 hover:bg-amber-100',
    Low:    'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
  }
  const initialRows = [
    { id:1, code:'AW-2026-001', assignee:'Jane Smith', priority:'High', instructions:'Create front design with school logo on left chest and event text on right chest.', checked:true },
    { id:2, code:'AW-2026-002', assignee:'Mike Johnson', priority:'High', instructions:'Add "Springfield High School Event 2024" in large text on the back.', checked:true },
    { id:3, code:'AW-2026-003', assignee:'Emily Davis', priority:'Medium', instructions:'Add mascot logo on left sleeve.', checked:false },
    { id:4, code:'AW-2026-004', assignee:'Alex Brown', priority:'Low', instructions:'Design size label for S to 2XL.', checked:true },
    { id:5, code:'AW-2026-005', assignee:'Jane Smith', priority:'Medium', instructions:'Generate hoodie mockups in black and white colors.', checked:false },
    { id:6, code:'AW-2026-006', assignee:'Mike Johnson', priority:'Low', instructions:'Prepare color variations for navy, grey and maroon.', checked:true },
  ]
  const [rows, setRows] = useState(initialRows)
  const [nextId, setNextId] = useState(7)
  const selectedCount = rows.filter((r) => r.checked).length
  const update = (id, patch) => setRows((xs) => xs.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const remove = (id) => setRows((xs) => xs.filter((r) => r.id !== id))
  const addRow = () => {
    setRows((xs) => [...xs, { id: nextId, code: `AW-2026-${String(nextId).padStart(3, '0')}`, assignee:'', priority:'Medium', instructions:'', checked:false }])
    setNextId((n) => n + 1)
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-2 text-sm font-bold"><span className="text-violet-600">✨</span> Designer Jobs</h4>
          <p className="mt-0.5 text-xs text-slate-500">All artworks and tasks extracted from this conversation.</p>
        </div>
      </div>
      <ul className="space-y-2">
        {rows.map((row, idx) => {
          const team = TEAM.find(t => t.name === row.assignee)
          return (
            <li key={row.id} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2.5">
              <input type="checkbox" checked={row.checked} onChange={(e) => update(row.id, { checked: e.target.checked })} className="mt-1 h-3.5 w-3.5 shrink-0 accent-brand-600" />
              <div className="grid w-8 shrink-0 place-items-center text-xs font-semibold text-slate-500">{idx + 1}</div>
              <div className="shrink-0">
                <div className="grid h-12 w-12 place-items-center rounded-md bg-slate-900 ring-1 ring-slate-200 text-[10px] font-bold text-white">{row.code.split('-').pop()}</div>
                <div className="mt-1 text-center text-[10px] text-slate-500">{row.code}</div>
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <select value={row.assignee} onChange={(e) => update(row.id, { assignee: e.target.value })} className="flex w-full items-center justify-between rounded-md border border-slate-200 bg-white px-2 py-1 text-xs">
                  <option value="">Unassigned</option>
                  {TEAM.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                </select>
                <select value={row.priority} onChange={(e) => update(row.id, { priority: e.target.value })} className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-xs font-semibold ${PRIORITY_CLS[row.priority]}`}>
                  <option>High</option><option>Medium</option><option>Low</option>
                </select>
                <input type="text" value={row.instructions} onChange={(e) => update(row.id, { instructions: e.target.value })} placeholder="Enter instructions..." className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <button className="grid h-7 w-7 place-items-center rounded-md text-brand-600 hover:bg-brand-50" aria-label="Edit">✎</button>
                <button onClick={() => remove(row.id)} className="grid h-7 w-7 place-items-center rounded-md text-rose-500 hover:bg-rose-50" aria-label="Delete">🗑</button>
              </div>
            </li>
          )
        })}
      </ul>
      <button onClick={addRow} className="mt-3 flex w-full flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-brand-500/40 bg-brand-50/40 py-3 text-sm font-semibold text-brand-600 hover:bg-brand-50">
        <span className="inline-flex items-center gap-1.5">+ Add Row</span>
        <span className="text-[10px] font-normal text-slate-500">Add more artworks / tasks</span>
      </button>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-500">{selectedCount} task{selectedCount === 1 ? '' : 's'} selected</span>
        <div className="flex items-center gap-2">
          <button onClick={() => toast('Edit & Resend', 'info')} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-50">✎ Edit &amp; Resend</button>
          <button onClick={() => toast(`Generated ${selectedCount} cards`, 'success')} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">✨ Generate Cards</button>
        </div>
      </div>
      <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-slate-500">ℹ Only selected tasks will be included in the generated cards.</p>
    </div>
  )
}

function IntentTab({ ai, onAnalyze }) {
  const a = ai?.analysis
  if (!a) return <AnalyzePrompt onAnalyze={onAnalyze} loading={ai?.loading} />
  const intent = a.intent || {}
  const ci = a.customerInsights || {}
  const sent = a.sentiment || {}
  const tone = sentimentTone(sent.label)
  const rows = [
    ['Product Interest', ci.productInterest], ['Design Theme', ci.designTheme],
    ['Buyer Type', ci.buyerType], ['Buying Signals', ci.buyingSignals],
    ['Urgency', ci.urgency], ['Budget Sensitivity', ci.budgetSensitivity],
    ['Decision Maker', ci.decisionMaker], ['Engagement Level', ci.engagement],
    ['Repeat Customer', ci.repeatCustomer],
  ].filter((r) => r[1])
  return (
    <>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold">Detected Intent</h4>
          {intent.confidence != null && <div className="text-right"><div className="text-[10px] uppercase tracking-wide text-slate-400">Confidence</div><div className="text-sm font-bold text-emerald-600">{intent.confidence}%</div></div>}
        </div>
        {intent.primary && <div className="mt-3"><div className="text-xs text-slate-500">Primary Intent</div><div className="mt-1"><span className="inline-flex rounded-md bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700">{intent.primary}</span></div></div>}
        {intent.summary && <div className="mt-3 text-sm"><div className="text-xs text-slate-500">Intent Summary</div><p className="mt-1 text-slate-700">{intent.summary}</p></div>}
      </div>
      {rows.length > 0 && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <h4 className="mb-3 text-sm font-bold">Customer Insights</h4>
          <dl className="grid grid-cols-2 gap-y-2">
            {rows.map(([k, v], i) => (
              <Fragment key={i}><dt className="text-slate-500">{k}</dt><dd className="font-semibold">{v}</dd></Fragment>
            ))}
          </dl>
        </div>
      )}
      {sent.label && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between"><h4 className="text-sm font-bold">Sentiment Analysis</h4><span className={`text-xs font-semibold ${tone.text}`}>{sent.label}{sent.score != null ? ` · ${sent.score}%` : ''}</span></div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${sent.score ?? 50}%` }}></div></div>
        </div>
      )}
    </>
  )
}
