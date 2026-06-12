# Technocas CRM — Complete Project Document

> A real-time, AI-assisted CRM for a custom apparel print shop (**Decoinks** — hoodies, t-shirts, jerseys, DTF transfers, embroidery).
> It pulls Facebook Messenger + Instagram DMs into one inbox, auto-captures leads, and gives agents an **AI Supervisor** (analysis, recommended replies, translation, summaries) backed by OpenAI + a Qdrant vector database.

_Last updated: 2026-06-12_

---

## 1. What this project is

- A **single-inbox CRM**: every customer chat (Meta Messenger / Instagram) lands in one Dashboard.
- Each conversation is **auto-converted into a lead** (idempotent).
- Agents get an **AI Supervisor** panel beside every chat: intent, sentiment, recommended reply, translation, conversation summary, agent scoring.
- All data lives in a **remote PostgreSQL** database; every message is also embedded into **Qdrant** for semantic search / AI memory.

---

## 2. Tech stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18 + Vite 5 + React Router 6 + TailwindCSS 3 |
| **Backend** | Node.js (ESM) + Express |
| **Primary DB** | PostgreSQL (`pg` driver) |
| **Vector DB** | Qdrant (REST API) |
| **AI** | OpenAI — `gpt-4o-mini` (chat) + `text-embedding-3-small` (embeddings, 1536-dim) |
| **Realtime** | SSE (`/api/stream`) + polling (conversations 4s, Meta pull 10s) |
| **Auth** | JWT (bcrypt password hashing) |
| **Deploy** | Docker Compose (nginx frontend + Node backend) |

---

## 3. Architecture (high level)

```
 Facebook Messenger / Instagram DM
              │  (Graph API: pull every 10s + webhook)
              ▼
   ┌───────────────────────────┐        ┌──────────────────────┐
   │  Express backend (Node)    │──────▶ │  PostgreSQL           │
   │  server/index.js           │  R/W   │  decoinks_db          │
   │                            │        │  31.97.110.197:5436   │
   │  - in-memory cache         │        └──────────────────────┘
   │  - write-through to PG     │
   │  - OpenAI calls            │──────▶ ┌──────────────────────┐
   │  - Qdrant upsert/search    │        │  Qdrant (vectors)     │
   └───────────────────────────┘        │  31.97.110.197:6333   │
              ▲                          └──────────────────────┘
              │  REST /api  +  SSE /api/stream
              ▼
   ┌───────────────────────────┐
   │  React frontend (Vite)     │
   │  Dashboard + pages         │
   └───────────────────────────┘
```

**Data store pattern (`server/db.js`):** On boot the backend connects to Postgres, ensures the schema, and **loads every row into an in-memory cache**. Reads are served from memory (instant, synchronous). Writes update memory immediately **and** write through to Postgres on an independent (non-blocking) queue, so a slow remote write never blocks the UI.

---

## 4. Databases — where & what

### 4.1 PostgreSQL (primary)

| | |
|---|---|
| **Type** | PostgreSQL (Docker container `decoinks-postgres`) |
| **Host** | `31.97.110.197` port **5436** |
| **Database** | `decoinks_db` |
| **User** | `decoinks` |
| **Connection** | `server/.env` → `DATABASE_URL` (gitignored, never committed) |
| **Pool** | max 12, 5s connect timeout, 8s query/statement timeout |

**Schema (Phase 1 — pragmatic):** one table per resource, each row =
`id TEXT PRIMARY KEY · doc JSONB · created_at TIMESTAMPTZ · updated_at TIMESTAMPTZ`.
All the real fields live inside the JSONB `doc`. (Phase 2 will normalize these into typed columns.)

Two extra key/value tables: `settings (key, value)` and `meta_kv (key, value)`.

#### Tables & the fields saved in each `doc`

