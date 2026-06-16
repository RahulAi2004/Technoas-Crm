import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'

export default function CreateAccount() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [showPw, setShowPw] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)   // created account (name/email) on success

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    const name = form.name.trim(); const email = form.email.trim().toLowerCase()
    if (!name || !email || !form.password) { setErr('Please fill name, email and password.'); return }
    if (form.password.length < 6) { setErr('Password must be at least 6 characters.'); return }
    if (form.password !== form.confirm) { setErr('Passwords do not match.'); return }
    setBusy(true)
    try {
      await api.post('/api/auth/register', { name, email, password: form.password })
      setDone({ name, email })
      setForm({ name: '', email: '', password: '', confirm: '' })
    } catch (ex) {
      setErr(ex.message || 'Could not create account.')
    } finally { setBusy(false) }
  }

  const field = 'w-full rounded-xl border border-slate-200 bg-slate-50 py-3 px-3 text-sm outline-none transition focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20'

  return (
    <main className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      {/* Left brand panel */}
      <section className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 text-white p-12">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-lg"><span className="text-lg font-black">T</span></div>
          <span className="text-xl font-bold tracking-tight">Technocas CRM</span>
        </div>
        <div className="space-y-6">
          <h1 className="text-6xl font-black leading-[0.95]">Create your<br/><span className="text-brand-500">agent account.</span></h1>
          <p className="max-w-md text-slate-300">Each agent gets their own login. Reply to customers together from one shared inbox — every message shows who handled it.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400"><span className="h-2 w-2 rounded-full bg-brand-500"></span> Secure workspace · v1.0</div>
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-brand-700/20 blur-3xl"></div>
      </section>

      {/* Right form */}
      <section className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8 flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg"><span className="text-lg font-black">T</span></div>
            <span className="text-xl font-bold tracking-tight">Technocas CRM</span>
          </div>

          {done ? (
            <div>
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-50 text-2xl">✅</div>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight">Account created</h2>
              <p className="mt-2 text-slate-600"><b>{done.name}</b> ({done.email}) can now log in as an agent.</p>
              <div className="mt-6 flex flex-col gap-2">
                <button onClick={() => navigate('/', { state: { email: done.email } })} className="w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-600/20 hover:bg-brand-700">Go to Login</button>
                <button onClick={() => setDone(null)} className="w-full rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">Create another account</button>
              </div>
            </div>
          ) : (
            <>
              <h2 className="text-4xl font-extrabold tracking-tight">Create account</h2>
              <p className="mt-2 text-slate-500">Set up a new agent login for the shared inbox.</p>

              <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
                {err && (
                  <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <span>{err}</span>
                  </div>
                )}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold">Full name</label>
                  <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Ali Khan" autoComplete="off" className={field} />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold">Email address</label>
                  <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="agent@technocas.com" autoComplete="off" className={field} />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold">Password</label>
                  <div className="relative">
                    <input type={showPw ? 'text' : 'password'} value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="At least 6 characters" autoComplete="new-password" className={`${field} pr-10`} />
                    <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute inset-y-0 right-0 grid place-items-center pr-3 text-slate-400 hover:text-slate-600" aria-label="Toggle password">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold">Confirm password</label>
                  <input type={showPw ? 'text' : 'password'} value={form.confirm} onChange={(e) => set('confirm', e.target.value)} placeholder="Re-enter password" autoComplete="new-password" className={field} />
                </div>
                <button type="submit" disabled={busy} className="w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-600/20 transition hover:bg-brand-700 active:scale-[0.99] disabled:opacity-60">
                  {busy ? 'Creating…' : 'Create account'}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-slate-600">Already have an account? <Link to="/" className="font-semibold text-brand-600 hover:text-brand-700">Log in</Link></p>
            </>
          )}
        </div>
      </section>
    </main>
  )
}
