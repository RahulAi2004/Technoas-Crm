import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api.js'

// Flag ke rang — Tailwind classes (light bg + dark text + dot).
export const FLAG_COLORS = {
  rose:    { chip: 'bg-rose-50 text-rose-700 ring-rose-200',       dot: 'bg-rose-500' },
  amber:   { chip: 'bg-amber-50 text-amber-700 ring-amber-200',    dot: 'bg-amber-500' },
  emerald: { chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
  sky:     { chip: 'bg-sky-50 text-sky-700 ring-sky-200',          dot: 'bg-sky-500' },
  violet:  { chip: 'bg-violet-50 text-violet-700 ring-violet-200', dot: 'bg-violet-500' },
  fuchsia: { chip: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200', dot: 'bg-fuchsia-500' },
  slate:   { chip: 'bg-slate-100 text-slate-700 ring-slate-200',   dot: 'bg-slate-500' },
}
export const FLAG_COLOR_KEYS = Object.keys(FLAG_COLORS)
const colorOf = (c) => FLAG_COLORS[c] || FLAG_COLORS.slate

// chhota rangeen badge
export function FlagChip({ flag, onRemove }) {
  const c = colorOf(flag.color)
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${c.chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {flag.name}
      {onRemove && (
        <button onClick={(e) => { e.stopPropagation(); onRemove(flag.id) }} className="ml-0.5 opacity-60 hover:opacity-100" aria-label="Remove">×</button>
      )}
    </span>
  )
}

// Row ke andar: lage hue flags + "＋" se assign/remove dropdown.
export function FlagBadges({ allFlags, value = [], onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  const set = new Set(value)
  const assigned = allFlags.filter((f) => set.has(f.id))
  const toggle = (id) => onChange(set.has(id) ? value.filter((x) => x !== id) : [...value, id])

  return (
    <div className="relative flex flex-wrap items-center gap-1" ref={ref} onClick={(e) => e.stopPropagation()}>
      {assigned.map((f) => <FlagChip key={f.id} flag={f} onRemove={toggle} />)}
      <button onClick={() => setOpen((o) => !o)} className="grid h-5 w-5 place-items-center rounded-md border border-dashed border-slate-300 text-slate-400 hover:border-brand-400 hover:text-brand-600" aria-label="Add flag">+</button>
      {open && (
        <div className="absolute left-0 top-6 z-20 w-48 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
          {allFlags.length === 0 && <div className="px-2 py-1.5 text-xs text-slate-400">No tags — create one via "Manage Flags" above</div>}
          {allFlags.map((f) => {
            const on = set.has(f.id); const c = colorOf(f.color)
            return (
              <button key={f.id} onClick={() => toggle(f.id)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-slate-50">
                <span className={`h-2 w-2 rounded-full ${c.dot}`} />
                <span className="flex-1 text-left">{f.name}</span>
                {on && <span className="text-brand-600">✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// "Manage Flags" modal — naya flag banao (naam + rang), purane hatao.
export function ManageFlagsModal({ flags, onClose, onChanged }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('sky')
  const [busy, setBusy] = useState(false)

  const create = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    try { await api.post('/api/flags', { name: name.trim(), color }); setName(''); await onChanged() }
    finally { setBusy(false) }
  }
  const del = async (id) => { await api.del(`/api/flags/${id}`); await onChanged() }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">Manage Flags</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100">×</button>
        </div>

        <div className="mb-4 rounded-lg border border-slate-200 p-3">
          <label className="mb-1 block text-xs font-semibold text-slate-500">New tag name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()}
            placeholder="e.g. VIP, Reseller, Follow-up" className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500" />
          <div className="mb-3 flex items-center gap-1.5">
            {FLAG_COLOR_KEYS.map((k) => (
              <button key={k} onClick={() => setColor(k)} className={`h-6 w-6 rounded-full ${colorOf(k).dot} ${color === k ? 'ring-2 ring-offset-2 ring-slate-400' : ''}`} aria-label={k} />
            ))}
          </div>
          <button onClick={create} disabled={!name.trim() || busy} className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {busy ? 'Adding…' : '+ Add Flag'}
          </button>
        </div>

        <div className="max-h-56 overflow-y-auto">
          <div className="mb-1 text-xs font-semibold text-slate-500">Existing tags ({flags.length})</div>
          {flags.length === 0 && <div className="py-3 text-center text-sm text-slate-400">No tags yet</div>}
          {flags.map((f) => (
            <div key={f.id} className="flex items-center justify-between rounded-lg px-1 py-1.5 hover:bg-slate-50">
              <FlagChip flag={f} />
              <button onClick={() => del(f.id)} className="rounded px-2 py-0.5 text-xs font-semibold text-rose-600 hover:bg-rose-50">Delete</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
