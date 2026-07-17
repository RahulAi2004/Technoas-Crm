import pg from 'pg'
import { createHash } from 'node:crypto'
import { getAll } from './db.js'

const { Pool } = pg

const decoinksPool = new Pool({
  connectionString: process.env.DECOINKS_DATABASE_URL
})

function sourceToDecoinksSource(channel) {
  if (channel === 'Facebook') return 'Facebook Messenger'
  if (channel === 'Instagram') return 'Instagram'
  if (channel === 'WhatsApp') return 'WhatsApp'
  if (channel === 'Email') return 'Email'
  return 'Website'
}

function stableUuidFromText(text) {
  const h = createHash('md5').update(String(text)).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

async function main() {
  const conversations = getAll('conversations')
  const messages = getAll('messages')

  let synced = 0

  for (const conv of conversations) {
    const convMessages = messages.filter(m => String(m.conversation_id) === String(conv.id))
    const lastMessage = [...convMessages].reverse().find(m => m.text)?.text || conv.list_preview || ''

    const leadId = stableUuidFromText(`crm:${conv.id}`)
    const leadNumber = `CRM-${String(conv.id).replace(/[^a-zA-Z0-9]/g, '-').slice(0, 24)}`
    const customerName = conv.name || 'No customer'
    const source = sourceToDecoinksSource(conv.channel || conv.source)

    await decoinksPool.query(`
      INSERT INTO public.leads (
        id, lead_number, source, description, stage, status,
        customer_name, supplier_name, company_name, phone, communication_channel,
        last_message, message_count, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, 'initiated', 'New',
        $5, $5, $6, $7, $8, $9, $10, now(), now()
      )
      ON CONFLICT (id) DO UPDATE SET
        customer_name = COALESCE(EXCLUDED.customer_name, public.leads.customer_name),
        supplier_name = COALESCE(EXCLUDED.supplier_name, public.leads.supplier_name),
        company_name = COALESCE(EXCLUDED.company_name, public.leads.company_name),
        phone = COALESCE(EXCLUDED.phone, public.leads.phone),
        communication_channel = EXCLUDED.communication_channel,
        last_message = COALESCE(NULLIF(EXCLUDED.last_message, ''), public.leads.last_message),
        message_count = EXCLUDED.message_count,
        updated_at = now()
    `, [
      leadId,
      leadNumber,
      source,
      `Imported from Technocas CRM conversation ${conv.id}`,
      customerName,
      conv.company || null,
      conv.phone || null,
      conv.channel || conv.source || 'CRM',
      lastMessage,
      convMessages.length
    ])

    synced++
  }

  console.log(`Synced ${synced} conversations to Decoinks leads`)
  await decoinksPool.end()
  process.exit(0)
}

main().catch(async err => {
  console.error(err)
  await decoinksPool.end()
  process.exit(1)
})
