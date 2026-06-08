# OrqAI — Async Job Orchestration Platform

A backend infrastructure layer for async AI workloads. Accepts jobs via REST API, queues them with priority lanes, processes them via workers, and streams real-time status updates over WebSocket.

**Not a chatbot wrapper. Not a prompt API. A job queue with a proper lifecycle.**

---

## What's built

| Layer | Technology |
|---|---|
| API | Fastify v5 |
| Queue | BullMQ v5 + Redis |
| Database | PostgreSQL (via `pg`) |
| Migrations | `node-pg-migrate` |
| Schema validation | Zod v4 |
| Logging | Pino (JSON in prod, pretty in dev) |
| Real-time | WebSocket (`@fastify/websocket`) |
| Deploy | Railway (single dyno — server + worker same process) |

---

## Job lifecycle

```
POST /jobs
    │
    ▼
[PENDING] ──── worker picks up ────► [PROCESSING]
                                           │
                          ┌────────────────┴──────────────────┐
                          ▼                                   ▼
                     [COMPLETED]                         [FAILED]
                                                             │
                                              more attempts available?
                                                   │              │
                                                  YES             NO
                                                   │              │
                                            retry (backoff)  [DEAD_LETTERED]
                                                                  │
                                              POST /jobs/:id/retry
                                                                  │
                                                            [PENDING] (again)
```

---

## Job types & retry config

| Type | Max Attempts | Backoff |
|---|---|---|
| `EMBEDDING` | 5 | Exponential, 1s base |
| `LLM` | 3 | Exponential, 1s base |
| `DOCUMENT_PROCESS` | 2 | Exponential, 500ms base |

Configured in `src/config/retryConfig.js` — single source of truth. Not overridable per-request.

---

## API Reference

### `POST /jobs`

Submit a new job.

**Request body:**
```json
{
  "type": "EMBEDDING",
  "priority": "HIGH",
  "payload": { "text": "your input here" },
  "idempotency_key": "optional-unique-key"
}
```

| Field | Type | Required | Values |
|---|---|---|---|
| `type` | string | ✅ | `EMBEDDING`, `LLM`, `DOCUMENT_PROCESS` |
| `priority` | string | ❌ | `HIGH`, `DEFAULT` (default: `DEFAULT`) |
| `payload` | object | ✅ | Any JSON object |
| `idempotency_key` | string | ❌ | Any unique string — same key returns existing job |

**Responses:**
- `201` — job created
- `200` — existing job returned (idempotency key matched)
- `400` — validation failed

---

### `GET /jobs/:id`

Get a single job by ID.

**Response:**
```json
{
  "id": "uuid",
  "type": "EMBEDDING",
  "status": "COMPLETED",
  "priority": "HIGH",
  "payload": { "text": "..." },
  "result": { "stub": true },
  "attempts": 1,
  "max_attempts": 5,
  "idempotency_key": "my-key",
  "created_at": "2026-06-08T00:00:00Z",
  "updated_at": "2026-06-08T00:00:01Z"
}
```

- `200` — job found
- `404` — job not found

---

### `GET /jobs`

List jobs with optional filters.

**Query params:**

| Param | Values |
|---|---|
| `status` | `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, `DEAD_LETTERED` |
| `type` | `EMBEDDING`, `LLM`, `DOCUMENT_PROCESS` |
| `priority` | `HIGH`, `DEFAULT` |

Returns up to 50 jobs, ordered by `created_at DESC`.

---

### `POST /jobs/:id/retry`

Requeue a dead-lettered job. Resets `status → PENDING`, `attempts → 0`, `result → null`. Preserves `idempotency_key`.

- `200` — job reset and requeued
- `404` — job not found
- `409` — job is not `DEAD_LETTERED`

---

### `GET /health`

Liveness check used by Railway's healthcheck.

```json
{ "status": "ok", "uptime": 42 }
```

---

### `WS /jobs/:id/status`

WebSocket stream for real-time status updates.

Connect: `ws://your-host/jobs/:id/status`

**Messages received:**
```json
{ "jobId": "uuid", "subscribed": true, "timestamp": "..." }
{ "jobId": "uuid", "status": "PROCESSING", "timestamp": "..." }
{ "jobId": "uuid", "status": "COMPLETED", "timestamp": "..." }
```

Socket closes automatically when a terminal status (`COMPLETED`, `FAILED`, `DEAD_LETTERED`) is received.

> ⚠️ Requires server and worker running in the **same process** (`npm run combined`). In separate-process deployments, upgrade to Redis pub/sub (Phase 6).

---

## Database schema

