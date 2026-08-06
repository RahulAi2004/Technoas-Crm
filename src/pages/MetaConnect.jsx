import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import SidebarCrm from '../components/SidebarCrm.jsx'
import TopBarUser from '../components/TopBarUser.jsx'
import BackButton from '../components/BackButton.jsx'
import { useToast } from '../components/ToastContext.jsx'
import { api } from '../lib/api.js'

const FB_SCOPE = 'pages_show_list,pages_messaging,pages_read_engagement,instagram_basic,instagram_manage_messages,business_management'
function loadFacebookSDK(appId) {
  return new Promise((resolve, reject) => {
    const init = () => { try { window.FB.init({ appId, version: 'v21.0', cookie: true, xfbml: false }); resolve(window.FB) } catch (e) { reject(e) } }
    if (window.FB) return init()
    window.fbAsyncInit = init
    if (!document.getElementById('facebook-jssdk')) {
      const s = document.createElement('script')
      s.id = 'facebook-jssdk'; s.src = 'https://connect.facebook.net/en_US/sdk.js'; s.async = true; s.defer = true
      s.onerror = () => reject(new Error('Could not load Facebook SDK'))
      document.body.appendChild(s)
    }
  })
}

export default function MetaConnect() {
  const toast = useToast()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const connectCh = params.get('connect')   // 'facebook' | 'instagram' | 'whatsapp'
  const channelTitle = connectCh === 'facebook' ? 'Connect Facebook Messenger' : connectCh === 'instagram' ? 'Connect Instagram' : 'Connect Meta'
  const [status, setStatus] = useState(null)
  const [appId, setAppId] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  const refresh = () => api.get('/api/meta/status').then(setStatus).catch(() => setStatus({ connected: false }))
  useEffect(() => { refresh() }, [])

  // "Continue with Facebook" — OAuth via FB JS SDK, then connect with the granted token.
  const continueWithFacebook = async () => {
    if (!appId.trim() || !appSecret.trim()) { toast('Enter your App ID and App Secret first (the token will come from Facebook)', 'error'); return }
    setBusy(true); setResult(null)
    try {
      const FB = await loadFacebookSDK(appId.trim())
      FB.login((resp) => {
        if (resp.status === 'connected' && resp.authResponse?.accessToken) {
          ;(async () => {
            try {
              const r = await api.post('/api/meta/connect-app', { appId: appId.trim(), appSecret: appSecret.trim(), token: resp.authResponse.accessToken })
              const sync = await api.post('/api/meta/sync').catch(() => ({}))
              setResult({ ok: true, page: r.page, instagram: r.instagram, synced: sync?.newMessages, neverExpires: r.neverExpires })
              toast(`Connected: ${r.page?.name || 'Page'} ✅`, 'success')
              setToken(''); setAppSecret(''); refresh()
            } catch (ex) { setResult({ ok: false, error: ex.message }); toast(ex.message || 'Connect failed', 'error') } finally { setBusy(false) }
          })()
        } else { toast('Facebook login cancelled', 'info'); setBusy(false) }
      }, { scope: FB_SCOPE, return_scopes: true })
    } catch (ex) { toast(ex.message || 'Could not load Facebook', 'error'); setBusy(false) }
  }

  const connect = async (e) => {
    e.preventDefault()
    if (!appId.trim() || !appSecret.trim() || !token.trim()) {
      toast('App ID, App Secret and Access Token are all required', 'error'); return
    }
    setBusy(true); setResult(null)
    try {
      const r = await api.post('/api/meta/connect-app', {
        appId: appId.trim(), appSecret: appSecret.trim(), token: token.trim(),
      })
      const sync = await api.post('/api/meta/sync').catch(() => ({}))
      setResult({ ok: true, page: r.page, instagram: r.instagram, synced: sync?.newMessages, warning: r.warning, neverExpires: r.neverExpires })
      toast(r.neverExpires ? `Connected: ${r.page?.name || 'Page'} — permanent ✅` : `Connected, but token is temporary ⚠`, r.neverExpires ? 'success' : 'info')
      setToken(''); setAppSecret('')
      refresh()
    } catch (ex) {
      setResult({ ok: false, error: ex.message })
      toast(ex.message || 'Connect failed', 'error')
    } finally { setBusy(false) }
  }

  const disconnect = async () => {
    if (!confirm('Disconnect Meta? App credentials and token will be removed.')) return
    await api.post('/api/meta/disconnect')
    toast('Meta disconnected', 'info')
    setResult(null)
    refresh()
  }

  const field = 'w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-mono outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20'

  return (
    <div className="crm-shell h-screen overflow-hidden grid">
      <SidebarCrm active="connect-meta" />
      <div className="flex h-screen flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 sm:px-6">
          <div className="flex items-center gap-3">
            <BackButton />
            <nav className="flex items-center gap-2 text-sm">
              <Link to="/settings" className="text-slate-500 hover:text-slate-700">Settings</Link>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-300"><path d="m9 18 6-6-6-6"/></svg>
              <span className="font-semibold">Connect Meta</span>
            </nav>
          </div>
          <div className="flex items-center gap-3"><TopBarUser /></div>
        </header>

        <main className="nice-scroll flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-3xl">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-xl font-bold">f</div>
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight">{channelTitle}</h1>
                <p className="text-sm text-slate-500">Facebook Messenger &amp; Instagram DMs — connect once and the token never expires.</p>
              </div>
            </div>

            {/* Connected state */}
            {status?.connected ? (
              <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">● Connected</span>
                      {status.tokenExpires === 0
                        ? <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700">♾ Never expires</span>
                        : status.tokenExpires
                          ? <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${status.tokenExpires < Date.now() ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                              {status.tokenExpires < Date.now() ? '⚠ Token EXPIRED — reconnect' : `⏳ Expires ${new Date(status.tokenExpires).toLocaleString()}`}
                            </span>
                          : <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">Lifetime unknown</span>}
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="rounded-lg bg-white p-3"><div className="text-[11px] text-slate-500">Page</div><div className="text-sm font-semibold">{status.pageName || '—'}</div></div>
                      <div className="rounded-lg bg-white p-3"><div className="text-[11px] text-slate-500">Page ID</div><div className="font-mono text-sm">{status.pageId || '—'}</div></div>
                      <div className="rounded-lg bg-white p-3"><div className="text-[11px] text-slate-500">Instagram</div><div className="text-sm font-semibold">{status.instagram?.username ? `@${status.instagram.username}` : '— (not linked)'}</div></div>
                    </div>
                  </div>
                  <button onClick={disconnect} className="shrink-0 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50">Disconnect</button>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <button onClick={() => navigate('/inbox')} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">Open Inbox →</button>
                  <button onClick={async () => { const r = await api.post('/api/meta/sync').catch(() => null); toast(r ? `Synced (${r.newMessages ?? 0} new)` : 'Sync failed', r ? 'success' : 'error') }} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50">Sync now</button>
                </div>
              </section>
            ) : (
              <>
                {/* Form */}
                <form onSubmit={connect} className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">1 · App ID</label>
                    <input value={appId} onChange={(e) => setAppId(e.target.value)} placeholder="e.g. 1234567890123456" className={field} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">2 · App Secret</label>
                    <input type="password" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} placeholder="App Secret (Settings → Basic → Show)" className={field} />
                  </div>

                  {/* One-click Facebook OAuth */}
                  <button type="button" onClick={continueWithFacebook} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#1877F2] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#166fe0] disabled:opacity-60">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"/></svg>
                    {busy ? 'Connecting…' : 'Continue with Facebook'}
                  </button>
                  <p className="text-[11px] text-slate-500">Enter your App ID and App Secret, then click this — Facebook's login and permissions popup will open, and your Page and Instagram will connect automatically.</p>

                  <div className="relative my-1"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200"></div></div><div className="relative flex justify-center"><span className="bg-white px-2 text-[11px] font-semibold text-slate-400">OR paste a token manually</span></div></div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">3 · Access Token (fresh User token)</label>
                    <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="EAAT... (a fresh User token from Graph API Explorer)" className={field} />
                  </div>
                  <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
                    {busy ? 'Connecting…' : 'Connect & Sync'}
                  </button>
                  {result && !result.ok && (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{result.error}</div>
                  )}
                  <p className="text-[11px] text-slate-500">Your App ID, App Secret and token are stored only on your server (DB). After connecting, the app uses them to create a permanent Page token automatically and refreshes it when needed.</p>
                </form>

                {/* Help */}
                <section className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/60 p-5 text-sm">
                  <h2 className="font-bold">Where do I get these three things?</h2>
                  <ol className="mt-2 list-decimal space-y-2 pl-5 text-slate-600">
                    <li><strong>App ID + App Secret:</strong> <a className="text-brand-600 underline" href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer">developers.facebook.com/apps</a> → your app → <em>Settings → Basic</em>. Click <em>Show</em> next to App Secret.</li>
                    <li><strong>Access Token:</strong> <a className="text-brand-600 underline" href="https://developers.facebook.com/tools/explorer" target="_blank" rel="noreferrer">Graph API Explorer</a> → select your app → choose <em>User Token</em> (not Page token) → add permissions:
                      <code className="mt-1 block break-words rounded bg-white px-2 py-1 font-mono text-[11px]">pages_show_list, pages_messaging, pages_read_engagement, instagram_basic, instagram_manage_messages</code>
                      → <em>Generate Access Token</em> → copy.</li>
                  </ol>
                  <p className="mt-3 text-[12px] text-amber-700">⚠ Generate a fresh token — an expired token won't work. Once you provide a valid token, the app makes it permanent automatically.</p>
                </section>
              </>
            )}

            {/* Permanent-token guide — always visible (the usual reason chats stop syncing) */}
            <section className="mt-5 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-5 text-sm">
              <h2 className="flex items-center gap-2 font-bold text-indigo-800">♾ A token that NEVER expires (recommended)</h2>
              <p className="mt-1 text-slate-600">
                The Graph API Explorer token expires within a few hours — so syncing stops and new chats stop coming in.
                To keep it running, create a <strong>System User token</strong> (this one never expires):
              </p>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-slate-600">
                <li><a className="text-brand-600 underline" href="https://business.facebook.com/settings/system-users" target="_blank" rel="noreferrer">business.facebook.com → Business Settings → System Users</a></li>
                <li><strong>Add</strong> → give it a name (e.g. "CRM") → role <em>Admin</em></li>
                <li><strong>Add Assets</strong> → select your Page (Decoinks) + Instagram, grant full control</li>
                <li><strong>Generate New Token</strong> → select your app → <strong>Token expiration: Never</strong> → permissions: <code className="rounded bg-white px-1 text-[11px]">pages_messaging, pages_read_engagement, pages_show_list, instagram_basic, instagram_manage_messages</code></li>
                <li>Copy the token and paste it into the <strong>Access Token</strong> field above (along with App ID + App Secret) → Connect</li>
              </ol>
              <p className="mt-2 text-[12px] text-indigo-700">After connecting, this page will tell you whether the token is "♾ Never expires" or not — so you can be sure.</p>
            </section>
          </div>
        </main>
      </div>
    </div>
  )
}
