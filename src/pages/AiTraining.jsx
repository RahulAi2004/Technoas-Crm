import { useEffect, useMemo, useRef, useState } from 'react'
import SidebarCrm from '../components/SidebarCrm.jsx'
import TopBarUser from '../components/TopBarUser.jsx'
import { useToast } from '../components/ToastContext.jsx'
import { api, getToken } from '../lib/api.js'

// Fields do groups (do tabs) mein — select wale ke options, warna free text.
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
const ALL_FIELD_KEYS = [...FIELD_GROUPS.lead.fields, ...FIELD_GROUPS.order.fields].map((f) => f[0])
const INPUT = 'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100'
const initialsOf = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?'

// Draggable width — list/panel resize; localStorage me persist.
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
  const [tab, setTab] = useState('reply')
  const [stats, setStats] = useState({ total: 0, byKind: {} })
  const chatBottom = useRef(null)

  const [listW, startList] = useWidth('aiTrainListW', 280, 200, 480, 'left')
  const [panelW, startPanel] = useWidth('aiTrainPanelW', 420, 320, 760, 'right')

  // walkthrough (reply tab)
  const [stepI, setStepI] = useState(0)
  const [reply, setReply] = useState(''); const [replyLogic, setReplyLogic] = useState('')
  const [replyAi, setReplyAi] = useState(null); const [genLoading, setGenLoading] = useState(false)

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
    const t = setInterval(load, 6000)
    setStepI(0); setReply(''); setReplyLogic(''); setReplyAi(null); setFields({}); setWhy({}); setFieldsAi(null)
    return () => { cancel = true; clearInterval(t) }
  }, [currentId])

  const sortedMsgs = useMemo(() => [...msgs].filter((m) => (m.dir || m.direction) !== 'note')
    .map((m, i) => ({ m, i, k: Number(m.ts) || Date.parse(m.created_at) || 0 }))
    .sort((a, b) => (a.k - b.k) || (a.i - b.i)).map(({ m }) => m), [msgs])

  const agentIdxs = useMemo(() => sortedMsgs.map((m, i) => ((m.dir || m.direction) === 'out' ? i : -1)).filter((i) => i >= 0), [sortedMsgs])
  const totalSteps = agentIdxs.length
  const stepPos = stepI < totalSteps ? agentIdxs[stepI] : sortedMsgs.length      // current agent reply ka index
  const revealCount = tab === 'reply' && totalSteps ? stepPos : sortedMsgs.length
  const shownMsgs = sortedMsgs.slice(0, revealCount)
  const actualReply = stepI < totalSteps ? sortedMsgs[stepPos] : null

  useEffect(() => { chatBottom.current?.scrollIntoView({ block: 'end' }) }, [revealCount, currentId])

  const filteredConvs = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? convs.filter((c) => `${c.name || ''} ${c.list_preview || ''}`.toLowerCase().includes(q)) : convs
  }, [convs, search])

  const genReply = async () => {
    if (!currentId) return
    setGenLoading(true)
    try {
      const r = await api.post(`/api/ai-training/reply/${encodeURIComponent(currentId)}`, { upto: stepPos })
      if (r.empty) { toast('No context up to this point', 'info'); return }
      setReply(r.reply || ''); setReplyLogic(r.logic || ''); setReplyAi({ reply: r.reply || '', logic: r.logic || '' })
      if (r.trainedFrom) toast(`Learned from ${r.trainedFrom} past corrections`, 'info')
    } catch (e) { toast(e.message || 'Failed', 'error') } finally { setGenLoading(false) }
  }
  const saveAndNext = async () => {
    try {
      await api.post('/api/ai-training/save', { conversationId: currentId, kind: 'reply', upto: stepPos, aiOutput: replyAi || {}, corrected: { reply, logic: replyLogic } })
      toast('Saved — the AI will learn from this next time', 'success'); loadStats()
    } catch (e) { toast(e.message || 'Save failed', 'error'); return }
    setReply(''); setReplyLogic(''); setReplyAi(null)
    setStepI((s) => Math.min(totalSteps, s + 1))      // reveal next messages
  }

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

          {/* Chat messages (walkthrough par incrementally reveal) */}
          <div className="flex min-h-0 flex-1 flex-col bg-slate-50/40">
            {!currentId ? (
              <div className="grid flex-1 place-items-center text-sm text-slate-400">Pick a chat on the left — messages will appear here</div>
            ) : (<>
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <span className={`grid h-9 w-9 place-items-center rounded-full ${currentConv?.avatar_bg || 'bg-slate-200'} text-xs font-bold`}>{initialsOf(currentConv?.name)}</span>
                  <div><div className="text-sm font-bold">{currentConv?.name || 'Unknown'}</div><div className="text-xs text-slate-500">{currentConv?.channel || ''}</div></div>
                </div>
                {tab === 'reply' && totalSteps > 0 && <span className="rounded-md bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-700">Walkthrough: step {Math.min(stepI + 1, totalSteps)} / {totalSteps}</span>}
              </div>
              <div className="nice-scroll min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
                {shownMsgs.length === 0 && <div className="py-8 text-center text-sm text-slate-400">{tab === 'reply' ? 'Conversation start — generate a reply in the panel' : 'No messages'}</div>}
                {shownMsgs.map((m, i) => {
                  const out = (m.dir || m.direction) === 'out'
                  return (
                    <div key={i} className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm ${out ? 'bg-brand-600 text-white' : 'bg-white text-slate-800 ring-1 ring-slate-200'}`}>
                        <div className={`mb-0.5 text-[10px] font-bold ${out ? 'text-white/70' : 'text-slate-400'}`}>{out ? (m.agent || 'Agent') : (currentConv?.name || 'Customer')}</div>
                        <div className="whitespace-pre-wrap break-words">{m.text || (Array.isArray(m.attachments) && m.attachments.length ? '📎 Attachment' : '')}</div>
                        <div className={`mt-0.5 text-[10px] ${out ? 'text-white/60' : 'text-slate-400'}`}>{m.time || ''}</div>
                      </div>
                    </div>
                  )
                })}
                {tab === 'reply' && actualReply && <div className="flex justify-end"><div className="max-w-[78%] rounded-2xl border-2 border-dashed border-violet-300 bg-violet-50 px-3 py-2 text-xs text-violet-600">↖ AI is training the reply for this turn (in the panel)</div></div>}
                <div ref={chatBottom} />
              </div>
            </>)}
          </div>
          <Handle onDown={startPanel} />

          {/* AI Trainer panel */}
          <aside style={{ width: panelW }} className="flex min-h-0 shrink-0 flex-col border-l border-slate-200 bg-white">
            <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white">🎓</span>
              <h3 className="text-sm font-bold">AI Trainer</h3>
              <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">learns from your fixes</span>
            </div>
            <nav className="flex items-center gap-4 border-b border-slate-200 px-4 text-[13px]">
              {[['reply', 'Reply + Logic'], ['lead', 'Lead Fields'], ['order', 'Order Fields']].map(([id, lbl]) => (
                <button key={id} onClick={() => setTab(id)} className={`whitespace-nowrap border-b-2 py-2.5 ${tab === id ? 'border-brand-500 font-semibold text-brand-600' : 'border-transparent font-medium text-slate-500 hover:text-slate-700'}`}>{lbl}</button>
              ))}
            </nav>

            <div className="nice-scroll min-h-0 flex-1 overflow-y-auto p-4">
              {!currentId ? <div className="py-8 text-center text-sm text-slate-400">Select a chat first</div>
                : tab === 'reply' ? (
                  <div className="space-y-3">
                    {stepI >= totalSteps && totalSteps > 0 ? (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-center text-sm font-semibold text-emerald-700">✓ You've walked through the whole chat!
                        <button onClick={() => setStepI(0)} className="mt-2 block w-full rounded-md border border-emerald-300 bg-white px-2 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">↺ Restart from first message</button>
                      </div>
                    ) : totalSteps === 0 ? (
                      <div className="text-center text-sm text-slate-400">This chat has no agent replies — the walkthrough needs agent replies.</div>
                    ) : (<>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Turn {stepI + 1} / {totalSteps}</span>
                        <div className="flex gap-1">
                          <button onClick={() => setStepI((s) => Math.max(0, s - 1))} disabled={stepI === 0} className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-500 disabled:opacity-40 hover:bg-slate-50">‹ Prev</button>
                        </div>
                      </div>
                      <button onClick={genReply} disabled={genLoading} className="w-full rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">{genLoading ? 'Generating…' : replyAi ? '↻ Regenerate' : '✨ Generate recommended reply'}</button>
                      {actualReply && (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">What the agent actually sent</div>
                          <div className="whitespace-pre-wrap text-sm text-slate-700">{actualReply.text || '—'}</div>
                        </div>
                      )}
                      {replyAi && (<>
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-slate-600">Recommended Reply <span className="font-normal text-slate-400">(fix it if wrong)</span></label>
                          <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={5} className={INPUT} />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-slate-600">Logic — why this reply?</label>
                          <textarea value={replyLogic} onChange={(e) => setReplyLogic(e.target.value)} rows={2} className={INPUT} />
                        </div>
                        <button onClick={saveAndNext} className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">✓ Confirm &amp; Next (reveal next messages)</button>
                        <p className="text-[11px] text-slate-400">On confirm, this correction is saved and the next few messages reveal in the chat.</p>
                      </>)}
                    </>)}
                  </div>
                ) : (
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