| Table | Rows* | Fields stored in `doc` |
|---|---|---|
| **users** | 2 | `id, name, email, role, password_hash, created_at` |
| **customers** | 12 | `id, name, company, email, phone, channel, tier, type, spend, orders, health, health_label, owner, loc, role, last_order, activity_days, activity_ago, avatar, initials, created_at` |
| **conversations** | 113 | `id, name, phone, company, channel, source, status, status_bg, status_icon, unread, bookmarked, assigned_to, customer_id, last_ts, list_preview, list_time, avatar_bg, channel_bg, initials, profile_pic, meta_recipient_id, created_at` · **+ AI cache:** `summary, summary_count, summary_at` |
| **messages** | 1899 | `id, conversation_id, dir` (`in`/`out`/`note`)`, text, via, time, agent, created_at` |
| **leads** | 113 | `id, name, company, agent, status, statusCls, score, units, value, product, pipeline, pipelineCls, badge, source, source_type, conversation_id, av, initials, created, createdTime, created_at` |
| **notes** | 3 | `id, customer_id, title, body, category, author, pinned, date, created_at` |
| **receipts** | 8 | `id, receipt_no, order_no, customer, customer_orders, amount, method, method_icon, status, date, time, note, note2, created_at` |
| **artworks** | 8 | `id, name, type, product, order_no, customers, date, fav, bg, created_at` |
| **orders** | 0 | (defined, empty) `order_no, products, …` |
| **payments** | 0 | (defined, empty) `invoice_no, order_no, description, …` |
| **webhook_events** | 0+ | `id, source, received_at, event` (raw Meta webhook payloads) |
| **settings** | — | key `app_settings` → `{ business{…}, notifications{…} }` |
| **meta_kv** | — | `_autoinc` counters; Meta tokens/page info |

\* row counts as of the last check.

### 4.2 Qdrant (vector DB)

| | |
|---|---|
| **Host** | `31.97.110.197` port **6333** |
| **Connection** | `server/.env` → `QDRANT_URL`, `QDRANT_API_KEY` |

| Collection | Vector | Purpose | Payload |
|---|---|---|---|
| **`crm_messages`** | 1536 (cosine) | **Every chat message** is embedded → semantic search / AI memory. Auto-ingested on each message insert; 1757 existing backfilled. | `message_id, conversation_id, dir, via, time, text, created_at` |
| **`documents`** | 1536 (cosine) | Knowledge-base snippets for RAG (used by AI analysis & recommended replies). | `text, title, category, language, author, access_level, doc_id` |

Point IDs for messages = deterministic md5→UUID of the message id, so re-ingesting updates rather than duplicates.

---

## 5. Backend API (`server/index.js`, port 3001)

All `/api/*` routes except login, health, and webhooks require a **JWT** (`Authorization: Bearer <token>`).

### Auth & users
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/login` | Email + password → JWT |
| GET | `/api/auth/me` | Current user |
| PATCH | `/api/auth/me` | Update own name/role |
| POST | `/api/auth/password` | Change password |
| GET/POST | `/api/users` | List / create team members |
| PATCH/DELETE | `/api/users/:id` | Edit / remove (can't delete self) |

### Generic CRUD (auto-generated for each resource)
`GET /api/<r>` (list + `?search=` + field filters) · `GET /api/<r>/:id` · `POST /api/<r>` · `PATCH /api/<r>/:id` · `DELETE /api/<r>/:id`
for **`customers, leads, notes, orders, payments, receipts, artworks, conversations`**.

### Conversations & messages
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/conversations/:id/messages` | Messages of a conversation (chat order) |
| POST | `/api/conversations/:id/messages` | Add a message/note (also → Qdrant) |
| POST | `/api/conversations/:id/read` | Mark read (clear unread) |
| GET | `/api/stats/dashboard` | Dashboard counters |

### Meta (Facebook / Instagram)
`GET /api/meta/status` · `POST /api/meta/connect` · `POST /api/meta/connect-app` · `POST /api/meta/disconnect` · `POST /api/meta/send` · `POST /api/meta/lookup` · `POST /api/meta/sync` (manual pull) · `GET|POST /api/webhooks/meta` (verify + receive).
Background poller pulls Messenger/Instagram conversations **every 10s** and auto-captures leads.

### ManyChat (legacy / optional)
`/api/manychat/status|connect|disconnect|page|send|lookup`, `/api/manychat/subscribers/:id`, `/api/webhooks/manychat`.

