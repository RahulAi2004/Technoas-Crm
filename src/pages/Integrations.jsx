import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import SidebarCrm from '../components/SidebarCrm.jsx'
import TopBarUser from '../components/TopBarUser.jsx'
import { useToast } from '../components/ToastContext.jsx'
import { api } from '../lib/api.js'

// Load the Facebook JavaScript SDK once and init with the given App ID.
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

const CONNECT_LABEL = {
  facebook: { name: 'Facebook Messenger', blurb: 'Connect your Facebook Page to reply to Messenger chats from your inbox.' },
  instagram: { name: 'Instagram', blurb: 'Connect your Instagram (linked to your Facebook Page) to reply to Instagram DMs.' },
  whatsapp: { name: 'WhatsApp', blurb: 'Connect WhatsApp to receive and reply to WhatsApp chats.' },
}

export default function Integrations() {
  const toast = useToast()
  const [params] = useSearchParams()
  const connectCh = params.get('connect')   // 'facebook' | 'instagram' | 'whatsapp'
  const [status, setStatus] = useState(null)
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [testText, setTestText] = useState('Hello from Decoinks CRM 👋')
  const [testSubId, setTestSubId] = useState('')

  // ---- Meta (Messenger + Instagram) ----
  const [meta, setMeta] = useState(null)
  const [metaAppId, setMetaAppId] = useState('')
  const [metaAppSecret, setMetaAppSecret] = useState('')
  const [metaToken, setMetaToken] = useState('')
  const [metaBusy, setMetaBusy] = useState(false)
  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  const refresh = () => {
    api.get('/api/manychat/status').then(setStatus).catch(() => setStatus({ connected: false }))
    api.get('/api/meta/status').then(setMeta).catch(() => setMeta({ connected: false }))
  }

  useEffect(() => { refresh() }, [])

  const connectMeta = async (e) => {
    e.preventDefault()
    if (!metaAppId.trim() || !metaAppSecret.trim() || !metaToken.trim()) {
      toast('App ID, App Secret aur Access Token — teeno zaroori hain', 'error'); return
    }
    setMetaBusy(true)
    try {
      const r = await api.post('/api/meta/connect-app', {
        appId: metaAppId.trim(), appSecret: metaAppSecret.trim(), token: metaToken.trim(),
      })
      await api.post('/api/meta/sync').catch(() => ({}))
      toast(r.neverExpires ? `Connected: ${r.page?.name || 'Page'} — permanent ✅` : `Connected: ${r.page?.name || 'Page'} (token temporary ⚠)`, r.neverExpires ? 'success' : 'info')
      setMetaToken(''); setMetaAppSecret('')
      refresh()
    } catch (ex) {
      toast(ex.message || 'Failed to connect Meta', 'error')
    } finally { setMetaBusy(false) }
  }

  // "Continue with Facebook" — OAuth via the FB JS SDK, then connect using the granted token.
  const continueWithFacebook = async () => {
    if (!metaAppId.trim() || !metaAppSecret.trim()) { toast('Pehle App ID aur App Secret bharo (token Facebook se aa jayega)', 'error'); return }
    setMetaBusy(true)
    try {
      const FB = await loadFacebookSDK(metaAppId.trim())
      FB.login((resp) => {
        if (resp.status === 'connected' && resp.authResponse?.accessToken) {
          ;(async () => {
            try {
              const r = await api.post('/api/meta/connect-app', { appId: metaAppId.trim(), appSecret: metaAppSecret.trim(), token: resp.authResponse.accessToken })
              await api.post('/api/meta/sync').catch(() => ({}))
              toast(r.neverExpires ? `Connected: ${r.page?.name || 'Page'} — permanent ✅` : `Connected: ${r.page?.name || 'Page'}`, 'success')
              setMetaAppSecret(''); refresh()
            } catch (ex) { toast(ex.message || 'Connect failed', 'error') } finally { setMetaBusy(false) }
          })()
        } else { toast('Facebook login cancelled', 'info'); setMetaBusy(false) }
      }, { scope: FB_SCOPE, return_scopes: true })
    } catch (ex) { toast(ex.message || 'Could not load Facebook', 'error'); setMetaBusy(false) }
  }

  const disconnectMeta = async () => {
    if (!confirm('Disconnect Meta? The Page token will be removed.')) return
    await api.post('/api/meta/disconnect')
    toast('Meta disconnected', 'info')
    refresh()
  }

  const copy = (txt) => { navigator.clipboard?.writeText(txt); toast('Copied', 'success') }

  const connect = async (e) => {
    e.preventDefault()
    if (!apiKey.trim()) return
    setBusy(true)
    try {
      await api.post('/api/manychat/connect', { apiKey: apiKey.trim() })
      toast('ManyChat connected', 'success')
      setApiKey('')
      refresh()
    } catch (ex) {
      toast(ex.message || 'Failed to connect', 'error')
    } finally { setBusy(false) }
  }

  const disconnect = async () => {
    if (!confirm('Disconnect ManyChat? Your API key will be removed.')) return
    await api.post('/api/manychat/disconnect')
    toast('ManyChat disconnected', 'info')
    refresh()
  }

  const sendTest = async (e) => {
    e.preventDefault()
    if (!testSubId.trim() || !testText.trim()) return
    setBusy(true)
    try {
      await api.post('/api/manychat/send', { subscriberId: testSubId.trim(), text: testText.trim() })
      toast(`Sent to ${testSubId}`, 'success')
    } catch (ex) {
      toast(ex.message || 'Send failed', 'error')
    } finally { setBusy(false) }
  }

  return (
    <div className="crm-shell h-screen overflow-hidden grid">
      <SidebarCrm active="settings" />
      <div className="flex h-screen flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 sm:px-6">
          <nav className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Settings</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-300"><path d="m9 18 6-6-6-6"/></svg>
            <span className="font-semibold">Integrations</span>
          </nav>
          <div className="flex items-center gap-3"><TopBarUser /></div>
        </header>

        <main className="nice-scroll flex-1 overflow-y-auto px-6 py-6">
          <h1 className="text-2xl font-extrabold tracking-tight">Integrations</h1>
          <p className="text-sm text-slate-500">Connect external channels so messages flow into your inbox.</p>

          {connectCh && CONNECT_LABEL[connectCh] && (
            <div className="mt-5 flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50/60 p-4">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-base font-bold text-white ${connectCh === 'instagram' ? 'bg-gradient-to-br from-amber-400 via-rose-500 to-fuchsia-600' : connectCh === 'whatsapp' ? 'bg-emerald-500' : 'bg-blue-600'}`}>{connectCh === 'facebook' ? 'f' : connectCh === 'instagram' ? '◎' : '✆'}</span>
              <div>
                <div className="text-sm font-bold text-brand-800">Connect {CONNECT_LABEL[connectCh].name}</div>
                <div className="text-xs text-slate-600">{CONNECT_LABEL[connectCh].blurb}{connectCh !== 'whatsapp' ? ' Use the Meta card below.' : ''}</div>
              </div>
            </div>
          )}

          {/* ---- Meta (Messenger + Instagram) card ---- */}
          <section className={`mt-6 rounded-2xl border bg-white p-5 ${connectCh === 'facebook' || connectCh === 'instagram' ? 'border-brand-300 ring-2 ring-brand-200' : 'border-slate-200'}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-xl font-bold">f</div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold">{connectCh === 'facebook' ? 'Connect Facebook Messenger' : connectCh === 'instagram' ? 'Connect Instagram' : 'Meta — Messenger & Instagram'}</h2>
                    {meta?.connected
                      ? <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">● Connected</span>
                      : <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">○ Not connected</span>}
                  </div>
                  <p className="mt-1 max-w-2xl text-sm text-slate-500">
                    Direct Graph API connection. Reply to Facebook Messenger &amp; Instagram DMs straight from your inbox, in real time — no ManyChat in between.
                  </p>
                </div>
              </div>
              {meta?.connected && (
                <button onClick={disconnectMeta} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50">Disconnect</button>
              )}
            </div>

            {meta?.connected && (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div className="rounded-lg bg-slate-50 p-3"><div className="text-[11px] text-slate-500">Page</div><div className="text-sm font-semibold">{meta.pageName || '—'}</div></div>
                <div className="rounded-lg bg-slate-50 p-3"><div className="text-[11px] text-slate-500">Page ID</div><div className="font-mono text-sm">{meta.pageId || '—'}</div></div>
                <div className="rounded-lg bg-slate-50 p-3"><div className="text-[11px] text-slate-500">Instagram</div><div className="text-sm font-semibold">{meta.instagram?.username ? `@${meta.instagram.username}` : '— (not linked)'}</div></div>
                <div className="rounded-lg bg-slate-50 p-3"><div className="text-[11px] text-slate-500">Token</div><div className="font-mono text-sm">{meta.tokenMasked}</div></div>
              </div>
            )}

            {!meta?.connected && (
              <form onSubmit={connectMeta} className="mt-4 space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">1 · App ID</label>
                    <input
                      value={metaAppId}
                      onChange={(e) => setMetaAppId(e.target.value)}
                      placeholder="e.g. 1234567890123456"
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-mono outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">2 · App Secret</label>
                    <input
                      type="password"
                      value={metaAppSecret}
                      onChange={(e) => setMetaAppSecret(e.target.value)}
                      placeholder="App Secret (Settings → Basic → Show)"
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-mono outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20"
                    />
                  </div>
                </div>

                {/* One-click OAuth */}
                <button type="button" onClick={continueWithFacebook} disabled={metaBusy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#1877F2] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#166fe0] disabled:opacity-60">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"/></svg>
                  {metaBusy ? 'Connecting…' : 'Continue with Facebook'}
                </button>
                <p className="text-[11px] text-slate-500">App ID + App Secret bharke ye dabao — Facebook ka login + permissions popup khulega, phir aapka Page + Instagram khud connect ho jayega.</p>

                <div className="relative my-1"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200"></div></div><div className="relative flex justify-center"><span className="bg-white px-2 text-[11px] font-semibold text-slate-400">OR paste a token manually</span></div></div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">3 · Access Token (Page / System User)</label>
                  <input
                    type="password"
                    value={metaToken}
                    onChange={(e) => setMetaToken(e.target.value)}
                    placeholder="EAAT... (production page access token)"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-mono outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">App ID + Secret + Token sirf aapke server (DB) pe store hote hain. Connect ke baad app khud permanent Page token bana leta hai aur zarurat par auto-refresh karta hai. Detailed never-expire guide: <Link to="/connect-meta" className="font-semibold text-brand-600 hover:underline">Connect Meta page</Link>.</p>
                </div>
                <button type="submit" disabled={metaBusy} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
                  {metaBusy ? 'Connecting & syncing…' : 'Connect & Sync'}
                </button>
              </form>
            )}

            {meta?.connected && (
              <div className="mt-5 space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-xs">
                <div className="font-semibold text-slate-700">Webhook setup (Meta App → Webhooks)</div>
                <p className="text-slate-500">In your Meta App → Webhooks, subscribe the <strong>Page</strong> and <strong>Instagram</strong> products to the <code>messages</code> field, with:</p>
                <div>
                  <div className="mb-1 text-[11px] font-semibold text-slate-500">Callback URL</div>
                  <div className="flex items-center gap-2">
                    <code className="block flex-1 break-all rounded bg-white px-2 py-1.5 font-mono text-[12px]">{`${origin}/api/webhooks/meta`}</code>
                    <button onClick={() => copy(`${origin}/api/webhooks/meta`)} className="rounded border border-slate-200 bg-white px-2 py-1 font-semibold hover:bg-slate-50">Copy</button>
                  </div>
                  <p className="mt-1 text-[11px] text-amber-700">⚠ Use your public HTTPS URL (e.g. the ngrok URL), not localhost — Meta must be able to reach it.</p>
                </div>
                <div>
                  <div className="mb-1 text-[11px] font-semibold text-slate-500">Verify Token</div>
                  <div className="flex items-center gap-2">
                    <code className="block flex-1 break-all rounded bg-white px-2 py-1.5 font-mono text-[12px]">{meta.verifyToken}</code>
                    <button onClick={() => copy(meta.verifyToken)} className="rounded border border-slate-200 bg-white px-2 py-1 font-semibold hover:bg-slate-50">Copy</button>
                  </div>
                </div>
              </div>
            )}
          </section>{/* ---- Other channels (placeholders) ---- */}
          <section className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { name:'WhatsApp Business API',   blurb:'Direct Cloud API integration (no ManyChat)', bg:'bg-emerald-500' },
              { name:'Meta Messenger',          blurb:'Native Facebook Messenger via Graph API',    bg:'bg-blue-600' },
              { name:'Instagram DMs',           blurb:'Direct Instagram messaging API',             bg:'bg-gradient-to-br from-amber-400 via-rose-500 to-fuchsia-600' },
              { name:'Email (SMTP / IMAP)',     blurb:'Catch replies from your support inbox',      bg:'bg-slate-700' },
              { name:'Zapier',                  blurb:'Trigger workflows from any CRM event',       bg:'bg-orange-500' },
              { name:'Stripe',                  blurb:'Payments + auto-reconcile receipts',         bg:'bg-violet-600' },
            ].map((x) => (
              <div key={x.name} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-start gap-3">
                  <div className={`grid h-10 w-10 place-items-center rounded-lg ${x.bg} text-white font-bold`}>{x.name[0]}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2"><div className="font-semibold">{x.name}</div><span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">Soon</span></div>
                    <p className="mt-0.5 text-xs text-slate-500">{x.blurb}</p>
                  </div>
                </div>
              </div>
            ))}
          </section>
        </main>
      </div>
    </div>
  )
}
