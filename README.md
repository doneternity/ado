# ADO

> AI API gateway — one key, every model.

Sign up, get an API key, and call Claude, Gemini, DeepSeek, and more through a single OpenAI-compatible `/v1` endpoint.

**Live at [adoai.space](https://adoai.space)**
 
---

## Stack

| Layer | Service | Role |
|-------|---------|------|
| Frontend | Vercel — React + Vite | SPA, user dashboard |
| API + LLM Proxy | Koyeb — Go + chi | Auth, sessions, key management, admin, and the LLM proxy with provider failover |
| Database | Supabase Postgres | Users, keys, quotas, sessions |
| Cache | Upstash Redis | Rate limiting, key flash storage |

The Go backend handles everything: auth, sessions, key issuance, admin, and the LLM proxy. Vercel rewrites `adoai.space/v1/*` and `/api/*` to the Koyeb backend (see `frontend/vercel.json`), so the Go service is the single live request path.

---

## Local Development

```bash
cp .env.example .env   # set PROVIDER_KEY_SECRET (32+ bytes) and the DISCORD_* vars
docker compose up      # postgres + redis + go api + vite + nginx
```

Sign-in is Discord-only, so you need a Discord app whose redirect URL is
`http://localhost:8080/api/auth/discord/callback`. Set `ADMIN_BOOTSTRAP_EMAIL` to your
Discord email to become admin on first login, then add LLM providers at `/admin/providers`.
Provider keys are encrypted with `PROVIDER_KEY_SECRET`, so changing that secret means
re-entering them.

| URL | Service |
|-----|---------|
| `http://localhost:8080` | App (via nginx) |
| `http://localhost:8081` | API |

**Running services individually**

```bash
cd backend && go run ./cmd/api   # backend only (env vars must be exported; .env is not auto-loaded)
cd frontend && npm run dev        # frontend only
```

Outside compose, point `DATABASE_URL` / `REDIS_URL` at `localhost` instead of `postgres` / `redis`.
The backend runs goose migrations from `./migrations` on startup.

**Tests**

```bash
cd backend && go test -race ./internal/...   # unit (no containers needed)
cd backend && go test -race ./tests/         # integration (testcontainers, needs Docker)
cd frontend && npm test -- --run             # frontend
cd frontend && npm run typecheck             # type check
```

---

## Repository Layout

```
backend/
  cmd/api/            binary entry point
  internal/
    apperr/           typed API errors
    auth/             sessions, password hashing, Discord OAuth
    config/           env-based config (caarlos0/env)
    http/             router, handlers, middleware
    keyencrypt/       AES-GCM encryption for stored provider keys
    keys/             API key generation and flash storage
    proxy/            LLM forwarder: provider registry, failover, model health
    quota/            daily usage enforcement
    store/            sqlc-generated DB queries + Redis client
    validate/         request validation
  migrations/         goose SQL migrations
  tests/              integration tests (testcontainers)
frontend/
  src/
    api/              TanStack Query hooks and apiFetch client
    components/       shared UI components
    pages/            one file per route
    styles/           design tokens, global styles, mixins
nginx/
  nginx.dev.conf      local dev reverse proxy
Dockerfile            Go backend image (Koyeb + CI)
docker-compose.yml    local dev stack
```

---

## Deployment

Pushes to `main` trigger GitHub Actions (`.github/workflows/`):

| Target | Method |
|--------|--------|
| Go backend | Koyeb auto-deploys via GitHub App — no CI job needed |
| Frontend | CI deploys via Vercel CLI |

**Required GitHub secrets:** `VERCEL_TOKEN` `VERCEL_ORG_ID` `VERCEL_PROJECT_ID`

The backend reads config from environment variables set in the Koyeb dashboard — see `.env.example` for the full list. `DATABASE_URL` must use the Supabase **Session pooler** (port 5432), not the direct connection (IPv6-only) or the transaction pooler (breaks prepared statements). Copy it from Supabase → Connect → Direct → Session pooler; the pooler host can change after a project is paused and restored.

### Staying alive

| What | How |
|------|-----|
| `/api/health` | Cheap liveness check for Koyeb. Touches nothing. |
| `/api/health/deep` | Runs a query on Postgres and pings Redis; 503 if either fails. |
| `keepalive.yml` | Daily GitHub Action that calls `/api/health/deep`, so Supabase (pauses after ~7 idle days) and Upstash (deletes inactive DBs) see activity. It re-enables itself so GitHub's 60-day schedule shutoff doesn't apply. |
| Provider monitor | Pings every provider's `/models` every `PROVIDER_CHECK_INTERVAL_SECONDS`; posts to `ALERT_WEBHOOK_URL` (Discord) when one goes down or recovers. |
