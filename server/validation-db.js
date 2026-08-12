// Alag "validation" database — Lead Details ke fields yahan validate/store hote hain, production
// (app.* / public.*) ko bilkul chhue bina. Reversible: env LEAD_VALIDATION_DB=off/0 se pura
// behaviour wapas production pe (writes seedhe app.* me jaane lagenge).
//
// Connection: VALIDATION_DATABASE_URL diya ho to wahi; warna main DATABASE_URL me se sirf DB ka
// naam badal kar 'decoinks_validation' — yani wahi Postgres server + wahi decoinks credentials,
// bas alag database. (Isse alag password/host set karne ki zaroorat nahi.)
import pg from 'pg'

const SRC = process.env.VALIDATION_DATABASE_URL
  || (process.env.DATABASE_URL || '').replace(/\/[^/?]+(\?|$)/, '/decoinks_validation$1')

// Default ON (user ne "abhi ke liye" alag DB maanga). off/0/false se production behaviour wapas.
export const VALIDATION_MODE = !['off', '0', 'false', 'no'].includes(String(process.env.LEAD_VALIDATION_DB || 'on').toLowerCase())

let pool = null
function getPool() {
  if (!SRC) return null
  if (!pool) pool = new pg.Pool({ connectionString: SRC, max: 4, connectionTimeoutMillis: 15000, query_timeout: 30000 })
  return pool
}
export const valConfigured = () => !!SRC

// Ek validated field store karo (conversation + field -> value). Value jsonb (string/number/
// array/object sab chalega). updated_by null aaye to purana bana rehta hai.
export async function saveValidationField(conversationId, field, value, by) {
  const p = getPool(); if (!p) throw new Error('validation DB not configured')
  await p.query(
    `INSERT INTO public.field_values (conversation_id, field, value, updated_by, updated_at)
     VALUES ($1, $2, $3::jsonb, $4, now())
     ON CONFLICT (conversation_id, field) DO UPDATE
       SET value = EXCLUDED.value,
           updated_by = COALESCE(EXCLUDED.updated_by, public.field_values.updated_by),
           updated_at = now()`,
    [String(conversationId), field, JSON.stringify(value ?? null), by || null])
}

// Kis USER ne field validate kiya (audit) — value ko chhue bina sirf updated_by set.
export async function setValidationAudit(conversationId, field, by) {
  const p = getPool(); if (!p) return
  try {
    await p.query(
      `INSERT INTO public.field_values (conversation_id, field, updated_by, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (conversation_id, field) DO UPDATE SET updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [String(conversationId), field, by || null])
  } catch { /* audit best-effort */ }
}

// Ek conversation ke saare validated fields + audit.
export async function getValidationFields(conversationId) {
  const p = getPool(); if (!p) return { fields: {}, audit: {} }
  const r = await p.query(
    `SELECT field, value, updated_by, updated_at FROM public.field_values WHERE conversation_id = $1`,
    [String(conversationId)])
  const fields = {}, audit = {}
  for (const row of r.rows) {
    if (row.value !== null) fields[row.field] = row.value
    audit[row.field] = { by: row.updated_by || null, at: row.updated_at }
  }
  return { fields, audit }
}

// Submit/Complete ka snapshot (bundle + qualification) — production sync ke bajaye yahan.
export async function saveValidationComplete(conversationId, bundle, qualification, by) {
  const p = getPool(); if (!p) throw new Error('validation DB not configured')
  await p.query(
    `INSERT INTO public.completed_leads (conversation_id, bundle, qualification, completed_by, completed_at)
     VALUES ($1, $2::jsonb, $3::jsonb, $4, now())
     ON CONFLICT (conversation_id) DO UPDATE
       SET bundle = EXCLUDED.bundle, qualification = EXCLUDED.qualification,
           completed_by = EXCLUDED.completed_by, completed_at = now()`,
    [String(conversationId), JSON.stringify(bundle ?? {}), JSON.stringify(qualification ?? {}), by || null])
}
