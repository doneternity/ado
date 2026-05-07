# Deploy Guide

ADO runs as a single co-located container (nginx + Go API) on Fly.io, with Cloudflare in front.

## Prerequisites

- [flyctl](https://fly.io/docs/hands-on/install-flyctl/) installed and authenticated (`flyctl auth login`)
- A Cloudflare-managed domain
- Resend API key, Google OAuth credentials, Gemini API key

---

## 1. Create the Fly app

```bash
flyctl apps create ado
```

## 2. Provision Postgres (Neon)

Sign up at [neon.tech](https://neon.tech) (free, no card required):
1. Create a project — name `ado`, Postgres 16, region **AWS US East 1 (N. Virginia)**
2. Copy the **pooled connection string** from the project dashboard
3. Set the secret:

```bash
flyctl secrets set DATABASE_URL='postgresql://...'
```

Then run migrations locally (install goose once: `go install github.com/pressly/goose/v3/cmd/goose@latest`):

```bash
goose -dir backend/migrations postgres "$DATABASE_URL" up
```

## 3. Provision Redis (Upstash)

Sign up at [upstash.com](https://upstash.com), create a free Redis database, copy the `rediss://` URL, then:

```bash
flyctl secrets set REDIS_URL='rediss://...'
```

## 4. Set remaining secrets

```bash
flyctl secrets set \
  GOOGLE_OAUTH_CLIENT_ID='...' \
  GOOGLE_OAUTH_CLIENT_SECRET='...' \
  GOOGLE_OAUTH_REDIRECT_URL='https://<your-domain>/api/auth/google/callback' \
  GEMINI_API_KEY='...' \
  RESEND_API_KEY='...' \
  MAIL_FROM='ADO <noreply@<your-domain>>' \
  APP_BASE_URL='https://<your-domain>'
```

## 5. Add FLY_API_TOKEN to GitHub

```bash
flyctl auth token   # copy the output
```

In GitHub: **Settings → Secrets and variables → Actions → New repository secret**
- Name: `FLY_API_TOKEN`
- Value: paste the token

The deploy workflow (`.github/workflows/deploy.yml`) uses this secret to push on every merge to `main`.

## 6. Configure Cloudflare

1. Add a DNS record pointing your domain to `ado.fly.dev`:
   - Type: CNAME, Name: `@` (or subdomain), Target: `ado.fly.dev`, Proxied (orange cloud)
2. SSL/TLS mode: **Full (strict)**
3. Issue the Fly TLS cert:

```bash
flyctl certs create <your-domain>
```

Fly will validate via the Cloudflare-proxied hostname.

## 7. First deploy (manual)

```bash
flyctl deploy --remote-only
```

After this, pushes to `main` trigger the GitHub Actions deploy workflow automatically.

---

## Acceptance checklist

After the first deploy, verify each item manually:

- [ ] Email/password signup → verification email → click link → dashboard with API key shown once
- [ ] Google OAuth signup → dashboard immediately
- [ ] Existing user email/password login
- [ ] Existing user Google login (both linked and unlinked accounts)
- [ ] JanitorAI / curl with key reaches `/api/v1/chat/completions` successfully
- [ ] 51st request in a UTC day returns `429 QUOTA_EXCEEDED`; first request next UTC day succeeds
- [ ] Brute-force login blocked at 5 attempts/hour per email
- [ ] POST `/api/auth/logout` without `X-CSRF-Token` returns `403 INVALID_CSRF`
- [ ] `GET /api/keys/current` never returns the raw key value
- [ ] Rotate revokes the old key (next call with old key → 401), new key works
- [ ] Cloudflare in front with Full-strict TLS; CI green on `main`
