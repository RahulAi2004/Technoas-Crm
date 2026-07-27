import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signOut, currentUser } from '../lib/auth.js'
import TopBarUser from '../components/TopBarUser.jsx'
import MobileNav, { closeNav } from '../components/MobileNav.jsx'
import { useToast } from '../components/ToastContext.jsx'
import { STATUS_OPTIONS } from '../data/conversations.js'
import { api, getToken } from '../lib/api.js'
import { FlagBadges, FlagChip, ManageFlagsModal } from '../components/CustomerFlags.jsx'
import LeadPanel from '../components/LeadPanel.jsx'

// Normalize a conversation row from the server (snake_case) to the shape the JSX expects (camelCase).
const normalizeConv = (c) => c && ({
  ...c,
  avatarBg:    c.avatar_bg   ?? c.avatarBg,
  channelBg:   c.channel_bg  ?? c.channelBg,
  statusBg:    c.status_bg   ?? c.statusBg,
  statusIcon:  c.status_icon ?? c.statusIcon,
  listPreview: c.list_preview ?? c.listPreview,
  listTime:    c.list_time   ?? c.listTime,
  lastDir:     c.last_dir    ?? c.lastDir,
})

const channelIcon = (channel) => {
  if (channel === 'WhatsApp') return <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24z"/></svg>
  if (channel === 'Facebook') return <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.99 22 12z"/></svg>
  if (channel === 'Instagram') return <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/></svg>
  if (channel === 'Email') return <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-10 5L2 7"/></svg>
  return null
}

// Facebook ke CDN link 2-3 hafte mein expire ho jate hain. Har image ki asli copy
// hamare PostgreSQL + NextCloud mein saved hai, isliye link marne par apni copy dikhao.
export function ourCopyUrl(att) {
  if (!att?.name) return null
  return `/api/artwork-file?name=${encodeURIComponent(att.name)}&t=${encodeURIComponent(getToken() || '')}`
}

// Chat image: HAMESHA pehle apni PG copy (blob) — `fetch` (Authorization header) se laa kar.
// Ye same-origin + permanent + reliable hai. Meta CDN url (att.url) cross-origin hota hai aur
// kuch hafton mein EXPIRE ho jata hai (isliye woh sirf aakhri fallback, jab PG copy na mile).
// PG copy /api/artwork-file se milti hai — artwork_no YA file_name ("image-<metaid>") dono se.
function ChatImage({ att, className = 'max-h-64 max-w-full rounded-lg object-cover' }) {
  const hasName = !!att?.name
  const [blobUrl, setBlobUrl] = useState(null)
  const [oursFailed, setOursFailed] = useState(!hasName)   // PG copy try khatam (naam na ho to seedhe url)
  const [gone, setGone] = useState(false)

  useEffect(() => {
    if (!hasName) return
    let cancelled = false, obj = null
    const load = async (tries = 0) => {
      try {
        const res = await fetch(`/api/artwork-file?name=${encodeURIComponent(att.name)}`,
          { headers: { Authorization: `Bearer ${getToken() || ''}` } })
        if (!res.ok) throw new Error('http ' + res.status)
        const blob = await res.blob()
        if (cancelled) return
        obj = URL.createObjectURL(blob); setBlobUrl(obj)
      } catch {
        if (cancelled) return
        if (tries < 4) setTimeout(() => load(tries + 1), 1200)   // abhi bheji file: race -> retry
        else setOursFailed(true)   // PG copy nahi mili -> Meta CDN url fallback
      }
    }
    load()
    return () => { cancelled = true; if (obj) URL.revokeObjectURL(obj) }
  }, [att?.name, hasName])

  // 1) PG copy (blob) mil gayi — reliable
  if (blobUrl) return (
    <a href={blobUrl} target="_blank" rel="noreferrer" className="block">
      <img src={blobUrl} alt={att.name || 'image'} className={className} />
    </a>
  )
  // 2) PG copy abhi aa rahi hai
  if (!oursFailed) return (
    <div className="flex max-w-full items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-400 ring-1 ring-slate-200">
      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-500" /> loading…
    </div>
  )
  // 3) PG copy nahi mili -> Meta CDN url try karo (agar ho)
  if (att?.url && !gone) return (
    <a href={att.url} target="_blank" rel="noreferrer" className="block">
      <img src={att.url} alt={att.name || 'image'} loading="lazy" className={className} onError={() => setGone(true)} />
    </a>
  )
  // 4) kuch nahi mila
  return (
    <div className="flex max-w-full items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-[11px] text-slate-500 ring-1 ring-slate-200">
      🖼️ <span>Image not available</span>
    </div>
  )
}

// Render image/video/file attachments inside a chat bubble.
function MsgAttachments({ items }) {
  if (!Array.isArray(items) || !items.length) return null
  return (
    <div className="mb-1.5 space-y-1.5">
      {items.map((a, i) => {
        if (!a?.url && !a?.name) return null              // kuch bhi na ho to skip
        if (a.type === 'image') return <ChatImage key={i} att={a} />
        if (a.type === 'video' && a.url) return <video key={i} src={a.url} controls className="max-h-64 max-w-full rounded-lg" />
        const href = a.url || ourCopyUrl(a)               // file: url ya PG copy
        return <a key={i} href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand-600 underline">📎 {a.name || 'Attachment'}</a>
      })}
    </div>
  )
}

