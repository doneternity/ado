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

The Go backend handles everything: auth, sessions, key issuance, admin, and the LLM proxy. Vercel proxies `adoai.space/v1/*` and `/api/*` to the Koyeb backend (see `frontend/vercel.json`), so the Go service is the single live request path. Vercel adds a secret header (`ORIGIN_SECRET`) to each proxied request, and the backend rejects requests without it, so nobody can skip Vercel and fake their IP to dodge rate limits.

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

Pushes to `main` run CI. Only when CI passes does `deploy.yml` ship that exact commit:

| Target | Method |
|--------|--------|
| Go backend | Koyeb redeploy API (`KOYEB_TOKEN` secret, `KOYEB_SERVICE_ID` variable). Koyeb's own autodeploy must be **off**, or it ships untested commits. |
| Frontend | Vercel CLI |

**GitHub secrets:** `VERCEL_TOKEN` `VERCEL_ORG_ID` `VERCEL_PROJECT_ID` `KOYEB_TOKEN` `ALERT_WEBHOOK_URL` `BACKUP_DATABASE_URL`<br>
**GitHub variables:** `KOYEB_SERVICE_ID` `BACKUP_AGE_RECIPIENT`<br>
**Vercel and Koyeb:** the same `ORIGIN_SECRET` in both. To rotate it, set Koyeb to `new,old`, then change Vercel and redeploy, then set Koyeb to `new`.

The backend reads config from environment variables set in the Koyeb dashboard — see `.env.example` for the full list. `DATABASE_URL` must use the Supabase **Session pooler** (port 5432), not the direct connection (IPv6-only) or the transaction pooler (breaks prepared statements). Copy it from Supabase → Connect → Direct → Session pooler; the pooler host can change after a project is paused and restored.

### Backups

`backup.yml` runs nightly: it dumps the app's tables (`public` schema) with `pg_dump`, encrypts the file with [age](https://github.com/FiloSottile/age), and keeps it as a workflow artifact for 30 days. The repo is public, so only the encrypted file is ever uploaded. The private key lives offline with the owner, never in GitHub. A failed backup posts to Discord.

Restoring (into a fresh Supabase project, or the same one after a bad migration):

1. Download the artifact from Actions > Database backup > the run you want, and unzip it.
2. Decrypt it: `age --decrypt --identity ado-backup-key.txt --output ado.dump ado-YYYY-MM-DD.dump.age`
3. Pause the Koyeb service so nothing writes during the restore. Then, with a `pg_restore` at least as new as the server and the Session pooler URL, restore everything except the `public` schema itself (Supabase owns it):
   ```bash
   pg_restore --list ado.dump | grep -v -E 'SCHEMA - public|COMMENT - SCHEMA public' > restore.list
   pg_restore --no-owner --no-privileges --clean --if-exists --use-list restore.list --dbname "$DATABASE_URL" ado.dump
   ```
4. Resume the service. Goose sees the restored `goose_db_version` table and only runs newer migrations.

Test a restore into a scratch database now and then. A backup nobody has restored is a guess.

### Staying alive

| What | How |
|------|-----|
| `/api/health` | Cheap liveness check for Koyeb. Touches nothing. |
| `/api/health/deep` | Runs a query on Postgres and pings Redis; 503 if either fails. |
| `monitor.yml` | GitHub Action every 10 minutes: checks the site and `/api/health/deep`, posts to Discord (`ALERT_WEBHOOK_URL` secret) when it goes down or recovers. Also keeps Supabase (pauses after ~7 idle days) and Upstash (deletes inactive DBs) active, and re-enables itself so GitHub's 60-day schedule shutoff doesn't apply. |
| `/api/admin/request-info` | Admin-only: how the backend sees your request (client IP, proxy headers) and a live rate-limiter test. Use it to set `CLIENT_IP_HEADER` / `TRUSTED_PROXY_HOPS`. |
| Error alerts | Website crashes are reported to `/api/client-errors` and stored next to server 5xx errors (Admin > Errors). 10 server errors or 5 crashes within 5 minutes post one Discord alert, then it waits an hour. |
| Provider monitor | Pings every provider's `/models` every `PROVIDER_CHECK_INTERVAL_SECONDS`; posts to `ALERT_WEBHOOK_URL` (Discord) when one goes down or recovers. |
