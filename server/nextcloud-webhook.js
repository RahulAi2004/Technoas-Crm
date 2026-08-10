// Nextcloud -> CRM -> central Decoinks artwork-vault event gateway.
const target = String(process.env.DECOINKS_NEXTCLOUD_WEBHOOK_URL || 'http://host.docker.internal:8094/api/nextcloud/webhook').replace(/\/$/, '')
const sharedSecret = String(process.env.DECOINKS_NEXTCLOUD_WEBHOOK_SECRET || process.env.NEXTCLOUD_WEBHOOK_SECRET || '')

function webhookSecretMatches(req) {
  if (!sharedSecret) return false
  const provided = req.get('x-webhook-secret') || req.query.secret || ''
  return provided === sharedSecret
}

export function nextcloudWebhook(req, res, broadcast) {
  if (!webhookSecretMatches(req)) return res.status(401).json({ error: 'Invalid Nextcloud webhook secret' })
  const event = req.body || {}
  const path = event.node?.path || event.path || event.file?.path || null
  broadcast?.({ type: 'artwork_vault_changed', path, event: event.event || null, time: Date.now() })
  res.status(202).json({ accepted: true, path })
  fetch(target, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-webhook-secret': sharedSecret },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(10000),
  }).catch(error => console.warn('[nextcloud webhook] Decoinks forward failed:', error.message))
}

