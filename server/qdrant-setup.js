// Create the Qdrant collections + payload indexes for the AI layer.
// Run with:  node --env-file=.env qdrant-setup.js   (or: npm run qdrant:setup)
//
// Collections (per the architecture docs):
//   documents      → RAG / Knowledge Base (product, pricing, FAQ, SOPs, replies)
//   conversations  → per-customer chat memory (semantic recall)
//   user_profiles  → personalization / customer summaries
// All use 1536-dim vectors (OpenAI text-embedding-3-small) + Cosine distance.
import { QdrantClient } from './qdrant.js'

const q = new QdrantClient()
const SIZE = 1536

const COLLECTIONS = {
  documents:     ['doc_id', 'category', 'language', 'author', 'access_level'],
  conversations: ['conversation_id', 'customer_id', 'channel', 'role'],
  user_profiles: ['customer_id'],
}

const existing = new Set(((await q.listCollections()).result.collections || []).map((c) => c.name))

for (const [name, fields] of Object.entries(COLLECTIONS)) {
  if (existing.has(name)) {
    console.log(`• exists  collection: ${name}`)
  } else {
    await q.request(`/collections/${encodeURIComponent(name)}`, {
      method: 'PUT', body: { vectors: { size: SIZE, distance: 'Cosine' } },
    })
    console.log(`✓ created collection: ${name}`)
  }
  for (const f of fields) {
    try { await q.createPayloadIndex(name, f, 'keyword'); console.log(`    └ index: ${f}`) }
    catch (e) { console.log(`    └ index ${f}: ${e.message}`) }
  }
}

const cols = await q.listCollections()
console.log('\n✅ Qdrant collections ready:', (cols.result.collections || []).map((c) => c.name).join(', '))
