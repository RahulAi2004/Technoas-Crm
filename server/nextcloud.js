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

// Har customer folder mein yahi dhaancha hota hai. `references` customer ki bheji
// files ke liye hai (auto-fill); baaki team khud istemal karti hai.
export const CUSTOMER_SUBFOLDERS = ['references', 'Artworks', 'Mockups', 'Gangsheets', 'Documents']

export async function ncEnsureCustomerFolders(folder) {
  if (!ncConfigured() || !folder) return false
  const base = [...NC_ROOT.split('/').filter(Boolean), folder]
  await ncEnsureFolder(base)
  const path = base.join('/')
  for (const sub of CUSTOMER_SUBFOLDERS) {
    try { await req(davUrl(`${path}/${sub}`), { method: 'MKCOL' }) } catch { /* exists — ok */ }
  }
  return true
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

// remote path banane ka helper (share-worker isse reconstruct karta hai)
export function ncRemotePath(folder, subfolder, fileName) {
  return [...NC_ROOT.split('/').filter(Boolean), folder, ...(subfolder ? [subfolder] : []), fileName].join('/')
}

// Upload one file (MKCOL + PUT). Share-link ALAG se banate hain (rate-limit se bachne ke liye).
// share=false (default worker) → sirf upload, tez. Returns { remote } or null.
export async function ncUploadAndShare({ folder, subfolder, fileName, bytes, share = false }) {
  if (!ncConfigured() || !bytes) return null
  const parts = [...NC_ROOT.split('/').filter(Boolean), folder, ...(subfolder ? [subfolder] : [])]
  await ncEnsureFolder(parts)
  const remote = `${parts.join('/')}/${fileName}`
  if (!(await ncPut(remote, bytes))) return null
  const url = share ? await ncShareLink(remote) : null
  return { url, remote }
}
