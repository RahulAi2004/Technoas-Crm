// One-time migration: load the existing data.json into Postgres.
// Run with:  node --env-file=.env migrate-to-pg.js
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { insert, setSetting, setAutoInc, flush, close } from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FILE = path.join(__dirname, 'data.json')

if (!fs.existsSync(FILE) || !fs.readFileSync(FILE, 'utf8').trim()) {
  console.log('No data.json to migrate — Postgres starts empty.')
  await close()
  process.exit(0)
}

const json = JSON.parse(fs.readFileSync(FILE, 'utf8'))
const ROW_TABLES = ['users', 'customers', 'leads', 'conversations', 'messages',
  'notes', 'orders', 'payments', 'receipts', 'artworks', 'webhook_events']

for (const t of ROW_TABLES) {
  const rows = json[t] || []
  rows.forEach((r) => insert(t, r))
  if (rows.length) console.log(`✓ ${t}: ${rows.length}`)
}

// autoinc counters (so new numeric ids continue, not collide)
Object.entries(json._autoinc || {}).forEach(([t, v]) => setAutoInc(t, v))

// settings (manychat/meta tokens, etc.)
Object.entries(json.settings || {}).forEach(([k, v]) => setSetting(k, v))
console.log(`✓ settings: ${Object.keys(json.settings || {}).length} keys`)

await flush()
await close()
console.log('\n✅ Migrated data.json → Postgres (decoinks_db).')
