// Free, local image classifier (no API, no cost) for auto-filing customer files.
// Uses `sharp` pixel stats — decides: SRC (complete artwork) / DOCS (payment screenshot or
// document) / REF (reference photo) / UNSURE (leave for the agent). Only high-confidence
// results should be auto-routed; UNSURE goes to the agent via a chat notification.
import sharp from 'sharp'

const q = (v) => v >> 3   // quantise a channel to 5 bits (0..31) for color-count / bg checks
const key = (r, g, b) => (q(r) << 10) | (q(g) << 5) | q(b)
const near = (a, b, tol = 16) => Math.abs(a[0] - b[0]) < tol && Math.abs(a[1] - b[1]) < tol && Math.abs(a[2] - b[2]) < tol
const isGrayish = (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b) < 22   // low saturation

export async function classifyImage(buffer) {
  let meta
  try { meta = await sharp(buffer).metadata() } catch { return { type: 'UNSURE', confidence: 0, reason: 'unreadable' } }
  const w = meta.width || 1, h = meta.height || 1
  const aspect = h / w

  // 1) transparent artwork (PNG with real alpha) → almost always a print-ready design
  if (meta.hasAlpha && meta.format === 'png') {
    try {
      const aStat = await sharp(buffer).extractChannel(3).stats()
      const meanAlpha = aStat.channels?.[0]?.mean ?? 255
      if (meanAlpha < 230) return { type: 'SRC', confidence: 0.92, reason: 'transparent design (alpha)' }
    } catch { /* fall through */ }
  }

  // sample a small RGB grid for cheap stats
  const N = 64
  let raw
  try { raw = await sharp(buffer).removeAlpha().resize(N, N, { fit: 'fill' }).raw().toBuffer() }
  catch { return { type: 'UNSURE', confidence: 0, reason: 'decode failed' } }

  const colors = new Set()
  const px = (i) => [raw[i * 3], raw[i * 3 + 1], raw[i * 3 + 2]]
  for (let i = 0; i < N * N; i++) { const [r, g, b] = px(i); colors.add(key(r, g, b)) }
  const colorCount = colors.size            // ~ palette richness (low=graphic, high=photo)

  // border pixels → background analysis (screenshots/designs have uniform-ish borders)
  const border = []
  for (let x = 0; x < N; x++) { border.push(px(x), px((N - 1) * N + x), px(x * N), px(x * N + N - 1)) }
  const bgTally = new Map()
  for (const c of border) { const k = key(c[0], c[1], c[2]); bgTally.set(k, (bgTally.get(k) || 0) + 1) }
  const sortedBg = [...bgTally.entries()].sort((a, b) => b[1] - a[1])
  const top2 = sortedBg.slice(0, 2).reduce((s, e) => s + e[1], 0) / border.length   // 2 bg colors share
  const bgTop = sortedBg[0]
  const bgColor = bgTop ? [((bgTop[0] >> 10) & 31) << 3, ((bgTop[0] >> 5) & 31) << 3, (bgTop[0] & 31) << 3] : [255, 255, 255]
  const bgBright = (bgColor[0] + bgColor[1] + bgColor[2]) / 3
  // fraction of ALL pixels close to the dominant bg color
  let bgFrac = 0
  for (let i = 0; i < N * N; i++) { if (near(px(i), bgColor)) bgFrac++ }
  bgFrac /= N * N

  // checkerboard (transparency preview baked into a JPG): border is 2 grayish tones sharing most of it
  const borderGray = border.filter((c) => isGrayish(c[0], c[1], c[2])).length / border.length
  const checker = borderGray > 0.85 && top2 > 0.75 && sortedBg.length >= 2 && colorCount > 60

  // ---- decide ----
  if (checker) return { type: 'SRC', confidence: 0.85, reason: 'transparency checkerboard' }
  // very flat, few colors, sharp = a graphic/design (not a photo)
  if (colorCount < 120 && bgFrac > 0.25) return { type: 'SRC', confidence: 0.7, reason: `flat graphic (${colorCount} colors)` }
  // tall + bright uniform background + not too many colors = phone screenshot / payment / document
  if (aspect > 1.5 && bgBright > 180 && bgFrac > 0.30 && colorCount < 900)
    return { type: 'DOCS', confidence: 0.6, reason: `screenshot/doc (aspect ${aspect.toFixed(1)}, light bg)` }
  // busy, many colors, no flat bg = a real photo / reference
  if (colorCount > 1200 && bgFrac < 0.25) return { type: 'REF', confidence: 0.6, reason: `photo (${colorCount} colors)` }

  return { type: 'UNSURE', confidence: 0.3, reason: `colors=${colorCount} aspect=${aspect.toFixed(1)} bgFrac=${bgFrac.toFixed(2)}` }
}
