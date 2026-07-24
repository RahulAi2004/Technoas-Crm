import { useEffect, useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { isAuthed, signIn, signInWithSso } from '../lib/auth.js'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const dest = location.state?.from?.pathname || '/dashboard'
  const [email, setEmail] = useState(location.state?.email || 'info@technocas.com')
  const [pw, setPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [remember, setRemember] = useState(true)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (isAuthed()) {
      navigate(dest, { replace: true })
      return
    }
    let active = true
    signInWithSso()
      .then(() => { if (active) navigate(dest, { replace: true }) })
      .catch(() => {})
    return () => { active = false }
  }, [navigate, dest])

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    const e2 = email.trim().toLowerCase()
    if (!e2 || !pw) { setErr('Please enter both email and password.'); return }
    setBusy(true)
    try {
      await signIn(e2, pw, remember)
      navigate(dest, { replace: true })
    } catch (ex) {
      setErr(ex.message || 'Invalid email or password.')
      setPw('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      {/* Left: brand panel */}
      <section className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 text-white p-12">
        <div className="flex items-center gap-3">
          <img src="/logo.jpg" alt="Decoinks CRM" className="h-11 rounded-lg bg-white px-2.5 py-1 shadow-lg" />
        </div>

        <div className="space-y-6">
          <h1 className="text-6xl font-black leading-[0.95]">
            Manage.<br/>Engage.<br/><span className="text-brand-500">Convert.</span>
          </h1>
          <p className="max-w-md text-slate-300">
            One workspace for every customer conversation, lead and task — across WhatsApp, Instagram, Email and more.
          </p>
          <ul className="space-y-2 text-sm text-slate-300">
            <li className="flex items-center gap-2"><span className="grid h-5 w-5 place-items-center rounded-full bg-brand-500/20 text-brand-500">✓</span> Unified inbox across every channel</li>
            <li className="flex items-center gap-2"><span className="grid h-5 w-5 place-items-center rounded-full bg-brand-500/20 text-brand-500">✓</span> AI Supervisor for smarter replies</li>
            <li className="flex items-center gap-2"><span className="grid h-5 w-5 place-items-center rounded-full bg-brand-500/20 text-brand-500">✓</span> Lead tracking from first touch to close</li>
          </ul>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="h-2 w-2 rounded-full bg-brand-500"></span>
          Secure workspace · v1.0
        </div>

        <div className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-brand-700/20 blur-3xl"></div>
        <div className="pointer-events-none absolute -top-24 -right-16 h-72 w-72 rounded-full bg-brand-500/10 blur-3xl"></div>
      </section>

      {/* Right: form */}
      <section className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8 flex items-center gap-3">
            <img src="/logo.jpg" alt="Decoinks CRM" className="h-10 rounded-lg" />
          </div>

          <h2 className="text-4xl font-extrabold tracking-tight">Welcome back</h2>
          <p className="mt-2 text-slate-500">Sign in to your Decoinks CRM account to continue.</p>

          <form onSubmit={submit} className="mt-6 space-y-5" noValidate>
            {err && (
              <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>{err}</span>
              </div>
            )}

            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-semibold">Email address</label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 grid place-items-center pl-3 text-slate-400">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                </span>
                <input id="email" type="email" required autoComplete="off"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="info@technocas.com"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm outline-none ring-0 transition focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20" />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-semibold">Password</label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 grid place-items-center pl-3 text-slate-400">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </span>
                <input id="password" type={showPw ? 'text' : 'password'} required autoComplete="off"
                  value={pw} onChange={(e) => setPw(e.target.value)}
                  placeholder="Your password"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-10 text-sm outline-none transition focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20" />
                <button type="button" onClick={() => setShowPw(s => !s)}
                  className="absolute inset-y-0 right-0 grid place-items-center pr-3 text-slate-400 hover:text-slate-600"
                  aria-label={showPw ? 'Hide password' : 'Show password'}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="inline-flex items-center gap-2 select-none">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                <span className="text-slate-600">Remember me</span>
              </label>
              <a href="#" onClick={(e) => e.preventDefault()} className="font-semibold text-brand-600 hover:text-brand-700">Forgot password?</a>
            </div>

            <button type="submit" disabled={busy} className="w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-600/20 transition hover:bg-brand-700 active:scale-[0.99] disabled:opacity-60">
              {busy ? 'Signing in...' : 'Log in'}
            </button>

            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200"></div></div>
              <div className="relative flex justify-center"><span className="bg-white px-3 text-xs font-semibold text-slate-400">OR</span></div>
            </div>

            <button type="button" className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
              <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35.5 24 35.5c-6.4 0-11.6-5.2-11.6-11.5S17.6 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.7 6.5 29.1 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5c10.8 0 19.5-8.7 19.5-19.5 0-1.2-.1-2.3-.3-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.7 6.5 29.1 4.5 24 4.5c-7.5 0-13.9 4.2-17.7 10.2z"/><path fill="#4CAF50" d="M24 43.5c5 0 9.5-1.9 12.9-5l-6-5.1c-1.9 1.4-4.3 2.2-6.9 2.2-5.2 0-9.6-3.1-11.3-7.4l-6.6 5.1C9.9 39.2 16.4 43.5 24 43.5z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.4 4.3-4.4 5.6l6 5.1c-.4.4 6.6-4.8 6.6-14.7 0-1.2-.1-2.3-.3-3.5z"/></svg>
              Sign in with Google
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-600">New agent? <Link to="/create-account" className="font-semibold text-brand-600 hover:text-brand-700">Create an account</Link></p>
          <p className="mt-3 text-center text-xs text-slate-500">Protected by Decoinks · By signing in you accept our Terms of Service.</p>
        </div>
      </section>
    </main>
  )
}
