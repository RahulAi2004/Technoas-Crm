import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import TopBarUser from '../components/TopBarUser.jsx'
import BackButton from '../components/BackButton.jsx'
import { useToast } from '../components/ToastContext.jsx'
import { api } from '../lib/api.js'

export default function AiAssistant() {
  const toast = useToast()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [chats, setChats] = useState([])
  const [showHistory, setShowHistory] = useState(true)
  const endRef = useRef(null)
  const abortRef = useRef(null)
  const chatIdRef = useRef(null)   // current saved chat id

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, busy])
  const loadChats = () => api.get('/api/ai/chats').then(setChats).catch(() => {})
  useEffect(() => { loadChats() }, [])

  const persist = async (msgs) => {
    try {
      if (chatIdRef.current) {
        await api.put(`/api/ai/chats/${chatIdRef.current}`, { messages: msgs })
      } else {
        const c = await api.post('/api/ai/chats', { messages: msgs })
        chatIdRef.current = c.id
      }
      loadChats()
    } catch { /* non-fatal */ }
  }

  const send = async () => {
    const q = input.trim()
    if (!q || busy) return
    const next = [...messages, { role: 'user', content: q }]
    setMessages(next); setInput(''); setBusy(true)
    const ctrl = new AbortController(); abortRef.current = ctrl
    try {
      const r = await api.post('/api/ai/ask', { prompt: q, history: next.slice(-8) }, { signal: ctrl.signal })
      const withReply = [...next, { role: 'assistant', content: r.answer || '—', matched: r.matched }]
      setMessages(withReply); persist(withReply)
    } catch (ex) {
      const msg = ex.name === 'AbortError' ? { role: 'assistant', content: 'Stopped.', stopped: true } : { role: 'assistant', content: ex.message || 'Failed to answer', error: true }
      const withErr = [...next, msg]
      setMessages(withErr)
      if (ex.name !== 'AbortError') persist(withErr)
    } finally { setBusy(false); abortRef.current = null }
  }

  const stop = () => abortRef.current?.abort()
  const onKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }
  const newChat = () => { abortRef.current?.abort(); chatIdRef.current = null; setMessages([]); setInput('') }
  const openChat = async (id) => {
    try { const c = await api.get(`/api/ai/chats/${id}`); chatIdRef.current = c.id; setMessages(c.messages || []) }
    catch { toast('Could not open chat', 'error') }
  }
  const deleteChat = async (id, e) => {
    e.stopPropagation()
    try { await api.del(`/api/ai/chats/${id}`); if (chatIdRef.current === id) newChat(); loadChats() }
    catch { toast('Delete failed', 'error') }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* History sidebar */}
      {showHistory && (
        <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-3">
            <span className="text-sm font-bold">Chat history</span>
            <button onClick={newChat} className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">+ New</button>
          </div>
          <div className="nice-scroll flex-1 overflow-y-auto p-2">
            {chats.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-slate-400">No past chats yet.</p>
            ) : chats.map((c) => (
              <button key={c.id} onClick={() => openChat(c.id)} className={`group flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-slate-100 ${chatIdRef.current === c.id ? 'bg-brand-50' : ''}`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-slate-400"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <span className="min-w-0 flex-1 truncate text-slate-700">{c.title}</span>
                <span onClick={(e) => deleteChat(c.id, e)} className="hidden shrink-0 rounded p-0.5 text-slate-400 hover:text-rose-600 group-hover:block" title="Delete">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </span>
              </button>
            ))}
          </div>
        </aside>
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5">
          <div className="flex items-center gap-2">
            <button onClick={() => setShowHistory((s) => !s)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" title="Toggle history">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.7 9.7 0 0 0-6.7 2.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg>
            </button>
            <BackButton />
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white">✨</span>
              <div>
                <h1 className="text-lg font-extrabold leading-none tracking-tight">AI Assistant</h1>
                <p className="text-[11px] text-slate-500">Ask about customers, conversations & leads</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={newChat} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold hover:bg-slate-50">+ New chat</button>
            <Link to="/dashboard" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold hover:bg-slate-50">Inbox</Link>
            <TopBarUser />
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden px-4">
          {messages.length === 0 && !busy ? (
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <span className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-3xl text-white shadow-lg">✨</span>
              <h2 className="mt-5 text-2xl font-bold text-slate-800">CRM AI Assistant</h2>
              <p className="mt-2 max-w-md text-sm text-slate-500">Ask anything about your customers, conversations and leads. Enter a customer's name to view their full profile and chat history.</p>
            </div>
          ) : (
            <div className="nice-scroll flex-1 space-y-4 overflow-y-auto py-6">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {m.role === 'assistant' && <span className="mr-2 mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 text-xs text-white">✨</span>}
                  <div className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm shadow-sm ${m.role === 'user' ? 'rounded-tr-md bg-brand-600 text-white' : m.error ? 'rounded-tl-md bg-rose-50 text-rose-700 ring-1 ring-rose-200' : m.stopped ? 'rounded-tl-md bg-slate-100 italic text-slate-500' : 'rounded-tl-md bg-white text-slate-800 ring-1 ring-slate-100'}`}>
                    {m.content}
                    {m.matched?.length > 0 && <div className="mt-1.5 text-[11px] text-slate-400">📇 {m.matched.join(', ')}</div>}
                  </div>
                </div>
              ))}
              {busy && (
                <div className="flex justify-start">
                  <span className="mr-2 mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 text-xs text-white">✨</span>
                  <div className="flex items-center gap-1 rounded-2xl rounded-tl-md bg-white px-4 py-3 shadow-sm ring-1 ring-slate-100">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-slate-300" style={{ animationDelay: '0ms' }}></span>
                    <span className="h-2 w-2 animate-bounce rounded-full bg-slate-300" style={{ animationDelay: '150ms' }}></span>
                    <span className="h-2 w-2 animate-bounce rounded-full bg-slate-300" style={{ animationDelay: '300ms' }}></span>
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>
          )}

          <div className="mb-4 flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
            <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} rows={1} placeholder="Ask anything about your customers, chats or leads…"
              className="max-h-40 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none" />
            {busy ? (
              <button onClick={stop} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-rose-500 text-white hover:bg-rose-600" aria-label="Stop" title="Stop">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
              </button>
            ) : (
              <button onClick={send} disabled={!input.trim()} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50" aria-label="Send">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>
              </button>
            )}
          </div>
          <p className="mb-3 text-center text-[11px] text-slate-400">AI answers are based on your CRM data. Verify important details before acting.</p>
        </main>
      </div>
    </div>
  )
}