const nowTime = () => {
  const d = new Date()
  let h = d.getHours(); const m = d.getMinutes(); const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${String(m).padStart(2,'0')} ${ampm}`
}

// Chat ka din-wala divider label: aaj -> "Today", kal -> "Yesterday", warna "13 Jul 2026".
const dayLabel = (ts) => {
  if (!ts) return ''
  const d = new Date(ts), now = new Date()
  const y = new Date(now); y.setDate(now.getDate() - 1)
  const same = (a, b) => a.toDateString() === b.toDateString()
  if (same(d, now)) return 'Today'
  if (same(d, y)) return 'Yesterday'
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function Dashboard() {
  const toast = useToast()
  const navigate = useNavigate()

  // Persistent UI state
  const [sbCollapsed, setSbCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === '1')
  const [filtersCollapsed, setFiltersCollapsed] = useState(() => localStorage.getItem('filtersCollapsed') === '1')
  const [aiOpen, setAiOpen] = useState(() => localStorage.getItem('aiOpen') !== '0')
  // Lead Details panel — AI Supervisor ke saath ek waqt me EK hi khulta hai (toggle).
  const [leadOpen, setLeadOpen] = useState(false)
  const openAiPanel = () => { setAiOpen(true); setLeadOpen(false) }
  const openLeadPanel = () => { setLeadOpen(true); setAiOpen(false) }
  // Filter FORM (date/category/etc.) is independent from the conversation list.
  // Hidden by default so the list gets full height and shows many at once.
  const [showFilterForm, setShowFilterForm] = useState(() => localStorage.getItem('showFilterForm') === '1')
  const [inboxMenuOpen, setInboxMenuOpen] = useState(false)
  useEffect(() => localStorage.setItem('sidebarCollapsed', sbCollapsed ? '1' : '0'), [sbCollapsed])
  useEffect(() => localStorage.setItem('filtersCollapsed', filtersCollapsed ? '1' : '0'), [filtersCollapsed])
  useEffect(() => localStorage.setItem('aiOpen', aiOpen ? '1' : '0'), [aiOpen])
  useEffect(() => localStorage.setItem('showFilterForm', showFilterForm ? '1' : '0'), [showFilterForm])

  // Conversation state — fetched from API
  const [conversationsRaw, setConversationsRaw] = useState([])
  // Remember the last opened conversation so a reload continues where you left off.
  const [currentId, setCurrentId] = useState(() => localStorage.getItem('currentConvId') || null)
  const [messages, setMessages] = useState([])
  // Optimistic sends jab tak server copy nahi aati: turant dikhein, poll inhe na giraye.
  const [pending, setPending] = useState([])
  const [loadingConvs, setLoadingConvs] = useState(true)
  const [convMenuOpen, setConvMenuOpen] = useState(false)
  useEffect(() => { if (currentId) localStorage.setItem('currentConvId', currentId) }, [currentId])

  const convTs = (c) => c.last_ts || (c.created_at ? Date.parse(c.created_at) : 0) || 0
  // "YYYY-MM-DD" -> local din ki shuruaat / aakhri millisecond (browser ke timezone mein)
  const dayStartLocal = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d, 0, 0, 0, 0).getTime() }
  const dayEndLocal = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d, 23, 59, 59, 999).getTime() }
  const conversations = useMemo(
    () => conversationsRaw.map(normalizeConv).sort((a, b) => convTs(b) - convTs(a)),
    [conversationsRaw])
  const currentConv = conversations.find((c) => c.id === currentId) || null
  const conv = currentConv ? { ...currentConv, messages } : null

  // Delete a lead permanently (conversation + messages + lead + customer); poller won't re-create it.
  const deleteLead = async () => {
    if (!conv?.id) return
    setConvMenuOpen(false)
    if (!window.confirm(`Delete lead "${conv.name}"?\n\nThe conversation, all messages, the lead and the customer will be permanently removed. This cannot be undone.`)) return
    try {
      await api.post(`/api/conversations/${encodeURIComponent(conv.id)}/delete`)
      setConversationsRaw((cs) => cs.filter((c) => c.id !== conv.id))
      setCurrentId(null); localStorage.removeItem('currentConvId')
      toast('Lead deleted', 'success')
    } catch (e) { toast(e.message || 'Delete failed', 'error') }
  }

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
    if (!currentId) { setMessages([]); setPending([]); return }
    setPending([])                          // nayi chat par purane optimistic saaf
    let cancelled = false
    const load = () => api.get(`/api/conversations/${encodeURIComponent(currentId)}/messages`)
      .then((rows) => {
        if (cancelled) return
        // Only update if something actually changed — avoids the scroll jumping
        // back every few seconds when nothing new has arrived.
        setMessages((prev) =>
          (prev.length === rows.length && prev[prev.length - 1]?.id === rows[rows.length - 1]?.id)
            ? prev : rows)
        // Optimistic message ki server copy aate hi use hata do — UNIQUE id se match (bulletproof).
        // Server pending ka clientId hi message id banata hai, isliye id === id = wahi message.
        setPending((p) => p.filter((pm) => !rows.some((r) => String(r.id) === String(pm.id))))
      })
      .catch(() => {})
    load()
    const t = setInterval(load, 4000)
    return () => { cancelled = true; clearInterval(t) }
  }, [currentId])

  // Search + view filter (all / unassigned / mentions / bookmarks)
  const [search, setSearch] = useState('')
  const [view, setView] = useState('all')
  const [sortDir, setSortDir] = useState('latest') // 'latest' | 'oldest'
  const emptyFilters = { channel: '', agent: '', status: '', tag: '', from: '', to: '' }
  const [filters, setFilters] = useState(emptyFilters)
  const setFilter = (k, v) => setFilters((f) => ({ ...f, [k]: v }))
  const clearFilters = () => setFilters(emptyFilters)
  const activeFilterCount = Object.values(filters).filter(Boolean).length

  // Customer flags/tags — definitions shared with the Customers page (/api/flags),
  // yahan inbox mein conversation par lagte hain (conv.tags = [flagId,...]).
  const [flags, setFlags] = useState([])
  const [manageFlagsOpen, setManageFlagsOpen] = useState(false)
  const loadFlags = () => api.get('/api/flags').then(setFlags).catch(() => setFlags([]))
  useEffect(() => { loadFlags() }, [])
  const setConvTags = (id, next) => patchConv(id, { tags: next })   // optimistic UI + API save dono patchConv mein

  // Sabse HAAL ka customer (incoming) message — array order nahi, time (created_at) se.
  const lastIncomingText = useMemo(() => {
    const ins = messages.filter((m) => (m.dir === 'in' || m.direction === 'in') && (m.text || m.body))
    if (!ins.length) return ''
    ins.sort((a, b) => (Date.parse(a.created_at) || 0) - (Date.parse(b.created_at) || 0))
    return ins[ins.length - 1].text || ins[ins.length - 1].body || ''
  }, [messages])

  const myName = currentUser()?.name
  const unassignedCount = conversations.filter((c) => !c.assigned_to).length
  const mentionCount = conversations.filter((c) => (c.listPreview || '').includes('@')).length
  const bookmarkCount = conversations.filter((c) => c.bookmarked).length

  // Filter option lists, derived from the (backend-loaded) conversations
  const channelOptions = [...new Set(conversations.map((c) => c.channel).filter(Boolean))].sort()
  const agentOptions = [...new Set(conversations.map((c) => c.assigned_to).filter(Boolean))].sort()
  const statusOptions = [...new Set(conversations.map((c) => c.status).filter(Boolean))].sort()

  const visibleConvs = conversations.filter((c) => {
    if (view === 'unassigned' && c.assigned_to) return false
    if (view === 'bookmarks' && !c.bookmarked) return false
    if (view === 'mentions' && !(c.listPreview || '').includes('@')) return false
    if (filters.channel && c.channel !== filters.channel) return false
    if (filters.agent && c.assigned_to !== filters.agent) return false
    if (filters.status && c.status !== filters.status) return false
    if (filters.tag && !(Array.isArray(c.tags) && c.tags.includes(filters.tag))) return false
    // Date input "YYYY-MM-DD" ko LOCAL din ke hisaab se lo (Date.parse ise UTC maanta hai,
    // jis se UTC+5 me boundary khisak kar aaj ke chats kat jate the).
    if (filters.from && convTs(c) < dayStartLocal(filters.from)) return false
    if (filters.to && convTs(c) > dayEndLocal(filters.to)) return false
    if (search) {
      const q = search.toLowerCase()
      const hay = `${c.name || ''} ${c.company || ''} ${c.phone || ''} ${c.listPreview || ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  }).sort((a, b) => sortDir === 'latest' ? convTs(b) - convTs(a) : convTs(a) - convTs(b))

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
  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight }, [messages.length, pending.length, currentId])

  const sendMessage = async (text, kind = mode) => {
    if (!text.trim() || !currentId) return
    const time = nowTime()

    // Note alag rasta — wahi purana (chat bubble nahi banta)
    if (kind === 'note') {
      setMessages((m) => [...m, { id: `tmp-${Date.now()}`, dir: 'note', text: text.trim(), time, agent: currentUser()?.name }])
      setDraft('')
      try { await api.post(`/api/conversations/${encodeURIComponent(currentId)}/messages`, { dir: 'note', text: text.trim(), time }); toast('Note saved', 'success') }
      catch (ex) { toast(`Save failed: ${ex.message}`, 'error') }
      api.get(`/api/conversations/${encodeURIComponent(currentId)}/messages`).then(setMessages).catch(() => {})
      return
    }

    // Reply — optimistic bubble jo TURANT dikhe. UNIQUE clientId server ko jata hai aur wahi
    // message ki id banti hai — app pending ko server copy se USI id se jodta hai (duplicate
    // kabhi nahi, chahe naam/text kuch bhi ho). clientTs = order ke liye (upload der lage to bhi).
    const clientTs = Date.now()
    const clientId = `cid-${clientTs}-${Math.random().toString(36).slice(2, 8)}`
    const pid = clientId
    setPending((p) => [...p, { id: pid, dir: 'out', text: text.trim(), time, agent: currentUser()?.name, _status: 'sending', ts: clientTs, created_at: new Date(clientTs).toISOString() }])
    setDraft('')

    const mark = (status, error) => setPending((p) => p.map((x) => x.id === pid ? { ...x, _status: status, _error: error } : x))
    const isMeta = currentId.startsWith('fb:') || currentId.startsWith('ig:') || currentConv?.source === 'meta'
    try {
      if (currentId.startsWith('mc:')) {
        await api.post('/api/manychat/send', { subscriberId: currentId.slice(3), text: text.trim() })
      } else if (isMeta) {
        await api.post('/api/meta/send', { conversationId: currentId, text: text.trim(), clientTs, clientId })   // backend Chatwoot/Meta route karta hai
      } else {
        await api.post(`/api/conversations/${encodeURIComponent(currentId)}/messages`, { dir: 'out', text: text.trim(), time })
      }
      mark('sent')   // koi toast/label nahi — bubble mein hi tick
    } catch (ex) {
      mark('failed', ex.message)   // sirf fail hone par bubble ke neeche "Failed" dikhega
    }
  }

  const retrySend = (pm) => { setPending((p) => p.filter((x) => x.id !== pm.id)); sendMessage(pm.text, 'reply') }

  // ---- File/image attach + send (Chatwoot ke raste) ----
  const fileInputRef = useRef(null)
  const [attachBusy, setAttachBusy] = useState(false)
  const onPickFile = () => fileInputRef.current?.click()
  const onFileChosen = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''                       // dobara wahi file chunne dena
    if (!file || !currentId) return
    if (file.size > 24 * 1024 * 1024) { toast('File 24MB se chhoti honi chahiye', 'error'); return }
    const isImg = file.type.startsWith('image/')
    const clientTs = Date.now()               // click ka waqt = asli order (upload der lage to bhi)
    const clientId = `cid-${clientTs}-${Math.random().toString(36).slice(2, 8)}`
    const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file) })
    const pid = clientId
    setPending((p) => [...p, { id: pid, dir: 'out', text: draft.trim() || '', time: nowTime(), agent: currentUser()?.name,
      attachments: [{ type: isImg ? 'image' : 'file', url: dataUrl, name: file.name }], _status: 'sending', ts: clientTs, created_at: new Date(clientTs).toISOString() }])
    const caption = draft.trim(); setDraft(''); setAttachBusy(true)
    const mark = (s, err) => setPending((p) => p.map((x) => x.id === pid ? { ...x, _status: s, _error: err } : x))
    try {
      await api.post('/api/meta/send-file', { conversationId: currentId, fileName: file.name, fileType: file.type, dataBase64: dataUrl, text: caption, clientTs, clientId })
      mark('sent')
    } catch (ex) { mark('failed', ex.message) }
    finally { setAttachBusy(false) }
  }

  const onKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(draft) } }

  // Add an internal note (with a category). Optimistic; the 4s poll reconciles with
  // the persisted row, so we don't re-pull on every call (avoids a GET storm on bulk add).
  const addNote = async (text, category = 'internal', opts = {}) => {
    if (!text.trim() || !currentId) return false
    const time = nowTime()
    setMessages((m) => [...m, { id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, dir: 'note', text: text.trim(), time, category, agent: currentUser()?.name }])
    try {
      await api.post(`/api/conversations/${encodeURIComponent(currentId)}/messages`, { dir: 'note', text: text.trim(), time, category })
      if (!opts.silent) toast('Note saved', 'success')
      return true
    } catch (ex) {
      if (!opts.silent) toast(`Save failed: ${ex.message}`, 'error')
      return false
    }
  }

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
      <MobileNav />
      {/* ============ SIDEBAR ============ */}
      <aside className="crm-sidebar flex flex-col bg-ink-900 text-slate-300">
        <div className="sb-brand flex h-16 items-center gap-2 px-5">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-indigo-400 to-indigo-600">
            <span className="text-sm font-black text-white">D</span>
          </div>
          <img src="/logo.jpg" alt="Decoinks" className="sb-brand-text h-7 rounded bg-white px-1.5" />
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
            <li><Link to="/ai-assistant" className="sb-item flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-violet-300 hover:bg-white/5" data-tip="AI Prompting">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
              <span className="sb-label">AI Prompting</span>
            </Link></li>
            <li><Link to="/after-session" className="sb-item flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-violet-300 hover:bg-white/5" data-tip="After Session">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              <span className="sb-label">After Session</span>
            </Link></li>
          </ul>

          <p className="sb-section mt-6 mb-2 px-3 text-[11px] font-bold uppercase tracking-widest text-slate-500">Channels</p>
          <ul className="space-y-1">
            {[
              ['WhatsApp', 'bg-emerald-500', 'whatsapp', 8],
              ['Instagram', 'bg-gradient-to-br from-amber-400 via-rose-500 to-fuchsia-600', 'instagram', 3],
              ['Facebook', 'bg-blue-600', 'facebook', 2],
              ['Email', 'bg-slate-700', 'email', 1],
            ].map((ch) => (
              <li key={ch[2]}><Link to={`/connect-meta?connect=${ch[2]}`} className="sb-item flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-white/5" data-tip={`Connect ${ch[0]}`}>
                <span className="flex items-center gap-3 text-sm font-medium">
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${ch[1]} text-white`}>{channelIcon(ch[0])}</span>
                  <span className="sb-label">{ch[0]}</span>
                </span>
                <span className="sb-badge rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-semibold text-white">{ch[3]}</span>
              </Link></li>
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
        <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 sm:px-6">
          <div className="flex shrink-0 items-center gap-3 text-slate-700">
            <svg className="hidden sm:block" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/></svg>
            <span className="text-sm font-semibold">Inbox</span>
            <span className="ml-2 hidden items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> Online
            </span>
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-4">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <span className="pointer-events-none absolute inset-y-0 left-0 grid place-items-center pl-3 text-slate-400">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              </span>
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search conversations..." className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20 sm:pr-12" />
              <kbd className="pointer-events-none absolute inset-y-0 right-2 my-auto hidden h-6 place-items-center rounded border border-slate-200 bg-white px-1.5 text-[10px] font-semibold text-slate-500 sm:grid">⌘K</kbd>
            </div>
            <button className="relative hidden h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-slate-100 sm:grid" aria-label="Notifications">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
              <span className="absolute -top-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full bg-rose-500 text-[10px] font-bold text-white">6</span>
            </button>
            <TopBarUser />
          </div>
        </header>

        {/* data-mobile drives the one-panel-at-a-time layout on phones (see index.css) */}
        <section ref={panelsRef} id="panels" className="grid flex-1 overflow-hidden" data-filters={filtersCollapsed ? 'collapsed' : 'expanded'} data-ai={(aiOpen || leadOpen) ? 'open' : 'closed'} data-mobile={currentId ? 'chat' : 'list'}>
          {/* ===== Filters / List ===== */}
          <div id="panel-list" className="flex flex-col overflow-hidden border-r border-slate-200 bg-white">
            <div id="filters-header" className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div className="fp-only-expanded relative">
                <button onClick={() => setInboxMenuOpen((x) => !x)} className="inline-flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-sm font-semibold hover:bg-slate-100">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="14" x="3" y="5" rx="2"/><circle cx="12" cy="12" r="2"/></svg>
                  {filters.channel || 'All Inboxes'}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transition: 'transform .2s ease', transform: inboxMenuOpen ? 'rotate(180deg)' : 'none' }}><path d="m6 9 6 6 6-6"/></svg>
                </button>
                {inboxMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setInboxMenuOpen(false)}></div>
                    <div className="absolute left-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                      <button onClick={() => { setFilter('channel', ''); setInboxMenuOpen(false) }} className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-slate-50 ${!filters.channel ? 'font-semibold text-brand-600' : 'text-slate-700'}`}>All Inboxes<span className="text-[11px] text-slate-400">{conversations.length}</span></button>
                      {channelOptions.map((ch) => (
                        <button key={ch} onClick={() => { setFilter('channel', ch); setInboxMenuOpen(false) }} className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-slate-50 ${filters.channel === ch ? 'font-semibold text-brand-600' : 'text-slate-700'}`}>{ch}<span className="text-[11px] text-slate-400">{conversations.filter((c) => c.channel === ch).length}</span></button>
                      ))}
                    </div>
                  </>
                )}
              </div>
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
                <button onClick={() => setShowFilterForm((x) => !x)} className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${showFilterForm || activeFilterCount ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                  Filters
                  {activeFilterCount > 0 && <span className="grid h-4 min-w-4 place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">{activeFilterCount}</span>}
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transition: 'transform .2s ease', transform: showFilterForm ? 'rotate(180deg)' : 'none' }}><path d="m6 9 6 6 6-6"/></svg>
                </button>
                <button onClick={() => setSortDir((d) => d === 'latest' ? 'oldest' : 'latest')} title="Toggle sort order" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100">{sortDir === 'latest' ? 'Latest' : 'Oldest'} <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transition: 'transform .2s ease', transform: sortDir === 'oldest' ? 'rotate(180deg)' : 'none' }}><path d="m6 9 6 6 6-6"/></svg></button>
              </div>
            </div>

            {/* Search the conversation list (name / message) */}
            <div className="fp-only-expanded relative border-b border-slate-200 px-3 py-2">
              <span className="pointer-events-none absolute inset-y-0 left-5 grid place-items-center text-slate-400">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              </span>
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or message…"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-8 text-sm outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20" />
              {search && (
                <button onClick={() => setSearch('')} className="absolute inset-y-0 right-5 grid place-items-center text-slate-400 hover:text-slate-600" aria-label="Clear search">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              )}
            </div>

            {/* Collapsible filter form — hidden by default */}
            {showFilterForm && (
              <div id="filters-body" className="border-b border-slate-200 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-bold">Filters{activeFilterCount > 0 && <span className="ml-1.5 text-xs font-semibold text-slate-400">({activeFilterCount} active)</span>}</h3>
                  <div className="flex items-center gap-3">
                    {activeFilterCount > 0 && <button onClick={clearFilters} className="text-xs font-semibold text-rose-600 hover:text-rose-700">Clear all</button>}
                    <button onClick={() => setShowFilterForm(false)} className="text-xs font-semibold text-brand-600 hover:text-brand-700">Hide</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div><label className="mb-1 block font-semibold text-slate-600">From</label><input type="date" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2" /></div>
                  <div><label className="mb-1 block font-semibold text-slate-600">To</label><input type="date" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2" /></div>
                  <div><label className="mb-1 block font-semibold text-slate-600">Channel</label>
                    <select value={filters.channel} onChange={(e) => setFilter('channel', e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                      <option value="">All Channels</option>
                      {channelOptions.map((ch) => <option key={ch} value={ch}>{ch}</option>)}
                    </select>
                  </div>
                  <div><label className="mb-1 block font-semibold text-slate-600">Agent</label>
                    <select value={filters.agent} onChange={(e) => setFilter('agent', e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                      <option value="">All Agents</option>
                      {agentOptions.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                  <div><label className="mb-1 block font-semibold text-slate-600">Lead Status</label>
                    <select value={filters.status} onChange={(e) => setFilter('status', e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                      <option value="">All Status</option>
                      {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label className="font-semibold text-slate-600">Tags</label>
                      <button onClick={() => setManageFlagsOpen(true)} className="text-[11px] font-semibold text-brand-600 hover:underline">+ Manage</button>
                    </div>
                    <select value={filters.tag} onChange={(e) => setFilter('tag', e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                      <option value="">All Tags</option>
                      {flags.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  </div>
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
                        <p className="truncate text-xs text-slate-600">{c.lastDir === 'out' && <span className="font-semibold text-slate-500">You: </span>}{c.listPreview}</p>
                        {c.unread > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{c.unread}</span>}
                      </div>
                      {Array.isArray(c.tags) && c.tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {c.tags.map((tid) => { const f = flags.find((x) => x.id === tid); return f ? <FlagChip key={tid} flag={f} /> : null })}
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>

          </div>

          <div id="resize-filters" className="resize-handle" role="separator" aria-orientation="vertical" onPointerDown={(e) => startDrag(e, '--col-filters', 220, 480, false, 'w-col-filters')} onDoubleClick={dblResetVar('--col-filters', 'w-col-filters')}></div>

          {/* ===== Middle ===== */}
          <div id="panel-chat" className="flex h-full flex-col overflow-hidden bg-white">
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
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-3 py-4 sm:px-5">
              <div className="flex min-w-0 items-start gap-3">
                {/* back to the conversation list — phones only */}
                <button type="button" onClick={() => setCurrentId(null)} aria-label="Back to conversations"
                  className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                </button>
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
                  <div className="mt-1.5">
                    <FlagBadges allFlags={flags} value={Array.isArray(conv.tags) ? conv.tags : []} onChange={(next) => setConvTags(conv.id, next)} />
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
                {!leadOpen && (
                  <button onClick={openLeadPanel} title="Open Lead Details" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-100">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h4"/></svg>
                    Lead Details
                  </button>
                )}
                {!aiOpen && (
                  <button onClick={openAiPanel} title="Open AI Supervisor" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-100">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                    AI Supervisor
                  </button>
                )}
                <div className="relative">
                  <button onClick={() => setConvMenuOpen((o) => !o)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 hover:bg-slate-50" aria-label="More"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg></button>
                  {convMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setConvMenuOpen(false)} />
                      <div className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                        <button onClick={deleteLead} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-rose-600 hover:bg-rose-50">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                          Delete lead
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            <nav className="flex items-center gap-8 border-b border-slate-200 px-5">
              {[['conversation','Conversation'],['customer','Customer Info'],['history','History'],['notes','Notes'],['files','Files']].map(([id, lbl]) => (
                <button key={id} onClick={() => setMidTab(id)} className={`whitespace-nowrap border-b-2 py-3 text-sm ${midTab === id ? 'border-brand-500 text-brand-600 font-semibold' : 'border-transparent text-slate-500 font-medium hover:text-slate-700'}`}>{lbl}</button>
              ))}
            </nav>

            {midTab === 'conversation' && (
              <div className="flex min-h-0 flex-1 flex-col">
                <div ref={chatRef} className="nice-scroll flex-1 overflow-y-auto bg-slate-50/40 px-6 py-5">
                  {[...conv.messages, ...pending.filter((pm) => !conv.messages.some((m) => String(m.id) === String(pm.id)))]
                    // ASLI message-time (ts) se sort — created_at re-ingest par badal jata hai, ts sthir rehta hai
                    .map((m, idx) => ({ m, idx, k: Number(m.ts) || Date.parse(m.created_at) || 0 }))
                    .sort((a, b) => (a.k - b.k) || (a.idx - b.idx))   // stable — recent hamesha neeche
                    .map(({ m }) => m)
                    .map((m, i, arr) => {
                    // Din badalne par date-divider (asli message-time se, hardcoded nahi).
                    const _k = Number(m.ts) || Date.parse(m.created_at) || 0
                    const _pk = i > 0 ? (Number(arr[i - 1].ts) || Date.parse(arr[i - 1].created_at) || 0) : 0
                    const _day = _k ? new Date(_k).toDateString() : null
                    const _divider = (_day && _day !== (_pk ? new Date(_pk).toDateString() : null))
                      ? <div className="my-2 flex justify-center"><span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-500 shadow-sm">{dayLabel(_k)}</span></div>
                      : null
                    const _bubble = (() => {
                    if (m.dir === 'sys') return <div key={m.id || i} className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-500"><span>{m.time}</span>·<span>{m.text}</span></div>
                    if (m.dir === 'in') return (
                      <div key={m.id || i} className="mt-4 flex items-start gap-2">
                        <span className={`mt-1 grid h-8 w-8 place-items-center rounded-full ${conv.avatarBg} text-xs font-bold`}>{conv.initials}</span>
                        <div className="max-w-md rounded-2xl rounded-tl-md bg-white px-4 py-2.5 text-sm shadow-sm ring-1 ring-slate-100"><MsgAttachments items={m.attachments} />{m.text}<div className="mt-1 text-[10px] text-slate-400">{m.time}</div></div>
                      </div>
                    )
                    if (m.dir === 'note') return (
                      <div key={m.id || i} className="mt-4 flex items-start justify-end gap-2">
                        <div className="max-w-md rounded-2xl rounded-tr-md bg-amber-50 px-4 py-2.5 text-sm text-amber-900 shadow-sm ring-1 ring-amber-200">
                          <div className="mb-1 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">📝 Internal note{m.agent ? ` · ${m.agent}` : ''}</div>
                          <div>{m.text}</div>
                          <div className="mt-1 text-right text-[10px] text-amber-700/70">{m.time}</div>
                        </div>
                      </div>
                    )
                    const failed = m._status === 'failed'
                    const sending = m._status === 'sending'
                    return (
                      <div key={m.id || i} className="mt-4 flex flex-col items-end">
                        {m.agent && <div className="mb-0.5 mr-10 text-[10px] font-semibold text-slate-500">{m.agent}</div>}
                        <div className="flex items-start justify-end gap-2">
                          <div className={`max-w-md rounded-2xl rounded-tr-md px-4 py-2.5 text-sm shadow-sm ring-1 ${failed ? 'bg-rose-50 text-rose-900 ring-rose-200' : 'bg-brand-50 text-brand-900 ring-brand-100'}`}>
                            <MsgAttachments items={m.attachments} />{m.text}
                            <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-500">
                              {m.time}
                              {sending
                                ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin text-slate-400"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                                : failed
                                ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e11d48" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
                                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/><polyline points="22 11 13 20"/></svg>}
                            </div>
                          </div>
                          <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-600 text-[10px] font-bold text-white" title={m.agent || ''}>
                            {m.agent ? m.agent.split(/\s+/).map(w => w[0]).join('').slice(0,2).toUpperCase() : 'M'}
                          </span>
                        </div>
                        {failed && (
                          <div className="mr-10 mt-0.5 flex items-center gap-2 text-[10px] font-semibold text-rose-600">
                            <span>Failed to send{m._error ? ` — ${m._error}` : ''}</span>
                            <button onClick={() => retrySend(m)} className="rounded border border-rose-300 px-1.5 py-0.5 hover:bg-rose-50">Retry</button>
                          </div>
                        )}
                      </div>
                    )
                    })()
                    return _divider ? <Fragment key={`g${m.id || i}`}>{_divider}{_bubble}</Fragment> : _bubble
                  })}
                </div>

                <div className="border-t border-slate-200 bg-white px-6 py-3">
                  <div className="mb-2 flex items-center gap-4 text-sm">
                    <button onClick={() => setMode('reply')} className={`pb-1 ${mode === 'reply' ? 'border-b-2 border-brand-500 font-semibold text-brand-600' : 'border-b-2 border-transparent font-medium text-slate-500 hover:text-slate-700'}`}>Reply</button>
                    <button onClick={() => setMode('note')} className={`pb-1 ${mode === 'note' ? 'border-b-2 border-brand-500 font-semibold text-brand-600' : 'border-b-2 border-transparent font-medium text-slate-500 hover:text-slate-700'}`}>Note</button>
                  </div>
                  <textarea rows="2" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKeyDown} placeholder={mode === 'note' ? 'Write an internal note (visible to team only)...' : 'Type your message...'} className="block w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"></textarea>
                  <input ref={fileInputRef} type="file" onChange={onFileChosen} className="hidden" accept="image/*,application/pdf,.doc,.docx,.txt,.ai,.psd,.eps,.zip" />
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-1 text-slate-500">
                      {mode === 'reply' && (
                        <button onClick={onPickFile} disabled={attachBusy} title="Attach a file / image" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50">
                          {attachBusy
                            ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                            : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>}
                          Attach
                        </button>
                      )}
                    </div>
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

            {midTab === 'history' && <HistoryTab conv={conv} />}
            {midTab === 'notes' && <NotesTab conv={conv} onAddNote={addNote} />}
            {midTab === 'files' && <FilesTab conv={conv} />}
            </>)}
          </div>

          <div id="resize-ai" className="resize-handle" role="separator" aria-orientation="vertical" onPointerDown={(e) => startDrag(e, '--col-ai', 320, 720, true, 'w-col-ai')} onDoubleClick={dblResetVar('--col-ai', 'w-col-ai')}></div>

          {/* ===== Right panel: Lead Details OR AI Supervisor (ek waqt me ek) ===== */}
          {leadOpen ? (
            <LeadPanel conv={conv} onClose={() => setLeadOpen(false)} />
          ) : (
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

            <nav className="nice-scroll flex items-center gap-5 overflow-x-auto border-b border-slate-200 px-5 text-sm">
              {[['responses','Responses'],['translate','Translation'],['summary','Summary'],['actions','Actions'],['designer','Designer Jobs'],['intent','Intent & Insights']].map(([id, lbl]) => (
                <button key={id} onClick={() => setAiTab(id)} className={`shrink-0 whitespace-nowrap border-b-2 py-3 ${aiTab === id ? 'border-brand-500 text-brand-600 font-semibold' : 'border-transparent text-slate-500 font-medium hover:text-slate-700'}`}>{lbl}</button>
              ))}
            </nav>

            <div className="nice-scroll flex-1 overflow-y-auto px-5 py-4">
              {aiTab === 'responses' && <ResponsesTab onSendReply={(text) => sendMessage(text, 'reply')} conv={conv} msgCount={messages.length} />}
              {aiTab === 'translate' && <TranslationTab onSendReply={(text) => sendMessage(text, 'reply')} lastIncoming={lastIncomingText} />}
              {aiTab === 'summary' && <SummaryTab conv={conv} msgCount={messages.length} />}
              {aiTab === 'actions' && <ActionsTab ai={ai} onAnalyze={analyze} />}
              {aiTab === 'designer' && <DesignerTab conv={conv} />}
              {aiTab === 'intent' && <IntentTab ai={ai} onAnalyze={analyze} conv={conv} />}
            </div>
          </aside>
          )}
        </section>
      </div>
      {manageFlagsOpen && (
        <ManageFlagsModal flags={flags} onClose={() => setManageFlagsOpen(false)} onChanged={loadFlags} />
      )}
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

// Quick-send asset panels (Communication / Payment / Document). Edit the msg
// values to your real links/QRs — checking items + "Send to Chat" delivers them.
const COMM_ITEMS = [
  { label: 'Send Website Address',      msg: '🌐 Website: DECOINKS.COM' },
  { label: 'Send Email Address',        msg: '📧 Email: INFO@DECOINKS.COM' },
  { label: 'Send Pinterest Account',    msg: '📌 Pinterest: Pinterest – Decoinks' },
  { label: 'Send WhatsApp Catalog',     msg: '🛍️ Our catalog: https://wa.me/c/decoinks' },
  { label: 'Send Google Maps Location', msg: '📍 Find us: https://maps.google.com/?q=Decoinks' },
  { label: 'Our Brochure (PDF)',        msg: '📄 Our brochure: https://decoinks.com/brochure.pdf' },
]
const PAY_ITEMS = [
  { label: 'Zelle QR Code',          msg: '💳 Pay via Zelle: info@decoinks.com' },
  { label: 'Cash App QR Code',       msg: '💵 Cash App: $decoinks' },
  { label: 'PayPal QR Code',         msg: '🅿️ PayPal: https://paypal.me/decoinks' },
  { label: 'PayPal Invoice (Cards)', msg: '🧾 We will send a secure PayPal invoice link (cards accepted).' },
]
const DOC_ITEMS = [
  { label: 'Preview Quote',   msg: '🧾 Here is your quote.' },
  { label: 'Preview Invoice', msg: '🧾 Here is your invoice.' },
]

function SendPanel({ title, hint, items, onSendReply }) {
  const toast = useToast()
  const [checked, setChecked] = useState({})
  const allOn = items.length > 0 && items.every((_, i) => checked[i])
  const toggleAll = () => setChecked(allOn ? {} : Object.fromEntries(items.map((_, i) => [i, true])))
  const send = () => {
    const msgs = items.filter((_, i) => checked[i]).map((x) => x.msg)
    if (!msgs.length) { toast('Pehle kuch select karo', 'info'); return }
    onSendReply(msgs.join('\n'))
    toast(`${msgs.length} item${msgs.length > 1 ? 's' : ''} sent to chat`, 'success')
    setChecked({})
  }
  if (!items.length) return null
  return (
    <div className="h-fit rounded-xl border border-slate-200 bg-white p-2.5">
      <div className="flex items-center gap-1.5">
        <h4 className="text-xs font-bold text-slate-800">{title}</h4>
        {hint && <span className="text-[10px] font-medium text-slate-400">({hint})</span>}
      </div>

      {items.length > 1 && (
        <label className="mt-1.5 flex cursor-pointer select-none items-center gap-1.5 border-b border-slate-100 pb-1.5 text-[11px] font-semibold text-slate-500">
          <input type="checkbox" checked={allOn} onChange={toggleAll} className="h-3.5 w-3.5 accent-brand-600" />
          Select All
        </label>
      )}

      <div className="mt-1">
        {items.map((x, i) => (
          <label key={i} className="flex cursor-pointer select-none items-center gap-2 rounded-md px-1 py-1 hover:bg-slate-50">
            <input type="checkbox" checked={!!checked[i]} onChange={() => setChecked((c) => ({ ...c, [i]: !c[i] }))} className="h-3.5 w-3.5 shrink-0 accent-brand-600" />
            <span className="flex-1 truncate text-[13px] font-semibold text-brand-700">{x.label}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-slate-300"><path d="m9 18 6-6-6-6"/></svg>
          </label>
        ))}
      </div>

      <button onClick={send} className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50/70 px-3 py-1.5 text-[11px] font-semibold text-brand-700 transition hover:bg-brand-100">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>
        Send to Chat
      </button>
    </div>
  )
}

function TranslationTab({ onSendReply, lastIncoming }) {
  const toast = useToast()
  const [data, setData] = useState(null)   // { detectedLanguage, explanation, replyEn, replyNative }
  const [loading, setLoading] = useState(false)
  const [replyEn, setReplyEn] = useState('')
  const [native, setNative] = useState('')
  const [transBusy, setTransBusy] = useState(false)
  const [verify, setVerify] = useState(null)   // { literal, pairs[] }
  const [verifyBusy, setVerifyBusy] = useState(false)
  useEffect(() => { setVerify(null) }, [native])   // reset when the Spanish reply changes

  // Auto-run whenever the last customer message changes (new message → updates itself, no button).
  useEffect(() => {
    let cancelled = false
    setData(null); setReplyEn(''); setNative('')
    if (!lastIncoming.trim()) return
    setLoading(true)
    api.post('/api/ai/translate-assist', { text: lastIncoming })
      .then((r) => { if (!cancelled) { setData(r); setReplyEn(r.replyEn || ''); setNative(r.replyNative || '') } })
      .catch((ex) => { if (!cancelled) toast(ex.message || 'Translate failed', 'error') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [lastIncoming])

  const isEnglish = !data || /english/i.test(data.detectedLanguage || '')

  const updateNative = async () => {
    if (isEnglish || !replyEn.trim()) return
    setTransBusy(true)
    try { const r = await api.post('/api/translate', { text: replyEn, from: 'English', to: data.detectedLanguage }); setNative(r.translated) }
    catch (ex) { toast(ex.message || 'Translate failed', 'error') }
    finally { setTransBusy(false) }
  }
  const send = () => {
    const text = (isEnglish ? replyEn : native).trim()
    if (text) { onSendReply(text); toast(`Sent${isEnglish ? '' : ' in ' + data.detectedLanguage}`, 'success') }
  }
  const verifyTranslation = async () => {
    if (!native.trim()) return
    setVerifyBusy(true)
    try { const r = await api.post('/api/ai/verify-translation', { text: native }); setVerify(r) }
    catch (ex) { toast(ex.message || 'Verify failed', 'error') }
    finally { setVerifyBusy(false) }
  }

  if (!lastIncoming.trim()) {
    return <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">Is chat mein abhi koi customer message nahi aaya.</div>
  }
  if (loading || !data) {
    return <div className="rounded-xl border border-dashed border-violet-300 bg-violet-50/40 p-6 text-center text-sm text-violet-700">🌐 Translating last message…</div>
  }
  return (
    <>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between"><div className="text-sm font-bold">Customer's last message</div><span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{data.detectedLanguage}</span></div>
        <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-2.5 text-sm text-slate-700">{lastIncoming}</p>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-bold">💡 What they mean (simple English)</div>
        <p className="mt-2 text-sm text-slate-700">{data.explanation}</p>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-bold">Suggested reply (English — editable)</div>
        <textarea value={replyEn} onChange={(e) => setReplyEn(e.target.value)} onBlur={updateNative} rows={4}
          className="mt-2 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:bg-white" />
        {!isEnglish && <button onClick={updateNative} disabled={transBusy} className="mt-2 rounded-md border border-violet-200 px-2.5 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50">{transBusy ? 'Translating…' : `↻ Update ${data.detectedLanguage} translation`}</button>}
      </div>

      {!isEnglish && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
          <div className="text-sm font-bold text-emerald-800">Reply in {data.detectedLanguage} (ye send hoga)</div>
          <p className="mt-2 whitespace-pre-wrap rounded-lg bg-white p-2.5 text-sm text-slate-800">{native || '—'}</p>
        </div>
      )}

      {!isEnglish && native.trim() && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-bold">🔍 Verify — {data.detectedLanguage} back to English</div>
            <button onClick={verifyTranslation} disabled={verifyBusy} className="shrink-0 rounded-md border border-violet-200 px-2.5 py-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50">{verifyBusy ? 'Checking…' : (verify ? '↻ Re-check' : 'Check translation')}</button>
          </div>
          {!verify ? (
            <p className="mt-2 text-xs text-slate-500">Confirm karo ki Spanish sahi hai — ise word-by-word wapas English mein dekho.</p>
          ) : (
            <>
              <div className="mt-2 rounded-lg bg-slate-50 p-2.5 text-sm text-slate-700">
                <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Back to English</div>
                {verify.literal || '—'}
              </div>
              {Array.isArray(verify.pairs) && verify.pairs.length > 0 && (
                <div className="mt-2">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Word by word</div>
                  <div className="flex flex-wrap gap-1.5">
                    {verify.pairs.map((p, i) => (
                      <span key={i} className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px]"><b className="text-emerald-700">{p.src}</b> <span className="text-slate-300">→</span> <span className="text-slate-600">{p.en}</span></span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button onClick={send} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">▶ Send {isEnglish ? '(English)' : `(${data.detectedLanguage})`}</button>
        <button onClick={() => { navigator.clipboard?.writeText(isEnglish ? replyEn : native); toast('Copied', 'success') }} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50">Copy</button>
      </div>
    </>
  )
}

// Parse a chat time string ("8:31 AM") → minutes since midnight.
function parseClock(t) {
  const m = String(t || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i)
  if (!m) return null
  let h = parseInt(m[1], 10); const min = parseInt(m[2], 10); const ap = m[3]?.toUpperCase()
  if (ap === 'PM' && h !== 12) h += 12
  if (ap === 'AM' && h === 12) h = 0
  return h * 60 + min
}
function fmtDur(min) {
  if (min == null) return '—'
  if (min < 1) return '<1 min'
  if (min < 60) return `${Math.round(min)} min`
  const h = Math.floor(min / 60); const m = Math.round(min % 60)
  return m ? `${h}h ${m}m` : `${h}h`
}

// History tab — full message timeline: response times, agent SLA rating, 3-word
// summary, media thumbnails + averages + stage/status. (Replaces old Timestamps + History.)
function HistoryTab({ conv }) {
  const toast = useToast()
  const cid = conv?.id
  const [intents, setIntents] = useState(conv?.message_intents || {})
  const [genBusy, setGenBusy] = useState(false)
  const autoRef = useRef('')
  const summarizeMessages = async (manual) => {
    if (!cid || genBusy) return
    setGenBusy(true)
    try { const r = await api.post(`/api/ai/message-intents/${encodeURIComponent(cid)}`, { force: !!manual }); setIntents(r.intents || {}); if (manual) toast('Message summaries updated', 'success') }
    catch (ex) { if (manual) toast(ex.message || 'Failed', 'error') }
    finally { setGenBusy(false) }
  }
  // Auto-generate once per conversation when opened (cached afterwards → instant + free)
  useEffect(() => {
    const cached = conv?.message_intents || {}
    setIntents(cached)
    if (cid && autoRef.current !== cid && Object.keys(cached).length === 0) {
      autoRef.current = cid
      summarizeMessages(false)
    }
  }, [cid]) // eslint-disable-line react-hooks/exhaustive-deps
  const msgs = (conv?.messages || []).filter((m) => m.dir === 'in' || m.dir === 'out')
  let prev = null
  const rows = msgs.map((m) => {
    const clock = parseClock(m.time)
    let resp = null
    if (prev && prev.dir !== m.dir && prev.clock != null && clock != null) {
      let d = clock - prev.clock; if (d < 0) d += 1440   // crossed midnight → assume next day
      resp = { minutes: d, responder: m.dir }
    }
    const row = { ...m, clock, resp }
    prev = row
    return row
  })
  const agentTimes = rows.filter((r) => r.resp && r.resp.responder === 'out').map((r) => r.resp.minutes)
  const custTimes = rows.filter((r) => r.resp && r.resp.responder === 'in').map((r) => r.resp.minutes)
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)
  const avgAgent = avg(agentTimes)
  const avgCust = avg(custTimes)
  const agentMsgs = rows.filter((r) => r.dir === 'out').length
  const custMsgs = rows.filter((r) => r.dir === 'in').length
  const firstInIdx = rows.findIndex((r) => r.dir === 'in')
  const firstOut = firstInIdx >= 0 ? rows.find((r, i) => i > firstInIdx && r.dir === 'out') : null
  let firstResponse = null
  if (firstOut && rows[firstInIdx].clock != null && firstOut.clock != null) {
    firstResponse = firstOut.clock - rows[firstInIdx].clock
    if (firstResponse < 0) firstResponse += 1440
  }

  // 3-word summary heading for a message
  const words3 = (t) => { const s = (t || '').trim().replace(/\s+/g, ' '); return s ? s.split(' ').slice(0, 3).join(' ') : '' }
  // Agent SLA rating: ≤2m on time, ≤5m delayed, else too delayed
  const sla = (m) => m <= 2 ? { l: 'On time', c: 'bg-emerald-50 text-emerald-700' } : m <= 5 ? { l: 'Delayed', c: 'bg-amber-50 text-amber-700' } : { l: 'Too delayed', c: 'bg-rose-50 text-rose-700' }
  const slaCat = (m) => m <= 2 ? 'ontime' : m <= 5 ? 'delayed' : 'toodelayed'

  // On-time score + SLA filter
  const onTime = agentTimes.filter((m) => m <= 2).length
  const delayedN = agentTimes.filter((m) => m > 2 && m <= 5).length
  const tooN = agentTimes.filter((m) => m > 5).length
  const slaPct = agentTimes.length ? Math.round((onTime / agentTimes.length) * 100) : null
  const [slaFilter, setSlaFilter] = useState('all')
  const visibleRows = slaFilter === 'all' ? rows : rows.filter((r) => r.dir === 'out' && r.resp && slaCat(r.resp.minutes) === slaFilter)

  if (!rows.length) {
    return <div className="nice-scroll min-h-0 flex-1 overflow-y-auto px-6 py-5"><div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">Is chat mein abhi koi message nahi.</div></div>
  }

  return (
    <div className="nice-scroll min-h-0 flex-1 overflow-y-auto px-6 py-5">
      {/* Metric cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-violet-600">Avg agent reply time</div>
          <div className="mt-1 text-2xl font-extrabold text-violet-700">{fmtDur(avgAgent)}</div>
          <div className="mt-0.5 text-[11px] text-slate-500">Customer → Agent · {agentTimes.length} replies</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600">On-time rate</div>
          <div className="mt-1 text-2xl font-extrabold text-emerald-700">{slaPct == null ? '—' : slaPct + '%'}</div>
          <div className="mt-0.5 text-[11px] text-slate-500">{onTime}/{agentTimes.length} agent replies ≤ 2 min</div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-600">First response time</div>
          <div className="mt-1 text-2xl font-extrabold text-amber-700">{fmtDur(firstResponse)}</div>
          <div className="mt-0.5 text-[11px] text-slate-500">Customer's 1st message → Agent's 1st reply</div>
        </div>
        <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-sky-600">Total messages</div>
          <div className="mt-1 text-2xl font-extrabold text-sky-700">{rows.length}</div>
          <div className="mt-0.5 text-[11px] text-slate-500">🧑‍💼 Agent {agentMsgs} · 👤 Customer {custMsgs}</div>
        </div>
      </div>

      {/* Detailed timeline as a table */}
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="text-sm font-bold">Message timeline ({visibleRows.length}{slaFilter !== 'all' ? ` of ${rows.length}` : ''})</div>
            <button onClick={() => summarizeMessages(true)} disabled={genBusy} className="rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50">{genBusy ? 'Summarizing…' : '↻ AI summaries'}</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[['all', `All`, rows.length, 'bg-slate-100 text-slate-600'], ['ontime', 'On time', onTime, 'bg-emerald-50 text-emerald-700'], ['delayed', 'Delayed', delayedN, 'bg-amber-50 text-amber-700'], ['toodelayed', 'Too delayed', tooN, 'bg-rose-50 text-rose-700']].map(([id, lbl, n, cls]) => (
              <button key={id} onClick={() => setSlaFilter(id)} className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${slaFilter === id ? 'ring-2 ring-brand-400 ' + cls : cls + ' opacity-80 hover:opacity-100'}`}>{lbl} ({n})</button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 font-semibold">Role</th>
                <th className="px-3 py-2 font-semibold">Time</th>
                <th className="px-3 py-2 font-semibold">Reply after</th>
                <th className="px-3 py-2 font-semibold">Message</th>
                <th className="px-3 py-2 font-semibold">Media</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleRows.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-400">Is filter mein koi reply nahi.</td></tr>
              )}
              {visibleRows.map((r, i) => {
                const isAgent = r.dir === 'out'
                const s = r.resp && isAgent ? sla(r.resp.minutes) : null
                const attLabel = r.attachments?.length ? (r.attachments[0].type === 'image' ? '📷 Photo' : r.attachments[0].type === 'video' ? '🎥 Video' : '📎 Attachment') : '—'
                const hasText = r.text && r.text.trim() && r.text !== '[attachment]'
                const heading = intents[r.id] || (genBusy && hasText ? '✨ summarizing…' : (words3(r.text) || attLabel))
                return (
                  <tr key={i} className="align-top hover:bg-slate-50/60">
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${isAgent ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-700'}`}>
                        {isAgent ? '🧑‍💼 Agent' : '👤 Customer'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-700">{r.time || '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      {r.resp ? (
                        <div className="flex flex-col gap-1">
                          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">⏱ {fmtDur(r.resp.minutes)}</span>
                          {s && <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${s.c}`}>{s.l}</span>}
                        </div>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700" title={r.text || ''}>{heading}</td>
                    <td className="px-3 py-2.5">
                      {Array.isArray(r.attachments) && r.attachments.length ? (
                        <div className="flex flex-wrap gap-1">
                          {r.attachments.map((a, k) => a.type === 'image'
                            ? <ChatImage key={k} att={a} className="h-10 w-10 rounded object-cover ring-1 ring-slate-200" />
                            : <a key={k} href={a.url} target="_blank" rel="noreferrer" className="text-base">{a.type === 'video' ? '🎥' : '📎'}</a>)}
                        </div>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-3 text-[11px] text-slate-400">SLA: ≤2 min = On time · 2–5 min = Delayed · &gt;5 min = Too delayed. "Time" is each message's clock time; cross-day gaps are approximate.</p>

      {/* Stages & status */}
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <h4 className="text-sm font-bold mb-3">Customer Activity (Stages)</h4>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500"><th className="py-2 font-semibold">Stage</th><th className="py-2 font-semibold">Status</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {[
              ['Lead Initiation', rows.length > 0],
              ['First Response', agentMsgs > 0],
              ['In Conversation', rows.length >= 4],
              ['Design / Quote Discussed', /design|quote|price|precio|diseñ/i.test(rows.map((r) => r.text).join(' '))],
              ['Address Provided', /\b\d{5}\b|\d+\s+\w+\s+(st|street|ave|avenue|road|rd|blvd|drive|dr|lane|ln)\b|direcci|calle/i.test(rows.filter((r) => r.dir === 'in').map((r) => r.text).join(' '))],
              ['Quotation Given', /\$\s?\d|quote|quotation|\btotal\b|precio|cotiz/i.test(rows.filter((r) => r.dir === 'out').map((r) => r.text).join(' '))],
              ['Awaiting Reply', rows[rows.length - 1]?.dir === 'in'],
            ].map(([stage, done], i) => (
              <tr key={i}>
                <td className="py-2.5">{stage}</td>
                <td><span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${done ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{done ? 'Completed' : 'Not Yet'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Notes tab — internal notes/observations about this customer (dir='note' messages),
// with categories (Internal / Call / Meeting / Follow-up) + an Add Note composer.
const NOTE_CATS = [['internal', 'Internal', '📝', 'bg-amber-50 text-amber-700'], ['call', 'Call', '📞', 'bg-sky-50 text-sky-700'], ['meeting', 'Meeting', '🗓️', 'bg-violet-50 text-violet-700'], ['followup', 'Follow-up', '⭐', 'bg-emerald-50 text-emerald-700']]
function NotesTab({ conv, onAddNote }) {
  const toast = useToast()
  const [filter, setFilter] = useState('all')
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const [cat, setCat] = useState('internal')
  const [aiBusy, setAiBusy] = useState(false)

  const genAiNotes = async () => {
    if (!conv?.id) return
    setAiBusy(true)
    try {
      const r = await api.post(`/api/ai/notes/${encodeURIComponent(conv.id)}`, {})
      if (r.empty || !r.notes?.length) { toast('Is chat se koi note nahi bana', 'info'); return }
      let ok = 0
      for (const n of r.notes) { if (await onAddNote(n.text, n.category, { silent: true })) ok++ }
      toast(ok === r.notes.length ? `${ok} AI notes added` : `${ok}/${r.notes.length} notes saved (kuch fail — dobara try karo)`, ok ? 'success' : 'error')
    } catch (ex) { toast(ex.message || 'Failed', 'error') }
    finally { setAiBusy(false) }
  }
  const notes = (conv?.messages || []).filter((m) => m.dir === 'note').slice().reverse() // newest first
  const catOf = (n) => NOTE_CATS.find((c) => c[0] === (n.category || 'internal')) || NOTE_CATS[0]
  const counts = { all: notes.length }
  NOTE_CATS.forEach(([id]) => { counts[id] = notes.filter((n) => (n.category || 'internal') === id).length })
  const shown = filter === 'all' ? notes : notes.filter((n) => (n.category || 'internal') === filter)

  const save = async () => { if (!text.trim()) return; await onAddNote(text.trim(), cat); setText(''); setAdding(false) }

  return (
    <div className="nice-scroll min-h-0 flex-1 overflow-y-auto px-6 py-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-lg font-bold">Notes</div>
          <p className="text-xs text-slate-500">All notes, observations and important info about this customer.</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button onClick={genAiNotes} disabled={aiBusy} className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50">{aiBusy ? 'Analyzing…' : '✨ AI Notes'}</button>
          <button onClick={() => setAdding((x) => !x)} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">+ Add Note</button>
        </div>
      </div>

      {adding && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {NOTE_CATS.map(([id, lbl, icon]) => (
              <button key={id} onClick={() => setCat(id)} className={`rounded-md px-2 py-1 text-[11px] font-semibold ${cat === id ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-300' : 'bg-slate-100 text-slate-600'}`}>{icon} {lbl}</button>
            ))}
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Write a note..." className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:bg-white" />
          <div className="mt-2 flex items-center gap-2">
            <button onClick={save} disabled={!text.trim()} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">Save note</button>
            <button onClick={() => { setAdding(false); setText('') }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => setFilter('all')} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${filter === 'all' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>All Notes ({counts.all})</button>
        {NOTE_CATS.map(([id, lbl]) => (
          <button key={id} onClick={() => setFilter(id)} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${filter === id ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{lbl} ({counts[id]})</button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">Koi note nahi. "+ Add Note" se naya note banao.</div>
      ) : (
        <div className="mt-3 space-y-3">
          {shown.map((n, i) => {
            const [, lbl, icon, cls] = catOf(n)
            return (
              <div key={i} className="rounded-xl border border-slate-200 bg-white p-3.5">
                <div className="flex items-center gap-2">
                  <span className="text-base">{icon}</span>
                  <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${cls}`}>{lbl} Note</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{n.text}</p>
                <div className="mt-2 text-[11px] text-slate-400">{n.time || ''}{n.agent ? ` · ${n.agent}` : ''}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Files tab — every image/video/document shared in this conversation (from attachments).
function FilesTab({ conv }) {
  const [filter, setFilter] = useState('all')
  const files = []
  ;(conv?.messages || []).forEach((m) => (Array.isArray(m.attachments) ? m.attachments : []).forEach((a) => {
    if (!a?.url) return
    files.push({ url: a.url, type: a.type || 'file', name: a.name || '', by: m.dir === 'out' ? (m.agent || 'Agent') : (conv.name || 'Customer'), time: m.time || '' })
  }))
  const counts = { all: files.length, image: files.filter((f) => f.type === 'image').length, document: files.filter((f) => f.type !== 'image').length }
  const shown = files.filter((f) => filter === 'all' ? true : filter === 'image' ? f.type === 'image' : f.type !== 'image')
  const typeLabel = (t) => t === 'image' ? 'Image' : t === 'video' ? 'Video' : 'Document'

  return (
    <div className="nice-scroll min-h-0 flex-1 overflow-y-auto px-6 py-5">
      <div className="text-lg font-bold">Files</div>
      <p className="mb-3 text-xs text-slate-500">All images, files and documents shared in this conversation.</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {[['all', 'All Files', counts.all], ['image', 'Images', counts.image], ['document', 'Documents', counts.document]].map(([id, lbl, n]) => (
          <button key={id} onClick={() => setFilter(id)} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${filter === id ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{lbl} ({n})</button>
        ))}
      </div>
      {shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">Is chat mein abhi koi file / image share nahi hui.</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 font-semibold">File</th>
                <th className="px-4 py-2 font-semibold">Type</th>
                <th className="px-4 py-2 font-semibold">Shared By</th>
                <th className="px-4 py-2 font-semibold">Time</th>
                <th className="px-4 py-2 font-semibold">Open</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((f, i) => (
                <tr key={i} className="hover:bg-slate-50/60">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {f.type === 'image'
                        ? <ChatImage att={f} className="h-9 w-9 rounded object-cover ring-1 ring-slate-200" />
                        : <span className="grid h-9 w-9 place-items-center rounded bg-slate-100 text-base">{f.type === 'video' ? '🎥' : '📄'}</span>}
                      <span className="max-w-[140px] truncate text-slate-700">{f.name || `${typeLabel(f.type)} ${i + 1}`}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5"><span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{typeLabel(f.type)}</span></td>
                  <td className="px-4 py-2.5 text-slate-600">{f.by}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{f.time || '—'}</td>
                  <td className="px-4 py-2.5"><a href={f.url} target="_blank" rel="noreferrer" className="font-semibold text-brand-600 hover:underline">Open ↗</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// Conversation summary for an agent taking over. Generated on a button, SAVED to the
// DB, and updated INCREMENTALLY (only new messages are sent to AI, not the whole chat).
function SummaryTab({ conv, msgCount }) {
  const toast = useToast()
  const [info, setInfo] = useState(null)    // { cached, summary, newCount, stale, summaryAt, ... }
  const [loading, setLoading] = useState(false)  // loading cache (cheap, no AI)
  const [working, setWorking] = useState(false)  // generating/updating (AI call)
  const [error, setError] = useState(null)
  const cid = conv?.id

  // Cheap GET: pulls the saved summary from memory + reports new-message count. No AI cost.
  useEffect(() => {
    let cancelled = false
    setInfo(null); setError(null)
    if (!cid) return
    setLoading(true)
    api.get(`/api/ai/summary/${encodeURIComponent(cid)}`)
      .then((r) => { if (!cancelled) { if (r.empty) setError('Is chat mein abhi koi message nahi.'); else setInfo(r) } })
      .catch((ex) => { if (!cancelled) setError(ex.message || 'Summary failed') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [cid, msgCount])

  // The only AI call — full first time, incremental afterwards. Result is persisted server-side.
  const generate = () => {
    if (!cid) return
    setWorking(true)
    api.post(`/api/ai/summary/${encodeURIComponent(cid)}`, {})
      .then((r) => { setInfo({ cached: true, stale: false, newCount: 0, summary: r.summary, summaryAt: r.summaryAt }); toast(r.mode === 'incremental' ? 'Summary updated with new messages' : 'Summary saved', 'success') })
      .catch((ex) => toast(ex.message || 'Failed', 'error'))
      .finally(() => setWorking(false))
  }

  if (!cid) return <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">Koi conversation select karo.</div>
  if (loading && !info) return <div className="rounded-xl border border-dashed border-violet-300 bg-violet-50/40 p-6 text-center text-sm text-violet-700">📝 Loading summary…</div>
  if (error) return <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-6 text-center text-sm text-amber-700">{error}</div>

  const s = info?.summary
  const savedAt = info?.summaryAt ? new Date(info.summaryAt).toLocaleString() : null

  // No saved summary yet → first-time generate prompt.
  if (!s) {
    return (
      <div className="rounded-xl border border-dashed border-violet-300 bg-violet-50/40 p-6 text-center">
        <div className="text-2xl">📝</div>
        <p className="mt-1 text-sm font-semibold text-slate-700">No summary yet</p>
        <p className="mt-0.5 text-xs text-slate-500">Poori chat (start → last) ki ek detailed summary banao. Save ho jayegi — agli baar memory se aayegi.</p>
        <button onClick={generate} disabled={working} className="mt-3 rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50">{working ? 'Generating…' : '📝 Generate summary'}</button>
      </div>
    )
  }

  return (
    <>
      {/* New-messages banner: incremental update only adds the new part */}
      {info.stale && info.newCount > 0 && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <span className="text-xs font-semibold text-amber-800">{info.newCount} new message{info.newCount > 1 ? 's' : ''} since this summary.</span>
          <button onClick={generate} disabled={working} className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50">{working ? 'Updating…' : '↻ Update summary'}</button>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-bold">📝 Conversation summary</div>
          {!info.stale && <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Up to date</span>}
        </div>
        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{s.overview}</p>
      </div>

      {Array.isArray(s.keyPoints) && s.keyPoints.length > 0 && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-sm font-bold">Key points</div>
          <ul className="mt-2 space-y-1.5">
            {s.keyPoints.map((k, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-700"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500"></span><span>{k}</span></li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Current status</div>
          <p className="mt-1 text-sm font-medium text-slate-800">{s.status || '—'}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600">Next step</div>
          <p className="mt-1 text-sm font-medium text-emerald-900">{s.nextStep || '—'}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        {savedAt ? <span className="text-[11px] text-slate-400">Saved {savedAt}</span> : <span></span>}
        <button onClick={generate} disabled={working} className="rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">{working ? '…' : '↻ Regenerate'}</button>
      </div>
    </>
  )
}

// AI Recommended Reply — answers the customer messages that arrived AFTER the agent's
// last reply (the unanswered ones). Re-generates automatically when new customer
// messages arrive; cheap/no-op when the agent has already replied to the latest.
function ResponsesTab({ onSendReply, conv, msgCount }) {
  const toast = useToast()
  const cid = conv?.id
  const [reply, setReply] = useState('')
  const [info, setInfo] = useState(null)   // { pending, pendingCount, pendingMessages, detectedLanguage, reply, empty }
  const [loading, setLoading] = useState(false)
  const [qa, setQa] = useState(null)       // quick-actions from backend (editable in Settings)
  useEffect(() => { api.get('/api/quick-actions').then(setQa).catch(() => {}) }, [])

  const generate = (force = false) => {
    if (!cid) return
    setLoading(true)
    api.post(`/api/ai/recommend-reply/${encodeURIComponent(cid)}`, { force })
      .then((r) => {
        setInfo(r)
        if (typeof r.reply === 'string') setReply(r.reply)
      })
      .catch((ex) => toast(ex.message || 'Failed', 'error'))
      .finally(() => setLoading(false))
  }

  // Auto: on conversation change AND whenever the message list changes (new customer
  // message → fresh reply; agent's own send → server returns "no pending", no AI call).
  useEffect(() => { setReply(''); setInfo(null); if (cid) generate(false) }, [cid, msgCount])

  return (
    <>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-bold">✨ AI Recommended Reply</div>
          <button onClick={() => generate(true)} disabled={loading || !cid} className="rounded-md border border-violet-200 px-2.5 py-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50">{loading ? '…' : '↻ Regenerate'}</button>
        </div>

        {!cid ? (
          <p className="mt-3 text-sm text-slate-500">Koi conversation select karo.</p>
        ) : loading && !reply ? (
          <p className="mt-3 text-sm text-violet-700">✨ Generating reply for unanswered messages…</p>
        ) : info?.empty ? (
          <p className="mt-3 text-sm text-slate-500">Is chat mein abhi koi message nahi.</p>
        ) : info && info.pending === false && !reply ? (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-sm text-emerald-800">
            ✅ Aap latest customer message ka reply de chuke ho — koi pending message nahi.
            <button onClick={() => generate(true)} className="ml-2 font-semibold text-violet-700 underline hover:text-violet-800">Generate anyway</button>
          </div>
        ) : (
          <>
            {info?.pendingCount > 0 && Array.isArray(info.pendingMessages) && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                <div className="text-[11px] font-semibold text-amber-700">Replying to {info.pendingCount} unanswered customer message{info.pendingCount > 1 ? 's' : ''}{info.detectedLanguage ? ` · ${info.detectedLanguage}` : ''}:</div>
                <ul className="mt-1 space-y-0.5">
                  {info.pendingMessages.map((t, i) => <li key={i} className="truncate text-xs text-slate-700">• {t}</li>)}
                </ul>
              </div>
            )}
            <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={5}
              className="mt-3 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:bg-white" />
            <div className="mt-3 flex items-center gap-2">
              <button onClick={() => { if (reply.trim()) { onSendReply(reply); toast('Reply sent to chat', 'success') } }} disabled={!reply.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">▶ Send</button>
              <button onClick={() => { navigator.clipboard?.writeText(reply); toast('Copied', 'success') }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">Copy</button>
            </div>
          </>
        )}
      </div>

      {/* Quick-send panels — responsive: side-by-side when wide, stacked when narrow.
          auto-fit reacts to the AI panel's actual width (not the viewport). */}
      <div className="mt-3 grid items-start gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))' }}>
        <SendPanel title="Communication Actions" items={qa?.communication || COMM_ITEMS} onSendReply={onSendReply} />
        <SendPanel title="Payment Methods" hint="Select to send" items={qa?.payment || PAY_ITEMS} onSendReply={onSendReply} />
        <SendPanel title="Document" items={qa?.document || DOC_ITEMS} onSendReply={onSendReply} />
      </div>
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
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
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

function DesignerTab({ conv }) {
  const toast = useToast()
  const PRIORITY_CLS = {
    High:   'bg-rose-50 text-rose-700 hover:bg-rose-100',
    Medium: 'bg-amber-50 text-amber-700 hover:bg-amber-100',
    Low:    'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
  }
  const cid = conv?.id
  const [rows, setRows] = useState([])
  const [team, setTeam] = useState([])       // real team member names
  const [extracting, setExtracting] = useState(false)
  const nextRef = useRef(1)

  // Load saved jobs for this conversation + the real team list.
  useEffect(() => {
    const jobs = Array.isArray(conv?.designer_jobs) ? conv.designer_jobs : []
    setRows(jobs)
    nextRef.current = jobs.reduce((m, r) => Math.max(m, r.id || 0), 0) + 1
  }, [cid, conv?.designer_jobs])
  useEffect(() => {
    api.get('/api/users').then((us) => setTeam((us || []).map((u) => u.name).filter(Boolean))).catch(() => {})
  }, [])

  // Persist the whole jobs array on the conversation (survives reload, shared with team).
  const persist = (newRows) => {
    setRows(newRows)
    if (cid) api.patch(`/api/conversations/${encodeURIComponent(cid)}`, { designer_jobs: newRows }).catch(() => {})
  }
  const update = (id, patch) => persist(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const remove = (id) => persist(rows.filter((r) => r.id !== id))
  const addRow = () => {
    const id = nextRef.current++
    const yr = new Date().getFullYear()
    persist([...rows, { id, code: `AW-${yr}-${String(id).padStart(3, '0')}`, assignee: '', priority: 'Medium', instructions: '', checked: false }])
  }
  const extract = async () => {
    if (!cid) return
    setExtracting(true)
    try {
      const r = await api.post(`/api/ai/designer-jobs/${encodeURIComponent(cid)}`, {})
      if (r.empty) { toast('Is chat mein abhi koi message nahi', 'info'); return }
      const jobs = r.jobs || []
      nextRef.current = jobs.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1
      setRows(jobs)   // server already saved them
      toast(jobs.length ? `${jobs.length} design task${jobs.length > 1 ? 's' : ''} extracted` : 'Koi design task nahi mila', 'success')
    } catch (ex) { toast(ex.message || 'Failed', 'error') }
    finally { setExtracting(false) }
  }

  const selectedCount = rows.filter((r) => r.checked).length
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-2 text-sm font-bold"><span className="text-violet-600">✨</span> Designer Jobs</h4>
          <p className="mt-0.5 text-xs text-slate-500">All artworks and tasks extracted from this conversation.</p>
        </div>
        <button onClick={extract} disabled={extracting || !cid} className="shrink-0 rounded-lg bg-violet-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50">{extracting ? 'Extracting…' : '✨ Extract from chat'}</button>
      </div>
      {rows.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-xs text-slate-500">
          Abhi koi designer job nahi. <b>"✨ Extract from chat"</b> dabao — AI is chat se design tasks nikal dega, ya neeche se manually add karo.
        </div>
      )}
      <ul className="space-y-2">
        {rows.map((row, idx) => {
          return (
            <li key={row.id} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2.5">
              <input type="checkbox" checked={row.checked} onChange={(e) => update(row.id, { checked: e.target.checked })} className="mt-1 h-3.5 w-3.5 shrink-0 accent-brand-600" />
              <div className="grid w-8 shrink-0 place-items-center text-xs font-semibold text-slate-500">{idx + 1}</div>
              <div className="shrink-0">
                <div className="grid h-12 w-12 place-items-center rounded-md bg-slate-900 ring-1 ring-slate-200 text-[10px] font-bold text-white">{(row.code || '').split('-').pop()}</div>
                <div className="mt-1 text-center text-[10px] text-slate-500">{row.code}</div>
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                {row.title && <div className="text-xs font-semibold text-slate-700">{row.title}</div>}
                <select value={row.assignee} onChange={(e) => update(row.id, { assignee: e.target.value })} className="flex w-full items-center justify-between rounded-md border border-slate-200 bg-white px-2 py-1 text-xs">
                  <option value="">Unassigned</option>
                  {team.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
                <select value={row.priority} onChange={(e) => update(row.id, { priority: e.target.value })} className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-xs font-semibold ${PRIORITY_CLS[row.priority]}`}>
                  <option>High</option><option>Medium</option><option>Low</option>
                </select>
                <input type="text" value={row.instructions}
                  onChange={(e) => setRows((xs) => xs.map((r) => (r.id === row.id ? { ...r, instructions: e.target.value } : r)))}
                  onBlur={() => persist(rows)}
                  placeholder="Enter instructions..." className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
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

const metricRatingCls = (r) => r === 'Needs Improve' ? 'text-rose-600' : (r === 'Pending' || !r) ? 'text-slate-400' : 'text-emerald-600'

function IntentTab({ ai, onAnalyze, conv }) {
  const a = ai?.analysis
  if (!a) return <AnalyzePrompt onAnalyze={onAnalyze} loading={ai?.loading} />
  const intent = a.intent || {}
  const ci = a.customerInsights || {}
  const sent = a.sentiment || {}
  const am = a.agentMetrics || {}
  const tone = sentimentTone(sent.label)
  const objections = Array.isArray(a.objections) ? a.objections : []
  const convProb = a.leadPrediction?.conversionProbability
  const METRICS = [
    ['First Response Time', am.firstResponseTime], ['Avg Response Time', am.avgResponseTime],
    ['Resolution Rate', am.resolutionRate], ['Conversation Control', am.conversationControl],
    ['Information Collection', am.informationCollection], ['CTA Effectiveness', am.ctaEffectiveness],
    ['Objection Handling', am.objectionHandling], ['Follow-up Discipline', am.followupDiscipline],
  ].filter(([, v]) => v && (v.value || v.rating))
  const rows = [
    ['Product Interest', ci.productInterest], ['Design Theme', ci.designTheme],
    ['Buyer Type', ci.buyerType], ['Buying Signals', ci.buyingSignals],
    ['Urgency', ci.urgency], ['Budget Sensitivity', ci.budgetSensitivity],
    ['Decision Maker', ci.decisionMaker], ['Engagement Level', ci.engagement],
    ['Repeat Customer', ci.repeatCustomer],
  ].filter((r) => r[1])
  return (
    <>
      {METRICS.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h4 className="mb-3 flex items-center gap-1.5 text-sm font-bold"><span className="text-violet-600">📊</span> Agent Performance Matrices</h4>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {METRICS.map(([label, m], i) => (
              <div key={i} className="rounded-lg bg-slate-50 p-2.5">
                <div className="text-[10px] text-slate-500">{label}</div>
                <div className="text-base font-bold">{m.value || '—'}</div>
                <div className={`text-[11px] font-semibold ${metricRatingCls(m.rating)}`}>{m.rating || '—'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
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

      {(objections.length > 0 || convProb != null) && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {objections.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h4 className="mb-2 text-sm font-bold">Objections / Concerns</h4>
              <ul className="space-y-1.5 text-xs">
                {objections.map((o, i) => <li key={i} className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" /> {o}</li>)}
              </ul>
            </div>
          )}
          {convProb != null && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h4 className="mb-2 text-sm font-bold">Lead Prediction</h4>
              <div className="text-xs text-slate-500">Conversion Probability</div>
              <div className="text-2xl font-extrabold text-emerald-600">{convProb}%</div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500" style={{ width: `${convProb}%` }} /></div>
              <div className="mt-1 flex justify-between text-[10px] text-slate-400"><span>Low</span><span>High</span></div>
            </div>
          )}
        </div>
      )}

      {conv?.listTime && (
        <div className="mt-4 flex items-center gap-1.5 text-xs text-slate-500"><span>📅</span> Last Activity · {conv.listTime}</div>
      )}
    </>
  )
}
