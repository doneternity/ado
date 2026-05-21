# ADO

> AI API gateway — one key, every model.

Sign up, get an API key, and call Claude, Gemini, DeepSeek, and more through a single OpenAI-compatible `/v1` endpoint.

**Live at [adoai.space](https://adoai.space)**

---

## Stack

| Layer | Service | Role |
|-------|---------|------|
| Frontend | Vercel — React + Vite | SPA, user dashboard |
| API | Koyeb — Go + chi | Auth, sessions, key management, admin |
| LLM Proxy | Supabase Edge Function | Key validation, quota, LLM forwarding (prod) |
| Database | Supabase Postgres | Users, keys, quotas, sessions |
| Cache | Upstash Redis | Rate limiting, key flash storage |

The Go backend handles auth, sessions, key issuance, and admin. The Supabase Edge Function (`supabase/functions/proxy/`) is the hot path in production. In local dev, the Go backend proxies LLM requests directly.

---

## Local Development

```bash
cp .env.example .env   # fill in GEMINI_API_KEY at minimum
docker compose up      # postgres + redis + go api + vite + nginx
```

| URL | Service |
|-----|---------|
| `http://localhost:8080` | App (via nginx) |
| `http://localhost:8081` | API |

**Running services individually**

```bash
cd backend && go run ./cmd/api   # backend only (requires .env)
cd frontend && npm run dev        # frontend only
```

**Tests**

```bash
cd backend && go test -race ./internal/...   # unit (no containers needed)
cd backend && go test -race ./tests/         # integration (testcontainers)
cd frontend && npm test -- --run             # frontend
cd frontend && npm run typecheck             # type check
```

---

## Repository Layout

```
backend/
  cmd/api/            binary entry point
  internal/
    auth/             sessions, email verification, password, Google OAuth
    config/           env-based config (caarlos0/env)
    http/             router, handlers, middleware
    keys/             API key generation and flash storage
    mailer/           Resend + console mailer
    proxy/            LLM forwarder (local dev only)
    quota/            daily usage enforcement
    store/            sqlc-generated DB queries + Redis client
  migrations/         goose SQL migrations
  tests/              integration tests (testcontainers)
frontend/
  src/
    api/              TanStack Query hooks and apiFetch client
    components/       shared UI components
    pages/            one file per route
    styles/           design tokens, global styles, mixins
supabase/
  functions/proxy/    Deno Edge Function — production LLM proxy
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
| Supabase Edge Function | CI deploys via `supabase functions deploy` |
| Frontend | CI deploys via Vercel CLI |

**Required GitHub secrets:** `SUPABASE_PROJECT_REF` `SUPABASE_ACCESS_TOKEN` `VERCEL_TOKEN` `VERCEL_ORG_ID` `VERCEL_PROJECT_ID`

The backend reads config from environment variables set in the Koyeb dashboard — see `.env.example` for the full list. `DATABASE_URL` must use the Supabase **IPv4 Session pooler** (`aws-0-eu-west-1.pooler.supabase.com:5432`), not the direct connection string.
