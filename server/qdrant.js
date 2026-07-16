// Thin client over the Qdrant REST API (vector DB for semantic search / RAG).
// Foundation for Phase 2+ (documents, conversation memory, recommendations).
// Docs: https://qdrant.tech/documentation/

const URL = process.env.QDRANT_URL
const KEY = process.env.QDRANT_API_KEY

export const qdrantConfigured = () => !!URL

export class QdrantClient {
  constructor() {
    if (!URL) throw new Error('QDRANT_URL not set in .env')
  }

  async request(path, { method = 'GET', body, timeoutMs = 2500 } = {}) {
    const res = await fetch(URL + path, {
      method,
      headers: { 'api-key': KEY, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),   // fail fast if Qdrant is unreachable instead of hanging
    })
    const text = await res.text()
    let data = null
    try { data = text ? JSON.parse(text) : null } catch { data = text }
    if (!res.ok) {
      const err = new Error(data?.status?.error || data?.status || `Qdrant HTTP ${res.status}`)
      err.status = res.status; err.body = data
      throw err
    }
    return data
  }

  health()           { return this.request('/healthz') }
  listCollections()  { return this.request('/collections') }
  getCollection(name){ return this.request(`/collections/${encodeURIComponent(name)}`) }

  // Create a collection if it doesn't exist (default OpenAI embedding size 1536, cosine).
  async ensureCollection(name, { size = 1536, distance = 'Cosine' } = {}) {
    try { await this.getCollection(name); return { existed: true } }
    catch (e) {
      if (e.status !== 404) throw e
      await this.request(`/collections/${encodeURIComponent(name)}`, {
        method: 'PUT',
        body: { vectors: { size, distance } },
      })
      return { created: true }
    }
  }

  // Index a payload field so it can be filtered fast (keyword/integer/text/bool…).
  createPayloadIndex(name, field, schema = 'keyword') {
    return this.request(`/collections/${encodeURIComponent(name)}/index?wait=true`, {
      method: 'PUT',
      body: { field_name: field, field_schema: schema },
    })
  }

  // points: [{ id, vector:[...], payload:{...} }]
  upsert(name, points) {
    return this.request(`/collections/${encodeURIComponent(name)}/points?wait=true`, {
      method: 'PUT',
      body: { points },
    })
  }

  // Fetch specific points by id (with payload, no vectors).
  async retrieve(name, ids) {
    const d = await this.request(`/collections/${encodeURIComponent(name)}/points`, {
      method: 'POST',
      body: { ids, with_payload: true, with_vector: false },
    })
    return d?.result || []
  }

  // vector: number[]; returns nearest points with payload
  search(name, vector, { limit = 5, filter } = {}) {
    return this.request(`/collections/${encodeURIComponent(name)}/points/search`, {
      method: 'POST',
      body: { vector, limit, with_payload: true, filter },
    })
  }
}
