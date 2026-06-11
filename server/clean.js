// Wipes all dummy data but preserves the admin user and ManyChat connection.
import { clearTable, setAutoInc, getAll } from './db.js'

const KEEP = ['users', 'settings']
const WIPE = [
  'customers',
  'leads',
  'conversations',
  'messages',
  'notes',
  'orders',
  'payments',
  'receipts',
  'artworks',
  'webhook_events',
]

console.log('Before:')
WIPE.forEach(t => console.log(`  ${t}: ${getAll(t).length}`))

WIPE.forEach(t => { clearTable(t); setAutoInc(t, 0) })

console.log('\n✅ Dummy data wiped.')
console.log('Kept:', KEEP.join(', '))
console.log('Cleared:', WIPE.join(', '))
