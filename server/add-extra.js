// Step 1 of cutover: make app.* LOSSLESS — add an `extra` JSONB to each app table and
// copy the full original public.* doc into it (so the cutover keeps every UI/AI field).
// Additive + idempotent. public.* untouched.
import pg from 'pg'
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 15000, query_timeout: 90000, statement_timeout: 90000 })

// app table  <-  public table
const MAP = [
  ['agents', 'users'], ['customers', 'customers'], ['conversations', 'conversations'],
  ['messages', 'messages'], ['leads', 'leads'], ['orders', 'orders'],
  ['payments', 'payments'], ['notes', 'notes'], ['artwork', 'artworks'], ['ai_chats', 'ai_chats'],
]

for (const [appT, pubT] of MAP) {
  await pool.query(`ALTER TABLE app.${appT} ADD COLUMN IF NOT EXISTS extra JSONB DEFAULT '{}'::jsonb`)
  const r = await pool.query(`UPDATE app.${appT} a SET extra = p.doc FROM public.${pubT} p WHERE a.legacy_id = (p.doc->>'id')`)
  const filled = (await pool.query(`SELECT count(*)::int n FROM app.${appT} WHERE extra <> '{}'::jsonb`)).rows[0].n
  console.log(`app.${appT}: extra filled for ${filled} rows (updated ${r.rowCount})`)
}
console.log('\n✓ app.* is now lossless (normalized columns + full original doc in extra)')
await pool.end(); process.exit(0)
