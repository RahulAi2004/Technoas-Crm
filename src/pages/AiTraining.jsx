import { useEffect, useMemo, useState } from 'react'
import SidebarCrm from '../components/SidebarCrm.jsx'
import TopBarUser from '../components/TopBarUser.jsx'
import { useToast } from '../components/ToastContext.jsx'
import { api, getToken } from '../lib/api.js'

// Fields jo AI extract karta hai — select wale ke options, warna free text.
const FIELD_DEFS = [
  ['stage', 'Stage', ['New Inquiry', 'Qualification', 'Quote Sent', 'Order Confirmed', 'Won', 'Lost']],
  ['qualification', 'Qualification', ['Hot', 'Warm', 'Cold']],
  ['intent', 'Purchase Intent', ['High', 'Medium', 'Low']],
  ['product', 'Product', null],
  ['quantity', 'Quantity', null],
  ['budget', 'Budget', null],
  ['next_action', 'Next Action', null],
]
const INPUT = 'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100'
const initialsOf = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?'

export default function AiTraining() {
  const toast = useToast()
  const [convs, setConvs] = useState([])
  const [search, setSearch] = useState('')
  const [currentId, setCurrentId] = useState(null)
  const [msgs, setMsgs] = useState([])
  const [tab, setTab] = useState('reply')
  const [stats, setStats] = useState({ total: 0, byKind: {} })

  const [reply, setReply] = useState(''); const [replyLogic, setReplyLogic] = useState('')
  const [replyAi, setReplyAi] = useState(null); const [genLoading, setGenLoading] = useState(false)

  const [fields, setFields] = useState({}); const [fieldsLogic, setFieldsLogic] = useState('')
  const [fieldsAi, setFieldsAi] = useState(null); const [extractLoading, setExtractLoading] = useState(false)

  const loadStats = () => api.get('/api/ai-training/stats').then(setStats).catch(() => {})
  useEffect(() => { api.get('/api/conversations').then((r) => setConvs(Array.isArray(r) ? r : [])).catch(() => {}); loadStats() }, [])

  useEffect(() => {
    if (!currentId) { setMsgs([]); return }
    let cancel = false
    const load = () => api.get(`/api/conversations/${encodeURIComponent(currentId)}/messages`).then((r) => { if (!cancel) setMsgs(Array.isArray(r) ? r : []) }).catch(() => {})
    load()
    const t = setInterval(load, 6000)
    setReply(''); setReplyLogic(''); setReplyAi(null); setFields({}); setFieldsLogic(''); setFieldsAi(null)
    return () => { cancel = true; clearInterval(t) }
  }, [currentId])

  const sortedMsgs = useMemo(() => [...msgs].filter((m) => (m.dir || m.direction) !== 'note')
    .map((m, i) => ({ m, i, k: Number(m.ts) || Date.parse(m.created_at) || 0 }))
    .sort((a, b) => (a.k - b.k) || (a.i - b.i)).map(({ m }) => m), [msgs])

  const filteredConvs = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? convs.filter((c) => `${c.name || ''} ${c.list_preview || ''}`.toLowerCase().includes(q)) : convs
  }, [convs, search])

  const genReply = async () => {
    if (!currentId) return
    setGenLoading(true)
    try {
      const r = await api.post(`/api/ai-training/reply/${encodeURIComponent(currentId)}`, {})
      if (r.empty) { toast('Is chat me koi message nahi', 'info'); return }
      setReply(r.reply || ''); setReplyLogic(r.logic || ''); setReplyAi({ reply: r.reply || '', logic: r.logic || '' })
      if (r.trainedFrom) toast(`${r.trainedFrom} past corrections se seekha`, 'info')
    } catch (e) { toast(e.message || 'Failed', 'error') } finally { setGenLoading(false) }
  }
  const saveReply = async () => {
    try { await api.post('/api/ai-training/save', { conversationId: currentId, kind: 'reply', aiOutput: replyAi || {}, corrected: { reply, logic: replyLogic } }); toast('Correction saved — AI is se seekhega', 'success'); loadStats() }
    catch (e) { toast(e.message || 'Save failed', 'error') }
  }

  const doExtract = async () => {
    if (!currentId) return
    setExtractLoading(true)
    try {
      const r = await api.post(`/api/ai-training/extract/${encodeURIComponent(currentId)}`, {})
      if (r.empty) { toast('Is chat me koi message nahi', 'info'); return }
      setFields(r.fields || {}); setFieldsLogic(r.logic || ''); setFieldsAi({ fields: r.fields || {} })
      if (r.trainedFrom) toast(`${r.trainedFrom} past corrections se seekha`, 'info')
    } catch (e) { toast(e.message || 'Failed', 'error') } finally { setExtractLoading(false) }
  }
  const saveFields = async () => {
    try { await api.post('/api/ai-training/save', { conversationId: currentId, kind: 'fields', aiOutput: fieldsAi || {}, corrected: { fields } }); toast('Fields correction saved', 'success'); loadStats() }
    catch (e) { toast(e.message || 'Save failed', 'error') }
  }

  const dl = (fmt) => window.open(`/api/ai-training/export?format=${fmt}&t=${encodeURIComponent(getToken() || '')}`, '_blank')
  const currentConv = convs.find((c) => c.id === currentId)

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

        <main className="grid min-h-0 flex-1 grid-cols-[280px_1fr_400px] overflow-hidden">
          {/* Chat list */}
          <div className="flex min-h-0 flex-col border-r border-slate-200 bg-white">
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

          {/* Chat messages */}
          <div className="flex min-h-0 flex-col bg-slate-50/40">
            {!currentId ? (
              <div className="grid flex-1 place-items-center text-sm text-slate-400">Left se koi chat chuno — messages yahan aayenge</div>
            ) : (<>
              <div className="flex items-center gap-2.5 border-b border-slate-200 bg-white px-4 py-3">
                <span className={`grid h-9 w-9 place-items-center rounded-full ${currentConv?.avatar_bg || 'bg-slate-200'} text-xs font-bold`}>{initialsOf(currentConv?.name)}</span>
                <div><div className="text-sm font-bold">{currentConv?.name || 'Unknown'}</div><div className="text-xs text-slate-500">{currentConv?.channel || ''}</div></div>
              </div>
              <div className="nice-scroll min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
                {sortedMsgs.length === 0 && <div className="py-8 text-center text-sm text-slate-400">Koi message nahi</div>}
                {sortedMsgs.map((m, i) => {
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
              </div>
            </>)}
          </div>

          {/* AI Trainer panel */}
          <aside className="flex min-h-0 flex-col border-l border-slate-200 bg-white">
            <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white">🎓</span>
              <h3 className="text-sm font-bold">AI Trainer</h3>
              <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">learns from your fixes</span>
            </div>
            <nav className="flex items-center gap-4 border-b border-slate-200 px-4 text-[13px]">
              {[['reply', 'Reply + Logic'], ['fields', 'Extracted Fields']].map(([id, lbl]) => (
                <button key={id} onClick={() => setTab(id)} className={`border-b-2 py-2.5 ${tab === id ? 'border-brand-500 font-semibold text-brand-600' : 'border-transparent font-medium text-slate-500 hover:text-slate-700'}`}>{lbl}</button>
              ))}
            </nav>

            <div className="nice-scroll min-h-0 flex-1 overflow-y-auto p-4">
              {!currentId ? <div className="py-8 text-center text-sm text-slate-400">Pehle koi chat chuno</div> : tab === 'reply' ? (
                <div className="space-y-3">
                  <button onClick={genReply} disabled={genLoading} className="w-full rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">{genLoading ? 'Generating…' : replyAi ? '↻ Regenerate reply' : '✨ Generate recommended reply'}</button>
                  {replyAi && (<>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-600">Recommended Reply <span className="font-normal text-slate-400">(edit to correct)</span></label>
                      <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={5} className={INPUT} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-600">Logic / Reasoning <span className="font-normal text-slate-400">(kyun ye reply)</span></label>
                      <textarea value={replyLogic} onChange={(e) => setReplyLogic(e.target.value)} rows={3} className={INPUT} />
                    </div>
                    <button onClick={saveReply} className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">💾 Save correction (train AI)</button>
                    <p className="text-[11px] text-slate-400">Aap jo yahan edit karke save karoge, AI agli baar isi tarah reply karega + ye dataset me bhi save ho jayega.</p>
                  </>)}
                </div>
              ) : (
                <div className="space-y-3">
                  <button onClick={doExtract} disabled={extractLoading} className="w-full rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">{extractLoading ? 'Extracting…' : fieldsAi ? '↻ Re-extract fields' : '✨ Extract fields (stage, qualification…)'}</button>
                  {fieldsAi && (<>
                    {FIELD_DEFS.map(([key, label, opts]) => (
                      <div key={key}>
                        <label className="mb-1 block text-xs font-semibold text-slate-600">{label}</label>
                        {opts ? (
                          <select value={fields[key] || ''} onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))} className={INPUT}>
                            <option value="">—</option>{opts.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input value={fields[key] || ''} onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))} className={INPUT} />
                        )}
                      </div>
                    ))}
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-600">Logic / Reasoning</label>
                      <textarea value={fieldsLogic} onChange={(e) => setFieldsLogic(e.target.value)} rows={2} className={INPUT} />
                    </div>
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
