// Full data backup: dumps EVERY table in public.* and app.* schemas to JSON files.
// Run: node --env-file=.env backup-all.js [outDir]
// Non-destructive: read-only SELECTs.
import pg from 'pg'
import fs from 'fs'
import path from 'path'

const { Pool } = pg
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set — run with node --env-file=.env')

const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
const outDir = process.argv[2] || path.resolve('..', 'backups', `backup-${stamp}`)
fs.mkdirSync(outDir, { recursive: true })

const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000, query_timeout: 120000 })

const { rows: tables } = await pool.query(`
  SELECT table_schema, table_name FROM information_schema.tables
  WHERE table_schema IN ('public','app') AND table_type='BASE TABLE'
  ORDER BY table_schema, table_name`)

let totalRows = 0
const manifest = []
for (const t of tables) {
  const full = `${t.table_schema}.${t.table_name}`
  try {
    const { rows } = await pool.query(`SELECT * FROM ${t.table_schema}."${t.table_name}"`)
    const file = path.join(outDir, `${t.table_schema}.${t.table_name}.json`)
    fs.writeFileSync(file, JSON.stringify(rows, null, 1))
    manifest.push({ table: full, rows: rows.length })
    totalRows += rows.length
    console.log(`✔ ${full} — ${rows.length} rows`)
  } catch (e) {
    manifest.push({ table: full, error: e.message })
    console.error(`✖ ${full} — ${e.message}`)
  }
}
fs.writeFileSync(path.join(outDir, '_manifest.json'), JSON.stringify({ created_at: new Date().toISOString(), database: 'decoinks_db', totalRows, tables: manifest }, null, 2))
console.log(`\nBackup complete → ${outDir} (${tables.length} tables, ${totalRows} rows)`)
await pool.end()
