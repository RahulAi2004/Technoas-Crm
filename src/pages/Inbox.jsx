import { useEffect, useMemo, useRef, useState } from 'react'
import SidebarCrm from '../components/SidebarCrm.jsx'
import { useToast } from '../components/ToastContext.jsx'
import { api, getToken } from '../lib/api.js'

const channelDot = (conv) => (
  <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full text-white ${conv.channel_bg || 'bg-slate-500'}`}>
    {conv.channel === 'Instagram'
      ? <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/></svg>
      : conv.channel === 'WhatsApp'
      ? <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24z"/></svg>
      : <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.99 22 12z"/></svg>}
  </span>
)

export default function Inbox() {
  const toast = useToast()
  const [convs, setConvs] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [messages, setMessages] = useState([])
  const [query, setQuery] = useState('')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [live, setLive] = useState(false)
  const [typers, setTypers] = useState({})   // { [conversationId]: { name, until } } — kaun type kar raha hai
  const typingRef = useRef({ cid: null, lastPing: 0, stopTimer: null })
  const [meta, setMeta] = useState(null)
  const [appId, setAppId] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [metaToken, setMetaToken] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [showConnect, setShowConnect] = useState(false)
  const activeIdRef = useRef(null)
  const bottomRef = useRef(null)

  const active = convs.find(c => c.id === activeId) || null

  const refreshMeta = () => api.get('/api/meta/status').then(setMeta).catch(() => setMeta({ connected: false }))
  useEffect(() => { refreshMeta() }, [])

  const reloadConvs = () =>
    api.get('/api/conversations').then((rows) => {
      const ts = (c) => c.last_ts || (c.created_at ? Date.parse(c.created_at) : 0) || 0
      setConvs([...rows].sort((a, b) => ts(b) - ts(a)))
    }).catch(() => {})

  const connectMeta = async (e) => {
    e.preventDefault()
    if (!appId.trim() || !appSecret.trim() || !metaToken.trim()) return
    setConnecting(true)
    try {
      const r = await api.post('/api/meta/connect-app', {
        appId: appId.trim(), appSecret: appSecret.trim(), token: metaToken.trim(),
      })
      toast(`Meta connected: ${r.page?.name || 'Page'} (permanent token)`, 'success')
      setMetaToken(''); setAppSecret(''); setShowConnect(false)
      await refreshMeta()
      await api.post('/api/meta/sync').catch(() => {})  // pull existing conversations now
      setTimeout(reloadConvs, 1500)
    } catch (ex) {
      toast(ex.message || 'Failed to connect Meta', 'error')
    } finally { setConnecting(false) }
  }

  // ---- initial load ----
  useEffect(() => {
    api.get('/api/conversations')
      .then((rows) => {
        const ts = (c) => c.last_ts || (c.created_at ? Date.parse(c.created_at) : 0) || 0
        const sorted = [...rows].sort((a, b) => ts(b) - ts(a))
        setConvs(sorted)
        if (sorted[0]) setActiveId(sorted[0].id)
      })
      .catch((e) => toast(e.message || 'Failed to load conversations', 'error'))
  }, [])

  // ---- load thread when active conversation changes ----
  useEffect(() => {
    stopTyping()                 // pichli chat me type kar rahe the to woh clear karo
    activeIdRef.current = activeId
    if (!activeId) { setMessages([]); return }
    let cancelled = false
    api.get(`/api/conversations/${encodeURIComponent(activeId)}/messages`)
      .then((rows) => { if (!cancelled) setMessages(rows) })
      .catch(() => { if (!cancelled) setMessages([]) })
    // clear unread badge
    if (active?.unread) {
      api.post(`/api/conversations/${encodeURIComponent(activeId)}/read`).catch(() => {})
      setConvs(prev => prev.map(c => c.id === activeId ? { ...c, unread: 0 } : c))
    }
    return () => { cancelled = true }
  }, [activeId])

  // ---- real-time stream (SSE) ----
  useEffect(() => {
    const token = getToken()
    if (!token) return
    const es = new EventSource(`/api/stream?token=${encodeURIComponent(token)}`)
    es.onopen = () => setLive(true)
    es.onerror = () => setLive(false)
    es.onmessage = (e) => {
      let evt
      try { evt = JSON.parse(e.data) } catch { return }

      if (evt.type === 'message') {
        // append to open thread (dedupe by id)
        if (evt.conversationId === activeIdRef.current) {
          setMessages(prev => prev.some(m => String(m.id) === String(evt.message.id)) ? prev : [...prev, evt.message])
        }
        // bump conversation preview + unread
        setConvs(prev => prev.map(c => {
          if (c.id !== evt.conversationId) return c
          const isOpen = evt.conversationId === activeIdRef.current
          const bumpUnread = evt.message.dir === 'in' && !isOpen
          return { ...c, list_preview: evt.message.text, list_time: evt.message.time, unread: bumpUnread ? (c.unread || 0) + 1 : c.unread }
        }))
      }

      if (evt.type === 'typing') {
        setTypers(prev => {
          const next = { ...prev }
          if (evt.state === 'typing') next[evt.conversationId] = { name: evt.name, until: Date.now() + 5000 }
          else delete next[evt.conversationId]
          return next
        })
      }

      if (evt.type === 'conversation') {
        setConvs(prev => {
          const exists = prev.some(c => c.id === evt.conversation.id)
          return exists
            ? prev.map(c => c.id === evt.conversation.id ? { ...c, ...evt.conversation } : c)
            : [evt.conversation, ...prev]
        })
      }
    }
    return () => es.close()
  }, [])

  // ---- autoscroll to newest ----
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return convs
    return convs.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.company || '').toLowerCase().includes(q) ||
      (c.list_preview || '').toLowerCase().includes(q))
  }, [query, convs])

  // ---- typing signal (agent-to-agent) ----
  // Throttled: type karte waqt har ~2.5s me ek 'typing' ping, aur ruknay par 'stopped'.
  const pingTyping = () => {
    const cid = activeIdRef.current
    if (!cid) return
    const t = typingRef.current
    const now = Date.now()
    if (t.cid !== cid || now - t.lastPing > 2500) {
      t.cid = cid; t.lastPing = now
      api.post(`/api/conversations/${encodeURIComponent(cid)}/typing`, { state: 'typing' }).catch(() => {})
    }
    clearTimeout(t.stopTimer)
    t.stopTimer = setTimeout(stopTyping, 3000)
  }
  const stopTyping = () => {
    const t = typingRef.current
    clearTimeout(t.stopTimer)
    const cid = t.cid
    t.cid = null; t.lastPing = 0
    if (cid) api.post(`/api/conversations/${encodeURIComponent(cid)}/typing`, { state: 'stopped' }).catch(() => {})
  }
  // component unmount par bhi typing clear kar do
  useEffect(() => () => stopTyping(), [])

  // Received typing events expire karo (agar 'stopped' miss ho jaye) — har 1.5s me prune.
  useEffect(() => {
    const iv = setInterval(() => {
      setTypers(prev => {
        const now = Date.now()
        let changed = false
        const next = {}
        for (const [k, v] of Object.entries(prev)) { if (v.until > now) next[k] = v; else changed = true }
        return changed ? next : prev
      })
    }, 1500)
    return () => clearInterval(iv)
  }, [])

  const send = async (e) => {
    e.preventDefault()
    const body = text.trim()
    if (!body || !active) return
    stopTyping()
    setText('')
    setSending(true)
    try {
      if (active.source === 'meta') {
        await api.post('/api/meta/send', { conversationId: active.id, text: body })
      } else {
        // non-Meta conversation: store locally (e.g. ManyChat/demo threads)
        await api.post(`/api/conversations/${encodeURIComponent(active.id)}/messages`, { dir: 'out', text: body })
      }
      // message appears via SSE broadcast; no optimistic dupe needed
    } catch (ex) {
      toast(ex.message || 'Send failed', 'error')
      setText(body) // restore on failure
    } finally { setSending(false) }
  }

  return (
    <div className="h-screen overflow-hidden grid" style={{ gridTemplateColumns: '240px 360px 1fr' }}>
      <SidebarCrm active="inbox" />

      {/* Conversation list */}
      <div className="flex h-screen flex-col overflow-hidden border-r border-slate-200 bg-white">
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-4">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-extrabold tracking-tight">Inbox</h1>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${live ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-emerald-500' : 'bg-slate-400'}`} />
              {live ? 'Live' : 'Offline'}
            </span>
          </div>
          <span className="text-xs text-slate-400">{filtered.length}</span>
        </div>
        <div className="border-b border-slate-100 p-3">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search conversations..."
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:bg-white" />
        </div>

        {/* Connect Meta — paste your Page Access Token here */}
        {meta && !meta.connected && (
          <div className="border-b border-slate-100 bg-amber-50/70 p-3">
            {!showConnect ? (
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-amber-800">
                  <div className="font-semibold">Meta not connected</div>
                  <div className="text-amber-700">Connect once — token never expires.</div>
                </div>
                <button onClick={() => setShowConnect(true)} className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">Connect</button>
              </div>
            ) : (
              <form onSubmit={connectMeta} className="space-y-2">
                <div className="text-xs font-semibold text-amber-800">Connect Meta (permanent)</div>
                <input
                  value={appId} onChange={(e) => setAppId(e.target.value)} autoFocus
                  placeholder="App ID"
                  className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-mono outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
                <input
                  type="password" value={appSecret} onChange={(e) => setAppSecret(e.target.value)}
                  placeholder="App Secret"
                  className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-mono outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
                <input
                  type="password" value={metaToken} onChange={(e) => setMetaToken(e.target.value)}
                  placeholder="Access Token (a fresh User token)"
                  className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-mono outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
                <p className="text-[10px] text-amber-700">App ID &amp; Secret: Meta App → Settings → Basic. They're stored on your server only.</p>
                <div className="flex items-center gap-2">
                  <button type="submit" disabled={connecting} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
                    {connecting ? 'Connecting...' : 'Connect & Sync'}
                  </button>
                  <button type="button" onClick={() => { setShowConnect(false); setMetaToken(''); setAppSecret('') }} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">Cancel</button>
                </div>
              </form>
            )}
          </div>
        )}
        {meta?.connected && (
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-emerald-50/60 px-3 py-1.5 text-[11px] text-emerald-700">
            <span className="font-semibold">● Meta connected{meta.pageName ? ` · ${meta.pageName}` : ''}</span>
            <span className="text-emerald-600">syncing every 10s</span>
          </div>
        )}
        <div className="nice-scroll flex-1 overflow-y-auto">
          {filtered.length === 0 && <div className="p-6 text-center text-sm text-slate-400">No conversations yet.</div>}
          {filtered.map((c) => (
            <button key={c.id} onClick={() => setActiveId(c.id)}
              className={`flex w-full items-start gap-3 border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50 ${activeId === c.id ? 'bg-brand-50/60' : ''}`}>
              <div className="relative">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-bold ${c.avatar_bg || 'bg-slate-200 text-slate-700'}`}>{c.initials}</span>
                <span className="absolute -bottom-0.5 -right-0.5">{channelDot(c)}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate text-sm font-semibold">{c.name}</div>
                  <div className="shrink-0 text-[11px] text-slate-400">{c.list_time}</div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate text-xs text-slate-500">{c.list_preview}</div>
                  {c.unread > 0 && <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">{c.unread}</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Thread */}
      <div className="flex h-screen flex-col overflow-hidden bg-slate-50">
        {!active ? (
          <div className="grid flex-1 place-items-center text-sm text-slate-400">Select a conversation to start chatting.</div>
        ) : (
          <>
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5">
              <div className="flex items-center gap-3">
                <span className={`grid h-10 w-10 place-items-center rounded-full text-xs font-bold ${active.avatar_bg || 'bg-slate-200 text-slate-700'}`}>{active.initials}</span>
                <div>
                  <div className="font-semibold">{active.name}</div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">{channelDot(active)} {active.channel}{active.phone ? ` · ${active.phone}` : ''}</div>
                </div>
              </div>
              {active.source === 'meta' && <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">Meta</span>}
            </div>

            <div className="nice-scroll flex-1 space-y-2 overflow-y-auto px-5 py-4">
              {messages.length === 0 && <div className="py-10 text-center text-sm text-slate-400">No messages yet. Say hi 👋</div>}
              {messages.map((m) => (
                m.dir === 'sys' ? (
                  <div key={m.id} className="my-2 text-center"><span className="rounded-full bg-slate-200/70 px-3 py-1 text-[11px] text-slate-500">{m.text}</span></div>
                ) : (
                  <div key={m.id} className={`flex ${m.dir === 'out' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[72%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${m.dir === 'out' ? 'rounded-br-md bg-brand-600 text-white' : 'rounded-bl-md bg-white text-slate-800'}`}>
                      <div className="whitespace-pre-wrap break-words">{m.text}</div>
                      <div className={`mt-0.5 text-[10px] ${m.dir === 'out' ? 'text-white/70' : 'text-slate-400'}`}>{m.time}</div>
                    </div>
                  </div>
                )
              ))}
              {typers[activeId] && typers[activeId].until > Date.now() && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 shadow-sm">
                    <span className="text-[11px] font-medium text-slate-500">{typers[activeId].name} is typing</span>
                    <span className="flex gap-0.5">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '0ms' }} />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '150ms' }} />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '300ms' }} />
                    </span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <form onSubmit={send} className="shrink-0 border-t border-slate-200 bg-white p-3">
              <div className="flex items-end gap-2">
                <textarea
                  value={text}
                  onChange={(e) => { setText(e.target.value); if (e.target.value.trim()) pingTyping(); else stopTyping() }}
                  onBlur={stopTyping}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e) } }}
                  rows={1}
                  placeholder={`Reply to ${active.name}...`}
                  className="nice-scroll max-h-32 flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:bg-white"
                />
                <button type="submit" disabled={sending || !text.trim()}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
                </button>
              </div>
              <div className="mt-1 px-1 text-[11px] text-slate-400">Enter to send · Shift+Enter for new line</div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
