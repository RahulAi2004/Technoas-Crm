import { useEffect, useMemo, useRef, useState } from 'react'
import SidebarCrm from '../components/SidebarCrm.jsx'
import TopBarUser from '../components/TopBarUser.jsx'
import { useToast } from '../components/ToastContext.jsx'
import { api, getToken } from '../lib/api.js'

// Fields in two tabs — select fields have options, others are free text.
const FIELD_GROUPS = {
  lead: { label: 'Lead Fields', fields: [
    ['stage', 'Stage', ['New Inquiry', 'Qualification', 'Quote Sent', 'Order Confirmed', 'Won', 'Lost']],
    ['qualification', 'Qualification', ['Hot', 'Warm', 'Cold']],
    ['intent', 'Purchase Intent', ['High', 'Medium', 'Low']],
  ] },
  order: { label: 'Order Fields', fields: [
    ['product', 'Product', null],
    ['quantity', 'Quantity', null],
    ['budget', 'Budget', null],
    ['next_action', 'Next Action', null],
  ] },
}
const INPUT = 'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100'
const initialsOf = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?'

function useWidth(key, initial, min, max, grows) {
  const [w, setW] = useState(() => Number(localStorage.getItem(key)) || initial)
  const start = (e) => {
    e.preventDefault()
    const x0 = e.clientX, w0 = w
    const move = (ev) => { const dx = ev.clientX - x0; const nw = Math.max(min, Math.min(max, grows === 'left' ? w0 + dx : w0 - dx)); setW(nw); localStorage.setItem(key, String(nw)) }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  return [w, start]
}

export default function AiTraining() {
  const toast = useToast()
  const [convs, setConvs] = useState([])
  const [search, setSearch] = useState('')
  const [currentId, setCurrentId] = useState(null)
  const [msgs, setMsgs] = useState([])
  const [tab, setTab] = useState('lead')
  const [stats, setStats] = useState({ total: 0, byKind: {} })
  const chatBottom = useRef(null)

  const [listW, startList] = useWidth('aiTrainListW', 280, 200, 480, 'left')
  const [panelW, startPanel] = useWidth('aiTrainPanelW', 400, 300, 720, 'right')

  // reply walkthrough (inline in chat)
  const [turn, setTurn] = useState(0)                 // which agent reply we're training
  const [reply, setReply] = useState(''); const [replyLogic, setReplyLogic] = useState('')
  const [replyAi, setReplyAi] = useState(null); const [genLoading, setGenLoading] = useState(false)
  const genRef = useRef('')

  // fields (lead/order tabs)
  const [fields, setFields] = useState({}); const [why, setWhy] = useState({})
  const [fieldsAi, setFieldsAi] = useState(null); const [extractLoading, setExtractLoading] = useState(false)

  const loadStats = () => api.get('/api/ai-training/stats').then(setStats).catch(() => {})
  useEffect(() => { api.get('/api/conversations').then((r) => setConvs(Array.isArray(r) ? r : [])).catch(() => {}); loadStats() }, [])

  useEffect(() => {
    if (!currentId) { setMsgs([]); return }
    let cancel = false
    const load = () => api.get(`/api/conversations/${encodeURIComponent(currentId)}/messages`).then((r) => { if (!cancel) setMsgs(Array.isArray(r) ? r : []) }).catch(() => {})
    load()
    const t = setInterval(load, 8000)
    setTurn(0); setReply(''); setReplyLogic(''); setReplyAi(null); setFields({}); setWhy({}); setFieldsAi(null); genRef.current = ''
    return () => { cancel = true; clearInterval(t) }
  }, [currentId])

  const sortedMsgs = useMemo(() => [...msgs].filter((m) => (m.dir || m.direction) !== 'note')
    .map((m, i) => ({ m, i, k: Number(m.ts) || Date.parse(m.created_at) || 0 }))
    .sort((a, b) => (a.k - b.k) || (a.i - b.i)).map(({ m }) => m), [msgs])

  const agentIdxs = useMemo(() => sortedMsgs.map((m, i) => ((m.dir || m.direction) === 'out' ? i : -1)).filter((i) => i >= 0), [sortedMsgs])
  const totalSteps = agentIdxs.length
  const done = turn >= totalSteps
  const pos = !done && totalSteps ? agentIdxs[turn] : -1                  // current agent reply being trained
  const revealCount = totalSteps ? (done ? sortedMsgs.length : pos + 1) : sortedMsgs.length
  const shownMsgs = sortedMsgs.slice(0, revealCount)

  const genReply = async (upto) => {
    if (!currentId) return
    setGenLoading(true)
    try {
      const r = await api.post(`/api/ai-training/reply/${encodeURIComponent(currentId)}`, { upto })
      if (r.empty) { setReply(''); setReplyLogic(''); setReplyAi({ reply: '', logic: '' }); return }
      setReply(r.reply || ''); setReplyLogic(r.logic || ''); setReplyAi({ reply: r.reply || '', logic: r.logic || '' })
    } catch (e) { toast(e.message || 'Failed', 'error') } finally { setGenLoading(false) }
  }
  // auto-generate a suggestion when a new turn is revealed
  useEffect(() => {
    if (!currentId || totalSteps === 0 || done || pos < 0) return
    const key = `${currentId}#${turn}`
    if (genRef.current === key) return
    genRef.current = key
    genReply(pos)
  }, [currentId, turn, totalSteps, done, pos])

  useEffect(() => { chatBottom.current?.scrollIntoView({ block: 'end' }) }, [revealCount, currentId, genLoading])

  const saveAndNext = async () => {
    try {
      await api.post('/api/ai-training/save', { conversationId: currentId, kind: 'reply', upto: pos, aiOutput: replyAi || {}, corrected: { reply, logic: replyLogic } })
      toast('Saved — the AI will learn from this next time', 'success'); loadStats()
    } catch (e) { toast(e.message || 'Save failed', 'error'); return }
    setReply(''); setReplyLogic(''); setReplyAi(null)
    setTurn((t) => Math.min(totalSteps, t + 1))
  }

  const filteredConvs = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? convs.filter((c) => `${c.name || ''} ${c.list_preview || ''}`.toLowerCase().includes(q)) : convs
  }, [convs, search])

  const doExtract = async () => {
    if (!currentId) return
    setExtractLoading(true)
    try {
      const r = await api.post(`/api/ai-training/extract/${encodeURIComponent(currentId)}`, {})
      if (r.empty) { toast('No messages in this chat', 'info'); return }
      setFields(r.fields || {}); setWhy(r.why || {}); setFieldsAi({ fields: r.fields || {}, why: r.why || {} })
      if (r.trainedFrom) toast(`Learned from ${r.trainedFrom} past corrections`, 'info')
    } catch (e) { toast(e.message || 'Failed', 'error') } finally { setExtractLoading(false) }
  }
  const saveFields = async () => {
    try { await api.post('/api/ai-training/save', { conversationId: currentId, kind: 'fields', aiOutput: fieldsAi || {}, corrected: { fields, why } }); toast('Fields correction saved', 'success'); loadStats() }
    catch (e) { toast(e.message || 'Save failed', 'error') }
  }

  const dl = (fmt) => window.open(`/api/ai-training/export?format=${fmt}&t=${encodeURIComponent(getToken() || '')}`, '_blank')
  const currentConv = convs.find((c) => c.id === currentId)
  const Handle = ({ onDown }) => <div onPointerDown={onDown} className="w-1.5 shrink-0 cursor-col-resize bg-slate-100 transition hover:bg-brand-300" />

  // Inline suggestion card shown right after the current agent reply
  const InlineCard = () => (
    <div className="my-1 ml-auto max-w-[85%] rounded-xl border-2 border-violet-200 bg-violet-50 p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wide text-violet-700">💡 AI recommends — edit to train</span>
        <button onClick={() => genReply(pos)} disabled={genLoading} className="text-xs font-semibold text-violet-600 hover:underline disabled:opacity-50">↻ Regenerate</button>
      </div>
      {genLoading && !replyAi ? <div className="py-3 text-center text-sm text-slate-400">Generating…</div> : (
        <>
          <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={4} placeholder="Recommended reply — fix it if wrong" className={INPUT} />
          <label className="mb-0.5 mt-2 block text-[11px] font-semibold text-slate-500">Logic — why this reply?</label>
          <textarea value={replyLogic} onChange={(e) => setReplyLogic(e.target.value)} rows={2} className={`${INPUT} bg-white text-xs`} />
          <button onClick={saveAndNext} className="mt-2 w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">✓ Save &amp; Next (reveal next messages)</button>
        </>
      )}
    </div>
  )

  return (
    <div className="crm-shell grid h-screen overflow-hidden">
      <SidebarCrm active="ai-training" />
      <div className="flex h-screen flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white">✨</span>
            <h1 className="text-lg font-bold">AI Training</h1>
            <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">{stats.total} corrections saved</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => dl('jsonl')} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50" title="Download JSONL (fine-tuning)">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>JSONL
            </button>
            <button onClick={() => dl('csv')} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50" title="Download CSV (Excel)">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>CSV
            </button>
            <TopBarUser role="Admin" />
          </div>
        </header>

        <main className="flex min-h-0 flex-1 overflow-hidden">
          {/* Chat list */}
          <div style={{ width: listW }} className="flex min-h-0 shrink-0 flex-col border-r border-slate-200 bg-white">
            <div className="border-b border-slate-200 p-2.5">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search chats…" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:bg-white" />
              <div className="mt-1 px-1 text-[11px] text-slate-400">{filteredConvs.length} conversations</div>
            </div>
            <div className="nice-scroll min-h-0 flex-1 overflow-y-auto">
              {filteredConvs.map((c) => (
                <button key={c.id} onClick={() => setCurrentId(c.id)} className={`flex w-full items-center gap-2.5 border-b border-slate-100 px-3 py-2.5 text-left ${c.id === currentId ? 'bg-brand-50' : 'hover:bg-slate-50'}`}>
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${c.avatar_bg || 'bg-slate-200'} text-xs font-bold`}>{initialsOf(c.name)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-800">{c.name || 'Unknown'}</span>
                    <span className="block truncate text-xs text-slate-500">{c.list_preview || ''}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
          <Handle onDown={startList} />

          {/* Chat + inline reply training (messages reveal progressively) */}
          <div className="flex min-h-0 flex-1 flex-col bg-slate-50/40">
            {!currentId ? (
              <div className="grid flex-1 place-items-center text-sm text-slate-400">Pick a chat on the left — messages will appear here</div>
            ) : (<>
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <span className={`grid h-9 w-9 place-items-center rounded-full ${currentConv?.avatar_bg || 'bg-slate-200'} text-xs font-bold`}>{initialsOf(currentConv?.name)}</span>
                  <div><div className="text-sm font-bold">{currentConv?.name || 'Unknown'}</div><div className="text-xs text-slate-500">{currentConv?.channel || ''}</div></div>
                </div>
                {totalSteps > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-700">Training turn {Math.min(turn + 1, totalSteps)} / {totalSteps}</span>
                    <button onClick={() => setTurn((t) => Math.max(0, t - 1))} disabled={turn === 0} className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-500 disabled:opacity-40 hover:bg-slate-50">‹ Prev</button>
                  </div>
                )}
              </div>
              <div className="nice-scroll min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
                {shownMsgs.length === 0 && <div className="py-8 text-center text-sm text-slate-400">No messages</div>}
                {shownMsgs.map((m, i) => {
                  const out = (m.dir || m.direction) === 'out'
                  return (
                    <div key={i}>
                      <div className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm ${out ? 'bg-brand-600 text-white' : 'bg-white text-slate-800 ring-1 ring-slate-200'}`}>
                          <div className={`mb-0.5 text-[10px] font-bold ${out ? 'text-white/70' : 'text-slate-400'}`}>{out ? (m.agent || 'Agent') : (currentConv?.name || 'Customer')}{out && i === pos ? ' · actual reply' : ''}</div>
                          <div className="whitespace-pre-wrap break-words">{m.text || (Array.isArray(m.attachments) && m.attachments.length ? '📎 Attachment' : '')}</div>
                          <div className={`mt-0.5 text-[10px] ${out ? 'text-white/60' : 'text-slate-400'}`}>{m.time || ''}</div>
                        </div>
                      </div>
                      {i === pos && <InlineCard />}
                    </div>
                  )
                })}
                {done && totalSteps > 0 && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-center text-sm font-semibold text-emerald-700">✓ You've trained the whole chat!
                    <button onClick={() => { setTurn(0); genRef.current = '' }} className="mt-2 block w-full rounded-md border border-emerald-300 bg-white px-2 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">↺ Restart from first reply</button>
                  </div>
                )}
                <div ref={chatBottom} />
              </div>
            </>)}
          </div>
          <Handle onDown={startPanel} />

          {/* Fields trainer panel */}
          <aside style={{ width: panelW }} className="flex min-h-0 shrink-0 flex-col border-l border-slate-200 bg-white">
            <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white">🎓</span>
              <h3 className="text-sm font-bold">Field Trainer</h3>
              <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">learns from your fixes</span>
            </div>
            <nav className="flex items-center gap-4 border-b border-slate-200 px-4 text-[13px]">
              {[['lead', 'Lead Fields'], ['order', 'Order Fields']].map(([id, lbl]) => (
                <button key={id} onClick={() => setTab(id)} className={`whitespace-nowrap border-b-2 py-2.5 ${tab === id ? 'border-brand-500 font-semibold text-brand-600' : 'border-transparent font-medium text-slate-500 hover:text-slate-700'}`}>{lbl}</button>
              ))}
            </nav>
            <div className="nice-scroll min-h-0 flex-1 overflow-y-auto p-4">
              {!currentId ? <div className="py-8 text-center text-sm text-slate-400">Select a chat first</div> : (
                <div className="space-y-3">
                  <button onClick={doExtract} disabled={extractLoading} className="w-full rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">{extractLoading ? 'Extracting…' : fieldsAi ? '↻ Re-extract fields' : '✨ Extract fields'}</button>
                  {fieldsAi && (<>
                    {FIELD_GROUPS[tab].fields.map(([key, label, opts]) => (
                      <div key={key} className="rounded-lg border border-slate-200 p-2.5">
                        <label className="mb-1 block text-xs font-semibold text-slate-600">{label}</label>
                        {opts ? (
                          <select value={fields[key] || ''} onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))} className={INPUT}>
                            <option value="">—</option>{opts.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input value={fields[key] || ''} onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))} className={INPUT} />
                        )}
                        <label className="mb-0.5 mt-1.5 block text-[11px] font-semibold text-slate-500">Why this? (logic)</label>
                        <textarea value={why[key] || ''} onChange={(e) => setWhy((w) => ({ ...w, [key]: e.target.value }))} rows={2} className={`${INPUT} bg-slate-50 text-xs`} />
                      </div>
                    ))}
                    <button onClick={saveFields} className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">💾 Save correction (train AI)</button>
                  </>)}
                </div>
              )}
            </div>
          </aside>
        </main>
      </div>
    </div>
  )
}
