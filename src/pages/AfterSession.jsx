import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import TopBarUser from '../components/TopBarUser.jsx'
import BackButton from '../components/BackButton.jsx'
import { useToast } from '../components/ToastContext.jsx'
import { api } from '../lib/api.js'

// Fields the agent fills end-of-session, grouped by section (maps to DB tables).
const SECTIONS = [
  { title: 'Lead Intelligence', fields: [
    { key: 'intent_score', label: 'Intent score (0-100)', type: 'number' },
    { key: 'purchase_probability', label: 'Purchase probability (0-100)', type: 'number' },
    { key: 'lead_summary', label: 'Lead summary', type: 'area' },
    { key: 'profile_summary', label: 'Profile summary', type: 'area' },
    { key: 'ai_observations', label: 'AI observations', type: 'area' },
  ] },
  { title: 'Conversation', fields: [
    { key: 'sentiment_score', label: 'Sentiment score (0-100)', type: 'number' },
    { key: 'conversation_summary', label: 'Conversation summary', type: 'area' },
    { key: 'conversation_insights', label: 'Conversation insights', type: 'area' },
  ] },
  { title: 'Requirements', fields: [
    { key: 'need', label: 'Need (products)', type: 'text' },
    { key: 'quantity', label: 'Quantity', type: 'text' },
    { key: 'requirement_summary', label: 'Requirement summary', type: 'area' },
    { key: 'missing_information', label: 'Missing information', type: 'area' },
  ] },
  { title: 'Artwork', fields: [
    { key: 'artwork_analysis', label: 'Artwork analysis', type: 'area' },
    { key: 'reconstruction_notes', label: 'Reconstruction notes', type: 'area' },
    { key: 'design_notes', label: 'Design notes', type: 'area' },
    { key: 'complexity_score', label: 'Complexity score (0-100)', type: 'number' },
  ] },
  { title: 'Stage', fields: [
    { key: 'transition_reason', label: 'Transition reason / status', type: 'area' },
  ] },
]
const today = () => new Date().toISOString().slice(0, 10)