### Leads
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/leads/backfill` | Convert all existing conversations → leads |

### AI Supervisor & vectors
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/ai/status` | Is OpenAI/Qdrant configured |
| GET | `/api/ai/analyze/:id` | Full analysis (intent, sentiment, insights, scores, objections, lead prediction, recommended reply) + RAG |
| POST | `/api/ai/recommend-reply/:id` | Reply to **unanswered** customer messages (after agent's last reply) |
| GET | `/api/ai/summary/:id` | Return **cached** conversation summary (+ new-message count) |
| POST | `/api/ai/summary/:id` | Generate (full) or **incrementally update** + save summary |
| POST | `/api/ai/translate-assist` | Explain last message in simple English + suggest reply (EN + native) |
| POST | `/api/translate` | Translate text (OpenAI, MyMemory fallback) |
| POST | `/api/ai/ingest` | Add a Knowledge-Base doc → Qdrant `documents` |
| POST | `/api/ai/ingest-messages` | Backfill all messages → Qdrant `crm_messages` |
| GET | `/api/qdrant/status` | Qdrant health + collections |

### Settings & misc
`GET|PUT /api/settings` (business + notifications) · `GET /api/stream` (SSE realtime) · `GET /api/health`.

---

## 6. Frontend pages (routes)

| Route | Page | What it does |
|---|---|---|
| `/` | **Login** | Email + password → JWT |
| `/dashboard` | **Dashboard** | ⭐ Main 3-panel inbox: filters · chat · AI Supervisor |
| `/inbox` | → redirects to `/dashboard` | |
| `/customers` | **Customers** | Customer list (search/filter) |
| `/customer-360` | **Customer 360** | Full customer profile (currently hidden from sidebar) |
| `/leads` | **Leads** | Lead pipeline list |
| `/leads/:id` | **Lead Details** | Single lead |
| `/orders` | **Orders** | Orders list |
| `/receipts` | **Receipts** | Receipts list |
| `/follow-ups` | **Follow-Ups** | Follow-up tasks |
| `/campaigns` | **Campaigns** | Campaigns |
| `/reports` | **Reports** | Reporting |
| `/settings` | **Settings** | Business + notification settings |
| `/team` | **Team** | Team CRUD (create login accounts, roles) |
| `/artwork-vault` | **Artwork Vault** | Saved artwork |
| `/connect-meta` | **Meta Connect** | Connect Facebook/Instagram |
| `/integrations` | **Integrations** | Integration setup |

All routes except `/` are protected by `<RequireAuth>`.

### The Dashboard (most important page)

Three resizable panels:

1. **Filters / conversation list** — search, **All Inboxes** (channel) dropdown, and a **Filters** form: Channel, Agent, Lead Status, Tags, Date From/To, plus Latest/Oldest sort and view tabs (All / Unassigned / Mentions / Bookmarks). All filter the live backend list.
2. **Conversation** — chat thread; send replies (routed to Meta for Meta convs), notes, status, bookmark, assign-to-me.
3. **AI Supervisor** — tabbed:
   - **Responses** — ✨ AI Recommended Reply (answers the **unanswered** customer messages, auto-refreshes on new messages) + quick-send panels.
   - **Translation** — auto-explains the last customer message in simple English + suggests reply (EN + native; editable, native auto-updates).
   - **Summary** — button-generated, **saved**, **incremental** conversation summary (overview, key points, status, next step) so any agent can take over.
   - **Actions** — agent professionalism score, AI interpretation, suggested actions, missing info.
   - **Designer Jobs** — designer tasks.
   - **Intent & Insights** — agent performance matrices, detected intent, customer insights, sentiment, objections, lead prediction, last activity.

---

## 7. Key components & libs (frontend)

`components/` — `RequireAuth` (route guard) · `TopBarUser` (dynamic user avatar/role) · `BackButton` · `SidebarCrm` (nav; CRM-360 section currently hidden) · `Dropdown` · `ToastContext`.
`lib/` — `api.js` (get/post/put/patch/delete with JWT) · `auth.js` (currentUser/signIn/signOut).

---

## 8. Backend file map (`server/`)

| File | Role |
|---|---|
| `index.js` | All Express routes, Meta polling, AI endpoints, lead capture, message→Qdrant ingest |
| `db.js` | PostgreSQL store (in-memory cache + write-through), same sync API as before |
| `ai.js` | OpenAI helper — `embed()`, `chatJSON()`, `chatText()` |
| `qdrant.js` | Qdrant REST client — ensureCollection, upsert, search, payload index |
| `meta.js` | Meta Graph API client (conversations, send, profiles, token exchange) |
| `manychat.js` | ManyChat client (legacy) |
| `migrate-to-pg.js` | One-time `data.json` → Postgres migration |
| `seed.js`, `qdrant-setup.js` | Seeding / Qdrant bootstrap |

---

## 9. Authentication

- Login → bcrypt-verified → **JWT** returned, stored client-side, sent as `Authorization: Bearer`.
- Roles per user (team page manages accounts). A user can't delete themselves.
- Default login: `info@technocas.com`.

---

## 10. Environment variables (`server/.env` — gitignored)

```
DATABASE_URL=postgresql://decoinks:<password>@31.97.110.197:5436/decoinks_db
QDRANT_URL=http://31.97.110.197:6333
QDRANT_API_KEY=<key>
OPENAI_API_KEY=<key>
# optional: OPENAI_CHAT_MODEL, OPENAI_EMBED_MODEL, PORT, JWT secret
```

**Secrets never get committed** — `.env`, `server/.env`, and `server/data.json*` are gitignored.

---

## 11. Running locally

```bash
npm install            # frontend deps
npm run server:install # backend deps
npm run dev:all        # backend (3001) + Vite frontend (5173) together
```

Open **http://localhost:5173** · API at **http://localhost:3001**.
Backend scripts: `npm run dev` (watch), `start`, `seed`, `migrate`, `qdrant:setup`.

---

## 12. Deployment (Docker, server 31.97.110.197)

Two containers via `docker-compose.yml`:
- **frontend** — Vite build served by **nginx** (port **8190:80**), proxies `/api` → backend.
- **backend** — Node, reads `server/.env`, reaches DB/Qdrant via `host.docker.internal`.

```bash
cd ~/technocas-crm
git pull
docker compose up -d --build
docker compose logs -f backend   # "Postgres connected" + "API running"
```

Open **http://31.97.110.197:8190**. (See `DEPLOY.md` for first-time setup.)
Repo: https://github.com/RahulAi2004/Technoas-Crm

---

## 13. Core data flows

**Incoming message → lead → AI**
1. Poller (10s) or webhook receives a Messenger/Instagram message.
2. Conversation is upserted; a **lead is auto-created** (idempotent by conversation id).
3. Message saved to Postgres **and** embedded into Qdrant `crm_messages`.
4. Frontend polls (4s) and shows it; AI Supervisor can analyze, summarize, or draft a reply.

**Agent reply**
1. Agent sends from the chat or accepts an AI Recommended Reply.
2. For Meta conversations it goes out via the Graph API (`/api/meta/send`); a copy is saved + embedded.

**AI Recommended Reply** — looks only at the customer messages **after the agent's last reply** (the unanswered ones), uses the full chat + Knowledge Base as context, replies in the customer's language. No-op (no AI cost) when the agent has already replied to the latest message.

**Conversation Summary** — generated on demand, **persisted on the conversation** (`summary`, `summary_count`, `summary_at`). Re-runs are **incremental**: only the new messages since the last summary are sent to the model and merged in.

---

## 14. The bigger vision (roadmap)

Current state is **Phase 1**: app moved from a JSON file to remote PostgreSQL + Qdrant, with AI features live.

Documented long-term architecture: Channels → Chatwoot → n8n → OpenAI → PostgreSQL + pgvector → Qdrant (RAG) → NestJS → React, with ~36 normalized tables, per-customer AI memory, and 3-tier support.
**Phase 2** = normalize the JSONB `doc` tables into typed columns; later phases add pgvector, n8n automation, and deeper AI/RAG.

---

## 15. Security notes

- Postgres/Qdrant ports are currently **exposed directly** on the public server IP — plan to move the app onto the server or use an SSH tunnel / firewall.
- All API secrets live only in `server/.env` (gitignored). Never print tokens in screenshots or logs.
- JWT + bcrypt for auth; passwords stored only as `password_hash`.
```
