// One-time: delete demo/seed customers + create a real customer per conversation.
import { getAll, findById, insert, remove, flush } from './db.js'

let removed = 0
for (const c of [...getAll('customers')]) {
  if (c.source_type !== 'meta') { remove('customers', c.id); removed++ }
}
console.log('demo customers removed:', removed)

let created = 0
for (const conv of getAll('conversations')) {
  const id = `cust:${conv.id}`
  if (findById('customers', id)) continue
  const d = conv.created_at ? new Date(conv.created_at) : new Date()
  insert('customers', {
    id,
    name: conv.name || 'Unknown',
    company: conv.company || '',
    channel: conv.channel || 'Meta',
    phone: conv.phone || '',
    email: '',
    initials: conv.initials || (conv.name || '?').slice(0, 2).toUpperCase(),
    avatar: conv.avatar_bg || 'bg-brand-100 text-brand-700',
    tier: 'Bronze',
    type: 'Lead',
    orders: 0,
    spend: 0,
    health: 100,
    healthLabel: 'New',
    owner: conv.assigned_to || '',
    role: conv.assigned_to ? 'Agent' : '',
    loc: '',
    lastOrder: '—',
    activityAgo: conv.list_time || '',
    activityDaysAgo: '',
    created: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    conversation_id: conv.id,
    customer_id: conv.customer_id || '',
    source_type: 'meta',
  })
  created++
}
console.log('customers created:', created)
console.log('flushing...')
await flush(90000)
console.log('total customers now:', getAll('customers').length)
process.exit(0)
