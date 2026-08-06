import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { signOut, currentUser, can } from '../lib/auth.js'
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
  lastOutTs:   c.last_out_ts ?? c.lastOutTs,   // hamra last reply kab gaya
  lastInTs:    c.last_in_ts  ?? c.lastInTs,     // customer ka last message
  firstTs:     c.first_ts    ?? c.firstTs,      // chat kab shuru hui (pehla message)
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

// Clock time BROWSER ke LOCAL timezone me (raw epoch ts se). Server UTC me format karta tha,
// isliye user ke local time se ghante aage/peeche dikhta tha. Ab ts se client-side format ->
// Facebook/Messenger ke time se match. Fallback: purana stored string.
const fmtClock = (ts, fallback) => {
  const t = Number(ts) || 0
  if (!t) return fallback || ''
  return new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
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

  // Deep-link: Leads dashboard (ya kahin se) ?conv=<id> ke saath aaye to seedha wahi chat kholo.
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    const c = searchParams.get('conv')
    if (c) { setCurrentId(c); localStorage.setItem('currentConvId', c); searchParams.delete('conv'); setSearchParams(searchParams, { replace: true }) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const convTs = (c) => c.last_ts || (c.created_at ? Date.parse(c.created_at) : 0) || 0
  // "YYYY-MM-DD" -> local din ki shuruaat / aakhri millisecond (browser ke timezone mein)
  // From/To = date ("YYYY-MM-DD") + optional time ("HH:MM"). Time na ho to poora din
  // (start=00:00, end=23:59); time ho to us exact minute se.
  const dayStartLocal = (s, t) => { const [y, m, d] = String(s).split('-').map(Number); const [hh, mm] = String(t || '').split(':').map(Number); return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0).getTime() }
  const dayEndLocal = (s, t) => { const [y, m, d] = String(s).split('-').map(Number); if (t) { const [hh, mm] = t.split(':').map(Number); return new Date(y, m - 1, d, hh || 0, mm || 0, 59, 999).getTime() } return new Date(y, m - 1, d, 23, 59, 59, 999).getTime() }
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
    setMessages([]); setPending([]); setAttachQueue([])   // chat switch par purani chat ke messages + optimistic + attach-queue turant saaf (warna purani chat "stuck" dikhti thi)
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
  const [view, setView] = useState(() => searchParams.get('view') || 'all')   // ?view= se deep-link (dusre pages ke sidebar se)
  const [sortDir, setSortDir] = useState('latest') // 'latest' | 'oldest'
  const emptyFilters = { channel: '', agent: '', status: '', tag: '', from: '', to: '', fromTime: '', toTime: '', dateBasis: 'activity' }
  const [filters, setFilters] = useState(emptyFilters)
  const setFilter = (k, v) => setFilters((f) => ({ ...f, [k]: v }))
  const clearFilters = () => setFilters(emptyFilters)
  const activeFilterCount = ['channel', 'agent', 'status', 'tag', 'from', 'to'].filter((k) => filters[k]).length

  // Customer flags/tags — definitions shared with the Customers page (/api/flags),
  // yahan inbox mein conversation par lagte hain (conv.tags = [flagId,...]).
  const [flags, setFlags] = useState([])
  const [manageFlagsOpen, setManageFlagsOpen] = useState(false)
  const loadFlags = () => api.get('/api/flags').then(setFlags).catch(() => setFlags([]))
  useEffect(() => { loadFlags() }, [])
  const openInMessenger = async () => {
    if (!currentConv) return
    const w = window.open('', '_blank')                 // pehle blank tab (popup-blocker se bachne ke liye)
    try {
      const r = await api.get(`/api/meta/messenger-link/${encodeURIComponent(currentConv.id)}`)
      if (w) w.location.href = r?.url || 'https://business.facebook.com/latest/inbox/all'
    } catch { if (w) w.location.href = 'https://business.facebook.com/latest/inbox/all' }
  }
  const setConvTags = (id, next) => patchConv(id, { tags: next })   // optimistic UI + API save dono patchConv mein

  // Sabse HAAL ka customer (incoming) message — array order nahi, time (created_at) se.
  // Recent customer (incoming) messages — oldest→newest. Translation tab N pick karega.
  const incomingList = useMemo(() => {
    const ins = messages.filter((m) => (m.dir === 'in' || m.direction === 'in') && (m.text || m.body))
    ins.sort((a, b) => (Date.parse(a.created_at) || 0) - (Date.parse(b.created_at) || 0))
    return ins.map((m) => m.text || m.body || '').filter(Boolean)
  }, [messages])
  const lastIncomingText = incomingList[incomingList.length - 1] || ''

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
    // Date filter kis time pe lage. Date input "YYYY-MM-DD" ko LOCAL din ke hisaab se lo.
    // 'out' = HUM aakhri bole (customer ne jawab nahi diya) — awaiting customer.
    // 'in'  = CUSTOMER aakhri bola (humein reply karna hai) — needs reply.
    // 'activity' = koi bhi message (last activity).
    const outTs = Number(c.lastOutTs) || 0, inTs = Number(c.lastInTs) || 0
    const fromB = filters.from ? dayStartLocal(filters.from, filters.fromTime) : null   // date + optional time
    const toB = filters.to ? dayEndLocal(filters.to, filters.toTime) : null
    if (filters.dateBasis === 'out') {
      if (!outTs || outTs < inTs) return false                                  // hum aakhri nahi bole -> skip
      if (fromB && outTs < fromB) return false
      if (toB && outTs > toB) return false
    } else if (filters.dateBasis === 'in') {
      if (!inTs || inTs <= outTs) return false                                  // customer aakhri nahi bola -> skip
      if (fromB && inTs < fromB) return false
      if (toB && inTs > toB) return false
    } else if (filters.dateBasis === 'created') {
      // 'created' = chat kab shuru hui / customer pehli baar kab aaya (pehla message ka time).
      const fTs = Number(c.firstTs) || (c.created_at ? Date.parse(c.created_at) : 0) || 0
      if (!fTs) return false
      if (fromB && fTs < fromB) return false
      if (toB && fTs > toB) return false
    } else {
      const bTs = convTs(c)
      if (fromB && bTs < fromB) return false
      if (toB && bTs > toB) return false
    }
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
  // Chat se pichhli screen pe wapas — agar Leads/kisi page se aaye to wahin, warna list par.
  const goBack = () => { if (window.history.length > 1) navigate(-1); else setCurrentId(null) }
  const toggleBookmark = () => currentConv && patchConv(currentConv.id, { bookmarked: !currentConv.bookmarked })
  const assignToMe = () => currentConv && patchConv(currentConv.id, { assigned_to: myName })

  // Composer
  const [mode, setMode] = useState('reply')
  const [draft, setDraft] = useState('')
  const chatRef = useRef(null)
  // Lambi message par textarea khud badhta hai (max ~6 lines); send/clear par wapas chhota.
  const draftRef = useRef(null)
  useEffect(() => {
    const el = draftRef.current
    if (!el) return
    el.style.height = 'auto'
    if (draft) el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [draft])
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
  const [attachQueue, setAttachQueue] = useState([])   // paste/attach ki hui files — Send pe jaati hain
  const onPickFile = () => fileInputRef.current?.click()
  // File (attach ya paste) ko QUEUE me daalo — preview dikhega, Send pe jayegi (turant nahi).
  const queueFile = async (file) => {
    if (!file || !currentId) return
    if (file.size > 24 * 1024 * 1024) { toast('File must be smaller than 24MB', 'error'); return }
    const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file) })
    const id = `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    setAttachQueue((q) => [...q, { id, dataUrl, isImg: (file.type || '').startsWith('image/'),
      name: file.name || `pasted-${Date.now()}.${(file.type || 'image/png').split('/')[1] || 'png'}`, type: file.type || 'image/png' }])
  }
  const onFileChosen = async (e) => { const file = e.target.files?.[0]; e.target.value = ''; await queueFile(file) }
  // Reply box me Ctrl+V se image (screenshot) paste -> composer me preview aata hai (send nahi hota).
  const onPaste = (e) => {
    if (mode === 'note') return
    const items = e.clipboardData?.items || []
    for (const it of items) {
      if (it.kind === 'file' && (it.type || '').startsWith('image/')) {
        const file = it.getAsFile()
        if (file) { e.preventDefault(); queueFile(file); return }
      }
    }
  }
  // Ek queued file ko chat me bhejo (Send dabane par).
  const sendOneFile = async (it, caption) => {
    const clientTs = Date.now() + Math.floor(Math.random() * 1000)
    const clientId = `cid-${clientTs}-${Math.random().toString(36).slice(2, 8)}`
    setPending((p) => [...p, { id: clientId, dir: 'out', text: caption || '', time: nowTime(), agent: currentUser()?.name,
      attachments: [{ type: it.isImg ? 'image' : 'file', url: it.dataUrl, name: it.name }], _status: 'sending', ts: clientTs, created_at: new Date(clientTs).toISOString() }])
    const mark = (s, err) => setPending((p) => p.map((x) => x.id === clientId ? { ...x, _status: s, _error: err } : x))
    try { await api.post('/api/meta/send-file', { conversationId: currentId, fileName: it.name, fileType: it.type, dataBase64: it.dataUrl, text: caption || '', clientTs, clientId }); mark('sent') }
    catch (ex) { mark('failed', ex.message) }
  }
  // Send: pehle queued attachments (caption = draft first pe), warna text.
  const doSend = () => {
    if (mode === 'reply' && attachQueue.length) {
      const items = attachQueue, caption = draft.trim()
      setAttachQueue([]); setDraft('')
      items.forEach((it, i) => sendOneFile(it, i === 0 ? caption : ''))
    } else {
      sendMessage(draft)
    }
  }

  // Quick-send asset (Zelle QR image etc.) ko chat me bhej — send-file (base64) ke raste.
  const sendAssetImage = async (dataUrl, name, caption) => {
    if (!currentId || !dataUrl) return
    const clientTs = Date.now(); const clientId = `cid-${clientTs}-${Math.random().toString(36).slice(2, 8)}`
    const isImg = /^data:image\//.test(dataUrl)
    const fileType = (String(dataUrl).match(/^data:([^;]+);/) || [])[1] || 'image/png'
    setPending((p) => [...p, { id: clientId, dir: 'out', text: caption || '', time: nowTime(), agent: currentUser()?.name,
      attachments: [{ type: isImg ? 'image' : 'file', url: dataUrl, name }], _status: 'sending', ts: clientTs, created_at: new Date(clientTs).toISOString() }])
    const mark = (s, err) => setPending((p) => p.map((x) => x.id === clientId ? { ...x, _status: s, _error: err } : x))
    try {
      await api.post('/api/meta/send-file', { conversationId: currentId, fileName: name, fileType, dataBase64: dataUrl, text: caption || '', clientTs, clientId })
      mark('sent')
    } catch (ex) { mark('failed', ex.message) }
  }

  const onKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend() } }

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
            <li><Link to="/leads" className="sb-item group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold hover:bg-white/5" data-tip="Leads">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>
              <span className="sb-label">Leads</span>
            </Link></li>
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
            {/* "All Conversations" hata diya — Inbox wahi kaam karta tha (duplicate item, sidebar clutter) */}
            <li><button onClick={() => setView('bookmarks')} className={`sb-item flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium ${view === 'bookmarks' ? 'bg-brand-600 text-white' : 'hover:bg-white/5'}`} data-tip="Bookmarks">
              <span className="flex items-center gap-3">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                <span className="sb-label">Bookmarks</span>
              </span>
              {bookmarkCount > 0 && <span className="sb-badge rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white">{bookmarkCount}</span>}
            </button></li>
            {can('page:ai-assistant') && <li><Link to="/ai-assistant" className="sb-item flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-violet-300 hover:bg-white/5" data-tip="AI Prompting">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
              <span className="sb-label">AI Prompting</span>
            </Link></li>}
            {can('page:after-session') && <li><Link to="/after-session" className="sb-item flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-violet-300 hover:bg-white/5" data-tip="After Session">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              <span className="sb-label">After Session</span>
            </Link></li>}
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
            {can('page:team') && <li><Link to="/team" className="sb-item flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-white/5" data-tip="Users">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              <span className="sb-label">Users</span>
            </Link></li>}
            {can('cap:manage_roles') && <li><Link to="/roles" className="sb-item flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-white/5" data-tip="Roles & Access">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 4 5v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V5z"/><path d="m9 12 2 2 4-4"/></svg>
              <span className="sb-label">Roles &amp; Access</span>
            </Link></li>}
            {can('page:connect-meta') && <li><Link to="/connect-meta" className="sb-item flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-white/5" data-tip="Connect Meta">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.99 22 12z"/></svg>
              <span className="sb-label">Connect Meta</span>
            </Link></li>}
            {can('page:integrations') && <li><Link to="/integrations" className="sb-item flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-white/5" data-tip="Integrations">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/></svg>
              <span className="sb-label">Integrations</span>
            </Link></li>}
            {can('page:settings') && <li><Link to="/settings" className="sb-item flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-white/5" data-tip="Settings">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/></svg>
              <span className="sb-label">Settings</span>
            </Link></li>}
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
                  <div className="col-span-2"><label className="mb-1 block font-semibold text-slate-600">Date filter by</label>
                    <select value={filters.dateBasis} onChange={(e) => setFilter('dateBasis', e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                      <option value="activity">Last activity (any message)</option>
                      <option value="created">Chat started (customer first came)</option>
                      <option value="out">We replied last — awaiting customer</option>
                      <option value="in">Customer replied last — needs our reply</option>
                    </select>
                  </div>
                  <div><label className="mb-1 block font-semibold text-slate-600">From <span className="font-normal text-slate-400">(time optional)</span></label>
                    <div className="flex gap-1.5">
                      <input type="date" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2" />
                      <input type="time" value={filters.fromTime} onChange={(e) => setFilter('fromTime', e.target.value)} className="w-[92px] rounded-lg border border-slate-200 bg-slate-50 px-1.5 py-2" />
                    </div></div>
                  <div><label className="mb-1 block font-semibold text-slate-600">To <span className="font-normal text-slate-400">(time optional)</span></label>
                    <div className="flex gap-1.5">
                      <input type="date" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2" />
                      <input type="time" value={filters.toTime} onChange={(e) => setFilter('toTime', e.target.value)} className="w-[92px] rounded-lg border border-slate-200 bg-slate-50 px-1.5 py-2" />
                    </div></div>
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
                  <button key={id} onClick={() => { setCurrentId(id); if (search) setSearch('') }} className={`group relative mx-1.5 my-0.5 flex w-[calc(100%-0.75rem)] gap-2.5 rounded-xl px-2.5 py-2.5 text-left transition ${active ? 'bg-brand-50 ring-1 ring-inset ring-brand-100' : 'hover:bg-slate-100/70'}`}>
                    {active && <span className="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-brand-500" />}
                    <div className="relative shrink-0">
                      <span className={`grid h-10 w-10 place-items-center rounded-full ${c.avatarBg} text-sm font-bold`}>{c.initials}</span>
                      <span className={`absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full ${c.channelBg} text-white ring-2 ring-white`}>{channelIcon(c.channel)}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className={`truncate text-sm font-semibold ${active ? 'text-brand-900' : 'text-slate-800'}`}>{c.name}</div>
                        <span className="shrink-0 text-[11px] text-slate-400">{fmtClock(c.last_ts, c.listTime)}</span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <p className="truncate text-xs text-slate-500">{c.lastDir === 'out' && <span className="font-semibold text-slate-400">You: </span>}{c.listPreview}</p>
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
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-3 py-2.5 sm:px-5">
              <div className="flex min-w-0 items-start gap-3">
                {/* back to the conversation list — phones only */}
                <button type="button" onClick={goBack} aria-label="Back" title="Back"
                  className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                </button>
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${conv.avatarBg} text-sm font-bold`}>{conv.initials}</span>
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
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><span className={`grid h-4 w-4 place-items-center rounded-full ${conv.channelBg} text-white`}>{channelIcon(conv.channel)}</span> {conv.channel}</span>
                    <span className="whitespace-nowrap">{conv.phone}</span>
                    <span className="inline-flex items-center gap-1 whitespace-nowrap"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> {conv.company}</span>
                    <FlagBadges allFlags={flags} value={Array.isArray(conv.tags) ? conv.tags : []} onChange={(next) => setConvTags(conv.id, next)} />
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button onClick={toggleBookmark} title={conv.bookmarked ? 'Remove bookmark' : 'Bookmark'} className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border ${conv.bookmarked ? 'border-amber-300 bg-amber-50 text-amber-600' : 'border-slate-200 hover:bg-slate-50 text-slate-500'}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill={conv.bookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                </button>
                {/^(fb|ig):/.test(String(conv.id || '')) && (
                  <button onClick={openInMessenger} title="Open in Facebook Messenger (Business Suite)"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-blue-600 hover:border-blue-300 hover:bg-blue-50">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.14.26.35.27.57l.05 1.78c.02.57.6.94 1.12.71l1.99-.88c.17-.07.35-.09.53-.04.91.25 1.88.38 2.8.38 5.64 0 10-4.13 10-9.7C22 6.13 17.64 2 12 2zm6 7.46l-2.94 4.66c-.47.74-1.47.93-2.18.41l-2.34-1.75a.6.6 0 0 0-.72 0l-3.16 2.4c-.42.32-.97-.18-.69-.63l2.94-4.66c.47-.74 1.47-.93 2.18-.41l2.34 1.75c.21.16.51.16.72 0l3.16-2.4c.42-.32.97.18.69.63z"/></svg>
                  </button>
                )}
                <button onClick={assignToMe} title={conv.assigned_to ? `Assigned to ${conv.assigned_to}` : 'Assign to me'} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-semibold hover:bg-slate-50">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                  {conv.assigned_to && <span className="max-w-[80px] truncate text-xs">{conv.assigned_to.split(' ')[0]}</span>}
                </button>
                {!leadOpen && (
                  <button onClick={openLeadPanel} title="Open Lead Details" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h4"/></svg>
                    Lead Details
                  </button>
                )}
                {!aiOpen && (
                  <button onClick={openAiPanel} title="Open AI Supervisor" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100">
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
                <button key={id} onClick={() => setMidTab(id)} className={`whitespace-nowrap border-b-2 py-2.5 text-sm ${midTab === id ? 'border-brand-500 text-brand-600 font-semibold' : 'border-transparent text-slate-500 font-medium hover:text-slate-700'}`}>{lbl}</button>
              ))}
            </nav>

            {midTab === 'conversation' && (
              <div className="flex min-h-0 flex-1 flex-col">
                <div ref={chatRef} className="nice-scroll flex-1 overflow-y-auto bg-slate-50/40 px-4 py-4">
                  <div className="flex min-h-full flex-col justify-end">
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
                        <div className="max-w-[min(90%,42rem)] rounded-2xl rounded-tl-md bg-white px-4 py-2.5 text-sm shadow-sm ring-1 ring-slate-100"><MsgAttachments items={m.attachments} />{m.text}<div className="mt-1 text-[10px] text-slate-400">{fmtClock(m.ts, m.time)}</div></div>
                      </div>
                    )
                    if (m.dir === 'note') return (
                      <div key={m.id || i} className="mt-4 flex items-start justify-end gap-2">
                        <div className="max-w-[min(90%,42rem)] rounded-2xl rounded-tr-md bg-amber-50 px-4 py-2.5 text-sm text-amber-900 shadow-sm ring-1 ring-amber-200">
                          <div className="mb-1 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">📝 Internal note{m.agent ? ` · ${m.agent}` : ''}</div>
                          <div>{m.text}</div>
                          <div className="mt-1 text-right text-[10px] text-amber-700/70">{fmtClock(m.ts, m.time)}</div>
                        </div>
                      </div>
                    )
                    const failed = m._status === 'failed'
                    const sending = m._status === 'sending'
                    return (
                      <div key={m.id || i} className="mt-4 flex flex-col items-end">
                        {m.agent && <div className="mb-0.5 mr-10 text-[10px] font-semibold text-slate-500">{m.agent}</div>}
                        <div className="flex items-start justify-end gap-2">
                          <div className={`max-w-[min(90%,42rem)] rounded-2xl rounded-tr-md px-4 py-2.5 text-sm shadow-sm ${failed ? 'bg-rose-50 text-rose-900 ring-1 ring-rose-200' : 'bg-brand-600 text-white'}`}>
                            <MsgAttachments items={m.attachments} />{m.text}
                            <div className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${failed ? 'text-rose-500' : 'text-white/70'}`}>
                              {fmtClock(m.ts, m.time)}
                              {sending
                                ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin text-white/70"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                                : failed
                                ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e11d48" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
                                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/><polyline points="22 11 13 20"/></svg>}
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
                </div>

                <div className="border-t border-slate-200 bg-white px-4 py-2">
                  {attachQueue.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {attachQueue.map((it) => (
                        <div key={it.id} className="group relative">
                          {it.isImg
                            ? <img src={it.dataUrl} alt={it.name} className="h-16 w-16 rounded-lg object-cover ring-1 ring-slate-200" />
                            : <div className="grid h-16 w-16 place-items-center rounded-lg bg-slate-100 px-1 text-center text-[9px] font-semibold text-slate-500 ring-1 ring-slate-200">📎 {it.name.slice(0, 14)}</div>}
                          <button onClick={() => setAttachQueue((q) => q.filter((x) => x.id !== it.id))} title="Remove"
                            className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-slate-700 text-[11px] font-bold text-white shadow hover:bg-rose-600">×</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <textarea ref={draftRef} rows="2" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKeyDown} onPaste={onPaste} placeholder={mode === 'note' ? 'Write an internal note (visible to team only)...' : 'Type your message… (paste an image with Ctrl+V, sent on Send)'} className="nice-scroll block w-full resize-none overflow-y-auto rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"></textarea>
                  <input ref={fileInputRef} type="file" onChange={onFileChosen} className="hidden" accept="image/*,application/pdf,.doc,.docx,.txt,.ai,.psd,.eps,.zip" />
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-slate-500">
                      <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs font-semibold">
                        <button onClick={() => setMode('reply')} className={`rounded-md px-2.5 py-1 ${mode === 'reply' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Reply</button>
                        <button onClick={() => setMode('note')} className={`rounded-md px-2.5 py-1 ${mode === 'note' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Note</button>
                      </div>
                      {mode === 'reply' && (
                        <button onClick={onPickFile} disabled={attachBusy} title="Attach a file / image" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50">
                          {attachBusy
                            ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                            : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>}
                          Attach
                        </button>
                      )}
                    </div>
                    <button onClick={doSend} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
                      Send{attachQueue.length > 0 ? ` (${attachQueue.length})` : ''}
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

            <nav className="nice-scroll flex items-center gap-3.5 overflow-x-auto border-b border-slate-200 px-4 text-[13px]">
              {[['responses','Responses'],['translate','Translation'],['summary','Summary'],['actions','Actions'],['designer','Designer Jobs'],['intent','Intent & Insights']].map(([id, lbl]) => (
                <button key={id} onClick={() => setAiTab(id)} className={`shrink-0 whitespace-nowrap border-b-2 py-2.5 ${aiTab === id ? 'border-brand-500 text-brand-600 font-semibold' : 'border-transparent text-slate-500 font-medium hover:text-slate-700'}`}>{lbl}</button>
              ))}
            </nav>

            <div className="nice-scroll flex-1 overflow-y-auto px-5 py-4">
              {aiTab === 'responses' && <ResponsesTab onSendReply={(text) => sendMessage(text, 'reply')} onSendImage={sendAssetImage} conv={conv} msgCount={messages.length} />}
              {aiTab === 'translate' && <TranslationTab onSendReply={(text) => sendMessage(text, 'reply')} incoming={incomingList} />}
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
        <textarea rows="2" value={lastIncoming} readOnly placeholder="No customer message yet" className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none" />
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
        <textarea rows="2" value={outText} onChange={(e) => setOutText(e.target.value)} placeholder="Type in English..." className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20" />
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
      <p className="mt-0.5 text-xs text-slate-500">Analyze this conversation with AI — Intent, Insights and Reply are all generated for real.</p>
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
  { label: 'Zelle QR Code',          key: 'zelle',   msg: '💳 Pay via Zelle — DECOINKS, LLC' },
  { label: 'Cash App QR Code',       key: 'cashapp', msg: '💵 Cash App: $decoinks' },
  { label: 'PayPal QR Code',         key: 'paypal',  msg: '🅿️ PayPal: https://paypal.me/decoinks' },
  { label: 'PayPal Invoice (Cards)', msg: '🧾 We will send a secure PayPal invoice link (cards accepted).' },
]
const DOC_ITEMS = [
  { label: 'Preview Quote',   msg: '🧾 Here is your quote.' },
  { label: 'Preview Invoice', msg: '🧾 Here is your invoice.' },
]

// Safety-net: agar backend se aaye items me `key` (zelle/paypal) na ho, to defaults se
// label match karke key recover kar do — warna QR upload (⬆ set) button gayab ho jata hai.
const withKeys = (items, defaults) => {
  if (!Array.isArray(items)) return defaults
  const keyByLabel = Object.fromEntries(defaults.filter((d) => d.key).map((d) => [d.label.toLowerCase(), d.key]))
  return items.map((it) => (it.key || !keyByLabel[String(it.label || '').toLowerCase()]) ? it : { ...it, key: keyByLabel[it.label.toLowerCase()] })
}

function SendPanel({ title, hint, items, onSendReply, onSendImage }) {
  const toast = useToast()
  const [checked, setChecked] = useState({})
  const [assets, setAssets] = useState({})   // key -> base64 dataURL (Zelle QR etc.)
  const [busy, setBusy] = useState(false)
  const fileRefs = useRef({})
  useEffect(() => { api.get('/api/quick-assets').then((a) => setAssets(a || {})).catch(() => {}) }, [])

  const allOn = items.length > 0 && items.every((_, i) => checked[i])
  const toggleAll = () => setChecked(allOn ? {} : Object.fromEntries(items.map((_, i) => [i, true])))

  // keyed item ke liye QR/image upload -> server setting me store (sab agents ko milega)
  const pickImage = (key) => (e) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    if (f.size > 6 * 1024 * 1024) { toast('Image must be smaller than 6MB', 'error'); return }
    const r = new FileReader()
    r.onload = async () => {
      try { await api.post('/api/quick-assets', { key, dataBase64: r.result }); setAssets((a) => ({ ...a, [key]: r.result })); toast(`${key} image set ✓`, 'success') }
      catch (ex) { toast(ex.message, 'error') }
    }
    r.readAsDataURL(f)
  }

  const send = async () => {
    const chosen = items.filter((_, i) => checked[i])
    if (!chosen.length) { toast('Select something first', 'info'); return }
    setBusy(true)
    const texts = []
    for (const it of chosen) {
      if (it.key && assets[it.key] && onSendImage) await onSendImage(assets[it.key], `${it.key}.png`, it.msg)   // image bhejo
      else texts.push(it.msg)                                                                                    // text
    }
    if (texts.length) onSendReply(texts.join('\n'))
    setBusy(false)
    toast(`${chosen.length} sent to chat`, 'success')
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
            {x.key ? (<>
              {assets[x.key] && <img src={assets[x.key]} alt="" className="h-5 w-5 shrink-0 rounded object-cover ring-1 ring-slate-200" />}
              <input ref={(el) => (fileRefs.current[x.key] = el)} type="file" accept="image/*,application/pdf" onChange={pickImage(x.key)} className="hidden" />
              <button onClick={(e) => { e.preventDefault(); fileRefs.current[x.key]?.click() }} title={assets[x.key] ? 'Change image' : 'Upload QR/image'}
                className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold ${assets[x.key] ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{assets[x.key] ? '✓ img' : '⬆ set'}</button>
            </>) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-slate-300"><path d="m9 18 6-6-6-6"/></svg>
            )}
          </label>
        ))}
      </div>

      <button onClick={send} disabled={busy} className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50/70 px-3 py-1.5 text-[11px] font-semibold text-brand-700 transition hover:bg-brand-100 disabled:opacity-50">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>
        {busy ? 'Sending…' : 'Send to Chat'}
      </button>
    </div>
  )
}

function TranslationTab({ onSendReply, incoming }) {
  const toast = useToast()
  const [count, setCount] = useState(1)     // last kitne customer messages translate karne hain
  const [data, setData] = useState(null)   // { detectedLanguage, explanation, replyEn, replyNative }
  const [loading, setLoading] = useState(false)
  const [replyEn, setReplyEn] = useState('')
  const [native, setNative] = useState('')
  const [transBusy, setTransBusy] = useState(false)
  const [verify, setVerify] = useState(null)   // { literal, pairs[] }
  const [verifyBusy, setVerifyBusy] = useState(false)
  useEffect(() => { setVerify(null) }, [native])   // reset when the Spanish reply changes

  const list = Array.isArray(incoming) ? incoming : []
  const lastIncoming = list.slice(-count).join('\n')   // last N customer messages

  // Auto-run whenever the selected messages change (new message / count badle → khud update).
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
  // Send: agar customer ki language English nahi, to jo type kiya wo pehle uski language me translate
  // karke bhejo (fresh — taaki type kiya hua exactly match kare). English hai to seedha bhej do.
  const send = async () => {
    const en = replyEn.trim()
    if (!en) return
    if (isEnglish) { onSendReply(en); setReplyEn(''); toast('Sent', 'success'); return }
    setTransBusy(true)
    try {
      const r = await api.post('/api/translate', { text: en, from: 'English', to: data.detectedLanguage })
      const t = (r.translated || '').trim() || en
      setNative(t); onSendReply(t); setReplyEn(''); setNative('')
      toast(`Sent in ${data.detectedLanguage}`, 'success')
    } catch (ex) { toast(ex.message || 'Translate failed', 'error') } finally { setTransBusy(false) }
  }
  const COUNTS = [1, 2, 3, 5]
  const verifyTranslation = async () => {
    if (!native.trim()) return
    setVerifyBusy(true)
    try { const r = await api.post('/api/ai/verify-translation', { text: native }); setVerify(r) }
    catch (ex) { toast(ex.message || 'Verify failed', 'error') }
    finally { setVerifyBusy(false) }
  }

  const countBar = (
    <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-2 text-[11px]">
      <span className="font-semibold text-slate-500">Translate last:</span>
      {COUNTS.map((n) => (
        <button key={n} onClick={() => setCount(n)} disabled={n > list.length}
          className={`rounded-full px-2.5 py-1 font-semibold transition ${count === n ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'} disabled:opacity-30`}>{n}</button>
      ))}
      <span className="text-slate-400">message{count > 1 ? 's' : ''}</span>
    </div>
  )
  if (!list.length) {
    return <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">No customer messages in this chat yet.</div>
  }
  if (loading || !data) {
    return <>{countBar}<div className="rounded-xl border border-dashed border-violet-300 bg-violet-50/40 p-6 text-center text-sm text-violet-700">🌐 Translating…</div></>
  }
  return (
    <>
      {countBar}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between"><div className="text-sm font-bold">Customer's last {count > 1 ? `${count} messages` : 'message'}</div><span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{data.detectedLanguage}</span></div>
        <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-2.5 text-sm text-slate-700">{lastIncoming}</p>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-bold">💡 What they mean (simple English)</div>
        <p className="mt-2 text-sm text-slate-700">{data.explanation}</p>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-bold">✍️ Your reply — type / edit {!isEnglish && <span className="font-normal text-slate-400">(→ {data.detectedLanguage})</span>}</div>
          {replyEn && <button onClick={() => { setReplyEn(''); setNative('') }} className="shrink-0 text-[11px] font-semibold text-slate-400 hover:text-rose-600">Clear</button>}
        </div>
        <textarea value={replyEn} onChange={(e) => setReplyEn(e.target.value)} onBlur={updateNative} rows={4}
          placeholder="Type your message / question here… On Send it goes in the customer's language."
          className="mt-2 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:bg-white" />
        {!isEnglish && <button onClick={updateNative} disabled={transBusy} className="mt-2 rounded-md border border-violet-200 px-2.5 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50">{transBusy ? 'Translating…' : `↻ Preview ${data.detectedLanguage}`}</button>}
      </div>

      {!isEnglish && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
          <div className="text-sm font-bold text-emerald-800">Reply in {data.detectedLanguage} (this will be sent)</div>
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
            <p className="mt-2 text-xs text-slate-500">Confirm the Spanish is correct — review it word by word back in English.</p>
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
        <button onClick={send} disabled={!replyEn.trim() || transBusy} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">{transBusy ? 'Sending…' : `▶ Send ${isEnglish ? '' : 'in ' + data.detectedLanguage}`}</button>
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
    return <div className="nice-scroll min-h-0 flex-1 overflow-y-auto px-6 py-5"><div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">No messages in this chat yet.</div></div>
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
                <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-400">No replies for this filter.</td></tr>
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
      if (r.empty || !r.notes?.length) { toast('No notes could be generated from this chat', 'info'); return }
      let ok = 0
      for (const n of r.notes) { if (await onAddNote(n.text, n.category, { silent: true })) ok++ }
      toast(ok === r.notes.length ? `${ok} AI notes added` : `${ok}/${r.notes.length} notes saved (some failed — try again)`, ok ? 'success' : 'error')
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
        <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">No notes yet. Use "+ Add Note" to create one.</div>
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
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">No files / images shared in this chat yet.</div>
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
const SUMMARY_WINDOWS = [
  { k: 'full', label: 'Full chat' }, { k: '1', label: 'Last 1 day' }, { k: '2', label: 'Last 2 days' },
  { k: '3', label: 'Last 3 days' }, { k: '7', label: 'Last 7 days' }, { k: 'custom', label: 'Custom' },
]
const winLabel = (w) => (w?.from || w?.to) ? `${w.from || '…'} → ${w.to || '…'}` : w?.days ? `Last ${w.days} day${w.days > 1 ? 's' : ''}` : 'Full chat'

// The summary body cards (overview / key points / status / next step) — shared by the
// persisted running summary and one-off ad-hoc (windowed) summaries.
function SummaryCards({ s }) {
  return (<>
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-sm font-bold">📝 Conversation summary</div>
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
  </>)
}

function SummaryTab({ conv, msgCount }) {
  const toast = useToast()
  const [info, setInfo] = useState(null)    // persisted running (full) summary
  const [adhoc, setAdhoc] = useState(null)  // one-off windowed/custom-prompt result { summary, count, window }
  const [loading, setLoading] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState(null)
  const [win, setWin] = useState('full')    // full | 1 | 2 | 3 | 7 | custom
  const [from, setFrom] = useState(''); const [to, setTo] = useState('')
  const [prompt, setPrompt] = useState(''); const [defaultPrompt, setDefaultPrompt] = useState('')
  const [promptOpen, setPromptOpen] = useState(false)
  const cid = conv?.id

  // Cheap GET: saved running summary + new-message count + current prompt. No AI cost.
  useEffect(() => {
    let cancelled = false
    setInfo(null); setError(null); setAdhoc(null); setWin('full')
    if (!cid) return
    setLoading(true)
    api.get(`/api/ai/summary/${encodeURIComponent(cid)}`)
      .then((r) => { if (cancelled) return; if (r.empty) { setError('No messages in this chat yet.'); return } setInfo(r); setPrompt(r.prompt || ''); setDefaultPrompt(r.defaultPrompt || r.prompt || '') })
      .catch((ex) => { if (!cancelled) setError(ex.message || 'Summary failed') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [cid, msgCount])

  // Generate: window + (optionally edited) prompt. savePrompt=true persists it as the new default.
  const runGenerate = (savePrompt = false) => {
    if (!cid) return
    if (win === 'custom' && !from && !to) { toast('Custom range: choose a From/To date', 'info'); return }
    setWorking(true)
    const body = { prompt, savePrompt }
    if (win === 'custom') { body.from = from; body.to = to }
    else if (win !== 'full') body.days = Number(win)
    api.post(`/api/ai/summary/${encodeURIComponent(cid)}`, body)
      .then((r) => {
        if (r.empty === 'window') { setAdhoc(null); toast('No messages in this time window', 'info'); return }
        if (r.adhoc) { setAdhoc({ summary: r.summary, count: r.count, window: r.window }); toast('Summary ready', 'success') }
        else { setInfo((p) => ({ ...(p || {}), cached: true, stale: false, newCount: 0, summary: r.summary, summaryAt: r.summaryAt })); setAdhoc(null); toast(r.mode === 'incremental' ? 'Summary updated with new messages' : 'Summary saved', 'success') }
        if (savePrompt) toast('Prompt saved as default ✓', 'success')
      })
      .catch((ex) => toast(ex.message || 'Failed', 'error'))
      .finally(() => setWorking(false))
  }

  if (!cid) return <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">Select a conversation.</div>
  if (loading && !info) return <div className="rounded-xl border border-dashed border-violet-300 bg-violet-50/40 p-6 text-center text-sm text-violet-700">📝 Loading summary…</div>
  if (error) return <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-6 text-center text-sm text-amber-700">{error}</div>

  const s = adhoc ? adhoc.summary : info?.summary
  const savedAt = !adhoc && info?.summaryAt ? new Date(info.summaryAt).toLocaleString() : null
  const promptEdited = prompt.trim() !== defaultPrompt.trim()
  const isDefaultRun = win === 'full' && !promptEdited

  return (
    <>
      {/* Controls: time-window + editable prompt */}
      <div className="mb-3 rounded-xl border border-slate-200 bg-white p-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-[11px] font-semibold text-slate-500">Period:</span>
          {SUMMARY_WINDOWS.map((o) => (
            <button key={o.k} onClick={() => setWin(o.k)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${win === o.k ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{o.label}</button>
          ))}
        </div>
        {win === 'custom' && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <span>From</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-slate-200 px-2 py-1 text-slate-700" />
            <span>To</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-slate-200 px-2 py-1 text-slate-700" />
          </div>
        )}

        <div className="mt-2 border-t border-slate-100 pt-2">
          <button onClick={() => setPromptOpen((v) => !v)} className="flex w-full items-center justify-between text-[11px] font-semibold text-slate-500 hover:text-slate-700">
            <span>⚙️ Summary prompt{promptEdited && <span className="ml-1 rounded bg-amber-100 px-1 text-[9px] text-amber-700">edited</span>}</span>
            <span className="text-slate-400">{promptOpen ? '▲ hide' : '▼ edit'}</span>
          </button>
          {promptOpen && (
            <div className="mt-2">
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4}
                placeholder="What kind of summary do you want… (e.g. focus on pricing & objections, or a 2-line TL;DR)"
                className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[12px] leading-relaxed outline-none focus:border-brand-500 focus:bg-white" />
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <button onClick={() => setPrompt(defaultPrompt)} className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50">Reset to default</button>
                <button onClick={() => runGenerate(true)} disabled={working} className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">💾 Save as default + Generate</button>
              </div>
              <p className="mt-1 text-[10px] text-slate-400">The output format (overview / key points / status / next step) stays fixed — only the style/focus changes.</p>
            </div>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
          <span className="text-[11px] text-slate-400">{isDefaultRun ? 'Running summary of the whole chat (saved).' : 'Ad-hoc — does not touch the running summary.'}</span>
          <button onClick={() => runGenerate(false)} disabled={working} className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50">{working ? 'Generating…' : (isDefaultRun ? '↻ Generate / Update' : '✨ Generate')}</button>
        </div>
      </div>

      {/* Ad-hoc result banner */}
      {adhoc && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-violet-200 bg-violet-50 p-2.5">
          <span className="text-[11px] font-semibold text-violet-800">Ad-hoc summary · {winLabel(adhoc.window)} · {adhoc.count} msgs</span>
          <button onClick={() => setAdhoc(null)} className="shrink-0 text-[11px] font-semibold text-violet-700 underline hover:text-violet-900">← Full summary</button>
        </div>
      )}

      {/* Stale banner — only for the persisted running summary */}
      {!adhoc && info?.stale && info.newCount > 0 && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <span className="text-xs font-semibold text-amber-800">{info.newCount} new message{info.newCount > 1 ? 's' : ''} since this summary.</span>
          <button onClick={() => runGenerate(false)} disabled={working} className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50">{working ? 'Updating…' : '↻ Update summary'}</button>
        </div>
      )}

      {/* Body */}
      {s ? <SummaryCards s={s} /> : (
        <div className="rounded-xl border border-dashed border-violet-300 bg-violet-50/40 p-6 text-center">
          <div className="text-2xl">📝</div>
          <p className="mt-1 text-sm font-semibold text-slate-700">No summary yet</p>
          <p className="mt-0.5 text-xs text-slate-500">Choose a period above and press "Generate". The full chat summary will be saved.</p>
        </div>
      )}

      {savedAt && !adhoc && <div className="mt-3 text-right text-[11px] text-slate-400">Saved {savedAt}</div>}
    </>
  )
}

// AI Recommended Reply — answers the customer messages that arrived AFTER the agent's
// last reply (the unanswered ones). Re-generates automatically when new customer
// messages arrive; cheap/no-op when the agent has already replied to the latest.
function ResponsesTab({ onSendReply, onSendImage, conv, msgCount }) {
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
          <p className="mt-3 text-sm text-slate-500">Select a conversation.</p>
        ) : loading && !reply ? (
          <p className="mt-3 text-sm text-violet-700">✨ Generating reply for unanswered messages…</p>
        ) : info?.empty ? (
          <p className="mt-3 text-sm text-slate-500">No messages in this chat yet.</p>
        ) : info && info.pending === false && !reply ? (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-sm text-emerald-800">
            ✅ You've already replied to the latest customer message — nothing pending.
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
        <SendPanel title="Communication Actions" items={qa?.communication || COMM_ITEMS} onSendReply={onSendReply} onSendImage={onSendImage} />
        <SendPanel title="Payment Methods" hint="tick + Send" items={withKeys(qa?.payment, PAY_ITEMS)} onSendReply={onSendReply} onSendImage={onSendImage} />
        <SendPanel title="Document" items={qa?.document || DOC_ITEMS} onSendReply={onSendReply} onSendImage={onSendImage} />
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
      if (r.empty) { toast('No messages in this chat yet', 'info'); return }
      const jobs = r.jobs || []
      nextRef.current = jobs.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1
      setRows(jobs)   // server already saved them
      toast(jobs.length ? `${jobs.length} design task${jobs.length > 1 ? 's' : ''} extracted` : 'No design tasks found', 'success')
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
          No designer jobs yet. Press <b>"✨ Extract from chat"</b> — AI will pull design tasks from this chat, or add them manually below.
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

      {(conv?.last_ts || conv?.listTime) && (
        <div className="mt-4 flex items-center gap-1.5 text-xs text-slate-500"><span>📅</span> Last Activity · {fmtClock(conv.last_ts, conv.listTime)}</div>
      )}
    </>
  )
}
