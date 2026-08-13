// ============================================================
// BlankTex Product Master — READ-ONLY catalog for the Lead Panel (Decoinks parity).
// Decoinks `GET /products` bhi yahi source use karta hai:
//   list   -> integration.blanktex_decoinks_styles  (view; CRM DB user ise padh sakta hai)
//   detail -> blanktex.style_colors / style_sizes / style_color_sizes  (SKU per color+size)
// `blanktex` schema par CRM ke `decoinks` role ko permission NAHI hai, isliye detail ke liye
// DECOINKS_DATABASE_URL (postgres) ka chhota read-only pool. Wo na mile to view ke colors/sizes
// JSON par fallback (rang/size aa jaate hain, SKU nahi).
// ============================================================
import pg from 'pg'
import { query as dbQuery } from './db.js'

const STYLES_VIEW = 'integration.blanktex_decoinks_styles'
const COLS = `id, sku, name, brand, model_number, image_url, description,
              garment_category, garment_type, fabric_composition, fabric_weight_gsm,
              total_colors, total_sizes, total_skus, colors, sizes`

let btPool = null
let btBroken = false
function blanktexPool() {
  if (btBroken || !process.env.DECOINKS_DATABASE_URL) return null
  if (!btPool) {
    btPool = new pg.Pool({
      connectionString: process.env.DECOINKS_DATABASE_URL,
      max: 3, connectionTimeoutMillis: 10000, query_timeout: 20000, idleTimeoutMillis: 30000,
    })
    btPool.on('error', (e) => console.warn('[catalog] blanktex pool:', e.message))
  }
  return btPool
}

// Panel ko hamesha ek hi simple shape milti hai, chahe source blanktex ho ya view ka JSON.
const normColor = (c) => ({ id: c.style_color_id, name: c.display_name || c.color_name, hex: c.hex_color || null })
const normSize = (s) => ({ id: s.style_size_id, name: s.size_name || s.size_code })

export async function listStyles({ search = '', limit = 50 } = {}) {
  const conds = ['deleted_at IS NULL', 'is_active']
  const params = []
  if (search) {
    params.push(`%${search}%`)
    conds.push(`(name ILIKE $${params.length} OR sku ILIKE $${params.length} OR brand ILIKE $${params.length} OR model_number ILIKE $${params.length})`)
  }
  params.push(Math.min(Math.max(Number(limit) || 50, 1), 100))
  const { rows } = await dbQuery(
    `SELECT ${COLS} FROM ${STYLES_VIEW}
      WHERE ${conds.join(' AND ')}
      ORDER BY brand, model_number
      LIMIT $${params.length}`, params)
  return rows
}

export async function getStyle(id) {
  const { rows } = await dbQuery(`SELECT ${COLS} FROM ${STYLES_VIEW} WHERE id = $1 AND deleted_at IS NULL`, [id])
  const style = rows[0]
  if (!style) { const e = new Error('Style not found'); e.status = 404; throw e }

  const p = blanktexPool()
  if (p) {
    try {
      const [colors, sizes, variants] = await Promise.all([
        p.query(`SELECT style_color_id, color_name, display_name, hex_color
                   FROM blanktex.style_colors WHERE style_id = $1 AND NOT discontinued
                  ORDER BY sort_order, display_name`, [id]),
        p.query(`SELECT style_size_id, size_code, size_name
                   FROM blanktex.style_sizes WHERE style_id = $1 AND NOT discontinued
                  ORDER BY display_order, size_name`, [id]),
        p.query(`SELECT sku_code, style_color_id, style_size_id
                   FROM blanktex.style_color_sizes WHERE style_id = $1 AND NOT discontinued
                  ORDER BY sku_code`, [id]),
      ])
      return {
        ...style,
        colors: colors.rows.map(normColor),
        sizes: sizes.rows.map(normSize),
        variants: variants.rows.map((v) => ({ sku: v.sku_code, color_id: v.style_color_id, size_id: v.style_size_id })),
        sku_source: 'blanktex',
      }
    } catch (e) {
      // permission/network — ek baar warn karke hamesha ke liye view fallback par chale jao
      console.warn('[catalog] blanktex detail unavailable, using view fallback:', e.message)
      btBroken = true
    }
  }
  // Fallback: view ka colors/sizes JSON — id ki jagah naam (SKU nahi milta).
  return {
    ...style,
    colors: (style.colors || []).map((c) => ({ id: c.name, name: c.name, hex: c.hex || null })),
    sizes: (style.sizes || []).map((s) => ({ id: s.code || s.name, name: s.name || s.code })),
    variants: [],
    sku_source: 'view',
  }
}