Table: `jobs`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK, auto-generated |
| `type` | `text` | `EMBEDDING`, `LLM`, `DOCUMENT_PROCESS` |
| `status` | `text` | `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, `DEAD_LETTERED` |
| `priority` | `text` | `HIGH`, `DEFAULT` |
| `payload` | `jsonb` | Job input — arbitrary JSON |
| `result` | `jsonb` | Worker output — null until completed |
| `attempts` | `integer` | Incremented by worker on each pickup |
| `max_attempts` | `integer` | From `retryConfig.js` |
| `idempotency_key` | `text` | Unique — null allowed |
| `created_at` | `timestamptz` | Auto-set on insert |
| `updated_at` | `timestamptz` | Updated on every status change |

Migrations are managed by `node-pg-migrate`. Files live in `src/db/migrations/`. Run with `npm run migrate`.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `REDIS_URL` | ✅ | Redis connection string |
| `NODE_ENV` | ❌ | `development`, `production`, `test` (default: `development`) |
| `PORT` | ❌ | HTTP port (default: `3000`) |
| `LOG_LEVEL` | ❌ | `trace`, `debug`, `info`, `warn`, `error`, `fatal` (default: `info`) |

Copy `.env.example` to `.env` for local development.

---

## Local development

**Prerequisites:** Node.js ≥20, Docker (for Redis), PostgreSQL installed locally

```bash
# 1. Install dependencies
npm install

# 2. Copy env file and fill in values
cp .env.example .env

# 3. Start Redis via Docker
docker compose up -d

# 4. Run database migrations
npm run migrate

# 5a. Run API server and worker separately (two terminals)
npm run dev       # Terminal 1 — Fastify server with nodemon
npm run worker    # Terminal 2 — BullMQ worker

# 5b. Or run both in one process (required for WebSocket testing)
npm run combined
```

---

## Project structure

```
src/
  config/
    index.js          ← Zod env validation (exits on missing vars)
    retryConfig.js    ← Per-job-type retry policy (single source of truth)
  controllers/
    jobController.js  ← Route handlers — thin, no business logic
  services/
    jobService.js     ← Business logic — validation, idempotency, orchestration
  repositories/
    jobRepository.js  ← All DB queries
  queues/
    jobQueue.js       ← BullMQ queue definitions, enqueueJob()
  workers/
    jobWorker.js      ← BullMQ consumer — status transitions, dead-letter
  jobs/
    embeddingJob.js   ← EMBEDDING handler (stub — Phase 4)
    llmJob.js         ← LLM handler (stub — Phase 4)
    documentProcessJob.js ← DOCUMENT_PROCESS handler (stub — Phase 4)
  routes/
    jobRoutes.js      ← REST routes
    wsRoutes.js       ← WebSocket route
  utils/
    logger.js         ← Pino logger
    jobEvents.js      ← In-process EventEmitter for WS status stream
  db/
    pool.js           ← Shared pg.Pool
    migrations/       ← node-pg-migrate migration files
  app.js              ← Fastify app factory
  server.js           ← Standalone server entry point
  worker.js           ← Standalone worker entry point
  combined.js         ← Single-process entry point (server + worker)
tests/
  priority.test.js    ← Priority lane verification
  phase2.verify.js    ← Retry config + dead-letter endpoint verification
  ws.test.js          ← WebSocket stream verification
```

---

## Deploy to Railway

**1. Add services in Railway dashboard:**
- **New → Database → PostgreSQL** — auto-generates `DATABASE_URL`
- **New → Database → Redis** — auto-generates `REDIS_URL`

**2. Set variables on your OrqAI service:**

| Variable | Value |
|---|---|
| `DATABASE_URL` | Reference → Postgres service → `DATABASE_URL` |
| `REDIS_URL` | Reference → Redis service → `REDIS_URL` |
| `NODE_ENV` | `production` |

**3. Push to GitHub** — Railway redeploys automatically.

The `railway.toml` configures:
- Start command: runs migrations then starts the combined server+worker
- Healthcheck: `GET /health` with 30s timeout
- Restart policy: on failure, max 3 retries

> Migrations are **idempotent** — safe to run on every deploy. Already-applied migrations are skipped.

---

## Running tests

Tests require a running server + worker + Redis + Postgres.

```bash
# Start combined mode first
npm run combined

# In another terminal
node tests/priority.test.js    # Priority lane verification (3 assertions)
node tests/phase2.verify.js    # Retry config + dead-letter (12 assertions)
node tests/ws.test.js          # WebSocket stream (8 assertions)
```

---

## What the job handlers actually do (current state)

All three handlers (`EMBEDDING`, `LLM`, `DOCUMENT_PROCESS`) are **stubs** — they return mock results immediately:

```json
{ "stub": true, "processedAt": "2026-06-08T...", "jobId": "..." }
```

Real handler implementations (OpenAI, vector DB, document parsing) are planned for Phase 4. The orchestration layer, queue, DB, retry logic, and WebSocket stream are all production-ready.

---

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 — Core job system | Fastify API, BullMQ queues, PostgreSQL, worker, idempotency | ✅ Done |
| 2 — Priority + reliability | Priority lanes, per-type retry config, dead-letter retry, WebSocket | ✅ Done |
| 3 — Metering & quotas | Per-tenant rate limiting, usage tracking | Planned |
| 4 — Real handlers | OpenAI embeddings, LLM calls, document processing | Planned |
| 5 — Observability | Prometheus metrics, structured tracing | Planned |
| 6 — Scale-out | Redis pub/sub for WS, separate worker dyno | Planned |
