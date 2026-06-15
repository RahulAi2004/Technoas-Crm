import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import SidebarCrm from '../components/SidebarCrm.jsx'
import TopBarUser from '../components/TopBarUser.jsx'
import { useToast } from '../components/ToastContext.jsx'
import { api } from '../lib/api.js'

export default function Integrations() {
  const toast = useToast()
  const [status, setStatus] = useState(null)
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [testText, setTestText] = useState('Hello from Technocas CRM 👋')
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
    <div className="h-screen overflow-hidden grid" style={{ gridTemplateColumns: '240px 1fr' }}>
      <SidebarCrm active="settings" />
      <div className="flex h-screen flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
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

          {/* ---- Meta (Messenger + Instagram) card ---- */}
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-xl font-bold">f</div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold">Meta — Messenger &amp; Instagram</h2>
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
          </section>

          {/* ---- ManyChat card ---- */}
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white text-xl font-bold">M</div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold">ManyChat</h2>
                    {status?.connected
                      ? <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">● Connected</span>
                      : <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">○ Not connected</span>}
                  </div>
                  <p className="mt-1 max-w-2xl text-sm text-slate-500">
                    Connect your ManyChat account to receive WhatsApp / Instagram / Facebook conversations directly in your Technocas inbox and reply from here. Replies go back through ManyChat → Meta.
                  </p>
                </div>
              </div>
              {status?.connected && (
                <button onClick={disconnect} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50">Disconnect</button>
              )}
            </div>

            {/* Connected info */}
            {status?.connected && (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-slate-50 p-3"><div className="text-[11px] text-slate-500">API Key</div><div className="font-mono text-sm">{status.keyMasked}</div></div>
                <div className="rounded-lg bg-slate-50 p-3"><div className="text-[11px] text-slate-500">Page / Bot</div><div className="text-sm font-semibold">{status.page?.name || '—'}</div></div>
                <div className="rounded-lg bg-slate-50 p-3"><div className="text-[11px] text-slate-500">Connected</div><div className="text-sm">{status.connectedAt ? new Date(status.connectedAt).toLocaleString() : '—'}</div></div>
              </div>
            )}

            {/* Connect form */}
            {!status?.connected && (
              <form onSubmit={connect} className="mt-4 space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">ManyChat API Key</label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="123456789:abcdef0123456789abcdef..."
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-mono outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">Get this from ManyChat dashboard → <em>Settings → API</em>. Requires ManyChat <strong>Pro</strong>.</p>
                </div>
                <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
                  {busy ? 'Verifying...' : 'Connect ManyChat'}
                </button>
              </form>
            )}

            {/* Webhook + test sender */}
            {status?.connected && (
              <div className="mt-5 space-y-4">
                <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-xs">
                  <div className="mb-1 font-semibold text-slate-700">Incoming messages webhook</div>
                  <p className="mb-2 text-slate-500">In ManyChat → Automation → External Triggers (or Webhooks) → set URL to:</p>
                  <code className="block break-all rounded bg-white px-2 py-1.5 font-mono text-[12px]">
                    {`${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/manychat`}
                  </code>
                  <p className="mt-2 text-slate-500">Trigger this on "User replies / sends a message" — incoming messages will land in your inbox automatically.</p>
                </div>

                <form onSubmit={sendTest} className="rounded-lg border border-slate-200 p-3">
                  <div className="mb-2 text-xs font-bold">Send a test message</div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_2fr_auto]">
                    <input value={testSubId} onChange={(e) => setTestSubId(e.target.value)} placeholder="Subscriber ID (from ManyChat)" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    <input value={testText} onChange={(e) => setTestText(e.target.value)} placeholder="Message text" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    <button disabled={busy} className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">Send</button>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">You can find a subscriber ID in ManyChat → Audience → click any subscriber → URL contains the ID.</p>
                </form>
              </div>
            )}
          </section>

          {/* ---- Other channels (placeholders) ---- */}
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
