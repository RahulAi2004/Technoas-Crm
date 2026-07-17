// NextCloud client — WebDAV upload + OCS public shareable link.
// Config via .env (jab aap app-password bana ke daalenge tab active hoga; tab tak sab no-op):
//   NEXTCLOUD_URL   = https://cloud.yourdomain.com
//   NEXTCLOUD_USER  = decoinks            (WebDAV username)
//   NEXTCLOUD_PASS  = <app-password>      (Settings > Security > Create new app password)
//   NEXTCLOUD_ROOT  = Decoinks/Customers  (base folder; optional, default 'Decoinks')
const B = (process.env.NEXTCLOUD_URL || '').replace(/\/+$/, '')
const U = process.env.NEXTCLOUD_USER || ''
const P = process.env.NEXTCLOUD_PASS || ''
export const NC_ROOT = process.env.NEXTCLOUD_ROOT || 'Decoinks'

export const ncConfigured = () => !!(B && U && P)
const AUTH = 'Basic ' + Buffer.from(`${U}:${P}`).toString('base64')
const davUrl = (p) => `${B}/remote.php/dav/files/${U}/${p.split('/').map(encodeURIComponent).join('/')}`

async function req(url, opts, timeoutMs = 20000) {
  return fetch(url, { ...opts, headers: { Authorization: AUTH, ...(opts.headers || {}) }, signal: AbortSignal.timeout(timeoutMs) })
}

// nested folders ek-ek karke banao (MKCOL); 405 = pehle se hai, ignore
export async function ncEnsureFolder(pathParts) {
  let acc = ''
  for (const part of pathParts) {
    acc = acc ? `${acc}/${part}` : part
    try { await req(davUrl(acc), { method: 'MKCOL' }) } catch { /* exists / race — ok */ }
  }
}

export async function ncPut(remotePath, bytes) {
  const res = await req(davUrl(remotePath), { method: 'PUT', body: bytes }, 60000)
  return res.status === 201 || res.status === 204 || res.ok
}

// OCS public share link (shareType 3 = public link, permission 1 = read-only)
export async function ncShareLink(remotePath) {
  const res = await req(`${B}/ocs/v2.php/apps/files_sharing/api/v1/shares`, {
    method: 'POST',
    headers: { 'OCS-APIRequest': 'true', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ path: '/' + remotePath, shareType: '3', permissions: '1' }),
  })
  const txt = await res.text()
  const m = /<url>([^<]+)<\/url>/.exec(txt)          // OCS XML response
  return m ? m[1].replace(/&amp;/g, '&') : null
}

// Full flow for one file → returns { url } or null
export async function ncUploadAndShare({ folder, fileName, bytes }) {
  if (!ncConfigured() || !bytes) return null
  const parts = [...NC_ROOT.split('/').filter(Boolean), folder]
  await ncEnsureFolder(parts)
  const remote = `${parts.join('/')}/${fileName}`
  if (!(await ncPut(remote, bytes))) return null
  const url = await ncShareLink(remote)             // link null bhi ho sakta hai (file phir bhi chadh gayi)
  return { url, remote }
}