export default function AfterSession() {
  const toast = useToast()
  const [date, setDate] = useState(today())
  const [clients, setClients] = useState([])
  const [sel, setSel] = useState(null)         // selected client id
  const [name, setName] = useState('')
  const [values, setValues] = useState({})
  const [rec, setRec] = useState({})           // AI recommended
  const [verdicts, setVerdicts] = useState({}) // validate results
  const [busy, setBusy] = useState('')         // '', 'recommend', 'validate', 'save'
  const abortRef = useRef(null)

  const loadClients = (d) => api.get(`/api/after-session/clients?date=${d}`).then((r) => setClients(r.clients || [])).catch(() => setClients([]))
  useEffect(() => { loadClients(date) }, [date])

  const openClient = async (id) => {
    setSel(id); setRec({}); setVerdicts({}); setValues({}); setName('')
    try { const r = await api.get(`/api/after-session/client/${id}`); setName(r.name || id); setValues(r.values || {}) }
    catch { toast('Could not load client', 'error') }
  }
  const setV = (k, val) => setValues((v) => ({ ...v, [k]: val }))

  const recommend = async () => {
    if (!sel) return
    setBusy('recommend')
    try { const r = await api.post(`/api/after-session/recommend/${sel}`); setRec(r.recommended || {}); toast('AI filled recommendations', 'success') }
    catch (e) { toast(e.message || 'Recommend failed', 'error') } finally { setBusy('') }
  }
  const useAll = () => setValues((v) => ({ ...v, ...Object.fromEntries(Object.entries(rec).filter(([, x]) => x !== '' && x != null)) }))
  const validate = async () => {
    if (!sel) return
    setBusy('validate'); setVerdicts({})
    try { const r = await api.post(`/api/after-session/validate/${sel}`, { values }); setVerdicts(r.verdicts || {}); toast('AI validated the entries', 'success') }
    catch (e) { toast(e.message || 'Validate failed', 'error') } finally { setBusy('') }
  }
  const save = async () => {
    if (!sel) return
    setBusy('save')
    try { await api.post(`/api/after-session/save/${sel}`, { values }); toast('Saved to database ✓', 'success'); loadClients(date) }
    catch (e) { toast(e.message || 'Save failed', 'error') } finally { setBusy('') }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Clients sidebar */}
      <aside className="flex w-72 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-3 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-bold">Today's Clients</span>
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">{clients.length}</span>
          </div>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-brand-400" />
        </div>
        <div className="nice-scroll flex-1 overflow-y-auto p-2">
          {clients.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-slate-400">No clients for this date. Pick another day.</p>
          ) : clients.map((c) => (
            <button key={c.id} onClick={() => openClient(c.id)} className={`group flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-slate-100 ${sel === c.id ? 'bg-brand-50 ring-1 ring-brand-200' : ''}`}>
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{(c.name || '?').slice(0, 2).toUpperCase()}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-slate-700">{c.name || c.id}</span>
                <span className="block truncate text-[11px] text-slate-400">{c.channel || '-'}{c.need ? ` · ${c.need}` : ''}</span>
              </span>
              {c.saved && <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">saved</span>}
            </button>
          ))}
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5">
          <div className="flex items-center gap-2">
            <BackButton />
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white">📋</span>
            <div>
              <h1 className="text-lg font-extrabold leading-none tracking-tight">After Session</h1>
              <p className="text-[11px] text-slate-500">End-of-session client details · AI recommend + validate + save</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/ai-assistant" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold hover:bg-slate-50">AI Prompting</Link>
            <Link to="/dashboard" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold hover:bg-slate-50">Inbox</Link>
            <TopBarUser />
          </div>
        </header>

        {!sel ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center text-slate-400">
            <span className="text-4xl">🗂️</span>
            <p className="mt-3 max-w-sm text-sm">Select a client from the left. AI auto-fills name/need/quantity; you complete the rest, get AI recommendations, validate, and save to the database.</p>
          </div>
        ) : (
          <main className="nice-scroll flex-1 overflow-y-auto px-6 py-5">
            <div className="mx-auto max-w-3xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold">{name}</h2>
                <div className="flex items-center gap-2">
                  <button onClick={recommend} disabled={!!busy} className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">{busy === 'recommend' ? 'Thinking…' : '✨ AI Recommend'}</button>
                  {Object.keys(rec).length > 0 && <button onClick={useAll} className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-semibold text-violet-700 hover:bg-violet-100">Use all</button>}
                  <button onClick={validate} disabled={!!busy} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50">{busy === 'validate' ? 'Checking…' : '✓ Validate'}</button>
                  <button onClick={save} disabled={!!busy} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{busy === 'save' ? 'Saving…' : 'Save'}</button>
                </div>
              </div>

              {SECTIONS.map((sec) => (
                <div key={sec.title} className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
                  <h3 className="mb-3 text-sm font-bold text-slate-700">{sec.title}</h3>
                  <div className="space-y-4">
                    {sec.fields.map((f) => {
                      const verdict = verdicts[f.key]
                      const recVal = rec[f.key]
                      const hasRec = recVal !== undefined && recVal !== '' && recVal != null && String(recVal) !== String(values[f.key] ?? '')
                      return (
                        <div key={f.key}>
                          <div className="mb-1 flex items-center justify-between">
                            <label className="text-xs font-semibold text-slate-600">{f.label}</label>
                            {verdict && (
                              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${verdict.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                {verdict.ok ? '✓ looks right' : `✗ ${verdict.note || 'check this'}`}
                              </span>
                            )}
                          </div>
                          {f.type === 'area' ? (
                            <textarea value={values[f.key] ?? ''} onChange={(e) => setV(f.key, e.target.value)} rows={2}
                              className={`w-full resize-y rounded-lg border px-3 py-2 text-sm outline-none focus:border-brand-400 ${verdict && !verdict.ok ? 'border-rose-300' : 'border-slate-200'}`} />
                          ) : (
                            <input type={f.type} value={values[f.key] ?? ''} onChange={(e) => setV(f.key, e.target.value)}
                              className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-brand-400 ${verdict && !verdict.ok ? 'border-rose-300' : 'border-slate-200'}`} />
                          )}
                          {hasRec && (
                            <button onClick={() => setV(f.key, recVal)} className="mt-1 inline-flex items-center gap-1 rounded-md bg-violet-50 px-2 py-0.5 text-[11px] text-violet-700 hover:bg-violet-100">
                              ✨ AI: <span className="max-w-[420px] truncate">{String(recVal)}</span> <span className="font-semibold">— use</span>
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </main>
        )}
      </div>
    </div>
  )
}
